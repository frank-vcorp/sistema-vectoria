/**
 * Helpers puros del módulo Proyectos — equipo y ejecución (SPEC-006).
 *
 * Cubre las validaciones BR-N255-258/BR-N264-296/BR-N337/BR-N382-398 y los
 * cálculos de avance/salud sin acceso a BD. Funciones deterministas,
 * consumidas por los servicios y testeables en aislamiento.
 *
 * Reglas cubiertas:
 *  - BR-N264-267 · transiciones canónicas de `requirements`.
 *  - BR-N268-274/BR-N269 · transiciones de `tasks`
 *    (backlog→ready→in_progress→in_review→done; laterales).
 *  - BR-007/BR-N271 · `done` exige TODOS los checklist done y
 *    AL MENOS una evidencia (AC-3).
 *  - BR-N270 · `reject` con motivo (AC-4).
 *  - BR-N283-290/BR-N284/BR-N389/BR-N390 · `tests.markNotApplicable`
 *    con justificación y, si es `acceptance`, aprobación Director.
 *  - BR-N287/BR-N288-291/DEC-FUN-55 · aceptación por proxy exige
 *    identidad/org/fecha/medio/evidencia.
 *  - BR-N292-296/BR-N294/BR-N395 · change requests: con costo
 *    exigen cotización; sin costo omiten `quoted`/`authorized`.
 *  - BR-N255-258/BR-N392 · gates de cierre técnico del proyecto.
 *  - BR-N367/BR-N368-370 · cálculo de `progress` y `health`.
 */
import {
  BLOCKING_TEST_TYPES,
  CHANGE_REQUEST_STATUSES,
  DELIVERABLE_STATUSES,
  REQUIREMENT_STATUSES,
  TASK_STATUSES,
  TEST_TYPES,
  type ChangeRequestStatus,
  type DeliverableStatus,
  type RequirementStatus,
  type TaskStatus,
  type TestStatus,
  type TestType,
} from "@/shared/enums";

// ─────────────────────────────────────────────────────────────────────────────
// 1) Requerimientos · transiciones (BR-N264-267)
// ─────────────────────────────────────────────────────────────────────────────

export type RequirementTransitionError =
  | "REQUIREMENT_INVALID_TRANSITION"
  | "REQUIREMENT_NOT_FOUND";

/**
 * SPEC-006 / AC-1 / BR-N264-267 · línea principal:
 *   proposed → analysis → approved → development → testing → validated
 * Laterales: `rejected` (no se hará) y `out_of_scope` (redirigido).
 *
 * Devuelve `{ ok: true }` o `{ ok: false, code }`. `rejected` y
 * `out_of_scope` son terminales absolutos.
 */
