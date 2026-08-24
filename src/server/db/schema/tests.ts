/**
 * `tests` — SPEC-006 §4.1 (B14, BR-N283-290, BR-009, BR-N389,
 * BR-N390). Catálogo de pruebas del proyecto.
 *
 * Los 7 tipos (`functional`, `visual`, `ui`, `acceptance`,
 * `performance`, `security`, `compatibility`) viven como dato en
 * `TEST_TYPES`. Las pruebas bloqueantes para el cierre técnico se
 * derivan del tipo, NO del estado: `BLOCKING_TEST_TYPES =
 * [functional, visual, ui, acceptance, compatibility]`
 * (`performance`, `security` sólo `at_risk`, BR-N284/285).
 *
 * `not_applicable` exige justificación (BR-N389) y, si es
 * `acceptance`, además una aprobación Director (`aprobar_cambios`).
 *
 * PK compuesta `(organization_id, id)`. FK a `projects`, `modules`
 * (opcional), `requirements` (opcional) y `users` (`approvedBy`).
 */
import {
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { modules, projects } from "./projects";
import { requirements } from "./requirements";
import { organizations } from "./organizations";
import { users } from "./users";

export const tests = pgTable(
  "tests",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    moduleId: uuid("module_id"),
    requirementId: uuid("requirement_id"),
    /**
     * BR-N283-290 · `functional | visual | ui | acceptance |
     * performance | security | compatibility`. El tipo determina
     * si bloquea el cierre (helper puro).
     */
    type: text("type").notNull(),
    /** BR-N283 · `pending | passed | failed | blocked | not_applicable`. */
    status: text("status").notNull().default("pending"),
    result: text("result"),
    incident: text("incident"),
    /**
     * BR-N389 · justificación obligatoria cuando `status =
     * 'not_applicable'`.
     */
    notApplicableReason: text("not_applicable_reason"),
    /**
     * BR-N389 · para `acceptance` con `not_applicable` se exige
     * además aprobación del Director.
     */
    notApplicableApprovedBy: uuid("not_applicable_approved_by"),
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
    orgProjectTypeIdx: index("tests_org_project_type_idx").on(
      t.organizationId,
      t.projectId,
      t.type,
    ),
    orgProjectStatusIdx: index("tests_org_project_status_idx").on(
      t.organizationId,
      t.projectId,
      t.status,
    ),
    projectFk: foreignKey({
      name: "tests_project_fk",
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
    }),
    moduleFk: foreignKey({
      name: "tests_module_fk",
      columns: [t.organizationId, t.moduleId],
      foreignColumns: [modules.organizationId, modules.id],
    }),
    requirementFk: foreignKey({
      name: "tests_requirement_fk",
      columns: [t.organizationId, t.requirementId],
      foreignColumns: [requirements.organizationId, requirements.id],
    }),
    approvedByFk: foreignKey({
      name: "tests_approved_by_fk",
      columns: [t.organizationId, t.notApplicableApprovedBy],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type Test = typeof tests.$inferSelect;
export type TestNew = typeof tests.$inferInsert;
