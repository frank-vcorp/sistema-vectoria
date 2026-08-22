/**
 * AC-R-9 / AC-R-10 · secret-source per-project (declarativo) + legacy compat.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  legacySecretSourceKeys,
  missingSecretSourceKeys,
  readSecretsFromFile,
  requiredSecretSourceKeysFromManifest,
} from "../src/secrets-file.js";

function newTmp(): string {
  return mkdtempSync(join(tmpdir(), "vp-sf-"));
}

test("AC-R-9: manifest.application.secretSource presente → sólo esas keys", () => {
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
      secretSource: ["S3_ENDPOINT", "S3_BUCKET"] as const,
    },
    database: { engine: "postgresql" as const, name: "db" },
    storage: { serviceType: "garage" as const, name: "storage" },
    envOverrides: {},
  } as const;
  const required = requiredSecretSourceKeysFromManifest(m as unknown as Parameters<typeof requiredSecretSourceKeysFromManifest>[0]);
  assert.deepEqual([...required], ["S3_ENDPOINT", "S3_BUCKET"]);
});

test("AC-R-9: readSecretsFromFile respeta sólo las keys pedidas", () => {
  const dir = newTmp();
  try {
    const p = join(dir, "secrets.env");
    writeFileSync(
      p,
      [
        "S3_ENDPOINT=https://s3.example.com",
        "S3_BUCKET=acme-bucket",
        "S3_ACCESS_KEY=AKIA-extra",
        "S3_SECRET_KEY=secret-extra",
        "VECTORIA_SUPERUSER_PASSWORD=super",
      ].join("\n"),
      { mode: 0o600 },
    );
    const loaded = readSecretsFromFile(p, ["S3_ENDPOINT", "S3_BUCKET"]);
    assert.equal(loaded.values.size, 2);
    assert.ok(loaded.values.has("S3_ENDPOINT"));
    assert.ok(loaded.values.has("S3_BUCKET"));
    assert.ok(!loaded.values.has("S3_ACCESS_KEY"));
    assert.ok(!loaded.values.has("S3_SECRET_KEY"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-R-10: manifest v1 sin secretSource → empty array (legacy compat)", () => {
  const m = {
    v: 1,
    taskId: "IMPL-test",
    specRef: "SPEC-test",
    slug: "sistema-vectoria",
    fqdn: "sistema-vectoria.vector-ia.mx",
    repository: "frank-vcorp/sistema-vectoria",
    branch: "main",
    serverUuid: "DEFAULT",
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
  const required = requiredSecretSourceKeysFromManifest(m as unknown as Parameters<typeof requiredSecretSourceKeysFromManifest>[0]);
  assert.equal(required.length, 0);
  // legacySecretSourceKeys() expone las 5 keys para callers v1.7-aware.
  assert.equal(legacySecretSourceKeys().length, 5);
});

test("missingSecretSourceKeys: detecta keys ausentes en el archivo cargado", () => {
  const dir = newTmp();
  try {
    const p = join(dir, "partial.env");
    writeFileSync(p, "S3_ENDPOINT=https://s3.example.com\n", { mode: 0o600 });
    const loaded = readSecretsFromFile(p, ["S3_ENDPOINT", "S3_BUCKET"]);
    const missing = missingSecretSourceKeys(["S3_ENDPOINT", "S3_BUCKET"], loaded);
    assert.deepEqual([...missing], ["S3_BUCKET"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readSecretsFromFile: archivo inexistente → Map vacío (no aborta)", () => {
  const dir = newTmp();
  try {
    const loaded = readSecretsFromFile(join(dir, "nope.env"), ["S3_ENDPOINT"]);
    assert.equal(loaded.values.size, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});