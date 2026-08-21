/**
 * `users` — PK compuesta `(organization_id, id)` (ADR-02 v1.1 §8.3 / AC-43).
 * Multi-tenancy mecánico a nivel de BD: la PK garantiza que el `id`
 * interno sólo es único dentro de la organización.
 */
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const users = pgTable(
  "users",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgEmailUnique: uniqueIndex("users_org_email_unique").on(t.organizationId, t.email),
    orgIdx: index("users_org_idx").on(t.organizationId),
  }),
);

export type User = typeof users.$inferSelect;
export type UserNew = typeof users.$inferInsert;
