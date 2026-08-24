/**
 * Barrel del módulo de servicios Bitácora (SPEC-010).
 * Read-only sobre `audit_logs`, `project_log_entries`,
 * `file_links` (sólo lectura).
 */
export {
  createBitacoraService,
  type BitacoraService,
  type AuditLogDTO,
  type ProjectLogEntryDTO,
  type FileLinkDTO,
  type CreateBitacoraServiceOptions,
} from "./bitacora-service";