export function canTransitionRequirement(
  current: RequirementStatus | string,
  target: RequirementStatus | string,
): { ok: true } | { ok: false; code: RequirementTransitionError } {
  if (!REQUIREMENT_STATUSES.includes(current as RequirementStatus)) {
    return { ok: false, code: "REQUIREMENT_NOT_FOUND" };
  }
  if (!REQUIREMENT_STATUSES.includes(target as RequirementStatus)) {
    return { ok: false, code: "REQUIREMENT_INVALID_TRANSITION" };
  }
  if (current === target) {
    return { ok: false, code: "REQUIREMENT_INVALID_TRANSITION" };
  }
  if (current === "rejected" || current === "out_of_scope") {
    return { ok: false, code: "REQUIREMENT_INVALID_TRANSITION" };
  }
  if (target === "rejected" || target === "out_of_scope") {
    return { ok: true };
  }
  switch (current) {
    case "proposed":
      return target === "analysis"
        ? { ok: true }
        : { ok: false, code: "REQUIREMENT_INVALID_TRANSITION" };
    case "analysis":
      return ["approved", "rejected", "out_of_scope"].includes(target)
        ? { ok: true }
        : { ok: false, code: "REQUIREMENT_INVALID_TRANSITION" };
    case "approved":
      return ["development", "out_of_scope"].includes(target)
        ? { ok: true }
        : { ok: false, code: "REQUIREMENT_INVALID_TRANSITION" };
    case "development":
      return ["testing", "out_of_scope"].includes(target)
        ? { ok: true }
        : { ok: false, code: "REQUIREMENT_INVALID_TRANSITION" };
    case "testing":
      return target === "validated"
        ? { ok: true }
        : { ok: false, code: "REQUIREMENT_INVALID_TRANSITION" };
    case "validated":
      return { ok: false, code: "REQUIREMENT_INVALID_TRANSITION" };
    default:
      return { ok: false, code: "REQUIREMENT_INVALID_TRANSITION" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Tareas · transiciones (BR-N268-274)
// ─────────────────────────────────────────────────────────────────────────────

export type TaskTransitionError =
  | "TASK_INVALID_TRANSITION"
  | "TASK_NOT_FOUND";

/**
 * SPEC-006 / AC-2..AC-4 / BR-N268-274 · línea principal:
 *   backlog → ready → in_progress → in_review → done
 * Laterales: `blocked`, `cancelled`. `rejected` se modela como acción
 * explícita (`reject`) que vuelve a `ready` sin asignado (no es una
 * transición de estado); vive en `tasks.reject` y `BR-N270`.
 *
 * `done` exige checklist + evidencia (BR-007/BR-N271) — eso se valida
 * en `validateTaskDoneGates`. Esta función sólo valida la transición.
 */
export function canTransitionTask(
  current: TaskStatus | string,
  target: TaskStatus | string,
): { ok: true } | { ok: false; code: TaskTransitionError } {
  if (!TASK_STATUSES.includes(current as TaskStatus)) {
    return { ok: false, code: "TASK_NOT_FOUND" };
  }
  if (!TASK_STATUSES.includes(target as TaskStatus)) {
    return { ok: false, code: "TASK_INVALID_TRANSITION" };
  }
  if (current === target) {
    return { ok: false, code: "TASK_INVALID_TRANSITION" };
  }
  if (current === "done" || current === "cancelled") {
    return { ok: false, code: "TASK_INVALID_TRANSITION" };
  }
  switch (current) {
    case "backlog":
      return ["ready", "cancelled"].includes(target)
        ? { ok: true }
        : { ok: false, code: "TASK_INVALID_TRANSITION" };
    case "ready":
      return ["in_progress", "backlog", "blocked", "cancelled"].includes(target)
        ? { ok: true }
        : { ok: false, code: "TASK_INVALID_TRANSITION" };
    case "in_progress":
      return ["in_review", "ready", "blocked", "cancelled"].includes(target)
        ? { ok: true }
        : { ok: false, code: "TASK_INVALID_TRANSITION" };
    case "in_review":
      // BR-N387/388 · revisión: approve → done (con gates), reject → in_progress.
      return ["done", "in_progress", "blocked", "cancelled"].includes(target)
        ? { ok: true }
        : { ok: false, code: "TASK_INVALID_TRANSITION" };
    case "blocked":
      return ["ready", "in_progress", "cancelled"].includes(target)
        ? { ok: true }
        : { ok: false, code: "TASK_INVALID_TRANSITION" };
    default:
      return { ok: false, code: "TASK_INVALID_TRANSITION" };
  }
}

/**
 * SPEC-006 / BR-N270 / AC-4 · `reject` exige motivo obligatorio (≥3
 * caracteres). Devuelve `TASK_REJECT_REASON_REQUIRED` si está vacío o
 * muy corto.
 */
export function validateTaskRejectReason(
  reason: string | null | undefined,
): { ok: true } | { ok: false; code: "TASK_REJECT_REASON_REQUIRED" } {
  const t = (reason ?? "").trim();
  if (t.length < 3) {
    return { ok: false, code: "TASK_REJECT_REASON_REQUIRED" };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Tareas · gates de cierre `done` (BR-007/BR-N271, AC-3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SPEC-006 / AC-3 / BR-007 / BR-N271 · `done` exige:
 *  - TODOS los ítems del checklist marcados `done`.
 *  - AL MENOS una evidencia (file_id) en `task_evidence`.
 *
 * Devuelve `{ ok: true }` si pasa o `{ ok: false, code }` con
 * `TASK_DONE_GATES` cuando alguno falta. Si NO hay ítems ni
 * evidencia, también falla (defensa: una tarea vacía no puede
 * cerrarse).
 */
export function validateTaskDoneGates(input: {
  checklists: Array<{ done: boolean }>;
  evidenceCount: number;
}): { ok: true } | { ok: false; code: "TASK_DONE_GATES" } {
  if (input.checklists.length === 0) {
    return { ok: false, code: "TASK_DONE_GATES" };
  }
  if (input.evidenceCount === 0) {
    return { ok: false, code: "TASK_DONE_GATES" };
  }
  if (input.checklists.some((c) => !c.done)) {
    return { ok: false, code: "TASK_DONE_GATES" };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) Pruebas · not_applicable (BR-N389, AC-5)
// ─────────────────────────────────────────────────────────────────────────────

export type TestNotApplicableError =
  | "TEST_NOT_APPLICABLE_REASON_REQUIRED"
  | "ACCEPTANCE_TEST_REQUIRED"
  | "TEST_NOT_FOUND";

/**
 * SPEC-006 / BR-N389 / AC-5 · `not_applicable` exige justificación
 * obligatoria (≥3 caracteres) y, cuando el tipo es `acceptance`,
 * además aprobación del Director (BR-N389 literal:
 * "acceptance exige excepción Director").
 *
 * Devuelve `ok: true` o `ok: false` con código estable.
 */
export function validateTestMarkNotApplicable(input: {
  type: TestType | string;
  reason: string | null | undefined;
  approvedByActorHasApproveCambios?: boolean;
}): { ok: true } | { ok: false; code: TestNotApplicableError } {
  if (!TEST_TYPES.includes(input.type as TestType)) {
    return { ok: false, code: "TEST_NOT_FOUND" };
  }
  const reason = (input.reason ?? "").trim();
  if (reason.length < 3) {
    return { ok: false, code: "TEST_NOT_APPLICABLE_REASON_REQUIRED" };
  }
  if (
    input.type === "acceptance" &&
    !input.approvedByActorHasApproveCambios
  ) {
    return { ok: false, code: "ACCEPTANCE_TEST_REQUIRED" };
  }
  return { ok: true };
}

/**
 * SPEC-006 / BR-N284/BR-N285 / AC-5 · tipos de prueba BLOQUEANTES
 * para el cierre técnico del proyecto. `performance` y `security`
 * sólo `at_risk`. Exposición directa del catálogo
 * `BLOCKING_TEST_TYPES` para evitar imports circulares en servicio.
 */
export function isBlockingTestType(type: TestType | string): boolean {
  return BLOCKING_TEST_TYPES.includes(type as TestType);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) Entregables · aceptación por proxy (BR-N287/DEC-FUN-55, AC-6)
// ─────────────────────────────────────────────────────────────────────────────

export type DeliverableAcceptError =
  | "ACCEPTANCE_EVIDENCE_REQUIRED"
  | "DELIVERABLE_NOT_FOUND";

/**
 * SPEC-006 / BR-N287 / DEC-FUN-55 / AC-6 · la aceptación exige
 * identidad + organización + medio + archivo de evidencia. Sin
 * alguno → `ACCEPTANCE_EVIDENCE_REQUIRED` (409).
 *
 * El PL es registrador, no aceptante. La validación de
 * `accepterName === PL` se hace en servicio (no aquí).
 */
export function validateDeliverableAcceptance(input: {
  accepterName: string | null | undefined;
  accepterOrg: string | null | undefined;
  acceptedMedium: string | null | undefined;
  evidenceFileId: string | null | undefined;
}): { ok: true } | { ok: false; code: DeliverableAcceptError } {
  if (
    !input.accepterName ||
    input.accepterName.trim().length === 0 ||
    !input.accepterOrg ||
    input.accepterOrg.trim().length === 0
  ) {
    return { ok: false, code: "ACCEPTANCE_EVIDENCE_REQUIRED" };
  }
  if (!input.acceptedMedium || input.acceptedMedium.trim().length === 0) {
    return { ok: false, code: "ACCEPTANCE_EVIDENCE_REQUIRED" };
  }
  if (!input.evidenceFileId) {
    return { ok: false, code: "ACCEPTANCE_EVIDENCE_REQUIRED" };
  }
  return { ok: true };
}

/**
 * SPEC-006 / BR-N288-291 · transiciones del entregable.
 *
 * Línea: pending → preparing → delivered → accepted
 * Laterales:
 *  - delivered → observed (cliente tiene comentarios pero no rechaza).
 *  - observed → corrected.
 *  - rejected (terminal) y cancelled.
 */
export type DeliverableTransitionError =
  | "DELIVERABLE_INVALID_TRANSITION"
  | "DELIVERABLE_NOT_FOUND";

export function canTransitionDeliverable(
  current: DeliverableStatus | string,
  target: DeliverableStatus | string,
): { ok: true } | { ok: false; code: DeliverableTransitionError } {
  if (!DELIVERABLE_STATUSES.includes(current as DeliverableStatus)) {
    return { ok: false, code: "DELIVERABLE_NOT_FOUND" };
  }
  if (!DELIVERABLE_STATUSES.includes(target as DeliverableStatus)) {
    return { ok: false, code: "DELIVERABLE_INVALID_TRANSITION" };
  }
  if (current === target) {
    return { ok: false, code: "DELIVERABLE_INVALID_TRANSITION" };
  }
  if (current === "accepted" || current === "rejected") {
    return { ok: false, code: "DELIVERABLE_INVALID_TRANSITION" };
  }
  switch (current) {
    case "pending":
      return ["preparing", "cancelled"].includes(target)
        ? { ok: true }
        : { ok: false, code: "DELIVERABLE_INVALID_TRANSITION" };
    case "preparing":
      return ["delivered", "cancelled"].includes(target)
        ? { ok: true }
        : { ok: false, code: "DELIVERABLE_INVALID_TRANSITION" };
    case "delivered":
      return ["accepted", "observed", "rejected"].includes(target)
        ? { ok: true }
        : { ok: false, code: "DELIVERABLE_INVALID_TRANSITION" };
    case "observed":
      return ["corrected", "rejected"].includes(target)
        ? { ok: true }
        : { ok: false, code: "DELIVERABLE_INVALID_TRANSITION" };
    case "corrected":
      return ["delivered", "rejected"].includes(target)
        ? { ok: true }
        : { ok: false, code: "DELIVERABLE_INVALID_TRANSITION" };
    case "cancelled":
      return { ok: false, code: "DELIVERABLE_INVALID_TRANSITION" };
    default:
      return { ok: false, code: "DELIVERABLE_INVALID_TRANSITION" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6) Cambios de alcance · transiciones y gates (BR-N292-296/BR-N294/BR-N395)
// ─────────────────────────────────────────────────────────────────────────────

export type ChangeRequestTransitionError =
  | "CHANGE_REQUEST_INVALID_TRANSITION"
  | "CHANGE_REQUEST_NOT_FOUND";

/**
 * SPEC-006 / BR-N292-296 / AC-7 · línea principal:
 *   requested → analysis → quoted → authorized → in_progress →
 *   implemented → validated
 * Laterales: `rejected`, `cancelled`.
 *
 * Con costo: `requested → analysis → quoted → authorized → ...`
 * Sin costo (BR-N395): `requested → analysis → in_progress → ...`
 *   (omite `quoted` y `authorized`). Esta validación del
 *   atajo "sin costo" se hace en `authorize`/`quote` del servicio
 *   (no aquí): el helper sólo valida la forma del grafo.
 */
export function canTransitionChangeRequest(
  current: ChangeRequestStatus | string,
  target: ChangeRequestStatus | string,
): { ok: true } | { ok: false; code: ChangeRequestTransitionError } {
  if (!CHANGE_REQUEST_STATUSES.includes(current as ChangeRequestStatus)) {
    return { ok: false, code: "CHANGE_REQUEST_NOT_FOUND" };
  }
  if (!CHANGE_REQUEST_STATUSES.includes(target as ChangeRequestStatus)) {
    return { ok: false, code: "CHANGE_REQUEST_INVALID_TRANSITION" };
  }
  if (current === target) {
    return { ok: false, code: "CHANGE_REQUEST_INVALID_TRANSITION" };
  }
  if (
    current === "validated" ||
    current === "rejected" ||
    current === "cancelled"
  ) {
    return { ok: false, code: "CHANGE_REQUEST_INVALID_TRANSITION" };
  }
  switch (current) {
    case "requested":
      return target === "analysis"
        ? { ok: true }
        : { ok: false, code: "CHANGE_REQUEST_INVALID_TRANSITION" };
    case "analysis":
      // con costo: quoted; sin costo: in_progress directo.
      return ["quoted", "in_progress", "rejected", "cancelled"].includes(target)
        ? { ok: true }
        : { ok: false, code: "CHANGE_REQUEST_INVALID_TRANSITION" };
    case "quoted":
      return ["authorized", "rejected", "cancelled"].includes(target)
        ? { ok: true }
        : { ok: false, code: "CHANGE_REQUEST_INVALID_TRANSITION" };
    case "authorized":
      return ["in_progress", "cancelled"].includes(target)
        ? { ok: true }
        : { ok: false, code: "CHANGE_REQUEST_INVALID_TRANSITION" };
    case "in_progress":
      return ["implemented", "cancelled"].includes(target)
        ? { ok: true }
        : { ok: false, code: "CHANGE_REQUEST_INVALID_TRANSITION" };
    case "implemented":
      return target === "validated"
        ? { ok: true }
        : { ok: false, code: "CHANGE_REQUEST_INVALID_TRANSITION" };
    default:
      return { ok: false, code: "CHANGE_REQUEST_INVALID_TRANSITION" };
  }
}

/**
 * SPEC-006 / BR-N294/BR-N395 / AC-7 · valida que un CR esté listo
 * para autorizar. Devuelve `CHANGE_QUOTE_REQUIRED` cuando hay costo
 * sin cotización+evidencia.
 */
export function validateChangeRequestAuthorizeGates(input: {
  hasCost: boolean;
  evidenceKind: string;
  linkedQuoteId: string | null | undefined;
  evidenceFileId: string | null | undefined;
}): { ok: true } | { ok: false; code: "CHANGE_QUOTE_REQUIRED" } {
  if (!input.hasCost) {
    // Sin costo: no exige cotización. La rama salta `quoted` y
    // entra directo a `in_progress` tras `analysis`.
    return { ok: true };
  }
  if (input.evidenceKind === "quote") {
    if (!input.linkedQuoteId) {
      return { ok: false, code: "CHANGE_QUOTE_REQUIRED" };
    }
    return { ok: true };
  }
  // Evidencia custom: requiere archivo (defensa para auditorías
  // donde no hay quote pero hay un PDF/hallazgo firmado).
  if (!input.evidenceFileId) {
    return { ok: false, code: "CHANGE_QUOTE_REQUIRED" };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7) Cierre técnico del proyecto · gates (BR-N255-258/BR-N392)
// ─────────────────────────────────────────────────────────────────────────────

export type CloseTechnicalGateError =
  | "CLOSE_GATES"
  | "PROGRESS_BLOCKED";

/**
 * SPEC-006 / BR-N255-258 / AC-8 / BR-N392 · gates del cierre técnico.
 * Devuelve `{ ok: true }` si pasa o `{ ok: false, code: 'CLOSE_GATES' }`
 * con la lista de motivos (`reasons`) cuando alguno falla.
 *
 * Gates:
 *  1. Tareas: ninguna tarea crítica (weight ≥ 1 y status no terminal)
 *     abierta. Una tarea está "abierta" si su status no es `done`,
 *     `cancelled` ni `blocked` (las canceladas no cuentan para
 *     el denominador BR-N367).
 *  2. Requerimientos obligatorios: todos los `requirements` deben
 *     estar `validated`, `rejected` u `out_of_scope`.
 *  3. Pruebas bloqueantes: las de tipo `functional`/`visual`/`ui`/
 *     `acceptance`/`compatibility` deben estar `passed` o
 *     `not_applicable` con justificación válida.
 *  4. Entregables obligatorios: deben estar `accepted` o
 *     `rejected` (un entregable rechazado se considera cerrado).
 *  5. Cambios: ningún CR en estado abierto (no `validated`, no
 *     `rejected`, no `cancelled`).
 *
 * NO exige saldo cero (BR-N392): es cierre técnico, no administrativo.
 */
export function validateCloseTechnicalGates(input: {
  tasks: Array<{ status: TaskStatus | string; weight: number }>;
  requirements: Array<{
    status: RequirementStatus | string;
    required: boolean;
  }>;
  tests: Array<{
    type: TestType | string;
    status: TestStatus | string;
    notApplicableReason: string | null | undefined;
    notApplicableApprovedBy: string | null | undefined;
  }>;
  deliverables: Array<{
    status: DeliverableStatus | string;
    required: boolean;
  }>;
  changeRequests: Array<{ status: ChangeRequestStatus | string }>;
}): { ok: true } | { ok: false; code: "CLOSE_GATES"; reasons: string[] } {
  const reasons: string[] = [];

  // 1) Tareas abiertas (no terminales: done, cancelled, blocked)
  const openTasks = input.tasks.filter(
    (t) =>
      t.status !== "done" &&
      t.status !== "cancelled" &&
      t.status !== "blocked",
  );
  if (openTasks.length > 0) {
    reasons.push(`Tareas abiertas: ${openTasks.length}`);
  }

  // 2) Requerimientos obligatorios validados
  const openRequirements = input.requirements.filter(
    (r) =>
      r.required &&
      r.status !== "validated" &&
      r.status !== "rejected" &&
      r.status !== "out_of_scope",
  );
  if (openRequirements.length > 0) {
    reasons.push(
      `Requerimientos obligatorios sin validar: ${openRequirements.length}`,
    );
  }

  // 3) Pruebas bloqueantes: tipo en BLOCKING_TEST_TYPES y
  //    status ∉ {passed, not_applicable (con justificación)}
  const blockingOpen = input.tests.filter((t) => {
    if (!isBlockingTestType(t.type)) return false;
    if (t.status === "passed") return false;
    if (
      t.status === "not_applicable" &&
      (t.notApplicableReason ?? "").trim().length >= 3
    ) {
      // acceptance exige además aprobación Director
      if (t.type === "acceptance" && !t.notApplicableApprovedBy) {
        return true;
      }
      return false;
    }
    return true;
  });
  if (blockingOpen.length > 0) {
    reasons.push(`Pruebas bloqueantes pendientes: ${blockingOpen.length}`);
  }

  // 4) Entregables obligatorios no aceptados ni rechazados
  const openDeliverables = input.deliverables.filter(
    (d) =>
      d.required &&
      d.status !== "accepted" &&
      d.status !== "rejected" &&
      d.status !== "cancelled",
  );
  if (openDeliverables.length > 0) {
    reasons.push(
      `Entregables obligatorios sin aceptar: ${openDeliverables.length}`,
    );
  }

  // 5) Cambios abiertos (no terminales)
  const openChanges = input.changeRequests.filter(
    (c) =>
      c.status !== "validated" &&
      c.status !== "rejected" &&
      c.status !== "cancelled",
  );
  if (openChanges.length > 0) {
    reasons.push(`Cambios de alcance abiertos: ${openChanges.length}`);
  }

  if (reasons.length === 0) return { ok: true };
  return { ok: false, code: "CLOSE_GATES", reasons };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8) Cálculo de avance y salud (BR-N367, BR-N368-370)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SPEC-006 / BR-N367 / AC-9 · avance de tareas:
 *   `progress = Σ peso(done) / Σ peso(no canceladas) × 100`
 *
 * Si todas las tareas están canceladas → 100% (no hay trabajo
 * restante). Si no hay tareas → 0% (proyecto recién creado).
 */
export function computeTaskProgress(input: {
  tasks: Array<{ status: TaskStatus | string; weight: number }>;
}): number {
  const denom = input.tasks
    .filter((t) => t.status !== "cancelled")
    .reduce((acc, t) => acc + (t.weight ?? 1), 0);
  if (denom === 0) {
    // No hay tareas o todas canceladas: devolvemos 100% para no
    // engañar al dashboard con 0% perpetuo.
    return input.tasks.length === 0 ? 0 : 100;
  }
  const done = input.tasks
    .filter((t) => t.status === "done")
    .reduce((acc, t) => acc + (t.weight ?? 1), 0);
  return Math.round((done / denom) * 100);
}

/**
 * SPEC-006 / BR-N368-370 / AC-9 · salud del proyecto (heurística
 * determinista). Orden de severidad:
 *  - tareas críticas bloqueadas (`blocked` con weight ≥ 3)
 *    o pruebas bloqueantes fallidas → `delayed`.
 *  - pruebas bloqueantes pendientes, tareas en `in_review`
 *    atrasadas o entregables `observed` → `at_risk`.
 *  - resto → `on_track`.
 *
 * El cálculo se basa en contadores derivados de BD, NO en BD; el
 * servicio pasa los snapshots.
 */
export type ProjectHealthComputed = "on_track" | "at_risk" | "delayed";

export function computeProjectHealth(input: {
  tasks: Array<{ status: TaskStatus | string; weight: number }>;
  tests: Array<{ type: TestType | string; status: TestStatus | string }>;
  deliverables: Array<{ status: DeliverableStatus | string }>;
}): ProjectHealthComputed {
  // delayed
  const criticalBlockedTasks = input.tasks.filter(
    (t) => t.status === "blocked" && (t.weight ?? 1) >= 3,
  );
  const blockingFailed = input.tests.filter(
    (t) => isBlockingTestType(t.type) && t.status === "failed",
  );
  if (criticalBlockedTasks.length > 0 || blockingFailed.length > 0) {
    return "delayed";
  }

  // at_risk
  const blockingPending = input.tests.filter(
    (t) => isBlockingTestType(t.type) && t.status === "pending",
  );
  const tasksInReview = input.tasks.filter((t) => t.status === "in_review");
  const deliverablesObserved = input.deliverables.filter(
    (d) => d.status === "observed",
  );
  if (
    blockingPending.length > 0 ||
    tasksInReview.length > 0 ||
    deliverablesObserved.length > 0
  ) {
    return "at_risk";
  }

  return "on_track";
}

// ─────────────────────────────────────────────────────────────────────────────
// 9) Validaciones varias (horas/día, privacidad, privacidad)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SPEC-006 / BR-008 / AC-10 · valida que la suma de horas de un
 * usuario/día en el proyecto no exceda 24 (considerando la nueva
 * entrada). Devuelve `TIME_ENTRY_INVALID_RANGE` si lo excede.
 */
export function validateTimeEntryDailyTotal(input: {
  existingHoursSameDay: number;
  newHours: number;
}): { ok: true } | { ok: false; code: "TIME_ENTRY_INVALID_RANGE" } {
  const total = input.existingHoursSameDay + input.newHours;
  if (total > 24 + 0.0001) {
    return { ok: false, code: "TIME_ENTRY_INVALID_RANGE" };
  }
  return { ok: true };
}

/**
 * SPEC-006 / BR-N208 / AC-10 · un usuario sólo ve sus propias
 * entradas. Esta función decide si el actor actual puede ver las
 * entradas de OTRO usuario. `true` cuando el actor es el propio
 * usuario o tiene permiso `ver_tiempo_equipo`.
 */
export function canViewOtherUserTimeEntries(input: {
  actorUserId: string;
  targetUserId: string;
  actorHasVerTiempoEquipo: boolean;
}): boolean {
  if (input.actorUserId === input.targetUserId) return true;
  return input.actorHasVerTiempoEquipo;
}
