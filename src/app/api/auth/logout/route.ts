/**
 * Route handler `POST /api/auth/logout`.
 *
 * AC-72-EX (P2-1): cablea `audit.record({ action: "auth.logout" })` con
 * actor = usuario del access token. Si no hay access cookie válida
 * → revoca best-effort + `200` sin audit (no hay actor).
 *
 * Comportamiento:
 *  - Lee cookie `vectoria_access` y la verifica (si existe).
 *  - Lee cookie `vectoria_refresh` y la revoca vía
 *    `session.revokeFamily` / `revokeAllForUser` (best-effort).
 *  - Si tenemos actor, escribe `auth.logout` en `audit_logs`.
 *  - Borra cookies `vectoria_access` y `vectoria_refresh`.
 */
import { cookies } from "next/headers";
import { createSessionService } from "@/server/services/session";
import { createAuditService } from "@/server/services/audit";
import { loadEnv } from "@/lib/env";

export async function POST() {
  const env = loadEnv();
  const session = createSessionService({
    sessionSecret: env.SESSION_SECRET,
    accessTtlSeconds: 900,
    refreshTtlDays: 7,
    issuer: env.APP_BASE_URL,
  });
  const audit = createAuditService();
  const jar = cookies();

  // 1) Determinar actor del access token (best-effort).
  const accessToken = jar.get("vectoria_access")?.value;
  let actorUserId: string | null = null;
  let actorOrgId: string | null = null;
  if (accessToken) {
    try {
      const verified = await session.verifyAccessToken(accessToken);
      if (verified.userId && verified.organizationId) {
        actorUserId = verified.userId;
        actorOrgId = verified.organizationId;
      }
    } catch {
      // Token expirado/inválido → continuar sin actor.
    }
  }

  // 2) Revocar el refresh actual (best-effort; si token está ilegible o
  // no existe, omit sin error).
  const refreshToken = jar.get("vectoria_refresh")?.value;
  if (refreshToken) {
    try {
      // Intentar rotación para detectar reuso y revocar familia; si falla,
      // igual borramos cookies. ADR-06 §2.4 + AC-72-EX.
      const r = await session.rotateRefreshToken({ token: refreshToken });
      if (r.userId && r.organizationId && !actorUserId) {
        actorUserId = r.userId;
        actorOrgId = r.organizationId;
      }
      if (r.reused && r.userId && r.organizationId) {
        // Reuso detectado durante logout: registramos también
        // auth.session.suspicious (cubre §2.8 redundante).
        await audit.record(
          {
            user: { id: r.userId, organization_id: r.organizationId },
            roles: [],
            permissions: [],
          },
          {
            entityType: "session",
            entityId: r.userId,
            action: "auth.session.suspicious",
            reason: "refresh_reuse_on_logout",
          },
        );
      }
    } catch {
      // Refresh inválido/expirado — continuamos sin audit previo.
    }
  }

  // 3) Auditoría de logout (sólo si tenemos actor).
  if (actorUserId && actorOrgId) {
    await audit.record(
      {
        user: { id: actorUserId, organization_id: actorOrgId },
        roles: [],
        permissions: [],
      },
      {
        entityType: "session",
        entityId: actorUserId,
        action: "auth.logout",
      },
    );
  }

  // 4) Borrar cookies.
  jar.delete("vectoria_access");
  jar.delete("vectoria_refresh");
  return Response.json({ ok: true });
}