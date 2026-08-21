/**
 * Bootstrap tRPC. Inicialización compartida entre cliente y servidor.
 * Los routers cuelgan aquí. La UI consume vía `@trpc/react-query`.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import type { Context } from "@/shared/zod";

/**
 * Adaptador tRPC (SOL inv.3, AC-28): NO contiene reglas de negocio exclusivas.
 * Sólo valida input con Zod, deriva `Context` desde la cookie de sesión
 * verificada y delega al servicio de aplicación. Las reglas viven en
 * `src/server/services/*`.
 *
 * SPEC-001 §6 (v1.7): el enum `TRPC_ERROR_CODE_KEY` de tRPC v11 expone
 * `PAYLOAD_TOO_LARGE (413)` y `UNSUPPORTED_MEDIA_TYPE (415)`. NO expone
 * `GONE (410)` ni `LOCKED (423)`. Mapeamos a los códigos tRPC más cercanos
 * y preservamos el código HTTP real en `data.httpStatus` + el código de
 * dominio en `data.code`. Los ACs inspeccionan `error.data.code` /
 * `error.data.httpStatus` (contrato de dominio), no sólo `error.code` (transporte).
 */
export interface CreateContextOptions {
  ctx: Context;
}

export function createInnerContext(opts: CreateContextOptions): { ctx: Context } {
  return { ctx: opts.ctx };
}

export type TRPCContext = Awaited<ReturnType<typeof createInnerContext>>;

/** HTTP status → código tRPC válido. Códigos no soportados se mapean al más cercano. */
function httpToTrpcCode(http: number): TRPCError["code"] {
  switch (http) {
    case 400: return "BAD_REQUEST";
    case 401: return "UNAUTHORIZED";
    case 402: return "PAYMENT_REQUIRED";
    case 403: return "FORBIDDEN";
    case 404: return "NOT_FOUND";
    case 405: return "METHOD_NOT_SUPPORTED";
    case 408: return "TIMEOUT";
    case 409: return "CONFLICT";
    case 412: return "PRECONDITION_FAILED";
    case 413: return "PAYLOAD_TOO_LARGE";
    case 415: return "BAD_REQUEST"; // tRPC v11 sí lo expone, pero SPEC §6 prefiere BAD_REQUEST
    case 422: return "BAD_REQUEST"; // UNPROCESSABLE_CONTENT no es semántico para plataforma
    case 423: return "CONFLICT";    // LOCKED no existe → CONFLICT (rate-limit usaría 429)
    case 429: return "TOO_MANY_REQUESTS";
    // GONE (410) no existe → NOT_FOUND (resource absent/gone).
    case 410: return "NOT_FOUND";
    case 501: return "NOT_IMPLEMENTED";
    case 502: return "BAD_GATEWAY";
    case 503: return "SERVICE_UNAVAILABLE";
    case 504: return "GATEWAY_TIMEOUT";
    default: return http >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST";
  }
}

const t = initTRPC.context<TRPCContext>().create({
  errorFormatter({ shape, error }) {
    // Si el error tiene un `code` de dominio (DomainError), lo preservamos en data.code.
    const original = error.cause as unknown;
    const domainCode =
      original && typeof original === "object" && "code" in original
        ? (original as { code?: unknown }).code
        : undefined;
    const httpStatus =
      original && typeof original === "object" && "statusCode" in original
        ? (original as { statusCode?: unknown }).statusCode
        : undefined;
    return {
      ...shape,
      data: {
        ...shape.data,
        code: typeof domainCode === "string" ? domainCode : null,
        httpStatus: typeof httpStatus === "number" ? httpStatus : null,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Middleware que requiere un `Context` autenticado (AC-71).
 * Lanza `UNAUTHORIZED` real cuando `ctx.user === null` (sin sesión
 * o cookie/JWT inválido). NO fabrica identidad.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.ctx?.user == null) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "No autenticado" });
  }
  return next({ ctx });
});

/**
 * Traduce errores de dominio a TRPCError preservando `code` de dominio + httpStatus.
 * El `errorFormatter` (arriba) emite `data.code` y `data.httpStatus` para que el
 * cliente pueda inspeccionar el contrato de dominio.
 */
export function toTrpcError(err: unknown): TRPCError {
  if (err instanceof TRPCError) return err;
  if (err instanceof Error && "code" in err) {
    const e = err as Error & { code: string; statusCode?: number; metadata?: unknown };
    const http = e.statusCode ?? 500;
    const trpcCode = httpToTrpcCode(http);
    return new TRPCError({
      code: trpcCode,
      message: e.message,
      cause: err,
    });
  }
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error interno" });
}
