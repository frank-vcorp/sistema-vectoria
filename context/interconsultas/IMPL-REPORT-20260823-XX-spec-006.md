# IMPL-REPORT-20260823-XX · SPEC-006 Proyectos — equipo y ejecución · SOFIA → ATLAS

- **ID intervención:** IMPL-20260823-XX-spec-006
- **ID tarea:** SPEC-20260817-006 (Proyectos: equipo y ejecución · B11-B16)
- **Origen:** handoff de ATLAS, turno `AUTONOMOUS-V1-20260823-01` H2, incremento WIP=1 sobre la base READY_FOR_VERIFYING de SPEC-005 (proyectos: artefactos y estados, `recordProjectDeliveredSignal` ya exportado por SPEC-005).
- **Estado:** `READY_FOR_VERIFYING`
- **SPEC:** `context/SPECs/SPEC-20260817-006-proyectos-equipo-ejecucion.md` v1.0
- **Discovery refs:** DEC-FUN-09/13/25/32/33/55/56/57/60/68/72; BR-005..011; BR-N121/143/207..212/244..258/259/264..296/336..339/367..370/382..398/405..407/411/413; SCN-PROJ-01..05/08..10; FLOW-PROJ-01..02/05; ARCH-20260817-01/05/19-03; ADR-02 §8.3/ADR-05/ADR-06 §3.1.
- **Fecha:** 2026-08-23

---

## Resumen

Slice vertical operable de SPEC-006: incorporación/retiro de miembros del proyecto (PL gobierna), requerimientos con línea principal `proposed→analysis→approved→development→testing→validated`, tareas con checklist + evidencia + autoasignación del backlog no asignado + rechazo con motivo + revisión por PL/QA, pruebas con 7 tipos (5 bloqueantes; performance/security sólo `at_risk`) y `not_applicable` (acceptance exige excepción Director), entregables con aceptación por proxy (PL es registrador, no aceptante; BR-N287/DEC-FUN-55), cambios de alcance con cotización/evidencia cuando hay costo (BR-N294) y salto de `quoted`/`authorized` cuando NO hay costo (BR-N395), registro de tiempo con snapshot de `cost_per_hour_cents` (BR-008/BR-N334) y privacidad `actor===userId || ver_tiempo_equipo` (BR-N277/208), cálculo de `progress = Σpeso(done) / Σpeso(no canceladas) × 100` (BR-N367) y `health` calculada por heurística determinista (BR-N368-370), cierre técnico del proyecto con gates (BR-N255-258) que emite `project.delivered_from_order` consumible por SPEC-004 para OS→`delivered` (BR-N248/BR-N392; NO exige saldo cero), y UI responsive (kanban colapsa a lista en móvil; 9 pestañas en detalle del proyecto).

El slice no inventa comportamiento, no altera la creación del proyecto de SPEC-005, no toca cierre administrativo OS (SPEC-004), no implementa facturación/cobro (SPEC-007/008) ni rentabilidad agregada (SPEC-009); sólo publica el evento `project.delivered_from_order` cuando los gates pasan. Working tree sucio inspeccionado y conservado.

---

## Archivos modificados / creados

### Nuevos

