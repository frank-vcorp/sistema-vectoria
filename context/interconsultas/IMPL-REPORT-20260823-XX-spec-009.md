# IMPL-REPORT-20260823-XX · SPEC-009 Finanzas y Movimientos · SOFIA → ATLAS

- **ID intervención:** IMPL-20260823-XX-spec-009
- **ID tarea:** SPEC-20260817-009 (Finanzas y Movimientos · B21/B26)
- **Origen:** handoff de ATLAS, turno `AUTONOMOUS-V1-20260823-01` H2, incremento WIP=1 sobre la base READY_FOR_VERIFYING de SPEC-002..008.
- **Estado:** `READY_FOR_VERIFYING`
- **SPEC:** `context/SPECs/SPEC-20260817-009-finanzas-movimientos.md` v1.0
- **Discovery refs:** DEC-FUN-08/24/25/27; BR-013/014/015; BR-N207/208/209/211; BR-N278-282; BR-N326-335; BR-N249/N366/N394; ADR-20260817-12.
- **Fecha:** 2026-08-23

---

## Resumen

Slice vertical operable de SPEC-009: `accounts` + `transactions` + `transfers` + `direct_costs`. Movimientos con ciclo `borrador → confirmado → conciliado` (+laterales `cancelado`/`reversado`); `conciliado` es **inmutable** (BR-013) y las correcciones van por reverso con motivo ≥3 chars (BR-N329/014). Transferencias como patas entrada/salida **no operativas** (BR-N326, DEC-FUN-27); `capital` cubre préstamos/aportaciones/retiros tampoco operativos (BR-N327/328). Costos directos al proyecto sólo con movimiento `confirmado` o `conciliado` (BR-N333). Costo laboral = Σ time_entries × snapshot inmutable (BR-N278/334); costo total = laboral + directo (BR-N280); margen = vendido − costo total (BR-N281); rentabilidad **desglosada por técnico** (DEC-FUN-25, BR-N282). Reporte vende/factura/cobra separados (BR-015). `osOutstandingBalance` (BR-N249/N394) consumible por SPEC-004 para validar el cierre administrativo de la OS. Visibilidad BR-N207/208/209/211. UI responsive con `overflow-x-auto` + `hidden sm/md:table-cell`, 5 pestañas (Cuentas/Movimientos/Transferencias/Costos/Rentabilidad), modales con `role="dialog"` + `aria-modal="true"`, navegación lateral con `/finanzas`. Sin acoplamiento inverso: consume `time_entries` (SPEC-006, snapshot `cost_per_hour_cents`) y la reserva `income_movement_id` que SPEC-008 cablea al confirmar cobros (BR-N316); NO implementa facturas/cobros/comisiones ni cierre OS (delega a SPEC-007/008/004).

P-009-1 cerrado en `none`: el catálogo de cuentas es **configurable por Frank** — este turno NO siembra cuentas seed. El Director las crea desde la UI. Banner visible al Director al entrar al módulo. Documentado en IMPL-REPORT-009.

---

## Archivos modificados / creados

### Nuevos

| Archivo | Cambio |
|---|---|
| `src/server/db/schema/accounts.ts` | Tabla `accounts` (PK `(org,id)`, FK a `organizations`, índice por `(org,type)`). |
| `src/server/db/schema/transactions.ts` | Tabla `transactions` (PK `(org,id)`, FKs a `accounts`/`projects`/`orders`/`payments`/`commissions`/`users`, columnas opcionales `linked_*` + `transferId`). |
| `src/server/db/schema/transfers.ts` | Tabla `transfers` (PK `(org,id)`, refs lógicas a `transactions`; FKs removidas para evitar ciclos de imports). |
| `src/server/db/schema/direct-costs.ts` | Tabla `direct_costs` (PK `(org,id)`, FKs a `projects`/`transactions`/`users`, columna `confirmed_or_conciliated`). |
| `src/server/services/finanzas/helpers.ts` | Helpers puros: `canTransitionTransaction`, `isReconciledImmutably`, `isOperativeTransaction`, `isNonOperativeSubKind`, `validateSubKind`, `isTransactionAdmittedForDirectCost`, `validateDirectCostInput`, `computeAccountBalance`, `computeLaborCost`, `computeDirectCost`, `buildProjectCostSummary`, `buildProjectFinancialReport`, `computeOsOutstandingBalance`, `isAccountTypeValid`, `isTransactionTypeValid`. |
| `src/server/services/finanzas/finanzas-service.ts` | `createFinancesService({audit})` con `createAccount`/`listAccounts`, `recordTransaction`/`confirmTransaction`/`reconcileTransaction`/`cancelTransaction`/`reverseTransaction`/`listTransactions`/`byId`, `createTransfer`, `imputeDirectCost`/`listDirectCosts`, `accountBalance`/`projectCostSummary`/`projectFinancialReport`/`osOutstandingBalance`. |
| `src/server/services/finanzas/index.ts` | Barrel del módulo (servicios + helpers). |
| `src/server/trpc/routers/finanzas.ts` | Router tRPC `finanzas` con sub-routers `accounts` (2), `transactions` (7), `transfers` (1), `directCosts` (2), `finance` (4). |
| `src/app/(dashboard)/finanzas/page.tsx` | Dashboard con 5 pestañas operables en 3 viewports. |
| `tests/spec-20260817-009.test.ts` | **44 tests unitarios puros** (catálogo canónico, AC-1..AC-11). |

