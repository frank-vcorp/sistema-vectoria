/**
 * Router tRPC `cobranza` — SPEC-008 (Cobranza y Comisiones · B17/B19/B20).
 *
 * Sólo orquesta: valida con Zod, deriva `Context` y delega a los
 * servicios `createCobrosService()` / `createComisionesService()` /
 * `createCobranzaService()` (AC-28). Las reglas viven en
 * `src/server/services/cobranza/*`.
 *
 * Sub-routers:
 *  - `cobros`: register/update/confirm/reverse/applyPayment/list/byId/
 *    listApplications.
 *  - `comisiones`: estimate/release/reverseOnCancel/pay/cancelOnOsCancel/
 *    list/byId/byOrder.
 *  - `cobranza`: createActivity/fulfillPromise/evaluateEscalation/
 *    listActivities/listPromises.
 *
 * El router NO toca servicios de otros módulos: consume contratos de
 * SPEC-007 sólo donde la SPEC lo permite (`applyPayment`/`cancel`/`timbrar`).
 * Sin acoplamiento inverso a OS/Proyectos/Clientes/Comercial.
 *
 * Permisos: todos vía servicio con `forceDb: true`.
 */
import { z } from "zod";
import { protectedProcedure, router, toTrpcError } from "@/server/trpc/trpc";
import {
  CollectionActivityCreateInputSchema,
  CollectionActivityListInputSchema,
  CollectionPromiseFulfillInputSchema,
  CollectionPromiseListInputSchema,
  CommissionCancelOnOsCancelInputSchema,
  CommissionEstimateInputSchema,
  CommissionListInputSchema,
  CommissionPayInputSchema,
  CommissionReleaseInputSchema,
  CommissionReverseOnCancelInputSchema,
  EscalationEvaluateInputSchema,
  PaymentApplicationListInputSchema,
  PaymentApplyInputSchema,
  PaymentConfirmInputSchema,
  PaymentListInputSchema,
  PaymentRegisterInputSchema,
  PaymentReverseInputSchema,
  PaymentUpdateInputSchema,
} from "@/shared/zod";
import { buildFilesServiceFromEnv } from "@/server/services/files";
import { createAuditService } from "@/server/services/audit";
import {
  createCobrosService,
  createComisionesService,
  createCobranzaService,
} from "@/server/services/cobranza";

async function buildCobros() {
  return createCobrosService({
    files: await buildFilesServiceFromEnv(),
    audit: createAuditService(),
  });
}

function buildComisiones() {
  return createComisionesService({ audit: createAuditService() });
}

function buildCobranza() {
  return createCobranzaService({ audit: createAuditService() });
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

export const cobranzaRouter = router({
  // ── Cobros (AC-1..AC-3, AC-10) ──────────────────────────────────────────
  cobros: router({
    register: protectedProcedure
      .input(PaymentRegisterInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const svc = await buildCobros();
          return await svc.register(ctx.ctx, {
            clientId: input.clientId,
            amountCents: input.amountCents,
            method: input.method,
            paymentDate: input.paymentDate,
            ...(input.reference !== undefined ? { reference: input.reference } : {}),
          });
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    update: protectedProcedure
      .input(PaymentUpdateInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const svc = await buildCobros();
          return await svc.update(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    confirm: protectedProcedure
      .input(PaymentConfirmInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const svc = await buildCobros();
          return await svc.confirm(ctx.ctx, {
            paymentId: input.paymentId,
            ...(input.applications !== undefined
              ? { applications: input.applications }
              : {}),
          });
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    reverse: protectedProcedure
      .input(PaymentReverseInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const svc = await buildCobros();
          return await svc.reverse(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    applyPayment: protectedProcedure
      .input(PaymentApplyInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const svc = await buildCobros();
          return await svc.apply(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    list: protectedProcedure
      .input(PaymentListInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          const svc = await buildCobros();
          return await svc.list(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    byId: protectedProcedure
      .input(z.object({ paymentId: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        try {
          const svc = await buildCobros();
          return await svc.byId(ctx.ctx, input.paymentId);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    listApplications: protectedProcedure
      .input(PaymentApplicationListInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          const svc = await buildCobros();
          return await svc.listApplications(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),

  // ── Comisiones (AC-4..AC-7, AC-9) ───────────────────────────────────────
  comisiones: router({
    estimate: protectedProcedure
      .input(CommissionEstimateInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await buildComisiones().estimate(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    release: protectedProcedure
      .input(CommissionReleaseInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await buildComisiones().release(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    reverseOnCancel: protectedProcedure
      .input(CommissionReverseOnCancelInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await buildComisiones().reverseOnCancel(ctx.ctx, {
            invoiceId: input.invoiceId,
            ...(input.osCancelled !== undefined
              ? { osCancelled: input.osCancelled }
              : {}),
          });
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    pay: protectedProcedure
      .input(CommissionPayInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await buildComisiones().pay(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    cancelOnOsCancel: protectedProcedure
      .input(CommissionCancelOnOsCancelInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await buildComisiones().cancelOnOsCancel(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    list: protectedProcedure
      .input(CommissionListInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          return await buildComisiones().list(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    byId: protectedProcedure
      .input(z.object({ commissionId: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        try {
          return await buildComisiones().byId(ctx.ctx, input.commissionId);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    byOrder: protectedProcedure
      .input(z.object({ orderId: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        try {
          return await buildComisiones().byOrder(ctx.ctx, input.orderId);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),

  // ── Cobranza (actividades/promesas/escalado) (AC-8) ────────────────────
  cobranza: router({
    createActivity: protectedProcedure
      .input(CollectionActivityCreateInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await buildCobranza().createActivity(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    listActivities: protectedProcedure
      .input(CollectionActivityListInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          return await buildCobranza().listActivities(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    fulfillPromise: protectedProcedure
      .input(CollectionPromiseFulfillInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await buildCobranza().fulfillPromise(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    listPromises: protectedProcedure
      .input(CollectionPromiseListInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          return await buildCobranza().listPromises(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    evaluateEscalation: protectedProcedure
      .input(EscalationEvaluateInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await buildCobranza().evaluateEscalation(
            ctx.ctx,
            compact(input),
          );
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),
});
