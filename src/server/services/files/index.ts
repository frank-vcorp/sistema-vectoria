/**
 * Servicio `files` — subida con validación tipo+tamaño (BR-N371/372, AC-14)
 * y enlaces firmados TTL ≤ 15 min (AC-13).
 *
 * Adaptador S3-compatible (MinIO en dev). La BD guarda sólo metadatos.
 */
import { eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { Client } from "minio";
import { getDb } from "@/server/db/client";
import { files } from "@/server/db/schema";
import { DomainError } from "@/shared/errors";

const DEFAULT_ALLOWLIST = [
  "application/pdf",
  "text/xml",
  "application/xml",
  "image/png",
  "image/jpeg",
];

export interface FilesServiceConfig {
  endPoint: string;
  port?: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region?: string;
}

export interface UploadInput {
  organizationId: string;
  uploadedByUserId: string;
  filename: string;
  mime: string;
  buffer: Buffer;
  allowlist?: string[];
  maxSizeKb?: number;
}

export interface UploadResult {
  fileId: string;
  bucketKey: string;
  mime: string;
  size: number;
  sha256: string;
}

export interface SignedUrlInput {
  organizationId: string;
  fileId: string;
  ttlSeconds?: number;
}

export interface FilesService {
  upload(input: UploadInput): Promise<UploadResult>;
  signedUrl(input: SignedUrlInput): Promise<string>;
  presignGet(bucketKey: string, ttlSeconds: number): Promise<string>;
}

const MAX_TTL_SECONDS = 15 * 60; // 15 min (BR-N371, AC-13).

export function createFilesService(cfg: FilesServiceConfig): FilesService {
  const client = new Client({
    endPoint: cfg.endPoint,
    ...(cfg.port !== undefined ? { port: cfg.port } : {}),
    useSSL: cfg.useSSL,
    accessKey: cfg.accessKey,
    secretKey: cfg.secretKey,
    ...(cfg.region !== undefined ? { region: cfg.region } : {}),
  });

  async function ensureBucket(): Promise<void> {
    const exists = await client.bucketExists(cfg.bucket);
    if (!exists) {
      await client.makeBucket(cfg.bucket, cfg.region);
    }
  }

  function validateUpload(
    mime: string,
    size: number,
    allowlist: string[],
    maxSizeKb: number,
  ): void {
    if (!allowlist.includes(mime)) {
      throw new DomainError("FILE_TYPE_NOT_ALLOWED", `Tipo MIME no permitido: ${mime}`, 415);
    }
    const sizeKb = Math.ceil(size / 1024);
    if (sizeKb > maxSizeKb) {
      throw new DomainError("FILE_TOO_LARGE", `Tamaño excede ${maxSizeKb}KB`, 413);
    }
  }

  async function upload(input: UploadInput): Promise<UploadResult> {
    const allowlist = input.allowlist ?? DEFAULT_ALLOWLIST;
    const maxSizeKb = input.maxSizeKb ?? 10 * 1024;
    validateUpload(input.mime, input.buffer.length, allowlist, maxSizeKb);
    await ensureBucket();
    const sha256 = createHash("sha256").update(input.buffer).digest("hex");
    const bucketKey = `${input.organizationId}/${randomBytes(8).toString("hex")}-${input.filename}`;
    await client.putObject(cfg.bucket, bucketKey, input.buffer, input.buffer.length, {
      "Content-Type": input.mime,
    });
    const db = getDb();
    const [row] = await db
      .insert(files)
      .values({
        organizationId: input.organizationId,
        bucketKey,
        mime: input.mime,
        size: input.buffer.length,
        sha256,
        uploadedBy: input.uploadedByUserId,
      })
      .returning();
    if (!row) throw new Error("file insert sin fila");
    return {
      fileId: row.id,
      bucketKey: row.bucketKey,
      mime: row.mime,
      size: row.size,
      sha256: row.sha256,
    };
  }

  async function signedUrl(input: SignedUrlInput): Promise<string> {
    const ttl = input.ttlSeconds ?? 900;
    if (ttl > MAX_TTL_SECONDS) {
      throw new DomainError(
        "TTL_TOO_LONG",
        `TTL excede ${MAX_TTL_SECONDS}s (15 min)`,
        400,
      );
    }
    const db = getDb();
    const [row] = await db
      .select()
      .from(files)
      .where(eq(files.id, input.fileId))
      .limit(1);
    if (!row || row.organizationId !== input.organizationId) {
      throw new DomainError("ForbiddenError", "Archivo no encontrado", 404);
    }
    return presignGet(row.bucketKey, ttl);
  }

  async function presignGet(bucketKey: string, ttlSeconds: number): Promise<string> {
    return await client.presignedGetObject(cfg.bucket, bucketKey, ttlSeconds);
  }

  return { upload, signedUrl, presignGet };
}

/** Helper para tests: validar TTL fuera del servicio. */
export function assertTtlOk(ttlSeconds: number): void {
  if (ttlSeconds > MAX_TTL_SECONDS) {
    throw new DomainError("TTL_TOO_LONG", "TTL excede 15 min", 400);
  }
}

export const __MAX_TTL_SECONDS__ = MAX_TTL_SECONDS;

/**
 * Normaliza `S3_ENDPOINT` (URL completa o host desnudo) al contrato
 * que espera `minio.Client`: `endPoint` = hostname sin esquema ni
 * puerto; `port` = puerto explícito si existe; `useSSL` = derivado
 * de `protocol === 'https:'`. Para host desnudo (sin esquema) se
 * asume `http://` y `useSSL=false` (el caller controla TLS con la
 * variable de entorno — no se reinterpreta `S3_FORCE_PATH_STYLE`
 * como SSL).
 *
 * IMPLEMENTATION_DEFECT IMPL-20260825-26 · intento 2: el código
 * previo pasaba `S3_ENDPOINT` crudo como `endPoint` (incluyendo
 * esquema y puerto) y derivaba `useSSL` desde `S3_FORCE_PATH_STYLE`
 * (incorrecto). MinIO exige hostname puro y `useSSL` del protocolo.
 *
 * NO expone ni persiste el endpoint/secretos en errores ni logs.
 * El helper es puro (sin I/O) — testeable sin S3 real.
 */
export interface NormalizedS3Endpoint {
  endPoint: string;
  port?: number;
  useSSL: boolean;
}

export function normalizeS3Endpoint(raw: string): NormalizedS3Endpoint {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("S3_ENDPOINT es obligatorio");
  }
  // Para host desnudo (sin `://`), anteponer `http://` para que
  // `URL` parsee hostname/puerto sin asumir esquema por defecto.
  // `URL` ya acepta esquema `http` y exige hostname no vacío.
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
    ? raw
    : `http://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("S3_ENDPOINT inválido");
  }
  const useSSL = parsed.protocol === "https:";
  // `URL.port` es string vacío cuando no hay puerto explícito; el
  // cliente MinIO acepta `port` opcional. No asignamos puerto por
  // defecto: el caller decide si MinIO local usa 80/443 o el que
  // venga en `S3_ENDPOINT`.
  const portStr = parsed.port;
  const port = portStr.length > 0 ? Number(portStr) : undefined;
  const endPoint = parsed.hostname;
  if (endPoint.length === 0) {
    throw new Error("S3_ENDPOINT sin hostname");
  }
  // Sanity-check: si el caller incluyó path o query (raro pero
  // válido en `S3_ENDPOINT=http://host/foo`), MinIO los rechaza.
  // Conservamos sólo `host[:port]` para mantener la invariante.
  return { endPoint, ...(port !== undefined ? { port } : {}), useSSL };
}