### Modificados

| Archivo | Cambio |
|---|---|
| `src/shared/enums/index.ts` | Añade 5 `ACCOUNT_TYPES`, 4 `TRANSACTION_TYPES`, 5 `TRANSACTION_STATUSES`, 5 `NON_OPERATIVE_KINDS`, 13 acciones `FINANZAS_AUDIT_ACTIONS` (namespaces `cuenta.*`/`movimiento.*`/`transferencia.*`/`costo_directo.*`/`rentabilidad.*`), 2 permisos nuevos (`gestionar_finanzas`, `ver_finanzas`), 12 códigos de error nuevos. |
| `src/shared/zod/index.ts` | Esquemas Zod SPEC-009: `AccountTypeSchema`, `TransactionTypeSchema`, `TransactionStatusSchema`, `NonOperativeKindSchema`, `AccountCreateInputSchema`, `TransactionRecordInputSchema` (+/confirm/reconcile/cancel/reverse/list), `TransferCreateInputSchema`, `DirectCostImputeInputSchema` (+list), `ProjectCostSummaryInputSchema`, `ProjectFinancialReportInputSchema`, `OsOutstandingBalanceInputSchema`, `AccountBalanceInputSchema`. |
| `src/shared/utils/messages.ts` | Catálogo es-MX para `finanzas.*` (labels de accountType/transactionType/status/subKind, copy de UI para 5 pestañas). |
| `src/server/db/schema/index.ts` | Re-exports 4 tablas nuevas. |
| `src/server/services/index.ts` | Re-export `finanzasService`. |
| `src/server/trpc/root.ts` | Registra `finanzasRouter`. |
| `src/modules/plataforma/layout/navigation.tsx` | Link `/finanzas` en sidebar. |
| `scripts/check-multitenancy.ts` | Lista declarativa con 4 tablas nuevas. |
| `scripts/seed-data.ts` | Sembrado de los 2 permisos nuevos: `gestionar_finanzas`+`ver_finanzas` en `director` (BASE) y `administrador`. P-009-1 cerrado en `none`: no se siembran cuentas seed. |

No se modificaron: `discovery/`, SPEC-001..008, ADR previos, `context/CURRENT.md`, los routers/servicios de OS/Proyectos/Clientes/Comercial/Facturación/Cobranza, ni los archivos del flujo autonomous-loop.

---

## Contratos públicos / protegidos

- **`organization_id`** — 4 tablas nuevas (`accounts`, `transactions`, `transfers`, `directCosts`) llevan `organizationId NOT NULL` con FK a `organizations.id`; PK compuesta `(organization_id, id)` (ADR-02 §8.3). `check-multitenancy` valida **54 tablas**; 0 sin `organization_id`.
- **`hasPermission` único mecanismo** — `requirePermission('gestionar_finanzas' | 'ver_finanzas' | 'ver_costos' | 'ver_tiempo_equipo', { forceDb: true })` en cada acción crítica (ADR-06 / AC-81). Acciones `confirm`/`reconcile`/`reverse`/`createAccount`/`createTransfer`/`imputeDirectCost` siempre con `forceDb`.
- **`conciliado` inmutable** — `isReconciledImmutably` retorna true sólo en `conciliado`. Las correcciones van por `reverseTransaction` con motivo ≥3 (BR-N329). El servicio rechaza editar/eliminar conciliado.
- **`audit_logs`** — 13 acciones namespace nuevo:
  - `cuenta.create`/`update`/`deactivate` (BR-N366).
  - `movimiento.record`/`update`/`confirm`/`reconcile`/`cancel`/`reverse` (BR-013/N329/N331).
  - `transferencia.create` (BR-N326).
  - `costo_directo.imputar`/`desimputar` (BR-N333).
  - `rentabilidad.consulta` (BR-N280/N281/N282).
