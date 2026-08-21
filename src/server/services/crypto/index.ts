/**
 * Servicio `crypto` (AES-256-GCM + AAD contextual, versionado de llave).
 * Cumple ADR-03 v1.1 §9.1 y AC-11.
 *
 * Reglas inmutables:
 *  - Nunca se loguea MASTER_KEY, ciphertext ni plaintext.
 *  - AAD canónico: `"{organization_id}|public.{table}|{column}"`.
 *  - Formato de almacenamiento: `key_version:u8 || nonce:12B || ciphertext || tag:16B`.
 *
 * Los servicios de aplicación reciben `crypto` por inyección; este módulo es
 * seguro de importar desde la capa de servicios porque **no** depende de
 * transporte ni de Next.js.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export interface CryptoKeyRing {
  /**
   * Resuelve la llave activa para cifrar (escrituras nuevas).
   * Devuelve `{version, key: Buffer(32)}`.
   */
  active(): { version: number; key: Buffer };
  /**
   * Resuelve una llave por versión (para descifrar datos legacy).
   */
  byVersion(version: number): Buffer | null;
}

export interface EncryptedPayload {
  /** `key_version || nonce || ciphertext || tag` en bytea. */
  bytes: Buffer;
  keyVersion: number;
}

export interface DecryptionResult {
  plaintext: Buffer;
  keyVersion: number;
}

export interface CryptoService {
  encrypt(plaintext: Buffer | string, opts: { aad: string }): EncryptedPayload;
  decrypt(payload: Buffer, opts: { aad: string }): DecryptionResult;
  /** Util: ¿el AAD es string no vacío? defensa contra AAD vacío (inseguro). */
  assertValidAad(aad: string): void;
}

export function createCryptoService(keys: CryptoKeyRing): CryptoService {
  function assertValidAad(aad: string): void {
    if (typeof aad !== "string" || aad.length === 0) {
      throw new Error("AAD inválido: debe ser string no vacío (ADR-03 §9.1).");
    }
  }

  function encrypt(plaintext: Buffer | string, opts: { aad: string }): EncryptedPayload {
    assertValidAad(opts.aad);
    const buf = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext;
    const active = keys.active();
    const nonce = randomBytes(NONCE_BYTES);
    const cipher: CipherGCM = createCipheriv(ALGO, active.key, nonce);
    cipher.setAAD(Buffer.from(opts.aad, "utf8"));
    const ct = Buffer.concat([cipher.update(buf), cipher.final()]);
    const tag = cipher.getAuthTag();
    const out = Buffer.concat([Buffer.from([active.version]), nonce, ct, tag]);
    if (out.length !== 1 + NONCE_BYTES + ct.length + TAG_BYTES) {
      throw new Error("Tamaño de payload cifrado inesperado");
    }
    return { bytes: out, keyVersion: active.version };
  }

  function decrypt(payload: Buffer, opts: { aad: string }): DecryptionResult {
    assertValidAad(opts.aad);
    if (payload.length < 1 + NONCE_BYTES + TAG_BYTES) {
      throw new Error("Payload cifrado demasiado corto");
    }
    const keyVersion = payload[0]!;
    const nonce = payload.subarray(1, 1 + NONCE_BYTES);
    const tag = payload.subarray(payload.length - TAG_BYTES);
    const ct = payload.subarray(1 + NONCE_BYTES, payload.length - TAG_BYTES);
    const key = keys.byVersion(keyVersion);
    if (!key) {
      throw new Error(`No existe llave con versión ${keyVersion}`);
    }
    const decipher: DecipherGCM = createDecipheriv(ALGO, key, nonce);
    decipher.setAAD(Buffer.from(opts.aad, "utf8"));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
    return { plaintext, keyVersion };
  }

  return { encrypt, decrypt, assertValidAad };
}

/**
 * Factory de anillo de llaves a partir del entorno (un solo MASTER_KEY en MVP).
 * Para rotación multi-versión, añadir `MASTER_KEY_V2`, etc.
 */
export function buildKeyRingFromEnv(env: {
  MASTER_KEY: string;
  MASTER_KEY_VERSION: number;
}): CryptoKeyRing {
  const decode = (v: string): Buffer => {
    const b = Buffer.from(v, "base64");
    if (b.length !== 32) {
      throw new Error(`Llave debe decodificar a 32 bytes (decodificó ${b.length}).`);
    }
    return b;
  };
  const ring = new Map<number, Buffer>();
  ring.set(env.MASTER_KEY_VERSION, decode(env.MASTER_KEY));
  return {
    active: () => ({ version: env.MASTER_KEY_VERSION, key: ring.get(env.MASTER_KEY_VERSION)! }),
    byVersion: (v) => ring.get(v) ?? null,
  };
}
