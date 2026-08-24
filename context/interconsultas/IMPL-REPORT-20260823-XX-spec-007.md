# IMPL-REPORT-20260823-XX · SPEC-007 Facturación CFDI · SOFIA → ATLAS

- **ID intervención:** IMPL-20260823-XX-spec-007
- **ID tarea:** SPEC-20260817-007 (Facturación CFDI · B18)
- **Origen:** handoff de ATLAS, turno `AUTONOMOUS-V1-20260823-01` H2, incremento WIP=1 sobre la base READY_FOR_VERIFYING de SPEC-002..006.
- **Estado:** `READY_FOR_VERIFYING`
- **SPEC:** `context/SPECs/SPEC-20260817-007-facturacion-cfdi.md` v1.0
- **Discovery refs:** DEC-FUN-08/10/26/38/50/20260818-67; BR-N301..N313/N406; SCN-INV-01..05; FLOW-INV-01; ARCH-20260817-09 (PAC), ARCH-20260817-03 (CSD), ARCH-20260817-07 (jobs).
- **Fecha:** 2026-08-23

---

## Resumen

Slice vertical operable de SPEC-007: `invoices` (CFDI 4.0) + `invoice_schedules` (recurrencia), preview/build/timbrar/cancel con motivo SAT 01-04, markVencida, ZIP mensual/manual sólo facturas activas (no canceladas; DEC-FUN-38/26), `createDraftFromSubscriptionRenewal` consumido por SPEC-011 (BR-N406), aplicaciones compatibles para SPEC-008 (BR-012/308), jobs recurrentes idempotentes vía `job_key` estable (SPEC-001 AC-15), calendario de 7 estados visuales (BR-N312), adaptador PAC FacturoPorTi hexagonal con **mock determinista** (P-007-1 cerrado en `none`: sin credenciales reales este turno) y fail-closed `CSD_NOT_CONFIGURED` / `PAC_API_KEY_MISSING` cuando faltan `.cer`/`.pem` o API key (BR-N302). UI responsive con `overflow-x-auto` + `hidden sm:table-cell`/`md:table-cell`, navegación en panel lateral, 2 pestañas (Facturas/Schedules).

El slice NO inventó credenciales PAC/CSD reales, NO contactó PAC externo, NO implementó cobros/comisiones (SPEC-008), NO implementó cierre administrativo OS (SPEC-004), NO implementó schedule de suscripción (SPEC-011). Sólo emitió el contrato `createDraftFromSubscriptionRenewal` que SPEC-011 consumirá en su incremento, y `applyPayment`/`revertPayment` que SPEC-008 consumirá para `invoiceApplications`. Working tree sucio inspeccionado y conservado.

---

## Archivos modificados / creados

### Nuevos

| Archivo | Cambio |
|---|---|
| `src/server/db/schema/invoices.ts` | Tabla `invoices` (PK `(org,id)`, FKs a `clients`/`orders`/`files`/`users`, UNIQUE `(org,code)` y `(org,cfdi_uuid)` parcial, índice `(org,status)` + `(org,due_date)` + `(org,client_id)` + `(org,order_id)` + `(org,subscription_id)`). |
| `src/server/db/schema/invoice-schedules.ts` | Tabla `invoice_schedules` (PK `(org,id)`, FK a `orders`, índice `(org,status,scheduled_date)`). |
| `src/server/integrations/pac/index.ts` | Adaptador PAC hexagonal `PacClient` con `stamp`/`cancel`, mock determinista que genera UUID v4 + XML/PDF sintéticos, fail-closed `PAC_API_KEY_MISSING` (412) / `CSD_NOT_CONFIGURED` (412) / `INVALID_CANCEL_MOTIVE` (400). `PacTransientError` para 5xx/timeout. |
| `src/server/services/facturacion/helpers.ts` | Helpers puros: `buildCfdiConcept` (subtotal + IVA 16%), `canTransitionInvoice`, `isInvoiceVencida`, `validateInvoiceApplication`, `revertInvoiceApplication`, `isValidCancelMotive`, `validateCancelReason`, `invoiceCalendarVisualStatus`, `validateScheduleInput`, `nextScheduleJobKey`, `isScheduleStatusTerminal`, `selectZipFacturas` (sólo activas), `isValidCfdiUuid`, `buildDraftFromSubscriptionRenewal`. |
| `src/server/services/facturacion/invoices.ts` | `createInvoicesService({crypto, files, jobs, audit, pac})` con `buildFromOrder`, `preview`, `timbrar`, `cancel`, `applyPayment`, `revertPayment`, `markVencida`, `zipContador`, `list`, `byId`, `createDraftFromSubscriptionRenewal`, `createSchedule`, `listSchedules`, `skipSchedule`, `runScheduled` (idempotente vía `job_key`). |
| `src/server/services/facturacion/index.ts` | Barrel que re-exporta servicios, helpers y adaptador PAC. |
| `src/server/trpc/routers/facturacion.ts` | Router tRPC `facturacion` con sub-routers `schedules` + 11 endpoints. Inyección lazy de `files` (load env diferido). |
| `src/app/(dashboard)/facturacion/page.tsx` | Dashboard con 2 pestañas (`Facturas`/`Schedules`), responsive `overflow-x-auto`. |
| `src/modules/facturacion/facturas-list.tsx` | Tabla de facturas con 7 estados visuales, filtro por status, preview/timbrar/cancelar (modales con `aria-modal`), ZIP mensual (modal con año/mes + manual flag). |
| `src/modules/facturacion/schedules-list.tsx` | Tabla de schedules con `pending`/`executed`/`skipped` + acciones `runNow`/`skip`. |
| `tests/spec-20260817-007.test.ts` | **51 tests unitarios puros** (catálogo canónico, AC-1..AC-10). |

