/**
 * Runner mock: ejecuta `runEnsure` con paths namespaced y mocks HTTP instalados.
 *
 * Encadena automáticamente `ensure_project` → `ensure_environment` →
 * `<operation>` para que `ensure_application` (y cualquier op que requiera
 * bindings de parents) tenga su cadena completa en el registry namespaced.
 *
 * NO toca el `bin/run-provision.sh` real — sólo el `runEnsure` core.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { runEnsure } from "../../../src/ensure.js";
import { loadRegistry, withSlugLock } from "../../../src/registry.js";
import { loadOrganizationProfile } from "../../../src/profile.js";
import {
  loadGlobalProfile,
  namespacedAuditPath,
  namespacedRegistryPath,
} from "../../../src/global-profile.js";
import {
  ensureDestination,
  manifestProjectNamespace,
  resolveServerUuid,
} from "../../../src/destination.js";
import { ManifestSchema, type Manifest, type RunnerConfig } from "../../../src/schema.js";
import { readFileSync } from "node:fs";
import { setDnsResolver } from "../../../src/client.js";

export interface RunProvisionArgs {
  manifestPath: string;
  operation: string;
  registryBase: string;
  auditBase: string;
  profilePath: string;
  secretsFile: string;
  tokenRead: string;
  tokenWrite: string;
  derivationRootB64: string;
  /**
   * Si `true`, encadena `ensure_project` + `ensure_environment` antes de la
   * `operation` solicitada (default `true` para E2E disposable; `false`
   * para tests unit que quieren probar ops aisladas).
   */
  preChainParents?: boolean;
}

type EnsureOutcome = { ok: boolean; status?: string; uuid?: string; error?: { code: string; message: string } };

/**
 * Mock DNS resolver para E2E: retorna `ok: true` siempre con el `expectedIp`
 * provisto. Evita dependencia de DNS real (runners de CI no resuelven FQDN).
 */
function installE2EDnsOk(): void {
  setDnsResolver(async (_fqdn: string, expectedIp: string) => {
    return { ok: true, ip: expectedIp };
  });
}

async function loadProvisionCtx(args: RunProvisionArgs): Promise<{
  manifest: Manifest;
  parent: string;
  id: string;
  globalProfile: ReturnType<typeof loadGlobalProfile>;
  cfg: RunnerConfig;
}> {
  const raw = JSON.parse(readFileSync(args.manifestPath, "utf8")) as unknown;
  const manifest = ManifestSchema.parse(raw) as Manifest;
  const projectNs = manifestProjectNamespace(manifest);
  const [nsParent, nsId] = projectNs.split(":");
  const parent = nsParent ?? "vectoria";
  const id = nsId ?? manifest.taskId;

  const globalProfile = loadGlobalProfile(args.profilePath);
  const cfg: RunnerConfig = {
    COOLIFY_READ_TOKEN: args.tokenRead,
    COOLIFY_WRITE_TOKEN: args.tokenWrite,
    SECRET_DERIVATION_ROOT: args.derivationRootB64,
    COOLIFY_BASE_URL: "https://app.coolify.io",
    COOLIFY_API_PREFIX: "/api/v1",
    COOLIFY_TIMEOUT_MS: 5000,
    PROVISION_REGISTRY_PATH: namespacedRegistryPath(args.registryBase, parent, id),
    PROVISION_AUDIT_PATH: namespacedAuditPath(args.auditBase, parent, id),
    PROVISION_PROFILE_PATH: "/nonexistent.json",
    PROVISION_WAIT_LOCK_MS: 0,
    VECTORIA_SECRETS_FILE: args.secretsFile,
  };
  return { manifest, parent, id, globalProfile, cfg };
}

async function seedBaseFiles(args: RunProvisionArgs): Promise<void> {
  for (const base of [args.registryBase, args.auditBase]) {
    mkdirSync(base, { recursive: true });
  }
  if (!existsSync(args.profilePath)) {
    writeFileSync(args.profilePath, JSON.stringify({ v: 1 }), { mode: 0o600 });
  }
  if (!existsSync(args.secretsFile)) {
    writeFileSync(args.secretsFile, "", { mode: 0o600 });
  }
}

async function runOne(
  operation: string,
  manifest: Manifest,
  cfg: RunnerConfig,
  globalProfile: ReturnType<typeof loadGlobalProfile>,
): Promise<EnsureOutcome> {
  const registry = await loadRegistry(cfg.PROVISION_REGISTRY_PATH);
  // `Manifest` (input type) puede no tener `project` en la rama v1;
  // el cast es seguro porque el parse SIEMPRE produce v2 strict output.
  const parent = (manifest as { project?: { parent?: string } }).project?.parent ?? "vectoria";
  const profile = await loadOrganizationProfile(
    "/nonexistent.json",
    globalProfile,
    parent,
  );
  const serverUuid = resolveServerUuid(manifest, registry, globalProfile);
  const destination = ensureDestination(manifest, registry, serverUuid);
  const result = await runEnsure({
    operation,
    manifest,
    destination,
    cfg,
    registry,
    profile,
    globalProfile,
  });
  if (!result.ok) {
    return { ok: false, error: { code: result.error.code, message: result.error.message } };
  }
  return { ok: true, status: result.status, uuid: result.uuid };
}

export async function runProvision(args: RunProvisionArgs): Promise<EnsureOutcome> {
  installE2EDnsOk();
  await seedBaseFiles(args);
  const { manifest, cfg, globalProfile } = await loadProvisionCtx(args);

  const preChain = args.preChainParents ?? true;

  // Lock por slug: serializa el chain completo + la op final dentro del lock
  // para garantizar atomicidad cross-op del registry namespaced.
  return withSlugLock(cfg.PROVISION_REGISTRY_PATH, manifest.slug, 1000, async () => {
    if (preChain) {
      // 1. ensure_project
      const p = await runOne("ensure_project", manifest, cfg, globalProfile);
      if (!p.ok) return p;
      // 2. ensure_environment
      const e = await runOne("ensure_environment", manifest, cfg, globalProfile);
      if (!e.ok) return e;
    }
    // 3. operation solicitada (e.g. ensure_application / ensure_database / etc.)
    return runOne(args.operation, manifest, cfg, globalProfile);
  });
}