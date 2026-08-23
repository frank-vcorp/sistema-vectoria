/**
 * Preflight P1: Coolify version — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.1 P1 + AC-01 + AC-03.
 *
 * Verifica que la versión del Coolify esté en la lista soportada por
 * el adapter (v4 actualmente).
 *
 * Read-only: sólo invoca el adapter ya seleccionado por el orquestador.
 * Si la versión no está soportada, retorna un blocker; el orquestador
 * aborta con `coolify_version_unsupported` (exit 4).
 */
import { selectCoolifyAdapter, UnsupportedCoolifyVersionError } from "../../coollib-adapters/index.js";

export interface PreflightCoolifyVersionInput {
  coolifyVersion: string;
}

export interface PreflightCoolifyVersionResult {
  ok: boolean;
  reason?: string;
  selectedAdapter?: string;
}

export function checkCoolifyVersion(input: PreflightCoolifyVersionInput): PreflightCoolifyVersionResult {
  try {
    const adapter = selectCoolifyAdapter(input.coolifyVersion);
    return { ok: true, selectedAdapter: adapter.version };
  } catch (e: unknown) {
    if (e instanceof UnsupportedCoolifyVersionError) {
      return { ok: false, reason: `coolify_version_unsupported:${e.version}` };
    }
    throw e;
  }
}
