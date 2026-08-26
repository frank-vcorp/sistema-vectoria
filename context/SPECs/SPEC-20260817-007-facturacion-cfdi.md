# SPEC-20260817-007 · Facturación CFDI

- **ID:** SPEC-20260817-007
- **Estado:** BACKLOG (depende de SPEC-001, SPEC-002, SPEC-003 `READY`)
- **Versión:** 1.0
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-19 (v1.0)
- **Módulo funcional cubierto:** Facturación CFDI 4.0: timbrado vía Facturapi, cancelación con motivo SAT, conservación de UUID/XML/PDF, calendario de 7 estados, facturación recurrente nocturna, ZIP mensual contador, y la **factura borrador de renovación** consumida desde SPEC-011. Block B18.
- **ADRs de referencia:** ARCH-20260825-01 (integración Facturapi), ARCH-20260817-03 (secretos cifrados), ARCH-20260817-01, ARCH-20260819-03, ARCH-20260817-07 (jobs).
- **Depende de:** SPEC-001 (crypto CSD/API key, `files`, jobs pg-boss), SPEC-002 (cliente/datos fiscales), SPEC-003 (cotización/importes/tipo_cobro). **Es consumida por** SPEC-011 (renovación→factura borrador, BR-N406) y SPEC-008 (aplicación de cobros).

---

## 1. Resultado
El sistema timbra CFDI 4.0 directamente vía Facturapi (DEC-FUN-20260825-01, BR-N301), conserva UUID/XML/PDF, soporta cancelación con motivo SAT, calendario de cobranza de 7 estados, facturación recurrente nocturna y ZIP mensual para contador. Renovar una Suscripción (SPEC-011) crea aquí una **factura en borrador** del nuevo periodo; Facturación conserva revisión/timbrado/emisión (BR-N406, DEC-FUN-67).

## 2. Fuentes funcionales por ID
- **DEC-FUN:** DEC-FUN-08 (sin módulo Impuestos; ZIP contador), DEC-FUN-20260825-01 (timbrado real Facturapi), DEC-FUN-26 (ZIP auto mensual + manual), DEC-FUN-38 (ZIP sólo facturas activas), DEC-FUN-20260818-67 (renovar→factura borrador).
- **BR (B18):** BR-N301..N313. **BR-N406** (renovación→factura borrador, consumida). **Cálculo B26:** BR-N363/364/365 (facturado/cobrado/saldo factura).
- **FLOW:** cierre (factura final antes de cierre administrativo — BR-N393, SPEC-004).

## 3. Alcance y exclusiones
### 3.1 Incluido
- `invoices` (CFDI), `invoice_xml`/`invoice_pdf` (en `files`), cancelación con motivo SAT (01-04), calendario de 7 estados, facturación recurrente nocturna (BR-N310), ZIP mensual (BR-N311, sólo activas DEC-FUN-38), preview al usuario (BR-N303). Adaptador cliente PAC (ADR-09). **Factura borrador de renovación** creada a petición de SPEC-011.
### 3.2 Excluido
- Cobros/aplicación de cobro → SPEC-008. Comisiones → SPEC-008. Cierre administrativo OS → SPEC-004. CFDI de clientes externos (no hay; todo interno). La decisión de timbrar la factura borrador de renovación la toma Facturación tras revisión (SPEC-011 sólo la crea en borrador).

## 4. Modelo técnico (contrato)
### 4.1 Entidad `invoices`
- `id uuid PK, organization_id, order_id null FK→orders, subscription_id null FK→subscriptions (SPEC-011), client_id, client_fiscal_data_snapshot jsonb, status enum('borrador'|'emitida'|'parcialmente_pagada'|'pagada'|'vencida'|'cancelada'), concept jsonb (líneas CFDI), subtotal_cents, tax_cents, total_cents, cfdi_uuid text null, xml_file_id null FK→files, pdf_file_id null FK→files, issued_at null, due_date, paid_cents bigint default 0, cancel_motive_sat null enum('01'|'02'|'03'|'04'), cancelled_at null, created_at`. (BR-N306/304/305/307.)
- `invoice_schedules (id, order_id, subscription_id null, scheduled_date, amount_cents, auto_or_draft enum, status)` — facturación recurrente (BR-N310).

