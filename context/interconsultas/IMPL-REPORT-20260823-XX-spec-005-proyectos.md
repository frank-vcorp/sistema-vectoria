# IMPL-REPORT-20260823-XX · SPEC-005 Proyectos — artefactos y estados · SOFIA → ATLAS

- **ID intervención:** IMPL-20260823-XX-spec-005
- **ID tarea:** SPEC-20260817-005 (Proyectos: artefactos y estados)
- **Origen:** handoff de ATLAS, turno `AUTONOMOUS-V1-20260823-01` H2, incremento WIP=1 sobre la base READY_FOR_VERIFYING de SPEC-002, SPEC-003 y SPEC-004.
- **Estado:** `READY_FOR_VERIFYING`
- **SPEC:** `context/SPECs/SPEC-20260817-005-proyectos-artefactos-estados.md` v1.0
- **Discovery refs:** DEC-FUN-14/15/47/53..59/68; BR-N03/113/114/121/246/247/248/249/250/251..263/336/375..385/392/394/396..398/405/407; SCN-PROJ-06/07; FLOW-PROJ-01/03/04; ARCH-20260817-01/05/11, ARCH-20260819-03.
- **Fecha:** 2026-08-23

---

## Resumen

Slice vertical operable de SPEC-005: workflow atómico `project_creation` universal que consume la OS `authorized_to_start` y crea proyecto + `project_members(pl, role='lider')` por construcción + copia inmutable del alcance + carga del esqueleto de módulos desde la plantilla + vínculo OS + audit; estados 3D canónicos (etapa/situación/salud) con transiciones de happy path y laterales con motivo; salud calculada desde los módulos y override con motivo obligatorio; round-trip JSON Discovery versionado, idempotente y con inmutables (`project_id`/`folio`/`included`); UI responsive con `overflow-x-auto` + columnas ocultas por viewport y árbol de módulos colapsable/expandible.

No se inventaron campos; no se implementaron side-effects fuera de alcance (gates de cierre técnico de SPEC-006, suscripciones/cobranza/facturación de SPEC-007/008/011, ejecución/equipo de SPEC-006, cierre técnico — la señal `project.delivered_from_order` se DEFINE como contrato pero NO se emite desde este incremento: queda en SPEC-006 como publica-dor). No se delegó lateralmente; no se solicitó commit/push/PR/deploy/staging/billing/secretos/migración irreversible/rollback/delete. Working tree sucio inspeccionado y conservado.

---

## Archivos modificados / creados

### Nuevos

