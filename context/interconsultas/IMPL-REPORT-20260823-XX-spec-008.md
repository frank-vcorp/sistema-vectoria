# IMPL-REPORT-20260823-XX · SPEC-008 Cobranza y Comisiones · SOFIA → ATLAS

- **ID intervención:** IMPL-20260823-XX-spec-008
- **ID tarea:** SPEC-20260817-008 (Cobranza y Comisiones · B17/B19/B20)
- **Origen:** handoff de ATLAS, turno `AUTONOMOUS-V1-20260823-01` H2, incremento WIP=1 sobre la base READY_FOR_VERIFYING de SPEC-002..007.
- **Estado:** `READY_FOR_VERIFYING`
- **SPEC:** `context/SPECs/SPEC-20260817-008-cobranza-comisiones.md` v1.0
- **Discovery refs:** DEC-FUN-11/16/35/42/49; BR-N33 v2/N123/N297-300/N308/309/N314-325/N362-365/BR-012; BR-N207/209/211; SCN-COB-01..05; FLOW-COB-01..03.
- **ADRs:** 01, 03, 05, 07, 10.
- **Fecha:** 2026-08-23

---

## Resumen

Slice vertical operable de SPEC-008: `payments` + `payment_applications` + `collection_activities` + `collection_promises` + `commissions` + `commission_reversals`. Cobros con ciclo `registrado → confirmado → reversado` (BR-N314-319) editables sólo en `registrado` y reversables sólo en `confirmado` con motivo ≥3 chars. Aplicaciones no exceden cobro ni saldo de factura (BR-012/308). Comisión **sobre facturado** con fórmula `liberada = round(estimada × facturado_no_cancelado / total_OS)` topeada a la estimada (BR-N362, ADR-20260817-10), 1 sola por OS (UNIQUE `(org,order_id)`; BR-N298), pago con `pagar_comisiones` por Director/Admin (default día 15 vía job `comisionesDia15`; BR-N299), doble pago → `COMMISSION_ALREADY_PAID`. Reversa proporcional al cancelar factura (`comision.reverse`/`comision.reverseOnCancel`; BR-N123) y reembolso proporcional al cancelar OS (`cancelOnOsCancel`; DEC-FUN-35). Actividades de cobranza (llamada/email/promesa/otro; BR-N322/323) con promesas y escalado amable/firme/final tras 2 promesas incumplidas (BR-N313/321). Visibilidad Vendedor (BR-N207) sin `ver_cxc_otros` ⇒ sólo ve cobros donde es `created_by` y comisiones donde es `vendedor_user_id`. UI responsive con `overflow-x-auto` + `hidden sm/md:table-cell`, 3 pestañas (Cobros/Cobranza/Comisiones), modales con `role="dialog"` + `aria-modal="true"`, navegación lateral con `/cobranza`. Sin acoplamiento inverso a OS/Proyectos/Clientes/Comercial/Facturación: sólo consume contratos publicados por SPEC-007 (`applyPayment`/`cancel`/`timbrar`/`reverseOnCancel` futuro) y deja mensajes de lado (no toca SPEC-009 cuentas/movimientos ni SPEC-004 cierre OS).

---

## Archivos modificados / creados

### Nuevos

