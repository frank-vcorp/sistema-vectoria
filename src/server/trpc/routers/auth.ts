/**
 * Router `auth` — login, logout, refresh, status.
 * El adaptador tRPC **no** consulta Drizzle directamente (AC-28): delega
 * al servicio `auth` y `session`.
 *
 * Bitácora `auth.*` (AC-72 / AC-72-EX):
 *  - `auth.login.success` tras login válido.
 *  - `auth.login.failed` tras contraseña inválida (con `registerFailedLogin`).
 *  - `auth.login.locked` cuando la cuenta está bloqueada.
 *  - `auth.session.suspicious` cuando el refresh se reutiliza.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router, toTrpcError } from "../trpc";
import { createAuthService } from "@/server/services/auth";
import { createSessionService } from "@/server/services/session";
import { createAuditService } from "@/server/services/audit";
import { DomainError } from "@/shared/errors";
import { loadEnv } from "@/lib/env";

const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRouter = router({
  login: publicProcedure
    .input(LoginInput)
    .mutation(async ({ input }) => {
      const env = loadEnv();
      const auth = createAuthService({
        lockoutMaxAttempts: env.LOCKOUT_MAX_ATTEMPTS,
        lockoutWindowMinutes: env.LOCKOUT_WINDOW_MINUTES,
      });
      const session = createSessionService({
        sessionSecret: env.SESSION_SECRET,
        accessTtlSeconds: 15 * 60,
        refreshTtlDays: 7,
        issuer: env.APP_BASE_URL,
      });
      const audit = createAuditService();
      const result = await auth.verifyPassword({ email: input.email, password: input.password });
      if (result.kind === "invalid_credentials") {
        // Buscar usuario por email para incrementar failed_login_count y
        // escribir bitácora auth.login.failed. Si no existe, sólo emitimos
        // respuesta sin fugar existencia (mismo patrón que login/route.ts).
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
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Credenciales inválidas" });
      }
      if (result.kind === "account_locked") {
        // Buscar usuario para bitácora auth.login.locked (mismo patrón que login/route.ts).
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
        throw new TRPCError({
          code: "CONFLICT", // tRPC v11 no expone LOCKED → CONFLICT + data.httpStatus=423.
          message: "Cuenta bloqueada temporalmente",
          cause: new DomainError(
            "ACCOUNT_LOCKED",
            "Cuenta bloqueada temporalmente",
            423,
            { lockedUntil: result.lockedUntil.toISOString() },
          ),
        });
      }
      // result.kind === "ok"
      const u = result.user;
      await auth.resetFailedLogin(u.userId, u.organizationId);
      const refresh = await session.issueRefreshToken({
        userId: u.userId,
        organizationId: u.organizationId,
      });
      const access = await session.openAccessToken({
        userId: u.userId,
        organizationId: u.organizationId,
        roles: [],
        permissions: [],
      });
      // audit.login.success con un Context construido (actor user; sin
      // pasar por protectedProcedure porque aquí no hay sesión todavía).
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
      return {
        user: u,
        access: { token: access.token, expiresAt: access.expiresAt.toISOString() },
        refresh: { token: refresh.token, expiresAt: refresh.expiresAt.toISOString() },
      };
    }),

  refresh: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const env = loadEnv();
      const session = createSessionService({
        sessionSecret: env.SESSION_SECRET,
        accessTtlSeconds: 15 * 60,
        refreshTtlDays: 7,
        issuer: env.APP_BASE_URL,
      });
      const audit = createAuditService();
      try {
        const r = await session.rotateRefreshToken({ token: input.token });
        if (r.reused) {
          // Reutilización detectada: revoca familia (hecho por el servicio)
          // + bitácora auth.session.suspicious (AC-72-EX, ADR-06 §2.8).
          if (r.userId && r.organizationId) {
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
                reason: "refresh_reuse",
              },
            );
          }
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Refresh reutilizado" });
        }
        // Refresh exitoso: bitácora auth.refresh.
        if (r.userId && r.organizationId) {
          await audit.record(
            {
              user: { id: r.userId, organization_id: r.organizationId },
              roles: [],
              permissions: [],
            },
            {
              entityType: "session",
              entityId: r.userId,
              action: "auth.refresh",
            },
          );
        }
        return {
          access: { token: r.newAccess.token, expiresAt: r.newAccess.expiresAt.toISOString() },
          refresh: { token: r.newRefresh.token, expiresAt: r.newRefresh.expiresAt.toISOString() },
        };
      } catch (e) {
        throw toTrpcError(e);
      }
    }),

  me: protectedProcedure.query(({ ctx }) => {
    return ctx.ctx;
  }),
});