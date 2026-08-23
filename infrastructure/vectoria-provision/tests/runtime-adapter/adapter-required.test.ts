/**
 * AC-11a · runtime-adapter.required — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §6.3 + AC-11a (cierre §7.12 SOL-20260822-01).
 * Manifest v2 sin `application.adapter` ⇒ exit 3.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectRuntimeAdapter } from "../../src/runtime-adapter-bridge/selector.js";
import type { Manifest } from "../../src/schema.js";

test("AC-11a.no_adapter: application.adapter ausente ⇒ exit 3 adapter_required_for_new_projects", async () => {
  // Build minimal manifest without `adapter` field at all.
  const m = {
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
  } as unknown as Manifest;
  const r = await selectRuntimeAdapter(m, undefined);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.exit, 3);
    assert.equal(r.reason, "adapter_required_for_new_projects");
  }
});
