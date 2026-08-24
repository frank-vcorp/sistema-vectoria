/**
 * Servicio `admin` — SPEC-010 §3.1 / B22.
 *
 * Esta SPEC **sólo consulta y configura**; no escribe reglas de
 * negocio. Los servicios de cada módulo son los dueños de la
 * escritura (SPEC-001 AC-5/69/70 para roles/permisos, SPEC-003
 * para catálogos/plantillas/cuestionarios, SPEC-001 AC-10 para config
 * fiscal).
 *
 * Este servicio expone:
 *  - `roles.list`: enumera roles seed del catálogo canónico.
 *  - `roles.get`: detalle de un rol + permisos efectivos según la
 *    matriz seed (DEC-FUN-20 / BR-N207).
 *  - `permissions.list`: enumera permisos BASE del catálogo canónico
 *    (la UI los muestra con tooltip en la pestaña Admin).
 *
 * Las acciones de **escritura** sobre roles/permisos siguen en el
 * servicio de SPEC-001 (`userPermissionsService`). Este servicio es
 * **read-only**.
 */
import { requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import type { AuditService } from "@/server/services/audit";
import { createHasPermissionService } from "@/server/services/hasPermission";
import {
  BASE_PERMISSIONS,
  SEED_ROLE_CODES,
  SEED_ROLE_PERMISSION_CODES,
  type BasePermission,
} from "@/shared/enums";

export interface AdminService {
  listRoles(ctx: Context): Promise<Array<{ code: string; permissionCount: number }>>;
  getRole(
    ctx: Context,
    input: { code: string },
  ): Promise<{
    code: string;
    permissions: BasePermission[];
  }>;
  listPermissions(ctx: Context): Promise<BasePermission[]>;
}

export interface CreateAdminServiceOptions {
  audit: AuditService;
}

export function createAdminService(opts: CreateAdminServiceOptions): AdminService {
  const hasPerm = createHasPermissionService();
  const audit = opts.audit;
  void opts; // auditoría explícita por endpoint

  function permissionsForRole(code: string): BasePermission[] {
    const arr = SEED_ROLE_PERMISSION_CODES[code] ?? [];
    return arr.filter((p): p is BasePermission =>
      (BASE_PERMISSIONS as readonly string[]).includes(p),
    );
  }

  async function listRoles(
    ctx: Context,
  ): Promise<Array<{ code: string; permissionCount: number }>> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_roles", { forceDb: true });
    const out = SEED_ROLE_CODES.map((code) => ({
      code,
      permissionCount: permissionsForRole(code).length,
    }));
    await audit.record(ctx, {
      entityType: "admin",
      entityId: user.id,
      action: "admin.roles.list",
      after: { count: out.length },
    });
    return out;
  }

  async function getRole(
    ctx: Context,
    input: { code: string },
  ): Promise<{ code: string; permissions: BasePermission[] }> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_roles", { forceDb: true });
    if (!(SEED_ROLE_CODES as readonly string[]).includes(input.code)) {
      return { code: input.code, permissions: [] };
    }
    const permissions = permissionsForRole(input.code);
    await audit.record(ctx, {
      entityType: "admin",
      entityId: user.id,
      action: "admin.roles.list",
      after: { code: input.code, permissionCount: permissions.length },
    });
    return { code: input.code, permissions };
  }

  async function listPermissions(ctx: Context): Promise<BasePermission[]> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_usuarios", { forceDb: true });
    await audit.record(ctx, {
      entityType: "admin",
      entityId: user.id,
      action: "admin.permissions.list",
      after: { count: BASE_PERMISSIONS.length },
    });
    return [...BASE_PERMISSIONS];
  }

  return { listRoles, getRole, listPermissions };
}
