/**
 * Enums canónicos transversales de la plataforma (SPEC-001 §4.4).
 *
 * Esta es la **única** fuente de enums para estado. Las SPECs de módulo
 * añadirán enums propios a este mismo archivo cuando corresponda.
 *
 * Regla (SPEC §7, AC-29): enums como dato en código, no en BD.
 */
export const AUDIT_ACTIONS = [
  // Plataforma
  "role.create",
  "role.update",
  "role.deactivate",
  "role.delete",
  "permission.grant",
  "permission.revoke",
  "user.create",
  "user.update",
  "user.assign_role",
  "user.revoke_role",
  "fiscal_config.update",
  "fiscal_config.create",
  // Crypto / CSD
  "crypto.encrypt",
  "crypto.decrypt",
  "crypto.rotate",
  "csd.load",
  "csd.rotate",
  "csd.revoke",
  "csd.expire",
  // Archivos
  "file.upload",
  "file.link",
  "file.unlink",
  // Jobs
  "job.retry",
  // Auth
  "auth.login.success",
  "auth.login.failed",
  "auth.login.locked",
  "auth.refresh",
  "auth.logout",
  "auth.session.suspicious",
  "auth.session.new_device",
  "auth.invitation.issued",
  "auth.invitation.consumed",
  "auth.password.reset",
  "auth.email.change",
  // Acceso denegado a recurso
  "access.denied",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const JOB_STATUSES = ["running", "succeeded", "failed", "stuck", "dlq"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const NOTIFICATION_EVENT_TYPES = [
  "prospecto_sin_proxima_accion",
  "cotizacion_proxima_vencer",
  "os_pendiente_anticipo",
  "os_pendiente_informacion",
  "actividad_asignada",
  "actividad_proxima_vencer",
  "actividad_vencida",
  "actividad_bloqueada",
  "proyecto_en_riesgo",
  "proyecto_retrasado",
  "entregable_proximo",
  "entregable_con_observaciones",
  "cambio_pendiente_revision",
  "factura_proxima_vencer",
  "factura_vencida",
  "job_stuck",
  "job_missed_window",
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const PROJECT_LOG_ENTRY_TYPES = [
  "reunion",
  "decision",
  "bloqueo",
  "solicitud",
  "cambio",
  "entrega",
  "aprobacion",
  "reprogramacion",
  "nota",
  "sistema",
] as const;
export type ProjectLogEntryType = (typeof PROJECT_LOG_ENTRY_TYPES)[number];

/**
 * Códigos de error canónicos (SPEC §6).
 */
export const ERROR_CODES = [
  "MAX_ROLES_EXCEEDED",
  "SEED_ROLE_NOT_DELETABLE",
  "ROLE_DELETE_FORBIDDEN",
  "SEED_ROLE_HAS_ASSIGNED_USERS",
  "ROLE_CODE_IMMUTABLE",
  "SEED_ROLE_PERMISSIONS_IMMUTABLE",
  "INVITATION_EXPIRED",
  "INVITATION_CONSUMED",
  "FILE_TYPE_NOT_ALLOWED",
  "FILE_TOO_LARGE",
  "TTL_TOO_LONG",
  "PASSWORD_TOO_WEAK",
  "ACCOUNT_LOCKED",
  "UNKNOWN_NOTIFICATION_EVENT",
  "ForbiddenError",
  "IntegrityError",
  "RESET_LINK_EXPIRED",
  "CSD_REVOKED",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * 7 roles seed canónicos (ACTORES §1, BR-N127).
 */
export const SEED_ROLE_CODES = [
  "director",
  "vendedor",
  "administrador",
  "lider_proyecto",
  "programador",
  "disenador",
  "qa",
] as const;
export type SeedRoleCode = (typeof SEED_ROLE_CODES)[number];

/**
 * Permisos base (SPEC §7). La plataforma los declara como dato (AC-29).
 */
export const BASE_PERMISSIONS = [
  "gestionar_usuarios",
  "gestionar_roles",
  "gestionar_config_fiscal",
  "ver_auditoria",
  "gestionar_cuestionarios",
  "gestionar_catalogos",
  "gestionar_plantillas",
  "emitir_invitaciones",
  "gestionar_jobs",
  "ver_todo",
  "ver_costos",
  "ver_cxc_otros",
  "ver_comisiones_otros",
  "ver_tiempo_equipo",
  "ver_notas_privadas",
] as const;
export type BasePermission = (typeof BASE_PERMISSIONS)[number];
