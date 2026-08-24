/**
 * Helpers puros del módulo Proyectos (SPEC-005 §4.3 / §5 / §6).
 *
 * Sin acceso a BD ni sesión. Funciones deterministas, testeables en
 * aislamiento. Los servicios `createProjectsService()` /
 * `createModulesService()` / `createJsonDiscoveryService()` los
 * invocan y los tests Vitest los importan directamente.
 *
 * Reglas cubiertas:
 *  - BR-N375..N378 · transiciones canónicas de etapa (happy path
 *    planning → development → testing → client_validation → delivery).
 *  - BR-N379 · laterales `paused` / `cancelled` con motivo.
 *  - BR-N253 / N254 · salud calculada + override con motivo.
 *  - BR-N113 / N114 / N260 · transiciones de módulo.
 *  - BR-N353 · campos inmutables del JSON Discovery.
 *  - BR-N397 · round-trip idempotente por versión.
 *  - ADR-11 · contrato del JSON Discovery.
 */
import {
  HEALTH_REASON_MIN_LENGTH,
  MODULE_STATUSES,
  PROJECT_HEALTHS,
  PROJECT_SITUATIONS,
  PROJECT_STAGES,
  type ModuleStatus,
  type ProjectHealth,
  type ProjectSituation,
  type ProjectStage,
} from "@/shared/enums";

// ─────────────────────────────────────────────────────────────────────────────
// 1) Etapa del proyecto · transiciones canónicas (BR-N375..N378)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SPEC-005 / AC-4 · valida una transición de etapa. Devuelve
 * `{ ok: true }` si la transición es válida o `{ ok: false, code }`
 * con un código estable.
 *
 * Happy path principal:
 *   planning → development → testing → client_validation → delivery
 *
 * Laterales (BR-N379):
 *   - `paused` desde cualquier etapa no terminal; `resume` desde
 *     `paused` regresa a la etapa previa (regida por el servicio, que
 *     conoce el histórico).
 *   - `cancelled` es terminal absoluto (DEC-FUN-35).
 *
 * Etapas terminales: `delivery` (cierre técnico) y `cancelled`
 * (cancelación con reembolso).
 */
export type ProjectStageTransitionError =
  | "PROJECT_INVALID_TRANSITION"
  | "PROJECT_PAUSE_REASON_REQUIRED"
  | "PROJECT_CANCEL_REASON_REQUIRED";