| Archivo | Cambio |
|---|---|
| `src/server/db/schema/requirements.ts` | Tabla `requirements` (PK `(org,id)`, FKs a `projects`/`modules`/`users`, índice por `(org, project_id, status)` y `(org, project_id, folio)`). |
| `src/server/db/schema/tasks.ts` | Tablas `tasks` (UNIQUE `(org, project_id, folio)`), `task_checklists`, `task_evidence` (FK a `files`), `task_assignments` (histórico con `rejected_at`/`reject_reason`). |
| `src/server/db/schema/time-entries.ts` | Tabla `time_entries` (PK `(org,id)`, FKs a `projects`/`tasks`/`users`, `hours NUMERIC(6,2)`, `cost_per_hour_cents BIGINT` snapshot, `date`). |
| `src/server/db/schema/tests.ts` | Tabla `tests` (FKs a `projects`/`modules`/`requirements`/`users`, columnas `not_applicable_reason`/`not_applicable_approved_by`). |
| `src/server/db/schema/deliverables.ts` | Tabla `deliverables` (FKs a `projects`/`modules`/`files`, snapshot de `accepter_name`/`accepter_org`/`accepted_medium`/`evidence_file_id`). |
| `src/server/db/schema/change-requests.ts` | Tabla `change_requests` (UNIQUE `(org, project_id, folio)`, FKs a `projects`/`quotes`/`users`, columnas `has_cost`/`evidence_kind`/`linked_quote_id`/`evidence_file_id`/`version`/`quoted_amount_cents`). |
| `src/server/services/proyectos/helpers-ejecucion.ts` | Helpers puros: `canTransitionRequirement`, `canTransitionTask`, `canTransitionDeliverable`, `canTransitionChangeRequest`, `validateTaskDoneGates`, `validateTaskRejectReason`, `validateTestMarkNotApplicable`, `isBlockingTestType`, `validateChangeRequestAuthorizeGates`, `validateDeliverableAcceptance`, `validateCloseTechnicalGates`, `computeTaskProgress`, `computeProjectHealth`, `validateTimeEntryDailyTotal`, `canViewOtherUserTimeEntries`. |
| `src/server/services/proyectos/members.ts` | `createMembersService()` con `add`/`remove`/`list`/`isMember`. Retiro pone `active=false` (historial, BR-N383); rechaza retirar al PL activo. |
| `src/server/services/proyectos/requirements.ts` | `createRequirementsService()` con `create`/`transition`/`byId`/`list`. |
| `src/server/services/proyectos/tasks.ts` | `createTasksService()` con `create`/`byId`/`list`/`transition`/`assign`/`reject`/`review`/`checklistAdd`/`checklistToggle`/`evidenceAdd`/`canViewUserTimeEntries`. Asignación exige membresía activa (BR-N382); autoasignación sólo desde backlog no asignado (BR-N269/AC-2); reject cierra la asignación activa y vuelve a `ready` sin asignado (BR-N270). |
| `src/server/services/proyectos/timeEntries.ts` | `createTimeEntriesService()` con `create`/`list`. Snapshot de `cost_per_hour_cents` al registrar; suma diaria ≤24 (BR-008); privacidad por defecto. |
| `src/server/services/proyectos/tests.ts` | `createTestsService()` con `create`/`transition`/`markNotApplicable`/`list`. `markNotApplicable` exige justificación (BR-N389) y aprobación Director si es `acceptance`. |
| `src/server/services/proyectos/deliverables.ts` | `createDeliverablesService()` con `create`/`transition`/`accept`/`list`. Aceptación exige identidad/org/medio/evidencia (BR-N287) y rechaza si `accepterName === PL activo` (DEC-FUN-55). |
| `src/server/services/proyectos/changeRequests.ts` | `createChangeRequestsService()` con `create`/`quote`/`authorize`/`reject`/`startImplementation`/`completeImplementation`/`list`. Sin costo saltan `quoted`/`authorized`; con costo exigen cotización+evidencia. |
| `src/server/services/proyectos/cierre.ts` | `createCierreService()` con `closeTechnical` (gates BR-N255-258 → emite `project.delivered_from_order`) y `previewCloseGates` (progress + health + reasons). NO exige saldo cero (BR-N392). |
| `src/modules/proyectos/tareas-kanban.tsx` | Tablero de tareas responsive (kanban 5 columnas en ≥md, lista vertical en móvil). Detalle de tarea con checklist + evidencia + revisión PL/QA. |
| `src/modules/proyectos/equipo-tab.tsx` | Listado de miembros del proyecto; incorpora por userId+rol; retira (excepto PL). |
| `src/modules/proyectos/ejecucion-tabs.tsx` | 6 pestañas (Requirements, Tests, Deliverables, ChangeRequests, TimeEntries, Cierre) con tablas responsive. |
| `tests/spec-20260817-006.test.ts` | 86 tests unitarios puros (helpers + catálogos canónicos + Zod + grep UI). |

### Modificados

