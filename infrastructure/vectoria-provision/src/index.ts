#!/usr/bin/env node
/**
 * vectoria-provision — Runner one-shot CLI for idempotent Coolify provisioning.
 *
 * Implements SPEC-20260820-003 v1.0 (SOL-18):
 *  - 6 verbos: ensure_project, ensure_environment, ensure_application,
 *    ensure_database, ensure_storage, ensure_env.
 *  - GET/reconcile antes de POST/PATCH; 409 reconciliable, 4xx terminal,
 *    timeout/5xx reconcile.
 *  - Registry JSONL local `600`, escritura atómica, lock por slug.
 *  - HKDF-SHA256 versionado para MASTER_KEY/SESSION_SECRET/bootstrap.
 *  - Auditoría redactada (nunca secretos, tokens, ni valores).
 *  - Destino: override → binding existente → 03tz1uabcrjaihnvrhysbstv.
 *  - Sin daemon, sin socket, sin broker, sin systemd, sin nftables.
 *
 * Entradas:
 *   --manifest=<path>     ruta al manifest JSON canónico
 *   --operation=<verb>    verbo ensure_*
 *   [--registry=<path>]   ruta al registry JSONL (default ~/.config/kilo/vectoria-provision/registry.jsonl)
 *   [--audit=<path>]      ruta al audit JSONL    (default ~/.config/kilo/vectoria-provision/audit.jsonl)
 *   [--profile=<path>]    ruta al organization-profile.json (default ~/.config/kilo/vectoria-provision/organization-profile.json)
 *   [--wait-lock-ms=<ms>]  espera máxima por lock por slug (default 0 → fail-fast already_running)
 *
 * Salida (stdout): JSON estructurado con el resultado de la operación.
 * Salida (stderr): logs operativos sin secretos.
 * Exit codes:
 *   0  ok (created | adopted)
 *   2  error de operación (ensure_*) — el cuerpo del stdout contiene {ok:false,error:{code,message}}
 *   3  error de manifest/configuración
 *   4  lock concurrente (already_running) cuando --wait-lock-ms=0
 *   70 error del launcher (archivo de secretos ausente, permisos, etc.)
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
import { ensureDestination, resolveServerUuid } from "./destination.js";
import { appendAudit } from "./audit.js";
import { loadRegistry, withSlugLock } from "./registry.js";
import { loadOrganizationProfile } from "./profile.js";
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

const USAGE = `vectoria-provision — runner one-shot (SPEC-20260820-003)

Uso:
  vectoria-provision \\
    --manifest=<path> \\
    --operation=<ensure_project|ensure_environment|ensure_application|ensure_database|ensure_storage|ensure_env> \\
    [--registry=<path>] [--audit=<path>] [--profile=<path>] \\
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
      emitFailure("bad_manifest", "manifest no cumple schema v1", { issues: e.issues.map((i) => ({ path: i.path, message: i.message })) });
      return 3;
    }
    throw e;
  }

  // 2. Configuración del runner desde env (el launcher inyecta las 3 vars secretas + DERIVATION_ROOT)
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
  });

  // 3. Cargar registry + profile
  const registry = await loadRegistry(cfg.PROVISION_REGISTRY_PATH);
  const profile = await loadOrganizationProfile(cfg.PROVISION_PROFILE_PATH);

  // 4. Lock por slug
  const waitLockMs = cfg.PROVISION_WAIT_LOCK_MS;
  try {
    const result: EnsureResult = await withSlugLock(
      cfg.PROVISION_REGISTRY_PATH,
      manifest.slug,
      waitLockMs,
      async () => {
        // Resolver destino: override → binding → default
        const serverUuid = resolveServerUuid(manifest, registry);
        const destination = await ensureDestination(manifest, registry, serverUuid);
        return runEnsure({
          operation: parsed.operation!,
          manifest,
          destination,
          cfg,
          registry,
          profile,
        });
      },
    );
    appendAudit(cfg.PROVISION_AUDIT_PATH, {
      ts: new Date().toISOString(),
      taskId: manifest.taskId,
      slug: manifest.slug,
      op: parsed.operation!,
      target: { fqdn: manifest.fqdn },
      result: result.ok ? result.status : "failure",
      uuid: result.ok ? result.uuid : undefined,
    });
    emitJson(result);
    return result.ok ? 0 : 2;
  } catch (e: unknown) {
    if (e instanceof ProvisionError) {
      appendAudit(cfg.PROVISION_AUDIT_PATH, {
        ts: new Date().toISOString(),
        taskId: manifest.taskId,
        slug: manifest.slug,
        op: parsed.operation!,
        target: { fqdn: manifest.fqdn },
        result: "failure",
        code: e.code,
      });
      emitFailure(e.code, e.message);
      if (e.code === "already_running") return 4;
      return 2;
    }
    throw e;
  }
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    // Defense-in-depth: nunca imprimir el mensaje crudo si contiene tokens.
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[vectoria-provision] fatal: ${msg.replace(/Bearer\s+[A-Za-z0-9._\-+/=]{4,}/g, "Bearer <redacted>")}\n`);
    process.exit(1);
  },
);