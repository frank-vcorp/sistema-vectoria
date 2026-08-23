/**
 * AC-14 · runtime-adapter.cross-project — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §6.3 + AC-14.
 * Dos proyectos con adapter distinto (uno legacy, uno runtime) — verifica
 * que cada uno sólo ve su propio adapter (no cross-contamination).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ManifestSchema } from "../../src/schema.js";
import { selectRuntimeAdapter } from "../../src/runtime-adapter-bridge/selector.js";

const baseLegacy = {
  v: 2,
  taskId: "T-legacy",
  specRef: "S",
  slug: "cross-legacy",
  fqdn: "cross-legacy.vector-ia.mx",
  repository: "frank-vcorp/cross-legacy",
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
  database: { engine: "postgresql", name: "l-db" },
  storage: { serviceType: "garage", name: "l-garage" },
  envOverrides: {},
} as const;

const baseRuntime = {
  ...baseLegacy,
  taskId: "T-runtime",
  slug: "cross-runtime",
  fqdn: "cross-runtime.vector-ia.mx",
  repository: "frank-vcorp/cross-runtime",
  application: {
    ...baseLegacy.application,
    adapter: "runtime" as const,
    runtimeAdapter: {
      path: "/tmp/no-existe-xyz/runtime-adapter",
      entry: "x.ts",
      kind: "typescript" as const,
      version: "1.0.0",
    },
  },
};

test("AC-14.cross_project: legacy PASS + runtime FAIL — sin cross-contamination", async () => {
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
    const mLegacy = ManifestSchema.parse({
      ...baseLegacy,
      application: { ...baseLegacy.application, adapter: "legacy" },
    });
    const mRuntime = ManifestSchema.parse(baseRuntime);

    const rLegacy = await selectRuntimeAdapter(mLegacy, secretsFile);
    const rRuntime = await selectRuntimeAdapter(mRuntime, secretsFile);

    assert.equal(rLegacy.ok, true);
    assert.equal(rRuntime.ok, false);
    if (rLegacy.ok && !rRuntime.ok) {
      assert.equal(rLegacy.adapter.kind, "legacy");
      assert.equal(rLegacy.audit.fallback, "legacy");
      assert.equal(rRuntime.exit, 5);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
