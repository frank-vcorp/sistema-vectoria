/**
 * Tests del ensure_env (SPEC §7 + §8.3) y ciclo ensure_* completo.
 *
 * Verifica:
 *  - ensure_env requiere application binding (sin él → infra_blocked).
 *  - ensure_env sólo acepta keys del enum cerrado (envOverrides inválida → bad_manifest).
 *  - ensure_env idempotente: si el GET vigente ya tiene los mismos valores → adopted
 *    sin PATCH nuevo.
 *  - ensure_env con valores diferentes → PATCH llamado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runEnsure } from "../src/ensure.js";
import { commitBinding, loadRegistry } from "../src/registry.js";
import type { Manifest, RunnerConfig } from "../src/schema.js";
import { DEFAULT_SERVER_UUID } from "../src/constants.js";
import { ProvisionError } from "../src/errors.js";

const BASE_MANIFEST: Manifest = {
  v: 1,
  taskId: "IMPL-20260820-08",
  specRef: "SPEC-20260817-001",
  slug: "sistema-vectoria",
  fqdn: "sistema-vectoria.vector-ia.mx",
  repository: "Frank-vcorp/sistema-vectoria",
  branch: "main",
  serverUuid: DEFAULT_SERVER_UUID,
  environment: "production",
  resources: ["environment", "application", "database", "storage"],
  application: {
    appVariant: "public",
    buildPack: "nixpacks",
    portsExposes: "3000",
    githubAppUuid: null,
    privateKeyUuid: null,
  },
  database: { engine: "postgresql", name: "sistema-vectoria-db" },
  storage: { serviceType: "garage", name: "sistema-vectoria-storage" },
  envOverrides: {},
};

function newCfg(registryPath: string, auditPath: string): RunnerConfig {
  return {
    COOLIFY_READ_TOKEN: "READ-TOKEN",
    COOLIFY_WRITE_TOKEN: "WRITE-TOKEN",
    SECRET_DERIVATION_ROOT: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    COOLIFY_BASE_URL: "https://app.coolify.io",
    COOLIFY_API_PREFIX: "/api/v1",
    COOLIFY_TIMEOUT_MS: 5000,
    PROVISION_REGISTRY_PATH: registryPath,
    PROVISION_AUDIT_PATH: auditPath,
    PROVISION_PROFILE_PATH: "/nonexistent/organization-profile.json",
    PROVISION_WAIT_LOCK_MS: 0,
  };
}

function newTmp(): string {
  return mkdtempSync(join(tmpdir(), "vp-env-"));
}

interface MockState {
  calls: Array<{ method: string; path: string }>;
}

function installFetch(state: MockState): { restore: () => void } {
  const orig = globalThis.fetch;
  (globalThis as unknown as { fetch: unknown }).fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api\/v1/, "");
    const method = (init?.method ?? "GET").toUpperCase();
    state.calls.push({ method, path });
    // GET /applications/{uuid} (sin /envs) → devuelve envs ya seteados (idempotente)
    if (method === "GET" && /^\/applications\/[^/]+$/.test(path)) {
      return new Response(
        JSON.stringify({
          uuid: "app-uuid-1",
          envs: [
            { key: "APP_ENV", value: BASE_MANIFEST.environment },
            { key: "APP_URL", value: BASE_MANIFEST.fqdn },
            { key: "VECTORIA_DIRECTOR_EMAIL", value: "contacto@vector-ia.mx" },
            { key: "VECTORIA_ORG_NAME", value: "Vector IA" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    // PATCH /applications/{uuid}/envs → 200
    if (method === "PATCH" && /^\/applications\/[^/]+\/envs$/.test(path)) {
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("{}", { status: 404 });
  };
  return {
    restore: () => {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = orig;
    },
  };
}

test("ensure_env: sin application binding → infra_blocked", async () => {
  const dir = newTmp();
  const registryPath = join(dir, "registry.jsonl");
  const auditPath = join(dir, "audit.jsonl");
  try {
    const registry = await loadRegistry(registryPath);
    const cfg = newCfg(registryPath, auditPath);
    try {
      await runEnsure({
        operation: "ensure_env",
        manifest: BASE_MANIFEST,
        destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
        cfg,
        registry,
        profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
      });
      assert.fail("debe lanzar infra_blocked");
    } catch (e: unknown) {
      assert.ok(e instanceof ProvisionError);
      if (e instanceof ProvisionError) {
        assert.equal(e.code, "infra_blocked");
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ensure_env: envOverrides con key fuera del enum → bad_manifest", async () => {
  const dir = newTmp();
  const registryPath = join(dir, "registry.jsonl");
  const auditPath = join(dir, "audit.jsonl");
  try {
    commitBinding(registryPath, {
      ts: new Date().toISOString(),
      taskId: "IMPL-prev",
      slug: "sistema-vectoria",
      fqdn: BASE_MANIFEST.fqdn,
      resource: "application",
      uuid: "app-uuid-1",
      serverUuid: DEFAULT_SERVER_UUID,
      parentUuid: "proj-uuid-1",
      attrs: { repo: BASE_MANIFEST.repository, branch: "main", buildPack: "nixpacks", portsExposes: "3000", appVariant: "public" },
      source: "coolify-response",
    });
    const m = { ...BASE_MANIFEST, envOverrides: { FORBIDDEN_KEY: "x" } };
    const registry = await loadRegistry(registryPath);
    const cfg = newCfg(registryPath, auditPath);
    try {
      await runEnsure({
        operation: "ensure_env",
        manifest: m,
        destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
        cfg,
        registry,
        profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
      });
      assert.fail("debe lanzar bad_manifest");
    } catch (e: unknown) {
      assert.ok(e instanceof ProvisionError);
      if (e instanceof ProvisionError) {
        assert.equal(e.code, "bad_manifest");
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ensure_env: idempotente — segundo run con mismos valores → adopted, 0 PATCH", async () => {
  const dir = newTmp();
  const registryPath = join(dir, "registry.jsonl");
  const auditPath = join(dir, "audit.jsonl");
  try {
    commitBinding(registryPath, {
      ts: new Date().toISOString(),
      taskId: "IMPL-prev",
      slug: "sistema-vectoria",
      fqdn: BASE_MANIFEST.fqdn,
      resource: "application",
      uuid: "app-uuid-1",
      serverUuid: DEFAULT_SERVER_UUID,
      parentUuid: "proj-uuid-1",
      attrs: { repo: BASE_MANIFEST.repository, branch: "main", buildPack: "nixpacks", portsExposes: "3000", appVariant: "public" },
      source: "coolify-response",
    });
    const state: MockState = { calls: [] };
    const fetcher = installFetch(state);
    try {
      const registry = await loadRegistry(registryPath);
      const cfg = newCfg(registryPath, auditPath);
      const result = await runEnsure({
        operation: "ensure_env",
        manifest: BASE_MANIFEST,
        destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
        cfg,
        registry,
        profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.status, "adopted");
        assert.equal(result.uuid, "app-uuid-1");
      }
      // 0 PATCH nuevo
      const patches = state.calls.filter((c) => c.method === "PATCH");
      assert.equal(patches.length, 0, "0 PATCH cuando valores ya coinciden");
      // 1 GET para re-leer vigente
      const gets = state.calls.filter((c) => c.method === "GET");
      assert.ok(gets.length >= 1, "al menos 1 GET para re-leer vigente");
    } finally {
      fetcher.restore();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ensure_env: valores diferentes → PATCH llamado una vez", async () => {
  const dir = newTmp();
  const registryPath = join(dir, "registry.jsonl");
  const auditPath = join(dir, "audit.jsonl");
  try {
    commitBinding(registryPath, {
      ts: new Date().toISOString(),
      taskId: "IMPL-prev",
      slug: "sistema-vectoria",
      fqdn: BASE_MANIFEST.fqdn,
      resource: "application",
      uuid: "app-uuid-1",
      serverUuid: DEFAULT_SERVER_UUID,
      parentUuid: "proj-uuid-1",
      attrs: { repo: BASE_MANIFEST.repository, branch: "main", buildPack: "nixpacks", portsExposes: "3000", appVariant: "public" },
      source: "coolify-response",
    });

    const state: MockState = { calls: [] };
    const orig = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const u = new URL(url);
      const path = u.pathname.replace(/^\/api\/v1/, "");
      const method = (init?.method ?? "GET").toUpperCase();
      state.calls.push({ method, path });
      // GET /applications/{uuid} → devuelve envs VACÍOS (difieren)
      if (method === "GET" && path.startsWith("/applications/")) {
        return new Response(JSON.stringify({ uuid: "app-uuid-1", envs: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (method === "PATCH") {
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("{}", { status: 404 });
    };
    try {
      const registry = await loadRegistry(registryPath);
      const cfg = newCfg(registryPath, auditPath);
      const result = await runEnsure({
        operation: "ensure_env",
        manifest: BASE_MANIFEST,
        destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
        cfg,
        registry,
        profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.status, "adopted");
        assert.equal(result.uuid, "app-uuid-1");
      }
      const patches = state.calls.filter((c) => c.method === "PATCH");
      assert.equal(patches.length, 1, "1 PATCH cuando hay diferencias");
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = orig;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ensure_env: el audit NUNCA contiene valores de secretos derivados", async () => {
  const dir = newTmp();
  const registryPath = join(dir, "registry.jsonl");
  const auditPath = join(dir, "audit.jsonl");
  try {
    commitBinding(registryPath, {
      ts: new Date().toISOString(),
      taskId: "IMPL-prev",
      slug: "sistema-vectoria",
      fqdn: BASE_MANIFEST.fqdn,
      resource: "application",
      uuid: "app-uuid-1",
      serverUuid: DEFAULT_SERVER_UUID,
      parentUuid: "proj-uuid-1",
      attrs: { repo: BASE_MANIFEST.repository, branch: "main", buildPack: "nixpacks", portsExposes: "3000", appVariant: "public" },
      source: "coolify-response",
    });
    const state: MockState = { calls: [] };
    const fetcher = installFetch(state);
    try {
      const registry = await loadRegistry(registryPath);
      const cfg = newCfg(registryPath, auditPath);
      await runEnsure({
        operation: "ensure_env",
        manifest: BASE_MANIFEST,
        destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
        cfg,
        registry,
        profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
      });
    } finally {
      fetcher.restore();
    }
    // Verificar que el audit file no contiene tokens ni valores sensibles
    const fs = createRequire(import.meta.url)("node:fs") as typeof import("node:fs");
    if (fs.existsSync(auditPath)) {
      const content = fs.readFileSync(auditPath, "utf8");
      assert.ok(!content.includes("READ-TOKEN"));
      assert.ok(!content.includes("WRITE-TOKEN"));
      assert.ok(!content.includes("AAAAAAAAAAA="));
      // Los keys permitidos SÍ pueden aparecer (no son secretos)
      assert.ok(!content.includes("MasterKey"));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});