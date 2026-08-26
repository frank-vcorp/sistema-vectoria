/**
 * Servicio `orders` (OS) — SPEC-004 §4.3 / AC-1..AC-8.
 *
 * Reglas críticas (no delegables, AC-2):
 *  - OS **nace** al aceptar cotización con copia inmutable de importes
 *    y alcance (BR-N242/237).
 *  - **No autorizar sin PL** (BR-N245) → `409 PL_NOT_ASSIGNED`.
 *  - **No autorizar sin anticipo ≥90%** (BR-N244) → `409 DEPOSIT_PENDING`
 *    salvo excepción Director (auditada).
 *  - **OC monto ≠ total vendido o sin PDF** (BR-017) → `409 OC_MISMATCH`.
 *  - **Suscripción sin pago inicial** (BR-N121) →
 *    `409 SUBSCRIPTION_INITIAL_PAYMENT_REQUIRED`.
 *  - **Cierre técnico** (`delivered`) no exige saldo cero (BR-N392).
 *  - **Cierre administrativo** (`closed`) exige saldo cero o excepción
 *    Director (BR-N249/N394) y factura final (BR-N393).
 *  - **Pausa/Cancelación** con motivo obligatorio (BR-N250).
 *
 * Side-effects:
 *  - La transición `authorized_to_start` → `os.authorized_to_start` en
 *    `audit_logs` con `plUserId` y `tipoCobro` para SPEC-005/SPEC-011
 *    (AC-3). El servicio **NO** crea `projects` ni `subscriptions`.
 *
 * Cobro del anticipo (BR-N244/121):
 *  - El servicio lee `paidCents` desde un **contrato consumible**
 *    (`getAdvancePaidCents(orgId, quoteId, tipoCobro)`) que vive en
 *    `cobranza/index.ts`. Mientras ese módulo no esté implementado,
 *    el contrato devuelve `0` con un `SPEC-GAP` documentado en
 *    IMPL-REPORT. La interfaz garantiza que, cuando SPEC-008/011
 *    publique el dato, no se requieran cambios en SPEC-004.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import {
  clients,
  files,
  invoices,
  orders,
  quotes,
  scopeDocuments,
  users,
} from "@/server/db/schema";
import {
  ORDER_STATUSES,
  TIPO_COBRO,
  type OrderStatus,
  type TipoCobro,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import {
  buildOsAuthorizedEvent,
  canTransitionTo,
  checkAdvanceThreshold,
  evaluateCloseAdministrative,
  nextOrderCode,
  subscriptionRequiresInitialPayment,
  validateOc,
  validateOsReason,
} from "./helpers";

/** DTO de OS (BR-N242/243). */
export interface OrderDTO {
  id: string;
  organizationId: string;
  code: string;
  cotizacionId: string;
  clientId: string;
  plUserId: string | null;
  tipoCobro: TipoCobro;
  soldTotalCents: number;
  soldScopeSnapshot: Record<string, unknown>;
  anticipoRequiredCents: number | null;
  ocNumber: string | null;
  ocDate: string | null;
  ocAmountCents: number | null;
  ocFileId: string | null;
  status: OrderStatus;
  pauseReason: string | null;
  cancelReason: string | null;
  authorizedAt: Date | null;
  authorizedBy: string | null;
  deliveredAt: Date | null;
  closedAt: Date | null;
  closedDirectorException: boolean;
  closedDirectorExceptionReason: string | null;
  finalInvoiceIssued: boolean;
  closedBalanceCents: number | null;
  projectCreatedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Contrato consumible del anticipo. Inyectable en tests. */
export interface AdvancePaidProvider {
  getAdvancePaidCents(input: {
    organizationId: string;
    cotizacionId: string;
    quoteClientId: string | null;
    tipoCobro: TipoCobro;
  }): Promise<{
    advancePaidCents: number;
    subscriptionInitialPaid: boolean;
    /** Origen del dato (SPEC-008 / SPEC-011 / placeholder). */
    source: "spec-008" | "spec-011" | "placeholder";
  }>;
}

/**
 * Implementación **placeholder** del contrato `AdvancePaidProvider`.
 *
 * Devuelve 0 y `subscriptionInitialPaid=false` hasta que SPEC-008/
 * SPEC-011 publiquen un adapter real. El servicio registra este
 * origen en audit y documenta el `SPEC-GAP` en IMPL-REPORT. Cuando
 * SPEC-008 implemente su servicio, basta sustituir el provider en
 * el cierre de `createOrdersService({ advanceProvider })` (default).
 */
export const placeholderAdvancePaidProvider: AdvancePaidProvider = {
  async getAdvancePaidCents() {
    return {
      advancePaidCents: 0,
      subscriptionInitialPaid: false,
      source: "placeholder" as const,
    };
  },
};

export interface CreateOrdersServiceOptions {
  advanceProvider?: AdvancePaidProvider;
}

export interface OrdersService {
  createFromAcceptedQuote(
    ctx: Context,
    input: { cotizacionId: string; anticipoRequiredCents?: number | null },
  ): Promise<OrderDTO>;
  assignPL(ctx: Context, input: { orderId: string; plUserId: string }): Promise<OrderDTO>;
  setOC(
    ctx: Context,
    input: {
      orderId: string;
      ocNumber?: string;
      ocDate?: string;
      ocAmountCents?: number;
      ocFileId?: string;
    },
  ): Promise<OrderDTO>;
  authorize(
    ctx: Context,
    input: { orderId: string; directorException?: boolean; directorExceptionReason?: string },
  ): Promise<OrderDTO>;
  markInExecution(
    ctx: Context,
    input: { orderId: string; manual?: boolean },
  ): Promise<OrderDTO>;
  markDelivered(ctx: Context, input: { orderId: string }): Promise<OrderDTO>;
  closeAdministrative(
    ctx: Context,
    input: { orderId: string; directorException?: boolean; directorExceptionReason?: string },
  ): Promise<OrderDTO>;
  pause(ctx: Context, input: { orderId: string; reason: string }): Promise<OrderDTO>;
  resume(ctx: Context, input: { orderId: string }): Promise<OrderDTO>;
  cancel(ctx: Context, input: { orderId: string; reason: string }): Promise<OrderDTO>;
  getById(ctx: Context, orderId: string): Promise<OrderDTO>;
  list(
    ctx: Context,
    opts: { limit?: number; offset?: number; status?: OrderStatus | string },
  ): Promise<{ items: OrderDTO[]; total: number }>;
}

function statusOf(value: string): OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value)
    ? (value as OrderStatus)
    : "pending_deposit";
}