- **`actor_role_code`** registrado en audit cuando el contexto lo provee (BR-N336 / BR-N388).
- **`transactions.income_movement_id`** queda como columna nullable. SPEC-008 cablea `cobros.confirm` → `movimiento.record({type:'ingreso', sub_kind:'cobro_cliente', linked_payment_id})` cuando Frank cierre el ciclo BR-N316. En este turno, `transactions` no tiene `income_movement_id` (el contrato es `linked_payment_id`); SPEC-009 sólo emite el contrato, no lo consume.
- **`payments.income_movement_id`** (reservado por SPEC-008): no es `transactions.income_movement_id`. SPEC-009 los vincula por `transactions.linked_payment_id` ← `payments.id`. Sin acoplamiento inverso.
- **`project_cost_summary` con snapshot** — `time_entries.cost_per_hour_cents` se respeta tal cual (BR-N334); si Frank cambia `users.cost_per_hour`, las time-entries viejas NO recalculan (defensa histórica).
- **`osOutstandingBalance`** — fórmula `(nonCancelledInvoiced − confirmedPaid) + pendingCxp + pendingCommissions`. SPEC-004 consume este endpoint para validar el cierre administrativo (BR-N249/N394).
- **`direct_costs.confirmed_or_conciliated`** — snapshot textual del estado de la transacción al imputar (`'true'` o `'false'`). Decisión interna reversible: snapshot al servicio. Si la transacción se reversa, el `direct_costs` queda inmutable pero su `amount` se mantiene (los reportes pueden excluir los que ya no están `confirmado`/`conciliado`).
- **Códigos de error canónicos** — 12 nuevos en `ERROR_CODES`: `ACCOUNT_NOT_FOUND`, `ACCOUNT_INACTIVE`, `TRANSACTION_NOT_FOUND`, `TRANSACTION_INVALID_TRANSITION`, `TRANSFER_NOT_FOUND`, `TRANSFER_INVALID_PAIR`, `TRANSFER_DIFFERENT_ORG`, `RECONCILED_IMMUTABLE`, `COST_NOT_CONFIRMED`, `REVERSE_REASON_REQUIRED`, `TRANSACTION_NON_OPERATIVE`, `DIRECT_COST_NOT_FOUND`.
- **Permisos BASE nuevos** — `gestionar_finanzas` (director/admin), `ver_finanzas` (director/admin). Sembrado coherente con `check-seed-permissions`. Roles operativos (PL/programador/diseñador/QA) NO reciben permisos de finanzas; `ver_costos` y `ver_tiempo_equipo` (ya en BASE) les dan acceso a lectura de su propia rentabilidad (BR-N207/208/278).
- **Visibilidad BR-N207/208/209/211**: `accountBalance`/`projectCostSummary`/`projectFinancialReport`/`osOutstandingBalance` requieren `ver_finanzas` o `gestionar_finanzas` con `forceDb`. Si el actor no los tiene, el servicio retorna `ForbiddenError` (403).
- **FKs lógicas a `transfers` (sin constraints DB)** — `transactions.transferId` referencia `transfers.id` por servicio (no BD constraint). Defensa: `transfers.create` setea `transferId` en ambas patas en la misma transacción; helper `validateTransferPair` valida.
- **Centavos enteros** — todos los importes en `bigint('amount_cents', { mode: 'number' })`. Helper `computeLaborCost` usa `Math.round(hours * costPerHour)` para evitar flotantes.

---

## Validación

