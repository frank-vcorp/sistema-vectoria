import { describe, expect, it } from "vitest";
import { createAuthService } from "@/server/services/auth";

/**
 * AC-78 / SPEC §11 AC-20: los tests inspeccionan `error.code`
 * (código de dominio estable, no mensaje localizado). El mensaje humano
 * (es-MX) puede cambiar; el `code` es contrato programático.
 */
function captureCode(fn: () => void): string {
  try {
    fn();
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (typeof code === "string" && code.length > 0) return code;
    throw new Error(`Expected DomainError with code, got ${String(e)}`);
  }
  throw new Error("Expected throw");
}

describe("auth · password policy (AC-20, AC-78)", () => {
  const auth = createAuthService();

  it("rejects <12 chars → code PASSWORD_TOO_WEAK", () => {
    expect(captureCode(() => auth.validatePasswordStrength("Aa1!aaaa"))).toBe("PASSWORD_TOO_WEAK");
  });

  it("rejects without lowercase → code PASSWORD_TOO_WEAK", () => {
    expect(captureCode(() => auth.validatePasswordStrength("AAAAAAAAAA1!"))).toBe("PASSWORD_TOO_WEAK");
  });

  it("rejects without uppercase → code PASSWORD_TOO_WEAK", () => {
    expect(captureCode(() => auth.validatePasswordStrength("aaaaaaaaaa1!"))).toBe("PASSWORD_TOO_WEAK");
  });

  it("rejects without digit → code PASSWORD_TOO_WEAK", () => {
    expect(captureCode(() => auth.validatePasswordStrength("Aaaaaaaaaaaa!"))).toBe("PASSWORD_TOO_WEAK");
  });

  it("rejects without symbol → code PASSWORD_TOO_WEAK", () => {
    expect(captureCode(() => auth.validatePasswordStrength("Aaaaaaaaaaaa1"))).toBe("PASSWORD_TOO_WEAK");
  });

  it("accepts 12 char mix of classes", () => {
    expect(() => auth.validatePasswordStrength("Abcdefgh1!Aa")).not.toThrow();
  });
});
