/**
 * `requirements` — SPEC-006 §4.1 (B11, BR-N264-267, BR-005, DEC-FUN-32).
 *
 * Requerimiento del proyecto. Nace como `proposed` cuando el cliente
 * lo solicita y transita por analysis → approved → development →
 * testing → validated (línea principal). Laterales: `rejected` (no
 * se hará) y `out_of_scope` (redirigido a otro contrato).
 *
 * PK compuesta `(organization_id, id)`. FKs a `projects` y
 * `modules` (módulo al que pertenece; null si transversal al
 * proyecto). `assigned_to` es nullable: el requerimiento puede
 * existir sin asignación, mientras que las tareas concretas sí
 * requieren asignación con membresía (BR-N382, ver `tasks` y
 * `task_assignments`).
 */
import {
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { modules, projects } from "./projects";
import { organizations } from "./organizations";
import { users } from "./users";

export const requirements = pgTable(
  "requirements",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    moduleId: uuid("module_id"),
    /** BR-N005 · folio humano único por proyecto (lo asegura el servicio). */
    folio: text("folio").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    acceptanceCriteria: text("acceptance_criteria"),
    /**
     * BR-N264-267 · línea: proposed|analysis|approved|development|
     * testing|validated. Laterales: rejected, out_of_scope.
     */
    status: text("status").notNull().default("proposed"),
    reason: text("reason"),
    assignedTo: uuid("assigned_to"),
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
    orgProjectIdx: index("requirements_org_project_idx").on(
      t.organizationId,
      t.projectId,
      t.status,
    ),
    orgProjectFolioIdx: index("requirements_org_project_folio_idx").on(
      t.organizationId,
      t.projectId,
      t.folio,
    ),
    projectFk: foreignKey({
      name: "requirements_project_fk",
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
    }),
    moduleFk: foreignKey({
      name: "requirements_module_fk",
      columns: [t.organizationId, t.moduleId],
      foreignColumns: [modules.organizationId, modules.id],
    }),
    assignedFk: foreignKey({
      name: "requirements_assigned_fk",
      columns: [t.organizationId, t.assignedTo],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

// `requirements` no tiene UNIQUE por `(org, project_id, folio)` para
// permitir reuso futuro entre proyectos (BR-N264). El servicio valida
// unicidad al insertar; el UNIQUE del lado tareas (folio) lo garantiza
// el helper del módulo.
void jsonb;

export type Requirement = typeof requirements.$inferSelect;
export type RequirementNew = typeof requirements.$inferInsert;
