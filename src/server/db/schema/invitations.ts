/**
 * `invitations` — link de invitación firmado (DEC-FUN-21).
 * PK compuesta `(organization_id, id)`. FK compuesta a `users(organization_id, id)`
 * (ADR-02 v1.1 §8.4 / AC-44). `token_hash` es hash del token; el token claro NUNCA persiste.
 */
import {
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const invitations = pgTable(
  "invitations",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    tokenIdx: uniqueIndex("invitations_token_unique").on(t.tokenHash),
    orgIdx: index("invitations_org_idx").on(t.organizationId),
    createdByFk: foreignKey({
      name: "invitations_created_by_fk",
      columns: [t.organizationId, t.createdBy],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type Invitation = typeof invitations.$inferSelect;
export type InvitationNew = typeof invitations.$inferInsert;
