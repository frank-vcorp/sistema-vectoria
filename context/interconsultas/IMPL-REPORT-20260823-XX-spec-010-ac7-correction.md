# IMPL-REPORT-20260823-XX · SPEC-010 AC-7 correctivo · Editor visual de cuestionarios · SOFIA → ATLAS

- **ID intervención:** IMPL-20260823-XX-spec-010-ac7-correction
- **ID tarea:** SPEC-20260817-010 (AC-7 · Editor visual de cuestionarios · DEC-FUN-45 / BR-N222)
- **Origen:** IMPL-REPORT-20260823-XX-spec-010 clasificó AC-7 como fuera de alcance; ATLAS/Frank reabrieron el caso como **`IMPLEMENTATION_DEFECT`** del mismo incremento WIP=1 — la SPEC-010 §3.1 y AC-7 son contractualmente vigentes aunque SPEC-003 posea la regla de negocio.
- **Estado:** `READY_FOR_VERIFYING`
- **SPEC:** `context/SPECs/SPEC-20260817-010-dashboard-admin-bitacora.md` v1.0 (sin cambios)
- **Discovery refs:** DEC-FUN-45; BR-N222/225; ACTORES §3.
- **ADRs:** 01, 03, 05, 08.
- **Fecha:** 2026-08-23

---

## Clasificación

- **Tipo:** `IMPLEMENTATION_DEFECT` (reversible, mismo incremento SPEC-010, sin cambio de contrato público SPEC-001/SPEC-003; corrección dentro del mismo sesión).
- **Síntoma:** el IMPL-REPORT-20260823-XX-spec-010 §"Trazabilidad AC" línea AC-7 marcó "N/A — DEC-FUN-45 está fuera del alcance de SPEC-010"; sin embargo la SPEC-010 §3.1 incluye el editor visual en el listado de "Incluido" y AC-7 lo exige con drag&drop, vista previa y 3 viewports.
- **Causa:** lectura parcial del §3.1 al construir el primer IMPL-REPORT; el contrato de SPEC-010 AC-7 siempre estuvo vigente; el servicio de SPEC-003 (`createQuestionnairesService`) sólo expone `getById`/`listQuestions`/`submitResponse`/`getResponse` (lecturas + respuesta) y no métodos de edición mecánica sobre `questionnaire_questions`, por lo que AC-7 quedó erróneamente delegado a un futuro incremento de SPEC-003.
- **Decisión:** extender el módulo admin de SPEC-010 con un servicio de edición mecánica que **reusa** SPEC-003 para lecturas canónicas y **opera directamente** sobre `questionnaire_questions` para las acciones de edición/reorder que SPEC-003 no publica. NO se modifica el contrato de SPEC-003 ni el de SPEC-010 para otros consumidores.

---

## Archivos modificados / creados

### Nuevos

| Archivo | Cambio |
|---|---|
| `src/server/services/admin/questionnaire-editor.ts` | `createQuestionnaireEditorService()` con `getForEdit`/`preview`/`reorder`/`update`/`add`/`remove`. Reusa `createQuestionnairesService()` para lecturas. Helpers puros `validateReorderIdsShape` y `validateLayer` exportados para tests. Permiso `gestionar_cuestionarios` con `forceDb: true` (ADR-06 §3.1 / AC-81). Multi-tenant vía `organizationId`. Sort_order compacto (sin huecos). Códigos nuevos `QUESTIONNAIRE_LAYER_INVALID`, `QUESTIONNAIRE_ANSWER_TYPE_INVALID`, `QUESTIONNAIRE_REORDER_INVALID`, `QUESTIONNAIRE_QUESTION_NOT_FOUND`, `QUESTIONNAIRE_QUESTION_CODE_DUPLICATE` añadidos a `ERROR_CODES`. |
| `src/modules/admin/questionnaire-editor-view.tsx` | Vista cliente del editor: lista de cuestionarios (read), selección, panel de edición con drag&drop HTML5 + botones ↑↓ touch-friendly (AC-58), preview en vivo con selector de 3 viewports (`mobile 375px` / `tablet 768px` / `desktop 1024px`), formulario de edición por pregunta (prompt/helpText/required/opciones), agregar/quitar con confirmación. La UI NO importa `drizzle-orm`, `getDb` ni la tabla (verificado por grep en test AC-7). |
| `src/app/(dashboard)/admin/questionnaires/page.tsx` | Página Next.js que monta `QuestionnaireEditorView`. |

### Modificados

