/**
 * Coollib adapter v4 — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §5 + ADR-20260822-01 §2.4.
 *
 * Implementa el contrato `CoolifyAdapter` para Coolify v4 (versiones
 * soportadas: v4.0.0, v4.0.0-beta.18, v4.0.0-beta.19).
 *
 * Reglas:
 *  - El adapter NO contiene lógica de una app específica (cero
 *    hardcode de ninguna app; el adapter es reutilizable para cualquier
 *    proyecto, V20/W13).
 *  - Las funciones son PURAS: dado el input retornan el output sin
 *    efectos secundarios. La ejecución HTTP la hace el `client.ts`
 *    existente (ALLOWED_PATH_TEMPLATES).
 *  - El adapter NO ejecuta operaciones mutantes durante preflight. Toda
 *    función que retorna `AdapterOperation` con verb != "GET" sólo se usa
 *    en pasos `ensure_*` (paso 6+ del trigger), nunca en preflight.
 *  - Las validaciones de URL (error 422 `git_repository`) viven aquí.
 */
import type {
  AdapterOperation,
  CoolifyAdapter,
  EnvPayload,
  ProbeReport,
} from "./types.js";
import type { HealthcheckBlock } from "../global-profile.js";

export const COOLIFY_V4_SUPPORTED_VERSIONS = [
  "v4.0.0",
  "v4.0.0-beta.18",
  "v4.0.0-beta.19",
] as const;

export type CoolifyV4Version = (typeof COOLIFY_V4_SUPPORTED_VERSIONS)[number];

/**
 * Detecta la versión del Coolify y retorna un ProbeReport normalizado.
 * Si la versión no está en COOLIFY_V4_SUPPORTED_VERSIONS, retorna
 * `version` igual al valor recibido (para que el caller decida abort).
 */
export function probeSchema(serverInfo: {
  version?: string;
  is_reachable?: boolean;
  proxy?: { status?: string };
  is_mcp_server_enabled?: boolean;
}): ProbeReport {
  const version = serverInfo.version ?? "unknown";
  return {
    version,
    reachable: serverInfo.is_reachable === true,
    proxy: { status: serverInfo.proxy?.status ?? "unknown" },
    capabilities: {
      mcpServerEnabled: serverInfo.is_mcp_server_enabled === true,
      writeTokenPresent: false, // el adapter no inspecciona el token; lo hace preflight (P7)
    },
  };
}

/**
 * Compone la URL completa del repositorio a partir de "owner/repo".
 *
 * REGLAS (cierre error Frank #1, AC-04):
 *  - Si ya es URL completa (https://|http://|git://|git@), retornar tal cual.
 *  - Si es "owner/repo" o "host/owner/repo", componer con `host` (default "github.com").
 *  - Si tiene caracteres no soportados, lanzar error con detalle para que
 *    el runner emita 422 con `data.field=git_repository`.
 */
export function composeGitRepositoryUrl(repository: string, host: string): string {
  if (typeof repository !== "string" || repository.length === 0) {
    throw new CoolifyAdapterError(
      "git_repository",
      `git_repository vacío o inválido: ${typeof repository}`,
    );
  }
  // Ya es URL completa
  if (/^(https?:\/\/|git:\/\/|git@)/i.test(repository)) {
    return repository;
  }
  // Host/owner/repo
  const parts = repository.split("/").filter((p) => p.length > 0);
  if (parts.length === 2) {
    return `https://${host}/${parts[0]}/${parts[1]}`;
  }
  if (parts.length === 3) {
    return `https://${parts[0]}/${parts[1]}/${parts[2]}`;
  }
  throw new CoolifyAdapterError(
    "git_repository",
    `git_repository con formato no soportado: ${repository} (esperado owner/repo o URL completa)`,
  );
}

/**
 * Forma el body POST/PATCH /applications/{uuid}/envs según Coolify v4.
 *
 * Cobertura de AC-06 (errors Frank #3 env schema drift):
 *  - create: POST {key, value}
 *  - update: PATCH {key, value}
 *
 * El adapter RETURNA la operación; el caller es responsable de detectar
 * 409 (create conflict) y convertir a PATCH (IMPL-10 L+).
 */
export function buildEnvPayload(op: "create" | "update", key: string, value: string): AdapterOperation {
  if (!/^[A-Z][A-Z0-9_]{0,62}$/.test(key)) {
    throw new CoolifyAdapterError(
      "env_key",
      `env key inválida: ${key} (regex [A-Z][A-Z0-9_]{0,62})`,
    );
  }
  const payload: EnvPayload = { key, value };
  if (op === "create") {
    return { verb: "POST", path: `/applications/{uuid}/envs`, body: payload };
  }
  return { verb: "PATCH", path: `/applications/{uuid}/envs`, body: payload };
}

/**
 * Construye el bloque health_check_* para POST /applications.
 *
 * Cobertura AC-08 (errors Frank #5 healthcheck faltante):
 *  - `enabled:false` → NO emite bloque (Coolify usará defaults internos).
 *  - `enabled:true`  → emite enabled + path + port + interval/timeout/retries.
 */
export function buildHealthcheckBlock(hc: HealthcheckBlock): Record<string, unknown> {
  if (!hc.enabled) return {};
  return {
    health_check_enabled: true,
    health_check_path: hc.path,
    health_check_method: hc.method,
    health_check_scheme: hc.scheme,
    health_check_port: hc.port,
    health_check_interval: hc.interval,
    health_check_timeout: hc.timeout,
    health_check_retries: hc.retries,
  };
}

/**
 * Construye el bloque start_command. Escape defensivo: regex
 * `[a-zA-Z0-9_\- ./]{1,256}` para evitar inyecciones. Si excede o no
 * cumple la regex, lanza CoolifyAdapterError.
 */
export function buildStartCommand(cmd: string): Record<string, unknown> {
  if (!/^[a-zA-Z0-9_\- ./]{1,256}$/.test(cmd)) {
    throw new CoolifyAdapterError(
      "start_command",
      `startCommand inválido: longitud=${cmd.length} (debe cumplir [a-zA-Z0-9_- ./]{1,256})`,
    );
  }
  return { start_command: cmd };
}

export class CoolifyAdapterError extends Error {
  public readonly field: string;
  public readonly code: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
    this.code = "coolify_adapter_invalid";
  }
}

/** Adapter concreto v4 (cumple la interface). */
export const v4Adapter: CoolifyAdapter = {
  version: "v4",
  probeSchema,
  composeGitRepositoryUrl,
  buildEnvPayload,
  buildHealthcheckBlock,
  buildStartCommand,
};
