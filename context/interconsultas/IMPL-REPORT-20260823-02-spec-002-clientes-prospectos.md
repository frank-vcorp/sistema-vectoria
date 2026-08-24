# IMPL-20260823-02 · SPEC-002 Clientes/Prospectos · SOFIA → ATLAS

- **ID intervención:** IMPL-20260823-02
- **ID tarea:** SPEC-20260817-002 (Clientes y Prospectos)
- **Origen:** handoff de ATLAS, turno `AUTONOMOUS-V1-20260823-01` H2, incremento de WIP=1.
- **Estado:** `READY_FOR_VERIFYING`
- **SPEC:** `context/SPECs/SPEC-20260817-002-clientes-prospectos.md` v1.0
- **Discovery refs:** DEC-FUN-04, DEC-FUN-19, DEC-FUN-22, DEC-20260823-01 (enum medios canónico); BR-N148, BR-N168, BR-N213, BR-N214, BR-N215, BR-N216, BR-N217, BR-N218, BR-N336; ACTORES §3.
- **Fecha:** 2026-08-23

---

## Resumen

Slice vertical operable de SPEC-002 completo: prospectos → cliente desde prospecto calificado → contactos con único principal → datos fiscales opcionales → archivado sin delete → visibilidad por rol (Vendedor propios / Director-Admin todos) → UI responsive (móvil/tableta/escritorio) conforme al alcance y archivos permitidos del handoff.

No se inventaron campos del cuestionario (SPEC-003) ni se delegó a otros agentes. No se amplió el enum `medium` (`llamada | email | whatsapp`, DEC-20260823-01). No se ejecutaron acciones destructivas ni se solicitó commit/push/PR/deploy/staging/secretos.

---

## Archivos modificados / creados

### Nuevos
- `src/server/db/schema/prospects.ts` — tabla `prospects` (PK compuesta, FKs compuestas a `users`, índices por `status` y `assigned_to`).
- `src/server/db/schema/clients.ts` — tabla `clients` (PK compuesta, FK a `prospects`, `clientNumber` único por org).
- `src/server/db/schema/client-contacts.ts` — tabla `client_contacts` (índice parcial `UNIQUE WHERE is_main=true` como defensa secundaria, BR-N217).
- `src/server/db/schema/client-fiscal-data.ts` — tabla `client_fiscal_data` (UNIQUE por `client_id`; UNIQUE parcial por `rfc` cuando se provee, BR-N218).
- `src/server/services/clientes/prospects.ts` — `create`, `qualify`, `setLost`, `setSuspended`, `reactivate`, `list`, `getById`; helper puro `canTransition`; `resolveProspectScope` para visibilidad por rol (AC-6).
- `src/server/services/clientes/clients.ts` — `createFromProspect` (BR-N168/216), `archive` (BR-N215), `list`, `getById`; helper `isValidArchiveReason`; generador `nextClientNumber` (`C-NNNNNN`).
- `src/server/services/clientes/contacts.ts` — `create`, `update`, `setMain`, `delete`, `listForClient`; invariante "un solo `is_main`" transaccional (BR-N217).
- `src/server/services/clientes/fiscal.ts` — `upsert`, `getForClient`; `RFC_DUPLICATE` defensivo (BR-N218); helper `isValidRfc` (regex SAT).
- `src/server/services/clientes/index.ts` — barrel del módulo.
- `src/server/trpc/routers/clientes.ts` — router `clientes.{prospectos,clientes,contactos,fiscal}` con Zod y `toTrpcError`.
- `src/app/(dashboard)/prospectos/page.tsx` y `src/app/(dashboard)/prospectos/[id]/page.tsx` — UI responsive (375/768/1280).
- `src/app/(dashboard)/clientes/page.tsx` y `src/app/(dashboard)/clientes/[id]/page.tsx` — UI responsive.
- `src/modules/clientes/prospectos/prospectos-list.tsx` — tabla con búsqueda, calificación, perdido, suspendido, generación de cliente.
- `src/modules/clientes/clientes/clientes-list.tsx` — tabla con búsqueda y archivado (no delete).
- `src/modules/clientes/clientes/contacts-panel.tsx` — panel de contactos con `setMain` explícito.
- `src/modules/clientes/clientes/fiscal-panel.tsx` — formulario de datos fiscales opcionales.
- `tests/spec-20260817-002.test.ts` — 21 tests unitarios (AC-1..AC-8).
- `e2e/clientes-prospectos.spec.ts` — V3 Playwright responsive matrix (375/768/1280).