/**
 * Bootstrap: instancia `FilesService` a partir del entorno validado
 * (`src/lib/env`). Usado por routers y servicios que necesitan
 * persistir/leer archivos (CFDI XML/PDF, evidencias, etc.). Mismo
 * patrón que `buildCryptoServiceFromEnv`.
 *
 * IMPLEMENTATION_DEFECT IMPL-20260825-26 · intento 2: normaliza
 * `S3_ENDPOINT` con `normalizeS3Endpoint` antes de delegar a
 * `createFilesService`. `useSSL` ahora deriva del protocolo de la
 * URL (NO de `S3_FORCE_PATH_STYLE`, que es ortogonal a TLS).
 *
 * NOTA: la importación de `lib/env` se hace de forma lazy para no
 * forzar `EnvSchema` al ejecutar los tests puros del helper
 * `assertTtlOk` (que importan este módulo sin querer cargar env).
 */
export async function buildFilesServiceFromEnv(): Promise<FilesService> {
  const { loadEnv } = await import("@/lib/env");
  const env = loadEnv();
  const normalized = normalizeS3Endpoint(env.S3_ENDPOINT);
  return createFilesService({
    endPoint: normalized.endPoint,
    ...(normalized.port !== undefined ? { port: normalized.port } : {}),
    useSSL: normalized.useSSL,
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
  });
}