### 4.2 Servicios
- `invoices.build(ctx, orderId|subscriptionRenewal)` — arma comprobante CFDI 4.0 desde datos del cliente + OS/suscripción; preview (BR-N303); queda en `borrador`.
- `invoices.timbrar(ctx, invoiceId)` — envía al PAC (ADR-09); al éxito guarda `cfdi_uuid`+XML+PDF (BR-N304); `status='emitida'`; audita (`factura.timbrar`).
- `invoices.cancel(ctx, invoiceId, motivoSAT)` — motivo 01-04 (BR-N305); exige reversar/reasignar aplicaciones de cobro previas (BR-N309, SPEC-008); `status='cancelada'`; audita.
- `invoices.markVencida` — job: vence si `due_date < hoy` y saldo > 0 (BR-N307).
- `jobs.facturacionRecurrente` — nocturno: busca `invoice_schedules` con `scheduled_date=hoy`, crea factura (auto o borrador según config, BR-N310).
- `jobs.zipContador` — mensual auto + manual; sólo facturas activas (no canceladas, DEC-FUN-38/26); genera ZIP XML+PDF.
- `invoices.createDraftFromSubscriptionRenewal(ctx, subscriptionId, period)` — **consumido por SPEC-011**: crea factura en `borrador` del nuevo periodo; Facturación conserva revisión/timbrado/emisión (BR-N406).

## 5. Reglas e invariantes
1. Timbrado real vía PAC (no facturas externas, BR-N301); CSD/API key cifrados AES-256-GCM (BR-N302, ADR-03).
2. Tras timbrar, se conserva UUID+XML+PDF (BR-N304).
3. Cancelación exige motivo SAT 01-04 y reversar/reasignar cobros aplicados (BR-N305/309).
4. Estados factura (BR-N306); `vencida` si vencida con saldo (BR-N307).
5. Una factura recibe varias aplicaciones de cobro sin exceder importe del cobro ni saldo (BR-N308/012).
6. Facturación recurrente nocturna (BR-N310); ZIP mensual sólo activas (BR-N311/DEC-FUN-38).
7. Calendario 7 estados visuales (BR-N312); escalado tras 2 promesas (BR-N313, SPEC-008).
8. Factura borrador de renovación: SPEC-011 la crea; Facturación timbra tras revisión (BR-N406).
9. Toda acción crítica (`factura.timbrar`, `cancel`) en `audit_logs` (BR-N336).

## 6. Casos borde
- Timbrar sin CSD/API key configurados → `412 { code:'CSD_NOT_CONFIGURED' }` (BR-N302).
- Cancelar con aplicaciones de cobro sin reversar → `409 { code:'INVOICE_HAS_APPLICATIONS' }` (BR-N309).
- Cancelar sin motivo SAT válido → `400 { code:'INVALID_CANCEL_MOTIVE' }` (BR-N305).
- Factura con aplicaciones que exceden saldo → `409 { code:'APPLICATION_EXCEEDS_BALANCE' }` (BR-012/308).
- Facturación recurrente duplicada (mismo schedule mismo día) → idempotente (job_key, SPEC-001 AC-15).

## 7. Seguridad/privacidad
- CSD/API key cifrados (ADR-03); lectura/escritura auditada sin valor (SPEC-001 AC-11). XML/PDF en `files` con enlaces firmados (BR-N371). RFC/datos fiscales del cliente por rol. CFDI es dato financiero sensible → visibilidad Admin/Director (BR-N209/211).

## 8. Migración/compatibilidad
- Migración crea `invoices`/`invoice_schedules` + FK a `orders`/`files`. La FK a `subscriptions` la añade SPEC-011. Seed: ninguno.

