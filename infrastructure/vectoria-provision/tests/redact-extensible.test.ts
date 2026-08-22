/**
 * AC-R-22 · redact extensible: `redactWithProfile` aplica keys dinámicas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { redact, redactWithProfile } from "../src/redact.js";

test("AC-R-22: app.specific_token SIN profile → no redactado", () => {
  // Usamos `token` en lugar de `secret` para evitar match con SENSITIVE_PATTERNS por nombre.
  const input = { app: { specific_token: "ABC" } };
  const out = redact(input);
  assert.deepEqual(out, { app: { specific_token: "ABC" } });
});

test("AC-R-22: app.specific_token CON extraKeys → redactado a [REDACTED]", () => {
  const input = { app: { specific_token: "ABC" } };
  // El extraKey matchea el path completo (joined by .)
  const out = redactWithProfile(input, undefined, { extraKeys: ["APP.SPECIFIC_TOKEN"] });
  assert.deepEqual(out, { app: { specific_token: "[REDACTED]" } });
});

test("AC-R-22: case-insensitive match en extraKeys", () => {
  const input = { app_specific_token: "ABC" };
  const out = redactWithProfile(input, undefined, { extraKeys: ["app_specific_token"] });
  assert.deepEqual(out, { app_specific_token: "[REDACTED]" });
});

test("AC-R-22: tokens literales también se redactan", () => {
  // Nota: el patrón SENSITIVE `/Bearer\s+[A-Za-z0-9._\-+/=]{4,}/` también aplica.
  // Verificamos que el VALOR LITERAL del token queda redactado (independiente del Bearer).
  const input = { body: "abc.def.ghi appears here" };
  const out = redactWithProfile(input, undefined, { tokens: ["abc.def.ghi"] });
  assert.equal((out as { body: string }).body, "[REDACTED] appears here");
});

test("AC-R-22: redact() preserva invariantes (sin extra keys → comportamiento v1.7)", () => {
  const input = { DATABASE_URL: "postgresql://x:y@host/db" };
  const out = redact(input);
  assert.deepEqual(out, { DATABASE_URL: "[REDACTED]" });
});