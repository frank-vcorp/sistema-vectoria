# SPEC-20260817-004 · Orden de Servicio (OS)

- **ID:** SPEC-20260817-004
- **Estado:** BACKLOG (depende de SPEC-001, SPEC-002, SPEC-003 `READY`)
- **Versión:** 1.0
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-19 (v1.0)
- **Módulo funcional cubierto:** Orden de Servicio: anticipo, OC, autorización de inicio, `os.pl_user_id` (PL asignado a la OS) y los side-effects de la transición OS→`authorized_to_start` (block B8).
- **ADRs de referencia:** ARCH-20260817-01, ARCH-20260819-03 (UI), ARCH-20260817-05 (autorización por recurso).
- **Depende de:** SPEC-001 (plataforma), SPEC-002 (cliente), SPEC-003 (cotización: `tipo_cobro`, importes vendidos, `cotizacion_id`).

---

## 1. Resultado
La OS es el artefacto que nace al aceptar una cotización (BR-N237) y orquesta el paso a ejecución. Esta SPEC **produce** la transición OS→`authorized_to_start` y **expone** `os.pl_user_id`, `os.tipo_cobro`, `os.cliente_id`, `os.cotizacion_id`. Los side-effects (`project_creation` universal → SPEC-005; `subscription_creation` condicional → SPEC-011) son **consumidos** por sus SPEC dueñas; SPEC-004 no importa ni invoca a Proyectos ni a Suscripciones (ver PROYECTO.md §5.2/§5.3, sin ciclo).

## 2. Fuentes funcionales por ID
- **DEC-FUN:** DEC-FUN-07 (OC opcional, 4 campos), DEC-FUN-17 (suscripción: pago inicial antes de autorizar), DEC-FUN-20260818-68 (toda OS autorizada crea Proyecto), DEC-FUN-20260818-66 (suscripción se crea al autorizar OS con tipo_cobro=suscripción).
- **BR (B8):** BR-017 (OC monto coincide + PDF), BR-N121 (suscripción exige pago inicial), BR-N242 (OS nace al aceptar cotización, copia inmutable de importes/alcance), BR-N243 (4 datos opcionales OC), BR-N244 (no autorizar sin anticipo cobrado ≥90% o Director), BR-N245 (no autorizar sin PL asignado), BR-N246 (al autorizar, sistema crea proyecto atómico), BR-N247 (OS→`in_execution` al crearse proyecto), BR-N248 (OS→`delivered` al cierre técnico), BR-N249 (OS→`closed` con proyecto terminado/cancelado + saldo cero o excepción Director), BR-N250 (pausar/cancelar con motivo), BR-N392 (cierre técnico entrega OS con saldo pendiente), BR-N393 (factura final antes de cierre administrativo), BR-N394 (excepción sólo Director), BR-N405 (suscripción creada al autorizar OS suscripción), BR-N407 (toda OS autorizada crea Proyecto).
- **FLOW:** FLOW-OS-01 (anticipo→autorización→Proyecto).

## 3. Alcance y exclusiones
### 3.1 Incluido
- `orders` (OS) con `pl_user_id`, `tipo_cobro`, copia inmutable de importes/alcance vendidos, 4 campos de OC opcionales, anticipo vinculado, estados de OS, autorización de inicio (valida anticipo + OC + PL), la transición a `authorized_to_start`.
- **Contrato cruzado producido (no implementación del side-effect):** la transición `authorized_to_start` expone `os.pl_user_id` (consumido por `project_creation` en SPEC-005) y `os.tipo_cobro` (consumido por `subscription_creation` condicional en SPEC-011). SPEC-004 **no** crea el Proyecto ni la Suscripción; sólo dispara/permite que sus SPEC dueñas lo hagan en la misma transacción coordinada.
### 3.2 Excluido
- `project_creation` workflow (crea Proyecto + primer miembro PL + snapshot) → SPEC-005. `subscription_creation` → SPEC-011. Cobro del anticipo (registro/aplicación) → SPEC-008. Facturación → SPEC-007. Cierre administrativo (saldo cero) orquesta Cobranza+Finanzas → SPEC-008/009.

