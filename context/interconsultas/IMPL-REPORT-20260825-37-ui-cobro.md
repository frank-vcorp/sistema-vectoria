---
ID intervención: IMPL-20260825-37
ID tarea: IMPL-20260825-37
Estado: READY_FOR_VERIFYING
SPEC: SPEC-20260817-008 (Cobranza) — AC-1 (registro) + AC-11 (UI mínima)
Scope: incrementar UI de alta de cobro en `cobros-list.tsx`; backend ya provee `cobros.register` + `cobros.confirm`.
Origen handoff: ATLAS (turno continuo)
Fecha: 2026-08-26 (turno continuo)
Implementador: SOFIA
Proveedor: backend ya existente (`cobranza.cobros.register` + `confirm`)
---

# IMPL-20260825-37 · UI mínima para alta de cobro

## Resumen

Bloqueo B-3: el backend ya provee `cobranza.cobros.register` y
`cobranza.cobros.confirm` (router en `src/server/trpc/routers/cobranza.ts`,
schemas `PaymentRegisterInputSchema` y `PaymentConfirmInputSchema`),
pero `src/modules/cobranza/cobros-list.tsx` sólo permitía
Confirmar/Reversar sobre cobros ya existentes. No había UI para
el alta (registro) de un cobro nuevo. Frank autorizó billing
staging y pidió completar el camino existente sin APIs nuevas ni
schema. Este corte implementa la orquestación UI mínima:

1. Botón visible `Registrar cobro` en la tab Cobros
   (`messages.cobranza.new`, ya canónico).
2. Modal responsive con los campos: `clientId` (UUID),
   `invoiceId` (UUID de factura a aplicar), `amount` en MXN
   convertido a cents, `method` (`PAYMENT_METHODS` enum cerrado),
   `reference` opcional, `paymentDate` default hoy (UTC midnight,
   YYYY-MM-DD).
3. Validaciones visibles con `role="alert"`; el submit queda
   deshabilitado mientras haya errores.
4. Submit en dos pasos: `cobranza.cobros.register(...)` →
   `cobranza.cobros.confirm({ paymentId, applications: [{ invoiceId,
   amountCents }] })`. El modal **NO** se cierra hasta que ambas
   mutaciones devuelvan 2xx; `list.invalidate()` se ejecuta sólo
   en éxito completo. Si la segunda falla, el modal sigue abierto
   con un mensaje específico (cobro registrado, aplicación
   falló).
5. Errores backend (incluido "amount > saldo") se proyectan
   directamente: el `DomainError` del backend llega al
   `submitError` y se muestra con `role="alert"`. Sin falso éxito.

Sin cambios a backend, router, schemas, permisos o storage. Las
acciones Confirmar/Reversar existentes se conservan idénticas.

## Archivos modificados (3)

| Archivo | Cambio |
|---|---|
| `src/modules/cobranza/cobros-list.tsx` | (1) Botón `Registrar cobro` en el header de la tab (`data-testid="cobros-list-register-open"`). (2) Nuevo componente `RegisterCobroDialog` (responsive, `role="dialog"`, `aria-modal="true"`, `items-end sm:items-center`) con 6 campos (clientId/invoiceId/amount/method/reference/paymentDate) y 2 bloques `role="alert"` (field-error y submit-error). (3) Submit orquestado: `await register.mutateAsync({ clientId, amountCents, method, paymentDate, reference? })` → `paymentId` → `await confirm.mutateAsync({ paymentId, applications: [{ invoiceId, amountCents }] })` → `utils.cobranza.cobros.list.invalidate()` + `onClose()`. (4) Conversión MXN → centavos con `Math.round(n * 100)`. (5) Default `paymentDate` con `setUTCHours(0,0,0,0)` + `toISOString().slice(0,10)`. (6) Preserva Confirmar/Reversar existentes sin cambios. |
| `src/shared/utils/messages.ts` | 13 claves nuevas bajo `messages.cobranza`: `registerTitle`, `registerSubmitting`, `registerSuccess`, `registerAmountMXN`, `registerAmountHelp`, `registerClientId`, `registerInvoiceId`, `registerPaymentDateHelp`, `registerUuidInvalid`, `registerAmountInvalid`, `registerInvoiceRequired`, `registerAmountExceedsSaldo`, `registerSubmitBothError`. |
| `tests/spec-20260817-008.test.ts` | (1) Nuevo describe `IMPL-20260825-37 · AC-9 · UI alta de cobro en cobros-list` con **8 tests** estáticos sobre `cobros-list.tsx` + `messages.ts`: botón visible con `data-testid` canónico; dialog responsive con campos requeridos; validación UUID/amount/fecha; envío en cents (no MXN); secuencia `register → confirm` con `applications`; error UI visible sin cerrar; default `paymentDate` hoy; claves de mensajes presentes. |

