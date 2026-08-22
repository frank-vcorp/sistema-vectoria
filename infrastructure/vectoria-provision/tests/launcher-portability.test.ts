/**
 * AC-R-20 · launcher portability: `VECTORIA_PROVISION_CHILD` external path
 * está soportado; `CHILD` default es relativo a `${BASH_SOURCE}`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test("AC-R-20: launcher acepta VECTORIA_PROVISION_CHILD", () => {
  const scriptPath = resolve(__dirname, "..", "bin", "run-provision.sh");
  const content = readFileSync(scriptPath, "utf8");
  assert.ok(content.includes("VECTORIA_PROVISION_CHILD"));
});

test("AC-R-20: CHILD default es relativo a BASH_SOURCE (no absoluto a sistema-vectoria)", () => {
  const scriptPath = resolve(__dirname, "..", "bin", "run-provision.sh");
  const content = readFileSync(scriptPath, "utf8");
  // El default NO debe hardcodear la ruta absoluta al repo sistema-vectoria.
  assert.ok(!content.includes("/home/frank/repos/sistema-vectoria/infrastructure/vectoria-provision/dist"));
  // El default DEBE usar BASH_SOURCE-relativo.
  assert.ok(content.includes("BASH_SOURCE") || content.includes("SCRIPT_DIR"));
});

test("AC-R-20: launcher soporta VECTORIA_PROVISION_GLOBAL_PROFILE (NUEVO v2.0)", () => {
  const scriptPath = resolve(__dirname, "..", "bin", "run-provision.sh");
  const content = readFileSync(scriptPath, "utf8");
  assert.ok(content.includes("VECTORIA_PROVISION_GLOBAL_PROFILE"));
});

test("AC-R-20: launcher soporta VECTORIA_PROVISION_REGISTRY_DIR (NUEVO v2.0)", () => {
  const scriptPath = resolve(__dirname, "..", "bin", "run-provision.sh");
  const content = readFileSync(scriptPath, "utf8");
  assert.ok(content.includes("VECTORIA_PROVISION_REGISTRY_DIR"));
});

test("AC-R-20: launcher soporta VECTORIA_PROVISION_AUDIT_DIR (NUEVO v2.0)", () => {
  const scriptPath = resolve(__dirname, "..", "bin", "run-provision.sh");
  const content = readFileSync(scriptPath, "utf8");
  assert.ok(content.includes("VECTORIA_PROVISION_AUDIT_DIR"));
});

test("AC-R-20: launcher valida mode 600 + owner UID del global-profile", () => {
  const scriptPath = resolve(__dirname, "..", "bin", "run-provision.sh");
  const content = readFileSync(scriptPath, "utf8");
  assert.ok(content.includes("validate_secret_file"));
  assert.ok(content.includes("global_profile"));
});

test("F5: launcher valida per-project secret-source file (NUEVO v2.0)", () => {
  const scriptPath = resolve(__dirname, "..", "bin", "run-provision.sh");
  const content = readFileSync(scriptPath, "utf8");
  // El launcher lee `VECTORIA_PROVISION_SECRET_SOURCE_FILE` y aplica
  // validate_secret_file con label `src` cuando se provee.
  assert.ok(content.includes("VECTORIA_PROVISION_SECRET_SOURCE_FILE"));
  assert.ok(content.includes('validate_secret_file "$SECRET_SOURCE_FILE" "src"'));
  // Códigos de error documentados en el header del script.
  assert.ok(content.includes("src_missing"));
  assert.ok(content.includes("src_symlink"));
  assert.ok(content.includes("src_bad_owner"));
  assert.ok(content.includes("src_bad_perms"));
});

test("F5: launcher propaga VECTORIA_PROVISION_SECRET_SOURCE_FILE al child vía env -i", () => {
  const scriptPath = resolve(__dirname, "..", "bin", "run-provision.sh");
  const content = readFileSync(scriptPath, "utf8");
  assert.ok(content.includes('"VECTORIA_PROVISION_SECRET_SOURCE_FILE=${SECRET_SOURCE_FILE}"'));
});

// Evita warning de noUnusedLocals
void join;