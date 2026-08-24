# IMPL-REPORT-20260823-XX · SPEC-004 Orden de Servicio · SOFIA → ATLAS

- **ID intervención:** IMPL-20260823-XX-spec-004
- **ID tarea:** SPEC-20260817-004 (Orden de Servicio)
- **Origen:** handoff de ATLAS, turno `AUTONOMOUS-V1-20260823-01` H2, incremento WIP=1 sobre la base READY_FOR_VERIFYING de SPEC-002 y SPEC-003.
- **Estado:** `READY_FOR_VERIFYING`
- **SPEC:** `context/SPECs/SPEC-20260817-004-orden-servicio.md` v1.0
- **Discovery refs:** DEC-FUN-07, DEC-FUN-17, DEC-FUN-20260818-66, DEC-FUN-20260818-68, DEC-FUN-35; BR-N017, BR-N121, BR-N242..N250, BR-N336, BR-N392..N394, BR-N405, BR-N407; FLOW-OS-01; ARCH-20260817-01, ARCH-20260817-05, ARCH-20260819-03.
- **Fecha:** 2026-08-23

---

## Resumen

Slice vertical operable de SPEC-004 completo: OS que nace al aceptar cotización con copia inmutable de importes y alcance vendido; autorización que valida 4 precondiciones (PL, OC, anticipo ≥90% o excepción Director, pago inicial de suscripción); emisión del evento `os.authorized_to_start` que expone `pl_user_id` y `tipo_cobro` consumidos por SPEC-005/SPEC-011; transiciones laterales `paused`/`cancelled` con motivo; cierre técnico (sin saldo cero) vs cierre administrativo (con saldo cero o excepción Director + factura final).

No se inventaron campos; no se implementaron side-effects fuera de alcance (`project_creation`, `subscription_creation`, `cobranza del anticipo`, `facturación`, `tablas de otros módulos`); no se delegó lateralmente; no se solicitó commit/push/PR/deploy/staging/billing/secretos/migración irreversible/rollback/delete. No se sobrescribió trabajo ajeno.

---

## Archivos modificados / creados

### Nuevos (schema, services, modules, tests, e2e)

| Archivo | Cambio |
|---|---|
| `src/server/db/schema/orders.ts` | Tabla `orders` (PK compuesta, FKs compuestas a `quotes`/`clients`/`users`/`files`, 4 campos OC opcionales, snapshot inmutable jsonb, `finalInvoiceIssued`, `closedDirectorException`, índices por status y `pl_user_id`, UNIQUE por `(organization_id, code)` y `(organization_id, cotizacion_id)` — BR-N242). |
| `src/server/services/orden-servicio/helpers.ts` | Helpers puros: `checkAdvanceThreshold` (BR-N244 90% fijo), `validateOc` (BR-017/BR-N243 4 campos), `validateOsReason` (BR-N250), `evaluateCloseAdministrative` (BR-N249/393/394), `buildOsAuthorizedEvent` (AC-3 contrato consumible), `canTransitionTo` (8 estados), `nextOrderCode` (BR-N216 análogo), `isOrderTerminal`, `subscriptionRequiresInitialPayment` (BR-N121). |
| `src/server/services/orden-servicio/orders.ts` | Servicio `createOrdersService({ advanceProvider? })` con `createFromAcceptedQuote`, `assignPL`, `setOC`, `authorize`, `markInExecution`, `markDelivered`, `closeAdministrative`, `pause`, `resume`, `cancel`, `getById`, `list`. Contrato consumible `AdvancePaidProvider` con `placeholderAdvancePaidProvider` para SPEC-008/011. |
| `src/server/services/orden-servicio/index.ts` | Barrel del módulo. |
| `src/server/trpc/routers/orden-servicio.ts` | Router `ordenServicio.*` con Zod y `toTrpcError`. Incluye `preflightAuthorize` para que la UI muestre las 4 precondiciones antes de habilitar el botón "Autorizar". |
| `src/modules/orden-servicio/ordenes-list.tsx` | Listado responsive (`overflow-x-auto`, `hidden sm:table-cell`/`hidden md:table-cell`, búsqueda libre, badges de estado y tipo de cobro). |
| `src/modules/orden-servicio/orden-detail.tsx` | Detalle con asignar PL, capturar OC, pausar/cancelar con motivo, autorizar (con y sin excepción Director), cierre técnico, cierre administrativo (con y sin excepción). Estado neutro si no hay datos. |
| `src/app/(dashboard)/ordenes-servicio/page.tsx` | Página `/ordenes-servicio`. |
| `src/app/(dashboard)/ordenes-servicio/[id]/page.tsx` | Página detalle `/ordenes-servicio/<id>`. |
| `tests/spec-20260817-004.test.ts` | 49 tests unitarios (AC-1..AC-8 + catálogo canónico + contrato de evento + no-acoplamiento). |
| `e2e/orden-servicio.spec.ts` | 3 tests Playwright × 3 viewports = 9 ejecuciones (V3 pendiente de gate Frank contra staging LIVE). |

