/**
 * Preflight P4/P5: DB / Storage health — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.1 P4/P5 + AC-07.
 *
 * Read-only: el caller provee `dbStatus` y `storageStatus` ya obtenidos
 * vía `coolify_get_database(<uuid>)` / `coolify_get_service(<uuid>)`.
 * Si el recurso está `exited:unhealthy` o `exited` → abort con
 * `db_unhealthy` / `storage_unhealthy` (exit 7).
 *
 * Si `dbStatus === "absent"` (proyecto nuevo, sin DB creado aún),
 * el check pasa — el `ensure_database` posterior creará y verificará.
 */
export type ResourceHealthStatus = "running:healthy" | "running" | "exited:unhealthy" | "exited" | "absent";

export interface PreflightHealthInput {
  dbStatus?: ResourceHealthStatus;
  storageStatus?: ResourceHealthStatus;
}

export interface PreflightHealthResult {
  ok: boolean;
  reason?: string;
}

export function checkDbStorageHealth(input: PreflightHealthInput): PreflightHealthResult {
  if (input.dbStatus === "exited:unhealthy" || input.dbStatus === "exited") {
    return { ok: false, reason: "db_unhealthy" };
  }
  if (input.storageStatus === "exited:unhealthy" || input.storageStatus === "exited") {
    return { ok: false, reason: "storage_unhealthy" };
  }
  return { ok: true };
}
