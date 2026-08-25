/**
 * Route handler `POST /api/files/upload` (SPEC-20260825-026 · ADR-20260825-04).
 *
 * Capacidad mínima de evidencia comercial. NO crea bucket, NO crea
 * schema/migración: reutiliza `FilesService` (S3-compatible ya
 * provisionado + tabla `files` con metadatos).
 *
 * Contrato público:
 *  - Transporte: `multipart/form-data`, campo `file` (`File`).
 *  - 201 → `{ fileId, mime, size, sha256 }` (sin secretos, sin
 *    `bucketKey`, sin URLs internas, sin contenido).
 *  - 400 → archivo ausente o multipart inválido.
 *  - 401 → sin sesión (cookie `vectoria_access` ausente / JWT inválido).
 *  - 403 → sesión sin permiso DB `aceptar_cotizacion`
 *    (revalidado contra BD vía `forceDb: true`).
 *  - 405 → método distinto a POST.
 *  - 413 → tamaño excede `10MB` (delegado al servicio).
 *  - 415 → MIME fuera de allowlist (delegado al servicio).
 *  - 503 → variables de entorno S3 incompletas.
 *  - 500 → error inesperado de storage (redactado: nunca expone
 *    `bucketKey`, credenciales, contenido del archivo ni
 *    mensajes internos del cliente S3).
 *
 * NO loggea secretos ni el contenido del buffer. NO crea router tRPC
 * ni extiende `FilesService`.
 */
import { createTrpcContext } from "@/server/trpc/context";
import { buildFilesServiceFromEnv } from "@/server/services/files";
import { DomainError, ForbiddenError } from "@/shared/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB (mismo límite que FilesService)

/** Errores 4xx/5xx que no se loggean con stack ni mensaje interno. */
function jsonError(status: number, code: string, message: string) {
  return Response.json({ code, message }, { status });
}

/**
 * Construye el `Context` a partir de la cookie `vectoria_access`
 * (mismo contrato que los routers tRPC). `forceDb:true` se aplica
 * después en `hasPermission.require`. Devuelve `null` si la sesión
 * es inválida.
 */
async function buildContext(request: Request) {
  try {
    const { ctx } = await createTrpcContext(request);
    return ctx;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  // 1. Método: este handler sólo acepta POST. Next.js ya enruta
  //    por método, pero la guarda explícita es defensiva y
  //    permite responder 405 si el adaptador la invocara por error.
  if (request.method !== "POST") {
    return jsonError(405, "METHOD_NOT_ALLOWED", "Método no permitido");
  }

  // 2. Autenticación: misma fuente que los routers tRPC
  //    (cookie `vectoria_access` validada por session service).
  const ctx = await buildContext(request);
  const user = ctx?.user;
  if (!ctx || !user) {
    return jsonError(401, "UNAUTHORIZED", "Sesión requerida");
  }

  // 3. Permiso DB `aceptar_cotizacion` con revalidación contra BD
  //    (`forceDb: true`) — ventana de revocación cerrada.
  try {
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "aceptar_cotizacion", {
      forceDb: true,
    });
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return jsonError(403, "FORBIDDEN", "Permiso requerido: aceptar_cotizacion");
    }
    throw e;
  }

  // 4. Parseo del multipart. Next.js expone `request.formData()`
  //    sobre `runtime = "nodejs"` (mecanismo nativo, sin dep nueva).
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "INVALID_MULTIPART", "Cuerpo multipart inválido");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError(400, "FILE_REQUIRED", "Campo 'file' obligatorio");
  }

  // 5. Límite duro ANTES de cargar el buffer a memoria — evita DoS
  //    por buffers gigantes. FilesService revalida, pero cortar
  //    aquí reduce superficie.
  if (typeof file.size === "number" && file.size > MAX_BYTES) {
    return jsonError(413, "FILE_TOO_LARGE", "Archivo excede 10MB");
  }

  const filename = file.name || "evidence";
  const mime = file.type || "application/octet-stream";
  const buffer = Buffer.from(await file.arrayBuffer());

  // 6. Delegación al servicio existente. La allowlist (PDF/XML/PNG/JPEG)
  //    y el límite (10MB) viven en `FilesService`; aquí NO se
  //    reintroducen ni se relajan.
  let filesService;
  try {
    filesService = await buildFilesServiceFromEnv();
  } catch {
    // Variables de entorno S3 incompletas. NO exponer el mensaje
    // interno (puede contener nombres de variables); sólo un 503
    // canónico.
    return jsonError(503, "FILES_STORAGE_UNAVAILABLE", "Almacenamiento no configurado");
  }

  let uploaded;
  try {
    uploaded = await filesService.upload({
      organizationId: user.organization_id,
      uploadedByUserId: user.id,
      filename,
      mime,
      buffer,
    });
  } catch (e) {
    if (e instanceof DomainError) {
      // FILE_TYPE_NOT_ALLOWED → 415, FILE_TOO_LARGE → 413
      // (revalidado por el servicio), TTL_TOO_LONG no aplica aquí.
      if (e.code === "FILE_TYPE_NOT_ALLOWED") {
        return jsonError(415, "FILE_TYPE_NOT_ALLOWED", "Tipo de archivo no permitido");
      }
      if (e.code === "FILE_TOO_LARGE") {
        return jsonError(413, "FILE_TOO_LARGE", "Archivo excede 10MB");
      }
      return jsonError(e.statusCode, e.code, e.message);
    }
    // Storage/S3 falló: respondemos 500 sin filtrar el mensaje del
    // cliente S3 (puede contener endpoint, region, stack del SDK).
    return jsonError(500, "FILES_UPLOAD_FAILED", "No fue posible subir el archivo");
  }

  // 7. Respuesta redactada: sólo identificadores públicos.
  //    NO se devuelve `bucketKey`, credenciales, URL interna ni
  //    el contenido. El `sha256` permite verificación aguas abajo.
  return Response.json(
    {
      fileId: uploaded.fileId,
      mime: uploaded.mime,
      size: uploaded.size,
      sha256: uploaded.sha256,
    },
    { status: 201 },
  );
}

/** Helper interno expuesto sólo para tests unitarios del handler. */
export const __uploadRouteInternals = {
  jsonError,
  buildContext,
  MAX_BYTES,
};