### Modificados

| Archivo | Cambio |
|---|---|
| `src/shared/enums/index.ts` | Añade 6 estados `INVOICE_STATUSES` (borrador/emitida/parcialmente_pagada/pagada/vencida/cancelada), 4 motivos `CANCEL_MOTIVES_SAT` (01-04), 3 estados `INVOICE_SCHEDULE_STATUSES`, 2 modos `SCHEDULE_AUTO_OR_DRAFT_KINDS`, 7 estados visuales `INVOICE_CALENDAR_VISUAL_STATUSES`, 11 acciones `INVOICE_AUDIT_ACTIONS` (namespace `factura.*` + `invoice_schedule.*`), 3 permisos nuevos (`gestionar_facturacion`, `ver_facturas`, `timbrar_facturas`), 15 códigos de error nuevos (incluye `CSD_NOT_CONFIGURED`, `PAC_API_KEY_MISSING`, `INVOICE_HAS_APPLICATIONS`, `APPLICATION_EXCEEDS_BALANCE`, `INVALID_CANCEL_MOTIVE`, `INVOICE_FISCAL_DATA_REQUIRED`). |
| `src/shared/zod/index.ts` | Esquemas Zod SPEC-007: `InvoiceStatusSchema`, `CancelMotiveSatSchema`, `InvoiceScheduleStatusSchema`, `ScheduleAutoOrDraftKindSchema`, `CfdiConceptLineInputSchema`, `InvoiceBuildInputSchema`, `InvoicePreviewInputSchema`, `InvoiceTimbrarInputSchema`, `InvoiceCancelInputSchema`, `InvoiceApplyPaymentInputSchema`, `InvoiceRevertPaymentInputSchema`, `InvoiceMarkVencidaInputSchema`, `InvoiceZipInputSchema`, `InvoiceListInputSchema`, `InvoiceDraftFromRenewalInputSchema`, `InvoiceScheduleCreateInputSchema`, `InvoiceScheduleSkipInputSchema`, `InvoiceScheduleListInputSchema`, `InvoiceScheduleRunInputSchema`. |
| `src/shared/utils/messages.ts` | Catálogo es-MX para `facturacion.*` (labels de status/cancelMotive, copy de UI, ZIP mensual, schedules). |
| `src/server/db/schema/index.ts` | Re-exports `invoices` y `invoiceSchedules`. |
| `src/server/services/index.ts` | Re-export `facturacionService`. |
| `src/server/services/files/index.ts` | `buildFilesServiceFromEnv()` async para evitar `require()` (cumple ESLint) y romper tests puros del helper. |
| `src/server/trpc/root.ts` | Registra `facturacionRouter`. |
| `src/modules/plataforma/layout/navigation.tsx` | Link `/facturacion` en sidebar. |
| `scripts/check-multitenancy.ts` | Lista declarativa con 2 tablas nuevas (`invoices`, `invoiceSchedules`). |
| `scripts/seed-data.ts` | Sembrado de los 3 permisos nuevos: `gestionar_facturacion`+`ver_facturas`+`timbrar_facturas` en `director` (BASE) y `administrador`; `ver_facturas` en `vendedor`. Permisos operativos (PL/programador/diseñador/QA) NO reciben permisos de facturación. |
| `scripts/check-seed-permissions.ts` | Validación automática pasa (3 permisos nuevos viven en `BASE_PERMISSIONS`). |

