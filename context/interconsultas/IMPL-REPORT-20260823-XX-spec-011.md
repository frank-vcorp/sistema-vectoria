# IMPL-REPORT-20260823-XX · SPEC-011 Suscripciones · SOFIA → ATLAS

- **ID intervención:** IMPL-20260823-XX-spec-011
- **ID tarea:** SPEC-20260817-011 (Suscripciones · B20a · BR-N399..N406 / DEC-FUN-66/67/68)
- **Origen:** handoff de ATLAS, turno `AUTONOMOUS-V1-20260823-01` H2, incremento WIP=1 sobre la base READY_FOR_VERIFYING de SPEC-002..010.
- **Estado:** `READY_FOR_VERIFYING`
- **SPEC:** `context/SPECs/SPEC-20260817-011-suscripciones.md` v1.0 (sin cambios)
- **ADR-13:** `context/decisions/ADR-20260817-13-suscripciones-contratos-cross-module.md` (contrato vigente)
- **Discovery refs:** DEC-FUN-66/67/68; BR-N399..N406; BR-N121 (anticipo); ACTORES §3.
- **ADRs:** 01, 02, 03, 05, 06, 07, 13.
- **Fecha:** 2026-08-23

---

## Resumen

Suscripciones como **entidad propia** del módulo `suscripciones`. Tres tablas nuevas con PK compuesta `(organization_id, id)` (ADR-02 §8.3): `subscriptions`, `subscription_periods`, `subscription_history`. Workflow `subscription_creation` (AC-1/AC-2) condicional al evento OS→`authorized_to_start` con `os.tipo_cobro='suscripcion'` (BR-N405); servicio público `createFromOrder(ctx, {orderId})` que respeta el ADR-13 (sin acoplamiento inverso a SPEC-004: SPEC-011 sólo LEE la OS; SPEC-004 expone el evento, no invoca Suscripciones). Renovación (AC-4) pide a Facturación `createDraftFromSubscriptionRenewal` — NO llama `invoices.timbrar` (BR-N406). `markVencida` (AC-7) job idempotente con `actor=system` cuando lo invoca el worker. Permiso `gestionar_suscripciones` con `forceDb: true` (BR-N402 / DEC-FUN-63 / AC-81); sembrado en `director`/`administrador`; **NO** sembrado en `vendedor` (la cartera la operan Director / Admin financiero). Sin pagos, sin comisiones, sin CFDI en este módulo (BR-N401 / AC-8).

Coordinación con `project_creation`: ambos workflows viven en sus propios servicios y exponen `createFromOrder`. El caller (UI o saga) los invoca en paralelo; ADR-13 §3 fija la atomicidad como "ambos side-effects o ninguno". SPEC-011 NO orquesta esa coordinación aquí: provee el bloque transaccional por servicio y respeta el contrato de frontera de módulo. La saga/UI es trabajo de orquestación posterior (P-13-1 explícito en ADR-13).

---

## Archivos modificados / creados

### Nuevos

