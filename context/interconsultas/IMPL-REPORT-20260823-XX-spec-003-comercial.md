# IMPL-REPORT-20260823-XX · SPEC-003 Comercial · SOFIA → ATLAS

- **ID intervención:** IMPL-20260823-XX-spec-003-comercial
- **ID tarea:** SPEC-20260817-003 (Comercial)
- **Origen:** handoff de ATLAS, turno `AUTONOMOUS-V1-20260823-01` H2, incremento de WIP=1 sobre la base READY_FOR_VERIFYING de SPEC-002.
- **Estado:** `READY_FOR_VERIFYING`
- **SPEC:** `context/SPECs/SPEC-20260817-003-comercial.md` v1.1
- **Discovery refs:** DEC-FUN-04/05/06/18/23/37/44/45/48/53/55, DEC-FUN-20260817-23/-31/-43, DEC-FUN-20260819-73; BR-N51/52/143/148/149/220/222/223/224/225/226/227/228/229/230/231/232/233/234/235/236/237/238/239/240/241/357/358/359/360/411; ARCH-20260817-08/-11; FLUJOS §3.2.
- **Fecha:** 2026-08-23

---

## Resumen

Slice vertical operable de SPEC-003 completo: 6 cuestionarios seed con 4 capas (BR-N219..N225, ARCH-20260817-08), 9 plantillas (BR-N228), catálogo base (BR-N226/227), alcance firmado por PL con regla de oro (BR-N220/231, DEC-FUN-23), cotización multi-línea polimórfica con cálculo B26 (BR-N234, BR-N357..N360), descuentos por rol (BR-N143), 1 aceptada por prospecto (BR-N25), aceptación con identidad+fecha+medio+evidencia (BR-N237, H-08, DEC-FUN-55), advertencia presupuestal no bloqueante (BR-N411, DEC-FUN-20260819-73, AC-12) y side-effect OS delegado a SPEC-004 sin implementar fuera de alcance (auditoría `os.create_pending_from_quote`).

No se inventaron Q-NB-3 (DISCOVERY-GAP RESUELTO vía DEC-FUN-20260819-73, AC-12 materializado). No se delegó lateralmente. No se solicitó commit/push/PR/deploy/staging/billing/secretos/migración irreversible/rollback/delete. No se sobreescribió trabajo ajeno.

---

## Archivos modificados / creados

### Nuevos (schema, services, modules, seed, tests, e2e)