No se modificaron: `discovery/`, SPEC-001..006, ADR previos, `context/CURRENT.md`, `context/SPECs/IMPL-*.md`, `context/interconsultas/SPEC-HANDOFF-*.md` previos, los routers/servicios de OS/Clientes/Comercial/Proyectos, ni los archivos del flujo autonomous-loop.

---

## Contratos públicos / protegidos

- **`organization_id`** — 2 tablas nuevas (`invoices`, `invoiceSchedules`) llevan `organizationId NOT NULL` con FK a `organizations.id`; PK compuesta `(organization_id, id)` (ADR-02 §8.3). `check-multitenancy` valida 44 tablas; 0 sin `organization_id`.
- **`hasPermission` único mecanismo** — `requirePermission('gestionar_facturacion' | 'timbrar_facturas' | 'ver_facturas', { forceDb: true })` en cada acción crítica (ADR-06 / AC-81). Las acciones `timbrar` y `cancel` siempre exigen `forceDb: true`; `ver_facturas` ofrece fallback a `gestionar_facturacion` para no romper el flujo de Director.
- **`audit_logs`** — 11 acciones namespace nuevo:
  - `factura.build` (BR-N301).
  - `factura.timbrar` (BR-N304/336).
  - `factura.cancel` (BR-N305/336).
  - `factura.mark_vencida` (BR-N307/336).
  - `factura.aplicar_pago` (BR-012/308).
  - `factura.reversar_aplicacion` (BR-N309).
  - `factura.zip_generado` (BR-N311/DEC-FUN-38/26).
  - `factura.draft_from_subscription_renewal` (BR-N406, consumido por SPEC-011).
  - `invoice_schedule.create` / `invoice_schedule.run` / `invoice_schedule.skip` (BR-N310/SPEC-001 AC-15).
- **`audit_logs` antes/después SIN valor de secretos** — `timbrar` registra `cfdi_uuid` (asignado por el PAC), `xmlFileId`, `pdfFileId`, `issuedAt`. Nunca se loguea `apiKey`, contenido de `.pem`, ni XML/PDF CFDI (ADR-03 §3.5; SPEC-007 §7). Los payloads `before/after` del audit pasan por `redact()` del logger.
- **Cifrado de CSD/API key al timbrar** — `descifrarCredencialesPac(orgId)` descifra con AES-256-GCM (AAD canónico ADR-03 §9.1) sólo en el momento de timbrar/cancelar; el buffer descifrado vive en memoria local hasta terminar la operación.
- **`audit.actor = "system"`** en jobs nocturnos (`markVencida`, recurrencia, ZIP auto) — `actor_user_id=null` per AC-73.
- **Códigos de error canónicos** — 15 nuevos en `ERROR_CODES`: `INVOICE_NOT_FOUND`, `INVOICE_INVALID_TRANSITION`, `INVOICE_BUILD_INVALID`, `INVOICE_TIMBRAR_DRAFT_ONLY`, `INVOICE_TIMBRAR_DUPLICATED_UUID`, `INVOICE_CANCEL_REASON_REQUIRED`, `INVALID_CANCEL_MOTIVE`, `CSD_NOT_CONFIGURED`, `PAC_API_KEY_MISSING`, `INVOICE_HAS_APPLICATIONS`, `APPLICATION_EXCEEDS_BALANCE`, `INVOICE_SCHEDULE_NOT_FOUND`, `INVOICE_SCHEDULE_DUPLICATED`, `INVOICE_FISCAL_DATA_REQUIRED`, `XML_NOT_AVAILABLE`.
- **Permisos BASE nuevos** — `gestionar_facturacion` (director/admin), `ver_facturas` (director/admin/vendedor), `timbrar_facturas` (director/admin). Sembrado coherente con `check-seed-permissions`. Roles operativos (PL/programador/diseñador/QA) no reciben permisos de facturación.
- **`cfdi_uuid` UNIQUE por organización** (defensa contra duplicación accidental al timbrar dos veces).
- **No-acoplamiento inverso verificado** — `facturacion` no importa `@/server/services/orden-servicio` ni `@/server/services/comercial` ni `@/server/services/proyectos`; sólo lee `clients`, `client_fiscal_data`, `organization_fiscal_config`, `invoices`, `invoice_schedules`, `files`, `users`, `orders` (vía `lazy import` local).
- **Mock PAC aislado** — `src/server/integrations/pac/index.ts` exporta `PacClient` (hexagonal, AC-27 SPEC-001) y `createPacMockClient` (default). El servicio inyecta `pac: createPacClient({ mode: 'mock' })`. Cuando Frank cargue CSD/API key reales (P-007-1 cerrado en `none`), se sustituye por `createPacHttpClient` con `endpoint` real **sin tocar `facturacion`**.