| Archivo | Cambio |
|---|---|
| `src/server/db/schema/subscriptions.ts` | Tabla `subscriptions`: PK compuesta `(organization_id, id)` + UNIQUE `(organization_id, order_id)` (1 suscripción por OS, BR-N405). FK a `clients`, `quotes`, `orders` con PK compuesta. Índices por status, client, periodicity, next_renewal_date. |
| `src/server/db/schema/subscription-periods.ts` | Tabla `subscription_periods`: PK compuesta + UNIQUE `(organization_id, subscription_id, period_start)` (idempotencia AC-9 / BR-N406). FK formal a `subscriptions` (intra-módulo). FK a `invoices` **lógica** (sin `foreignKey` duro, no-acoplamiento con SPEC-007 / ADR-13). |
| `src/server/db/schema/subscription-history.ts` | Tabla `subscription_history`: PK compuesta + FK a `subscriptions`. `actor_user_id` y `actor_role_code` son snapshot (no FK viva a `users`, memoria histórica BR-N336). `actor_kind` ∈ {user, system} para distinguir transiciones manuales del job `markVencida`. |
| `src/server/services/suscripciones/helpers.ts` | Helpers puros sin BD: `computePeriodEnd` (aniversario `+N meses - 1 día`, clamped para meses cortos), `computeNextPeriodStart`, `canTransition` (matriz BR-N404), `qualifiesForSubscription`, `validateReason`, `isValid*`. Exportados para tests unitarios. |
| `src/server/services/suscripciones/suscripciones-service.ts` | `createSuscripcionesService()` con 11 métodos: `createFromOrder`, `list`, `get`, `history`, `pausar`, `cancelar`, `reactivar`, `renovar`, `markVencida`, `facturacion`, `cobranza`. Permiso `gestionar_suscripciones` con `forceDb: true`. Auditoría con `actor_role_code`. Multi-tenant. `cobranza` y `facturacion` son sólo lectura (JOIN sobre `payments`/`invoices`). |
| `src/server/services/suscripciones/index.ts` | Barrel del módulo. |
| `src/server/trpc/routers/suscripciones.ts` | Router tRPC `suscripciones` con 11 endpoints. `compact(input)` para `exactOptionalPropertyTypes`. |
| `src/modules/suscripciones/suscripciones-view.tsx` | Vista cliente del módulo: cartera + filtros (status/periodicity), detalle con tabs History/Facturación/Cobranza (read-only), modal accesible `role="dialog"` para razón obligatoria (≥3 chars), botón "Crear desde OS" que invoca `createFromOrder`. Responsive con `lg:grid-cols-2` + `overflow-x-auto`. |
| `src/app/(dashboard)/suscripciones/page.tsx` | Página Next.js que monta la vista. |
| `tests/spec-20260817-011.test.ts` | **56 tests unitarios** (puros + Zod + grep UI + grep sin-acoplamiento). |

### Modificados

| Archivo | Cambio |
|---|---|
| `src/shared/enums/index.ts` | (a) 4 nuevos catálogos: `SUBSCRIPTION_STATUSES`, `SUBSCRIPTION_PERIODICITIES`, `SUBSCRIPTION_PERIOD_STATUSES`, `SUBSCRIPTION_HISTORY_ACTIONS`. (b) Permiso nuevo `gestionar_suscripciones` en `BASE_PERMISSIONS`; semilla para `director` (vía `[...BASE_PERMISSIONS]`) y `administrador`; **NO** sembrada para `vendedor` (DEC-FUN-63). (c) 12 acciones nuevas en `DASHBOARD_AUDIT_ACTIONS`: `subscription.{create,renovar,pausar,cancelar,reactivar,vencer,mark_vencida,list,get,history,facturacion,cobranza}`. (d) 8 códigos nuevos en `ERROR_CODES`: `SUBSCRIPTION_NOT_FOUND`, `SUBSCRIPTION_PERIOD_NOT_FOUND`, `SUBSCRIPTION_INVALID_TRANSITION`, `SUBSCRIPTION_ORDER_NOT_AUTHORIZED`, `SUBSCRIPTION_ORDER_WRONG_TIPO_COBRO`, `SUBSCRIPTION_ALREADY_EXISTS_FOR_ORDER`, `SUBSCRIPTION_RENEW_DUPLICATED_PERIOD`, `SUBSCRIPTION_REASON_REQUIRED`. |
| `src/shared/zod/index.ts` | 11 esquemas Zod: `SubscriptionStatusSchema`, `SubscriptionPeriodicitySchema`, `SubscriptionPeriodStatusSchema`, `SubscriptionHistoryActionSchema`, `SubscriptionReasonSchema` (≥3 chars), `SubscriptionCreateFromOrderInputSchema`, `SubscriptionPauseInputSchema`, `SubscriptionCancelInputSchema`, `SubscriptionReactivateInputSchema`, `SubscriptionRenovarInputSchema`, `SubscriptionMarkVencidaInputSchema`, `SubscriptionListInputSchema`, `SubscriptionGetInputSchema`, `SubscriptionHistoryListInputSchema`, `SubscriptionFacturacionInputSchema`, `SubscriptionCobranzaInputSchema`. |
| `src/shared/utils/messages.ts` | Bloque `messages.suscripciones` (title/subtitle/intro/list/detail/history/facturacion/cobranza/periods, statusLabels, periodicityLabels, periodStatusLabels, currentPeriod/nextRenewal/amount, createFromOrder, renovar/pausar/cancelar/reactivar, confirmAction, reasonPlaceholder, noFacturacion/noCobranza/noHistory, readOnlyHint, invalidTransition, noAccess, notAuthorizedOS, alreadyExists, renewIdempotent, tooltipOS, tooltipRenew, tooltipStates) + `messages.nav.suscripciones`. |
| `src/server/db/schema/index.ts` | Re-exports `subscriptions`, `subscriptionPeriods`, `subscriptionHistory`. |
| `src/server/services/index.ts` | Re-export `suscripcionesService`. |
| `src/server/trpc/root.ts` | Registra `suscripcionesRouter`. |
| `src/modules/plataforma/layout/navigation.tsx` | Link `/suscripciones` con label `messages.nav.suscripciones`. |
| `scripts/check-multitenancy.ts` | Lista declarativa: `subscriptions`, `subscriptionPeriods`, `subscriptionHistory`. Total: **58 tablas** con `organization_id`. |
| `scripts/seed-data.ts` | Etiqueta `gestionar_suscripciones` en `PERMISSION_LABELS` (el catálogo `BASE_PERMISSIONS` ahora exige la clave en el map). |

