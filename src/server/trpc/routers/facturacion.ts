/**
 * Router tRPC `facturacion` — SPEC-007 (Facturación CFDI · B18).
 *
 * Sólo orquesta: valida con Zod, deriva `Context` y delega al
 * servicio `createInvoicesService()` (AC-28). Las reglas viven en
 * `src/server/services/facturacion/*`.
 *
 * Permisos (verificados en servicio con `forceDb: true` para
 * acciones críticas, AC-81):
 *  - `gestionar_facturacion`: build, zip, schedules.
 *  - `ver_facturas` (o `gestionar_facturacion` como fallback): list,
 *    byId, preview, listSchedules.
 *  - `timbrar_facturas`: timbrar, cancel.
 *
 * Endpoints:
 *  - `buildFromOrder`, `preview`, `timbrar`, `cancel`, `byId`,
 *    `list`, `applyPayment`, `revertPayment`, `markVencida`,
 *    `zipContador`, `createDraftFromSubscriptionRenewal`.
 *  - `schedules`: createSchedule, listSchedules, skipSchedule,
 *    runSchedule.
 *
 * El router NO crea dependencias hacia otros módulos; consume sólo
 * contratos del servicio. SPEC-011 consume
 * `createDraftFromSubscriptionRenewal` (BR-N406); SPEC-008 consume
 * `applyPayment`/`revertPayment` (BR-012/308).
 */
import { z } from "zod";
import { protectedProcedure, router, toTrpcError } from "@/server/trpc/trpc";
import {
  InvoiceApplyPaymentInputSchema,
  InvoiceBuildInputSchema,
  InvoiceCancelInputSchema,
  InvoiceDraftFromRenewalInputSchema,
  InvoiceListInputSchema,
  InvoiceMarkVencidaInputSchema,
  InvoicePreviewInputSchema,
  InvoiceRevertPaymentInputSchema,
  InvoiceScheduleCreateInputSchema,
  InvoiceScheduleListInputSchema,
  InvoiceScheduleRunInputSchema,
  InvoiceScheduleSkipInputSchema,
  InvoiceTimbrarInputSchema,
  InvoiceZipInputSchema,
} from "@/shared/zod";
import { buildFilesServiceFromEnv } from "@/server/services/files";
import { createAuditService } from "@/server/services/audit";
import { createJobsService } from "@/server/services/jobs";
import { createInvoicesService } from "@/server/services/facturacion";
import { buildCryptoServiceFromEnv } from "@/server/services/crypto/bootstrap";
import { createPacClient } from "@/server/integrations/pac";

/**
 * Inyección perezosa: las dependencias que requieren env (files,
 * crypto) sólo se construyen al primer uso. El adapter PAC siempre
 * es mock por ahora (P-007-1 cerrado en `none`).
 */
async function buildService() {
  return createInvoicesService({
    crypto: buildCryptoServiceFromEnv(),
    files: await buildFilesServiceFromEnv(),
    jobs: createJobsService(),
    audit: createAuditService(),
    pac: createPacClient({ mode: "mock" }),
  });
}

/**
 * Compacta un objeto omitiendo claves con `undefined`. Necesario
 * bajo `exactOptionalPropertyTypes: true`: zod `.optional()` produce
 * `T | undefined`, pero las firmas de servicio admiten sólo `T?:`.
 * Mismo patrón que `proyectos.ts` y `plataforma.ts`.
 */
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

export const facturacionRouter = router({
  // ── Construcción y preview (AC-1, AC-9 BR-N303) ─────────────────────────
  buildFromOrder: protectedProcedure
    .input(InvoiceBuildInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // El zod schema devuelve `dueDate: string` (YYYY-MM-DD). La
        // firma del servicio admite `Date | string`. Convertimos a
        // `Date` para mantener el contrato de negocio consistente.
        const dueDate = new Date(`${input.dueDate}T00:00:00.000Z`);
        const svc = await buildService();
        return await svc.buildFromOrder(ctx.ctx, {
          orderId: input.orderId,
          dueDate,
          concept: input.concept.map((l) => ({
            claveProdServ: l.claveProdServ,
            descripcion: l.descripcion,
            cantidad: l.cantidad,
            valorUnitarioCents: l.valorUnitarioCents,
            ...(l.descuentoCents !== undefined
              ? { descuentoCents: l.descuentoCents }
              : {}),
          })),
        });
      } catch (e) {
        throw toTrpcError(e);
      }
    }),

  preview: protectedProcedure
    .input(InvoicePreviewInputSchema)
    .query(async ({ input, ctx }) => {
      try {
        const svc = await buildService();
        return await svc.preview(ctx.ctx, input.invoiceId);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),

  byId: protectedProcedure
    .input(z.object({ invoiceId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      try {
        const svc = await buildService();
        return await svc.byId(ctx.ctx, input.invoiceId);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),

  list: protectedProcedure
    .input(InvoiceListInputSchema)
    .query(async ({ input, ctx }) => {
      try {
        const svc = await buildService();
        return await svc.list(ctx.ctx, compact(input));
      } catch (e) {
        throw toTrpcError(e);
      }
    }),

  // ── Timbrado y cancelación (AC-1, AC-2) ────────────────────────────────
  timbrar: protectedProcedure
    .input(InvoiceTimbrarInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const svc = await buildService();
        return await svc.timbrar(ctx.ctx, input.invoiceId);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),

  cancel: protectedProcedure
    .input(InvoiceCancelInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const svc = await buildService();
        return await svc.cancel(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),

  // ── Compatibilidad SPEC-008 (AC-2, AC-4) ──────────────────────────────
  applyPayment: protectedProcedure
    .input(InvoiceApplyPaymentInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const svc = await buildService();
        return await svc.applyPayment(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),

  revertPayment: protectedProcedure
    .input(InvoiceRevertPaymentInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const svc = await buildService();
        return await svc.revertPayment(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),

  // ── Jobs y ZIP (AC-3, AC-5, AC-6) ──────────────────────────────────────
  markVencida: protectedProcedure
    .input(InvoiceMarkVencidaInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const svc = await buildService();
        return await svc.markVencida(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),

  zipContador: protectedProcedure
    .input(InvoiceZipInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const svc = await buildService();
        return await svc.zipContador(ctx.ctx, compact(input));
      } catch (e) {
        throw toTrpcError(e);
      }
    }),

  // ── Consumida por SPEC-011 (BR-N406) ──────────────────────────────────
  createDraftFromSubscriptionRenewal: protectedProcedure
    .input(InvoiceDraftFromRenewalInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const svc = await buildService();
        return await svc.createDraftFromSubscriptionRenewal(
          ctx.ctx,
          input,
        );
      } catch (e) {
        throw toTrpcError(e);
      }
    }),

  // ── Schedules (BR-N310, AC-5) ──────────────────────────────────────────
  schedules: router({
    create: protectedProcedure
      .input(InvoiceScheduleCreateInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const svc = await buildService();
          return await svc.createSchedule(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    list: protectedProcedure
      .input(InvoiceScheduleListInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          const svc = await buildService();
          return await svc.listSchedules(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    skip: protectedProcedure
      .input(InvoiceScheduleSkipInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const svc = await buildService();
          return await svc.skipSchedule(ctx.ctx, input.scheduleId);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    runNow: protectedProcedure
      .input(InvoiceScheduleRunInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const svc = await buildService();
          return await svc.runScheduled(
            ctx.ctx,
            input.scheduleId,
            input.scheduledDate,
          );
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),
});
