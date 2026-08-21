/**
 * Tests del resolver de destino (SPEC §5):
 *   1) override explícito en el manifest
 *   2) binding existente en el registry
 *   3) servidor global Coolify `03tz1uabcrjaihnvrhysbstv`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveServerUuid, ensureDestination, isCompatibleBinding } from "../src/destination.js";
import { DEFAULT_SERVER_UUID } from "../src/constants.js";
import type { Manifest, RegistryEntry } from "../src/schema.js";

const BASE_MANIFEST: Manifest = {
  v: 1,
  taskId: "IMPL-X",
  specRef: "SPEC-X",
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

function entry(serverUuid: string, overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    ts: "2026-08-20T21:00:00.000Z",
    taskId: "IMPL-prev",
    slug: "sistema-vectoria",
    resource: "project",
    uuid: "uuid-1",
    serverUuid,
    parentUuid: null,
    attrs: { name: "sistema-vectoria" },
    source: "coolify-response",
    ...overrides,
  };
}

test("destino: registry vacío + manifest.serverUuid=default → devuelve default", () => {
  const resolved = resolveServerUuid(BASE_MANIFEST, []);
  assert.equal(resolved, DEFAULT_SERVER_UUID);
});

test("destino: manifest.serverUuid explícito ≠ default → override", () => {
  const m = { ...BASE_MANIFEST, serverUuid: "EXPLICIT-OVERRIDE-UUID" };
  const dest = ensureDestination(m, [], "ignored");
  assert.equal(dest.serverUuid, "EXPLICIT-OVERRIDE-UUID");
  assert.equal(dest.source, "override");
});

test("destino: registry contiene binding existente al default → source=binding", () => {
  const m = { ...BASE_MANIFEST, serverUuid: DEFAULT_SERVER_UUID };
  const dest = ensureDestination(m, [entry(DEFAULT_SERVER_UUID)], DEFAULT_SERVER_UUID);
  assert.equal(dest.serverUuid, DEFAULT_SERVER_UUID);
  assert.equal(dest.source, "binding");
});

test("destino: registry vacío + manifest.serverUuid=default → source=default", () => {
  const dest = ensureDestination(BASE_MANIFEST, [], DEFAULT_SERVER_UUID);
  assert.equal(dest.serverUuid, DEFAULT_SERVER_UUID);
  assert.equal(dest.source, "default");
});

test("destino: manifest.serverUuid=default + registry con binding en OTRO server → manifest gana, source=default", () => {
  // El manifest fija explícitamente DEFAULT_SERVER_UUID (no es un override
  // explícito distinto del default). El registry contiene un binding en
  // OTRO server. La precedencia §5 dice: override explícito → binding → default.
  // El manifest NO es un "override explícito distinto"; el registry tiene
  // un binding en otro server (no coincide con default). El resultado es
  // source=default (porque ningún binding coincide con el serverUuid pedido).
  // La adopción conflictiva se delega a ensure_* por atributo (AC-7).
  const m = { ...BASE_MANIFEST, serverUuid: DEFAULT_SERVER_UUID };
  const dest = ensureDestination(m, [entry("OTHER-UUID")], DEFAULT_SERVER_UUID);
  assert.equal(dest.serverUuid, DEFAULT_SERVER_UUID);
  assert.equal(dest.source, "default");
});

test("compatibilidad: serverUuid coincide + fqdn coincide → compatible", () => {
  const e = entry(DEFAULT_SERVER_UUID, { fqdn: BASE_MANIFEST.fqdn });
  assert.equal(
    isCompatibleBinding(e, { serverUuid: DEFAULT_SERVER_UUID, fqdn: BASE_MANIFEST.fqdn }),
    true,
  );
});

test("compatibilidad: fqdn distinto → incompatible", () => {
  const e = entry(DEFAULT_SERVER_UUID, { fqdn: "otro.vector-ia.mx" });
  assert.equal(
    isCompatibleBinding(e, { serverUuid: DEFAULT_SERVER_UUID, fqdn: BASE_MANIFEST.fqdn }),
    false,
  );
});

test("compatibilidad: serverUuid distinto → incompatible", () => {
  const e = entry("OTHER-UUID", { fqdn: BASE_MANIFEST.fqdn });
  assert.equal(
    isCompatibleBinding(e, { serverUuid: DEFAULT_SERVER_UUID, fqdn: BASE_MANIFEST.fqdn }),
    false,
  );
});

test("compatibilidad: repository distinto → incompatible", () => {
  const e = entry(DEFAULT_SERVER_UUID, {
    fqdn: BASE_MANIFEST.fqdn,
    attrs: { repo: "Frank-vcorp/otro", branch: "main" },
  });
  assert.equal(
    isCompatibleBinding(e, {
      serverUuid: DEFAULT_SERVER_UUID,
      fqdn: BASE_MANIFEST.fqdn,
      repository: BASE_MANIFEST.repository,
    }),
    false,
  );
});

test("compatibilidad: branch distinto → incompatible", () => {
  const e = entry(DEFAULT_SERVER_UUID, {
    fqdn: BASE_MANIFEST.fqdn,
    attrs: { repo: BASE_MANIFEST.repository, branch: "develop" },
  });
  assert.equal(
    isCompatibleBinding(e, {
      serverUuid: DEFAULT_SERVER_UUID,
      fqdn: BASE_MANIFEST.fqdn,
      repository: BASE_MANIFEST.repository,
      branch: BASE_MANIFEST.branch,
    }),
    false,
  );
});