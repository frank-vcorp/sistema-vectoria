/**
 * Servicio `transactions` — SPEC-009 §4.2 (B21, BR-013/N329/N331/N332).
 *
 * Reglas críticas:
 *  - `borrador → confirmado → conciliado` (BR-013: conciliado
 *    inmutable; correcciones por reverso con motivo ≥3 chars).
 *  - `cancelado` y `reversado` son terminales; `reversado` exige
 *    motivo (BR-N329/014).
 *  - Tipo `transferencia` siempre es no operativo (BR-N326); tipo
 *    `capital` también (BR-N327/328). El helper
 *    `validateSubKind` valida que `sub_kind` aplique al tipo.
 *  - Vínculos opcionales: `linked_payment_id` (reservado para
 *    SPEC-008), `linked_commission_id`, `linked_order_id`,
 *    `project_id`.
 *
 * Permisos:
 *  - `gestionar_finanzas` para record/confirm/reconcile/reverse.
 *  - Acciones críticas (`confirm`, `reconcile`, `reverse`) con
 *    `forceDb: true` (AC-81).
 *
 * Visibilidad BR-N207/208:
 *  - `list` filtra por permisos `ver_finanzas` o `ver_costos`.
 *
 * P-009-1 cerrado en `none`: este turno NO siembra cuentas seed. El
 * Director las crea desde la UI (`accounts.create`). Documentado
 * en IMPL-REPORT-009.
 */
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import {
  accounts,
  commissions,
  directCosts,
  orders,
  payments,
  projects,
  transactions,
  transfers,
} from "@/server/db/schema";
import {
  ACCOUNT_TYPES,
  NON_OPERATIVE_KINDS,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  type AccountType,
  type NonOperativeKind,
  type TransactionStatus,
  type TransactionType,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import type { AuditService } from "@/server/services/audit";
import { createHasPermissionService } from "@/server/services/hasPermission";
import {
  buildProjectCostSummary,
  buildProjectFinancialReport,
  canTransitionTransaction,
  computeAccountBalance,
  computeDirectCost,
  computeLaborCost,
  computeOsOutstandingBalance,
  isReconciledImmutably,
  validateSubKind,
  type ProjectCostSummary,
  type ProjectFinancialReport,
  type AccountBalance,
} from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountDTO {
  id: string;
  organizationId: string;
  name: string;
  type: AccountType;
  currency: string;
  openingBalanceCents: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionDTO {
  id: string;
  organizationId: string;
  accountId: string;
  type: TransactionType;
  amountCents: number;
  status: TransactionStatus;
  subKind: NonOperativeKind | null;
  operationDate: string;
  dueDate: string | null;
  paidDate: string | null;
  linkedPaymentId: string | null;
  linkedCommissionId: string | null;
  linkedOrderId: string | null;
  projectId: string | null;
  transferId: string | null;
  reason: string | null;
  reconciledAt: string | null;
  reversedAt: string | null;
  reversedReason: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  confirmedAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface TransferDTO {
  id: string;
  organizationId: string;
  outTransactionId: string;
  inTransactionId: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface DirectCostDTO {
  id: string;
  organizationId: string;
  projectId: string;
  transactionId: string;
  amountCents: number;
  description: string | null;
  confirmedOrConciliated: string;
  createdBy: string | null;
  createdAt: string;
}

export interface FinancesService {
  // Cuentas
  createAccount(
    ctx: Context,
    input: {
      name: string;
      type: AccountType | string;
      currency?: string;
      openingBalanceCents?: number;
    },
  ): Promise<AccountDTO>;
  listAccounts(
    ctx: Context,
    opts: { active?: boolean | null; limit?: number; offset?: number },
  ): Promise<{ items: AccountDTO[]; total: number }>;
  // Movimientos
  recordTransaction(
    ctx: Context,
    input: {
      accountId: string;
      type: TransactionType | string;
      amountCents: number;
      subKind?: NonOperativeKind | string | null;
      operationDate: Date | string;
      dueDate?: Date | string | null;
      paidDate?: Date | string | null;
      linkedPaymentId?: string | null;
      linkedCommissionId?: string | null;
      linkedOrderId?: string | null;
      projectId?: string | null;
      reason?: string | null;
    },
  ): Promise<TransactionDTO>;
  confirmTransaction(ctx: Context, input: { transactionId: string }): Promise<TransactionDTO>;
  reconcileTransaction(ctx: Context, input: { transactionId: string }): Promise<TransactionDTO>;
  cancelTransaction(
    ctx: Context,
    input: { transactionId: string; reason: string },
  ): Promise<TransactionDTO>;
  reverseTransaction(
    ctx: Context,
    input: { transactionId: string; reason: string },
  ): Promise<TransactionDTO>;
  listTransactions(
    ctx: Context,
    opts: {
      limit?: number;
      offset?: number;
      status?: TransactionStatus | string;
      type?: TransactionType | string;
      accountId?: string;
      projectId?: string;
      orderId?: string;
      dateFrom?: Date | string;
      dateTo?: Date | string;
    },
  ): Promise<{ items: TransactionDTO[]; total: number }>;
  byId(ctx: Context, transactionId: string): Promise<TransactionDTO>;
  // Transferencias
  createTransfer(
    ctx: Context,
    input: {
      fromAccountId: string;
      toAccountId: string;
      amountCents: number;
      operationDate: Date | string;
      note?: string | null;
    },
  ): Promise<{ transfer: TransferDTO; out: TransactionDTO; in: TransactionDTO }>;
  // Costos directos
  imputeDirectCost(
    ctx: Context,
    input: { projectId: string; transactionId: string; description?: string | null },
  ): Promise<DirectCostDTO>;
  listDirectCosts(
    ctx: Context,
    opts: { projectId?: string; limit?: number; offset?: number },
  ): Promise<{ items: DirectCostDTO[]; total: number }>;
  // Reportes / finanzas
  accountBalance(ctx: Context, accountId: string): Promise<AccountBalance>;
  projectCostSummary(ctx: Context, projectId: string): Promise<ProjectCostSummary>;
  projectFinancialReport(
    ctx: Context,
    projectId: string,
  ): Promise<ProjectFinancialReport>;
  osOutstandingBalance(
    ctx: Context,
    orderId: string,
  ): Promise<{ orderId: string; outstandingCents: number; components: ReturnType<typeof computeOsOutstandingBalance>; }>;
}

export interface CreateFinancesServiceOptions {
  audit: AuditService;
}

export function createFinancesService(opts: CreateFinancesServiceOptions): FinancesService {
  const db = getDb();
  const hasPerm = createHasPermissionService();
  const audit = opts.audit;

  // ── helpers ────────────────────────────────────────────────────────────

  function accountToDto(r: typeof accounts.$inferSelect): AccountDTO {
    return {
      id: r.id,
      organizationId: r.organizationId,
      name: r.name,
      type: (ACCOUNT_TYPES as readonly string[]).includes(r.type)
        ? (r.type as AccountType)
        : "activo",
      currency: r.currency,
      openingBalanceCents: r.openingBalanceCents,
      active: r.active,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  function txToDto(r: typeof transactions.$inferSelect): TransactionDTO {
    return {
      id: r.id,
      organizationId: r.organizationId,
      accountId: r.accountId,
      type: (TRANSACTION_TYPES as readonly string[]).includes(r.type)
        ? (r.type as TransactionType)
        : "ingreso",
      amountCents: r.amountCents,
      status: (TRANSACTION_STATUSES as readonly string[]).includes(r.status)
        ? (r.status as TransactionStatus)
        : "borrador",
      subKind: r.subKind && (NON_OPERATIVE_KINDS as readonly string[]).includes(r.subKind)
        ? (r.subKind as NonOperativeKind)
        : null,
      operationDate:
        typeof r.operationDate === "string"
          ? r.operationDate
          : new Date(r.operationDate).toISOString().slice(0, 10),
      dueDate: r.dueDate
        ? typeof r.dueDate === "string"
          ? r.dueDate
          : new Date(r.dueDate).toISOString().slice(0, 10)
        : null,
      paidDate: r.paidDate
        ? typeof r.paidDate === "string"
          ? r.paidDate
          : new Date(r.paidDate).toISOString().slice(0, 10)
        : null,
      linkedPaymentId: r.linkedPaymentId,
      linkedCommissionId: r.linkedCommissionId,
      linkedOrderId: r.linkedOrderId,
      projectId: r.projectId,
      transferId: r.transferId,
      reason: r.reason,
      reconciledAt: r.reconciledAt?.toISOString() ?? null,
      reversedAt: r.reversedAt?.toISOString() ?? null,
      reversedReason: r.reversedReason,
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
      cancelReason: r.cancelReason,
      confirmedAt: r.confirmedAt?.toISOString() ?? null,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    };
  }

  function transferToDto(r: typeof transfers.$inferSelect): TransferDTO {
    return {
      id: r.id,
      organizationId: r.organizationId,
      outTransactionId: r.outTransactionId,
      inTransactionId: r.inTransactionId,
      note: r.note,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    };
  }

  function directCostToDto(r: typeof directCosts.$inferSelect): DirectCostDTO {
    return {
      id: r.id,
      organizationId: r.organizationId,
      projectId: r.projectId,
      transactionId: r.transactionId,
      amountCents: r.amountCents,
      description: r.description,
      confirmedOrConciliated: r.confirmedOrConciliated,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async function loadAccountOrThrow(orgId: string, accountId: string) {
    const [row] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.organizationId, orgId)))
      .limit(1);
    if (!row) {
      throw new DomainError("ACCOUNT_NOT_FOUND", "Cuenta no encontrada", 404);
    }
    if (!row.active) {
      throw new DomainError("ACCOUNT_INACTIVE", "Cuenta inactiva", 409);
    }
    return row;
  }

  // ── cuentas ────────────────────────────────────────────────────────────

  async function createAccount(
    ctx: Context,
    input: {
      name: string;
      type: AccountType | string;
      currency?: string;
      openingBalanceCents?: number;
    },
  ): Promise<AccountDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_finanzas", { forceDb: true });
    if (!input.name || input.name.trim().length === 0) {
      throw new DomainError("ACCOUNT_NOT_FOUND", "Nombre requerido", 400);
    }
    if (!(ACCOUNT_TYPES as readonly string[]).includes(input.type)) {
      throw new DomainError("ACCOUNT_NOT_FOUND", "Tipo de cuenta inválido", 400);
    }
    const [row] = await db
      .insert(accounts)
      .values({
        organizationId: user.organization_id,
        name: input.name.trim(),
        type: input.type,
        currency: input.currency ?? "MXN",
        openingBalanceCents: input.openingBalanceCents ?? 0,
        createdBy: user.id,
      })
      .returning();
    if (!row) throw new Error("accounts insert sin fila");
    await audit.record(ctx, {
      entityType: "account",
      entityId: row.id,
      action: "cuenta.create",
      after: {
        name: row.name,
        type: row.type,
        currency: row.currency,
        openingBalanceCents: row.openingBalanceCents,
      },
    });
    return accountToDto(row);
  }

  async function listAccounts(
    ctx: Context,
    opts: { active?: boolean | null; limit?: number; offset?: number } = {},
  ): Promise<{ items: AccountDTO[]; total: number }> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_finanzas", { forceDb: true }).catch(async () => {
      await hasPerm.require(ctx, "ver_finanzas", { forceDb: true });
    });
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const where = [eq(accounts.organizationId, user.organization_id)];
    if (opts.active === true) where.push(eq(accounts.active, true));
    if (opts.active === false) where.push(eq(accounts.active, false));
    const [totalRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(accounts)
      .where(and(...where));
    const rows = await db
      .select()
      .from(accounts)
      .where(and(...where))
      .orderBy(asc(accounts.name))
      .limit(limit)
      .offset(offset);
    return { items: rows.map(accountToDto), total: totalRow?.c ?? 0 };
  }

  // ── movimientos ────────────────────────────────────────────────────────

  async function recordTransaction(
    ctx: Context,
    input: {
      accountId: string;
      type: TransactionType | string;
      amountCents: number;
      subKind?: NonOperativeKind | string | null;
      operationDate: Date | string;
      dueDate?: Date | string | null;
      paidDate?: Date | string | null;
      linkedPaymentId?: string | null;
      linkedCommissionId?: string | null;
      linkedOrderId?: string | null;
      projectId?: string | null;
      reason?: string | null;
    },
  ): Promise<TransactionDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_finanzas", { forceDb: true });
    if (typeof input.amountCents !== "number" || input.amountCents === 0) {
      throw new DomainError("TRANSACTION_NOT_FOUND", "Monto debe ser ≠ 0", 400);
    }
    if (!(TRANSACTION_TYPES as readonly string[]).includes(input.type)) {
      throw new DomainError("TRANSACTION_NOT_FOUND", "Tipo de movimiento inválido", 400);
    }
    const subKind = input.subKind ?? null;
    const sub = validateSubKind({ type: input.type, subKind });
    if (!sub.ok) {
      throw new DomainError("INVALID_SUB_KIND" as never, sub.reason, 400);
    }
    await loadAccountOrThrow(user.organization_id, input.accountId);
    if (input.linkedOrderId) {
      const [o] = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, input.linkedOrderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!o) {
        throw new DomainError("ORDER_NOT_FOUND", "OS no encontrada", 404);
      }
    }
    if (input.projectId) {
      const [p] = await db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!p) {
        throw new DomainError("PROJECT_NOT_FOUND", "Proyecto no encontrado", 404);
      }
    }
    if (input.linkedPaymentId) {
      const [pay] = await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.id, input.linkedPaymentId),
            eq(payments.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!pay) {
        throw new DomainError("PAYMENT_NOT_FOUND", "Cobro no encontrado", 404);
      }
    }
    if (input.linkedCommissionId) {
      const [c] = await db
        .select()
        .from(commissions)
        .where(
          and(
            eq(commissions.id, input.linkedCommissionId),
            eq(commissions.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!c) {
        throw new DomainError("COMMISSION_NOT_FOUND", "Comisión no encontrada", 404);
      }
    }
    const opDate =
      typeof input.operationDate === "string"
        ? input.operationDate
        : input.operationDate.toISOString().slice(0, 10);
    const [row] = await db
      .insert(transactions)
      .values({
        organizationId: user.organization_id,
        accountId: input.accountId,
        type: input.type,
        amountCents: input.amountCents,
        status: "borrador",
        subKind: subKind,
        operationDate: opDate,
        dueDate: input.dueDate
          ? typeof input.dueDate === "string"
            ? input.dueDate
            : input.dueDate.toISOString().slice(0, 10)
          : null,
        paidDate: input.paidDate
          ? typeof input.paidDate === "string"
            ? input.paidDate
            : input.paidDate.toISOString().slice(0, 10)
          : null,
        linkedPaymentId: input.linkedPaymentId ?? null,
        linkedCommissionId: input.linkedCommissionId ?? null,
        linkedOrderId: input.linkedOrderId ?? null,
        projectId: input.projectId ?? null,
        reason: input.reason ?? null,
        createdBy: user.id,
      })
      .returning();
    if (!row) throw new Error("transactions insert sin fila");
    await audit.record(ctx, {
      entityType: "transaction",
      entityId: row.id,
      action: "movimiento.record",
      after: {
        accountId: row.accountId,
        type: row.type,
        amountCents: row.amountCents,
        subKind: row.subKind,
        operationDate: row.operationDate,
        status: "borrador",
      },
    });
    return txToDto(row);
  }

  async function confirmTransaction(
    ctx: Context,
    input: { transactionId: string },
  ): Promise<TransactionDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_finanzas", { forceDb: true });
    return withTx(async (tx) => {
      const [row] = await tx
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.id, input.transactionId),
            eq(transactions.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!row) {
        throw new DomainError("TRANSACTION_NOT_FOUND", "Movimiento no encontrado", 404);
      }
      if (isReconciledImmutably(row.status)) {
        throw new DomainError(
          "RECONCILED_IMMUTABLE",
          "conciliado no se edita (BR-013)",
          409,
        );
      }
      const transition = canTransitionTransaction(row.status, "confirmado");
      if (!transition.ok) {
        throw new DomainError(
          transition.code as never,
          transition.reason ?? "Transición inválida",
          409,
        );
      }
      const [updated] = await tx
        .update(transactions)
        .set({ status: "confirmado", confirmedAt: new Date(), confirmedBy: user.id })
        .where(
          and(
            eq(transactions.id, row.id),
            eq(transactions.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!updated) throw new Error("transactions update (confirm) sin fila");
      await audit.record(ctx, {
        entityType: "transaction",
        entityId: updated.id,
        action: "movimiento.confirm",
        before: { status: row.status },
        after: { status: "confirmado", confirmedAt: updated.confirmedAt?.toISOString() },
      });
      return txToDto(updated);
    });
  }

  async function reconcileTransaction(
    ctx: Context,
    input: { transactionId: string },
  ): Promise<TransactionDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_finanzas", { forceDb: true });
    return withTx(async (tx) => {
      const [row] = await tx
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.id, input.transactionId),
            eq(transactions.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!row) {
        throw new DomainError("TRANSACTION_NOT_FOUND", "Movimiento no encontrado", 404);
      }
      const transition = canTransitionTransaction(row.status, "conciliado");
      if (!transition.ok) {
        throw new DomainError(
          transition.code as never,
          transition.reason ?? "Transición inválida",
          409,
        );
      }
      const [updated] = await tx
        .update(transactions)
        .set({ status: "conciliado", reconciledAt: new Date(), reconciledBy: user.id })
        .where(
          and(
            eq(transactions.id, row.id),
            eq(transactions.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!updated) throw new Error("transactions update (reconcile) sin fila");
      await audit.record(ctx, {
        entityType: "transaction",
        entityId: updated.id,
        action: "movimiento.reconcile",
        before: { status: row.status },
        after: { status: "conciliado", reconciledAt: updated.reconciledAt?.toISOString() },
      });
      return txToDto(updated);
    });
  }

  async function cancelTransaction(
    ctx: Context,
    input: { transactionId: string; reason: string },
  ): Promise<TransactionDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_finanzas", { forceDb: true });
    return withTx(async (tx) => {
      const [row] = await tx
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.id, input.transactionId),
            eq(transactions.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!row) {
        throw new DomainError("TRANSACTION_NOT_FOUND", "Movimiento no encontrado", 404);
      }
      const transition = canTransitionTransaction(row.status, "cancelado", {
        cancelReason: input.reason,
      });
      if (!transition.ok) {
        throw new DomainError(
          transition.code as never,
          transition.reason ?? "Transición inválida",
          409,
        );
      }
      const [updated] = await tx
        .update(transactions)
        .set({ status: "cancelado", cancelledAt: new Date(), cancelledBy: user.id, cancelReason: input.reason })
        .where(
          and(
            eq(transactions.id, row.id),
            eq(transactions.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!updated) throw new Error("transactions update (cancel) sin fila");
      await audit.record(ctx, {
        entityType: "transaction",
        entityId: updated.id,
        action: "movimiento.cancel",
        before: { status: row.status },
        after: { status: "cancelado", reason: input.reason },
      });
      return txToDto(updated);
    });
  }

  async function reverseTransaction(
    ctx: Context,
    input: { transactionId: string; reason: string },
  ): Promise<TransactionDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_finanzas", { forceDb: true });
    return withTx(async (tx) => {
      const [row] = await tx
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.id, input.transactionId),
            eq(transactions.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!row) {
        throw new DomainError("TRANSACTION_NOT_FOUND", "Movimiento no encontrado", 404);
      }
      const transition = canTransitionTransaction(row.status, "reversado", {
        reverseReason: input.reason,
      });
      if (!transition.ok) {
        throw new DomainError(
          transition.code as never,
          transition.reason ?? "Transición inválida",
          409,
        );
      }
      const [updated] = await tx
        .update(transactions)
        .set({ status: "reversado", reversedAt: new Date(), reversedBy: user.id, reversedReason: input.reason })
        .where(
          and(
            eq(transactions.id, row.id),
            eq(transactions.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!updated) throw new Error("transactions update (reverse) sin fila");
      await audit.record(ctx, {
        entityType: "transaction",
        entityId: updated.id,
        action: "movimiento.reverse",
        before: { status: row.status },
        after: { status: "reversado", reason: input.reason },
      });
      return txToDto(updated);
    });
  }

  async function listTransactions(
    ctx: Context,
    opts: {
      limit?: number;
      offset?: number;
      status?: TransactionStatus | string;
      type?: TransactionType | string;
      accountId?: string;
      projectId?: string;
      orderId?: string;
      dateFrom?: Date | string;
      dateTo?: Date | string;
    } = {},
  ): Promise<{ items: TransactionDTO[]; total: number }> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_finanzas", { forceDb: true }).catch(async () => {
      await hasPerm.require(ctx, "ver_finanzas", { forceDb: true });
    });
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const where = [eq(transactions.organizationId, user.organization_id)];
    if (opts.status) where.push(eq(transactions.status, opts.status));
    if (opts.type) where.push(eq(transactions.type, opts.type));
    if (opts.accountId) where.push(eq(transactions.accountId, opts.accountId));
    if (opts.projectId) where.push(eq(transactions.projectId, opts.projectId));
    if (opts.orderId) where.push(eq(transactions.linkedOrderId, opts.orderId));
    if (opts.dateFrom) {
      const from = typeof opts.dateFrom === "string" ? opts.dateFrom : opts.dateFrom.toISOString().slice(0, 10);
      where.push(gte(transactions.operationDate, from));
    }
    if (opts.dateTo) {
      const to = typeof opts.dateTo === "string" ? opts.dateTo : opts.dateTo.toISOString().slice(0, 10);
      where.push(lte(transactions.operationDate, to));
    }
    const [totalRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(transactions)
      .where(and(...where));
    const rows = await db
      .select()
      .from(transactions)
      .where(and(...where))
      .orderBy(desc(transactions.operationDate), desc(transactions.createdAt))
      .limit(limit)
      .offset(offset);
    return { items: rows.map(txToDto), total: totalRow?.c ?? 0 };
  }

  async function byId(ctx: Context, transactionId: string): Promise<TransactionDTO> {
    const user = requireUser(ctx);
    const [row] = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!row) {
      throw new DomainError("TRANSACTION_NOT_FOUND", "Movimiento no encontrado", 404);
    }
    return txToDto(row);
  }

  // ── transferencias ────────────────────────────────────────────────────

  async function createTransfer(
    ctx: Context,
    input: {
      fromAccountId: string;
      toAccountId: string;
      amountCents: number;
      operationDate: Date | string;
      note?: string | null;
    },
  ): Promise<{ transfer: TransferDTO; out: TransactionDTO; in: TransactionDTO }> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_finanzas", { forceDb: true });
    if (typeof input.amountCents !== "number" || input.amountCents <= 0) {
      throw new DomainError("TRANSFER_NOT_FOUND", "Monto debe ser > 0", 400);
    }
    if (input.fromAccountId === input.toAccountId) {
      throw new DomainError(
        "TRANSFER_INVALID_PAIR",
        "Cuenta origen y destino deben ser distintas",
        400,
      );
    }
    await loadAccountOrThrow(user.organization_id, input.fromAccountId);
    await loadAccountOrThrow(user.organization_id, input.toAccountId);
    return withTx(async (tx) => {
      const opDate =
        typeof input.operationDate === "string"
          ? input.operationDate
          : input.operationDate.toISOString().slice(0, 10);
      // 1) Crear la pata de salida (monto negativo).
      const [outRow] = await tx
        .insert(transactions)
        .values({
          organizationId: user.organization_id,
          accountId: input.fromAccountId,
          type: "transferencia",
          amountCents: -Math.abs(input.amountCents),
          status: "confirmado",
          subKind: "transferencia_interna",
          operationDate: opDate,
          reason: input.note ?? null,
          confirmedAt: new Date(),
          confirmedBy: user.id,
          createdBy: user.id,
        })
        .returning();
      if (!outRow) throw new Error("transactions insert (out) sin fila");
      // 2) Crear la pata de entrada (monto positivo).
      const [inRow] = await tx
        .insert(transactions)
        .values({
          organizationId: user.organization_id,
          accountId: input.toAccountId,
          type: "transferencia",
          amountCents: Math.abs(input.amountCents),
          status: "confirmado",
          subKind: "transferencia_interna",
          operationDate: opDate,
          reason: input.note ?? null,
          confirmedAt: new Date(),
          confirmedBy: user.id,
          createdBy: user.id,
        })
        .returning();
      if (!inRow) throw new Error("transactions insert (in) sin fila");
      // 3) Crear el registro `transfers` que las une.
      const [tRow] = await tx
        .insert(transfers)
        .values({
          organizationId: user.organization_id,
          outTransactionId: outRow.id,
          inTransactionId: inRow.id,
          note: input.note ?? null,
          createdBy: user.id,
        })
        .returning();
      if (!tRow) throw new Error("transfers insert sin fila");
      // 4) Cerrar el ciclo: poner `transferId` en ambas transactions.
      await tx
        .update(transactions)
        .set({ transferId: tRow.id })
        .where(eq(transactions.id, outRow.id));
      await tx
        .update(transactions)
        .set({ transferId: tRow.id })
        .where(eq(transactions.id, inRow.id));
      // 5) Audit.
      await audit.record(ctx, {
        entityType: "transfer",
        entityId: tRow.id,
        action: "transferencia.create",
        after: {
          outTransactionId: outRow.id,
          inTransactionId: inRow.id,
          amountCents: input.amountCents,
          operationDate: opDate,
        },
      });
      return {
        transfer: transferToDto(tRow),
        out: txToDto({ ...outRow, transferId: tRow.id }),
        in: txToDto({ ...inRow, transferId: tRow.id }),
      };
    });
  }

  // ── costos directos ───────────────────────────────────────────────────

  async function imputeDirectCost(
    ctx: Context,
    input: { projectId: string; transactionId: string; description?: string | null },
  ): Promise<DirectCostDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_finanzas", { forceDb: true });
    const [txRow] = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, input.transactionId),
          eq(transactions.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!txRow) {
      throw new DomainError("TRANSACTION_NOT_FOUND", "Movimiento no encontrado", 404);
    }
    if (txRow.type !== "gasto") {
      throw new DomainError(
        "COST_NOT_CONFIRMED",
        "Sólo se imputan gastos al proyecto (BR-N333)",
        409,
      );
    }
    if (txRow.status !== "confirmado" && txRow.status !== "conciliado") {
      throw new DomainError(
        "COST_NOT_CONFIRMED",
        "Sólo se imputa con movimiento confirmado o conciliado (BR-N333)",
        409,
      );
    }
    const [p] = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, input.projectId),
          eq(projects.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!p) {
      throw new DomainError("PROJECT_NOT_FOUND", "Proyecto no encontrado", 404);
    }
    const amount = Math.abs(txRow.amountCents);
    const confirmedFlag = "true";
    const [row] = await db
      .insert(directCosts)
      .values({
        organizationId: user.organization_id,
        projectId: input.projectId,
        transactionId: input.transactionId,
        amountCents: amount,
        description: input.description ?? null,
        confirmedOrConciliated: confirmedFlag,
        createdBy: user.id,
      })
      .returning();
    if (!row) throw new Error("direct_costs insert sin fila");
    await audit.record(ctx, {
      entityType: "direct_cost",
      entityId: row.id,
      action: "costo_directo.imputar",
      after: {
        projectId: row.projectId,
        transactionId: row.transactionId,
        amountCents: row.amountCents,
        confirmedOrConciliated: row.confirmedOrConciliated,
      },
    });
    return directCostToDto(row);
  }

  async function listDirectCosts(
    ctx: Context,
    opts: { projectId?: string; limit?: number; offset?: number } = {},
  ): Promise<{ items: DirectCostDTO[]; total: number }> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "ver_finanzas", { forceDb: true }).catch(async () => {
      await hasPerm.require(ctx, "ver_costos", { forceDb: true });
    });
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const where = [eq(directCosts.organizationId, user.organization_id)];
    if (opts.projectId) where.push(eq(directCosts.projectId, opts.projectId));
    const [totalRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(directCosts)
      .where(and(...where));
    const rows = await db
      .select()
      .from(directCosts)
      .where(and(...where))
      .orderBy(desc(directCosts.createdAt))
      .limit(limit)
      .offset(offset);
    return { items: rows.map(directCostToDto), total: totalRow?.c ?? 0 };
  }

  // ── reportes ──────────────────────────────────────────────────────────

  async function accountBalance(ctx: Context, accountId: string): Promise<AccountBalance> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "ver_finanzas", { forceDb: true }).catch(async () => {
      await hasPerm.require(ctx, "gestionar_finanzas", { forceDb: true });
    });
    const [acc] = await db
      .select()
      .from(accounts)
      .where(
        and(eq(accounts.id, accountId), eq(accounts.organizationId, user.organization_id)),
      )
      .limit(1);
    if (!acc) {
      throw new DomainError("ACCOUNT_NOT_FOUND", "Cuenta no encontrada", 404);
    }
    const rows = await db
      .select({
        accountId: transactions.accountId,
        type: transactions.type,
        amountCents: transactions.amountCents,
        status: transactions.status,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.organizationId, user.organization_id),
          eq(transactions.accountId, accountId),
        ),
      );
    const summary = computeAccountBalance({
      openingCents: acc.openingBalanceCents,
      transactions: rows,
    });
    return { ...summary, accountId: acc.id };
  }

  async function projectCostSummary(ctx: Context, projectId: string): Promise<ProjectCostSummary> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "ver_costos", { forceDb: true }).catch(async () => {
      await hasPerm.require(ctx, "ver_finanzas", { forceDb: true });
    });
    const [p] = await db
      .select({ orderId: projects.orderId })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!p) {
      throw new DomainError("PROJECT_NOT_FOUND", "Proyecto no encontrado", 404);
    }
    // Costos directos (sólo transacciones confirmadas/conciliadas).
    const dcRows = await db
      .select({ amount: directCosts.amountCents })
      .from(directCosts)
      .where(
        and(
          eq(directCosts.organizationId, user.organization_id),
          eq(directCosts.projectId, projectId),
          eq(directCosts.confirmedOrConciliated, "true"),
        ),
      );
    const directCostCents = computeDirectCost(
      dcRows.map((r) => ({ amountCents: r.amount })),
    );
    // Costo laboral: leemos `time_entries` por proyecto (snapshot
    // inmutable del costo por hora, BR-N334).
    const { timeEntries } = await import("@/server/db/schema");
    const teRows = await db
      .select({
        userId: timeEntries.userId,
        projectId: timeEntries.projectId,
        hours: timeEntries.hours,
        costPerHourCents: timeEntries.costPerHourCents,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.organizationId, user.organization_id),
          eq(timeEntries.projectId, projectId),
        ),
      );
    const teForHelper = teRows.map((r) => ({
      userId: r.userId,
      projectId: r.projectId,
      hours: Number(r.hours),
      costPerHourCents: r.costPerHourCents,
    }));
    const { total: laborCostCents } = computeLaborCost(teForHelper);
    // `sold_total_cents` viene de la OS del proyecto.
    const { orders: ordersTbl } = await import("@/server/db/schema");
    const [order] = await db
      .select({ soldTotalCents: ordersTbl.soldTotalCents })
      .from(ordersTbl)
      .where(
        and(
          eq(ordersTbl.organizationId, user.organization_id),
          eq(ordersTbl.id, p.orderId),
        ),
      )
      .limit(1);
    const sold = order ? order.soldTotalCents : null;
    return buildProjectCostSummary({
      projectId,
      laborCostCents,
      directCostCents,
      soldTotalCents: sold,
      timeEntries: teForHelper,
    });
  }

  async function projectFinancialReport(
    ctx: Context,
    projectId: string,
  ): Promise<ProjectFinancialReport> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "ver_finanzas", { forceDb: true });
    const { orders: ordersTbl, invoices: invoicesTbl, paymentApplications: appTbl, payments: paymentsTbl } =
      await import("@/server/db/schema");
    const [project] = await db
      .select({ orderId: projects.orderId })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!project) {
      throw new DomainError("PROJECT_NOT_FOUND", "Proyecto no encontrado", 404);
    }
    const [order] = await db
      .select({ soldTotalCents: ordersTbl.soldTotalCents })
      .from(ordersTbl)
      .where(
        and(
          eq(ordersTbl.organizationId, user.organization_id),
          eq(ordersTbl.id, project.orderId),
        ),
      )
      .limit(1);
    const sold = order?.soldTotalCents ?? 0;
    const inv = await db
      .select({ total: invoicesTbl.totalCents, status: invoicesTbl.status, orderId: invoicesTbl.orderId })
      .from(invoicesTbl)
      .where(
        and(
          eq(invoicesTbl.organizationId, user.organization_id),
          eq(invoicesTbl.orderId, project.orderId),
        ),
      );
    const nonCancelled = inv
      .filter((r) => r.status !== "cancelada")
      .reduce((acc, r) => acc + r.total, 0);
    // Cobrado confirmado aplicado: `payment_applications` joined con
    // `invoices` (para llegar al OS del proyecto) y `payments`
    // (filtrar confirmados y no revertidos).
    const collectedRows = await db
      .select({ amount: appTbl.amountCents })
      .from(appTbl)
      .innerJoin(invoicesTbl, eq(invoicesTbl.id, appTbl.invoiceId))
      .innerJoin(paymentsTbl, eq(paymentsTbl.id, appTbl.paymentId))
      .where(
        and(
          eq(appTbl.organizationId, user.organization_id),
          eq(invoicesTbl.orderId, project.orderId),
          eq(paymentsTbl.status, "confirmado"),
          sql`${appTbl.revertedAt} IS NULL`,
        ),
      );
    const confirmedPaid = collectedRows.reduce((acc, r) => acc + r.amount, 0);
    return buildProjectFinancialReport({
      soldTotalCents: sold,
      nonCancelledInvoicedCents: nonCancelled,
      confirmedPaidCents: confirmedPaid,
    });
  }

  async function osOutstandingBalance(
    ctx: Context,
    orderId: string,
  ): Promise<{ orderId: string; outstandingCents: number; components: ReturnType<typeof computeOsOutstandingBalance> }> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "ver_finanzas", { forceDb: true });
    const { orders: ordersTbl, invoices: invoicesTbl, paymentApplications: appTbl, payments: paymentsTbl } =
      await import("@/server/db/schema");
    const [order] = await db
      .select()
      .from(ordersTbl)
      .where(
        and(
          eq(ordersTbl.id, orderId),
          eq(ordersTbl.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!order) {
      throw new DomainError("ORDER_NOT_FOUND", "OS no encontrada", 404);
    }
    const inv = await db
      .select({ total: invoicesTbl.totalCents, status: invoicesTbl.status })
      .from(invoicesTbl)
      .where(
        and(
          eq(invoicesTbl.organizationId, user.organization_id),
          eq(invoicesTbl.orderId, orderId),
        ),
      );
    const nonCancelled = inv
      .filter((r) => r.status !== "cancelada")
      .reduce((acc, r) => acc + r.total, 0);
    // Cobrado confirmado aplicado, scoped al OS via invoice.
    const collectedRows = await db
      .select({ amount: appTbl.amountCents })
      .from(appTbl)
      .innerJoin(invoicesTbl, eq(invoicesTbl.id, appTbl.invoiceId))
      .innerJoin(paymentsTbl, eq(paymentsTbl.id, appTbl.paymentId))
      .where(
        and(
          eq(appTbl.organizationId, user.organization_id),
          eq(invoicesTbl.orderId, orderId),
          eq(paymentsTbl.status, "confirmado"),
          sql`${appTbl.revertedAt} IS NULL`,
        ),
      );
    const confirmedPaid = collectedRows.reduce((acc, r) => acc + r.amount, 0);
    const out = computeOsOutstandingBalance({
      nonCancelledInvoicedCents: nonCancelled,
      confirmedPaidCents: confirmedPaid,
    });
    return {
      orderId,
      outstandingCents: out,
      components: computeOsOutstandingBalance({
        nonCancelledInvoicedCents: nonCancelled,
        confirmedPaidCents: confirmedPaid,
      }),
    };
  }

  return {
    createAccount,
    listAccounts,
    recordTransaction,
    confirmTransaction,
    reconcileTransaction,
    cancelTransaction,
    reverseTransaction,
    listTransactions,
    byId,
    createTransfer,
    imputeDirectCost,
    listDirectCosts,
    accountBalance,
    projectCostSummary,
    projectFinancialReport,
    osOutstandingBalance,
  };
}