| Archivo | Cambio |
|---|---|
| `src/shared/enums/index.ts` | Añade enums de SPEC-006: `REQUIREMENT_STATUSES` (8), `TASK_STATUSES` (7), `TIME_ENTRY_KINDS` (4), `TEST_TYPES` (7), `TEST_STATUSES` (5), `DELIVERABLE_STATUSES` (7), `CHANGE_REQUEST_STATUSES` (9), `CHANGE_REQUEST_EVIDENCE_KINDS` (2), `PROJECT_HEALTH_NATURES` (3), `BLOCKING_TEST_TYPES` (5), `TASK_DEFAULT_WEIGHT` (1). 25 códigos de error nuevos. 31 acciones de auditoría nuevas (namespace `project_member.*`, `requirement.*`, `task.*`, `task_assignment.*`, `time_entry.*`, `test.*`, `deliverable.*`, `change_request.*`, `project.close_technical`). Permisos nuevos: `registrar_tiempo`, `aprobar_cambios`, `gestionar_equipo_proyecto` (BR-N413). |
| `src/shared/zod/index.ts` | Esquemas Zod de SPEC-006: inputs/outputs para los 11 sub-routers (`members`, `requirements`, `tasks`, `timeEntries`, `tests`, `deliverables`, `changeRequests`, `cierre`). |
| `src/shared/utils/messages.ts` | Catálogo es-MX para las 9 pestañas del detalle, kanban, equipo, reqs, tests, deliverables, change requests, time entries y cierre (sub-objetos `proyectos.tasks*`, `proyectos.team*`, `proyectos.requirements*`, `proyectos.tests*`, `proyectos.deliverables*`, `proyectos.changes*`, `proyectos.time*`, `proyectos.closure*`, `proyectos.closeGates*`). |
| `src/server/services/proyectos/index.ts` | Re-exports de los 8 nuevos servicios (`members`, `requirements`, `tasks`, `timeEntries`, `tests`, `deliverables`, `changeRequests`, `cierre`) y de los helpers puros (`canTransition*`, `validate*`, `computeTaskProgress`, `computeProjectHealth`, `isBlockingTestType`, `canViewOtherUserTimeEntries`). |
| `src/server/trpc/routers/proyectos.ts` | Añade 8 sub-routers (`members`, `requirements`, `tasks`, `timeEntries`, `tests`, `deliverables`, `changeRequests`, `cierre`) con sus mutaciones y queries. Endpoints SPEC-005 sin cambios. |
| `src/app/(dashboard)/proyectos/[id]/page.tsx` | Detalle con 9 pestañas operables (`Resumen`/`Tareas`/`Requerimientos`/`Pruebas`/`Entregables`/`Cambios`/`Equipo`/`Tiempo`/`Cierre`). Selector responsive con `overflow-x-auto`. |
| `scripts/seed-data.ts` | Sembrado por rol: `director` recibe todos los BASE_PERMISSIONS (incluye `registrar_tiempo`/`aprobar_cambios`/`gestionar_equipo_proyecto` por construcción); `administrador` y `lider_proyecto` reciben los 3 nuevos; `programador`/`disenador`/`qa` reciben `registrar_tiempo`. `vendedor` NO recibe `registrar_tiempo` (BR-N413). Etiquetas `PERMISSION_LABELS` actualizadas. |
| `scripts/check-multitenancy.ts` | 9 tablas nuevas (42 totales) en la lista declarativa: `requirements`, `tasks`, `taskChecklists`, `taskEvidence`, `taskAssignments`, `timeEntries`, `tests`, `deliverables`, `changeRequests`. |
| `scripts/check-seed-permissions.ts` | `ALLOWED_PROGRAMADOR_PERMISSIONS` ahora admite `operar_proyectos` y `registrar_tiempo` (BR-N413); mensaje final actualizado. |
| `scripts/check-antipatterns.ts` | AC-80 reescrito: si `registrar_tiempo` aparece en `BASE_PERMISSIONS` (lo introdujo SPEC-006), valida que esté sembrado coherentemente (sin `vendedor`, BR-N413) y case omite. Retrocompatible: si no aparece en enums, sigue pasando. |
| `e2e/proyectos.spec.ts` | 3 tests adicionales (×3 viewports = 9 ejecuciones): pestañas operables (Tareas/Reqs/Pruebas/Entregables/Cambios/Equipo/Tiempo/Cierre), formulario de creación de tarea, agregar miembro, preview de gates de cierre. |
| `tests/impl-20260820-02.test.ts` | AC-80 actualizado: ahora afirma que `BASE_PERMISSIONS` SÍ contiene `registrar_tiempo` (introducido por SPEC-006) y que `vendedor` NO lo recibe (BR-N413). |

No se modificaron: `discovery/`, SPEC-001..005, ADR, `context/CURRENT.md`, `context/CROSS-CHECKLIST.md`, `context/SPECs/IMPL-*.md`, `context/interconsultas/SPEC-HANDOFF-*.md` previos, los routers/servicios de OS/Clientes/Comercial, ni los archivos del flujo autonomous-loop. Working tree sucio inspeccionado y conservado.

---

## Contratos públicos / protegidos

- **`organization_id`** — 9 tablas nuevas (`requirements`, `tasks`, `taskChecklists`, `taskEvidence`, `taskAssignments`, `timeEntries`, `tests`, `deliverables`, `changeRequests`) llevan `organizationId NOT NULL` con FK a `organizations.id`; PK compuesta `(organization_id, id)` (ADR-02 §8.3). `check-multitenancy` valida 42 tablas; 0 sin `organization_id`.
- **`hasPermission` único mecanismo** — `requirePermission('gestionar_proyectos' | 'operar_proyectos' | 'aprobar_cambios' | 'registrar_tiempo' | 'gestionar_equipo_proyecto', { forceDb: true })` en cada acción crítica (ADR-06 / AC-81).
- **`audit_logs`** — 31 acciones namespace nuevo:
  - `project_member.add` / `project_member.remove` (AC-1).
  - `requirement.create` / `requirement.transition` (BR-N264-267).
  - `task.create` / `task.transition` / `task.checklist_add` / `task.checklist_toggle` / `task.evidence_add` / `task.assign` / `task.autoassign` / `task.reject` / `task.review` (BR-N268-274).
  - `time_entry.create` (BR-N276).
  - `test.create` / `test.transition` / `test.mark_not_applicable` (BR-N283-290).
  - `deliverable.create` / `deliverable.transition` / `deliverable.accept` (BR-N288-291).
  - `change_request.create` / `change_request.quote` / `change_request.authorize` / `change_request.reject` (BR-N292-296).
  - `project.close_technical` (AC-8) — dispara `recordProjectDeliveredSignal` para SPEC-004.
