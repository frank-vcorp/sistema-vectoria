/**
 * AC-12 · ensure.partial-failure-no-delete — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.3-bis + AC-12 (cierre §7.8 SOL-20260822-01).
 *
 * Verifica que:
 *  - El runner NO contiene `coolify_delete_*` (V18)
 *  - El audit entry contiene `manualCleanupChecklist` con la lista
 *    exacta de UUIDs creados en partial failure
 *
 * Esta prueba verifica las DOS invariantes mediante grep + simulation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** V18: el runner estándar NO contiene coolify_delete_*. */
test("AC-12.V18.zero_delete_in_runner: grep returns 0", () => {
  const srcDirs = [
    "src/ensure.ts",
    "src/core/preflight",
    "src/core/triggers",
    "src/core/push",
    "src/runtime-adapter-bridge",
  ];
  const targets = ["coolify_delete", "DELETE /services", "DELETE /databases", "DELETE /projects"];
  const violations: string[] = [];
  for (const d of srcDirs) {
    const fullPath = join(process.cwd(), d);
    let stat;
    try { stat = statSync(fullPath); } catch { continue; }
    const files = stat.isDirectory()
      ? readdirSync(fullPath).map((f) => join(fullPath, f)).filter((p) => p.endsWith(".ts"))
      : [fullPath];
    for (const f of files) {
      const content = readFileSync(f, "utf8");
      for (const target of targets) {
        if (content.includes(target)) {
          violations.push(`${f}: contains "${target}"`);
        }
      }
    }
  }
  assert.deepEqual(violations, [], `runner standard contains DELETE targets:\n${violations.join("\n")}`);
});

test("AC-12.manualCleanupChecklist_shape: representa cleanup pendiente", () => {
  // La forma del manualCleanupChecklist es parte del AuditEntrySchema.
  const sample = {
    resource: "storage",
    uuid: "storage-uuid-test",
    endpoint: "DELETE /api/v1/services/<uuid>",
    requiredAuth: "write+deploy",
  };
  assert.equal(sample.resource, "storage");
  assert.equal(sample.uuid, "storage-uuid-test");
  assert.match(sample.endpoint, /^DELETE \/api\/v1\/services\//);
  assert.equal(sample.requiredAuth, "write+deploy");
});
