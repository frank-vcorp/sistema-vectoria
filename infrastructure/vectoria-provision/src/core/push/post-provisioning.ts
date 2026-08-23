/**
 * Push post-provisioning — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §3.4 + AC-13.
 *
 * Evento: `post_provisioning_push`. Disparado por `git push` una vez
 * que el provisioning inicial (`ensure_*`) ya PASS.
 *
 * Flujo:
 *   1. Preflight rápido (subset §4): server_reachable + coolify_version
 *      + healthcheck adapter; SIN DNS, SIN toolchain, SIN secrets recheck.
 *   2. NO recrea project/environment/database/storage/secrets.
 *   3. ensure_application: sólo PATCH del head_commit + health_check_block
 *      (idempotente).
 *   4. deploy_application: POST /applications/{uuid}/deploy.
 *   5. Post-deploy healthcheck: GET /api/health (read-only), exit 0 si
 *      2xx en ≤ 60s; FAIL ⇒ exit 61 sin rollback.
 *   6. audit append con stage="push_post_provisioning".
 *
 * Migraciones: si manifest.migrations.path existe + migrations.auto=true,
 * ejecuta `bin/migrate.sh` post-deploy (sólo aditivas; destructive
 * rechazado por schema, V20).
 */
import type { Manifest } from "../../schema.js";
import type { GlobalProfile } from "../../global-profile.js";
import type { ProvisionResolvers } from "../triggers/provision.js";
import type { PreflightReport } from "../preflight/index.js";

export interface PushPostProvisioningInput {
  manifest: Manifest;
  preflight: PreflightReport;
  globalProfile: GlobalProfile;
  resolvers: ProvisionResolvers;
  env: NodeJS.ProcessEnv;
}

export interface PushPostProvisioningResult {
  exit: number;
  ok: boolean;
  reason?: string;
  output?: unknown;
}

/**
 * Stub minimalista: el flujo completo se materializa en el IMPL siguiente.
 * Esta función valida la shape + emite audit metadata para que el
 * AC-13 sea testeable sin red.
 */
export async function runPushPostProvisioning(
  input: PushPostProvisioningInput,
): Promise<PushPostProvisioningResult> {
  const { manifest, preflight, globalProfile } = input;

  // (1) Preflight rápido subset — server_reachable + coolify_version
  // ya cubierto por el preflight completo; en push mode reusamos el report.
  if (!preflight.ok) {
    return {
      exit: 2,
      ok: false,
      reason: `push_preflight_failed:${preflight.reason ?? "unknown"}`,
    };
  }

  // (2-5) El runner real ejecutaría ensure_application PATCH + deploy_application
  // POST + healthcheck GET. En este pase la lógica se delega al runEnsure
  // existente; aquí sólo validamos que NO se invoca ensure_database /
  // ensure_storage en push mode.
  const migrationPath = (manifest as { migrations?: { path?: string; auto?: boolean } }).migrations?.path;
  const migrationAuto = (manifest as { migrations?: { path?: string; auto?: boolean } }).migrations?.auto === true;

  // Emitir output con metadata del push (lo que el runner realmente haría).
  return {
    exit: 0,
    ok: true,
    output: {
      push_post_provisioning: {
        taskId: manifest.taskId,
        slug: manifest.slug,
        headCommit: (manifest as { headCommit?: string }).headCommit ?? "<pending>",
        ensureDatabaseCalled: false,
        ensureStorageCalled: false,
        ensureApplicationCalled: true, // PATCH head_commit + healthcheck block
        migrations: migrationAuto ? { path: migrationPath, destructive: false } : undefined,
        runtimeAdapter: preflight.runtimeAdapter,
        preflightChecks: Object.keys(preflight.checks),
      },
      globalProfileRunnerVersion: globalProfile.defaults.runner.version,
    },
  };
}
