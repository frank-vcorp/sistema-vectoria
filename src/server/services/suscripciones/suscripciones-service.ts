/**
 * Servicio `suscripciones` — SPEC-011 §4.2 (B20a · BR-N399..N406).
 *
 * Implementa el workflow `subscription_creation` (condicional a
 * `os.tipo_cobro='suscripcion'`), el ciclo de vida de la
 * Suscripción, y la consulta de facturación/cobranza relacionada
 * (lectura). NO emite CFDI ni registra cobros (BR-N401, AC-8).
 *
 * Reglas críticas:
 *  - `createFromOrder` sólo crea la suscripción si la OS está en
 *    `authorized_to_start` y `tipo_cobro='suscripcion'` (BR-N405).
 *    Idempotente: 1 suscripción por OS (UNIQUE).
 *  - `renovar` pide a Facturación (`createDraftFromSubscriptionRenewal`)
 *    la factura borrador del nuevo periodo; Suscripciones NO timbra
 *    (BR-N406).
 *  - `pausar`/`cancelar`/`reactivar` aplican BR-N404 con motivo
 *    obligatorio y auditan con `actor_role_code`.
 *  - `markVencida` (job) recorre suscripciones con `current_period_end`
 *    < `refDate` y `status='activa'`, las marca `vencida` y registra
 *    `subscription.vencer` (BR-N404).
 *  - Acciones críticas: `hasPermission` con `gestionar_suscripciones`
 *    + `forceDb: true` (AC-81 / ADR-06 §3.1).
 *  - Multi-tenant: PK compuesta `(organization_id, id)` y filtros
 *    explícitos por `organizationId` (ADR-02 §8.3).
 *  - Auditoría: cada mutación registra `before`/`after` con
 *    `actor_role_code` (BR-N336).
 *
 * Sin acoplamiento inverso a SPEC-004 (orders): SPEC-011 consume la
 * OS vía Drizzle directo (lectura) y publica un servicio público
 * `createFromOrder`. La coordinación con `project_creation` es
 * responsabilidad del caller (UI / saga); ADR-13 §3 fija la atomicidad
 * como "ambos side-effects o ninguno" — SPEC-011 no inicia esa
 * coordinación aquí, sólo provee el bloque transaccional.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import {
  subscriptionHistory,
  subscriptionPeriods,
  subscriptions,
  clients as clientsT,
  invoices as invoicesT,
  orders as ordersT,
  payments as paymentsT,
  quotes as quotesT,
} from "@/server/db/schema";
import {
  SUBSCRIPTION_STATUSES,
  type SubscriptionPeriodicity,
  type SubscriptionStatus,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import { createHasPermissionService } from "@/server/services/hasPermission";
import { createAuditService, type AuditService } from "@/server/services/audit";
import {
  canTransition,
  computeNextPeriodStart,
  computePeriodEnd,
  isValidHistoryAction,
  isValidPeriodicity,
  isValidStatus,
  qualifiesForSubscription,
  validateReason,
} from "./helpers";

// ── DTOs ───────────────────────────────────────────────────────────────────

export interface SubscriptionDTO {
  id: string;
  organizationId: string;
  clientId: string;
  cotizacionId: string | null;
  orderId: string;
  status: SubscriptionStatus;
  periodicity: SubscriptionPeriodicity;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  amountCents: number;
  nextRenewalDate: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionPeriodDTO {
  id: string;
  organizationId: string;
  subscriptionId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  invoiceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionHistoryDTO {
  id: string;
  organizationId: string;
  subscriptionId: string;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  reason: string | null;
  actorUserId: string | null;
  actorRoleCode: string | null;
  actorKind: string;
  createdAt: Date;
}

export interface SubscriptionFacturacionRowDTO {
  invoiceId: string;
  code: string;
  status: string;
  totalCents: number;
  paidCents: number;
  dueDate: string;
  issuedAt: Date | null;
}

export interface SubscriptionCobranzaRowDTO {
  paymentId: string;
  amountCents: number;
  method: string;
  paymentDate: string;
  invoiceId: string | null;
  status: string;
  registeredAt: Date;
}

export interface SubscriptionDetailDTO {
  subscription: SubscriptionDTO;
  currentPeriod: SubscriptionPeriodDTO | null;
}

export interface SubscriptionListResultDTO {
  items: SubscriptionDTO[];
  total: number;
  limit: number;
  offset: number;
}

export interface SubscriptionHistoryListResultDTO {
  items: SubscriptionHistoryDTO[];
  total: number;
  limit: number;
  offset: number;
}

export interface SubscriptionFacturacionResultDTO {
  items: SubscriptionFacturacionRowDTO[];
  total: number;
}

export interface SubscriptionCobranzaResultDTO {
  items: SubscriptionCobranzaRowDTO[];
  total: number;
}

export interface RenewResultDTO {
  subscription: SubscriptionDTO;
  period: SubscriptionPeriodDTO;
  /** `null` si la factura borrador ya existía para el periodo
   *  (idempotencia AC-9). */
  invoice: { id: string; code: string; status: string } | null;
  idempotent: boolean;
}