function tipoCobroOf(value: string): TipoCobro {
  return (TIPO_COBRO as readonly string[]).includes(value)
    ? (value as TipoCobro)
    : "pago_unico";
}

function toDto(row: typeof orders.$inferSelect): OrderDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    code: row.code,
    cotizacionId: row.cotizacionId,
    clientId: row.clientId,
    plUserId: row.plUserId,
    tipoCobro: tipoCobroOf(row.tipoCobro),
    soldTotalCents: row.soldTotalCents,
    soldScopeSnapshot: (row.soldScopeSnapshot ?? {}) as Record<string, unknown>,
    anticipoRequiredCents: row.anticipoRequiredCents,
    ocNumber: row.ocNumber,
    ocDate: row.ocDate,
    ocAmountCents: row.ocAmountCents,
    ocFileId: row.ocFileId,
    status: statusOf(row.status),
    pauseReason: row.pauseReason,
    cancelReason: row.cancelReason,
    authorizedAt: row.authorizedAt,
    authorizedBy: row.authorizedBy,
    deliveredAt: row.deliveredAt,
    closedAt: row.closedAt,
    closedDirectorException: row.closedDirectorException,
    closedDirectorExceptionReason: row.closedDirectorExceptionReason,
    finalInvoiceIssued: row.finalInvoiceIssued,
    closedBalanceCents: row.closedBalanceCents,
    projectCreatedAt: row.projectCreatedAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function loadOrder(orgId: string, orderId: string): Promise<OrderDTO> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.organizationId, orgId)))
    .limit(1);
  if (!row) {
    throw new DomainError("ORDER_NOT_FOUND", "Orden de Servicio no encontrada", 404);
  }
  return toDto(row);
}

