/**
 * `permissions` — PK compuesta `(organization_id, id)`.
 * `code` y `label` sembrados (ADR-04 §2.3).
 */
import { index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const permissions = pgTable(
  "permissions",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgCodeUnique: uniqueIndex("permissions_org_code_unique").on(t.organizationId, t.code),
    orgIdx: index("permissions_org_idx").on(t.organizationId),
  }),
);

export type Permission = typeof permissions.$inferSelect;
export type PermissionNew = typeof permissions.$inferInsert;
