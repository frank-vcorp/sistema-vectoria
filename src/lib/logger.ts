/**
 * Logger estructurado (pino). Allowlist de campos sensibles (ADR-03 §3.5):
 * NUNCA se loguea MASTER_KEY, password, CSD password, API key PAC,
 * contenido .pem, ni XML/PDF CFDI.
 *
 * Los servicios reciben un `logger` por inyección; este módulo exporta
 * el factory y una allowlist que cualquier adapter de logger debe respetar.
 */
import pino, { type Logger } from "pino";

const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /MASTER_KEY/i,
  /password/i,
  /csd[_-]?password/i,
  /pac[_-]?api[_-]?key/i,
  /csd[_-]?pem/i,
  /csd[_-]?cer/i,
];

const SENSITIVE_FIELD_NAMES: ReadonlySet<string> = new Set([
  "pac_api_key",
  "pac_api_key_ciphertext",
  "csd_password",
  "csd_password_ciphertext",
  "password",
  "password_hash",
  "token",
  "token_hash",
  "refresh_token",
  "access_token",
  "pem",
  "cer",
  "master_key",
  "MASTER_KEY",
  "session_secret",
  "SESSION_SECRET",
]);

/**
 * Sanitiza un objeto eliminando campos sensibles. Recursivo hasta `seen` ciclos.
 * NO imprime nada; sólo transforma.
 */
export function redact<T>(value: T): T {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (v === null || v === undefined) return v;
    if (typeof v !== "object") return v;
    if (seen.has(v as object)) return "[Circular]";
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(walk);
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (SENSITIVE_FIELD_NAMES.has(k)) {
        out[k] = "[REDACTED]";
        continue;
      }
      if (SENSITIVE_PATTERNS.some((rx) => rx.test(k))) {
        out[k] = "[REDACTED]";
        continue;
      }
      out[k] = walk(val);
    }
    return out;
  };
  return walk(value) as T;
}

export function createLogger(level: string = "info"): Logger {
  const l = pino({
    level,
    redact: {
      paths: [
        "*.pac_api_key",
        "*.csd_password",
        "*.password",
        "*.password_hash",
        "*.MASTER_KEY",
        "*.SESSION_SECRET",
        "*.token",
        "*.refresh_token",
        "*.access_token",
      ],
      censor: "[REDACTED]",
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
  return l;
}

let _default: Logger | null = null;
export function defaultLogger(): Logger {
  if (!_default) _default = createLogger(process.env["LOG_LEVEL"] ?? "info");
  return _default;
}