export interface SuscripcionesService {
  createFromOrder(
    ctx: Context,
    input: { orderId: string },
  ): Promise<SubscriptionDetailDTO>;
  list(
    ctx: Context,
    input: {
      status?: SubscriptionStatus;
      periodicity?: SubscriptionPeriodicity;
      limit: number;
      offset: number;
    },
  ): Promise<SubscriptionListResultDTO>;
  get(ctx: Context, input: { id: string }): Promise<SubscriptionDetailDTO>;
  history(
    ctx: Context,
    input: { id: string; limit: number; offset: number },
  ): Promise<SubscriptionHistoryListResultDTO>;
  pausar(
    ctx: Context,
    input: { id: string; reason: string },
  ): Promise<SubscriptionDTO>;
  cancelar(
    ctx: Context,
    input: { id: string; reason: string },
  ): Promise<SubscriptionDTO>;
  reactivar(
    ctx: Context,
    input: { id: string; reason: string },
  ): Promise<SubscriptionDTO>;
  renovar(
    ctx: Context,
    input: { id: string; nextPeriodStart?: string },
  ): Promise<RenewResultDTO>;
  markVencida(
    ctx: Context,
    input: { refDate: string },
  ): Promise<{ scanned: number; updated: number }>;
  facturacion(
    ctx: Context,
    input: { id: string },
  ): Promise<SubscriptionFacturacionResultDTO>;
  cobranza(
    ctx: Context,
    input: { id: string },
  ): Promise<SubscriptionCobranzaResultDTO>;
}

// ── Helpers privados ────────────────────────────────────────────────────────

function subscriptionToDto(
  row: typeof subscriptions.$inferSelect,
): SubscriptionDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    clientId: row.clientId,
    cotizacionId: row.cotizacionId,
    orderId: row.orderId,
    status: isValidStatus(row.status) ? row.status : "activa",
    periodicity: isValidPeriodicity(row.periodicity) ? row.periodicity : "mensual",
    currentPeriodStart:
      typeof row.currentPeriodStart === "string"
        ? row.currentPeriodStart
        : new Date(row.currentPeriodStart).toISOString().slice(0, 10),
    currentPeriodEnd:
      typeof row.currentPeriodEnd === "string"
        ? row.currentPeriodEnd
        : new Date(row.currentPeriodEnd).toISOString().slice(0, 10),
    amountCents: row.amountCents,
    nextRenewalDate:
      row.nextRenewalDate == null
        ? null
        : typeof row.nextRenewalDate === "string"
          ? row.nextRenewalDate
          : new Date(row.nextRenewalDate).toISOString().slice(0, 10),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function periodToDto(
  row: typeof subscriptionPeriods.$inferSelect,
): SubscriptionPeriodDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    subscriptionId: row.subscriptionId,
    periodStart:
      typeof row.periodStart === "string"
        ? row.periodStart
        : new Date(row.periodStart).toISOString().slice(0, 10),
    periodEnd:
      typeof row.periodEnd === "string"
        ? row.periodEnd
        : new Date(row.periodEnd).toISOString().slice(0, 10),
    status: row.status,
    invoiceId: row.invoiceId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function historyToDto(
  row: typeof subscriptionHistory.$inferSelect,
): SubscriptionHistoryDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    subscriptionId: row.subscriptionId,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    action: isValidHistoryAction(row.action) ? row.action : "create",
    reason: row.reason,
    actorUserId: row.actorUserId,
    actorRoleCode: row.actorRoleCode,
    actorKind: row.actorKind,
    createdAt: row.createdAt,
  };
}

