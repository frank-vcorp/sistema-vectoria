/**
 * `deliverables` — SPEC-006 §4.1 (B15, BR-N288-291, BR-010,
 * BR-N391, BR-N287, DEC-FUN-55). Entregables del proyecto.
 *
 * Aceptación por **proxy** (DEC-FUN-55): el PL es **registrador**, no
 * aceptante. La aceptación exige identidad del aceptante, organización,
 * fecha, medio y evidencia (`files.id`). Sin esos datos la API
 * devuelve `409 ACCEPTANCE_EVIDENCE_REQUIRED` (BR-N287).
 *
 * PK compuesta `(organization_id, id)`. FKs a `projects`, `modules`,
 * `files` (evidencia) y `users` (no referenciamos un usuario
 * aceptante externo; sólo persistimos `accepterName`/`accepterOrg`
 * como snapshot del registro).
 */
import {
  date,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { files } from "./files";
import { modules, projects } from "./projects";
import { organizations } from "./organizations";

export const deliverables = pgTable(
  "deliverables",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    moduleId: uuid("module_id"),
    name: text("name").notNull(),
    version: text("version").notNull(),
    /**
     * BR-N288-291 · `pending | preparing | delivered | accepted |
     * observed | corrected | rejected`. `delivered` NO implica
     * `accepted`; el proxy vive del lado de la aceptación.
     */
    status: text("status").notNull().default("pending"),
    required: text("required").notNull().default("true"),
    /** BR-N288 · fecha comprometida con el cliente. */
    committedDate: date("committed_date").notNull(),
    /** BR-N288 · fecha real de entrega (cuando entra a `delivered`). */
    actualDate: date("actual_date"),
    /** DEC-FUN-55 · nombre del aceptante (snapshot, no FK). */
    accepterName: text("accepter_name"),
    /** DEC-FUN-55 · organización del aceptante (snapshot). */
    accepterOrg: text("accepter_org"),
    /** BR-N288 · fecha de aceptación (cuando entra a `accepted`). */
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    /** DEC-FUN-55 · medio (email/teléfono/presencial/otro). */
    acceptedMedium: text("accepted_medium"),
    /** BR-N287 · evidencia obligatoria: FK a `files`. */
    evidenceFileId: uuid("evidence_file_id"),
    comments: text("comments"),
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
    orgProjectStatusIdx: index("deliverables_org_project_status_idx").on(
      t.organizationId,
      t.projectId,
      t.status,
    ),
    projectFk: foreignKey({
      name: "deliverables_project_fk",
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
    }),
    moduleFk: foreignKey({
      name: "deliverables_module_fk",
      columns: [t.organizationId, t.moduleId],
      foreignColumns: [modules.organizationId, modules.id],
    }),
    evidenceFk: foreignKey({
      name: "deliverables_evidence_fk",
      columns: [t.organizationId, t.evidenceFileId],
      foreignColumns: [files.organizationId, files.id],
    }),
  }),
);

export type Deliverable = typeof deliverables.$inferSelect;
export type DeliverableNew = typeof deliverables.$inferInsert;