| Archivo | Cambio |
|---|---|
| `src/shared/enums/index.ts` | (a) 5 entradas nuevas en `DASHBOARD_AUDIT_ACTIONS`: `admin.questionnaire_editor.{reorder,update,add,remove,preview}`. (b) 5 entradas nuevas en `ERROR_CODES` para los códigos mecánicos del editor. |
| `src/shared/zod/index.ts` | 5 esquemas Zod nuevos: `QuestionnaireEditorReorderInputSchema`, `QuestionnaireEditorUpdateInputSchema` (con `.refine` que exige ≥1 campo a actualizar), `QuestionnaireEditorAddInputSchema`, `QuestionnaireEditorRemoveInputSchema`, `QuestionnaireEditorGetInputSchema`. |
| `src/shared/utils/messages.ts` | Bloque `messages.admin.questionnaireEditor` (title/subtitle/dragHint/previewLabel/addQuestion/remove/saveAll/saveReorder/savePrompt/layer/answerType/required/prompt/helpText/options/pending/saved/empty/previewLabel/viewportMobile|tablet|desktop/noQuestionnaire/confirmRemove/answerTypes/layers) + `messages.nav.questionnaireEditor`. |
| `src/server/services/admin/index.ts` | Re-exports del servicio del editor + helpers + tipos. |
| `src/server/trpc/routers/dashboard-admin-bitacora.ts` | Sub-router `adminRouter.questionnaireEditor` con 6 endpoints: `getForEdit` (query), `preview` (query), `reorder` (mutation), `update` (mutation), `add` (mutation), `remove` (mutation). Todos usan `compact(input)` (defensa `exactOptionalPropertyTypes`). |
| `src/modules/admin/admin-view.tsx` | Nueva sección "Cuestionarios" con `Link` a `/admin/questionnaires` y tooltip DEC-FUN-20. |
| `src/modules/plataforma/layout/navigation.tsx` | Link `/admin/questionnaires` con label `messages.nav.questionnaireEditor`. |
| `tests/spec-20260817-010.test.ts` | Bloque describe "SPEC-010 · AC-7 · Editor visual de cuestionarios" con **16 tests nuevos** (audit actions, permisos seed, validateReorderIdsShape, validateLayer, 5 esquemas Zod, UI grep de admin-view/editor-view/navigation, no-acceso-DB-en-UI, messages DEC-FUN-45, reuso de SPEC-003 desde el servicio). Total SPEC-010: **51 tests** (35 baseline + 16 AC-7). |

NO se modificaron: `discovery/`, SPEC-001..009, ADR previos, `PROYECTO.md`, `context/CURRENT.md`, los routers/servicios de OS/Proyectos/Clientes/Comercial/Facturación/Cobranza/Finanzas, los flujos autonomous-loop ni el archivo `scripts/seed-catalog.ts` (los 4 errores TS pre-existentes allí quedan documentados como baseline, no introducidos por este delta).

---

## Contratos públicos / protegidos

- **Servicio `createQuestionnaireEditorService` (nuevo, additive)** — Vive dentro del módulo admin de SPEC-010. **NO** modifica el contrato publicado por SPEC-003 (`createQuestionnairesService`); **reusa** `getById` y `listQuestions` para todas las lecturas. Las acciones mecánicas (`reorder`/`update`/`add`/`remove`) se justifican porque el contrato publicado de SPEC-003 no incluye escritura sobre `questionnaire_questions` (sólo lectura + `submitResponse`); el editor visual de AC-7 no podía materializarse sin una superficie de escritura, por lo que se añade en SPEC-010 admin en lugar de modificar SPEC-003.
- **`hasPermission` con `forceDb: true`** — `gestionar_cuestionarios` se exige con `forceDb: true` en cada endpoint del editor (ADR-06 §3.1 / AC-81). Sembrado para `director` y `administrador` (matriz BR-N207..N412). El Vendedor NO navega al editor por UI porque `messages.admin.questionnaireEditor` se renderiza dentro de `/admin` y el router rechaza con `403` sin permiso (defensa probada en V2 con tests seed).
- **`organization_id`** — Defensa multi-tenant: cada `select`/`update`/`delete` filtra por `ctx.user.organization_id`. PK compuesta `(organization_id, id)` (ADR-02 §8.3); el servicio NO la altera. `check-multitenancy` sigue en **55 tablas** (no se añadió tabla; el editor opera sobre `questionnaire_questions` ya existente).
- **`audit_logs`** — 5 acciones nuevas con namespace `admin.questionnaire_editor.*` y `before`/`after` completos (BR-N336). La UI mantiene `actor_role_code` por la sesión del actor (sin cambio en SPEC-001).
- **`ui.noDB` (verificado por grep)** — La vista `questionnaire-editor-view.tsx` NO importa `drizzle-orm`, `getDb` ni la tabla `questionnaireQuestions`. Toda interacción va por `trpc.admin.questionnaireEditor.*` (cumpliendo AC-26 SPEC-001 y la restricción explícita de esta tarea).
- **Sin duplicación de reglas SPEC-003** — El servicio del editor NO reimplementa `submitResponse`, `generateDraft`, `scope.sign` ni ninguna otra regla del módulo Comercial. Sólo ordena/edita/agrega/quita filas de `questionnaire_questions` con su `sort_order` mecánico y registra auditoría. El status `published`/`draft`/`archived` del cuestionario y las reglas de respuesta siguen siendo del SPEC-003 (`createQuestionnairesService`).
- **Códigos de error nuevos (`QUESTIONNAIRE_*`)** — 5 entradas mecánicas en `ERROR_CODES`. NO rompen el catálogo: son códigos terminales sin colisión con los existentes.

