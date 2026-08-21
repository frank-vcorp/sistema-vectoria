/**
 * Redacción defensiva (SPEC §14 + §18 threat model).
 *
 * Garantiza que el valor del token (read o write) y la raíz de derivación
 * NUNCA aparezcan en stdout, stderr, audit ni en payloads de error.
 *
 * Esta función se aplica a TODO output que el runner escribe fuera de
 * Coolify. Es defensiva incluso si el caller olvida pasar la lista
 * explícita — deniega por nombre de campo y por patrón.
 */

const SENSITIVE_FIELD_NAMES: ReadonlySet<string> = new Set([
  "MASTER_KEY",
  "SESSION_SECRET",
  "SECRET_DERIVATION_ROOT",
  "VECTORIA_SUPERUSER_PASSWORD",
  "DATABASE_URL",
  "COOLIFY_READ_TOKEN",
  "COOLIFY_WRITE_TOKEN",
  "pac_api_key",
  "csd_password",
  "csd_pem",
  "csd_cer",
  "password_hash",
  "refresh_token",
  "access_token",
  "private_key",
  "pem",
  "cer",
]);

const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /MASTER[_-]?KEY/i,
  /SESSION[_-]?SECRET/i,
  /SECRET[_-]?DERIVATION[_-]?ROOT/i,
  /DERIVATION[_-]?ROOT/i,
  /VECTORIA[_-]?SUPERUSER[_-]?PASSWORD/i,
  /SUPERUSER[_-]?PASSWORD/i,
  /DATABASE[_-]?URL/i,
  /COOLIFY[_-]?(READ|WRITE)[_-]?TOKEN/i,
  /\btoken\b/i,
  /\bsecret\b/i,
  /password/i,
  /csd[_-]?password/i,
  /pac[_-]?api[_-]?key/i,
  /csd[_-]?pem/i,
  /csd[_-]?cer/i,
  /Bearer\s+[A-Za-z0-9._\-+/=]{4,}/,
];

/**
 * Recorre el árbol y reemplaza cualquier campo sensible por `[REDACTED]`.
 * Si se le pasa `tokens`, sustituye además el VALOR LITERAL de cada token.
 *
 * La función no imprime nada; sólo transforma.
 */
export function redact<T>(value: T, tokens?: readonly string[]): T {
  const seen = new WeakSet<object>();
  const literalPatterns: RegExp[] =
    tokens
      ?.filter((t): t is string => typeof t === "string" && t.length > 0)
      .map((t) => new RegExp(escapeRegex(t), "g")) ?? [];

  const walk = (v: unknown): unknown => {
    if (v === null || v === undefined) return v;
    if (typeof v === "string") {
      let s = v;
      for (const p of SENSITIVE_PATTERNS) s = s.replace(p, "[REDACTED]");
      for (const p of literalPatterns) s = s.replace(p, "[REDACTED]");
      return s;
    }
    if (typeof v !== "object") return v;
    if (seen.has(v as object)) return "[Circular]";
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(walk);
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (SENSITIVE_FIELD_NAMES.has(k) || SENSITIVE_PATTERNS.some((rx) => rx.test(k))) {
        out[k] = "[REDACTED]";
        continue;
      }
      out[k] = walk(val);
    }
    return out;
  };
  return walk(value) as T;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Mensaje de error sanitizado: remueve cualquier Bearer / token literal y
 * cualquier valor de campo conocido. Defense-in-depth por si una excepción
 * upstream trae un mensaje que incluya el header.
 */
export function safeErrorMessage(msg: string, tokens?: readonly string[]): string {
  let s = msg;
  for (const p of SENSITIVE_PATTERNS) s = s.replace(p, "[REDACTED]");
  for (const t of tokens ?? []) {
    if (typeof t === "string" && t.length > 0) s = s.split(t).join("[REDACTED]");
  }
  return s;
}