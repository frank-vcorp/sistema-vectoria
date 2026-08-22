/**
 * AC-R-1 · schema v2 backward-compat: manifest v1 parsea sin error.
 * AC-R-2 · schema v2 strict: `project.parent = "vectoria/../etc"` → ZodError.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ManifestSchema, ManifestV2StrictSchema, ProjectBlockSchema } from "../src/schema.js";

test("AC-R-1: manifest v1 parsea sin error (transform v1→v2)", () => {
  const m1 = {
    v: 1,
    taskId: "IMPL-20260821-XX",
    specRef: "SPEC-20260817-001",
    slug: "sistema-vectoria",
    fqdn: "sistema-vectoria.vector-ia.mx",
    repository: "Frank-vcorp/sistema-vectoria",
    branch: "main",
    serverUuid: "03tz1uabcrjaihnvrhysbstv",
    environment: "production" as const,
    resources: ["project", "environment", "application", "database", "storage"] as const,
    application: {
      appVariant: "public" as const,
      buildPack: "nixpacks" as const,
      portsExposes: "3000",
      githubAppUuid: null,
      privateKeyUuid: null,
    },
    database: { engine: "postgresql" as const, name: "sistema-vectoria-db" },
    storage: { serviceType: "garage" as const, name: "sistema-vectoria-storage" },
    envOverrides: {},
  };
  const parsed = ManifestSchema.parse(m1) as { v: number; project?: { parent?: string; id?: string } };
  // Tras transform v1→v2, el resultado es v2 strict con defaults aplicados.
  assert.equal(parsed.v, 2);
  assert.equal(parsed.project?.parent, "vectoria");
  assert.equal(parsed.project?.id, "IMPL-20260821-XX");
});

test("AC-R-2: project.parent con caracteres prohibidos → ZodError", () => {
  // El schema regex acepta sólo [a-z0-9-]{1,63}; '/', '..' están bloqueados.
  const bad = ProjectBlockSchema.safeParse({
    id: "acme-corp",
    parent: "vectoria/../etc",
  });
  assert.equal(bad.success, false);
  if (!bad.success) {
    const path = bad.error.issues.map((i) => i.path.join("."));
    assert.ok(path.some((p) => p === "parent"), `esperaba error en parent, paths=${JSON.stringify(path)}`);
  }
});

test("AC-R-2 extra: project.id con caracteres prohibidos → ZodError", () => {
  const bad = ProjectBlockSchema.safeParse({
    id: "acme corp",
    parent: "vectoria",
  });
  assert.equal(bad.success, false);
});

test("AC-R-2 extra: manifest v2 strict con project.parent inválido → ZodError", () => {
  const bad = ManifestV2StrictSchema.safeParse({
    v: 2,
    taskId: "IMPL-test",
    specRef: "SPEC-test",
    project: { id: "acme-corp", parent: "../etc" },
    slug: "acme-corp",
    fqdn: "acme-corp.example.com",
    repository: "acme-corp/blog",
    branch: "main",
    serverUuid: "OTHER-SERVER-UUID",
    environment: "production",
    resources: ["application"],
    application: {
      appVariant: "public",
      buildPack: "nixpacks",
      portsExposes: "3000",
      githubAppUuid: null,
      privateKeyUuid: null,
    },
    database: { engine: "postgresql", name: "acme-db" },
    storage: { serviceType: "garage", name: "acme-storage" },
    envOverrides: {},
  });
  assert.equal(bad.success, false);
});