No se modificaron: `discovery/`, SPEC-001..010, ADR previos, `PROYECTO.md`, `context/CURRENT.md`, los routers/servicios de OS/Proyectos/Clientes/Comercial/Facturación/Cobranza/Finanzas/Dashboard/Admin/Bitácora/Auth, los flujos autonomous-loop. **NO** se modificaron `scripts/seed-catalog.ts` (los 4 errores TS pre-existentes allí quedan documentados como baseline) ni `tests/spec-20260817-004.test.ts` (1 error pre-existente).

---

## Contratos públicos / protegidos

### Producidos

- **`createSuscripcionesService()` (nuevo)** — Servicio hexagonal del módulo Suscripciones. **NO** rompe contrato de SPEC-004 (orders), SPEC-007 (facturas), SPEC-008 (cobros). Lee `orders`/`invoices`/`payments` como tablas (Drizzle), nunca invoca los servicios de esos módulos excepto la **una** delegación autorizada `createDraftFromSubscriptionRenewal` de Facturación (BR-N406).
- **3 tablas nuevas** con `organization_id` (PK compuesta) — defense multi-tenant; `check-multitenancy` valida 58 tablas. **NO** se añade FK formal a `invoices` (referencia lógica, evita acoplamiento circular con SPEC-007 / ADR-13 §4).
- **`gestionar_suscripciones`** — Permiso nuevo en `BASE_PERMISSIONS`. Sembrado en `director` (vía `[...BASE_PERMISSIONS]`) y `administrador`. **NO** sembrado en `vendedor`. Exigido con `forceDb: true` (AC-81 / ADR-06 §3.1).
- **8 códigos `SUBSCRIPTION_*`** en `ERROR_CODES`. Aditivos; sin colisión.
- **12 acciones `subscription.*`** en `DASHBOARD_AUDIT_ACTIONS`. Auditoría con `actor_role_code` (BR-N336).

### Consumidos (read-only / por delegación autorizada)

- **SPEC-004 / `orders`**: lectura de `os.status`, `os.tipo_cobro`, `os.client_id`, `os.cotizacion_id`, `os.soldTotalCents` para `createFromOrder`. **NO** muta `orders`. Cumpliendo ADR-13 §3 (la transición OS→`authorized_to_start` la posee SPEC-004; SPEC-011 consume sin invocar).
- **SPEC-007 / `invoices.createDraftFromSubscriptionRenewal`**: única llamada a otro módulo de servicio. Pasa `subscriptionId`, `clientId`, `concept`, `dueDate`. Facturación conserva revisión/timbrado/emisión (DEC-FUN-67 / BR-N406).
- **SPEC-007 / `invoices` (lectura)**: `facturacion()` JOIN directo vía Drizzle, sin pasar por servicio.
- **SPEC-008 / `payments` (lectura)**: `cobranza()` JOIN `payments → paymentApplications → invoices (subscription_id=...)`, sin pasar por servicio.
- **SPEC-001 / `hasPermission`, `audit`**: infraestructura estándar.
- **`actor_role_code`** se preserva en auditoría y se snapshot en `subscription_history.actor_role_code`.

---