---

## Validación

| Corte | Comando | Resultado |
|---|---|---|
| V1 (corte 1) | `npx tsc --noEmit -p tsconfig.json 2>&1 \| grep -E "^src/shared/enums"` | PASS — 0 errores. |
| V1 (corte 2) | `npx tsc ... \| grep -E "^src/server/db/schema"` | PASS — 0 errores (invoices + invoice-schedules). |
| V1 (corte 3) | `npx tsc ... \| grep -E "^src/server/integrations"` | PASS — 0 errores (PAC adapter hexagonal). |
| V1 (corte 4) | `npx tsc ... \| grep -E "^src/server/services/facturacion"` | PASS — 0 errores tras limpiar imports muertos y narrow de `newStatus`/`rowToDto`. |
| V1 (corte 5) | `npx tsc ... \| grep -E "^src/shared/zod"` | PASS — 0 errores (18 esquemas Zod). |
| V1 (corte 6) | `npx tsc ... \| grep -E "^src/server/trpc/routers/facturacion"` | PASS — 0 errores tras `await buildService()` por carga async de `files`. |
| V1 (corte 7) | `npx tsc ... \| grep -E "^src/modules/facturacion\|facturacion/page"` | PASS — 0 errores tras narrow explícito de los items mapeados en UI. |
| V1 (corte 8) | `npx tsx scripts/check-multitenancy.ts / check-seed-permissions.ts / check-antipatterns.ts` | PASS — 44 tablas con `organization_id`; matriz BR-N207..N412 + 3 permisos nuevos consistente; 16/16 checks anti-patrón. |
| V1 (corte 9) | `npx vitest run tests/spec-20260817-007.test.ts` | PASS — **51/51** unit tests. |
| V2 (cierre) | `npx tsc --noEmit -p tsconfig.json 2>&1 \| grep -E "^src/"` | PASS — 0 errores en `src/`. |
| V2 (cierre) | `npx vitest run` | PASS — **435/435** (384 baseline + **51 SPEC-007**). |
| V2 (cierre) | `npx eslint src/ --max-warnings=0` | PASS — 0 errores, 0 warnings (tras remover imports muertos y `require()` en `files`). |
| V2 (cierre) | `npx tsx scripts/check-multitenancy.ts` | PASS — **44 tablas con `organization_id`**; 0 sin. |
| V2 (cierre) | `npx tsx scripts/check-antipatterns.ts` | PASS — **16/16** checks (AC-1/26/27/30/34/42/47/50/55/71/72/74/79/80/48/83). |
| V2 (cierre) | `npx tsx scripts/check-seed-permissions.ts` | PASS — matriz BR-N207..N412 consistente; 3 permisos nuevos en `director`/`administrador`/`vendedor`. |
| V3 (Playwright) | `pnpm test:e2e` | **NO EJECUTADA** — entorno local no provisionado (gates BD/PostgreSQL/MinIO bloqueados, idéntico a SPEC-002..006). Las specs V3 Playwright quedan **pendientes** de gate externo autorizado por Frank. P-007-1 queda en `none` (sin credenciales PAC reales); sin PAC real, el V3 sólo puede verificar el flujo UI local con mock. |

---

## Trazabilidad AC

