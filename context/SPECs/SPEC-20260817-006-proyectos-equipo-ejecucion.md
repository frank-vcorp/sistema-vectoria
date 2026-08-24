# SPEC-20260817-006 · Proyectos — equipo y ejecución

- **ID:** SPEC-20260817-006
- **Estado:** BACKLOG (depende de SPEC-005 `READY`)
- **Versión:** 1.0
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-19 (v1.0)
- **Módulo funcional cubierto:** Incorporación de miembros (por el PL ya-miembro), asignación, requerimientos, tareas, tiempo/costos, pruebas, entregables, cambios de alcance y gates de cierre técnico. Blocks B11, B12, B13, B14, B15, B16.
- **ADRs de referencia:** ARCH-20260817-01, ARCH-20260819-03, ARCH-20260817-05.
- **Depende de:** SPEC-005 (Proyectos artefactos: `project_members`, `modules`; el PL ya es miembro desde `project_creation`).

---

## 1. Resultado
El PL (ya miembro desde SPEC-005) incorpora **otros** miembros y asigna módulos/tareas. Se ejecuta el ciclo: requerimientos → tareas (con checklist+evidencia) → pruebas (bloqueantes/advertencia) → entregables (aceptación por proxy) → cambios de alcance → cierre técnico del Proyecto. La membresía precede a la asignación y controla la visibilidad (DEC-FUN-56, BR-N382/383).

## 2. Fuentes funcionales por ID
- **DEC-FUN:** DEC-FUN-09 (tareas horas opcionales), DEC-FUN-13 (7 tipos de tests), DEC-FUN-20260817-32 (sólo PL asigna), DEC-FUN-33 (rechazo con motivo), DEC-FUN-20260817-55 (aceptación proxy), DEC-FUN-56 (PL incorpora miembros), DEC-FUN-57 (cierre técnico vs administrativo), DEC-FUN-60 (ciclo trabajo/revisión/cambios), DEC-FUN-25 (rentabilidad por técnico).
- **BR (B11-B16):** BR-005..011, BR-N264..N296, BR-N382..N398 (los de proyecto), BR-N386..N391.
- **FLOW:** FLOW-PROJ-01 (ejecución), FLOW-PROJ-02 (equipo), FLOW-PROJ-05 (cierre). SCN-PROJ-01..05, 08..10.
- **Cálculo:** BR-N367 (avance), BR-N368..N370 (salud).

## 3. Alcance y exclusiones
### 3.1 Incluido
- `project_members` (incorporación/retiro por PL), `requirements`, `tasks` (con checklist+evidencia), `task_assignments`, `time_entries` (opcional, snapshot costo/hora), `tests` (7 tipos), `deliverables` (aceptación proxy), `change_requests`. Gates de cierre técnico del Proyecto. Cálculo de avance y salud.
### 3.2 Excluido
- Creación del Proyecto + primer miembro + estados 3D + módulos + JSON round-trip → SPEC-005. Cierre administrativo OS (saldo cero) → SPEC-004. Facturación/cobro del cierre → SPEC-007/008. Rentabilidad financiera agregada → SPEC-009 (esta SPEC sólo calcula costo laboral/directo).

## 4. Modelo técnico (contrato)
### 4.1 Entidades (resumen)
- `requirements (id, organization_id, project_id, module_id, folio, title, description, acceptance_criteria, status enum('proposed'|'analysis'|'approved'|'development'|'testing'|'validated'|'rejected'|'out_of_scope'), reason, assigned_to null, created_at)` (BR-N264-267, BR-005).
- `tasks (id, organization_id, project_id, module_id, requirement_id null, folio, title, status enum('backlog'|'ready'|'in_progress'|'in_review'|'done'|'blocked'|'cancelled'), assigned_to null, priority, weight int, depends_on jsonb, created_at)` (BR-N268-274, BR-006/007).
- `task_checklists (id, task_id, item, done boolean)`, `task_evidence (id, task_id, file_id FK, note)` — `done` exige ambos (BR-N007/N271).
- `task_assignments (id, task_id, user_id, assigned_by, assigned_at, rejected_at null, reject_reason null)` — rechazo con motivo → vuelve a `ready` sin asignado (BR-N270).
- `time_entries (id, organization_id, project_id, task_id null, user_id, hours decimal, kind enum('facturable'|'interna'|'retrabajo'|'soporte'), cost_per_hour_cents bigint (snapshot), date, created_at)` — opcional (BR-N276); >0 y ≤24/día (BR-008); visible sólo propio (BR-N277/208).
- `tests (id, organization_id, project_id, module_id null, requirement_id null, type enum('functional'|'visual'|'ui'|'acceptance'|'performance'|'security'|'compatibility'), status enum('pending'|'passed'|'failed'|'blocked'|'not_applicable'), result, incident, not_applicable_reason, not_applicable_approved_by null)` (BR-N283-290, BR-009, BR-N389/390).
- `deliverables (id, organization_id, project_id, module_id null, name, version, status enum('pending'|'preparing'|'delivered'|'accepted'|'observed'|'corrected'|'rejected'), committed_date, actual_date, accepter_name null, accepter_org null, accepted_at null, accepted_medium null, evidence_file_id null, comments)` (BR-N288-291, BR-010, BR-N391).
- `change_requests (id, organization_id, project_id, folio, status enum('requested'|'analysis'|'quoted'|'authorized'|'rejected'|'cancelled'|'in_progress'|'implemented'|'validated'), impact jsonb, linked_quote_id null, reason, requested_by, authorized_by null, version int)` (BR-N292-296, BR-011, BR-N395).

