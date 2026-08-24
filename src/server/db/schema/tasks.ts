/**
 * `tasks` y derivados — SPEC-006 §4.1 (B11, BR-N268-274, BR-N269-271,
 * BR-006/007). El conjunto cubre:
 *
 *  - `tasks`: tarea concreta con peso y prioridad; el folio es
 *    humano único por proyecto. La asignación se modela en
 *    `task_assignments` (muchos-a-muchos con motivo de rechazo).
 *  - `task_checklists`: ítem de checklist. `done` exige presencia
 *    tanto en `task_checklists` como en `task_evidence` (BR-007 /
 *    BR-N271). SPEC-006 AC-3.
 *  - `task_evidence`: evidencia (file_id + nota). El archivo vive en
 *    S3 (SPEC-001 §4.1 BR-N371/372).
 *  - `task_assignments`: quién tiene la tarea, quién la asignó,
 *    cuándo fue rechazada y por qué motivo (BR-N270).
 *
 * PK compuesta `(organization_id, id)` en todas las tablas nuevas,
 * siguiendo el patrón de `projects` (ADR-02 §8.3). Las FK a
 * `projects`, `modules`, `users`, `requirements` y `files` son
 * compuestas.
 */
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { files } from "./files";
import { modules, projects } from "./projects";
import { requirements } from "./requirements";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * `tasks` — fila principal. `weight` (≥1) pondera el avance
 * (BR-N367). `depends_on_tasks` jsonb modela dependencias entre
 * tareas. `priority ∈ {low, normal, high}`.
 */
export const tasks = pgTable(
  "tasks",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    moduleId: uuid("module_id"),
    requirementId: uuid("requirement_id"),
    folio: text("folio").notNull(),
    title: text("title").notNull(),
    /**
     * BR-N268-274 · línea: backlog|ready|in_progress|in_review|done.
     * Laterales: blocked, cancelled. `done` exige checklist+evidencia
     * (BR-007/BR-N271).
     */
    status: text("status").notNull().default("backlog"),
    /** BR-N269 · asignado actual (denormalizado desde task_assignments). */
    assignedTo: uuid("assigned_to"),
    /** BR-N268 · peso entero para Σ peso / avance. */
    weight: integer("weight").notNull().default(1),
    priority: text("priority").notNull().default("normal"),
    dependsOnTasks: jsonb("depends_on_tasks").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgProjectFolioUnique: uniqueIndex("tasks_org_project_folio_unique").on(
      t.organizationId,
      t.projectId,
      t.folio,
    ),
    orgProjectStatusIdx: index("tasks_org_project_status_idx").on(
      t.organizationId,
      t.projectId,
      t.status,
    ),
    orgProjectModuleIdx: index("tasks_org_project_module_idx").on(
      t.organizationId,
      t.projectId,
      t.moduleId,
    ),
    projectFk: foreignKey({
      name: "tasks_project_fk",
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
    }),
    moduleFk: foreignKey({
      name: "tasks_module_fk",
      columns: [t.organizationId, t.moduleId],
      foreignColumns: [modules.organizationId, modules.id],
    }),
    requirementFk: foreignKey({
      name: "tasks_requirement_fk",
      columns: [t.organizationId, t.requirementId],
      foreignColumns: [requirements.organizationId, requirements.id],
    }),
    assignedFk: foreignKey({
      name: "tasks_assigned_fk",
      columns: [t.organizationId, t.assignedTo],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

/**
 * `task_checklists` — ítems verificables del cierre técnico de la
 * tarea (BR-007/BR-N271). La transición a `done` exige TODOS los
 * ítems marcados (helper puro del servicio).
 */
export const taskChecklists = pgTable(
  "task_checklists",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    taskId: uuid("task_id").notNull(),
    item: text("item").notNull(),
    done: boolean("done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgTaskIdx: index("task_checklists_org_task_idx").on(
      t.organizationId,
      t.taskId,
    ),
    taskFk: foreignKey({
      name: "task_checklists_task_fk",
      columns: [t.organizationId, t.taskId],
      foreignColumns: [tasks.organizationId, tasks.id],
    }),
  }),
);

/**
 * `task_evidence` — evidencia (archivo + nota) que respalda el cierre
 * técnico de la tarea (BR-007/BR-N271).
 */
export const taskEvidence = pgTable(
  "task_evidence",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    taskId: uuid("task_id").notNull(),
    fileId: uuid("file_id").notNull(),
    note: text("note"),
    addedBy: uuid("added_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgTaskIdx: index("task_evidence_org_task_idx").on(
      t.organizationId,
      t.taskId,
    ),
    taskFk: foreignKey({
      name: "task_evidence_task_fk",
      columns: [t.organizationId, t.taskId],
      foreignColumns: [tasks.organizationId, tasks.id],
    }),
    fileFk: foreignKey({
      name: "task_evidence_file_fk",
      columns: [t.organizationId, t.fileId],
      foreignColumns: [files.organizationId, files.id],
    }),
    addedByFk: foreignKey({
      name: "task_evidence_added_by_fk",
      columns: [t.organizationId, t.addedBy],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

/**
 * `task_assignments` — historial de asignaciones. El campo activo es
 * `tasks.assignedTo` (denormalizado). La tabla conserva histórico:
 * cuando un técnico rechaza (`tasks.reject`), la fila actual queda
 * con `rejectedAt` y se inserta una nueva al reasignar. Permite
 * trazabilidad de auditoría por asignación.
 *
 * BR-N269/BR-N270/BR-N387.
 */
export const taskAssignments = pgTable(
  "task_assignments",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    taskId: uuid("task_id").notNull(),
    userId: uuid("user_id").notNull(),
    assignedBy: uuid("assigned_by"),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectReason: text("reject_reason"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgTaskIdx: index("task_assignments_org_task_idx").on(
      t.organizationId,
      t.taskId,
    ),
    orgUserIdx: index("task_assignments_org_user_idx").on(
      t.organizationId,
      t.userId,
    ),
    taskFk: foreignKey({
      name: "task_assignments_task_fk",
      columns: [t.organizationId, t.taskId],
      foreignColumns: [tasks.organizationId, tasks.id],
    }),
    userFk: foreignKey({
      name: "task_assignments_user_fk",
      columns: [t.organizationId, t.userId],
      foreignColumns: [users.organizationId, users.id],
    }),
    assignedByFk: foreignKey({
      name: "task_assignments_assigned_by_fk",
      columns: [t.organizationId, t.assignedBy],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type Task = typeof tasks.$inferSelect;
export type TaskNew = typeof tasks.$inferInsert;
export type TaskChecklist = typeof taskChecklists.$inferSelect;
export type TaskChecklistNew = typeof taskChecklists.$inferInsert;
export type TaskEvidence = typeof taskEvidence.$inferSelect;
export type TaskEvidenceNew = typeof taskEvidence.$inferInsert;
export type TaskAssignment = typeof taskAssignments.$inferSelect;
export type TaskAssignmentNew = typeof taskAssignments.$inferInsert;
