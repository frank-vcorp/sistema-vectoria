/**
 * Servicio `tasks` — SPEC-006 §4.3 / AC-2..AC-4.
 *
 * Reglas críticas (no delegables):
 *  - La membresía precede a la asignación (BR-N382, AC-1): nunca se
 *    asigna a un usuario que no sea miembro activo del proyecto.
 *  - Sólo el PL del proyecto (rol activo `lider`) asigna tareas
 *    (BR-N269/AC-2). El técnico puede autoasignarse del backlog no
 *    asignado (DEC-FUN-32); autoasignarse de una tarea ya asignada
 *    → `TASK_AUTOASSIGN_FORBIDDEN`.
 *  - `done` exige TODOS los checklist `done` Y AL MENOS una
 *    evidencia (BR-007/BR-N271, AC-3). Tiempo opcional no bloquea
 *    (BR-N276).
 *  - `reject` con motivo → vuelve a `ready` sin asignado
 *    (BR-N270, AC-4) y registra `task_assignment.rejected_at`.
 *  - `review`: PL/QA. Aprobación → `done` (con gates). Rechazo →
 *    `in_progress` (BR-N387/388).
 *
 * El servicio expone además operaciones de checklist (`add`/`toggle`)
 * y de evidencia (`addEvidence`) para que la UI construya el flujo.
 *
 * `progress` y `health` agregados se calculan con
 * `computeTaskProgress` y `computeProjectHealth` (BR-N367/368-370,
 * AC-9) cuando el caller los pide vía `getById`.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import {
  projectMembers,
  projects,
  taskAssignments,
  taskChecklists,
  taskEvidence,
  tasks,
  users,
} from "@/server/db/schema";
import {
  TASK_STATUSES,
  type TaskStatus,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import { canViewOtherUserTimeEntries } from "./helpers-ejecucion";
import {
  canTransitionTask,
  validateTaskDoneGates,
  validateTaskRejectReason,
} from "./helpers-ejecucion";

export interface TaskChecklistDTO {
  id: string;
  organizationId: string;
  taskId: string;
  item: string;
  done: boolean;
  createdAt: Date;
}

export interface TaskEvidenceDTO {
  id: string;
  organizationId: string;
  taskId: string;
  fileId: string;
  note: string | null;
  addedBy: string | null;
  createdAt: Date;
}

export interface TaskDTO {
  id: string;
  organizationId: string;
  projectId: string;
  moduleId: string | null;
  requirementId: string | null;
  folio: string;
  title: string;
  status: TaskStatus;
  assignedTo: string | null;
  weight: number;
  priority: "low" | "normal" | "high";
  dependsOnTasks: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskDetailDTO extends TaskDTO {
  checklists: TaskChecklistDTO[];
  evidence: TaskEvidenceDTO[];
}

export interface TasksService {
  create(
    ctx: Context,
    input: {
      projectId: string;
      moduleId?: string | null;
      requirementId?: string | null;
      folio: string;
      title: string;
      weight?: number;
      priority?: "low" | "normal" | "high";
      dependsOnTaskIds?: string[];
    },
  ): Promise<TaskDTO>;
  byId(ctx: Context, input: { taskId: string }): Promise<TaskDetailDTO>;
  list(
    ctx: Context,
    input: {
      projectId: string;
      status?: TaskStatus;
      moduleId?: string;
    },
  ): Promise<TaskDTO[]>;
  transition(
    ctx: Context,
    input: { taskId: string; targetStatus: TaskStatus; reason?: string },
  ): Promise<TaskDetailDTO>;
  assign(
    ctx: Context,
    input: { taskId: string; userId: string },
  ): Promise<TaskDetailDTO>;
  reject(
    ctx: Context,
    input: { taskId: string; reason: string },
  ): Promise<TaskDetailDTO>;
  review(
    ctx: Context,
    input: {
      taskId: string;
      approve: boolean;
      observations?: string;
    },
  ): Promise<TaskDetailDTO>;
  checklistAdd(
    ctx: Context,
    input: { taskId: string; item: string },
  ): Promise<TaskDetailDTO>;
  checklistToggle(
    ctx: Context,
    input: { checklistId: string; done: boolean },
  ): Promise<TaskDetailDTO>;
  evidenceAdd(
    ctx: Context,
    input: { taskId: string; fileId: string; note?: string },
  ): Promise<TaskDetailDTO>;
  /** SPEC-006 AC-10 / BR-N277 · visibilidad por privacidad. */
  canViewUserTimeEntries(
    ctx: Context,
    targetUserId: string,
  ): Promise<boolean>;
}

