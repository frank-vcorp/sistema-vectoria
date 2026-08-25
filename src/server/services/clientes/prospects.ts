/**
 * Servicio `prospects` — SPEC-002 §4.2 / AC-2/AC-4/AC-6.
 *
 * Funciones puras (exportadas como helpers testeables) y servicio
 * aplicativo. Las reglas de negocio viven aquí; los routers tRPC
 * (en `src/server/trpc/routers/clientes.ts`) sólo orquestan entrada
 * y delegan.
 *
 *  - create(): crea oportunidad. `code` único por organización (BR-N216
 *    para prospectos: `code` es el código humano, análogo al
 *    `client_number`).
 *  - qualify(): BR-N148: requiere cuestionario vinculado. Sin él →
 *    `409 QUESTIONNAIRE_REQUIRED`. El cuestionario real lo emite
 *    SPEC-003 (no se implementa aquí); validamos presencia por
 *    `questionnaireId` no nulo.
 *  - setLost() / setSuspended() / reactivate(): BR-N213 / BR-N214.
 *    `perdido` y `suspendido` exigen motivo; `suspendido` es
 *    reactivable y conserva historial.
 *  - list(): AC-6 visibilidad por rol. Vendedor ve sólo los propios
 *    (`assignedTo = self`); Director/Admin (`ver_todo` o permiso
 *    `gestionar_prospectos`) ven todos. Filtro por `status`,
 *    `assignedTo`, búsqueda libre por `name|company|code`.
 */
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import { auditLogs, prospects } from "@/server/db/schema";
import {
  PROSPECT_STATUSES,
  type ProspectMedium,
  type ProspectStatus,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";

export interface ProspectDTO {
  id: string;
  organizationId: string;
  code: string;
  status: ProspectStatus;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  medium: ProspectMedium | null;
  assignedTo: string | null;
  lostReason: string | null;
  suspendedReason: string | null;
  questionnaireId: string | null;
  questionnaireCompletedAt: Date | null;
  nextActionAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  archived: boolean;
}

export interface ProspectsService {
  create(
    ctx: Context,
    input: {
      code: string;
      name: string;
      company?: string;
      email?: string;
      phone?: string;
      source?: string;
      medium?: ProspectMedium;
      assignedTo?: string;
    },
  ): Promise<ProspectDTO>;
  qualify(
    ctx: Context,
    input: { prospectId: string; questionnaireId: string },
  ): Promise<ProspectDTO>;
  setLost(
    ctx: Context,
    input: { prospectId: string; reason: string },
  ): Promise<ProspectDTO>;
  setSuspended(
    ctx: Context,
    input: { prospectId: string; reason: string },
  ): Promise<ProspectDTO>;
  reactivate(ctx: Context, input: { prospectId: string }): Promise<ProspectDTO>;
  list(
    ctx: Context,
    opts: {
      limit?: number;
      offset?: number;
      status?: ProspectStatus | string;
      assignedTo?: string;
      search?: string;
    },
  ): Promise<{ items: ProspectDTO[]; total: number; scope: "own" | "all" }>;
  getById(ctx: Context, prospectId: string): Promise<ProspectDTO>;
}

function toDto(row: typeof prospects.$inferSelect): ProspectDTO {
  // Narrowing defensivo del status y medium contra enums en código.
  const status = (PROSPECT_STATUSES as readonly string[]).includes(row.status)
    ? (row.status as ProspectStatus)
    : "nuevo";
  return {
    id: row.id,
    organizationId: row.organizationId,
    code: row.code,
    status,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    source: row.source,
    medium: row.medium as ProspectMedium | null,
    assignedTo: row.assignedTo,
    lostReason: row.lostReason,
    suspendedReason: row.suspendedReason,
    questionnaireId: row.questionnaireId,
    questionnaireCompletedAt: row.questionnaireCompletedAt,
    nextActionAt: row.nextActionAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archived: row.archived,
  };
}

/** Visibilidad por rol (ACTORES §3, BR-N207, AC-6). */
export type ProspectScope = "own" | "all";

/**
 * Resuelve el `assignedTo` efectivo para un prospecto nuevo. Si el
 * caller no lo especifica, el prospecto queda asignado al propio
 * creador (BR-N207 / AC-6: un Vendedor que crea un prospecto debe poder
 * verlo en su listado `scope='own'` sin pasos adicionales).
 *
 * Helper puro exportado para tests sin BD. El shape del input público
 * NO se modifica; el default se aplica dentro del servicio.
 */
export function resolveAssignedTo(
  input: { assignedTo?: string | null },
  creatorId: string,
): string {
  const candidate = input.assignedTo;
  if (typeof candidate === "string" && candidate.length > 0) {
    return candidate;
  }
  return creatorId;
}

/**
 * Decide el alcance del listado para el `Context` actual.
 * - Director / Admin (`ver_todo`) → todos.
 * - Vendedor (con `gestionar_prospectos` y sin `ver_todo`) → propios.
 * - Sin permiso `gestionar_prospectos` → `ForbiddenError`.
 *
 * AC-81 / ADR-06 §3.1: las decisiones de autorización de prospectos se
 * evalúan contra BD (`forceDb: true`) para evitar la ventana de
 * exposición entre el sembrado de `user_roles` y la renovación del
 * access token (mismo patrón que OS, proyectos, cobranza). El cache de
 * `ctx.permissions` no es fuente de verdad mientras la sesión carga
 * roles vacíos (`auth.me` puede llegar con `roles=[]` justo después del
 * sembrado inicial; el vínculo `user_roles` ya existe en BD).
 */
export async function resolveProspectScope(
  ctx: Context,
  hasPerm: {
    has(
      ctx: Context,
      code: string,
      opts?: { forceDb?: boolean },
    ): Promise<boolean>;
  },
): Promise<ProspectScope> {
  // `requireUser` valida que haya sesión; no usamos `user` aquí porque la
  // decisión depende sólo de permisos (BR-N207). Lo invocamos para
  // garantizar el contrato: si no hay sesión, el error es `401`
  // consistente con el resto de servicios.
  requireUser(ctx);
  // Permiso base del módulo (Director/Admin sembrados, Vendedor sembrado por SPEC-002 §7).
  const canManage = await hasPerm.has(ctx, "gestionar_prospectos", {
    forceDb: true,
  });
  if (!canManage) {
    throw new DomainError(
      "ForbiddenError",
      "Sin permiso para prospectos",
      403,
      { code: "gestionar_prospectos" },
    );
  }
  const seesAll = await hasPerm.has(ctx, "ver_todo", { forceDb: true });
  return seesAll ? "all" : "own";
}

export function createProspectsService(): ProspectsService {
  const db = getDb();

  async function create(
    ctx: Context,
    input: {
      code: string;
      name: string;
      company?: string;
      email?: string;
      phone?: string;
      source?: string;
      medium?: ProspectMedium;
      assignedTo?: string;
    },
  ): Promise<ProspectDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    const hasPerm = createHasPermissionService();
    await hasPerm.require(ctx, "gestionar_prospectos", { forceDb: true });
    // Unicidad de `code` por organización (BR-N216 análogo prospecto).
    const [exists] = await db
      .select({ id: prospects.id })
      .from(prospects)
      .where(
        and(
          eq(prospects.organizationId, user.organization_id),
          eq(prospects.code, input.code),
        ),
      )
      .limit(1);
    if (exists) {
      throw new DomainError(
        // SPEC-002-UI-20260824-04 · P3 contrato: el código de dominio
        // para duplicado es específico (`PROSPECT_CODE_DUPLICATE`),
        // no `ForbiddenError` — ése lo reutiliza el middleware de
        // `hasPermission.require()` para permisos (HTTP 403). Mantener
        // HTTP 409 (conflicto de unicidad, BR-N216) y `detail` con el
        // `code` humano para que la UI muestre el mensaje accionable.
        "PROSPECT_CODE_DUPLICATE",
        `Código de prospecto duplicado: ${input.code}`,
        409,
        { code: input.code },
      );
    }
    const [row] = await db
      .insert(prospects)
      .values({
        organizationId: user.organization_id,
        code: input.code,
        name: input.name,
        company: input.company ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        source: input.source ?? null,
        medium: input.medium ?? null,
        // P2 funcional: si el caller no pasa `assignedTo`, el prospecto
        // queda asignado al propio creador (BR-N207 / AC-6). Antes
        // quedaba `null` y un Vendedor no veía su propio prospecto en
        // `scope='own'`. El input público no se modifica.
        assignedTo: resolveAssignedTo(input, user.id),
        createdBy: user.id,
        status: "nuevo",
        archived: false,
      })
      .returning();
    if (!row) throw new Error("prospect insert sin fila");
    const { createAuditService } = await import("@/server/services/audit");
    await createAuditService().record(ctx, {
      entityType: "prospect",
      entityId: row.id,
      action: "prospect.create",
      after: {
        code: row.code,
        name: row.name,
        medium: row.medium,
        assignedTo: row.assignedTo,
      },
    });
    return toDto(row);
  }

  async function qualify(
    ctx: Context,
    input: { prospectId: string; questionnaireId: string },
  ): Promise<ProspectDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_prospectos", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(prospects)
        .where(
          and(
            eq(prospects.id, input.prospectId),
            eq(prospects.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError(
          "PROSPECT_NOT_FOUND",
          "Prospecto no encontrado",
          404,
        );
      }
      // BR-N148: `calificado` exige cuestionario vinculado.
      if (!input.questionnaireId) {
        throw new DomainError(
          "QUESTIONNAIRE_REQUIRED",
          "El prospecto requiere cuestionario vinculado para calificarse",
          409,
        );
      }
      if (before.status === "calificado") {
        // Idempotente: si ya está calificado, conserva el estado y devuelve.
        return toDto(before);
      }
      const [after] = await tx
        .update(prospects)
        .set({
          status: "calificado",
          questionnaireId: input.questionnaireId,
          questionnaireCompletedAt: new Date(),
        })
        .where(
          and(
            eq(prospects.id, input.prospectId),
            eq(prospects.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("prospect qualify sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "prospect",
        entityId: after.id,
        action: "prospect.qualify",
        before: { status: before.status, questionnaireId: before.questionnaireId },
        after: {
          status: after.status,
          questionnaireId: after.questionnaireId,
          questionnaireCompletedAt: after.questionnaireCompletedAt,
        },
      });
      return toDto(after);
    });
  }

  async function setLost(
    ctx: Context,
    input: { prospectId: string; reason: string },
  ): Promise<ProspectDTO> {
    return setTerminal(ctx, input.prospectId, "perdido", input.reason, "lost_reason");
  }

  async function setSuspended(
    ctx: Context,
    input: { prospectId: string; reason: string },
  ): Promise<ProspectDTO> {
    return setTerminal(
      ctx,
      input.prospectId,
      "suspendido",
      input.reason,
      "suspended_reason",
    );
  }

  async function setTerminal(
    ctx: Context,
    prospectId: string,
    status: ProspectStatus,
    reason: string,
    reasonField: "lost_reason" | "suspended_reason",
  ): Promise<ProspectDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_prospectos", {
      forceDb: true,
    });
    // BR-N213 / BR-N214: motivo obligatorio.
    if (!reason || reason.trim().length < 3) {
      throw new DomainError(
        status === "perdido" ? "LOST_REASON_REQUIRED" : "SUSPENDED_REASON_REQUIRED",
        `Motivo obligatorio para pasar a ${status}`,
        400,
      );
    }
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(prospects)
        .where(
          and(
            eq(prospects.id, prospectId),
            eq(prospects.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError(
          "PROSPECT_NOT_FOUND",
          "Prospecto no encontrado",
          404,
        );
      }
      const set: Partial<typeof prospects.$inferInsert> = { status };
      if (reasonField === "lost_reason") set.lostReason = reason;
      else set.suspendedReason = reason;
      const [after] = await tx
        .update(prospects)
        .set(set)
        .where(
          and(
            eq(prospects.id, prospectId),
            eq(prospects.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("prospect set-terminal sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "prospect",
        entityId: after.id,
        action:
          status === "perdido" ? "prospect.lost" : "prospect.suspended",
        before: {
          status: before.status,
          lostReason: before.lostReason,
          suspendedReason: before.suspendedReason,
        },
        after: {
          status: after.status,
          lostReason: after.lostReason,
          suspendedReason: after.suspendedReason,
        },
        reason,
      });
      return toDto(after);
    });
  }

  async function reactivate(
    ctx: Context,
    input: { prospectId: string },
  ): Promise<ProspectDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_prospectos", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(prospects)
        .where(
          and(
            eq(prospects.id, input.prospectId),
            eq(prospects.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError(
          "PROSPECT_NOT_FOUND",
          "Prospecto no encontrado",
          404,
        );
      }
      // BR-N214: sólo se reactiva desde `suspendido` (mantiene historial).
      if (before.status !== "suspendido") {
        throw new DomainError(
          "ForbiddenError",
          "Sólo se puede reactivar un prospecto suspendido",
          409,
        );
      }
      // Conserva `suspendedReason` como historial (no se borra).
      const [after] = await tx
        .update(prospects)
        .set({
          status: "contactado",
        })
        .where(
          and(
            eq(prospects.id, input.prospectId),
            eq(prospects.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("prospect reactivate sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "prospect",
        entityId: after.id,
        action: "prospect.reactivate",
        before: { status: before.status, suspendedReason: before.suspendedReason },
        after: { status: after.status, suspendedReason: after.suspendedReason },
      });
      return toDto(after);
    });
  }

  async function list(
    ctx: Context,
    opts: {
      limit?: number;
      offset?: number;
      status?: ProspectStatus | string;
      assignedTo?: string;
      search?: string;
    } = {},
  ): Promise<{ items: ProspectDTO[]; total: number; scope: ProspectScope }> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    const hasPerm = createHasPermissionService();
    const scope = await resolveProspectScope(ctx, hasPerm);
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const where = [
      eq(prospects.organizationId, user.organization_id),
      eq(prospects.archived, false),
    ];
    if (scope === "own") {
      where.push(eq(prospects.assignedTo, user.id));
    }
    // Defensiva: el router llega con `status?: string` (zod genérico);
    // validamos contra el enum en código antes de bajar a BD.
    const status =
      opts.status && (PROSPECT_STATUSES as readonly string[]).includes(opts.status)
        ? opts.status
        : undefined;
    if (status) where.push(eq(prospects.status, status));
    if (opts.assignedTo && scope === "all") {
      where.push(eq(prospects.assignedTo, opts.assignedTo));
    }
    if (opts.search && opts.search.trim().length > 0) {
      const term = `%${opts.search.trim()}%`;
      where.push(
        or(
          ilike(prospects.name, term),
          ilike(prospects.company, term),
          ilike(prospects.code, term),
        )!,
      );
    }
    const [totalRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(prospects)
      .where(and(...where));
    const total = totalRow?.c ?? 0;
    const rows = await db
      .select()
      .from(prospects)
      .where(and(...where))
      .orderBy(sql`${prospects.updatedAt} DESC`)
      .limit(limit)
      .offset(offset);
    return { items: rows.map(toDto), total, scope };
  }

  async function getById(ctx: Context, prospectId: string): Promise<ProspectDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    const hasPerm = createHasPermissionService();
    const scope = await resolveProspectScope(ctx, hasPerm);
    const [row] = await db
      .select()
      .from(prospects)
      .where(
        and(
          eq(prospects.id, prospectId),
          eq(prospects.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!row) {
      throw new DomainError("PROSPECT_NOT_FOUND", "Prospecto no encontrado", 404);
    }
    if (scope === "own" && row.assignedTo !== user.id) {
      // Defensa: el vendedor sólo lee los propios.
      throw new DomainError(
        "PROSPECT_NOT_FOUND",
        "Prospecto no encontrado",
        404,
      );
    }
    return toDto(row);
  }

  return { create, qualify, setLost, setSuspended, reactivate, list, getById };
}

/**
 * Helper puro: valida transición de estado. Útil para tests unitarios
 * sin BD. Mantiene el grafo de transiciones permitido.
 */
export function canTransition(
  from: ProspectStatus,
  to: ProspectStatus,
): boolean {
  if (from === to) return true; // idempotente
  // Terminales: `ganado` y `perdido` no se transicionan hacia atrás.
  if (from === "ganado" || from === "perdido") return false;
  // `suspendido` se reactiva a `contactado` (regla del servicio).
  if (from === "suspendido" && to === "contactado") return true;
  if (from === "suspendido") return false;
  // Cualquier otro estado puede pasar a `suspendido` o `perdido`.
  if (to === "suspendido" || to === "perdido") return true;
  // `ganado` se permite desde `negociacion`/`cotizacion_enviada`.
  if (to === "ganado") {
    return (
      from === "negociacion" ||
      from === "cotizacion_enviada" ||
      from === "discovery_requerimientos"
    );
  }
  // Resto: progresión lineal en orden.
  const order: ProspectStatus[] = [
    "nuevo",
    "contactado",
    "calificado",
    "discovery_requerimientos",
    "cotizacion_enviada",
    "negociacion",
  ];
  const fi = order.indexOf(from);
  const ti = order.indexOf(to);
  if (fi < 0 || ti < 0) return false;
  return ti >= fi; // permite retroceder para re-trabajo
}

export const __keep_audit_logs__ = auditLogs;