/**
 * Servicio `hasPermission` (DEC-FUN-02, BR-N205, AC-1, AC-30, AC-81).
 *
 * **Único mecanismo** de autorización. Las policies de recurso se apoyan
 * aquí (ADR-05). NO compara nombres de rol. NO lee cookies/headers.
 *
 * AC-81 / ADR-06 §2.1 + §3.1: las **acciones críticas** deben revalidar
 * contra BD (no contra el cache del JWT). Para ellas, los callers pasan
 * `opts: { forceDb: true }` y este servicio omite el short-circuit de
 * `ctx.permissions` y va directamente a la rama BD. El comportamiento
 * por defecto (sin `opts`) sigue siendo cache + `ver_todo` short-circuit.
 */
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { rolePermissions, userPermissions, userRoles } from "@/server/db/schema";
import { ForbiddenError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";

/**
 * Opciones de evaluación de permisos.
 *
 * - `forceDb: true` → omite el short-circuit por cache del JWT y la
 *   rama `ver_todo`; ejecuta directamente la consulta BD. Reservado
 *   para **acciones críticas** (gestionar_roles, gestionar_config_fiscal,
 *   ver_auditoria, etc., ADR-06 §3.1) — evita la ventana de exposición
 *   entre revocación y TTL del access token.
 * - `forceDb: false | undefined` → comportamiento por defecto (cache +
 *   short-circuit `ver_todo`).
 */
export interface HasPermissionOptions {
  forceDb?: boolean;
}

export interface HasPermissionService {
  has(ctx: Context, code: string, opts?: HasPermissionOptions): Promise<boolean>;
  require(ctx: Context, code: string, opts?: HasPermissionOptions): Promise<void>;
}

export function createHasPermissionService(): HasPermissionService {
  const db = getDb();

  async function has(ctx: Context, code: string, opts?: HasPermissionOptions): Promise<boolean> {
    if (!ctx.user?.id) return false;
    // AC-81: si `forceDb === true`, omitir cache y `ver_todo` short-circuit
    // y ejecutar la rama BD directamente (ventana de revocación eliminada).
    if (!opts?.forceDb) {
      // 1) Cache del Context (snapshot del JWT) — válido para acciones no críticas.
      if (ctx.permissions?.includes(code)) return true;
      // 2) Si `ver_todo`, todo lo demás es visible (short-circuit Director — BR-N211).
      if (ctx.permissions?.includes("ver_todo")) return true;
    }

    // 3) BD: rol→permisos + permisos custom aditivos.
    const orgId = ctx.user.organization_id;
    const userId = ctx.user.id;

    const rolePermsRows = await db
      .select({ code: rolePermissions.permissionId })
      .from(rolePermissions)
      .innerJoin(userRoles, and(eq(userRoles.roleId, rolePermissions.roleId), eq(userRoles.userId, userId), eq(userRoles.organizationId, orgId)))
      .where(eq(rolePermissions.organizationId, orgId));

    const userPermsRows = await db
      .select({ id: userPermissions.permissionId })
      .from(userPermissions)
      .where(
        and(eq(userPermissions.userId, userId), eq(userPermissions.organizationId, orgId)),
      );

    // Necesitamos mapear permission_id → code. Hacemos lookup.
    const { permissions } = await import("@/server/db/schema/permissions");
    const allIds = [
      ...new Set([
        ...rolePermsRows.map((r) => r.code),
        ...userPermsRows.map((r) => r.id),
      ]),
    ];
    if (allIds.length === 0) return false;
    const perms = await db
      .select({ id: permissions.id, code: permissions.code })
      .from(permissions)
      .where(
        and(
          eq(permissions.organizationId, orgId),
          inArray(permissions.id, allIds),
        ),
      );
    const codes = new Set(perms.map((p) => p.code));
    return codes.has(code);
  }

  async function require(ctx: Context, code: string, opts?: HasPermissionOptions): Promise<void> {
    const user = requireUser(ctx);
    const ok = await has(ctx, code, opts);
    if (!ok) {
      // Auditoría de denegación (ADR-05 §2.6).
      const { createAuditService } = await import("@/server/services/audit");
      const audit = createAuditService();
      await audit.record(ctx, {
        entityType: "action",
        entityId: user.id,
        action: "access.denied",
        reason: `missing_permission:${code}`,
      });
      throw new ForbiddenError(`Permiso requerido: ${code}`, { code });
    }
  }

  return { has, require };
}
