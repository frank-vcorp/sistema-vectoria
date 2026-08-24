/**
 * Preflight orchestrator — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4 (cierre §7.3 SOL-20260822-01).
 *
 * Encadena todos los checks de §4.1. Cualquier FAIL → retorna blockers;
 * el caller aborta el trigger con `infra_blocked(<reason>)` y exit
 * code estable.
 *
 * El preflight es ESTRICTAMENTE read-only. El detector
 * `createReadOnlyEnforcement` envuelve `globalThis.fetch` y aborta
 * con exit 70 si cualquier check emite un verbo mutante (AC-09).
 *
 * Uso típico (en el trigger global):
 *
 * ```ts
 * const pre = await runPreflight({
 *   manifestRaw,
 *   serverInfo,
 *   globalProfile,
 *   dbStatus,
 *   storageStatus,
 *   dnsIp,
 *   pnpmWorkspaceRaw,
 *   requiresMutation: true, // ensure_* phase
 *   secretSourceFilePath,
 * });
 * if (!pre.ok) {
 *   return { exit: pre.exit, reason: pre.reason };
 * }
 * // proceed to ensure_*
 * ```
 */
import type { Manifest } from "../../schema.js";
import type { GlobalProfile } from "../../global-profile.js";
import { checkCoolifyVersion } from "./coolify-version.js";
import { checkServerReachable } from "./server-reachable.js";
import { checkDbStorageHealth, type ResourceHealthStatus } from "./db-storage-health.js";
import { checkAuthScopes } from "./auth-scopes.js";
import { checkDns } from "./dns.js";
import { checkToolchain } from "./toolchain.js";
import { checkSecrets } from "./secrets.js";
import { checkRuntimeAdapter } from "./runtime-adapter.js";
import { checkManifest } from "./manifest.js";
import { checkGitRemote } from "./git-remote.js";
import { checkHealthcheckRequired } from "./healthcheck-required.js";
import {
  createReadOnlyEnforcement,
  ReadOnlyViolation,
  type ReadOnlyEnforcement,
} from "./read-only-enforcement.js";

export interface PreflightInput {
  manifestRaw: unknown;
  serverInfo: {
    version: string;
    isReachable: boolean;
    proxyStatus?: string;
    isMcpServerEnabled?: boolean;
  };
  globalProfile: GlobalProfile;
  dbStatus?: ResourceHealthStatus;
  storageStatus?: ResourceHealthStatus;
  dnsIp: string | undefined;
  pnpmWorkspaceRaw: string | undefined;
  pnpmWorkspaceExists: boolean;
  hasReadToken: boolean;
  hasWriteToken: boolean;
  /** Path al archivo de secretos del launcher (integra.secrets.env). Contiene los tokens. */
  launcherSecretsFilePath: string | undefined;
  /** Path al archivo de secretos per-project (VECTORIA_SECRETS_FILE). Contiene vars de la app. */
  secretSourceFilePath: string | undefined;
  gitRepoUrl: string;
  gitBranch: string;
  gitRemoteSha: string | undefined;
  /** ¿La fase `ensure_*` requiere WRITE token? Default true. */
  requiresMutation: boolean;
}

export interface PreflightReport {
  ok: boolean;
  checks: Record<string, { ok: boolean; reason?: string; source?: string }>;
  drift: string[];
  /** Manifest ya validado (post-P13). Disponible para los callers. */
  manifest?: Manifest;
  /** Info de runtime adapter (post-P12). */
  runtimeAdapter?: {
    kind?: string;
    version?: string;
    fallback?: string;
    reason?: string;
    legacyKeysValidated?: string[];
  };
  readOnlyEnforced: boolean;
  /** Primer blocker (para exit code mapping). */
  exit?: number;
  reason?: string;
}