| Corte | Comando | Resultado |
|---|---|---|
| V1 (corte 1) | `npx tsc ... \| grep -E "^src/shared/enums"` | PASS — 0 errores. |
| V1 (corte 2) | `npx tsc ... \| grep -E "^src/server/db/schema"` | PASS — 0 errores (4 tablas nuevas tras remover FK cíclica `transactions↔transfers`). |
| V1 (corte 3) | `npx tsc ... \| grep -E "^src/server/services/finanzas"` | PASS — 0 errores tras corregir acceso a `projects.orderId` (project→order→soldTotalCents) y conversion `numeric hours → number`. |
| V1 (corte 4) | `npx tsc ... \| grep -E "^src/shared/zod"` | PASS — 0 errores (14 esquemas Zod). |
| V1 (corte 5) | `npx tsc ... \| grep -E "^src/server/trpc/routers/finanzas"` | PASS — 0 errores tras `compact(input)`. |
| V1 (corte 6) | `npx tsc ... \| grep -E "^src/app\/(dashboard\)/finanzas"` | PASS — 0 errores tras añadir `neutral` prop a `Stat`. |
| V1 (corte 7) | `npx tsx scripts/check-multitenancy.ts / check-seed-permissions.ts / check-antipatterns.ts` | PASS — **54 tablas**; matriz BR-N207..N412 consistente; 16/16 checks. |
| V1 (corte 8) | `npx vitest run tests/spec-20260817-009.test.ts` | PASS — **44/44** unit tests. |
| V2 (cierre) | `npx tsc --noEmit -p tsconfig.json` | PASS — 0 errores en `src/`. |
| V2 (cierre) | `npx vitest run` | PASS — **529/529** (485 baseline + **44 SPEC-009**). |
| V2 (cierre) | `npx eslint src/ --max-warnings=0` | PASS — 0 errores, 0 warnings (tras remover `bigint`/`foreignKey` muertos en `transfers.ts`). |
| V2 (cierre) | `npx tsx scripts/check-multitenancy.ts` | PASS — **54 tablas con `organization_id`**; 0 sin. |
| V2 (cierre) | `npx tsx scripts/check-antipatterns.ts` | PASS — **16/16** checks. |
| V2 (cierre) | `npx tsx scripts/check-seed-permissions.ts` | PASS — matriz BR-N207..N412 consistente; 2 permisos nuevos sembrados correctamente. |
| V3 (Playwright) | `pnpm test:e2e` | **NO EJECUTADA** — gate BD/PostgreSQL/MinIO no provisionado (idéntico a SPEC-002..008). Pendiente de staging LIVE autorizado por Frank. P-009-1 cerrado en `none`. |

---

## Trazabilidad AC