| AC | Implementación | Evidencia |
|---|---|---|
| **AC-1** Timbrado real con PAC + UUID+XML+PDF + audit | `createInvoicesService().timbrar(ctx, invoiceId)` descifra CSD/API key (ADR-03), invoca `pac.stamp`, sube XML/PDF vía `files.upload`, marca `status='emitida'`, persiste `cfdi_uuid`, registra `factura.timbrar`. `descifrarCredencialesPac` lanza `CSD_NOT_CONFIGURED` o `PAC_API_KEY_MISSING` (412) si faltan `.cer`/`.pem`/API key. | `tests/spec-20260817-007.test.ts: SPEC-007 · AC-1 · timbrado real con PAC (mock P-007-1)` (4 tests including fail-closed); helper `buildCfdiConcept` (3 tests). |
| **AC-2** Cancelación motivo SAT + reversar aplicaciones | `createInvoicesService().cancel(ctx, input)` exige motivo SAT 01-04 (`isValidCancelMotive`), `application_count=0` (BR-N309 → `INVOICE_HAS_APPLICATIONS`), `validateCancelReason` ≥3 chars, `pac.cancel`, registra `factura.cancel`. Helper `canTransitionInvoice` cubre el flujo. | `tests/...: SPEC-007 · AC-2 · cancelación motivo SAT + reversar aplicaciones` (5 tests); `canTransitionInvoice` helper (3 tests). |
| **AC-3** Estados + `markVencida` | Helper `isInvoiceVencida({dueDate, paidCents, totalCents, refDate})` retorna true si `due < ref && paid < total`. Servicio `markVencida(ctx, {refDate})` itera facturas activas (no canceladas/no terminales) y marca `status='vencida'`, audit `factura.mark_vencida` con actor=system. | `tests/...: SPEC-007 · AC-3 · estados + markVencida` (4 tests). |
| **AC-4** Aplicaciones no exceden saldo | Helpers `validateInvoiceApplication` (incrementa `paid_cents`, deriva `status`) y `revertInvoiceApplication` (decrementa, BR-N309: `pagada → emitida`). | `tests/...: SPEC-007 · AC-4 · aplicaciones no exceden saldo` (5 tests). |
| **AC-5** Facturación recurrente idempotente | `runScheduled(ctx, scheduleId, scheduledDate)` deriva `job_key = "${scheduleId}|${YYYY-MM-DD}"` vía `nextScheduleJobKey`, llama `jobs.enqueue({name:'facturacion.recurrente', jobKey})`. `enqueue` retorna `alreadyRun=true` si el job ya corrió. Schedule ya ejecutado no se vuelve a ejecutar. Audit `invoice_schedule.run` con actor=system. | `tests/...: SPEC-007 · AC-5 · facturación recurrente idempotente` (4 tests). |
| **AC-6** ZIP mensual sólo activas | `selectZipFacturas({facturas, year, month, includeBorrador})` filtra por mes y excluye `cancelada`. Default excluye `borrador`. `zipContador(ctx, {year, month, manual, includeBorrador})` arma buffer y registra `factura.zip_generado`. Modo `auto` (job) usa actor=system; manual exige `gestionar_facturacion`. | `tests/...: SPEC-007 · AC-6 · ZIP mensual sólo activas` (3 tests). |
| **AC-7** Calendario 7 estados visuales + escalado | `INVOICE_CALENDAR_VISUAL_STATUSES` = 7 estados (`borrador|programada|emitida|parcialmente_pagada|pagada|vencida|cancelada`). `invoiceCalendarVisualStatus({status, hasFutureSchedule})` añade `programada` derivada de un schedule futuro. El escalado tras 2 promesas incumplidas (BR-N313) lo emite la UI como derivado de SPEC-008 (no implementado aquí; AC explícito dice "coordinado con SPEC-008"). | `tests/...: SPEC-007 · AC-7 · calendario 7 estados visuales` (4 tests); UI con 7 badges `statusLabel`. |
| **AC-8** Factura borrador de renovación (BR-N406) | `createDraftFromSubscriptionRenewal(ctx, input)` construye input desde SPEC-011 (subscriptionId, clientId, fiscalDataSnapshot, concept, dueDate), arma con `buildDraftFromSubscriptionRenewal` (valida RFC/razón social/régimen del snapshot), persiste en `borrador`, audit `factura.draft_from_subscription_renewal`. Servicio expuesto en router para SPEC-011. | `tests/...: SPEC-007 · AC-8 · createDraftFromSubscriptionRenewal` (2 tests). |
| **AC-9** Preview al usuario | `invoices.preview(ctx, invoiceId)` devuelve `InvoicePreviewDTO` (invoice + cliente + fiscalConfig con hasPacApiKey/hasCsd). UI muestra banner `pacMockNotice` y warning `fiscalConfigMissing` cuando faltan credenciales. | `tests/...: SPEC-007 · AC-9 · preview` (7 tests sobre Zod schemas); UI modal con aria-modal y banner. |
| **AC-10** UI/responsive | Tabla de facturas: `overflow-x-auto` + `hidden sm:table-cell` (cliente) + `hidden md:table-cell` (vencimiento, UUID, pagado). Tabla de schedules: `overflow-x-auto` + `hidden sm:table-cell`. Dashboard: 2 pestañas con `overflow-x-auto`. Modales con `role="dialog"` + `aria-modal="true"` + cierre responsive (`items-end sm:items-center`). | `tests/...: SPEC-007 · AC-10 · UI responsive` (4 grep tests). |