**Sin cambios en:** `src/server/trpc/routers/cobranza.ts`,
`PaymentRegisterInputSchema`, `PaymentConfirmInputSchema`,
`PaymentMethodSchema`, `PAYMENT_METHODS`, permisos
`gestionar_cobros`/`ver_cxc_otros`, `files`, `audit`, storage,
`facturacion`, refund, cancelación, cierre automático.

## Validación

- **typecheck (`pnpm typecheck`)**: **PASS** (sin output, exit 0).
- **tests (V2 completa, `pnpm test`)**: **1002/1002 PASS** en 32
  ficheros · 7.98 s
  - `tests/spec-20260817-008.test.ts`: **58/58** (50 originales
    + **8 nuevos** AC-9 UI alta de cobro).
  - `tests/impl-20260825-34.test.ts` (intento 3): **65/65** (sin
    regresión).
  - `tests/spec-20260817-007.test.ts` (Facturapi): **101/101** (sin
    regresión).
  - Resto: **778/778** PASS.
- **lint (`pnpm lint`)**: 17 errores totales, **0 introducidos
  por este incremento**. ESLint directo sobre `cobros-list.tsx` y
  `tests/spec-20260817-008.test.ts`: **PASS silencioso**. Los 17
  errores son preexistentes en
  `infrastructure/vectoria-provision/**` y
  `tests/autonomous-loop/**` (baseline, fuera de alcance).
- **Ejecución real contra el backend:** NO EJECUTADA en este
  corte. El backend ya estaba validado por QA V3 (no es alcance
  del incremento). El flujo UI → backend se valida con el suite
  V2 que NO hace llamadas reales.

## Decisiones internas reversibles

- **Modal NO cierra ante cualquier fallo:** sólo cierra cuando
  `register` Y `confirm` devuelven 2xx. Si `confirm` falla tras
  un `register` exitoso, el modal permanece abierto con un
  mensaje explícito (`registerSubmitBothError` + msg) para que
  el usuario pueda corregir la factura o contactar soporte.

- **MXN → cents en cliente, no en backend:** la conversión es
  responsabilidad de la UI (no del servicio). El backend ya
  exige `amountCents: number().int().positive()`. Si el input
  MXN es "1234.56", se envía `123456` centavos.

- **Default `paymentDate` UTC midnight:** `setUTCHours(0,0,0,0)`
  + `toISOString().slice(0,10)`. Consistente con el patrón ya
  usado en `orden-detail.tsx` (IMPL-34 intento 3) y
  `CreateInvoiceDraftDialog`. Evita drift por zona horaria del
  usuario.

- **`method` con `PAYMENT_METHODS` enum cerrado:** sin input
  libre. Coherente con el enum backend (BR-N123 catálogo
  cerrado en MVP; cualquier ampliación requiere DEC-).

- **Errores backend en `role="alert"` sin filtrar:** la UI no
  modifica el `message` del `DomainError`. La sanitización es
  responsabilidad del backend (ya validada). Si el backend dice
  "amount exceeds saldo", la UI lo muestra tal cual. Sin
  duplicación de lógica de error.

- **`cobros.register` ya validaba clientId/amountCents/method
  /paymentDate antes de este incremento** (PagoRegisterInputSchema).
  La UI duplica sólo la validación de UUID/amount/fecha para
  feedback inmediato; el backend es la fuente de verdad.

- **No se toca Confirmar/Reversar existentes:** las acciones
  `confirm.mutate({ paymentId: id })` y `reverse.mutate({ paymentId,
  reason })` siguen idénticas en `CobroActions`. La única
  adición es el botón `Registrar cobro` en el header.