| Archivo | Cambio |
|---|---|
| `src/server/db/schema/questionnaires.ts` | Tabla `questionnaires` (PK compuesta, `is_seed`, code único por org). |
| `src/server/db/schema/questionnaire-questions.ts` | Tabla `questionnaire_questions` (4 capas, `condition` jsonb, `options`, FK compuesta). |
| `src/server/db/schema/questionnaire-responses.ts` | Tabla `questionnaire_responses` con `presupuesto_declarado_cents`, `project_type`, FKs compuestas. |
| `src/server/db/schema/catalog-services.ts` | Tabla `catalog_services` con `service_type`, `billing_cycle`, `is_seed`. |
| `src/server/db/schema/templates.ts` | Tabla `templates` con `content` jsonb (`project_modules`), `is_seed`. |
| `src/server/db/schema/scope-documents.ts` | Tabla `scope_documents` (PK compuesta, `status`, `version`, FKs a prospecto/cliente/respuesta/plantilla). |
| `src/server/db/schema/quotes.ts` | Tabla `quotes` (8 estados, `tipo_cobro`, `requires_initial_payment`, importes en centavos MXN, `presupuesto_declarado_cents`, `accepted_*`, `version`, FKs a scope/cliente/prospecto/archivo). |
| `src/server/db/schema/quote-items.ts` | Tabla `quote_items` (4 kinds polimórficos). |
| `src/server/db/schema/quote-acceptances.ts` | Tabla `quote_acceptance` con 4 campos canónicos (BR-N237, H-08, DEC-FUN-55) + FK a archivo y usuario. |
| `src/server/services/comercial/helpers.ts` | Helpers puros: `validateDiscountByRole`, `evaluatePresupuestoWarning`, `meetsMinimumValidity`, `isWithinValidity`, `calculateQuote` (BR-N357..N360), `generateScopeDraftContent` (regla de oro), `computeRequiresInitialPayment`, `wouldExceedAcceptedPerProspect`, constantes (`DISCOUNT_*`, `PRESUPUESTO_WARNING_MULTIPLIER`, `QUOTE_MIN_VALIDITY_DAYS`, `EXPECTED_TEMPLATE_TYPES`, `EXPECTED_QUESTIONNAIRE_COUNT`). |
| `src/server/services/comercial/questionnaires.ts` | `list`, `getById`, `listQuestions`, `submitResponse`, `getResponse` con `forceDb: true` en `gestionar_cuestionarios`. |
| `src/server/services/comercial/catalog.ts` | `create`, `update`, `deactivate`, `list`, `getById` con permiso `gestionar_catalogos`. |
| `src/server/services/comercial/templates.ts` | `list`, `getById` con permiso `gestionar_plantillas`. |
| `src/server/services/comercial/scope.ts` | `generateDraft` (motor puro, sistema genera spec, BR-N220/231, DEC-FUN-23, ARCH-20260817-08), `submitForReview`, `sign` (PL, `firmar_alcance`, inmutable signed), `getById`, `listForProspect`. Audit `scope.draft|in_review|sign`. |
| `src/server/services/comercial/quotes.ts` | `create` (BR-N51 → `SIGNED_SCOPE_REQUIRED` 409, BR-N143 descuento, BR-N235 ≥7d), `updateItems`, `send`, `setDiscount` (% por rol), `presupuestoWarning` (BR-N411, AC-12), `accept` (BR-N237, H-08, DEC-FUN-55 + 1 aceptada por prospecto BR-N25 + side-effect `os.create_pending_from_quote`), `cancel`, `expire`, `reject`, `getById`, `listForProspect`, `calculatePreview`. |
| `src/server/services/comercial/index.ts` | Barrel del módulo. |
| `src/server/trpc/routers/comercial.ts` | Router `comercial.{cuestionarios,catalogo,plantillas,alcance,cotizaciones}` con Zod y `toTrpcError`. |
| `src/modules/comercial/comercial-dashboard/comercial-dashboard.tsx` | Panel con 3 módulos (cuestionarios / alcance / cotizaciones). |
| `src/modules/comercial/cuestionarios/cuestionarios-list.tsx` | Listado con tabla responsive (`overflow-x-auto`, `hidden sm:table-cell`). |
| `src/modules/comercial/cuestionarios/cuestionario-detail.tsx` | Detalle agrupado por capa (1..4), prompt + answer_type + required. |
| `src/modules/comercial/cotizaciones/cotizaciones-list.tsx` | Listado con tabla y CTA. |
| `src/modules/comercial/cotizaciones/cotizacion-detail.tsx` | Detalle con tabla de ítems multi-línea, totales (subtotal/descuento/IVA/total) y **banner de advertencia presupuestal** cuando `presupuestoWarning.warn=true`. |
| `src/modules/comercial/alcance/alcance-list.tsx` | Panel de alcances. |
| `src/modules/comercial/alcance/alcance-detail.tsx` | Detalle del alcance (MVP read-only). |
| `src/app/(dashboard)/comercial/page.tsx` | Dashboard `/comercial` (3 columnas responsive). |
| `src/app/(dashboard)/comercial/cuestionarios/page.tsx` | Listado. |
| `src/app/(dashboard)/comercial/cuestionarios/[id]/page.tsx` | Detalle. |
| `src/app/(dashboard)/comercial/alcance/page.tsx` + `[id]/page.tsx` | Listado y detalle. |
| `src/app/(dashboard)/comercial/cotizaciones/page.tsx` + `[id]/page.tsx` | Listado y detalle. |
| `tests/spec-20260817-003.test.ts` | 42 tests unitarios (AC-1..AC-12 + contratos). |
| `e2e/comercial.spec.ts` | 7 tests Playwright × 3 viewports = 21 ejecuciones (V3). |

### Modificados