## 4. Modelo técnico (contrato)
### 4.1 Entidad `orders` (OS)
- `id uuid PK, organization_id uuid FK, client_id uuid FK→clients, cotizacion_id uuid FK→cotizaciones, pl_user_id uuid FK→users null (PL asignado a la OS, no al proyecto; BR-N245), status enum, tipo_cobro enum('pago_unico'|'mensualidades'|'suscripcion'), sold_total_cents bigint not null (copia inmutable, BR-N242), sold_scope_snapshot jsonb not null (copia inmutable del alcance vendido), anticipo_required_cents bigint, oc_number text null, oc_date date null, oc_amount_cents bigint null, oc_file_id uuid FK→files null (BR-N243, 4 campos), authorized_at timestamptz null, authorized_by uuid FK→users null, closed_at timestamptz null, pause_reason text null, cancel_reason text null, created_at, updated_at`. Índices en `(organization_id, status)`, `(pl_user_id)`.

### 4.2 Enum de estado (OS)
`pending_deposit → pending_information → authorized_to_start → in_execution → delivered → closed` (+ laterales `paused`, `cancelled`). (FLUJOS §3.4, BR-N247-249.)

### 4.3 Servicios
- `orders.createFromAcceptedQuote(ctx, cotizacionId)` — nace al aceptar cotización (BR-N237/242); copia inmutable de importes y alcance; `status='pending_deposit'`; audita (`os.create`).
- `orders.assignPL(ctx, orderId, plUserId)` — asigna `pl_user_id` antes de autorizar (BR-N245).
- `orders.authorize(ctx, orderId)` — valida: (a) anticipo cobrado ≥90% o excepción Director (BR-N244), (b) OC válida si aplica (BR-017), (c) `pl_user_id not null` (BR-N245), (d) si `tipo_cobro='suscripcion'` → pago inicial cobrado (BR-N121). Pasa a `authorized_to_start`; **emite el evento de transición** que sus SPEC dueñas consumen (project_creation universal; subscription_creation condicional). Audita (`os.authorize`, actor + rol usado).
- `orders.markInExecution(ctx, orderId)` — al confirmarse la creación del Proyecto (SPEC-005), OS→`in_execution` (BR-N247).
- `orders.markDelivered(ctx, orderId)` — al cierre técnico del Proyecto (SPEC-006), OS→`delivered` aunque haya saldo (BR-N248/N392).
- `orders.closeAdministrative(ctx, orderId)` — valida proyecto terminado/cancelado + saldo total cero o excepción Director (BR-N249/N394); exige factura final emitida (BR-N393); OS→`closed`.

## 5. Reglas e invariantes
1. OS nace al aceptar cotización, con copia **inmutable** de importes y alcance vendidos (BR-N242).
2. No autorizar sin PL asignado (BR-N245), sin anticipo (≥90% o Director, BR-N244), sin OC válida si aplica (BR-017), sin pago inicial si suscripción (BR-N121).
3. Toda OS autorizada crea Proyecto (universal, BR-N407/N246); si `tipo_cobro='suscripcion'` además crea Suscripción (BR-N405). SPEC-004 **expone** `pl_user_id`+`tipo_cobro`; no implementa los side-effects.
4. Cierre técnico (OS→`delivered`) no exige saldo cero (BR-N392); cierre administrativo (OS→`closed`) sí, salvo excepción Director (BR-N249/N394).
5. `tipo_cobro` es contrato consumido por SPEC-011 (condicional) y por SPEC-007 (plan de facturación).
6. Pausar/cancelar con motivo (BR-N250); cancelación revisa reembolso (DEC-FUN-35).

## 6. Casos borde
- Autorizar sin PL → `409 { code:'PL_NOT_ASSIGNED' }` (BR-N245).
- Autorizar sin anticipo (y sin excepción Director) → `409 { code:'DEPOSIT_PENDING' }` (BR-N244).
- Autorizar suscripción sin pago inicial → `409 { code:'SUBSCRIPTION_INITIAL_PAYMENT_REQUIRED' }` (BR-N121).
- OC con monto ≠ total vendido o sin PDF → `409 { code:'OC_MISMATCH' }` (BR-017).
- Cierre administrativo con saldo ≠ 0 y sin excepción Director → `409 { code:'OUTSTANDING_BALANCE' }` (BR-N249/N394).
- Cierre administrativo sin factura final emitida → `409 { code:'FINAL_INVOICE_REQUIRED' }` (BR-N393).

## 7. Seguridad/privacidad
- `organization_id`; RLS latente. `pl_user_id` visible para Director/Admin/PL; no para Vendedor puro fuera de sus ventas. Acciones críticas (`os.create`, `os.authorize`, `orders.close`) en `audit_logs` con `actor_role_code` (BR-N336, invariante 12).

