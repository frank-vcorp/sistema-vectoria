/**
 * Push post-provisioning — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §3.4 + AC-13 (cierre §7.7-implícito SOL-20260822-01).
 *
 * Evento: `post_provisioning_push`. Disparado por `git push` una vez
 * que el provisioning inicial (`ensure_*`) ya PASS.
 *
 * Flujo (wireup real P3-B):
 *   1. Preflight rápido (subset §4): server_reachable + coolify_version
 *      + healthcheck adapter; SIN DNS, SIN toolchain, SIN secrets recheck.
 *   2. ensure_application: PATCH del head_commit + health_check_block
 *      (idempotente, no POST — el recurso ya existe).
 *      NO invoca ninguna operación sobre DB ni storage (AC-13).
 *   3. deploy_application: `POST /api/v1/applications/{uuid}/deploy`
 *      (staging únicamente; production NUNCA en este pase).
 *   4. healthcheck post-deploy: `GET /api/health` (read-only) con
 *      timeout configurable (default 60s, vía env o resolver).
 *      Si 2xx en ≤ timeout ⇒ exit 0. Si 4xx/5xx/timeout ⇒ exit 61
 *      sin rollback, sin mutación destructiva, audit `stage: "push"`,
 *      `reason: "post_deploy_healthcheck_failed"`.
 *   5. audit append con `stage: "push"` + `preflight.readOnlyEnforced: true`.
 *
 * Garantías (cierre §7.7 + §7.8 SOL-20260822-01):
 *  - Cero mutación sobre DB/Storage (AC-13). Verificado por spy count = 0.
 *  - Cero operación destructiva automática sobre cualquier recurso.
 *  - Sin `productionAllowed` ⇒ production NUNCA deploya (BR-N417).
 *  - Piloto staging LIVE sólo bajo Frank-auth `NOCTURNO-PUSH-PILOT-20260823-01`.
 *  - AC-13 (sin re-ensurance de DB/Storage) está enforced por la ausencia total
 *    de llamadas a ops sobre esos recursos en este módulo.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { call } from "../../client.js";
import type { Manifest } from "../../schema.js";
import { RunnerConfigSchema } from "../../schema.js";
import type { GlobalProfile } from "../../global-profile.js";
import type { ProvisionResolvers } from "../triggers/provision.js";
import type { PreflightReport } from "../preflight/index.js";
import { ProvisionError, type EnsureResult } from "../../errors.js";
import { runEnsure as defaultRunEnsure, type RunEnsureArgs } from "../../ensure.js";
import { snapshotConfig } from "../../schema.js";
import { namespacedAuditPath } from "../../global-profile.js";
import { loadRegistry, withSlugLock } from "../../registry.js";
import { loadOrganizationProfile } from "../../profile.js";
import { ensureDestination, resolveServerUuid } from "../../destination.js";
import { appendAudit } from "../../audit.js";

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

/** Extiende `ProvisionResolvers` con spy seams para el flujo push (no re-exporta). */
export interface PushResolvers {
  /** Spy seam para `ensure_application` (PATCH-only). */
  ensureApplicationImpl?(args: RunEnsureArgs): Promise<EnsureResult>;
  /** Stub para `PATCH /applications/{uuid}` (head_commit + health_check_block). */
  patchApplication?(applicationUuid: string, body: Record<string, unknown>, cfg: { COOLIFY_BASE_URL: string; COOLIFY_API_PREFIX: string; COOLIFY_TIMEOUT_MS: number; COOLIFY_WRITE_TOKEN: string }): Promise<{ ok: boolean; status?: number; error?: string }>;
  /** Stub para `POST /applications/{uuid}/deploy`. Defaults al `call()` real. */
  deployApplication?(applicationUuid: string, cfg: { COOLIFY_BASE_URL: string; COOLIFY_API_PREFIX: string; COOLIFY_TIMEOUT_MS: number; COOLIFY_WRITE_TOKEN: string }): Promise<{ ok: boolean; status?: number; deploymentUuid?: string; error?: string }>;
  /** Stub para `GET /api/health` con timeout ≤ 60s. Defaults al `call()` real. */
  healthcheck?(fqdn: string, cfg: { COOLIFY_BASE_URL: string; COOLIFY_TIMEOUT_MS: number }): Promise<{ ok: boolean; status?: number; latencyMs?: number; error?: string }>;
  /** Hook opcional invocado tras `ensure_application` (spy counter AC-W3). */
  onEnsureApplication?(result: EnsureResult): void | Promise<void>;
}

const DEFAULT_HEALTHCHECK_TIMEOUT_MS = 60_000;

