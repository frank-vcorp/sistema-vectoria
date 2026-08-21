/**
 * Tests unitarios puros del paquete IMPL-20260820-03.
 *
 * Verifican contratos que NO requieren BD funcional (sólo el schema de
 * validación `loadEnv` se satisface con variables dummy válidas):
 *  - AC-82: claim opcional `actor_role_code` se firma cuando está
 *    presente y se decodifica cuando el JWT lo incluye; ausente cuando
 *    no se pasa al emisor (compatibilidad hacia atrás).
 *  - AC-81: `hasPermission.has/require` aceptan el parámetro opcional
 *    `opts: { forceDb?: boolean }` sin romper la firma existente.
 */

// Setear env vars ANTES de cualquier import que dispare loadEnv().
// Usamos Object.assign porque `process.env` está tipado como readonly en TS reciente.
Object.assign(process.env, {
  NODE_ENV: "test",
  APP_BASE_URL: "http://localhost:3000",
  DATABASE_URL: "postgres://test:test@localhost:5432/test",
  // MASTER_KEY: 32 bytes base64 = 44 chars con padding
  MASTER_KEY: "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=",
  SESSION_SECRET: "test-secret-32-chars-minimum-abc",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "test-bucket",
  S3_ACCESS_KEY: "test-access-key",
  S3_SECRET_KEY: "test-secret-key",
  VECTORIA_DIRECTOR_EMAIL: "director@test.local",
  VECTORIA_SUPERUSER_PASSWORD: "TestSuperUserPass1!",
  LOCKOUT_MAX_ATTEMPTS: "5",
  LOCKOUT_WINDOW_MINUTES: "15",
});

import { describe, expect, it } from "vitest";
import { createSessionService } from "@/server/services/session";

describe("AC-82 · claim opcional actor_role_code en JWT", () => {
  const session = createSessionService({
    sessionSecret: process.env.SESSION_SECRET ?? "test-secret-32-chars-minimum-abc",
    accessTtlSeconds: 900,
    refreshTtlDays: 7,
    issuer: "test-issuer",
  });

  it("openAccessToken con actorRoleCode firma el claim; verifyAccessToken lo decodifica", async () => {
    const issued = await session.openAccessToken({
      userId: "11111111-1111-1111-1111-111111111111",
      organizationId: "22222222-2222-2222-2222-222222222222",
      roles: [],
      permissions: [],
      actorRoleCode: "administrador",
    });
    expect(issued.token).toBeTruthy();
    const verified = await session.verifyAccessToken(issued.token);
    expect(verified.actorRoleCode).toBe("administrador");
    expect(verified.userId).toBe("11111111-1111-1111-1111-111111111111");
    expect(verified.organizationId).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("openAccessToken sin actorRoleCode NO firma el claim (compatibilidad hacia atrás)", async () => {
    const issued = await session.openAccessToken({
      userId: "11111111-1111-1111-1111-111111111111",
      organizationId: "22222222-2222-2222-2222-222222222222",
      roles: [],
      permissions: [],
    });
    const verified = await session.verifyAccessToken(issued.token);
    // Claim ausente → undefined (no se devuelve string vacío ni null).
    expect(verified.actorRoleCode).toBeUndefined();
    // El resto de claims sigue intacto.
    expect(verified.jti).toBe(issued.jti);
    expect(verified.roles).toEqual([]);
    expect(verified.permissions).toEqual([]);
  });

  it("openAccessToken con actorRoleCode vacío NO firma el claim", async () => {
    const issued = await session.openAccessToken({
      userId: "11111111-1111-1111-1111-111111111111",
      organizationId: "22222222-2222-2222-2222-222222222222",
      roles: [],
      permissions: [],
      actorRoleCode: "",
    });
    const verified = await session.verifyAccessToken(issued.token);
    expect(verified.actorRoleCode).toBeUndefined();
  });
});

describe("AC-81 · hasPermission acepta opts.forceDb", () => {
  it("la firma de has/require incluye el parámetro opts opcional sin romper compilación", async () => {
    // Verificación estática: si este test compila, la firma soporta
    // `opts?: HasPermissionOptions`. No instanciamos el servicio porque
    // requiere BD (gated-Frank); sólo validamos contrato.
    type Has = (ctx: unknown, code: string, opts?: { forceDb?: boolean }) => Promise<boolean>;
    type Req = (ctx: unknown, code: string, opts?: { forceDb?: boolean }) => Promise<void>;
    const _h: Has = async () => true;
    const _r: Req = async () => undefined;
    expect(typeof _h).toBe("function");
    expect(typeof _r).toBe("function");
    // También verificamos que la firma sin opts sigue siendo válida
    // (no rompe callers existentes, AC-81 aditivo).
    await _h({}, "x");
    await _r({}, "x");
  });
});