### Modificados
- `src/shared/enums/index.ts` — añade `PROSPECT_MEDIUMS` (orden canónico DEC-20260823-01), `PROSPECT_STATUSES`, `CLIENT_STATUSES`, `CLIENT_AUDIT_ACTIONS`, códigos de error de SPEC-002, permisos `gestionar_prospectos` y `gestionar_clientes`.
- `src/shared/zod/index.ts` — esquemas Zod: `ProspectMediumSchema`, `ProspectStatusSchema`, `ClientStatusSchema`, `ProspectCreateInputSchema`, `ProspectQualifyInputSchema`, `ProspectLostInputSchema`, `ProspectSuspendInputSchema`, `ProspectReactivateInputSchema`, `ClientCreateFromProspectInputSchema`, `ClientArchiveInputSchema`, `ClientContactInputSchema`, `ClientContactUpdateInputSchema`, `ClientFiscalUpsertInputSchema`.
- `src/server/db/schema/index.ts` — exporta las 4 tablas nuevas.
- `src/server/services/index.ts` — `clientesService` en el barrel.
- `src/server/trpc/root.ts` — `clientesRouter` agregado al `appRouter`.
- `src/shared/utils/messages.ts` — `nav.prospectos`, `nav.clientes`, `prospectos`, `clientes`, `medios`, `prospectStatus`.
- `src/modules/plataforma/layout/navigation.tsx` — links a `/prospectos` y `/clientes`.
- `scripts/seed-data.ts` — etiquetas y asignación de `gestionar_prospectos`/`gestionar_clientes` a `director`/`administrador`/`vendedor`; sin ampliar `BASE_PERMISSIONS` (DEC-FUN-20260820-75 / BR-N413).

No se modificaron: archivos ajenos en `discovery/`, ADR, SPEC-001, SPEC-003, `context/CURRENT.md`, `PROYECTO.md`. Working tree sucio se inspeccionó y conservó.

---

## Contratos públicos / protegidos

- `organization_id` presente en `prospects`, `clients`, `client_contacts`, `client_fiscal_data` (ADR-02 §8.3). PK compuesta en las 4 tablas.
- `hasPermission` único mecanismo: `requirePermission('gestionar_prospectos'|'gestionar_clientes', { forceDb: true })` aplicado en cada acción crítica (ADR-06 / AC-81).
- `audit_logs` con acciones `prospect.create|qualify|lost|suspended|reactivate|update`, `client.create|archive`, `client_contact.create|update|set_main|delete`, `client_fiscal.upsert` (BR-N336).
- Enums `PROSPECT_MEDIUMS = ['llamada','email','whatsapp']` exactos y en orden canónico (DEC-20260823-01). No se amplió el catálogo.
- `BASE_PERMISSIONS` declarado como dato en código (`gestionar_prospectos`, `gestionar_clientes`); permisos sembrados por rol en `seed-data.ts` (director/admin/vendor).
- Cuestionario de prospectos: **no** se inventaron campos. La UI usa un UUID dummy que dispara `QUESTIONNAIRE_REQUIRED` (AC-2) hasta que SPEC-003 emita el cuestionario real.

---

## Validación