### 4.2 Servicios
- `members.add(ctx, projectId, userId, role)` / `members.remove(ctx, memberId)` — PL (ya miembro) incorpora otros; retiro revoca acceso futuro, conserva historial (BR-N382/383).
- `tasks.assign(ctx, taskId, userId)` — sólo PL (DEC-FUN-32, BR-N269); técnico puede autoasignar del backlog no asignado.
- `tasks.reject(ctx, taskId, reason)` — vuelve a `ready` sin asignado, notifica al PL (BR-N270).
- `tasks.review(ctx, taskId, approve, observations)` — PL/QA asignado; rechazo → `in_progress` (BR-N387/388); registra rol usado.
- `tests.markNotApplicable(ctx, testId, reason)` — exige justificación + aprobación PL; `acceptance` exige excepción Director (BR-N389).
- `deliverables.accept(ctx, deliverableId, acceptance)` — exige identidad/org/fecha/medio/evidencia; el PL es registrador, no aceptante (BR-N287, DEC-FUN-55); sin esos datos → `409 ACCEPTANCE_EVIDENCE_REQUIRED`.
- `changeRequests.authorize(ctx, crId)` — exige permiso `aprobar_cambios` + aceptación comercial con evidencia si hay costo; actualiza versión del alcance efectivo (BR-N294/296).
- `projects.closeTechnical(ctx, projectId)` — valida gates (BR-N255-258): sin tareas críticas abiertas, reqs obligatorios validados, pruebas bloqueantes aprobadas o excepción, entregables obligatorios aceptados o excepción, cambios autorizados resueltos. Emite señal para SPEC-004 OS→`delivered` (BR-N248/N392).
- Cálculo: `progress = Σpeso(done) / Σpeso(no canceladas) × 100` (BR-N367); salud (BR-N368-370).

## 5. Reglas e invariantes
1. La membresía precede a la asignación; nadie recibe módulo/tarea sin pertenecer (BR-N382).
2. Sólo el PL asigna tareas; autoasignación del backlog no asignado permitida (BR-N269).
3. `done` exige checklist **y** evidencia (BR-007/N271); tiempo opcional (BR-N276).
4. Rechazo de tarea con motivo → `ready` sin asignado (BR-N270).
5. Pruebas bloqueantes (functional/visual/ui/acceptance/compatibility) cierran el proyecto; performance/security sólo advierten (BR-N284/285/N390); `not_applicable` exige justificación+PL, `acceptance` exige excepción Director (BR-N389).
6. Aceptación de entregable por proxy: PL es registrador, no aceptante; identidad+org+fecha+medio+evidencia obligatorios (BR-N287, DEC-FUN-55).
7. Cambios: sin costo omiten cotización, nunca autorización; con costo exigen cotización+evidencia (BR-N395/294); el alcance original no se altera (BR-N296).
8. Cierre técnico ≠ cierre administrativo; el técnico entrega OS con saldo pendiente (BR-N258/N392).
9. El técnico sólo ve su tiempo propio; el PL ve el del equipo de su proyecto (BR-N277/208).

## 6. Casos borde
- Asignar tarea a un no-miembro → `409 NOT_A_MEMBER` (BR-N382).
- `done` sin checklist/evidencia → `409 TASK_DONE_GATES` (BR-007/N271).
- Rechazar tarea sin motivo → `400 REJECT_REASON_REQUIRED` (BR-N270).
- `not_applicable` en prueba acceptance sin excepción Director → `409 ACCEPTANCE_TEST_REQUIRED` (BR-N389).
- Aceptar entregable sin evidencia/identidad → `409 ACCEPTANCE_EVIDENCE_REQUIRED` (BR-N287).
- Cierre técnico con tarea crítica abierta / prueba bloqueante fallida / entregable obligatorio no aceptado (sin excepción) → `409 CLOSE_GATES` (BR-N255-258).
- Cambio con costo sin cotización/evidencia → `409 CHANGE_QUOTE_REQUIRED` (BR-N294).

