/**
 * AC-R-5 · dns.zone override: fqdn coherente con slug + dns.zone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ManifestSchema } from "../src/schema.js";

test("AC-R-5: manifest v2 con dns.zone custom → fqdn coherente", () => {
  const m = {
    v: 2,
    taskId: "IMPL-20260821-XX",
    specRef: "SPEC-20260821-001",
    project: { id: "blog", parent: "acme-corp" },
    slug: "blog",
    fqdn: "blog.staging.example.com",
    repository: "acme-corp/blog",
    branch: "main",
    serverUuid: "OTHER-UUID",
    environment: "staging" as const,
    resources: ["application"] as const,
    application: {
      appVariant: "public" as const,
      buildPack: "nixpacks" as const,
      portsExposes: "3000",
      githubAppUuid: null,
      privateKeyUuid: null,
    },
    database: { engine: "postgresql" as const, name: "blog-db" },
    storage: { serviceType: "garage" as const, name: "blog-storage" },
    dns: { zone: "staging.example.com" },
    envOverrides: {},
  };
  const parsed = ManifestSchema.parse(m);
  assert.equal(parsed.fqdn, "blog.staging.example.com");
  assert.equal(parsed.dns?.zone, "staging.example.com");
});

test("AC-R-5 negativo: fqdn inconsistente con slug + dns.zone → ZodError", () => {
  const m = {
    v: 2,
    taskId: "IMPL-20260821-XX",
    specRef: "SPEC-20260821-001",
    slug: "blog",
    fqdn: "blog.staging.acme-corp.example.com", // incluye subdominio extra
    repository: "acme-corp/blog",
    branch: "main",
    serverUuid: "OTHER-UUID",
    environment: "staging" as const,
    resources: ["application"] as const,
    application: {
      appVariant: "public" as const,
      buildPack: "nixpacks" as const,
      portsExposes: "3000",
      githubAppUuid: null,
      privateKeyUuid: null,
    },
    database: { engine: "postgresql" as const, name: "blog-db" },
    storage: { serviceType: "garage" as const, name: "blog-storage" },
    dns: { zone: "staging.example.com" },
    envOverrides: {},
  };
  const res = ManifestSchema.safeParse(m);
  assert.equal(res.success, false);
});

test("AC-R-23: dns.expectedIp custom", () => {
  const m = {
    v: 2,
    taskId: "IMPL-20260821-XX",
    specRef: "SPEC-20260821-001",
    slug: "blog",
    fqdn: "blog.staging.example.com",
    repository: "acme-corp/blog",
    branch: "main",
    serverUuid: "OTHER-UUID",
    environment: "staging" as const,
    resources: ["application"] as const,
    application: {
      appVariant: "public" as const,
      buildPack: "nixpacks" as const,
      portsExposes: "3000",
      githubAppUuid: null,
      privateKeyUuid: null,
    },
    database: { engine: "postgresql" as const, name: "blog-db" },
    storage: { serviceType: "garage" as const, name: "blog-storage" },
    dns: { zone: "staging.example.com", expectedIp: "10.0.0.5" },
    envOverrides: {},
  };
  const parsed = ManifestSchema.parse(m);
  assert.equal(parsed.dns?.expectedIp, "10.0.0.5");
});

test("AC-R-23 negativo: dns.expectedIp formato inválido → ZodError", () => {
  const m = {
    v: 2,
    taskId: "IMPL-20260821-XX",
    specRef: "SPEC-20260821-001",
    slug: "blog",
    fqdn: "blog.staging.example.com",
    repository: "acme-corp/blog",
    branch: "main",
    serverUuid: "OTHER-UUID",
    environment: "staging" as const,
    resources: ["application"] as const,
    application: {
      appVariant: "public" as const,
      buildPack: "nixpacks" as const,
      portsExposes: "3000",
      githubAppUuid: null,
      privateKeyUuid: null,
    },
    database: { engine: "postgresql" as const, name: "blog-db" },
    storage: { serviceType: "garage" as const, name: "blog-storage" },
    dns: { zone: "staging.example.com", expectedIp: "not-an-ip" },
    envOverrides: {},
  };
  const res = ManifestSchema.safeParse(m);
  assert.equal(res.success, false);
});