export function createOrdersService(
  options: CreateOrdersServiceOptions = {},
): OrdersService {
  const db = getDb();
  const advanceProvider = options.advanceProvider ?? placeholderAdvancePaidProvider;

  /** Generador del siguiente código `OS-NNNNN` por organización. */
  async function nextCode(orgId: string): Promise<string> {
    return nextOrderCode(orgId, {
      async selectMax(orgId: string): Promise<string | null> {
        const [row] = await db
          .select({ code: sql<string>`max(code)` })
          .from(orders)
          .where(eq(orders.organizationId, orgId));
        return row?.code ?? null;
      },
    });
  }

  async function createFromAcceptedQuote(
    ctx: Context,
    input: { cotizacionId: string; anticipoRequiredCents?: number | null },
  ): Promise<OrderDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_ordenes_servicio", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      // 1) Cotización existe, pertenece a la org y está aceptada (BR-N237).
      const [quote] = await tx
        .select()
        .from(quotes)
        .where(
          and(
            eq(quotes.id, input.cotizacionId),
            eq(quotes.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!quote) {
        throw new DomainError("QUOTE_NOT_FOUND", "Cotización no encontrada", 404);
      }
      if (quote.status !== "accepted") {
        throw new DomainError(
          "QUOTE_NOT_ACCEPTED",
          "La OS nace sólo de cotizaciones aceptadas",
          409,
        );
      }
      if (!quote.clientId) {
        throw new DomainError(
          "QUOTE_HAS_NO_CLIENT",
          "La cotización aceptada requiere cliente asociado",
          409,
        );
      }
      // Defensa: cliente existe en la org.
      const [clientRow] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(
          and(
            eq(clients.id, quote.clientId),
            eq(clients.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!clientRow) {
        throw new DomainError("CLIENT_NOT_FOUND", "Cliente no encontrado", 404);
      }
      // 2) Alcance firmado (BR-N51 + AC-1). El snapshot de alcance se
      //    copia del `scope_documents.content` del documento firmado.
      const [scope] = await tx
        .select()
        .from(scopeDocuments)
        .where(
          and(
            eq(scopeDocuments.id, quote.scopeId),
            eq(scopeDocuments.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!scope) {
        throw new DomainError("SCOPE_NOT_FOUND", "Alcance no encontrado", 404);
      }
      if (scope.status !== "signed") {
        throw new DomainError(
          "SCOPE_NOT_SIGNED",
          "La OS exige un alcance firmado",
          409,
        );
      }
      // 3) Defensa: una OS por cotización aceptada (BR-N242). El UNIQUE
      //    `(organization_id, cotizacion_id)` lo captura, pero validamos
      //    explícitamente para emitir el código de error correcto.
      const existing = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.organizationId, user.organization_id),
            eq(orders.cotizacionId, quote.id),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        throw new DomainError(
          "ORDER_ALREADY_EXISTS_FOR_QUOTE",
          "La cotización ya tiene una OS",
          409,
        );
      }
      // 4) Calcular `sold_total_cents` desde la cotización aceptada
      //    (BR-N357..N360 ya materializado en `quote.totalCents`).
      const soldTotalCents = quote.totalCents;
      const code = await nextCode(user.organization_id);
      const tipoCobro = tipoCobroOf(quote.tipoCobro);
      const anticipoRequired =
        input.anticipoRequiredCents != null
          ? Math.max(0, Math.floor(input.anticipoRequiredCents))
          : null;
      // 5) Insertar OS con copia **inmutable** del alcance.
      const [row] = await tx
        .insert(orders)
        .values({
          organizationId: user.organization_id,
          code,
          cotizacionId: quote.id,
          clientId: quote.clientId,
          plUserId: null,
          tipoCobro,
          soldTotalCents,
          soldScopeSnapshot: (scope.content ?? {}) as Record<string, unknown>,
          anticipoRequiredCents: anticipoRequired,
          status: "pending_deposit",
          finalInvoiceIssued: false,
          closedDirectorException: false,
          createdBy: user.id,
        })
        .returning();
      if (!row) throw new Error("order insert sin fila");
      // 6) Audit: AC-1 (BR-N336, invariante 12).
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "order",
        entityId: row.id,
        action: "os.create",
        after: {
          code: row.code,
          cotizacionId: row.cotizacionId,
          clientId: row.clientId,
          tipoCobro: row.tipoCobro,
          soldTotalCents: row.soldTotalCents,
          status: row.status,
        },
        ...(ctx.actorRoleCode !== undefined ? { actorRoleCode: ctx.actorRoleCode } : {}),
      });
      return toDto(row);
    });
  }

  async function assignPL(
    ctx: Context,
    input: { orderId: string; plUserId: string },
  ): Promise<OrderDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "asignar_pl_os", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("ORDER_NOT_FOUND", "Orden de Servicio no encontrada", 404);
      }
      // El PL existe en la org.
      const [plUser] = await tx
        .select({ id: users.id, active: users.active })
        .from(users)
        .where(
          and(
            eq(users.id, input.plUserId),
            eq(users.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!plUser || !plUser.active) {
        throw new DomainError("PL_NOT_ASSIGNED", "PL no disponible", 409);
      }
      const [after] = await tx
        .update(orders)
        .set({ plUserId: input.plUserId })
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("order assignPL sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "order",
        entityId: after.id,
        action: "os.assign_pl",
        before: { plUserId: before.plUserId },
        after: { plUserId: after.plUserId },
      });
      return toDto(after);
    });
  }

  async function setOC(
    ctx: Context,
    input: {
      orderId: string;
      ocNumber?: string;
      ocDate?: string;
      ocAmountCents?: number;
      ocFileId?: string;
    },
  ): Promise<OrderDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_ordenes_servicio", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("ORDER_NOT_FOUND", "Orden de Servicio no encontrada", 404);
      }
      const soldTotalCents = before.soldTotalCents;
      const candidate = {
        ocNumber: input.ocNumber ?? before.ocNumber,
        ocAmountCents: input.ocAmountCents ?? before.ocAmountCents,
        ocFileId: input.ocFileId ?? before.ocFileId,
        soldTotalCents,
      };
      const v = validateOc(candidate);
      if (!v.ok) {
        if (v.reason === "OC_MISMATCH") {
          throw new DomainError(
            "OC_MISMATCH",
            `Monto OC (${v.gotCents}) no coincide con total vendido (${v.expectedCents})`,
            409,
          );
        }
        throw new DomainError(
          "OC_FILE_REQUIRED",
          "La OC requiere PDF",
          409,
        );
      }
      // Defensa: si hay ocFileId, debe existir y pertenecer a la org.
      if (candidate.ocFileId) {
        const [fileRow] = await tx
          .select({ id: files.id })
          .from(files)
          .where(
            and(
              eq(files.id, candidate.ocFileId),
              eq(files.organizationId, user.organization_id),
            ),
          )
          .limit(1);
        if (!fileRow) {
          throw new DomainError(
            "EVIDENCE_FILE_NOT_FOUND",
            "Archivo de OC no encontrado",
            404,
          );
        }
      }
      const patch: Partial<typeof orders.$inferInsert> = {};
      if (input.ocNumber !== undefined) patch.ocNumber = input.ocNumber;
      if (input.ocDate !== undefined) patch.ocDate = input.ocDate;
      if (input.ocAmountCents !== undefined) patch.ocAmountCents = input.ocAmountCents;
      if (input.ocFileId !== undefined) patch.ocFileId = input.ocFileId;
      const [after] = await tx
        .update(orders)
        .set(patch)
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("order setOC sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "order",
        entityId: after.id,
        action: "os.set_oc",
        before: {
          ocNumber: before.ocNumber,
          ocDate: before.ocDate,
          ocAmountCents: before.ocAmountCents,
          ocFileId: before.ocFileId,
        },
        after: {
          ocNumber: after.ocNumber,
          ocDate: after.ocDate,
          ocAmountCents: after.ocAmountCents,
          ocFileId: after.ocFileId,
        },
      });
      return toDto(after);
    });
  }

  async function authorize(
    ctx: Context,
    input: { orderId: string; directorException?: boolean; directorExceptionReason?: string },
  ): Promise<OrderDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "autorizar_os", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("ORDER_NOT_FOUND", "Orden de Servicio no encontrada", 404);
      }
      // BR-N245 · PL asignado (no nulo).
      if (!before.plUserId) {
        throw new DomainError("PL_NOT_ASSIGNED", "PL no asignado", 409);
      }
      // Transición válida.
      const t = canTransitionTo(statusOf(before.status), "authorized_to_start");
      if (!t.ok) {
        throw new DomainError(t.code, `Transición inválida (${before.status} → authorized_to_start)`, 409);
      }
      // BR-N017 · OC válida si está presente (validador puro).
      const ocCheck = validateOc({
        ocNumber: before.ocNumber,
        ocAmountCents: before.ocAmountCents,
        ocFileId: before.ocFileId,
        soldTotalCents: before.soldTotalCents,
      });
      if (!ocCheck.ok) {
        if (ocCheck.reason === "OC_MISMATCH") {
          throw new DomainError(
            "OC_MISMATCH",
            "Monto OC no coincide con total vendido",
            409,
          );
        }
        throw new DomainError(
          "OC_FILE_REQUIRED",
          "OC con monto definido requiere PDF",
          409,
        );
      }
      // BR-N244 · anticipo ≥90% o excepción Director.
      const directorException = !!input.directorException;
      if (directorException) {
        const reason = (input.directorExceptionReason ?? "").trim();
        if (reason.length < 3) {
          throw new DomainError(
            "DEPOSIT_PENDING",
            "La excepción Director requiere motivo",
            409,
          );
        }
      }
      const paid = await advanceProvider.getAdvancePaidCents({
        organizationId: user.organization_id,
        cotizacionId: before.cotizacionId,
        quoteClientId: before.clientId,
        tipoCobro: before.tipoCobro as TipoCobro,
      });
      const advance = checkAdvanceThreshold({
        soldTotalCents: before.soldTotalCents,
        advancePaidCents: paid.advancePaidCents,
      });
      if (!advance.ok && !directorException) {
        throw new DomainError(
          "DEPOSIT_PENDING",
          `Anticipo cobrado ${(advance.ratio * 100).toFixed(1)}% < ${advance.requiredPct}%`,
          409,
          {
            ratio: advance.ratio,
            requiredPct: advance.requiredPct,
            missingCents: advance.missingCents,
          },
        );
      }
      // BR-N121 · suscripción exige pago inicial.
      if (subscriptionRequiresInitialPayment(before.tipoCobro as TipoCobro)) {
        if (!paid.subscriptionInitialPaid) {
          throw new DomainError(
            "SUBSCRIPTION_INITIAL_PAYMENT_REQUIRED",
            "La OS de suscripción requiere pago inicial",
            409,
          );
        }
      }
      const authorizedAt = new Date();
      const [after] = await tx
        .update(orders)
        .set({
          status: "authorized_to_start",
          authorizedAt,
          authorizedBy: user.id,
        })
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("order authorize sin fila");
      // Audit `os.authorize` (BR-N336).
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "order",
        entityId: after.id,
        action: "os.authorize",
        before: { status: before.status },
        after: {
          status: after.status,
          plUserId: after.plUserId,
          tipoCobro: after.tipoCobro,
          advancePaidCents: paid.advancePaidCents,
          directorException,
          advanceSource: paid.source,
        },
        ...(ctx.actorRoleCode !== undefined ? { actorRoleCode: ctx.actorRoleCode } : {}),
      });
      // AC-3 · evento que consume SPEC-005/SPEC-011: expone
      // `pl_user_id` y `tipo_cobro` (BR-N407/N405/N246).
      const event = buildOsAuthorizedEvent({
        orderId: after.id,
        organizationId: after.organizationId,
        plUserId: after.plUserId!,
        tipoCobro: after.tipoCobro as TipoCobro,
        soldTotalCents: after.soldTotalCents,
        soldScopeSnapshot: (after.soldScopeSnapshot ?? {}) as Record<string, unknown>,
        cotizacionId: after.cotizacionId,
        clientId: after.clientId,
        authorizedAt,
      });
      await createAuditService().record(ctx, {
        entityType: "order",
        entityId: after.id,
        action: "os.authorized_to_start",
        after: event,
        ...(ctx.actorRoleCode !== undefined ? { actorRoleCode: ctx.actorRoleCode } : {}),
      });
      return toDto(after);
    });
  }

  async function markInExecution(
    ctx: Context,
    input: { orderId: string; manual?: boolean },
  ): Promise<OrderDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    const perm = input.manual ? "autorizar_os" : "gestionar_ordenes_servicio";
    await createHasPermissionService().require(ctx, perm, { forceDb: true });
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("ORDER_NOT_FOUND", "Orden de Servicio no encontrada", 404);
      }
      const t = canTransitionTo(statusOf(before.status), "in_execution");
      if (!t.ok) {
        throw new DomainError(
          t.code,
          `Transición inválida (${before.status} → in_execution)`,
          409,
        );
      }
      const [after] = await tx
        .update(orders)
        .set({ status: "in_execution", projectCreatedAt: new Date() })
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("order in_execution sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "order",
        entityId: after.id,
        action: "os.in_execution",
        before: { status: before.status },
        after: { status: after.status, projectCreatedAt: after.projectCreatedAt },
      });
      return toDto(after);
    });
  }

  async function markDelivered(
    ctx: Context,
    input: { orderId: string },
  ): Promise<OrderDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_ordenes_servicio", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("ORDER_NOT_FOUND", "Orden de Servicio no encontrada", 404);
      }
      const t = canTransitionTo(statusOf(before.status), "delivered");
      if (!t.ok) {
        throw new DomainError(
          t.code,
          `Transición inválida (${before.status} → delivered)`,
          409,
        );
      }
      const [after] = await tx
        .update(orders)
        .set({ status: "delivered", deliveredAt: new Date() })
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("order delivered sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "order",
        entityId: after.id,
        action: "os.delivered",
        before: { status: before.status },
        after: { status: after.status, deliveredAt: after.deliveredAt },
      });
      return toDto(after);
    });
  }

  async function closeAdministrative(
    ctx: Context,
    input: { orderId: string; directorException?: boolean; directorExceptionReason?: string },
  ): Promise<OrderDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "cerrar_os", { forceDb: true });
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("ORDER_NOT_FOUND", "Orden de Servicio no encontrada", 404);
      }
      const t = canTransitionTo(statusOf(before.status), "closed");
      if (!t.ok) {
        throw new DomainError(
          t.code,
          `Transición inválida (${before.status} → closed)`,
          409,
        );
      }
      const directorException = !!input.directorException;
      if (directorException) {
        const reason = (input.directorExceptionReason ?? "").trim();
        if (reason.length < 3) {
          // Una excepción sin motivo = rechazo defensivo.
          throw new DomainError(
            "OUTSTANDING_BALANCE",
            "La excepción Director requiere motivo",
            409,
          );
        }
      }
      // Saldo pendiente + factura final: IMPL-20260825-38 · B-4 ·
      // SPEC-004�007↔008. La fuente de saldo del cierre administrativo
      // son las facturas del `orderId` y su `paid_cents` confirmado/
      // persistido por SPEC-008 (cobros.confirm/revert mantiene ese
      // campo), NO el anticipo inicial. El contrato de anticipo se
      // conserva intacto para `authorize` (`getAdvancePaidCents`).
      // Excluimos facturas `cancelada` porque no contribuyen al
      // saldo del cierre (mismo patrón que `osOutstandingBalance`
      // en finanzas). Idempotente y seguro contra sobrepago: el
      // `Math.max(0, ...)` evita balance negativo si por alguna
      // razón la suma de `paidCents` excediera `soldTotalCents`.
      const invRows = await tx
        .select({ paidCents: invoices.paidCents, status: invoices.status })
        .from(invoices)
        .where(
          and(
            eq(invoices.organizationId, user.organization_id),
            eq(invoices.orderId, before.id),
          ),
        );
      const totalPaidCents = invRows
        .filter((r) => r.status !== "cancelada")
        .reduce((acc, r) => acc + Math.max(0, Math.floor(r.paidCents)), 0);
      const outstandingBalanceCents = Math.max(
        0,
        before.soldTotalCents - totalPaidCents,
      );
      // IMPL-20260825-38 (B-5) · backfill idempotente del flag
      // `finalInvoiceIssued` para OS timbradas/pagadas antes del
      // deploy que añadió el side-effect en `facturacion.timbrar`.
      // Si el flag está en `false` y existe al menos una factura del
      // `orderId` con `status` válido (`emitida`, `pagada`,
      // `parcialmente_pagada` o `vencida`), lo activamos aquí, en la
      // misma transacción. `borrador` y `cancelada` NO desbloquean.
      // Idempotente por construcción: un UPDATE de `false → true` es
      // un cambio material; subsiguientes lecturas ya ven `true` y el
      // `if (!before.finalInvoiceIssued)` es falso. Audit explícito
      // `os.final_invoice_issued` para trazabilidad post-backfill.
      let finalInvoiceIssued = before.finalInvoiceIssued;
      if (!finalInvoiceIssued) {
        const backfillRows = await tx
          .select({ id: invoices.id, status: invoices.status })
          .from(invoices)
          .where(
            and(
              eq(invoices.organizationId, user.organization_id),
              eq(invoices.orderId, before.id),
              inArray(invoices.status, [
                "emitida",
                "pagada",
                "parcialmente_pagada",
                "vencida",
              ]),
            ),
          )
          .limit(1);
        if (backfillRows.length > 0) {
          await tx
            .update(orders)
            .set({ finalInvoiceIssued: true })
            .where(
              and(
                eq(orders.id, before.id),
                eq(orders.organizationId, user.organization_id),
              ),
            );
          finalInvoiceIssued = true;
          const { createAuditService: auditForBackfill } = await import(
            "@/server/services/audit"
          );
          await auditForBackfill().record(ctx, {
            entityType: "order",
            entityId: before.id,
            action: "os.final_invoice_issued",
            before: { finalInvoiceIssued: false },
            after: {
              finalInvoiceIssued: true,
              source: "backfill_on_close",
              invoiceId: backfillRows[0]!.id,
              invoiceStatus: backfillRows[0]!.status,
            },
          });
        }
      }
      const evaluation = evaluateCloseAdministrative({
        outstandingBalanceCents,
        finalInvoiceIssued,
        directorException,
      });
      if (!evaluation.ok) {
        const first = evaluation.errors[0];
        if (first === "OUTSTANDING_BALANCE") {
          throw new DomainError(
            "OUTSTANDING_BALANCE",
            "Saldo pendiente sin excepción Director",
            409,
            { outstandingBalanceCents },
          );
        }
        throw new DomainError(
          "FINAL_INVOICE_REQUIRED",
          "Factura final no emitida",
          409,
        );
      }
      const [after] = await tx
        .update(orders)
        .set({
          status: "closed",
          closedAt: new Date(),
          closedDirectorException: directorException,
          closedDirectorExceptionReason: directorException
            ? (input.directorExceptionReason ?? null)
            : null,
          closedBalanceCents: outstandingBalanceCents,
        })
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("order close sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "order",
        entityId: after.id,
        action: "os.closed",
        before: { status: before.status },
        after: {
          status: after.status,
          closedAt: after.closedAt,
          closedBalanceCents: after.closedBalanceCents,
          closedDirectorException: after.closedDirectorException,
          finalInvoiceIssued: after.finalInvoiceIssued,
        },
        ...(ctx.actorRoleCode !== undefined ? { actorRoleCode: ctx.actorRoleCode } : {}),
      });
      if (directorException) {
        await createAuditService().record(ctx, {
          entityType: "order",
          entityId: after.id,
          action: "os.closed_director_exception",
          after: { reason: input.directorExceptionReason ?? null },
          ...(ctx.actorRoleCode !== undefined ? { actorRoleCode: ctx.actorRoleCode } : {}),
        });
      }
      return toDto(after);
    });
  }

  async function pause(
    ctx: Context,
    input: { orderId: string; reason: string },
  ): Promise<OrderDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_ordenes_servicio", {
      forceDb: true,
    });
    const r = validateOsReason(input.reason, "pause");
    if (!r.ok) {
      throw new DomainError(r.reason, "Motivo obligatorio (≥3 caracteres)", 400);
    }
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("ORDER_NOT_FOUND", "Orden de Servicio no encontrada", 404);
      }
      const t = canTransitionTo(statusOf(before.status), "paused");
      if (!t.ok) {
        throw new DomainError(
          t.code,
          `Transición inválida (${before.status} → paused)`,
          409,
        );
      }
      const [after] = await tx
        .update(orders)
        .set({ status: "paused", pauseReason: input.reason.trim() })
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("order pause sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "order",
        entityId: after.id,
        action: "os.pause",
        before: { status: before.status },
        after: { status: after.status, pauseReason: after.pauseReason },
      });
      return toDto(after);
    });
  }

  async function resume(ctx: Context, input: { orderId: string }): Promise<OrderDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_ordenes_servicio", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("ORDER_NOT_FOUND", "Orden de Servicio no encontrada", 404);
      }
      if (before.status !== "paused") {
        throw new DomainError("ORDER_NOT_PAUSED", "OS no está pausada", 409);
      }
      // Volvemos al estado previo si lo conocemos; por defecto
      // `pending_deposit` (BR-N250).
      const revertTo: OrderStatus = "pending_deposit";
      const [after] = await tx
        .update(orders)
        .set({ status: revertTo, pauseReason: null })
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("order resume sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "order",
        entityId: after.id,
        action: "os.resume",
        before: { status: before.status, pauseReason: before.pauseReason },
        after: { status: after.status, pauseReason: null },
      });
      return toDto(after);
    });
  }

  async function cancel(
    ctx: Context,
    input: { orderId: string; reason: string },
  ): Promise<OrderDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_ordenes_servicio", {
      forceDb: true,
    });
    const r = validateOsReason(input.reason, "cancel");
    if (!r.ok) {
      throw new DomainError(r.reason, "Motivo obligatorio (≥3 caracteres)", 400);
    }
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("ORDER_NOT_FOUND", "Orden de Servicio no encontrada", 404);
      }
      if (before.status === "cancelled") {
        throw new DomainError("ORDER_ALREADY_CANCELLED", "OS ya cancelada", 409);
      }
      if (before.status === "closed") {
        throw new DomainError("ORDER_ALREADY_CLOSED", "OS ya cerrada", 409);
      }
      const [after] = await tx
        .update(orders)
        .set({ status: "cancelled", cancelReason: input.reason.trim() })
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("order cancel sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "order",
        entityId: after.id,
        action: "os.cancel",
        before: { status: before.status },
        after: { status: after.status, cancelReason: after.cancelReason },
      });
      return toDto(after);
    });
  }

  async function getById(ctx: Context, orderId: string): Promise<OrderDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_ordenes_servicio", {
      forceDb: true,
    });
    return loadOrder(user.organization_id, orderId);
  }

  async function list(
    ctx: Context,
    opts: { limit?: number; offset?: number; status?: OrderStatus | string },
  ): Promise<{ items: OrderDTO[]; total: number }> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_ordenes_servicio", {
      forceDb: true,
    });
    const limit = Math.max(1, Math.min(200, opts.limit ?? 20));
    const offset = Math.max(0, opts.offset ?? 0);
    const where = [eq(orders.organizationId, user.organization_id)];
    if (opts.status) where.push(eq(orders.status, opts.status));
    const [totalRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(...where));
    const rows = await db
      .select()
      .from(orders)
      .where(and(...where))
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);
    return { items: rows.map(toDto), total: totalRow?.c ?? 0 };
  }

  return {
    createFromAcceptedQuote,
    assignPL,
    setOC,
    authorize,
    markInExecution,
    markDelivered,
    closeAdministrative,
    pause,
    resume,
    cancel,
    getById,
    list,
  };
}
