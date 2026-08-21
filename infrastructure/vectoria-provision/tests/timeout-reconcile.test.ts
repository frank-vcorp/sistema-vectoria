/**
 * AC-5 · timeout + reconcile.
 *
 * Verifica:
 *  - Mock GET que devuelve timeout (AbortError → "timeout") y mock POST
 *    subsiguiente que devuelve UUID: el runner RECONCILIA primero (segundo GET),
 *    NO repite POST ciegamente; si el segundo GET también falla → preflight_unknown.
 *  - Mock GET que devuelve 500 → reconcile; idem.
 *  - 0 POST duplicado en la rama reconcile-then-unknown.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runEnsure } from "../src/ensure.js";
import { loadRegistry } from "../src/registry.js";
import type { Manifest, RunnerConfig } from "../src/schema.js";
import { DEFAULT_SERVER_UUID } from "../src/constants.js";
import { ProvisionError } from "../src/errors.js";

const MANIFEST: Manifest = {
  v: 1,
  taskId: "IMPL-20260820-05",
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
    COOLIFY_READ_TOKEN: "READ-TOKEN",
    COOLIFY_WRITE_TOKEN: "WRITE-TOKEN",
    SECRET_DERIVATION_ROOT: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    COOLIFY_BASE_URL: "https://app.coolify.io",
    COOLIFY_API_PREFIX: "/api/v1",
    COOLIFY_TIMEOUT_MS: 50, // muy corto para forzar timeout
    PROVISION_REGISTRY_PATH: registryPath,
    PROVISION_AUDIT_PATH: auditPath,
    PROVISION_PROFILE_PATH: "/nonexistent/organization-profile.json",
    PROVISION_WAIT_LOCK_MS: 0,
  };
}

function newTmp(): string {
  return mkdtempSync(join(tmpdir(), "vp-timeout-"));
}

/**
 * Helper: mockea `globalThis.fetch` con un script programable. Las reglas se
 * evalúan en orden de invocación; cada regla consume UNA llamada.
 */
function scriptFetch(
  rules: Array<(args: { path: string; method: string }) => Promise<Response> | Response>,
): { calls: Array<{ method: string; path: string }>; restore: () => void } {
  const calls: Array<{ method: string; path: string }> = [];
  let idx = 0;
  const orig = globalThis.fetch;
  (globalThis as unknown as { fetch: unknown }).fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api\/v1/, "");
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, path });
    const rule = rules[idx] ?? rules[rules.length - 1] ?? (() => new Response("{}", { status: 404 }));
    idx++;
    return await rule({ path, method });
  };
  return {
    calls,
    restore: () => {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = orig;
    },
  };
}

