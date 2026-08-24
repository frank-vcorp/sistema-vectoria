# SPEC-20260817-011 · Suscripciones

- **ID:** SPEC-20260817-011
- **Estado:** BACKLOG (depende de SPEC-001, SPEC-002, SPEC-003, SPEC-004, SPEC-007, SPEC-008 `READY`)
- **Versión:** 1.0
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-19 (v1.0)
- **Módulo funcional cubierto:** Suscripciones: cartera de servicios recurrentes (mensual/trimestral/semestral/anual), ciclo de vida (activa/pausada/cancelada/vencida), consulta/renovación/pausa/cancelación/reactivación con historial, permiso `gestionar_suscripciones`, y el workflow `subscription_creation` (crea la Suscripción al autorizar OS con `tipo_cobro='suscripción'`). Block B20a.
- **ADRs de referencia:** ARCH-20260817-13 (contratos cross-module de Suscripciones), ARCH-20260817-01, ARCH-20260819-03, ARCH-20260817-05, ARCH-20260817-07 (jobs).
- **Depende de:** SPEC-001 (permisos, audit), SPEC-002 (cliente), SPEC-003 (cotización: `tipo_cobro`, `cotizacion_id`), SPEC-004 (OS: consume `os.tipo_cobro`+`os.cliente_id`+`os.cotizacion_id` + la transición `authorized_to_start`), SPEC-007 (factura borrador de renovación), SPEC-008 (cobranza de la suscripción, consulta).

---

## 1. Resultado
Un panel propio para visualizar y operar la cartera de servicios recurrentes sin reconstruirla desde Facturación/Cobranza. La Suscripción es **entidad propia** creada automáticamente al autorizar una OS con `tipo_cobro='suscripción'` (DEC-FUN-66, BR-N405), conservando vínculo con cliente/cotización/OS. Renovar crea una **factura en borrador** del nuevo periodo (DEC-FUN-67, BR-N406) que Facturación timbra tras revisión. Suscripciones no emite CFDI ni registra cobros. Esta SPEC **posee** el workflow `subscription_creation` (condicional, paralelo a `project_creation` universal de SPEC-005).

## 2. Fuentes funcionales por ID
- **DEC-FUN:** DEC-FUN-20260818-61 (módulo propio), DEC-FUN-20260818-62 (ciclos mensual/trimestral/semestral/anual + gestión completa), DEC-FUN-20260818-63 (permiso configurable), DEC-FUN-20260818-64 (estados), DEC-FUN-20260818-65 (reactivación conserva historial), DEC-FUN-20260818-66 (creación automática desde OS), DEC-FUN-20260818-67 (renovación→factura borrador).
- **BR (B20a):** BR-N399..N406.
- **FLOW:** FLUJOS §14 (ciclo de Suscripciones).

## 3. Alcance y exclusiones
### 3.1 Incluido
- `subscriptions` (entidad propia), `subscription_periods` (vigencia por periodo), `subscription_history` (transiciones conservan historial). Workflow `subscription_creation` (consume `os.tipo_cobro='suscripción'` + `os.cliente_id` + `os.cotizacion_id` + `os.id`, disparado por la transición OS→`authorized_to_start` — la misma que dispara `project_creation`). Estados + transiciones. Renovación (crea factura borrador via SPEC-007). Permiso `gestionar_suscripciones`. Panel de cartera con filtro por periodicidad. Consulta de facturación/cobranza relacionada (lectura de SPEC-007/008).
### 3.2 Excluido
- CFDI/timbrado → SPEC-007 (Suscripciones sólo crea la factura en borrador). Cobros/pagos → SPEC-008 (Suscripciones consulta). La OS y `project_creation` → SPEC-004/005 (Suscripciones es paralela, no los reemplaza). La decisión de timbrar la factura borrador la toma Facturación.

