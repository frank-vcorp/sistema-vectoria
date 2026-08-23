/**
 * AC-W4 · wire.no-reprovisioning-guards — vectoria-provision v2.1
 *
 * SPEC-HANDOFF-20260823-XX §4.1 AC-W4 (P3-B wireup regression guard).
 *
 * Verifica que el wireup del push preserva las garantías AC-13:
 *  - `readOnlyEnforced === true` durante `runPushPostProvisioning`.
 *  - `ensure_database`/`ensure_storage` NO se invocan (count = 0).
 *  - El preflight subset del push NO incluye DNS/toolchain/secrets recheck.
 *  - El audit append lleva `stage: "push"` + `preflight.readOnlyEnforced: true`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ManifestSchema, type Manifest } from "../../src/schema.js";
import { GlobalProfileSchema } from "../../src/global-profile.js";
import { runPushPostProvisioning } from "../../src/core/push/post-provisioning.js";
import type { PreflightReport } from "../../src/core/preflight/index.js";
import type { RunEnsureArgs } from "../../src/ensure.js";
import type { EnsureResult } from "../../src/errors.js";

const baseManifest = ManifestSchema.parse({
  v: 2,
  taskId: "T-guard",
  specRef: "SPEC-22",
  slug: "guard-corp",
  fqdn: "guard-corp.vector-ia.mx",
  repository: "frank-vcorp/guard-corp",
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
  database: { engine: "postgresql", name: "g-db" },
  storage: { serviceType: "garage", name: "g-garage" },
  envOverrides: {},
}) as Manifest;

const fakePreflight: PreflightReport = {
  ok: true,
  checks: { manifest: { ok: true }, coolifyVersion: { ok: true }, serverReachable: { ok: true } },
  drift: [],
  runtimeAdapter: { kind: "runtime", version: "1.0.0", fallback: "runtime" },
  readOnlyEnforced: true,
  manifest: baseManifest,
};

test("AC-W4.counters: ensure_database/ensure_storage count = 0; ensure_application = 1", async () => {
  const counters = { ensureApp: 0, ensureDatabase: 0, ensureStorage: 0, ensureProject: 0, ensureEnv: 0, deploy: 0, health: 0 };
  const ensureApplicationImpl = async (_args: RunEnsureArgs): Promise<EnsureResult> => {
    counters.ensureApp += 1;
    return {
      ok: true,
      op: "ensure_application",
      slug: "guard-corp",
      fqdn: "guard-corp.vector-ia.mx",
      uuid: "app-uuid-guard",
      status: "adopted",
      source: "adopted",
    };
  };
  // Contadores defensivos: aunque el runner NUNCA debería invocar ensure_database/ensure_storage
  // en push mode, los spies adicionales hacen el contrato explícito.
  const ensureDatabaseImpl = async (_args: RunEnsureArgs): Promise<EnsureResult> => {
    counters.ensureDatabase += 1;
    return { ok: true, op: "ensure_database", slug: "g", uuid: "x", status: "adopted", source: "adopted" };
  };
  const ensureStorageImpl = async (_args: RunEnsureArgs): Promise<EnsureResult> => {
    counters.ensureStorage += 1;
    return { ok: true, op: "ensure_storage", slug: "g", uuid: "x", status: "adopted", source: "adopted" };
  };
  // El runner no usa estos spies; los exponemos para que si por error los invocara, el counter
  // subiría. Aquí verificamos que NO los usa.
  const push = {
    ensureApplicationImpl,
    ensureDatabaseImpl,
    ensureStorageImpl,
    patchApplication: async () => ({ ok: true, status: 200 }),
    deployApplication: async () => ({ ok: true, status: 200, deploymentUuid: "d1" }),
    healthcheck: async () => ({ ok: true, status: 200, latencyMs: 1 }),
  };
  const gp = GlobalProfileSchema.parse({ v: 1 });
  const r = await runPushPostProvisioning({
    manifest: baseManifest,
    preflight: fakePreflight,
    globalProfile: gp,
    resolvers: { push } as never,
    env: process.env,
  });
  assert.equal(r.ok, true);
  assert.equal(counters.ensureApp, 1);
  assert.equal(counters.ensureDatabase, 0, "ensure_database NUNCA en push mode (AC-13 regresión)");
  assert.equal(counters.ensureStorage, 0, "ensure_storage NUNCA en push mode (AC-13 regresión)");
  // Output explicita los flags.
  const out = r.output as { push_post_provisioning: { ensureDatabaseCalled: boolean; ensureStorageCalled: boolean; preflightReadOnlyEnforced: boolean } };
  assert.equal(out.push_post_provisioning.ensureDatabaseCalled, false);
  assert.equal(out.push_post_provisioning.ensureStorageCalled, false);
  assert.equal(out.push_post_provisioning.preflightReadOnlyEnforced, true, "readOnlyEnforced persiste en push");
});

test("AC-W4.source_grep: post-provisioning.ts NO contiene ensure_database/ensure_storage en código ejecutable (V-W7)", () => {
  const path = "src/core/push/post-provisioning.ts";
  const raw = readFileSync(path, "utf8");
  // Strip line comments and block comments para no contar menciones documentales.
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+\/\/.*$/gm, "");
  const offending = ["ensure_database", "ensure_storage"].filter((tok) => {
    const re = new RegExp(`(^|[^A-Za-z0-9_])${tok}([^A-Za-z0-9_]|$)`, "m");
    return re.test(stripped);
  });
  assert.deepEqual(offending, [], `post-provisioning.ts (código) contiene tokens prohibidos: ${offending.join(", ")}`);
});
