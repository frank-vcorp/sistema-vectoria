/**
 * `user_permissions` — permisos custom aditivos (DEC-FUN-22, BR-N131). Nunca restan.
 * Toda otorgación/revocación auditada (AC-7). FKs compuestas multi-tenant (AC-44).
 */
import { foreignKey, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { permissions } from "./permissions";
import { users } from "./users";

export const userPermissions = pgTable(
  "user_permissions",
  {
    organizationId: uuid("organization_id").notNull(),
    userId: uuid("user_id").notNull(),
    permissionId: uuid("permission_id").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    grantedBy: uuid("granted_by").notNull(),
    grantedReason: text("granted_reason"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.userId, t.permissionId] }),
    userFk: foreignKey({
      name: "user_permissions_user_fk",
      columns: [t.organizationId, t.userId],
      foreignColumns: [users.organizationId, users.id],
    }),
    permFk: foreignKey({
      name: "user_permissions_permission_fk",
      columns: [t.organizationId, t.permissionId],
      foreignColumns: [permissions.organizationId, permissions.id],
    }),
    grantedByFk: foreignKey({
      name: "user_permissions_granted_by_fk",
      columns: [t.organizationId, t.grantedBy],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type UserPermission = typeof userPermissions.$inferSelect;
export type UserPermissionNew = typeof userPermissions.$inferInsert;
