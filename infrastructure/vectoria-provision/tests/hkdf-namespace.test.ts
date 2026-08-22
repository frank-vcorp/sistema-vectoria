/**
 * AC-R-11 · HKDF namespacing: distintos namespaces → distintos secretos.
 * AC-R-21 · bootstrap deprecated removal.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { deriveSecret, normalizeRoot, SECRET_NAMES, type SecretName } from "../src/secrets.js";

function rootB64(): string {
  return randomBytes(32).toString("base64");
}

test("AC-R-11: HKDF namespacing — distintos namespaces → distintos secretos", () => {
  const root = normalizeRoot(rootB64());
  // Mismo SECRET_DERIVATION_ROOT, mismo secretName + version, distintos namespaces.
  const mkNs1 = deriveSecret(root, "vectoria:sistema-vectoria", "master-key" as SecretName, 1, "vectoria");
  const mkNs2 = deriveSecret(root, "acme-corp:blog", "master-key" as SecretName, 1, "vectoria");
  assert.ok(!mkNs1.equals(mkNs2), "HKDF namespacing debe producir secretos distintos por namespace");
});

test("AC-R-11: HKDF info prefix distinto → distintos secretos (mismo namespace)", () => {
  const root = normalizeRoot(rootB64());
  const mkA = deriveSecret(root, "vectoria:sistema-vectoria", "master-key" as SecretName, 1, "acme");
  const mkB = deriveSecret(root, "vectoria:sistema-vectoria", "master-key" as SecretName, 1, "vectoria");
  assert.ok(!mkA.equals(mkB), "distinto hkdfInfoPrefix debe producir secretos distintos");
});

test("AC-R-11: retro-compat con signature de 4 args (default `vectoria`)", () => {
  const root = normalizeRoot(rootB64());
  // 4-arg (legacy): default hkdfInfoPrefix="vectoria"
  const a = deriveSecret(root, "acme-corp:blog", "master-key", 1);
  // 5-arg explícito con prefix "vectoria" — debe coincidir con legacy.
  const b = deriveSecret(root, "acme-corp:blog", "master-key", 1, "vectoria");
  assert.ok(a.equals(b), "default 'vectoria' debe coincidir con legacy 4-arg");
});

test("AC-R-21: SecretName type union excluye 'bootstrap'", () => {
  // Verificación estática vía type assertion: el union NO admite "bootstrap".
  const names: readonly SecretName[] = ["master-key", "session-secret"];
  assert.equal(names.length, 2);
  assert.equal(SECRET_NAMES.length, 2);
  assert.ok(SECRET_NAMES.includes("master-key"));
  assert.ok(SECRET_NAMES.includes("session-secret"));
  assert.ok(!(SECRET_NAMES as readonly string[]).includes("bootstrap"));
});

test("AC-R-21: 2 nombres producen 2 hex distintos (sin colisiones)", () => {
  const root = normalizeRoot(rootB64());
  const seen = new Set<string>();
  for (const name of SECRET_NAMES) {
    const buf = deriveSecret(root, "acme-corp:blog", name as SecretName, 1, "vectoria");
    seen.add(buf.toString("hex"));
  }
  assert.equal(seen.size, 2);
});