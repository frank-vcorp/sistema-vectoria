/**
 * Router tRPC `proyectos` — SPEC-005 (Proyectos: artefactos y
 * estados) + SPEC-006 (Proyectos: equipo y ejecución · B11-B16).
 *
 * Sólo orquesta: valida con Zod, deriva `Context` y delega a los
 * servicios de `createProjectsService()` /
 * `createModulesService()` / `createJsonDiscoveryService()` /
 * `createMembersService()` / `createRequirementsService()` /
 * `createTasksService()` / `createTimeEntriesService()` /
 * `createTestsService()` / `createDeliverablesService()` /
 * `createChangeRequestsService()` / `createCierreService()`
 * (AC-28). Las reglas viven en `src/server/services/proyectos/*`.
 *
 * Endpoints (sub-routers):
 *  - raíz (SPEC-005):
 *    - `createFromOrder`, `transitionStage`, `pause`, `resume`,
 *      `cancel`, `complete`, `overrideHealth`, `byId`, `list`.
 *  - `modules` (SPEC-005): `list`, `transition`.
 *  - `jsonDiscovery` (SPEC-005): `exportTemplate`, `previewImport`,
 *    `import`.
 *  - `members` (SPEC-006 AC-1): `add`, `remove`, `list`.
 *  - `requirements` (SPEC-006 BR-N264-267): `create`, `transition`,
 *    `byId`, `list`.
 *  - `tasks` (SPEC-006 AC-2..AC-4): `create`, `byId`, `list`,
 *    `transition`, `assign`, `reject`, `review`, `checklistAdd`,
 *    `checklistToggle`, `evidenceAdd`.
 *  - `timeEntries` (SPEC-006 AC-10): `create`, `list`.
 *  - `tests` (SPEC-006 AC-5): `create`, `transition`,
 *    `markNotApplicable`, `list`.
 *  - `deliverables` (SPEC-006 AC-6): `create`, `transition`,
 *    `accept`, `list`.
 *  - `changeRequests` (SPEC-006 AC-7): `create`, `quote`,
 *    `authorize`, `reject`, `startImplementation`,
 *    `completeImplementation`, `list`.
 *  - `cierre` (SPEC-006 AC-8/AC-9): `closeTechnical`,
 *    `previewCloseGates`.
 *
 * El router NO llama al servicio de OS (no-acoplamiento inverso,
 * SPEC §14): la transición OS→`delivered` se realiza desde el
 * worker de SPEC-004 al consumir el audit
 * `project.delivered_from_order` que emite `cierre.closeTechnical`.
 */
import { protectedProcedure, router, toTrpcError } from "@/server/trpc/trpc";
import {
  createChangeRequestsService,
  createCierreService,
  createDeliverablesService,
  createJsonDiscoveryService,
  createMembersService,
  createModulesService,
  createProjectsService,
  createRequirementsService,
  createTasksService,
  createTestsService,
  createTimeEntriesService,
} from "@/server/services/proyectos";
import { z } from "zod";
import {
  ChangeRequestAuthorizeInputSchema,
  ChangeRequestCreateInputSchema,
  ChangeRequestListInputSchema,
  ChangeRequestQuoteInputSchema,
  ChangeRequestRejectInputSchema,
  DeliverableAcceptInputSchema,
  DeliverableCreateInputSchema,
  DeliverableListInputSchema,
  DeliverableTransitionInputSchema,
  JsonDiscoveryExportInputSchema,
  JsonDiscoveryImportInputSchema,
  ModuleListInputSchema,
  ModuleTransitionInputSchema,
  ProjectByIdInputSchema,
  ProjectCancelInputSchema,
  ProjectCloseTechnicalInputSchema,
  ProjectCreateFromOrderInputSchema,
  ProjectListInputSchema,
  ProjectMemberAddInputSchema,
  ProjectMemberListInputSchema,
  ProjectMemberRemoveInputSchema,
  ProjectOverrideHealthInputSchema,
  ProjectPauseInputSchema,
  ProjectProgressInputSchema,
  ProjectTransitionStageInputSchema,
  RequirementByIdInputSchema,
  RequirementCreateInputSchema,
  RequirementListInputSchema,
  RequirementTransitionInputSchema,
  TaskAssignInputSchema,
  TaskByIdInputSchema,
  TaskChecklistAddInputSchema,
  TaskChecklistToggleInputSchema,
  TaskCreateInputSchema,
  TaskEvidenceAddInputSchema,
  TaskListInputSchema,
  TaskRejectInputSchema,
  TaskReviewInputSchema,
  TaskTransitionInputSchema,
  TestCreateInputSchema,
  TestListInputSchema,
  TestMarkNotApplicableInputSchema,
  TestTransitionInputSchema,
  TimeEntryCreateInputSchema,
  TimeEntryListInputSchema,
} from "@/shared/zod";

