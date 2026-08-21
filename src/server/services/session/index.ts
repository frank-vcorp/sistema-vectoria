/**
 * Servicio `session` — JWT httpOnly Secure SameSite=Strict + refresh
 * rotante con familia (ADR-06 §2.1).
 *
 * Reglas:
 *  - Access JWT TTL corto (15 min default), refresh 7 días.
 *  - Reutilización de refresh → revoca familia + log auth.session.suspicious.
 *  - Cookie `Secure; SameSite=Strict; HttpOnly`.
 *
 * Este servicio NO toca Next.js directamente; los adapters tRPC/Route
 * Handler leen las cookies y llaman aquí. Cumple SOL inv.5 (AC-30).
 */
import { eq, and, isNull, sql } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, createHash } from "node:crypto";
import { getDb } from "@/server/db/client";
import { refreshTokens } from "@/server/db/schema";
import { addDays, addMinutes, dayKey } from "@/shared/utils";
import { DomainError } from "@/shared/errors";
import type { Context } from "@/shared/zod";

export interface SessionConfig {
  sessionSecret: string;
  accessTtlSeconds: number;
  refreshTtlDays: number;
  issuer: string;
}

export interface SessionService {
  openAccessToken(payload: {
    userId: string;
    organizationId: string;
    roles: string[];
    permissions: string[];
    /**
     * Claim opcional `actor_role_code` (ADR-06 §2.1, AC-82) — rol funcional
     * activo en acciones críticas combinables (ACTORES §6). Se firma sólo
     * cuando está presente; ausente → claim omitido del JWT (no rompe
     * tokens/sesiones existentes).
     */
    actorRoleCode?: string;
  }): Promise<{ token: string; expiresAt: Date; jti: string }>;
  verifyAccessToken(token: string): Promise<{
    userId: string;
    organizationId: string;
    roles: string[];
    permissions: string[];
    jti: string;
    /** Claim opcional `actor_role_code` cuando está presente en el JWT. */
    actorRoleCode?: string;
  }>;
  issueRefreshToken(input: {
    userId: string;
    organizationId: string;
    ip?: string;
    ua?: string;
  }): Promise<{ token: string; familyId: string; expiresAt: Date }>;
  rotateRefreshToken(input: {
    token: string;
    ip?: string;
    ua?: string;
  }): Promise<{
    newAccess: { token: string; expiresAt: Date };
    newRefresh: { token: string; familyId: string; expiresAt: Date };
    reused: boolean;
    /** userId del refresh (presente tanto en éxito como en reuso detectado). */
    userId?: string;
    /** organizationId del refresh (presente tanto en éxito como en reuso detectado). */
    organizationId?: string;
  }>;
  revokeFamily(familyId: string, reason: string): Promise<void>;
  revokeAllForUser(userId: string, reason: string): Promise<void>;
}