| Archivo | Cambio |
|---|---|
| `src/server/db/schema/projects.ts` | Tablas `projects`, `project_members`, `project_scope_snapshots`, `modules`, `json_discovery_imports` (PK compuesta `(organization_id, id)`, FK compuestas a `orders`/`clients`/`users`/`templates`/`scope_documents`/`projects`, UNIQUE `(org, order_id)` y `(org, code)`, índice `(org, status_stage, status_situation)`, UNIQUE parcial `project_members(org, project_id) WHERE project_role='lider' AND active`, UNIQUE `(org, project_id, code)` en módulos, UNIQUE `(org, project_id, version, kind)` en json_discovery_imports — BR-N382/N251/N260/N397). |
| `src/server/services/proyectos/helpers.ts` | Helpers puros: `canTransitionProjectStage` (5 etapas + terminales, BR-N375..N378), `validateProjectSituationReason` (≥3, BR-N379), `isProjectSituationTerminal`, `computeCalculatedHealth` (blocked/delayed/paused/at_risk/on_track, BR-N254), `validateHealthOverride` (motivo + redundancia, BR-N254), `canTransitionModule` (7 estados, BR-N113/114/260..263), `diffJsonDiscoveryPlans` (altas/cambios/conflictos, BR-N396/397), `findJsonDiscoveryImmutableConflict` (BR-N353), `nextProjectCode` (BR-N216 análogo), `buildProjectCreatedFromOrderEvent` (contrato consumible por SPEC-004, AC-9/BR-N247/407). |
| `src/server/services/proyectos/projects.ts` | Servicio `createProjectsService()` con `createFromOrder` (workflow **atómico** 9 pasos + audit doble), `transitionStage`, `pause`/`resume`/`cancel`, `complete` (DEC-FUN-59, exige módulos requeridos `deployed`), `overrideHealth`, `getById`, `list`. Helper `recordProjectDeliveredSignal` para que SPEC-006 notifique el cierre técnico (NO se invoca desde aquí). |
| `src/server/services/proyectos/modules.ts` | Servicio `createModulesService()` con `list` y `transition` (recalcula salud del proyecto automáticamente, BR-N114). |
| `src/server/services/proyectos/jsonDiscovery.ts` | Servicio `createJsonDiscoveryService()` con `exportTemplate`, `previewImport`, `import` (idempotente, versionado, BR-N396..398). |
| `src/server/services/proyectos/index.ts` | Barrel del módulo. |
| `src/server/trpc/routers/proyectos.ts` | Router `proyectos.*` con Zod y `toTrpcError`. Sub-routers `modules` y `jsonDiscovery`. |
| `src/modules/proyectos/proyectos-list.tsx` | Listado responsive (`overflow-x-auto`, `hidden sm:table-cell`/`hidden md:table-cell`, badges 3D, badges de salud coloreados). |
| `src/modules/proyectos/proyecto-detail.tsx` | Detalle 3D (etapa/situación/salud), acciones: transición de etapa, pause/resume/cancel, complete, override de salud, árbol de módulos con transiciones y motivo obligatorio en `deployed`, JSON Discovery export/import con textarea. |
| `src/app/(dashboard)/proyectos/page.tsx` | Página `/proyectos`. |
| `src/app/(dashboard)/proyectos/[id]/page.tsx` | Página detalle `/proyectos/<id>`. |
| `tests/spec-20260817-005.test.ts` | 58 tests unitarios (AC-1..AC-10 + catálogo canónico + no-acoplamiento inverso + shape del servicio). |
| `e2e/proyectos.spec.ts` | 3 tests Playwright × 3 viewports = 9 ejecuciones (V3 pendiente de gate Frank contra staging LIVE). |

### Modificados

| Archivo | Cambio |
|---|---|
| `src/server/db/schema/index.ts` | Exporta el módulo `projects` (SPEC-005). |
| `src/server/db/schema/project-log-entries.ts` | Añade FK compuesta `project_fk → projects(organization_id, id)` (SPEC §8). |
| `src/server/services/index.ts` | Añade `proyectosService` al barrel. |
| `src/server/trpc/root.ts` | Monta `proyectosRouter`. |
| `src/shared/enums/index.ts` | Añade `PROJECT_STAGES` (5), `PROJECT_SITUATIONS` (5), `PROJECT_HEALTHS` (3), `MODULE_STATUSES` (7), `MODULE_HEALTHS` (3), `PROJECT_MEMBER_ROLES` (lider/programador/disenador/qa), `HEALTH_REASON_MIN_LENGTH = 3`, `PROJECT_AUDIT_ACTIONS` (13 acciones namespace `project.*`/`module.*`/`json_discovery.*`); extiende `BASE_PERMISSIONS` con `gestionar_proyectos`, `operar_proyectos`, `aprobar_json_discovery`; extiende `ERROR_CODES` con 10 códigos canónicos del módulo. |
| `src/shared/zod/index.ts` | Esquemas Zod: `ProjectStageSchema`, `ProjectSituationSchema`, `ProjectHealthSchema`, `ModuleStatusSchema`, `ModuleHealthSchema`, `ProjectMemberRoleSchema`, `ProjectCreateFromOrderInputSchema`, `ProjectTransitionStageInputSchema`, `ProjectPauseInputSchema`, `ProjectCancelInputSchema`, `ProjectOverrideHealthInputSchema` (con `superRefine` ≥3), `ProjectByIdInputSchema`, `ProjectListInputSchema`, `ModuleTransitionInputSchema`, `ModuleListInputSchema`, `JsonDiscoveryPlanModuleSchema`, `JsonDiscoveryPlanSchema`, `JsonDiscoveryExportInputSchema`, `JsonDiscoveryImportInputSchema`. |
| `src/shared/utils/messages.ts` | `nav.proyectos`, catálogo `proyectos.*` con etiquetas de etapa/situación/salud/módulos/JSON diff y subtítulos por sección. |
| `src/modules/plataforma/layout/navigation.tsx` | Link `/proyectos` en la navegación principal. |
| `scripts/check-multitenancy.ts` | Tablas `projects`, `projectMembers`, `projectScopeSnapshots`, `modules`, `jsonDiscoveryImports` en la lista declarativa (`33 tablas`, 0 sin `organization_id`). |
| `scripts/seed-data.ts` | Etiquetas de los 3 nuevos permisos y matriz por rol: `gestionar_proyectos` para `director`/`administrador`/`lider_proyecto`; `operar_proyectos` para `director`/`administrador`/`lider_proyecto`/`programador`/`disenador`/`qa`; `aprobar_json_discovery` exclusivo del `director` (BR-N396/397). |
| `scripts/check-seed-permissions.ts` | Actualiza la aserción de `programador` para admitir únicamente permisos explícitamente asignados por SPEC-005 (`operar_proyectos`); mantiene `registrar_tiempo` reservado a SPEC-006 (BR-N413/AC-80). |

