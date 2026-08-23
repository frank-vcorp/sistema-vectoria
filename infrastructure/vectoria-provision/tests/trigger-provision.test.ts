/**
 * trigger · parseTriggerFlags + runProvision happy path — vectoria-provision v2.1
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseTriggerFlags } from "../src/core/triggers/flags.js";
import { runProvision } from "../src/core/triggers/provision.js";

test("flags.parse: --preflight-only activa flag", () => {
  const f = parseTriggerFlags(["--preflight-only"]);
  assert.equal(f.preflightOnly, true);
});

test("flags.parse: --operation=ensure_application acepta valor válido", () => {
  const f = parseTriggerFlags(["--operation=ensure_application"]);
  assert.equal(f.operation, "ensure_application");
});

test("flags.parse: --operation=foo inválido → error", () => {
  const f = parseTriggerFlags(["--operation=foo"]);
  assert.match(f.error ?? "", /--operation inválido/);
});

test("flags.parse: --push-mode activa push", () => {
  const f = parseTriggerFlags(["--push-mode"]);
  assert.equal(f.pushMode, true);
});

test("flags.parse: --dry-run activa dryRun", () => {
  const f = parseTriggerFlags(["--dry-run"]);
  assert.equal(f.dryRun, true);
});

test("trigger.provision: --preflight-only con manifest válido + todos checks PASS → exit 0", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vp-test-"));
  try {
    const manifestPath = join(dir, "m.json");
    writeFileSync(manifestPath, JSON.stringify({
      v: 2,
      taskId: "T-cross",
      specRef: "SPEC-22",
      slug: "ok-corp",
      fqdn: "ok-corp.vector-ia.mx",
      repository: "frank-vcorp/ok-corp",
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
      database: { engine: "postgresql", name: "ok-db" },
      storage: { serviceType: "garage", name: "ok-garage" },
      envOverrides: {},
    }));
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
    const r = await runProvision({
      argv: [manifestPath, "--preflight-only"],
      env: {
        ...process.env,
        COOLIFY_READ_TOKEN: "read",
        COOLIFY_WRITE_TOKEN: "write",
        VECTORIA_SECRETS_FILE: secretsFile,
      },
      resolvers: {
        async serverInfo() {
          return { version: "v4.0.0-beta.19", isReachable: true, proxyStatus: "running" };
        },
        async dbStatus() { return "absent"; },
        async storageStatus() { return "absent"; },
        async dnsIp() { return "212.28.185.217"; },
        async gitRemoteSha() { return "abc1234567890"; },
        pnpmWorkspace() { return { exists: false }; },
      },
    });
    assert.equal(r.ok, true);
    assert.equal(r.exit, 0);
    assert.equal(r.stage, "preflight");
    assert.ok(r.preflight);
    assert.equal(r.preflight?.ok, true);
    assert.equal(r.preflight?.runtimeAdapter?.fallback, "legacy");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("trigger.provision: server unreachable → exit 2", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vp-test-"));
  try {
    const manifestPath = join(dir, "m.json");
    writeFileSync(manifestPath, JSON.stringify({
      v: 2,
      taskId: "T",
      specRef: "SPEC",
      slug: "x-corp-test",
      fqdn: "x-corp-test.vector-ia.mx",
      repository: "o/x",
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
        adapter: "legacy",
      },
      database: { engine: "postgresql", name: "d" },
      storage: { serviceType: "garage", name: "s" },
      envOverrides: {},
    }));
    const r = await runProvision({
      argv: [manifestPath, "--preflight-only"],
      env: {
        ...process.env,
        COOLIFY_READ_TOKEN: "read",
        COOLIFY_WRITE_TOKEN: "write",
      },
      resolvers: {
        async serverInfo() { return { version: "v4.0.0", isReachable: false }; },
        async dbStatus() { return "absent"; },
        async storageStatus() { return "absent"; },
        async dnsIp() { return "212.28.185.217"; },
        async gitRemoteSha() { return "abc1234567"; },
        pnpmWorkspace() { return { exists: false }; },
      },
    });
    assert.equal(r.ok, false);
    assert.equal(r.exit, 2);
    assert.match(r.reason ?? "", /server_unreachable/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("trigger.provision: coolify v3 unsupported → exit 4", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vp-test-"));
  try {
    const manifestPath = join(dir, "m.json");
    writeFileSync(manifestPath, JSON.stringify({
      v: 2,
      taskId: "T",
      specRef: "SPEC",
      slug: "x-corp-test",
      fqdn: "x-corp-test.vector-ia.mx",
      repository: "o/x",
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
        adapter: "legacy",
      },
      database: { engine: "postgresql", name: "d" },
      storage: { serviceType: "garage", name: "s" },
      envOverrides: {},
    }));
    const r = await runProvision({
      argv: [manifestPath, "--preflight-only"],
      env: { ...process.env, COOLIFY_READ_TOKEN: "r", COOLIFY_WRITE_TOKEN: "w" },
      resolvers: {
        async serverInfo() { return { version: "v3.0.0", isReachable: true }; },
        async dbStatus() { return "absent"; },
        async storageStatus() { return "absent"; },
        async dnsIp() { return "212.28.185.217"; },
        async gitRemoteSha() { return "abc1234567"; },
        pnpmWorkspace() { return { exists: false }; },
      },
    });
    assert.equal(r.ok, false);
    assert.equal(r.exit, 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("trigger.provision: manifest ausente → exit 3", async () => {
  const r = await runProvision({
    argv: ["/tmp/no-existe.json"],
    env: { ...process.env, COOLIFY_READ_TOKEN: "r", COOLIFY_WRITE_TOKEN: "w" },
  });
  assert.equal(r.ok, false);
  assert.equal(r.exit, 3);
});

test("trigger.provision: push-mode → stage='push'", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vp-test-"));
  try {
    const manifestPath = join(dir, "m.json");
    writeFileSync(manifestPath, JSON.stringify({
      v: 2,
      taskId: "T",
      specRef: "SPEC",
      slug: "x-corp-test",
      fqdn: "x-corp-test.vector-ia.mx",
      repository: "o/x",
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
      database: { engine: "postgresql", name: "d" },
      storage: { serviceType: "garage", name: "s" },
      envOverrides: {},
    }));
    const secretsFile = join(dir, "s.env");
    writeFileSync(
      secretsFile,
      "MASTER_KEY=m\nSESSION_SECRET=s\nAPP_BASE_URL=https://x\nNODE_ENV=p\nDATABASE_URL=p\nS3_ENDPOINT=p\nS3_BUCKET=p\nS3_ACCESS_KEY=p\nS3_SECRET_KEY=p\nVECTORIA_DIRECTOR_EMAIL=a@b.com\nVECTORIA_SUPERUSER_PASSWORD=p\n",
      { mode: 0o600 },
    );
    const r = await runProvision({
      argv: [manifestPath, "--push-mode"],
      env: { ...process.env, COOLIFY_READ_TOKEN: "r", COOLIFY_WRITE_TOKEN: "w", VECTORIA_SECRETS_FILE: secretsFile },
      resolvers: {
        async serverInfo() { return { version: "v4.0.0-beta.19", isReachable: true }; },
        async dbStatus() { return "absent"; },
        async storageStatus() { return "absent"; },
        async dnsIp() { return "212.28.185.217"; },
        async gitRemoteSha() { return "abc1234567"; },
        pnpmWorkspace() { return { exists: false }; },
      },
    });
    assert.equal(r.ok, true);
    assert.equal(r.stage, "push");
    assert.equal((r.output as { push_post_provisioning: { ensureDatabaseCalled: boolean } }).push_post_provisioning.ensureDatabaseCalled, false);
    assert.equal((r.output as { push_post_provisioning: { ensureStorageCalled: boolean } }).push_post_provisioning.ensureStorageCalled, false);
    assert.equal((r.output as { push_post_provisioning: { ensureApplicationCalled: boolean } }).push_post_provisioning.ensureApplicationCalled, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