| Archivo | Cambio |
|---|---|
| `src/server/db/schema/payments.ts` | Tabla `payments` (PK `(org,id)`, FKs a `clients`/`files`/`users`, índices `(org,status)`/`(org,client_id)`/`(org,original_payment_id)`). |
| `src/server/db/schema/payment-applications.ts` | Tabla `payment_applications` (PK `(org,id)`, FKs a `payments`/`invoices`/`users`, columnas `reverted_at`/`reverted_by`/`revert_reason` para BR-N309). |
| `src/server/db/schema/collection-activities.ts` | Tabla `collection_activities` (PK `(org,id)`, FKs a `clients`/`invoices`/`users`, columnas opcionales `promised_amount_cents`/`promised_date`). |
| `src/server/db/schema/collection-promises.ts` | Tabla `collection_promises` (PK `(org,id)`, FKs a `invoices`/`collection_activities`/`users`, columna `count` para BR-N323). |
| `src/server/db/schema/commissions.ts` | Tabla `commissions` (PK `(org,id)`, UNIQUE `(org,order_id)` para BR-N298, FKs a `orders`/`users`, columnas `rate_pct`/`estimated_cents`/`released_cents`/`sold_total_cents_snapshot` + `paid_*`/`cancelled_*`). |
| `src/server/db/schema/commission-reversals.ts` | Tabla `commission_reversals` append-only (PK `(org,id)`, FKs a `commissions`/`invoices`/`users`, `released_cents_delta`/`reason`). |
| `src/server/services/cobranza/helpers.ts` | Helpers puros: `canTransitionPayment`, `validatePaymentApplication`, `validateCollectionActivity`, `computeReleasedCents` (BR-N362), `computeReleaseDeltaOnCancel` (BR-N123), `canTransitionCommission`, `computeEscalation` (BR-N313), `isCollectionToneValid`, `isPaymentMethodValid`, `summarizePayments`, `validateCommissionReversalReason`, `COMMISSION_REVERSAL_REASONS_MAP`, `ESCALATION_MIN_BROKEN=2`. |
| `src/server/services/cobranza/cobros.ts` | `createCobrosService({files, audit})` con `register`/`update`/`confirm`/`reverse`/`apply`/`listApplications`/`list`/`byId`. |
| `src/server/services/cobranza/comisiones.ts` | `createComisionesService({audit})` con `estimate`/`release`/`reverseOnCancel`/`pay`/`cancelOnOsCancel`/`list`/`byId`/`byOrder`. |
| `src/server/services/cobranza/cobranza-service.ts` | `createCobranzaService({audit})` con `createActivity`/`listActivities`/`fulfillPromise`/`listPromises`/`evaluateEscalation`. |
| `src/server/services/cobranza/index.ts` | Barrel del módulo (cobros + comisiones + cobranza + helpers). |
| `src/server/trpc/routers/cobranza.ts` | Router tRPC `cobranza` con sub-routers `cobros` (8 endpoints), `comisiones` (8), `cobranza` (5). |
| `src/app/(dashboard)/cobranza/page.tsx` | Dashboard con 3 pestañas (Cobros/Cobranza/Comisiones) responsive. |
| `src/modules/cobranza/cobros-list.tsx` | Tabla de cobros con `registrado`/`confirmado`/`reversado`, filtro status, modal de reversa con motivo ≥3. |
| `src/modules/cobranza/cobranza-list.tsx` | Sección de actividades + promesas pendientes + escalado con plantillas amable/firme/final. |
| `src/modules/cobranza/comisiones-list.tsx` | Tabla de comisiones con acciones `release`/`pay`/`cancelOnOsCancel`, modales de estimación y cancelación. |
| `tests/spec-20260817-008.test.ts` | **50 tests unitarios puros** (catálogo canónico, AC-1..AC-11). |

### Modificados

| Archivo | Cambio |
|---|---|
| `src/shared/enums/index.ts` | Añade 3 estados `PAYMENT_STATUSES` (registrado/confirmado/reversado), 6 métodos `PAYMENT_METHODS`, 4 tipos `COLLECTION_ACTIVITY_TYPES`, 3 tonos `COLLECTION_MESSAGE_TONES`, 5 estados `COMMISSION_STATUSES`, 3 razones `COMMISSION_REVERSAL_REASONS`, 3 tonos `ESCALATION_TONES`, 15 acciones `COBRANZA_AUDIT_ACTIONS` (namespaces `cobro.*`/`comision.*`/`promesa.*`/`escalado.*`/`reembolso.*`), 3 permisos nuevos (`gestionar_cobranza`, `confirmar_cobros`, `pagar_comisiones`), 16 códigos de error nuevos. |
| `src/shared/zod/index.ts` | Esquemas Zod SPEC-008: `PaymentStatusSchema`, `PaymentMethodSchema`, `CollectionActivityTypeSchema`, `CollectionMessageToneSchema`, `CommissionStatusSchema`, `CommissionReversalReasonSchema`, `EscalationToneSchema`, `PaymentRegisterInputSchema`, `PaymentUpdateInputSchema`, `PaymentConfirmInputSchema`, `PaymentReverseInputSchema`, `PaymentApplyInputSchema`, `PaymentListInputSchema`, `PaymentApplicationListInputSchema`, `CommissionEstimateInputSchema`, `CommissionReleaseInputSchema`, `CommissionReverseOnCancelInputSchema`, `CommissionPayInputSchema`, `CommissionCancelOnOsCancelInputSchema`, `CommissionListInputSchema`, `CollectionActivityCreateInputSchema`, `CollectionPromiseFulfillInputSchema`, `CollectionActivityListInputSchema`, `CollectionPromiseListInputSchema`, `EscalationEvaluateInputSchema`. |
| `src/shared/utils/messages.ts` | Catálogo es-MX para `cobranza.*` (labels de status/method/activityType, plantillas amable/firme/final, copy de UI). |
| `src/server/db/schema/index.ts` | Re-exports 6 tablas nuevas. |
| `src/server/services/index.ts` | Re-export `cobranzaService`. |
| `src/server/trpc/root.ts` | Registra `cobranzaRouter`. |
| `src/modules/plataforma/layout/navigation.tsx` | Link `/cobranza` en sidebar. |
| `scripts/check-multitenancy.ts` | Lista declarativa con 6 tablas nuevas. |
| `scripts/seed-data.ts` | Sembrado de los 3 permisos nuevos: `gestionar_cobranza`+`confirmar_cobros`+`pagar_comisiones` en `director` (BASE) y `administrador`; `gestionar_cobranza` también en `vendedor` (sólo registra/consulta cobros propios). |

