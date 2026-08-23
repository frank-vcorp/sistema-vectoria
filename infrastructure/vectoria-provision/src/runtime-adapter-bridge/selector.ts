/**
 * Runtime adapter selector — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §6.3 (cierre §7.12 SOL-20260822-01).
 *
 * Switch por `manifest.application.adapter`:
 *  - ausente         → exit 3 (`adapter_required_for_new_projects`)
 *  - "runtime"       → `loadRuntimeAdapter`; si falla → exit 5
 *  - "legacy"        → `validateLegacyKeys` + `loadLegacyAdapter`; si falta
 *                      alguna required key → exit 10
 *  - cualquier otro  → exit 3
 *
 * El selector es fail-closed: NUNCA cae a legacy si se pidió runtime.
 */
import type { Manifest } from "../schema.js";
import { loadLegacyAdapter, validateLegacyKeysFromFile, type LegacyValidationResult } from "./legacy.js";
import { loadRuntimeAdapter, type RuntimeLoadResult } from "./runtime.js";

export type RuntimeAdapterLoadError =
  | { ok: false; exit: 3; reason: "adapter_required_for_new_projects"; message: string }
  | { ok: false; exit: 5; reason: "runtime_adapter_load_failed"; message: string }
  | { ok: false; exit: 4; reason: "runtime_adapter_invalid_with_legacy_mode"; message: string }
  | { ok: false; exit: 10; reason: "legacy_missing_required_key"; message: string; missingKey: string };

export type RuntimeAdapterLoadResult =
  | {
      ok: true;
      adapter: { kind: "runtime" | "legacy"; version: string; module?: Record<string, unknown> };
      audit: RuntimeAdapterAudit;
    }
  | RuntimeAdapterLoadError;

export interface RuntimeAdapterAudit {
  kind?: string;
  version?: string;
  fallback?: "runtime" | "legacy";
  reason?: string;
  legacyKeysValidated?: string[];
}

/** Punto de entrada principal del selector fail-closed. */
export async function selectRuntimeAdapter(
  manifest: Manifest,
  secretSourceFilePath: string | undefined,
): Promise<RuntimeAdapterLoadResult> {
  const adapter = (manifest.application as { adapter?: "runtime" | "legacy" }).adapter;

  // (1) Ausencia de adapter declarado en manifest v2 NUEVO.
  // Compat retroactiva: si el manifest fue cargado vía `v1ToV2Transform`,
  // el caller (index.ts) inyecta `application.adapter="legacy"` ANTES de
  // invocar el selector — por lo que aquí llegamos sólo cuando el caller
  // NO inyectó legacy (proyecto nuevo sin declaración).
  if (!adapter) {
    return {
      ok: false,
      exit: 3,
      reason: "adapter_required_for_new_projects",
      message:
        "application.adapter ausente o vacío. Proyectos nuevos requieren declaración explícita ('runtime' o 'legacy').",
    };
  }

  if (adapter === "runtime") {
    const res: RuntimeLoadResult = await loadRuntimeAdapter(manifest);
    if (!res.ok) {
      return {
        ok: false,
        exit: 5,
        reason: "runtime_adapter_load_failed",
        message: res.reason,
      };
    }
    return {
      ok: true,
      adapter: { kind: "runtime", version: res.adapter.version, module: res.adapter.module },
      audit: {
        kind: "runtime",
        version: res.adapter.version,
        fallback: "runtime",
      },
    };
  }

  if (adapter === "legacy") {
    // Mezcla los dos modos ⇒ exit 4.
    const rt = (manifest.application as { runtimeAdapter?: unknown }).runtimeAdapter;
    if (rt !== undefined) {
      return {
        ok: false,
        exit: 4,
        reason: "runtime_adapter_invalid_with_legacy_mode",
        message: "application.adapter='legacy' no admite runtimeAdapter.path declarado (mezcla de modos).",
      };
    }
    const validation: LegacyValidationResult = validateLegacyKeysFromFile(manifest, secretSourceFilePath);
    if (validation.missing.length > 0) {
      const first = validation.missing[0];
      return {
        ok: false,
        exit: 10,
        reason: "legacy_missing_required_key",
        message: `legacy_missing_required_key:${first} (faltan ${validation.missing.length} key(s): ${validation.missing.join(",")})`,
        missingKey: first ?? "<unknown>",
      };
    }
    const loaded = loadLegacyAdapter(manifest);
    return {
      ok: true,
      adapter: { kind: "legacy", version: loaded.version },
      audit: {
        kind: "legacy",
        version: loaded.version,
        fallback: "legacy",
        reason: "manifest.application.adapter='legacy'",
        legacyKeysValidated: validation.present,
      },
    };
  }

  return {
    ok: false,
    exit: 3,
    reason: "adapter_required_for_new_projects",
    message: `application.adapter debe ser 'runtime' o 'legacy', got '${String(adapter)}'`,
  };
}
