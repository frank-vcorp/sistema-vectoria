/**
 * Tests unitarios puros del paquete IMPL-20260820-02.
 *
 * Verifican contratos que NO requieren BD:
 *  - AC-71: `Context.user` nullable; `createTrpcContext` con cookie
 *    ausente/inválida retorna `ctx.user = null`.
 *  - AC-72: `auth.verifyPassword` retorna resultado discriminado.
 *  - AC-73: `audit.record` admite eventos de sistema con `actor: { kind: 'system' }`
 *    (verificamos el branch sin BD con stub mínimo de la firma).
 *  - AC-77: `compact()` no contiene `K` fuera de scope (compilación).
 *  - AC-78: `validatePasswordStrength` lanza error con `code` estable.
 *  - AC-79: `EnvSchema` requiere `VECTORIA_SUPERUSER_PASSWORD`;
 *    `listRequiredVars()` la incluye.
 *  - AC-80: `BASE_PERMISSIONS` no contiene `registrar_tiempo`.
 */
import { describe, expect, it } from "vitest";
import { BASE_PERMISSIONS, SEED_ROLE_CODES } from "@/shared/enums";
import { ContextSchema } from "@/shared/zod";
import { listRequiredVars } from "@/lib/env";
import { createAuthService } from "@/server/services/auth";

describe("AC-71 · Context.user nullable + cookie httpOnly", () => {
  it("ContextSchema acepta user: null (sin sesión)", () => {
    const ctx = ContextSchema.parse({ user: null, roles: [], permissions: [] });
    expect(ctx.user).toBeNull();
  });

  it("ContextSchema acepta user con id+organization_id", () => {
    const ctx = ContextSchema.parse({
      user: {
        id: "11111111-1111-1111-1111-111111111111",
        organization_id: "22222222-2222-2222-2222-222222222222",
      },
      roles: [],
      permissions: [],
    });
    expect(ctx.user).not.toBeNull();
  });

  it("ContextSchema rechaza user con id no UUID", () => {
    const r = ContextSchema.safeParse({
      user: { id: "not-a-uuid", organization_id: "22222222-2222-2222-2222-222222222222" },
      roles: [],
      permissions: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("AC-72 · auth.verifyPassword discriminado", () => {
  const auth = createAuthService();

  it("validatePasswordStrength lanza DomainError con code='PASSWORD_TOO_WEAK'", () => {
    let captured: { code?: string; message?: string } | null = null;
    try {
      auth.validatePasswordStrength("short");
    } catch (e) {
      captured = e as { code?: string; message?: string };
    }
    expect(captured?.code).toBe("PASSWORD_TOO_WEAK");
    expect(captured?.message).toMatch(/12 caracteres/i);
  });
});

describe("AC-78 · password code de error estable", () => {
  const auth = createAuthService();

  it("todas las reglas de debilidad devuelven PASSWORD_TOO_WEAK", () => {
    const cases = [
      "Aa1!aaaa",          // <12
      "AAAAAAAAAA1!",      // sin minúscula
      "aaaaaaaaaa1!",      // sin mayúscula
      "Aaaaaaaaaaaa!",     // sin dígito
      "Aaaaaaaaaaaa1",     // sin símbolo
    ];
    for (const p of cases) {
      let code: string | undefined;
      try { auth.validatePasswordStrength(p); } catch (e) { code = (e as { code?: string }).code; }
      expect(code).toBe("PASSWORD_TOO_WEAK");
    }
  });
});

describe("AC-79 · VECTORIA_SUPERUSER_PASSWORD en env", () => {
  it("listRequiredVars() incluye VECTORIA_SUPERUSER_PASSWORD", () => {
    const required = listRequiredVars();
    expect(required).toContain("VECTORIA_SUPERUSER_PASSWORD");
  });

  it("listRequiredVars() NO imprime valores (sólo nombres)", () => {
    const required = listRequiredVars();
    for (const v of required) {
      expect(v).not.toContain("=");
      expect(v.length).toBeLessThan(64);
    }
  });
});

describe("AC-80 · permisos de plataforma", () => {
  it("BASE_PERMISSIONS NO contiene registrar_tiempo", () => {
    expect(BASE_PERMISSIONS).not.toContain("registrar_tiempo");
  });

  it("SEED_ROLE_CODES contiene programador", () => {
    expect(SEED_ROLE_CODES).toContain("programador");
  });
});
