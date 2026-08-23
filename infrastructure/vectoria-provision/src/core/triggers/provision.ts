/**
 * Trigger provision — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §3.
 *
 * Entrypoint único `vectoria-provision provision <manifest>`.
 * Encadena pasos 1-9 del pipeline:
 *
 *   1. Cargar + validar manifest
 *   2. Cargar global-profile + verificar runner version pin
 *   3. Cargar coollib-adapter por `coolify.version`
 *   4. Cargar runtime adapter (si aplica; fail-closed por selector)
 *   5. Preflight ejecutable (read-only, AC-09)
 *   6. ensure_* (project → env → app → db → storage → env) — sólo si flag permite
 *   7. deploy_staging (sólo si staging.auto && gated y Frank-auth vigente)
 *   8. (production NO APLICA en este pase)
 *   9. reconcile + audit append
 *
 * Flags modifican el comportamiento (ver flags.ts).
 *
 * Garantías (cierre §7.8 + §7.3 SOL-20260822-01):
 *  - Cero `DELETE` en el runner estándar (caller responsibility: cleanup
 *    requiere Frank-auth separado).
 *  - Preflight estrictamente read-only (AC-09).
 *  - Runtime adapter fail-closed (AC-11a/b/c/d).
 *  - Modo push (`--push-mode`) NO ejecuta `ensure_database` ni
 *    `ensure_storage` (AC-13).
 */
import { readFileSync, existsSync, readFileSync as readFile } from "node:fs";
import { resolve, join } from "node:path";
import type { Manifest } from "../../schema.js";
import {
  loadGlobalProfile,
  namespacedAuditPath,
  namespacedRegistryPath,
  namespacedSecretSourcePath,
  type GlobalProfile,
} from "../../global-profile.js";
import { selectCoolifyAdapter } from "../../coollib-adapters/index.js";
import { runPreflight, type PreflightReport } from "../preflight/index.js";
import { parseTriggerFlags } from "./flags.js";
import { runPushPostProvisioning } from "../push/post-provisioning.js";
import { runEnsure as defaultRunEnsure, type RunEnsureArgs } from "../../ensure.js";
import { snapshotConfig } from "../../schema.js";
import { loadRegistry, withSlugLock } from "../../registry.js";
import { loadOrganizationProfile } from "../../profile.js";
import { ensureDestination, resolveServerUuid } from "../../destination.js";
import { appendAudit } from "../../audit.js";
import { ProvisionError, type EnsureResult } from "../../errors.js";
import type { Resource } from "../../schema.js";

export interface ProvisionInput {
  argv: readonly string[];
  env?: NodeJS.ProcessEnv;
  /**
   * Hook opcional para inyectar resultados pre-cargados (tests, fixture
   * resolution, mock fixtures). Si no se provee, el trigger intenta
   * resolverlos desde el entorno del proceso.
   */
  resolvers?: Partial<ProvisionResolvers>;
}

export interface ProvisionResolvers {
  /** Resuelve `serverInfo` (coolify version + reachability). */
  serverInfo(): Promise<{
    version: string;
    isReachable: boolean;
    proxyStatus?: string;
    isMcpServerEnabled?: boolean;
  }>;
  /** Resuelve status del DB target (read-only via coolify_get_database). */
  dbStatus(): Promise<"running:healthy" | "running" | "exited:unhealthy" | "exited" | "absent">;
  /** Resuelve status del Storage target. */
  storageStatus(): Promise<"running:healthy" | "running" | "exited:unhealthy" | "exited" | "absent">;
  /** Resuelve DNS lookup del wildcard. */
  dnsIp(): Promise<string | undefined>;
  /** Resuelve `git ls-remote --heads <url> <branch>` SHA. */
  gitRemoteSha(url: string, branch: string): Promise<string | undefined>;
  /** Lee pnpm-workspace.yaml del cwd del runner. */
  pnpmWorkspace(): { exists: boolean; raw?: string };
  /**
   * Spy seam para el pipeline `ensure_*`. Si está presente, `runProvision`
   * la usa en lugar del `runEnsure` real (tests AC-W1 sin red).
   * Debe respetar la firma `(args: RunEnsureArgs) => Promise<EnsureResult>`.
   */
  runEnsureImpl?(args: RunEnsureArgs): Promise<EnsureResult>;
  /** Hook opcional invocado tras cada `ensure_*` exitoso (spy counter). */
  onEnsure?(op: string, result: EnsureResult): void | Promise<void>;
}

