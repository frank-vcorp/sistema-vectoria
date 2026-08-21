/**
 * Adaptador HTTP → Context tRPC (AC-71 / SPEC-001 §4.2).
 *
 * Lee la cookie httpOnly `vectoria_access` (NO el header `authorization`
 * estilo OAuth). El cliente tRPC (`lib/trpc.ts` + `components/providers.tsx`)
 * usa `httpBatchLink` sin header manual — la cookie same-origin viaja
 * por defecto (no `credentials: 'include'` necesario en same-origin).
 *
 * Devuelve `ctx.user = null` cuando no hay cookie o el JWT es inválido.
 * `protectedProcedure` lanza `UNAUTHORIZED` real cuando `ctx.user === null`.
 * Nunca fabrica identidad (UUID cero u otra).
 */
import { createInnerContext } from "./trpc";
import { contextFromAccess, createSessionService } from "@/server/services/session";
import { loadEnv } from "@/lib/env";

const ACCESS_COOKIE_NAME = "vectoria_access";

function parseCookieHeader(header: string | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k.length > 0) out[k] = decodeURIComponent(v);
  }
  return out;
}

export async function createTrpcContext(request: Request) {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const accessToken = cookies[ACCESS_COOKIE_NAME] ?? null;
  if (!accessToken) {
    return createInnerContext({ ctx: { user: null, roles: [], permissions: [] } });
  }
  let env;
  try {
    env = loadEnv();
  } catch {
    // Env inválido (tests sin .env) — sin identidad, sin lanzar.
    return createInnerContext({ ctx: { user: null, roles: [], permissions: [] } });
  }
  const session = createSessionService({
    sessionSecret: env.SESSION_SECRET,
    accessTtlSeconds: 900,
    refreshTtlDays: 7,
    issuer: env.APP_BASE_URL,
  });
  try {
    const token = await session.verifyAccessToken(accessToken);
    return createInnerContext({
      ctx: contextFromAccess(
        token.userId,
        token.organizationId,
        token.roles,
        token.permissions,
        request.headers.get("x-request-id") ?? undefined,
      ),
    });
  } catch {
    // JWT inválido o expirado — `ctx.user = null`. `protectedProcedure` rechaza.
    return createInnerContext({ ctx: { user: null, roles: [], permissions: [] } });
  }
}