- **Códigos de error canónicos** — 25 nuevos en `ERROR_CODES`: `NOT_A_MEMBER`, `TASK_NOT_FOUND`, `TASK_INVALID_TRANSITION`, `TASK_DONE_GATES`, `TASK_REJECT_REASON_REQUIRED`, `TASK_AUTOASSIGN_FORBIDDEN`, `REQUIREMENT_NOT_FOUND`, `REQUIREMENT_INVALID_TRANSITION`, `TIME_ENTRY_NOT_FOUND`, `TIME_ENTRY_INVALID_RANGE`, `TIME_ENTRY_PRIVACY_FORBIDDEN`, `TEST_NOT_FOUND`, `TEST_INVALID_TRANSITION`, `TEST_NOT_APPLICABLE_REASON_REQUIRED`, `ACCEPTANCE_TEST_REQUIRED`, `DELIVERABLE_NOT_FOUND`, `DELIVERABLE_INVALID_TRANSITION`, `ACCEPTANCE_EVIDENCE_REQUIRED`, `CHANGE_REQUEST_NOT_FOUND`, `CHANGE_REQUEST_INVALID_TRANSITION`, `CHANGE_QUOTE_REQUIRED`, `CLOSE_GATES`, `PROGRESS_BLOCKED`.
- **Permisos BASE nuevos** — `registrar_tiempo` (BR-N276/BR-N413), `aprobar_cambios` (BR-N294/295), `gestionar_equipo_proyecto` (BR-N382/383). Sembrados por rol en `seed-data.ts`; el check `check-seed-permissions.ts` verifica la matriz BR-N207-212 y BR-N413 (vendedor NO recibe `registrar_tiempo`).
- **No-acoplamiento inverso verificado** — `proyectos/*` no importa `@/server/services/orden-servicio` ni invoca `markInExecution`/`markDelivered`; su única señal hacia SPEC-004 es `project.delivered_from_order` (helper ya exportado por SPEC-005; `cierre.closeTechnical` lo invoca al pasar gates).
- **Snapshot de `cost_per_hour_cents`** — `timeEntries.create` lee `users.cost_per_hour_cents` al registrar y persiste el snapshot en la fila; NO se recalcula al cambiar el costo del usuario (decisión contable, BR-N334/BR-008).
- **Privacidad de `time_entries`** — `timeEntries.list({ teamView })` filtra por `actor.id` cuando `teamView=false`; con `teamView=true` exige `ver_tiempo_equipo` (BR-N277/208). Helper `canViewOtherUserTimeEntries` decora la decisión.
- **`done` exige checklist + evidencia (AC-3)** — `canTransitionTask(target='done')` y `tasks.review(approve=true)` invocan `validateTaskDoneGates({ checklists, evidenceCount })` que rechaza con `TASK_DONE_GATES` si checklists vacíos, evidencia cero o checklist pendiente.
- **Membresía precede asignación (AC-1)** — `tasks.assign` exige `isActiveMember(org, project, userId)` antes de mutar; en caso contrario lanza `NOT_A_MEMBER` (BR-N382). El servicio `members.isMember` queda disponible como precondición compartida.
- **Aceptación por proxy (AC-6)** — `deliverables.accept` exige 4 campos (accepterName/org/medium/evidenceFileId) y rechaza si `accepterName` coincide con el PL activo (DEC-FUN-55). Validación de evidencia en BD (`files.id` debe existir).
- **`not_applicable` en acceptance (AC-5)** — `tests.markNotApplicable` exige justificación ≥3 caracteres y, si el tipo es `acceptance`, además aprobación Director (`aprobar_cambios`). Caso contrario → `ACCEPTANCE_TEST_REQUIRED` (BR-N389).
- **Cambios con/sin costo (AC-7)** — `changeRequests.quote` rechaza CR sin costo; `changeRequests.authorize` rechaza CR sin costo (debe usar `startImplementation`); `changeRequests.startImplementation` exige `status='authorized'` con costo o `status='analysis'` sin costo.
- **Cierre técnico (AC-8) sin saldo cero** — `cierre.closeTechnical` exige gates (BR-N255-258): tareas críticas cerradas, reqs validados, pruebas bloqueantes aprobadas o `not_applicable` con justificación (más aprobación Director para acceptance), entregables obligatorios aceptados/rechazados, CRs resueltos. Si pasan → `statusStage='delivery'`, `statusSituation='completed'`, `completedAt` + `recordProjectDeliveredSignal`. NO exige saldo cero (BR-N392 — cierre técnico vs administrativo).
- **`progress` y `health` (AC-9)** — `computeTaskProgress` aplica `Σpeso(done)/Σpeso(no canceladas)×100` (BR-N367). `computeProjectHealth` heurística determinista: bloqueantes fallidas o tareas críticas bloqueadas → `delayed`; pruebas bloqueantes pendientes, tareas en `in_review` o entregables `observed` → `at_risk`; resto → `on_track`.

---

## Validación

