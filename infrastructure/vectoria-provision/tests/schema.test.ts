/**
 * Tests de schema (manifest/registry/audit/errorCodes).
 *
 * Verifica:
 *  - ManifestSchema acepta el JSON canónico del SPEC §8.1.
 *  - ManifestSchema rechaza slug/fqdn inválidos.
 *  - ManifestSchema exige coherencia slug ↔ fqdn.
 *  - ManifestSchema exige coherencia githubAppUuid+privateKeyUuid.
 *  - RegistryEntrySchema valida los campos requeridos.
 *  - AuditEntrySchema valida result ∈ {created, adopted, failure, rejected}.
 *  - ERROR_CODES enum contiene todos los códigos de SPEC §8.4.
 *  - envOverrides sólo puede tocar keys del enum cerrado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ManifestSchema,
  RegistryEntrySchema,
  AuditEntrySchema,
  EnvTemplateKeys,
  RunnerConfigSchema,
} from "../src/schema.js";
import { ERROR_CODES } from "../src/errors.js";

const VALID_MANIFEST = {
  v: 1,
  taskId: "IMPL-20260820-XX",
  specRef: "SPEC-20260817-001",
  slug: "sistema-vectoria",
  fqdn: "sistema-vectoria.vector-ia.mx",
  repository: "Frank-vcorp/sistema-vectoria",
  branch: "main",
  serverUuid: "03tz1uabcrjaihnvrhysbstv",
  environment: "production",
  resources: ["project", "environment", "application", "database", "storage"],
  application: {
    appVariant: "private-github-app",
    buildPack: "nixpacks",
    portsExposes: "3000",
    githubAppUuid: null,
    privateKeyUuid: null,
  },
  database: { engine: "postgresql", name: "sistema-vectoria-db" },
  storage: { serviceType: "garage", name: "sistema-vectoria-storage" },
  envOverrides: {},
};

test("schema: manifest canónico del SPEC §8.1 pasa (v2.0: parse normaliza v1→v2)", () => {
  const m = ManifestSchema.parse(VALID_MANIFEST);
  // v2.0 schema normaliza manifests v1 a v2 estricto vía transform (AC-R-1).
  assert.equal(m.v, 2);
  assert.equal(m.slug, "sistema-vectoria");
});

test("schema: fqdn no coherente con slug → rechaza", () => {
  const bad = { ...VALID_MANIFEST, fqdn: "otro.vector-ia.mx" };
  assert.equal(ManifestSchema.safeParse(bad).success, false);
});

test("schema: githubAppUuid+privateKeyUuid inconsistentes → rechaza", () => {
  const bad = {
    ...VALID_MANIFEST,
    application: {
      ...VALID_MANIFEST.application,
      appVariant: "private-github-app" as const,
      githubAppUuid: "gh-uuid-1",
      privateKeyUuid: null,
    },
  };
  assert.equal(ManifestSchema.safeParse(bad).success, false);
});

test("schema: slug inválido (mayúsculas, espacios, --) → rechaza", () => {
  for (const slug of ["Bad-Slug", "ab", "a--b", "trailing-", "-leading"]) {
    const m = { ...VALID_MANIFEST, slug, fqdn: `${slug}.vector-ia.mx` };
    const res = ManifestSchema.safeParse(m);
    assert.equal(res.success, false, `slug=${slug} debería fallar`);
  }
});

test("schema: resources enum cerrado — fuera → rechaza", () => {
  const bad = { ...VALID_MANIFEST, resources: ["project", "deploy"] };
  assert.equal(ManifestSchema.safeParse(bad).success, false);
});

test("schema: appVariant enum cerrado", () => {
  const bad = {
    ...VALID_MANIFEST,
    application: { ...VALID_MANIFEST.application, appVariant: "private-other" },
  };
  assert.equal(ManifestSchema.safeParse(bad).success, false);
});

test("schema: buildPack enum cerrado", () => {
  const bad = {
    ...VALID_MANIFEST,
    application: { ...VALID_MANIFEST.application, buildPack: "nixpacks-alt" },
  };
  assert.equal(ManifestSchema.safeParse(bad).success, false);
});

test("schema: database.engine enum cerrado", () => {
  const bad = { ...VALID_MANIFEST, database: { engine: "mysql", name: "db" } };
  assert.equal(ManifestSchema.safeParse(bad).success, false);
});

test("schema: storage.serviceType enum cerrado", () => {
  const bad = { ...VALID_MANIFEST, storage: { serviceType: "minio", name: "st" } };
  assert.equal(ManifestSchema.safeParse(bad).success, false);
});

test("schema: environment enum cerrado", () => {
  const bad = { ...VALID_MANIFEST, environment: "qa" };
  assert.equal(ManifestSchema.safeParse(bad).success, false);
});

test("schema: RegistryEntry requiere uuid, slug, serverUuid, parentUuid, source", () => {
  const good = {
    ts: "2026-08-20T21:00:00.000Z",
    taskId: "IMPL-X",
    slug: "sistema-vectoria",
    resource: "project" as const,
    uuid: "abc-123",
    serverUuid: "03tz1uabcrjaihnvrhysbstv",
    parentUuid: null,
    attrs: { name: "sistema-vectoria" },
    source: "coolify-response" as const,
  };
  const parsed = RegistryEntrySchema.parse(good);
  assert.equal(parsed.uuid, "abc-123");
  // source fuera del enum → rechaza
  assert.equal(
    RegistryEntrySchema.safeParse({ ...good, source: "invented" }).success,
    false,
  );
});

test("schema: AuditEntry result ∈ {created, adopted, failure, rejected}", () => {
  for (const result of ["created", "adopted", "failure", "rejected"]) {
    const e = {
      ts: "2026-08-20T21:00:00.000Z",
      taskId: "IMPL-X",
      slug: "sistema-vectoria",
      op: "ensure_project",
      result,
    };
    assert.equal(AuditEntrySchema.safeParse(e).success, true);
  }
  assert.equal(
    AuditEntrySchema.safeParse({
      ts: "2026-08-20T21:00:00.000Z",
      taskId: "IMPL-X",
      slug: "sistema-vectoria",
      op: "ensure_project",
      result: "unknown",
    }).success,
    false,
  );
});

test("schema: ERROR_CODES contiene los 12 códigos de SPEC §8.4", () => {
  const expected = [
    "not_configured",
    "bad_manifest",
    "bad_fqdn",
    "conflict",
    "preflight_unknown",
    "dns_unresolved",
    "already_running",
    "infra_blocked",
    "upstream_40x",
    "audit_failed",
    "lock_error",
    "unknown_verb",
  ];
  for (const code of expected) {
    assert.ok(ERROR_CODES.includes(code as (typeof ERROR_CODES)[number]), `falta ${code}`);
  }
  assert.equal(ERROR_CODES.length, 12);
});

test("schema: EnvTemplateKeys es enum cerrado de 5 keys", () => {
  assert.equal(EnvTemplateKeys.length, 5);
  for (const k of ["APP_ENV", "APP_URL", "DATABASE_URL", "VECTORIA_DIRECTOR_EMAIL", "VECTORIA_ORG_NAME"]) {
    assert.ok((EnvTemplateKeys as readonly string[]).includes(k));
  }
});

test("schema: RunnerConfigSchema defaults razonables", () => {
  const cfg = RunnerConfigSchema.parse({});
  assert.equal(cfg.COOLIFY_BASE_URL, "https://app.coolify.io");
  assert.equal(cfg.COOLIFY_API_PREFIX, "/api/v1");
  assert.equal(cfg.COOLIFY_TIMEOUT_MS, 20000);
  assert.equal(cfg.PROVISION_WAIT_LOCK_MS, 0);
});