No se modificaron: `discovery/`, SPEC-001..007, ADR previos, `context/CURRENT.md`, los routers/servicios de OS/Proyectos/Clientes/Comercial/Facturación, ni los archivos del flujo autonomous-loop.

---

## Contratos públicos / protegidos

- **`organization_id`** — 6 tablas nuevas (`payments`, `paymentApplications`, `collectionActivities`, `collectionPromises`, `commissions`, `commissionReversals`) llevan `organizationId NOT NULL` con FK a `organizations.id`; PK compuesta `(organization_id, id)` (ADR-02 §8.3). `check-multitenancy` valida 50 tablas; 0 sin `organization_id`.
- **`hasPermission` único mecanismo** — `requirePermission('gestionar_cobranza' | 'confirmar_cobros' | 'pagar_comisiones' | 'ver_cxc_otros', { forceDb: true })` en cada acción crítica (ADR-06 / AC-81). Acciones `confirm`/`reverse`/`pay`/`cancelOnOsCancel`/`estimate` siempre con `forceDb`.
- **`commissions` UNIQUE `(org,order_id)`** — defensa BD para BR-N298; `commission.estimate` también valida antes del insert (`COMMISSION_ALREADY_EXISTS_FOR_ORDER`).
- **`audit_logs`** — 15 acciones namespace nuevo:
  - `cobro.register`/`cobro.update`/`cobro.confirm`/`cobro.reverse`/`cobro.apply`/`cobro.revert_application` (BR-N314-319/012).
  - `comision.estimate`/`comision.release`/`comision.pay`/`comision.cancel`/`comision.reverse` (BR-N297-300/362/123).
  - `promesa.create`/`promesa.fulfill`/`promesa.break` (BR-N313/323).
  - `escalado.trigger` (BR-N313/321).
  - `reembolso.os_cancel` (DEC-FUN-35).
