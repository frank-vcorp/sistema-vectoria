/**
 * Servicio `projects` — SPEC-005 §4.3 (AC-1..AC-5/AC-9).
 *
 * Reglas críticas (no delegables, AC-1):
 *  - `project_creation` es **atómico y universal**: toda OS autorizada
 *    crea proyecto (BR-N407/N03, DEC-FUN-68). En una sola transacción
 *    crea `projects`, inserta `project_members(pl, role='lider')`,
 *    copia `project_scope_snapshots`, carga el esqueleto de la
 *    plantilla en `modules`, vincula la OS y registra `audit_logs`
 *    (BR-N246/N251/N382, DEC-FUN-56).
 *  - El PL queda miembro por construcción; no hay alta posterior
 *    (BR-N382).
 *  - El snapshot es **inmutable** (BR-N251): no se exponen mutators.
 *  - Estados 3D independientes (BR-N253). La salud se calcula y el
 *    PL puede sobreescribirla con motivo (BR-N254).
 *  - Pausar/cancelar con motivo obligatorio (BR-N379).
 *
 * Side-effects:
 *  - Tras `project_creation`, emite `audit.action =
 *    "project.created_from_order"` con payload
 *    `buildProjectCreatedFromOrderEvent` (BR-N247/N407). El servicio
 *    NO llama al servicio de OS (no-acoplamiento inverso, SPEC §14);
 *    SPEC-004 consume el evento en su propio worker y marca
 *    OS→`in_execution` sin esperar esta SPEC.
 *  - Para el cierre técnico futuro (SPEC-006) se define el contrato
 *    `project.delivered_from_order` (no implementado aquí).
 *
 * Permisos:
 *  - `gestionar_proyectos` para crear/transition/pause/cancel/health
 *    override (BR-N244 análogo — el Director es la fuente de autoridad).
 *  - `operar_proyectos` para transiciones laterales del PL/equipo.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import {
  clients,
  modules,
  orders,
  organizations,
  projectMembers,
  projectScopeSnapshots,
  projects,
  scopeDocuments,
  templates,
  users,
} from "@/server/db/schema";
import {
  PROJECT_HEALTHS,
  PROJECT_SITUATIONS,
  PROJECT_STAGES,
  type ModuleStatus,
  type ProjectHealth,
  type ProjectSituation,
  type ProjectStage,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import {
  buildProjectCreatedFromOrderEvent,
  canTransitionProjectStage,
  computeCalculatedHealth,
  nextProjectCode,
  validateHealthOverride,
  validateProjectSituationReason,
} from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectMemberDTO {
  id: string;
  organizationId: string;
  projectId: string;
  userId: string;
  projectRole: string;
  active: boolean;
  assignedAt: Date;
  assignedBy: string | null;
}

export interface ProjectDTO {
  id: string;
  organizationId: string;
  code: string;
  orderId: string;
  clientId: string;
  plUserId: string;
  templateId: string;
  statusStage: ProjectStage;
  statusSituation: ProjectSituation;
  health: ProjectHealth;
  healthCalculated: ProjectHealth;
  healthOverrideReason: string | null;
  pauseReason: string | null;
  cancelReason: string | null;
  planVersion: number;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectDetailDTO extends ProjectDTO {
  members: ProjectMemberDTO[];
  modules: Array<{
    id: string;
    code: string;
    name: string;
    status: ModuleStatus;
    required: boolean;
    dependsOnModules: string[];
    sortOrder: number;
  }>;
}

export interface ProjectsService {
  /**
   * SPEC-005 AC-1 · workflow atómico y universal. Crea proyecto + PL +
   * snapshot + módulos + audit. Si un paso falla, rollback completo.
   * Devuelve el proyecto creado y emite la señal consumible por
   * SPEC-004 (`project.created_from_order`).
   */
  createFromOrder(
    ctx: Context,
    input: { orderId: string; plUserIdOverride?: string | null },
  ): Promise<ProjectDTO>;
  transitionStage(
    ctx: Context,
    input: { projectId: string; targetStage: ProjectStage },
  ): Promise<ProjectDTO>;
  pause(
    ctx: Context,
    input: { projectId: string; reason: string },
  ): Promise<ProjectDTO>;
  resume(ctx: Context, input: { projectId: string }): Promise<ProjectDTO>;
  cancel(
    ctx: Context,
    input: { projectId: string; reason: string },
  ): Promise<ProjectDTO>;
  complete(ctx: Context, input: { projectId: string }): Promise<ProjectDTO>;
  overrideHealth(
    ctx: Context,
    input: { projectId: string; health: ProjectHealth; reason: string },
  ): Promise<ProjectDTO>;
  getById(ctx: Context, projectId: string): Promise<ProjectDetailDTO>;
  list(
    ctx: Context,
    opts: { limit?: number; offset?: number; stage?: ProjectStage; situation?: ProjectSituation },
  ): Promise<{ items: ProjectDTO[]; total: number }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

