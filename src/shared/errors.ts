/**
 * Errores de dominio canónicos (SPEC-001 §6). Cada error lleva un `code`
 * estable que el adaptador HTTP traduce a status code.
 */
import type { ErrorCode } from "@/shared/enums";

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly metadata?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 400,
    metadata?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.statusCode = statusCode;
    if (metadata !== undefined) this.metadata = metadata;
  }
}

export class ForbiddenError extends DomainError {
  constructor(message: string = "Forbidden", metadata?: Record<string, unknown>) {
    super("ForbiddenError", message, 403, metadata);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string = "Not found", metadata?: Record<string, unknown>) {
    super("ForbiddenError", message, 404, metadata);
    this.name = "NotFoundError";
  }
}

export class IntegrityError extends DomainError {
  constructor(message: string = "Integrity violation", metadata?: Record<string, unknown>) {
    super("IntegrityError", message, 500, metadata);
    this.name = "IntegrityError";
  }
}

/** Mapeo domain error → HTTP status para adaptadores (tRPC). */
export function domainErrorToStatus(err: unknown): number {
  if (err instanceof DomainError) return err.statusCode;
  return 500;
}

/** Mapeo domain error → code string para respuesta JSON-RPC. */
export function domainErrorToCode(err: unknown): string {
  if (err instanceof DomainError) return err.code;
  return "UNKNOWN";
}

/**
 * Helper para servicios que requieren `ctx.user` no nulo.
 * Lanza `DomainError("ForbiddenError", ..., 401)` si el contexto no trae
 * usuario autenticado. Devuelve el `user` estrechado para narrowing.
 * Cumple AC-71: nunca se fabrica identidad UUID cero; el caller debe
 * llegar aquí por `protectedProcedure` o equivalente.
 */
import type { Context } from "@/shared/zod";
export function requireUser(ctx: Context): NonNullable<Context["user"]> {
  if (!ctx.user?.id || !ctx.user.organization_id) {
    throw new DomainError("ForbiddenError", "Contexto sin usuario autenticado", 401);
  }
  return ctx.user;
}