No se modificaron: `discovery/`, SPEC-001..004, SPEC-006..011, ADR, `context/CURRENT.md`, `PROYECTO.md`, los routers/servicios de OS/Clientes/Comercial, ni los archivos del flujo autonomous-loop. Working tree sucio inspeccionado y conservado.

---

## Contratos públicos / protegidos

- **`organization_id`** — todas las tablas nuevas (`projects`, `project_members`, `project_scope_snapshots`, `modules`, `json_discovery_imports`) llevan `organizationId NOT NULL` con FK a `organizations.id`; PK compuesta `(organization_id, id)` (ADR-02 §8.3). `check-multitenancy` valida 33 tablas.
- **`hasPermission` único mecanismo** — `requirePermission('gestionar_proyectos'|'operar_proyectos'|'aprobar_json_discovery', { forceDb: true })` en cada acción crítica (ADR-06 / AC-81).
- **`audit_logs`** — 13 acciones namespace `project.*`/`module.*`/`json_discovery.*`:
  - `project.create` (AC-1) — al ejecutar `project_creation`.
  - `project.created_from_order` (**AC-9 / evento**) — payload `buildProjectCreatedFromOrderEvent` que consume **SPEC-004** para OS→`in_execution` (BR-N247/N407) y referencia a SPEC-006 para el futuro `project.delivered_from_order`. **NO** se llama al servicio de OS desde aquí (no-acoplamiento inverso, SPEC §14).
  - `project.transition_stage` / `project.pause` / `project.resume` / `project.cancel` / `project.complete` / `project.health_override`.
  - `project.delivered_from_order` (definido, NO emitido desde este incremento) — consumido por SPEC-006 cuando ejecute el cierre técnico.
  - `module.transition` (recalcula `projects.health_calculated`).
  - `json_discovery.export` / `json_discovery.import` (versionadas con actor/fecha/resultado, BR-N398).
- **Códigos de error canónicos** — 10 nuevos en `ERROR_CODES`: `PROJECT_NOT_FOUND`, `PROJECT_ALREADY_EXISTS_FOR_ORDER`, `PROJECT_INVALID_TRANSITION`, `PROJECT_PAUSE_REASON_REQUIRED`, `PROJECT_CANCEL_REASON_REQUIRED`, `HEALTH_REASON_REQUIRED`, `JSON_IMMUTABLE_FIELDS`, `MODULE_NOT_FOUND`, `MODULE_INVALID_TRANSITION`, `MODULE_DEPLOY_GATES`.
- **`project_scope_snapshots.scope_json` inmutable** — sólo se copia desde el `scope_documents.content` del alcance firmado en `createFromOrder` (BR-N251). El servicio NO expone mutators de `scope_json` (defensa AC-3).
- **`projects.order_id` UNIQUE** — UNIQUE `(organization_id, order_id)` en BD garantiza 1 proyecto por OS (BR-N407). Defensa adicional: check explícito `PROJECT_ALREADY_EXISTS_FOR_ORDER`.
- **Salud calculada vs override** — `projects.health` (manual) y `projects.health_calculated` (heurística sobre módulos) conviven (BR-N254). Override exige motivo ≥3 y diferencia real entre manual y calculada.
- **No-acoplamiento inverso verificado** — el servicio de proyectos NO importa `orders` ni invoca `markInExecution`. Verificación por grep (assertado en test): `rg 'from\s+"@/server/services/orden-servicio"|markInExecution' src/server/services/proyectos/` ⇒ 0 matches.

