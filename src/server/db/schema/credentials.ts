/**
 * `credentials` — separado de `users` por seguridad (SPEC §4.1).
 * PK compuesta `(organization_id, user_id)`. `password_hash` es Argon2id.
 * FK compuesta a `users(organization_id, id)` garantiza aislamiento
 * multi-tenant mecánico (ADR-02 v1.1 §8.4 / AC-44).
 */
import { pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const credentials = pgTable(
  "credentials",
  {
    organizationId: uuid("organization_id").notNull(),
    userId: uuid("user_id").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.userId] }),
    userIdUnique: uniqueIndex("credentials_user_unique").on(t.organizationId, t.userId),
    userFk: {
      name: "credentials_user_fk",
      columns: [t.organizationId, t.userId],
      foreignColumns: [users.organizationId, users.id],
    },
  }),
);

export type Credential = typeof credentials.$inferSelect;
export type CredentialNew = typeof credentials.$inferInsert;
