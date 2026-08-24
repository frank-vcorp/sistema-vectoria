/**
 * Router tRPC `finanzas` — SPEC-009 (Finanzas y Movimientos · B21/B26).
 *
 * Sólo orquesta: valida con Zod, deriva `Context` y delega al servicio
 * `createFinancesService()` (AC-28). Las reglas viven en
 * `src/server/services/finanzas/*`.
 *
 * Endpoints:
 *  - `accounts.create/list` (P-009-1 cerrado en `none`: el Director
 *    crea la primera cuenta).
 *  - `transactions.record/confirm/reconcile/cancel/reverse/list/byId`
 *    con ciclo `borrador → confirmado → conciliado` (+laterales).
 *  - `transfers.create` con patas entrada+salida (BR-N326).
 *  - `directCosts.impute/list` (BR-N333).
 *  - `finance.accountBalance/projectCostSummary/projectFinancialReport/
 *    osOutstandingBalance`.
 *
 * Sin acoplamiento inverso a SPEC-004/007/008. `osOutstandingBalance`
 * es el contrato que SPEC-004 consume para el cierre administrativo
 * (BR-N249/N394).
 */
import { z } from "zod";
import { protectedProcedure, router, toTrpcError } from "@/server/trpc/trpc";
import {
  AccountBalanceInputSchema,
  AccountCreateInputSchema,
  DirectCostImputeInputSchema,
  DirectCostListInputSchema,
  OsOutstandingBalanceInputSchema,
  ProjectCostSummaryInputSchema,
  ProjectFinancialReportInputSchema,
  TransactionCancelInputSchema,
  TransactionConfirmInputSchema,
  TransactionListInputSchema,
  TransactionRecordInputSchema,
  TransactionReconcileInputSchema,
  TransactionReverseInputSchema,
  TransferCreateInputSchema,
} from "@/shared/zod";
import { createFinancesService } from "@/server/services/finanzas";
import { createAuditService } from "@/server/services/audit";

function buildFinances() {
  return createFinancesService({ audit: createAuditService() });
}

function compact<T extends Record<string, unknown>>(
  input: T,
): { [K in keyof T]: Exclude<T[K], undefined> } {
  const out = {} as { [K in keyof T]: Exclude<T[K], undefined> };
  for (const k of Object.keys(input) as Array<keyof T>) {
    const v = input[k];
    if (v !== undefined) out[k] = v as Exclude<T[keyof T], undefined>;
  }
  return out;
}

export const finanzasRouter = router({
  accounts: router({
    create: protectedProcedure
      .input(AccountCreateInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const svc = buildFinances();
          return await svc.createAccount(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    list: protectedProcedure
      .input(z.object({
        active: z.boolean().nullish(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }))
      .query(async ({ input, ctx }) => {
        try {
          const svc = buildFinances();
          return await svc.listAccounts(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),

  transactions: router({
    record: protectedProcedure
      .input(TransactionRecordInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const svc = buildFinances();
          return await svc.recordTransaction(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    confirm: protectedProcedure
      .input(TransactionConfirmInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const svc = buildFinances();
          return await svc.confirmTransaction(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    reconcile: protectedProcedure
      .input(TransactionReconcileInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const svc = buildFinances();
          return await svc.reconcileTransaction(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    cancel: protectedProcedure
      .input(TransactionCancelInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const svc = buildFinances();
          return await svc.cancelTransaction(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    reverse: protectedProcedure
      .input(TransactionReverseInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const svc = buildFinances();
          return await svc.reverseTransaction(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    list: protectedProcedure
      .input(TransactionListInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          const svc = buildFinances();
          return await svc.listTransactions(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    byId: protectedProcedure
      .input(z.object({ transactionId: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        try {
          const svc = buildFinances();
          return await svc.byId(ctx.ctx, input.transactionId);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),

  transfers: router({
    create: protectedProcedure
      .input(TransferCreateInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const svc = buildFinances();
          return await svc.createTransfer(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),

  directCosts: router({
    impute: protectedProcedure
      .input(DirectCostImputeInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const svc = buildFinances();
          return await svc.imputeDirectCost(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    list: protectedProcedure
      .input(DirectCostListInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          const svc = buildFinances();
          return await svc.listDirectCosts(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),

  finance: router({
    accountBalance: protectedProcedure
      .input(AccountBalanceInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          const svc = buildFinances();
          return await svc.accountBalance(ctx.ctx, input.accountId);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    projectCostSummary: protectedProcedure
      .input(ProjectCostSummaryInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          const svc = buildFinances();
          return await svc.projectCostSummary(ctx.ctx, input.projectId);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    projectFinancialReport: protectedProcedure
      .input(ProjectFinancialReportInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          const svc = buildFinances();
          return await svc.projectFinancialReport(ctx.ctx, input.projectId);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    /** SPEC-004 consume este endpoint (BR-N249/N394). */
    osOutstandingBalance: protectedProcedure
      .input(OsOutstandingBalanceInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          const svc = buildFinances();
          return await svc.osOutstandingBalance(ctx.ctx, input.orderId);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),
});
