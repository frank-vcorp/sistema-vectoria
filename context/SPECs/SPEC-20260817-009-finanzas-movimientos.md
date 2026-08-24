# SPEC-20260817-009 · Finanzas y movimientos

- **ID:** SPEC-20260817-009
- **Estado:** BACKLOG (depende de SPEC-001, SPEC-005, SPEC-008 `READY`)
- **Versión:** 1.0
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-19 (v1.0)
- **Módulo funcional cubierto:** Cuentas, movimientos, transferencias, costos directos, rentabilidad por proyecto/técnico y cierre administrativo de OS (saldo total cero). Blocks B21, B26 (cálculos financieros).
- **ADRs de referencia:** ARCH-20260817-12 (rentabilidad por técnico y costos), ARCH-20260817-01, ARCH-20260819-03, ARCH-20260817-05.
- **Depende de:** SPEC-001 (plataforma, audit, `time_entries` snapshot costo/hora), SPEC-005 (proyectos/costo laboral), SPEC-008 (movimiento de ingreso al confirmar cobro, comisiones pagadas). **Es consultada por** SPEC-004 (cierre administrativo: saldo total cero).

---

## 1. Resultado
Llevar cuentas y movimientos financieros (ingresos/gastos/transferencias/costos), calcular costos (laboral+directo) y rentabilidad por proyecto y por técnico, y proveer el saldo total pendiente que SPEC-004 usa para el cierre administrativo de la OS. CxC nacen de facturas; CxP son básicas; transferencias internas son entradas+salidas vinculadas (no ingreso ni gasto operativo).

## 2. Fuentes funcionales por ID
- **DEC-FUN:** DEC-FUN-08 (sin módulo Impuestos), DEC-FUN-24 (CxC/CxP tabla default + calendario filtro), DEC-FUN-25 (rentabilidad por técnico), DEC-FUN-27 (transferencias paso explícito).
- **BR (B21/B26):** BR-013/014/015, BR-N326..N335, BR-N278..N282 (costos), BR-N330/331 (fechas/estados movimiento), BR-N332/333/334.
- **Visibilidad:** ACTORES §3 (Director todo; Admin financiero; técnicos no ven costos ajenos, BR-N207/208).

## 3. Alcance y exclusiones
### 3.1 Incluido
- `accounts`, `transactions` (movimientos: borrador→confirmado→conciliado +cancelado/reversado), `transfers` (entrada+salida vinculadas), `direct_costs` (imputados a proyecto), rentabilidad por proyecto/técnico, saldo total OS (para SPEC-004). CxC desde facturas (BR-N332); CxP básicas. Calendario como filtro visual (DEC-FUN-24).
### 3.2 Excluido
- Facturas CFDI → SPEC-007. Cobros/comisiones → SPEC-008 (esta SPEC recibe el movimiento de ingreso vinculado). ZIP contador → SPEC-007. Pólizas de impuestos (no existen, DEC-FUN-08).

## 4. Modelo técnico (contrato)
### 4.1 Entidades
- `accounts (id, organization_id, name, type enum('activo'|'pasivo'|'capital'|'ingreso'|'gasto'), currency, opening_balance_cents, active)`.
- `transactions (id, organization_id, account_id, type enum('ingreso'|'gasto'|'transferencia'|'capital'), amount_cents, status enum('borrador'|'confirmado'|'conciliado'|'cancelado'|'reversado'), operation_date, due_date, paid_date, linked_payment_id null, linked_order_id null, project_id null, linked_commission_id null, reason, reconciled_at null, created_by, created_at)` (BR-N331/330). Conciliado no se edita/elimina (BR-013).
- `transfers (id, out_transaction_id, in_transaction_id, created_at)` — entrada+salida vinculadas; no ingreso ni gasto operativo (BR-N326, DEC-FUN-27).
- `direct_costs (id, organization_id, project_id, transaction_id FK, amount_cents, description, confirmed_or_conciliated boolean, created_at)` — imputados al proyecto cuando el movimiento es gasto confirmado/conciliado (BR-N333).

### 4.2 Servicios
- `transactions.record(ctx, input)` / `confirm(ctx, id)` / `reconcile(ctx, id)` — `conciliado` inmutable (BR-013); correcciones por cancelación/reverso con motivo+autorización (BR-N329/014).
- `transfers.create(ctx, fromAccountId, toAccountId, amount)` — crea salida+entrada vinculadas (BR-N326).
- `finance.projectCost(ctx, projectId)` — costo laboral (Σ time_entries × costo/hora snapshot, BR-N278/334) + costo directo (Σ direct_costs confirmados/conciliados, BR-N279/333) = costo total (BR-N280).
- `finance.projectMargin(ctx, projectId)` — margen bruto vendido = importe vendido − costo total (BR-N281).
- `finance.profitabilityByTechnician(ctx, projectId)` — desglose por técnico (DEC-FUN-25, BR-N282).
- `finance.osOutstandingBalance(ctx, orderId)` — saldo total pendiente = facturado − cobrado confirmado + ... (para SPEC-004 cierre administrativo, BR-N249).
- Préstamo/aportación no son venta (BR-N327); retiro de socio no es gasto operativo (BR-N328).