### Modificados

| Archivo | Cambio |
|---|---|
| `src/server/db/schema/index.ts` | Exporta la tabla `orders`. |
| `src/server/services/index.ts` | Añade `ordenServicioService` al barrel. |
| `src/server/trpc/root.ts` | Monta `ordenServicioRouter`. |
| `src/shared/enums/index.ts` | Añade `ORDER_STATUSES` (8 estados), `TERMINAL_ORDER_STATUSES`, `LATERAL_ORDER_STATUSES`, `OS_ADVANCE_REQUIRED_PCT = 90` (BR-N244, NO configurable — cerrado Frank), `OS_REASON_MIN_LENGTH = 3`, `OS_AUDIT_ACTIONS` (13 acciones con namespace `os.*`), `OS_ERROR_CODES` (21 códigos); extiende `BASE_PERMISSIONS` con `gestionar_ordenes_servicio`, `asignar_pl_os`, `autorizar_os`, `cerrar_os`; extiende `ERROR_CODES` con 21 códigos canónicos del módulo. |
| `src/shared/zod/index.ts` | Esquemas Zod: `OrderStatusSchema`, `OrderAuthorizeInputSchema` (con `superRefine` que exige motivo cuando `directorException=true`), `OrderAssignPLInputSchema`, `OrderSetOCInputSchema`, `OrderPauseInputSchema`, `OrderResumeInputSchema`, `OrderCancelInputSchema`, `OrderMarkInExecutionInputSchema`, `OrderMarkDeliveredInputSchema`, `OrderCloseAdministrativeInputSchema`, `OrderCreateFromAcceptedQuoteInputSchema`, `OrderListInputSchema`, `OrderByIdInputSchema`. |
| `src/shared/utils/messages.ts` | `nav.ordenesServicio`, catálogo `ordenes.*` con etiquetas de estado, tipo de cobro, acciones y diálogos. |
| `src/modules/plataforma/layout/navigation.tsx` | Link `/ordenes-servicio` en la navegación principal. |
| `scripts/check-multitenancy.ts` | Tabla `orders` en la lista declarativa (`28 tablas`, 0 sin `organization_id`). |
| `scripts/seed-data.ts` | Etiquetas de los 4 nuevos permisos y matriz por rol: `gestionar_ordenes_servicio` para `director`/`administrador`/`vendedor`; `asignar_pl_os` para `director`/`administrador`/`lider_proyecto`; `autorizar_os` y `cerrar_os` exclusivos del `director` (BR-N244/N249 — umbrales y excepciones). |

No se modificaron: `discovery/`, `SPEC-001..003`, `SPEC-005..011`, ADR, `context/CURRENT.md`, `PROYECTO.md`, los routers/servicios de Comercial (SPEC-003). Working tree sucio inspeccionado y conservado.

---

## Contratos públicos / protegidos

