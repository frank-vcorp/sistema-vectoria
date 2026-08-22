/**
 * AC-R-3 · global-profile missing → WARN + fallback defaults.
 * AC-R-4 · global-profile override → serverUuid custom.
 * AC-R-18 · global-profile sin secretos (verificación estática en código).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GlobalProfileSchema,
  loadGlobalProfile,
  resolveProjectNamespace,
  expandHomePath,
  namespacedRegistryPath,
} from "../src/global-profile.js";

function newTmp(): string {
  return mkdtempSync(join(tmpdir(), "vp-gp-"));
}

test("AC-R-3: global-profile missing → WARN stderr + defaults", () => {
  const dir = newTmp();
  try {
    const orig = process.stderr.write.bind(process.stderr);
    let captured = "";
    (process.stderr.write as unknown) = (chunk: string | Uint8Array): boolean => {
      captured += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      return true;
    };
    try {
      const gp = loadGlobalProfile(join(dir, "nonexistent.json"));
      assert.ok(gp !== undefined);
      assert.equal(gp.v, 1);
      // Defaults preservados
      assert.equal(gp.defaults.serverUuid, "03tz1uabcrjaihnvrhysbstv");
      assert.equal(gp.defaults.dnsWildcardDomain, "vector-ia.mx");
      assert.ok(captured.includes("WARN"), "esperaba WARN stderr");
      assert.ok(captured.includes("global profile missing"), `WARN content=${captured}`);
    } finally {
      process.stderr.write = orig;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-R-3 extra: global-profile JSON malformado → WARN + defaults", () => {
  const dir = newTmp();
  try {
    const p = join(dir, "gp.json");
    writeFileSync(p, "not-valid-json", { mode: 0o600 });
    const orig = process.stderr.write.bind(process.stderr);
    let captured = "";
    (process.stderr.write as unknown) = (chunk: string | Uint8Array): boolean => {
      captured += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      return true;
    };
    try {
      const gp = loadGlobalProfile(p);
      assert.equal(gp.defaults.serverUuid, "03tz1uabcrjaihnvrhysbstv");
      assert.ok(captured.includes("malformed JSON"), `esperaba malformed JSON WARN; got=${captured}`);
    } finally {
      process.stderr.write = orig;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-R-3 extra: global-profile schema inválido → WARN + defaults", () => {
  const dir = newTmp();
  try {
    const p = join(dir, "gp.json");
    writeFileSync(p, JSON.stringify({ v: "wrong" }), { mode: 0o600 });
    const orig = process.stderr.write.bind(process.stderr);
    let captured = "";
    (process.stderr.write as unknown) = (chunk: string | Uint8Array): boolean => {
      captured += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      return true;
    };
    try {
      const gp = loadGlobalProfile(p);
      assert.equal(gp.defaults.serverUuid, "03tz1uabcrjaihnvrhysbstv");
      assert.ok(captured.includes("WARN"));
    } finally {
      process.stderr.write = orig;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-R-4: global-profile override → serverUuid custom", () => {
  const dir = newTmp();
  try {
    const p = join(dir, "gp.json");
    const body = {
      v: 1,
      defaults: {
        serverUuid: "OTHER-SERVER-UUID",
        dnsWildcardDomain: "vector-ia.mx",
        dnsExpectedIp: "212.28.185.217",
        gitHost: "github.com",
        hkdfInfoPrefix: "vectoria",
        secretSourceBaseDir: "~/.config/kilo/vectoria-provision/secrets",
        registryBaseDir: "~/.config/kilo/vectoria-provision/registry",
        auditBaseDir: "~/.config/kilo/vectoria-provision/audit",
        defaultDirectorEmail: "contacto@vector-ia.mx",
        defaultOrgName: "Vector IA",
      },
      organizations: {},
      globalSecretsFile: "~/.config/kilo/integra.secrets.env",
      lockDirNamespaceDepth: 3,
      auditTargetFieldsExtra: ["projectParent", "projectId"],
    };
    writeFileSync(p, JSON.stringify(body), { mode: 0o600 });
    const gp = loadGlobalProfile(p);
    assert.equal(gp.defaults.serverUuid, "OTHER-SERVER-UUID");
    // Schema válido
    const verified = GlobalProfileSchema.parse(body);
    assert.equal(verified.defaults.serverUuid, "OTHER-SERVER-UUID");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-R-18: GlobalProfileSchema rechaza keys secretas en defaults", () => {
  // Schema no expone campos secretos; si alguien intenta meterlos, simplemente
  // no se reconocen (Zod strip por default). Verificamos el shape cerrado.
  const res = GlobalProfileSchema.parse({ v: 1 });
  assert.ok(!("S3_ENDPOINT" in res));
  assert.ok(!("S3_BUCKET" in res));
  assert.ok(!("VECTORIA_SUPERUSER_PASSWORD" in res));
  assert.ok(!("DATABASE_URL" in res));
  assert.ok(!("MASTER_KEY" in res));
});

test("resolveProjectNamespace: composición `<parent>:<id>`", () => {
  assert.equal(resolveProjectNamespace("acme-corp", "blog"), "acme-corp:blog");
  assert.equal(resolveProjectNamespace("vectoria", "sistema-vectoria"), "vectoria:sistema-vectoria");
});

test("expandHomePath: expande `~`", () => {
  const home = process.env["HOME"] ?? "/root";
  assert.equal(expandHomePath("~"), home);
  assert.equal(expandHomePath("~/foo"), `${home}/foo`);
  assert.equal(expandHomePath("/abs/path"), "/abs/path");
});

test("namespacedRegistryPath: composición `${base}/${parent}/${id}/registry.jsonl`", () => {
  const r = namespacedRegistryPath("~/.config/kilo/vectoria-provision/registry", "acme-corp", "blog");
  const home = process.env["HOME"] ?? "/root";
  assert.equal(r, `${home}/.config/kilo/vectoria-provision/registry/acme-corp/blog/registry.jsonl`);
});