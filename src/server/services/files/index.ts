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
 * Bootstrap: instancia `FilesService` a partir del entorno validado
 * (`src/lib/env`). Usado por routers y servicios que necesitan
 * persistir/leer archivos (CFDI XML/PDF, evidencias, etc.). Mismo
 * patrón que `buildCryptoServiceFromEnv`.
 *
 * NOTA: la importación de `lib/env` se hace de forma lazy para no
 * forzar `EnvSchema` al ejecutar los tests puros del helper
 * `assertTtlOk` (que importan este módulo sin querer cargar env).
 */
export async function buildFilesServiceFromEnv(): Promise<FilesService> {
  const { loadEnv } = await import("@/lib/env");
  const env = loadEnv();
  return createFilesService({
    endPoint: env.S3_ENDPOINT,
    useSSL: env.S3_FORCE_PATH_STYLE ? true : false,
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
  });
}