function stageOf(value: string): ProjectStage {
  return (PROJECT_STAGES as readonly string[]).includes(value)
    ? (value as ProjectStage)
    : "planning";
}
function situationOf(value: string): ProjectSituation {
  return (PROJECT_SITUATIONS as readonly string[]).includes(value)
    ? (value as ProjectSituation)
    : "pending";
}
function healthOf(value: string): ProjectHealth {
  return (PROJECT_HEALTHS as readonly string[]).includes(value)
    ? (value as ProjectHealth)
    : "on_track";
}

function projectToDto(row: typeof projects.$inferSelect): ProjectDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    code: row.code,
    orderId: row.orderId,
    clientId: row.clientId,
    plUserId: row.plUserId,
    templateId: row.templateId,
    statusStage: stageOf(row.statusStage),
    statusSituation: situationOf(row.statusSituation),
    health: healthOf(row.health),
    healthCalculated: healthOf(row.healthCalculated),
    healthOverrideReason: row.healthOverrideReason,
    pauseReason: row.pauseReason,
    cancelReason: row.cancelReason,
    planVersion: row.planVersion,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function memberToDto(row: typeof projectMembers.$inferSelect): ProjectMemberDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    userId: row.userId,
    projectRole: row.projectRole,
    active: row.active,
    assignedAt: row.assignedAt,
    assignedBy: row.assignedBy,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Servicio
// ─────────────────────────────────────────────────────────────────────────────

