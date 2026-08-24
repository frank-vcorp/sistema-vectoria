/**
 * Router tRPC `suscripciones` — SPEC-011 (Suscripciones · B20a).
 *
 * Sólo orquesta: valida con Zod y delega a `createSuscripcionesService()`.
 * Las reglas viven en `src/server/services/suscripciones/*`.
 *
 * Acciones:
 *  - `createFromOrder`: workflow `subscription_creation` (BR-N405).
 *  - `renovar`: pide factura borrador a Facturación (BR-N406).
 *  - `pausar` / `cancelar` / `reactivar`: transiciones (BR-N404).
 *  - `markVencida`: job (BR-N404).
 *  - `list` / `get` / `history` / `facturacion` / `cobranza`: lectura.
 *
 * Permiso: `gestionar_suscripciones` con `forceDb: true`
 * (AC-81 / ADR-06 §3.1; sembrado en Director / Administrador).
 */
import { z } from "zod";
import { protectedProcedure, router, toTrpcError } from "@/server/trpc/trpc";
import { createSuscripcionesService } from "@/server/services/suscripciones";
import {
  SubscriptionCancelInputSchema,
  SubscriptionCobranzaInputSchema,
  SubscriptionCreateFromOrderInputSchema,
  SubscriptionFacturacionInputSchema,
  SubscriptionGetInputSchema,
  SubscriptionHistoryListInputSchema,
  SubscriptionListInputSchema,
  SubscriptionMarkVencidaInputSchema,
  SubscriptionPauseInputSchema,
  SubscriptionReactivateInputSchema,
  SubscriptionRenovarInputSchema,
} from "@/shared/zod";

function compact<T extends Record<string, unknown>>(input: T) {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(input) as Array<keyof T>) {
    const v = input[k];
    if (v !== undefined) out[k as string] = v;
  }
  return out as { [K in keyof T]: Exclude<T[K], undefined> };
}

export const suscripcionesRouter = router({
  createFromOrder: protectedProcedure
    .input(SubscriptionCreateFromOrderInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createSuscripcionesService().createFromOrder(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  list: protectedProcedure
    .input(SubscriptionListInputSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await createSuscripcionesService().list(ctx.ctx, compact(input));
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  get: protectedProcedure
    .input(SubscriptionGetInputSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await createSuscripcionesService().get(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  history: protectedProcedure
    .input(SubscriptionHistoryListInputSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await createSuscripcionesService().history(
          ctx.ctx,
          compact(input),
        );
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  pausar: protectedProcedure
    .input(SubscriptionPauseInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createSuscripcionesService().pausar(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  cancelar: protectedProcedure
    .input(SubscriptionCancelInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createSuscripcionesService().cancelar(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  reactivar: protectedProcedure
    .input(SubscriptionReactivateInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createSuscripcionesService().reactivar(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  renovar: protectedProcedure
    .input(SubscriptionRenovarInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createSuscripcionesService().renovar(ctx.ctx, compact(input));
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  markVencida: protectedProcedure
    .input(SubscriptionMarkVencidaInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createSuscripcionesService().markVencida(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  facturacion: protectedProcedure
    .input(SubscriptionFacturacionInputSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await createSuscripcionesService().facturacion(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  cobranza: protectedProcedure
    .input(SubscriptionCobranzaInputSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await createSuscripcionesService().cobranza(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
});

// Sub-router legacy para mantener compatibilidad con
// `suscripciones.legacy.*` (no usado en este turno; previene
// roturas si alguna importación ya cacheada esperaba el namespace
// con guión).
void z;
