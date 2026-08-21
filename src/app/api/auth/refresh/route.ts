/**
 * Route handler `POST /api/auth/refresh`.
 *
 * AC-72-EX (P2-1): cablea `audit.record` para `auth.refresh` (éxito) y
 * `auth.session.suspicious` con `reason='refresh_reuse'` (reuso detectado).
 *
 * Comportamiento: lee cookie `vectoria_refresh`, rota vía
 * `session.rotateRefreshToken`. Si `result.reused === true` → la familia
 * ya fue revocada por el servicio + auditamos el evento sospechoso.
 * Si éxito → auditamos `auth.refresh` y reescribimos cookies.
 */
import { cookies } from "next/headers";
import { createSessionService } from "@/server/services/session";
import { createAuditService } from "@/server/services/audit";
import { loadEnv } from "@/lib/env";

export async function POST() {
  const env = loadEnv();
  const token = cookies().get("vectoria_refresh")?.value;
  if (!token) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  const session = createSessionService({
    sessionSecret: env.SESSION_SECRET,
    accessTtlSeconds: 900,
    refreshTtlDays: 7,
    issuer: env.APP_BASE_URL,
  });
  const audit = createAuditService();
  try {
    const result = await session.rotateRefreshToken({ token });
    if (result.reused) {
      // Reuso detectado → familia revocada por el servicio + auditamos.
      if (result.userId && result.organizationId) {
        await audit.record(
          {
            user: { id: result.userId, organization_id: result.organizationId },
            roles: [],
            permissions: [],
          },
          {
            entityType: "session",
            entityId: result.userId,
            action: "auth.session.suspicious",
            reason: "refresh_reuse",
          },
        );
      }
      return Response.json({ code: "REFRESH_REUSED" }, { status: 401 });
    }
    // Refresh exitoso → auditamos.
    if (result.userId && result.organizationId) {
      await audit.record(
        {
          user: { id: result.userId, organization_id: result.organizationId },
          roles: [],
          permissions: [],
        },
        {
          entityType: "session",
          entityId: result.userId,
          action: "auth.refresh",
        },
      );
    }
    const jar = cookies();
    const common = {
      httpOnly: true,
      secure: env.COOKIE_SECURE || env.NODE_ENV === "production",
      sameSite: "strict" as const,
      path: "/",
    };
    jar.set("vectoria_access", result.newAccess.token, { ...common, expires: result.newAccess.expiresAt });
    jar.set("vectoria_refresh", result.newRefresh.token, {
      ...common,
      expires: result.newRefresh.expiresAt,
      path: "/api/auth/refresh",
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }
}