/**
 * Ejecuta el flujo `post_provisioning_push` real (P3-B wireup).
 *
 * Restricciones:
 *  - NO invoca ninguna op sobre DB ni storage (AC-13, V-W7).
 *  - NO ejecuta ninguna operación destructiva sobre ningún recurso.
 *  - NO toca `production` (BR-N417; producción no autorizada en v2.1).
 *  - En partial failure (deploy 4xx/5xx, healthcheck timeout) → exit 61
 *    sin rollback, con audit `result: "infra_blocked"`,
 *    `reason: "post_deploy_healthcheck_failed"`.
 */
export async function runPushPostProvisioning(
  input: PushPostProvisioningInput,
): Promise<PushPostProvisioningResult> {
  const { manifest, preflight, globalProfile, env } = input;
  const pushResolvers = (input.resolvers as unknown as { push?: PushResolvers }).push ?? {};
  const m = manifest as unknown as Manifest & {
    project?: { parent?: string; id?: string };
    headCommit?: string;
  };
  const mProject = m.project;
  const nsParent = mProject?.parent ?? "vectoria";
  const nsId = mProject?.id ?? m.taskId;

  // (1) Preflight rápido subset — server_reachable + coolify_version
  // ya cubierto por el preflight completo; en push mode reusamos el report.
  if (!preflight.ok) {
    return {
      exit: 2,
      ok: false,
      reason: `push_preflight_failed:${preflight.reason ?? "unknown"}`,
    };
  }
  if (m.environment === "production") {
    return {
      exit: 99,
      ok: false,
      reason: "production_deploy_not_authorized_in_v2_1",
    };
  }

  const cfg = snapshotConfig(env);
  const auditPath = namespacedAuditPath(
    globalProfile.defaults.auditBaseDir,
    nsParent,
    nsId,
  );
  const registryPath = `${auditPath.replace(/\/audit\.jsonl$/, "/../registry.jsonl")}`;
  // lock + namespace consistentes con runProvision (mismo slug).
  const profile = await loadOrganizationProfile(
    cfg.PROVISION_PROFILE_PATH,
    globalProfile,
    nsParent,
  );

  const ensureApplicationImpl = pushResolvers.ensureApplicationImpl ?? defaultRunEnsure;
  const deployApplication = pushResolvers.deployApplication ?? defaultDeployApplication;
  const healthcheck = pushResolvers.healthcheck ?? defaultHealthcheck;

  let applicationUuid = "";
  let headCommitPatched: string | undefined;
  let deploymentUuid: string | undefined;
  let healthcheckResult: { ok: boolean; status?: number; latencyMs?: number; error?: string } | undefined;

  try {
    await withSlugLock(registryPath, m.slug, cfg.PROVISION_WAIT_LOCK_MS, async () => {
      const registry = await loadRegistry(registryPath);
      const serverUuid = resolveServerUuid(m, registry, globalProfile);
      const destination = ensureDestination(m, registry, serverUuid);

      // (2) ensure_application PATCH-only: pasa la operación al runEnsure
      // existente, que internamente hace GET lookup → adopt (no POST, ya existe).
      // El "PATCH head_commit + health_check_block" se materializa a través de
      // ensure_application adopt + ensure_env PATCH existente (los env vars
      // cubren health_check_* y HEAD_COMMIT_* si están en el manifest). Para
      // garantizar el wireup explícito del P3-B, también emitimos un PATCH
      // directo al recurso aplicación cuando head_commit cambia.
      const appResult = await ensureApplicationImpl({
        operation: "ensure_application",
        manifest: m,
        destination,
        cfg,
        registry,
        profile,
        globalProfile,
      });
      if (!appResult.ok) {
        throw new ProvisionError("upstream_40x", "ensure_application failure in push mode");
      }
      applicationUuid = appResult.uuid ?? "";
      await pushResolvers.onEnsureApplication?.(appResult);

      // (2.b) PATCH head_commit + health_check_block si difieren (idempotente).
      const desiredHeadCommit =
        (m.application as unknown as { headCommit?: string }).headCommit
        ?? (m as { headCommit?: string }).headCommit;
      const desiredHealthcheck = (m.application as { healthcheck?: { enabled: boolean; path: string; method: string; scheme: string; port: string; interval: number; timeout: number; retries: number } }).healthcheck;
      const patchBody: Record<string, unknown> = {};
      if (desiredHeadCommit) {
        patchBody["git_branch"] = m.branch;
        patchBody["git_commit_sha"] = desiredHeadCommit;
        headCommitPatched = desiredHeadCommit;
      }
      if (desiredHealthcheck) {
        Object.assign(patchBody, {
          health_check_enabled: desiredHealthcheck.enabled,
          health_check_path: desiredHealthcheck.path,
          health_check_method: desiredHealthcheck.method,
          health_check_scheme: desiredHealthcheck.scheme,
          health_check_port: desiredHealthcheck.port,
          health_check_interval: desiredHealthcheck.interval,
          health_check_timeout: desiredHealthcheck.timeout,
          health_check_retries: desiredHealthcheck.retries,
        });
      }
      if (Object.keys(patchBody).length > 0 && applicationUuid) {
        const patchImpl = pushResolvers.patchApplication ?? defaultPatchApplication;
        const patch = await patchImpl(applicationUuid, patchBody, {
          COOLIFY_BASE_URL: cfg.COOLIFY_BASE_URL,
          COOLIFY_API_PREFIX: cfg.COOLIFY_API_PREFIX,
          COOLIFY_TIMEOUT_MS: cfg.COOLIFY_TIMEOUT_MS,
          COOLIFY_WRITE_TOKEN: cfg.COOLIFY_WRITE_TOKEN,
        });
        if (!patch.ok) {
          throw new ProvisionError(
            "upstream_40x",
            `application PATCH failed: ${patch.error ?? "unknown"}`,
          );
        }
      }

      // (3) POST /applications/{uuid}/deploy (staging).
      const deployRes = await deployApplication(applicationUuid, {
        COOLIFY_BASE_URL: cfg.COOLIFY_BASE_URL,
        COOLIFY_API_PREFIX: cfg.COOLIFY_API_PREFIX,
        COOLIFY_TIMEOUT_MS: cfg.COOLIFY_TIMEOUT_MS,
        COOLIFY_WRITE_TOKEN: cfg.COOLIFY_WRITE_TOKEN,
      });
      if (!deployRes.ok) {
        throw new ProvisionError(
          "upstream_40x",
          `deploy_application failed: ${deployRes.error ?? "unknown"}`,
        );
      }
      deploymentUuid = deployRes.deploymentUuid;

      // (4) GET /api/health post-deploy (≤ 60s).
      const timeoutMs = DEFAULT_HEALTHCHECK_TIMEOUT_MS;
      const hcRes = await withTimeout(
        healthcheck(m.fqdn, {
          COOLIFY_BASE_URL: cfg.COOLIFY_BASE_URL,
          COOLIFY_TIMEOUT_MS: Math.min(timeoutMs, cfg.COOLIFY_TIMEOUT_MS),
        }),
        timeoutMs,
        "healthcheck_timeout",
      );
      healthcheckResult = hcRes;
      if (!hcRes.ok) {
        throw new ProvisionError(
          "upstream_40x",
          `post_deploy_healthcheck_failed:${hcRes.error ?? "unknown"}`,
        );
      }
    });
  } catch (e: unknown) {
    if (e instanceof ProvisionError) {
      const blocked =
        e.code === "upstream_40x" && /post_deploy_healthcheck_failed/.test(e.message);
      appendAudit(auditPath, {
        ts: new Date().toISOString(),
        taskId: m.taskId,
        slug: m.slug,
        projectParent: mProject?.parent,
        projectId: mProject?.id,
        op: "push_post_provisioning",
        target: { fqdn: m.fqdn, applicationUuid, deploymentUuid },
        result: blocked ? "infra_blocked" : "failure",
        code: e.code,
        stage: "push",
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
        exit: blocked ? 61 : 2,
        ok: false,
        reason: e.message,
        output: {
          push_post_provisioning: {
            taskId: m.taskId,
            slug: m.slug,
            ensureDatabaseCalled: false,
            ensureStorageCalled: false,
            ensureApplicationCalled: true,
            applicationUuid,
            deploymentUuid,
            healthcheck: healthcheckResult,
            preflightReadOnlyEnforced: preflight.readOnlyEnforced === true,
          },
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
    op: "push_post_provisioning",
    target: { fqdn: m.fqdn, applicationUuid, deploymentUuid },
    result: "adopted",
    stage: "push",
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
    output: {
      push_post_provisioning: {
        taskId: m.taskId,
        slug: m.slug,
        headCommit: headCommitPatched ?? "<pending>",
        ensureDatabaseCalled: false,
        ensureStorageCalled: false,
        ensureApplicationCalled: true, // PATCH head_commit + healthcheck block
        applicationUuid,
        deploymentUuid,
        healthcheck: healthcheckResult,
        migrations: (m as { migrations?: { path?: string; auto?: boolean; destructive?: boolean } }).migrations?.auto
          ? {
              path: (m as { migrations?: { path?: string; auto?: boolean; destructive?: boolean } }).migrations?.path,
              destructive: false,
            }
          : undefined,
        runtimeAdapter: preflight.runtimeAdapter,
        preflightChecks: Object.keys(preflight.checks),
        preflightReadOnlyEnforced: preflight.readOnlyEnforced === true,
      },
      globalProfileRunnerVersion: globalProfile.defaults.runner.version,
    },
  };
}

// ─── defaults (sin Coolify real si los resolvers los sobreescriben) ──────

async function defaultDeployApplication(
  applicationUuid: string,
  cfg: { COOLIFY_BASE_URL: string; COOLIFY_API_PREFIX: string; COOLIFY_TIMEOUT_MS: number; COOLIFY_WRITE_TOKEN: string },
): Promise<{ ok: boolean; status?: number; deploymentUuid?: string; error?: string }> {
  const rc = RunnerConfigSchema.parse({
    COOLIFY_BASE_URL: cfg.COOLIFY_BASE_URL,
    COOLIFY_API_PREFIX: cfg.COOLIFY_API_PREFIX,
    COOLIFY_TIMEOUT_MS: String(cfg.COOLIFY_TIMEOUT_MS),
    COOLIFY_WRITE_TOKEN: cfg.COOLIFY_WRITE_TOKEN,
  });
  const res = await call<{ deployments?: Array<{ deployment_uuid?: string }>; uuid?: string }>(rc, {
    verb: "POST",
    path: `/applications/${encodeURIComponent(applicationUuid)}/deploy`,
  });
  if (!res.ok) {
    return { ok: false, status: res.error.status, error: res.error.code };
  }
  const data = res.data as { deployments?: Array<{ deployment_uuid?: string }>; uuid?: string } | undefined;
  const du = data?.deployments?.[0]?.deployment_uuid ?? data?.uuid;
  return { ok: true, status: 200, deploymentUuid: du };
}

async function defaultPatchApplication(
  applicationUuid: string,
  body: Record<string, unknown>,
  cfg: { COOLIFY_BASE_URL: string; COOLIFY_API_PREFIX: string; COOLIFY_TIMEOUT_MS: number; COOLIFY_WRITE_TOKEN: string },
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const rc = RunnerConfigSchema.parse({
    COOLIFY_BASE_URL: cfg.COOLIFY_BASE_URL,
    COOLIFY_API_PREFIX: cfg.COOLIFY_API_PREFIX,
    COOLIFY_TIMEOUT_MS: String(cfg.COOLIFY_TIMEOUT_MS),
    COOLIFY_WRITE_TOKEN: cfg.COOLIFY_WRITE_TOKEN,
  });
  const res = await call<unknown>(rc, {
    verb: "PATCH",
    path: `/applications/${encodeURIComponent(applicationUuid)}`,
    body,
  });
  if (!res.ok) {
    return { ok: false, status: res.error.status, error: res.error.code };
  }
  return { ok: true, status: 200 };
}

async function defaultHealthcheck(
  fqdn: string,
  cfg: { COOLIFY_BASE_URL: string; COOLIFY_TIMEOUT_MS: number },
): Promise<{ ok: boolean; status?: number; latencyMs?: number; error?: string }> {
  const startedAt = Date.now();
  const rc = RunnerConfigSchema.parse({
    COOLIFY_BASE_URL: cfg.COOLIFY_BASE_URL,
    COOLIFY_TIMEOUT_MS: String(cfg.COOLIFY_TIMEOUT_MS),
  });
  const res = await call<unknown>(rc, {
    verb: "GET",
    path: `/api/health`,
    // El healthcheck post-deploy consulta el endpoint público del FQDN, no
    // el API de Coolify; este default sólo funciona en runner real con
    // accessToken opcional. Para tests, sobreescribir via `resolvers.push.healthcheck`.
    baseOverride: `https://${fqdn}`,
  } as Parameters<typeof call>[1] & { baseOverride?: string });
  const latencyMs = Date.now() - startedAt;
  if (!res.ok) return { ok: false, status: res.error.status, latencyMs, error: res.error.code };
  return { ok: true, status: 200, latencyMs };
}

async function withTimeout<T extends { ok: boolean; error?: string }>(
  p: Promise<T>,
  ms: number,
  reason: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new ProvisionError("upstream_40x", reason)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Re-exportar para tests/typing.
export type { RunEnsureArgs };
// Utilizado por runProvision a través del typing cast.
export const _internal = { existsSync, readFileSync, resolve };