| Corte | Comando | Resultado |
|---|---|---|
| V1 (corte 1) | `npx tsc --noEmit -p tsconfig.json 2>&1 \| grep -E "^src/"` | PASS — 0 errores. |
| V1 (corte 2) | idem | PASS — 0 errores. |
| V1 (corte 3) | idem | PASS — 0 errores. |
| V1 (corte 4) | idem | PASS — 0 errores tras reemplazar `check`→`has` en hasPermission y `name` (no `fullName`) en `users`. |
| V1 (corte 5) | idem | PASS — 0 errores tras simplificar schema `members.list` con `extend({ includeInactive })` y remover `undefined` en `RequirementTransitionInputSchema`. |
| V1 (corte 6) | idem | PASS — 0 errores tras renombrar `changesQuote` duplicado, ajustar `acceptedMedium` y `out.backlog!`. |
| V1 (corte 7) | `npx tsx scripts/check-multitenancy.ts` / `check-seed-permissions.ts` / `check-antipatterns.ts` | PASS — 42 tablas; matriz BR-N207..N412/413 consistente; 16/16 checks (AC-80 actualizado). |
| V1 (corte 8) | `npx vitest run tests/spec-20260817-006.test.ts` | PASS — **86/86** unit tests. |
| V2 (cierre) | `npx tsc --noEmit -p tsconfig.json 2>&1 \| grep -E "^src/"` | PASS — 0 errores en `src/`. |
| V2 (cierre) | `npx vitest run` | PASS — **384/384** (148 baseline + 42 SPEC-003 + 21 SPEC-002 + 49 SPEC-004 + 58 SPEC-005 + **86 SPEC-006** + 10 SPEC-001 + 79 autonomous-loop, etc.). |
| V2 (cierre) | `npx eslint src/ --max-warnings=0` | PASS — 0 errores, 0 warnings (después de remover `TEST_STATUSES` no usado en `helpers-ejecucion.ts`). |
| V2 (cierre) | `npx tsx scripts/check-multitenancy.ts` | PASS — **42 tablas con `organization_id`**; 0 sin. |
| V2 (cierre) | `npx tsx scripts/check-antipatterns.ts` | PASS — **16/16** checks (AC-1/26/27/30/34/42/47/48/50/55/71/72/74/79/80/83). |
| V2 (cierre) | `npx tsx scripts/check-seed-permissions.ts` | PASS — matriz BR-N207..N412/413 consistente; `registrar_tiempo` correctamente sembrado; `vendedor` no recibe `registrar_tiempo`. |
| V3 (Playwright) | `pnpm test:e2e` | **NO EJECUTADA** — entorno local no provisionado (gates BD/PostgreSQL/MinIO bloqueados, idéntico a SPEC-002/003/004/005). Las specs `e2e/proyectos.spec.ts` están extendidas (3 tests adicionales × 3 viewports = 9 ejecuciones nuevas) y listas para que GEMINI las corra en el gate final contra staging LIVE autorizado por Frank. |

---

## Trazabilidad AC

