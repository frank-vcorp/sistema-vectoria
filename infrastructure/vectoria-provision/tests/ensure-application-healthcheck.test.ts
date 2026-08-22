/**
 * AC-R-12 / AC-R-13 / AC-R-14 · ensure_application POST body incluye
 * `start_command` + `health_check_*` cuando el manifest los declara;
 * NO los incluye si están ausentes (comportamiento v1.7).
 *
 * Verificación por introspección del `body` enviado al cliente HTTP (mock
 * del módulo `client.ts` mediante captura del segundo arg del `call`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setDnsResolver } from "../src/client.js";

function installDnsOk() {
  setDnsResolver(async (_fqdn: string, expectedIp: string) => {
    return { ok: true, ip: expectedIp };
  });
}

interface CapturedCall {
  verb: string;
  path: string;
  body?: unknown;
}

function installFetchCapture(state: { calls: CapturedCall[] }): { restore: () => void } {
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
    let body: unknown;
    if (init?.body && typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    state.calls.push({ verb: method, path, body });

    // GET /applications
    if (method === "GET" && path === "/applications") {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // GET /projects
    if (method === "GET" && path === "/projects") {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // GET /projects/{uuid}/environments
    if (method === "GET" && /^\/projects\/[^/]+\/environments$/.test(path)) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // POST /applications/public → 201
    if (method === "POST" && path === "/applications/public") {
      return new Response(JSON.stringify({ uuid: "app-uuid-1" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 404 });
  };
  return {
    restore: () => {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = orig;
    },
  };
}

function newTmp(): string {
  return mkdtempSync(join(tmpdir(), "vp-ea-hc-"));
}

test("AC-R-12: healthcheck declarado → POST incluye 7 campos health_check_*", async () => {
  installDnsOk();
  const dir = newTmp();
  try {
    const registryPath = join(dir, "registry.jsonl");
    const auditPath = join(dir, "audit.jsonl");
    // Sembrar project + environment bindings
    writeFileSync(
      registryPath,
      [
        JSON.stringify({
          ts: new Date().toISOString(),
          taskId: "IMPL-prev",
          slug: "acme-blog",
          fqdn: "blog.acme-corp.example",
          resource: "project",
          uuid: "proj-uuid-1",
          serverUuid: "OTHER-UUID",
          parentUuid: null,
          attrs: { name: "acme-blog", projectNamespace: "acme-corp:blog" },
          source: "coolify-response",
        }),
        JSON.stringify({
          ts: new Date().toISOString(),
          taskId: "IMPL-prev",
          slug: "acme-blog",
          fqdn: "blog.acme-corp.example",
          resource: "environment",
          uuid: "env-uuid-1",
          serverUuid: "OTHER-UUID",
          parentUuid: "proj-uuid-1",
          attrs: { name: "production", projectNamespace: "acme-corp:blog" },
          source: "coolify-response",
        }),
      ].join("\n") + "\n",
      { mode: 0o600 },
    );
    const { runEnsure } = await import("../src/ensure.js");
    const { loadRegistry } = await import("../src/registry.js");
    const state: { calls: CapturedCall[] } = { calls: [] };
    const fetcher = installFetchCapture(state);
    try {
      const registry = await loadRegistry(registryPath);
      const manifest = {
        v: 2,
        taskId: "IMPL-20260821-XX",
        specRef: "SPEC-20260821-001",
        project: { id: "blog", parent: "acme-corp" },
        slug: "acme-blog",
        fqdn: "blog.acme-corp.example",
        repository: "acme-corp/blog",
        branch: "main",
        serverUuid: "OTHER-UUID",
        environment: "production" as const,
        resources: ["project", "environment", "application"] as const,
        application: {
          appVariant: "public" as const,
          buildPack: "nixpacks" as const,
          portsExposes: "3000",
          githubAppUuid: null,
          privateKeyUuid: null,
          startCommand: "pnpm start",
          healthcheck: {
            enabled: true,
            path: "/api/health",
            method: "GET" as const,
            scheme: "http" as const,
            port: "3000",
            interval: 30,
            timeout: 5,
            retries: 3,
          },
        },
        database: { engine: "postgresql" as const, name: "blog-db" },
        storage: { serviceType: "garage" as const, name: "blog-storage" },
        envOverrides: {},
      };
      const cfg = {
        COOLIFY_READ_TOKEN: "READ",
        COOLIFY_WRITE_TOKEN: "WRITE",
        SECRET_DERIVATION_ROOT: "",
        COOLIFY_BASE_URL: "https://app.coolify.io",
        COOLIFY_API_PREFIX: "/api/v1",
        COOLIFY_TIMEOUT_MS: 5000,
        PROVISION_REGISTRY_PATH: registryPath,
        PROVISION_AUDIT_PATH: auditPath,
        PROVISION_PROFILE_PATH: "/nonexistent.json",
        PROVISION_WAIT_LOCK_MS: 0,
      };
      await runEnsure({
        operation: "ensure_application",
        manifest: manifest as unknown as Parameters<typeof runEnsure>[0]["manifest"],
        destination: { serverUuid: "OTHER-UUID", source: "override" },
        cfg,
        registry,
        profile: { directorEmail: "x@y", orgName: "X" },
      });
      const post = state.calls.find((c) => c.verb === "POST" && c.path === "/applications/public");
      assert.ok(post, "esperaba POST /applications/public");
      const body = post!.body as Record<string, unknown>;
      assert.equal(body["start_command"], "pnpm start");
      assert.equal(body["health_check_enabled"], true);
      assert.equal(body["health_check_path"], "/api/health");
      assert.equal(body["health_check_method"], "GET");
      assert.equal(body["health_check_scheme"], "http");
      assert.equal(body["health_check_port"], "3000");
      assert.equal(body["health_check_interval"], 30);
      assert.equal(body["health_check_timeout"], 5);
      assert.equal(body["health_check_retries"], 3);
    } finally {
      fetcher.restore();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-R-13 + AC-R-14: healthcheck AUSENTE → POST NO incluye health_check_*", async () => {
  installDnsOk();
  const dir = newTmp();
  try {
    const registryPath = join(dir, "registry.jsonl");
    const auditPath = join(dir, "audit.jsonl");
    writeFileSync(
      registryPath,
      [
        JSON.stringify({
          ts: new Date().toISOString(),
          taskId: "IMPL-prev",
          slug: "acme-blog",
          fqdn: "blog.acme-corp.example",
          resource: "project",
          uuid: "proj-uuid-1",
          serverUuid: "OTHER-UUID",
          parentUuid: null,
          attrs: { name: "acme-blog", projectNamespace: "acme-corp:blog" },
          source: "coolify-response",
        }),
        JSON.stringify({
          ts: new Date().toISOString(),
          taskId: "IMPL-prev",
          slug: "acme-blog",
          fqdn: "blog.acme-corp.example",
          resource: "environment",
          uuid: "env-uuid-1",
          serverUuid: "OTHER-UUID",
          parentUuid: "proj-uuid-1",
          attrs: { name: "production", projectNamespace: "acme-corp:blog" },
          source: "coolify-response",
        }),
      ].join("\n") + "\n",
      { mode: 0o600 },
    );
    const { runEnsure } = await import("../src/ensure.js");
    const { loadRegistry } = await import("../src/registry.js");
    const state: { calls: CapturedCall[] } = { calls: [] };
    const fetcher = installFetchCapture(state);
    try {
      const registry = await loadRegistry(registryPath);
      const manifest = {
        v: 2,
        taskId: "IMPL-20260821-XX",
        specRef: "SPEC-20260821-001",
        project: { id: "blog", parent: "acme-corp" },
        slug: "acme-blog",
        fqdn: "blog.acme-corp.example",
        repository: "acme-corp/blog",
        branch: "main",
        serverUuid: "OTHER-UUID",
        environment: "production" as const,
        resources: ["project", "environment", "application"] as const,
        application: {
          appVariant: "public" as const,
          buildPack: "nixpacks" as const,
          portsExposes: "3000",
          githubAppUuid: null,
          privateKeyUuid: null,
        },
        database: { engine: "postgresql" as const, name: "blog-db" },
        storage: { serviceType: "garage" as const, name: "blog-storage" },
        envOverrides: {},
      };
      const cfg = {
        COOLIFY_READ_TOKEN: "READ",
        COOLIFY_WRITE_TOKEN: "WRITE",
        SECRET_DERIVATION_ROOT: "",
        COOLIFY_BASE_URL: "https://app.coolify.io",
        COOLIFY_API_PREFIX: "/api/v1",
        COOLIFY_TIMEOUT_MS: 5000,
        PROVISION_REGISTRY_PATH: registryPath,
        PROVISION_AUDIT_PATH: auditPath,
        PROVISION_PROFILE_PATH: "/nonexistent.json",
        PROVISION_WAIT_LOCK_MS: 0,
      };
      await runEnsure({
        operation: "ensure_application",
        manifest: manifest as unknown as Parameters<typeof runEnsure>[0]["manifest"],
        destination: { serverUuid: "OTHER-UUID", source: "override" },
        cfg,
        registry,
        profile: { directorEmail: "x@y", orgName: "X" },
      });
      const post = state.calls.find((c) => c.verb === "POST" && c.path === "/applications/public");
      const body = post!.body as Record<string, unknown>;
      assert.ok(!("start_command" in body), "sin startCommand → NO debe aparecer");
      assert.ok(!("health_check_enabled" in body), "sin healthcheck → NO debe aparecer");
      assert.ok(!("health_check_path" in body), "sin healthcheck → NO debe aparecer");
    } finally {
      fetcher.restore();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});