- **`registerOpen` local state + `onClose` callback:** la
  responsabilidad de cerrar el modal al éxito se delega al
  padre (`CobrosList`) vía `onClose()`. Esto permite que el
  componente `RegisterCobroDialog` sea testeable de forma
  aislada en el futuro.

## Trazabilidad AC ↔ pruebas

| AC (handoff ATLAS) | Implementación | Prueba |
|---|---|---|
| Botón visible `Registrar cobro` | `cobros-list.tsx` botón en header con `messages.cobranza.new` + `data-testid="cobros-list-register-open"` | AC-9 test 1 |
| Modal responsive con campos clientId/invoiceId/amount/method/reference/paymentDate | `RegisterCobroDialog` con `role="dialog"`, `aria-modal="true"`, `items-end sm:items-center`, 6 inputs con `data-testid` | AC-9 test 2 |
| Validaciones visibles y no enviar si inválido | Regex UUID 8-4-4-4-12, regex YYYY-MM-DD, `amountCents = Math.round(n * 100)`; `canSubmit = fieldError === null && !submitting`; botón deshabilitado | AC-9 test 3 |
| Submit: register → confirm con applications; cerrar sólo tras AMBAS 2xx | `await register.mutateAsync(...)` → `paymentId` → `await confirm.mutateAsync({ paymentId, applications: [{ invoiceId, amountCents }] })` → `utils.cobranza.cobros.list.invalidate()` + `onClose()` | AC-9 tests 4, 5 |
| Errores en `role="alert"`; no falso éxito | `<p role="alert">` con `data-testid="cobros-list-register-submit-error"`; modal NO cierra ante fallo | AC-9 test 6 |
| amount > saldo: mostrar error | El `DomainError("AMOUNT_EXCEEDS_SALDO")` del backend se proyecta directo en `submitError` con `role="alert"` (sin filtrar); la UI no duplica validación de saldo | AC-9 test 6 |
| Preservar Confirmar/Reversar existentes | `CobroActions` y `ReverseDialog` sin cambios; nuevo `RegisterCobroDialog` es aditivo | AC-9 tests 1, 2 (verifican aditividad) |
| Permisos/backend sin cambios | No se modifica router, schemas, permisos, storage, `facturacion`, refund, cancelación, cierre automático | typecheck PASS + 944/944 sin regresiones |

## Riesgos y desviaciones

- **Riesgo bajo.** Cambio UI aditivo: un botón nuevo, un
  componente nuevo, 13 claves de mensajes. Cero cambios al
  backend. Si Frank descubre un edge case (ej. un campo
  adicional), basta extender el `RegisterCobroDialog` y
  `messages.cobranza` sin tocar nada más.

- **Compatibilidad con Confirmar/Reversar:** el flujo de alta
  es ortogonal al flujo de Confirmar (que ya existía). Un cobro
  registrado sin `invoiceId` quedaría en estado `registrado`
  y podría ser Confirmado o Reversado después por separado.
  Sin embargo, este UI **siempre** envía `invoiceId` (es
  obligatorio); un cobro sin aplicación nunca queda en
  `registrado` aislado.

- **No edición inline:** este UI NO edita cobros `registrados`
  después del alta. La edición la cubre `cobros.update` (que
  existe en el router) pero no se usa en esta UI. Si Frank
  pide edición post-alta, queda para un incremento posterior.

- **No se prueba comportamiento interactivo completo:** los
  tests son estáticos (verificación de source) por la
  complejidad de mockear `mutateAsync` con `trpc.useUtils`.
  El flujo se valida manualmente en staging por Frank.

- **Lint baseline:** los 17 errores de `pnpm lint` son
  preexistentes. ESLint directo sobre los archivos tocados:
  PASS silencioso.

## Pendientes ATLAS

- **Redeploy + V3 staging manual** por Frank (no QA Playwright
  en este incremento porque el backend ya estaba validado):
  crear un cobro de $1000 MXN para una factura con saldo
  $2000; ASSERT: la factura queda con saldo $1000 y cobro en
  `confirmado`. Crear un cobro de $5000 para la misma factura
  con saldo $2000; ASSERT: error visible con `role="alert"`,
  modal sin cerrar.

