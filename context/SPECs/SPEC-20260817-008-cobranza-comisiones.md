# SPEC-20260817-008 · Cobranza y Comisiones

- **ID:** SPEC-20260817-008
- **Estado:** BACKLOG (depende de SPEC-001, SPEC-003, SPEC-007 `READY`)
- **Versión:** 1.0
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-19 (v1.0)
- **Módulo funcional cubierto:** Cobros y aplicación, cobranza (plantillas de mensaje, promesas, escalado) y comisiones (estimada→devengada→liberada→pagada, sobre facturado, con reversa). Blocks B17, B19, B20.
- **ADRs de referencia:** ARCH-20260817-10 (comisión sobre facturado), ARCH-20260817-01, ARCH-20260819-03, ARCH-20260817-05, ARCH-20260817-07 (jobs).
- **Depende de:** SPEC-001 (plataforma, audit, jobs), SPEC-003 (cotización: `commission_rate`), SPEC-007 (facturas). **Es consultada por** SPEC-011 (cobranza de suscripciones, BR-N399) y SPEC-009 (movimientos de ingreso/costo).

---

## 1. Resultado
Registrar/confirmar/reversar cobros y aplicarlos a facturas sin exceder importe ni saldo (BR-012). Gestionar cobranza (promesas, escalado tras 2 incumplidas, plantillas de mensaje). Calcular comisiones **sobre facturado** (no cobrado): `liberada = estimada × facturado_no_cancelado / total_OS` con tope en la estimada (BR-N362), con reversa proporcional al cancelar factura (BR-N123). La comisión se tasa 1 sola vez por OS (BR-N241/298).

## 2. Fuentes funcionales por ID
- **DEC-FUN:** DEC-FUN-11 (Cobranza separada), DEC-FUN-16/49 (comisión sobre facturado), DEC-FUN-42 (1 tasa por OS), DEC-FUN-35 (reembolso proporcional con Director).
- **BR (B17/B19/B20):** BR-N33 v2, BR-N123, BR-N297..N300, BR-N314..N325, BR-N308/309 (aplicación).
- **Cálculo B26:** BR-N362 (comisión liberada), BR-N363 (facturado), BR-N364 (cobrado), BR-N365 (saldo factura).
- **Visibilidad:** ACTORES §3 (Vendedor no ve CxC/comisiones ajenas, BR-N207).

## 3. Alcance y exclusiones
### 3.1 Incluido
- `payments` (cobros: registrado→confirmado→reversado), `payment_applications` (a facturas), `collection_activities` (llamada/email/promesa), `collection_promises`, `commissions` (estimada→devengada→liberada→pagada +cancelada), `commission_reversals`. Escalado tras 2 promesas (BR-N313). Movimiento de ingreso al confirmar cobro (BR-N316; la cuenta vive en SPEC-009).
### 3.2 Excluido
- Facturas CFDI → SPEC-007. Cuentas/movimientos/rentabilidad agregada → SPEC-009 (esta SPEC sólo crea el movimiento de ingreso vinculado al cobro confirmado). Cierre administrativo OS (saldo cero) → SPEC-004 (consulta saldos de aquí).

## 4. Modelo técnico (contrato)
### 4.1 Entidades
- `payments (id, organization_id, client_id, amount_cents, status enum('registrado'|'confirmado'|'reversado'), method, reference, comprobante_file_id, confirmed_at, confirmed_by, reversed_at, reversed_reason, original_payment_id null, created_at)` (BR-N314-319). Registrado editable; confirmado sólo se reversa.
- `payment_applications (id, payment_id, invoice_id, amount_cents, created_at)` — suma no excede cobro ni saldo factura (BR-012/308).
- `collection_activities (id, organization_id, invoice_id null, client_id, type enum('llamada'|'email'|'promesa'|'otro'), notes, promised_amount_cents null, promised_date null, created_by, created_at)` (BR-N322/323).
- `collection_promises (id, invoice_id, promised_amount, promised_date, fulfilled boolean, count int)` — escalado tras 2 incumplidas (BR-N313/323).
- `commissions (id, organization_id, order_id, vendedor_user_id, rate_pct, estimated_cents, released_cents, status enum('estimada'|'devengada'|'liberada'|'pagada'|'cancelada'), paid_at null, paid_by null, created_at)` (BR-N300/297). 1 por OS (BR-N298).

### 4.2 Servicios
- `payments.register(ctx, paymentInput)` / `confirm(ctx, paymentId)` — al confirmar: crea movimiento de ingreso vinculado (BR-N316, cuenta en SPEC-009), aplica a facturas, audita (`cobro.confirm`).
- `payments.reverse(ctx, paymentId, reason)` — motivo + referencia al original (BR-N318); revierte aplicaciones.
- `commissions.estimate(ctx, orderId)` — nace al aceptar cotización si `rate>0` (BR-N297); `status='estimada'`.
- `commissions.release(ctx, orderId)` — calcula `liberada = estimada × facturado_no_cancelado / total_OS`, tope estimada (BR-N362); disparado al timbrar factura (SPEC-007); audita.
- `commissions.reverseOnCancel(ctx, invoiceId)` — al cancelar factura, reversa proporcional (BR-N123).
- `commissions.pay(ctx, commissionId)` — Director/Admin marcan pagada (default día 15, BR-N299); audita (`comision.pay`).
- `jobs.comisionesDia15` — recordatorio/pago (BR-N299); `jobs.escaladoCobranza` — tras 2 promesas (BR-N313).