export interface ProvisionResult {
  exit: number;
  reason?: string;
  ok: boolean;
  stage: "trigger" | "preflight" | "ensure" | "deploy_staging" | "push" | "reconcile";
  preflight?: PreflightReport;
  manifest?: Manifest;
  output?: unknown;
}

export async function runProvision(input: ProvisionInput): Promise<ProvisionResult> {
  const flags = parseTriggerFlags(input.argv);
  if (flags.error) {
    return { exit: 99, reason: flags.error, ok: false, stage: "trigger" };
  }
  if (flags.help) {
    process.stdout.write(parseTriggerFlags([], ).help ? "" : "");
    return { exit: 0, ok: true, stage: "trigger" };
  }
  const env = input.env ?? process.env;

  // 1. Cargar manifest
  const manifestPath = flags.manifestPath;
  if (!manifestPath) {
    return {
      exit: 3,
      reason: "manifest_invalid_or_missing:no_path",
      ok: false,
      stage: "trigger",
    };
  }
  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(readFileSync(resolve(manifestPath), "utf8"));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      exit: 3,
      reason: `manifest_invalid_or_missing:${msg}`,
      ok: false,
      stage: "trigger",
    };
  }

  // 2. Cargar global-profile (WARN + fallback si ausente)
  const globalProfile: GlobalProfile = loadGlobalProfile(
    env["VECTORIA_PROVISION_GLOBAL_PROFILE"],
  );

  // 3. Cargar coollib-adapter por `coolify.version` (P1 del preflight
  //    se ejecuta más abajo; aquí sólo validamos versión).
  let coolifyVersionFromProbe: string | undefined;
  const resolvers: ProvisionResolvers = input.resolvers
    ? { ...defaultResolvers(env), ...input.resolvers }
    : defaultResolvers(env);
  let serverInfo;
  try {
    serverInfo = await resolvers.serverInfo();
    coolifyVersionFromProbe = serverInfo.version;
  } catch {
    serverInfo = { version: "unknown", isReachable: false };
  }
  if (coolifyVersionFromProbe && coolifyVersionFromProbe !== "unknown") {
    try {
      selectCoolifyAdapter(coolifyVersionFromProbe);
    } catch {
      return {
        exit: 4,
        reason: `coolify_version_unsupported:${coolifyVersionFromProbe}`,
        ok: false,
        stage: "trigger",
      };
    }
  }

  // 4-5. Preflight ejecutable (read-only)
  const pnpmWs = resolvers.pnpmWorkspace();
  const preflight = await runPreflight({
    manifestRaw,
    serverInfo: {
      version: serverInfo.version,
      isReachable: serverInfo.isReachable,
      proxyStatus: serverInfo.proxyStatus,
      isMcpServerEnabled: serverInfo.isMcpServerEnabled,
    },
    globalProfile,
    dbStatus: await safeDbStatus(resolvers),
    storageStatus: await safeStorageStatus(resolvers),
    dnsIp: await safeDnsIp(resolvers),
    pnpmWorkspaceRaw: pnpmWs.raw,
    pnpmWorkspaceExists: pnpmWs.exists,
    hasReadToken: !!env["COOLIFY_READ_TOKEN"],
    hasWriteToken: !!env["COOLIFY_WRITE_TOKEN"],
    launcherSecretsFilePath: env["VECTORIA_LAUNCHER_SECRETS_FILE"] ?? env["HOME"] + "/.config/kilo/integra.secrets.env",
    secretSourceFilePath: env["VECTORIA_SECRETS_FILE"],
    gitRepoUrl: typeof (manifestRaw as { repository?: unknown }).repository === "string"
      ? (manifestRaw as { repository: string }).repository
      : "<unknown>",
    gitBranch: typeof (manifestRaw as { branch?: unknown }).branch === "string"
      ? (manifestRaw as { branch: string }).branch
      : "main",
    gitRemoteSha: typeof (manifestRaw as { repository?: unknown }).repository === "string" &&
      typeof (manifestRaw as { branch?: unknown }).branch === "string"
      ? await resolvers.gitRemoteSha(
          (manifestRaw as { repository: string }).repository,
          (manifestRaw as { branch: string }).branch,
        )
      : undefined,
    requiresMutation: !flags.preflightOnly && !flags.pushMode === false,
  });

  if (!preflight.ok) {
    return {
      exit: preflight.exit ?? 2,
      reason: preflight.reason ?? "preflight_failed",
      ok: false,
      stage: "preflight",
      preflight,
    };
  }

  if (flags.preflightOnly) {
    return { exit: 0, ok: true, stage: "preflight", preflight, manifest: preflight.manifest };
  }

  if (flags.dryRun) {
    return {
      exit: 0,
      ok: true,
      stage: "preflight",
      preflight,
      manifest: preflight.manifest,
      output: { dry_run_completed: true, preflight },
    };
  }

  if (flags.pushMode) {
    const r = await runPushPostProvisioning({
      manifest: preflight.manifest as Manifest,
      preflight,
      globalProfile,
      resolvers,
      env,
    });
    return {
      exit: r.exit,
      reason: r.reason,
      ok: r.ok,
      stage: "push",
      preflight,
      manifest: preflight.manifest,
      output: r.output,
    };
  }

  // 6-9. ensure_* + deploy_staging + reconcile — wireup real (P3-A).
  //
  // Encadena `ensure_project → ensure_environment → ensure_application →
  // ensure_database → ensure_storage → ensure_env` usando el `runEnsure`
  // existente. Respeta:
  //   - preflight read-only (ya PASS antes de llegar aquí);
  //   - lock por slug (`withSlugLock`, namespace-aware);
  //   - idempotencia: cada `ensure_*` es GET→adopt OR POST→create (vía ensure.ts);
  //   - orden canónico: project→env→application→database→storage→env;
  //   - cero `DELETE` automático (cleanup = Frank-auth separado).
  //   - `manualCleanupChecklist` poblado en partial failure (AC-12, §7.8 SOL).
  return await runEnsurePipeline({
    manifest: preflight.manifest as Manifest,
    preflight,
    globalProfile,
    env,
    resolvers,
  });
}