function hashToken(t: string): string {
  return createHash("sha256").update(t).digest("hex");
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export function createSessionService(cfg: SessionConfig): SessionService {
  const db = getDb();

  async function openAccessToken(payload: {
    userId: string;
    organizationId: string;
    roles: string[];
    permissions: string[];
    actorRoleCode?: string;
  }): Promise<{ token: string; expiresAt: Date; jti: string }> {
    const jti = randomBytes(16).toString("hex");
    const expiresAt = addMinutes(new Date(), Math.max(1, Math.floor(cfg.accessTtlSeconds / 60)));
    // AC-82 / ADR-06 §2.1: claim opcional `actor_role_code` cuando aplica a
    // acción crítica combinable. Se firma sólo si está presente para no
    // contaminar el payload con `undefined` y mantener compatibilidad con
    // tokens existentes.
    const claims: Record<string, unknown> = {
      sub: payload.userId,
      oid: payload.organizationId,
      roles: payload.roles,
      perms: payload.permissions,
    };
    if (payload.actorRoleCode !== undefined && payload.actorRoleCode !== "") {
      claims["actor_role_code"] = payload.actorRoleCode;
    }
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(cfg.issuer)
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(secretKey(cfg.sessionSecret));
    return { token, expiresAt, jti };
  }

  async function verifyAccessToken(token: string) {
    const { payload } = await jwtVerify(token, secretKey(cfg.sessionSecret), {
      issuer: cfg.issuer,
    });
    const out: {
      userId: string;
      organizationId: string;
      roles: string[];
      permissions: string[];
      jti: string;
      actorRoleCode?: string;
    } = {
      userId: String(payload.sub ?? ""),
      organizationId: String(payload.oid ?? ""),
      roles: Array.isArray(payload["roles"]) ? (payload["roles"] as string[]) : [],
      permissions: Array.isArray(payload["perms"]) ? (payload["perms"] as string[]) : [],
      jti: String(payload.jti ?? ""),
    };
    // Claim opcional — sólo presente si el emisor lo firmó.
    if (typeof payload["actor_role_code"] === "string") {
      out.actorRoleCode = String(payload["actor_role_code"]);
    }
    return out;
  }

  async function issueRefreshToken(input: {
    userId: string;
    organizationId: string;
    ip?: string;
    ua?: string;
  }): Promise<{ token: string; familyId: string; expiresAt: Date }> {
    const token = randomBytes(32).toString("base64url");
    const familyId = randomBytes(16).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = addDays(new Date(), cfg.refreshTtlDays);
    await db.insert(refreshTokens).values({
      userId: input.userId,
      organizationId: input.organizationId,
      familyId,
      tokenHash,
      expiresAt,
      usedAt: null,
      revokedAt: null,
      createdByIp: input.ip ?? null,
      createdByUaHash: input.ua ? hashToken(input.ua) : null,
      isActive: true,
    });
    return { token, familyId, expiresAt };
  }

  async function rotateRefreshToken(input: { token: string; ip?: string; ua?: string }) {
    const tokenHash = hashToken(input.token);
    const [row] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    if (!row) {
      throw new DomainError("ForbiddenError", "Refresh inválido", 401);
    }
    // Reutilización detectada.
    if (row.usedAt || !row.isActive) {
      await revokeFamily(row.familyId, "refresh_reuse");
      return {
        newAccess: { token: "", expiresAt: new Date() },
        newRefresh: { token: "", familyId: row.familyId, expiresAt: new Date() },
        reused: true,
        userId: row.userId,
        organizationId: row.organizationId,
      };
    }
    if (row.expiresAt < new Date()) {
      throw new DomainError("ForbiddenError", "Refresh expirado", 401);
    }
    // Marcar usado.
    await db
      .update(refreshTokens)
      .set({ usedAt: new Date(), isActive: false })
      .where(eq(refreshTokens.id, row.id));
    // Emitir nuevo par.
    // Para construir el access, necesitamos roles/perms del usuario.
    const { userRoles } = await import("@/server/db/schema/user-roles");
    const { rolePermissions } = await import("@/server/db/schema/role-permissions");
    const { permissions } = await import("@/server/db/schema/permissions");
    const roleRows = await db
      .select({ id: userRoles.roleId })
      .from(userRoles)
      .where(and(eq(userRoles.userId, row.userId), eq(userRoles.organizationId, row.organizationId)));
    const roleIds = roleRows.map((r) => r.id);
    let codes: string[] = [];
    if (roleIds.length > 0) {
      const { inArray } = await import("drizzle-orm");
      const pr = await db
        .select({ code: permissions.code })
        .from(rolePermissions)
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(
          and(
            eq(rolePermissions.organizationId, row.organizationId),
            inArray(rolePermissions.roleId, roleIds),
          ),
        );
      codes = Array.from(new Set(pr.map((p) => p.code)));
    }
    const access = await openAccessToken({
      userId: row.userId,
      organizationId: row.organizationId,
      roles: [], // roles se materializan en BD vía `hasPermission`; el token lleva snapshot opcional.
      permissions: codes,
    });
    const refresh = await issueRefreshToken({
      userId: row.userId,
      organizationId: row.organizationId,
      ...(input.ip !== undefined ? { ip: input.ip } : {}),
      ...(input.ua !== undefined ? { ua: input.ua } : {}),
    });
    // Sobrescribir el familyId del nuevo con el mismo de la familia.
    await db
      .update(refreshTokens)
      .set({ familyId: row.familyId })
      .where(eq(refreshTokens.tokenHash, hashToken(refresh.token)));
    return {
      newAccess: { token: access.token, expiresAt: access.expiresAt },
      newRefresh: { token: refresh.token, familyId: row.familyId, expiresAt: refresh.expiresAt },
      reused: false,
      userId: row.userId,
      organizationId: row.organizationId,
    };
  }

  async function revokeFamily(familyId: string, reason: string): Promise<void> {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date(), revokedReason: reason, isActive: false })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  async function revokeAllForUser(userId: string, reason: string): Promise<void> {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date(), revokedReason: reason, isActive: false })
      .where(
        and(
          eq(refreshTokens.userId, userId),
          isNull(refreshTokens.revokedAt),
        ),
      );
  }

  return {
    openAccessToken,
    verifyAccessToken,
    issueRefreshToken,
    rotateRefreshToken,
    revokeFamily,
    revokeAllForUser,
  };
}

/**
 * Helper de ctx desde access token verificado. No lee cookies.
 */
export function contextFromAccess(
  userId: string,
  organizationId: string,
  roles: string[],
  permissions: string[],
  requestId?: string,
): Context {
  return {
    user: { id: userId, organization_id: organizationId },
    roles,
    permissions,
    ...(requestId !== undefined ? { requestId } : {}),
  };
}

// Para evitar warning de no uso.
export const __dayKey__ = dayKey;
export const __sql__ = sql;