## 7. Seguridad/privacidad
- Visibilidad por membresía y rol (BR-N212/208/210). `time_entries` sólo propio para técnico (BR-N277). Notas privadas de dirección (BR-N339). Acciones críticas (`tasks.assign`, `deliverables.accept`, `changeRequests.authorize`, `projects.closeTechnical`) en `audit_logs` con `actor_role_code` (BR-N388).

## 8. Migración/compatibilidad
- Migración crea entidades B11-B16 + FKs a `projects`/`modules`. Seed: ninguno.

## 9. Criterios de aceptación
- **AC-1 · Membresía precede asignación:** asignar a no-miembro → `409 NOT_A_MEMBER`; incorporar miembro y asignar → OK; el PL ya es miembro desde SPEC-005 (no requiere alta propia). (BR-N382)
- **AC-2 · Sólo PL asigna:** no-PL asigna → `403`; PL asigna → OK; autoasignación del backlog no asignado permitida. (BR-N269, DEC-FUN-32)
- **AC-3 · done exige checklist+evidencia:** `done` sin uno → `409`; con ambos → OK; tiempo opcional no bloquea. (BR-007/N271/276)
- **AC-4 · Rechazo con motivo:** rechazo sin motivo → `400`; con motivo → `ready` sin asignado + notificación al PL. (BR-N270)
- **AC-5 · Pruebas bloqueantes vs advertencia:** functional/visual/ui/acceptance/compatibility bloquean cierre; performance/security sólo `at_risk` visible; `not_applicable` exige PL; acceptance exige excepción Director. (BR-N284/285/389/390)
- **AC-6 · Aceptación proxy con evidencia:** aceptar entregable sin identidad/medio/evidencia → `409 ACCEPTANCE_EVIDENCE_REQUIRED`; el PL no figura como aceptante. (BR-N287, DEC-FUN-55)
- **AC-7 · Cambios de alcance:** sin costo omite cotización, no autorización; con costo exige cotización+evidencia; autorizar actualiza versión del alcance efectivo sin alterar el original. (BR-N395/294/296)
- **AC-8 · Cierre técnico gates:** `closeTechnical` falla con tarea crítica abierta / prueba bloqueante fallida / entregable obligatorio no aceptado sin excepción → `409 CLOSE_GATES`; con gates OK → emite señal OS→`delivered` (SPEC-004) sin exigir saldo cero. (BR-N255-258, N392)
- **AC-9 · Avance y salud:** `progress` y `health` calculados (BR-N367-370); override de salud con motivo conserva ambos. (BR-N254)
- **AC-10 · Tiempo propio:** técnico ve sólo sus `time_entries`; PL ve las del equipo de su proyecto; time_entry snapshot de `cost_per_hour` al registrar. (BR-N277/208/008/334)
- **AC-11 · UI/responsive:** tablero de tareas (kanban/lista), formulario de entrega con evidencia (subida de archivo), y ciclo de change request operables en 3 viewports; el kanban colapsa a lista en móvil. (ADR-03, DEC-FUN-72, AC-61 SPEC-001)

## 10. Validaciones
- `pnpm typecheck/test/test:e2e`; grep: el servicio no asigna a no-miembros; registro de `actor_role_code` en revisión.

## 11. Rollback
- Revertir migración (drop B11-B16) — aprobación Frank.

## 12. Riesgos y pendientes
- **R1:** gates de cierre técnico dependen de SPEC-005 (módulos deployed) y de pruebas/entregables (esta SPEC); coordinación de la señal de cierre con SPEC-004.
- **P-006-1 (Frank):** none.

## 13. DoD
- AC-1..AC-11 PASS; trazabilidad a BR-005-011/N264-296/N382-398; GEMINI obligatorio (toca autorización por membresía, aceptación proxy, gates de cierre → riesgo medio-alto).

## 14. Handoff a SOFIA (resumen)
- **SPEC activa:** SPEC-006. **ADRs:** 01, 03, 05. **Alcance:** `src/server/db/proyectos/{equipo,ejecucion}/*`, `src/server/services/proyectos/{members,tasks,tests,deliverables,changeRequests,cierre}/*`, `src/server/trpc/routers/proyectos/ejecucion/*`, `src/modules/proyectos/ejecucion/*`. **Contratos protegidos:** membresía antes de asignación, `done`=checklist+evidencia, aceptación proxy, gates de cierre, `time_entries` privacidad. **Contratos que cambian:** emite señal de cierre técnico (consumida por SPEC-004). **Prohibido inferir:** creación del Proyecto/PL (SPEC-005), cierre administrativo/saldo (SPEC-004), facturación/cobro (SPEC-007/008).
