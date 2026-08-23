/**
 * Coollib adapter types — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §5 + ADR-20260822-01.
 *
 * Encapsula las particularidades de la API de Coolify por versión. Cada
 * adapter (v4, v5, ...) implementa este contrato y expone:
 *  - `probeSchema`: detecta versión del Coolify remoto vía read-only
 *  - `buildEnvPayload`: forma del body para POST/PATCH `/envs`
 *  - `buildHealthcheckBlock`: forma del bloque health_check_* en POST app
 *  - `buildStartCommand`: forma del start_command en POST app
 *  - `composeGitRepositoryUrl`: normaliza repo "owner/repo" → URL completa
 */
import type { HealthcheckBlock } from "../global-profile.js";

/** Forma de una operación generada por el adapter. */
export interface AdapterOperation {
  verb: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
}

/** Resultado del probeSchema (read-only). */
export interface ProbeReport {
  version: string;
  reachable: boolean;
  proxy: { status: string };
  capabilities: { mcpServerEnabled: boolean; writeTokenPresent: boolean };
}

/** Forma del body POST /applications/{uuid}/envs según la versión Coolify. */
export interface EnvPayload {
  key: string;
  value: string;
  is_preview?: boolean;
  is_literal?: boolean;
}

/** Interface del adapter (v4 actualmente; otras versiones se añaden como módulos). */
export interface CoolifyAdapter {
  readonly version: string;
  probeSchema(serverInfo: {
    version?: string;
    is_reachable?: boolean;
    proxy?: { status?: string };
    is_mcp_server_enabled?: boolean;
  }): ProbeReport;
  composeGitRepositoryUrl(repository: string, host: string): string;
  buildEnvPayload(op: "create" | "update", key: string, value: string): AdapterOperation;
  buildHealthcheckBlock(hc: HealthcheckBlock): Record<string, unknown>;
  buildStartCommand(cmd: string): Record<string, unknown>;
}
