/**
 * AC-R-19 · precedence de directorEmail: per-org-profile > organizations[parent] > defaults.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrganizationProfile } from "../src/profile.js";
import { GlobalProfileSchema } from "../src/global-profile.js";

function newTmp(): string {
  return mkdtempSync(join(tmpdir(), "vp-prof-"));
}

const baseGlobal = {
  v: 1,
  defaults: {
    serverUuid: "03tz1uabcrjaihnvrhysbstv",
    dnsWildcardDomain: "vector-ia.mx",
    dnsExpectedIp: "212.28.185.217",
    gitHost: "github.com",
    hkdfInfoPrefix: "vectoria",
    secretSourceBaseDir: "~/.config/kilo/vectoria-provision/secrets",
    registryBaseDir: "~/.config/kilo/vectoria-provision/registry",
    auditBaseDir: "~/.config/kilo/vectoria-provision/audit",
    defaultDirectorEmail: "defaults@vector-ia.mx",
    defaultOrgName: "Vector IA (default)",
  },
  organizations: {
    vectoria: {
      defaultDirectorEmail: "org-vectoria@vector-ia.mx",
      defaultOrgName: "Vector IA",
    },
    "acme-corp": {
      defaultDirectorEmail: "ops@acme-corp.example",
      defaultOrgName: "Acme Corp",
    },
  },
  globalSecretsFile: "~/.config/kilo/integra.secrets.env",
  lockDirNamespaceDepth: 3,
  auditTargetFieldsExtra: ["projectParent", "projectId"],
};

test("AC-R-19: organizations[parent] > defaults", () => {
  const gp = GlobalProfileSchema.parse(baseGlobal);
  const prof = loadOrganizationProfile("/nonexistent/org.json", gp, "vectoria");
  assert.equal(prof.directorEmail, "org-vectoria@vector-ia.mx");
  assert.equal(prof.orgName, "Vector IA");
});

test("AC-R-19: defaults cuando parent NO está en organizations", () => {
  const gp = GlobalProfileSchema.parse(baseGlobal);
  const prof = loadOrganizationProfile("/nonexistent/org.json", gp, "no-existe");
  assert.equal(prof.directorEmail, "defaults@vector-ia.mx");
  assert.equal(prof.orgName, "Vector IA (default)");
});

test("AC-R-19: per-organization-profile.json > organizations[parent]", () => {
  const dir = newTmp();
  try {
    const gp = GlobalProfileSchema.parse(baseGlobal);
    const orgPath = join(dir, "org.json");
    writeFileSync(
      orgPath,
      JSON.stringify({
        directorEmail: "per-org@vector-ia.mx",
        orgName: "Vector IA (per-org)",
      }),
      { mode: 0o600 },
    );
    const prof = loadOrganizationProfile(orgPath, gp, "vectoria");
    assert.equal(prof.directorEmail, "per-org@vector-ia.mx");
    assert.equal(prof.orgName, "Vector IA (per-org)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-R-19: sin globalProfile ni archivo → hardcoded defaults", () => {
  const prof = loadOrganizationProfile("/nonexistent/org.json");
  assert.equal(prof.directorEmail, "contacto@vector-ia.mx");
  assert.equal(prof.orgName, "Vector IA");
});

test("AC-R-19: organizations[parent] parcial → completa con defaults", () => {
  const gp = GlobalProfileSchema.parse({
    ...baseGlobal,
    organizations: {
      vectoria: {
        // sólo directorEmail; orgName falta
        defaultDirectorEmail: "solo-email@vector-ia.mx",
      },
    },
  });
  const prof = loadOrganizationProfile("/nonexistent/org.json", gp, "vectoria");
  assert.equal(prof.directorEmail, "solo-email@vector-ia.mx");
  // orgName cae a defaults.defaultOrgName
  assert.equal(prof.orgName, "Vector IA (default)");
});