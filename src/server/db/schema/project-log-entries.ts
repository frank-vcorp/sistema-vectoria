/**
 * `project_log_entries` (BR-N259/BR-N338/BR-N339). PK compuesta `(organization_id, id)`.
 * `entry_type` ∈ enum canónico. La FK a `projects` se añade en SPEC-005.
 * FK compuesta `created_by → users(organization_id, id)` (AC-44).
 */
import {
  boolean,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const projectLogEntries = pgTable(
  "project_log_entries",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    projectId: uuid("project_id").notNull(), // FK añadida en SPEC-005.
    entryType: text("entry_type").notNull(),
    body: text("body").notNull(),
    private: boolean("private").notNull().default(false),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    projectIdx: index("project_log_entries_org_project_created_idx").on(
      t.organizationId,
      t.projectId,
      t.createdAt,
    ),
    createdByFk: foreignKey({
      name: "project_log_entries_created_by_fk",
      columns: [t.organizationId, t.createdBy],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type ProjectLogEntry = typeof projectLogEntries.$inferSelect;
export type ProjectLogEntryNew = typeof projectLogEntries.$inferInsert;