---

## Contratos cruzados

| Contrato | Productor | Consumidor | Estado |
|---|---|---|---|
| `os.authorized_to_start` (audit.action) | **SPEC-004** `orders.authorize` | **SPEC-007** `invoices.buildFromOrder` lee `orders.clientId` y exige datos fiscales. | OK — preservado. |
| `cfdi_uuid` UNIQUE por org (BD) | **SPEC-007** `invoices` schema | servicio `timbrar` (defensa anti-duplicado); SPEC-008 lo lee para aplicar pagos. | OK — constraint declarado. |
| `application_count` + `paid_cents` (columna) | **SPEC-007** `invoices.applyPayment` (compat mínima) | **SPEC-008** `invoiceApplications` reemplazará con tabla granular. | OK — contrato inicial operable; SPEC-008 lo extiende. |
| `createDraftFromSubscriptionRenewal` (servicio público) | **SPEC-007** | **SPEC-011** consume cuando renueva suscripciones (BR-N406). | OK — expuesto en router `facturacion.createDraftFromSubscriptionRenewal`. |
| `invoiceSchedules` (BD) | **SPEC-007** | servicio `runScheduled` (job nocturno idempotente). SPEC-011 puede emitir schedules `subscriptionId` cuando se implemente. | OK — schema + servicio creados. |
| `factura.timbrar` / `factura.cancel` (audit.action) | **SPEC-007** | dashboard bitácora (SPEC-010) lee por prefijo `factura.*`. | OK — namespace preservado. |
| `factura.zip_generado` (audit.action) | **SPEC-007** | SPEC-010 dashboard admin lee por prefijo. | OK — actor=system cuando auto. |
| `INVOICE_AUDIT_ACTIONS` (11 acciones) | **SPEC-007** | `audit_logs.action` consulta por prefijo `factura.*` y `invoice_schedule.*`. | OK — extendidas al catálogo. |
| `ERROR_CODES` (15 códigos nuevos) | **SPEC-007** | `DomainError.code` para respuestas tRPC. | OK — agregados al catálogo. |
| `BASE_PERMISSIONS` (`gestionar_facturacion`, `ver_facturas`, `timbrar_facturas`) | **SPEC-007** | sembrado por `scripts/seed-data.ts` en `director`/`administrador` + `ver_facturas` en `vendedor`. | OK — `check-seed-permissions` valida la matriz. |
| `PacClient` (interfaz hexagonal) | **SPEC-007** ADR-09 | mock por defecto; HTTP client cuando Frank autorice P-007-1. | OK — interfaz fija, mock actual, factory `createPacClient({mode})`. |

---

## Riesgos y desviaciones