function compact<T extends Record<string, unknown>>(input: T) {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(input) as Array<keyof T>) {
    const v = input[k];
    if (v !== undefined) out[k as string] = v;
  }
  return out as { [K in keyof T]: Exclude<T[K], undefined> };
}

export const proyectosRouter = router({
  // ── SPEC-005 root ───────────────────────────────────────────────────────
  createFromOrder: protectedProcedure
    .input(ProjectCreateFromOrderInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createProjectsService().createFromOrder(ctx.ctx, compact(input));
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  transitionStage: protectedProcedure
    .input(ProjectTransitionStageInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createProjectsService().transitionStage(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  pause: protectedProcedure
    .input(ProjectPauseInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createProjectsService().pause(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  resume: protectedProcedure
    .input(ProjectByIdInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createProjectsService().resume(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  cancel: protectedProcedure
    .input(ProjectCancelInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createProjectsService().cancel(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  complete: protectedProcedure
    .input(ProjectByIdInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createProjectsService().complete(ctx.ctx, input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  overrideHealth: protectedProcedure
    .input(ProjectOverrideHealthInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await createProjectsService().overrideHealth(ctx.ctx, {
          projectId: input.projectId,
          health: input.health,
          reason: input.reason ?? "",
        });
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  byId: protectedProcedure
    .input(ProjectByIdInputSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await createProjectsService().getById(ctx.ctx, input.projectId);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  list: protectedProcedure
    .input(ProjectListInputSchema)
    .query(async ({ input, ctx }) => {
      try {
        return await createProjectsService().list(ctx.ctx, compact(input));
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
  // ── SPEC-005 · modules ────────────────────────────────────────────────
  modules: router({
    list: protectedProcedure
      .input(ModuleListInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          return await createModulesService().list(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    transition: protectedProcedure
      .input(ModuleTransitionInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createModulesService().transition(ctx.ctx, {
            moduleId: input.moduleId,
            targetStatus: input.targetStatus,
            ...(input.reason !== undefined ? { reason: input.reason } : {}),
          });
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),
  // ── SPEC-005 · jsonDiscovery ──────────────────────────────────────────
  jsonDiscovery: router({
    exportTemplate: protectedProcedure
      .input(JsonDiscoveryExportInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          return await createJsonDiscoveryService().exportTemplate(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    previewImport: protectedProcedure
      .input(JsonDiscoveryImportInputSchema.pick({ projectId: true }).extend({
        json: JsonDiscoveryImportInputSchema.shape.json,
      }))
      .query(async ({ input, ctx }) => {
        try {
          return await createJsonDiscoveryService().previewImport(ctx.ctx, {
            projectId: input.projectId,
            json: input.json,
          });
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    import: protectedProcedure
      .input(JsonDiscoveryImportInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createJsonDiscoveryService().import(ctx.ctx, {
            projectId: input.projectId,
            version: input.version,
            json: input.json,
          });
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),
  // ── SPEC-006 · members ────────────────────────────────────────────────
  members: router({
    add: protectedProcedure
      .input(ProjectMemberAddInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createMembersService().add(ctx.ctx, {
            projectId: input.projectId,
            userId: input.userId,
            ...(input.projectRole !== undefined
              ? { projectRole: input.projectRole }
              : {}),
          });
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    remove: protectedProcedure
      .input(ProjectMemberRemoveInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createMembersService().remove(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    list: protectedProcedure
      .input(ProjectMemberListInputSchema.extend({
        includeInactive: z.boolean().default(false),
      }))
      .query(async ({ input, ctx }) => {
        try {
          return await createMembersService().list(ctx.ctx, {
            projectId: input.projectId,
            includeInactive: input.includeInactive,
          });
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),
  // ── SPEC-006 · requirements ──────────────────────────────────────────
  requirements: router({
    create: protectedProcedure
      .input(RequirementCreateInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createRequirementsService().create(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    transition: protectedProcedure
      .input(RequirementTransitionInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createRequirementsService().transition(ctx.ctx, {
            requirementId: input.requirementId,
            targetStatus: input.targetStatus,
            ...(input.reason !== undefined ? { reason: input.reason } : {}),
          });
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    byId: protectedProcedure
      .input(RequirementByIdInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          return await createRequirementsService().byId(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    list: protectedProcedure
      .input(RequirementListInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          return await createRequirementsService().list(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),
  // ── SPEC-006 · tasks ──────────────────────────────────────────────────
  tasks: router({
    create: protectedProcedure
      .input(TaskCreateInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createTasksService().create(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    byId: protectedProcedure
      .input(TaskByIdInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          return await createTasksService().byId(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    list: protectedProcedure
      .input(TaskListInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          return await createTasksService().list(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    transition: protectedProcedure
      .input(TaskTransitionInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createTasksService().transition(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    assign: protectedProcedure
      .input(TaskAssignInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createTasksService().assign(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    reject: protectedProcedure
      .input(TaskRejectInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createTasksService().reject(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    review: protectedProcedure
      .input(TaskReviewInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createTasksService().review(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    checklistAdd: protectedProcedure
      .input(TaskChecklistAddInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createTasksService().checklistAdd(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    checklistToggle: protectedProcedure
      .input(TaskChecklistToggleInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createTasksService().checklistToggle(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    evidenceAdd: protectedProcedure
      .input(TaskEvidenceAddInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createTasksService().evidenceAdd(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),
  // ── SPEC-006 · timeEntries ────────────────────────────────────────────
  timeEntries: router({
    create: protectedProcedure
      .input(TimeEntryCreateInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createTimeEntriesService().create(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    list: protectedProcedure
      .input(TimeEntryListInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          return await createTimeEntriesService().list(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),
  // ── SPEC-006 · tests ──────────────────────────────────────────────────
  tests: router({
    create: protectedProcedure
      .input(TestCreateInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createTestsService().create(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    transition: protectedProcedure
      .input(TestTransitionInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createTestsService().transition(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    markNotApplicable: protectedProcedure
      .input(TestMarkNotApplicableInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createTestsService().markNotApplicable(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    list: protectedProcedure
      .input(TestListInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          return await createTestsService().list(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),
  // ── SPEC-006 · deliverables ───────────────────────────────────────────
  deliverables: router({
    create: protectedProcedure
      .input(DeliverableCreateInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createDeliverablesService().create(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    transition: protectedProcedure
      .input(DeliverableTransitionInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createDeliverablesService().transition(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    accept: protectedProcedure
      .input(DeliverableAcceptInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createDeliverablesService().accept(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    list: protectedProcedure
      .input(DeliverableListInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          return await createDeliverablesService().list(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),
  // ── SPEC-006 · changeRequests ─────────────────────────────────────────
  changeRequests: router({
    create: protectedProcedure
      .input(ChangeRequestCreateInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createChangeRequestsService().create(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    quote: protectedProcedure
      .input(ChangeRequestQuoteInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createChangeRequestsService().quote(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    authorize: protectedProcedure
      .input(ChangeRequestAuthorizeInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createChangeRequestsService().authorize(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    reject: protectedProcedure
      .input(ChangeRequestRejectInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createChangeRequestsService().reject(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    startImplementation: protectedProcedure
      .input(ChangeRequestAuthorizeInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createChangeRequestsService().startImplementation(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    completeImplementation: protectedProcedure
      .input(ChangeRequestAuthorizeInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createChangeRequestsService().completeImplementation(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    list: protectedProcedure
      .input(ChangeRequestListInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          return await createChangeRequestsService().list(ctx.ctx, compact(input));
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),
  // ── SPEC-006 · cierre técnico (gates) ─────────────────────────────────
  cierre: router({
    closeTechnical: protectedProcedure
      .input(ProjectCloseTechnicalInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await createCierreService().closeTechnical(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
    previewCloseGates: protectedProcedure
      .input(ProjectProgressInputSchema)
      .query(async ({ input, ctx }) => {
        try {
          return await createCierreService().previewCloseGates(ctx.ctx, input);
        } catch (e) {
          throw toTrpcError(e);
        }
      }),
  }),
});
