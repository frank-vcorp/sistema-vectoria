/**
 * Router `plataforma` — usuarios, roles, permisos, config fiscal,
 * notificaciones, auditoría. Todos delegan a servicios.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { toTrpcError } from "../trpc";
import { createUserPermissionsService } from "@/server/services/user-permissions";
import { createFiscalConfigService } from "@/server/services/fiscal-config";
import { createNotificationsService } from "@/server/services/notifications";
import { createAuditService } from "@/server/services/audit";
import { buildCryptoServiceFromEnv } from "@/server/services/crypto/bootstrap";

const Pagination = z.object({
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
});

/**
 * Compacta un objeto omitiendo claves con `undefined`.
 * Necesario bajo `exactOptionalPropertyTypes: true`: zod `.optional()`
 * produce `T | undefined`, pero las firmas de servicio admiten sólo `T?:`.
 *
 * Devuelve el mismo tipo que la entrada, pero con cada clave opcional
 * estrechada a `T[K]` (sin `| undefined`). Las claves requeridas
 * siguen siendo requeridas.
 */
function compact<T extends Record<string, unknown>>(
  input: T,
): { [K in keyof T]: Exclude<T[K], undefined> } {
  // `K` sólo existe en la posición de tipo mapeado; en el cuerpo de la función
  // usamos `keyof T` (tipo unión de todas las claves) y `typeof k` (clave
  // concreta iterada). AC-77 / SPEC-001 §11.
  const out = {} as { [K in keyof T]: Exclude<T[K], undefined> };
  for (const k of Object.keys(input) as Array<keyof T>) {
    const v = input[k];
    if (v !== undefined) out[k] = v as Exclude<T[keyof T], undefined>;
  }
  return out;
}

export const plataformaRouter = router({
  // ── Roles ────────────────────────────────────────────────────────────────
  createRole: protectedProcedure
    .input(z.object({ code: z.string().min(1), label: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await createUserPermissionsService().createRole(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),

  updateRoleLabel: protectedProcedure
    .input(z.object({ roleId: z.string().uuid(), label: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await createUserPermissionsService().updateRoleLabel(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),

  deactivateRole: protectedProcedure
    .input(z.object({ roleId: z.string().uuid(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await createUserPermissionsService().deactivateRole(ctx.ctx, compact(input));
      } catch (e) {
        throw toTrpcError(e);
      }
    }),

  // ── Permisos custom ──────────────────────────────────────────────────────
  grantPermission: protectedProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        permissionCode: z.string().min(1),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        await createUserPermissionsService().grantPermission(ctx.ctx, input);
        return { ok: true };
      } catch (e) {
        throw toTrpcError(e);
      }
    }),

  revokePermission: protectedProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        permissionCode: z.string().min(1),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        await createUserPermissionsService().revokePermission(ctx.ctx, input);
        return { ok: true };
      } catch (e) {
        throw toTrpcError(e);
      }
    }),

  // ── Configuración fiscal ─────────────────────────────────────────────────
  fiscalConfig: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await createFiscalConfigService({ crypto: buildCryptoServiceFromEnv() }).get(ctx.ctx);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
    upsert: protectedProcedure
      .input(
        z.object({
          rfc: z.string().optional(),
          razonSocial: z.string().optional(),
          regimen: z.string().optional(),
          pacApiKey: z.string().optional(),
          csdPassword: z.string().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          return await createFiscalConfigService({ crypto: buildCryptoServiceFromEnv() }).upsert(
            ctx.ctx,
            compact(input),
          );
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),

  // ── Notificaciones ───────────────────────────────────────────────────────
  notifications: router({
    list: protectedProcedure
      .input(Pagination.extend({ unreadOnly: z.boolean().optional() }))
      .query(async ({ input, ctx }) => {
        // protectedProcedure garantiza ctx.ctx.user !== null (AC-71).
        const user = ctx.ctx.user!;
        try {
          return await createNotificationsService().list(
            user.organization_id,
            user.id,
            compact(input),
          );
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    markRead: protectedProcedure
      .input(z.object({ notificationId: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        const user = ctx.ctx.user!;
        try {
          await createNotificationsService().markRead(
            user.organization_id,
            user.id,
            input.notificationId,
          );
          return { ok: true };
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),

  // ── Auditoría ────────────────────────────────────────────────────────────
  audit: router({
    list: protectedProcedure
      .input(
        Pagination.extend({
          entityType: z.string().optional(),
          entityId: z.string().uuid().optional(),
          action: z.string().optional(),
        }),
      )
      .query(async ({ input, ctx }) => {
        try {
          return await createAuditService().list(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),
});
