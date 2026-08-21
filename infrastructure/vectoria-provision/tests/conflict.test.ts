/**
 * AC-7 · adopción conflictiva.
 *
 * Verifica que un binding existente con atributos NO coincidentes
 * (repo, branch, buildPack, serverUuid, fqdn) produce `conflict` (no mutación).
 * Atributo no observable → `preflight_unknown` (fail-closed, no mutar).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runEnsure } from "../src/ensure.js";
import { commitBinding, loadRegistry } from "../src/registry.js";
import { setDnsResolver, resetDnsResolver, type DnsResolver } from "../src/client.js";
import type { Manifest, RunnerConfig } from "../src/schema.js";
import { DEFAULT_SERVER_UUID } from "../src/constants.js";
import { ProvisionError } from "../src/errors.js";

// Resolver por defecto en este archivo: siempre OK (los tests no tocan red real).
const okResolver: DnsResolver = async () => ({ ok: true, ip: "212.28.185.217" });

/**
 * Mock programable de `globalThis.fetch`. Las reglas se evalúan en orden; cada
 * una consume UNA llamada. Devuelve los calls observados.
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

/** Helper: ejecuta `fn` con el DNS resolver OK inyectado; limpia en finally. */
async function withOkDns<T>(fn: () => Promise<T>): Promise<T> {
  setDnsResolver(okResolver);
  try {
    return await fn();
  } finally {
    resetDnsResolver();
  }
}

const BASE_MANIFEST: Manifest = {
  v: 1,
  taskId: "IMPL-20260820-07",
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
    COOLIFY_TIMEOUT_MS: 5000,
    PROVISION_REGISTRY_PATH: registryPath,
    PROVISION_AUDIT_PATH: auditPath,
    PROVISION_PROFILE_PATH: "/nonexistent/organization-profile.json",
    PROVISION_WAIT_LOCK_MS: 0,
  };
}

function newTmp(): string {
  return mkdtempSync(join(tmpdir(), "vp-conflict-"));
}

