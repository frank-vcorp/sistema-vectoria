/**
 * AC-05 · preflight.toolchain.pnpmWorkspace — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.1 P9/P11 + AC-05.
 * Reproduce FIX-20260821-01 byte-a-byte.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkToolchain } from "../../src/core/preflight/toolchain.js";

test("AC-05.pnpm_workspace_empty_packages: packages:[] con nada → toolchain_pnpm_workspace_invalid", () => {
  const r = checkToolchain({
    nodeVersion: "v20.10.0",
    pnpmVersion: "9.0.0",
    pnpmWorkspaceRaw: "packages:[]\n",
    pnpmWorkspaceExists: true,
  });
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /toolchain_pnpm_workspace_invalid/);
});

test("AC-05.pnpm_workspace_missing_packages: packages: ausente → toolchain_pnpm_workspace_invalid", () => {
  const r = checkToolchain({
    nodeVersion: "v20.10.0",
    pnpmVersion: "9.0.0",
    pnpmWorkspaceRaw: "onlyBuiltDependencies:\n  - esbuild\n",
    pnpmWorkspaceExists: true,
  });
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /packages_field_missing/);
});

test("AC-05.pnpm_workspace_valid: packages con contenido → PASS", () => {
  const r = checkToolchain({
    nodeVersion: "v20.10.0",
    pnpmVersion: "9.0.0",
    pnpmWorkspaceRaw: "packages:\n  - 'apps/*'\n  - 'packages/*'\n",
    pnpmWorkspaceExists: true,
  });
  assert.equal(r.ok, true);
});

test("AC-05.pnpm_workspace_absent: archivo no existe → PASS (compat retroactiva Nixpacks 1.41+)", () => {
  const r = checkToolchain({
    nodeVersion: "v20.10.0",
    pnpmVersion: "9.0.0",
    pnpmWorkspaceRaw: undefined,
    pnpmWorkspaceExists: false,
  });
  assert.equal(r.ok, true);
});

test("AC-05.node_missing: nodeVersion undefined → toolchain_mismatch:node_missing", () => {
  const r = checkToolchain({
    nodeVersion: undefined,
    pnpmVersion: "9.0.0",
    pnpmWorkspaceRaw: undefined,
    pnpmWorkspaceExists: false,
  });
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /node_missing/);
});

test("AC-05.stress: 1000 paquetes en workspace válido → PASS (perfume)", () => {
  const pkgs = Array.from({ length: 1000 }, (_, i) => `  - 'pkg-${i}'`).join("\n");
  const r = checkToolchain({
    nodeVersion: "v20.10.0",
    pnpmVersion: "9.0.0",
    pnpmWorkspaceRaw: `packages:\n${pkgs}\n`,
    pnpmWorkspaceExists: true,
  });
  assert.equal(r.ok, true);
});