## 5. Reglas e invariantes
1. Movimiento `conciliado` no se edita ni elimina (BR-013); correcciones por reverso con motivo (BR-N329/014).
2. Transferencia = entrada+salida vinculadas; no cuenta como ingreso ni gasto operativo (BR-N326, DEC-FUN-27).
3. CxC nacen de facturas; CxP básicas (BR-N332).
4. Costo directo imputado al proyecto sólo si el movimiento es gasto confirmado/conciliado (BR-N333).
5. Costo laboral = Σ horas × costo/hora **vigente al registro** (snapshot, BR-N278/334).
6. Costo total = laboral + directo (BR-N280); margen = vendido − costo total (BR-N281); rentabilidad desglosada por técnico (BR-N282, DEC-FUN-25).
7. Préstamo/aportación ≠ venta; retiro de socio ≠ gasto operativo (BR-N327/328).
8. Importes vendido/facturado/cobrado se calculan y muestran por separado (BR-015).
9. Saldo de cuenta = balance inicial + entradas confirmadas − salidas confirmadas (BR-N366).
10. Cierre administrativo OS exige saldo total cero o excepción Director (BR-N249/N394, SPEC-004).

## 6. Casos borde
- Editar movimiento `conciliado` → `409 RECONCILED_IMMUTABLE` (BR-013).
- Transferencia sin ambas patas → `400` (BR-N326).
- Imputar costo directo a proyecto con movimiento no confirmado/conciliado → `409 COST_NOT_CONFIRMED` (BR-N333).
- Cierre administrativo con saldo ≠ 0 (SPEC-004 consulta `osOutstandingBalance`) → bloqueo.

## 7. Seguridad/privacidad
- Finanzas visible para Director/Admin (BR-N209/211); técnicos no ven costos ajenos (BR-N207/208). Acciones críticas (`transactions.reconcile`, `transfers.create`) auditadas con `actor_role_code`.

## 8. Migración/compatibilidad
- Migración crea B21 + FK a `projects`/`orders`/`payments`/`commissions`. Seed: cuenta(s) inicial(es) (configurable Frank).

## 9. Criterios de aceptación
- **AC-1 · Movimiento conciliado inmutable:** editar/eliminar `conciliado` → `409 RECONCILED_IMMUTABLE`; corrección por reverso con motivo. (BR-013/N329)
- **AC-2 · Transferencia vinculada:** `transfers.create` genera salida+entrada vinculadas; no suma ingreso ni gasto operativo en reportes. (BR-N326, DEC-FUN-27)
- **AC-3 · Costo laboral snapshot:** `projectCost` suma `time_entries × cost_per_hour` snapshot al registro (no el vigente actual). (BR-N278/334)
- **AC-4 · Costo directo condicional:** imputar costo directo con movimiento no confirmado/conciliado → `409`; con confirmado → imputado. (BR-N333/279)
- **AC-5 · Costo total + margen:** `costo total = laboral + directo` (BR-N280); `margen = vendido − costo total` (BR-N281).
- **AC-6 · Rentabilidad por técnico:** `profitabilityByTechnician` desglosa por técnico (no agregado). (DEC-FUN-25, BR-N282)
- **AC-7 · CxC desde facturas:** las CxC nacen de facturas (BR-N332); CxP básicas; calendario es filtro visual (DEC-FUN-24).
- **AC-8 · Préstamo/retiro no operativos:** préstamo/aportación no son venta; retiro de socio no es gasto operativo (test de clasificación). (BR-N327/328)
- **AC-9 · Vendido/facturado/cobrado separados:** reportes calculan y muestran los 3 por separado (BR-015).
- **AC-10 · Saldo OS para cierre administrativo:** `osOutstandingBalance` alimenta a SPEC-004; saldo total cero (o excepción Director) habilita `closed`. (BR-N249/N394)
- **AC-11 · UI/responsive:** tabla CxC/CxP (con filtro calendario) y reporte de rentabilidad operables en 3 viewports; la tabla de rentabilidad por técnico es scroll/card en móvil. (ADR-03, DEC-FUN-72)

## 10. Validaciones
- `pnpm typecheck/test/test:e2e`; cálculos financieros en centavos enteros; grep: transferencias no se clasifican como ingreso/gasto operativo.

## 11. Rollback
- Revertir migración (drop B21) — aprobación Frank.

## 12. Riesgos y pendientes
- **R1:** precisión financiera (centavos, redondeo); mitigación: bigint cents + tests.
- **R2:** coordinación con SPEC-008 (movimiento de ingreso al confirmar cobro) y SPEC-004 (saldo para cierre).
- **P-009-1 (Frank):** cuentas iniciales a sembrar (acciones infraestructurales).

## 13. DoD
- AC-1..AC-11 PASS; trazabilidad a BR-013-015/N326-335/278-282; GEMINI **obligatorio** (toca finanzas, costos, rentabilidad, cierre administrativo → §17).

## 14. Handoff a SOFIA (resumen)
- **SPEC activa:** SPEC-009. **ADRs:** 01, 03, 05, 12. **Alcance:** `src/server/db/finanzas/*`, `src/server/services/finanzas/*`, `src/server/trpc/routers/finanzas/*`, `src/modules/finanzas/*`. **Contratos protegidos:** movimiento `conciliado` inmutable, fórmulas de costo/margen/rentabilidad, `audit_logs`. **Contratos que cambian:** consume movimiento de ingreso (SPEC-008), `time_entries` (SPEC-006); produce `osOutstandingBalance` (consumido por SPEC-004). **Prohibido inferir:** facturas (SPEC-007), cobros/comisiones (SPEC-008), cierre administrativo OS (SPEC-004).
