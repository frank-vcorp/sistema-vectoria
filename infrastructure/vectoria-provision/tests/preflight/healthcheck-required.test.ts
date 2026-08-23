/**
 * AC-08 · preflight.healthcheck-required — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.1 + AC-08.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkHealthcheckRequired } from "../../src/core/preflight/healthcheck-required.js";
import { ManifestSchema } from "../../src/schema.js";

const baseManifest = {
  v: 2,
  taskId: "IMPL-20260822-XX",
  specRef: "SPEC-20260822-001",
  slug: "acme-corp",
  fqdn: "acme-corp.vector-ia.mx",
  repository: "frank-vcorp/acme-corp",
  branch: "main",
  serverUuid: "03tz1uabcrjaihnvrhysbstv",
  environment: "staging",
  resources: ["project", "application", "database", "storage"],
  application: {
    appVariant: "public",
    buildPack: "nixpacks",
    portsExposes: "3000",
    githubAppUuid: null,
    privateKeyUuid: null,
  },
  database: { engine: "postgresql", name: "acme-corp-db" },
  storage: { serviceType: "garage", name: "acme-corp-garage" },
  envOverrides: {},
};

test("AC-08.manifest_only: application.healthcheck presente y enabled → PASS, source=manifest", () => {
  const m = ManifestSchema.parse({
    ...baseManifest,
    application: {
      ...baseManifest.application,
      healthcheck: {
        enabled: true,
        path: "/api/health",
        method: "GET",
        scheme: "http",
        port: "3000",
        interval: 30,
        timeout: 5,
        retries: 3,
      },
    },
  });
  const r = checkHealthcheckRequired(m, undefined);
  assert.equal(r.ok, true);
  assert.equal(r.source, "manifest");
});

test("AC-08.global_default_applied: global-profile provee default → PASS, source=global_profile_default", () => {
  const m = ManifestSchema.parse(baseManifest);
  const r = checkHealthcheckRequired(m, {
    enabled: true,
    path: "/health",
    method: "GET",
    scheme: "http",
    port: "3000",
    interval: 30,
    timeout: 5,
    retries: 3,
  });
  assert.equal(r.ok, true);
  assert.equal(r.source, "global_profile_default");
});

test("AC-08.both_missing: manifest ausente + global-profile ausente → healthcheck_required (exit 12)", () => {
  const m = ManifestSchema.parse(baseManifest);
  const r = checkHealthcheckRequired(m, undefined);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "healthcheck_required");
});