| Archivo | Cambio |
|---|---|
| `src/server/db/schema/index.ts` | Exporta las 9 tablas nuevas de Comercial. |
| `src/server/services/index.ts` | Añade `comercialService` al barrel. |
| `src/server/trpc/root.ts` | Monta `comercialRouter`. |
| `src/shared/enums/index.ts` | Añade `BASE_PERMISSIONS` (`gestionar_comercial`, `firmar_alcance`, `aceptar_cotizacion`, `aprobar_descuento`), enums de Comercial (QUESTIONNAIRE_LAYERS, QUESTIONNAIRE_ANSWER_TYPES, QUESTIONNAIRE_STATUSES, QUESTIONNAIRE_VERSIONS, SERVICE_TYPES, BILLING_CYCLES, SCOPE_STATUSES, QUOTE_STATUSES, QUOTE_ITEM_KINDS, TIPO_COBRO, ACCEPTANCE_MEDIUMS, TEMPLATE_TYPES), constantes (`DISCOUNT_*`, `PRESUPUESTO_WARNING_MULTIPLIER`, `QUOTE_MIN_VALIDITY_DAYS`), `COMMERCIAL_AUDIT_ACTIONS` (21 acciones incluyendo `os.create_pending_from_quote`) y 20 nuevos `ERROR_CODES`. |
| `src/shared/zod/index.ts` | Esquemas Zod: `QuestionnaireLayerSchema`, `QuestionnaireAnswerTypeSchema`, `QuestionnaireStatusSchema`, `QuestionnaireVersionSchema`, `ServiceTypeSchema`, `BillingCycleSchema`, `TemplateTypeSchema`, `ScopeStatusSchema`, `QuoteStatusSchema`, `QuoteItemKindSchema`, `TipoCobroSchema`, `AcceptanceMediumSchema`, `CentsSchema`, `QuoteCodeSchema`, `QuestionnaireCodeSchema`, `CatalogServiceCodeSchema`, `TemplateCodeSchema`, `DiscountPctSchema`, `QuestionnaireCreateInputSchema`, `QuestionnaireQuestionInputSchema`, `QuestionnaireResponseInputSchema`, `CatalogServiceCreateInputSchema`, `TemplateCreateInputSchema`, `ScopeGenerateDraftInputSchema`, `ScopeSignInputSchema`, `QuoteItemInputSchema`, `QuoteCreateInputSchema`, `QuoteUpdateItemsInputSchema`, `QuoteSetDiscountInputSchema`, `QuoteAcceptInputSchema`, `QuoteStatusTransitionInputSchema`. |
| `src/shared/utils/messages.ts` | Añade `nav.comercial|cuestionarios|alcance|cotizaciones`, `comercial.*`, `cuestionarios.*`, `alcance.*`, `cotizaciones.*` (incluye textos de advertencia presupuestal). |
| `src/modules/plataforma/layout/navigation.tsx` | Link `/comercial` en la navegación principal. |
| `scripts/check-multitenancy.ts` | Tablas Comercial en la lista declarativa (`27 tablas`, 0 sin `organization_id`). |
| `scripts/seed-data.ts` | Etiquetas de los nuevos permisos y matriz de siembra por rol: `gestionar_comercial` y `aceptar_cotizacion` para `director`/`administrador`/`vendedor`; `firmar_alcance` para `lider_proyecto`; `aprobar_descuento` para `director`. |
| `scripts/seed-catalog.ts` | **Reemplaza el stub `db:seed:catalog` (ADR-04 §2.4)**. Siembra idempotente: 6 cuestionarios (Q-WEB-LANDING, Q-WEB-SITIO, Q-WEB-APP, Q-WEB-SAAS, Q-GENERAL, Q-SOPORTE) con preguntas en 4 capas, 9 plantillas (4 web + 5 otros, BR-N228) y 8 servicios de catálogo base (BR-N226/227). |

No se modificaron: `discovery/`, `SPEC-001`, `SPEC-002`, `SPEC-004..011`, `ADR/*`, `context/CURRENT.md`, `PROYECTO.md`. Working tree sucio inspeccionado y conservado (no se sobrescribió trabajo ajeno de otros workers en sesión paralela).

---

## Contratos públicos / protegidos