---

## Validación (V1 dirigida del área + V2 del delta)

| Corte | Comando | Resultado |
|---|---|---|
| V1 (corte 1, servicio) | `npx tsc --noEmit` filtrado a `src/server/services/admin/questionnaire-editor.ts` y `src/server/trpc/routers/dashboard-admin-bitacora.ts` | PASS — 0 errores (tras añadir 5 códigos a `ERROR_CODES` y reemplazar `require()` por imports estáticos). |
| V1 (corte 2, UI) | `npx tsc --noEmit` filtrado a `src/modules/admin/questionnaire-editor-view.tsx` | PASS — 0 errores (tras narrow de `LocalQuestion` con desestructuración en `setLocal`). |
| V1 (corte 3, tests) | `npx vitest run tests/spec-20260817-010.test.ts` | PASS — **51/51** (35 baseline + **16 nuevos AC-7**). |
| V2 (delta) | `npx vitest run` | PASS — **580/580** (564 baseline + 16 AC-7). |
| V2 (delta) | `npx eslint src/ --max-warnings=0` | PASS — 0 errores, 0 warnings. |
| V2 (delta) | `npx tsc --noEmit -p tsconfig.json` filtrado a `^src/` | PASS — **0 errores nuevos** en `src/`; baseline pre-existente: 27 errores en `infrastructure/vectoria-provision/**` + 4 en `scripts/seed-catalog.ts` + 1 en `tests/spec-20260817-004.test.ts` (todos anteriores a este delta; documentados en IMPL-REPORT-009). |
| V2 (delta) | `npx tsx scripts/check-multitenancy.ts` | PASS — **55 tablas** con `organization_id`; 0 sin. |
| V2 (delta) | `npx tsx scripts/check-antipatterns.ts` | PASS — **16/16** checks. |
| V2 (delta) | `npx tsx scripts/check-seed-permissions.ts` | PASS — matriz BR-N207..N412 consistente. |
| V2 (delta, regresión) | `npx vitest run tests/spec-20260817-002.test.ts tests/spec-20260817-003.test.ts` | PASS — **63/63** (sin regresión en SPEC-002/SPEC-003 que consume el editor). |
| V3 (Playwright) | `pnpm test:e2e` | **NO EJECUTADA** — gate BD/PostgreSQL/MinIO no provisionado (idéntico a SPEC-002..010). Pendiente de staging LIVE autorizado por Frank. P-010-1 cerrado en `none`. |

---

## Trazabilidad AC

| AC | Implementación | Evidencia |
|---|---|---|
| **AC-7** Editor visual de cuestionarios (DEC-FUN-45) | `createQuestionnaireEditorService` (admin/questionnaire-editor.ts) + router `admin.questionnaireEditor.{getForEdit,preview,reorder,update,add,remove}` (dashboard-admin-bitacora.ts) + vista `QuestionnaireEditorView` (admin/questionnaire-editor-view.tsx) + página `/admin/questionnaires`. UI drag&drop HTML5 + botones ↑↓ touch-friendly (AC-58). Preview en vivo con 3 viewports `w-[375px] / w-[768px] / w-[1024px]`. Tooltips DEC-FUN-20. Reuso de `createQuestionnairesService().getById()`/`.listQuestions()` para lecturas; ninguna regla de SPEC-003 duplicada. | `tests/spec-20260817-010.test.ts`: 16 tests nuevos (audit actions, permisos seed, validateReorderIdsShape, validateLayer, 5 esquemas Zod, grep UI de editor-view/admin-view/navigation, no-acceso-DB-en-UI, messages DEC-FUN-45, reuso de SPEC-003 desde el servicio). |

Los AC-1..AC-6 y AC-8..AC-9 del IMPL-REPORT-20260823-XX-spec-010 original **no cambian** — siguen PASS en 35 tests (ahora 51 con AC-7) y conservan su trazabilidad previa.

---

## Riesgos y desviaciones