- **`organization_id`** — `orders.organizationId NOT NULL` con FK a `organizations.id`; PK compuesta `(organization_id, id)` (ADR-02 §8.3). `check-multitenancy` valida 28 tablas.
- **`hasPermission` único mecanismo** — `requirePermission('gestionar_ordenes_servicio'|'asignar_pl_os'|'autorizar_os'|'cerrar_os', { forceDb: true })` en cada acción crítica (ADR-06 / AC-81).
- **`audit_logs`** — 13 acciones namespace `os.*`:
  - `os.create` (AC-1) — al aceptar cotización.
  - `os.assign_pl` (BR-N245).
  - `os.set_oc` (BR-N243).
  - `os.pause` / `os.resume` / `os.cancel` (BR-N250).
  - `os.authorize` — actor + rol usado + `advancePaidCents` + `advanceSource` + `directorException`.
  - `os.authorized_to_start` — **evento AC-3** que consume SPEC-005/SPEC-011 (expone `plUserId` + `tipoCobro` + snapshot + `requiresInitialPayment` + `consumers: { projectCreation, subscriptionCreation }`).
  - `os.in_execution` (BR-N247).
  - `os.delivered` (BR-N248).
  - `os.closed` + `os.closed_director_exception` (BR-N249/N394).
  - **Consumido por SPEC-003**: `os.create_pending_from_quote` (ya emitido por `quotes.accept` — sin cambios en SPEC-003, el contrato se honra).
- **Códigos de error canónicos** — 21 nuevos en `ERROR_CODES` (los 4 de AC-2: `PL_NOT_ASSIGNED`, `DEPOSIT_PENDING`, `OC_MISMATCH`, `SUBSCRIPTION_INITIAL_PAYMENT_REQUIRED`; 3 de AC-5/6: `OUTSTANDING_BALANCE`, `FINAL_INVOICE_REQUIRED`, `OC_FILE_REQUIRED`; transiciones: `ORDER_ALREADY_AUTHORIZED`/`DELIVERED`/`CLOSED`/`CANCELLED`, `ORDER_NOT_PAUSED`, `ORDER_NOT_AUTHORIZABLE`; razones: `OS_PAUSE_REASON_REQUIRED`, `OS_CANCEL_REASON_REQUIRED`; cotizaciones: `QUOTE_NOT_ACCEPTED`, `QUOTE_HAS_NO_CLIENT`, `SCOPE_NOT_SIGNED`, `ORDER_ALREADY_EXISTS_FOR_QUOTE`).
- **`sold_total_cents` y `sold_scope_snapshot` inmutables** — sólo se copian desde la cotización aceptada en `createFromAcceptedQuote` (BR-N242). El servicio **NO** expone mutators de estos campos.
- **Umbral 90% fijo** — `OS_ADVANCE_REQUIRED_PCT = 90` constante; cualquier excepción la concede el Director (`autorizar_os` exclusivo del `director`, BR-N244 cerrado Frank).
- **No-acoplamiento verificado** — el servicio de OS **NO** importa `projects` ni `subscriptions` y NO inserta filas en esas tablas. Verificación por grep AC-3: `rg 'into \(projects\)|into \(subscriptions\)|insertInto\(projects|insertInto\(subscriptions' src/server/services/orden-servicio/` ⇒ 0 matches (assertado en test).

---

## Validación

| Corte | Comando | Resultado |
|---|---|---|
| V1 (cut 1 — schema + enums + zod) | `npx tsc --noEmit` (filtrado `src/`) | PASS — 0 errores en `src/` (errores preexistentes en `infrastructure/vectoria-provision/**` fuera de producto). |
| V1 (cut 2 — helpers + servicio) | `npx vitest run tests/spec-20260817-004.test.ts` | PASS — 49/49 unit tests. |
| V1 (cut 3 — UI + router + barrel) | `npx eslint src/ --max-warnings=0` | PASS — 0 errores, 0 warnings en `src/`. |
| V2 (cierre) | `npx vitest run` | PASS — **239/239** (148 baseline + 42 SPEC-003 + 21 SPEC-002 + 49 SPEC-004). |
| V2 (cierre) | `npx tsc --noEmit` filtrado `src/` | PASS — 0 errores en `src/`. |
| V2 (cierre) | `npx eslint src/ --max-warnings=0` | PASS — 0 errores. |
| V2 (cierre) | `npx tsx scripts/check-multitenancy.ts` | PASS — **28 tablas con `organization_id`**; 0 sin. |
| V2 (cierre) | `npx tsx scripts/check-antipatterns.ts` | PASS — **16/16** checks (incluye AC-28 anti-patrón SQL en routers; ningún `import projects/subscriptions` en el servicio OS). |
| V2 (cierre) | `npx tsx scripts/check-seed-permissions.ts` | PASS — matriz BR-N207..N212 consistente con `BASE_PERMISSIONS`. |
| V3 (Playwright) | `pnpm test:e2e` | **NO EJECUTADA** — entorno local no provisionado (gates BD/PostgreSQL/MinIO bloqueados). Las specs (`e2e/orden-servicio.spec.ts`) están escritas y listas para que GEMINI las corra en el gate final contra staging LIVE autorizado por Frank (mismas condiciones que SPEC-002/003). |