## 5. Reglas e invariantes
1. Comisión sobre **facturado** (no cobrado), DEC-FUN-49, BR-N33 v2/N362.
2. `liberada = estimada × Σ(facturas no canceladas)/total_OS`, tope = estimada (BR-N362).
3. Cancelar factura reversa la proporción (BR-N123).
4. 1 tasa/1 comisión por OS (BR-N241/298); estimada nace al aceptar cotización si rate>0 (BR-N297).
5. Cobros: registrado editable, confirmado sólo reversa (BR-N315); al confirmar crea movimiento de ingreso (BR-N316).
6. Aplicaciones no exceden cobro ni saldo factura (BR-012/308).
7. Escalado tras 2 promesas incumplidas (BR-N313/323); plantillas de mensaje amable/firme/final (BR-N321).
8. Cobranza es módulo separado de Comercial (BR-N325).
9. Reembolso por cancelación de OS: proporcional al avance, aprobación Director (DEC-FUN-35).
10. Toda acción crítica (`cobro.confirm`, `comision.pay`) en `audit_logs` con rol usado (BR-N336).

## 6. Casos borde
- Aplicar cobro que excede saldo/cobro → `409 APPLICATION_EXCEEDS_BALANCE` (BR-012).
- Reversar cobro confirmado sin motivo → `400 REVERSE_REASON_REQUIRED` (BR-N318).
- Liberar comisión > estimada → topeado a estimada (BR-N362).
- Pagar comisión ya pagada → `409 COMMISSION_ALREADY_PAID`.
- Escalar sin 2 promesas incumplidas → no escala (BR-N313).

## 7. Seguridad/privacidad
- Vendedor no ve CxC/comisiones ajenas (BR-N207). Director/Admin ven todo financiero (BR-N209/211). Comprobantes de cobro vía enlaces firmados. Acciones críticas auditadas con `actor_role_code`.

## 8. Migración/compatibilidad
- Migración crea B17/B19/B20 + FK a `orders`/`invoices`/`clients`. La FK a `accounts` (movimiento de ingreso) la define SPEC-009 (movimiento vinculado).

## 9. Criterios de aceptación
- **AC-1 · Cobro confirmado crea ingreso + aplica:** `confirm` crea movimiento de ingreso vinculado (SPEC-009) + aplica a facturas sin exceder saldo; `registrado` editable, `confirmado` sólo reversa. (BR-N314-316/315)
- **AC-2 · Aplicaciones no exceden:** aplicar que excede saldo/cobro → `409 APPLICATION_EXCEEDS_BALANCE`. (BR-012/308)
- **AC-3 · Reversar con motivo + referencia:** `reverse` sin motivo → `400`; con motivo → `reversado` + referencia al original + revierte aplicaciones. (BR-N318)
- **AC-4 · Comisión sobre facturado:** `release` da `liberada = estimada × facturado_no_cancelado/total_OS` topeada a estimada; test con 2 facturas (1 cancelada). (BR-N362/33 v2)
- **AC-5 · Reversa al cancelar factura:** cancelar factura reversa proporcional de comisión liberada. (BR-N123)
- **AC-6 · 1 comisión/1 tasa por OS:** aceptar cotización crea 1 `commissions` con `rate_pct`; 2ª → `409`. (BR-N297/298/241)
- **AC-7 · Pago día 15:** `pay` marca `pagada` con `paid_by`; job `comisionesDia15` (BR-N299); doble pago → `409`.
- **AC-8 · Escalado 2 promesas:** tras 2 promesas incumplidas la factura escala (BR-N313/323); plantillas amable/firme/final (BR-N321).
- **AC-9 · Reembolso proporcional:** cancelar OS → reembolso proporcional al avance con aprobación Director (DEC-FUN-35); audita.
- **AC-10 · Cobranza separada + visibilidad:** Vendedor no ve CxC/comisiones ajenas (test seed 2 vendedores); Cobranza es módulo separado. (BR-N325/207)
- **AC-11 · UI/responsive:** tabla de cobranza (7 estados), registro de cobro con comprobante y gestión de promesas operables en 3 viewports. (ADR-03, DEC-FUN-72)

## 10. Validaciones
- `pnpm typecheck/test/test:e2e`; cálculo de comisión testeable (AC-4/5); grep: el servicio no duplica comisión por OS.

## 11. Rollback
- Revertir migración (drop B17/B19/B20) — aprobación Frank.

## 12. Riesgos y pendientes
- **R1:** precisión del cálculo de comisión (centavos, redondeo); mitigación: enteros cents + tests.
- **R2:** coordinación con SPEC-009 (movimiento de ingreso) y SPEC-007 (señal de timbrado para liberar).
- **P-008-1 (Frank):** none.

## 13. DoD
- AC-1..AC-11 PASS; trazabilidad a BR-N33/123/297-300/314-325/362; GEMINI **obligatorio** (toca finanzas, comisiones, reembolsos → §17).

## 14. Handoff a SOFIA (resumen)
- **SPEC activa:** SPEC-008. **ADRs:** 01, 03, 05, 07, 10. **Alcance:** `src/server/db/cobranza/*`, `src/server/services/{cobros,cobranza,comisiones}/*`, `src/server/trpc/routers/cobranza/*`, `src/modules/cobranza/*`. **Contratos protegidos:** fórmula comisión sobre facturado (BR-N362), reversa (BR-N123), `audit_logs`. **Contratos que cambian:** consume señal de timbrado (SPEC-007) y de cancelación de factura; crea movimiento de ingreso (consumido por SPEC-009). **Prohibido inferir:** facturas (SPEC-007), cuentas/movimientos (SPEC-009), cierre administrativo OS (SPEC-004).
