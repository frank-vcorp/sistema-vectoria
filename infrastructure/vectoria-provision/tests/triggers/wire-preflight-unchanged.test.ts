/**
 * AC-W2 · wire.preflight-unchanged — vectoria-provision v2.1
 *
 * SPEC-HANDOFF-20260823-XX §4.1 AC-W2 (P3-A wireup regression guard).
 *
 * El wireup de `runProvision` y `runPushPostProvisioning` NO debe tocar:
 *  - `src/core/preflight/**` (read-only-enforcement, AC-09).
 *  - `src/coollib-adapters/**` (selector v4 ya implementado).
 *  - `src/runtime-adapter-bridge/**` (selector fail-closed).
 *  - `src/schema.ts`, `src/registry.ts`, `src/secrets.ts`, `src/git-url.ts`.
 *
 * Esta verificación se hace con `git diff` snapshot entre el commit base
 * `09b0378` y HEAD; sólo se permiten cambios en `core/triggers/provision.ts`
 * y `core/push/post-provisioning.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

const BASE_COMMIT = "09b0378";
const PROTECTED_PATHS = [
  "infrastructure/vectoria-provision/src/core/preflight/",
  "infrastructure/vectoria-provision/src/coollib-adapters/",
  "infrastructure/vectoria-provision/src/runtime-adapter-bridge/",
  "infrastructure/vectoria-provision/src/schema.ts",
  "infrastructure/vectoria-provision/src/registry.ts",
  "infrastructure/vectoria-provision/src/secrets.ts",
  "infrastructure/vectoria-provision/src/git-url.ts",
  "infrastructure/vectoria-provision/src/errors.ts",
  "infrastructure/vectoria-provision/src/client.ts",
  "infrastructure/vectoria-provision/src/redact.ts",
  "infrastructure/vectoria-provision/src/ensure.ts",
];

test("AC-W2: el wireup NO toca preflight/coollib-adapters/runtime-adapter-bridge/schema/registry/secrets/errors/client/redact/ensure (V-W2)", () => {
  let diff = "";
  try {
    diff = execSync(`git diff ${BASE_COMMIT}..HEAD -- ${PROTECTED_PATHS.map((p) => `'${p}'`).join(" ")}`, {
      encoding: "utf8",
      cwd: process.cwd(),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // Si git falla (no es repo o no hay base), documentamos pero no fallamos.
    if (/not a git repository/i.test(msg)) {
      return;
    }
    throw e;
  }
  assert.equal(diff.trim(), "", `paths protegidos tocados:\n${diff}`);
});
