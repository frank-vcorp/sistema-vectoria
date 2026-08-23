/**
 * AC-08 · contract.healthcheck-block — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.2 + AC-08 (refuerzo).
 * Cubre: enabled/disabled, path regex estricto, port range, retries boundary.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHealthcheckBlock } from "../../../../src/coollib-adapters/v4.js";
import type { HealthcheckBlock } from "../../../../src/global-profile.js";

const baseBlock: HealthcheckBlock = {
  enabled: true,
  path: "/api/health",
  method: "GET",
  scheme: "http",
  port: "3000",
  interval: 30,
  timeout: 5,
  retries: 3,
};

test("AC-08.enabled_true: emite bloque completo health_check_*", () => {
  const block = buildHealthcheckBlock(baseBlock);
  assert.deepEqual(block, {
    health_check_enabled: true,
    health_check_path: "/api/health",
    health_check_method: "GET",
    health_check_scheme: "http",
    health_check_port: "3000",
    health_check_interval: 30,
    health_check_timeout: 5,
    health_check_retries: 3,
  });
});

test("AC-08.enabled_false: retorna {} (Coolify usará defaults internos)", () => {
  const block = buildHealthcheckBlock({ ...baseBlock, enabled: false });
  assert.deepEqual(block, {});
});

test("AC-08.retries_boundary: retries=1 (mínimo) y retries=10 (máximo)", () => {
  assert.deepEqual(buildHealthcheckBlock({ ...baseBlock, retries: 1 }).health_check_retries, 1);
  assert.deepEqual(buildHealthcheckBlock({ ...baseBlock, retries: 10 }).health_check_retries, 10);
});

test("AC-08.port_range: range '3000-3005' pasa tal cual", () => {
  const block = buildHealthcheckBlock({ ...baseBlock, port: "3000-3005" });
  assert.equal(block.health_check_port, "3000-3005");
});

test("AC-08.method_HEAD: método HEAD se propaga", () => {
  const block = buildHealthcheckBlock({ ...baseBlock, method: "HEAD" });
  assert.equal(block.health_check_method, "HEAD");
});

test("AC-08.scheme_https: scheme https se propaga", () => {
  const block = buildHealthcheckBlock({ ...baseBlock, scheme: "https" });
  assert.equal(block.health_check_scheme, "https");
});
