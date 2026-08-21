/**
 * Errores tipados del runner one-shot (SPEC §8.4 enum cerrado).
 *
 * Mensajes NUNCA contienen: token, raíz de derivación, MASTER_KEY/SESSION_SECRET
 * o cualquier valor de env. Sólo el código estable + motivo operativo.
 */
export const ERROR_CODES = [
  "not_configured",
  "bad_manifest",
  "bad_fqdn",
  "conflict",
  "preflight_unknown",
  "dns_unresolved",
  "already_running",
  "infra_blocked",
  "upstream_40x",
  "audit_failed",
  "lock_error",
  "unknown_verb",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export class ProvisionError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown> | undefined;
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

/** Outcome tipado de una operación ensure_* — base del reporte final. */
export type EnsureOutcome = {
  ok: true;
  op: string;
  slug: string;
  /** fqdn es opcional porque los recursos sin app (project/env/db/storage) no lo tienen. */
  fqdn?: string | undefined;
  uuid: string;
  status: "created" | "adopted";
  source: "coolify-response" | "adopted";
};

export type EnsureFailure = {
  ok: false;
  op: string;
  slug: string;
  error: { code: ErrorCode; message: string };
};

export type EnsureResult = EnsureOutcome | EnsureFailure;