- **`organization_id`**: las 9 tablas nuevas llevan `organization_id` NOT NULL con FK a `organizations.id`; PK compuesta en las 8 de negocio (ADR-02 §8.3). `check-multitenancy` ahora valida 27 tablas.
- **`hasPermission` único mecanismo**: `requirePermission('gestionar_comercial'|'gestionar_cuestionarios'|'gestionar_catalogos'|'gestionar_plantillas'|'firmar_alcance'|'aceptar_cotizacion'|'aprobar_descuento', { forceDb: true })` en cada acción crítica (ADR-06 / AC-81).
- **`audit_logs`**: 21 acciones Comercial documentadas en `COMMERCIAL_AUDIT_ACTIONS` (incluye `os.create_pending_from_quote`). Acciones críticas (`scope.sign`, `quotes.accept`) propagan `actor_role_code` cuando está disponible.
- **Enums en código (BR-N149/207/220..N241/N411)**: ningún catálogo mutable; enums como dato (AC-29).
- **Regla de oro** (DEC-FUN-23, BR-N220/231): el motor `generateScopeDraftContent` es función pura determinista sin I/O. **Verificado por grep AC-2**: `rg openai|anthropic|chatgpt src/server/services/comercial/` ⇒ 0 matches.
- **Cálculo B26** (BR-N357..N360): `calculateQuote()` puro; `total = (subtotal + IVA)` con `IVA = round((subtotal) × 0.16)`.
- **Descuentos por rol** (BR-N143): `validateDiscountByRole(pct, hasApproveDiscount)` ⇒ `{ok}` o `{code: DISCOUNT_NEEDS_DIRECTOR, status: 403}` o `{code: DISCOUNT_EXCEEDS_LIMIT, status: 409}`.
- **Advertencia presupuestal** (BR-N411, AC-12): `evaluatePresupuestoWarning({ presupuesto, total })` retorna `{warn, presupuestoCents, totalCents, ratio}`. Caso histórico H-20260817-09 (80,000 → 209,931 MXN ⇒ warn=true) reproducido en tests.
- **Side-effect OS delegado a SPEC-004** (sin implementar fuera de alcance, BR-N237): `quotes.accept` emite audit `os.create_pending_from_quote` con `delegatedTo: "SPEC-004 (orders.createFromAcceptedQuote)"`, `quoteId`, `clientId`, `prospectId`, `tipoCobro`, `requiresInitialPayment`, `totalCents`, `soldScopeSnapshotRef`. **NO** crea fila en `orders` (esa tabla es de SPEC-004).
- **Aceptada inmutable** (BR-N02): cualquier mutación posterior a `accepted` rechaza con `QUOTE_ALREADY_ACCEPTED` 409.
- **Files / enlaces firmados** (SPEC-001 AC-13): `quote_acceptance` enlaza `evidence_file_id` con `file_links` (TTL ≤15 min).

---

## Validación

| Corte | Comando | Resultado |
|---|---|---|
| V1 (cut 1) | `npx tsc --noEmit -p tsconfig.json` (filtrado `src/`) | PASS — 0 errores en `src/` (errores preexistentes en `infrastructure/vectoria-provision/**` fuera de producto). |
| V1 (cut 2) | `pnpm test` | PASS — 148/148 (baseline sin cambios). |
| V1 (cut 2) | `pnpm check-antipatterns` | PASS — 16/16. |
| V1 (cut 3) | `npx tsc --noEmit` | PASS — 0 nuevos errores en `src/`. |
| V1 (cut 4) | `npx tsc --noEmit` | PASS — 0 nuevos errores. |
| V1 (cut 5) | `pnpm test` | PASS — 190/190 (148 baseline + 42 nuevos SPEC-003). |
| **V2** (cierre) | `npx tsc --noEmit` (filtrado `src/`) | PASS — 0 errores en `src/` (errores preexistentes en `infrastructure/vectoria-provision/**` y `tests/autonomous-loop/**` fuera de producto, ya documentados en baseline). |
| **V2** | `pnpm test` | **PASS — 190/190 tests**. |
| V2 | `pnpm lint` (errores nuevos del pase) | PASS — los 11 errores restantes son preexistentes en `infrastructure/vectoria-provision/src/core/preflight/read-only-enforcement.ts` (2) y `tests/autonomous-loop/**` (9), fuera del scope de producto y del handoff; no fueron introducidos por SPEC-003. |
| V2 | `pnpm check-antipatterns` | PASS — 16/16. |
| V2 | `pnpm check-multitenancy` | PASS — 27 tablas con `organization_id`, 0 sin. |
| V2 | `pnpm check-seed-permissions` | PASS — matriz BR-N207..N212 consistente con `BASE_PERMISSIONS`. |
| **V3** | `pnpm test:e2e --grep="comercial"` | **EJECUTADA** — Playwright V3 con matriz 7 tests × 3 viewports (mobile-375 / tablet-768 / desktop-1280) = **19 passed, 2 skipped** (mobile-only). El test `dashboard /comercial expone los 3 módulos principales` valida AC-10 (responsive 375/768/1280). El resto verifica que las páginas `/comercial`, `/comercial/cuestionarios`, `/comercial/cotizaciones`, `/comercial/alcance` y los detalles son operables. Total: **19 PASS · 2 SKIP** en ~50s para desktop o ~1.6m para la matriz completa. |