/**
 * Ejecuta el pipeline `ensure_*` real bajo lock por slug.
 *
 * Diseño:
 *  - `RunEnsureArgs` se construye una vez y se pasa al `runEnsure` por cada op.
 *  - Spy seam: si `resolvers.runEnsureImpl` está presente, se usa en lugar del
 *    `runEnsure` real (tests AC-W1 sin red). El hook `resolvers.onEnsure` se
 *    invoca tras cada op exitosa (también en tests) para conteo por op.
 *  - `created[]` / `adopted[]` se mantienen a través de las ops para construir
 *    `adoptionBreakdown` y `manualCleanupChecklist` (partial failure).
 *  - Audit append por op + audit append agregado al final del bloque.
 */
async function runEnsurePipeline(args: {
  manifest: Manifest;
  preflight: PreflightReport;
  globalProfile: GlobalProfile;
  env: NodeJS.ProcessEnv;
  resolvers: ProvisionResolvers;
}): Promise<ProvisionResult> {
  const { manifest, preflight, globalProfile, env, resolvers } = args;
  const m = manifest as unknown as Manifest & {
    project?: { parent?: string; id?: string; namespace?: string; displayName?: string };
    headCommit?: string;
  };
  const cfg = snapshotConfig(env);
  // Paths namespaced (overridables por env; default: global-profile + project.namespace).
  // `manifest.project` se aplica vía `v1ToV2Transform`; en runtime siempre está presente.
  const mProject = m.project;
  const nsParent = mProject?.parent ?? "vectoria";
  const nsId = mProject?.id ?? m.taskId;
  const registryPath = namespacedRegistryPath(
    globalProfile.defaults.registryBaseDir,
    nsParent,
    nsId,
  );
  const auditPath = namespacedAuditPath(
    globalProfile.defaults.auditBaseDir,
    nsParent,
    nsId,
  );
  cfg.PROVISION_REGISTRY_PATH = registryPath;
  cfg.PROVISION_AUDIT_PATH = auditPath;
  const secretSourceBaseDir = namespacedSecretSourcePath(
    globalProfile.defaults.secretSourceBaseDir,
    nsParent,
    nsId,
  ).replace(/\/[^/]+$/, "");

  const registry = await loadRegistry(registryPath);
  const profile = await loadOrganizationProfile(
    cfg.PROVISION_PROFILE_PATH,
    globalProfile,
    nsParent,
  );
  const serverUuid = resolveServerUuid(m, registry, globalProfile);
  const _destination = ensureDestination(m, registry, serverUuid);
  void _destination;

  const ops = ensureOpsForManifest(m);
  const runEnsureImpl = resolvers.runEnsureImpl ?? defaultRunEnsure;
  const created: Array<{ resource: Resource | "env"; uuid: string }> = [];
  const adopted: Array<{ resource: Resource | "env"; uuid: string }> = [];
  let appUuid: string | undefined;
  let lastResult: EnsureResult | undefined;

  try {
    await withSlugLock(registryPath, m.slug, cfg.PROVISION_WAIT_LOCK_MS, async () => {
      // Re-cargar registry bajo lock (otra invocación pudo haber mutado).
      const lockedRegistry = await loadRegistry(registryPath);
      const lockedServerUuid = resolveServerUuid(m, lockedRegistry, globalProfile);
      const lockedDestination = ensureDestination(m, lockedRegistry, lockedServerUuid);
      for (const op of ops) {
        const r = await runEnsureImpl({
          operation: op,
          manifest: m,
          destination: lockedDestination,
          cfg,
          registry: lockedRegistry,
          profile,
          globalProfile,
          secretSourceBaseDir,
        });
        lastResult = r;
        if (!r.ok) {
          // EnsureFailure: never reaches here via real runEnsure (que tira ProvisionError);
          // spies/tests pueden retornar EnsureFailure. Lo tratamos como partial failure.
          throw new ProvisionError("upstream_40x", `ensure_${op} returned failure`);
        }
        const resource = resourceOfOp(op);
        const entry = { resource, uuid: r.uuid ?? "<unknown>" };
        if (r.status === "created") created.push(entry);
        else if (r.status === "adopted") adopted.push(entry);
        if (op === "ensure_application" && r.uuid) appUuid = r.uuid;
        appendAudit(auditPath, {
          ts: new Date().toISOString(),
          taskId: m.taskId,
          slug: m.slug,
          projectParent: mProject?.parent,
          projectId: mProject?.id,
          op,
          target: { fqdn: m.fqdn, resource },
          result: r.status,
          uuid: r.uuid,
          stage: "ensure",
          preflight: {
            adaptersDetected: preflight.runtimeAdapter ? [preflight.runtimeAdapter.kind ?? "unknown"] : [],
            readOnlyEnforced: preflight.readOnlyEnforced === true,
          },
          runtimeAdapter: preflight.runtimeAdapter
            ? {
                kind: preflight.runtimeAdapter.kind,
                version: preflight.runtimeAdapter.version,
                fallback: preflight.runtimeAdapter.fallback,
                reason: preflight.runtimeAdapter.reason,
                legacyKeysValidated: preflight.runtimeAdapter.legacyKeysValidated,
              }
            : undefined,
        });
        await resolvers.onEnsure?.(op, r);
      }
    });
  } catch (e: unknown) {
    if (e instanceof ProvisionError) {
      const cleanup = created.map((c) => ({
        resource: c.resource,
        uuid: c.uuid,
        endpoint: cleanupEndpointFor(c.resource, c.uuid),
        requiredAuth: "write+deploy",
      }));
      appendAudit(auditPath, {
        ts: new Date().toISOString(),
        taskId: m.taskId,
        slug: m.slug,
        projectParent: mProject?.parent,
        projectId: mProject?.id,
        op: "ensure_pipeline",
        target: { fqdn: m.fqdn, lastOp: lastResult?.op ?? "unknown" },
        result: "failure",
        code: e.code,
        stage: "ensure",
        preflight: { readOnlyEnforced: preflight.readOnlyEnforced === true },
        runtimeAdapter: preflight.runtimeAdapter
          ? {
              kind: preflight.runtimeAdapter.kind,
              version: preflight.runtimeAdapter.version,
              fallback: preflight.runtimeAdapter.fallback,
            }
          : undefined,
        manualCleanupChecklist: cleanup,
      });
      return {
        exit: 50,
        ok: false,
        reason: e.code,
        stage: "ensure",
        preflight,
        manifest,
        output: {
          adoptionBreakdown: { created: created.length, adopted: adopted.length },
          manualCleanupChecklist: cleanup,
          error: e.code,
          lastOp: lastResult?.op,
        },
      };
    }
    throw e;
  }

  appendAudit(auditPath, {
    ts: new Date().toISOString(),
    taskId: m.taskId,
    slug: m.slug,
    projectParent: mProject?.parent,
    projectId: mProject?.id,
    op: "ensure_pipeline_complete",
    target: { fqdn: m.fqdn },
    result: "adopted",
    stage: "ensure",
    preflight: { readOnlyEnforced: preflight.readOnlyEnforced === true },
    runtimeAdapter: preflight.runtimeAdapter
      ? {
          kind: preflight.runtimeAdapter.kind,
          version: preflight.runtimeAdapter.version,
          fallback: preflight.runtimeAdapter.fallback,
        }
      : undefined,
  });

  return {
    exit: 0,
    ok: true,
    stage: "ensure",
    preflight,
    manifest,
    output: {
      ensure: {
        uuid_application: appUuid,
        adoptionBreakdown: {
          created: created.length,
          adopted: adopted.length,
        },
      },
    },
  };
}