---

## Trazabilidad AC

| AC | Implementación | Evidencia |
|---|---|---|
| **AC-1** OS nace al aceptar cotización con copia inmutable | `orders.createFromAcceptedQuote` valida `quotes.status === "accepted"`, `clientId !== null`, `scope.status === "signed"`, copia `soldTotalCents` desde `quote.totalCents` y `soldScopeSnapshot` desde `scope.content` (jsonb). `UNIQUE (organization_id, cotizacion_id)` y check explícito `ORDER_ALREADY_EXISTS_FOR_QUOTE`. El servicio no expone mutators de `sold_total_cents`/`sold_scope_snapshot`. | `src/server/services/orden-servicio/orders.ts:createFromAcceptedQuote`; `tests/spec-20260817-004.test.ts: SPEC-004 · AC-1`; test AC-1 "nextOrderCode arranca en OS-00001" + "incrementa monotónicamente". |
| **AC-2** Autorización valida 4 precondiciones | `orders.authorize` ejecuta en transacción: (a) `before.plUserId` ⇒ `PL_NOT_ASSIGNED` (BR-N245); (b) `validateOc` ⇒ `OC_MISMATCH` (BR-017) y `OC_FILE_REQUIRED`; (c) `checkAdvanceThreshold` con `OS_ADVANCE_REQUIRED_PCT=90` ⇒ `DEPOSIT_PENDING` salvo `directorException` con motivo ≥3 (BR-N244); (d) `subscriptionRequiresInitialPayment(tipoCobro)` y `paid.subscriptionInitialPaid` ⇒ `SUBSCRIPTION_INITIAL_PAYMENT_REQUIRED` (BR-N121). Audit `os.authorize` con `actor_role_code` propagado del contexto (BR-N336 inv. 12). | `src/server/services/orden-servicio/orders.ts:authorize`; `tests/spec-20260817-004.test.ts: SPEC-004 · AC-2 · 4 precondiciones`; helper `OrderAuthorizeInputSchema` con `superRefine` que exige motivo. |
| **AC-3** Evento expone `pl_user_id` + `tipo_cobro` | `authorize` emite dos entradas en `audit_logs`: (1) `os.authorize` con datos de auditoría interna; (2) `os.authorized_to_start` con payload `buildOsAuthorizedEvent({ orderId, organizationId, plUserId, tipoCobro, soldTotalCents, soldScopeSnapshot, cotizacionId, clientId, requiresInitialPayment, authorizedAt, consumers: { projectCreation: "SPEC-005", subscriptionCreation: "SPEC-011" \| "n/a" } })`. AC-3 verificación de no-acoplamiento por grep `insert\(projects\|insert\(subscriptions` ⇒ 0 matches (assertado en test). | `src/server/services/orden-servicio/orders.ts:authorize + buildOsAuthorizedEvent`; `tests/spec-20260817-004.test.ts: SPEC-004 · AC-3 · evento · no-acoplamiento`. |
| **AC-4** OC 4 campos opcionales | `OrderSetOCInputSchema` admite `ocNumber`/`ocDate`/`ocAmountCents`/`ocFileId` opcionales; `validateOc` exige coincidencia `ocAmountCents === soldTotalCents` y `ocFileId` cuando hay monto; `setOC` rechaza con `OC_MISMATCH` u `OC_FILE_REQUIRED`. Sin OC ⇒ `validateOc` retorna `ok: true`. | `src/server/services/orden-servicio/orders.ts:setOC`; `tests/spec-20260817-004.test.ts: SPEC-004 · AC-4 · OC 4 campos`. |
| **AC-5** Cierre técnico vs administrativo | `markDelivered` aplica `canTransitionTo(in_execution, delivered)`; `BR-N392` permite saldo pendiente en este cierre (helper `evaluateCloseAdministrative` se invoca **sólo** en `closeAdministrative`, no en `markDelivered`). `closeAdministrative` exige `canTransitionTo(delivered\|in_execution, closed)`, `evaluateCloseAdministrative({outstandingBalanceCents, finalInvoiceIssued, directorException})` ⇒ `OUTSTANDING_BALANCE` (BR-N249/N394) o `FINAL_INVOICE_REQUIRED` (BR-N393). Excepción Director con motivo ≥3 ⇒ cerrada y auditada (`os.closed_director_exception`). | `src/server/services/orden-servicio/orders.ts:markDelivered + closeAdministrative`; `tests/spec-20260817-004.test.ts: SPEC-004 · AC-5/6`. |
| **AC-6** Factura final antes de cierre administrativo | `evaluateCloseAdministrative` rechaza con `FINAL_INVOICE_REQUIRED` (BR-N393) si `finalInvoiceIssued=false`. El flag `orders.finalInvoiceIssued` se mantiene en false por defecto; SPEC-007 lo activará vía side-effect consumible (contrato documentado, pendiente de SPEC-007). | `src/server/services/orden-servicio/helpers.ts:evaluateCloseAdministrative`; test "closed sin factura final → FINAL_INVOICE_REQUIRED". |
| **AC-7** Pausar/cancelar con motivo | `validateOsReason(reason, 'pause' \| 'cancel')` rechaza con `OS_PAUSE_REASON_REQUIRED` (≥3 chars). `pause` aplica `canTransitionTo(_, 'paused')`; `cancel` rechaza si terminal con `ORDER_ALREADY_CLOSED`/`ORDER_ALREADY_CANCELLED`. `pause` y `cancel` auditan `os.pause`/`os.cancel`. | `src/server/services/orden-servicio/orders.ts:pause + cancel`; `tests/spec-20260817-004.test.ts: SPEC-004 · AC-7`. |
| **AC-8** UI/responsive | Listado responsive con `overflow-x-auto` + `hidden sm:table-cell` (cliente) + `hidden md:table-cell` (tipo de cobro); detalle con grid `grid-cols-1 sm:grid-cols-2`, formularios con `flex flex-col gap-2 sm:flex-row`. Matriz Playwright 3 viewports × 3 tests = 9 ejecuciones en `e2e/orden-servicio.spec.ts` lista para V3. | `src/modules/orden-servicio/ordenes-list.tsx` + `orden-detail.tsx`; `e2e/orden-servicio.spec.ts` (gate V3 pendiente). |