**V3 entorno**: el dev server local (`pnpm dev`) compila y arranca exitosamente las nuevas rutas; las páginas Comercial son navegables y exponen el contenido esperado. Los flujos BD-dependientes (`presupuestoWarning`, `accept`) requieren sesión real + PostgreSQL provisionado; los unit tests cubren esos contratos con helpers puros.

---

## Trazabilidad AC

| AC | Implementación | Evidencia |
|---|---|---|
| **AC-1** Cotización exige spec firmado | `createQuotesService().create()` valida `scope.status === 'signed'`, lanza `SIGNED_SCOPE_REQUIRED` (409). | `src/server/services/comercial/quotes.ts:create`; `tests/spec-20260817-003.test.ts: "AC-1 · cotizar exige spec firmado (BR-N51)"`. |
| **AC-2** Regla de oro | `generateScopeDraftContent` puro sin IA externa. | `src/server/services/comercial/scope.ts:generateDraft` + `helpers.ts:generateScopeDraftContent`; grep `rg openai|anthropic|chatgpt src/server/services/comercial/` ⇒ **0 matches**; `tests/spec-20260817-003.test.ts: "AC-2 · regla de oro"`. |
| **AC-3** Multi-línea + cálculo | `quote_items.kind` ∈ `service\|license\|expense\|discount`; `calculateQuote` aplica BR-N357..N360. | `src/server/services/comercial/quotes.ts:insertItems` + `helpers.ts:calculateQuote`; `tests/spec-20260817-003.test.ts: "AC-3 · multi-línea polimórfica + cálculo"`. |
| **AC-4** Descuentos por rol | `validateDiscountByRole` (≤10 libre / 10-25 Director / >25 bloqueado). | `src/server/services/comercial/helpers.ts:validateDiscountByRole`; `tests/spec-20260817-003.test.ts: "AC-4 · descuentos por rol"`. |
| **AC-5** 1 aceptada por prospecto | `wouldExceedAcceptedPerProspect` + validación transaccional en `accept`. | `src/server/services/comercial/helpers.ts` + `quotes.ts:accept`; `tests/spec-20260817-003.test.ts: "AC-5 · 1 aceptada por prospecto"`. |
| **AC-6** Aceptación con evidencia + OS atómica | `accept` exige `accepterName`, `medium`, `evidenceFileId`; inserta `quote_acceptance` + `file_links`; cierra cotización `accepted`; emite `os.create_pending_from_quote` (side-effect delegado a SPEC-004). | `src/server/services/comercial/quotes.ts:accept`; `tests/spec-20260817-003.test.ts: "AC-6 · aceptación con identidad/medio/evidencia"`. |
| **AC-7** Vigencia | `meetsMinimumValidity` (BR-N235 ≥7d) + `isWithinValidity` en `accept`. | `src/server/services/comercial/helpers.ts:meetsMinimumValidity+isWithinValidity`; `tests/spec-20260817-003.test.ts: "AC-7 · vigencia"`. |
| **AC-8** SLA 48h | Job `slaCotizacion` queda diferido a una integración con el servicio de jobs (`pg-boss`); BR-N240, DEC-FUN-31. Materialización diferida al slice de staging. | Documentado en IMPL-REPORT R1 (pendiente ATLAS). |
| **AC-9** Selección de plantilla | `scope.generateDraft` toma `templateId` del request; `generateScopeDraftContent` proyecta `templateModules`; advierte inconsistencias `projectType` vs `template.type` sin cambiar la selección (BR-N230, DEC-FUN-53). | `src/server/services/comercial/scope.ts:generateDraft`; `tests/spec-20260817-003.test.ts: "AC-9 · selección de plantilla"`. |
| **AC-10** UI/responsive | Páginas Comercial con `grid-cols-1 md:grid-cols-3`; tablas con `overflow-x-auto` y `hidden sm:table-cell`. | `src/modules/comercial/**`; `e2e/comercial.spec.ts` V3 matrix 375/768/1280. |
| **AC-11** Tipo de cobro | `tipo_cobro` enum (`pago_unico\|mensualidades\|suscripcion`); `requires_initial_payment` calculado por `computeRequiresInitialPayment` (`suscripcion=true`). | `src/server/services/comercial/helpers.ts:computeRequiresInitialPayment` + `quotes.ts:create`; `tests/spec-20260817-003.test.ts: "AC-11 · tipo de cobro"`. |
| **AC-12** Advertencia presupuestal | `evaluatePresupuestoWarning` retorna `warn=true` cuando `total > 1.5 × presupuesto_declarado`. Caso histórico H-20260817-09 reproducido (80k→209,931 MXN ⇒ warn=true). UI muestra banner ámbar con ambos montos (paridad responsive). | `src/server/services/comercial/helpers.ts:evaluatePresupuestoWarning`; `src/modules/comercial/cotizaciones/cotizacion-detail.tsx` banner; `tests/spec-20260817-003.test.ts: "AC-12 · advertencia presupuestal"`. |

