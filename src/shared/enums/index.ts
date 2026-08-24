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
 *
 * SPEC-002 (Clientes y Prospectos) añade códigos de dominio propios.
 * La ordenación es estable y el catálogo crece con módulos aprobados.
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
  // SPEC-002 (BR-N148/168/213/214/215/216/217/218).
  "QUESTIONNAIRE_REQUIRED",
  "CLIENT_MUST_COME_FROM_PROSPECT",
  "CLIENT_DELETE_FORBIDDEN",
  "LOST_REASON_REQUIRED",
  "SUSPENDED_REASON_REQUIRED",
  "MULTIPLE_MAIN_CONTACTS",
  "RFC_DUPLICATE",
  "CLIENT_HAS_OPEN_OS",
  "PROSPECT_ALREADY_QUALIFIED",
  "PROSPECT_NOT_FOUND",
  "CLIENT_NOT_FOUND",
  "CONTACT_NOT_FOUND",
  "FISCAL_DATA_NOT_FOUND",
  // SPEC-003 (módulo Comercial).
  "SIGNED_SCOPE_REQUIRED",
  "SCOPE_SIGN_FORBIDDEN",
  "SCOPE_ALREADY_SIGNED",
  "SCOPE_NOT_FOUND",
  "QUOTE_NOT_FOUND",
  "QUOTE_EXPIRED",
  "QUOTE_ALREADY_ACCEPTED",
  "QUOTE_NOT_DRAFT",
  "DISCOUNT_EXCEEDS_LIMIT",
  "DISCOUNT_NEEDS_DIRECTOR",
  "PROSPECT_HAS_ACCEPTED_QUOTE",
  "ACCEPTANCE_EVIDENCE_REQUIRED",
  "MIN_VIGENCIA_NOT_MET",
  "EVIDENCE_FILE_NOT_FOUND",
  "QUESTIONNAIRE_NOT_FOUND",
  "QUESTIONNAIRE_NOT_PUBLISHED",
  "QUESTIONNAIRE_RESPONSE_NOT_FOUND",
  "CATALOG_SERVICE_NOT_FOUND",
  "TEMPLATE_NOT_FOUND",
  "TEMPLATE_TYPE_MISMATCH",
  // SPEC-004 (módulo Orden de Servicio)
  "ORDER_NOT_FOUND",
  "ORDER_ALREADY_EXISTS_FOR_QUOTE",
  "ORDER_NOT_AUTHORIZABLE",
  "ORDER_ALREADY_AUTHORIZED",
  "ORDER_ALREADY_DELIVERED",
  "ORDER_ALREADY_CLOSED",
  "ORDER_ALREADY_CANCELLED",
  "ORDER_NOT_PAUSED",
  "PL_NOT_ASSIGNED",
  "DEPOSIT_PENDING",
  "DEPOSIT_ADVANCE_BELOW_THRESHOLD",
  "OC_MISMATCH",
  "OC_FILE_REQUIRED",
  "SUBSCRIPTION_INITIAL_PAYMENT_REQUIRED",
  "OUTSTANDING_BALANCE",
  "FINAL_INVOICE_REQUIRED",
  "OS_PAUSE_REASON_REQUIRED",
  "OS_CANCEL_REASON_REQUIRED",
  "QUOTE_NOT_ACCEPTED",
  "QUOTE_HAS_NO_CLIENT",
  "SCOPE_NOT_SIGNED",
  // SPEC-005 (Proyectos: artefactos y estados).
  "PROJECT_NOT_FOUND",
  "PROJECT_ALREADY_EXISTS_FOR_ORDER",
  "PROJECT_INVALID_TRANSITION",
  "PROJECT_PAUSE_REASON_REQUIRED",
  "PROJECT_CANCEL_REASON_REQUIRED",
  "HEALTH_REASON_REQUIRED",
  "JSON_IMMUTABLE_FIELDS",
  "JSON_VERSION_CONFLICT",
  "TEMPLATE_PROJECT_MODULES_EMPTY",
  "MODULE_NOT_FOUND",
  "MODULE_INVALID_TRANSITION",
  "MODULE_DEPLOY_GATES",
  // SPEC-006 (Proyectos: equipo y ejecución · B11-B16).
  "NOT_A_MEMBER",
  "TASK_NOT_FOUND",
  "TASK_INVALID_TRANSITION",
  "TASK_DONE_GATES",
  "TASK_REJECT_REASON_REQUIRED",
  "TASK_AUTOASSIGN_FORBIDDEN",
  "REQUIREMENT_NOT_FOUND",
  "REQUIREMENT_INVALID_TRANSITION",
  "TIME_ENTRY_NOT_FOUND",
  "TIME_ENTRY_INVALID_RANGE",
  "TIME_ENTRY_PRIVACY_FORBIDDEN",
  "TEST_NOT_FOUND",
  "TEST_INVALID_TRANSITION",
  "TEST_NOT_APPLICABLE_REASON_REQUIRED",
  "ACCEPTANCE_TEST_REQUIRED",
  "DELIVERABLE_NOT_FOUND",
  "DELIVERABLE_INVALID_TRANSITION",
  "ACCEPTANCE_EVIDENCE_REQUIRED",
  "CHANGE_REQUEST_NOT_FOUND",
  "CHANGE_REQUEST_INVALID_TRANSITION",
  "CHANGE_QUOTE_REQUIRED",
  "CLOSE_GATES",
  "PROGRESS_BLOCKED",
  // SPEC-007 (Facturación CFDI · B18).
  "INVOICE_NOT_FOUND",
  "INVOICE_INVALID_TRANSITION",
  "INVOICE_BUILD_INVALID",
  "INVOICE_TIMBRAR_DRAFT_ONLY",
  "INVOICE_TIMBRAR_DUPLICATED_UUID",
  "INVOICE_CANCEL_REASON_REQUIRED",
  "INVALID_CANCEL_MOTIVE",
  "CSD_NOT_CONFIGURED",
  "PAC_API_KEY_MISSING",
  "INVOICE_HAS_APPLICATIONS",
  "APPLICATION_EXCEEDS_BALANCE",
  "INVOICE_SCHEDULE_NOT_FOUND",
  "INVOICE_SCHEDULE_DUPLICATED",
  "INVOICE_FISCAL_DATA_REQUIRED",
  "XML_NOT_AVAILABLE",
  // SPEC-008 (Cobranza y Comisiones · B17/B19/B20).
  "PAYMENT_NOT_FOUND",
  "PAYMENT_INVALID_TRANSITION",
  "PAYMENT_REVERSE_REASON_REQUIRED",
  "PAYMENT_NOT_REVERSIBLE",
  "PAYMENT_NOT_EDITABLE",
  "PAYMENT_APPLICATION_NOT_FOUND",
  "COMMISSION_NOT_FOUND",
  "COMMISSION_ALREADY_EXISTS_FOR_ORDER",
  "COMMISSION_ALREADY_PAID",
  "COMMISSION_NOT_PAYABLE",
  "COMMISSION_RELEASE_EXCEEDS",
  "COLLECTION_PROMISE_NOT_FOUND",
  "COLLECTION_ACTIVITY_NOT_FOUND",
  "ESCALATION_NOT_DUE",
  "NO_INVOICES_FOR_OS",
  // SPEC-009 (Finanzas y Movimientos · B21/B26).
  "ACCOUNT_NOT_FOUND",
  "ACCOUNT_INACTIVE",
  "TRANSACTION_NOT_FOUND",
  "TRANSACTION_INVALID_TRANSITION",
  "TRANSFER_NOT_FOUND",
  "TRANSFER_INVALID_PAIR",
  "TRANSFER_DIFFERENT_ORG",
  "RECONCILED_IMMUTABLE",
  "COST_NOT_CONFIRMED",
  "REVERSE_REASON_REQUIRED",
  "TRANSACTION_NON_OPERATIVE",
  "DIRECT_COST_NOT_FOUND",
  // SPEC-010 AC-7 · Editor visual de cuestionarios (DEC-FUN-45).
  // Códigos mecánicos del editor: capa inválida, tipo de respuesta
  // inválido, reorder mal formado, pregunta no encontrada, code
  // duplicado dentro del cuestionario. NO son reglas de SPEC-003.
  "QUESTIONNAIRE_LAYER_INVALID",
  "QUESTIONNAIRE_ANSWER_TYPE_INVALID",
  "QUESTIONNAIRE_REORDER_INVALID",
  "QUESTIONNAIRE_QUESTION_NOT_FOUND",
  "QUESTIONNAIRE_QUESTION_CODE_DUPLICATE",
  // SPEC-011 (Suscripciones · B20a). Códigos del módulo:
  //  - `SUBSCRIPTION_NOT_FOUND` / `SUBSCRIPTION_PERIOD_NOT_FOUND`
  //  - `SUBSCRIPTION_INVALID_TRANSITION` (BR-N404)
  //  - `SUBSCRIPTION_ORDER_NOT_AUTHORIZED` (la OS no está en
  //    `authorized_to_start` para crear la suscripción)
  //  - `SUBSCRIPTION_ORDER_WRONG_TIPO_COBRO` (sólo si
  //    `tipo_cobro='suscripcion'` se crea la suscripción)
  //  - `SUBSCRIPTION_ALREADY_EXISTS_FOR_ORDER`
  //  - `SUBSCRIPTION_RENEW_DUPLICATED_PERIOD` (idempotencia, AC-9)
  //  - `SUBSCRIPTION_REASON_REQUIRED` (pausa/cancelación, BR-N404)
  "SUBSCRIPTION_NOT_FOUND",
  "SUBSCRIPTION_PERIOD_NOT_FOUND",
  "SUBSCRIPTION_INVALID_TRANSITION",
  "SUBSCRIPTION_ORDER_NOT_AUTHORIZED",
  "SUBSCRIPTION_ORDER_WRONG_TIPO_COBRO",
  "SUBSCRIPTION_ALREADY_EXISTS_FOR_ORDER",
  "SUBSCRIPTION_RENEW_DUPLICATED_PERIOD",
  "SUBSCRIPTION_REASON_REQUIRED",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * SPEC-005 §4.2 / BR-N253 · Estados 3D del Proyecto (etapa / situación
 * / salud). La enumeración canónica es el dato único para validación
 * en código (SPEC-001 §4.4). Las transiciones viven en
 * `src/server/services/proyectos/helpers.ts`.
 */
