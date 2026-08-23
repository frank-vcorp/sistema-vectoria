/**
 * Trigger flags parser — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §3.3.
 *
 * Flags soportadas por `vectoria-provision provision <manifest>`:
 *  - --preflight-only      sólo ejecuta preflight; exit 0 si PASS, infra_blocked si FAIL
 *  - --dry-run             ejecuta pasos 1-5; aborta antes del 6
 *  - --no-deploy           ejecuta 1-6 + 9; omite 7-8
 *  - --operation=<op>      ejecuta un solo ensure_* (sólo project|environment|application|database|storage|env)
 *  - --production-allowed  NUNCA PASS sin Frank-auth vigente
 *  - --push-mode           activa el flujo de push post-provisioning (§3.4)
 */
export interface TriggerFlags {
  preflightOnly: boolean;
  dryRun: boolean;
  noDeploy: boolean;
  operation?: string;
  productionAllowed: boolean;
  pushMode: boolean;
  manifestPath?: string;
  help: boolean;
  error?: string;
}

const ALLOWED_OPERATIONS = new Set([
  "ensure_project",
  "ensure_environment",
  "ensure_application",
  "ensure_database",
  "ensure_storage",
  "ensure_env",
]);

export function parseTriggerFlags(argv: readonly string[]): TriggerFlags {
  const out: TriggerFlags = {
    preflightOnly: false,
    dryRun: false,
    noDeploy: false,
    productionAllowed: false,
    pushMode: false,
    help: false,
  };
  for (const raw of argv) {
    if (raw === "--help" || raw === "-h") {
      out.help = true;
      continue;
    }
    if (raw === "--preflight-only") {
      out.preflightOnly = true;
      continue;
    }
    if (raw === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (raw === "--no-deploy") {
      out.noDeploy = true;
      continue;
    }
    if (raw === "--production-allowed") {
      out.productionAllowed = true;
      continue;
    }
    if (raw === "--push-mode") {
      out.pushMode = true;
      continue;
    }
    if (raw.startsWith("--operation=")) {
      const v = raw.slice("--operation=".length);
      if (!ALLOWED_OPERATIONS.has(v)) {
        out.error = `--operation inválido: ${v} (esperado: ${[...ALLOWED_OPERATIONS].join("|")})`;
        return out;
      }
      out.operation = v;
      continue;
    }
    if (raw.startsWith("--manifest=")) {
      out.manifestPath = raw.slice("--manifest=".length);
      continue;
    }
    if (raw === "--manifest") {
      // El siguiente argv es el path.
      continue;
    }
    // Flag desconocido pero NO fatal: trigger lo ignora.
    if (raw.startsWith("--")) {
      // mantener silencioso para compat con flags v2.0 (--registry, --audit, etc.)
      continue;
    }
    // Primer argumento posicional es el manifest path.
    if (!out.manifestPath) {
      out.manifestPath = raw;
      continue;
    }
  }
  return out;
}

export const USAGE = `vectoria-provision provision — trigger global v2.1

Uso:
  vectoria-provision provision <manifest-path> [flags]

Flags:
  --preflight-only        sólo ejecuta preflight (read-only); exit 0 si PASS, infra_blocked si FAIL
  --dry-run               ejecuta pasos 1-5; aborta antes del 6 con audit="dry_run_completed"
  --no-deploy             ejecuta 1-6 + 9; omite 7-8
  --operation=<op>        ejecuta un solo ensure_* (project|environment|application|database|storage|env)
  --production-allowed    NUNCA PASS sin Frank-auth vigente (prohibido en este pase)
  --push-mode             activa flujo post-provisioning (§3.4 SPEC-001)
  --help, -h              muestra esta ayuda

Exit codes:
   0  PASS
   2  infra_blocked genérico
   3  manifest_invalid / adapter_required_for_new_projects
   4  coolify_version_unsupported / runtime_adapter_invalid_with_legacy_mode
   5  runtime_adapter_load_failed
   6  auth_scope_missing
   7  db_unhealthy / storage_unhealthy
   8  dns_unresolved
   9  toolchain_mismatch / toolchain_pnpm_workspace_invalid
  10  secret_source_keys_missing / legacy_missing_required_key
  11  cross_project_adoption_attempted
  12  healthcheck_required
  50  partial_mutation_unrecoverable (sin DELETE automático)
  60  deploy_staging_failed
  61  push_post_provisioning_failed
  70  preflight_attempted_mutation
  99  generic failure (no mutation)
`;