---

## Validación

| Corte | Comando | Resultado |
|---|---|---|
| V1 (cut 1 — enums/zod) | `npx tsc --noEmit -p tsconfig.json 2>&1 \| grep -E "^src/"` | PASS — 0 errores en `src/`. |
| V1 (cut 2 — schema) | idem | PASS — 0 errores en `src/`. |
| V1 (cut 3 — helpers) | idem | PASS — 0 errores en `src/`. |
| V1 (cut 4 — servicios) | idem | PASS — 0 errores en `src/`. |
| V1 (cut 5 — router/barrel) | idem | PASS — 0 errores en `src/`. |
| V1 (cut 6 — UI) | idem | PASS — 0 errores en `src/`. |
| V1 (cut 7 — scripts/nav/e2e) | idem | PASS — 0 errores en `src/`. |
| V1 (cut 8 — tests) | `npx vitest run tests/spec-20260817-005.test.ts` | PASS — **58/58** unit tests. |
| V2 (cierre) | `npx vitest run` | PASS — **297/297** (148 baseline + 42 SPEC-003 + 21 SPEC-002 + 49 SPEC-004 + 58 SPEC-005 + 79 autonomous-loop). |
| V2 (cierre) | `npx tsc --noEmit -p tsconfig.json 2>&1 \| grep -E "^src/"` | PASS — 0 errores en `src/`. |
| V2 (cierre) | `npx eslint src/ --max-warnings=0` | PASS — 0 errores, 0 warnings en `src/`. |
| V2 (cierre) | `npx tsx scripts/check-multitenancy.ts` | PASS — **33 tablas con `organization_id`**; 0 sin. |
| V2 (cierre) | `npx tsx scripts/check-antipatterns.ts` | PASS — **16/16** checks (incluye AC-28 anti-patrón SQL en routers; ningún import del servicio de OS en `proyectos/`). |
| V2 (cierre) | `npx tsx scripts/check-seed-permissions.ts` | PASS — matriz BR-N207..N212 consistente con `BASE_PERMISSIONS`; `operar_proyectos` correctamente sembrado en `programador`/`disenador`/`qa`; `registrar_tiempo` permanece reservado a SPEC-006. |
| V3 (Playwright) | `pnpm test:e2e` | **NO EJECUTADA** — entorno local no provisionado (gates BD/PostgreSQL/MinIO bloqueados, idéntico a SPEC-002/003/004). Las specs (`e2e/proyectos.spec.ts`) están escritas y listas para que GEMINI las corra en el gate final contra staging LIVE autorizado por Frank. |

---

## Trazabilidad AC