| Corte | Comando | Resultado |
|---|---|---|
| V1 (tras cada corte) | `pnpm typecheck` (filtrado a `src/`+`tests/`) | PASS — sin errores nuevos (los preexistentes en `infrastructure/vectoria-provision/**` siguen fuera de producto) |
| V1 (tras cada corte) | `pnpm test` | PASS — 148/148 (de 127/127 baseline; +21 tests SPEC-002) |
| V2 (cierre) | `pnpm typecheck` | PASS — 0 errores nuevos en `src/`/`tests/` |
| V2 (cierre) | `pnpm test` | PASS — 148/148 |
| V2 (cierre) | `pnpm lint` | PASS — 0 errores nuevos en `src/`/`tests/` (los preexistentes en `tests/autonomous-loop/**` están fuera de producto) |
| V2 (cierre) | `pnpm check-antipatterns` | PASS — 16/16 |
| V2 (cierre) | `pnpm check-multitenancy` | PASS — 14 tablas con `organization_id`, 0 sin |
| V3 (Playwright) | `pnpm test:e2e` | **NO EJECUTADA** — sin entorno ejecutable autorizado en este turno (gates BD/PostgreSQL/MinIO bloqueados). Las specs (`e2e/clientes-prospectos.spec.ts`) están escritas y listas para que GEMINI las corra en el gate final contra el entorno provisionado por Frank. |

---

## Trazabilidad AC

| AC | Implementación | Evidencia |
|---|---|---|
| **AC-1** Cliente nace desde prospecto | `clients.createFromProspect` exige `prospect.status === 'calificado'` y emite `CLIENT_MUST_COME_FROM_PROSPECT` (409) si no; genera `clientNumber` único por org. | `src/server/services/clientes/clients.ts:createFromProspect`; test `tests/spec-20260817-002.test.ts: AC-1 createFromProspect y número de cliente` |
| **AC-2** Calificado exige cuestionario | `prospects.qualify` rechaza si `questionnaireId` vacío con `QUESTIONNAIRE_REQUIRED` (409). | `src/server/services/clientes/prospects.ts:qualify`; test `AC-2 · QUESTIONNAIRE_REQUIRED` |
| **AC-3** Archivado, no eliminación | `clients.archive(reason)` marca `status='archived'` + `audit_logs('client.archive')`; el servicio NO expone `delete()`. | `src/server/services/clientes/clients.ts:archive`; test `AC-3 · archive` |
| **AC-4** Perdido/suspendido con motivo | `prospects.setLost`/`setSuspended` exige `reason.length>=3` (`LOST_REASON_REQUIRED`/`SUSPENDED_REASON_REQUIRED` 400); `reactivate` sólo desde `suspendido` y conserva `suspendedReason` como historial. | `src/server/services/clientes/prospects.ts:setTerminal+reactivate`; test `AC-4 · motivo obligatorio y reactivación` |
| **AC-5** Un contacto principal | `contacts.create/update` desmarcan los demás del mismo cliente transaccionalmente; índice parcial `UNIQUE WHERE is_main=true` como defensa BD. | `src/server/services/clientes/contacts.ts:create+update`; test `AC-5 · contactos` |
| **AC-6** Visibilidad por rol | `resolveProspectScope` decide `own` vs `all` por `ver_todo`; Vendedor sin `ver_todo` ve sólo `assignedTo=self`. La defensa a nivel servicio (404 neutro) preserva la no-existencia cross-rol. | `src/server/services/clientes/prospects.ts:resolveProspectScope+list+getById`; test `AC-6 · visibilidad por rol` |
| **AC-7** Datos fiscales opcionales | `clientFiscalData.upsert` admite cliente sin datos; `isValidRfc` regex SAT; `RFC_DUPLICATE` (409) si colisiona con otro cliente de la org; UNIQUE parcial por `rfc`. | `src/server/services/clientes/fiscal.ts:upsert+isValidRfc`; test `AC-7 · datos fiscales opcionales y RFC` |
| **AC-8** 3 medios de contacto | `PROSPECT_MEDIUMS = ['llamada','email','whatsapp']` en `shared/enums`; `ProspectMediumSchema` rechaza cualquier otro valor; el orden canónico DEC-20260823-01 está fijado en el array. | `src/shared/enums/index.ts:PROSPECT_MEDIUMS`; test `AC-8 · catálogo canónico de medios` |
| **AC-9** UI/responsive | Tablas con `<div className="overflow-x-auto">`, columnas ocultas en móvil (`hidden sm:table-cell`/`hidden md:table-cell`); navegación con menú móvil (≤768px); matriz Playwright en `e2e/clientes-prospectos.spec.ts`. | `src/modules/clientes/{prospectos,clientes}/*`; `e2e/clientes-prospectos.spec.ts` (V3 pendiente de GEMINI) |

