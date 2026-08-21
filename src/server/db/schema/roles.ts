/**
 * `roles` — PK compuesta `(organization_id, id)`. `code` inmutable
 * (AC-69). `is_seed=true` para los 7 base (BR-N127).
 */
import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const roles = pgTable(
  "roles",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    isSeed: boolean("is_seed").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgCodeUnique: uniqueIndex("roles_org_code_unique").on(t.organizationId, t.code),
    orgIdx: index("roles_org_idx").on(t.organizationId),
  }),
);

export type Role = typeof roles.$inferSelect;
export type RoleNew = typeof roles.$inferInsert;
