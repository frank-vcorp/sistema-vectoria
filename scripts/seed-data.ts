import { BASE_PERMISSIONS, SEED_ROLE_CODES } from "@/shared/enums";

export const SEED_ROLE_LABELS: Record<(typeof SEED_ROLE_CODES)[number], string> = {
  director: "Director", vendedor: "Vendedor", administrador: "Administrador", lider_proyecto: "Líder de proyecto", programador: "Programador", disenador: "Diseñador", qa: "QA",
};
export const PERMISSION_LABELS: Record<(typeof BASE_PERMISSIONS)[number], string> = {
  gestionar_usuarios: "Gestionar usuarios", gestionar_roles: "Gestionar roles", gestionar_config_fiscal: "Gestionar configuración fiscal", ver_auditoria: "Ver auditoría", gestionar_cuestionarios: "Gestionar cuestionarios", gestionar_catalogos: "Gestionar catálogos", gestionar_plantillas: "Gestionar plantillas", emitir_invitaciones: "Emitir invitaciones", gestionar_jobs: "Gestionar jobs", ver_todo: "Ver todo", ver_costos: "Ver costos", ver_cxc_otros: "Ver CxC de otros", ver_comisiones_otros: "Ver comisiones de otros", ver_tiempo_equipo: "Ver tiempo de equipo", ver_notas_privadas: "Ver notas privadas",
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
 */
export const SEED_ROLE_PERMISSION_CODES: Record<string, string[]> = {
  director: [...BASE_PERMISSIONS],
  administrador: [
    "gestionar_usuarios",
    "gestionar_roles",
    "emitir_invitaciones",
    "ver_auditoria",
    "gestionar_jobs",
  ],
  vendedor: [],
  lider_proyecto: [],
  programador: [], // AC-80: vacío en plataforma. Permiso de tiempo → SPEC-006.
  disenador: [],
  qa: [],
};