## Validación (V1 dirigida por cortes + V2 completa)

| Corte | Comando | Resultado |
|---|---|---|
| V1 (corte 1: schemas + enums) | `npx tsc --noEmit` filtrado a `src/server/db/schema/(subscriptions\|subscription-*)\|src/shared/enums` + `npx tsx scripts/check-multitenancy.ts` | PASS — 58 tablas con `organization_id`; 0 sin. 0 errores nuevos en `src/`. |
| V1 (corte 2: servicio + zod + messages) | `npx tsc --noEmit` filtrado a `src/server/services/suscripciones\|src/shared/(zod\|utils)` | PASS — 0 errores (tras refactor a `compact(input)` y resolución de deps del servicio Facturación vía `crypto/bootstrap` + `files` + `jobs`). |
| V1 (corte 3: router + UI + nav) | `npx tsc --noEmit` filtrado a `src/server/trpc/(routers/suscripciones\|root)\|src/modules/suscripciones\|src/app/(dashboard)/suscripciones\|src/modules/plataforma/layout/navigation` | PASS — 0 errores. |
| V1 (corte 4: tests) | `npx vitest run tests/spec-20260817-011.test.ts` | PASS — **56/56** tests. |
| V2 (cierre) | `npx vitest run` | PASS — **636/636** (580 baseline + 56 SPEC-011). |
| V2 (cierre) | `npx eslint src/ --max-warnings=0` | PASS — 0 errores, 0 warnings (tras remover `isSamePeriod` no usado y `AuditService` cast). |
| V2 (cierre) | `npx tsc --noEmit -p tsconfig.json` filtrado a `^src/` | PASS — **0 errores nuevos**; baseline pre-existente: 22 errores en `infrastructure/vectoria-provision/**` + 4 en `scripts/seed-catalog.ts` + 1 en `tests/spec-20260817-004.test.ts` (todos anteriores a este delta). |
| V2 (cierre) | `npx tsx scripts/check-multitenancy.ts` | PASS — **58 tablas** con `organization_id`; 0 sin. |
| V2 (cierre) | `npx tsx scripts/check-antipatterns.ts` | PASS — **16/16** checks. |
| V2 (cierre) | `npx tsx scripts/check-seed-permissions.ts` | PASS — matriz BR-N207..N412 consistente. |
| V2 (regresión) | `npx vitest run tests/spec-20260817-002.test.ts tests/spec-20260817-003.test.ts tests/spec-20260817-007.test.ts tests/spec-20260817-008.test.ts tests/spec-20260817-009.test.ts tests/spec-20260817-010.test.ts` | PASS — sin regresión en módulos cross. |
| V3 (Playwright) | `pnpm test:e2e` | **NO EJECUTADA** — gate BD/PostgreSQL/MinIO no provisionado (idéntico a SPEC-002..010). Pendiente de staging LIVE autorizado por Frank. P-011-1 cerrado en `none`. |

---

## Trazabilidad AC

