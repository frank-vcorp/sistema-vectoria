import { describe, expect, it } from "vitest";
import { assertTtlOk, __MAX_TTL_SECONDS__ } from "@/server/services/files";
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