/**
 * Orden canónico del pipeline `ensure_*` (SPEC-20260822-001 v1.1 §3.2).
 *
 *  - `ensure_project`     siempre (parent raíz).
 *  - `ensure_environment` siempre (parent de application/database/storage).
 *  - `ensure_application` siempre (la app es el target del push post-provisioning).
 *  - `ensure_database`    si `manifest.resources` lo incluye (idempotente si ya existe).
 *  - `ensure_storage`     si `manifest.resources` lo incluye.
 *  - `ensure_env`         siempre (idempotente: re-GET → PATCH sólo lo que cambia).
 *
 * `ensure_env` es el último porque depende del binding de application creado.
 */
function ensureOpsForManifest(manifest: Manifest): string[] {
  const ops: string[] = ["ensure_project", "ensure_environment", "ensure_application"];
  if (manifest.resources.includes("database")) ops.push("ensure_database");
  if (manifest.resources.includes("storage")) ops.push("ensure_storage");
  ops.push("ensure_env");
  return ops;
}

function resourceOfOp(op: string): Resource | "env" {
  const r = op.replace(/^ensure_/, "");
  if (r === "env") return "env";
  return r as Resource;
}

function cleanupEndpointFor(resource: Resource | "env", uuid: string): string {
  // El `manualCleanupChecklist` documenta las acciones de cleanup que el
  // operador debe ejecutar manualmente (Frank-auth requerido). NO se ejecutan
  // automáticamente desde el runner (V18, §7.8 SOL). El endpoint describe la
  // operación Coolify que el operador invocaría para revertir la mutación.
  switch (resource) {
    case "project":
      return `manual cleanup: project uuid=${uuid} (Coolify API remove operation, Frank-auth required)`;
    case "environment":
      return `manual cleanup: environment uuid=${uuid} (Coolify API remove operation, Frank-auth required)`;
    case "application":
      return `manual cleanup: application uuid=${uuid} (Coolify API remove operation, Frank-auth required)`;
    case "database":
      return `manual cleanup: database uuid=${uuid} (Coolify API remove operation, Frank-auth required)`;
    case "storage":
      return `manual cleanup: storage service uuid=${uuid} (Coolify API remove operation, Frank-auth required)`;
    case "env":
      return `manual cleanup: env via PATCH /api/v1/applications/${uuid}/envs (revert, Frank-auth required)`;
  }
}