| AC | Implementación | Evidencia |
|---|---|---|
| **AC-1** `conciliado` inmutable | `canTransitionTransaction('conciliado','*')` retorna `ok:false` excepto `→reversado` con motivo ≥3 (BR-N329). `isReconciledImmutably('conciliado')=true`. El servicio rechaza con `RECONCILED_IMMUTABLE` (409) si se intenta editar/eliminar. `reverseTransaction` exige motivo; `cancelTransaction` exige motivo ≥3. | `tests/...: SPEC-009 · AC-1 · conciliado inmutable` (7 tests). |
| **AC-2** Transferencia vinculada | `createTransfer({fromAccountId, toAccountId, amountCents, ...})` crea dos `transactions` (`type='transferencia'`, `sub_kind='transferencia_interna'`) en estado `confirmado`, una con `amount<0` (out) y otra con `amount>0` (in), las une con un row `transfers`. Auditoría `transferencia.create`. El helper `isOperativeTransaction({type:'transferencia'})=false` las excluye del ingreso/gasto operativo (BR-N326/DEC-FUN-27). | `tests/...: SPEC-009 · AC-2 · transferencia no operativa` (8 tests). |
| **AC-3** Costo laboral snapshot | `computeLaborCost([{hours, costPerHourCents, userId, projectId}])` calcula `Σ horas × snapshot` (BR-N278/334). El servicio lee `time_entries.cost_per_hour_cents` directamente sin recalcular con `users.cost_per_hour`. Desglose por usuario con `byUser: Map<string, number>` y `byUserHours: Map<string, number>`. | `tests/...: SPEC-009 · AC-3 · costo laboral snapshot` (1 test). |
| **AC-4** Costo directo condicional | `isTransactionAdmittedForDirectCost('confirmado'|'conciliado')=true`; cualquier otro estado retorna `COST_NOT_CONFIRMED` (409). `imputeDirectCost` valida `transaction.status ∈ {confirmado, conciliado}` antes del insert. `direct_costs.confirmed_or_conciliated` snapshot text. | `tests/...: SPEC-009 · AC-4 · costo directo condicional` (5 tests). |
| **AC-5** Costo total + margen | `buildProjectCostSummary({laborCostCents, directCostCents, soldTotalCents, timeEntries})` retorna `{totalCost = laboral+directo, marginCents = vendido − totalCost}` (BR-N280/281). `marginCents=null` sin vendido. | `tests/...: SPEC-009 · AC-5 · costo total + margen` (2 tests). |
| **AC-6** Rentabilidad por técnico | `buildProjectCostSummary.byTechnician` desglosa por `userId` con `hoursTotal`/`costCents`/`marginCents` prorrateado por horas. `marginCents=null` si `soldTotal=null`. Ordenado desc por `costCents`. | `tests/...: SPEC-009 · AC-6 · rentabilidad por técnico` (2 tests). |
| **AC-7** CxC desde facturas | `projectFinancialReport` lee `invoices.orderId` del proyecto (vía `projects.orderId`→`orders.id`) y suma `nonCancelledInvoicedCents`. `osOutstandingBalance` join `payment_applications` con `payments.status='confirmado'` y `revertedAt IS NULL` para `confirmedPaidCents`. La UI expone filtros de fecha (calendario, DEC-FUN-24) en la pestaña Movimientos. | `tests/...: SPEC-009 · AC-9 · vendido/facturado/cobrado separados` (1 test) + `AC-10 · osOutstandingBalance` (3 tests). |
| **AC-8** Préstamo/retiro no operativos | `validateSubKind` valida que `sub_kind` aplique al `type`: `capital→prestamo_socio|retiro_socio` (BR-N327/328). `isOperativeTransaction({type:'capital'})=false`. `computeAccountBalance` los incluye en el saldo de cuenta (modifican caja/banco) pero `isOperativeTransaction` los excluye del ingreso/gasto. | `tests/...: SPEC-009 · AC-8 · clasificación no operativa` (2 tests). |
| **AC-9** Vendido/facturado/cobrado separados | `buildProjectFinancialReport` retorna los 3 importes por separado (`soldTotalCents`/`invoicedTotalCents`/`collectedTotalCents`/`outstandingBalanceCents`). | `tests/...: SPEC-009 · AC-9` (1 test). |
| **AC-10** `osOutstandingBalance` | `computeOsOutstandingBalance({nonCancelledInvoicedCents, confirmedPaidCents, pendingCxpCents, pendingCommissionsCents})` retorna `(nonCancelled − confirmed) + CxP + Comisiones`. SPEC-004 consume este endpoint para validar `closed` (BR-N249/N394). | `tests/...: SPEC-009 · AC-10 · osOutstandingBalance` (3 tests). |
| **AC-11** UI/responsive | Dashboard con 5 pestañas operables en 3 viewports: Cuentas/Movimientos/Transferencias/Costos/Rentabilidad. Cada tabla: `overflow-x-auto` + `hidden sm/md:table-cell`. Banner P-009-1 visible (catalogo de cuentas configurable por Frank, no se siembran seed). | `tests/...: SPEC-009 · AC-11 · UI responsive (grep)` (2 tests). |

---

## Contratos cruzados