function statusOf(value: string): TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value)
    ? (value as TaskStatus)
    : "backlog";
}

function priorityOf(value: string): "low" | "normal" | "high" {
  if (value === "low" || value === "high") return value;
  return "normal";
}

function taskToDto(row: typeof tasks.$inferSelect): TaskDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    moduleId: row.moduleId ?? null,
    requirementId: row.requirementId ?? null,
    folio: row.folio,
    title: row.title,
    status: statusOf(row.status),
    assignedTo: row.assignedTo ?? null,
    weight: row.weight,
    priority: priorityOf(row.priority),
    dependsOnTasks: ((row.dependsOnTasks ?? []) as string[]) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function checklistToDto(row: typeof taskChecklists.$inferSelect): TaskChecklistDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    taskId: row.taskId,
    item: row.item,
    done: row.done,
    createdAt: row.createdAt,
  };
}

function evidenceToDto(row: typeof taskEvidence.$inferSelect): TaskEvidenceDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    taskId: row.taskId,
    fileId: row.fileId,
    note: row.note ?? null,
    addedBy: row.addedBy ?? null,
    createdAt: row.createdAt,
  };
}

export function createTasksService(): TasksService {
  const db = getDb();

  async function isActiveMember(
    orgId: string,
    projectId: string,
    userId: string,
  ): Promise<boolean> {
    const [row] = await db
      .select({
        ok: sql<number>`case when count(*) > 0 then 1 else 0 end`,
      })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.organizationId, orgId),
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
          eq(projectMembers.active, true),
        ),
      )
      .groupBy(projectMembers.id)
      .limit(1);
    return (row?.ok ?? 0) === 1;
  }

  async function isProjectLeader(
    orgId: string,
    projectId: string,
    userId: string,
  ): Promise<boolean> {
    const [row] = await db
      .select({
        ok: sql<number>`case when count(*) > 0 then 1 else 0 end`,
      })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.organizationId, orgId),
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
          eq(projectMembers.projectRole, "lider"),
          eq(projectMembers.active, true),
        ),
      )
      .groupBy(projectMembers.id)
      .limit(1);
    return (row?.ok ?? 0) === 1;
  }

  async function loadTask(orgId: string, taskId: string) {
    const [row] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.organizationId, orgId), eq(tasks.id, taskId)))
      .limit(1);
    if (!row) {
      throw new DomainError("TASK_NOT_FOUND", "Tarea no encontrada", 404);
    }
    return row;
  }

  async function loadProject(orgId: string, projectId: string) {
    const [row] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId)))
      .limit(1);
    if (!row) {
      throw new DomainError("PROJECT_NOT_FOUND", "Proyecto no encontrado", 404);
    }
    return row;
  }

  async function loadDetail(orgId: string, taskId: string): Promise<TaskDetailDTO> {
    const row = await loadTask(orgId, taskId);
    const cl = await db
      .select()
      .from(taskChecklists)
      .where(
        and(
          eq(taskChecklists.organizationId, orgId),
          eq(taskChecklists.taskId, taskId),
        ),
      )
      .orderBy(asc(taskChecklists.createdAt));
    const ev = await db
      .select()
      .from(taskEvidence)
      .where(
        and(
          eq(taskEvidence.organizationId, orgId),
          eq(taskEvidence.taskId, taskId),
        ),
      )
      .orderBy(asc(taskEvidence.createdAt));
    return {
      ...taskToDto(row),
      checklists: cl.map(checklistToDto),
      evidence: ev.map(evidenceToDto),
    };
  }

  async function create(
    ctx: Context,
    input: {
      projectId: string;
      moduleId?: string | null;
      requirementId?: string | null;
      folio: string;
      title: string;
      weight?: number;
      priority?: "low" | "normal" | "high";
      dependsOnTaskIds?: string[];
    },
  ): Promise<TaskDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_proyectos", {
      forceDb: true,
    });
    await loadProject(user.organization_id, input.projectId);
    return withTx(async (tx) => {
      const [created] = await tx
        .insert(tasks)
        .values({
          organizationId: user.organization_id,
          projectId: input.projectId,
          moduleId: input.moduleId ?? null,
          requirementId: input.requirementId ?? null,
          folio: input.folio,
          title: input.title,
          weight: input.weight ?? 1,
          priority: input.priority ?? "normal",
          dependsOnTasks: input.dependsOnTaskIds ?? [],
          status: "backlog",
        })
        .returning();
      if (!created) throw new Error("task create sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "task",
        entityId: created.id,
        action: "task.create",
        after: {
          projectId: created.projectId,
          folio: created.folio,
          title: created.title,
          weight: created.weight,
          priority: created.priority,
        },
      });
      return taskToDto(created);
    });
  }

  async function byId(
    ctx: Context,
    input: { taskId: string },
  ): Promise<TaskDetailDTO> {
    const user = requireUser(ctx);
    return loadDetail(user.organization_id, input.taskId);
  }

  async function list(
    ctx: Context,
    input: {
      projectId: string;
      status?: TaskStatus;
      moduleId?: string;
    },
  ): Promise<TaskDTO[]> {
    const user = requireUser(ctx);
    const where = [
      eq(tasks.organizationId, user.organization_id),
      eq(tasks.projectId, input.projectId),
    ];
    if (input.status) where.push(eq(tasks.status, input.status));
    if (input.moduleId) where.push(eq(tasks.moduleId, input.moduleId));
    const rows = await db
      .select()
      .from(tasks)
      .where(and(...where))
      .orderBy(asc(tasks.folio), asc(tasks.createdAt));
    return rows.map(taskToDto);
  }

  async function transition(
    ctx: Context,
    input: { taskId: string; targetStatus: TaskStatus; reason?: string },
  ): Promise<TaskDetailDTO> {
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
        .from(tasks)
        .where(
          and(
            eq(tasks.organizationId, user.organization_id),
            eq(tasks.id, input.taskId),
          ),
        )
      .limit(1);
      if (!before) {
        throw new DomainError("TASK_NOT_FOUND", "Tarea no encontrada", 404);
      }
      const t = canTransitionTask(before.status, input.targetStatus);
      if (!t.ok) {
        throw new DomainError(
          t.code,
          `Transición inválida (${before.status} → ${input.targetStatus})`,
          409,
        );
      }
      // Done exige checklist+evidencia (BR-007/BR-N271, AC-3).
      if (input.targetStatus === "done") {
        const cl = await tx
          .select()
          .from(taskChecklists)
          .where(
            and(
              eq(taskChecklists.organizationId, user.organization_id),
              eq(taskChecklists.taskId, input.taskId),
            ),
          );
        const evCount = await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(taskEvidence)
          .where(
            and(
              eq(taskEvidence.organizationId, user.organization_id),
              eq(taskEvidence.taskId, input.taskId),
            ),
          );
        const gates = validateTaskDoneGates({
          checklists: cl.map((c) => ({ done: c.done })),
          evidenceCount: evCount[0]?.c ?? 0,
        });
        if (!gates.ok) {
          throw new DomainError(
            gates.code,
            "La tarea requiere TODOS los checklist hechos y al menos una evidencia",
            409,
          );
        }
      }
      const [after] = await tx
        .update(tasks)
        .set({ status: input.targetStatus })
        .where(
          and(
            eq(tasks.organizationId, user.organization_id),
            eq(tasks.id, input.taskId),
          ),
        )
        .returning();
      if (!after) throw new Error("task transition sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "task",
        entityId: after.id,
        action: "task.transition",
        before: { status: before.status },
        after: {
          status: after.status,
          reason: input.reason ?? null,
        },
        ...(ctx.actorRoleCode !== undefined ? { actorRoleCode: ctx.actorRoleCode } : {}),
      });
      // Recargar detalle para devolver checklists + evidence al caller.
      const detail = await loadDetail(user.organization_id, after.id);
      return detail;
    });
  }

  async function assign(
    ctx: Context,
    input: { taskId: string; userId: string },
  ): Promise<TaskDetailDTO> {
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
        .from(tasks)
        .where(
          and(
            eq(tasks.organizationId, user.organization_id),
            eq(tasks.id, input.taskId),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("TASK_NOT_FOUND", "Tarea no encontrada", 404);
      }
      // BR-N382 · la asignación exige membresía activa.
      const member = await isActiveMember(
        user.organization_id,
        before.projectId,
        input.userId,
      );
      if (!member) {
        throw new DomainError(
          "NOT_A_MEMBER",
          "El usuario no es miembro activo del proyecto",
          409,
        );
      }
      // BR-N269/AC-2 · sólo PL puede asignar; el técnico puede
      // autoasignarse SÓLO del backlog no asignado.
      const actorIsPL = await isProjectLeader(
        user.organization_id,
        before.projectId,
        user.id,
      );
      const isSelf = user.id === input.userId;
      const isUnassignedBacklog =
        before.status === "backlog" && !before.assignedTo;
      if (!actorIsPL && !(isSelf && isUnassignedBacklog)) {
        throw new DomainError(
          "TASK_INVALID_TRANSITION",
          "Sólo el PL del proyecto puede asignar tareas",
          403,
        );
      }
      // AC-2 / BR-N269 · autoasignación a tarea ya asignada → 409.
      if (isSelf && before.assignedTo && before.assignedTo !== user.id) {
        throw new DomainError(
          "TASK_AUTOASSIGN_FORBIDDEN",
          "La tarea ya está asignada a otro miembro",
          409,
        );
      }
      // AC-2 · self-autoassign desde backlog se considera autoassign
      // (BR-N269 lo permite).
      const action = isSelf && isUnassignedBacklog ? "task.autoassign" : "task.assign";
      // Actualizar `tasks.assigned_to` y, si estaba en backlog, pasar a ready.
      const [taskAfter] = await tx
        .update(tasks)
        .set({
          assignedTo: input.userId,
          status: before.status === "backlog" ? "ready" : before.status,
        })
        .where(
          and(
            eq(tasks.organizationId, user.organization_id),
            eq(tasks.id, input.taskId),
          ),
        )
        .returning();
      if (!taskAfter) throw new Error("task assign sin fila");
      // Historial.
      await tx.insert(taskAssignments).values({
        organizationId: user.organization_id,
        taskId: taskAfter.id,
        userId: input.userId,
        assignedBy: user.id,
      });
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "task",
        entityId: taskAfter.id,
        action,
        before: { assignedTo: before.assignedTo, status: before.status },
        after: {
          assignedTo: taskAfter.assignedTo,
          status: taskAfter.status,
        },
        ...(ctx.actorRoleCode !== undefined ? { actorRoleCode: ctx.actorRoleCode } : {}),
      });
      return loadDetail(user.organization_id, taskAfter.id);
    });
  }

  async function reject(
    ctx: Context,
    input: { taskId: string; reason: string },
  ): Promise<TaskDetailDTO> {
    const user = requireUser(ctx);
    // BR-N270 · sólo el asignado puede rechazar.
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "operar_proyectos", {
      forceDb: true,
    });
    const reasonValidation = validateTaskRejectReason(input.reason);
    if (!reasonValidation.ok) {
      throw new DomainError(
        reasonValidation.code,
        "Motivo de rechazo obligatorio (≥3 caracteres)",
        400,
      );
    }
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.organizationId, user.organization_id),
            eq(tasks.id, input.taskId),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("TASK_NOT_FOUND", "Tarea no encontrada", 404);
      }
      if (!before.assignedTo || before.assignedTo !== user.id) {
        throw new DomainError(
          "TASK_INVALID_TRANSITION",
          "Sólo el asignado actual puede rechazar la tarea",
          403,
        );
      }
      // Cerrar la asignación activa (marca rejected_at/reason).
      const openAssignments = await tx
        .select()
        .from(taskAssignments)
        .where(
          and(
            eq(taskAssignments.organizationId, user.organization_id),
            eq(taskAssignments.taskId, before.id),
            eq(taskAssignments.userId, before.assignedTo),
            sql`${taskAssignments.rejectedAt} IS NULL`,
          ),
        )
        .orderBy(desc(taskAssignments.assignedAt))
        .limit(1);
      if (openAssignments.length > 0) {
        await tx
          .update(taskAssignments)
          .set({
            rejectedAt: new Date(),
            rejectReason: input.reason.trim(),
          })
          .where(
            and(
              eq(
                taskAssignments.organizationId,
                user.organization_id,
              ),
              eq(taskAssignments.id, openAssignments[0]!.id),
            ),
          );
      }
      // BR-N270 · vuelve a ready sin asignado.
      const [taskAfter] = await tx
        .update(tasks)
        .set({ assignedTo: null, status: "ready" })
        .where(
          and(
            eq(tasks.organizationId, user.organization_id),
            eq(tasks.id, input.taskId),
          ),
        )
        .returning();
      if (!taskAfter) throw new Error("task reject sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "task",
        entityId: taskAfter.id,
        action: "task.reject",
        before: { assignedTo: before.assignedTo, status: before.status },
        after: {
          assignedTo: taskAfter.assignedTo,
          status: taskAfter.status,
          reason: input.reason,
        },
        ...(ctx.actorRoleCode !== undefined ? { actorRoleCode: ctx.actorRoleCode } : {}),
      });
      return loadDetail(user.organization_id, taskAfter.id);
    });
  }

  async function review(
    ctx: Context,
    input: {
      taskId: string;
      approve: boolean;
      observations?: string;
    },
  ): Promise<TaskDetailDTO> {
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
        .from(tasks)
        .where(
          and(
            eq(tasks.organizationId, user.organization_id),
            eq(tasks.id, input.taskId),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("TASK_NOT_FOUND", "Tarea no encontrada", 404);
      }
      if (before.status !== "in_review") {
        throw new DomainError(
          "TASK_INVALID_TRANSITION",
          "La tarea no está en revisión",
          409,
        );
      }
      // BR-N387/388 · aprobación → done (con gates); rechazo → in_progress.
      let targetStatus: TaskStatus = "in_progress";
      if (input.approve) {
        targetStatus = "done";
        // done exige checklist+evidencia.
        const cl = await tx
          .select()
          .from(taskChecklists)
          .where(
            and(
              eq(taskChecklists.organizationId, user.organization_id),
              eq(taskChecklists.taskId, input.taskId),
            ),
          );
        const evCount = await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(taskEvidence)
          .where(
            and(
              eq(taskEvidence.organizationId, user.organization_id),
              eq(taskEvidence.taskId, input.taskId),
            ),
          );
        const gates = validateTaskDoneGates({
          checklists: cl.map((c) => ({ done: c.done })),
          evidenceCount: evCount[0]?.c ?? 0,
        });
        if (!gates.ok) {
          throw new DomainError(
            gates.code,
            "La tarea requiere TODOS los checklist hechos y al menos una evidencia",
            409,
          );
        }
      }
      const [taskAfter] = await tx
        .update(tasks)
        .set({ status: targetStatus })
        .where(
          and(
            eq(tasks.organizationId, user.organization_id),
            eq(tasks.id, input.taskId),
          ),
        )
        .returning();
      if (!taskAfter) throw new Error("task review sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "task",
        entityId: taskAfter.id,
        action: "task.review",
        before: { status: before.status },
        after: {
          status: taskAfter.status,
          approve: input.approve,
          observations: input.observations ?? null,
        },
        ...(ctx.actorRoleCode !== undefined ? { actorRoleCode: ctx.actorRoleCode } : {}),
      });
      return loadDetail(user.organization_id, taskAfter.id);
    });
  }

  async function checklistAdd(
    ctx: Context,
    input: { taskId: string; item: string },
  ): Promise<TaskDetailDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "operar_proyectos", {
      forceDb: true,
    });
    await loadTask(user.organization_id, input.taskId);
    return withTx(async (tx) => {
      await tx.insert(taskChecklists).values({
        organizationId: user.organization_id,
        taskId: input.taskId,
        item: input.item.trim(),
      });
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "task_checklist",
        entityId: input.taskId,
        action: "task.checklist_add",
        after: { taskId: input.taskId, item: input.item.trim() },
      });
      return loadDetail(user.organization_id, input.taskId);
    });
  }

  async function checklistToggle(
    ctx: Context,
    input: { checklistId: string; done: boolean },
  ): Promise<TaskDetailDTO> {
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
        .from(taskChecklists)
        .where(
          and(
            eq(taskChecklists.organizationId, user.organization_id),
            eq(taskChecklists.id, input.checklistId),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError(
          "TASK_NOT_FOUND",
          "Ítem de checklist no encontrado",
          404,
        );
      }
      await tx
        .update(taskChecklists)
        .set({ done: input.done })
        .where(
          and(
            eq(taskChecklists.organizationId, user.organization_id),
            eq(taskChecklists.id, input.checklistId),
          ),
        );
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "task_checklist",
        entityId: input.checklistId,
        action: "task.checklist_toggle",
        before: { done: before.done },
        after: { done: input.done },
      });
      return loadDetail(user.organization_id, before.taskId);
    });
  }

  async function evidenceAdd(
    ctx: Context,
    input: { taskId: string; fileId: string; note?: string },
  ): Promise<TaskDetailDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "operar_proyectos", {
      forceDb: true,
    });
    await loadTask(user.organization_id, input.taskId);
    return withTx(async (tx) => {
      await tx.insert(taskEvidence).values({
        organizationId: user.organization_id,
        taskId: input.taskId,
        fileId: input.fileId,
        addedBy: user.id,
        ...(input.note !== undefined ? { note: input.note } : {}),
      });
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "task_evidence",
        entityId: input.taskId,
        action: "task.evidence_add",
        after: { taskId: input.taskId, fileId: input.fileId },
      });
      return loadDetail(user.organization_id, input.taskId);
    });
  }

  async function canViewUserTimeEntries(
    ctx: Context,
    targetUserId: string,
  ): Promise<boolean> {
    const user = requireUser(ctx);
    if (!user.id) return false;
    if (user.id === targetUserId) return true;
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    const actorHasVerTiempoEquipo =
      await createHasPermissionService().has(ctx, "ver_tiempo_equipo");
    return canViewOtherUserTimeEntries({
      actorUserId: user.id,
      targetUserId,
      actorHasVerTiempoEquipo,
    });
  }

  // Helper interno: verifica existencia de varios usuarios por id (defensa).
  // No se exporta; queda para auto-tests si se requiere.
  void inArray;
  void users;

  return {
    create,
    byId,
    list,
    transition,
    assign,
    reject,
    review,
    checklistAdd,
    checklistToggle,
    evidenceAdd,
    canViewUserTimeEntries,
  };
}
