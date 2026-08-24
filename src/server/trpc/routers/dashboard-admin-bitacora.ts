/**
 * Routers tRPC de Dashboard / Admin / Bitácora (SPEC-010 / B22/B23).
 *
 * Sólo orquestan: validan con Zod y delegan a los servicios
 * `createDashboardService` / `createAdminService` /
 * `createBitacoraService`. Las reglas viven en
 * `src/server/services/{dashboard,admin,bitacora}/*`.
 *
 * Esta capa NO escribe entidades de módulos: solo persiste
 * `user_dashboard_preferences` (del usuario) y `file_links`
 * (polimórfico, read-only). La escritura de auditoría/entidades
 * sigue siendo de cada servicio.
 */
import { z } from "zod";
import { protectedProcedure, router, toTrpcError } from "@/server/trpc/trpc";
import {
  AdminGetRoleInputSchema,
  AuditLogListInputSchema,
  BitacoraLinkFileInputSchema,
  DashboardGetInputSchema,
  DashboardSaveLayoutInputSchema,
  ProjectLogListInputSchema,
  QuestionnaireEditorAddInputSchema,
  QuestionnaireEditorGetInputSchema,
  QuestionnaireEditorRemoveInputSchema,
  QuestionnaireEditorReorderInputSchema,
  QuestionnaireEditorUpdateInputSchema,
} from "@/shared/zod";
import { createAuditService } from "@/server/services/audit";
import { buildFilesServiceFromEnv } from "@/server/services/files";
import { createDashboardService } from "@/server/services/dashboard";
import { createAdminService } from "@/server/services/admin";
import { createBitacoraService } from "@/server/services/bitacora";
import { createQuestionnaireEditorService } from "@/server/services/admin/questionnaire-editor";

function buildDashboard() {
  return createDashboardService({ audit: createAuditService() });
}
function buildAdmin() {
  return createAdminService({ audit: createAuditService() });
}
async function buildBitacora() {
  return createBitacoraService({
    audit: createAuditService(),
    files: await buildFilesServiceFromEnv(),
  });
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

export const dashboardRouter = router({
  get: protectedProcedure
    .input(DashboardGetInputSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await buildDashboard().get(ctx.ctx, compact(input));
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  saveLayout: protectedProcedure
    .input(DashboardSaveLayoutInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await buildDashboard().saveLayout(ctx.ctx, {
          widgets: input.widgets,
          layout: input.layout,
          ...(input.defaultView !== undefined
            ? { defaultView: input.defaultView }
            : {}),
        });
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
});

export const adminRouter = router({
  roles: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await buildAdmin().listRoles(ctx.ctx);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
    get: protectedProcedure
      .input(AdminGetRoleInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          return await buildAdmin().getRole(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),
  permissions: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await buildAdmin().listPermissions(ctx.ctx);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  }),
  /**
   * SPEC-010 AC-7 · Editor visual de cuestionarios (DEC-FUN-45).
   * El servicio delega en SPEC-010 admin (mecánica) + reusa
   * SPEC-003 questionnaires para lecturas canónicas.
   */
  questionnaireEditor: router({
    getForEdit: protectedProcedure
      .input(QuestionnaireEditorGetInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          return await createQuestionnaireEditorService().getForEdit(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    preview: protectedProcedure
      .input(QuestionnaireEditorGetInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          return await createQuestionnaireEditorService().preview(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    reorder: protectedProcedure
      .input(QuestionnaireEditorReorderInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createQuestionnaireEditorService().reorder(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    update: protectedProcedure
      .input(QuestionnaireEditorUpdateInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createQuestionnaireEditorService().update(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    add: protectedProcedure
      .input(QuestionnaireEditorAddInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createQuestionnaireEditorService().add(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    remove: protectedProcedure
      .input(QuestionnaireEditorRemoveInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createQuestionnaireEditorService().remove(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),
});

export const bitacoraRouter = router({
  audit: router({
    list: protectedProcedure
      .input(AuditLogListInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          const svc = await buildBitacora();
          return await svc.listAuditLogs(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),
  projectLog: router({
    list: protectedProcedure
      .input(ProjectLogListInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          const svc = await buildBitacora();
          return await svc.listProjectLog(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),
  linkFile: protectedProcedure
    .input(BitacoraLinkFileInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const svc = await buildBitacora();
        return await svc.linkFile(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
});

// Sub-routers legados para mantener backward compat con dashboard admin.
// (No se usan en este turno, pero previenen roturas en próximas
// iteraciones.)
void z;