export function canTransitionProjectStage(
  current: ProjectStage | ProjectSituation | string,
  target: ProjectStage | string,
): { ok: true } | { ok: false; code: ProjectStageTransitionError } {
  if (!PROJECT_STAGES.includes(current as ProjectStage) && !PROJECT_SITUATIONS.includes(current as ProjectSituation)) {
    return { ok: false, code: "PROJECT_INVALID_TRANSITION" };
  }
  if (!PROJECT_STAGES.includes(target as ProjectStage)) {
    return { ok: false, code: "PROJECT_INVALID_TRANSITION" };
  }
  if (current === target) {
    return { ok: false, code: "PROJECT_INVALID_TRANSITION" };
  }
  switch (current) {
    case "planning":
      return target === "development"
        ? { ok: true }
        : { ok: false, code: "PROJECT_INVALID_TRANSITION" };
    case "development":
      return target === "testing"
        ? { ok: true }
        : { ok: false, code: "PROJECT_INVALID_TRANSITION" };
    case "testing":
      return target === "client_validation"
        ? { ok: true }
        : { ok: false, code: "PROJECT_INVALID_TRANSITION" };
    case "client_validation":
      return target === "delivery"
        ? { ok: true }
        : { ok: false, code: "PROJECT_INVALID_TRANSITION" };
    case "delivery":
      // `delivery` es terminal técnico; sólo admite cancel (DEC-FUN-35
      // vía situación, no etapa).
      return { ok: false, code: "PROJECT_INVALID_TRANSITION" };
    default:
      return { ok: false, code: "PROJECT_INVALID_TRANSITION" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Situación del proyecto · pause / resume / cancel (BR-N379, DEC-FUN-35)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SPEC-005 / BR-N379 · `paused` y `cancelled` aplican motivo obligatorio
 * (≥3 caracteres). `cancelled` es terminal absoluto.
 */
export function validateProjectSituationReason(
  raw: string | null | undefined,
  kind: "pause" | "cancel",
): { ok: true } | { ok: false; code: ProjectStageTransitionError } {
  const text = (raw ?? "").trim();
  if (text.length < HEALTH_REASON_MIN_LENGTH) {
    return {
      ok: false,
      code:
        kind === "pause"
          ? "PROJECT_PAUSE_REASON_REQUIRED"
          : "PROJECT_CANCEL_REASON_REQUIRED",
    };
  }
  return { ok: true };
}

/**
 * SPEC-005 / BR-N379 / DEC-FUN-35 · terminales de situación.
 */
export function isProjectSituationTerminal(s: ProjectSituation | string): boolean {
  return s === "completed" || s === "cancelled";
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Salud calculada y override (BR-N254)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SPEC-005 / BR-N254 · la salud se **calcula** a partir del estado de
 * los módulos (regla determinista, sin acceso a BD):
 *  - Cualquier módulo `blocked` o `cancelled` requerido → `delayed`.
 *  - Cualquier módulo `paused` o en `testing` con required → `at_risk`.
 *  - En otro caso → `on_track`.
 *
 * Esta heurística es decisión interna reversible (P-005-2 cerrado por
 * Frank: ninguno; SPEC §12). Puede sustituirse por una métrica más
 * rica (entregables vencidos, ratio de avance, etc.) sin cambiar el
 * contrato.
 */
export function computeCalculatedHealth(
  modules: Array<{ status: ModuleStatus | string; required?: boolean }>,
): ProjectHealth {
  let delayed = false;
  let atRisk = false;
  for (const m of modules) {
    const status = m.status;
    const required = m.required ?? false;
    if (status === "blocked" || (status === "cancelled" && required)) {
      delayed = true;
    } else if (
      (status === "paused" || (status === "testing" && required)) &&
      !delayed
    ) {
      atRisk = true;
    }
  }
  if (delayed) return "delayed";
  if (atRisk) return "at_risk";
  return "on_track";
}

/**
 * SPEC-005 / AC-5 · valida un override de salud:
 *  - motivo obligatorio (BR-N254).
 *  - si `health === healthCalculated`, el override no aplica
 *    (`HEALTH_REASON_REQUIRED` semántico — no se permite override
 *    redundante).
 */
export function validateHealthOverride(input: {
  health: ProjectHealth | string;
  healthCalculated: ProjectHealth | string;
  reason: string | null | undefined;
}): { ok: true } | { ok: false; code: "HEALTH_REASON_REQUIRED" } {
  if (!PROJECT_HEALTHS.includes(input.health as ProjectHealth)) {
    return { ok: false, code: "HEALTH_REASON_REQUIRED" };
  }
  if (input.health === input.healthCalculated) {
    // Override redundante: no se admite motivo vacío para un cambio
    // que no cambia el estado.
    return { ok: false, code: "HEALTH_REASON_REQUIRED" };
  }
  const reason = (input.reason ?? "").trim();
  if (reason.length < HEALTH_REASON_MIN_LENGTH) {
    return { ok: false, code: "HEALTH_REASON_REQUIRED" };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) Módulos · transiciones (BR-N113/114/260..263)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SPEC-005 / AC-8 / BR-N113 · transiciones de módulo. `deployed` es
 * cierre técnico (DEC-FUN-59). Los gates de aceptación viven en
 * SPEC-006; aquí devolvemos `MODULE_INVALID_TRANSITION` para
 * transiciones no permitidas.
 */
export type ModuleTransitionError =
  | "MODULE_INVALID_TRANSITION"
  | "MODULE_NOT_FOUND";

export function canTransitionModule(
  current: ModuleStatus | string,
  target: ModuleStatus | string,
): { ok: true } | { ok: false; code: ModuleTransitionError } {
  if (!MODULE_STATUSES.includes(current as ModuleStatus)) {
    return { ok: false, code: "MODULE_NOT_FOUND" };
  }
  if (!MODULE_STATUSES.includes(target as ModuleStatus)) {
    return { ok: false, code: "MODULE_INVALID_TRANSITION" };
  }
  if (current === target) {
    return { ok: false, code: "MODULE_INVALID_TRANSITION" };
  }
  switch (current) {
    case "pending":
      return ["in_progress", "cancelled"].includes(target)
        ? { ok: true }
        : { ok: false, code: "MODULE_INVALID_TRANSITION" };
    case "in_progress":
      return ["testing", "paused", "blocked", "cancelled"].includes(target)
        ? { ok: true }
        : { ok: false, code: "MODULE_INVALID_TRANSITION" };
    case "testing":
      return ["deployed", "in_progress", "paused", "blocked", "cancelled"].includes(target)
        ? { ok: true }
        : { ok: false, code: "MODULE_INVALID_TRANSITION" };
    case "deployed":
      // `deployed` es terminal técnico. Cancel sigue prohibido (DEC-FUN-59
      // — cierre técnico admite reapertura a `testing` por la fuerza).
      return target === "testing" ? { ok: true } : { ok: false, code: "MODULE_INVALID_TRANSITION" };
    case "paused":
      return ["in_progress", "blocked", "cancelled"].includes(target)
        ? { ok: true }
        : { ok: false, code: "MODULE_INVALID_TRANSITION" };
    case "blocked":
      return ["in_progress", "paused", "cancelled"].includes(target)
        ? { ok: true }
        : { ok: false, code: "MODULE_INVALID_TRANSITION" };
    case "cancelled":
      return { ok: false, code: "MODULE_INVALID_TRANSITION" };
    default:
      return { ok: false, code: "MODULE_INVALID_TRANSITION" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) JSON Discovery · round-trip (ADR-11, BR-N396..N398, BR-N353)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SPEC-005 / BR-N353 · campos inmutables del JSON Discovery. Si el
 * JSON entrante los modifica, se rechaza con `JSON_IMMUTABLE_FIELDS`.
 */
export const JSON_DISCOVERY_IMMUTABLE_FIELDS = ["project_id", "folio", "included"] as const;
export type JsonDiscoveryImmutableField = (typeof JSON_DISCOVERY_IMMUTABLE_FIELDS)[number];

export interface JsonDiscoveryDiffAdd {
  kind: "add";
  code: string;
  name: string;
  required: boolean;
}
export interface JsonDiscoveryDiffChange {
  kind: "change";
  code: string;
  field: "name" | "required" | "depends_on_modules" | "sort_order";
  before: unknown;
  after: unknown;
}
export interface JsonDiscoveryDiffConflict {
  kind: "conflict";
  code: string;
  field: JsonDiscoveryImmutableField;
  message: string;
}
export type JsonDiscoveryDiff = JsonDiscoveryDiffAdd | JsonDiscoveryDiffChange | JsonDiscoveryDiffConflict;

export interface JsonDiscoveryDiffResult {
  adds: JsonDiscoveryDiffAdd[];
  changes: JsonDiscoveryDiffChange[];
  conflicts: JsonDiscoveryDiffConflict[];
  /** `true` cuando no hay nada que aplicar (idempotente). */
  noop: boolean;
}

/**
 * SPEC-005 / AC-6 · calcula el diff entre el plan actual (BD) y el
 * JSON entrante. Detecta conflictos en inmutables y omite el rechazo
 * por inmutables (la validación debe llamarse ANTES de aprobar).
 */
export function diffJsonDiscoveryPlans(input: {
  /** Filas actuales (`modules`). */
  current: Array<{
    code: string;
    name: string;
    required: boolean;
    dependsOnModules: string[];
    sortOrder: number;
  }>;
  incoming: {
    modules: Array<{
      code: string;
      name: string;
      required: boolean;
      depends_on_modules?: string[];
      sort_order?: number;
    }>;
  };
  /** Folio y project_id actuales para validar inmutables. */
  currentProjectId: string;
  currentFolio: string;
  currentIncluded: string[];
  incomingProjectId: string;
  incomingFolio: string;
  incomingIncluded: string[];
}): JsonDiscoveryDiffResult {
  const conflicts: JsonDiscoveryDiffConflict[] = [];
  if (input.incomingProjectId !== input.currentProjectId) {
    conflicts.push({
      kind: "conflict",
      code: "_project",
      field: "project_id",
      message: `project_id inmutable (esperado ${input.currentProjectId})`,
    });
  }
  if (input.incomingFolio !== input.currentFolio) {
    conflicts.push({
      kind: "conflict",
      code: "_folio",
      field: "folio",
      message: `folio inmutable (esperado ${input.currentFolio})`,
    });
  }
  // `included` debe ser idéntico en orden y contenido (BR-N353).
  if (
    input.incomingIncluded.length !== input.currentIncluded.length ||
    input.incomingIncluded.some((v, i) => v !== input.currentIncluded[i])
  ) {
    conflicts.push({
      kind: "conflict",
      code: "_included",
      field: "included",
      message: `included inmutable (esperado ${JSON.stringify(input.currentIncluded)})`,
    });
  }

  const adds: JsonDiscoveryDiffAdd[] = [];
  const changes: JsonDiscoveryDiffChange[] = [];
  const byCode = new Map(input.current.map((c) => [c.code, c]));
  const seen = new Set<string>();

  for (const m of input.incoming.modules) {
    seen.add(m.code);
    const current = byCode.get(m.code);
    if (!current) {
      adds.push({
        kind: "add",
        code: m.code,
        name: m.name,
        required: m.required,
      });
      continue;
    }
    if (current.name !== m.name) {
      changes.push({
        kind: "change",
        code: m.code,
        field: "name",
        before: current.name,
        after: m.name,
      });
    }
    if (current.required !== m.required) {
      changes.push({
        kind: "change",
        code: m.code,
        field: "required",
        before: current.required,
        after: m.required,
      });
    }
    const incomingDeps = m.depends_on_modules ?? [];
    if (
      current.dependsOnModules.length !== incomingDeps.length ||
      incomingDeps.some((d, i) => d !== current.dependsOnModules[i])
    ) {
      changes.push({
        kind: "change",
        code: m.code,
        field: "depends_on_modules",
        before: current.dependsOnModules,
        after: incomingDeps,
      });
    }
    const incomingSort = m.sort_order ?? 0;
    if (current.sortOrder !== incomingSort) {
      changes.push({
        kind: "change",
        code: m.code,
        field: "sort_order",
        before: current.sortOrder,
        after: incomingSort,
      });
    }
  }

  // Altas no se ven como "removed" en el MVP — el round-trip conserva
  // los módulos existentes no listados (decisión interna reversible
  // P-005-3 cerrado por Frank: none). Si el caller quiere `replace`,
  // lo solicita explícitamente.

  const noop = conflicts.length === 0 && adds.length === 0 && changes.length === 0;
  return { adds, changes, conflicts, noop };
}

/**
 * SPEC-005 / AC-7 · valida inmutables. Devuelve el primer conflicto
 * encontrado o `null` si pasa.
 */
export function findJsonDiscoveryImmutableConflict(input: {
  currentProjectId: string;
  currentFolio: string;
  currentIncluded: readonly string[];
  incomingProjectId: string;
  incomingFolio: string;
  incomingIncluded: readonly string[];
}): JsonDiscoveryDiffConflict | null {
  if (input.incomingProjectId !== input.currentProjectId) {
    return {
      kind: "conflict",
      code: "_project",
      field: "project_id",
      message: `project_id inmutable (esperado ${input.currentProjectId})`,
    };
  }
  if (input.incomingFolio !== input.currentFolio) {
    return {
      kind: "conflict",
      code: "_folio",
      field: "folio",
      message: `folio inmutable (esperado ${input.currentFolio})`,
    };
  }
  if (
    input.incomingIncluded.length !== input.currentIncluded.length ||
    input.incomingIncluded.some((v, i) => v !== input.currentIncluded[i])
  ) {
    return {
      kind: "conflict",
      code: "_included",
      field: "included",
      message: `included inmutable (esperado ${JSON.stringify(input.currentIncluded)})`,
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6) Utilidades varias
// ─────────────────────────────────────────────────────────────────────────────

/** BR-N216 análogo · siguiente código `PR-NNNNN` por organización. */
export async function nextProjectCode(
  orgId: string,
  dbExecutor: { selectMax: (orgId: string) => Promise<string | null> },
): Promise<string> {
  const last = await dbExecutor.selectMax(orgId);
  if (!last) return "PR-00001";
  const m = /^PR-(\d{1,})$/.exec(last);
  if (!m || !m[1]) return "PR-00001";
  const n = (parseInt(m[1], 10) + 1).toString().padStart(5, "0");
  return `PR-${n}`;
}

/**
 * SPEC-005 §4.3 · contrato del evento `project.created_from_order`
 * que consume **SPEC-004** para marcar la OS `→ in_execution`
 * (BR-N247, BR-N407) y **SPEC-011** si la OS es de tipo suscripción.
 * Este helper forma el payload; el servicio lo emite en `audit_logs`
 * con `action = "project.created_from_order"` dentro de la transacción
 * de `project_creation`. La OS NO es mutada desde aquí (no-acoplamiento
 * inverso, SPEC §14).
 */
export interface ProjectCreatedFromOrderEvent {
  projectId: string;
  organizationId: string;
  orderId: string;
  plUserId: string;
  tipoCobro: "pago_unico" | "mensualidades" | "suscripcion";
  templateId: string;
  templateType: string;
  planVersion: number;
  createdAt: string;
  consumers: {
    /** SPEC-004 marca la OS `→ in_execution` en su propio flujo (BR-N247). */
    osMarkInExecution: "SPEC-004 (in_execution, BR-N247)";
    /** SPEC-006 cerrará el proyecto y emitirá `project.delivered_from_order`. */
    futureTechnicalClosure: "SPEC-006 (project.delivered_from_order)";
  };
}

export function buildProjectCreatedFromOrderEvent(input: {
  projectId: string;
  organizationId: string;
  orderId: string;
  plUserId: string;
  tipoCobro: "pago_unico" | "mensualidades" | "suscripcion";
  templateId: string;
  templateType: string;
  planVersion: number;
  createdAt: Date;
}): ProjectCreatedFromOrderEvent {
  return {
    projectId: input.projectId,
    organizationId: input.organizationId,
    orderId: input.orderId,
    plUserId: input.plUserId,
    tipoCobro: input.tipoCobro,
    templateId: input.templateId,
    templateType: input.templateType,
    planVersion: input.planVersion,
    createdAt: input.createdAt.toISOString(),
    consumers: {
      osMarkInExecution: "SPEC-004 (in_execution, BR-N247)",
      futureTechnicalClosure: "SPEC-006 (project.delivered_from_order)",
    },
  };
}