/**
 * AC-11b · runtime-adapter.load-failed — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §6.3 + AC-11b.
 * application.adapter="runtime" con runtimeAdapter.path inválido ⇒ exit 5.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ManifestSchema } from "../../src/schema.js";
import { selectRuntimeAdapter } from "../../src/runtime-adapter-bridge/selector.js";

const baseManifestV2 = {
  v: 2,
  taskId: "T-acme",
  specRef: "SPEC-22",
  slug: "acme-corp",
  fqdn: "acme-corp.vector-ia.mx",
  repository: "frank-vcorp/acme-corp",
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
  database: { engine: "postgresql", name: "acme-db" },
  storage: { serviceType: "garage", name: "acme-garage" },
  envOverrides: {},
} as const;

test("AC-11b.runtime_path_invalid: runtimeAdapter.path apuntando a módulo inexistente ⇒ exit 5", async () => {
  const m = ManifestSchema.parse({
    ...baseManifestV2,
    application: {
      ...baseManifestV2.application,
      adapter: "runtime",
      runtimeAdapter: {
        path: "/tmp/no-existe-este-path-xyz/runtime-adapter",
        entry: "missing.ts",
        kind: "typescript",
        version: "1.0.0",
      },
    },
  });
  const r = await selectRuntimeAdapter(m, undefined);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.exit, 5);
    assert.equal(r.reason, "runtime_adapter_load_failed");
  }
});