export function createProjectsService(): ProjectsService {
  const db = getDb();

  async function nextCode(orgId: string): Promise<string> {
    return nextProjectCode(orgId, {
      async selectMax(orgId: string) {
        const [row] = await db
          .select({ code: sql<string>`max(code)` })
          .from(projects)
          .where(eq(projects.organizationId, orgId));
        return row?.code ?? null;
      },
    });
  }

  async function recalcHealth(
    tx: ReturnType<typeof getDb>,
    orgId: string,
    projectId: string,
  ): Promise<ProjectHealth> {
    const moduleRows = await tx
      .select({ status: modules.status, required: modules.required })
      .from(modules)
      .where(
        and(eq(modules.organizationId, orgId), eq(modules.projectId, projectId)),
      );
    const newCalc = computeCalculatedHealth(
      moduleRows.map((m) => ({ status: m.status, required: m.required })),
    );
    // Si NO hay override manual con motivo, sincronizamos `health`.
    await tx
      .update(projects)
      .set({ healthCalculated: newCalc })
      .where(
        and(
          eq(projects.organizationId, orgId),
          eq(projects.id, projectId),
        ),
      );
    return newCalc;
  }

  async function createFromOrder(
    ctx: Context,
    input: { orderId: string; plUserIdOverride?: string | null },
  ): Promise<ProjectDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_proyectos", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      // 1) OS existe, pertenece a la org y está en `authorized_to_start`
      //    (BR-N407: `project_creation` se dispara tras autorizar).
      const [order] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!order) {
        throw new DomainError("ORDER_NOT_FOUND", "Orden de Servicio no encontrada", 404);
      }
      if (order.status !== "authorized_to_start") {
        throw new DomainError(
          "ORDER_NOT_AUTHORIZABLE",
          `La OS debe estar en authorized_to_start (actual: ${order.status})`,
          409,
        );
      }
      if (!order.plUserId) {
        // Defensa (BR-N245): una OS sin PL no debería llegar aquí, pero
        // la SPEC-005 lo rechaza explícitamente (AC-6).
        throw new DomainError("PL_NOT_ASSIGNED", "PL no asignado a la OS", 409);
      }
      // 2) Defensa: 1 proyecto por OS (UNIQUE ya captura, pero emitimos
      //    código explícito).
      const existing = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.organizationId, user.organization_id),
            eq(projects.orderId, order.id),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        throw new DomainError(
          "PROJECT_ALREADY_EXISTS_FOR_ORDER",
          "La OS ya tiene proyecto",
          409,
        );
      }
      // 3) Cliente existe en la org (defensa).
      const [clientRow] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(
          and(
            eq(clients.id, order.clientId),
            eq(clients.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!clientRow) {
        throw new DomainError("CLIENT_NOT_FOUND", "Cliente no encontrado", 404);
      }
      // 4) Recuperar plantilla + scope desde la cotización aceptada
      //    (el contrato `os.authorized_to_start` no expone template_id;
      //    SPEC-005 deduce ambos vía `quotes.scope_id`).
      const { quotes } = await import("@/server/db/schema");
      const [quote] = await tx
        .select()
        .from(quotes)
        .where(
          and(
            eq(quotes.organizationId, user.organization_id),
            eq(quotes.id, order.cotizacionId),
          ),
        )
        .limit(1);
      if (!quote) {
        throw new DomainError("QUOTE_NOT_FOUND", "Cotización no encontrada", 404);
      }
      const [scope] = await tx
        .select()
        .from(scopeDocuments)
        .where(eq(scopeDocuments.id, quote.scopeId))
        .limit(1);
      if (!scope) {
        throw new DomainError("SCOPE_NOT_FOUND", "Alcance no encontrado", 404);
      }
      const [tplRow] = await tx
        .select()
        .from(templates)
        .where(
          and(
            eq(templates.organizationId, user.organization_id),
            eq(templates.id, scope.templateId),
            eq(templates.active, true),
          ),
        )
        .limit(1);
      if (!tplRow) {
        // El sistema exige plantilla activa (DEC-FUN-23, BR-N220/N229).
        throw new DomainError(
          "TEMPLATE_NOT_FOUND",
          "Plantilla no disponible para derivar el esqueleto",
          409,
        );
      }
      // Snapshot inmutable del alcance vendido (BR-N251): copia del
      // `scope_documents.content` del alcance firmado. Si no hay
      // scope, fallback al `sold_scope_snapshot` de la OS.
      const scopeSource =
        (scope.content as Record<string, unknown>) ??
        (order.soldScopeSnapshot as Record<string, unknown>) ??
        {};
      const plUserIdFinal =
        input.plUserIdOverride && input.plUserIdOverride.length > 0
          ? input.plUserIdOverride
          : order.plUserId;
      // 5) Insertar `projects`.
      const code = await nextCode(user.organization_id);
      const [project] = await tx
        .insert(projects)
        .values({
          organizationId: user.organization_id,
          code,
          orderId: order.id,
          clientId: order.clientId,
          plUserId: plUserIdFinal,
          templateId: tplRow.id,
          statusStage: "planning",
          statusSituation: "pending",
          health: "on_track",
          healthCalculated: "on_track",
          planVersion: 1,
          createdBy: user.id,
        })
        .returning();
      if (!project) throw new Error("project insert sin fila");
      // 6) Insertar `project_members(pl, role='lider')` por
      //    construcción (BR-N382, DEC-FUN-56).
      await tx.insert(projectMembers).values({
        organizationId: user.organization_id,
        projectId: project.id,
        userId: plUserIdFinal,
        projectRole: "lider",
        assignedBy: user.id,
        active: true,
      });
      // 7) Copia inmutable del snapshot del alcance (BR-N251).
      await tx.insert(projectScopeSnapshots).values({
        organizationId: user.organization_id,
        projectId: project.id,
        scopeJson: scopeSource,
        sourceScopeId: scope.id,
      });
      // 8) Cargar el esqueleto desde la plantilla (BR-N229, BR-N260).
      const tplContent =
        (tplRow.content as { project_modules?: unknown })?.project_modules ?? [];
      const tplModules = Array.isArray(tplContent) ? tplContent : [];
      for (let i = 0; i < tplModules.length; i++) {
        const tm = tplModules[i] as {
          code?: string;
          name?: string;
          required?: boolean;
          depends_on_modules?: string[];
        };
        if (!tm?.code || !tm?.name) continue;
        await tx.insert(modules).values({
          organizationId: user.organization_id,
          projectId: project.id,
          code: tm.code,
          name: tm.name,
          status: "pending",
          required: !!tm.required,
          dependsOnModules: tm.depends_on_modules ?? [],
          sortOrder: i,
        });
      }
      // 9) Audit `project.create` (BR-N336).
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "project",
        entityId: project.id,
        action: "project.create",
        after: {
          code: project.code,
          orderId: project.orderId,
          clientId: project.clientId,
          plUserId: project.plUserId,
          templateId: project.templateId,
          statusStage: project.statusStage,
          statusSituation: project.statusSituation,
          modulesLoaded: tplModules.length,
        },
        ...(ctx.actorRoleCode !== undefined ? { actorRoleCode: ctx.actorRoleCode } : {}),
      });
      // 10) Señal consumible por SPEC-004 (`os.authorized_to_start` →
      //     `in_execution`): evento `project.created_from_order`
      //     (BR-N247/N407). No mutamos la OS desde aquí (no-acoplamiento
      //     inverso, SPEC §14).
      await createAuditService().record(ctx, {
        entityType: "project",
        entityId: project.id,
        action: "project.created_from_order",
        after: buildProjectCreatedFromOrderEvent({
          projectId: project.id,
          organizationId: project.organizationId,
          orderId: project.orderId,
          plUserId: project.plUserId,
          tipoCobro: order.tipoCobro as
            | "pago_unico"
            | "mensualidades"
            | "suscripcion",
          templateId: project.templateId,
          templateType: tplRow.type,
          planVersion: project.planVersion,
          createdAt: project.createdAt,
        }),
        ...(ctx.actorRoleCode !== undefined ? { actorRoleCode: ctx.actorRoleCode } : {}),
      });
      // Unused locals (placeholders eliminados).
      void organizations;
      void users;
      return projectToDto(project);
    });
  }

  async function transitionStage(
    ctx: Context,
    input: { projectId: string; targetStage: ProjectStage },
  ): Promise<ProjectDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_proyectos", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("PROJECT_NOT_FOUND", "Proyecto no encontrado", 404);
      }
      if (before.statusSituation === "cancelled") {
        throw new DomainError(
          "PROJECT_INVALID_TRANSITION",
          "Proyecto cancelado (terminal)",
          409,
        );
      }
      const t = canTransitionProjectStage(before.statusStage, input.targetStage);
      if (!t.ok) {
        throw new DomainError(
          t.code,
          `Transición inválida (${before.statusStage} → ${input.targetStage})`,
          409,
        );
      }
      // Si la situación es `paused`, sólo `resume` la saca (este
      // servicio NO expone transición de etapa con `paused` activa).
      if (before.statusSituation === "paused") {
        throw new DomainError(
          "PROJECT_INVALID_TRANSITION",
          "Proyecto pausado; reanúdalo antes de cambiar etapa",
          409,
        );
      }
      const [after] = await tx
        .update(projects)
        .set({ statusStage: input.targetStage })
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("project transition sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "project",
        entityId: after.id,
        action: "project.transition_stage",
        before: { statusStage: before.statusStage },
        after: { statusStage: after.statusStage },
      });
      return projectToDto(after);
    });
  }

  async function pause(
    ctx: Context,
    input: { projectId: string; reason: string },
  ): Promise<ProjectDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "operar_proyectos", {
      forceDb: true,
    });
    const r = validateProjectSituationReason(input.reason, "pause");
    if (!r.ok) {
      throw new DomainError(r.code, "Motivo obligatorio (≥3 caracteres)", 400);
    }
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("PROJECT_NOT_FOUND", "Proyecto no encontrado", 404);
      }
      if (before.statusSituation === "paused") {
        throw new DomainError(
          "PROJECT_INVALID_TRANSITION",
          "Proyecto ya pausado",
          409,
        );
      }
      if (before.statusSituation === "cancelled") {
        throw new DomainError(
          "PROJECT_INVALID_TRANSITION",
          "Proyecto cancelado",
          409,
        );
      }
      const [after] = await tx
        .update(projects)
        .set({
          statusSituation: "paused",
          pauseReason: input.reason.trim(),
        })
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("project pause sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "project",
        entityId: after.id,
        action: "project.pause",
        before: { statusSituation: before.statusSituation },
        after: {
          statusSituation: after.statusSituation,
          pauseReason: after.pauseReason,
        },
      });
      return projectToDto(after);
    });
  }

  async function resume(
    ctx: Context,
    input: { projectId: string },
  ): Promise<ProjectDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "operar_proyectos", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("PROJECT_NOT_FOUND", "Proyecto no encontrado", 404);
      }
      if (before.statusSituation !== "paused") {
        throw new DomainError(
          "PROJECT_INVALID_TRANSITION",
          `El proyecto no está pausado (actual: ${before.statusSituation})`,
          409,
        );
      }
      const [after] = await tx
        .update(projects)
        .set({ statusSituation: "active", pauseReason: null })
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("project resume sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "project",
        entityId: after.id,
        action: "project.resume",
        before: { statusSituation: before.statusSituation },
        after: { statusSituation: after.statusSituation, pauseReason: null },
      });
      return projectToDto(after);
    });
  }

  async function cancel(
    ctx: Context,
    input: { projectId: string; reason: string },
  ): Promise<ProjectDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_proyectos", {
      forceDb: true,
    });
    const r = validateProjectSituationReason(input.reason, "cancel");
    if (!r.ok) {
      throw new DomainError(r.code, "Motivo obligatorio (≥3 caracteres)", 400);
    }
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("PROJECT_NOT_FOUND", "Proyecto no encontrado", 404);
      }
      if (before.statusSituation === "cancelled") {
        throw new DomainError(
          "PROJECT_INVALID_TRANSITION",
          "Proyecto ya cancelado",
          409,
        );
      }
      const [after] = await tx
        .update(projects)
        .set({
          statusSituation: "cancelled",
          cancelReason: input.reason.trim(),
          cancelledAt: new Date(),
        })
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("project cancel sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "project",
        entityId: after.id,
        action: "project.cancel",
        before: { statusSituation: before.statusSituation },
        after: {
          statusSituation: after.statusSituation,
          cancelReason: after.cancelReason,
          cancelledAt: after.cancelledAt,
        },
      });
      return projectToDto(after);
    });
  }

  /**
   * SPEC-005 / DEC-FUN-59 · `deployed` cierre técnico del proyecto.
   * Sólo se permite si todos los módulos requeridos están `deployed`
   * y la situación es `active`. La situación pasa a `completed` y se
   * setea `completedAt`. El evento consumible por SPEC-004 para
   * OS→`delivered` lo emite SPEC-006 en su propio flujo
   * (`project.delivered_from_order`).
   */
  async function complete(
    ctx: Context,
    input: { projectId: string },
  ): Promise<ProjectDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_proyectos", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("PROJECT_NOT_FOUND", "Proyecto no encontrado", 404);
      }
      if (before.statusSituation === "cancelled") {
        throw new DomainError(
          "PROJECT_INVALID_TRANSITION",
          "Proyecto cancelado",
          409,
        );
      }
      if (before.statusSituation === "completed") {
        throw new DomainError(
          "PROJECT_INVALID_TRANSITION",
          "Proyecto ya completado",
          409,
        );
      }
      // Defensa: todos los módulos requeridos deben estar `deployed`.
      const requiredRows = await tx
        .select({ status: modules.status, required: modules.required })
        .from(modules)
        .where(
          and(
            eq(modules.organizationId, user.organization_id),
            eq(modules.projectId, input.projectId),
          ),
        );
      const missingRequired = requiredRows.filter(
        (m) => m.required && m.status !== "deployed",
      );
      if (missingRequired.length > 0) {
        throw new DomainError(
          "MODULE_DEPLOY_GATES",
          `Hay ${missingRequired.length} módulo(s) requerido(s) sin desplegar`,
          409,
        );
      }
      const newCalc = await recalcHealth(tx, user.organization_id, input.projectId);
      const [after] = await tx
        .update(projects)
        .set({
          statusSituation: "completed",
          statusStage: "delivery",
          completedAt: new Date(),
          healthCalculated: newCalc,
        })
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("project complete sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "project",
        entityId: after.id,
        action: "project.complete",
        before: { statusStage: before.statusStage, statusSituation: before.statusSituation },
        after: {
          statusStage: after.statusStage,
          statusSituation: after.statusSituation,
          completedAt: after.completedAt,
          modulesRequiredDeployed: requiredRows.length - missingRequired.length,
        },
      });
      return projectToDto(after);
    });
  }

  async function overrideHealth(
    ctx: Context,
    input: { projectId: string; health: ProjectHealth; reason: string },
  ): Promise<ProjectDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "operar_proyectos", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("PROJECT_NOT_FOUND", "Proyecto no encontrado", 404);
      }
      const v = validateHealthOverride({
        health: input.health,
        healthCalculated: before.healthCalculated,
        reason: input.reason,
      });
      if (!v.ok) {
        throw new DomainError(
          v.code,
          "Motivo obligatorio o override redundante",
          400,
        );
      }
      const [after] = await tx
        .update(projects)
        .set({
          health: input.health,
          healthOverrideReason: input.reason.trim(),
        })
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("project health override sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "project",
        entityId: after.id,
        action: "project.health_override",
        before: {
          health: before.health,
          healthCalculated: before.healthCalculated,
        },
        after: {
          health: after.health,
          healthCalculated: after.healthCalculated,
          reason: after.healthOverrideReason,
        },
      });
      return projectToDto(after);
    });
  }

  async function getById(
    ctx: Context,
    projectId: string,
  ): Promise<ProjectDetailDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_proyectos", {
      forceDb: true,
    });
    const [project] = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!project) {
      throw new DomainError("PROJECT_NOT_FOUND", "Proyecto no encontrado", 404);
    }
    const memberRows = await db
      .select()
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.organizationId, user.organization_id),
          eq(projectMembers.projectId, projectId),
        ),
      );
    const moduleRows = await db
      .select()
      .from(modules)
      .where(
        and(
          eq(modules.organizationId, user.organization_id),
          eq(modules.projectId, projectId),
        ),
      )
      .orderBy(asc(modules.sortOrder));
    return {
      ...projectToDto(project),
      members: memberRows.map(memberToDto),
      modules: moduleRows.map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        status: m.status as ModuleStatus,
        required: m.required,
        dependsOnModules: (m.dependsOnModules ?? []) as string[],
        sortOrder: m.sortOrder,
      })),
    };
  }

  async function list(
    ctx: Context,
    opts: { limit?: number; offset?: number; stage?: ProjectStage; situation?: ProjectSituation },
  ): Promise<{ items: ProjectDTO[]; total: number }> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_proyectos", {
      forceDb: true,
    });
    const limit = Math.max(1, Math.min(200, opts.limit ?? 50));
    const offset = Math.max(0, opts.offset ?? 0);
    const where = [eq(projects.organizationId, user.organization_id)];
    if (opts.stage) where.push(eq(projects.statusStage, opts.stage));
    if (opts.situation) where.push(eq(projects.statusSituation, opts.situation));
    const [totalRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(projects)
      .where(and(...where));
    const rows = await db
      .select()
      .from(projects)
      .where(and(...where))
      .orderBy(desc(projects.createdAt))
      .limit(limit)
      .offset(offset);
    return { items: rows.map(projectToDto), total: totalRow?.c ?? 0 };
  }

  return {
    createFromOrder,
    transitionStage,
    pause,
    resume,
    cancel,
    complete,
    overrideHealth,
    getById,
    list,
  };
}

