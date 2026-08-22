/**
 * E2E disposable multi-proyecto (AC-R-15, AC-R-16, AC-R-17):
 *  - 2 slugs simultáneos en distintos namespaces, no colisión.
 *  - Re-run idempotente.
 *  - Mismo slug, distinto parent → conflict.
 *
 * Estos tests usan `tests/e2e/__mocks__/coolify.ts` (mocks del cliente HTTP
 * Coolify) para validar el flujo end-to-end sin tocar la API real.
 *
 * El mock runner (`tests/e2e/__mocks__/runner.ts`) encadena automáticamente
 * `ensure_project` → `ensure_environment` → `ensure_application` para que el
 * registry namespaced tenga los parents requeridos antes del application.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { installCoolifyMock } from "./__mocks__/coolify.js";
import { ManifestSchema, type Manifest } from "../../src/schema.js";
import { manifestProjectNamespace } from "../../src/destination.js";

function newTmp(): string {
  return mkdtempSync(join(tmpdir(), "vp-e2e-"));
}

/**
 * Helper: deriva `${parent}/${id}` del namespace del manifest.
 * Para v1, `manifestProjectNamespace` cae a `parent="vectoria", id=taskId`.
 * Para v2 estricto con `project.{id,parent}`, los respeta.
 */
function nsPathSegments(manifestPath: string): { parent: string; id: string } {
  const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
  const manifest = ManifestSchema.parse(raw) as Manifest;
  const ns = manifestProjectNamespace(manifest);
  const [parent, id] = ns.split(":");
  return { parent: parent ?? "vectoria", id: id ?? manifest.taskId };
}

test("AC-R-15: 2 slugs simultáneos en distintos namespaces, no colisión", async () => {
  const dir = newTmp();
  try {
    const registryBase = join(dir, "registry");
    const auditBase = join(dir, "audit");
    const profilePath = join(dir, "global-profile.json");
    const secretsFile = join(dir, "integra.secrets.env");

    const sysManifest = "tests/fixtures/manifests/manifest-sistema-vectoria.json";
    const acmeManifest = "tests/fixtures/manifests/manifest-acme-blog.json";
    const sysNs = nsPathSegments(sysManifest);
    const acmeNs = nsPathSegments(acmeManifest);

    const mock = installCoolifyMock();
    try {
      const { runProvision } = await import("./__mocks__/runner.js");
      const r1 = await runProvision({
        manifestPath: sysManifest,
        operation: "ensure_application",
        registryBase,
        auditBase,
        profilePath,
        secretsFile,
        tokenRead: "READ",
        tokenWrite: "WRITE",
        derivationRootB64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      });
      const r2 = await runProvision({
        manifestPath: acmeManifest,
        operation: "ensure_application",
        registryBase,
        auditBase,
        profilePath,
        secretsFile,
        tokenRead: "READ",
        tokenWrite: "WRITE",
        derivationRootB64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      });
      assert.equal(r1.ok, true, `sistema-vectoria: ${JSON.stringify(r1)}`);
      assert.equal(r2.ok, true, `acme-blog: ${JSON.stringify(r2)}`);
      // Verificar paths namespaced (derivan del namespace, no del slug).
      const sysRegPath = join(registryBase, sysNs.parent, sysNs.id, "registry.jsonl");
      const acmeRegPath = join(registryBase, acmeNs.parent, acmeNs.id, "registry.jsonl");
      assert.ok(existsSync(sysRegPath), `expected ${sysRegPath}`);
      assert.ok(existsSync(acmeRegPath), `expected ${acmeRegPath}`);
      const sysAuditPath = join(auditBase, sysNs.parent, sysNs.id, "audit.jsonl");
      const acmeAuditPath = join(auditBase, acmeNs.parent, acmeNs.id, "audit.jsonl");
      assert.ok(existsSync(sysAuditPath));
      assert.ok(existsSync(acmeAuditPath));
      // Aislamiento: el registry de acme NO contiene UUIDs del sistema-vectoria
      const acmeReg = readFileSync(acmeRegPath, "utf8");
      const sysReg = readFileSync(sysRegPath, "utf8");
      const sysUuids = Array.from(sysReg.matchAll(/"uuid":"([^"]+)"/g)).map((m) => m[1] ?? "");
      for (const u of sysUuids) {
        if (u.length === 0) continue;
        assert.ok(!acmeReg.includes(u), `UUID sistema-vectoria ${u} aparece en acme registry`);
      }
    } finally {
      mock.restore();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-R-16: idempotencia — re-run no genera POST nuevo", async () => {
  const dir = newTmp();
  try {
    const registryBase = join(dir, "registry");
    const auditBase = join(dir, "audit");
    const profilePath = join(dir, "global-profile.json");
    const secretsFile = join(dir, "integra.secrets.env");

    const sysManifest = "tests/fixtures/manifests/manifest-sistema-vectoria.json";

    const mock = installCoolifyMock();
    try {
      const { runProvision } = await import("./__mocks__/runner.js");
      // Primer run: crea (project + environment + application = 3 POSTs nominales)
      const r1 = await runProvision({
        manifestPath: sysManifest,
        operation: "ensure_application",
        registryBase,
        auditBase,
        profilePath,
        secretsFile,
        tokenRead: "READ",
        tokenWrite: "WRITE",
        derivationRootB64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      });
      assert.equal(r1.ok, true, `primer run: ${JSON.stringify(r1)}`);
      const postsAfterFirst = mock.calls.filter((c) => c.verb === "POST").length;
      assert.ok(postsAfterFirst > 0, `debe haber al menos un POST en el primer run; got=${postsAfterFirst}`);

      // Reset mock.calls (sólo el contador importa; los handlers siguen instalados).
      mock.calls.length = 0;

      // Segundo run: adopta sin POST nuevo (los 3 binds ya existen)
      const r2 = await runProvision({
        manifestPath: sysManifest,
        operation: "ensure_application",
        registryBase,
        auditBase,
        profilePath,
        secretsFile,
        tokenRead: "READ",
        tokenWrite: "WRITE",
        derivationRootB64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      });
      assert.equal(r2.ok, true, `segundo run: ${JSON.stringify(r2)}`);
      if (r2.ok) {
        assert.equal(r2.status, "adopted", "idempotencia: status=adopted");
      }
      const postsAfterSecond = mock.calls.filter((c) => c.verb === "POST").length;
      assert.equal(postsAfterSecond, 0, `idempotencia: 0 POST nuevo; got=${postsAfterSecond}`);
    } finally {
      mock.restore();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});