export const PROJECT_STAGES = [
  "planning",
  "development",
  "testing",
  "client_validation",
  "delivery",
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const PROJECT_SITUATIONS = [
  "pending",
  "active",
  "paused",
  "completed",
  "cancelled",
] as const;
export type ProjectSituation = (typeof PROJECT_SITUATIONS)[number];

export const PROJECT_HEALTHS = ["on_track", "at_risk", "delayed"] as const;
export type ProjectHealth = (typeof PROJECT_HEALTHS)[number];

/**
 * SPEC-005 §4.1 / BR-N260/113/114 · Estados y salud de los módulos.
 * `deployed` = cierre técnico del módulo (DEC-FUN-59, BR-N113) y es
 * terminal técnico sin exigir aceptación final del cliente (salvo
 * dependencia explícita, BR-N113). `blocked`/`cancelled` son laterales.
 */
export const MODULE_STATUSES = [
  "pending",
  "in_progress",
  "testing",
  "deployed",
  "paused",
  "blocked",
  "cancelled",
] as const;
export type ModuleStatus = (typeof MODULE_STATUSES)[number];

export const MODULE_HEALTHS = ["on_track", "at_risk", "delayed"] as const;
export type ModuleHealth = (typeof MODULE_HEALTHS)[number];

/**
 * SPEC-005 / DEC-FUN-56 · Roles de proyecto (no confundir con los
 * roles seed de plataforma). `lider` es el PL asignado por
 * `project_creation` por construcción (BR-N382). El resto entra por
 * SPEC-006 (excluida del MVP).
 */
export const PROJECT_MEMBER_ROLES = [
  "lider",
  "programador",
  "disenador",
  "qa",
] as const;
export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number];

/**
 * SPEC-006 §4.1 (B11, BR-N264-267) · Estados del requerimiento. La
 * transición canónica es:
 *   proposed → analysis → approved → development → testing → validated
 * Laterales: `rejected` (no se hará) y `out_of_scope` (redirigido a
 * otro contrato).
 */
export const REQUIREMENT_STATUSES = [
  "proposed",
  "analysis",
  "approved",
  "development",
  "testing",
  "validated",
  "rejected",
  "out_of_scope",
] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

/**
 * SPEC-006 §4.1 (B11, BR-N268-274/BR-N269) · Estados de la tarea. El
 * flujo principal es:
 *   backlog → ready → in_progress → in_review → done
 * Laterales: `blocked`, `cancelled`.
 *
 * `ready` significa "lista para tomar" (sin asignado o asignado
 * pendiente de aceptación). `done` exige checklist+evidencia
 * (BR-007/BR-N271).
 */
export const TASK_STATUSES = [
  "backlog",
  "ready",
  "in_progress",
  "in_review",
  "done",
  "blocked",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * SPEC-006 §4.1 (B13, BR-N276) · Naturaleza del registro de tiempo.
 * `facturable` se considera en la rentabilidad del técnico; `interna`,
 * `retrabajo` y `soporte` se acumulan como costo directo pero NO como
 * ingreso facturable (DEC-FUN-25/SPEC-009). El snapshot de
 * `cost_per_hour_cents` se captura al registrar (BR-008, AC-10).
 */
export const TIME_ENTRY_KINDS = [
  "facturable",
  "interna",
  "retrabajo",
  "soporte",
] as const;
export type TimeEntryKind = (typeof TIME_ENTRY_KINDS)[number];

/**
 * SPEC-006 §4.1 (B14, BR-N283-290/BR-N284-285/BR-N389/BR-N390) · Los 7
 * tipos de prueba que el sistema soporta como dato. El primero
 * (`acceptance`) tiene regla especial: `not_applicable` exige
 * excepción Director (BR-N389).
 */
export const TEST_TYPES = [
  "functional",
  "visual",
  "ui",
  "acceptance",
  "performance",
  "security",
  "compatibility",
] as const;
export type TestType = (typeof TEST_TYPES)[number];

/**
 * SPEC-006 §4.1 (B14, BR-N283-290) · Estado de la prueba.
 * `blocking` se deriva del tipo (functional/visual/ui/acceptance/
 * compatibility), NO del estado; performance/security sólo advierten.
 */
export const TEST_STATUSES = [
  "pending",
  "passed",
  "failed",
  "blocked",
  "not_applicable",
] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];

/**
 * SPEC-006 §4.1 (B14, BR-N283-285) · Tipos de prueba BLOQUEANTES para
 * el cierre técnico del proyecto (no permite cerrar con estos
 * pendientes). Performance y security sólo generan `at_risk` (no
 * bloquean).
 */
export const BLOCKING_TEST_TYPES: ReadonlyArray<TestType> = [
  "functional",
  "visual",
  "ui",
  "acceptance",
  "compatibility",
] as const;

/**
 * SPEC-006 §4.1 (B15, BR-N288-291/BR-N391/DEC-FUN-55) · Estados del
 * entregable. La aceptación por proxy del PL exige identidad/org/
 * fecha/medio/evidencia (BR-N287); el PL es registrador, no aceptante.
 */
export const DELIVERABLE_STATUSES = [
  "pending",
  "preparing",
  "delivered",
  "accepted",
  "observed",
  "corrected",
  "rejected",
] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

