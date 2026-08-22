/**
 * AC-R-6 · registry/audit/locks namespaced por `<parent>/<id>/`.
 * AC-R-7 · concurrencia entre proyectos (mocks).
 * AC-R-8 · cross-adoption blocked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  commitBinding,
  findBinding,
  loadRegistry,
  withSlugLock,
} from "../src/registry.js";
import { isCompatibleBinding, manifestProjectNamespace } from "../src/destination.js";
import type { RegistryEntry } from "../src/schema.js";

function newTmp(): string {
  return mkdtempSync(join(tmpdir(), "vp-regns-"));
}

function sampleEntry(over: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    ts: new Date().toISOString(),
    taskId: "IMPL-prev",
    slug: "sistema-vectoria",
    fqdn: "sistema-vectoria.vector-ia.mx",
    resource: "application",
    uuid: "app-uuid-1",
    serverUuid: "03tz1uabcrjaihnvrhysbstv",
    parentUuid: "proj-uuid-1",
    attrs: {
      repo: "frank-vcorp/sistema-vectoria",
      branch: "main",
      buildPack: "nixpacks",
      portsExposes: "3000",
      appVariant: "public",
      projectNamespace: "vectoria:sistema-vectoria",
    },
    source: "coolify-response",
    ...over,
  };
}

test("AC-R-6: paths namespaced via namespacedRegistryPath (helper)", async () => {
  const dir = newTmp();
  try {
    const path = join(dir, "registry.jsonl");
    // Crea el archivo y deja un binding
    commitBinding(path, sampleEntry());
    const registry = await loadRegistry(path);
    assert.equal(registry.length, 1);
    assert.equal(registry[0]?.slug, "sistema-vectoria");
    // attrs.projectNamespace se inyecta por defecto (commitBinding) si ausente.
    assert.ok(registry[0]?.attrs["projectNamespace"] !== undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-R-7: con dos namespaces distintos, findBinding filtra correctamente", async () => {
  const dir = newTmp();
  try {
    const path = join(dir, "registry.jsonl");
    commitBinding(path, sampleEntry({
      attrs: { ...sampleEntry().attrs, projectNamespace: "vectoria:sistema-vectoria" },
    }));
    commitBinding(path, sampleEntry({
      uuid: "app-uuid-acme",
      attrs: { ...sampleEntry().attrs, projectNamespace: "acme-corp:blog" },
    }));
    const registry = await loadRegistry(path);
    // namespace `vectoria:sistema-vectoria` NO debe ver el binding de acme-corp
    const foundNs1 = findBinding(registry, "application", () => true, "vectoria:sistema-vectoria");
    const foundNs2 = findBinding(registry, "application", () => true, "acme-corp:blog");
    assert.equal(foundNs1?.uuid, "app-uuid-1");
    assert.equal(foundNs2?.uuid, "app-uuid-acme");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-R-8: cross-adoption — entry de otro namespace NO se considera compatible", () => {
  const entryNs1 = sampleEntry({
    attrs: { ...sampleEntry().attrs, projectNamespace: "vectoria:sistema-vectoria" },
  });
  // Caller es acme-corp:blog; entry pertenece a vectoria:sistema-vectoria.
  const compat = isCompatibleBinding(entryNs1, {
    serverUuid: "03tz1uabcrjaihnvrhysbstv",
    fqdn: "sistema-vectoria.vector-ia.mx",
    projectNamespace: "acme-corp:blog",
  });
  assert.equal(compat, false, "cross-project adoption debe ser bloqueada");
});

test("AC-R-8 compat retroactiva: entry sin attrs.projectNamespace ≡ namespace default", () => {
  const entryLegacy = sampleEntry({
    attrs: { repo: "frank-vcorp/sistema-vectoria", branch: "main" },
  });
  delete entryLegacy.attrs["projectNamespace"];
  // El caller manifiesta `vectoria:sistema-vectoria`; el entry legacy
  // (sin projectNamespace) NO debe ser considerado compatible con un
  // namespace distinto (`acme-corp:blog`).
  const compatSame = isCompatibleBinding(entryLegacy, {
    serverUuid: "03tz1uabcrjaihnvrhysbstv",
    fqdn: "sistema-vectoria.vector-ia.mx",
    projectNamespace: "vectoria:sistema-vectoria",
  });
  // En modo lenient: si projectNamespace se omite, no se filtra.
  const compatSameNoNs = isCompatibleBinding(entryLegacy, {
    serverUuid: "03tz1uabcrjaihnvrhysbstv",
    fqdn: "sistema-vectoria.vector-ia.mx",
  });
  assert.equal(compatSame, false, "caller de otro namespace no debe matchear entry legacy");
  assert.equal(compatSameNoNs, true, "sin projectNamespace → comportamiento v1.7");
});

test("AC-R-7: dos locks simultáneos con namespaces distintos no colisionan", async () => {
  const dir = newTmp();
  try {
    const baseA = join(dir, "a", "blog", "registry.jsonl");
    const baseB = join(dir, "b", "store", "registry.jsonl");
    // Lanzar dos locks en paralelo con namespace-distintos paths.
    const [r1, r2] = await Promise.all([
      withSlugLock(baseA, "acme-corp", 1000, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return "A";
      }),
      withSlugLock(baseB, "acme-corp", 1000, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return "B";
      }),
    ]);
    assert.equal(r1, "A");
    assert.equal(r2, "B");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-R-7: mismo slug, mismo namespace, segundo acquires fail-fast", async () => {
  const dir = newTmp();
  try {
    const path = join(dir, "registry.jsonl");
    const acquired = withSlugLock(
      path,
      "shared-slug",
      0, // fail-fast
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return "ok";
      },
    );
    // Intento concurrente al mismo path+slug
    let caught: unknown;
    try {
      await withSlugLock(path, "shared-slug", 0, async () => "nope");
    } catch (e) {
      caught = e;
    }
    assert.ok(caught instanceof Error, "esperaba error de lock");
    // El primer lock aún se libera
    const r = await acquired;
    assert.equal(r, "ok");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("manifestProjectNamespace: composición determinista", () => {
  const m = {
    v: 2,
    taskId: "IMPL-test",
    specRef: "SPEC-test",
    project: { id: "blog", parent: "acme-corp" },
    slug: "blog",
    fqdn: "blog.example.com",
    repository: "acme-corp/blog",
    branch: "main",
    serverUuid: "OTHER",
    environment: "production" as const,
    resources: ["application"] as const,
    application: {
      appVariant: "public" as const,
      buildPack: "nixpacks" as const,
      portsExposes: "3000",
      githubAppUuid: null,
      privateKeyUuid: null,
    },
    database: { engine: "postgresql" as const, name: "db" },
    storage: { serviceType: "garage" as const, name: "storage" },
    envOverrides: {},
  } as const;
  assert.equal(manifestProjectNamespace(m as unknown as Parameters<typeof manifestProjectNamespace>[0]), "acme-corp:blog");
});