## 8. Migración/compatibilidad
- Migración del módulo crea `orders`. La FK a `projects` y `subscriptions` la añaden SPEC-005/SPEC-011 (las OS referencian al proyecto creado, pero el `project_id` lo produce SPEC-005). Copia inmutable del alcance via `sold_scope_snapshot` jsonb.

## 9. Criterios de aceptación
- **AC-1 · OS nace al aceptar cotización:** test: aceptar cotización → `orders` creada con `sold_total` y `sold_scope_snapshot` inmutables (re-editar cotización aceptada no cambia la OS; BR-N242/237).
- **AC-2 · Autorización valida 4 precondiciones:** test: autorizar sin PL → `409 PL_NOT_ASSIGNED`; sin anticipo → `409 DEPOSIT_PENDING`; OC mal → `409 OC_MISMATCH`; suscripción sin pago inicial → `409 SUBSCRIPTION_INITIAL_PAYMENT_REQUIRED`. Con todo OK → `authorized_to_start` y `audit_logs` con `action='os.authorize'`. (BR-N245/244/017/121)
- **AC-3 · Evento de transición expone pl_user_id + tipo_cobro:** test: tras `authorize`, el evento/contrato expone `pl_user_id not null` y `tipo_cobro`; los consumidores (SPEC-005/SPEC-011, mock) los leen. SPEC-004 no crea Proyecto/Suscripción (verificación: el servicio de OS no inserta en `projects`/`subscriptions`). (BR-N407/405, §5.2)
- **AC-4 · OC 4 campos opcionales:** OS con OC completa (número/fecha/monto/PDF) y sin OC; ambas válidas salvo validación de monto (BR-N243/017).
- **AC-5 · Cierre técnico vs administrativo:** OS→`delivered` con saldo pendiente OK (BR-N392); OS→`closed` con saldo ≠0 y sin excepción → `409 OUTSTANDING_BALANCE`; con excepción Director → `closed` auditada (BR-N249/N394).
- **AC-6 · Factura final antes de cierre administrativo:** `closeAdministrative` sin factura final → `409 FINAL_INVOICE_REQUIRED` (BR-N393).
- **AC-7 · Pausar/cancelar con motivo:** `paused`/`cancelled` sin motivo → `400`; con motivo → OK auditado (BR-N250).
- **AC-8 · UI/responsive:** ficha de OS y diálogo de autorización operables en 375/768/1280 (Playwright E2E); AC-66 SPEC-001. (ADR-03, DEC-FUN-72)

## 10. Validaciones
- `pnpm typecheck/test/test:e2e`; grep anti-patrón: el servicio de OS no inserta en `projects`/`subscriptions` (AC-3 verificación de no-acoplamiento).

## 11. Rollback
- Revertir migración `orders` (drop) — aprobación Frank; las OS son datos de negocio.

## 12. Riesgos y pendientes
- **R1:** coordinación transaccional de la transición `authorized_to_start` con SPEC-005 (project_creation) y SPEC-011 (subscription_creation). SPEC-004 produce el evento; la atomicidad la orquesta el servicio de Proyectos/Suscripciones en sus transacciones. Contrato: si el side-effect falla, la OS no queda en `authorized_to_start` (rollback).
- **P-004-1 (Frank):** umbral de anticipo (90% en BR-N244) configurable o fijo.

## 13. DoD
- AC-1..AC-8 PASS; trazabilidad a BR-N121/242-250/392-394/405/407; GEMINI obligatorio (toca cierre administrativo, saldo, excepciones financieras → riesgo medio-alto; §17 integra.md).

## 14. Handoff a SOFIA (resumen)
- **SPEC activa:** SPEC-004. **ADRs:** 01, 03, 05. **Alcance:** `src/server/db/orden-servicio/*`, `src/server/services/orden-servicio/*`, `src/server/trpc/routers/orden-servicio/*`, `src/modules/orden-servicio/*`. **Contratos protegidos:** `os.pl_user_id`, `os.tipo_cobro`, `sold_scope_snapshot` inmutable, `audit_logs`. **Contratos que cambian:** produce `authorized_to_start` + expone `pl_user_id`/`tipo_cobro` (consumidos por SPEC-005/SPEC-011). **Prohibido inferir:** el workflow `project_creation` (SPEC-005), `subscription_creation` (SPEC-011), el cobro del anticipo (SPEC-008), la facturación (SPEC-007).