## 9. Criterios de aceptación
- **AC-1 · Timbrado real con PAC:** `timbrar` envía al PAC (mock en test), guarda `cfdi_uuid`+XML+PDF en `files`; `status='emitida'`; `audit_logs` con `factura.timbrar`. Sin CSD → `412 CSD_NOT_CONFIGURED`. (BR-N301/302/304)
- **AC-2 · Cancelación motivo SAT + reversar aplicaciones:** cancelar con motivo 01-04 y aplicaciones previas reversadas → OK; sin motivo → `400`; con aplicaciones sin reversar → `409 INVOICE_HAS_APPLICATIONS`. (BR-N305/309)
- **AC-3 · Estados + vencida:** `markVencida` pone `vencida` si `due_date<hoy` y saldo>0; flujo `borrador→emitida→parcialmente_pagada→pagada`. (BR-N306/307)
- **AC-4 · Aplicaciones no exceden saldo:** aplicar cobro que excede saldo → `409 APPLICATION_EXCEEDS_BALANCE`; varias aplicaciones OK hasta el saldo. (BR-012/308)
- **AC-5 · Facturación recurrente idempotente:** job nocturno crea factura por schedule del día; re-correr con mismo `job_key` no duplica. (BR-N310, SPEC-001 AC-15)
- **AC-6 · ZIP mensual sólo activas:** `zipContador` incluye sólo facturas no canceladas; disponible auto (cierre mes) y manual. (BR-N311, DEC-FUN-38/26)
- **AC-7 · Calendario 7 estados + escalado:** el calendario muestra los 7 estados visuales (BR-N312); tras 2 promesas incumplidas escala (BR-N313, coordinado con SPEC-008).
- **AC-8 · Factura borrador de renovación (consumido por SPEC-011):** `createDraftFromSubscriptionRenewal` crea factura en `borrador`; Facturación la timbra tras revisión; Suscripciones no emite CFDI. (BR-N406, DEC-FUN-67)
- **AC-9 · Preview:** `build` muestra preview al usuario antes de timbrar (BR-N303).
- **AC-10 · UI/responsive:** listado de facturas (7 estados), preview CFDI y diálogo de cancelación operables en 3 viewports; el preview scrolla en móvil. (ADR-03, DEC-FUN-72)

## 10. Validaciones
- `pnpm typecheck/test/test:e2e`; el cliente PAC es adaptador out (hexagonal, AC-27 SPEC-001); sin reglas de negocio en el adaptador.

## 11. Rollback
- Revertir migración (drop B18) — aprobación Frank; los CFDI son datos fiscales.

## 12. Riesgos y pendientes
- **R1:** dependencia externa PAC (disponibilidad, latencia); mitigación: reintentos/DLQ (ADR-07).
- **R2:** CSD vigente (caducidad SAT); procedimiento operativo de renovación (Frank).
- **P-007-1 (Frank):** Live Secret Key de Facturapi y autorización de producción; Test Secret Key ya probada en staging, no se persiste en documentación.

## 13. DoD
- AC-1..AC-10 PASS; trazabilidad a BR-N301-313/N406; GEMINI **obligatorio** (toca CSD secretos, CFDI fiscal, integración externa → §17: secretos + finanzas + infra).

## 14. Handoff a SOFIA (resumen)
- **SPEC activa:** SPEC-007. **ADRs:** 01, 03, 07, 20260825-01. **Alcance:** `src/server/db/facturacion/*`, `src/server/services/facturacion/*`, `src/server/trpc/routers/facturacion/*`, adaptador Facturapi `src/server/integrations/pac/*`. **Contratos protegidos:** secreto cifrado, UUID/XML/PDF, motivo SAT, `audit_logs`. **Contratos que cambian:** proveedor externo y payload del adaptador; crea factura borrador consumida por SPEC-011. **Prohibido inferir:** cobros/comisiones (SPEC-008), cierre administrativo OS (SPEC-004), el schedule de renovación (SPEC-011), Live/producción.