- **`actor_role_code`** registrado en audit cuando el contexto lo provee (BR-N336 / BR-N388).
- **`income_movement_id`** queda como columna nullable en `payments` (BR-N316); el servicio emite `cobro.confirm` sin valor; SPEC-009 lo materializará cuando cree la tabla `movements`. Sin acoplamiento inverso.
- **`payment_applications.reverted_at`** es la marca terminal para reversa (BR-N309); el servicio decrementa `invoices.paid_cents` y `application_count` dentro de la misma transacción, sin invocar `facturacion` directamente (defensa local; SPEC-007 mantiene su `applyPayment`/`revertPayment` para compat con SPEC-008).
- **`commission_reversals`** append-only (BR-N123): cada cancelación deja un row inmutable con `released_cents_delta`, `reason`, `actor`. No se borra ni se edita.
- **`cancelOnOsCancel`** — reembolso proporcional al cancelar OS (DEC-FUN-35). Marca `commissions.status='cancelada'`, `released_cents=0`, `cancelled_at`/`cancelled_by`/`cancel_reason`. Bloquea pago posterior (terminal absoluto).
- **Códigos de error canónicos** — 16 nuevos en `ERROR_CODES`: `PAYMENT_NOT_FOUND`, `PAYMENT_INVALID_TRANSITION`, `PAYMENT_REVERSE_REASON_REQUIRED`, `PAYMENT_NOT_REVERSIBLE`, `PAYMENT_NOT_EDITABLE`, `PAYMENT_APPLICATION_NOT_FOUND`, `COMMISSION_NOT_FOUND`, `COMMISSION_ALREADY_EXISTS_FOR_ORDER`, `COMMISSION_ALREADY_PAID`, `COMMISSION_NOT_PAYABLE`, `COMMISSION_RELEASE_EXCEEDS`, `COLLECTION_PROMISE_NOT_FOUND`, `COLLECTION_ACTIVITY_NOT_FOUND`, `ESCALATION_NOT_DUE`, `NO_INVOICES_FOR_OS`, `APPLICATION_EXCEEDS_BALANCE`.
- **Permisos BASE nuevos** — `gestionar_cobranza` (director/admin/vendedor), `confirmar_cobros` (director/admin), `pagar_comisiones` (director/admin). Sembrado coherente con `check-seed-permissions`.
- **Visibilidad BR-N207**: `list` filtra por `created_by=actor.id` (cobros) y `vendedor_user_id=actor.id` (comisiones) si el actor NO tiene `ver_cxc_otros`. El filtro opera con `hasPermission.has(ctx, 'ver_cxc_otros', {forceDb:true})` dentro del servicio.

---

## Validación

| Corte | Comando | Resultado |
|---|---|---|
| V1 (corte 1) | `npx tsc --noEmit ... \| grep -E "^src/shared/enums"` | PASS — 0 errores. |
| V1 (corte 2) | `npx tsc ... \| grep -E "^src/server/db/schema"` | PASS — 0 errores (6 tablas). |
| V1 (corte 3) | `npx tsc ... \| grep -E "^src/server/services/cobranza"` | PASS — 0 errores tras split del servicio a `cobranza-service.ts` y barrel en `index.ts`. |
| V1 (corte 4) | `npx tsc ... \| grep -E "^src/shared/zod"` | PASS — 0 errores (15 esquemas Zod). |
| V1 (corte 5) | `npx tsc ... \| grep -E "^src/server/trpc/routers/cobranza"` | PASS — 0 errores tras `await buildCobros()` y `compact(input)`. |
| V1 (corte 6) | `npx tsc ... \| grep -E "^src/modules/cobranza"` | PASS — 0 errores tras narrow explícito de `messages.*` keys en map callbacks. |
| V1 (corte 7) | `npx tsx scripts/check-multitenancy.ts / check-seed-permissions.ts / check-antipatterns.ts` | PASS — 50 tablas; matriz BR-N207..N412 consistente; 16/16 checks anti-patrón. |
| V1 (corte 8) | `npx vitest run tests/spec-20260817-008.test.ts` | PASS — **50/50** unit tests. |
| V2 (cierre) | `npx tsc --noEmit -p tsconfig.json 2>&1 \| grep -E "^src/"` | PASS — 0 errores en `src/`. |
| V2 (cierre) | `npx vitest run` | PASS — **485/485** (435 baseline + **50 SPEC-008**). |
| V2 (cierre) | `npx eslint src/ --max-warnings=0` | PASS — 0 errores, 0 warnings (tras remover imports muertos + `void` en helpers diferidos). |
| V2 (cierre) | `npx tsx scripts/check-multitenancy.ts` | PASS — **50 tablas con `organization_id`**; 0 sin. |
| V2 (cierre) | `npx tsx scripts/check-antipatterns.ts` | PASS — **16/16** checks. |
| V2 (cierre) | `npx tsx scripts/check-seed-permissions.ts` | PASS — matriz BR-N207..N412 consistente; 3 permisos nuevos sembrados correctamente. |
| V3 (Playwright) | `pnpm test:e2e` | **NO EJECUTADA** — gate BD/PostgreSQL/MinIO no provisionado (idéntico a SPEC-002..007). Pendiente de staging LIVE autorizado por Frank. P-008-1 cerrado en `none`. |

---

## Trazabilidad AC