---

## Contratos cruzados

| Contrato | Productor | Consumidor | Estado |
|---|---|---|---|
| `os.create_pending_from_quote` (audit.action) | SPEC-003 `quotes.accept` | **SPEC-004** lee el contexto de la aceptación; el `createFromAcceptedQuote` exige `quote.status === "accepted"` (no lee el audit, lee la fila; contrato consumible por flujo batch). | OK — `quotes.accept` ya emite el audit; el servicio OS verifica `quote.status` (defensa adicional). |
| `os.authorized_to_start` (audit.action) | **SPEC-004** `authorize` | SPEC-005 `project_creation` (universal); SPEC-011 `subscription_creation` (condicional a `tipoCobro=suscripcion`). Payload expone `plUserId`, `tipoCobro`, `soldTotalCents`, `soldScopeSnapshot`, `cotizacionId`, `clientId`, `requiresInitialPayment`, `consumers`. | OK — `buildOsAuthorizedEvent` produce payload estable. SPEC-005/011 pueden consumirlo en sus transacciones (R1 documentado en SPEC §12; coordinación transaccional fuera de SPEC-004). |
| `AdvancePaidProvider` (interface TS) | **SPEC-004** declara `placeholderAdvancePaidProvider` con `source: "placeholder"` | SPEC-008 / SPEC-011 sustituirán el provider en `createOrdersService({ advanceProvider })` cuando publiquen el contrato consumible del anticipo cobrado. | PENDIENTE (no bloqueante): SPEC-004 funciona con 0¢ hasta que SPEC-008/011 publiquen el provider. **SPEC-GAP** documentado en §Riesgos. |
| `Order.finalInvoiceIssued` (boolean, BD) | **SPEC-004** mantiene flag en `false` por defecto | SPEC-007 `facturación` lo activa cuando emita la factura final (BR-N393). Side-effect consumible futuro. | PENDIENTE (no bloqueante): el cierre administrativo asume `finalInvoiceIssued=false` y rechaza con `FINAL_INVOICE_REQUIRED`. SPEC-007 puede añadir un mutator `markFinalInvoiceIssued` o un método en el provider. |
| `Order.closedDirectorException` + `closedBalanceCents` (BD) | **SPEC-004** | BR-N249/394 — sólo el Director (`cerrar_os`) puede emitir cierre con excepción. Audit `os.closed_director_exception`. | OK — implementada. |
| `os.pl_user_id` (BD) | **SPEC-004** `assignPL` | SPEC-005 `project_creation` lo lee para asignar el primer miembro PL al proyecto (BR-N407). | OK — `plUserId` se persiste y se expone en el evento `os.authorized_to_start`. |
| `os.tipo_cobro` (BD) | **SPEC-004** copia de `quotes.tipo_cobro` | SPEC-011 `subscription_creation` lo lee para decidir si crea suscripción (BR-N405). | OK — `tipoCobro` se persiste y se expone en el evento. |
| OS_AUDIT_ACTIONS y OS_ERROR_CODES | **SPEC-004** | n/a (catálogo transversal a `audit_logs` y `ERROR_CODES`). | OK — añadidos a enums transversales (`src/shared/enums`). |

