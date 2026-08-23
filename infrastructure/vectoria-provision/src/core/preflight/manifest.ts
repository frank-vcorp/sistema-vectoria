/**
 * Preflight P13: manifest schema — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.1 P13 + AC-12.
 *
 * Read-only: verifica que el manifest parsea contra ManifestSchema.
 * Si falla → `manifest_invalid_or_missing` (exit 3).
 */
import { ManifestSchema, type Manifest } from "../../schema.js";
import type { ZodError } from "zod";

export interface PreflightManifestResult {
  ok: boolean;
  manifest?: Manifest;
  reason?: string;
}

export function checkManifest(raw: unknown): PreflightManifestResult {
  // `ManifestSchema` es union v1|v2 → siempre acepta (con transform).
  // Para detectar manifest "ausente o inválido", validamos que raw sea
  // un objeto y que tenga al menos `v` (1 o 2).
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "manifest_invalid:not_object" };
  }
  const obj = raw as { v?: unknown };
  if (obj.v !== 1 && obj.v !== 2) {
    return { ok: false, reason: "manifest_invalid:v_must_be_1_or_2" };
  }
  try {
    const parsed = ManifestSchema.parse(raw);
    return { ok: true, manifest: parsed as Manifest };
  } catch (e: unknown) {
    if (e && typeof e === "object" && "issues" in e) {
      const zErr = e as ZodError;
      return {
        ok: false,
        reason: `manifest_invalid:${zErr.issues.map((i) => i.message).join(";")}`,
      };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `manifest_invalid:${msg}` };
  }
}
