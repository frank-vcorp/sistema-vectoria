/**
 * index.ts — vectoria-provision v2.0 entrypoint
 *
 * SPEC-20260820-003 v1.7 + SPEC-20260821-001 + ADR-20260821-01 v1.0.
 *
 * Cambios v2.0:
 *  - Carga global-profile (WARN + fallback si ausente; no aborta).
 *  - Computa paths namespaced: `${baseDir}/${project.parent}/${project.id}/`.
 *  - HKDF con prefijo global-profile + project.namespace.
 *  - Per-project secret-source file con fallback legacy.
 *  - Audit enrichido con `projectParent`/`projectId`.
 *  - `resolveServerUuid` con global-profile (3er arg).
 *
 * Compat retroactiva: el manifest v1 vigente sigue parseando y ejecutando
 * el ciclo LIVE sin cambios (AC-R-1).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  ManifestSchema,
  RunnerConfigSchema,
  type Manifest,
  type RunnerConfig,
} from "./schema.js";
import { runEnsure } from "./ensure.js";
import { ensureDestination, manifestProjectNamespace, resolveServerUuid } from "./destination.js";
import { appendAudit } from "./audit.js";
import { loadRegistry, withSlugLock } from "./registry.js";
import { loadOrganizationProfile } from "./profile.js";
import {
  loadGlobalProfile,
  namespacedAuditPath,
  namespacedLockDir,
  namespacedRegistryPath,
  namespacedSecretSourcePath,
  type GlobalProfile,
} from "./global-profile.js";
import {
  ProvisionError,
  type ErrorCode,
  type EnsureResult,
} from "./errors.js";

interface ParsedArgs {
  manifest?: string;
  operation?: string;
  registry?: string;
  audit?: string;
  profile?: string;
  globalProfile?: string;
  waitLockMs?: number;
  help: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const out: ParsedArgs = { help: false };
  for (const raw of argv) {
    if (raw === "--help" || raw === "-h") {
      out.help = true;
      continue;
    }
    if (raw === "--manifest" || raw.startsWith("--manifest=")) {
      out.manifest = raw.includes("=") ? (raw.split("=", 2)[1] ?? "") : "";
      continue;
    }
    if (raw === "--operation" || raw.startsWith("--operation=")) {
      out.operation = raw.includes("=") ? (raw.split("=", 2)[1] ?? "") : "";
      continue;
    }
    if (raw === "--registry" || raw.startsWith("--registry=")) {
      out.registry = raw.includes("=") ? (raw.split("=", 2)[1] ?? "") : "";
      continue;
    }
    if (raw === "--audit" || raw.startsWith("--audit=")) {
      out.audit = raw.includes("=") ? (raw.split("=", 2)[1] ?? "") : "";
      continue;
    }
    if (raw === "--profile" || raw.startsWith("--profile=")) {
      out.profile = raw.includes("=") ? (raw.split("=", 2)[1] ?? "") : "";
      continue;
    }
    if (raw === "--global-profile" || raw.startsWith("--global-profile=")) {
      out.globalProfile = raw.includes("=") ? (raw.split("=", 2)[1] ?? "") : "";
      continue;
    }
    if (raw === "--wait-lock-ms" || raw.startsWith("--wait-lock-ms=")) {
      const v = raw.includes("=") ? (raw.split("=", 2)[1] ?? "") : "";
      const n = Number.parseInt(v, 10);
      if (!Number.isFinite(n) || n < 0) {
        throw new ProvisionError("bad_manifest", `--wait-lock-ms inválido: ${v}`);
      }
      out.waitLockMs = n;
      continue;
    }
    throw new ProvisionError("bad_manifest", `argumento no reconocido: ${raw}`);
  }
  return out;
}

const USAGE = `vectoria-provision — runner one-shot (SPEC-20260820-003 + SPEC-20260821-001)

Uso:
  vectoria-provision \\
    --manifest=<path> \\
    --operation=<ensure_project|ensure_environment|ensure_application|ensure_database|ensure_storage|ensure_env> \\
    [--registry=<path>] [--audit=<path>] [--profile=<path>] [--global-profile=<path>] \\
    [--wait-lock-ms=<ms>]

Entorno (inyectado por el launcher mínimo-privilegio):
  COOLIFY_READ_TOKEN       lectura (preflight/reconcile)
  COOLIFY_WRITE_TOKEN      mutación (POST/PATCH)
  SECRET_DERIVATION_ROOT   32B aleatorios para HKDF-SHA256
  COOLIFY_BASE_URL          default https://app.coolify.io
  COOLIFY_API_PREFIX       default /api/v1
  COOLIFY_TIMEOUT_MS       default 20000

Salida: JSON en stdout. Errores: {ok:false,error:{code,message}} (sin secretos).
`;

function emitJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

function emitFailure(code: ErrorCode, message: string, details?: Record<string, unknown>): void {
  emitJson({ ok: false, error: { code, message, ...(details ?? {}) } });
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(argv);
  } catch (e: unknown) {
    if (e instanceof ProvisionError) {
      process.stderr.write(`[vectoria-provision] USAGE\n${USAGE}`);
      emitFailure(e.code, e.message);
      return 3;
    }
    throw e;
  }
  if (parsed.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (!parsed.manifest || parsed.manifest.length === 0) {
    process.stderr.write(USAGE);
    emitFailure("bad_manifest", "--manifest=<path> es obligatorio");
    return 3;
  }
  if (!parsed.operation || parsed.operation.length === 0) {
    process.stderr.write(USAGE);
    emitFailure("unknown_verb", "--operation=<ensure_*> es obligatorio");
    return 3;
  }

  // 1. Cargar manifest
  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(readFileSync(resolve(parsed.manifest), "utf8"));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "manifest unreadable";
    emitFailure("bad_manifest", `manifest inválido o ilegible: ${msg}`);
    return 3;
  }
  let manifest: Manifest;
  try {
    manifest = ManifestSchema.parse(manifestRaw);
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      emitFailure("bad_manifest", "manifest no cumple schema", { issues: e.issues.map((i) => ({ path: i.path, message: i.message })) });
      return 3;
    }
    throw e;
  }

  // 2. Cargar global-profile (WARN + fallback si ausente; no aborta)
  const globalProfile: GlobalProfile = loadGlobalProfile(
    parsed.globalProfile ?? process.env["VECTORIA_PROVISION_GLOBAL_PROFILE"],
  );

  // 3. Configuración del runner desde env (el launcher inyecta las 3 vars secretas + DERIVATION_ROOT)
  const cfg: RunnerConfig = RunnerConfigSchema.parse({
    COOLIFY_READ_TOKEN: process.env["COOLIFY_READ_TOKEN"] ?? "",
    COOLIFY_WRITE_TOKEN: process.env["COOLIFY_WRITE_TOKEN"] ?? "",
    SECRET_DERIVATION_ROOT: process.env["SECRET_DERIVATION_ROOT"] ?? "",
    COOLIFY_BASE_URL: process.env["COOLIFY_BASE_URL"],
    COOLIFY_API_PREFIX: process.env["COOLIFY_API_PREFIX"],
    COOLIFY_TIMEOUT_MS: process.env["COOLIFY_TIMEOUT_MS"],
    PROVISION_REGISTRY_PATH: parsed.registry ?? process.env["PROVISION_REGISTRY_PATH"],
    PROVISION_AUDIT_PATH: parsed.audit ?? process.env["PROVISION_AUDIT_PATH"],
    PROVISION_PROFILE_PATH: parsed.profile ?? process.env["PROVISION_PROFILE_PATH"],
    PROVISION_WAIT_LOCK_MS: parsed.waitLockMs !== undefined ? String(parsed.waitLockMs) : undefined,
    VECTORIA_SECRETS_FILE: process.env["VECTORIA_SECRETS_FILE"],
  });

  // 4. Computar paths namespaced (overridable por env vars; default: global-profile + project.namespace)
  const envRegistryDir = process.env["VECTORIA_PROVISION_REGISTRY_DIR"];
  const envAuditDir = process.env["VECTORIA_PROVISION_AUDIT_DIR"];
  const registryBase: string = envRegistryDir ?? globalProfile.defaults.registryBaseDir;
  const auditBase: string = envAuditDir ?? globalProfile.defaults.auditBaseDir;
  const projectNs = manifestProjectNamespace(manifest);
  const [nsParent, nsId] = projectNs.split(":");
  const parentSafe: string = nsParent ?? "vectoria";
  const idSafe: string = nsId ?? manifest.taskId;
  const registryPath = namespacedRegistryPath(registryBase, parentSafe, idSafe);
  const auditPath = namespacedAuditPath(auditBase, parentSafe, idSafe);
  // Mantener cfg paths apuntando a los namespaced (overridable por env var aún gana).
  cfg.PROVISION_REGISTRY_PATH = registryPath;
  cfg.PROVISION_AUDIT_PATH = auditPath;
  // Lock dir derivado (informativo; `withSlugLock` recalcula desde registryPath).
  void namespacedLockDir(registryBase, parentSafe, idSafe);

  // 5. Cargar registry + profile (con global-profile + parent del manifest)
  const registry = await loadRegistry(registryPath);
  const profile = await loadOrganizationProfile(
    cfg.PROVISION_PROFILE_PATH,
    globalProfile,
    parentSafe,
  );

  // 6. Lock por slug
  const waitLockMs = cfg.PROVISION_WAIT_LOCK_MS;
  try {
    const result: EnsureResult = await withSlugLock(
      registryPath,
      manifest.slug,
      waitLockMs,
      async () => {
        const serverUuid = resolveServerUuid(manifest, registry, globalProfile);
        const destination = await ensureDestination(manifest, registry, serverUuid);
        return runEnsure({
          operation: parsed.operation!,
          manifest,
          destination,
          cfg,
          registry,
          profile,
          globalProfile,
          secretSourceBaseDir: namespacedSecretSourcePath(
            globalProfile.defaults.secretSourceBaseDir,
            parentSafe,
            idSafe,
          ).replace(/\/[^/]+$/, ""), // base dir, sin filename
        });
      },
    );
    appendAudit(auditPath, {
      ts: new Date().toISOString(),
      taskId: manifest.taskId,
      slug: manifest.slug,
      projectParent: manifest.project?.parent ?? undefined,
      projectId: manifest.project?.id ?? undefined,
      op: parsed.operation!,
      target: {
        fqdn: manifest.fqdn,
        projectParent: manifest.project?.parent ?? undefined,
        projectId: manifest.project?.id ?? undefined,
      },
      result: result.ok ? result.status : "failure",
      uuid: result.ok ? result.uuid : undefined,
    });
    emitJson(result);
    return result.ok ? 0 : 2;
  } catch (e: unknown) {
    if (e instanceof ProvisionError) {
      appendAudit(auditPath, {
        ts: new Date().toISOString(),
        taskId: manifest.taskId,
        slug: manifest.slug,
        projectParent: manifest.project?.parent ?? undefined,
        projectId: manifest.project?.id ?? undefined,
        op: parsed.operation!,
        target: {
          fqdn: manifest.fqdn,
          projectParent: manifest.project?.parent ?? undefined,
          projectId: manifest.project?.id ?? undefined,
        },
        result: "failure",
        code: e.code,
      });
      emitFailure(e.code, e.message, e.details);
      if (e.code === "already_running") return 4;
      return 2;
    }
    throw e;
  }
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[vectoria-provision] fatal: ${msg.replace(/Bearer\s+[A-Za-z0-9._\-+/=]{4,}/g, "Bearer <redacted>")}\n`);
    process.exit(1);
  },
);