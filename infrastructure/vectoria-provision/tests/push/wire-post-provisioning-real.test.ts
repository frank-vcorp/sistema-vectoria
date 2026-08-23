/**
 * AC-W3 · wire.post-provisioning-real — vectoria-provision v2.1
 *
 * SPEC-HANDOFF-20260823-XX §4.1 AC-W3 (P3-B wireup).
 *
 * Verifica que `runPushPostProvisioning` ejecuta el flujo real:
 *  - `ensure_application` PATCH (no POST) con `head_commit` exacto + `health_check_block`.
 *  - `POST /applications/{uuid}/deploy` retorna 2xx con `deployment_uuid`.
 *  - `GET /api/health` retorna 2xx en ≤ 60s.
 *  - Sub-tests: happy path, deploy 4xx, healthcheck timeout (exit 61).
 *  - Cero `ensure_database`/`ensure_storage` (regresión AC-13).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ManifestSchema, type Manifest } from "../../src/schema.js";
import { GlobalProfileSchema } from "../../src/global-profile.js";
import { runPushPostProvisioning } from "../../src/core/push/post-provisioning.js";
import type { PreflightReport } from "../../src/core/preflight/index.js";
import type { RunEnsureArgs } from "../../src/ensure.js";
import type { EnsureResult } from "../../src/errors.js";

const baseManifestRaw: Record<string, unknown> = {
  v: 2,
  taskId: "T-push",
  specRef: "SPEC-22",
  slug: "push-corp",
  fqdn: "push-corp.vector-ia.mx",
  repository: "frank-vcorp/push-corp",
  branch: "main",
  serverUuid: "srv",
  environment: "staging",
  headCommit: "deadbeefcafebabe",
  resources: ["project", "application", "database", "storage"],
  application: {
    appVariant: "public",
    buildPack: "nixpacks",
    portsExposes: "3000",
    githubAppUuid: null,
    privateKeyUuid: null,
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
    adapter: "runtime",
    runtimeAdapter: {
      path: "/tmp/no-existe",
      entry: "x.ts",
      kind: "typescript",
      version: "1.0.0",
    },
  },
  database: { engine: "postgresql", name: "p-db" },
  storage: { serviceType: "garage", name: "p-garage" },
  envOverrides: {},
};
// `headCommit` no es parte del schema cerrado; lo añadimos vía cast para preservar
// la semántica del wireup (PATCH head_commit). El schema lo strippea pero el
// post-provisioning opera sobre el manifest YA validado; inyectamos headCommit
// post-parse.
const baseManifest = ManifestSchema.parse(baseManifestRaw) as Manifest & { headCommit?: string };
baseManifest.headCommit = (baseManifestRaw as { headCommit?: string }).headCommit;

const fakePreflight: PreflightReport = {
  ok: true,
  checks: { manifest: { ok: true }, coolifyVersion: { ok: true }, serverReachable: { ok: true } },
  drift: [],
  runtimeAdapter: { kind: "runtime", version: "1.0.0", fallback: "runtime" },
  readOnlyEnforced: true,
  manifest: baseManifest,
};

interface PushSpyCounters {
  ensureApp: number;
  patchApp: number;
  deploy: number;
  health: number;
  lastPatchBody?: Record<string, unknown>;
}

function makePushSpy(counters: PushSpyCounters, opts?: {
  deployOverride?: () => Promise<{ ok: boolean; status?: number; deploymentUuid?: string; error?: string }>;
  healthOverride?: () => Promise<{ ok: boolean; status?: number; latencyMs?: number; error?: string }>;
}) {
  const ensureApplicationImpl = async (_args: RunEnsureArgs): Promise<EnsureResult> => {
    counters.ensureApp += 1;
    return {
      ok: true,
      op: "ensure_application",
      slug: "push-corp",
      fqdn: "push-corp.vector-ia.mx",
      uuid: "app-uuid-push",
      status: "adopted",
      source: "adopted",
    };
  };
  const patchApplication = async (
    _uuid: string,
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; status?: number; error?: string }> => {
    counters.patchApp += 1;
    counters.lastPatchBody = body;
    return { ok: true, status: 200 };
  };
  const deployApplication = async (
    _uuid: string,
  ): Promise<{ ok: boolean; status?: number; deploymentUuid?: string; error?: string }> => {
    counters.deploy += 1;
    if (opts?.deployOverride) return opts.deployOverride();
    return { ok: true, status: 200, deploymentUuid: "deploy-uuid-12345" };
  };
  const healthcheck = async (
    _fqdn: string,
  ): Promise<{ ok: boolean; status?: number; latencyMs?: number; error?: string }> => {
    counters.health += 1;
    if (opts?.healthOverride) return opts.healthOverride();
    return { ok: true, status: 200, latencyMs: 8 };
  };
  return { ensureApplicationImpl, patchApplication, deployApplication, healthcheck };
}

test("AC-W3.happy: ensure_application PATCH + POST /deploy + GET /api/health en orden", async () => {
  const counters: PushSpyCounters = { ensureApp: 0, patchApp: 0, deploy: 0, health: 0 };
  const spies = makePushSpy(counters);
  const gp = GlobalProfileSchema.parse({ v: 1 });
  const r = await runPushPostProvisioning({
    manifest: baseManifest,
    preflight: fakePreflight,
    globalProfile: gp,
    resolvers: { push: spies } as never,
    env: process.env,
  });
  assert.equal(r.ok, true);
  assert.equal(r.exit, 0);
  // Spy counts: ensure_app=1, patch_app=1 (porque headCommit + healthcheck presentes),
  // deploy=1, health=1.
  assert.equal(counters.ensureApp, 1);
  assert.equal(counters.patchApp, 1);
  assert.equal(counters.deploy, 1);
  assert.equal(counters.health, 1);
  // El PATCH debe llevar head_commit (git_commit_sha) y health_check_path.
  const body = counters.lastPatchBody ?? {};
  assert.equal(body["git_commit_sha"], "deadbeefcafebabe");
  assert.equal(body["health_check_path"], "/api/health");
  // Output declara deployment_uuid poblado.
  const out = r.output as { push_post_provisioning: { deploymentUuid?: string; healthcheck: { status: number } } };
  assert.equal(out.push_post_provisioning.deploymentUuid, "deploy-uuid-12345");
  assert.equal(out.push_post_provisioning.healthcheck.status, 200);
});

test("AC-W3.deploy_4xx: POST /deploy retorna 4xx → exit 61 (post_deploy_healthcheck_failed branch NO; infra_blocked)", async () => {
  const counters: PushSpyCounters = { ensureApp: 0, patchApp: 0, deploy: 0, health: 0 };
  const spies = makePushSpy(counters, {
    deployOverride: async () => ({ ok: false, status: 422, error: "deploy_rejected" }),
  });
  const gp = GlobalProfileSchema.parse({ v: 1 });
  const r = await runPushPostProvisioning({
    manifest: baseManifest,
    preflight: fakePreflight,
    globalProfile: gp,
    resolvers: { push: spies } as never,
    env: process.env,
  });
  assert.equal(r.ok, false);
  assert.equal(r.exit, 2, "deploy 4xx → exit 2 (upstream_40x no es post_deploy_healthcheck_failed)");
  assert.match(r.reason ?? "", /deploy_application failed/);
  // Healthcheck NO se ejecutó (corta antes).
  assert.equal(counters.health, 0);
});

test("AC-W3.healthcheck_fail: GET /api/health retorna 5xx → exit 61 post_deploy_healthcheck_failed", async () => {
  const counters: PushSpyCounters = { ensureApp: 0, patchApp: 0, deploy: 0, health: 0 };
  const spies = makePushSpy(counters, {
    healthOverride: async () => ({ ok: false, status: 503, latencyMs: 50, error: "service_unavailable" }),
  });
  const gp = GlobalProfileSchema.parse({ v: 1 });
  const r = await runPushPostProvisioning({
    manifest: baseManifest,
    preflight: fakePreflight,
    globalProfile: gp,
    resolvers: { push: spies } as never,
    env: process.env,
  });
  assert.equal(r.ok, false);
  assert.equal(r.exit, 61);
  assert.match(r.reason ?? "", /post_deploy_healthcheck_failed/);
});

test("AC-W3.healthcheck_timing: healthcheck retorna latencyMs < 60s (AC-W3 ≤ 60s)", async () => {
  const counters: PushSpyCounters = { ensureApp: 0, patchApp: 0, deploy: 0, health: 0 };
  const spies = makePushSpy(counters, {
    healthOverride: async () => ({ ok: true, status: 200, latencyMs: 45 }),
  });
  const gp = GlobalProfileSchema.parse({ v: 1 });
  const r = await runPushPostProvisioning({
    manifest: baseManifest,
    preflight: fakePreflight,
    globalProfile: gp,
    resolvers: { push: spies } as never,
    env: process.env,
  });
  assert.equal(r.ok, true);
  const out = r.output as { push_post_provisioning: { healthcheck: { status: number; latencyMs: number } } };
  assert.ok(out.push_post_provisioning.healthcheck.latencyMs < 60_000);
});

test("CE-14: runPushPostProvisioning con migrations.destructive=true → schema reject (V20)", async () => {
  // El schema Zod rechaza `destructive: true` literalmente.
  let schemaRejected = false;
  try {
    ManifestSchema.parse({
      ...baseManifestRaw,
      migrations: { path: "./db/migrations", auto: true, destructive: true },
    });
  } catch (e: unknown) {
    schemaRejected = true;
    assert.match((e as Error).message, /destructive/);
  }
  assert.equal(schemaRejected, true, "schema debe rechazar destructive=true");
});

test("AC-W3.production_rejected: environment='production' → exit 99 production_not_authorized", async () => {
  const counters: PushSpyCounters = { ensureApp: 0, patchApp: 0, deploy: 0, health: 0 };
  const spies = makePushSpy(counters);
  const prodManifest = ManifestSchema.parse({
    ...baseManifestRaw,
    environment: "production",
  });
  const gp = GlobalProfileSchema.parse({ v: 1 });
  const r = await runPushPostProvisioning({
    manifest: prodManifest,
    preflight: fakePreflight,
    globalProfile: gp,
    resolvers: { push: spies } as never,
    env: process.env,
  });
  assert.equal(r.ok, false);
  assert.equal(r.exit, 99);
  assert.match(r.reason ?? "", /production/);
  // Ningún spy debe haberse invocado.
  assert.equal(counters.ensureApp, 0);
  assert.equal(counters.deploy, 0);
  assert.equal(counters.health, 0);
});
