/**
 * contract.schema-probe — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.2 + AC-01.
 * Verifica que el adapter detecta `coolify_get_server().version` y
 * se auto-selecciona correctamente.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { probeSchema } from "../../../../src/coollib-adapters/v4.js";
import { selectCoolifyAdapter, UnsupportedCoolifyVersionError } from "../../../../src/coollib-adapters/index.js";

test("AC-01.probe_v4_beta_19: probeSchema retorna version=v4.0.0-beta.19", () => {
  const report = probeSchema({
    version: "v4.0.0-beta.19",
    is_reachable: true,
    proxy: { status: "running" },
    is_mcp_server_enabled: true,
  });
  assert.equal(report.version, "v4.0.0-beta.19");
  assert.equal(report.reachable, true);
  assert.equal(report.proxy.status, "running");
  assert.equal(report.capabilities.mcpServerEnabled, true);
});

test("AC-01.select_v4: selector elige v4Adapter para v4.0.0", () => {
  const adapter = selectCoolifyAdapter("v4.0.0");
  assert.equal(adapter.version, "v4");
});

test("AC-01.select_v4_forward_compat: 'v4.1.0' → v4 (forward-compat)", () => {
  const adapter = selectCoolifyAdapter("v4.1.0");
  assert.equal(adapter.version, "v4");
});

test("AC-03.unsupported_v3: 'v3.0.0' lanza UnsupportedCoolifyVersionError", () => {
  assert.throws(
    () => selectCoolifyAdapter("v3.0.0"),
    (e: unknown) => e instanceof UnsupportedCoolifyVersionError && e.version === "v3.0.0",
  );
});

test("AC-03.unsupported_v5: 'v5.0.0' lanza error (futuro, no soportado)", () => {
  assert.throws(
    () => selectCoolifyAdapter("v5.0.0"),
    (e: unknown) => e instanceof UnsupportedCoolifyVersionError,
  );
});

test("AC-01.probe_unknown_version: probeSchema retorna 'unknown' sin info", () => {
  const report = probeSchema({});
  assert.equal(report.version, "unknown");
  assert.equal(report.reachable, false);
});
