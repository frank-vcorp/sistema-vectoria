/**
 * Selector de adapter Coolify por versión — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §5.2.
 *
 *  - Si `coolifyVersion` ∈ COOLIFY_V4_SUPPORTED_VERSIONS → v4.ts
 *  - Otro caso → lanza `coolify_version_unsupported` (exit code 4)
 *
 * El selector NO inspecciona el Coolify remoto: lo recibe del preflight
 * (P1). Mantiene cero operaciones HTTP.
 */
import { v4Adapter, COOLIFY_V4_SUPPORTED_VERSIONS, CoolifyAdapterError } from "./v4.js";
import type { CoolifyAdapter } from "./types.js";

export class UnsupportedCoolifyVersionError extends Error {
  public readonly exitCode = 4;
  public readonly reason = "coolify_version_unsupported";
  constructor(public readonly version: string) {
    super(`Coolify version ${version} no soportada por el runner v2.1; soporta ${COOLIFY_V4_SUPPORTED_VERSIONS.join(", ")}`);
  }
}

export function selectCoolifyAdapter(coolifyVersion: string): CoolifyAdapter {
  const v = coolifyVersion.trim();
  // v4 y todos sus betas comparten el mismo adapter.
  if ((COOLIFY_V4_SUPPORTED_VERSIONS as readonly string[]).includes(v)) {
    return v4Adapter;
  }
  // Si la versión empieza con "v4" (p.ej. v4.1.0) y no está en la lista
  // explícita, aceptar como v4 con WARN — semver forward-compat.
  if (/^v4(\.|$)/.test(v)) {
    return v4Adapter;
  }
  throw new UnsupportedCoolifyVersionError(v);
}

export { v4Adapter, COOLIFY_V4_SUPPORTED_VERSIONS, CoolifyAdapterError };
export type { CoolifyAdapter };