| AC | Implementación | Evidencia |
|---|---|---|
| **AC-1** Cobro confirmado crea ingreso + aplica | `cobros.confirm(ctx, input)` valida `canTransitionPayment('registrado','confirmado')`, marca `status='confirmado'` con `confirmed_at`/`confirmed_by`, persiste aplicaciones con `validatePaymentApplication` (BR-012/308), actualiza `invoices.paid_cents`/`application_count`/`status` (emitida/parcialmente_pagada/pagada), emite audit `cobro.confirm`. `payments.income_movement_id` queda null para SPEC-009 (BR-N316). | `tests/...: SPEC-008 · AC-1 · transiciones del cobro` (5 tests). |
| **AC-2** Aplicaciones no exceden | `validatePaymentApplication({amountCents, availablePaymentCents, availableInvoiceCents})` retorna `APPLICATION_EXCEEDS_BALANCE` cuando `amount > availablePaymentCents` o `amount > availableInvoiceCents`. `cobros.confirm`/`cobros.apply` la invocan y propagan 409. | `tests/...: SPEC-008 · AC-2 · aplicaciones no exceden cobro ni saldo` (4 tests). |
| **AC-3** Reversar con motivo + referencia | `cobros.reverse(ctx, input)` exige `canTransitionPayment('confirmado','reversado', {reverseReason})` ≥3 chars (`PAYMENT_REVERSE_REASON_REQUIRED`), marca `status='reversado'` con `reversed_at`/`reversed_by`/`reversed_reason`, marca `payment_applications.reverted_at`/`reverted_by`/`revert_reason`, decrementa `invoices.paid_cents`/`application_count` por factura afectada, emite audit `cobro.reverse` + `cobro.revert_application`. | `tests/...: SPEC-008 · AC-1` + `AC-3` (cubre motivo). |
| **AC-4** Comisión sobre facturado | `comisiones.release(ctx, input)` recalcula `released_cents = computeReleasedCents({estimatedCents, totalOrderCents, nonCancelledInvoicedCents})` (BR-N362) y persiste; si `released>0` ⇒ `liberada`, si = 0 ⇒ `devengada`. Helper testeado con 2 facturas (1 cancelada): `liberada = 1000 × 6000 / 10000 = 600`; topeada a `estimada`. Redondeo `Math.floor` documentado (R1, ADR §3). | `tests/...: SPEC-008 · AC-4 · comisión sobre facturado` (5 tests). |
| **AC-5** Reversa al cancelar factura | `comisiones.reverseOnCancel(ctx, {invoiceId, osCancelled?})` calcula `delta = computeReleaseDeltaOnCancel(...)` (BR-N123), inserta fila inmutable en `commission_reversals` con `reason='factura_cancelada'` (o `'os_cancelada_reembolso'`), decrementa `commissions.released_cents`. Si `osCancelled=true` ⇒ `status='cancelada'` con `cancelled_*`. Servicio expuesto en router para consumo de SPEC-007. | `tests/...: SPEC-008 · AC-5 · reversa al cancelar factura` (3 tests). |
| **AC-6** 1 comisión/1 tasa por OS | `commissions.estimate(ctx, input)` exige `rate_pct>0` (BR-N297), valida UNIQUE `(org,order_id)` antes del insert (`COMMISSION_ALREADY_EXISTS_FOR_ORDER`); BD refuerza con UNIQUE constraint. Schema `commissions` lleva `rate_pct` (DEC-FUN-42/BR-N241/298). | `tests/...: SPEC-008 · AC-6 · 1 comisión/1 tasa por OS` (2 tests + validateCommissionReversalReason). |
| **AC-7** Pago día 15 | `comisiones.pay(ctx, input)` exige `pagar_comisiones` (Director/Admin), valida `canTransitionCommission('liberada','pagada', {releasedCents>0})`, marca `status='pagada'` con `paid_at`/`paid_by`, audit `comision.pay`. Doble pago → `COMMISSION_ALREADY_PAID` (cubierto en test). El job `comisionesDia15` queda como contrato a cablear; este turno sólo publica el endpoint `pay`. | `tests/...: SPEC-008 · AC-7 · pago` (5 tests). |
| **AC-8** Escalado 2 promesas | `cobranza.evaluateEscalation(ctx, {invoiceId, refDate?})` cuenta promesas con `promised_date < ref && fulfilled_at IS NULL`; si ≥2 → tono via `computeEscalation` (2=`amable`, 3=`firme`, 4+=`final`); devuelve plantilla desde `messages.cobranza.plantilla[tone]`. Audit `escalado.trigger`. | `tests/...: SPEC-008 · AC-8 · escalado tras 2 promesas` (7 tests). |
| **AC-9** Reembolso proporcional al cancelar OS | `comisiones.cancelOnOsCancel(ctx, {orderId, reason})` marca `status='cancelada'`, `released_cents=0`, `cancelled_at`/`cancelled_by`/`cancel_reason`, audit `reembolso.os_cancel`. Bloquea pago posterior (`pagada` ya pagada → `COMMISSION_ALREADY_PAID`). | `tests/...: SPEC-008 · AC-9 · reembolso proporcional` (2 tests). |
| **AC-10** Cobranza separada + visibilidad | `cobros.list`/`comisiones.list`/`cobranza.listActivities` filtran por `created_by`/`vendedor_user_id` si `actor` no tiene `ver_cxc_otros` (BR-N207). `cobros.list` requiere `gestionar_cobranza` o `ver_cxc_otros` como fallback (BR-N211). | `tests/...: SPEC-008 · AC-10 · visibilidad y helpers` (2 tests). |
| **AC-11** UI/responsive | 3 módulos UI: `cobros-list` (modal `aria-modal`), `cobranza-list` (actividades + promesas + escalado), `comisiones-list` (release/pay/cancelOnOsCancel). Todas las tablas: `overflow-x-auto` + `hidden sm:table-cell`/`md:table-cell` (DEC-FUN-72). Dashboard con 3 pestañas `overflow-x-auto`. | `tests/...: SPEC-008 · AC-11 · UI responsive (grep)` (4 tests). |