test("AC-5: timeout en primer GET preflight → reconcile (segundo GET); 0 POST duplicado", async () => {
  const dir = newTmp();
  const registryPath = join(dir, "registry.jsonl");
  const auditPath = join(dir, "audit.jsonl");
  try {
    let getCount = 0;
    const fetcher = scriptFetch([
      // 1º: GET /projects → timeout (AbortError)
      async () => {
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      },
      // 2º: GET /projects reconcile → también timeout (desconocido)
      async () => {
        getCount++;
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      },
      // No debe llegar un POST.
    ]);
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
      // En el flujo actual: preflight timeout → entra en `reconcileLookup` →
      // segundo GET también timeout → `preflightUnknown` (failure shape).
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "preflight_unknown");
      }
      // 0 POST: las llamadas son sólo GETs.
      const posts = fetcher.calls.filter((c) => c.method === "POST");
      assert.equal(posts.length, 0, "0 POST duplicado tras timeout");
      assert.ok(getCount >= 1, "al menos 1 reconcile GET fue intentado");
    } finally {
      fetcher.restore();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-5: 500 en primer GET → reconcile; 0 POST hasta confirmar desconocido", async () => {
  const dir = newTmp();
  const registryPath = join(dir, "registry.jsonl");
  const auditPath = join(dir, "audit.jsonl");
  try {
    let postCalls = 0;
    const fetcher = scriptFetch([
      // 1º: GET /projects → 500
      () => new Response("{}", { status: 500, statusText: "Internal Server Error" }),
      // 2º: GET /projects reconcile → 500 también (sigue desconocido)
      () => new Response("{}", { status: 500, statusText: "Internal Server Error" }),
      // (no debe llegar un POST)
    ]);
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
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "preflight_unknown");
      }
      postCalls = fetcher.calls.filter((c) => c.method === "POST").length;
      assert.equal(postCalls, 0, "0 POST hasta confirmar desconocido");
    } finally {
      fetcher.restore();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-5: timeout en POST → reconcile (re-GET) sin repetir POST; preflight_unknown si reconcile también falla", async () => {
  const dir = newTmp();
  const registryPath = join(dir, "registry.jsonl");
  const auditPath = join(dir, "audit.jsonl");
  try {
    let postCount = 0;
    const fetcher = scriptFetch([
      // 1º: GET /projects preflight → lista vacía
      () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
      // 2º: POST /projects → timeout
      async () => {
        postCount++;
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      },
      // 3º: GET /projects reconcile (tras timeout POST) → timeout también
      async () => {
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      },
    ]);
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
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "preflight_unknown");
      }
      // 1 POST (el que falló por timeout) + 0 POST extra
      assert.equal(postCount, 1, "exactamente 1 POST antes del reconcile");
      const totalPosts = fetcher.calls.filter((c) => c.method === "POST").length;
      assert.equal(totalPosts, 1, "0 POST duplicado tras timeout");
    } finally {
      fetcher.restore();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-5: 409 en POST → reconcilia (re-GET) y adopta; 0 POST nuevo", async () => {
  const dir = newTmp();
  const registryPath = join(dir, "registry.jsonl");
  const auditPath = join(dir, "audit.jsonl");
  try {
    let postCount = 0;
    const fetcher = scriptFetch([
      // 1º: GET /projects preflight → [] (porque aún no estaba)
      () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
      // 2º: POST /projects → 409 (race condition)
      async () => {
        postCount++;
        return new Response("{}", { status: 409, statusText: "Conflict" });
      },
      // 3º: GET /projects reconcile → ahora SÍ está
      () =>
        new Response(JSON.stringify([{ uuid: "uuid-from-conflict", name: MANIFEST.slug }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ]);
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
        assert.equal(result.uuid, "uuid-from-conflict");
      }
      assert.equal(postCount, 1, "exactamente 1 POST antes del reconcile");
      const totalPosts = fetcher.calls.filter((c) => c.method === "POST").length;
      assert.equal(totalPosts, 1, "0 POST duplicado tras 409");
    } finally {
      fetcher.restore();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Verifica que 4xx terminal (no 409/408) NO se reconcilia: error terminal
test("AC-5: 404 en POST → upstream_40x terminal (sin reconcile)", async () => {
  const dir = newTmp();
  const registryPath = join(dir, "registry.jsonl");
  const auditPath = join(dir, "audit.jsonl");
  try {
    let postCount = 0;
    const fetcher = scriptFetch([
      // 1º: GET /projects preflight → []
      () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
      // 2º: POST /projects → 404 (terminal)
      () => {
        postCount++;
        return new Response("{}", { status: 404, statusText: "Not Found" });
      },
    ]);
    try {
      const registry = await loadRegistry(registryPath);
      const cfg = newCfg(registryPath, auditPath);
      try {
        await runEnsure({
          operation: "ensure_project",
          manifest: MANIFEST,
          destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
          cfg,
          registry,
          profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
        });
        assert.fail("debe haber lanzado ProvisionError");
      } catch (e: unknown) {
        assert.ok(e instanceof ProvisionError);
        if (e instanceof ProvisionError) {
          assert.equal(e.code, "upstream_40x");
        }
      }
      assert.equal(postCount, 1, "exactamente 1 POST (terminal sin reconcile)");
    } finally {
      fetcher.restore();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});