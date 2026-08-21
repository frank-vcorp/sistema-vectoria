/**
 * Servicio de usuarios/roles — operaciones de plataforma (crear/editar/
 * desactivar/asignar roles, gestionar permisos custom).
 *
 * Cita BR-N127/128/131/204/205/206/408/409/410, AC-4/5/6/7/8/9/69/70/81.
 *
 * Invariantes (no negociables):
 *  - Toda mutación crítica llama `audit(ctx, ...)` y `requirePermission`.
 *  - DELETE físico de rol está prohibido (sólo desactivación, AC-4).
 *  - `code` de cualquier rol es inmutable (AC-69).
 *  - `role_permissions` de roles seed son inmutables (AC-70).
 *  - Desactivar rol seed con usuarios asignados → 409 hasta reasignar (BR-N410).
 *  - AC-81 / ADR-06 §3.1: cada `require('gestionar_roles')` se invoca
 *    con `{ forceDb: true }` — acción crítica revalida contra BD (no
 *    cache del JWT). Garantiza revocación efectiva inmediata.
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import {
  roles,
  userRoles,
  userPermissions,
  rolePermissions,
  permissions,
  users,
} from "@/server/db/schema";
import { createHasPermissionService } from "@/server/services/hasPermission";
import { createAuditService } from "@/server/services/audit";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";

export interface RoleDTO {
  id: string;
  organizationId: string;
  code: string;
  label: string;
  isSeed: boolean;
  active: boolean;
}

export interface UserPermissionsService {
  createRole(
    ctx: Context,
    input: { code: string; label: string },
  ): Promise<RoleDTO>;
  updateRoleLabel(ctx: Context, input: { roleId: string; label: string }): Promise<RoleDTO>;
  deactivateRole(ctx: Context, input: { roleId: string; reason?: string }): Promise<RoleDTO>;
  assignRole(ctx: Context, input: { userId: string; roleId: string }): Promise<void>;
  revokeRole(ctx: Context, input: { userId: string; roleId: string; reason?: string }): Promise<void>;
  grantPermission(
    ctx: Context,
    input: { userId: string; permissionCode: string; reason: string },
  ): Promise<void>;
  revokePermission(
    ctx: Context,
    input: { userId: string; permissionCode: string; reason: string },
  ): Promise<void>;
}

const MAX_ROLES_PER_USER = 5;

function toDto(r: typeof roles.$inferSelect): RoleDTO {
  return {
    id: r.id,
    organizationId: r.organizationId,
    code: r.code,
    label: r.label,
    isSeed: r.isSeed,
    active: r.active,
  };
}

export function createUserPermissionsService(): UserPermissionsService {
  const db = getDb();
  const hasPerm = createHasPermissionService();
  const audit = createAuditService();

  async function createRole(
    ctx: Context,
    input: { code: string; label: string },
  ): Promise<RoleDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_roles", { forceDb: true });
    const [row] = await db
      .insert(roles)
      .values({
        organizationId: user.organization_id,
        code: input.code,
        label: input.label,
        isSeed: false,
        active: true,
      })
      .returning();
    if (!row) throw new Error("role insert sin fila");
    await audit.record(ctx, {
      entityType: "role",
      entityId: row.id,
      action: "role.create",
      after: { code: row.code, label: row.label, isSeed: false, active: true },
    });
    return toDto(row);
  }

  async function updateRoleLabel(
    ctx: Context,
    input: { roleId: string; label: string },
  ): Promise<RoleDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_roles", { forceDb: true });
    const [before] = await db
      .select()
      .from(roles)
      .where(
        and(eq(roles.id, input.roleId), eq(roles.organizationId, user.organization_id)),
      )
      .limit(1);
    if (!before) throw new DomainError("ForbiddenError", "Rol no encontrado", 404);
    // P3-3 / AC-69: comparar `before.label === input.label` (no `before.code`).
    if (before.label === input.label) {
      // No-op, no audit.
      return toDto(before);
    }
    const [after] = await db
      .update(roles)
      .set({ label: input.label })
      .where(eq(roles.id, before.id))
      .returning();
    if (!after) throw new Error("role update sin fila");
    await audit.record(ctx, {
      entityType: "role",
      entityId: after.id,
      action: "role.update",
      before: { label: before.label },
      after: { label: after.label },
      reason: "label-edit",
    });
    return toDto(after);
  }

  async function deactivateRole(
    ctx: Context,
    input: { roleId: string; reason?: string },
  ): Promise<RoleDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_roles", { forceDb: true });
    const [row] = await db
      .select()
      .from(roles)
      .where(
        and(eq(roles.id, input.roleId), eq(roles.organizationId, user.organization_id)),
      )
      .limit(1);
    if (!row) throw new DomainError("ForbiddenError", "Rol no encontrado", 404);
    // BR-N410: rol seed con usuarios asignados → no desactivable.
    if (row.isSeed) {
      const [{ c }] = (await db
        .select({ c: sql<number>`count(*)::int` })
        .from(userRoles)
        .where(
          and(
            eq(userRoles.roleId, row.id),
            eq(userRoles.organizationId, user.organization_id),
          ),
        )) as [{ c: number }, ...unknown[]];
      if (c > 0) {
        throw new DomainError(
          "SEED_ROLE_HAS_ASSIGNED_USERS",
          `El rol seed tiene ${c} usuario(s) asignado(s); reasignar antes de desactivar`,
          409,
        );
      }
    }
    const [after] = await db
      .update(roles)
      .set({ active: false })
      .where(eq(roles.id, row.id))
      .returning();
    if (!after) throw new Error("role deactivate sin fila");
    await audit.record(ctx, {
      entityType: "role",
      entityId: after.id,
      action: "role.deactivate",
      before: { active: row.active },
      after: { active: false },
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });
    return toDto(after);
  }

  async function assignRole(
    ctx: Context,
    input: { userId: string; roleId: string },
  ): Promise<void> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_roles", { forceDb: true });
    // Máximo 5 roles (BR-N204).
    const [{ c }] = (await db
      .select({ c: sql<number>`count(*)::int` })
      .from(userRoles)
      .where(
        and(eq(userRoles.userId, input.userId), eq(userRoles.organizationId, user.organization_id)),
      )) as [{ c: number }, ...unknown[]];
    if (c >= MAX_ROLES_PER_USER) {
      throw new DomainError(
        "MAX_ROLES_EXCEEDED",
        `Un usuario no puede tener más de ${MAX_ROLES_PER_USER} roles`,
        400,
      );
    }
    await db.insert(userRoles).values({
      organizationId: user.organization_id,
      userId: input.userId,
      roleId: input.roleId,
      assignedBy: user.id,
    });
    await audit.record(ctx, {
      entityType: "user",
      entityId: input.userId,
      action: "user.assign_role",
      after: { roleId: input.roleId },
    });
  }

  async function revokeRole(
    ctx: Context,
    input: { userId: string; roleId: string; reason?: string },
  ): Promise<void> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_roles", { forceDb: true });
    await db
      .delete(userRoles)
      .where(
        and(
          eq(userRoles.userId, input.userId),
          eq(userRoles.roleId, input.roleId),
          eq(userRoles.organizationId, user.organization_id),
        ),
      );
    await audit.record(ctx, {
      entityType: "user",
      entityId: input.userId,
      action: "user.revoke_role",
      before: { roleId: input.roleId },
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });
  }

  async function grantPermission(
    ctx: Context,
    input: { userId: string; permissionCode: string; reason: string },
  ): Promise<void> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_roles", { forceDb: true });
    const [perm] = await db
      .select()
      .from(permissions)
      .where(
        and(
          eq(permissions.code, input.permissionCode),
          eq(permissions.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!perm) {
      throw new DomainError("ForbiddenError", `Permiso no existe: ${input.permissionCode}`, 404);
    }
    await db.insert(userPermissions).values({
      organizationId: user.organization_id,
      userId: input.userId,
      permissionId: perm.id,
      grantedBy: user.id,
      grantedReason: input.reason,
    });
    await audit.record(ctx, {
      entityType: "user",
      entityId: input.userId,
      action: "permission.grant",
      after: { permissionCode: input.permissionCode, reason: input.reason },
    });
  }

  async function revokePermission(
    ctx: Context,
    input: { userId: string; permissionCode: string; reason: string },
  ): Promise<void> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_roles", { forceDb: true });
    const [perm] = await db
      .select()
      .from(permissions)
      .where(
        and(
          eq(permissions.code, input.permissionCode),
          eq(permissions.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!perm) {
      throw new DomainError("ForbiddenError", `Permiso no existe: ${input.permissionCode}`, 404);
    }
    await db
      .delete(userPermissions)
      .where(
        and(
          eq(userPermissions.userId, input.userId),
          eq(userPermissions.permissionId, perm.id),
          eq(userPermissions.organizationId, user.organization_id),
        ),
      );
    await audit.record(ctx, {
      entityType: "user",
      entityId: input.userId,
      action: "permission.revoke",
      before: { permissionCode: input.permissionCode, reason: input.reason },
    });
  }

  return {
    createRole,
    updateRoleLabel,
    deactivateRole,
    assignRole,
    revokeRole,
    grantPermission,
    revokePermission,
  };
}

/**
 * Helper puro (testeable) que cuenta roles de un usuario.
 */
export function isAtMaxRoles(currentCount: number): boolean {
  return currentCount >= MAX_ROLES_PER_USER;
}

export const __MAX_ROLES_PER_USER__ = MAX_ROLES_PER_USER;
export const __keep_users__ = users;
export const __keep_rolePermissions__ = rolePermissions;