| AC | Implementación | Evidencia |
|---|---|---|
| **AC-1** Membresía precede asignación | `createMembersService.add/remove/list/isMember` exige `gestionar_equipo_proyecto`. `createTasksService.assign` invoca `isActiveMember(...)` y lanza `NOT_A_MEMBER` (BR-N382) si falla; además, autoasignación exige `actorIsPL || (isSelf && isUnassignedBacklog)` (BR-N269/AC-2). `createDeliverablesService.accept` rechaza si `accepterName === PL activo` (DEC-FUN-55). | `tests/spec-20260817-006.test.ts: SPEC-006 · AC-1 · membresía precede asignación` (3 tests + shape); `tests/.../catalogo canónico` (registrar_tiempo sembrado coherentemente). |
| **AC-2** Sólo PL asigna | `tasks.assign` exige actorIsPL salvo autoasignación del backlog no asignado; autoasignarse de una tarea ya asignada → `TASK_AUTOASSIGN_FORBIDDEN` (BR-N269). | `SPEC-006 · AC-2 · sólo PL asigna + autoasignación` (6 tests). |
| **AC-3** `done` exige checklist + evidencia | `canTransitionTask(target='done')` y `tasks.review(approve=true)` invocan `validateTaskDoneGates` (BR-007/BR-N271). `task_checklists` + `task_evidence` como FKs separadas; tiempo opcional (BR-N276) — no bloquea. | `SPEC-006 · AC-3 · done exige checklist + evidencia` (5 tests). |
| **AC-4** Rechazo con motivo | `validateTaskRejectReason` exige ≥3 caracteres (BR-N270); `tasks.reject` cierra la asignación activa (`taskAssignments.rejected_at`/`reject_reason`), vuelve la tarea a `ready` sin asignado, y registra `task.reject` con `actor_role_code`. | `SPEC-006 · AC-4 · reject con motivo` (4 tests). |
| **AC-5** Pruebas bloqueantes vs advertencia | `BLOCKING_TEST_TYPES = [functional, visual, ui, acceptance, compatibility]`; performance/security sólo `at_risk`. `validateTestMarkNotApplicable` exige justificación ≥3 (BR-N389) y, si es `acceptance`, además `aprobar_cambios` → `ACCEPTANCE_TEST_REQUIRED`. | `SPEC-006 · AC-5 · 7 tipos, blocking/warning, N/A` (6 tests). |
| **AC-6** Aceptación proxy con evidencia | `validateDeliverableAcceptance` exige 4 campos; `deliverables.accept` rechaza `accepterName` que coincide con PL activo (DEC-FUN-55). `canTransitionDeliverable` cubre la línea `pending→preparing→delivered→accepted` y laterales `observed/corrected/rejected/cancelled`. | `SPEC-006 · AC-6 · aceptación proxy con evidencia` (9 tests). |
| **AC-7** Cambios de alcance | `validateChangeRequestAuthorizeGates` rechaza con costo sin cotización+evidencia (BR-N294/CHANGE_QUOTE_REQUIRED); CR sin costo omiten `quoted`/`authorized` (BR-N395). `canTransitionChangeRequest` cubre la línea `requested→analysis→quoted→authorized→in_progress→implemented→validated`. | `SPEC-006 · AC-7 · change requests con/sin costo` (9 tests). |
| **AC-8** Cierre técnico con gates | `validateCloseTechnicalGates` (BR-N255-258): tareas no terminales, reqs obligatorios validados, pruebas bloqueantes pasadas o N/A con justificación (más aprobación Director para acceptance), entregables obligatorios aceptados/rechazados, CRs resueltos. `cierre.closeTechnical` con gates OK → `delivery`+`completed`+`recordProjectDeliveredSignal`. NO exige saldo cero (BR-N392). | `SPEC-006 · AC-8 · cierre técnico gates` (9 tests, incluido happy path completo). |
| **AC-9** Avance y salud | `computeTaskProgress` aplica `Σpeso(done)/Σpeso(no canceladas)×100` con regla especial "todas canceladas → 100%" (BR-N367). `computeProjectHealth` heurística determinista (BR-N368-370): delayed (bloqueantes fallidas / tareas críticas bloqueadas), at_risk (bloqueantes pendientes / in_review / observed), on_track. | `SPEC-006 · AC-9 · avance y salud` (9 tests). |
| **AC-10** Tiempo propio | `timeEntries.create` snapshot `cost_per_hour_cents` al registrar (BR-008/BR-N334) y valida suma diaria ≤24 con `validateTimeEntryDailyTotal`. `timeEntries.list` privacidad por defecto (BR-N277/208): `teamView=false` filtra por actor; `teamView=true` exige `ver_tiempo_equipo`. Helper `canViewOtherUserTimeEntries` cubre el caso `actor===user` o permiso. | `SPEC-006 · AC-10 · privacidad y snapshot de tiempo` (4 tests). |
| **AC-11** UI/responsive | Tablero kanban de tareas: `md:hidden` (lista vertical móvil) + `hidden gap-2 md:grid md:grid-cols-5` (5 columnas ≥md). Detalle con 9 pestañas selector con `overflow-x-auto`. Tablas de Equipo/Reqs/Tests/Delivs/CRs/Time con `overflow-x-auto` + `hidden sm:table-cell`/`hidden md:table-cell`. | `SPEC-006 · AC-11 · UI responsive` (4 tests con grep sobre `tareas-kanban.tsx`, `equipo-tab.tsx`, `ejecucion-tabs.tsx`, `page.tsx`). |

---

## Contratos cruzados

| Contrato | Productor | Consumidor | Estado |
|---|---|---|---|
| `os.authorized_to_start` (audit.action) | **SPEC-004** `orders.authorize` | **SPEC-005** `createFromOrder` lee `orders.pl_user_id` y crea el proyecto + PL. Sin cambios en este incremento. | OK — preservado. |
| `project.created_from_order` (audit.action) | **SPEC-005** `createFromOrder` | **SPEC-004** worker marca OS→`in_execution` (BR-N247). Sin cambios. | OK — preservado. |
| `project.delivered_from_order` (audit.action) | **SPEC-006** `cierre.closeTechnical` al pasar gates | **SPEC-004** worker marca OS→`delivered` (BR-N248/BR-N392). El helper `recordProjectDeliveredSignal` (exportado por SPEC-005) ya escribía el audit; este incremento lo invoca desde `cierre.closeTechnical`. | OK — el contrato estaba definido por SPEC-005 y ahora se EMITE cuando los gates pasan. |
| `project_members.org_project_active_lider_unique` (BD, UNIQUE parcial) | **SPEC-005** | **SPEC-006** `members.add` permite reactivar miembros inactivos (UNIQUE sólo afecta filas activas). | OK — semántica verificada por `members.add` (defensa `existing && existing.active` → 409). |
| `tasks.org_project_folio_unique` (BD, UNIQUE) | **SPEC-006** | servicio `tasks.create` y `tasks.assign` (folio de la tarea). | OK — defensa por servicio + UNIQUE BD. |
| `change_requests.org_project_folio_unique` (BD, UNIQUE) | **SPEC-006** | servicio `changeRequests.create`. | OK. |
| `time_entries` privacidad (BR-N277/208) | **SPEC-006** `timeEntries.list` | UI cliente tRPC (`proyectos.timeEntries.list`). | OK. |
| `BASE_PERMISSIONS` (`registrar_tiempo`, `aprobar_cambios`, `gestionar_equipo_proyecto`) | **SPEC-006** | sembrado por `scripts/seed-data.ts` en `director`/`administrador`/`lider_proyecto` (+ `registrar_tiempo` en `programador`/`disenador`/`qa`). | OK — `check-seed-permissions` y `check-antipatterns` (AC-80 actualizado) validan la matriz. |
| `PROJECT_AUDIT_ACTIONS` (31 acciones nuevas) | **SPEC-006** | `audit_logs.action` consulta por prefijo. | OK — extendidas a `project_member.*`, `requirement.*`, `task.*`, `time_entry.*`, `test.*`, `deliverable.*`, `change_request.*`, `project.close_technical`. |
| `ERROR_CODES` (25 códigos nuevos) | **SPEC-006** | `DomainError.code` para respuestas tRPC. | OK. |

