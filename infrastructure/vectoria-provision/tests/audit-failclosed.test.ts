/**
 * F-1 · AC-7-adjunto · audit fail-closed pre-mutación (SPEC §7 + §14).
 *
 * Si `PROVISION_AUDIT_PATH` no es escribible ANTES de cualquier POST/PATCH o
 * `commitBinding`, el runner debe abortar con `ProvisionError("audit_failed")`
 * SIN haber tocado la red ni el registry.
 *
 * Caso cubierto: directorio temporal con permisos 0o500 (lectura+ejecución sin
 * escritura). El probe de `isAuditWritable` no puede crear/appendear el archivo
 * de audit → la función retorna `false` → el runner lanza `audit_failed`.
 *
 * Aserciones:
 *   - Lanza `ProvisionError` con `code === "audit_failed"`.
 *   - 0 POST y 0 PATCH (sin tocar la red).
 *   - El registry NO se crea (la operación aborta antes de `commitBinding`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runEnsure } from "../src/ensure.js";
import { ProvisionError } from "../src/errors.js";
import type { Manifest, RunnerConfig } from "../src/schema.js";
import { DEFAULT_SERVER_UUID } from "../src/constants.js";

const MANIFEST: Manifest = {
  v: 1,
  taskId: "IMPL-20260820-06",
  specRef: "SPEC-20260820-003",
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

test("F-1: directorio de audit sin permiso de escritura → audit_failed (0 POST/PATCH, registry intacto)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vp-audit-failclosed-"));
  const auditDir = join(dir, "audit-dir");
  // Crear el directorio y dejarlo SIN permiso de escritura (0o500 = r-x).
  // `isAuditWritable` no podrá crear el archivo ni hacer probe de append → false.
  const { mkdirSync } = await import("node:fs");
  mkdirSync(auditDir, { recursive: true });
  chmodSync(auditDir, 0o500);

  const auditPath = join(auditDir, "audit.jsonl");
  const registryPath = join(dir, "registry.jsonl");

  const fetcher = scriptFetch([
    // Regla comodín: si llegara alguna llamada a fetch (no debería), devolvemos 200.
    () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
  ]);

  try {
    // Si el proceso no es root (que es el caso típico al ejecutar tests),
    // chmod 0o500 realmente bloquea la escritura. Si es root, el test falla
    // con un mensaje claro en lugar de un resultado silenciosamente verde.
    if (process.getuid?.() === 0) {
      assert.fail(
        "test F-1 audit-failclosed requiere ejecutar como no-root (root bypassa chmod); " +
          "ejecutar `pnpm test` sin sudo/root",
      );
    }

    const cfg = newCfg(registryPath, auditPath);
    let thrown: unknown = undefined;
    try {
      await runEnsure({
        operation: "ensure_project",
        manifest: MANIFEST,
        destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
        cfg,
        registry: [],
        profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
      });
    } catch (e: unknown) {
      thrown = e;
    }
    assert.ok(thrown instanceof ProvisionError, "debe lanzar ProvisionError");
    if (thrown instanceof ProvisionError) {
      assert.equal(thrown.code, "audit_failed");
    }
    // 0 POST, 0 PATCH: el gate aborta antes de cualquier llamada Coolify.
    const posts = fetcher.calls.filter((c) => c.method === "POST");
    const patches = fetcher.calls.filter((c) => c.method === "PATCH");
    assert.equal(posts.length, 0, "0 POST antes del fail-closed");
    assert.equal(patches.length, 0, "0 PATCH antes del fail-closed");
    // Registry NO se crea (commitBinding nunca se invoca).
    assert.equal(existsSync(registryPath), false, "registry no se crea en fail-closed");
  } finally {
    fetcher.restore();
    // Restaurar permisos para que el cleanup funcione en cualquier fs.
    try {
      chmodSync(auditDir, 0o700);
    } catch {
      // ignore
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── N-2 · audit fail-closed para las 6 operaciones ensure_* ─────────────
//
// Parametrización del gate fail-closed real (F-1) sobre las 5 operaciones
// restantes: ensure_environment, ensure_application, ensure_database,
// ensure_storage, ensure_env. El comportamiento esperado es idéntico:
// audit_failed + 0 POST + 0 PATCH + registry intacto. Esto cierra N-2 de
// QA-20260820-06: garantiza que un refactor que omita `auditIntent` en
// cualquier rama queda detectado por el test suite.
//

const N2_OPERATIONS = [
  "ensure_environment",
  "ensure_application",
  "ensure_database",
  "ensure_storage",
  "ensure_env",
] as const;

for (const operation of N2_OPERATIONS) {
  test(`N-2: ${operation} con directorio de audit no escribible → audit_failed (0 POST/PATCH, registry intacto)`, async () => {
    const dir = mkdtempSync(join(tmpdir(), "vp-audit-failclosed-"));
    const auditDir = join(dir, "audit-dir");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(auditDir, { recursive: true });
    chmodSync(auditDir, 0o500);

    const auditPath = join(auditDir, "audit.jsonl");
    const registryPath = join(dir, "registry.jsonl");

    const fetcher = scriptFetch([
      // Regla comodín: si llegara alguna llamada a fetch (no debería), devolvemos 200.
      () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
    ]);

    try {
      if (process.getuid?.() === 0) {
        assert.fail(
          "test N-2 audit-failclosed requiere ejecutar como no-root (root bypassa chmod); " +
            "ejecutar `pnpm test` sin sudo/root",
        );
      }

      const cfg = newCfg(registryPath, auditPath);
      let thrown: unknown = undefined;
      try {
        await runEnsure({
          operation,
          manifest: MANIFEST,
          destination: { serverUuid: DEFAULT_SERVER_UUID, source: "default" },
          cfg,
          registry: [],
          profile: { directorEmail: "contacto@vector-ia.mx", orgName: "Vector IA" },
        });
      } catch (e: unknown) {
        thrown = e;
      }
      assert.ok(thrown instanceof ProvisionError, "debe lanzar ProvisionError");
      if (thrown instanceof ProvisionError) {
        assert.equal(thrown.code, "audit_failed");
      }
      // 0 POST, 0 PATCH: el gate aborta antes de cualquier llamada Coolify.
      const posts = fetcher.calls.filter((c) => c.method === "POST");
      const patches = fetcher.calls.filter((c) => c.method === "PATCH");
      assert.equal(posts.length, 0, `0 POST antes del fail-closed (${operation})`);
      assert.equal(patches.length, 0, `0 PATCH antes del fail-closed (${operation})`);
      // Registry NO se crea (commitBinding nunca se invoca).
      assert.equal(existsSync(registryPath), false, `registry no se crea en fail-closed (${operation})`);
    } finally {
      fetcher.restore();
      try {
        chmodSync(auditDir, 0o700);
      } catch {
        // ignore
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
