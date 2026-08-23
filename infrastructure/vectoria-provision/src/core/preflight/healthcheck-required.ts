/**
 * Preflight P8bis: healthcheck required — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.1 + AC-08.
 *
 * Read-only: si `manifest.application.healthcheck` ausente y
 * `globalProfile.defaults.healthcheck` ausente → `healthcheck_required`
 * (exit 12). Si el global-profile provee default → `global_default_applied`
 * (audit, no bloqueante).
 */
import type { Manifest } from "../../schema.js";
import type { HealthcheckBlock } from "../../global-profile.js";

export interface PreflightHealthcheckResult {
  ok: boolean;
  reason?: string;
  source: "manifest" | "global_profile_default" | "missing";
}

export function checkHealthcheckRequired(
  manifest: Manifest,
  globalHealthcheck: HealthcheckBlock | undefined,
): PreflightHealthcheckResult {
  const mhc = (manifest.application as { healthcheck?: HealthcheckBlock }).healthcheck;
  if (mhc && mhc.enabled) {
    return { ok: true, source: "manifest" };
  }
  if (globalHealthcheck && globalHealthcheck.enabled) {
    return { ok: true, source: "global_profile_default" };
  }
  return { ok: false, reason: "healthcheck_required", source: "missing" };
}