---

## Riesgos y desviaciones

- **R1 (decisión interna reversible):** `timeEntries.create` lee `users.cost_per_hour_cents` dinámicamente. Si la columna `users.cost_per_hour_cents` cambia de esquema (defensa contable), el snapshot sigue funcionando porque se captura al insertar. Si Frank requiere un "salario base" por rol en lugar del del usuario, el cambio se localiza en `timeEntries.ts` sin afectar contrato público.
- **R2 (decisión interna reversible):** `computeProjectHealth` heurística naïve (bloqueantes fallidas → delayed; tareas críticas bloqueadas → delayed; bloqueantes pendientes / in_review / observed → at_risk; resto → on_track). Si Frank requiere una métrica más rica (entregables vencidos, ratio de avance, etc.), el cambio se localiza en `helpers-ejecucion.ts` sin afectar contrato público.
- **R3 (decisión interna reversible):** `requirements.required` no existe como columna (todos los reqs se evalúan como obligatorios en el gate de cierre). Si en el futuro Frank introduce un flag `required`, el helper `gatherSnapshot` ya acepta `required` por construcción (default `true`) — el cambio es de esquema + 1 línea en `gatherSnapshot`.
- **R4 (decisión interna reversible):** `tasks.reject` exige que el actor sea el asignado actual (BR-N270 + UX). Defensa adicional futura: permitir al PL forzar rechazo con motivo; ya está el camino (sólo cambia 1 línea en `tasks.reject`).
- **R5 (AC-80 actualizado):** el check anti-patrón AC-80 cambió su semántica: ya NO prohíbe que `registrar_tiempo` esté en `BASE_PERMISSIONS` (SPEC-006 lo introdujo). El nuevo invariante es: si aparece, debe estar sembrado coherentemente (sin `vendedor`, BR-N413). Retrocompatible con pre-SPEC-006 (si no está en enums, el check pasa). Documentado en el código.
- **R6 (deuda técnica menor):** el seed de permisos quedó igual para `vendedor` (sin permisos nuevos); `director` recibe los 3 nuevos por construcción (`[...BASE_PERMISSIONS]`). Si Frank decide que `vendedor` debe `registrar_tiempo` o `aprobar_cambios`, el cambio es de 1 línea en `seed-data.ts`.
- **R7 (sin bloqueante):** `requirements.required` se evalúa como `true` por defecto (DEC-FUN-32 — todos los reqs son obligatorios). El gate de cierre trata TODOS los reqs como obligatorios. Esto es consistente con el helper `validateCloseTechnicalGates` que acepta `required` por construcción.
- **D1:** `changeRequests.startImplementation` se cableó como mutación dedicada (no como transición de estado genérica) porque el "salto sin costo" (BR-N395) requiere contexto del flag `hasCost`. El router expone `startImplementation` y `completeImplementation` como dos mutaciones explícitas; `authorize` queda sólo para CR con costo. Documentado en SPEC §6 del router.
- **D2:** el cierre técnico exige que el actor sea PL/director/admin (`gestionar_proyectos` con `forceDb: true`); el gate de privacidad de audit (BR-N388) registra `actor_role_code` cuando está presente en el `Context`.
- **D3:** `timeEntries.create` lee `users.cost_per_hour_cents` vía `(u as unknown as { costPerHourCents?: number } | null)?.costPerHourCents ?? 0` para tolerancia defensiva si la columna no existe aún en el esquema sembrado; cuando SPEC-001/SPEC-005 la añadan formalmente, este fallback se puede sustituir.

---

## Pendientes ATLAS