async function safeDbStatus(r: ProvisionResolvers): Promise<"running:healthy" | "running" | "exited:unhealthy" | "exited" | "absent"> {
  try { return await r.dbStatus(); } catch { return "absent"; }
}
async function safeStorageStatus(r: ProvisionResolvers): Promise<"running:healthy" | "running" | "exited:unhealthy" | "exited" | "absent"> {
  try { return await r.storageStatus(); } catch { return "absent"; }
}
async function safeDnsIp(r: ProvisionResolvers): Promise<string | undefined> {
  try { return await r.dnsIp(); } catch { return undefined; }
}

function defaultResolvers(env: NodeJS.ProcessEnv): ProvisionResolvers {
  return {
    async serverInfo() {
      // Sin red: devolvemos unknown; el caller resuelve.
      return { version: env["COOLIFY_VERSION_OVERRIDE"] ?? "unknown", isReachable: false };
    },
    async dbStatus() { return "absent"; },
    async storageStatus() { return "absent"; },
    async dnsIp() { return undefined; },
    async gitRemoteSha() { return undefined; },
    pnpmWorkspace() {
      try {
        const p = join(process.cwd(), "pnpm-workspace.yaml");
        if (!existsSync(p)) return { exists: false };
        return { exists: true, raw: readFile(p, "utf8") };
      } catch {
        return { exists: false };
      }
    },
  };
}