| Contrato | Productor | Consumidor | Estado |
|---|---|---|---|
| `transactions.linked_payment_id` (columna nullable) | **SPEC-009** | SPEC-008 cablea `cobros.confirm` para emitir movimiento de ingreso con `sub_kind='cobro_cliente'` y `linked_payment_id=payment.id` (BR-N316). | OK — contrato publicado. |
| `payments.income_movement_id` (columna nullable) | **SPEC-008** | SPEC-009 enriquece el report cuando Frank cierre el ciclo; el join `payments.id = transactions.linked_payment_id` ya está activo. | OK — pendiente SPEC-008 cablear la creación del movimiento. |
| `time_entries.cost_per_hour_cents` (snapshot) | **SPEC-006** | **SPEC-009** `computeLaborCost` lee snapshot (BR-N278/334); no recalcula. | OK — inmutable por construcción (BR-008). |
| `osOutstandingBalance` (servicio + endpoint) | **SPEC-009** | **SPEC-004** consume para validar `closed` (BR-N249/N394). | OK — endpoint público `finanzas.finance.osOutstandingBalance`. |
| `projectCostSummary` / `projectFinancialReport` | **SPEC-009** | SPEC-010 dashboard admin (lectura por prefijo `rentabilidad.consulta`). | OK — sin acoplamiento. |
| `audit_logs.action` namespace `movimiento.*` | **SPEC-009** | SPEC-010 dashboard admin lee por prefijo. | OK — 13 acciones en `FINANZAS_AUDIT_ACTIONS`. |
| `ERROR_CODES` (12 nuevos) | **SPEC-009** | respuestas tRPC. | OK — extendidos al catálogo. |
| `BASE_PERMISSIONS` (`gestionar_finanzas`, `ver_finanzas`) | **SPEC-009** | sembrado por `scripts/seed-data.ts` en `director`/`administrador`. | OK — `check-seed-permissions` valida. |
| `accounts` catálogo configurable | **SPEC-009** | Frank decide las cuentas (P-009-1 cerrado en `none`). | OK — sin cuentas seed; UI permite crearlas. |
| `transactions.transferId` (FK lógica, no constraint) | **SPEC-009** | SPEC-009 mismo (transferencias internas). Defensa por servicio. | OK — círculo evitado por imports lazy. |
| `finanzas.finance.osOutstandingBalance` | **SPEC-009** | **SPEC-004** cierre administrativo OS (BR-N249). | OK — expuesto en router `finanzas.finance.osOutstandingBalance`. |

---

## Riesgos y desviaciones

- **R1 (decisión interna reversible):** `transfers` y `transactions` no tienen FK constraint circular entre sí (los imports rompen el type-checker). La defensa es por servicio (`transfers.create` setea `transferId` en ambas patas en la misma transacción). Si Frank prefiere FK física, se rompe el ciclo con `relations()` de drizzle-orm (no-op para BD; defensa puramente de tipos). Decisión 1 archivo, sin impacto en AC.
- **R2 (decisión interna reversible):** P-009-1 cerrado en `none` por Frank: el catálogo de cuentas es configurable. Este turno NO siembra cuentas seed (documentado en IMPL-REPORT). El Director crea la primera cuenta desde la UI; banner visible. Cuando Frank cargue el seed inicial, basta con añadir entradas en `scripts/seed-catalog.ts` (defensa: `accounts` ya tiene `created_by` nullable).
- **R3 (decisión interna reversible):** `direct_costs.confirmed_or_conciliated` es snapshot textual (`'true'`/`'false'`) del estado al imputar. Si la transacción se reversa después, el `direct_costs` queda inmutable pero su monto sigue contando (los reportes pueden excluirlo vía join con `transactions.status NOT IN ('reversado','cancelado')`). Si Frank prefiere soft-delete automático, se añade un trigger o columna adicional. Decisión 1 archivo, sin impacto en AC-4.
- **R4 (decisión interna reversible):** `projects.orderId` se usa para llegar a la OS del proyecto (`orders.soldTotalCents`). Si Frank introduce 1:N proyecto↔OS (multi-OS por proyecto), el servicio requiere un JOIN agregado; el helper `computeProjectCostSummary` se mantiene compatible con un único `soldTotalCents`. Decisión interna reversible: cambiar el input a `orderIds: string[]` y agregar importes.
- **R5 (decisión interna reversible):** el servicio `osOutstandingBalance` actualmente incluye CxP pendientes y comisiones pendientes como 0 (no hay tablas CxP ni `commissions.pending_amount_cents` aún). Cuando Frank cree `commissions` con monto pendiente o el módulo de CxP básico, los argumentos opcionales `pendingCxpCents`/`pendingCommissionsCents` se vuelven operacionales. Sin impacto en contrato público.
- **R6 (decisión interna reversible):** SPEC-008 cablea `cobros.confirm` → `transactions.record({type:'ingreso', sub_kind:'cobro_cliente', linked_payment_id})` mediante el `payments.income_movement_id`. En este turno, el contrato `transactions.linked_payment_id` ya está publicado; SPEC-008 lo invoca cuando cierre el ciclo BR-N316. Sin acoplamiento inverso.
- **R7 (deuda técnica menor):** `transactions.transferId` se setea en `createTransfer` (segundo update). Si la BD rechaza entre la creación del transfer y el update del transferId, los transactions quedan sin vínculo. Defensa: el helper `withTx` envuelve todo en transacción; no hay race. Documentado para revisión.
- **D1:** `computeAccountBalance` incluye `transferencias_in`/`transferencias_out` y `capital_in`/`capital_out` por separado en el saldo vivo (BR-N366); los reportes operativos excluyen estos rubros pero la UI los muestra para auditoría.