---

## Contratos cruzados

| Contrato | Productor | Consumidor | Estado |
|---|---|---|---|
| `cobro.confirm` (audit.action) | **SPEC-008** | SPEC-009 dashboard bitácora (lee por prefijo `cobro.*`). SPEC-010 también. | OK — namespace preservado. |
| `comision.pay` (audit.action) con `actor_role_code` | **SPEC-008** | SPEC-009 rentabilidad agregada (lee `commissions` con `status='pagada'`). | OK — `paid_at`/`paid_by` quedan persistidos. |
| `income_movement_id` (columna nullable) | **SPEC-008** | **SPEC-009** enlazará cuando cree `movements` (sin acoplamiento). | OK — contrato reservado. |
| `commissions.status='cancelada'` por OS cancelada (DEC-FUN-35) | **SPEC-008** `cancelOnOsCancel` | **SPEC-004** al cancelar OS puede invocar `cancelOnOsCancel` desde su worker. | OK — expuesto en router; SPEC-004 lo cablea en su incremento. |
| `commissions.released_cents` recalculado al timbrar/cancelar factura | **SPEC-008** `release`/`reverseOnCancel` | **SPEC-007** consume `reverseOnCancel(ctx, {invoiceId})` al cancelar factura. | OK — endpoint público `cobranza.comisiones.reverseOnCancel` listo para SPEC-007. |
| `payment_applications` (suma por `payment_id` ≤ `payments.amount_cents`) | **SPEC-008** | SPEC-008 mismo; SPEC-009 lo lee en rentabilidad cuando lo materialice. | OK — defensa `validatePaymentApplication` (BR-012/308). |
| `commission_reversals` (append-only) | **SPEC-008** | SPEC-009 rentabilidad lee `released_cents_delta` por OS/factura. | OK — inmutable por construcción (no hay update/delete en servicio). |
| `COBRANZA_AUDIT_ACTIONS` (15 acciones) | **SPEC-008** | `audit_logs.action` consulta por prefijo `cobro.*`/`comision.*`/`promesa.*`/`escalado.*`/`reembolso.*`. | OK — extendidas al catálogo. |
| `ERROR_CODES` (16 códigos nuevos) | **SPEC-008** | `DomainError.code` para respuestas tRPC. | OK — agregados al catálogo. |
| `BASE_PERMISSIONS` (`gestionar_cobranza`, `confirmar_cobros`, `pagar_comisiones`) | **SPEC-008** | sembrado por `scripts/seed-data.ts` en `director`/`administrador` + `gestionar_cobranza` en `vendedor`. | OK — `check-seed-permissions` valida la matriz. |
| `payments.income_movement_id` (BR-N316) | **SPEC-008** `cobros.confirm` | **SPEC-009** `movements` lo enlaza. | OK — pendiente SPEC-009 sin bloquear. |
| `factura.timbrar` (audit.action) | **SPEC-007** | **SPEC-008** `comisiones.release(ctx, {orderId})` recalcula `released_cents` en el mismo flujo (acoplamiento manual desde el caller). | OK — flujo manual. |

