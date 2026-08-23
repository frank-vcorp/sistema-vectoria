/**
 * AC-07 · preflight.db-storage-health — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.1 P4/P5 + AC-07.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDbStorageHealth } from "../../src/core/preflight/db-storage-health.js";

test("AC-07.db_unhealthy: status='exited:unhealthy' → exit 7", () => {
  const r = checkDbStorageHealth({ dbStatus: "exited:unhealthy" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "db_unhealthy");
});

test("AC-07.db_exited: status='exited' → exit 7", () => {
  const r = checkDbStorageHealth({ dbStatus: "exited" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "db_unhealthy");
});

test("AC-07.storage_unhealthy: status='exited:unhealthy' → storage_unhealthy", () => {
  const r = checkDbStorageHealth({ storageStatus: "exited:unhealthy" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "storage_unhealthy");
});

test("AC-07.db_healthy: status='running:healthy' → PASS", () => {
  const r = checkDbStorageHealth({ dbStatus: "running:healthy", storageStatus: "running:healthy" });
  assert.equal(r.ok, true);
});

test("AC-07.db_absent: status='absent' (nuevo proyecto) → PASS (compat)", () => {
  const r = checkDbStorageHealth({ dbStatus: "absent", storageStatus: "absent" });
  assert.equal(r.ok, true);
});

test("AC-07.both_unhealthy: DB y storage unhealthy → reporta DB primero (primer blocker)", () => {
  const r = checkDbStorageHealth({ dbStatus: "exited:unhealthy", storageStatus: "exited:unhealthy" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "db_unhealthy");
});