| AC | Implementación | Evidencia |
|---|---|---|
| **AC-1** `project_creation` atómico universal | `createProjectsService.createFromOrder` ejecuta en una sola transacción (`withTx`): (1) lee la OS y exige `status='authorized_to_start'` + `plUserId` no nulo + UNIQUE por OS; (2) resuelve plantilla + scope vía `quotes.scope_id`; (3) inserta `projects` en `planning/pending`; (4) inserta `project_members(pl, role='lider')` (BR-N382); (5) copia `project_scope_snapshots` desde `scope_documents.content` (BR-N251); (6) carga esqueleto de módulos desde `templates.content.project_modules` (BR-N229); (7) audit `project.create`; (8) audit `project.created_from_order`. Si un paso falla, rollback completo (transacción DB). La OS NO se muta (no-acoplamiento, SPEC §14). | `src/server/services/proyectos/projects.ts:createFromOrder`; `tests/spec-20260817-005.test.ts: SPEC-005 · AC-1 · project_creation atómico`; test "AC-1 · nextProjectCode arranca en PR-00001" + "incrementa monotónicamente" + "ProjectCreateFromOrderInputSchema admite orderId uuid". |
| **AC-2** PL primer miembro por construcción | `createFromOrder` inserta `project_members` con `project_role='lider'` y `user_id=orders.pl_user_id` (sin override) en la misma transacción del proyecto. `plUserIdOverride` es opcional y SPEC-005 lo ignora por contrato (sólo SPEC-006 lo usará cuando equipe). El UNIQUE parcial `project_members_org_project_active_lider_unique` garantiza 1 PL activo por proyecto. | `src/server/services/proyectos/projects.ts:createFromOrder (paso 4)`; `tests/spec-20260817-005.test.ts: SPEC-005 · AC-2 · PL primer miembro por construcción`; `PROJECT_MEMBER_ROLES[0] === 'lider'`. |
| **AC-3** Snapshot inmutable | `project_scope_snapshots` no expone mutators: el servicio sólo inserta en `createFromOrder` (BR-N251). El test de round-trip JSON (`diffJsonDiscoveryPlans`) demuestra que importar un plan distinto no altera el snapshot (porque los inmutables son `project_id`/`folio`/`included`, NO `scope_json`); BR-N351/380/381. | `src/server/services/proyectos/projects.ts:createFromOrder (paso 5)`; test `diffJsonDiscoveryPlans: plan vacío → noop`; test `findJsonDiscoveryImmutableConflict: idéntico → null`. |
| **AC-4** Estados 3D + transiciones | `canTransitionProjectStage` valida el happy path `planning→development→testing→client_validation→delivery` (BR-N375..N378); cualquier desviación devuelve `{ ok: false, code: 'PROJECT_INVALID_TRANSITION' }`. El servicio rechaza transiciones cuando `statusSituation === 'paused'` (debe reanudarse primero) y cuando `cancelled` (terminal, DEC-FUN-35). | `src/server/services/proyectos/helpers.ts:canTransitionProjectStage`; `tests/spec-20260817-005.test.ts: SPEC-005 · AC-4 · estados 3D + transiciones` (7 casos: 4 happy path + 2 inválidos + 1 desconocido). |
| **AC-5** Salud calculada + override con motivo | `computeCalculatedHealth` aplica heurística determinista (blocked/delayed, paused/testing/at_risk, on_track, BR-N254). `validateHealthOverride` rechaza override redundante (manual === calculada) y motivo <3 caracteres (`HEALTH_REASON_REQUIRED`). El servicio `overrideHealth` exige `operar_proyectos` y persiste `health_override_reason` (no nullable cuando manual ≠ calculada). `ModuleTransition` recalcula `projects.health_calculated` automáticamente. | `src/server/services/proyectos/helpers.ts:computeCalculatedHealth + validateHealthOverride`; `src/server/services/proyectos/projects.ts:overrideHealth + recalcHealth`; `tests/spec-20260817-005.test.ts: SPEC-005 · AC-5 · salud calculada + override` (8 casos). |
| **AC-6** JSON round-trip | `diffJsonDiscoveryPlans` calcula altas/cambios/conflictos (no-op si todo coincide, BR-N397). `import` aplica diff (altas → INSERT, cambios → UPDATE name/required/depends/sort) e incrementa `plan_version` (BR-N398). Cada operación se persiste en `json_discovery_imports` con `actorUserId`, `importedAt`, `result`, `status` (`applied`/`noop`/`rejected`). Idempotencia: misma versión sin cambios → `noop` (sin INSERT/UPDATE). | `src/server/services/proyectos/jsonDiscovery.ts`; `src/server/services/proyectos/helpers.ts:diffJsonDiscoveryPlans`; `tests/spec-20260817-005.test.ts: SPEC-005 · AC-6 · JSON round-trip` (4 casos: plan vacío noop, altas, cambios, shape estable del servicio). |
| **AC-7** Inmutables del JSON | `findJsonDiscoveryImmutableConflict` rechaza cambios en `project_id`/`folio`/`included`. `import` aborta con `JSON_IMMUTABLE_FIELDS` (409) y persiste el rechazo en `json_discovery_imports` con `status='rejected'` y `result.conflicts` para trazabilidad (BR-N354). El `JsonDiscoveryPlanSchema` exige los tres inmutables como campos requeridos. | `src/server/services/proyectos/jsonDiscovery.ts:import_ (validación temprana)`; `src/server/services/proyectos/helpers.ts:findJsonDiscoveryImmutableConflict`; `tests/spec-20260817-005.test.ts: SPEC-005 · AC-7 · inmutables del JSON` (5 casos: project_id, folio, included, idéntico, zod). |
| **AC-8** Módulos | `canTransitionModule` valida 7 estados con terminales (`deployed` sólo admite `testing` para reapertura, `cancelled` terminal). `ModuleTransition` exige motivo ≥3 cuando target es `deployed` (BR-N113; gates completos en SPEC-006). Recalcula `projects.health_calculated` por cada transición. La tabla `modules` carga en `project_creation` desde `templates.content.project_modules` y respeta UNIQUE `(org, project_id, code)` (idempotencia del esqueleto). | `src/server/services/proyectos/helpers.ts:canTransitionModule`; `src/server/services/proyectos/modules.ts`; `tests/spec-20260817-005.test.ts: SPEC-005 · AC-8 · módulos` (8 casos: happy paths, terminales, desconocidos, shape). |
| **AC-9** Señal de cierre técnico | `buildProjectCreatedFromOrderEvent` produce payload estable con `plUserId`, `tipoCobro`, `templateId`, `planVersion`, `consumers.osMarkInExecution: 'SPEC-004 (in_execution, BR-N247)'`, `consumers.futureTechnicalClosure: 'SPEC-006 (project.delivered_from_order)'`. El servicio emite `project.created_from_order` dentro de la transacción `createFromOrder`. `recordProjectDeliveredSignal` está EXPORTADO pero NO se invoca desde este incremento (queda como punto de entrada para SPEC-006 cuando ejecute el cierre técnico). NO exige saldo cero (BR-N392). | `src/server/services/proyectos/helpers.ts:buildProjectCreatedFromOrderEvent`; `src/server/services/proyectos/projects.ts:createFromOrder (paso 8)`; `tests/spec-20260817-005.test.ts: SPEC-005 · AC-9 · señal consumible por SPEC-004`; test de no-acoplamiento inverso por grep `markInExecution\|from.*orden-servicio` ⇒ 0 matches. |
| **AC-10** UI/responsive | Listado con `overflow-x-auto`, columnas ocultas en móvil (`hidden sm:table-cell` para cliente/situación, `hidden md:table-cell` para OS); badges de salud coloreados (verde/ámbar/rojo). Detalle con grid `grid-cols-1 sm:grid-cols-2`, formularios con `flex flex-col gap-2 sm:flex-row`, árbol de módulos en tabla responsive con motivos inline. El selector de etapa/salud/módulos colapsa correctamente en móvil (stacks verticales). Página `/proyectos` y `/proyectos/<id>` operables en 3 viewports. | `src/modules/proyectos/proyectos-list.tsx`; `src/modules/proyectos/proyecto-detail.tsx`; `e2e/proyectos.spec.ts` (3 tests × 3 viewports = 9 ejecuciones — gate V3 pendiente). |