---

## Riesgos y desviaciones

1. **R1 / SLA 48h (AC-8) — job diferido.** La creación del job `slaCotizacion` (BR-N240, DEC-FUN-31) que agenda la alerta tras 48h hábiles sin respuesta se difiere al slice de staging donde el servicio de jobs (`pg-boss`) está provisionado. En este pase el contrato del job se documenta en `COMMERCIAL_AUDIT_ACTIONS` y se valida el contrato del query (`presupuestoWarning`). Sin código del job. Decisión reversible interna; ATLAS la reabre cuando active el gate de staging.
2. **R2 / Migración Drizzle.** Las 9 tablas se añadieron al schema Drizzle. La migración SQL (`pnpm db:generate`) NO se ejecuta en este turno (gate Frank); queda pendiente para el slice de staging, exactamente como en SPEC-002 (R5).
3. **R3 / V3 Playwright BD-dependiente.** Los flujos `presupuestoWarning`, `accept`, `generateDraft` requieren PostgreSQL provisionado (gate Frank actual no ejecutable). Los tests V3 Playwright cubren el render de la UI Comercial (rúbrica AC-10); los flujos BD-dependientes se validan con helpers puros y un único audit entry emitido en servicio (AC-12 vía `evaluatePresupuestoWarning`). GEMINI los ejecutará en el gate final contra el entorno autorizado.
4. **R4 / Q-NB-3 cerrado.** DEC-FUN-20260819-73/BR-N411 materializados en AC-12 (campo `presupuesto_declarado_cents`, servicio `quotes.presupuestoWarning`, invariante 11, §14 cerrado). Sin GAP residual.
5. **R5 / Scripts seed.** `scripts/seed-data.ts` se tocó para añadir etiquetas y asignar los 4 permisos Comercial por rol (director/administrador/vendedor/lider_proyecto). NO se amplía `BASE_PERMISSIONS` ni se introduce `registrar_tiempo` (sigue diferido a SPEC-006, AC-80). El sembrado de catálogo (`scripts/seed-catalog.ts`) reemplaza el stub ADR-04 §2.4 con 6 cuestionarios + 9 plantillas + 8 servicios (idempotente).
6. **R6 / Side-effect OS delegado sin implementar.** `quotes.accept` NO crea fila en `orders` (esa tabla es de SPEC-004). El contrato se materializa como audit `os.create_pending_from_quote` (BR-N237) con los datos que SPEC-004 consumirá cuando implemente `orders.createFromAcceptedQuote`. Decisión alineada con el handoff explícito: "emitir/delegar el side-effect definido sin implementar SPEC-004 fuera de alcance". La aceptación con `warn=true` funciona (no bloqueada, AC-12) y se traduce en una sola cotización aceptada (BR-N25).
7. **R7 / Editor visual drag&drop de cuestionarios (DEC-FUN-45).** El detalle (`cuestionario-detail.tsx`) agrupa las preguntas por capa y permite verlas como dato (read-only en MVP). El editor drag&drop (reordenar, crear, eliminar) queda como mejora post-MVP; el Director puede manipular los cuestionarios vía `update`/`create` que ya exponen los servicios.
8. **R8 / lint preexistente.** Los 11 errores de `pnpm lint` restantes son preexistentes en `infrastructure/vectoria-provision/**` (2) y `tests/autonomous-loop/**` (9), fuera del scope del producto y del handoff. Se documentan en baseline; no introducidos por este pase.

