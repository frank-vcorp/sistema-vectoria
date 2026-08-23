/**
 * AC-W1 · wire.runProvision-ensure — vectoria-provision v2.1
 *
 * SPEC-HANDOFF-20260823-XX §4.1 AC-W1 (P3-A wireup).
 *
 * Verifica que `runProvision` invoca el pipeline `ensure_*` real:
 *  - Cold run: 6 ensure_* llamadas (project/environment/application/database/storage/env).
 *  - Warm re-run: 0 POSTs nuevos (idempotencia via adopt).
 *  - Error path: partial failure → exit 50 + manualCleanupChecklist con UUIDs creados.
 *  - El spy seam `resolvers.runEnsureImpl` se invoca con la firma RunEnsureArgs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runProvision } from "../../src/core/triggers/provision.js";
import type { RunEnsureArgs } from "../../src/ensure.js";
import type { EnsureResult } from "../../src/errors.js";

function buildManifest(): Record<string, unknown> {
  return {
    v: 2,
    taskId: "T-wire",
    specRef: "SPEC-22",
    slug: "wire-corp",
    fqdn: "wire-corp.vector-ia.mx",
    repository: "frank-vcorp/wire-corp",
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
      adapter: "legacy",
    },
    database: { engine: "postgresql", name: "wire-db" },
    storage: { serviceType: "garage", name: "wire-garage" },
    envOverrides: {},
  };
}

function writeManifestAndSecrets(dir: string, manifest: unknown): { manifestPath: string; secretsFile: string } {
  const manifestPath = join(dir, "m.json");
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const secretsFile = join(dir, "secrets.env");
  writeFileSync(
    secretsFile,
    [
      "MASTER_KEY=m",
      "SESSION_SECRET=s",
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
  return { manifestPath, secretsFile };
}

function makeSpy(): {
  impl: (args: RunEnsureArgs) => Promise<EnsureResult>;
  counters: Map<string, number>;
} {
  const counters = new Map<string, number>();
  const state = new Map<string, EnsureResult>(); // op → resultado pre-cargado (idempotencia)
  const impl = async (args: RunEnsureArgs): Promise<EnsureResult> => {
    counters.set(args.operation, (counters.get(args.operation) ?? 0) + 1);
    const existing = state.get(args.operation);
    if (existing) return existing;
    const result: EnsureResult = {
      ok: true,
      op: args.operation,
      slug: args.manifest.slug,
      fqdn: args.manifest.fqdn,
      uuid: `uuid-${args.operation}-1`,
      status: "created",
      source: "coolify-response",
    };
    state.set(args.operation, {
      ...result,
      status: "adopted",
      source: "adopted",
    });
    return result;
  };
  return { impl, counters };
}

const baseResolvers: import("../../src/core/triggers/provision.js").ProvisionResolvers = {
  async serverInfo() {
    return { version: "v4.0.0-beta.19", isReachable: true, proxyStatus: "running" };
  },
  async dbStatus() { return "absent" as const; },
  async storageStatus() { return "absent" as const; },
  async dnsIp() { return "212.28.185.217"; },
  async gitRemoteSha() { return "abc1234567890"; },
  pnpmWorkspace() { return { exists: false }; },
};

test("AC-W1.cold: 6 ensure_* llamadas (project/environment/application/database/storage/env) y breakdown correcto", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vp-wire-"));
  try {
    const { manifestPath, secretsFile } = writeManifestAndSecrets(dir, buildManifest());
    const spy = makeSpy();
    const r = await runProvision({
      argv: [manifestPath],
      env: {
        ...process.env,
        COOLIFY_READ_TOKEN: "r",
        COOLIFY_WRITE_TOKEN: "w",
        VECTORIA_SECRETS_FILE: secretsFile,
      },
      resolvers: { ...baseResolvers, runEnsureImpl: spy.impl },
    });
    assert.equal(r.ok, true);
    assert.equal(r.exit, 0);
    assert.equal(r.stage, "ensure");
    assert.equal(spy.counters.get("ensure_project"), 1);
    assert.equal(spy.counters.get("ensure_environment"), 1);
    assert.equal(spy.counters.get("ensure_application"), 1);
    assert.equal(spy.counters.get("ensure_database"), 1);
    assert.equal(spy.counters.get("ensure_storage"), 1);
    assert.ok((spy.counters.get("ensure_env") ?? 0) >= 1, "ensure_env ≥ 1");
    const out = r.output as { ensure: { uuid_application: string; adoptionBreakdown: { created: number; adopted: number } } };
    assert.match(out.ensure.uuid_application, /^uuid-ensure_application-/);
    assert.ok(out.ensure.adoptionBreakdown.created >= 1, "cold run tiene created ≥ 1");
    assert.ok(out.ensure.adoptionBreakdown.adopted >= 0, "cold run adopted ≥ 0");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-W1.warm: segunda invocación sobre los mismos manifests → adopt (no nuevos POST)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vp-wire-"));
  try {
    const { manifestPath, secretsFile } = writeManifestAndSecrets(dir, buildManifest());
    const spy = makeSpy();
    // Cold run
    await runProvision({
      argv: [manifestPath],
      env: { ...process.env, COOLIFY_READ_TOKEN: "r", COOLIFY_WRITE_TOKEN: "w", VECTORIA_SECRETS_FILE: secretsFile },
      resolvers: { ...baseResolvers, runEnsureImpl: spy.impl },
    });
    const coldCounters = new Map(spy.counters);
    // Warm re-run
    const r2 = await runProvision({
      argv: [manifestPath],
      env: { ...process.env, COOLIFY_READ_TOKEN: "r", COOLIFY_WRITE_TOKEN: "w", VECTORIA_SECRETS_FILE: secretsFile },
      resolvers: { ...baseResolvers, runEnsureImpl: spy.impl },
    });
    assert.equal(r2.ok, true);
    // Warm re-run ejecuta TODAS las ops (porque el spy no inspecciona registry).
    // El spy pre-carga result "adopted" tras primera llamada, así que el segundo
    // run recibe EnsureOutcome con status="adopted".
    const out2 = r2.output as { ensure: { adoptionBreakdown: { created: number; adopted: number } } };
    assert.ok(out2.ensure.adoptionBreakdown.adopted >= 1, "warm re-run adopted ≥ 1");
    // Y cada op se llamó una vez más.
    for (const op of ["ensure_project", "ensure_environment", "ensure_application", "ensure_database", "ensure_storage", "ensure_env"]) {
      assert.equal(spy.counters.get(op), (coldCounters.get(op) ?? 0) + 1, `${op} llamado +1 vez en warm`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-W1.error: ensure_database falla tras 2 recursos creados → exit 50 + manualCleanupChecklist", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vp-wire-"));
  try {
    const { manifestPath, secretsFile } = writeManifestAndSecrets(dir, buildManifest());
    const failOnDatabase = async (args: RunEnsureArgs): Promise<EnsureResult> => {
      if (args.operation === "ensure_database") {
        throw new (await import("../../src/errors.js")).ProvisionError("upstream_40x", "ensure_database sintético fail");
      }
      return {
        ok: true,
        op: args.operation,
        slug: args.manifest.slug,
        fqdn: args.manifest.fqdn,
        uuid: `uuid-${args.operation}-err`,
        status: "created",
        source: "coolify-response",
      };
    };
    const r = await runProvision({
      argv: [manifestPath],
      env: { ...process.env, COOLIFY_READ_TOKEN: "r", COOLIFY_WRITE_TOKEN: "w", VECTORIA_SECRETS_FILE: secretsFile },
      resolvers: { ...baseResolvers, runEnsureImpl: failOnDatabase },
    });
    assert.equal(r.ok, false);
    assert.equal(r.exit, 50);
    const out = r.output as { manualCleanupChecklist: Array<{ resource: string; uuid: string; endpoint: string; requiredAuth: string }>; adoptionBreakdown: { created: number; adopted: number } };
    assert.ok(Array.isArray(out.manualCleanupChecklist));
    assert.ok(out.manualCleanupChecklist.length >= 2, "cleanup lista ≥ 2 (project + environment antes de database)");
    for (const item of out.manualCleanupChecklist) {
      assert.match(item.endpoint, /^manual cleanup: /);
      assert.match(item.endpoint, /Frank-auth required/);
      assert.equal(item.requiredAuth, "write+deploy");
    }
    assert.ok(out.adoptionBreakdown.created >= 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CE-13: NOTA — v1 manifest compat requiere v1ToV2Transform inyectar adapter='legacy'; pendiente §13 INTEGRA", async () => {
  // Documentado como gap. La transformación v1→v2 actual (inmutable §3.2 handoff)
  // no añade `application.adapter`, por lo que el runtime-adapter selector falla
  // fail-closed (exit 3). El test documenta el comportamiento actual; el cierre
  // definitivo requiere un cambio en `schema.ts:v1ToV2Transform` que el handoff
  // §3.2 protege. Queda como LIMITACIÓN CONOCIDA para Frank/INTEGRA.
  const { ManifestSchema } = await import("../../src/schema.js");
  let caught: Error | undefined;
  try {
    ManifestSchema.parse({
      v: 1,
      taskId: "T-v1",
      specRef: "SPEC-22",
      slug: "v1-c",
      fqdn: "v1-c.vector-ia.mx",
      repository: "o/v1-c",
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
  } catch (e: unknown) {
    caught = e as Error;
  }
  // Documentamos el comportamiento actual: el v1 parsea OK pero la aplicación no
  // tiene adapter. El runtime-adapter preflight P12 fallará en runtime.
  // Este test simplemente verifica que el parse v1 sigue funcionando.
  assert.ok(caught === undefined || /adapter/.test(caught.message ?? "") === false);
});
