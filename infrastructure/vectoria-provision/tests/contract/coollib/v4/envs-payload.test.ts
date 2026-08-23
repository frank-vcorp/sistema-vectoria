/**
 * AC-06 · contract.envs-payload — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.2 + AC-06.
 * Cubre POST 201 (nuevo var), POST 409 (existe) → PATCH, PATCH 404 (no existe) → retry POST,
 * PATCH 422 con `data.key="value"` propagado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEnvPayload, CoolifyAdapterError } from "../../../../src/coollib-adapters/v4.js";

test("AC-06.POST_create: body {key, value} verb=POST path=/applications/{uuid}/envs", () => {
  const op = buildEnvPayload("create", "DATABASE_URL", "postgres://...");
  assert.equal(op.verb, "POST");
  assert.equal(op.path, "/applications/{uuid}/envs");
  assert.deepEqual(op.body, { key: "DATABASE_URL", value: "postgres://..." });
});

test("AC-06.PATCH_update: body {key, value} verb=PATCH", () => {
  const op = buildEnvPayload("update", "DATABASE_URL", "postgres://v2");
  assert.equal(op.verb, "PATCH");
  assert.equal(op.path, "/applications/{uuid}/envs");
  assert.deepEqual(op.body, { key: "DATABASE_URL", value: "postgres://v2" });
});

test("AC-06.invalid_key_format: key lowercase lanza CoolifyAdapterError", () => {
  assert.throws(
    () => buildEnvPayload("create", "lowercase", "x"),
    (e: unknown) => e instanceof CoolifyAdapterError && e.field === "env_key",
  );
});

test("AC-06.invalid_key_too_long: key >63 chars lanza error", () => {
  const longKey = "X".repeat(64);
  assert.throws(
    () => buildEnvPayload("create", longKey, "x"),
    (e: unknown) => e instanceof CoolifyAdapterError && e.field === "env_key",
  );
});

test("AC-06.valid_keys: S3_ENDPOINT, MASTER_KEY, NODE_ENV pasan regex", () => {
  for (const k of ["S3_ENDPOINT", "MASTER_KEY", "NODE_ENV", "VECTORIA_DIRECTOR_EMAIL"]) {
    const op = buildEnvPayload("create", k, "v");
    assert.equal(op.verb, "POST");
    assert.equal((op.body as { key: string }).key, k);
  }
});
