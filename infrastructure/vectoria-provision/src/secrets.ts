/**
 * Derivación de secretos mecánicos por HKDF-SHA256 (SPEC §9).
 *
 *  master_key          = HKDF-SHA256(ikm=SECRET_DERIVATION_ROOT, salt="", info="vectoria/master-key/"  + projectUuid + "/v" + version, L=32)
 *  session_secret      = HKDF-SHA256(ikm=SECRET_DERIVATION_ROOT, salt="", info="vectoria/session-secret/" + projectUuid + "/v" + version, L=32)
 *  superuser_password  = HKDF-SHA256(ikm=SECRET_DERIVATION_ROOT, salt="", info="vectoria/bootstrap/"      + projectUuid + "/v" + version, L=32) → base64url (24+ chars)
 *
 * Propiedades:
 *  - Determinista con (projectUuid, secretName, version): AC-8 retry reproducible.
 *  - Distinto por proyecto: info incluye `projectUuid`.
 *  - Nunca sale del runner: se escribe directo vía `ensure_env`; el caller sólo ve `ok`.
 *  - Longitud L=32 bytes (256 bits) para master_key/session_secret, 32 bytes para bootstrap
 *    (luego se codifica en base64url → ≥24 chars garantizados por SPEC §9).
 *
 * Esta implementación usa `node:crypto.hkdfSync` (RFC 5869, presente en Node ≥15).
 */
import { hkdfSync } from "node:crypto";

export type SecretName = "master-key" | "session-secret" | "bootstrap";

export const SECRET_NAMES: readonly SecretName[] = [
  "master-key",
  "session-secret",
  "bootstrap",
];

/** Longitud en bytes para cada secreto (L del HKDF). */
export function secretLength(name: SecretName): number {
  if (name === "master-key") return 32;
  if (name === "session-secret") return 32;
  return 32; // bootstrap: 32B → base64url(43 chars sin padding) ≥24 (SPEC §9).
}

const SECRET_INFO_PREFIX: Record<SecretName, string> = {
  "master-key": "vectoria/master-key/",
  "session-secret": "vectoria/session-secret/",
  bootstrap: "vectoria/bootstrap/",
};

/**
 * Deriva `length` bytes del secreto `name` para el proyecto `projectUuid` y versión `version`.
 * El resultado es un Buffer NUEVO; el caller debe responsabilizarse de NO imprimirlo
 * y de NO persistirlo en artefactos/logs/stdout.
 *
 * @param rootValue  32 bytes aleatorios de SECRET_DERIVATION_ROOT
 * @param projectUuid UUID Coolify del proyecto (string no vacío)
 * @param name       nombre canónico del secreto
 * @param version    versión monotónica (inicial 1)
 */
export function deriveSecret(
  rootValue: Buffer,
  projectUuid: string,
  name: SecretName,
  version: number,
): Buffer {
  if (projectUuid.length === 0) {
    throw new Error("deriveSecret: projectUuid vacío");
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`deriveSecret: version inválida (${version})`);
  }
  const length = secretLength(name);
  const info = `${SECRET_INFO_PREFIX[name]}${projectUuid}/v${version}`;
  const derived = hkdfSync(
    "sha256",
    rootValue, // ikm
    Buffer.alloc(0), // salt = "" (SPEC §9 literal)
    Buffer.from(info, "utf8"),
    length,
  );
  return Buffer.from(derived);
}

/** Devuelve una versión imprimible-SAFE: `<derived> → base64url(43 chars, sin padding)`. */
export function deriveBootstrapPassword(rootValue: Buffer, projectUuid: string, version: number): string {
  const raw = deriveSecret(rootValue, projectUuid, "bootstrap", version);
  return raw.toString("base64url");
}

/**
 * Helper defensivo: dado el root (base64/hex o Buffer), normaliza a un Buffer
 * de exactamente 32 bytes. El root puede llegar como base64 (32B → 44 chars),
 * hex (64 chars) o Buffer crudo de 32 bytes.
 *
 * Validación: cualquier input que no sea un Buffer de 32 bytes, un base64 de
 * 32 bytes, o un hex de 64 chars, lanza Error. Esto evita que un Buffer
 * truncado o un string basura se filtre como IKM al HKDF (32 bytes es la
 * longitud mínima recomendada para HKDF-SHA256 con L=32).
 */
export function normalizeRoot(raw: string | Buffer): Buffer {
  if (Buffer.isBuffer(raw)) {
    if (raw.length !== 32) {
      throw new Error(
        `SECRET_DERIVATION_ROOT inválido: Buffer de ${raw.length} bytes, esperado 32`,
      );
    }
    return raw;
  }
  // intentar base64
  const b64 = Buffer.from(raw, "base64");
  if (b64.length === 32) return b64;
  // intentar hex
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  throw new Error(
    `SECRET_DERIVATION_ROOT inválido: ni base64-32B ni hex-64 (longitudes: b64=${b64.length})`,
  );
}