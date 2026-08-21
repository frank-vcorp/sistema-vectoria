import { describe, expect, it } from "vitest";
import { NOTIFICATION_EVENT_TYPES, SEED_ROLE_CODES } from "@/shared/enums";
import { buildAad, ContextSchema, passwordSchema } from "@/shared/zod";
import { addDays, addMinutes, formatCurrency, formatInOrgTz } from "@/shared/utils";

describe("helpers y contratos puros", () => {
  it("construye AAD determinista", () => { expect(buildAad("org", "organization_fiscal_config", "pac_api_key")).toBe("org|public.organization_fiscal_config|pac_api_key"); });
  it("valida Context abstracto sin transporte", () => { expect(ContextSchema.parse({ user: { id: "00000000-0000-0000-0000-000000000001", organization_id: "00000000-0000-0000-0000-000000000002" }, roles: [], permissions: [], requestId: "req-1" }).requestId).toBe("req-1"); });
  it("mantiene enums canónicos", () => { expect(SEED_ROLE_CODES).toHaveLength(7); expect(NOTIFICATION_EVENT_TYPES).toContain("cotizacion_proxima_vencer"); });
  it("formatea MXN y timezone de organización", () => { expect(formatCurrency(1234.5)).toContain("$"); expect(formatInOrgTz(new Date("2026-01-01T12:00:00Z"))).toContain("2026-01-01"); });
  it("calcula expiraciones", () => { const now = new Date("2026-01-01T00:00:00Z"); expect(addMinutes(now, 15).getTime()).toBeGreaterThan(now.getTime()); expect(addDays(now, 7).getTime()).toBeGreaterThan(now.getTime()); });
  it("password Zod acepta una contraseña robusta", () => { expect(passwordSchema.safeParse("Abcdefgh1!Aa").success).toBe(true); });
});
