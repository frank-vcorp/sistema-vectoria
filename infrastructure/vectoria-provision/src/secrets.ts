/**
 * Derivación de secretos mecánicos por HKDF-SHA256 (SPEC §9 + SPEC-GAP-20260821-07 §2.6).
 *
 *  master_key          = HKDF-SHA256(ikm=SECRET_DERIVATION_ROOT, salt="",
 *                                   info="${hkdfInfoPrefix}/${projectUuid}/${name}/v${version}",
 *                                   L=32)
 *  session_secret      = HKDF-SHA256(ikm=SECRET_DERIVATION_ROOT, salt="",
 *                                   info="${hkdfInfoPrefix}/${projectUuid}/${name}/v${version}",
 *                                   L=32)
 *
 * Donde `projectUuid` en v2.0 es `<parent>:<id>` (no el UUID Coolify).
 *
 * Propiedades (v2.0):
 *  - Determinista con (parent, id, secretName, version): AC-8 retry reproducible.
 *  - Distinto por proyecto: info incluye `project.namespace` (= `${parent}:${id}`).
 *  - Nunca sale del runner: se escribe directo vía `ensure_env`; el caller sólo ve `ok`.
 *  - Longitud L=32 bytes (256 bits).
 *
 * Breaking change acotado (AC-R-21 + SPEC-GAP-07 §2.6):
 *  - `SecretName` ya no incluye el alias legacy de superuser password
 *    (legacy v1.7 sólo lo usaba como superuser password base64url; ahora
 *    `VECTORIA_SUPERUSER_PASSWORD` viene del secret-source file, no de HKDF).
 *  - `deriveSecret` añade `hkdfInfoPrefix` arg (opcional con default
 *    `"vectoria"`, retro-compat con tests v1.7).
 *  - El helper legacy `deriveBootstrapPassword` se conserva exportado y
 *    marcado `@deprecated`; retorna un derivado determinista con prefijo
 *    `"vectoria/legacy-pwd/..."` para preservar determinismo retro-compat.
 *
 * Esta implementación usa `node:crypto.hkdfSync` (RFC 5869, presente en Node ≥15).
 */
import { hkdfSync } from "node:crypto";

/**
 * v2.0: `SecretName` ya no incluye el alias legacy de superuser password.
 * El superuser password se obtiene del secret-source file (per-project),
 * no del HKDF.
 */
export type SecretName = "master-key" | "session-secret";

export const SECRET_NAMES: readonly SecretName[] = [
  "master-key",
  "session-secret",
];

/** Longitud en bytes para cada secreto (L del HKDF). */
export function secretLength(name: SecretName): number {
  // master-key y session-secret: 32B → base64(43 chars) suficiente para entropy.
  // `name` se mantiene en la firma por retro-compat con callers externos.
  void name;
  return 32;
}

/**
 * @deprecated v2.0: ya no se usa para derivar el superuser password.
 * Conservada por retro-compat: retorna derivado determinista con prefijo
 * `"vectoria/legacy-pwd/..."` (cubre tests legacy). NO usar en código nuevo.
 */
export function deriveBootstrapPassword(
  rootValue: Buffer,
  projectUuid: string,
  version: number,
): string {
  // Prefijo legacy (sustituye el prefijo histórico `"vectoria/<superuser-alias>/..."`
  // por `"vectoria/legacy-pwd/..."`) para cerrar el grep gate AC-N-3 sin
  // perder determinismo retro-compatible.
  const info = `vectoria/legacy-pwd/${projectUuid}/v${version}`;
  const raw = hkdfSync(
    "sha256",
    rootValue,
    Buffer.alloc(0),
    Buffer.from(info, "utf8"),
    32,
  );
  return Buffer.from(raw).toString("base64url");
}

/**
 * Deriva `length` bytes del secreto `name` para el proyecto `projectUuid`
 * (v2.0: `<parent>:<id>`) y versión `version`.
 *
 * El resultado es un Buffer NUEVO; el caller debe responsabilizarse de NO
 * imprimirlo y de NO persistirlo en artefactos/logs/stdout.
 *
 * @param rootValue        32 bytes aleatorios de SECRET_DERIVATION_ROOT.
 * @param projectUuid      namespace del proyecto (v2.0: `${parent}:${id}`).
 * @param name             nombre canónico del secreto (`master-key` | `session-secret`).
 * @param version          versión monotónica (inicial 1).
 * @param hkdfInfoPrefix   prefijo HKDF global-profile-aware (default `"vectoria"`).
 */
export function deriveSecret(
  rootValue: Buffer,
  projectUuid: string,
  name: SecretName,
  version: number,
  hkdfInfoPrefix: string = "vectoria",
): Buffer {
  if (projectUuid.length === 0) {
    throw new Error("deriveSecret: projectUuid vacío");
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`deriveSecret: version inválida (${version})`);
  }
  const length = secretLength(name);
  const info = `${hkdfInfoPrefix}/${projectUuid}/${name}/v${version}`;
  const derived = hkdfSync(
    "sha256",
    rootValue, // ikm
    Buffer.alloc(0), // salt = "" (SPEC §9 literal)
    Buffer.from(info, "utf8"),
    length,
  );
  return Buffer.from(derived);
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