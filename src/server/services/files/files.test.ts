import { describe, expect, it } from "vitest";
import {
  assertTtlOk,
  normalizeS3Endpoint,
  __MAX_TTL_SECONDS__,
} from "@/server/services/files";
import { DomainError } from "@/shared/errors";

describe("files · TTL guard (AC-13)", () => {
  it("rejects > 15 min", () => {
    expect(() => assertTtlOk(901)).toThrow(DomainError);
    try {
      assertTtlOk(901);
    } catch (e) {
      expect((e as DomainError).code).toBe("TTL_TOO_LONG");
    }
  });

  it("accepts ≤ 15 min", () => {
    expect(() => assertTtlOk(900)).not.toThrow();
    expect(() => assertTtlOk(__MAX_TTL_SECONDS__)).not.toThrow();
  });
});

/**
 * IMPLEMENTATION_DEFECT IMPL-20260825-26 · intento 2.
 *
 * `normalizeS3Endpoint` debe aceptar tanto URL completa
 * (`http://garage:3900`) como host desnudo (`localhost`) y derivar
 * `useSSL` del PROTOCOLO de la URL, NO de `S3_FORCE_PATH_STYLE`.
 * Antes del fix el handler `POST /api/files/upload` devolvía 503
 * `FILES_STORAGE_UNAVAILABLE` en staging porque pasaba la URL
 * cruda como `endPoint` a `minio.Client`.
 */
describe("files · normalizeS3Endpoint (IMPL-20260825-26 defect)", () => {
  it("URL completa con http y puerto: http://garage:3900", () => {
    const r = normalizeS3Endpoint("http://garage:3900");
    expect(r.endPoint).toBe("garage");
    expect(r.port).toBe(3900);
    expect(r.useSSL).toBe(false);
  });

  it("URL completa con https y sin puerto: https://storage.example", () => {
    const r = normalizeS3Endpoint("https://storage.example");
    expect(r.endPoint).toBe("storage.example");
    expect(r.port).toBeUndefined();
    expect(r.useSSL).toBe(true);
  });

  it("URL completa con https y puerto: https://s3.amazonaws.com:443", () => {
    // `URL.port` es vacío cuando el puerto coincide con el default
    // del protocolo (443 para https). El helper respeta ese
    // comportamiento (no fuerza puerto).
    const r = normalizeS3Endpoint("https://s3.amazonaws.com:443");
    expect(r.endPoint).toBe("s3.amazonaws.com");
    expect(r.port).toBeUndefined();
    expect(r.useSSL).toBe(true);
  });

  it("URL completa con http y puerto IPv4: http://10.0.0.5:9000", () => {
    const r = normalizeS3Endpoint("http://10.0.0.5:9000");
    expect(r.endPoint).toBe("10.0.0.5");
    expect(r.port).toBe(9000);
    expect(r.useSSL).toBe(false);
  });

  it("host desnudo sin esquema ni puerto: garage", () => {
    const r = normalizeS3Endpoint("garage");
    expect(r.endPoint).toBe("garage");
    expect(r.port).toBeUndefined();
    // Host desnudo se trata como http (caller controla TLS).
    expect(r.useSSL).toBe(false);
  });

  it("host desnudo con puerto: garage:3900", () => {
    const r = normalizeS3Endpoint("garage:3900");
    expect(r.endPoint).toBe("garage");
    expect(r.port).toBe(3900);
    expect(r.useSSL).toBe(false);
  });

  it("host desnudo con IPv6 entre corchetes: http://[::1]:9000", () => {
    const r = normalizeS3Endpoint("http://[::1]:9000");
    // `URL.hostname` conserva los corchetes en IPv6. El helper
    // respeta el formato nativo de Node `URL` (MinIO acepta
    // cualquiera de las dos formas según versión).
    expect(r.endPoint).toBe("[::1]");
    expect(r.port).toBe(9000);
    expect(r.useSSL).toBe(false);
  });

  it("useSSL se deriva del protocolo — no de S3_FORCE_PATH_STYLE", () => {
    // El helper NO conoce S3_FORCE_PATH_STYLE: el path-style es
    // ortogonal a TLS. Aquí verificamos que con `https://` el
    // resultado es `useSSL=true` aunque el caller (buildFilesService
    // FromEnv) mantenga `forcePathStyle` por separado.
    const r1 = normalizeS3Endpoint("https://s3.example");
    expect(r1.useSSL).toBe(true);
    const r2 = normalizeS3Endpoint("http://s3.example");
    expect(r2.useSSL).toBe(false);
  });

  it("lanza si la entrada es vacía o sin hostname", () => {
    expect(() => normalizeS3Endpoint("")).toThrow();
    // `URL` rechaza `http://` sin hostname: cae en `S3_ENDPOINT
    // inválido` o `sin hostname`.
    expect(() => normalizeS3Endpoint("http://")).toThrow();
  });

  it("lanza si la URL es inválida", () => {
    expect(() => normalizeS3Endpoint("not a url with spaces://x")).toThrow();
  });

  it("ignora path/query si están presentes (defensivo): http://host:9000/foo", () => {
    // `URL.hostname` ya los descarta; el helper conserva sólo
    // `host[:port]` para mantener la invariante de MinIO.
    const r = normalizeS3Endpoint("http://host:9000/foo");
    expect(r.endPoint).toBe("host");
    expect(r.port).toBe(9000);
    expect(r.useSSL).toBe(false);
  });
});