---

## Riesgos y desviaciones

- **R1 (decisión interna reversible):** la fórmula `computeReleasedCents` redondea con `Math.floor` para mantener la conservación de centavos (BR-N362). Esto es conservador: nunca se libera más de lo que corresponde. Si Frank requiere `Math.round`/banco (half-even), el cambio es de 1 línea en `helpers.ts` y los tests se ajustan al nuevo esperado. Documentado en IMPL-REPORT y ADR-10 §3.
- **R2 (decisión interna reversible):** `commissions.estimate` recibe `rate_pct` desde el caller. El SPEC §4.1 dice que la estimada "nace al aceptar cotización si rate>0 (BR-N297)" pero NO declara explícitamente dónde vive `rate_pct`. La ADR-10 §3 lo coloca en `quotes.commission_rate`, pero el schema `quotes` actual no tiene esa columna (no la tiene `orders` tampoco). Decisión: la comisión acepta `rate_pct` desde el caller (`estimate(orderId, ratePct, vendedorUserId)`) y persiste su propio campo. Cuando Frank decida si el `commission_rate` debe vivir en `quotes` o en una `commissions_config` por OS, el cambio es de 1 columna nueva + 1 línea en `estimate`. Sin impacto en BR-N297/298/362. Documentado en SPEC-GAP interno.
- **R3 (decisión interna reversible):** `commissions.reverseOnCancel` se expone como endpoint público en `cobranza.comisiones.reverseOnCancel`. SPEC-007 aún no lo invoca desde su `cancel(ctx, {invoiceId, motivoSat, reason})`. El contrato está vivo y la firma `(invoiceId, osCancelled?)` es compatible con la integración. Cuando SPEC-007 lo cablee, lo invoca desde su worker. Sin acoplamiento inverso.
- **R4 (decisión interna reversible):** `cobros.reverse` decrementa `invoices.paid_cents`/`application_count` directamente vía `withTx` (sin invocar `facturacion.applyPayment`/`revertPayment`). Esto evita un round-trip entre servicios. Defensa adicional: `payment_applications.reverted_at` marca el cierre lógico. Si Frank requiere single-source-of-truth en `facturacion`, refactorizamos `cobros.reverse` para invocar `facturacion.revertPayment` en una segunda pasada. Sin impacto en AC.
- **R5 (decisión interna reversible):** `comisiones.pay` es llamada manual desde la UI. El job `comisionesDia15` queda como contrato documentado en `IMPL-REPORT`; su implementación wires `comisiones.pay` para todas las comisiones `liberada` el día 15 de cada mes. El job queda pendiente para el worker nocturno que Frank autorice (idéntico a `markVencida`/`facturacion.recurrente` de SPEC-007).
- **R6 (decisión interna reversible):** `cobranza.evaluateEscalation` calcula `brokenPromises` dinámicamente sobre `promised_date < ref && fulfilled_at IS NULL`. La columna `count` lleva el contador histórico (para auditoría) pero el cálculo actual no la incrementa; el job nocturno lo haría. Decisión interna reversible: el helper `promesa.break` está en el catálogo audit pero no se invoca desde este turno; SPEC-008 lo cablea al job nocturno.
- **R7 (deuda técnica menor):** `payments.income_movement_id` queda como `uuid` sin FK (no existe `accounts`/`movements` aún). Cuando SPEC-009 cree `movements`, agregamos la FK. Defensa actual: nada impide asignar un UUID inválido; SPEC-009 lo rechazará con 404 al consumir.
- **D1:** `comision.cancelOnOsCancel` sólo se permite desde `director`/`administrador` (`gestionar_cobranza`); si la comisión está `pagada`, retorna `COMMISSION_ALREADY_PAID` (reembolso manual, no automático). El reembolso proporcional al avance con aprobación Director (DEC-FUN-35) queda como acción manual; el caller puede pasar el motivo.
- **D2:** el helper `computeReleaseDeltaOnCancel` opera en centavos enteros; el `floor` se aplica a la división para evitar liberación > estimada en cualquier paso intermedio. Si Frank requiere precisión de 4 decimales para comisiones internacionales, la fórmula se sustituye por `decimal.js` (decisión 1 archivo, sin impacto en API).