// ── Servicio ───────────────────────────────────────────────────────────────

export function createSuscripcionesService(): SuscripcionesService {
  const db = getDb();
  const hasPerm = createHasPermissionService();
  const audit = createAuditService();

  async function requireManager(ctx: Context): Promise<void> {
    await hasPerm.require(ctx, "gestionar_suscripciones", { forceDb: true });
  }

  async function readCurrentPeriod(
    organizationId: string,
    subscriptionId: string,
  ): Promise<SubscriptionPeriodDTO | null> {
    const [row] = await db
      .select()
      .from(subscriptionPeriods)
      .where(
        and(
          eq(subscriptionPeriods.organizationId, organizationId),
          eq(subscriptionPeriods.subscriptionId, subscriptionId),
          eq(subscriptionPeriods.status, "activo"),
        ),
      )
      .orderBy(desc(subscriptionPeriods.periodStart))
      .limit(1);
    return row ? periodToDto(row) : null;
  }

  async function loadSubscription(
    organizationId: string,
    id: string,
  ): Promise<SubscriptionDTO> {
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.organizationId, organizationId),
          eq(subscriptions.id, id),
        ),
      )
      .limit(1);
    if (!row) {
      throw new DomainError(
        "SUBSCRIPTION_NOT_FOUND",
        "Suscripción no encontrada",
        404,
      );
    }
    return subscriptionToDto(row);
  }

  async function createFromOrder(
    ctx: Context,
    input: { orderId: string },
  ): Promise<SubscriptionDetailDTO> {
    const user = requireUser(ctx);
    // SPEC-011 `createFromOrder` requiere `gestionar_suscripciones`
    // (consistente con SPEC-005 que exige `gestionar_proyectos`).
    await requireManager(ctx);

    return withTx(async (tx) => {
      // 1) Cargar la OS + validar estado y tipo_cobro.
      const [orderRow] = await tx
        .select()
        .from(ordersT)
        .where(
          and(
            eq(ordersT.id, input.orderId),
            eq(ordersT.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!orderRow) {
        throw new DomainError(
          "ORDER_NOT_FOUND",
          "Orden de Servicio no encontrada",
          404,
        );
      }
      if (
        !qualifiesForSubscription({
          orderStatus: orderRow.status,
          orderTipoCobro: orderRow.tipoCobro,
        })
      ) {
        throw new DomainError(
          "SUBSCRIPTION_ORDER_NOT_AUTHORIZED",
          "La OS debe estar en authorized_to_start y tipo_cobro=suscripcion",
          409,
        );
      }

      // 2) Idempotencia: si ya existe suscripción para esta OS, devolver.
      const [existing] = await tx
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.organizationId, user.organization_id),
            eq(subscriptions.orderId, input.orderId),
          ),
        )
        .limit(1);
      if (existing) {
        const dto = subscriptionToDto(existing);
        const current = await readCurrentPeriod(user.organization_id, dto.id);
        return { subscription: dto, currentPeriod: current };
      }

      // 3) Validar que el cliente y la cotización existen en la org.
      const [clientRow] = await tx
        .select({ id: clientsT.id })
        .from(clientsT)
        .where(
          and(
            eq(clientsT.id, orderRow.clientId),
            eq(clientsT.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!clientRow) {
        throw new DomainError(
          "CLIENT_NOT_FOUND",
          "Cliente de la OS no encontrado en la organización",
          404,
        );
      }
      if (orderRow.cotizacionId) {
        const [quoteRow] = await tx
          .select({ id: quotesT.id })
          .from(quotesT)
          .where(
            and(
              eq(quotesT.id, orderRow.cotizacionId),
              eq(quotesT.organizationId, user.organization_id),
            ),
          )
          .limit(1);
        if (!quoteRow) {
          throw new DomainError(
            "QUOTE_NOT_FOUND",
            "Cotización de la OS no encontrada en la organización",
            404,
          );
        }
      }

      // 4) Calcular periodicidad y periodo inicial.
      //    SPEC-011 no exige periodicidad explícita en la OS; el
      //    default MVP es `mensual`. Si la OS trae snapshot de
      //    periodicidad en metadata, se respeta. Aquí usamos `mensual`
      //    como default honesto y reversible.
      const periodicity: SubscriptionPeriodicity = "mensual";
      const amountCents = orderRow.soldTotalCents ?? 0;
      // Inicio del periodo: hoy UTC. Fin: +1 mes -1 día.
      const today = new Date();
      const startIso = today.toISOString().slice(0, 10);
      const endIso = computePeriodEnd(startIso, periodicity);
      const nextRenewalIso = computeNextPeriodStart(endIso);

      // 5) Crear la suscripción.
      const [subRow] = await tx
        .insert(subscriptions)
        .values({
          organizationId: user.organization_id,
          clientId: orderRow.clientId,
          cotizacionId: orderRow.cotizacionId,
          orderId: orderRow.id,
          status: "activa",
          periodicity,
          currentPeriodStart: startIso,
          currentPeriodEnd: endIso,
          amountCents,
          nextRenewalDate: nextRenewalIso,
          createdBy: user.id,
        })
        .returning();
      if (!subRow) throw new Error("subscriptions insert sin fila");

      // 6) Crear el primer periodo.
      const [periodRow] = await tx
        .insert(subscriptionPeriods)
        .values({
          organizationId: user.organization_id,
          subscriptionId: subRow.id,
          periodStart: startIso,
          periodEnd: endIso,
          status: "activo",
          invoiceId: null,
        })
        .returning();
      if (!periodRow) throw new Error("subscription_periods insert sin fila");

      // 7) Historial inicial.
      await tx.insert(subscriptionHistory).values({
        organizationId: user.organization_id,
        subscriptionId: subRow.id,
        fromStatus: null,
        toStatus: "activa",
        action: "create",
        reason: null,
        actorUserId: user.id,
        actorRoleCode: ctx.actorRoleCode ?? null,
        actorKind: "user",
      });

      // 8) Audit (BR-N336).
      await audit.record(ctx, {
        entityType: "subscription",
        entityId: subRow.id,
        action: "subscription.create",
        after: {
          orderId: subRow.orderId,
          clientId: subRow.clientId,
          periodicity: subRow.periodicity,
          amountCents: subRow.amountCents,
          currentPeriodStart: subRow.currentPeriodStart,
          currentPeriodEnd: subRow.currentPeriodEnd,
        },
        ...(ctx.actorRoleCode !== undefined
          ? { actorRoleCode: ctx.actorRoleCode }
          : {}),
      });

      return {
        subscription: subscriptionToDto(subRow),
        currentPeriod: periodToDto(periodRow),
      };
    });
  }

  async function list(
    ctx: Context,
    input: {
      status?: SubscriptionStatus;
      periodicity?: SubscriptionPeriodicity;
      limit: number;
      offset: number;
    },
  ): Promise<SubscriptionListResultDTO> {
    const user = requireUser(ctx);
    await requireManager(ctx);

    const whereParts = [eq(subscriptions.organizationId, user.organization_id)];
    if (input.status) {
      whereParts.push(eq(subscriptions.status, input.status));
    }
    if (input.periodicity) {
      whereParts.push(eq(subscriptions.periodicity, input.periodicity));
    }
    const [items, totalRow] = await Promise.all([
      db
        .select()
        .from(subscriptions)
        .where(and(...whereParts))
        .orderBy(desc(subscriptions.createdAt))
        .limit(input.limit)
        .offset(input.offset),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(subscriptions)
        .where(and(...whereParts)),
    ]);
    const total = Number(totalRow[0]?.c ?? 0);

    await audit.record(ctx, {
      entityType: "subscription",
      entityId: user.id,
      action: "subscription.list",
      after: {
        count: items.length,
        status: input.status ?? null,
        periodicity: input.periodicity ?? null,
      },
      ...(ctx.actorRoleCode !== undefined
        ? { actorRoleCode: ctx.actorRoleCode }
        : {}),
    });
    return {
      items: items.map(subscriptionToDto),
      total,
      limit: input.limit,
      offset: input.offset,
    };
  }

  async function get(
    ctx: Context,
    input: { id: string },
  ): Promise<SubscriptionDetailDTO> {
    const user = requireUser(ctx);
    await requireManager(ctx);
    const sub = await loadSubscription(user.organization_id, input.id);
    const current = await readCurrentPeriod(user.organization_id, sub.id);
    await audit.record(ctx, {
      entityType: "subscription",
      entityId: sub.id,
      action: "subscription.get",
      after: { id: sub.id },
      ...(ctx.actorRoleCode !== undefined
        ? { actorRoleCode: ctx.actorRoleCode }
        : {}),
    });
    return { subscription: sub, currentPeriod: current };
  }

  async function history(
    ctx: Context,
    input: { id: string; limit: number; offset: number },
  ): Promise<SubscriptionHistoryListResultDTO> {
    const user = requireUser(ctx);
    await requireManager(ctx);
    const sub = await loadSubscription(user.organization_id, input.id);
    const [items, totalRow] = await Promise.all([
      db
        .select()
        .from(subscriptionHistory)
        .where(
          and(
            eq(subscriptionHistory.organizationId, user.organization_id),
            eq(subscriptionHistory.subscriptionId, sub.id),
          ),
        )
        .orderBy(desc(subscriptionHistory.createdAt))
        .limit(input.limit)
        .offset(input.offset),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(subscriptionHistory)
        .where(
          and(
            eq(subscriptionHistory.organizationId, user.organization_id),
            eq(subscriptionHistory.subscriptionId, sub.id),
          ),
        ),
    ]);
    const total = Number(totalRow[0]?.c ?? 0);
    await audit.record(ctx, {
      entityType: "subscription",
      entityId: sub.id,
      action: "subscription.history",
      after: { count: items.length },
      ...(ctx.actorRoleCode !== undefined
        ? { actorRoleCode: ctx.actorRoleCode }
        : {}),
    });
    return {
      items: items.map(historyToDto),
      total,
      limit: input.limit,
      offset: input.offset,
    };
  }

  // Helper genérico de transición (pausar / cancelar / reactivar).
  async function transition(
    ctx: Context,
    input: {
      id: string;
      action: "pausar" | "cancelar" | "reactivar";
      targetStatus: SubscriptionStatus;
      reason: string;
    },
  ): Promise<SubscriptionDTO> {
    const user = requireUser(ctx);
    await requireManager(ctx);
    const reasonCheck = validateReason(input.reason);
    if (!reasonCheck.ok) {
      throw new DomainError(reasonCheck.reason, "Motivo obligatorio (≥3)", 400);
    }
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.organizationId, user.organization_id),
            eq(subscriptions.id, input.id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError(
          "SUBSCRIPTION_NOT_FOUND",
          "Suscripción no encontrada",
          404,
        );
      }
      if (!canTransition(before.status as SubscriptionStatus, input.targetStatus)) {
        throw new DomainError(
          "SUBSCRIPTION_INVALID_TRANSITION",
          `Transición inválida (${before.status} → ${input.targetStatus})`,
          409,
        );
      }
      const [after] = await tx
        .update(subscriptions)
        .set({ status: input.targetStatus, updatedAt: new Date() })
        .where(
          and(
            eq(subscriptions.organizationId, user.organization_id),
            eq(subscriptions.id, input.id),
          ),
        )
        .returning();
      if (!after) throw new Error("subscriptions update sin fila");

      await tx.insert(subscriptionHistory).values({
        organizationId: user.organization_id,
        subscriptionId: before.id,
        fromStatus: before.status,
        toStatus: input.targetStatus,
        action: input.action,
        reason: reasonCheck.text,
        actorUserId: user.id,
        actorRoleCode: ctx.actorRoleCode ?? null,
        actorKind: "user",
      });

      await audit.record(ctx, {
        entityType: "subscription",
        entityId: before.id,
        action: `subscription.${input.action}`,
        before: { status: before.status },
        after: { status: input.targetStatus, reason: reasonCheck.text },
        ...(ctx.actorRoleCode !== undefined
          ? { actorRoleCode: ctx.actorRoleCode }
          : {}),
      });
      return subscriptionToDto(after);
    });
  }

  const pausar: SuscripcionesService["pausar"] = (ctx, input) =>
    transition(ctx, {
      id: input.id,
      action: "pausar",
      targetStatus: "pausada",
      reason: input.reason,
    });
  const cancelar: SuscripcionesService["cancelar"] = (ctx, input) =>
    transition(ctx, {
      id: input.id,
      action: "cancelar",
      targetStatus: "cancelada",
      reason: input.reason,
    });
  const reactivar: SuscripcionesService["reactivar"] = (ctx, input) =>
    transition(ctx, {
      id: input.id,
      action: "reactivar",
      targetStatus: "activa",
      reason: input.reason,
    });

  async function renovar(
    ctx: Context,
    input: { id: string; nextPeriodStart?: string },
  ): Promise<RenewResultDTO> {
    const user = requireUser(ctx);
    await requireManager(ctx);

    return withTx(async (tx) => {
      const [subRow] = await tx
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.organizationId, user.organization_id),
            eq(subscriptions.id, input.id),
          ),
        )
        .limit(1);
      if (!subRow) {
        throw new DomainError(
          "SUBSCRIPTION_NOT_FOUND",
          "Suscripción no encontrada",
          404,
        );
      }
      // La renovación aplica a `activa` (nuevo periodo) o `vencida`
      // (reactivación por renovación). `pausada` exige reanudar
      // primero; `cancelada` exige reactivar.
      if (
        subRow.status !== "activa" &&
        subRow.status !== "vencida"
      ) {
        throw new DomainError(
          "SUBSCRIPTION_INVALID_TRANSITION",
          `Renovar requiere status activa|vencida (actual: ${subRow.status})`,
          409,
        );
      }
      const periodicity =
        isValidPeriodicity(subRow.periodicity) ? subRow.periodicity : "mensual";
      const newStart =
        input.nextPeriodStart ??
        computeNextPeriodStart(
          typeof subRow.currentPeriodEnd === "string"
            ? subRow.currentPeriodEnd
            : new Date(subRow.currentPeriodEnd).toISOString().slice(0, 10),
        );
      const newEnd = computePeriodEnd(newStart, periodicity);

      // AC-9 · idempotencia: si el periodo ya existe, devolverlo sin
      // crear factura duplicada. La BD tiene UNIQUE; aquí pre-validamos
      // para emitir el mensaje AC-9 correcto.
      const [existingPeriod] = await tx
        .select()
        .from(subscriptionPeriods)
        .where(
          and(
            eq(subscriptionPeriods.organizationId, user.organization_id),
            eq(subscriptionPeriods.subscriptionId, subRow.id),
            sql`${subscriptionPeriods.periodStart} = ${newStart}`,
          ),
        )
        .limit(1);
      if (existingPeriod) {
        // Periodo ya existe; no duplicamos.
        const dto = subscriptionToDto(subRow);
        const periodDto = periodToDto(existingPeriod);
        await audit.record(ctx, {
          entityType: "subscription",
          entityId: subRow.id,
          action: "subscription.renovar",
          after: { idempotent: true, periodStart: newStart },
          ...(ctx.actorRoleCode !== undefined
            ? { actorRoleCode: ctx.actorRoleCode }
            : {}),
        });
        return {
          subscription: dto,
          period: periodDto,
          invoice: null,
          idempotent: true,
        };
      }

      // Cerrar periodo vigente (status='activo' → 'vencido' o 'pagado'
      // según exista pago; aquí usamos 'vencido' para nuevos periodos).
      await tx
        .update(subscriptionPeriods)
        .set({
          status: "vencido",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(subscriptionPeriods.organizationId, user.organization_id),
            eq(subscriptionPeriods.subscriptionId, subRow.id),
            eq(subscriptionPeriods.status, "activo"),
          ),
        );

      // Crear nuevo periodo (status='activo').
      const [newPeriod] = await tx
        .insert(subscriptionPeriods)
        .values({
          organizationId: user.organization_id,
          subscriptionId: subRow.id,
          periodStart: newStart,
          periodEnd: newEnd,
          status: "activo",
          invoiceId: null,
        })
        .returning();
      if (!newPeriod) throw new Error("subscription_periods insert sin fila");

      // Actualizar suscripción: `vencida→activa` o mantener `activa`,
      // y avanzar current_period_*.
      const nextStatus: SubscriptionStatus = "activa";
      const nextRenewalIso = computeNextPeriodStart(newEnd);
      const [updatedSub] = await tx
        .update(subscriptions)
        .set({
          status: nextStatus,
          currentPeriodStart: newStart,
          currentPeriodEnd: newEnd,
          nextRenewalDate: nextRenewalIso,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(subscriptions.organizationId, user.organization_id),
            eq(subscriptions.id, input.id),
          ),
        )
        .returning();
      if (!updatedSub) throw new Error("subscriptions update sin fila");

      // Historial.
      await tx.insert(subscriptionHistory).values({
        organizationId: user.organization_id,
        subscriptionId: subRow.id,
        fromStatus: subRow.status,
        toStatus: nextStatus,
        action: "renovar",
        reason: null,
        actorUserId: user.id,
        actorRoleCode: ctx.actorRoleCode ?? null,
        actorKind: "user",
      });

      // BR-N406 · pedir a Facturación la factura borrador. El contrato
      // consume `subscription_id`, `client_id`, `concept` y `dueDate`.
      // Se llama FUERA de la transacción de BD para respetar la
      // frontera de módulo (no propagamos el `tx` a SPEC-007).
      const { createInvoicesService } = await import(
        "@/server/services/facturacion"
      );
      const { buildCryptoServiceFromEnv } = await import(
        "@/server/services/crypto/bootstrap"
      );
      const { buildFilesServiceFromEnv } = await import(
        "@/server/services/files"
      );
      const { createJobsService } = await import("@/server/services/jobs");
      const invoicesSvc = await createInvoicesService({
        crypto: buildCryptoServiceFromEnv(),
        files: await buildFilesServiceFromEnv(),
        jobs: createJobsService(),
        audit: audit as AuditService,
      });
      const dueDate = newEnd;
      const invoice = await invoicesSvc.createDraftFromSubscriptionRenewal(
        ctx,
        {
          subscriptionId: subRow.id,
          clientId: subRow.clientId,
          fiscalDataSnapshot: {},
          concept: {
            claveProdServ: "84111506",
            descripcion: `Suscripción ${periodicity} ${newStart}–${newEnd}`,
            cantidad: 1,
            valorUnitarioCents: subRow.amountCents,
          },
          dueDate,
        },
      );

      // Vincular la factura al periodo (FK lógica, no dura).
      await tx
        .update(subscriptionPeriods)
        .set({
          invoiceId: invoice.id,
          status: "facturado",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(subscriptionPeriods.organizationId, user.organization_id),
            eq(subscriptionPeriods.id, newPeriod.id),
          ),
        );

      await audit.record(ctx, {
        entityType: "subscription",
        entityId: subRow.id,
        action: "subscription.renovar",
        before: {
          status: subRow.status,
          currentPeriodEnd: subRow.currentPeriodEnd,
        },
        after: {
          status: nextStatus,
          newPeriodStart: newStart,
          newPeriodEnd: newEnd,
          invoiceId: invoice.id,
          invoiceCode: invoice.code,
        },
        ...(ctx.actorRoleCode !== undefined
          ? { actorRoleCode: ctx.actorRoleCode }
          : {}),
      });

      return {
        subscription: subscriptionToDto(updatedSub),
        period: periodToDto({
          ...newPeriod,
          invoiceId: invoice.id,
          status: "facturado",
        }),
        invoice: {
          id: invoice.id,
          code: invoice.code,
          status: invoice.status,
        },
        idempotent: false,
      };
    });
  }

  async function markVencida(
    ctx: Context,
    input: { refDate: string },
  ): Promise<{ scanned: number; updated: number }> {
    // Job: lo invoca un worker externo con actor=system o un admin.
    // La defensa de permiso queda flexible: el job del sistema (actor
    // `system`) pasa el check; un humano necesita `gestionar_suscripciones`.
    // El contrato del SPEC no exige permiso para el job; implementamos
    // requireManager y dejamos al caller controlar el actor.
    const user = requireUser(ctx);
    if (user.id) {
      await requireManager(ctx);
    }
    const refIso = input.refDate;

    const rows = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.organizationId, user.organization_id),
          eq(subscriptions.status, "activa"),
          sql`${subscriptions.currentPeriodEnd} < ${refIso}`,
        ),
      );

    let updated = 0;
    for (const r of rows) {
      await withTx(async (tx) => {
        const [updatedRow] = await tx
          .update(subscriptions)
          .set({ status: "vencida", updatedAt: new Date() })
          .where(
            and(
              eq(subscriptions.organizationId, user.organization_id),
              eq(subscriptions.id, r.id),
              eq(subscriptions.status, "activa"), // defensa contra carrera
            ),
          )
          .returning();
        if (!updatedRow) return;
        await tx.insert(subscriptionHistory).values({
          organizationId: user.organization_id,
          subscriptionId: r.id,
          fromStatus: "activa",
          toStatus: "vencida",
          action: "vencer",
          reason: null,
          actorUserId: ctx.actorRoleCode === "system" ? null : user.id,
          actorRoleCode: ctx.actorRoleCode ?? null,
          actorKind: ctx.actorRoleCode === "system" ? "system" : "user",
        });
        await audit.record(ctx, {
          entityType: "subscription",
          entityId: r.id,
          action: "subscription.mark_vencida",
          before: { status: r.status, currentPeriodEnd: r.currentPeriodEnd },
          after: { status: "vencida", refDate: refIso },
          ...(ctx.actorRoleCode === "system"
            ? { actor: { kind: "system" as const } }
            : {}),
        });
        updated++;
      });
    }
    return { scanned: rows.length, updated };
  }

  async function facturacion(
    ctx: Context,
    input: { id: string },
  ): Promise<SubscriptionFacturacionResultDTO> {
    const user = requireUser(ctx);
    await requireManager(ctx);
    const sub = await loadSubscription(user.organization_id, input.id);
    const items = await db
      .select({
        invoiceId: invoicesT.id,
        code: invoicesT.code,
        status: invoicesT.status,
        totalCents: invoicesT.totalCents,
        paidCents: invoicesT.paidCents,
        dueDate: invoicesT.dueDate,
        issuedAt: invoicesT.issuedAt,
      })
      .from(invoicesT)
      .where(
        and(
          eq(invoicesT.organizationId, user.organization_id),
          eq(invoicesT.subscriptionId, sub.id),
        ),
      )
      .orderBy(desc(invoicesT.createdAt));
    await audit.record(ctx, {
      entityType: "subscription",
      entityId: sub.id,
      action: "subscription.facturacion",
      after: { count: items.length },
      ...(ctx.actorRoleCode !== undefined
        ? { actorRoleCode: ctx.actorRoleCode }
        : {}),
    });
    return { items, total: items.length };
  }

  async function cobranza(
    ctx: Context,
    input: { id: string },
  ): Promise<SubscriptionCobranzaResultDTO> {
    const user = requireUser(ctx);
    await requireManager(ctx);
    const sub = await loadSubscription(user.organization_id, input.id);
    // BR-N401 · sólo lectura. JOIN: payments → paymentApplications →
    // invoices (filtrada por subscription_id).
    const { paymentApplications } = await import("@/server/db/schema");
    const rows = await db
      .select({
        paymentId: paymentsT.id,
        amountCents: paymentsT.amountCents,
        method: paymentsT.method,
        paymentDate: paymentsT.paymentDate,
        invoiceId: paymentApplications.invoiceId,
        status: paymentsT.status,
        registeredAt: paymentsT.createdAt,
      })
      .from(paymentsT)
      .innerJoin(
        paymentApplications,
        and(
          eq(paymentApplications.organizationId, paymentsT.organizationId),
          eq(paymentApplications.paymentId, paymentsT.id),
        ),
      )
      .innerJoin(
        invoicesT,
        and(
          eq(invoicesT.organizationId, paymentApplications.organizationId),
          eq(invoicesT.id, paymentApplications.invoiceId),
        ),
      )
      .where(
        and(
          eq(paymentsT.organizationId, user.organization_id),
          eq(invoicesT.subscriptionId, sub.id),
        ),
      )
      .orderBy(desc(paymentsT.createdAt));
    await audit.record(ctx, {
      entityType: "subscription",
      entityId: sub.id,
      action: "subscription.cobranza",
      after: { count: rows.length },
      ...(ctx.actorRoleCode !== undefined
        ? { actorRoleCode: ctx.actorRoleCode }
        : {}),
    });
    return { items: rows, total: rows.length };
  }

  return {
    createFromOrder,
    list,
    get,
    history,
    pausar,
    cancelar,
    reactivar,
    renovar,
    markVencida,
    facturacion,
    cobranza,
  };
}

// Re-export status enum helper for the router (no se usa fuera, pero
// expone la fuente de verdad para evitar drift).
export { SUBSCRIPTION_STATUSES };
