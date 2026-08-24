/**
 * Router tRPC `clientes` — SPEC-002.
 *
 * Sólo orquesta: valida con Zod, deriva `Context` desde la sesión y
 * delega a `createXService()` (AC-28). Las reglas viven en
 * `src/server/services/clientes/*`.
 */
import { z } from "zod";
import { protectedProcedure, router, toTrpcError } from "@/server/trpc/trpc";
import {
  createClientsService,
  createClientContactsService,
  createClientFiscalDataService,
  createProspectsService,
} from "@/server/services/clientes";
import {
  ProspectCreateInputSchema,
  ProspectQualifyInputSchema,
  ProspectLostInputSchema,
  ProspectSuspendInputSchema,
  ProspectReactivateInputSchema,
  ClientCreateFromProspectInputSchema,
  ClientArchiveInputSchema,
  ClientContactInputSchema,
  ClientContactUpdateInputSchema,
  ClientFiscalUpsertInputSchema,
} from "@/shared/zod";

const Pagination = z.object({
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
});

/**
 * Compacta un objeto omitiendo claves con `undefined`. Necesario bajo
 * `exactOptionalPropertyTypes: true` (AC-77 / SPEC-001 §11): zod
 * `.optional()` produce `T | undefined`, pero las firmas de servicio
 * admiten sólo `T?:`.
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

export const clientesRouter = router({
  prospectos: router({
    create: protectedProcedure
      .input(ProspectCreateInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createProspectsService().create(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    qualify: protectedProcedure
      .input(ProspectQualifyInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createProspectsService().qualify(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    setLost: protectedProcedure
      .input(ProspectLostInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createProspectsService().setLost(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    setSuspended: protectedProcedure
      .input(ProspectSuspendInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createProspectsService().setSuspended(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    reactivate: protectedProcedure
      .input(ProspectReactivateInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createProspectsService().reactivate(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    list: protectedProcedure
      .input(
        Pagination.extend({
          status: z.string().optional(),
          assignedTo: z.string().uuid().optional(),
          search: z.string().optional(),
        }),
      )
      .query(async ({ input, ctx }) => {
        try {
          return await createProspectsService().list(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    byId: protectedProcedure
      .input(z.object({ prospectId: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        try {
          return await createProspectsService().getById(
            ctx.ctx,
            input.prospectId,
          );
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),

  clientes: router({
    createFromProspect: protectedProcedure
      .input(ClientCreateFromProspectInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createClientsService().createFromProspect(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    archive: protectedProcedure
      .input(ClientArchiveInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createClientsService().archive(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    list: protectedProcedure
      .input(
        Pagination.extend({
          status: z.string().optional(),
          search: z.string().optional(),
        }),
      )
      .query(async ({ input, ctx }) => {
        try {
          return await createClientsService().list(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    byId: protectedProcedure
      .input(z.object({ clientId: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        try {
          return await createClientsService().getById(ctx.ctx, input.clientId);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),

  contactos: router({
    create: protectedProcedure
      .input(ClientContactInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createClientContactsService().create(
            ctx.ctx,
            compact(input),
          );
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    update: protectedProcedure
      .input(ClientContactUpdateInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createClientContactsService().update(
            ctx.ctx,
            compact(input),
          );
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    setMain: protectedProcedure
      .input(z.object({ contactId: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await createClientContactsService().setMain(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    delete: protectedProcedure
      .input(z.object({ contactId: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        try {
          await createClientContactsService().delete(ctx.ctx, input);
          return { ok: true };
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    listForClient: protectedProcedure
      .input(z.object({ clientId: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        try {
          return await createClientContactsService().listForClient(
            ctx.ctx,
            input,
          );
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),

  fiscal: router({
    upsert: protectedProcedure
      .input(ClientFiscalUpsertInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createClientFiscalDataService().upsert(
            ctx.ctx,
            compact(input),
          );
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    getForClient: protectedProcedure
      .input(z.object({ clientId: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        try {
          return await createClientFiscalDataService().getForClient(
            ctx.ctx,
            input,
          );
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),
});