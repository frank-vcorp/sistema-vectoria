import { describe, expect, it } from "vitest";
import { buildKeyRingFromEnv, createCryptoService } from "@/server/services/crypto";

const masterKeyB64 = Buffer.alloc(32, 0x42).toString("base64");

describe("crypto service (AC-11)", () => {
  const ring = buildKeyRingFromEnv({
    MASTER_KEY: masterKeyB64,
    MASTER_KEY_VERSION: 1,
  });
  const crypto = createCryptoService(ring);

  it("(a) encrypt produces distinct ciphertexts (random nonce) but both decrypt", () => {
    const aad = "org-uuid|public.organization_fiscal_config|pac_api_key";
    const c1 = crypto.encrypt("super-secret", { aad });
    const c2 = crypto.encrypt("super-secret", { aad });
    expect(c1.bytes.equals(c2.bytes)).toBe(false);
    expect(crypto.decrypt(c1.bytes, { aad }).plaintext.toString("utf8")).toBe("super-secret");
    expect(crypto.decrypt(c2.bytes, { aad }).plaintext.toString("utf8")).toBe("super-secret");
  });

  it("(b) decrypt with wrong AAD throws IntegrityError-like failure", () => {
    const aad1 = "org-uuid|public.organization_fiscal_config|pac_api_key";
    const aad2 = "org-uuid|public.organization_fiscal_config|csd_password";
    const c = crypto.encrypt("another-secret", { aad: aad1 });
    expect(() => crypto.decrypt(c.bytes, { aad: aad2 })).toThrow();
  });

  it("(c) payload format includes key_version (1B) + nonce (12B) + ct + tag (16B)", () => {
    const c = crypto.encrypt("x", { aad: "a|b|c" });
    expect(c.keyVersion).toBe(1);
    expect(c.bytes.length).toBeGreaterThanOrEqual(1 + 12 + 1 + 16);
  });

  it("rejects empty AAD", () => {
    expect(() => crypto.encrypt("x", { aad: "" })).toThrow(/AAD inválido/);
  });
});
