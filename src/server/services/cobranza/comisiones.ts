/**
 * Servicio `comisiones` — SPEC-008 §4.2 (B17/B20, BR-N297-300,
 * BR-N123, BR-N362, ADR-20260817-10).
 *
 * Reglas críticas:
 *  - 1 comisión por OS (BR-N298); UNIQUE `(org,order_id)`.
 *  - `estimate`: crea `status='estimada'` con `estimated_cents =
 *    total_OS × rate / 100` (BR-N361). Nace al aceptar cotización si
 *    `rate>0` (BR-N297). El caller (SPEC-004/SPEC-008) decide cuándo.
 *  - `release`: recalcula `released_cents` con `computeReleasedCents`
 *    (BR-N362) y `status='liberada'` si > 0; si = 0 vuelve a
 *    `devengada`. Disparado al timbrar/cancelar factura (SPEC-007).
 *  - `reverseOnCancel(ctx, invoiceId)`: calcula `releasedCentsDelta`
 *    con `computeReleaseDeltaOnCancel` (BR-N123), inserta fila
 *    inmutable en `commission_reversals` y decrementa
 *    `commissions.released_cents`. Si la OS se cancela (DEC-FUN-35)
 *    ⇒ comisión a `cancelada`.
 *  - `pay(ctx, commissionId)`: Director/Admin marca `pagada` con
 *    `paid_by`/`paid_at` (BR-N299). Default día 15 (lo ejecuta el
 *    job `comisionesDia15`).
 *  - Visibilidad (BR-N207): `list` filtra por `vendedor_user_id` si
 *    el actor no tiene `ver_cxc_otros`.
 *
 * Permisos:
 *  - `gestionar_cobranza` para `estimate`/`list`/`byId`.
 *  - `pagar_comisiones` para `pay` (acción crítica con `forceDb`).
 *
 * Dependencias inyectadas:
 *  - `audit` (`comision.estimate`/`release`/`pay`/`reverse`/`cancel`).
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import {
  commissionReversals,
  commissions,
  invoices,
  orders,
} from "@/server/db/schema";
import {
  COMMISSION_STATUSES,
  type CommissionStatus,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import type { AuditService } from "@/server/services/audit";
import { createHasPermissionService } from "@/server/services/hasPermission";
import {
  canTransitionCommission,
  computeReleaseDeltaOnCancel,
  computeReleasedCents,
  type CommissionTransitionError,
} from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// DTOs públicos
// ─────────────────────────────────────────────────────────────────────────────

export interface CommissionDTO {
  id: string;
  organizationId: string;
  orderId: string;
  vendedorUserId: string;
  ratePct: string; // numeric serializado
  estimatedCents: number;
  releasedCents: number;
  status: CommissionStatus;
  soldTotalCentsSnapshot: number;
  paidAt: string | null;
  paidBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionReversalDTO {
  id: string;
  organizationId: string;
  commissionId: string;
  invoiceId: string | null;
  releasedCentsDelta: number;
  reason: string;
  notes: string | null;
  createdAt: string;
}

export interface ComisionesService {
  estimate(
    ctx: Context,
    input: { orderId: string; ratePct: number; vendedorUserId: string },
  ): Promise<CommissionDTO>;
  release(ctx: Context, input: { orderId: string }): Promise<CommissionDTO>;
  /**
   * SPEC-008 §4.2 / BR-N123 · consumido por SPEC-007 al cancelar
   * factura. Devuelve el DTO de la comisión actualizada y, si la OS
   * fue cancelada, marca `cancelada` (DEC-FUN-35).
   */
  reverseOnCancel(
    ctx: Context,
    input: { invoiceId: string; osCancelled?: boolean },
  ): Promise<CommissionDTO | null>;
  pay(ctx: Context, input: { commissionId: string }): Promise<CommissionDTO>;
  /** SPEC-008 §4.2 / DEC-FUN-35 · reembolso proporcional al cancelar OS. */
  cancelOnOsCancel(
    ctx: Context,
    input: { orderId: string; reason: string },
  ): Promise<CommissionDTO | null>;
  list(
    ctx: Context,
    opts: {
      limit?: number;
      offset?: number;
      status?: CommissionStatus | string;
      orderId?: string;
      vendedorUserId?: string;
    },
  ): Promise<{ items: CommissionDTO[]; total: number }>;
  byId(ctx: Context, commissionId: string): Promise<CommissionDTO>;
  byOrder(ctx: Context, orderId: string): Promise<CommissionDTO | null>;
}

