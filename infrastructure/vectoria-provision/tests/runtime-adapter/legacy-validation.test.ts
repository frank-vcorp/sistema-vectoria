/**
 * AC-11c · runtime-adapter.legacy-validation — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §6.3 + AC-11c.
 * application.adapter="legacy" con todas las required keys presentes ⇒ PASS.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ManifestSchema } from "../../src/schema.js";
import { selectRuntimeAdapter } from "../../src/runtime-adapter-bridge/selector.js";

const baseManifestV2 = {
  v: 2,
  taskId: "T-legacy",
  specRef: "SPEC-22",
  slug: "legacy-corp",
  fqdn: "legacy-corp.vector-ia.mx",
  repository: "frank-vcorp/legacy-corp",
  branch: "main",
  serverUuid: "srv",
  environment: "staging",
  resources: ["project", "application", "database", "storage"],
  application: {
    appVariant: "public",
    buildPack: "nixpacks",
    portsExposes: "3000",
    githubAppUuid: null,
    privateKeyUuid: null,
  },
  database: { engine: "postgresql", name: "legacy-db" },
  storage: { serviceType: "garage", name: "legacy-garage" },
  envOverrides: {},
} as const;

test("AC-11c.legacy_with_all_required_keys: PASS con audit runtimeAdapter.fallback=legacy", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vp-test-"));
  try {
    const secretsFile = join(dir, "secrets.env");
    writeFileSync(
      secretsFile,
      [
        "MASTER_KEY=m1",
        "SESSION_SECRET=s1",
        "APP_BASE_URL=https://x.com",
        "NODE_ENV=production",
        "DATABASE_URL=postgres://x",
        "S3_ENDPOINT=http://x",
        "S3_BUCKET=x",
        "S3_ACCESS_KEY=x",
        "S3_SECRET_KEY=x",
        "VECTORIA_DIRECTOR_EMAIL=a@b.com",
        "VECTORIA_SUPERUSER_PASSWORD=p",
      ].join("\n"),
      { mode: 0o600 },
    );
    const m = ManifestSchema.parse({ ...baseManifestV2, application: { ...baseManifestV2.application, adapter: "legacy" } });
    const r = await selectRuntimeAdapter(m, secretsFile);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.adapter.kind, "legacy");
      assert.equal(r.audit.fallback, "legacy");
      assert.ok(r.audit.legacyKeysValidated);
      assert.ok(r.audit.legacyKeysValidated!.length >= 10);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-11c.legacy_with_no_secrets_file: sin archivo de secretos → todas missing ⇒ exit 10", async () => {
  const m = ManifestSchema.parse({ ...baseManifestV2, application: { ...baseManifestV2.application, adapter: "legacy" } });
  const r = await selectRuntimeAdapter(m, undefined);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.exit, 10);
    assert.equal(r.reason, "legacy_missing_required_key");
  }
});