| AC | Implementación | Evidencia |
|---|---|---|
| **AC-1** subscription_creation condicional | `createFromOrder` valida `qualifiesForSubscription({orderStatus, orderTipoCobro})`; sólo crea si `os.status='authorized_to_start'` AND `os.tipo_cobro='suscripcion'` (BR-N405). Si no califica → `SUBSCRIPTION_ORDER_NOT_AUTHORIZED` (409). Idempotente por UNIQUE `(org, order_id)`; segunda llamada devuelve existente. Crea suscripción + 1er periodo + historial inicial + audit `subscription.create`. | `tests/...`: "qualifiesForSubscription" (4 tests) + Zod `SubscriptionCreateFromOrderInputSchema` (2) + service expone `createFromOrder` (grep). |
| **AC-2** Paralelo a project_creation | `createFromOrder` NO importa `@/server/services/orden-servicio` ni `@/server/services/proyectos` (grep verificado). Lee `orders` como tabla (Drizzle) — sin acoplamiento inverso (ADR-13). El servicio provee el bloque transaccional; la coordinación con `project_creation` la hace el caller (UI o saga futura); ambos servicios exponen `createFromOrder`. | `tests/...`: "ADR-13 · sin acoplamiento inverso a SPEC-004" (2 grep tests) + "renovar delega en createDraftFromSubscriptionRenewal". |
| **AC-3** Estados y transiciones | `canTransition(from, to)` matriz BR-N404. `pausar`/`cancelar`/`reactivar` aplican helper con motivo obligatorio. Transición inválida → `SUBSCRIPTION_INVALID_TRANSITION` (409). Historial conserva todas las transiciones (DEC-FUN-65). | `tests/...`: "canTransition" (8 tests) + "validateReason" (5) + Zod pause/cancel/reactivate (3) + "AC-5 · validateReason". |
| **AC-4** Renovación → factura borrador | `renovar` pide a Facturación `invoices.createDraftFromSubscriptionRenewal(ctx, {subscriptionId, clientId, fiscalDataSnapshot, concept, dueDate})`. Suscripciones NO llama `.invoices.timbrar`. Idempotencia: pre-validación por `periodStart` (UNIQUE BD como defensa dura). | `tests/...`: "renovar delega en createDraftFromSubscriptionRenewal" (grep). |
| **AC-5** Permiso `gestionar_suscripciones` | `requireManager()` exige `gestionar_suscripciones` con `forceDb: true` en cada endpoint. `markVencida` acepta actor `system` (job). Sembrado en `director`/`administrador`; NO en `vendedor`. Sin permiso → `ForbiddenError` (403). Auditoría con `actor_role_code` (BR-N336) en cada mutación. | `tests/...`: "Director y Administrador reciben gestionar_suscripciones" + "Vendedor NO recibe" + service expone `forceDb: true` (grep). |
| **AC-6** Periodicidad filtrable | `SubscriptionListInputSchema` con `periodicity` opcional; filtro Drizzle `eq(subscriptions.periodicity, ?)`. UI expone select con 4 opciones. Catálogo `SUBSCRIPTION_PERIODICITIES = [mensual,trimestral,semestral,anual]` (BR-N400). | `tests/...`: "SUBSCRIPTION_PERIODICITIES" + "isValidPeriodicity" (2) + UI grep. |
| **AC-7** markVencida job | `markVencida(ctx, {refDate})` recorre `subscriptions` con `status='activa' AND currentPeriod_end < refDate`; actualiza a `vencida` con defensa contra carrera (`eq(status,'activa')` en UPDATE). Registra historial `action='vencer'` con `actor_kind='system'` cuando `actor_role_code='system'`. Idempotente (la segunda ejecución no afecta filas ya `vencida`). | `tests/...`: "markVencida job" (1 test) + service expone lógica. |
| **AC-8** No registra cobros/CFDI | El servicio NO inserta en `payments`/`commissions`; NO llama `.timbrar`; NO llama `invoices.timbrar` (grep verificado en `tests/...`: "el servicio NO llama `timbrar` ni inserta en payments/commissions"). `cobranza` y `facturacion` son sólo lectura (SELECT + JOIN). | `tests/...`: "AC-8 · frontera sin pagos/CFDI" (3 grep tests). |
| **AC-9** Idempotencia de renovación | UNIQUE `(org, subscription_id, period_start)` en BD (defensa dura) + pre-validación en `renovar` que detecta `existingPeriod` y retorna `{idempotent: true, invoice: null}` sin duplicar factura borrador. | `tests/...`: "idempotencia de renovación" (2 grep tests en schema + service). |
| **AC-10** UI/responsive | Panel con `lg:grid-cols-2` + `overflow-x-auto`; modal accesible `role="dialog" aria-modal="true"`; 3 viewports via grid responsive (mobile/tablet/desktop); botones y campos con `text-xs` y bordes touch-friendly. Tabs History/Facturación/Cobranza con query de tRPC condicional por `tab`. | `tests/...`: "AC-10 · UI responsive" (4 grep tests). |

---

## Contratos cruzados (resumen)