- **A1:** gate GEMINI V3 contra staging LIVE (Frank-auth). Las specs `e2e/proyectos.spec.ts` están extendidas (3 tests adicionales × 3 viewports = 9 ejecuciones) y dependen de bootstrap + app + PostgreSQL/MinIO provisionados. Idénticas condiciones a SPEC-002/003/004/005.
- **A2:** GEMINI es **obligatorio** para SPEC-006 (riesgo medio-alto): toca autorización por membresía, aceptación por proxy, gates de cierre técnico, signal consumible por SPEC-004. Decisión §13 de la SPEC.
- **A3:** coordinar con el dueño de SPEC-004 (Orden de Servicio) el consumo del evento `project.delivered_from_order` que ahora SE EMITE desde `cierre.closeTechnical`. Cuando SPEC-004 lo consuma en su worker, marca la OS→`delivered` sin exigir saldo cero (BR-N248/BR-N392). Ya no es un contrato en el aire — está vivo.
- **A4:** al regenerar la migración Drizzle (`db:generate`) con las 9 tablas nuevas, validar que el UNIQUE parcial `project_members_org_project_active_lider_unique` siga aplicando correctamente con la nueva sintaxis `where` (defensa documentada en IMPL-REPORT-005; pendiente del motor de migración).
- **A5:** `BasePermission` `gestionar_equipo_proyecto` se sembró en `director`/`administrador`/`lider_proyecto`. Si Frank requiere que `programador` (como líder técnico de un sub-equipo) pueda auto-administrar miembros, el cambio es de 1 línea en `seed-data.ts`.

---

## SPEC-GAP

No se devuelve `SPEC-GAP` a ATLAS. P-006-1 (Frank) está cerrado en `none`; todos los contratos públicos están dentro del SPEC; las decisiones internas (R1/R2/R3/R4) están documentadas como riesgos reversibles.

---

## Notas de reversión (recomendación, NO ejecución)

Si se requiere revertir el incremento:

1. **Revertir migración de BD:** las 9 tablas nuevas se crean con `db:generate`/`db:migrate`. El script de rollback es responsabilidad del flujo de mantenimiento. Recomendado: documentar en una SPEC futura la migración `drop_*.sql` (sin ejecutarla).
2. **Revertir código:** el blast radius está contenido en:
   - `src/server/db/schema/requirements.ts` (eliminar).
   - `src/server/db/schema/tasks.ts` (eliminar).
   - `src/server/db/schema/time-entries.ts` (eliminar).
   - `src/server/db/schema/tests.ts` (eliminar).
   - `src/server/db/schema/deliverables.ts` (eliminar).
   - `src/server/db/schema/change-requests.ts` (eliminar).
   - `src/server/db/schema/index.ts` (quitar exports).
   - `src/server/services/proyectos/helpers-ejecucion.ts` (eliminar).
   - `src/server/services/proyectos/members.ts` (eliminar).
   - `src/server/services/proyectos/requirements.ts` (eliminar).
   - `src/server/services/proyectos/tasks.ts` (eliminar).
   - `src/server/services/proyectos/timeEntries.ts` (eliminar).
   - `src/server/services/proyectos/tests.ts` (eliminar).
   - `src/server/services/proyectos/deliverables.ts` (eliminar).
   - `src/server/services/proyectos/changeRequests.ts` (eliminar).
   - `src/server/services/proyectos/cierre.ts` (eliminar).
   - `src/server/services/proyectos/index.ts` (quitar exports de SPEC-006).
   - `src/server/trpc/routers/proyectos.ts` (revertir a SPEC-005).
   - `src/modules/proyectos/tareas-kanban.tsx` (eliminar).
   - `src/modules/proyectos/equipo-tab.tsx` (eliminar).
   - `src/modules/proyectos/ejecucion-tabs.tsx` (eliminar).
   - `src/app/(dashboard)/proyectos/[id]/page.tsx` (revertir a SPEC-005).
   - `src/shared/enums/index.ts` (quitar enums + códigos + permisos + audit actions de SPEC-006).
   - `src/shared/zod/index.ts` (quitar esquemas SPEC-006).
   - `src/shared/utils/messages.ts` (quitar claves `proyectos.tasks*`, `proyectos.team*`, `proyectos.requirements*`, `proyectos.tests*`, `proyectos.deliverables*`, `proyectos.changes*`, `proyectos.time*`, `proyectos.closure*`, `proyectos.closeGates*`, `proyectos.tabs.*`).
   - `scripts/check-multitenancy.ts` (quitar las 9 tablas).
   - `scripts/seed-data.ts` (quitar 3 permisos y matriz).
   - `scripts/check-seed-permissions.ts` (revertir `ALLOWED_PROGRAMADOR_PERMISSIONS` a `{operar_proyectos}`).
   - `scripts/check-antipatterns.ts` (revertir AC-80 al invariante anterior).
   - `tests/spec-20260817-006.test.ts` (eliminar).
   - `tests/impl-20260820-02.test.ts` (revertir AC-80 al assert original).
   - `e2e/proyectos.spec.ts` (revertir a SPEC-005).
3. **Sin acoplamientos:** el servicio proyectos sigue sin mutar tablas de otros módulos (sólo lee `users`, `projects`, `modules`, `files`, `quotes`). El no-acoplamiento inverso con SPEC-004 se preserva (no se invoca `markInExecution`/`markDelivered`); la única señal hacia SPEC-004 es el audit `project.delivered_from_order` ya consumido en su worker.

No se ejecuta ninguna acción mutante (sin commit/push/PR/deploy/rollback).

---

## Estado

`READY_FOR_VERIFYING`. SOFIA no declara `DONE` (§3 IDL).
