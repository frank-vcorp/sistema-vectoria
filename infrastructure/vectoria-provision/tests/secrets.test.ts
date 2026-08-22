/**
 * AC-8 · retry de secreto determinista.
 *
 * Verifica:
 *  - mismo (projectUuid, secretName, version) → mismo Buffer (32 bytes)
 *  - misma (projectUuid, secretName, version) → mismo base64url (bootstrap)
 *  - distinto projectUuid → distinto valor
 *  - distinto version → distinto valor
 *  - mismo SECRET_DERIVATION_ROOT, mismo secret, mismo projectUuid → 100% reproducible
 *  - los 3 secrets (master-key, session-secret, bootstrap) son distintos entre sí
 *  - el bootstrap es base64url con ≥24 chars (SPEC §9)
 *  - NUNCA se imprime el Buffer; los tests sólo comparan buffers
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { deriveBootstrapPassword, deriveSecret, normalizeRoot, SECRET_NAMES, type SecretName } from "../src/secrets.js";

function rootB64(): string {
  return randomBytes(32).toString("base64");
}

test("AC-8: mismo (projectUuid, secretName, version) → mismo Buffer (32 bytes)", () => {
  const root = normalizeRoot(rootB64());
  const a = deriveSecret(root, "p-uuid-1", "master-key" as SecretName, 1);
  const b = deriveSecret(root, "p-uuid-1", "master-key" as SecretName, 1);
  assert.equal(a.length, 32);
  assert.equal(b.length, 32);
  assert.ok(a.equals(b));
});

test("AC-8: distintos projectUuid → distintos valores (info incluye projectUuid)", () => {
  const root = normalizeRoot(rootB64());
  const a = deriveSecret(root, "p-uuid-A", "master-key" as SecretName, 1);
  const b = deriveSecret(root, "p-uuid-B", "master-key" as SecretName, 1);
  assert.ok(!a.equals(b));
});

test("AC-8: distintos version → distintos valores (monotónica, SPEC §9)", () => {
  const root = normalizeRoot(rootB64());
  const a = deriveSecret(root, "p-uuid-1", "master-key" as SecretName, 1);
  const b = deriveSecret(root, "p-uuid-1", "master-key" as SecretName, 2);
  assert.ok(!a.equals(b));
});

test("AC-8: mismos secretos reproducen idéntico 100 veces (retry determinista)", () => {
  const root = normalizeRoot(rootB64());
  const a = deriveSecret(root, "p-uuid-X", "session-secret" as SecretName, 1);
  for (let i = 0; i < 100; i++) {
    const b = deriveSecret(root, "p-uuid-X", "session-secret" as SecretName, 1);
    assert.ok(a.equals(b), `iteración ${i} divergió`);
  }
});

test("AC-8 (v2.0): los 2 nombres producen valores distintos entre sí para el mismo projectUuid", () => {
  const root = normalizeRoot(rootB64());
  const seen = new Set<string>();
  for (const name of SECRET_NAMES) {
    const buf = deriveSecret(root, "p-uuid-1", name as SecretName, 1);
    seen.add(buf.toString("hex"));
  }
  // v2.0: "bootstrap" removido del SecretName (AC-R-21) — 2 nombres → 2 hex distintos.
  assert.equal(seen.size, 2);
});

test("AC-8: bootstrap base64url ≥24 chars (legacy `deriveBootstrapPassword` deprecated)", () => {
  // v2.0: `bootstrap` ya no está en `SecretName`; usamos el helper deprecated.
  const root = normalizeRoot(rootB64());
  const s = deriveBootstrapPassword(root, "p-uuid-1", 1);
  assert.ok(s.length >= 24, `bootstrap b64url = ${s.length} chars < 24`);
});

test("AC-8: normalizeRoot acepta base64-32B y hex-64", () => {
  const rootHex = randomBytes(32).toString("hex");
  const rootB64 = Buffer.from(rootHex, "hex").toString("base64");
  const a = normalizeRoot(rootB64);
  const b = normalizeRoot(rootHex);
  assert.equal(a.length, 32);
  assert.equal(b.length, 32);
  assert.ok(a.equals(b));
});

test("AC-8: normalizeRoot rechaza longitud inválida", () => {
  assert.throws(() => normalizeRoot("not-base64-not-hex"), /inválido/);
  assert.throws(() => normalizeRoot(Buffer.from("short")), /inválido/);
});

test("AC-8: version inválida → error", () => {
  const root = normalizeRoot(rootB64());
  assert.throws(() => deriveSecret(root, "p-uuid-1", "master-key" as SecretName, 0), /version/);
  assert.throws(() => deriveSecret(root, "p-uuid-1", "master-key" as SecretName, -1), /version/);
  assert.throws(() => deriveSecret(root, "p-uuid-1", "master-key" as SecretName, 1.5), /version/);
});

test("AC-8: projectUuid vacío → error", () => {
  const root = normalizeRoot(rootB64());
  assert.throws(() => deriveSecret(root, "", "master-key" as SecretName, 1), /projectUuid/);
});