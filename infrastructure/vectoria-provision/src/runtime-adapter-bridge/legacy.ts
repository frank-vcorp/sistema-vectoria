/**
 * Runtime adapter "legacy" — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §6.3.
 *
 * En modo legacy el runner NO carga un adapter externo; en su lugar
 * valida que todas las `secretSource.requiredKeys` estén presentes en
 * el archivo de secretos (`<secretSourceBaseDir>/<parent>/<id>.env`).
 *
 * Validación fail-closed (cierre §7.12 SOL-20260822-01):
 *  - `requiredLegacyKeysNotPresent()` retorna los nombres de keys
 *    declaradas como requeridas pero ausentes en el archivo de secretos.
 *  - Si hay ≥1 ausente → `infra_blocked(legacy_missing_required_key:<key>)`,
 *    exit 10 (SPEC §3.3).
 *  - Si todas están presentes → audit `runtimeAdapter.fallback=legacy`
 *    + `legacyKeysValidated:[...]` enumerando las keys validadas.
 *
 * Enum cerrado v1.7 (10 keys) — ampliado en `secrets-file.ts`.
 */
import { readFileSync } from "node:fs";
import type { Manifest } from "../schema.js";

/** Lista cerrada de keys v1.7 que el modo legacy valida. */
export const LEGACY_ENUM_V17_KEYS = [
  "APP_BASE_URL",
  "NODE_ENV",
  "DATABASE_URL",
  "MASTER_KEY",
  "SESSION_SECRET",
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
  "VECTORIA_DIRECTOR_EMAIL",
  "VECTORIA_SUPERUSER_PASSWORD",
] as const;

export type LegacyEnumKey = (typeof LEGACY_ENUM_V17_KEYS)[number];

/** Resultado de la validación legacy. */
export interface LegacyValidationResult {
  required: readonly string[];
  present: string[];
  missing: string[];
}

/**
 * Dado un manifest y el contenido (parsed) del archivo de secretos
 * (mapa key→value), valida que cada `secretSource.requiredKey`
 * declarado en el manifest esté presente en el archivo.
 *
 * Si el manifest no declara `secretSource.requiredKeys`, se usa el enum
 * cerrado v1.7 (10 keys) como lista default.
 */
export function validateLegacyKeys(
  manifest: Manifest,
  secretSourceContent: Record<string, string>,
): LegacyValidationResult {
  const declared = (manifest.application as { secretSource?: { requiredKeys?: string[] } }).secretSource?.requiredKeys;
  const required: readonly string[] =
    declared && declared.length > 0 ? declared : LEGACY_ENUM_V17_KEYS;

  const present: string[] = [];
  const missing: string[] = [];
  for (const k of required) {
    if (Object.prototype.hasOwnProperty.call(secretSourceContent, k) && secretSourceContent[k] !== undefined) {
      present.push(k);
    } else {
      missing.push(k);
    }
  }
  return { required, present, missing };
}

/**
 * Helper de alto nivel: dado el path al archivo de secretos, lo lee
 * y aplica `validateLegacyKeys`. Si no se puede leer, todas las
 * required keys se marcan como missing.
 */
export function validateLegacyKeysFromFile(
  manifest: Manifest,
  secretSourceFilePath: string | undefined,
): LegacyValidationResult {
  if (!secretSourceFilePath) {
    // Sin archivo → todas las required están missing.
    const declared = (manifest.application as { secretSource?: { requiredKeys?: string[] } }).secretSource?.requiredKeys;
    const required: readonly string[] =
      declared && declared.length > 0 ? declared : LEGACY_ENUM_V17_KEYS;
    return { required, present: [], missing: [...required] };
  }
  let content: Record<string, string> = {};
  try {
    const raw = readFileSync(secretSourceFilePath, "utf8");
    content = parseSecretSourceEnv(raw);
  } catch {
    // unreadable → empty content
  }
  return validateLegacyKeys(manifest, content);
}

/**
 * Parser mínimo de archivo .env: `KEY=VALUE\n` (sin quotes, sin escape).
 * Sólo presencia; el runner NUNCA imprime valores (defense-in-depth).
 */
export function parseSecretSourceEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    if (/^[A-Z][A-Z0-9_]{0,62}$/.test(k)) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Carga el adapter "legacy" — retorna un objeto inmutable con metadatos
 * para el audit. NO carga código externo.
 */
export function loadLegacyAdapter(manifest: Manifest): {
  kind: "legacy";
  version: "1.7";
  enumKeys: readonly string[];
  manifestTaskId: string;
} {
  return {
    kind: "legacy",
    version: "1.7",
    enumKeys: LEGACY_ENUM_V17_KEYS,
    manifestTaskId: manifest.taskId,
  };
}