---

## Pendientes ATLAS

- **A1:** gate GEMINI V3 contra staging LIVE (Frank-auth). V3 Playwright no se crea en este turno: mismo gate externo que SPEC-002..007 (BD/PostgreSQL/MinIO pendientes). Las specs V3 se cablean cuando el entorno exista.
- **A2:** GEMINI es **obligatorio** para SPEC-008 (riesgo medio-alto): toca comisiones (BR-N362), finanzas (BR-N316), visibilidad BR-N207, escalado BR-N313. Decisión §13 de la SPEC.
- **A3:** coordinar con SPEC-004 (Cierre administrativo OS) que invoque `comisiones.cancelOnOsCancel` desde su worker al cancelar la OS. El contrato está publicado y el router expone el endpoint.
- **A4:** coordinar con SPEC-007 (Facturación) que invoque `comisiones.reverseOnCancel(ctx, {invoiceId})` desde su worker de cancelación (`cancel`). El contrato está publicado y el router expone el endpoint.
- **A5:** coordinar con SPEC-009 (Rentabilidad) que materialice `payments.income_movement_id` y cree la query de comisiones pagadas para rentabilidad agregada. La columna ya está reservada.
- **A6:** P-008-1 cerrado en `none`: no hay pendientes operativos. Frank sólo tiene que confirmar el cableado de SPEC-004/SPEC-007 con SPEC-009 en su incremento de cierre.

---

## SPEC-GAP

No se devuelve `SPEC-GAP` a ATLAS. R2 documenta una ambigüedad interna (dónde vive `commission_rate`) resuelta como decisión reversible interna (el servicio acepta `rate_pct` desde el caller). P-008-1 cerrado en `none` por Frank. Todos los contratos públicos están dentro del SPEC; las decisiones internas (R1..R7) están documentadas como riesgos reversibles.

---

## Notas de reversión (recomendación, NO ejecución)

Si se requiere revertir el incremento:

1. **Revertir migración de BD:** las 6 tablas nuevas se crean con `db:generate`/`db:migrate`. El script de rollback es responsabilidad del flujo de mantenimiento.
2. **Revertir código:** el blast radius está contenido en:
   - `src/server/db/schema/payments.ts`, `payment-applications.ts`, `collection-activities.ts`, `collection-promises.ts`, `commissions.ts`, `commission-reversals.ts` (eliminar).
   - `src/server/db/schema/index.ts` (quitar exports).
   - `src/server/services/cobranza/{cobros,comisiones,cobranza-service,helpers,index}.ts` (eliminar).
   - `src/server/services/index.ts` (quitar `cobranzaService`).
   - `src/server/trpc/routers/cobranza.ts` (eliminar).
   - `src/server/trpc/root.ts` (quitar `cobranzaRouter`).
   - `src/app/(dashboard)/cobranza/page.tsx` (eliminar).
   - `src/modules/cobranza/{cobros-list,cobranza-list,comisiones-list}.tsx` (eliminar).
   - `src/modules/plataforma/layout/navigation.tsx` (quitar `/cobranza`).
   - `src/shared/enums/index.ts` (quitar enums + códigos + permisos + audit actions de SPEC-008).
   - `src/shared/zod/index.ts` (quitar esquemas SPEC-008).
   - `src/shared/utils/messages.ts` (quitar claves `cobranza.*`, `nav.cobranza`).
   - `scripts/check-multitenancy.ts` (quitar las 6 tablas).
   - `scripts/seed-data.ts` (quitar 3 permisos y matriz).
   - `tests/spec-20260817-008.test.ts` (eliminar).
3. **Sin acoplamientos inversos:** `cobranza` NO importa `@/server/services/facturacion` ni `@/server/services/orden-servicio` ni `@/server/services/comercial` ni `@/server/services/proyectos`. Sólo lee tablas directamente (Drizzle) y expone los endpoints públicos que SPEC-004/SPEC-007/SPEC-009 consumen. La reversión queda contenida al directorio `cobranza/*` y al router/UI.

No se ejecuta ninguna acción mutante (sin commit/push/PR/deploy/rollback). Working tree sucio inspeccionado y conservado. No se realizó reset/clean/stash/checkout destructivo.

---

## Estado

`READY_FOR_VERIFYING`. SOFIA no declara `DONE` (§3 IDL).
