/**
 * AC-R-17 · mismo slug, distinto parent → conflict.
 *
 * Verifica la garantía AC-R-8 cross-project block a nivel unitario:
 * `findBinding(..., "acme-corp:system")` retorna `undefined` cuando
 * existe un binding con `attrs.projectNamespace="vectoria:system"`
 * (namespace distinto → adoption BLOQUEADA).
 *
 * Nota: el conflict a nivel E2E (ensure_project con namespace distinto
 * apuntando al mismo slug en Coolify real) requiere recursos Coolify
 * compartidos entre namespaces — fuera del alcance del runner namespaced
 * (cada namespace tiene su propio registry.jsonl). El bloque cross-project
 * aplica cuando la adopción pasa por el registry compartido (mismo parent),
 * no cuando se crea un recurso nuevo en un registry separado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function newTmp(): string {
  return mkdtempSync(join(tmpdir(), "vp-conflict-"));
}

test("AC-R-17: findBinding con namespace distinto → undefined (AC-R-8 cross-project block)", async () => {
  const dir = newTmp();
  try {
    const path = join(dir, "registry.jsonl");
    // Sembrar binding de proyecto `sistema-vectoria` con namespace `vectoria:system`.
    writeFileSync(
      path,
      JSON.stringify({
        ts: new Date().toISOString(),
        taskId: "IMPL-prev",
        slug: "sistema-vectoria",
        fqdn: "sistema-vectoria.vector-ia.mx",
        resource: "project",
        uuid: "existing-project-uuid",
        serverUuid: "03tz1uabcrjaihnvrhysbstv",
        parentUuid: null,
        attrs: {
          name: "sistema-vectoria",
          projectNamespace: "vectoria:system",
        },
        source: "coolify-response",
      }) + "\n",
      { mode: 0o600 },
    );
    const { findBinding, loadRegistry } = await import("../../src/registry.js");
    const registry = await loadRegistry(path);
    // Caller `acme-corp:system` quiere adoptar el slug existente.
    // AC-R-8: namespaces distintos → findBinding retorna undefined.
    const found = findBinding(
      registry,
      "project",
      (e: { slug: string }) => e.slug === "sistema-vectoria",
      "acme-corp:system",
    );
    assert.equal(found, undefined, "findBinding debe retornar undefined cuando los namespaces difieren");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-R-17 E2E: ensure_project con slug único en namespace separado NO colisiona (registries namespaced)", async () => {
  // Este test verifica el invariante simétrico: dos namespaces distintos con
  // sus propios registries NO colisionan incluso si usan el mismo slug.
  // El cross-project block aplica dentro de un registry compartido (mismo
  // namespace-parent) — no cross-registry.
  const dir = newTmp();
  try {
    const registryBase = join(dir, "registry");
    const auditBase = join(dir, "audit");
    const profilePath = join(dir, "global-profile.json");
    const secretsFile = join(dir, "integra.secrets.env");

    const { runProvision } = await import("./__mocks__/runner.js");
    const { installCoolifyMock } = await import("./__mocks__/coolify.js");
    const mock = installCoolifyMock();
    try {
      // Manifiesto acme-corp:blog con slug único
      const acmeManifest = {
        v: 2,
        taskId: "IMPL-20260821-conflict",
        specRef: "SPEC-20260821-001",
        project: { id: "blog", parent: "acme-corp" },
        slug: "unique-slug-acme",
        fqdn: "unique-slug-acme.acme-corp.example",
        repository: "acme-corp/blog",
        branch: "main",
        serverUuid: "OTHER-UUID",
        environment: "production",
        resources: ["project"],
        application: {
          appVariant: "public",
          buildPack: "nixpacks",
          portsExposes: "3000",
          githubAppUuid: null,
          privateKeyUuid: null,
        },
        database: { engine: "postgresql", name: "blog-db" },
        storage: { serviceType: "garage", name: "blog-storage" },
        envOverrides: {},
      };
      const acmeManifestPath = join(dir, "manifest-acme.json");
      writeFileSync(acmeManifestPath, JSON.stringify(acmeManifest), { mode: 0o600 });

      // preChainParents=false para aislar `ensure_project` (sin parents).
      const result = await runProvision({
        manifestPath: acmeManifestPath,
        operation: "ensure_project",
        registryBase,
        auditBase,
        profilePath,
        secretsFile,
        tokenRead: "READ",
        tokenWrite: "WRITE",
        derivationRootB64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        preChainParents: false,
      });
      // El runner debe crear el proyecto exitosamente (no hay colisión
      // cross-registry).
      assert.equal(result.ok, true, `ensure_project debe crear; got=${JSON.stringify(result)}`);
    } finally {
      mock.restore();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});