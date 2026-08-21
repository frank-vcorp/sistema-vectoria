/**
 * Route handler `POST /api/auth/login`.
 *
 * AC-72: cablea `registerFailedLogin` + bitácora `auth.*`:
 *  - 5 logins fallidos → contador a 5 + `users.locked_until` seteado (AC-21).
 *  - `auth.login.failed` / `auth.login.locked` / `auth.login.success` se
 *    escriben en `audit_logs` con `actor_user_id` del usuario.
 *  - Cookie httpOnly `vectoria_access` (Secure; SameSite=Strict) — único
 *    transporte de sesión; el cliente tRPC la lee vía cookie same-origin.
 */
import { cookies } from "next/headers";
import { createAuthService } from "@/server/services/auth";
import { createSessionService } from "@/server/services/session";
import { createAuditService } from "@/server/services/audit";
import { DomainError } from "@/shared/errors";
import { loadEnv } from "@/lib/env";

export async function POST(request: Request) {
  const input = (await request.json()) as { email?: string; password?: string };
  if (!input.email || !input.password) {
    return Response.json({ code: "INVALID_INPUT" }, { status: 400 });
  }
  const env = loadEnv();
  const auth = createAuthService({
    lockoutMaxAttempts: env.LOCKOUT_MAX_ATTEMPTS,
    lockoutWindowMinutes: env.LOCKOUT_WINDOW_MINUTES,
  });
  const session = createSessionService({
    sessionSecret: env.SESSION_SECRET,
    accessTtlSeconds: 900,
    refreshTtlDays: 7,
    issuer: env.APP_BASE_URL,
  });
  const audit = createAuditService();
  const result = await auth.verifyPassword({ email: input.email, password: input.password });

  if (result.kind === "invalid_credentials") {
    // Buscar usuario por email para incrementar failed_login_count y
    // escribir bitácora auth.login.failed. Si no existe, sólo emitimos
    // respuesta sin fugar existencia (timing similar al verifyPassword).
    let actorUserId: string | null = null;
    let actorOrgId: string | null = null;
    try {
      const u = await auth.lookupActor(input.email);
      if (u) {
        actorUserId = u.id;
        actorOrgId = u.organizationId;
        await auth.registerFailedLogin(u.id, u.organizationId);
      }
    } catch {
      // swallow — no exponer detalles internos en respuesta.
    }
    if (actorUserId && actorOrgId) {
      await audit.record(
        {
          user: { id: actorUserId, organization_id: actorOrgId },
          roles: [],
          permissions: [],
        },
        {
          entityType: "user",
          entityId: actorUserId,
          action: "auth.login.failed",
        },
      );
    }
    return Response.json({ code: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  if (result.kind === "account_locked") {
    // Buscar usuario para bitácora auth.login.locked.
    try {
      const u = await auth.lookupActor(input.email);
      if (u) {
        await audit.record(
          {
            user: { id: u.id, organization_id: u.organizationId },
            roles: [],
            permissions: [],
          },
          {
            entityType: "user",
            entityId: u.id,
            action: "auth.login.locked",
            after: { lockedUntil: result.lockedUntil.toISOString() },
          },
        );
      }
    } catch {
      // swallow
    }
    return Response.json(
      {
        code: "ACCOUNT_LOCKED",
        lockedUntil: result.lockedUntil.toISOString(),
      },
      { status: 423 },
    );
  }

  // result.kind === "ok"
  const u = result.user;
  await auth.resetFailedLogin(u.userId, u.organizationId);
  const access = await session.openAccessToken({
    userId: u.userId,
    organizationId: u.organizationId,
    roles: [],
    permissions: [],
  });
  const refresh = await session.issueRefreshToken({
    userId: u.userId,
    organizationId: u.organizationId,
  });
  // Bitácora auth.login.success.
  await audit.record(
    {
      user: { id: u.userId, organization_id: u.organizationId },
      roles: [],
      permissions: [],
    },
    {
      entityType: "user",
      entityId: u.userId,
      action: "auth.login.success",
    },
  );
  const jar = cookies();
  const common = {
    httpOnly: true,
    secure: env.COOKIE_SECURE || env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
  };
  jar.set("vectoria_access", access.token, { ...common, expires: access.expiresAt });
  jar.set("vectoria_refresh", refresh.token, {
    ...common,
    expires: refresh.expiresAt,
    path: "/api/auth/refresh",
  });
  return Response.json({ ok: true });
}

// Exportado para tests de bitácora si aplica.
export const __DomainError_keep__ = DomainError;
