/**
 * Preflight P12: runtime adapter (manifesto) — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.1 P12 + AC-11a/b.
 *
 * Read-only: delega al selector `selectRuntimeAdapter` con un
 * `secretSourceFilePath` opcional. Si retorna `ok: false`, el
 * orquestador del preflight aborta con el `exit` del error.
 *
 * La carga real del módulo (runtime mode) sí ocurre aquí — pero la
 * carga es read-only (import dinámico sin side-effects asumidos).
 */
import type { Manifest } from "../../schema.js";
import {
  selectRuntimeAdapter,
  type RuntimeAdapterLoadResult,
} from "../../runtime-adapter-bridge/selector.js";

export type PreflightRuntimeAdapterResult = RuntimeAdapterLoadResult;

export async function checkRuntimeAdapter(
  manifest: Manifest,
  secretSourceFilePath: string | undefined,
): Promise<PreflightRuntimeAdapterResult> {
  return selectRuntimeAdapter(manifest, secretSourceFilePath);
}
