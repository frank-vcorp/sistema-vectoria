/**
 * Secret-source resolution — SPEC-20260821-001 §7 + SPEC-GAP-20260821-07 §2.6.
 *
 * Lista de keys secret-source declarativas por manifest v2 (`application.secretSource`).
 * Si el campo está ausente → legacy compat v1.7: pide las 5 keys
 * (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`,
 * `VECTORIA_SUPERUSER_PASSWORD`).
 *
 * Resolución del archivo secret-source (v2.0):
 *   1) Per-project file: `${secretSourceBaseDir}/${parent}/${id}.env` (mode 600).
 *      Si existe → leer selectivamente sólo las keys declaradas.
 *   2) Si el per-project file NO existe → fallback al archivo global
 *      (`VECTORIA_SECRETS_FILE` / `~/.config/kilo/integra.secrets.env`)
 *      por retro-compat v1.7.
 *   3) Si la key falta en ambos → `infra_blocked(secret_source_keys_missing:<key>)`.
 *
 * El runner NUNCA imprime valores: sólo nombres de keys (presencia/ausencia).
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { SECRET_SOURCE_KEY_NAMES, type SecretSourceKeyName, type Manifest } from "./schema.js";

/** Constante preservada para retro-compat (legacy v1.7). */
export const SECRET_SOURCE_KEYS_V17: readonly SecretSourceKeyName[] = SECRET_SOURCE_KEY_NAMES;

/**
 * Determina las keys secret-source que el runner debe solicitar,
 * respetando el contrato §7.1:
 *  - Si `manifest.application.secretSource` está presente y NO vacío → usar
 *    esa lista (intersección con enum cerrado; keys desconocidas se filtran).
 *  - Si está presente y vacío (`[]`) → no se piden keys.
 *  - Si está AUSENTE (manifest v1 legacy) → modo compat: el caller decide
 *    si carga las 5 keys legacy del secret-source file o si omite la carga.
 *    Para preservar compat con tests v1.7, retornamos `[]` (no-op); el
 *    caller puede invocar `legacySecretSourceKeys()` si quiere leer el file.
 */
export function requiredSecretSourceKeysFromManifest(
  manifest: Manifest,
): readonly SecretSourceKeyName[] {
  const declared = (manifest.application as { secretSource?: readonly string[] }).secretSource;
  if (declared !== undefined && Array.isArray(declared)) {
    return declared.filter((k): k is SecretSourceKeyName =>
      (SECRET_SOURCE_KEY_NAMES as readonly string[]).includes(k),
    );
  }
  return [];
}

/** Lista legacy v1.7 (5 keys). El caller la usa sólo si quiere compat explícita. */
export function legacySecretSourceKeys(): readonly SecretSourceKeyName[] {
  return SECRET_SOURCE_KEYS_V17;
}

function isSecretSourceKey(k: string): k is SecretSourceKeyName {
  return (SECRET_SOURCE_KEY_NAMES as readonly string[]).includes(k);
}

export interface SecretSourceFile {
  path: string;
  values: ReadonlyMap<SecretSourceKeyName, string>;
}

/**
 * Lee un archivo secret-source (formato `KEY=value` por línea) y retorna
 * las keys declaradas en `keys` que estén presentes. NUNCA imprime valores.
 *
 * Si `path` no existe → retorna `{path, values: Map vacío}`.
 *
 * Valida:
 *  - archivo existe y no es symlink (best-effort; stat no distingue symlinks en
 *    esta implementación — el caller debe asegurar mode 600 vía el launcher).
 *  - sólo lee las keys que el caller pidió.
 */
export function readSecretsFromFile(
  path: string,
  keys: readonly SecretSourceKeyName[],
): SecretSourceFile {
  const values = new Map<SecretSourceKeyName, string>();
  if (!existsSync(path)) {
    return { path, values };
  }
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return { path, values };
  }
  // Parse defensivo: `KEY=value` por línea, ignora comentarios (#) y líneas vacías.
  const wanted = new Set(keys);
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    if (!isSecretSourceKey(k)) continue;
    if (!wanted.has(k)) continue;
    // value: lo que sigue al `=`; NO se trimea para preservar espacios internos
    // legítimos. Defensivo: no se imprime fuera del runner.
    const v = line.slice(eq + 1);
    values.set(k, v);
  }
  return { path, values };
}

/**
 * Verifica que el archivo (si existe) tiene permisos 600. Si no, loggea WARN
 * y retorna igualmente (no aborta — el launcher aborta por separado).
 */
export function warnIfBadPerms(path: string): void {
  if (!existsSync(path)) return;
  try {
    const st = statSync(path);
    if ((st.mode & 0o777) !== 0o600) {
      process.stderr.write(
        `[vectoria-provision] WARN: secret-source ${path} mode=${(st.mode & 0o777).toString(8)} ≠ 600\n`,
      );
    }
  } catch {
    // ignore
  }
}

/**
 * Resuelve la lista de keys que faltan en el archivo cargado (per-project o
 * fallback). El caller usa esto para reportar `infra_blocked(secret_source_keys_missing:<key>)`.
 */
export function missingSecretSourceKeys(
  required: readonly SecretSourceKeyName[],
  loaded: SecretSourceFile,
): readonly SecretSourceKeyName[] {
  return required.filter((k) => !loaded.values.has(k));
}