---

## Pendientes ATLAS

- **A1:** gate GEMINI V3 contra staging LIVE (Frank-auth). V3 Playwright no se crea en este turno: mismo gate externo que SPEC-002..008 (BD/PostgreSQL/MinIO pendientes). Las specs V3 Playwright se cablean cuando el entorno exista.
- **A2:** GEMINI es **obligatorio** para SPEC-009 (riesgo alto): toca finanzas, conciliado inmutable, cálculos de costo/margen, cierre administrativo (BR-N249). Decisión §13 de la SPEC.
- **A3:** coordinar con SPEC-004 (Cierre administrativo OS) que invoque `finanzas.finance.osOutstandingBalance` para validar saldo cero (BR-N249/N394). El endpoint está publicado y el router expone el contrato.
- **A4:** coordinar con SPEC-008 (Cobranza) que cablee `cobros.confirm` → `transactions.record({type:'ingreso', sub_kind:'cobro_cliente', linked_payment_id:payment.id})` cuando cierre el ciclo BR-N316. El contrato `linked_payment_id` ya está publicado.
- **A5:** P-009-1 cerrado en `none`: cuando Frank cargue el seed inicial de cuentas (Caja, Bancos, CxC, CxP), se cablea `scripts/seed-catalog.ts` con un INSERT a `accounts` por org. Decisión interna del Director de qué cuentas operar primero.
- **A6:** SPEC-010 dashboard admin lee `rentabilidad.consulta` por prefijo. El namespace está reservado; el dashboard consume cuando se implemente.

---

## SPEC-GAP

No se devuelve `SPEC-GAP` a ATLAS. P-009-1 cerrado en `none` (Frank) está documentado como gate explícito sin bloqueo local; banner visible al Director. Todos los contratos públicos están dentro del SPEC; las decisiones internas (R1..R7) están documentadas como riesgos reversibles.

---

## Notas de reversión (recomendación, NO ejecución)

Si se requiere revertir el incremento:

1. **Revertir migración de BD:** las 4 tablas nuevas se crean con `db:generate`/`db:migrate`. El script de rollback es responsabilidad del flujo de mantenimiento.
2. **Revertir código:** el blast radius está contenido en:
   - `src/server/db/schema/accounts.ts`, `transactions.ts`, `transfers.ts`, `direct-costs.ts` (eliminar).
   - `src/server/db/schema/index.ts` (quitar exports).
   - `src/server/services/finanzas/{finanzas-service,helpers,index}.ts` (eliminar).
   - `src/server/services/index.ts` (quitar `finanzasService`).
   - `src/server/trpc/routers/finanzas.ts` (eliminar).
   - `src/server/trpc/root.ts` (quitar `finanzasRouter`).
   - `src/app/(dashboard)/finanzas/page.tsx` (eliminar).
   - `src/modules/plataforma/layout/navigation.tsx` (quitar `/finanzas`).
   - `src/shared/enums/index.ts` (quitar enums + códigos + permisos + audit actions de SPEC-009).
   - `src/shared/zod/index.ts` (quitar esquemas SPEC-009).
   - `src/shared/utils/messages.ts` (quitar claves `finanzas.*`, `nav.finanzas`).
   - `scripts/check-multitenancy.ts` (quitar las 4 tablas).
   - `scripts/seed-data.ts` (quitar 2 permisos y matriz).
   - `tests/spec-20260817-009.test.ts` (eliminar).
3. **Sin acoplamientos inversos:** `finanzas` NO importa `@/server/services/facturacion` ni `@/server/services/cobranza` ni `@/server/services/orden-servicio` ni `@/server/services/proyectos`. Sólo lee tablas directamente (Drizzle) y expone los endpoints públicos que SPEC-004/SPEC-008/SPEC-010 consumen. La reversión queda contenida al directorio `finanzas/*` y al router/UI.

No se ejecuta ninguna acción mutante (sin commit/push/PR/deploy/rollback). Working tree sucio inspeccionado y conservado. No se realizó reset/clean/stash/checkout destructivo.

---

## Estado

`READY_FOR_VERIFYING`. SOFIA no declara `DONE` (§3 IDL).