---

## Riesgos y desviaciones

- **R1 (heredado SPEC §12):** coordinación transaccional de `os.authorized_to_start` con SPEC-005/SPEC-011. SPEC-004 produce el evento (`audit_logs`); SPEC-005/011 deben ejecutar sus side-effects en la transacción que reciben el evento. Si una falla, **la atomicidad la orquestan las SPECs consumidoras** (SPEC-004 no debe quedar en `authorized_to_start` si el proyecto no se crea). Contrato: el evento se emite **dentro** de la transacción de `authorize`; rollback transaccional si la auditoría falla. Documentado en SPEC §12.
- **R2 (SPEC-GAP heredado, NO bloqueante para SPEC-004):** el anticipo cobrado real vive en un **contrato consumible** (`AdvancePaidProvider`) declarado por SPEC-004 con `placeholderAdvancePaidProvider` que devuelve `0`. Mientras SPEC-008/SPEC-011 no publiquen el provider real, `authorize` rechazará con `DEPOSIT_PENDING` salvo excepción Director. **Esto es correcto** (la autorización exige anticipo real). Cuando SPEC-008/011 publiquen el provider, basta sustituir en el `appRouter` factory (`createOrdersService({ advanceProvider: realProvider })`) — **sin cambios** en el contrato público ni en BD. Decisión interna reversible.
- **R3 (similar, NO bloqueante):** `finalInvoiceIssued` permanece `false` por defecto hasta que SPEC-007 emita el side-effect consumible. Mientras tanto, el cierre administrativo exige que el Director active `finalInvoiceIssued` por una vía controlada (futura). El helper `evaluateCloseAdministrative` ya retorna `FINAL_INVOICE_REQUIRED` cuando el flag es `false` (cumple BR-N393).
- **R4:** umbral del 90% es **constante fija** (`OS_ADVANCE_REQUIRED_PCT = 90`). P-004-1 (Frank: configurable o fijo) cerrado: fijo. Si Frank decide hacerlo configurable, el cambio se localiza en una constante (blast radius ≤1 línea + ajuste de `BASE_PERMISSIONS`/`seed` si aplica).
- **R5:** `closeAdministrative` usa `advancePaidCents` del provider para calcular `outstandingBalanceCents`. Si el provider retorna `0` (placeholder), el cierre con saldo >0 siempre requiere excepción Director. Misma estrategia que R2.
- **D1:** `preflightAuthorize` en el router devuelve `advancePaidCents: 0` mientras el provider sea `placeholder`. La UI muestra explícitamente `advanceProviderSource: "placeholder"` para que el operador sepa que el dato no es final. UX honesta.