/**
 * SPEC-005 AC-6 / BR-N398 · API para que SPEC-006 notifique el cierre
 * técnico del proyecto (`project.delivered_from_order`). El evento lo
 * emite SPEC-006 en su propia transacción (no desde aquí, para no
 * acoplar inversamente). Esta función sólo persiste la **bitácora**
 * del evento cuando se llama desde un flujo orquestado por el
 * servicio de OS. **NO** se invoca desde la UI ni desde el servicio
 * de proyectos directamente.
 */
export interface TechnicalClosureSignalInput {
  projectId: string;
  organizationId: string;
  orderId: string;
  actorUserId: string | null;
}

export async function recordProjectDeliveredSignal(
  ctx: Context,
  input: TechnicalClosureSignalInput,
): Promise<void> {
  const { createAuditService } = await import("@/server/services/audit");
  await createAuditService().record(ctx, {
    entityType: "project",
    entityId: input.projectId,
    action: "project.delivered_from_order",
    after: {
      projectId: input.projectId,
      orderId: input.orderId,
      organizationId: input.organizationId,
      consumers: {
        osMarkDelivered: "SPEC-004 (delivered, BR-N248/N392)",
      },
    },
  });
  // Track json_discovery_imports (no-op update; sólo marcamos la última
  // versión importada para trazabilidad).
  const { getDb } = await import("@/server/db/client");
  const { desc, eq, and } = await import("drizzle-orm");
  const { jsonDiscoveryImports } = await import("@/server/db/schema");
  const db = getDb();
  void db
    .select({ id: jsonDiscoveryImports.id })
    .from(jsonDiscoveryImports)
    .where(
      and(
        eq(jsonDiscoveryImports.organizationId, input.organizationId),
        eq(jsonDiscoveryImports.projectId, input.projectId),
      ),
    )
    .orderBy(desc(jsonDiscoveryImports.importedAt))
    .limit(1);
}

// Re-export helpers used elsewhere.
export { desc, eq };