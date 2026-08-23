/**
 * AC-09 · preflight.read-only-enforcement — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.1 + AC-09 (cierre §7.3 SOL-20260822-01).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createReadOnlyEnforcement,
  ReadOnlyViolation,
} from "../../src/core/preflight/read-only-enforcement.js";

test("AC-09.case_a: POST durante preflight → ReadOnlyViolation exit 70", async () => {
  const e = createReadOnlyEnforcement();
  await assert.rejects(
    () => e.fetch("https://example.com/api/v1/applications", { method: "POST" }),
    (err: unknown) =>
      err instanceof ReadOnlyViolation &&
      err.exitCode === 70 &&
      err.reason === "preflight_attempted_mutation",
  );
});

test("AC-09.case_b: PATCH durante preflight → ReadOnlyViolation exit 70", async () => {
  const e = createReadOnlyEnforcement();
  await assert.rejects(
    () => e.fetch("https://example.com/api/v1/secrets", { method: "PATCH" }),
    (err: unknown) => err instanceof ReadOnlyViolation,
  );
});

test("AC-09.case_c: DELETE durante preflight → ReadOnlyViolation exit 70", async () => {
  const e = createReadOnlyEnforcement();
  await assert.rejects(
    () => e.fetch("https://example.com/api/v1/services/abc", { method: "DELETE" }),
    (err: unknown) => err instanceof ReadOnlyViolation,
  );
});

test("AC-09.allowMutant: con allowMutant=true el POST NO aborta", async () => {
  // Necesitamos un fetch stub porque no estamos probando contra server real.
  const orig = globalThis.fetch;
  (globalThis as unknown as { fetch: unknown }).fetch = async () =>
    new Response("", { status: 200 });
  try {
    const e = createReadOnlyEnforcement();
    const res = await e.fetch("https://example.com/x", { method: "POST" }, { allowMutant: true });
    assert.equal(res.status, 200);
  } finally {
    (globalThis as unknown as { fetch: unknown }).fetch = orig;
  }
});

test("AC-09.GET: GET permitido (countMutations=0)", async () => {
  const orig = globalThis.fetch;
  (globalThis as unknown as { fetch: unknown }).fetch = async () =>
    new Response("", { status: 200 });
  try {
    const e = createReadOnlyEnforcement();
    await e.fetch("https://example.com/api/v1/projects");
    await e.fetch("https://example.com/api/v1/servers/abc");
    assert.equal(e.countMutations(), 0);
    assert.match(e.summary(), /0 mutations during preflight/);
  } finally {
    (globalThis as unknown as { fetch: unknown }).fetch = orig;
  }
});
