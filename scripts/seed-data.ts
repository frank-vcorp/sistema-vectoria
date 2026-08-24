import {
  BASE_PERMISSIONS,
  SEED_ROLE_CODES,
  SEED_ROLE_PERMISSION_CODES as SEED_ROLE_PERMISSION_CODES_FROM_ENUMS,
} from "@/shared/enums";

export const SEED_ROLE_LABELS: Record<(typeof SEED_ROLE_CODES)[number], string> = {
  director: "Director", vendedor: "Vendedor", administrador: "Administrador", lider_proyecto: "Líder de proyecto", programador: "Programador", disenador: "Diseñador", qa: "QA",
};
export const PERMISSION_LABELS: Record<(typeof BASE_PERMISSIONS)[number], string> = {
  gestionar_usuarios: "Gestionar usuarios",
  gestionar_roles: "Gestionar roles",
  gestionar_config_fiscal: "Gestionar configuración fiscal",
  ver_auditoria: "Ver auditoría",
  gestionar_cuestionarios: "Gestionar cuestionarios",
  gestionar_catalogos: "Gestionar catálogos",
  gestionar_plantillas: "Gestionar plantillas",
  emitir_invitaciones: "Emitir invitaciones",
  gestionar_jobs: "Gestionar jobs",
  ver_todo: "Ver todo",
  ver_costos: "Ver costos",
  ver_cxc_otros: "Ver CxC de otros",
  ver_comisiones_otros: "Ver comisiones de otros",
  ver_tiempo_equipo: "Ver tiempo de equipo",
  ver_notas_privadas: "Ver notas privadas",
  // SPEC-002 (módulo Clientes/Prospectos)
  gestionar_prospectos: "Gestionar prospectos",
  gestionar_clientes: "Gestionar clientes",
  // SPEC-003 (módulo Comercial)
  gestionar_comercial: "Gestionar comercial",
  firmar_alcance: "Firmar alcance",
  aceptar_cotizacion: "Aceptar cotización",
  aprobar_descuento: "Aprobar descuento",
// SPEC-004 (módulo Orden de Servicio)
  "gestionar_ordenes_servicio": "Gestionar órdenes de servicio",
  "asignar_pl_os": "Asignar PL a OS",
  "autorizar_os": "Autorizar inicio de OS",
  "cerrar_os": "Cerrar OS (administrativo)",
  // SPEC-005 (módulo Proyectos)
  "gestionar_proyectos": "Gestionar proyectos",
  "operar_proyectos": "Operar proyectos",
  "aprobar_json_discovery": "Aprobar importación JSON Discovery",
  // SPEC-006 (Proyectos: equipo y ejecución · B11-B16)
  "registrar_tiempo": "Registrar tiempo",
  "aprobar_cambios": "Aprobar cambios de alcance",
  "gestionar_equipo_proyecto": "Gestionar equipo del proyecto",
  // SPEC-007 (Facturación CFDI · B18)
  "gestionar_facturacion": "Gestionar facturación CFDI",
  "ver_facturas": "Ver facturas",
  "timbrar_facturas": "Timbrar facturas CFDI",
  // SPEC-008 (Cobranza y Comisiones · B17/B19/B20)
  "gestionar_cobranza": "Gestionar cobranza (cobros, actividades, promesas)",
  "confirmar_cobros": "Confirmar y reversar cobros",
  "pagar_comisiones": "Marcar comisiones como pagadas",
  // SPEC-009 (Finanzas y Movimientos · B21/B26)
  "gestionar_finanzas": "Gestionar finanzas (cuentas, movimientos, transferencias, costos)",
  "ver_finanzas": "Ver reportes financieros (CxC/CxP/rentabilidad)",
  // SPEC-011 (Suscripciones · B20a · BR-N402 / DEC-FUN-63).
  "gestionar_suscripciones": "Gestionar suscripciones (renovar, pausar, cancelar, reactivar)",
};
/**
 * Dato seed; no contiene lógica por rol (ADR-04 §2.3).
 *
 * AC-80 (DEC-FUN-20260820-75 / BR-N413): la plataforma siembra **sólo**
 * `BASE_PERMISSIONS`. El rol `programador` queda sin permisos en
 * plataforma; el permiso de registrar tiempo pertenece a SPEC-006
 * (Proyectos — equipo y ejecución) y se sembrará allí. La presencia
 * de cualquier code fuera de `BASE_PERMISSIONS` aquí es rechazada
 * por `check-seed-permissions.ts`.
 *
 * SPEC-002 (Clientes/Prospectos): `gestionar_prospectos` y
 * `gestionar_clientes` se asignan a `director`, `administrador` y
 * `vendedor` (este último: ve los propios prospectos vía `ver_todo`
 * ausente; el filtrado por `assigned_to` aplica en servicio).
 *
 * SPEC-003 (Comercial): `gestionar_cuestionarios`, `gestionar_catalogos`,
 * `gestionar_plantillas` ya estaban en `BASE_PERMISSIONS`. Asignamos
 * también:
 *  - `gestionar_comercial` a `director`, `administrador`, `vendedor`.
 *  - `firmar_alcance` a `director`, `lider_proyecto` (rol que firma el
 *    alcance, BR-N231).
 *  - `aceptar_cotizacion` a `director`, `administrador`, `vendedor`.
 *  - `aprobar_descuento` (BR-N143, política 10-25% requiere Director)
 *    a `director` solamente.
 *
 * SPEC-004 (Orden de Servicio):
 *  - `gestionar_ordenes_servicio` a `director`, `administrador`,
 *    `vendedor` (carga OC, asigna PL, pausa, cancela).
 *  - `asignar_pl_os` a `director`, `administrador`, `lider_proyecto`
 *    (BR-N245).
 *  - `autorizar_os` a `director` (BR-N244 + BR-N245: umbral 90% +
 *    excepción Director).
 *  - `cerrar_os` a `director` (BR-N249/393/394: cierre
 *    administrativo con saldo cero o excepción).
 *
 * SPEC-005 (Proyectos — artefactos y estados):
 *  - `gestionar_proyectos` a `director`, `administrador`,
 *    `lider_proyecto` (crea/transitiona/cancela/define cierre técnico).
 *  - `operar_proyectos` a `director`, `administrador`, `lider_proyecto`,
 *    `programador`, `disenador`, `qa` (transiciones laterales, avance de
 *    módulos y override de salud).
 *  - `aprobar_json_discovery` a `director` (BR-N396/397 — aprobación
 *    de reimportaciones del JSON Discovery).
 *
 * SPEC-006 (Proyectos — equipo y ejecución · B11-B16):
 *  - `registrar_tiempo` a `director`, `administrador`, `lider_proyecto`,
 *    `programador`, `disenador`, `qa` (auto-registro; BR-N276/BR-N413).
 *  - `aprobar_cambios` a `director`, `administrador`, `lider_proyecto`
 *    (BR-N294/295 — autoriza CR con costo).
 *  - `gestionar_equipo_proyecto` a `director`, `administrador`,
 *    `lider_proyecto` (BR-N382/383 — incorpora/retira miembros).
 *  - `ver_tiempo_equipo` (ya existente en BASE_PERMISSIONS) al
 *    `lider_proyecto` y al `director` para ver el tiempo del equipo
 *    de su(s) proyecto(s) (BR-N277).
 *
 * SPEC-007 (Facturación CFDI · B18):
 *  - `gestionar_facturacion` a `director` (BASE) y `administrador`
 *    (build/preview/zip/schedules).
 *  - `ver_facturas` a `director` (BASE) y `administrador`,
 *    `vendedor` (lectura de facturas propias; BR-N211).
 *  - `timbrar_facturas` a `director` (BASE) y `administrador`
 *    (acción crítica que requiere BD; AC-81).
 *  - Los roles operativos (PL/programador/diseñador/QA) NO reciben
 *    permisos de facturación; el flujo no les concierne.
 *
 * SPEC-008 (Cobranza y Comisiones · B17/B19/B20):
 *  - `gestionar_cobranza` a `director` (BASE) y `administrador`,
 *    `vendedor` (registrar/consultar cobros propios; BR-N211).
 *  - `confirmar_cobros` a `director` (BASE) y `administrador`
 *    (acción crítica con `forceDb`; BR-N315/316).
 *  - `pagar_comisiones` a `director` (BASE) y `administrador`
 *    (default día 15 vía job `comisionesDia15`; BR-N299).
 *  - Visibilidad BR-N207: Vendedor sin `ver_cxc_otros` ve sólo
 *    cobros donde `created_by=actor.id` y comisiones donde
 *    `vendedor_user_id=actor.id`.
 *  - Los roles operativos (PL/programador/diseñador/QA) NO reciben
 *    permisos de cobranza.
 *
 * SPEC-009 (Finanzas y Movimientos · B21/B26):
 *  - `gestionar_finanzas` a `director` (BASE) y `administrador`
 *    (cuentas, movimientos, transferencias, costos, conciliado;
 *    BR-013/BR-N329).
 *  - `ver_finanzas` a `director` (BASE) y `administrador` (lectura;
 *    BR-N209/211).
 *  - Los roles operativos (PL/programador/diseñador/QA) NO reciben
 *    permisos de finanzas. `ver_costos` y `ver_tiempo_equipo` ya
 *    están en BASE_PERMISSIONS (BR-N207/208/278) y les dan acceso a
 *    lectura de su propia rentabilidad.
 *  - P-009-1 cerrado en `none`: no se siembran cuentas seed. El
 *    Director crea la primera cuenta desde la UI (o vía seed manual).
 */
// Re-export para mantener compatibilidad con `seed-catalog.ts` y
// otros callers del script de seed.
export const SEED_ROLE_PERMISSION_CODES = SEED_ROLE_PERMISSION_CODES_FROM_ENUMS;
