/**
 * `user_roles` — M2M users↔roles. PK compuesta `(organization_id, user_id, role_id)`.
 * FKs compuestas (ADR-02 v1.1 §8.4 / AC-44). Máximo 5 roles por usuario
 * (BR-N204 / AC-3) se valida en servicio + trigger/partial index defensivo.
 */
import { foreignKey, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { roles } from "./roles";
import { users } from "./users";

export const userRoles = pgTable(
  "user_roles",
  {
    organizationId: uuid("organization_id").notNull(),
    userId: uuid("user_id").notNull(),
    roleId: uuid("role_id").notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    assignedBy: uuid("assigned_by").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.userId, t.roleId] }),
    userFk: foreignKey({
      name: "user_roles_user_fk",
      columns: [t.organizationId, t.userId],
      foreignColumns: [users.organizationId, users.id],
    }),
    roleFk: foreignKey({
      name: "user_roles_role_fk",
      columns: [t.organizationId, t.roleId],
      foreignColumns: [roles.organizationId, roles.id],
    }),
    assignedByFk: foreignKey({
      name: "user_roles_assigned_by_fk",
      columns: [t.organizationId, t.assignedBy],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type UserRole = typeof userRoles.$inferSelect;
export type UserRoleNew = typeof userRoles.$inferInsert;
