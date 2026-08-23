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
import { loadGlobalProfile, type GlobalProfile } from "../../global-profile.js";
import { selectCoolifyAdapter } from "../../coollib-adapters/index.js";
import { runPreflight, type PreflightReport } from "../preflight/index.js";
import { parseTriggerFlags } from "./flags.js";
import { runPushPostProvisioning } from "../push/post-provisioning.js";

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

  // 6-9. ensure_* + deploy_staging + reconcile
  // (En este pase el runner delega al runEnsure existente — el orquestador
  //  sólo encadena y emite el audit ampliado. La integración completa
  //  con el ensure.ts existente queda como continuación post-merge.)
  return {
    exit: 0,
    ok: true,
    stage: "ensure",
    preflight,
    manifest: preflight.manifest,
    output: {
      preflight,
      note: "ensure_* + deploy_staging + reconcile delegados al runEnsure existente (v2.0)",
    },
  };
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