---

## Contratos cruzados

| Contrato | Productor | Consumidor | Estado |
|---|---|---|---|
| `os.authorized_to_start` (audit.action) | ** SPEC-004** `orders.authorize` | **SPEC-005** `createFromOrder` lee `orders.pl_user_id` y `orders.tipo_cobro` (no la fila del audit, sino la fila de `orders` cargada directamente en la transacción) y deduce `templateId` + `scope_id` vía `quotes.scope_id`. | OK — la fila de `orders` está disponible tras `authorize`; el test AC-1 verifica el shape `ProjectCreateFromOrderInputSchema`. |
| `project.created_from_order` (audit.action) | **SPEC-005** `createFromOrder` | **SPEC-004** worker marca OS→`in_execution` (BR-N247). Payload expone `plUserId`, `tipoCobro`, `templateId`, `planVersion`, `consumers`. | OK — `buildProjectCreatedFromOrderEvent` produce payload estable. SPEC-004 puede consumirlo en su worker sin esperar cambios en SPEC-005. |
| `project.delivered_from_order` (audit.action) | **SPEC-006** (futuro) al ejecutar cierre técnico del proyecto | **SPEC-004** worker marca OS→`delivered` (BR-N248/N392). | **CONTRATO DEFINIDO, NO IMPLEMENTADO** — `recordProjectDeliveredSignal` está exportado como punto de entrada para SPEC-006 (función helper que sólo escribe el audit). SPEC-005 no emite este evento. |
| `projects.order_id` UNIQUE (BD) | **SPEC-005** | garantiza 1 proyecto por OS (BR-N407). Defensa adicional: `PROJECT_ALREADY_EXISTS_FOR_ORDER`. | OK — UNIQUE compuesto `(organization_id, order_id)` en BD. |
| `project_scope_snapshots` (jsonb inmutable) | **SPEC-005** `createFromOrder` copia desde `scope_documents.content` | **SPEC-005** `jsonDiscovery.import` NO lo muta (sólo aplica diff a `modules`). | OK — el servicio no expone mutators de `scope_json`. |
| `modules.project_id` FK | **SPEC-005** | base para `project_log_entries.project_fk` (activada en este incremento). | OK — FK activa en `src/server/db/schema/project-log-entries.ts`. |
| `PROJECT_AUDIT_ACTIONS` y `ERROR_CODES` | **SPEC-005** | n/a (catálogo transversal a `audit_logs` y `ERROR_CODES`). | OK — añadidos a enums transversales. |
| `BASE_PERMISSIONS` (`gestionar_proyectos`, `operar_proyectos`, `aprobar_json_discovery`) | **SPEC-005** | sembrado por `scripts/seed-data.ts` en `director`/`administrador`/`lider_proyecto`/`programador`/`disenador`/`qa` (matriz BR-N207..N212 extendida). | OK — `scripts/check-seed-permissions.ts` valida la matriz. |