- **Edición post-alta (`cobros.update`):** si Frank la pide, queda
  para un incremento posterior. El router ya provee el endpoint.

- **Aplicación parcial (múltiples facturas en un solo cobro):**
  el schema `applications` es `array`, pero la UI actual sólo
  soporta 1 aplicación por cobro. Si Frank pide N aplicaciones
  por cobro, queda para un incremento posterior.

- **Live/producción:** NO se activa. Sólo staging con Frank
  (billing staging autorizado).

## Notas de reversión

Reversible sin pérdida de datos (sólo UI):

1. Revertir `src/modules/cobranza/cobros-list.tsx`: quitar el
   bloque del botón `Registrar cobro` en el header y el
   `<RegisterCobroDialog ... />` al final.
2. Revertir las 13 claves en `messages.cobranza`.
3. Borrar `describe("IMPL-20260825-37 · AC-9 ...")` en
   `tests/spec-20260817-008.test.ts`.
4. Validar: `pnpm typecheck && pnpm test` debe volver a 994/994
   (sin los 8 nuevos).

No hay datos persistidos nuevos introducidos por este
incremento. Si se creó algún cobro en staging durante el V3
manual, queda persistido en `payments` (sin cambios al schema
backend). El backend `cobros.register`/`cobros.confirm` queda
intacto.

---

## Cambios a `context/CURRENT.md`

NO se modifica `context/CURRENT.md` en este incremento: la
instrucción del handoff es agregar nota "sólo si no mezcla
cambios ajenos". El archivo se modificará al final del turno
cuando ATLAS consolide el WIP del día; mezclar aquí podría
confundir al lector sobre el estado actual del proyecto.

---

# V3 staging (GEMINI · QA-20260825-34) · evidencia de ejecución real

> Registro de la ejecución real contra staging (que en el corte
> quedó como "NO EJECUTADA"). Commit `e002224`, deployment
> `tvwpgxvu5p3ci5xmfzobzyod`. Veredicto del pago: **PASS**. Cierre
> administrativo: **BLOCKED** (gap de contrato backend, no UI).

## Pago sintético (PASS)

- `cobranza.cobros.register` → **200**, `paymentId=b383e711-5bdd-47ec-b163-31d903cb8a79`.
- `cobranza.cobros.confirm({ paymentId, applications:[{ invoiceId:F-00005, amountCents:12760000 }] })` → **200**, `status=confirmado`, `application=ca293b14-…`.
- Cobro en lista: `method=transferencia`, `reference=TEST-FACTURAPI-20260826`, `paymentDate=2026-08-26`, `12,760,000¢`, `confirmado`.
- F-00005 → `pagada`, `paidCents=12,760,000 = totalCents`, `cfdiUuid` conservado.
- Sin sobrepago ni duplicación tras reload. Desktop 1280 + mobile 375: `overflow=false`, 0 page/request/http errors.

## Cierre administrativo (BLOCKED, hallazgo B-4)

El botón "Cerrar OS" (sin excepción) en la OS-00001 devuelve
`409 OUTSTANDING_BALANCE` ("Saldo pendiente sin excepción Director")
aunque la factura F-00005 esté `pagada`:

- `closeAdministrative` calcula el saldo con
  `advanceProvider.getAdvancePaidCents(...)` (anticipo de la
  cotización), **no** con el `paidCents` de la factura SPEC-008.
  Por eso el saldo de la OS sigue `12,760,000` pese al cobro.
- `finalInvoiceIssued` permanece `false` (no hay side-effect que lo
  active), por lo que aun con saldo cero el cierre fallaría con
  `FINAL_INVOICE_REQUIRED`.

Esto NO es un defecto de IMPl-37 (la UI de cobro funciona), sino
un gap de reconciliación SPEC-004↔007↔008 a resolver por ATLAS.

## Evidencia

- QA: `context/reviews/QA-20260825-34-SPEC-007-invoice-draft.md` (sección "PAGO SINTÉTICO + CIERRE").
- Capturas en `test-results/invoice-draft-staging-20260825/`: `billing3-0[0-4]-*.png`.
- Runners: `/tmp/kilo/billing3-{payment,mobile}.cjs`.