/**
 * SPEC-006 §4.1 (B16, BR-N292-296) · Estados del change request.
 * Línea principal:
 *   requested → analysis → quoted → authorized → in_progress →
 *   implemented → validated
 * Laterales: `rejected`, `cancelled`.
 *
 * Sin costo omiten `quoted`/`authorized` (BR-N395); con costo exigen
 * `quoted` con evidencia antes de `authorized` (BR-N294).
 */
export const CHANGE_REQUEST_STATUSES = [
  "requested",
  "analysis",
  "quoted",
  "authorized",
  "rejected",
  "cancelled",
  "in_progress",
  "implemented",
  "validated",
] as const;
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

/**
 * SPEC-006 §4.1 (B11) · Tipos de evidencia de un cambio. Cotización
 * (= link a quote_id) o documento libre (`custom`). Determina la
 * validación de `authorize` (BR-N294).
 */
export const CHANGE_REQUEST_EVIDENCE_KINDS = [
  "quote",
  "custom",
] as const;
export type ChangeRequestEvidenceKind =
  (typeof CHANGE_REQUEST_EVIDENCE_KINDS)[number];

/**
 * SPEC-006 §4.2 / BR-N367-370 · Naturaleza de la salud del proyecto.
 * El cálculo (BR-N367/368) es determinista: lo publica el helper
 * `computeProjectHealth` en `services/proyectos/helpers-ejecucion.ts`.
 * Sólo se expone como enum para la UI/audit.
 */
export const PROJECT_HEALTH_NATURES = [
  "calculated",
  "manual",
  "overridden",
] as const;
export type ProjectHealthNature = (typeof PROJECT_HEALTH_NATURES)[number];

/**
 * SPEC-006 / BR-N367 · Peso por defecto de una tarea cuando no se
 * proporciona (peso 1 = 1 unidad de avance; ponderación para el
 * denominador `Σ peso(no canceladas)`).
 */
export const TASK_DEFAULT_WEIGHT = 1;

/**
 * SPEC-005 / BR-N254 · motivo de override de salud ≥3 caracteres.
 */
export const HEALTH_REASON_MIN_LENGTH = 3;

/**
 * SPEC-005 / BR-N336 · Acciones de auditoría del módulo Proyectos
 * (namespace `project.*`, `module.*` y `json_discovery.*`). Mantiene
 * el contrato de consulta por prefijo en `audit_logs`.
 *
 * SPEC-006 extiende con `requirement.*`, `task.*`, `task_assignment.*`,
 * `time_entry.*`, `test.*`, `deliverable.*`, `change_request.*` y
 * `project.close_technical`.
 */
export const PROJECT_AUDIT_ACTIONS = [
  // Proyecto (SPEC-005 AC-1..AC-5/AC-9)
  "project.create",
  "project.transition_stage",
  "project.pause",
  "project.resume",
  "project.cancel",
  "project.complete",
  "project.health_override",
  "project.created_from_order",
  "project.delivered_from_order",
  "project.close_technical",
  // Módulo (SPEC-005 AC-8)
  "module.transition",
  "module.health_override",
  // JSON Discovery round-trip (SPEC-005 AC-6/AC-7)
  "json_discovery.export",
  "json_discovery.import",
  // Miembros del proyecto (SPEC-006 AC-1)
  "project_member.add",
  "project_member.remove",
  // Requerimientos (SPEC-006 BR-N264-267)
  "requirement.create",
  "requirement.transition",
  // Tareas (SPEC-006 BR-N268-274/BR-N269-271)
  "task.create",
  "task.transition",
  "task.checklist_add",
  "task.checklist_toggle",
  "task.evidence_add",
  "task.assign",
  "task.autoassign",
  "task.reject",
  "task.review",
  // Tiempo (SPEC-006 BR-N276/BR-N277)
  "time_entry.create",
  // Pruebas (SPEC-006 BR-N283-290)
  "test.create",
  "test.transition",
  "test.mark_not_applicable",
  // Entregables (SPEC-006 BR-N288-291/DEC-FUN-55)
  "deliverable.create",
  "deliverable.transition",
  "deliverable.accept",
  // Cambios de alcance (SPEC-006 BR-N292-296/BR-N395)
  "change_request.create",
  "change_request.quote",
  "change_request.authorize",
  "change_request.reject",
] as const;
export type ProjectAuditAction = (typeof PROJECT_AUDIT_ACTIONS)[number];

/**
 * SPEC-007 §4.1 / BR-N306 · Estados de la factura CFDI 4.0 (calendario
 * de cobranza de 7 estados visuales en BR-N312). Línea principal:
 *   borrador → emitida → parcialmente_pagada → pagada
 * Laterales:
 *   - `vencida` (BR-N307): saldo > 0 y `due_date < hoy`. Se calcula por
 *     job nocturno (`invoices.markVencida`).
 *   - `cancelada` (BR-N305): con motivo SAT 01-04. Terminal.
 *
 * El conteo de 7 estados visuales puede sumar `borrador + emitida +
 * parcialmente_pagada + pagada + vencida + cancelada + (programada)` —
 * la UI muestra `programada` derivada de `invoice_schedules` con
 * `scheduled_date > hoy`. `INVOICE_STATUSES` declara sólo los 6 estados
 * persistidos en la fila.
 */