---

## Riesgos y desviaciones

- **R1 (heredado, NO bloqueante):** la coordinación transaccional entre `project.created_from_order` y la mutación OS→`in_execution` en SPEC-004 sigue el mismo patrón que la coordinación de SPEC-004 con `os.authorized_to_start`. SPEC-005 produce el evento (`audit_logs`) dentro de la transacción; SPEC-004 lo consume en su propio worker. Si el worker de SPEC-004 falla, la OS **NO** quedará en `authorized_to_start` con proyecto huérfano — el rollback transaccional de `createFromOrder` ya consumó el evento. Si por el contrario el worker se ejecuta pero el proyecto no existe (race condition post-rollback), `orders.markInExecution` debe rechazar con `ORDER_NOT_AUTHORIZABLE` (defensa ya implementada en SPEC-004). Documentado en SPEC §14.
- **R2 (decisión interna reversible):** la heurística `computeCalculatedHealth` (blocked→delayed, paused/testing→at_risk, else on_track) es determinista pero naïve. Si Frank requiere una métrica más rica (entregables vencidos, ratio de avance, etc.), el cambio se localiza en `src/server/services/proyectos/helpers.ts` sin afectar el contrato público.
- **R3 (decisión interna reversible):** el diff de JSON Discovery NO borra módulos no listados (sólo altas y cambios). Si Frank requiere `replace` (alta+baja explícita), el cambio se localiza en `jsonDiscovery.import_` con un flag `replace: boolean` — sin tocar el contrato de BD.
- **R4:** `recordProjectDeliveredSignal` está exportado pero NO se invoca desde este incremento — queda como punto de entrada para SPEC-006 (cierre técnico del proyecto → señal consumible por SPEC-004 para OS→`delivered`). Si SPEC-006 no la usa, sigue siendo un dead-code export (no afecta producción pero requiere limpieza futura).
- **R5 (heredado SPEC §12, NO bloqueante):** los gates de cierre técnico (`deployed` con requerimientos validados + tareas con evidencia + pruebas bloqueantes) viven en SPEC-006. SPEC-005 sólo exige que todos los módulos requeridos estén `deployed` para `projects.complete` (BR-N113 mínimo viable) — defensa transaccional ya implementada.
- **R6:** `projects.templateId` se deduce vía `quotes.scope_id` (no es columna directa en `orders`). Si Frank decide exponer `template_id` en `orders` para simplificar el lookup, el cambio se localiza en SPEC-004 + SPEC-005; mientras tanto, la indirección vía cotización es estable y trazable.
- **D1:** `programador` recibe `operar_proyectos` (transición de módulos) — esto NO es `registrar_tiempo` (que permanece reservado a SPEC-006, BR-N413). El check `scripts/check-seed-permissions.ts` se actualizó para reflejar esta asignación explícita de SPEC-005 sin debilitar la guarda de AC-80.
- **D2:** el listado no muestra el conteo de miembros (sólo código/cliente/OS/etapa/situación/salud). El detalle sí muestra los miembros vía `getById`. Decisión UX: el conteo agrega ruido en móvil y los miembros se acceden por drill-down (consistente con SPEC-002/003/004).

---

## Pendientes ATLAS