---

## Pendientes ATLAS

- **A1:** gate GEMINI V3 contra staging LIVE (Frank-auth). Las specs `e2e/orden-servicio.spec.ts` están listas (3 tests × 3 viewports = 9 ejecuciones) y dependen de bootstrap + app + PostgreSQL/MinIO provisionados.
- **A2:** coordinar con el dueño de SPEC-008 (Cobranza) el contrato `AdvancePaidProvider`. Cuando lo publique, sustitución en el `appRouter` factory (no toca SPEC-004).
- **A3:** coordinar con el dueño de SPEC-007 (Facturación CFDI) el side-effect `markFinalInvoiceIssued` (BD o método en provider) para que el cierre administrativo pase automáticamente cuando se emita la factura final.
- **A4:** cuando SPEC-005/SPEC-011 emitan sus side-effects, decidir si el evento `os.authorized_to_start` se sigue emitiendo como `audit.action` o si migra a un job/cola (BR-N246/407/405). El contrato público (`buildOsAuthorizedEvent`) es estable.

---

## SPEC-GAP

No se devuelve `SPEC-GAP` a ATLAS. El umbral 90% está fijado por BR-N244 y codificado como constante (`OS_ADVANCE_REQUIRED_PCT = 90`) — NO se convirtió en gap.

Dos contratos consumibles pendientes (R2/R3) están documentados como **riesgos reversibles internos**, no como gaps de SPEC. El servicio OS funciona end-to-end con el provider placeholder; la sustitución por el provider real no requiere SPEC-GAP porque el contrato ya está publicado en `AdvancePaidProvider`.

---

## Notas de reversión (recomendación, NO ejecución)

Si se requiere revertir el incremento:

1. **Revertir migración de BD:** la tabla `orders` se crea con `db:generate`/`db:migrate`. El script de rollback de la migración Drizzle es responsabilidad del flujo de mantenimiento; en MVP no hay migraciones autorreversibles. Recomendado: documentar en una SPEC futura la migración `drop_orders.sql` (sin ejecutarla).
2. **Revertir código:** `git revert <commit>` (sin ejecutar; pendiente autorización Frank). El blast radius está contenido en:
   - `src/server/db/schema/orders.ts` (eliminar).
   - `src/server/db/schema/index.ts` (quitar export).
   - `src/server/services/orden-servicio/` (eliminar).
   - `src/server/services/index.ts` (quitar `ordenServicioService`).
   - `src/server/trpc/routers/orden-servicio.ts` (eliminar).
   - `src/server/trpc/root.ts` (quitar montaje).
   - `src/app/(dashboard)/ordenes-servicio/` (eliminar).
   - `src/modules/orden-servicio/` (eliminar).
   - `src/modules/plataforma/layout/navigation.tsx` (quitar link).
   - `src/shared/enums/index.ts` (quitar enums OS + códigos + permisos).
   - `src/shared/zod/index.ts` (quitar esquemas OS).
   - `src/shared/utils/messages.ts` (quitar `ordenes.*` + `nav.ordenesServicio`).
   - `scripts/check-multitenancy.ts` (quitar `orders`).
   - `scripts/seed-data.ts` (quitar permisos OS).
   - `tests/spec-20260817-004.test.ts` (eliminar).
   - `e2e/orden-servicio.spec.ts` (eliminar).
3. **Sin acoplamientos:** el servicio OS no modifica tablas de otros módulos y no introduce migraciones irreversibles.

No se ejecuta ninguna acción mutante (sin commit/push/PR/deploy/rollback).

---

## Estado

`READY_FOR_VERIFYING`. SOFIA no declara `DONE` (§3 IDL).
