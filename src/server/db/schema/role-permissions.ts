/**
 * `role_permissions` — M2M roles↔permissions. PK compuesta `(organization_id, role_id, permission_id)`.
 * FKs compuestas a `roles(organization_id, id)` y `permissions(organization_id, id)`
 * garantizan aislamiento mecánico cross-org (ADR-02 v1.1 §8.4 / AC-44).
 *
 * Inmutabilidad de filas con `is_seed=true` se valida en servicio (AC-70).
 */
import { foreignKey, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { permissions } from "./permissions";
import { roles } from "./roles";

export const rolePermissions = pgTable(
  "role_permissions",
  {
    organizationId: uuid("organization_id").notNull(),
    roleId: uuid("role_id").notNull(),
    permissionId: uuid("permission_id").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.roleId, t.permissionId] }),
    roleFk: foreignKey({
      name: "role_permissions_role_fk",
      columns: [t.organizationId, t.roleId],
      foreignColumns: [roles.organizationId, roles.id],
    }),
    permFk: foreignKey({
      name: "role_permissions_permission_fk",
      columns: [t.organizationId, t.permissionId],
      foreignColumns: [permissions.organizationId, permissions.id],
    }),
  }),
);

export type RolePermission = typeof rolePermissions.$inferSelect;
export type RolePermissionNew = typeof rolePermissions.$inferInsert;
