/**
 * AC-11d · runtime-adapter.legacy-missing-key — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §6.3 + AC-11d.
 * application.adapter="legacy" con MASTER_KEY ausente ⇒ exit 10.
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
  taskId: "T-legacy-missing",
  specRef: "SPEC-22",
  slug: "miss-corp",
  fqdn: "miss-corp.vector-ia.mx",
  repository: "frank-vcorp/miss-corp",
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
  database: { engine: "postgresql", name: "miss-db" },
  storage: { serviceType: "garage", name: "miss-garage" },
  envOverrides: {},
} as const;

test("AC-11d.legacy_master_key_missing: MASTER_KEY ausente ⇒ exit 10 legacy_missing_required_key:MASTER_KEY", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vp-test-"));
  try {
    const secretsFile = join(dir, "secrets.env");
    // Incluye todas EXCEPTO MASTER_KEY
    writeFileSync(
      secretsFile,
      [
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
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.exit, 10);
      assert.equal(r.reason, "legacy_missing_required_key");
      assert.equal(r.missingKey, "MASTER_KEY");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