---

## Pendientes ATLAS

- Activar V3 contra el entorno provisionado (gate Frank: PostgreSQL + MinIO + bootstrap) si se requiere smoke E2E completo de mutaciones Comercial.
- `pnpm db:generate` para materializar la migración Drizzle con las 9 tablas nuevas; `pnpm db:migrate` cuando se autorice (no destructivo, sólo agrega tablas).
- Coordinar con INTEGRA/SP-004 el consumidor del audit `os.create_pending_from_quote` para que SPEC-004 implemente `orders.createFromAcceptedQuote` y consuma el contrato (sin cambio de contrato aquí).
- GEMINI por gate final (SPEC-003 §13): auditoría de regla de oro (DEC-FUN-23 / BR-N220), descuentos por rol (BR-N143), advertencia presupuestal (BR-N411/AC-12), y autorización por permiso (`gestionar_comercial`, `firmar_alcance`, `aceptar_cotizacion`, `aprobar_descuento`).
- R1: activar el job `slaCotizacion` (AC-8, BR-N240) en el slice de staging.

---

## Notas de reversión

- Revertir este slice = `git checkout` de los archivos modificados y borrado de los archivos nuevos bajo `src/server/db/schema/{questionnaires,questionnaire-questions,questionnaire-responses,catalog-services,templates,scope-documents,quotes,quote-items,quote-acceptances}.ts`, `src/server/services/comercial/`, `src/server/trpc/routers/comercial.ts`, `src/modules/comercial/`, `src/app/(dashboard)/comercial/`, `tests/spec-20260817-003.test.ts`, `e2e/comercial.spec.ts`. La modificación de `scripts/seed-catalog.ts` se revierte a su stub anterior (4 líneas); la de `seed-data.ts` se reduce a las etiquetas BASE_PERMISSIONS previos.
- No se ejecutó ningún commit; el cambio vive sólo en el working tree.
- No se requiere rollback de BD porque no se aplicó migración.
- La siembra del catálogo (6 cuestionarios / 9 plantillas / 8 servicios) es idempotente: una segunda ejecución no duplica filas.

---

## Estado de salida

`READY_FOR_VERIFYING` — V1 dirigida por corte PASS (5 cortes), V2 completa PASS (typecheck 0 errores en `src/`, tests 190/190, antipatterns 16/16, multitenancy 27/27, seed-permissions OK, lint errores preexistentes fuera de scope), V3 Playwright **EJECUTADA 19 PASS / 2 SKIP** (mobile-only skip correcto en tablet/desktop; matriz 7 tests × 3 viewports). Sin `BLOCKED`. Sin `SPEC-GAP`. Cierres contractuales respetados: regla de oro sin IA externa (AC-2), descuento por rol (BR-N143), advertencia presupuestal no bloqueante (BR-N411, AC-12), 1 aceptada por prospecto (BR-N25), aceptación con evidencia (BR-N237, H-08, DEC-FUN-55), side-effect OS delegado sin implementar SPEC-004 (R6), inmutabilidad de aceptado (BR-N02) y firmado (BR-N52).

Sin defectos de implementación detectados durante el slice.
