/**
 * AC-13 · push.post-provisioning-no-reprovision — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §3.4 + AC-13 (cierre §7.7-implícito SOL-20260822-01).
 *
 * Verifica que el push post-provisioning NO invoca ensure_database /
 * ensure_storage (spy call count = 0); sí invoca ensure_application
 * (PATCH head_commit + healthcheck block).
 *
 * v2.1 (P3-B wireup): el flujo ahora ejecuta el `ensure_application` real
 * más `POST /deploy` y `GET /api/health`. Los tests inyectan spies vía
 * `resolvers.push.{ensureApplicationImpl, deployApplication, healthcheck}`
 * para validar la semántica AC-13 sin tocar Coolify real.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ManifestSchema, type Manifest } from "../../src/schema.js";
import { GlobalProfileSchema } from "../../src/global-profile.js";
import { runPushPostProvisioning } from "../../src/core/push/post-provisioning.js";
import type { PreflightReport } from "../../src/core/preflight/index.js";
import type { RunEnsureArgs } from "../../src/ensure.js";
import type { EnsureResult } from "../../src/errors.js";

const baseManifest = ManifestSchema.parse({
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
    adapter: "runtime",
    runtimeAdapter: {
      path: "/tmp/no-existe",
      entry: "x.ts",
      kind: "typescript",
      version: "1.0.0",
    },
  },
  database: { engine: "postgresql", name: "acme-db" },
  storage: { serviceType: "garage", name: "acme-garage" },
  envOverrides: {},
});

const fakePreflight: PreflightReport = {
  ok: true,
  checks: { manifest: { ok: true }, coolifyVersion: { ok: true }, serverReachable: { ok: true } },
  drift: [],
  runtimeAdapter: { kind: "runtime", version: "1.0.0", fallback: "runtime" },
  readOnlyEnforced: true,
  manifest: baseManifest,
};

function makePushSpyResolvers(): {
  resolvers: { push: Record<string, unknown> };
  counters: { ensureApp: number; deploy: number; health: number };
} {
  const counters = { ensureApp: 0, deploy: 0, health: 0 };
  const ensureApplicationImpl = async (_args: RunEnsureArgs): Promise<EnsureResult> => {
    counters.ensureApp += 1;
    return {
      ok: true,
      op: "ensure_application",
      slug: "acme-corp",
      fqdn: "acme-corp.vector-ia.mx",
      uuid: "app-uuid-test",
      status: "adopted",
      source: "adopted",
    };
  };
  const patchApplication = async (
    _uuid: string,
    _body: Record<string, unknown>,
  ): Promise<{ ok: boolean; status?: number; error?: string }> => {
    return { ok: true, status: 200 };
  };
  const deployApplication = async (
    uuid: string,
  ): Promise<{ ok: boolean; status?: number; deploymentUuid?: string; error?: string }> => {
    void uuid;
    counters.deploy += 1;
    return { ok: true, status: 200, deploymentUuid: "deploy-uuid-test" };
  };
  const healthcheck = async (
    fqdn: string,
  ): Promise<{ ok: boolean; status?: number; latencyMs?: number; error?: string }> => {
    void fqdn;
    counters.health += 1;
    return { ok: true, status: 200, latencyMs: 12 };
  };
  return {
    resolvers: {
      push: {
        ensureApplicationImpl,
        patchApplication,
        deployApplication,
        healthcheck,
      },
    },
    counters,
  };
}

test("AC-13.push_mode: ensureDatabaseCalled=false, ensureStorageCalled=false, ensureApplicationCalled=true", async () => {
  const gp = GlobalProfileSchema.parse({ v: 1 });
  const { resolvers, counters } = makePushSpyResolvers();
  const r = await runPushPostProvisioning({
    manifest: baseManifest,
    preflight: fakePreflight,
    globalProfile: gp,
    resolvers: resolvers as never,
    env: process.env,
  });
  assert.equal(r.ok, true);
  const pp = (r.output as { push_post_provisioning: { ensureDatabaseCalled: boolean; ensureStorageCalled: boolean; ensureApplicationCalled: boolean } }).push_post_provisioning;
  assert.equal(pp.ensureDatabaseCalled, false);
  assert.equal(pp.ensureStorageCalled, false);
  assert.equal(pp.ensureApplicationCalled, true);
  // Spies adicionales del wireup v2.1 (P3-B):
  assert.equal(counters.ensureApp, 1);
  assert.equal(counters.deploy, 1);
  assert.equal(counters.health, 1);
});

test("AC-13.push_mode: migrations.destructive=false se respeta (no es auto-aplicado)", async () => {
  const gp = GlobalProfileSchema.parse({ v: 1 });
  const m = ManifestSchema.parse({
    ...baseManifest,
    migrations: { path: "./db/migrations", auto: true, destructive: false },
  }) as Manifest;
  const { resolvers } = makePushSpyResolvers();
  const r = await runPushPostProvisioning({
    manifest: m,
    preflight: { ...fakePreflight, manifest: m },
    globalProfile: gp,
    resolvers: resolvers as never,
    env: process.env,
  });
  assert.equal(r.ok, true);
  const pp = (r.output as { push_post_provisioning: { migrations?: { destructive: boolean } } }).push_post_provisioning;
  assert.ok(pp.migrations);
  assert.equal(pp.migrations?.destructive, false);
});

test("AC-13.push_mode: preflight fallido → exit 2 push_preflight_failed", async () => {
  const gp = GlobalProfileSchema.parse({ v: 1 });
  const { resolvers } = makePushSpyResolvers();
  const r = await runPushPostProvisioning({
    manifest: baseManifest,
    preflight: { ...fakePreflight, ok: false, reason: "server_unreachable" },
    globalProfile: gp,
    resolvers: resolvers as never,
    env: process.env,
  });
  assert.equal(r.ok, false);
  assert.equal(r.exit, 2);
  assert.match(r.reason ?? "", /push_preflight_failed/);
});