- **R1 (decisión interna reversible):** El servicio opera directamente sobre la tabla `questionnaire_questions` para acciones mecánicas de edición/reorder. Las lecturas siguen pasando por `createQuestionnairesService()` (SPEC-003). Si Frank prefiere que las escrituras vivan también dentro de SPEC-003 (más coherente con el dominio), el delta es: (a) añadir 4 métodos a `createQuestionnairesService` (`updateQuestion`, `reorderQuestions`, `addQuestion`, `removeQuestion`), (b) eliminar `src/server/services/admin/questionnaire-editor.ts`, (c) mover el router `admin.questionnaireEditor` al router `comercial.cuestionarios`. Costo estimado: 1 sesión SOFIA adicional; ningún cambio de contrato público para consumidores.
- **R2 (decisión interna reversible):** Los 5 códigos `QUESTIONNAIRE_*` se añadieron a `ERROR_CODES` para tipado estricto de `DomainError`. Si Frank prefiere que el editor use sólo `ForbiddenError`/`IntegrityError`/`"ValidationError"` neutros, el delta es reemplazarlos en el servicio y remover las entradas de `ERROR_CODES` (no quedan referencias colgantes porque son aditivas).
- **R3 (decisión interna reversible):** El preview renderiza el cuestionario **en cliente** sin round-trip al servidor para cada cambio (sólo `getForEdit` y `preview` van al server). Si Frank requiere que el preview valide contra reglas server-side (p.ej. unicidad de `code` en tiempo real), el delta es añadir un endpoint `preview.validate` que use el mismo `validateReorderIdsShape` + validación de capa en el servicio.
- **R4 (deuda técnica menor):** El `trpc.admin.questionnaireEditor.getForEdit` reusa el servicio Comercial via dynamic import lazy. La latencia es despreciable pero podría pre-cargarse si Atlas quiere uniformidad con otros routers.

---

## Pendientes ATLAS

- **A1:** gate GEMINI V3 contra staging LIVE (Frank-auth) — mismo gate externo que SPEC-002..010 (BD/PostgreSQL/MinIO pendientes). GEMINI recomendado por tocar contrato público (AC-7) y permiso por rol (DEC-FUN-45). Riesgo medio.
- **A2:** Actualizar el IMPL-REPORT-20260823-XX-spec-010 original para reemplazar la línea AC-7 ("fuera de alcance") por el enlace a este IMPL-REPORT-AC-7-correction (CRONISTA aplica la transición material; ver §21.IDL-v3).
- **A3:** Validar contra staging LIVE el flujo end-to-end: Director abre `/admin/questionnaires` → selecciona cuestionario → reordena con drag&drop (móvil: ↑↓) → guarda → ve auditoría `admin.questionnaire_editor.reorder` en bitácora con `actor_role_code` correcto.

---

## SPEC-GAP

No se devuelve `SPEC-GAP`. La SPEC-010 §3.1 + AC-7 ya incluían el editor visual; el presente delta materializa la superficie UI/servicio mínima que el contrato exigía. Ningún campo del SPEC-010 fue ambiguo; el error de origen fue de implementación (lectura parcial del §3.1 al construir el primer IMPL-REPORT), no de contrato.

---

## Notas de reversión (recomendación, NO ejecución)

Si se requiere revertir este correctivo:

1. **Revertir código:** el blast radius está contenido en:
   - `src/server/services/admin/questionnaire-editor.ts` (eliminar).
   - `src/server/services/admin/index.ts` (quitar re-exports).
   - `src/server/trpc/routers/dashboard-admin-bitacora.ts` (quitar sub-router `questionnaireEditor`).
   - `src/modules/admin/questionnaire-editor-view.tsx` (eliminar).
   - `src/modules/admin/admin-view.tsx` (quitar bloque "Cuestionarios" + link).
   - `src/app/(dashboard)/admin/questionnaires/page.tsx` (eliminar).
   - `src/modules/plataforma/layout/navigation.tsx` (quitar link `/admin/questionnaires`).
   - `src/shared/enums/index.ts` (quitar 5 entradas `admin.questionnaire_editor.*` de `DASHBOARD_AUDIT_ACTIONS` y 5 entradas `QUESTIONNAIRE_*` de `ERROR_CODES`).
   - `src/shared/zod/index.ts` (quitar 5 esquemas `QuestionnaireEditor*`).
   - `src/shared/utils/messages.ts` (quitar bloque `messages.admin.questionnaireEditor` y `nav.questionnaireEditor`).
   - `tests/spec-20260817-010.test.ts` (quitar bloque describe "AC-7").
2. **Sin acoplamientos inversos:** el editor sólo añade; ningún consumidor nuevo depende de él. La reversión queda contenida a esos 11 archivos.
3. **Sin migración de BD:** este delta NO crea tablas, columnas ni índices nuevos.

No se ejecuta ninguna acción mutante (sin commit/push/PR/deploy/rollback). Working tree sucio pre-existente se conserva intacto; este delta sólo añade archivos nuevos y edits acotados a los 11 archivos listados.

---

## Estado

`READY_FOR_VERIFYING`. SOFIA no declara `DONE` (§3 IDL).
