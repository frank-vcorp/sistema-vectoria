/**
 * IMPL-20260825-26 · Tests unitarios del route handler
 * `POST /api/files/upload` (SPEC-20260825-026, ADR-20260825-04).
 *
 * Cubre, sin BD ni red:
 *  - AC-1: 401 sin cookie `vectoria_access` válida.
 *  - AC-2: 403 cuando el usuario autenticado no tiene
 *    `aceptar_cotizacion` (evaluado con `forceDb: true`).
 *  - AC-3: 405 método distinto a POST.
 *  - AC-4: 400 cuando falta el campo `file`.
 *  - AC-5: 413 cuando el archivo excede 10MB.
 *  - AC-6: 415 cuando el MIME no está en la allowlist
 *    (delegado a `FilesService.upload`).
 *  - AC-7: 503 cuando el entorno S3 es inválido
 *    (`buildFilesServiceFromEnv` lanza).
 *  - AC-8: 500 cuando `FilesService.upload` falla por storage
 *    (sin filtrar mensaje interno).
 *  - AC-9: 201 con shape redacted
 *    `{ fileId, mime, size, sha256 }` y NUNCA
 *    `bucketKey`, credenciales ni contenido.
 *
 * Mocks: las dependencias de infra (`createTrpcContext`,
 * `hasPermission`, `buildFilesServiceFromEnv`) se aíslan con
 * `vi.mock` para no tocar env ni BD.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocks de módulos ANTES de importar el handler. Usamos los paths
// que Vitest resuelve con `resolve.alias` (vitest.config.ts):
// `@/server/trpc/context`, `@/server/services/files`,
// `@/server/services/hasPermission`.
const createTrpcContextMock = vi.fn();
const buildFilesServiceFromEnvMock = vi.fn();
const hasPermissionRequireMock = vi.fn();

vi.mock("@/server/trpc/context", () => ({
  createTrpcContext: createTrpcContextMock,
}));
vi.mock("@/server/services/files", () => ({
  buildFilesServiceFromEnv: buildFilesServiceFromEnvMock,
}));
vi.mock("@/server/services/hasPermission", () => ({
  createHasPermissionService: () => ({
    require: hasPermissionRequireMock,
    has: vi.fn().mockResolvedValue(true),
  }),
}));

async function loadHandler() {
  const mod = await import("@/app/api/files/upload/route");
  return mod.POST;
}

function makeUserContext() {
  return {
    user: {
      id: "11111111-1111-1111-1111-111111111111",
      organization_id: "22222222-2222-2222-2222-222222222222",
    },
    roles: [],
    permissions: [],
  };
}

function makeRequest(init?: { body?: BodyInit | null; method?: string }) {
  return new Request("http://localhost/api/files/upload", {
    method: init?.method ?? "POST",
    headers: { cookie: "vectoria_access=fake" },
    body: init?.body ?? null,
  });
}

function multipartWithFile(
  field: string,
  file: { name: string; type: string; content: Uint8Array },
): FormData {
  const fd = new FormData();
  // El buffer del Uint8Array se pasa como ArrayBuffer para que TS
  // lo acepte como `BlobPart` (la sobrecarca de Blob con
  // `Uint8Array<SharedArrayBuffer>` no satisface `BlobPart` bajo
  // TypeScript 5.6 con `lib.dom`).
  const buf = file.content.buffer.slice(
    file.content.byteOffset,
    file.content.byteOffset + file.content.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([buf], { type: file.type });
  fd.append(field, blob, file.name);
  return fd;
}

beforeEach(() => {
  createTrpcContextMock.mockReset();
  buildFilesServiceFromEnvMock.mockReset();
  hasPermissionRequireMock.mockReset();
  // Por defecto: sesión válida + permiso OK + upload OK.
  createTrpcContextMock.mockResolvedValue({ ctx: makeUserContext() });
  hasPermissionRequireMock.mockResolvedValue(undefined);
  buildFilesServiceFromEnvMock.mockResolvedValue({
    upload: vi.fn().mockResolvedValue({
      fileId: "99999999-9999-9999-9999-999999999999",
      bucketKey: "ORG/secret-key-prefix",
      mime: "application/pdf",
      size: 1024,
      sha256: "abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd",
    }),
    signedUrl: vi.fn(),
    presignGet: vi.fn(),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/files/upload · auth + método", () => {
  it("405 cuando el método no es POST", async () => {
    const POST = await loadHandler();
    const res = await POST(makeRequest({ method: "GET" }));
    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("401 cuando no hay cookie vectoria_access (user=null)", async () => {
    createTrpcContextMock.mockResolvedValueOnce({
      ctx: { user: null, roles: [], permissions: [] },
    });
    const POST = await loadHandler();
    const fd = multipartWithFile("file", {
      name: "a.pdf",
      type: "application/pdf",
      content: new Uint8Array([1, 2, 3]),
    });
    const res = await POST(makeRequest({ body: fd }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("401 cuando createTrpcContext lanza (env inválido)", async () => {
    createTrpcContextMock.mockRejectedValueOnce(new Error("env boom"));
    const POST = await loadHandler();
    const fd = multipartWithFile("file", {
      name: "a.pdf",
      type: "application/pdf",
      content: new Uint8Array([1, 2, 3]),
    });
    const res = await POST(makeRequest({ body: fd }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });
});

describe("POST /api/files/upload · autorización DB (aceptar_cotizacion)", () => {
  it("403 cuando el permiso DB no se cumple (forceDb:true)", async () => {
    hasPermissionRequireMock.mockRejectedValueOnce(
      new (await import("@/shared/errors")).ForbiddenError(
        "Permiso requerido: aceptar_cotizacion",
        { code: "aceptar_cotizacion" },
      ),
    );
    const POST = await loadHandler();
    const fd = multipartWithFile("file", {
      name: "a.pdf",
      type: "application/pdf",
      content: new Uint8Array([1, 2, 3]),
    });
    const res = await POST(makeRequest({ body: fd }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("FORBIDDEN");
    // La verificación pasa `forceDb: true`.
    expect(hasPermissionRequireMock).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.any(Object) }),
      "aceptar_cotizacion",
      { forceDb: true },
    );
  });

  it("200/201 cuando el permiso DB se cumple (sin tocar cache del JWT)", async () => {
    const POST = await loadHandler();
    const fd = multipartWithFile("file", {
      name: "a.pdf",
      type: "application/pdf",
      content: new Uint8Array([1, 2, 3]),
    });
    const res = await POST(makeRequest({ body: fd }));
    expect(res.status).toBe(201);
  });
});

describe("POST /api/files/upload · cuerpo del multipart", () => {
  it("400 cuando el cuerpo no es multipart válido", async () => {
    const POST = await loadHandler();
    const res = await POST(makeRequest({ body: "no es multipart" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_MULTIPART");
  });

  it("400 cuando falta el campo `file`", async () => {
    const POST = await loadHandler();
    const fd = new FormData();
    fd.append("other", "x");
    const res = await POST(makeRequest({ body: fd }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("FILE_REQUIRED");
  });

  it("413 cuando el archivo excede 10MB (corte temprano)", async () => {
    const POST = await loadHandler();
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    const fd = multipartWithFile("file", {
      name: "big.pdf",
      type: "application/pdf",
      content: big,
    });
    const res = await POST(makeRequest({ body: fd }));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.code).toBe("FILE_TOO_LARGE");
    // El servicio NO se invoca cuando el corte temprano rechaza.
    expect(buildFilesServiceFromEnvMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/files/upload · delegación a FilesService", () => {
  it("201 con shape redacted { fileId, mime, size, sha256 } — NUNCA bucketKey", async () => {
    const POST = await loadHandler();
    const fd = multipartWithFile("file", {
      name: "evidence.pdf",
      type: "application/pdf",
      content: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // %PDF
    });
    const res = await POST(makeRequest({ body: fd }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["fileId", "mime", "sha256", "size"]);
    expect(body.fileId).toBe("99999999-9999-9999-9999-999999999999");
    expect(body.mime).toBe("application/pdf");
    expect(typeof body.size).toBe("number");
    expect(typeof body.sha256).toBe("string");
    // Redactado: NO bucketKey, NO accessKey, NO endpoint, NO contenido.
    expect(body).not.toHaveProperty("bucketKey");
    expect(body).not.toHaveProperty("accessKey");
    expect(body).not.toHaveProperty("secretKey");
    expect(body).not.toHaveProperty("endpoint");
    expect(body).not.toHaveProperty("content");
    expect(body).not.toHaveProperty("buffer");
  });

  it("415 cuando el MIME no está en la allowlist (delegado al servicio)", async () => {
    buildFilesServiceFromEnvMock.mockResolvedValueOnce({
      upload: vi.fn().mockRejectedValue(
        new (await import("@/shared/errors")).DomainError(
          "FILE_TYPE_NOT_ALLOWED",
          "Tipo MIME no permitido: application/zip",
          415,
        ),
      ),
      signedUrl: vi.fn(),
      presignGet: vi.fn(),
    });
    const POST = await loadHandler();
    const fd = multipartWithFile("file", {
      name: "evidence.zip",
      type: "application/zip",
      content: new Uint8Array([0x50, 0x4b]),
    });
    const res = await POST(makeRequest({ body: fd }));
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.code).toBe("FILE_TYPE_NOT_ALLOWED");
  });

  it("413 cuando el servicio rechaza por tamaño (cota del servicio, redundante con corte temprano)", async () => {
    buildFilesServiceFromEnvMock.mockResolvedValueOnce({
      upload: vi.fn().mockRejectedValue(
        new (await import("@/shared/errors")).DomainError(
          "FILE_TOO_LARGE",
          "Tamaño excede 10240KB",
          413,
        ),
      ),
      signedUrl: vi.fn(),
      presignGet: vi.fn(),
    });
    const POST = await loadHandler();
    const fd = multipartWithFile("file", {
      name: "huge.pdf",
      type: "application/pdf",
      content: new Uint8Array(8 * 1024 * 1024),
    });
    const res = await POST(makeRequest({ body: fd }));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.code).toBe("FILE_TOO_LARGE");
  });

  it("503 cuando el entorno S3 es inválido (buildFilesServiceFromEnv lanza)", async () => {
    buildFilesServiceFromEnvMock.mockRejectedValueOnce(
      new Error(
        "Variables de entorno inválidas o ausentes — S3_ENDPOINT es obligatorio",
      ),
    );
    const POST = await loadHandler();
    const fd = multipartWithFile("file", {
      name: "a.pdf",
      type: "application/pdf",
      content: new Uint8Array([1]),
    });
    const res = await POST(makeRequest({ body: fd }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("FILES_STORAGE_UNAVAILABLE");
    // El mensaje interno del env NO se filtra al cliente.
    expect(body.message).not.toMatch(/S3_ENDPOINT/i);
  });

  it("500 cuando el storage/S3 falla (mensaje interno NO se filtra)", async () => {
    buildFilesServiceFromEnvMock.mockResolvedValueOnce({
      upload: vi.fn().mockRejectedValue(
        new Error(
          "S3 PutObject failed: ECONNREFUSED 127.0.0.1:9000 (accessKey=AKIA-SECRET-LEAK)",
        ),
      ),
      signedUrl: vi.fn(),
      presignGet: vi.fn(),
    });
    const POST = await loadHandler();
    const fd = multipartWithFile("file", {
      name: "a.pdf",
      type: "application/pdf",
      content: new Uint8Array([1]),
    });
    const res = await POST(makeRequest({ body: fd }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("FILES_UPLOAD_FAILED");
    // Ni el endpoint interno ni la credencial se filtran al cliente.
    expect(body.message).not.toMatch(/127\.0\.0\.1/);
    expect(body.message).not.toMatch(/AKIA/);
    expect(body.message).not.toMatch(/ECONNREFUSED/);
  });

  it("delega organizationId + uploadedByUserId del Context al servicio", async () => {
    const uploadFn = vi.fn().mockResolvedValue({
      fileId: "id-1",
      bucketKey: "x",
      mime: "application/pdf",
      size: 10,
      sha256: "h",
    });
    buildFilesServiceFromEnvMock.mockResolvedValueOnce({
      upload: uploadFn,
      signedUrl: vi.fn(),
      presignGet: vi.fn(),
    });
    const POST = await loadHandler();
    const fd = multipartWithFile("file", {
      name: "a.pdf",
      type: "application/pdf",
      content: new Uint8Array([1]),
    });
    await POST(makeRequest({ body: fd }));
    expect(uploadFn).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "22222222-2222-2222-2222-222222222222",
        uploadedByUserId: "11111111-1111-1111-1111-111111111111",
        filename: "a.pdf",
        mime: "application/pdf",
      }),
    );
  });
});
