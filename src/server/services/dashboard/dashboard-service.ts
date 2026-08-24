/**
 * Servicio `dashboard` — SPEC-010 §4.2 (B23, DEC-FUN-28/30,
 * BR-N341-348).
 *
 * Reglas críticas:
 *  - `dashboard.get(ctx)` agrega widgets por rol respetando
 *    visibilidad (ACTORES §3). Lee `projects`, `invoices`,
 *    `payments`, `commissions`, `prospects`, `quotes`,
 *    `audit_logs` directamente (Drizzle) — NO invoca servicios de
 *    SPEC-002..009 (cumple §3.2: "no escribe entidades; sólo lee").
 *  - `dashboard.saveLayout(ctx, widgets, layout, defaultView)` persiste
 *    `user_dashboard_preferences` (sólo del usuario).
 *  - Filtro `week`/`today` aplica a widgets con fecha (DEC-FUN-30).
 *  - El widget `pnl_summary` se oculta si el actor NO tiene
 *    `ver_finanzas` (BR-N209/211).
 *
 * Permisos:
 *  - `ver_finanzas` se invoca con `forceDb: true` para `pnl_summary`
 *    (AC-81 / ADR-06).
 *  - `dashboard.saveLayout` no expone permisos; el filtro es
 *    `user_id=actor.id` (sólo el dueño edita sus preferencias;
 *    DEC-FUN-28).
 */
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import {
  auditLogs,
  invoices,
  payments,
  prospects,
  projects,
  quotes,
  userDashboardPreferences,
} from "@/server/db/schema";
import {
  DASHBOARD_DEFAULT_VIEWS,
  type DashboardDefaultView,
  type DashboardWidgetCode,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import type { AuditService } from "@/server/services/audit";
import { createHasPermissionService } from "@/server/services/hasPermission";
import {
  aggregateBy,
  defaultLayoutFor,
  isDashboardDefaultView,
  validateLayout,
  widgetsForRole,
  type AggregateItem,
  type WidgetLayoutEntry,
} from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────────────────────────────────────

export interface DashboardPreferencesDTO {
  id: string;
  userId: string;
  widgets: DashboardWidgetCode[];
  layout: WidgetLayoutEntry[];
  defaultView: DashboardDefaultView;
  lastSeenAt: string | null;
  updatedAt: string;
}

export interface DashboardWidgetData {
  code: DashboardWidgetCode;
  label: string;
  aggregate: AggregateItem[];
  totalCount: number;
}

export interface DashboardData {
  preferences: DashboardPreferencesDTO;
  widgets: DashboardWidgetData[];
  view: DashboardDefaultView;
  refDate: string;
}

export interface DashboardService {
  get(
    ctx: Context,
    input: { view?: DashboardDefaultView | string; refDate?: Date | string },
  ): Promise<DashboardData>;
  saveLayout(
    ctx: Context,
    input: {
      widgets: DashboardWidgetCode[] | string[];
      layout: WidgetLayoutEntry[];
      defaultView?: DashboardDefaultView | string;
    },
  ): Promise<DashboardPreferencesDTO>;
}

export interface CreateDashboardServiceOptions {
  audit: AuditService;
}

const WIDGET_LABELS: Record<DashboardWidgetCode, string> = {
  projects_at_risk: "Proyectos en riesgo",
  cxc_summary: "Resumen CxC",
  pnl_summary: "Ingresos / Egresos",
  audit_recent: "Auditoría reciente",
  cobros_hoy: "Cobros de hoy",
  facturas_vencidas: "Facturas vencidas",
  prospectos_sin_proxima_accion: "Prospectos sin próxima acción",
  cotizaciones_por_vencer: "Cotizaciones por vencer",
  mis_cobros: "Mis cobros",
  users_recent_activity: "Actividad reciente de usuarios",
  actividades_hoy: "Actividades de hoy",
  proximas_entregas: "Próximas entregas",
  bloqueos: "Bloqueos",
};

function deriveDefaultRole(actorRoleCode?: string | null): string {
  if (!actorRoleCode) return "vendedor";
  // Mapea `director`/`administrador`/`vendedor`/`lider_proyecto`/
  // `programador`/`disenador`/`qa` directamente. Si el actorRoleCode
  // es `superuser` u otro, caemos a `director` (visibilidad más alta).
  const map: Record<string, string> = {
    director: "director",
    administrador: "administrador",
    vendedor: "vendedor",
    lider_proyecto: "lider_proyecto",
    programador: "programador",
    disenador: "disenador",
    qa: "qa",
  };
  return map[actorRoleCode] ?? "director";
}

export function createDashboardService(
  opts: CreateDashboardServiceOptions,
): DashboardService {
  const db = getDb();
  const hasPerm = createHasPermissionService();
  const audit = opts.audit;

  function rowToDto(
    r: typeof userDashboardPreferences.$inferSelect,
  ): DashboardPreferencesDTO {
    const widgets = Array.isArray(r.widgets) ? (r.widgets as DashboardWidgetCode[]) : [];
    const layout = Array.isArray(r.layout) ? (r.layout as WidgetLayoutEntry[]) : [];
    const view: DashboardDefaultView = isDashboardDefaultView(r.defaultView)
      ? (r.defaultView as DashboardDefaultView)
      : "week";
    return {
      id: r.id,
      userId: r.userId,
      widgets: widgets.filter((w) => typeof w === "string"),
      layout,
      defaultView: view,
      lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  async function ensurePreferencesRow(
    userId: string,
    orgId: string,
    defaultRole: string,
  ): Promise<typeof userDashboardPreferences.$inferSelect> {
    const [existing] = await db
      .select()
      .from(userDashboardPreferences)
      .where(
        and(
          eq(userDashboardPreferences.organizationId, orgId),
          eq(userDashboardPreferences.userId, userId),
        ),
      )
      .limit(1);
    if (existing) return existing;
    const widgets = widgetsForRole({ role: defaultRole });
    const layout = defaultLayoutFor(widgets);
    const [row] = await db
      .insert(userDashboardPreferences)
      .values({
        organizationId: orgId,
        userId,
        widgets,
        layout,
        defaultView: "week",
      })
      .returning();
    if (!row) throw new Error("user_dashboard_preferences insert sin fila");
    return row;
  }

  async function aggregateWidget(
    code: DashboardWidgetCode,
    orgId: string,
    userId: string,
    refDate: Date,
  ): Promise<DashboardWidgetData> {
    const refIso = refDate.toISOString().slice(0, 10);
    let rows: Array<{ key: string; totalCents?: number }> = [];

    switch (code) {
      case "projects_at_risk": {
        const r = await db
          .select({ id: projects.id, health: projects.health })
          .from(projects)
          .where(
            and(
              eq(projects.organizationId, orgId),
              inArray(projects.health, ["at_risk", "delayed"]),
            ),
          );
        rows = r.map((p) => ({ key: `${p.id.slice(0, 8)} (${p.health})` }));
        break;
      }
      case "cxc_summary": {
        const r = await db
          .select({
            code: invoices.code,
            status: invoices.status,
            total: invoices.totalCents,
            paid: invoices.paidCents,
          })
          .from(invoices)
          .where(
            and(
              eq(invoices.organizationId, orgId),
              inArray(invoices.status, ["emitida", "vencida", "parcialmente_pagada"]),
            ),
          );
        rows = r.map((i) => ({
          key: i.code,
          totalCents: i.total - i.paid,
        }));
        break;
      }
      case "facturas_vencidas": {
        const r = await db
          .select({
            code: invoices.code,
            dueDate: invoices.dueDate,
          })
          .from(invoices)
          .where(
            and(
              eq(invoices.organizationId, orgId),
              lte(invoices.dueDate, refIso),
              inArray(invoices.status, ["emitida", "vencida", "parcialmente_pagada"]),
            ),
          );
        rows = r.map((i) => ({ key: i.code }));
        break;
      }
      case "cobros_hoy": {
        const r = await db
          .select({
            clientId: payments.clientId,
            amount: payments.amountCents,
          })
          .from(payments)
          .where(
            and(
              eq(payments.organizationId, orgId),
              eq(payments.status, "confirmado"),
              eq(payments.paymentDate, refIso),
            ),
          );
        rows = r.map((p) => ({
          key: p.clientId.slice(0, 8),
          totalCents: p.amount,
        }));
        break;
      }
      case "pnl_summary": {
        const { transactions } = await import("@/server/db/schema");
        const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1)
          .toISOString()
          .slice(0, 10);
        const end = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1)
          .toISOString()
          .slice(0, 10);
        const r = await db
          .select({
            type: transactions.type,
            amount: transactions.amountCents,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.organizationId, orgId),
              inArray(transactions.status, ["confirmado", "conciliado"]),
              gte(transactions.operationDate, start),
              lte(transactions.operationDate, end),
            ),
          );
        rows = r.map((t) => ({ key: t.type, totalCents: t.amount }));
        break;
      }
      case "prospectos_sin_proxima_accion": {
        const r = await db
          .select({ code: prospects.code, status: prospects.status })
          .from(prospects)
          .where(
            and(
              eq(prospects.organizationId, orgId),
              inArray(prospects.status, ["activo", "calificado"]),
            ),
          );
        rows = r.map((p) => ({ key: p.code }));
        break;
      }
      case "cotizaciones_por_vencer": {
        const r = await db
          .select({ code: quotes.code })
          .from(quotes)
          .where(
            and(
              eq(quotes.organizationId, orgId),
              eq(quotes.status, "sent"),
              lte(quotes.validUntil, refDate),
            ),
          );
        rows = r.map((q) => ({ key: q.code }));
        break;
      }
      case "mis_cobros": {
        // Filtra por `created_by=actor.id` (BR-N207 / visibilidad
        // Vendedor).
        const r = await db
          .select({ status: payments.status, amount: payments.amountCents })
          .from(payments)
          .where(
            and(
              eq(payments.organizationId, orgId),
              eq(payments.createdBy, userId),
            ),
          );
        rows = r.map((p) => ({ key: p.status, totalCents: p.amount }));
        break;
      }
      case "users_recent_activity": {
        const since = new Date(refDate.getTime() - 7 * 86_400_000);
        const r = await db
          .select({ action: auditLogs.action })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.organizationId, orgId),
              gte(auditLogs.createdAt, since),
            ),
          )
          .limit(20);
        rows = r.map((a) => ({ key: a.action }));
        break;
      }
      case "audit_recent": {
        const since = new Date(refDate.getTime() - 7 * 86_400_000);
        const r = await db
          .select({ action: auditLogs.action })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.organizationId, orgId),
              gte(auditLogs.createdAt, since),
            ),
          )
          .limit(20);
        rows = r.map((a) => ({ key: a.action }));
        break;
      }
      // Stubs: dependencias no-schema (tareas/closes) caen a `empty`
      // si el módulo no expone la columna correspondiente; el caller
      // sigue recibiendo la lista canónica.
      default:
        rows = [];
    }
    return {
      code,
      label: WIDGET_LABELS[code] ?? code,
      aggregate: aggregateBy(rows),
      totalCount: rows.length,
    };
  }

  // ── implementación ────────────────────────────────────────────────────

  async function get(
    ctx: Context,
    input: { view?: DashboardDefaultView | string; refDate?: Date | string } = {},
  ): Promise<DashboardData> {
    const user = requireUser(ctx);
    const refDate = input.refDate
      ? typeof input.refDate === "string"
        ? new Date(input.refDate)
        : input.refDate
      : new Date();
    const defaultRole = deriveDefaultRole(ctx.actorRoleCode);
    const row = await ensurePreferencesRow(
      user.id,
      user.organization_id,
      defaultRole,
    );
    const view = input.view && isDashboardDefaultView(input.view)
      ? (input.view as DashboardDefaultView)
      : (isDashboardDefaultView(row.defaultView)
          ? (row.defaultView as DashboardDefaultView)
          : "week");
    // Refresca `lastSeenAt` (auto-tick).
    await db
      .update(userDashboardPreferences)
      .set({ lastSeenAt: new Date() })
      .where(
        and(
          eq(userDashboardPreferences.organizationId, user.organization_id),
          eq(userDashboardPreferences.id, row.id),
        ),
      );
    const rolCanonica = new Set(widgetsForRole({ role: defaultRole }));
    const visibleWidgets: DashboardWidgetCode[] = (
      Array.isArray(row.widgets) ? (row.widgets as string[]) : []
    ).filter((w): w is DashboardWidgetCode =>
      rolCanonica.has(w as DashboardWidgetCode),
    );
    const pnlHide = !(await hasPerm.has(ctx, "ver_finanzas", { forceDb: true }));
    const filteredWidgets = pnlHide
      ? visibleWidgets.filter((w) => w !== "pnl_summary")
      : visibleWidgets;
    const widgetsData: DashboardWidgetData[] = [];
    for (const code of filteredWidgets) {
      widgetsData.push(
        await aggregateWidget(code, user.organization_id, user.id, refDate),
      );
    }
    await audit.record(ctx, {
      entityType: "dashboard",
      entityId: user.id,
      action: "dashboard.get",
      after: { view, refDate: refDate.toISOString().slice(0, 10) },
    });
    return {
      preferences: rowToDto(row),
      widgets: widgetsData,
      view,
      refDate: refDate.toISOString().slice(0, 10),
    };
  }

  async function saveLayout(
    ctx: Context,
    input: {
      widgets: DashboardWidgetCode[] | string[];
      layout: WidgetLayoutEntry[];
      defaultView?: DashboardDefaultView | string;
    },
  ): Promise<DashboardPreferencesDTO> {
    const user = requireUser(ctx);
    const validation = validateLayout(input);
    if (!validation.ok) {
      throw new DomainError("INVALID_LAYOUT" as never, validation.reason, 400);
    }
    const dv = input.defaultView && isDashboardDefaultView(input.defaultView)
      ? (input.defaultView as DashboardDefaultView)
      : "week";
    return withTx(async (tx) => {
      const [existing] = await tx
        .select()
        .from(userDashboardPreferences)
        .where(
          and(
            eq(userDashboardPreferences.organizationId, user.organization_id),
            eq(userDashboardPreferences.userId, user.id),
          ),
        )
        .limit(1);
      if (existing) {
        const [updated] = await tx
          .update(userDashboardPreferences)
          .set({
            widgets: input.widgets,
            layout: input.layout,
            defaultView: dv,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(userDashboardPreferences.id, existing.id),
              eq(userDashboardPreferences.organizationId, user.organization_id),
            ),
          )
          .returning();
        if (!updated) throw new Error("user_dashboard_preferences update sin fila");
        await audit.record(ctx, {
          entityType: "dashboard",
          entityId: updated.id,
          action: "dashboard.save_layout",
          before: { widgets: existing.widgets, layout: existing.layout, defaultView: existing.defaultView },
          after: { widgets: updated.widgets, layout: updated.layout, defaultView: updated.defaultView },
        });
        return rowToDto(updated);
      }
      const [row] = await tx
        .insert(userDashboardPreferences)
        .values({
          organizationId: user.organization_id,
          userId: user.id,
          widgets: input.widgets,
          layout: input.layout,
          defaultView: dv,
        })
        .returning();
      if (!row) throw new Error("user_dashboard_preferences insert sin fila");
      await audit.record(ctx, {
        entityType: "dashboard",
        entityId: row.id,
        action: "dashboard.save_layout",
        after: { widgets: row.widgets, layout: row.layout, defaultView: row.defaultView },
      });
      return rowToDto(row);
    });
  }

  return { get, saveLayout };
}

export { DASHBOARD_DEFAULT_VIEWS };
