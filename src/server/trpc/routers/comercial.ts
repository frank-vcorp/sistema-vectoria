/**
 * Router tRPC `comercial` — SPEC-003 (Comercial).
 *
 * Sólo orquesta: valida con Zod, deriva `Context` y delega a los
 * servicios (`createXService()`). Las reglas viven en
 * `src/server/services/comercial/*`.
 */
import { z } from "zod";
import { protectedProcedure, router, toTrpcError } from "@/server/trpc/trpc";
import {
  createCatalogService,
  createQuestionnairesService,
  createQuotesService,
  createScopeService,
  createTemplatesService,
  type CreateQuoteItemInput,
} from "@/server/services/comercial";
import {
  DiscountPctSchema,
  QuoteAcceptInputSchema,
  QuoteCreateInputSchema,
  QuoteItemInputSchema,
  QuoteUpdateItemsInputSchema,
  QuestionnaireResponseInputSchema,
  ScopeGenerateDraftInputSchema,
  ScopeSignInputSchema,
} from "@/shared/zod";

function compact<T extends Record<string, unknown>>(input: T) {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(input) as Array<keyof T>) {
    const v = input[k];
    if (v !== undefined) out[k as string] = v;
  }
  return out as { [K in keyof T]: Exclude<T[K], undefined> };
}

export const comercialRouter = router({
  cuestionarios: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await createQuestionnairesService().list(ctx.ctx);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
    byId: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        try {
          return await createQuestionnairesService().getById(ctx.ctx, input.id);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    listQuestions: protectedProcedure
      .input(z.object({ questionnaireId: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        try {
          return await createQuestionnairesService().listQuestions(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    submitResponse: protectedProcedure
      .input(QuestionnaireResponseInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createQuestionnairesService().submitResponse(
            ctx.ctx,
            compact(input),
          );
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),

  catalogo: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await createCatalogService().list(ctx.ctx);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
    byId: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        try {
          return await createCatalogService().getById(ctx.ctx, input.id);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),

  plantillas: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await createTemplatesService().list(ctx.ctx);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
    byId: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        try {
          return await createTemplatesService().getById(ctx.ctx, input.id);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),

  alcance: router({
    generateDraft: protectedProcedure
      .input(ScopeGenerateDraftInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createScopeService().generateDraft(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    submitForReview: protectedProcedure
      .input(z.object({ scopeId: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await createScopeService().submitForReview(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    sign: protectedProcedure
      .input(ScopeSignInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createScopeService().sign(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    byId: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        try {
          return await createScopeService().getById(ctx.ctx, input.id);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    listForProspect: protectedProcedure
      .input(z.object({ prospectId: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        try {
          return await createScopeService().listForProspect(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),

  cotizaciones: router({
    create: protectedProcedure
      .input(QuoteCreateInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const items: CreateQuoteItemInput[] = input.items.map((it) => ({
            ...compact(it as Record<string, unknown>),
            catalogServiceId:
              it.catalogServiceId === undefined ? null : it.catalogServiceId,
          } as CreateQuoteItemInput));
          return await createQuotesService().create(ctx.ctx, {
            ...compact(input),
            validUntil: new Date(input.validUntil),
            items,
            presupuestoDeclaradoCents: input.presupuestoDeclaradoCents ?? null,
          });
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    updateItems: protectedProcedure
      .input(QuoteUpdateItemsInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const items: CreateQuoteItemInput[] = input.items.map((it) => ({
            ...compact(it as Record<string, unknown>),
            catalogServiceId:
              it.catalogServiceId === undefined ? null : it.catalogServiceId,
          } as CreateQuoteItemInput));
          return await createQuotesService().updateItems(ctx.ctx, {
            quoteId: input.quoteId,
            items,
          });
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    setDiscount: protectedProcedure
      .input(
        z.object({
          quoteId: z.string().uuid(),
          discountPct: DiscountPctSchema,
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          return await createQuotesService().setDiscount(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    send: protectedProcedure
      .input(z.object({ quoteId: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await createQuotesService().send(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    presupuestoWarning: protectedProcedure
      .input(z.object({ quoteId: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        try {
          return await createQuotesService().presupuestoWarning(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    accept: protectedProcedure
      .input(QuoteAcceptInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createQuotesService().accept(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    cancel: protectedProcedure
      .input(z.object({ quoteId: z.string().uuid(), reason: z.string().max(280).optional() }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await createQuotesService().cancel(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    reject: protectedProcedure
      .input(z.object({ quoteId: z.string().uuid(), reason: z.string().max(280).optional() }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await createQuotesService().reject(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    byId: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        try {
          return await createQuotesService().getById(ctx.ctx, input.id);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    listForProspect: protectedProcedure
      .input(z.object({ prospectId: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        try {
          return await createQuotesService().listForProspect(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    calculatePreview: protectedProcedure
      .input(z.object({ items: z.array(QuoteItemInputSchema) }))
      .query(async ({ input }) => {
        try {
          const items: CreateQuoteItemInput[] = input.items.map((it) => ({
            ...compact(it as Record<string, unknown>),
            catalogServiceId:
              it.catalogServiceId === undefined ? null : it.catalogServiceId,
          } as CreateQuoteItemInput));
          return createQuotesService().calculatePreview({ items });
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),
});