test("AC-7: application binding con FQDN match pero repo distinto → conflict (sin mutación)", async () => {
  await withOkDns(async () => {
  const dir = newTmp();
  const registryPath = join(dir, "registry.jsonl");
  const auditPath = join(dir, "audit.jsonl");
  try {
    // Sembrar un binding de application con FQDN IGUAL pero attrs distintos
    commitBinding(registryPath, {
      ts: new Date().toISOString(),
      taskId: "IMPL-prev",
      slug: "sistema-vectoria",
      fqdn: BASE_MANIFEST.fqdn, // IGUAL
      resource: "application",
      uuid: "app-uuid-1",
      serverUuid: DEFAULT_SERVER_UUID,
      parentUuid: "proj-uuid-1",
      attrs: {
        repo: "Frank-vcorp/otro-repo", // ← DIFERENTE
        branch: "main",
        buildPack: "nixpacks",
        portsExposes: "3000",
        appVariant: "public",
      },
      source: "coolify-response",
    });
    // Necesitamos también un environment binding (ensure_application exige parent)
    commitBinding(registryPath, {
      ts: new Date().toISOString(),
      taskId: "IMPL-prev",
      slug: "sistema-vectoria",
      resource: "environment",
      uuid: "env-uuid-1",
      serverUuid: DEFAULT_SERVER_UUID,
      parentUuid: "proj-uuid-1",
      attrs: { name: "production" },
      source: "coolify-response",
    });
    // Y un project binding
    commitBinding(registryPath, {
      ts: new Date().toISOString(),
      taskId: "IMPL-prev",
      slug: "sistema-vectoria",
      resource: "project",
      uuid: "proj-uuid-1",
      serverUuid: DEFAULT_SERVER_UUID,
      parentUuid: null,
      attrs: { name: "sistema-vectoria" },
      source: "coolify-response",
    });

    const registry = await loadRegistry(registryPath);
    const cfg = newCfg(registryPath, auditPath);
    try {
      await runEnsure({
        operation: "ensure_application",
        manifest: BASE_MANIFEST,
        destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
        cfg,
        registry,
        profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
      });
      assert.fail("debe lanzar conflict");
    } catch (e: unknown) {
      assert.ok(e instanceof ProvisionError);
      if (e instanceof ProvisionError) {
        assert.equal(e.code, "conflict");
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  });
});

test("AC-7: application binding con repo distinto → conflict", async () => {
  await withOkDns(async () => {
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
      attrs: {
        repo: "Frank-vcorp/otro-repo",
        branch: "main",
        buildPack: "nixpacks",
        portsExposes: "3000",
        appVariant: "public",
      },
      source: "coolify-response",
    });
    commitBinding(registryPath, {
      ts: new Date().toISOString(),
      taskId: "IMPL-prev",
      slug: "sistema-vectoria",
      resource: "environment",
      uuid: "env-uuid-1",
      serverUuid: DEFAULT_SERVER_UUID,
      parentUuid: "proj-uuid-1",
      attrs: { name: "production" },
      source: "coolify-response",
    });
    commitBinding(registryPath, {
      ts: new Date().toISOString(),
      taskId: "IMPL-prev",
      slug: "sistema-vectoria",
      resource: "project",
      uuid: "proj-uuid-1",
      serverUuid: DEFAULT_SERVER_UUID,
      parentUuid: null,
      attrs: { name: "sistema-vectoria" },
      source: "coolify-response",
    });

    const registry = await loadRegistry(registryPath);
    const cfg = newCfg(registryPath, auditPath);
    try {
      await runEnsure({
        operation: "ensure_application",
        manifest: BASE_MANIFEST,
        destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
        cfg,
        registry,
        profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
      });
      assert.fail("debe lanzar conflict");
    } catch (e: unknown) {
      assert.ok(e instanceof ProvisionError);
      if (e instanceof ProvisionError) {
        assert.equal(e.code, "conflict");
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  });
});

test("AC-7: application binding con branch distinto → conflict", async () => {
  await withOkDns(async () => {
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
      attrs: {
        repo: BASE_MANIFEST.repository,
        branch: "develop", // distinto
        buildPack: "nixpacks",
        portsExposes: "3000",
        appVariant: "public",
      },
      source: "coolify-response",
    });
    commitBinding(registryPath, {
      ts: new Date().toISOString(),
      taskId: "IMPL-prev",
      slug: "sistema-vectoria",
      resource: "environment",
      uuid: "env-uuid-1",
      serverUuid: DEFAULT_SERVER_UUID,
      parentUuid: "proj-uuid-1",
      attrs: { name: "production" },
      source: "coolify-response",
    });
    commitBinding(registryPath, {
      ts: new Date().toISOString(),
      taskId: "IMPL-prev",
      slug: "sistema-vectoria",
      resource: "project",
      uuid: "proj-uuid-1",
      serverUuid: DEFAULT_SERVER_UUID,
      parentUuid: null,
      attrs: { name: "sistema-vectoria" },
      source: "coolify-response",
    });

    const registry = await loadRegistry(registryPath);
    const cfg = newCfg(registryPath, auditPath);
    try {
      await runEnsure({
        operation: "ensure_application",
        manifest: BASE_MANIFEST,
        destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
        cfg,
        registry,
        profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
      });
      assert.fail("debe lanzar conflict");
    } catch (e: unknown) {
      assert.ok(e instanceof ProvisionError);
      if (e instanceof ProvisionError) {
        assert.equal(e.code, "conflict");
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  });
});

test("AC-7: application binding con serverUuid distinto → conflict (sin mutación)", async () => {
  await withOkDns(async () => {
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
      serverUuid: "OTHER-SERVER-UUID",
      parentUuid: "proj-uuid-1",
      attrs: {
        repo: BASE_MANIFEST.repository,
        branch: "main",
        buildPack: "nixpacks",
        portsExposes: "3000",
        appVariant: "public",
      },
      source: "coolify-response",
    });
    commitBinding(registryPath, {
      ts: new Date().toISOString(),
      taskId: "IMPL-prev",
      slug: "sistema-vectoria",
      resource: "environment",
      uuid: "env-uuid-1",
      serverUuid: DEFAULT_SERVER_UUID,
      parentUuid: "proj-uuid-1",
      attrs: { name: "production" },
      source: "coolify-response",
    });
    commitBinding(registryPath, {
      ts: new Date().toISOString(),
      taskId: "IMPL-prev",
      slug: "sistema-vectoria",
      resource: "project",
      uuid: "proj-uuid-1",
      serverUuid: DEFAULT_SERVER_UUID,
      parentUuid: null,
      attrs: { name: "sistema-vectoria" },
      source: "coolify-response",
    });

    const registry = await loadRegistry(registryPath);
    const cfg = newCfg(registryPath, auditPath);
    try {
      await runEnsure({
        operation: "ensure_application",
        manifest: BASE_MANIFEST,
        destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
        cfg,
        registry,
        profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
      });
      assert.fail("debe lanzar conflict");
    } catch (e: unknown) {
      assert.ok(e instanceof ProvisionError);
      if (e instanceof ProvisionError) {
        assert.equal(e.code, "conflict");
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  });
});

test("AC-7: project binding con serverUuid distinto → conflict", async () => {
  const dir = newTmp();
  const registryPath = join(dir, "registry.jsonl");
  const auditPath = join(dir, "audit.jsonl");
  try {
    commitBinding(registryPath, {
      ts: new Date().toISOString(),
      taskId: "IMPL-prev",
      slug: "sistema-vectoria",
      resource: "project",
      uuid: "proj-uuid-1",
      serverUuid: "OTHER-SERVER-UUID",
      parentUuid: null,
      attrs: { name: "sistema-vectoria" },
      source: "coolify-response",
    });

    const registry = await loadRegistry(registryPath);
    const cfg = newCfg(registryPath, auditPath);
    try {
      await runEnsure({
        operation: "ensure_project",
        manifest: BASE_MANIFEST,
        destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
        cfg,
        registry,
        profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
      });
      assert.fail("debe lanzar conflict");
    } catch (e: unknown) {
      assert.ok(e instanceof ProvisionError);
      if (e instanceof ProvisionError) {
        assert.equal(e.code, "conflict");
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-7: 0 mutaciones: el registry no se modifica cuando hay conflict", async () => {
  const dir = newTmp();
  const registryPath = join(dir, "registry.jsonl");
  const auditPath = join(dir, "audit.jsonl");
  try {
    commitBinding(registryPath, {
      ts: new Date().toISOString(),
      taskId: "IMPL-prev",
      slug: "sistema-vectoria",
      resource: "project",
      uuid: "proj-uuid-1",
      serverUuid: "OTHER-SERVER-UUID",
      parentUuid: null,
      attrs: { name: "sistema-vectoria" },
      source: "coolify-response",
    });
    const beforeRegistry = (await loadRegistry(registryPath)).length;

    const registry = await loadRegistry(registryPath);
    const cfg = newCfg(registryPath, auditPath);
    try {
      await runEnsure({
        operation: "ensure_project",
        manifest: BASE_MANIFEST,
        destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
        cfg,
        registry,
        profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
      });
    } catch {
      // esperado: conflict
    }
    const afterRegistry = (await loadRegistry(registryPath)).length;
    assert.equal(afterRegistry, beforeRegistry, "registry NO se mutó en conflict");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── F-2 · adopción debe comparar buildPack / portsExposes / appVariant ──
//
// El manifest exige esos tres atributos como gate de adopción de application
// (SPEC §11 + AC-7). El binding existente debe contenerlos en `attrs` y ser
// idénticos al manifest. Discrepancia → `conflict` sin mutación.

test("AC-7 / F-2: application binding con buildPack distinto → conflict (sin mutación)", async () => {
  await withOkDns(async () => {
    const dir = newTmp();
    const registryPath = join(dir, "registry.jsonl");
    const auditPath = join(dir, "audit.jsonl");
    try {
      commitBinding(registryPath, {
        ts: new Date().toISOString(),
        taskId: "IMPL-prev",
        slug: BASE_MANIFEST.slug,
        fqdn: BASE_MANIFEST.fqdn,
        resource: "application",
        uuid: "app-uuid-1",
        serverUuid: DEFAULT_SERVER_UUID,
        parentUuid: "proj-uuid-1",
        attrs: {
          repo: BASE_MANIFEST.repository,
          branch: BASE_MANIFEST.branch,
          buildPack: "dockerfile", // ← DIFERENTE
          portsExposes: "3000",
          appVariant: "public",
        },
        source: "coolify-response",
      });
      commitBinding(registryPath, {
        ts: new Date().toISOString(),
        taskId: "IMPL-prev",
        slug: BASE_MANIFEST.slug,
        resource: "environment",
        uuid: "env-uuid-1",
        serverUuid: DEFAULT_SERVER_UUID,
        parentUuid: "proj-uuid-1",
        attrs: { name: "production" },
        source: "coolify-response",
      });
      commitBinding(registryPath, {
        ts: new Date().toISOString(),
        taskId: "IMPL-prev",
        slug: BASE_MANIFEST.slug,
        resource: "project",
        uuid: "proj-uuid-1",
        serverUuid: DEFAULT_SERVER_UUID,
        parentUuid: null,
        attrs: { name: BASE_MANIFEST.slug },
        source: "coolify-response",
      });

      const registry = await loadRegistry(registryPath);
      const cfg = newCfg(registryPath, auditPath);
      try {
        await runEnsure({
          operation: "ensure_application",
          manifest: BASE_MANIFEST,
          destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
          cfg,
          registry,
          profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
        });
        assert.fail("debe lanzar conflict");
      } catch (e: unknown) {
        assert.ok(e instanceof ProvisionError);
        if (e instanceof ProvisionError) {
          assert.equal(e.code, "conflict");
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test("AC-7 / F-2: application binding con portsExposes distinto → conflict (sin mutación)", async () => {
  await withOkDns(async () => {
    const dir = newTmp();
    const registryPath = join(dir, "registry.jsonl");
    const auditPath = join(dir, "audit.jsonl");
    try {
      commitBinding(registryPath, {
        ts: new Date().toISOString(),
        taskId: "IMPL-prev",
        slug: BASE_MANIFEST.slug,
        fqdn: BASE_MANIFEST.fqdn,
        resource: "application",
        uuid: "app-uuid-1",
        serverUuid: DEFAULT_SERVER_UUID,
        parentUuid: "proj-uuid-1",
        attrs: {
          repo: BASE_MANIFEST.repository,
          branch: BASE_MANIFEST.branch,
          buildPack: "nixpacks",
          portsExposes: "8080", // ← DIFERENTE
          appVariant: "public",
        },
        source: "coolify-response",
      });
      commitBinding(registryPath, {
        ts: new Date().toISOString(),
        taskId: "IMPL-prev",
        slug: BASE_MANIFEST.slug,
        resource: "environment",
        uuid: "env-uuid-1",
        serverUuid: DEFAULT_SERVER_UUID,
        parentUuid: "proj-uuid-1",
        attrs: { name: "production" },
        source: "coolify-response",
      });
      commitBinding(registryPath, {
        ts: new Date().toISOString(),
        taskId: "IMPL-prev",
        slug: BASE_MANIFEST.slug,
        resource: "project",
        uuid: "proj-uuid-1",
        serverUuid: DEFAULT_SERVER_UUID,
        parentUuid: null,
        attrs: { name: BASE_MANIFEST.slug },
        source: "coolify-response",
      });

      const registry = await loadRegistry(registryPath);
      const cfg = newCfg(registryPath, auditPath);
      try {
        await runEnsure({
          operation: "ensure_application",
          manifest: BASE_MANIFEST,
          destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
          cfg,
          registry,
          profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
        });
        assert.fail("debe lanzar conflict");
      } catch (e: unknown) {
        assert.ok(e instanceof ProvisionError);
        if (e instanceof ProvisionError) {
          assert.equal(e.code, "conflict");
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test("AC-7 / F-2: application binding con appVariant distinto → conflict (sin mutación)", async () => {
  await withOkDns(async () => {
    const dir = newTmp();
    const registryPath = join(dir, "registry.jsonl");
    const auditPath = join(dir, "audit.jsonl");
    try {
      commitBinding(registryPath, {
        ts: new Date().toISOString(),
        taskId: "IMPL-prev",
        slug: BASE_MANIFEST.slug,
        fqdn: BASE_MANIFEST.fqdn,
        resource: "application",
        uuid: "app-uuid-1",
        serverUuid: DEFAULT_SERVER_UUID,
        parentUuid: "proj-uuid-1",
        attrs: {
          repo: BASE_MANIFEST.repository,
          branch: BASE_MANIFEST.branch,
          buildPack: "nixpacks",
          portsExposes: "3000",
          appVariant: "private-github-app", // ← DIFERENTE
        },
        source: "coolify-response",
      });
      commitBinding(registryPath, {
        ts: new Date().toISOString(),
        taskId: "IMPL-prev",
        slug: BASE_MANIFEST.slug,
        resource: "environment",
        uuid: "env-uuid-1",
        serverUuid: DEFAULT_SERVER_UUID,
        parentUuid: "proj-uuid-1",
        attrs: { name: "production" },
        source: "coolify-response",
      });
      commitBinding(registryPath, {
        ts: new Date().toISOString(),
        taskId: "IMPL-prev",
        slug: BASE_MANIFEST.slug,
        resource: "project",
        uuid: "proj-uuid-1",
        serverUuid: DEFAULT_SERVER_UUID,
        parentUuid: null,
        attrs: { name: BASE_MANIFEST.slug },
        source: "coolify-response",
      });

      const registry = await loadRegistry(registryPath);
      const cfg = newCfg(registryPath, auditPath);
      try {
        await runEnsure({
          operation: "ensure_application",
          manifest: BASE_MANIFEST,
          destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
          cfg,
          registry,
          profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
        });
        assert.fail("debe lanzar conflict");
      } catch (e: unknown) {
        assert.ok(e instanceof ProvisionError);
        if (e instanceof ProvisionError) {
          assert.equal(e.code, "conflict");
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── N-1 · GET-adopt · rama HTTP read-only (no registry binding) ──────────
//
// Estos tests cubren la rama GET-adopt de `ensure_application` (ruta que NO es
// la registry-binding de los tests F-2 existentes): la app existe en Coolify
// pero NO hay binding en el registry local. El runner hace GET /applications
// (read-only), extrae atributos OBSERVADOS y compara contra el manifest.
// Discrepancia → `conflict` (no commit). Atributo exigible no observable
// → `preflight_unknown` (fail-closed, no commit). Ambas deben abortar sin
// POST/PATCH ni `commitBinding`.
//

test("N-1: GET-adopt con buildPack divergente → conflict (0 POST, registry intacto)", async () => {
  await withOkDns(async () => {
    const dir = newTmp();
    const registryPath = join(dir, "registry.jsonl");
    const auditPath = join(dir, "audit.jsonl");
    try {
      // Project + environment bindings (requisitos de ensure_application).
      // NO sembramos application binding: queremos forzar la ruta GET-adopt.
      commitBinding(registryPath, {
        ts: new Date().toISOString(),
        taskId: "IMPL-prev",
        slug: BASE_MANIFEST.slug,
        resource: "project",
        uuid: "proj-uuid-1",
        serverUuid: DEFAULT_SERVER_UUID,
        parentUuid: null,
        attrs: { name: BASE_MANIFEST.slug },
        source: "coolify-response",
      });
      commitBinding(registryPath, {
        ts: new Date().toISOString(),
        taskId: "IMPL-prev",
        slug: BASE_MANIFEST.slug,
        resource: "environment",
        uuid: "env-uuid-1",
        serverUuid: DEFAULT_SERVER_UUID,
        parentUuid: "proj-uuid-1",
        attrs: { name: "production" },
        source: "coolify-response",
      });

      const registry = await loadRegistry(registryPath);
      const cfg = newCfg(registryPath, auditPath);

      // Mock: GET /applications devuelve UNA app con FQDN match pero
      // `build_pack` DIVERGENTE ("dockerfile" vs manifest "nixpacks").
      const fetcher = scriptFetch([
        () =>
          new Response(
            JSON.stringify([
              {
                uuid: "app-uuid-existing",
                fqdn: BASE_MANIFEST.fqdn,
                git_repository: BASE_MANIFEST.repository,
                git_branch: BASE_MANIFEST.branch,
                build_pack: "dockerfile", // ← DIVERGENTE
                ports_exposes: "3000",
                appVariant: "public",
              },
            ]),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ]);

      try {
        let thrown: unknown = undefined;
        try {
          await runEnsure({
            operation: "ensure_application",
            manifest: BASE_MANIFEST,
            destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
            cfg,
            registry,
            profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
          });
        } catch (e: unknown) {
          thrown = e;
        }
        assert.ok(thrown instanceof ProvisionError, "debe lanzar ProvisionError");
        if (thrown instanceof ProvisionError) {
          assert.equal(thrown.code, "conflict");
        }
        // 0 POST y 0 PATCH: la rama GET-adopt es read-only.
        const posts = fetcher.calls.filter((c) => c.method === "POST");
        const patches = fetcher.calls.filter((c) => c.method === "PATCH");
        assert.equal(posts.length, 0, "0 POST en GET-adopt conflict");
        assert.equal(patches.length, 0, "0 PATCH en GET-adopt conflict");
        // Registry NO se muta: el binding application no se añadió.
        const afterRegistry = await loadRegistry(registryPath);
        const appBindings = afterRegistry.filter((e) => e.resource === "application");
        assert.equal(appBindings.length, 0, "registry sin application binding");
      } finally {
        fetcher.restore();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test("N-1: GET-adopt con appVariant ausente/no observable → preflight_unknown (0 POST, registry intacto)", async () => {
  await withOkDns(async () => {
    const dir = newTmp();
    const registryPath = join(dir, "registry.jsonl");
    const auditPath = join(dir, "audit.jsonl");
    try {
      // Project + environment bindings (requisitos de ensure_application).
      // NO sembramos application binding: queremos forzar la ruta GET-adopt.
      commitBinding(registryPath, {
        ts: new Date().toISOString(),
        taskId: "IMPL-prev",
        slug: BASE_MANIFEST.slug,
        resource: "project",
        uuid: "proj-uuid-1",
        serverUuid: DEFAULT_SERVER_UUID,
        parentUuid: null,
        attrs: { name: BASE_MANIFEST.slug },
        source: "coolify-response",
      });
      commitBinding(registryPath, {
        ts: new Date().toISOString(),
        taskId: "IMPL-prev",
        slug: BASE_MANIFEST.slug,
        resource: "environment",
        uuid: "env-uuid-1",
        serverUuid: DEFAULT_SERVER_UUID,
        parentUuid: "proj-uuid-1",
        attrs: { name: "production" },
        source: "coolify-response",
      });

      const registry = await loadRegistry(registryPath);
      const cfg = newCfg(registryPath, auditPath);

      // Mock: GET /applications devuelve UNA app con FQDN match PERO sin
      // `appVariant` (campo exigible por manifest, ausente en la respuesta).
      // Los demás atributos exigibles sí están presentes, así que el fail-closed
      // se dispara por `appVariant === undefined` (atributo exigible no observable).
      const fetcher = scriptFetch([
        () =>
          new Response(
            JSON.stringify([
              {
                uuid: "app-uuid-existing",
                fqdn: BASE_MANIFEST.fqdn,
                git_repository: BASE_MANIFEST.repository,
                git_branch: BASE_MANIFEST.branch,
                build_pack: "nixpacks",
                ports_exposes: "3000",
                // appVariant no incluido → fail-closed per SPEC §11
              },
            ]),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ]);

      try {
        let thrown: unknown = undefined;
        try {
          await runEnsure({
            operation: "ensure_application",
            manifest: BASE_MANIFEST,
            destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
            cfg,
            registry,
            profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
          });
        } catch (e: unknown) {
          thrown = e;
        }
        assert.ok(thrown instanceof ProvisionError, "debe lanzar ProvisionError");
        if (thrown instanceof ProvisionError) {
          assert.equal(thrown.code, "preflight_unknown");
        }
        // 0 POST y 0 PATCH: la rama GET-adopt es read-only y fail-closed.
        const posts = fetcher.calls.filter((c) => c.method === "POST");
        const patches = fetcher.calls.filter((c) => c.method === "PATCH");
        assert.equal(posts.length, 0, "0 POST en GET-adopt preflight_unknown");
        assert.equal(patches.length, 0, "0 PATCH en GET-adopt preflight_unknown");
        // Registry NO se muta: el binding application no se añadió.
        const afterRegistry = await loadRegistry(registryPath);
        const appBindings = afterRegistry.filter((e) => e.resource === "application");
        assert.equal(appBindings.length, 0, "registry sin application binding");
      } finally {
        fetcher.restore();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});