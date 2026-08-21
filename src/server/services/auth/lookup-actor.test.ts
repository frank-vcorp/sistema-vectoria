/**
 * AC-LA-2 / SPEC-20260820-001: contrato de `auth.lookupActor`.
 *
 * Este test verifica a nivel de tipo/firma que el servicio `auth` expone
 * `lookupActor(email): Promise<ActorRef | null>` y que NO devuelve
 * credenciales (password_hash, credentials). La cobertura de runtime
 * (SELECT real contra `users` por email) requiere BD y sigue siendo
 * gated-Frank — fuera del alcance de esta mini-SPEC.
 *
 * Si este archivo no compila o el `expect.toMatchTypeOf` falla, AC-LA-2
 * queda invalidado (refactor roto). Se ejecuta sin BD.
 */
import { describe, expect, it } from "vitest";
import { createAuthService } from "@/server/services/auth";

describe("auth · lookupActor (AC-LA-2 / SPEC-20260820-001)", () => {
  const auth = createAuthService();

  it("expone lookupActor como método del AuthService", () => {
    expect(typeof auth.lookupActor).toBe("function");
  });

  it("lookupActor retorna Promise<{ id: string; organizationId: string } | null> (sin credenciales)", () => {
    // Verificación estática de firma + del retorno exacto.
    type Expected = (
      email: string,
    ) => Promise<{ id: string; organizationId: string } | null>;
    const _f: Expected = auth.lookupActor;
    expect(typeof _f).toBe("function");

    // El retorno del shape no contiene `passwordHash`, `credentials`,
    // ni campos sensibles (AC-LA-4).
    type Returned = Awaited<ReturnType<typeof auth.lookupActor>>;
    type AllowedKeys = "id" | "organizationId";
    type _AssertKeys = Exclude<keyof NonNullable<Returned>, AllowedKeys> extends never
      ? true
      : never;
    const _ok: _AssertKeys = true;
    expect(_ok).toBe(true);
  });

  it("lookupActor NO forma parte de verifyPassword/registerFailedLogin/resetFailedLogin (aditivo, AC-LA-2)", () => {
    // Listado puramente defensivo: si se renombra, este test falla y se
    // actualiza el contrato documentado en SPEC. No toca comportamiento.
    expect(typeof auth.verifyPassword).toBe("function");
    expect(typeof auth.registerFailedLogin).toBe("function");
    expect(typeof auth.resetFailedLogin).toBe("function");
    expect(typeof auth.validatePasswordStrength).toBe("function");
    expect(typeof auth.lookupActor).toBe("function");
  });
});