export const INVOICE_STATUSES = [
  "borrador",
  "emitida",
  "parcialmente_pagada",
  "pagada",
  "vencida",
  "cancelada",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * SPEC-007 §4.1 / §6 / BR-N305 · Motivos de cancelación SAT CFDI 4.0:
 *  - `01`: Comprobante emitido con errores sin relación.
 *  - `02`: Comprobante emitido con errores sin relación (sustituye al 01
 *    en algunas devoluciones; ver SPEC-007 §6).
 *  - `03`: No se llevó a cabo la operación.
 *  - `04`: Operación nominativa relacionada en la factura global.
 *
 * El adaptador PAC exige uno de estos valores (BR-N305); rechazar sin
 * motivo válido → `400 INVALID_CANCEL_MOTIVE`.
 */
export const CANCEL_MOTIVES_SAT = ["01", "02", "03", "04"] as const;
export type CancelMotiveSat = (typeof CANCEL_MOTIVES_SAT)[number];

/**
 * SPEC-007 §4.1 / BR-N310 · Estados de un schedule de facturación
 * recurrente. `pending` aún no se ha ejecutado; `executed` ya generó su
 * factura (idempotente: si el job vuelve a correr el mismo día, no se
 * duplica porque el job_key es estable); `skipped` cuando se omitió por
 * configuración manual.
 */
export const INVOICE_SCHEDULE_STATUSES = [
  "pending",
  "executed",
  "skipped",
] as const;
export type InvoiceScheduleStatus = (typeof INVOICE_SCHEDULE_STATUSES)[number];

/**
 * SPEC-007 §4.1 / BR-N310 · Cómo materializar un schedule al llegar la
 * fecha: `auto` (timbrar inmediatamente; requiere CSD/API key) o
 * `draft` (sólo crear factura en borrador; el revisor la timbra).
 * `auto_or_draft` es el nombre genérico heredado del SPEC.
 */
export const SCHEDULE_AUTO_OR_DRAFT_KINDS = [
  "auto",
  "draft",
] as const;
export type ScheduleAutoOrDraftKind =
  (typeof SCHEDULE_AUTO_OR_DRAFT_KINDS)[number];

/**
 * SPEC-007 / BR-N312 · Calendario de 7 estados visuales. La UI deriva
 * `programada` de `invoice_schedules.scheduled_date > hoy` con
 * `status='pending'`. Los 6 persistidos viven en `INVOICE_STATUSES`.
 */
export const INVOICE_CALENDAR_VISUAL_STATUSES = [
  "borrador",
  "programada",
  "emitida",
  "parcialmente_pagada",
  "pagada",
  "vencida",
  "cancelada",
] as const;
export type InvoiceCalendarVisualStatus =
  (typeof INVOICE_CALENDAR_VISUAL_STATUSES)[number];

/**
 * SPEC-007 §4.1 / BR-N336 · Acciones de auditoría del módulo Facturación.
 * Mantenemos namespace `factura.*` para conservar la consulta por
 * prefijo en `audit_logs`. `invoice_schedule.*` cubre recurrencia.
 */
export const INVOICE_AUDIT_ACTIONS = [
  // Borrador, timbrado y cancelación
  "factura.build",
  "factura.timbrar",
  "factura.cancel",
  "factura.mark_vencida",
  // Aplicaciones de cobro (compatibilidad para SPEC-008, BR-012/308)
  "factura.aplicar_pago",
  "factura.reversar_aplicacion",
  // ZIP mensual (DEC-FUN-38/26, BR-N311)
  "factura.zip_generado",
  // Recurrencia (BR-N310, SPEC-001 AC-15)
  "invoice_schedule.create",
  "invoice_schedule.run",
  "invoice_schedule.skip",
  // Consumida por SPEC-011 (BR-N406, DEC-FUN-67)
  "factura.draft_from_subscription_renewal",
] as const;
export type InvoiceAuditAction = (typeof INVOICE_AUDIT_ACTIONS)[number];

/**
 * SPEC-007 / BR-N307 · motivo de cancelación SAT mínimo (no mínimo en
 * caracteres; sí motivo SAT válido 01-04). Para `auditoría` de
 * reversiones manuales posteriores se exige ≥3 caracteres (defensa
 * consistente con motivos de OS/Proyecto).
 */
export const INVOICE_CANCEL_REASON_MIN_LENGTH = 3;

/**
 * SPEC-002 §4.1 · Tres medios de contacto en orden canónico confirmado por
 * DEC-20260823-01 (`llamada`, `email`, `whatsapp`). El catálogo NO se
 * amplía: añadir más medios requiere otra decisión funcional (DEC-).
 *
 * El par de etiquetas es estable y la UI los traduce por `messages.medios`
 * (es-MX). El orden aquí ES el orden del contrato de BD y de cualquier
 * selector en pantalla.
 */
export const PROSPECT_MEDIUMS = ["llamada", "email", "whatsapp"] as const;
export type ProspectMedium = (typeof PROSPECT_MEDIUMS)[number];

/**
 * SPEC-002 §4.1 · Estados de oportunidad del prospecto. La ordenación
 * refleja la progresión comercial canónica; los estados terminales son
 * `ganado`, `perdido` y `suspendido` (éste reactivable).
 */
export const PROSPECT_STATUSES = [
  "nuevo",
  "contactado",
  "calificado",
  "discovery_requerimientos",
  "cotizacion_enviada",
  "negociacion",
  "ganado",
  "perdido",
  "suspendido",
] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

/**
 * SPEC-002 §4.1 · Estados del cliente. `active` es el único estado
 * operativo en MVP; `archived` marca no-eliminación (BR-N215).
 */
export const CLIENT_STATUSES = ["active", "archived"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

/**
 * SPEC-002 · Acciones de auditoría específicas del módulo. Mantenemos el
 * namespace `client.*` y `prospect.*` para que `audit_logs.action` siga
 * siendo consultable por prefijo (BR-N336).
 */
export const CLIENT_AUDIT_ACTIONS = [
  // Prospectos (SPEC-002 §4.2, AC-2/AC-4)
  "prospect.create",
  "prospect.update",
  "prospect.qualify",
  "prospect.lost",
  "prospect.suspended",
  "prospect.reactivate",
  // Clientes (AC-1, AC-3, BR-N215)
  "client.create",
  "client.archive",
  // Contactos (AC-5, BR-N217)
  "client_contact.create",
  "client_contact.update",
  "client_contact.set_main",
  "client_contact.delete",
  // Datos fiscales del cliente (BR-N218, AC-7)
  "client_fiscal.upsert",
] as const;

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
 *
 * SPEC-002 añade permisos propios del módulo Clientes/Prospectos
 * (`gestionar_prospectos`, `gestionar_clientes`). Se declaran aquí
 * porque son datos transversales al stack de permisos, no contrato
 * privado del módulo; el sembrado por rol vive en
 * `scripts/seed-data.ts`.
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
  // SPEC-002 (módulo Clientes/Prospectos)
  "gestionar_prospectos",
  "gestionar_clientes",
  // SPEC-003 (módulo Comercial).
  // Permisos distintos para el Vendedor (gestión comercial), el PL
  // (firma de alcance) y la aceptación con descuento >10% (Director).
  "gestionar_cuestionarios",
  "gestionar_catalogos",
  "gestionar_plantillas",
  "gestionar_comercial",
  "firmar_alcance",
  "aceptar_cotizacion",
  "aprobar_descuento",
  // SPEC-004 (módulo Orden de Servicio).
  // - `gestionar_ordenes_servicio` ← director/admin/vendedor (lectura
  //    y carga de OC).
  // - `asignar_pl_os` ← director/admin (asignar PL).
  // - `autorizar_os` ← director (autorizar inicio; BR-N244 / BR-N245).
  // - `cerrar_os` ← director (cierre administrativo con o sin excepción).
  "gestionar_ordenes_servicio",
  "asignar_pl_os",
  "autorizar_os",
  "cerrar_os",
  // SPEC-005 (Proyectos — artefactos y estados).
  // - `gestionar_proyectos` ← director/admin/lider_programacion (crea
  //    proyectos por derivación de la OS y opera estados 3D/módulos).
  // - `operar_proyectos` ← lider_programacion/programador/disenador/qa
  //    (transiciones laterales y avance de módulos propios).
  // - `aprobar_json_discovery` ← director (aprueba reimportaciones del
  //    JSON Discovery; BR-N396/397).
  "gestionar_proyectos",
  "operar_proyectos",
  "aprobar_json_discovery",
  // SPEC-006 (Proyectos: equipo y ejecución · B11-B16).
  // - `registrar_tiempo` ← líder/programador/diseñador/qa (auto-registro
  //    y privacidad BR-N277/208). DEC-FUN-09: el tiempo es opcional,
  //    pero quien registra requiere este permiso.
  // - `aprobar_cambios` ← director/admin/líder (autoriza change
  //    requests con costo; BR-N294/295).
  // - `gestionar_equipo_proyecto` ← director/admin/líder (incorpora
  //    miembros al equipo del proyecto, BR-N382/383; AC-1).
  "registrar_tiempo",
  "aprobar_cambios",
  "gestionar_equipo_proyecto",
  // SPEC-007 (Facturación CFDI · B18).
  // - `gestionar_facturacion` ← director/admin (build, timbrar,
  //    cancelar, ZIP, schedules recurrentes). BR-N201 + BR-N336.
  // - `ver_facturas` ← director/admin/vendedor (lectura de facturas;
  //    BR-N211).
  // - `timbrar_facturas` ← director/admin (envía al PAC; restringido a
  //    quien tiene CSD vigente y conoce credenciales operativas).
  "gestionar_facturacion",
  "ver_facturas",
  "timbrar_facturas",
  // SPEC-008 (Cobranza y Comisiones · B17/B19/B20).
  // - `gestionar_cobranza` ← director/admin/vendedor (registrar y
  //    consultar cobros, registrar actividades/promesas; BR-N211).
  // - `confirmar_cobros` ← director/admin (confirma el cobro y crea
  //    movimiento de ingreso vinculado; BR-N315/316).
  // - `pagar_comisiones` ← director/admin (marca pagada; BR-N299).
  // - `ver_cxc_otros` ya está en BASE_PERMISSIONS y modela la
  //    visibilidad BR-N207 (Vendedor no ve CxC de otros).
  "gestionar_cobranza",
  "confirmar_cobros",
  "pagar_comisiones",
  // SPEC-009 (Finanzas y Movimientos · B21/B26).
  // - `gestionar_finanzas` ← director/admin (registrar movimientos,
  //    conciliar, transferir, imputar costos; BR-N013/N331).
  // - `ver_finanzas` ← director/admin (lectura financiera; BR-N209/211).
  // - `ver_costos` ya está en BASE_PERMISSIONS (BR-N278/N282).
  // - `ver_tiempo_equipo` ya está en BASE_PERMISSIONS (BR-N208).
  "gestionar_finanzas",
  "ver_finanzas",
  // SPEC-010 (Dashboard / Administración / Bitácora · B22/B23).
  // - `ver_notas_privadas` ← director (lectura de notas privadas
  //    en project_log_entries; BR-N339). Admin NO las ve.
  // - `ver_auditoria` ya está en BASE_PERMISSIONS (Director/Admin;
  //    BR-N336/337).
  "ver_notas_privadas",
  // SPEC-011 (Suscripciones · B20a).
  // - `gestionar_suscripciones` ← director/admin (BR-N402; DEC-FUN-63).
  //    Renovar/pausar/cancelar/reactivar y ver cartera. Vendedor NO la
  //    recibe: opera Suscripciones desde Facturación/Cobranza que ya
  //    cubren CxC.
  "gestionar_suscripciones",
] as const;
export type BasePermission = (typeof BASE_PERMISSIONS)[number];

/**
 * SPEC-010 §4.1 / BR-N207 · matriz seed declarativa por rol.
 * El admin service de SPEC-010 y el sembrado de plataforma la consumen.
 *
 * NOTA: la matriz viva en BD la cablea `userPermissionsService`
 * (SPEC-001 AC-5/69/70). Esta constante es la **fuente declarativa**
 * que el sembrado y la UI consultan para mostrar permisos efectivos.
 */
export const SEED_ROLE_PERMISSION_CODES: Record<string, string[]> = {
  director: [...BASE_PERMISSIONS],
  administrador: [
    "gestionar_usuarios",
    "gestionar_roles",
    "emitir_invitaciones",
    "ver_auditoria",
    "gestionar_jobs",
    "gestionar_prospectos",
    "gestionar_clientes",
    "gestionar_cuestionarios",
    "gestionar_catalogos",
    "gestionar_plantillas",
    "gestionar_comercial",
    "aceptar_cotizacion",
    "gestionar_ordenes_servicio",
    "asignar_pl_os",
    "gestionar_proyectos",
    "operar_proyectos",
    "registrar_tiempo",
    "aprobar_cambios",
    "gestionar_equipo_proyecto",
    "gestionar_facturacion",
    "ver_facturas",
    "timbrar_facturas",
    "gestionar_cobranza",
    "confirmar_cobros",
    "pagar_comisiones",
    "gestionar_finanzas",
    "ver_finanzas",
    // SPEC-011 (Suscripciones · B20a · BR-N402 / DEC-FUN-63).
    // Admin financiero: gestiona suscripciones desde el panel de cartera.
    "gestionar_suscripciones",
  ],
  vendedor: [
    "gestionar_prospectos",
    "gestionar_clientes",
    "gestionar_cuestionarios",
    "gestionar_catalogos",
    "gestionar_plantillas",
    "gestionar_comercial",
    "aceptar_cotizacion",
    "gestionar_ordenes_servicio",
    "ver_facturas",
    "gestionar_cobranza",
    // SPEC-011 (Suscripciones · B20a). El Vendedor ve la cartera
    // (panel read-only) sólo si recibe el permiso; en el MVP NO lo
    // recibe (la cartera es gestión de Admin/Director).
  ],
  lider_proyecto: [
    "firmar_alcance",
    "asignar_pl_os",
    "gestionar_proyectos",
    "operar_proyectos",
    "registrar_tiempo",
    "aprobar_cambios",
    "gestionar_equipo_proyecto",
    "ver_tiempo_equipo",
  ],
  programador: ["operar_proyectos", "registrar_tiempo"],
  disenador: ["operar_proyectos", "registrar_tiempo"],
  qa: ["operar_proyectos", "registrar_tiempo"],
};

/**
 * SPEC-003 §4.1 · Capa 1..4 del cuestionario (DEC-FUN-44,
 * ARCH-20260817-08). Las preguntas se almacenan como dato
 * (`questionnaire_questions.layer`); la lista aquí es la fuente de
 * verdad para validación en código.
 */
export const QUESTIONNAIRE_LAYERS = [1, 2, 3, 4] as const;
export type QuestionnaireLayer = (typeof QUESTIONNAIRE_LAYERS)[number];

/**
 * SPEC-003 §4.1 · Tipos de respuesta de pregunta (ARCH-20260817-08 §3).
 * El cuestionario admite estos 7 tipos como dato editable.
 */
export const QUESTIONNAIRE_ANSWER_TYPES = [
  "text",
  "number",
  "single_choice",
  "multi_choice",
  "boolean",
  "scale",
  "date",
] as const;
export type QuestionnaireAnswerType =
  (typeof QUESTIONNAIRE_ANSWER_TYPES)[number];

/**
 * SPEC-003 §4.1 · Estado del cuestionario. Sólo `published` admite
 * respuestas (`questionnaire_responses`).
 */
export const QUESTIONNAIRE_STATUSES = [
  "draft",
  "published",
  "archived",
] as const;
export type QuestionnaireStatus =
  (typeof QUESTIONNAIRE_STATUSES)[number];

/**
 * SPEC-003 §4.1 · Versión de cuestionario (DEC-FUN-18, BR-N221):
 * digital (captura en pantalla), imprimible (PDF), guía del vendedor.
 */
export const QUESTIONNAIRE_VERSIONS = [
  "digital",
  "imprimible",
  "guia_vendedor",
] as const;
export type QuestionnaireVersion =
  (typeof QUESTIONNAIRE_VERSIONS)[number];

/**
 * SPEC-003 §4.1 · Tipos de servicio (BR-N227).
 */
export const SERVICE_TYPES = [
  "servicio_unico",
  "servicio_recurrente",
  "producto_unico",
  "producto_recurrente",
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

/**
 * SPEC-003 §4.1 · Ciclos de facturación (BR-N238). `a_convenir` para
 * cuando el ciclo se define caso por caso.
 */
export const BILLING_CYCLES = [
  "unico",
  "mensual",
  "anual",
  "a_convenir",
] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

/**
 * SPEC-003 §4.1 · Estados del alcance (B6, BR-N231). `signed` es
 * inmutable (BR-N52).
 */
export const SCOPE_STATUSES = ["draft", "in_review", "signed"] as const;
export type ScopeStatus = (typeof SCOPE_STATUSES)[number];

/**
 * SPEC-003 §4.1 · Estados de la cotización (BR-N25/235). 1 sola
 * aceptada por prospecto (BR-N25); aceptada es inmutable (BR-N02).
 */
export const QUOTE_STATUSES = [
  "draft",
  "internal_review",
  "sent",
  "negotiation",
  "accepted",
  "rejected",
  "expired",
  "cancelled",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/**
 * SPEC-003 §4.1 · Tipos de ítem de cotización (BR-N234, DEC-FUN-48).
 * Polimórficos: `service | license | expense | discount`.
 */
export const QUOTE_ITEM_KINDS = [
  "service",
  "license",
  "expense",
  "discount",
] as const;
export type QuoteItemKind = (typeof QUOTE_ITEM_KINDS)[number];

/**
 * SPEC-003 §4.1 · Tipo de cobro (BR-N238). `suscripcion` exige pago
 * inicial (BR-N239) — consumido por SPEC-004 / SPEC-011.
 */
export const TIPO_COBRO = [
  "pago_unico",
  "mensualidades",
  "suscripcion",
] as const;
export type TipoCobro = (typeof TIPO_COBRO)[number];

/**
 * SPEC-003 §4.1 · Medio de aceptación de cotización (BR-N237).
 * `email | telefono | presencial | otro`.
 */
export const ACCEPTANCE_MEDIUMS = [
  "email",
  "telefono",
  "presencial",
  "otro",
] as const;
export type AcceptanceMedium = (typeof ACCEPTANCE_MEDIUMS)[number];

/**
 * SPEC-003 §3.1 / BR-N228 · 9 plantillas canónicas: 4 web + 5 otros
 * (P-003-1). Coinciden con el sembrado de `scripts/seed-catalog.ts`.
 */
export const TEMPLATE_TYPES = [
  "web_landing",
  "web_sitio",
  "web_app",
  "web_saas",
  "mobile_app",
  "branding",
  "marketing",
  "consultoria",
  "soporte",
] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

/**
 * SPEC-003 §4.2 / BR-N143 · Política de descuentos por rol:
 *  - ≤10%: libre (cualquier actor con `gestionar_comercial`).
 *  - 10-25%: requiere `aprobar_descuento` (Director).
 *  - >25%: bloqueado (`DISCOUNT_EXCEEDS_LIMIT`).
 */
export const DISCOUNT_FREE_LIMIT_PCT = 10;
export const DISCOUNT_DIRECTOR_LIMIT_PCT = 25;
export const DISCOUNT_BLOCKED_PCT = 25; // > 25 => bloqueado

/**
 * SPEC-003 §4.2 / BR-N411 · Umbral de advertencia por desviación
 * presupuestal. `total > 1.5 × presupuesto_declarado` → warning
 * informativo, no bloqueante.
 */
export const PRESUPUESTO_WARNING_MULTIPLIER = 1.5;

/**
 * SPEC-003 §4.1 / BR-N235 · Vigencia mínima de la cotización en días.
 */
export const QUOTE_MIN_VALIDITY_DAYS = 7;

/**
 * SPEC-003 / BR-N336 · Acciones de auditoría del módulo Comercial.
 * Mantenemos el namespace `commercial.*` para conservar la consulta
 * por prefijo en `audit_logs`.
 */
export const COMMERCIAL_AUDIT_ACTIONS = [
  // Cuestionarios
  "questionnaire.publish",
  "questionnaire.archive",
  "questionnaire_response.submit",
  // Catálogo
  "catalog_service.create",
  "catalog_service.update",
  "catalog_service.deactivate",
  // Plantillas
  "template.create",
  "template.update",
  "template.deactivate",
  // Alcance
  "scope.draft",
  "scope.in_review",
  "scope.sign",
  // Cotización
  "quote.create",
  "quote.update",
  "quote.send",
  "quote.negotiate",
  "quote.accept",
  "quote.reject",
  "quote.expire",
  "quote.cancel",
  "quote.presupuesto_warning",
  // Side-effect delegado a SPEC-004 (sin implementar fuera de alcance).
  "os.create_pending_from_quote",
] as const;
export type CommercialAuditAction = (typeof COMMERCIAL_AUDIT_ACTIONS)[number];

/**
 * SPEC-003 · Códigos de error canónicos del módulo Comercial.
 * Extienden `ERROR_CODES` con los códigos de dominio (BR-N51/143/237/411).
 */
export const COMMERCIAL_ERROR_CODES = [
  // Cuestionarios
  "QUESTIONNAIRE_NOT_FOUND",
  "QUESTIONNAIRE_NOT_PUBLISHED",
  "QUESTIONNAIRE_RESPONSE_NOT_FOUND",
  // Catálogo
  "CATALOG_SERVICE_NOT_FOUND",
  // Plantillas
  "TEMPLATE_NOT_FOUND",
  "TEMPLATE_TYPE_MISMATCH",
  // Alcance
  "SCOPE_NOT_FOUND",
  "SCOPE_SIGN_FORBIDDEN",
  "SCOPE_ALREADY_SIGNED",
  "SIGNED_SCOPE_REQUIRED",
  // Cotización
  "QUOTE_NOT_FOUND",
  "QUOTE_EXPIRED",
  "QUOTE_ALREADY_ACCEPTED",
  "QUOTE_NOT_DRAFT",
  "DISCOUNT_EXCEEDS_LIMIT",
  "DISCOUNT_NEEDS_DIRECTOR",
  "PROSPECT_HAS_ACCEPTED_QUOTE",
  "ACCEPTANCE_EVIDENCE_REQUIRED",
  "MIN_VIGENCIA_NOT_MET",
  "EVIDENCE_FILE_NOT_FOUND",
] as const;

/**
 * SPEC-004 §4.2 · Estados de la OS (BR-N242, BR-N247..N250).
 *
 * Línea principal:
 *   `pending_deposit → pending_information → authorized_to_start →
 *    in_execution → delivered → closed`.
 *
 * Laterales: `paused` (reversible) y `cancelled` (terminal con
 * reembolso, DEC-FUN-35).
 *
 * `pending_deposit` es el estado inicial al aceptar cotización
 * (BR-N242); `pending_information` ocurre cuando la cotización
 * aceptada aún requiere datos del cliente (p. ej. datos fiscales).
 */
export const ORDER_STATUSES = [
  "pending_deposit",
  "pending_information",
  "authorized_to_start",
  "in_execution",
  "delivered",
  "closed",
  "paused",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * SPEC-004 · Estados terminales (no reversibles) y no terminales.
 * `delivered` y `closed` son terminales de negocio; `cancelled` es
 * terminal absoluto (BR-N250 / DEC-FUN-35).
 */
export const TERMINAL_ORDER_STATUSES = ["closed", "cancelled"] as const;
export type TerminalOrderStatus = (typeof TERMINAL_ORDER_STATUSES)[number];

/**
 * SPEC-004 · Estados laterales reversibles (`paused`). Se sale de un
 * lateral con `assignPL` / `authorize` o cancelando.
 */
export const LATERAL_ORDER_STATUSES = ["paused"] as const;
export type LateralOrderStatus = (typeof LATERAL_ORDER_STATUSES)[number];

/**
 * SPEC-004 / BR-N244 · Umbral fijo de anticipo cobrado para autorizar
 * una OS. El umbral se publica como dato (P-004-1 cerrado por Frank:
 * 90% fijo, NO configurable). Cualquier excepción la concede el Director
 * (`authorizeByDirectorException`, AC-2) y se audita.
 */
export const OS_ADVANCE_REQUIRED_PCT = 90;

/**
 * SPEC-004 / BR-N250 · motivo obligatorio para `paused` y
 * `cancelled` (mínimo 3 caracteres).
 */
export const OS_REASON_MIN_LENGTH = 3;

/**
 * SPEC-004 / BR-N336 · Acciones de auditoría del módulo OS.
 * Mantenemos namespace `os.*` para conservar la consulta por prefijo
 * en `audit_logs` (compatible con la firma `os.create_pending_from_quote`
 * emitida por SPEC-003 al aceptar cotización).
 */
export const OS_AUDIT_ACTIONS = [
  // Creación y datos básicos
  "os.create",
  "os.create_pending_from_quote",
  "os.assign_pl",
  "os.set_oc",
  // Estados principales
  "os.pause",
  "os.resume",
  "os.cancel",
  "os.authorize",
  "os.authorized_to_start",
  "os.in_execution",
  "os.delivered",
  "os.closed",
  // Excepción Director
  "os.closed_director_exception",
] as const;
export type OSAuditAction = (typeof OS_AUDIT_ACTIONS)[number];

/**
 * SPEC-004 §6 · Códigos de error canónicos del módulo OS. Extienden
 * `ERROR_CODES` con los códigos de dominio (BR-N121/242-250/392-394).
 */
export const OS_ERROR_CODES = [
  "ORDER_NOT_FOUND",
  "ORDER_ALREADY_EXISTS_FOR_QUOTE",
  "ORDER_NOT_AUTHORIZABLE",
  "ORDER_ALREADY_AUTHORIZED",
  "ORDER_ALREADY_DELIVERED",
  "ORDER_ALREADY_CLOSED",
  "ORDER_ALREADY_CANCELLED",
  "ORDER_NOT_PAUSED",
  "PL_NOT_ASSIGNED",
  "DEPOSIT_PENDING",
  "DEPOSIT_ADVANCE_BELOW_THRESHOLD",
  "OC_MISMATCH",
  "OC_FILE_REQUIRED",
  "SUBSCRIPTION_INITIAL_PAYMENT_REQUIRED",
  "OUTSTANDING_BALANCE",
  "FINAL_INVOICE_REQUIRED",
  "OS_PAUSE_REASON_REQUIRED",
  "OS_CANCEL_REASON_REQUIRED",
  "QUOTE_NOT_ACCEPTED",
  "QUOTE_HAS_NO_CLIENT",
  "SCOPE_NOT_SIGNED",
] as const;

/**
 * SPEC-008 §4.1 / BR-N314-319 · Estados del cobro. Línea principal:
 *   registrado → confirmado → reversado (terminal)
 * `registrado` es editable (BR-N315); `confirmado` sólo se reversa
 * (BR-N315/318); `reversado` es terminal con referencia al original.
 */
export const PAYMENT_STATUSES = [
  "registrado",
  "confirmado",
  "reversado",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * SPEC-008 §4.1 · Métodos de cobro. Catálogo cerrado en MVP; cualquier
 * ampliación requiere DEC-.
 */
export const PAYMENT_METHODS = [
  "transferencia",
  "cheque",
  "efectivo",
  "tarjeta",
  "spei",
  "otro",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * SPEC-008 §4.1 / BR-N322-323 · Tipos de actividad de cobranza. El
 * `promesa` requiere `promised_amount_cents` + `promised_date`.
 */
export const COLLECTION_ACTIVITY_TYPES = [
  "llamada",
  "email",
  "promesa",
  "otro",
] as const;
export type CollectionActivityType = (typeof COLLECTION_ACTIVITY_TYPES)[number];

/**
 * SPEC-008 §4.1 / BR-N321 · Tonos de plantilla de mensaje amable/firme/final.
 */
export const COLLECTION_MESSAGE_TONES = [
  "amable",
  "firme",
  "final",
] as const;
export type CollectionMessageTone =
  (typeof COLLECTION_MESSAGE_TONES)[number];

/**
 * SPEC-008 §4.1 / BR-N297-300 · Estados de la comisión. Línea
 * principal:
 *   estimada → devengada → liberada → pagada (terminal)
 * Lateral: `cancelada` (terminal, si la OS se cancela con reembolso,
 * DEC-FUN-35).
 */
export const COMMISSION_STATUSES = [
  "estimada",
  "devengada",
  "liberada",
  "pagada",
  "cancelada",
] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

/**
 * SPEC-008 §4.1 / BR-N123 · Razones de reversa de comisión al cancelar
 * factura u OS.
 */
export const COMMISSION_REVERSAL_REASONS = [
  "factura_cancelada",
  "os_cancelada_reembolso",
  "ajuste_manual",
] as const;
export type CommissionReversalReason =
  (typeof COMMISSION_REVERSAL_REASONS)[number];

/**
 * SPEC-008 / BR-N313 · Tonos de escalado (amable/firme/final).
 */
export const ESCALATION_TONES = ["amable", "firme", "final"] as const;
export type EscalationTone = (typeof ESCALATION_TONES)[number];

/**
 * SPEC-008 §4.1 / BR-N336 · Acciones de auditoría del módulo Cobranza y
 * Comisiones. Namespaces: `cobro.*`, `comision.*`, `promesa.*`,
 * `escalado.*`, `reembolso.*`.
 */
export const COBRANZA_AUDIT_ACTIONS = [
  // Cobros
  "cobro.register",
  "cobro.update",
  "cobro.confirm",
  "cobro.reverse",
  "cobro.apply",
  "cobro.revert_application",
  // Comisiones
  "comision.estimate",
  "comision.release",
  "comision.pay",
  "comision.cancel",
  "comision.reverse",
  // Cobranza (actividades + promesas + escalado)
  "promesa.create",
  "promesa.fulfill",
  "promesa.break",
  "escalado.trigger",
  // Reembolso (proporcional al cancelar OS)
  "reembolso.os_cancel",
] as const;
export type CobranzaAuditAction = (typeof COBRANZA_AUDIT_ACTIONS)[number];

/**
 * SPEC-008 / BR-N315 · motivo de reversa de cobro ≥3 caracteres.
 */
export const PAYMENT_REVERSE_REASON_MIN_LENGTH = 3;

/**
 * SPEC-008 / BR-N362 · cálculo de comisión en centavos enteros (bigint).
 */
export const COMMISSION_PRECISION_CENTS = 1;

/**
 * SPEC-009 §4.1 / BR-N331 · Tipos de cuenta. `capital` cubre
 * aportaciones/préstamos de socios (BR-N327); `ingreso`/`gasto` cubren
 * operación; `activo`/`pasivo` cubren balance.
 */
export const ACCOUNT_TYPES = [
  "activo",
  "pasivo",
  "capital",
  "ingreso",
  "gasto",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/**
 * SPEC-009 §4.1 / BR-N331 · Tipos de movimiento. `transferencia` es la
 * marca explícita de las patas de una transferencia interna
 * (DEC-FUN-27) — NO cuenta como ingreso ni gasto operativo
 * (BR-N326). `capital` cubre préstamos/aportaciones/retiros
 * (BR-N327/328) — tampoco operativos.
 */
export const TRANSACTION_TYPES = [
  "ingreso",
  "gasto",
  "transferencia",
  "capital",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/**
 * SPEC-009 §4.1 / BR-N331 · Estados del movimiento.
 *   borrador → confirmado → conciliado (inmutable, BR-013)
 *   laterales: cancelado, reversado (con motivo, BR-N329/014).
 */
export const TRANSACTION_STATUSES = [
  "borrador",
  "confirmado",
  "conciliado",
  "cancelado",
  "reversado",
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/**
 * SPEC-009 / BR-N331 · Subclasificación no operativa para
 * movimientos tipo `capital`/`transferencia`. Estos NO entran en
 * ingreso operativo ni en costo/ingreso del proyecto.
 *  - `transferencia_interna`: entrada+salida vinculadas (BR-N326).
 *  - `prestamo_socio`: préstamo o aportación de socio (BR-N327).
 *  - `retiro_socio`: retiro de socio (BR-N328).
 *  - `pago_proveedor`: CxP básica (BR-N332).
 *  - `cobro_cliente`: movimiento de ingreso (CxC desde factura).
 */
export const NON_OPERATIVE_KINDS = [
  "transferencia_interna",
  "prestamo_socio",
  "retiro_socio",
  "pago_proveedor",
  "cobro_cliente",
] as const;
export type NonOperativeKind = (typeof NON_OPERATIVE_KINDS)[number];

/**
 * SPEC-011 (Suscripciones · B20a) · Estados de la suscripción
 * (BR-N403). El `status` canónico vive en `subscriptions.status`.
 *  - `activa`: suscripción en curso con periodo vigente.
 *  - `pausada`: pausada temporalmente (transición `activa↔pausada`).
 *  - `vencida`: periodo vencido sin renovar (la asigna `markVencida`,
 *    BR-N404). Reactivable con `renovar` o `reactivar`.
 *  - `cancelada`: terminal hasta `reactivar` (DEC-FUN-65).
 */
export const SUBSCRIPTION_STATUSES = [
  "activa",
  "pausada",
  "cancelada",
  "vencida",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * SPEC-011 · Periodicidad canónica (BR-N400). Mensual, trimestral,
 * semestral y anual. El cálculo de `current_period_end` y
 * `next_renewal_date` parte de la periodicidad (helper puro
 * `computeNextPeriodEnd`).
 */
export const SUBSCRIPTION_PERIODICITIES = [
  "mensual",
  "trimestral",
  "semestral",
  "anual",
] as const;
export type SubscriptionPeriodicity =
  (typeof SUBSCRIPTION_PERIODICITIES)[number];

/**
 * SPEC-011 · Estados del periodo dentro de la suscripción. Modela
 * el ciclo de vida del periodo individual (no del contrato):
 *  - `activo`: periodo vigente (anterior o actual).
 *  - `facturado`: ya hay factura borrador de renovación (SPEC-007).
 *  - `pagado`: la factura del periodo está pagada (referencia
 *    opcional a `invoices.id`, sin acoplamiento duro).
 *  - `vencido`: periodo cerrado sin renovar; sirve de transición
 *    hacia `subscription.status='vencida'` (markVencida, BR-N404).
 */
export const SUBSCRIPTION_PERIOD_STATUSES = [
  "activo",
  "facturado",
  "pagado",
  "vencido",
] as const;
export type SubscriptionPeriodStatus =
  (typeof SUBSCRIPTION_PERIOD_STATUSES)[number];

/**
 * SPEC-011 · Acciones del historial (`subscription_history.action`).
 * El historial conserva `from_status`/`to_status` (BR-N404) y el
 * `actor_role_code` del usuario que disparó la transición.
 */
export const SUBSCRIPTION_HISTORY_ACTIONS = [
  "create",
  "renovar",
  "pausar",
  "cancelar",
  "reactivar",
  "vencer",
] as const;
export type SubscriptionHistoryAction =
  (typeof SUBSCRIPTION_HISTORY_ACTIONS)[number];

/**
 * SPEC-009 / BR-N329 · motivo de reverso de movimiento ≥3 caracteres.
 */
export const TRANSACTION_REVERSE_REASON_MIN_LENGTH = 3;

/**
 * SPEC-009 / BR-N336 · Acciones de auditoría del módulo Finanzas.
 * Namespaces:
 *  - `cuenta.*` (accounts).
 *  - `movimiento.*` (transactions: record/confirm/reconcile/reverse).
 *  - `transferencia.*` (transfers).
 *  - `costo_directo.*` (direct_costs).
 *  - `rentabilidad.*` (consultas; sólo lectura).
 */
export const FINANZAS_AUDIT_ACTIONS = [
  // Cuentas
  "cuenta.create",
  "cuenta.update",
  "cuenta.deactivate",
  // Movimientos
  "movimiento.record",
  "movimiento.update",
  "movimiento.confirm",
  "movimiento.reconcile",
  "movimiento.cancel",
  "movimiento.reverse",
  // Transferencias
  "transferencia.create",
  // Costos directos
  "costo_directo.imputar",
  "costo_directo.desimputar",
  // Rentabilidad (read-only; auditable por acceso)
  "rentabilidad.consulta",
] as const;
export type FinanzasAuditAction = (typeof FINANZAS_AUDIT_ACTIONS)[number];

/**
 * SPEC-010 §4.1 / DEC-FUN-28/30 · Vista default del dashboard del usuario.
 *  - `week`: "Esta semana" (default).
 *  - `today`: filtro "Hoy".
 */
export const DASHBOARD_DEFAULT_VIEWS = ["week", "today"] as const;
export type DashboardDefaultView = (typeof DASHBOARD_DEFAULT_VIEWS)[number];

/**
 * SPEC-010 §3.1 / BR-N344-348 · Códigos canónicos de widgets por rol.
 * El dashboard agrega datos por rol; cada rol expone un subconjunto:
 *  - Director: `projects_at_risk`, `cxc_summary`, `pnl_summary`,
 *    `audit_recent`, `cobros_hoy`, `facturas_vencidas`.
 *  - Vendedor: `prospectos_sin_proxima_accion`,
 *    `cotizaciones_por_vencer`, `mis_cobros`.
 *  - Admin: `facturas_vencidas`, `cobros_hoy`, `pnl_summary`,
 *    `users_recent_activity`.
 *  - PL: `actividades_hoy`, `projects_at_risk`, `proximas_entregas`.
 *  - Programador: `actividades_hoy`, `bloqueos`.
 *
 * El helper `widgetsForRole(role)` devuelve la lista canónica.
 */
export const DASHBOARD_WIDGET_CODES = [
  "projects_at_risk",
  "cxc_summary",
  "pnl_summary",
  "audit_recent",
  "cobros_hoy",
  "facturas_vencidas",
  "prospectos_sin_proxima_accion",
  "cotizaciones_por_vencer",
  "mis_cobros",
  "users_recent_activity",
  "actividades_hoy",
  "proximas_entregas",
  "bloqueos",
] as const;
export type DashboardWidgetCode = (typeof DASHBOARD_WIDGET_CODES)[number];

/**
 * SPEC-010 / DEC-FUN-28 · Roles del dashboard (espejo de
 * SEED_ROLE_CODES + un rol `guest` neutro). El helper
 * `widgetsForRole` mapea cada rol a su lista canónica.
 */
export const DASHBOARD_ROLES = [
  "director",
  "administrador",
  "vendedor",
  "lider_proyecto",
  "programador",
  "disenador",
  "qa",
] as const;
export type DashboardRole = (typeof DASHBOARD_ROLES)[number];

/**
 * SPEC-010 / BR-N336 · Acciones de auditoría del módulo Dashboard /
 * Admin / Bitácora. Estas acciones son **lectura** (consulta): la
 * escritura de auditoría la hacen los servicios de cada módulo.
 *  - `dashboard.get` / `dashboard.saveLayout`.
 *  - `admin.roles.list` / `admin.permissions.list`.
 *  - `bitacora.audit.list` / `bitacora.project_log.list`.
 *  - `bitacora.link_file` (enlazar archivo a entrada).
 *  - `admin.questionnaire_editor.*` (editor visual de cuestionarios,
 *    AC-7 SPEC-010; reordenar/editar/agregar/quitar/preview). Estas
 *    acciones son **escritura mecánica** sobre `questionnaire_questions`
 *    mediada por la capa admin; NO duplican reglas de SPEC-003.
 */
export const DASHBOARD_AUDIT_ACTIONS = [
  "dashboard.get",
  "dashboard.save_layout",
  "admin.roles.list",
  "admin.permissions.list",
  "bitacora.audit.list",
  "bitacora.project_log.list",
  "bitacora.link_file",
  "admin.questionnaire_editor.reorder",
  "admin.questionnaire_editor.update",
  "admin.questionnaire_editor.add",
  "admin.questionnaire_editor.remove",
  "admin.questionnaire_editor.preview",
  // SPEC-011 (Suscripciones · B20a). Acciones de auditoría del módulo
  // Suscripciones. El sistema (job `markVencida`) usa el actor
  // `system` para diferenciarlo del actor humano (BR-N336).
  "subscription.create",
  "subscription.renovar",
  "subscription.pausar",
  "subscription.cancelar",
  "subscription.reactivar",
  "subscription.vencer",
  "subscription.mark_vencida",
  "subscription.list",
  "subscription.get",
  "subscription.history",
  "subscription.facturacion",
  "subscription.cobranza",
] as const;
export type DashboardAuditAction =
  (typeof DASHBOARD_AUDIT_ACTIONS)[number];