## 4. Modelo técnico (contrato)
### 4.1 Entidad `subscriptions`
- `id uuid PK, organization_id, client_id FK, cotizacion_id FK, order_id FK, status enum('activa'|'pausada'|'cancelada'|'vencida'), periodicity enum('mensual'|'trimestral'|'semestral'|'anual'), current_period_start, current_period_end, amount_cents, next_renewal_date, created_at, updated_at`. (BR-N399-403.)
- `subscription_periods (id, subscription_id, period_start, period_end, invoice_id null FK (la borrador de SPEC-007), status)` — un periodo por ciclo; renovar abre un periodo nuevo + crea factura borrador.
- `subscription_history (id, subscription_id, from_status, to_status, action enum('renovar'|'pausar'|'cancelar'|'reactivar'|'vencer'), reason, actor_user_id, actor_role_code, created_at)` — conserva historial (BR-N404, DEC-FUN-65).

### 4.2 Servicios
- `subscriptions.createFromOS(ctx, orderId)` — **workflow `subscription_creation`** (condicional, BR-N405): consume `os.tipo_cobro` (`='suscripción'`), `os.cliente_id`, `os.cotizacion_id`; crea la Suscripción + el primer periodo + vincula OS/cotización/cliente + `audit_logs` (`subscription.create`). Disparado por la transición OS→`authorized_to_start` (paralelo a `project_creation`, SPEC-005); **no** reemplaza ni exime el Proyecto (BR-N407). Si falla, rollback (la OS no queda `authorized_to_start`).
- `subscriptions.renovar(ctx, subscriptionId)` — `vencida|cancelada → activa` (o `activa → activa` nuevo periodo); abre nuevo periodo; pide a SPEC-007 `invoices.createDraftFromSubscriptionRenewal` (factura borrador, BR-N406); conserva historial; audita.
- `subscriptions.pausar(ctx, id, reason)` / `cancelar(ctx, id, reason)` / `reactivar(ctx, id, reason)` — transiciones (BR-N404); exigen `gestionar_suscripciones`; auditan con `actor_role_code`.
- `subscriptions.markVencida` — job: si `current_period_end < hoy` y no renovó → `vencida` (BR-N404).
- `subscriptions.list(ctx, filters)` — panel con filtro por periodicity (BR-N400); consulta facturación/cobranza relacionada (lectura SPEC-007/008, BR-N399).

## 5. Reglas e invariantes
1. Suscripción = entidad propia, creada al autorizar OS con `tipo_cobro='suscripción'` (BR-N405); conserva cliente/cotización/OS.
2. `subscription_creation` es **condicional adicional** a `project_creation` universal (BR-N407); una OS de suscripción crea Proyecto **y** Suscripción en paralelo.
3. Estados: `activa|pausada|cancelada|vencida` (BR-N403); transiciones (BR-N404): `activa↔pausada`; `activa→vencida` (sin renovar); `vencida→activa` (renovar); `activa|pausada→cancelada`; `cancelada→activa` (reactivar/renovar, conserva historial).
4. Renovar crea factura en **borrador** del nuevo periodo; Facturación conserva timbrado/emisión (BR-N406); Suscripciones no emite CFDI.
5. Acciones exigen permiso `gestionar_suscripciones` (no rol fijo, BR-N402); toda acción auditada (BR-N336).
6. Periodicidad filtrable: mensual/trimestral/semestral/anual (BR-N400).
7. Suscripciones no registra cobros (BR-N401; Cobranza conserva pagos).

## 6. Casos borde
- `subscription_creation` sobre OS con `tipo_cobro ≠ 'suscripción'` → no se crea Suscripción (sólo Proyecto, BR-N407).
- Renovar una `cancelada` sin `gestionar_suscripciones` → `403`; con permiso → `activa` + historial (BR-N404, DEC-FUN-65).
- Pausar una `cancelada` → `409 INVALID_TRANSITION` (sólo `activa↔pausada`).
- Factura borrador de renovación ya existente para el periodo → idempotente (no duplica).
- `markVencida` sobre `cancelada` → no aplica (cancelada es terminal hasta reactivación).

## 7. Seguridad/privacidad
- `organization_id`; RLS latente. Acciones exigen `gestionar_suscripciones` (BR-N402) + `canAccessResource` (cliente de la suscripción). Auditoría con `actor_role_code` (BR-N336). Visibilidad: Director todo; Admin financiero; Vendedor las de sus ventas.

## 8. Migración/compatibilidad
- Migración crea B20a + FK a `orders`/`clients`/`cotizaciones`/`invoices` (la FK `invoices.subscription_id` la añade SPEC-007). Seed: ninguno.