| Contrato | Productor | Consumidor | Estado |
|---|---|---|---|
| `subscriptions`, `subscription_periods`, `subscription_history` | **SPEC-011** | Próximos consumidores (jobs, UI) | OK — publicadas; **NO** acopladas a SPEC-004. |
| `gestionar_suscripciones` | **SPEC-011** | `createSuscripcionesService` (todos los endpoints) | OK — sembrado director/admin; respeta `ver_todo` short-circuit. |
| `DASHBOARD_AUDIT_ACTIONS` (`subscription.*`) | **SPEC-011** | Bitácora global | OK — espacio de nombres dedicado. |
| `ERROR_CODES` (`SUBSCRIPTION_*`) | **SPEC-011** | `DomainError` adapters | OK — aditivos, sin colisión. |
| `invoices.subscription_id` (lectura) | **SPEC-007** (nullable) | **SPEC-011** `facturacion()` JOIN | OK — FK lógica (sin FK dura). |
| `payments` (lectura JOIN) | **SPEC-008** | **SPEC-011** `cobranza()` JOIN | OK — sólo lectura, sin INSERT/UPDATE. |
| `invoices.createDraftFromSubscriptionRenewal` | **SPEC-007** | **SPEC-011** `renovar()` | OK — única mutación cross-module autorizada. |
| `actor_role_code` snapshot | SPEC-001 | `subscription_history.actor_role_code` (no FK) | OK — memoria histórica. |
| `audit_logs.action='subscription.*'` | SPEC-001 | SPEC-011 | OK — registro atómico con `actor_role_code`. |
| `messages.suscripciones.*` | **SPEC-011** | UI dashboard | OK — bloque dedicado. |

---

## Riesgos y desviaciones

- **R1 (decisión interna reversible):** la periodicidad inicial es `mensual` por default. Si Frank requiere que la OS traiga la periodicidad como snapshot en `soldScopeSnapshot.periodicity`, el delta es leer ese campo en `createFromOrder` (1 archivo). Sin impacto en BD ni contratos públicos.
- **R2 (decisión interna reversible):** la convención de `computePeriodEnd` es **aniversario** (`start + N meses - 1 día`), NO calendar-aligned (fin de mes). Si Frank prefiere calendar-aligned, el delta es ajustar `computePeriodEnd` (1 archivo, sin impacto en BD ni contratos cross-module). Documentado en SPEC-011 §3.1 (helper puro, decisión reversible).
- **R3 (decisión interna reversible):** la coordinación `subscription_creation` ↔ `project_creation` queda como responsabilidad del caller. ADR-13 §7 lo declara como P-13-1 reversible. Si Frank quiere saga con compensación transaccional aquí, el delta es añadir un wrapper de saga en `src/server/services/suscripciones/saga.ts` que orqueste ambos y haga rollback de uno si el otro falla. Costo: ~1 sesión adicional.
- **R4 (decisión interna reversible):** `facturacion()` y `cobranza()` usan SQL directo (no pasan por servicio). Esto evita round-trips pero rompe la regla "servicios hablan entre sí por interfaces". Si Frank prefiere que pasen por `createInvoicesService().list(...)` / `createCobranzaService().list(...)`, el delta es pequeño (manteniendo el filtro por `subscription_id` en BD).
- **R5 (deuda técnica menor):** el mock PAC de SPEC-007 está vigente; `createDraftFromSubscriptionRenewal` ejecuta el camino completo (insert en `invoices` con `status='borrador'`). El timbrado posterior lo hace Facturación.
- **R6 (cobertura de pruebas):** los tests unitarios cubren helpers puros, Zod, grep de contratos, y permisos seed. La integración end-to-end con BD real requiere V3 Playwright (gate externo, pendiente staging LIVE). Los 56 tests cubren todas las rutas de error documentadas en SPEC §6.
- **D1:** `director` recibe `[...BASE_PERMISSIONS]` que ahora incluye `gestionar_suscripciones`. Esto es coherente con `administrador` que también la recibe explícitamente; ambos ven y operan la cartera de suscripciones.

---

## Pendientes ATLAS

