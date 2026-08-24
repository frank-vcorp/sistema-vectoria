/**
 * `change_requests` — SPEC-006 §4.1 (B16, BR-N292-296, BR-011,
 * BR-N395, BR-N294). Cambios de alcance durante la ejecución.
 *
 * Línea principal:
 *   requested → analysis → quoted → authorized → in_progress →
 *   implemented → validated
 * Laterales: `rejected`, `cancelled`.
 *
 * Con costo (BR-N294): exigen `evidenceKind='quote'` con
 * `linkedQuoteId` válido antes de `authorized`. Sin costo
 * (BR-N395): omiten `quoted`/`authorized`; quedan en `in_progress`
 * directamente tras `analysis`. El alcance original NO se altera
 * (BR-N296): la autorización incrementa `version` en la metadata.
 *
 * PK compuesta `(organization_id, id)`. FK a `projects`, `quotes`
 * (opcional, sólo con costo) y `users` (`requestedBy`,
 * `authorizedBy`).
 */
import {
  bigint,
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
import { quotes } from "./quotes";
import { projects } from "./projects";
import { organizations } from "./organizations";
import { users } from "./users";

export const changeRequests = pgTable(
  "change_requests",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    /** BR-N292 · folio humano único por proyecto. */
    folio: text("folio").notNull(),
    /**
     * BR-N292-296 ·
     * `requested | analysis | quoted | authorized | rejected |
     *  cancelled | in_progress | implemented | validated`.
     */
    status: text("status").notNull().default("requested"),
    /** BR-N294/BR-N395 · ¿implica costo? */
    hasCost: text("has_cost").notNull().default("false"),
    /** BR-N293/BR-N395 · snapshot del impacto (jsonb libre). */
    impact: jsonb("impact").notNull().default({}),
    /** BR-N294 · cotización cuando hay costo. */
    linkedQuoteId: uuid("linked_quote_id"),
    /** BR-N294 · evidencia (archivo) o, con costo, link a quote. */
    evidenceFileId: uuid("evidence_file_id"),
    /** `quote | custom` (BR-N294). */
    evidenceKind: text("evidence_kind").notNull().default("custom"),
    reason: text("reason").notNull(),
    notes: text("notes"),
    requestedBy: uuid("requested_by"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    authorizedBy: uuid("authorized_by"),
    authorizedAt: timestamp("authorized_at", { withTimezone: true }),
    /**
     * BR-N296 · versión del alcance efectivo. NO altera el alcance
     * original (`project_scope_snapshots`); sólo se incrementa
     * cuando el CR entra a `authorized`.
     */
    version: integer("version").notNull().default(1),
    /**
     * BR-N294 · monto cotizado (centavos MXN) cuando hay costo.
     * Snapshot al cotizar; no se recalcula.
     */
    quotedAmountCents: bigint("quoted_amount_cents", { mode: "number" }),
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
    orgProjectFolioUnique: uniqueIndex(
      "change_requests_org_project_folio_unique",
    ).on(t.organizationId, t.projectId, t.folio),
    orgProjectStatusIdx: index("change_requests_org_project_status_idx").on(
      t.organizationId,
      t.projectId,
      t.status,
    ),
    projectFk: foreignKey({
      name: "change_requests_project_fk",
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
    }),
    quoteFk: foreignKey({
      name: "change_requests_quote_fk",
      columns: [t.organizationId, t.linkedQuoteId],
      foreignColumns: [quotes.organizationId, quotes.id],
    }),
    requestedByFk: foreignKey({
      name: "change_requests_requested_by_fk",
      columns: [t.organizationId, t.requestedBy],
      foreignColumns: [users.organizationId, users.id],
    }),
    authorizedByFk: foreignKey({
      name: "change_requests_authorized_by_fk",
      columns: [t.organizationId, t.authorizedBy],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type ChangeRequest = typeof changeRequests.$inferSelect;
export type ChangeRequestNew = typeof changeRequests.$inferInsert;