export async function runPreflight(input: PreflightInput): Promise<PreflightReport> {
  const drift: string[] = [];
  const checks: PreflightReport["checks"] = {};
  // Activar enforcement de read-only ANTES de cualquier check que pueda
  // hacer HTTP (P6 schema endpoints).
  const enforcement: ReadOnlyEnforcement = createReadOnlyEnforcement();

  // P13: manifest schema
  const m = checkManifest(input.manifestRaw);
  checks["manifest"] = { ok: m.ok, ...(m.reason ? { reason: m.reason } : {}) };
  if (!m.ok || !m.manifest) {
    drift.push("manifest_invalid");
    return {
      ok: false,
      checks,
      drift,
      readOnlyEnforced: enforcement.countMutations() === 0,
      exit: 3,
      reason: m.reason ?? "manifest_invalid_or_missing",
    };
  }
  const manifest = m.manifest;

  // P1: coolify version
  const cv = checkCoolifyVersion({ coolifyVersion: input.serverInfo.version });
  checks["coolifyVersion"] = { ok: cv.ok, reason: cv.reason };
  if (!cv.ok) {
    drift.push(`coolify_version_unsupported:${input.serverInfo.version}`);
    return {
      ok: false,
      checks,
      drift,
      manifest,
      readOnlyEnforced: enforcement.countMutations() === 0,
      exit: 4,
      reason: cv.reason ?? "coolify_version_unsupported",
    };
  }

  // P2/P3: server reachable + proxy healthy
  const sr = checkServerReachable({
    isReachable: input.serverInfo.isReachable,
    proxyStatus: input.serverInfo.proxyStatus,
  });
  checks["serverReachable"] = { ok: sr.ok, reason: sr.reason };
  if (!sr.ok) {
    drift.push(sr.reason ?? "server_unreachable");
    return {
      ok: false,
      checks,
      drift,
      manifest,
      readOnlyEnforced: enforcement.countMutations() === 0,
      exit: 2,
      reason: sr.reason ?? "server_unreachable",
    };
  }

  // P7: auth scopes (read-only, presencia de tokens)
  const as_ = checkAuthScopes({
    hasReadToken: input.hasReadToken,
    hasWriteToken: input.hasWriteToken,
    operation: input.requiresMutation ? "ensure" : "preflight-only",
  });
  checks["authScopes"] = { ok: as_.ok, reason: as_.reason };
  if (!as_.ok) {
    drift.push(as_.reason ?? "auth_scope_missing");
    return {
      ok: false,
      checks,
      drift,
      manifest,
      readOnlyEnforced: enforcement.countMutations() === 0,
      exit: 6,
      reason: as_.reason ?? "auth_scope_missing",
    };
  }

  // P12: runtime adapter (selector fail-closed)
  const rt = await checkRuntimeAdapter(manifest, input.secretSourceFilePath);
  let runtimeAdapter: PreflightReport["runtimeAdapter"];
  if (isRuntimeAdapterSuccess(rt)) {
    runtimeAdapter = rt.audit;
    checks["runtimeAdapter"] = { ok: true, reason: `kind=${rt.adapter.kind}` };
  } else {
    checks["runtimeAdapter"] = { ok: false, reason: rt.reason };
    drift.push(rt.reason);
    return {
      ok: false,
      checks,
      drift,
      manifest,
      readOnlyEnforced: enforcement.countMutations() === 0,
      exit: rt.exit,
      reason: rt.message ?? rt.reason,
    };
  }

  // P8: DNS
  const dns = checkDns({
    dnsIp: input.dnsIp,
    expectedIp: input.globalProfile.defaults.dnsExpectedIp,
  });
  checks["dns"] = { ok: dns.ok, reason: dns.reason };
  if (!dns.ok) {
    drift.push(dns.reason ?? "dns_unresolved");
    return {
      ok: false,
      checks,
      drift,
      manifest,
      runtimeAdapter,
      readOnlyEnforced: enforcement.countMutations() === 0,
      exit: 8,
      reason: dns.reason ?? "dns_unresolved",
    };
  }

  // P9/P11: toolchain
  const tc = checkToolchain({
    nodeVersion: process.versions.node,
    pnpmVersion: undefined, // runner no requiere pnpm en runtime; sólo al build
    pnpmWorkspaceRaw: input.pnpmWorkspaceRaw,
    pnpmWorkspaceExists: input.pnpmWorkspaceExists,
  });
  checks["toolchain"] = { ok: tc.ok, reason: tc.reason };
  if (!tc.ok) {
    drift.push(tc.reason ?? "toolchain_mismatch");
    return {
      ok: false,
      checks,
      drift,
      manifest,
      runtimeAdapter,
      readOnlyEnforced: enforcement.countMutations() === 0,
      exit: 9,
      reason: tc.reason ?? "toolchain_mismatch",
    };
  }

  // P10: secrets (launcher-level: verifica tokens del launcher, no per-project)
  const sec = checkSecrets({
    secretsFilePath: input.launcherSecretsFilePath,
    requiredKeys: ["COOLIFY_READ_TOKEN", "COOLIFY_WRITE_TOKEN", "SECRET_DERIVATION_ROOT"],
  });
  checks["secrets"] = { ok: sec.ok, reason: sec.reason };
  if (!sec.ok) {
    drift.push(sec.reason ?? "secret_source_keys_missing");
    return {
      ok: false,
      checks,
      drift,
      manifest,
      runtimeAdapter,
      readOnlyEnforced: enforcement.countMutations() === 0,
      exit: 10,
      reason: sec.reason ?? "secret_source_keys_missing",
    };
  }

  // P4/P5: DB / Storage health
  const ds = checkDbStorageHealth({
    dbStatus: input.dbStatus,
    storageStatus: input.storageStatus,
  });
  checks["dbStorageHealth"] = { ok: ds.ok, reason: ds.reason };
  if (!ds.ok) {
    drift.push(ds.reason ?? "db_unhealthy");
    return {
      ok: false,
      checks,
      drift,
      manifest,
      runtimeAdapter,
      readOnlyEnforced: enforcement.countMutations() === 0,
      exit: 7,
      reason: ds.reason ?? "db_unhealthy",
    };
  }

  // P14: git remote connectivity
  const gr = checkGitRemote({
    repoUrl: input.gitRepoUrl,
    branch: input.gitBranch,
    remoteSha: input.gitRemoteSha,
  });
  checks["gitRemote"] = { ok: gr.ok, reason: gr.reason };
  if (!gr.ok) {
    drift.push(gr.reason ?? "git_remote_unreachable");
    return {
      ok: false,
      checks,
      drift,
      manifest,
      runtimeAdapter,
      readOnlyEnforced: enforcement.countMutations() === 0,
      exit: 2,
      reason: gr.reason ?? "git_remote_unreachable",
    };
  }

  // P8bis: healthcheck required (manifest OR global_profile default)
  const hc = checkHealthcheckRequired(
    manifest,
    input.globalProfile.defaults.healthcheck,
  );
  checks["healthcheck"] = { ok: hc.ok, source: hc.source, reason: hc.reason };
  if (!hc.ok) {
    drift.push("healthcheck_required");
    return {
      ok: false,
      checks,
      drift,
      manifest,
      runtimeAdapter,
      readOnlyEnforced: enforcement.countMutations() === 0,
      exit: 12,
      reason: "healthcheck_required",
    };
  }

  // Final read-only enforcement check (AC-09)
  const finalMutations = enforcement.countMutations();
  if (finalMutations > 0) {
    drift.push(PREFLIGHT_READONLY_VIOLATION_REASON);
    return {
      ok: false,
      checks,
      drift,
      manifest,
      runtimeAdapter,
      readOnlyEnforced: false,
      exit: 70,
      reason: `preflight_attempted_mutation:${finalMutations}`,
    };
  }

  return {
    ok: true,
    checks,
    drift,
    manifest,
    runtimeAdapter,
    readOnlyEnforced: true,
  };
}

export const PREFLIGHT_READONLY_VIOLATION_REASON = "preflight_attempted_mutation";
export { ReadOnlyViolation, createReadOnlyEnforcement };
export type { ReadOnlyEnforcement };

/** Type guard para discriminar el éxito del selector runtime adapter. */
function isRuntimeAdapterSuccess(
  r: Awaited<ReturnType<typeof checkRuntimeAdapter>>,
): r is Extract<Awaited<ReturnType<typeof checkRuntimeAdapter>>, { ok: true }> {
  return (r as { ok?: boolean }).ok === true;
}