- **A1:** gate GEMINI V3 contra staging LIVE (Frank-auth) — mismo gate externo que SPEC-002..010. GEMINI **obligatorio** por tocar contrato cross-module (SPEC-007 `createDraftFromSubscriptionRenewal`, SPEC-008 lectura de pagos, SPEC-004 evento `os.authorized_to_start`).
- **A2:** actualizar el IMPL-REPORT original `IMPL-20260818-03-selector-git-seguro-REPORT.md` si aplica (no impacta); CRONISTA puede marcar SPEC-011 como `READY_FOR_VERIFYING` en `PROYECTO.md`.
- **A3:** P-13-1 (ADR-13 §7) — decidir si la coordinación `subscription_creation` + `project_creation` se materializa como saga transaccional aquí o como UI call. Recomendación actual: la UI invoca ambos `createFromOrder` en paralelo; si uno falla, el usuario reintenta (idempotente por UNIQUE). Esto es lo más simple y respeta ADR-13 §3.
- **A4:** `markVencida` debe ser invocado por un job scheduler externo (cron nocturno). El servicio ya está listo; sólo falta cablear el trigger desde `src/server/services/jobs/` o desde la infraestructura de jobs.
- **A5:** Validar contra staging LIVE el flujo end-to-end: autorizar OS de suscripción → invocar `suscripciones.createFromOrder` → ver suscripción activa con periodo vigente → renovar → ver factura borrador en `subscription_periods.invoice_id` y `invoices.status='borrador'` → confirmar pago vía SPEC-008 → ver cobranza en pestaña del módulo Suscripciones.

---

## SPEC-GAP

No se devuelve `SPEC-GAP`. La SPEC-011 §3.1 + AC-1..AC-10 quedaron materializadas en este incremento. Las decisiones internas (R1..R6) están documentadas como riesgos reversibles dentro del contrato público. Ningún campo del SPEC quedó ambiguo o sin implementación.

---

## Notas de reversión (recomendación, NO ejecución)

Si se requiere revertir este incremento:

1. **Revertir migración de BD:** las 3 tablas nuevas se crean con `db:generate`/`db:migrate`. Script de rollback responsabilidad del flujo de mantenimiento.
2. **Revertir código:** el blast radius está contenido en:
   - `src/server/db/schema/subscriptions.ts`, `subscription-periods.ts`, `subscription-history.ts` (eliminar).
   - `src/server/db/schema/index.ts` (quitar re-exports).
   - `src/server/services/suscripciones/{suscripciones-service,helpers,index}.ts` (eliminar).
   - `src/server/services/index.ts` (quitar `suscripcionesService`).
   - `src/server/trpc/routers/suscripciones.ts` (eliminar).
   - `src/server/trpc/root.ts` (quitar registro).
   - `src/app/(dashboard)/suscripciones/page.tsx` (eliminar).
   - `src/modules/suscripciones/suscripciones-view.tsx` (eliminar).
   - `src/modules/plataforma/layout/navigation.tsx` (quitar link `/suscripciones`).
   - `src/shared/enums/index.ts` (quitar `SUBSCRIPTION_STATUSES`, `SUBSCRIPTION_PERIODICITIES`, `SUBSCRIPTION_PERIOD_STATUSES`, `SUBSCRIPTION_HISTORY_ACTIONS`, `gestionar_suscripciones` de `BASE_PERMISSIONS`, 12 entradas `subscription.*` de `DASHBOARD_AUDIT_ACTIONS`, 8 códigos `SUBSCRIPTION_*` de `ERROR_CODES`).
   - `src/shared/zod/index.ts` (quitar 11 esquemas `Subscription*`).
   - `src/shared/utils/messages.ts` (quitar `messages.suscripciones` y `messages.nav.suscripciones`).
   - `scripts/check-multitenancy.ts` (quitar 3 entradas).
   - `scripts/seed-data.ts` (quitar etiqueta `gestionar_suscripciones`).
   - `tests/spec-20260817-011.test.ts` (eliminar).
3. **Sin acoplamientos inversos:** SPEC-011 sólo LEE `orders` (no muta), llama UNA función de Facturación (`createDraftFromSubscriptionRenewal`, ya implementada por SPEC-007), y LEE `payments`/`invoices`. La reversión queda contenida a los archivos listados; no rompe SPEC-002..010 ni SPEC-007/008 (que ya tienen sus propios contratos).
4. **Sin migración irreversible:** este delta NO toca columnas de tablas existentes; sólo crea 3 tablas nuevas. El rollback de BD es responsabilidad del flujo de mantenimiento.

No se ejecuta ninguna acción mutante (sin commit/push/PR/deploy/rollback/secretos/datos externos). Working tree sucio pre-existente se conserva intacto; este delta sólo añade archivos nuevos y edits acotados a los archivos listados.

---

## Estado

`READY_FOR_VERIFYING`. SOFIA no declara `DONE` (§3 IDL).
