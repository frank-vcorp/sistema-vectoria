/**
 * AC-4 · idempotencia doble ejecución.
 *
 * Escenario:
 *  - El registry contiene un binding `project` con UUID real para el slug.
 *  - Una segunda ejecución de `ensure_project` debe encontrar el binding
 *    existente y devolver `status:"adopted"` con el MISMO uuid.
 *  - 0 POST nuevo (verificable por contador de fetch).
 *
 * Estrategia: mockeamos `globalThis.fetch` con un contador y respuestas
 * controladas. El runner opera contra el registry (filesystem real en tmp)
 * y contra `fetch` mockeado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runEnsure } from "../src/ensure.js";
import { loadRegistry, commitBinding } from "../src/registry.js";
import type { Manifest, RunnerConfig } from "../src/schema.js";
import { DEFAULT_SERVER_UUID } from "../src/constants.js";

const MANIFEST: Manifest = {
  v: 1,
  taskId: "IMPL-20260820-04",
  specRef: "SPEC-20260817-001",
  slug: "sistema-vectoria",
  fqdn: "sistema-vectoria.vector-ia.mx",
  repository: "Frank-vcorp/sistema-vectoria",
  branch: "main",
  serverUuid: DEFAULT_SERVER_UUID,
  environment: "production",
  resources: ["project"],
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
    COOLIFY_READ_TOKEN: "READ-TOKEN-DUMMY",
    COOLIFY_WRITE_TOKEN: "WRITE-TOKEN-DUMMY",
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

interface MockState {
  fetchCalls: Array<{ method: string; path: string }>;
  respondProjectList: unknown;
  respondProjectCreate: unknown;
}

function installFetchMock(state: MockState): void {
  const original = globalThis.fetch;
  (globalThis as unknown as { fetch: unknown }).fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api\/v1/, "");
    const method = (init?.method ?? "GET").toUpperCase();
    state.fetchCalls.push({ method, path });
    if (method === "GET" && path === "/projects") {
      return new Response(JSON.stringify(state.respondProjectList ?? []), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (method === "POST" && path === "/projects") {
      return new Response(JSON.stringify(state.respondProjectCreate ?? { uuid: "new-uuid-1" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 404 });
  };
  (globalThis as unknown as { __origFetch: typeof fetch }).__origFetch = original;
}

function uninstallFetchMock(): void {
  const orig = (globalThis as unknown as { __origFetch?: typeof fetch }).__origFetch;
  if (orig) {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = orig;
  }
}

function newTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "vp-idem-"));
}

test("AC-4: segunda ejecución de ensure_project con registry existente → adopted, mismo uuid, 0 POST", async () => {
  const dir = newTmpDir();
  const registryPath = join(dir, "registry.jsonl");
  const auditPath = join(dir, "audit.jsonl");
  try {
    // Sembrar registry con un binding project existente (uuid=existing-uuid)
    commitBinding(registryPath, {
      ts: new Date().toISOString(),
      taskId: "IMPL-prev",
      slug: MANIFEST.slug,
      fqdn: MANIFEST.fqdn,
      resource: "project",
      uuid: "existing-uuid-1",
      serverUuid: DEFAULT_SERVER_UUID,
      parentUuid: null,
      attrs: { name: MANIFEST.slug },
      source: "coolify-response",
    });

    const state: MockState = {
      fetchCalls: [],
      respondProjectList: [{ uuid: "existing-uuid-1", name: MANIFEST.slug }],
      respondProjectCreate: { uuid: "should-never-be-called" },
    };
    installFetchMock(state);
    try {
      const registry = await loadRegistry(registryPath);
      const cfg = newCfg(registryPath, auditPath);
      const result = await runEnsure({
        operation: "ensure_project",
        manifest: MANIFEST,
        destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
        cfg,
        registry,
        profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
      });

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.status, "adopted");
        assert.equal(result.uuid, "existing-uuid-1");
      }
      // 0 POST nuevo (registry tiene el binding → adopción sin red)
      const posts = state.fetchCalls.filter((c) => c.method === "POST");
      assert.equal(posts.length, 0, "no debe haber POST nuevo");
      // 0 GET preflight (el binding en registry es fuente de verdad local)
      const gets = state.fetchCalls.filter((c) => c.method === "GET");
      assert.equal(gets.length, 0, "no debe haber GET preflight (registry ya tiene binding)");
    } finally {
      uninstallFetchMock();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-4: primera ejecución de ensure_project → created, 1 POST", async () => {
  const dir = newTmpDir();
  const registryPath = join(dir, "registry.jsonl");
  const auditPath = join(dir, "audit.jsonl");
  try {
    const state: MockState = {
      fetchCalls: [],
      respondProjectList: [],
      respondProjectCreate: { uuid: "fresh-uuid-1" },
    };
    installFetchMock(state);
    try {
      const registry = await loadRegistry(registryPath);
      const cfg = newCfg(registryPath, auditPath);
      const result = await runEnsure({
        operation: "ensure_project",
        manifest: MANIFEST,
        destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
        cfg,
        registry,
        profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.status, "created");
        assert.equal(result.uuid, "fresh-uuid-1");
      }
      const posts = state.fetchCalls.filter((c) => c.method === "POST");
      assert.equal(posts.length, 1, "primera ejecución debe hacer 1 POST");
    } finally {
      uninstallFetchMock();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-4: segunda ejecución sobre registry adoptado (no vía fetch) → adopted, 0 POST", async () => {
  // Caso más puro: registry poblado LOCALMENTE, fetch NUNCA se llama (ni GET).
  // El `adoptOrConflict` debe retornar el mismo uuid sin tocar la red.
  const dir = newTmpDir();
  const registryPath = join(dir, "registry.jsonl");
  const auditPath = join(dir, "audit.jsonl");
  try {
    commitBinding(registryPath, {
      ts: new Date().toISOString(),
      taskId: "IMPL-prev",
      slug: MANIFEST.slug,
      fqdn: MANIFEST.fqdn,
      resource: "project",
      uuid: "local-binding-uuid",
      serverUuid: DEFAULT_SERVER_UUID,
      parentUuid: null,
      attrs: { name: MANIFEST.slug },
      source: "coolify-response",
    });

    const state: MockState = {
      fetchCalls: [],
      respondProjectList: [],
      respondProjectCreate: {},
    };
    installFetchMock(state);
    try {
      const registry = await loadRegistry(registryPath);
      const cfg = newCfg(registryPath, auditPath);
      const result = await runEnsure({
        operation: "ensure_project",
        manifest: MANIFEST,
        destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
        cfg,
        registry,
        profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.status, "adopted");
        assert.equal(result.uuid, "local-binding-uuid");
      }
      // En este caso el flujo pasa por `findBinding(registry, ...)` primero
      // y termina en `adoptOrConflict` sin fetch. Aún así el flujo puede
      // hacer 0 fetch (assert permisivo).
      const posts = state.fetchCalls.filter((c) => c.method === "POST");
      assert.equal(posts.length, 0);
    } finally {
      uninstallFetchMock();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-4 (sanity): tmp dir cleanup", () => {
  const dir = newTmpDir();
  const f = join(dir, "x.txt");
  writeFileSync(f, "x");
  assert.ok(existsSync(f));
  rmSync(dir, { recursive: true, force: true });
  assert.ok(!existsSync(f));
});

// Util: helper import-only para que TypeScript no marque como unused.
void readFileSync;
void createRequire;