## 9. Criterios de aceptación
- **AC-1 · subscription_creation condicional:** autorizar OS con `tipo_cobro='suscripción'` → en la transacción `authorized_to_start` se crea `subscriptions` + 1er periodo + vínculos + `audit_logs`; con `tipo_cobro ≠ suscripción` → no se crea Suscripción (sólo Proyecto). (BR-N405/407)
- **AC-2 · Paralelo a project_creation:** una OS de suscripción crea **Proyecto y Suscripción** en paralelo; `subscription_creation` no reemplaza `project_creation`; si falla, rollback y la OS no pasa a `authorized_to_start`. (BR-N407; ADR-13)
- **AC-3 · Estados y transiciones:** `renovar`/`pausar`/`cancelar`/`reactivar` aplican las transiciones de BR-N404; transición inválida → `409 INVALID_TRANSITION`; reactivar conserva `subscription_history`. (BR-N403/404, DEC-FUN-65)
- **AC-4 · Renovación→factura borrador:** `renovar` pide a SPEC-007 crear factura en `borrador` del nuevo periodo; Suscripciones no timbra (verificación: el servicio de Suscripciones no llama `invoices.timbrar`). (BR-N406, DEC-FUN-67)
- **AC-5 · Permiso gestionar_suscripciones:** acción sin permiso → `403`; con permiso → OK auditada con `actor_role_code`. (BR-N402/336)
- **AC-6 · Periodicidad filtrable:** el panel filtra por `mensual|trimestral|semestral|anual` y muestra cartera. (BR-N400)
- **AC-7 · markVencida:** job: periodo vencido sin renovar → `vencida`; no aplica a `cancelada`. (BR-N404)
- **AC-8 · No registra cobros/CFDI:** Suscripciones consulta facturación/cobranza (lectura) pero no crea cobros ni timbra CFDI (grep: el servicio no inserta en `payments`/`commissions` ni llama `timbrar`). (BR-N401)
- **AC-9 · Idempotencia de renovación:** renovar dos veces el mismo periodo → no duplica factura borrador. (AC-33 SPEC-001 idempotencia)
- **AC-10 · UI/responsive:** panel de cartera (filtro por periodicidad), ficha de suscripción (historial) y diálogo de acción (renovar/pausar/cancelar/reactivar) operables en 3 viewports. (ADR-03, DEC-FUN-72)

## 10. Validaciones
- `pnpm typecheck/test/test:e2e`; grep: `subscription_creation` consume `os.tipo_cobro` y no importa a SPEC-004 (no-acoplamiento); el servicio no timbra/no cobra (AC-8).

## 11. Rollback
- Revertir migración (drop B20a) — aprobación Frank; las suscripciones son datos de negocio.

## 12. Riesgos y pendientes
- **R1:** atomicidad de `subscription_creation` paralela a `project_creation` en la misma transición OS→`authorized_to_start` (ADR-13 fija el contrato de coordinación).
- **R2:** idempotencia de renovación (no duplicar factura borrador por periodo).
- **P-011-1 (Frank):** none (origen/renovación resueltos vía DEC-FUN-66/67).

## 13. DoD
- AC-1..AC-10 PASS; trazabilidad a BR-N399-406; GEMINI **obligatorio** (toca contrato cross-module, creación desde OS, relación con Facturación → §17: contrato público/cross-module + finanzas).

## 14. Handoff a SOFIA (resumen)
- **SPEC activa:** SPEC-011. **ADRs:** 01, 03, 05, 07, 13. **Alcance:** `src/server/db/suscripciones/*`, `src/server/services/suscripciones/*`, `src/server/trpc/routers/suscripciones/*`, `src/modules/suscripciones/*`. **Contratos protegidos:** `subscription_creation` condicional, transiciones + historial, `gestionar_suscripciones`, frontera sin CFDI/cobros. **Contratos que cambian:** consume `os.tipo_cobro`/`cliente_id`/`cotizacion_id` (SPEC-004) + la transición `authorized_to_start`; pide factura borrador a SPEC-007; consulta SPEC-008. **Prohibido inferir:** la transición OS (SPEC-004 produce), `project_creation` (SPEC-005), el timbrado (SPEC-007), los cobros (SPEC-008).
