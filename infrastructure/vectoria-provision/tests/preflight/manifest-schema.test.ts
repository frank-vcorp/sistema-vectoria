/**
 * preflight · manifest-schema — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.1 P13 + AC-12.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkManifest } from "../../src/core/preflight/manifest.js";

test("AC-12.manifest_v2_valid: parsea y retorna manifest canónico", () => {
  const r = checkManifest({
    v: 2,
    taskId: "T1",
    specRef: "SPEC-1",
    slug: "acme",
    fqdn: "acme.vector-ia.mx",
    repository: "frank-vcorp/acme",
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
  });
  assert.equal(r.ok, true);
  assert.ok(r.manifest);
});

test("AC-12.manifest_v1_compat: parsea y transforma v1→v2", () => {
  const r = checkManifest({
    v: 1,
    taskId: "T1",
    specRef: "SPEC-1",
    slug: "acme",
    fqdn: "acme.vector-ia.mx",
    repository: "frank-vcorp/acme",
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
  });
  assert.equal(r.ok, true);
  assert.equal(r.manifest?.v, 2);
  assert.equal(r.manifest?.project?.parent, "vectoria");
});

test("AC-12.manifest_null: null → manifest_invalid:not_object", () => {
  const r = checkManifest(null);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "manifest_invalid:not_object");
});

test("AC-12.manifest_array: array → manifest_invalid:not_object", () => {
  const r = checkManifest([1, 2, 3]);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "manifest_invalid:not_object");
});

test("AC-12.manifest_invalid_v: v=99 → manifest_invalid:v_must_be_1_or_2", () => {
  const r = checkManifest({ v: 99 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "manifest_invalid:v_must_be_1_or_2");
});

test("AC-12.manifest_missing_required_field: sin taskId → manifest_invalid", () => {
  const r = checkManifest({
    v: 2,
    specRef: "x",
    slug: "acme",
    fqdn: "acme.vector-ia.mx",
    repository: "frank-vcorp/acme",
    branch: "main",
    serverUuid: "srv",
    environment: "staging",
    resources: ["project"],
    application: {
      appVariant: "public",
      buildPack: "nixpacks",
      portsExposes: "3000",
      githubAppUuid: null,
      privateKeyUuid: null,
    },
    database: { engine: "postgresql", name: "d" },
    storage: { serviceType: "garage", name: "s" },
    envOverrides: {},
  });
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /manifest_invalid/);
});