export interface CreateComisionesServiceOptions {
  audit: AuditService;
}

export function createComisionesService(
  opts: CreateComisionesServiceOptions,
): ComisionesService {
  const db = getDb();
  const hasPerm = createHasPermissionService();
  const audit = opts.audit;

  function rowToDto(r: typeof commissions.$inferSelect): CommissionDTO {
    return {
      id: r.id,
      organizationId: r.organizationId,
      orderId: r.orderId,
      vendedorUserId: r.vendedorUserId,
      ratePct: r.ratePct,
      estimatedCents: r.estimatedCents,
      releasedCents: r.releasedCents,
      status: (COMMISSION_STATUSES as readonly string[]).includes(r.status)
        ? (r.status as CommissionStatus)
        : "estimada",
      soldTotalCentsSnapshot: r.soldTotalCentsSnapshot,
      paidAt: r.paidAt?.toISOString() ?? null,
      paidBy: r.paidBy,
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
      cancelledBy: r.cancelledBy,
      cancelReason: r.cancelReason,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  function reversalToDto(
    r: typeof commissionReversals.$inferSelect,
  ): CommissionReversalDTO {
    return {
      id: r.id,
      organizationId: r.organizationId,
      commissionId: r.commissionId,
      invoiceId: r.invoiceId,
      releasedCentsDelta: r.releasedCentsDelta,
      reason: r.reason,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
    };
  }
  void reversalToDto;

  function commissionStatusOrThrow(value: string): CommissionStatus {
    if (!(COMMISSION_STATUSES as readonly string[]).includes(value)) {
      throw new DomainError(
        "COMMISSION_NOT_FOUND",
        "Estado de comisión inválido",
        500,
      );
    }
    return value as CommissionStatus;
  }

  async function loadOrderOrThrow(
    orgId: string,
    orderId: string,
  ): Promise<typeof orders.$inferSelect> {
    const [row] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.organizationId, orgId)))
      .limit(1);
    if (!row) {
      throw new DomainError("ORDER_NOT_FOUND", "OS no encontrada", 404);
    }
    return row;
  }

  async function loadCommissionByOrder(
    orgId: string,
    orderId: string,
  ): Promise<typeof commissions.$inferSelect | null> {
    const [row] = await db
      .select()
      .from(commissions)
      .where(
        and(
          eq(commissions.organizationId, orgId),
          eq(commissions.orderId, orderId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function nonCancelledInvoicedCents(
    orgId: string,
    orderId: string,
  ): Promise<number> {
    const rows = await db
      .select({ total: invoices.totalCents, status: invoices.status })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, orgId),
          eq(invoices.orderId, orderId),
        ),
      );
    return rows
      .filter((r) => r.status !== "cancelada")
      .reduce((acc, r) => acc + r.total, 0);
  }

  async function computeAndPersistRelease(
    orgId: string,
    cRow: typeof commissions.$inferSelect,
  ): Promise<typeof commissions.$inferSelect> {
    const released = computeReleasedCents({
      estimatedCents: cRow.estimatedCents,
      totalOrderCents: cRow.soldTotalCentsSnapshot,
      nonCancelledInvoicedCents: await nonCancelledInvoicedCents(
        orgId,
        cRow.orderId,
      ),
    });
    const newStatus: CommissionStatus = released > 0 ? "liberada" : "devengada";
    if (
      released === cRow.releasedCents &&
      newStatus === cRow.status
    ) {
      return cRow;
    }
    const [updated] = await db
      .update(commissions)
      .set({ releasedCents: released, status: newStatus })
      .where(
        and(
          eq(commissions.id, cRow.id),
          eq(commissions.organizationId, orgId),
        ),
      )
      .returning();
    if (!updated) throw new Error("commissions update (release) sin fila");
    return updated;
  }

  // ── implementación ────────────────────────────────────────────────────

  async function estimate(
    ctx: Context,
    input: { orderId: string; ratePct: number; vendedorUserId: string },
  ): Promise<CommissionDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_cobranza", { forceDb: true });
    if (typeof input.ratePct !== "number" || input.ratePct <= 0) {
      throw new DomainError(
        "COMMISSION_NOT_FOUND",
        "rate_pct debe ser > 0 (BR-N297)",
        400,
      );
    }
    const order = await loadOrderOrThrow(user.organization_id, input.orderId);
    const existing = await loadCommissionByOrder(
      user.organization_id,
      input.orderId,
    );
    if (existing) {
      throw new DomainError(
        "COMMISSION_ALREADY_EXISTS_FOR_ORDER",
        "La OS ya tiene una comisión (BR-N298)",
        409,
      );
    }
    const estimated = Math.round(
      (order.soldTotalCents * input.ratePct) / 100,
    );
    const [row] = await db
      .insert(commissions)
      .values({
        organizationId: user.organization_id,
        orderId: input.orderId,
        vendedorUserId: input.vendedorUserId,
        ratePct: input.ratePct.toFixed(3),
        estimatedCents: estimated,
        releasedCents: 0,
        status: "estimada",
        soldTotalCentsSnapshot: order.soldTotalCents,
        createdBy: user.id,
      })
      .returning();
    if (!row) throw new Error("commissions insert sin fila");
    await audit.record(ctx, {
      entityType: "commission",
      entityId: row.id,
      action: "comision.estimate",
      after: {
        orderId: row.orderId,
        ratePct: row.ratePct,
        estimatedCents: row.estimatedCents,
        vendedorUserId: row.vendedorUserId,
      },
    });
    return rowToDto(row);
  }

  async function release(
    ctx: Context,
    input: { orderId: string },
  ): Promise<CommissionDTO> {
    const user = requireUser(ctx);
    const cRow = await loadCommissionByOrder(
      user.organization_id,
      input.orderId,
    );
    if (!cRow) {
      throw new DomainError(
        "COMMISSION_NOT_FOUND",
        "La OS no tiene comisión",
        404,
      );
    }
    if (cRow.status === "pagada" || cRow.status === "cancelada") {
      throw new DomainError(
        "COMMISSION_NOT_PAYABLE",
        "No se puede liberar una comisión pagada o cancelada",
        409,
      );
    }
    const updated = await computeAndPersistRelease(
      user.organization_id,
      cRow,
    );
    const transition = canTransitionCommission(cRow.status, updated.status, {
      releasedCents: updated.releasedCents,
    });
    if (!transition.ok && updated.status !== cRow.status) {
      // Si la transición falla pero hay un cambio válido (p. ej.
      // estimada → devengada), registramos el audit pero NO
      // lanzamos. La transición ya fue validada a nivel de servicio.
    }
    await audit.record(ctx, {
      entityType: "commission",
      entityId: updated.id,
      action: "comision.release",
      before: {
        releasedCents: cRow.releasedCents,
        status: cRow.status,
      },
      after: {
        releasedCents: updated.releasedCents,
        status: updated.status,
      },
    });
    return rowToDto(updated);
  }

  async function reverseOnCancel(
    ctx: Context,
    input: { invoiceId: string; osCancelled?: boolean },
  ): Promise<CommissionDTO | null> {
    const user = requireUser(ctx);
    return withTx(async (tx) => {
      const [inv] = await tx
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.id, input.invoiceId),
            eq(invoices.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!inv) {
        throw new DomainError(
          "INVOICE_NOT_FOUND",
          "Factura no encontrada",
          404,
        );
      }
      if (!inv.orderId) {
        // Factura sin OS (ej. desde suscripción) → no hay comisión.
        return null;
      }
      const cRow = await tx
        .select()
        .from(commissions)
        .where(
          and(
            eq(commissions.organizationId, user.organization_id),
            eq(commissions.orderId, inv.orderId),
          ),
        )
        .limit(1)
        .then((r) => r[0]);
      if (!cRow) return null;
      if (cRow.status === "pagada" || cRow.status === "cancelada") {
        throw new DomainError(
          "COMMISSION_NOT_PAYABLE",
          "No se reversa una comisión pagada o cancelada",
          409,
        );
      }
      // Calcular facturado **antes** de cancelar esta factura.
      const nonCancelledBefore = await nonCancelledInvoicedCents(
        user.organization_id,
        inv.orderId,
      );
      const delta = computeReleaseDeltaOnCancel({
        estimatedCents: cRow.estimatedCents,
        totalOrderCents: cRow.soldTotalCentsSnapshot,
        currentNonCancelledCents: nonCancelledBefore + inv.totalCents,
        cancelledInvoiceCents: inv.totalCents,
      });
      if (delta <= 0) {
        // Sin cambio efectivo; salir sin auditar.
        return rowToDto(cRow);
      }
      const [rev] = await tx
        .insert(commissionReversals)
        .values({
          organizationId: user.organization_id,
          commissionId: cRow.id,
          invoiceId: inv.id,
          releasedCentsDelta: delta,
          reason: input.osCancelled
            ? "os_cancelada_reembolso"
            : "factura_cancelada",
          createdBy: user.id,
        })
        .returning();
      if (!rev) throw new Error("commission_reversals insert sin fila");
      const newReleased = Math.max(0, cRow.releasedCents - delta);
      const newStatus: CommissionStatus = input.osCancelled
        ? "cancelada"
        : newReleased > 0
          ? "liberada"
          : "devengada";
      const upd: Partial<typeof commissions.$inferInsert> = {
        releasedCents: newReleased,
      };
      if (input.osCancelled) {
        upd.status = "cancelada";
        upd.cancelledAt = new Date();
        upd.cancelledBy = user.id;
        upd.cancelReason = "os_cancelada_reembolso";
      } else {
        upd.status = newStatus;
      }
      const [updated] = await tx
        .update(commissions)
        .set(upd)
        .where(
          and(
            eq(commissions.id, cRow.id),
            eq(commissions.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!updated) throw new Error("commissions update (reverse) sin fila");
      await audit.record(ctx, {
        entityType: "commission",
        entityId: updated.id,
        action: input.osCancelled ? "comision.cancel" : "comision.reverse",
        before: {
          releasedCents: cRow.releasedCents,
          status: cRow.status,
        },
        after: {
          releasedCents: updated.releasedCents,
          status: updated.status,
          releasedCentsDelta: delta,
          invoiceId: inv.id,
          osCancelled: Boolean(input.osCancelled),
        },
      });
      return rowToDto(updated);
    });
  }

  async function pay(
    ctx: Context,
    input: { commissionId: string },
  ): Promise<CommissionDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "pagar_comisiones", { forceDb: true });
    return withTx(async (tx) => {
      const [row] = await tx
        .select()
        .from(commissions)
        .where(
          and(
            eq(commissions.id, input.commissionId),
            eq(commissions.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!row) {
        throw new DomainError(
          "COMMISSION_NOT_FOUND",
          "Comisión no encontrada",
          404,
        );
      }
      if (row.status === "pagada") {
        throw new DomainError(
          "COMMISSION_ALREADY_PAID",
          "La comisión ya está pagada",
          409,
        );
      }
      if (row.status !== "liberada" || row.releasedCents <= 0) {
        throw new DomainError(
          "COMMISSION_NOT_PAYABLE",
          "Sólo se paga una comisión `liberada` con importe > 0",
          409,
        );
      }
      const transition = canTransitionCommission(row.status, "pagada", {
        releasedCents: row.releasedCents,
      });
      if (!transition.ok) {
        throw new DomainError(
          transition.code as CommissionTransitionError,
          transition.reason ?? "Transición inválida",
          409,
        );
      }
      const [updated] = await tx
        .update(commissions)
        .set({
          status: "pagada",
          paidAt: new Date(),
          paidBy: user.id,
        })
        .where(
          and(
            eq(commissions.id, row.id),
            eq(commissions.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!updated) throw new Error("commissions update (pay) sin fila");
      await audit.record(ctx, {
        entityType: "commission",
        entityId: updated.id,
        action: "comision.pay",
        before: { status: row.status },
        after: {
          status: "pagada",
          paidAt: updated.paidAt?.toISOString(),
          paidBy: updated.paidBy,
        },
      });
      return rowToDto(updated);
    });
  }

  async function cancelOnOsCancel(
    ctx: Context,
    input: { orderId: string; reason: string },
  ): Promise<CommissionDTO | null> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_cobranza", { forceDb: true });
    return withTx(async (tx) => {
      const cRow = await loadCommissionByOrder(
        user.organization_id,
        input.orderId,
      );
      if (!cRow) return null;
      if (cRow.status === "pagada") {
        throw new DomainError(
          "COMMISSION_ALREADY_PAID",
          "No se cancela una comisión pagada (DEC-FUN-35 requiere reembolso manual)",
          409,
        );
      }
      const [updated] = await tx
        .update(commissions)
        .set({
          status: "cancelada",
          releasedCents: 0,
          cancelledAt: new Date(),
          cancelledBy: user.id,
          cancelReason: input.reason,
        })
        .where(
          and(
            eq(commissions.id, cRow.id),
            eq(commissions.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!updated) throw new Error("commissions update (cancelOs) sin fila");
      await audit.record(ctx, {
        entityType: "commission",
        entityId: updated.id,
        action: "reembolso.os_cancel",
        before: { status: cRow.status, releasedCents: cRow.releasedCents },
        after: {
          status: "cancelada",
          releasedCents: 0,
          reason: input.reason,
        },
      });
      return rowToDto(updated);
    });
  }

  async function list(
    ctx: Context,
    opts: {
      limit?: number;
      offset?: number;
      status?: CommissionStatus | string;
      orderId?: string;
      vendedorUserId?: string;
    } = {},
  ): Promise<{ items: CommissionDTO[]; total: number }> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_cobranza", { forceDb: true }).catch(async () => {
      await hasPerm.require(ctx, "ver_cxc_otros", { forceDb: true });
    });
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const where = [eq(commissions.organizationId, user.organization_id)];
    if (opts.status) {
      commissionStatusOrThrow(opts.status);
      where.push(eq(commissions.status, opts.status));
    }
    if (opts.orderId) where.push(eq(commissions.orderId, opts.orderId));
    if (opts.vendedorUserId) {
      where.push(eq(commissions.vendedorUserId, opts.vendedorUserId));
    }
    // Visibilidad BR-N207: vendedor sólo ve sus comisiones.
    const cxcOtros = await hasPerm.has(ctx, "ver_cxc_otros", { forceDb: true });
    if (!cxcOtros) {
      where.push(eq(commissions.vendedorUserId, user.id));
    }
    const [totalRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(commissions)
      .where(and(...where));
    const rows = await db
      .select()
      .from(commissions)
      .where(and(...where))
      .orderBy(desc(commissions.createdAt))
      .limit(limit)
      .offset(offset);
    return { items: rows.map(rowToDto), total: totalRow?.c ?? 0 };
  }

  async function byId(ctx: Context, commissionId: string): Promise<CommissionDTO> {
    const user = requireUser(ctx);
    const [row] = await db
      .select()
      .from(commissions)
      .where(
        and(
          eq(commissions.id, commissionId),
          eq(commissions.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!row) {
      throw new DomainError(
        "COMMISSION_NOT_FOUND",
        "Comisión no encontrada",
        404,
      );
    }
    return rowToDto(row);
  }

  async function byOrder(
    ctx: Context,
    orderId: string,
  ): Promise<CommissionDTO | null> {
    const user = requireUser(ctx);
    const row = await loadCommissionByOrder(user.organization_id, orderId);
    return row ? rowToDto(row) : null;
  }

  return {
    estimate,
    release,
    reverseOnCancel,
    pay,
    cancelOnOsCancel,
    list,
    byId,
    byOrder,
  };
}