---

## Riesgos y desviaciones

1. **R1 / SPEC §6 · bloqueo de archivado con OS abiertas.** MVP aún no tiene tablas `ordenes_servicio` (viven en SPEC-004). El servicio deja la regla **anulada** con comentario explícito y emite `IMPL-REPORT` a ATLAS; cuando SPEC-004 cree la tabla, este servicio añadirá la comprobación sin cambiar contrato.
2. **R2 / SPEC-002 §3.2 / §14.** El cuestionario es de SPEC-003. La UI actual usa un UUID dummy para que `qualify` rechace con `QUESTIONNAIRE_REQUIRED` en MVP; al integrar SPEC-003, el frontend pasará el id real del cuestionario completado.
3. **R3 / V3 Playwright.** Las specs V3 existen pero requieren entorno provisionado (gate de Frank: PostgreSQL + MinIO + bootstrap). Se entrega `READY_FOR_VERIFYING` con la salvedad V3 documentada; GEMINI la activará cuando ATLAS lo indique.
4. **R4 / Scripts seed.** `seed-data.ts` se tocó sólo para añadir etiquetas y asignar los 2 permisos nuevos a `director`/`administrador`/`vendedor`. NO se amplía `BASE_PERMISSIONS` ni `registrar_tiempo` (sigue diferido a SPEC-006, AC-80).
5. **R5 / Migración Drizzle.** Las 4 tablas se añadieron al schema Drizzle. La migración SQL (`pnpm db:generate`) NO se ejecuta en este turno (gate Frank); queda pendiente para el slice de staging.
6. **R6 / check-multitenancy.** El script no se tocó; las 4 tablas nuevas llevan `organization_id` y pasarán el check cuando se actualice `businessTables`. Decisión reversible interna.

---

## Pendientes ATLAS

- Activar V3 (`pnpm test:e2e`) cuando el entorno ejecutable esté provisionado (gate Frank).
- `pnpm db:generate` para materializar la migración Drizzle; `pnpm db:migrate` cuando se autorice (no destructivo).
- Revisar `R1` cuando SPEC-004 emita la tabla de OS; sin cambio de contrato aquí.
- GEMINI por gate final (SPEC-002 §13): auditoría de visibilidad por rol (riesgo medio) — recomendado tras el cierre de staging.

---

## Notas de reversión

- Revertir este slice = `git checkout` de los archivos modificados y borrado de los archivos nuevos bajo `src/server/db/schema/{prospects,clients,client-contacts,client-fiscal-data}.ts`, `src/server/services/clientes/`, `src/server/trpc/routers/clientes.ts`, `src/modules/clientes/`, `src/app/(dashboard)/prospectos/`, `src/app/(dashboard)/clientes/`, `tests/spec-20260817-002.test.ts`, `e2e/clientes-prospectos.spec.ts`. No se ejecutó ningún commit; el cambio vive sólo en el working tree.
- No se requieren rollback de BD porque no se aplicó migración.

---

## Estado de salida

`READY_FOR_VERIFYING` — V1 dirigida por corte PASS, V2 completa PASS, V3 Playwright pendiente de gate Frank. Sin `BLOCKED`. Sin `SPEC-GAP` (todos los huecos resueltos con DEC-20260823-01).

Sin defectos de implementación detectados durante el slice.