- **R1 (decisión interna reversible):** el adaptador PAC por defecto es **mock determinista** (P-007-1 cerrado en `none` por Frank: sin credenciales PAC reales ni CSD cargado en Coolify/Contabo). El factory `createPacClient({mode: 'mock'})` siempre devuelve `createPacMockClient` hasta que Frank cierre P-007-1 con carga de `.cer`/`.pem`/`pac_api_key`. Cuando Frank lo autorice, se añade `createPacHttpClient(endpoint)` con la URL real (HTTP al PAC FacturoPorTi) **sin tocar `facturacion`** (frontera hexagonal AC-27).
- **R2 (decisión interna reversible):** la carga de bytes del CSD (`.cer`/`.pem`) usa **stubs `Buffer.from('MOCK_CER'/'MOCK_PEM')`** para que el mock valide formatos; el `pac.stamp` del mock sólo necesita longitudes. Sin bucket S3 provisionado en este turno, no podemos descargar los archivos reales del bucket. Cuando Frank cargue CSD reales y haya bucket productivo, `descifrarCredencialesPac` cablea `files.download(bucketKey)` o equivalente según el adaptador S3. Documentado en reversión y Notas.
- **R3 (decisión interna reversible):** `descifrarCredencialesPac` descifra **al momento** del timbrar/cancel y mantiene los bytes descifrados en memoria local del closure; no se persisten. Si el PAC rechaza el timbrado, los bytes se descartan al retornar. Cumple ADR-03 §3.1 ("descifrar sólo al timbrar"). Si Frank requiere un `keyMaterial` a corto plazo con wipe explícito, el cambio se localiza en este helper.
- **R4 (decisión interna reversible):** `applyPayment` y `revertPayment` implementan **compatibilidad mínima** con SPEC-008 (BR-012/308/309). La reversión granular por `applicationId` queda en SPEC-008 cuando cree `invoiceApplications`; aquí decrementamos el contador global y recalculamos `status` por reglas deterministas (pagada → emitida). Si SPEC-008 requiere monto explícito al revertir, este helper se sobreescribe sin afectar contrato público.
- **R5 (decisión interna reversible):** `zipContador` produce un buffer ZIP **sintético** (concatena XML-STUB/PDF-STUB por factura con separadores) porque `archiver`/`jszip` no están en dependencias y añadir uno fuera de alcance. Cumple BR-N311/DEC-FUN-38/26 (sólo activas) y `factura.zip_generado` con actor=system para modo auto. Cuando Frank autorice staging con bucket productivo, se sustituye por `archiver`/`jszip` o equivalente (decisión interna reversible, 1 archivo, sin impacto en el resto).
- **R6 (decisión interna reversible):** `runScheduled` exige que la OS tenga `plUserId` (defensa documentada); si el schedule es `subscriptionId`, devuelve `INVOICE_BUILD_INVALID` con mensaje "Schedules por suscripción los consume SPEC-011". SPEC-011 en su incremento cableará la señal hacia `createDraftFromSubscriptionRenewal`. El job nocturno del lado OS queda cubierto.
- **R7 (deuda técnica menor):** `cfdiUuid` UNIQUE parcial usa `where sql`${t.cfdiUuid} IS NOT NULL``; al regenerar la migración Drizzle (`db:generate`), validar la nueva sintaxis de `where` para `uniqueIndex` parcial (idéntica a `invoices` con otros parciales existentes en SPEC-002..006).
- **R8 (deuda técnica menor):** `descifrarCredencialesPac` exige CSD/API key al **timbrar**. Si Frank configura el PAC pero aún no carga CSD, devuelve `CSD_NOT_CONFIGURED` antes de `PAC_API_KEY_MISSING`. UI muestra ambos mensajes en el preview (`fiscalConfigMissing` + `pacMockNotice`). Documentado en módulo para gate P-007-1.
- **D1:** El calendario visual de 7 estados suma `programada` (derivada de `invoice_schedules.scheduled_date > hoy` + `status='pending'`). La UI actual NO consume schedules para derivar `programada` en el listado; la función helper `invoiceCalendarVisualStatus` está disponible y el caller puede invocarla cuando SPEC-011 emita schedules de suscripción. Hoy, sólo aparece `borrador/programada/emitida/parcialmente_pagada/pagada/vencida/cancelada` con la regla `borrador → programada` cuando `hasFutureSchedule=true`.
- **D2:** `INVOICE_AUDIT_ACTIONS` añade 11 acciones al catálogo; `audit_logs.action` admite strings de hasta 64 chars por la columna `text`. Nuestras acciones (`factura.draft_from_subscription_renewal`) caben en 47 chars. Verificado por observación de SPEC-001 AC-22.
- **D3:** `descifrarCredencialesPac` resuelve `uploaded_by` para `files.upload` con `resolveSystemUploaderId`: prioriza `row.createdBy`, luego `orders.plUserId`, luego primer usuario de la org. Esto evita el anti-patrón de fabricar identidad UUID cero (AC-71) en jobs `system`.

---

## Pendientes ATLAS

