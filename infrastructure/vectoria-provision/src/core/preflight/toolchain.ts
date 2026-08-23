/**
 * Preflight P9/P11: toolchain (node, pnpm, pnpm-workspace) — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.1 P9/P11 + AC-05.
 *
 * Read-only: el caller provee `pnpmWorkspaceRaw` (ya leído del
 * `pnpm-workspace.yaml` del repo de la app). Si está presente y
 * `packages` está ausente o vacío → `toolchain_pnpm_workspace_invalid`
 * (exit 9). Reproduce FIX-20260821-01.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface PreflightToolchainInput {
  nodeVersion: string | undefined;
  pnpmVersion: string | undefined;
  pnpmWorkspaceRaw: string | undefined;
  pnpmWorkspaceExists: boolean;
  skipped?: boolean;
}

export interface PreflightToolchainResult {
  ok: boolean;
  reason?: string;
}

export function checkToolchain(input: PreflightToolchainInput): PreflightToolchainResult {
  if (input.skipped) return { ok: true, reason: "toolchain_check_skipped" };
  if (!input.nodeVersion) return { ok: false, reason: "toolchain_mismatch:node_missing" };
  // pnpmVersion es opcional en v2.1: el runner es JS/TS y no requiere pnpm
  // en runtime. Sólo si hay pnpm-workspace.yaml presente se exige la
  // versión mínima.

  // P11: pnpm-workspace validation (FIX-01)
  if (input.pnpmWorkspaceExists) {
    const raw = input.pnpmWorkspaceRaw ?? "";
    // Si el archivo está vacío o `packages:` está ausente o `packages: []`
    // (vacío), es inválido — reproduce el bug que rompió Nixpacks build.
    if (!/^packages\s*:/m.test(raw)) {
      return {
        ok: false,
        reason: "toolchain_pnpm_workspace_invalid:packages_field_missing",
      };
    }
    const packagesMatch = raw.match(/^packages\s*:\s*\[([^\]]*)\]/m);
    if (packagesMatch && packagesMatch[1] !== undefined && packagesMatch[1].trim().length === 0) {
      return {
        ok: false,
        reason: "toolchain_pnpm_workspace_invalid:packages_field_empty",
      };
    }
    // Si hay workspace presente, pnpm debe estar disponible.
    if (!input.pnpmVersion) {
      return { ok: false, reason: "toolchain_mismatch:pnpm_required_for_workspace" };
    }
  }

  return { ok: true };
}

/**
 * Helper de lectura del pnpm-workspace.yaml para tests + producción.
 * Si el archivo no existe → `exists: false` (pass-through).
 */
export function readPnpmWorkspace(cwd: string): { exists: boolean; raw?: string } {
  const p = join(cwd, "pnpm-workspace.yaml");
  if (!existsSync(p)) return { exists: false };
  try {
    return { exists: true, raw: readFileSync(p, "utf8") };
  } catch {
    return { exists: false };
  }
}
