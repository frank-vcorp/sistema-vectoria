/**
 * Router tRPC `ordenServicio` — SPEC-004 (Orden de Servicio).
 *
 * Sólo orquesta: valida con Zod, deriva `Context` y delega a
 * `createOrdersService()` (AC-28). Las reglas viven en
 * `src/server/services/orden-servicio/orders.ts`.
 *
 * Endpoints:
 *  - `createFromAcceptedQuote` (BR-N242): crea OS desde cotización
 *    aceptada; copia inmutable de importes y alcance.
 *  - `assignPL` (BR-N245): asigna PL.
 *  - `setOC` (BR-N243): 4 campos opcionales de la OC.
 *  - `authorize` (BR-N244/245/017/121, BR-N407): valida 4 precondiciones
 *    y emite el evento `os.authorized_to_start` que consume SPEC-005.
 *  - `markInExecution` (BR-N247): OS→in_execution al crearse el proyecto.
 *  - `markDelivered` (BR-N248/N392): cierre técnico, saldo pendiente OK.
 *  - `closeAdministrative` (BR-N249/N394/N393): saldo cero o excepción
 *    Director + factura final.
 *  - `pause` / `resume` / `cancel` (BR-N250): laterales con motivo.
 */
import { z } from "zod";
import { protectedProcedure, router, toTrpcError } from "@/server/trpc/trpc";
import { createOrdersService } from "@/server/services/orden-servicio";
import {
  OrderAssignPLInputSchema,
  OrderAuthorizeInputSchema,
  OrderByIdInputSchema,
  OrderCancelInputSchema,
  OrderCloseAdministrativeInputSchema,
  OrderCreateFromAcceptedQuoteInputSchema,
  OrderListInputSchema,
  OrderMarkDeliveredInputSchema,
  OrderMarkInExecutionInputSchema,
  OrderPauseInputSchema,
  OrderResumeInputSchema,
  OrderSetOCInputSchema,
  OrderStatusSchema,
} from "@/shared/zod";

function compact<T extends Record<string, unknown>>(input: T) {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(input) as Array<keyof T>) {
    const v = input[k];
    if (v !== undefined) out[k as string] = v;
  }
  return out as { [K in keyof T]: Exclude<T[K], undefined> };
}

export const ordenServicioRouter = router({
  createFromAcceptedQuote: protectedProcedure
    .input(OrderCreateFromAcceptedQuoteInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createOrdersService().createFromAcceptedQuote(
          ctx.ctx,
          compact(input),
        );
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  assignPL: protectedProcedure
    .input(OrderAssignPLInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createOrdersService().assignPL(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  setOC: protectedProcedure
    .input(OrderSetOCInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createOrdersService().setOC(ctx.ctx, compact(input));
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  authorize: protectedProcedure
    .input(OrderAuthorizeInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createOrdersService().authorize(ctx.ctx, compact(input));
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  markInExecution: protectedProcedure
    .input(OrderMarkInExecutionInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createOrdersService().markInExecution(ctx.ctx, compact(input));
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  markDelivered: protectedProcedure
    .input(OrderMarkDeliveredInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createOrdersService().markDelivered(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  closeAdministrative: protectedProcedure
    .input(OrderCloseAdministrativeInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createOrdersService().closeAdministrative(
          ctx.ctx,
          compact(input),
        );
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  pause: protectedProcedure
    .input(OrderPauseInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createOrdersService().pause(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  resume: protectedProcedure
    .input(OrderResumeInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createOrdersService().resume(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  cancel: protectedProcedure
    .input(OrderCancelInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createOrdersService().cancel(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  byId: protectedProcedure
    .input(OrderByIdInputSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await createOrdersService().getById(ctx.ctx, input.orderId);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  list: protectedProcedure
    .input(OrderListInputSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await createOrdersService().list(ctx.ctx, compact(input));
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  /**
   * SPEC-004 §6 · helper de validación previa al autorizar (no muta).
   * Útil para la UI para mostrar las 4 precondiciones antes de
   * habilitar el botón "Autorizar".
   */
  preflightAuthorize: protectedProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      try {
        const dto = await createOrdersService().getById(ctx.ctx, input.orderId);
        return {
          plAssigned: dto.plUserId !== null,
          ocValid:
            dto.ocNumber == null &&
            dto.ocAmountCents == null &&
            dto.ocFileId == null
              ? true
              : dto.ocAmountCents === dto.soldTotalCents && !!dto.ocFileId,
          soldTotalCents: dto.soldTotalCents,
          status: OrderStatusSchema.parse(dto.status),
          // El monto cobrado real lo provee SPEC-008/011 vía provider;
          // mientras tanto, devolvemos 0 para que la UI muestre
          // explícitamente "anticipo pendiente" en el diálogo.
          advancePaidCents: 0,
          advanceProviderSource: "placeholder" as const,
          canAuthorize: dto.status === "pending_deposit" && !!dto.plUserId,
        };
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
});