- **A1:** gate GEMINI V3 contra staging LIVE (Frank-auth). Las specs V3 Playwright no se crean en este turno porque el flujo es idéntico a SPEC-002..006 (gates BD/PostgreSQL/MinIO pendientes). El helper `createPacMockClient` permite que un V3 contra staging corra todo el flujo CFDI excepto el round-trip real al PAC.
- **A2:** GEMINI es **obligatorio** para SPEC-007 (riesgo medio-alto): toca secretos CSD/API key (cifrado), CFDI fiscal (BR-N301..N313), integración externa (PAC), job nocturno idempotente (SPEC-001 AC-15). Decisión §13 de la SPEC.
- **A3:** coordinar con el dueño de SPEC-008 (Cobranza/Comisiones) el contrato `applyPayment`/`revertPayment` que este incremento expone (compatibilidad mínima). SPEC-008 lo sustituirá por `invoiceApplications` granulares; el contrato actual NO bloquea a SPEC-008.
- **A4:** P-007-1 sigue abierto: Frank debe cargar `.cer`/`.pem`/contraseña/API key del PAC en Coolify/Contabo. Mientras tanto el adaptador mock está activo y la UI muestra el banner `pacMockNotice`. Cuando Frank cierre P-007-1, se sustituye `createPacClient({mode:'mock'})` por `createPacClient({mode:'http', endpoint:...})` y `descifrarCredencialesPac` cablea la descarga real del bucket (R2). Sin cambios de contrato.
- **A5:** al regenerar la migración Drizzle (`db:generate`), validar que el UNIQUE parcial `invoices_org_cfdi_uuid_unique` aplique correctamente con la nueva sintaxis `where` (defensa documentada en IMPL-REPORT).
- **A6:** ligar con SPEC-011 (Suscripciones) el consumo de `createDraftFromSubscriptionRenewal` (BR-N406, DEC-FUN-67). El contrato está publicado y expuesto en el router. SPEC-011 lo invoca desde su propio worker de renovación.

---

## SPEC-GAP

No se devuelve `SPEC-GAP` a ATLAS. P-007-1 (Frank) está cerrado en `none` (mock PAC, banner UI visible); todos los contratos públicos están dentro del SPEC; las decisiones internas (R1..R8) están documentadas como riesgos reversibles.

---

## Notas de reversión (recomendación, NO ejecución)

Si se requiere revertir el incremento:

1. **Revertir migración de BD:** las 2 tablas nuevas se crean con `db:generate`/`db:migrate`. El script de rollback es responsabilidad del flujo de mantenimiento.
2. **Revertir código:** el blast radius está contenido en:
   - `src/server/db/schema/invoices.ts` (eliminar).
   - `src/server/db/schema/invoice-schedules.ts` (eliminar).
   - `src/server/db/schema/index.ts` (quitar exports).
   - `src/server/integrations/pac/index.ts` (eliminar todo; será reemplazado por HTTP cuando Frank autorice P-007-1).
   - `src/server/services/facturacion/helpers.ts` (eliminar).
   - `src/server/services/facturacion/invoices.ts` (eliminar).
   - `src/server/services/facturacion/index.ts` (eliminar).
   - `src/server/services/index.ts` (quitar `facturacionService`).
   - `src/server/services/files/index.ts` (revertir `buildFilesServiceFromEnv`).
   - `src/server/trpc/routers/facturacion.ts` (eliminar).
   - `src/server/trpc/root.ts` (quitar `facturacionRouter`).
   - `src/app/(dashboard)/facturacion/page.tsx` (eliminar).
   - `src/modules/facturacion/facturas-list.tsx` (eliminar).
   - `src/modules/facturacion/schedules-list.tsx` (eliminar).
   - `src/modules/plataforma/layout/navigation.tsx` (quitar `/facturacion`).
   - `src/shared/enums/index.ts` (quitar enums + códigos + permisos + audit actions de SPEC-007).
   - `src/shared/zod/index.ts` (quitar esquemas SPEC-007).
   - `src/shared/utils/messages.ts` (quitar claves `facturacion.*`, `nav.facturacion`).
   - `scripts/check-multitenancy.ts` (quitar las 2 tablas).
   - `scripts/seed-data.ts` (quitar 3 permisos y matriz).
   - `tests/spec-20260817-007.test.ts` (eliminar).
3. **Sin acoplamientos inversos:** `facturacion` no importa `@/server/services/orden-servicio`, `comercial` o `proyectos` (sólo lee tablas de esos módulos vía Drizzle directo, sin invocar servicios); la reversión queda contenida al directorio `facturacion/*` y al router/UI.

No se ejecuta ninguna acción mutante (sin commit/push/PR/deploy/rollback).

---

## Estado

`READY_FOR_VERIFYING`. SOFIA no declara `DONE` (§3 IDL).