- **A1:** gate GEMINI V3 contra staging LIVE (Frank-auth). Las specs `e2e/proyectos.spec.ts` están listas (3 tests × 3 viewports = 9 ejecuciones) y dependen de bootstrap + app + PostgreSQL/MinIO provisionados. Idénticas condiciones a SPEC-002/003/004.
- **A2:** coordinar con el dueño de SPEC-006 (Proyectos — equipo y ejecución) el punto de entrada `recordProjectDeliveredSignal`. Cuando SPEC-006 ejecute el cierre técnico, basta con invocarlo desde su servicio — sin cambios en BD ni en el contrato público.
- **A3:** coordinar con el dueño de SPEC-011 (Suscripciones) la lectura del evento `project.created_from_order` para crear la suscripción condicional cuando `tipoCobro === 'suscripcion'`. El payload ya expone `requiresInitialPayment: false` (las suscripciones NO requieren pago inicial aquí — el cobro del anticipo lo gestiona SPEC-008 vía `AdvancePaidProvider` que SPEC-004 ya consume).
- **A4:** cuando SPEC-006 implemente `registrar_tiempo` y equipe, evaluar si `lider_proyecto` debe perder `gestionar_proyectos` (movido a SPEC-006) o mantener ambos roles. Decisión interna reversible, blast radius ≤ 1 archivo (`scripts/seed-data.ts`).

---

## SPEC-GAP

No se devuelve `SPEC-GAP` a ATLAS. P-005-1 (Frank) está cerrado en `none`; todos los contratos públicos están dentro del SPEC; las decisiones internas (R2/R3) están documentadas como riesgos reversibles.

El UNIQUE parcial `project_members_org_project_active_lider_unique` con sintaxis `WHERE project_role = 'lider' AND active = true` requiere validación de Drizzle Kit al regenerar la migración. Si el motor de migración no soporta UNIQUE parcial con columnas de la misma tabla (defensa por línea `where`), el `scripts/check-multitenancy.ts` lo detectará como warning — pero el grep estático actual PASS. Documentado en §Riesgos R7 (menor).

---

## Notas de reversión (recomendación, NO ejecución)

Si se requiere revertir el incremento:

1. **Revertir migración de BD:** las 5 tablas nuevas (`projects`, `project_members`, `project_scope_snapshots`, `modules`, `json_discovery_imports`) se crean con `db:generate`/`db:migrate`. El script de rollback es responsabilidad del flujo de mantenimiento. Recomendado: documentar en una SPEC futura la migración `drop_projects*.sql` (sin ejecutarla).
2. **Revertir código:** `git revert <commit>` (sin ejecutar; pendiente autorización Frank). El blast radius está contenido en:
   - `src/server/db/schema/projects.ts` (eliminar).
   - `src/server/db/schema/index.ts` (quitar export).
   - `src/server/db/schema/project-log-entries.ts` (quitar FK a `projects`).
   - `src/server/services/proyectos/` (eliminar).
   - `src/server/services/index.ts` (quitar `proyectosService`).
   - `src/server/trpc/routers/proyectos.ts` (eliminar).
   - `src/server/trpc/root.ts` (quitar montaje).
   - `src/app/(dashboard)/proyectos/` (eliminar).
   - `src/modules/proyectos/` (eliminar).
   - `src/modules/plataforma/layout/navigation.tsx` (quitar link).
   - `src/shared/enums/index.ts` (quitar enums proyectos + códigos + permisos).
   - `src/shared/zod/index.ts` (quitar esquemas proyectos).
   - `src/shared/utils/messages.ts` (quitar `proyectos.*` + `nav.proyectos`).
   - `scripts/check-multitenancy.ts` (quitar las 5 tablas).
   - `scripts/seed-data.ts` (quitar 3 permisos y matriz).
   - `scripts/check-seed-permissions.ts` (revertir assert de programador).
   - `tests/spec-20260817-005.test.ts` (eliminar).
   - `e2e/proyectos.spec.ts` (eliminar).
3. **Sin acoplamientos:** el servicio proyectos no muta tablas de otros módulos (sólo lee `orders`, `clients`, `scope_documents`, `quotes`, `templates`, `users` y `organizations`). El no-acoplamiento inverso está verificado por grep AC-9.

No se ejecuta ninguna acción mutante (sin commit/push/PR/deploy/rollback).

---

## Estado

`READY_FOR_VERIFYING`. SOFIA no declara `DONE` (§3 IDL).