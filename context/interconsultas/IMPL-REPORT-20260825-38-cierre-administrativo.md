---
ID intervención: IMPL-20260825-38
ID tarea: IMPL-20260825-38
Estado: READY_FOR_VERIFYING
SPEC: SPEC-20260817-004 §6 (cierre administrativo) + SPEC-20260817-007 (timbrado) + SPEC-20260817-008 (cobranza); reconcile `finalInvoiceIssued` y saldo de cierre.
Scope: B-4 · SPEC-GAP técnico confirmado por QA-20260825-34 (pago PASS, cierre BLOCKED). Corregir contrato SPEC-004↔007↔008 con cambio reversible, sin migración, sin tocar UI de cobro, sin tocar Facturapi.
Origen handoff: ATLAS (turno continuo, post IMPL-37)
Fecha: 2026-08-26 (turno continuo)
Implementador: SOFIA
---

# IMPL-20260825-38 · Reconciliación `finalInvoiceIssued` + saldo de cierre

## Resumen

QA-20260825-34 dejó evidencia reproducible: tras `cobros.register` +
`cobros.confirm` con pago total, la factura F-00005 quedó `pagada`
(`paidCents = totalCents = 12,760,000`), pero `closeAdministrative`
sobre OS-00001 devolvió **409 `OUTSTANDING_BALANCE`** con saldo
`12,760,000` y `finalInvoiceIssued = false`. Causa raíz doble,
mismo módulo SPEC-004:

1. `closeAdministrative` (`src/server/services/orden-servicio/orders.ts:881-890`)
   calculaba el saldo con `advanceProvider.getAdvancePaidCents(...)` —
   placeholder que devuelve `0` (anticipo de cotización, no cobro
   SPEC-008). El cobro confirmado por `cobranza.cobros.confirm`
   actualiza `invoices.paidCents`, NO el provider.
2. `finalInvoiceIssued` permanecía `false` porque ningún side-effect
   de `facturacion.timbrar` lo activaba; por lo que aun con saldo
   cero el cierre fallaría con `FINAL_INVOICE_REQUIRED` (BR-N393).

Ambos defectos son reversibles, sin cambio de contrato público, sin
schema, sin nueva API. Frank autorizó la corrección directa vía
SPEC-GAP confirmado por QA.

## Cambios (4 archivos)

| Archivo | Cambio |
|---|---|
| `src/server/services/facturacion/invoices.ts` | (1) `timbrar`: tras el UPDATE a `status='emitida'`, dentro del mismo `withTx`, si `updated.orderId` está presente, ejecuta `UPDATE orders SET final_invoice_issued = true WHERE id = orderId AND organization_id = orgId` (idempotente). (2) Audit explícito `action: 'os.final_invoice_issued'` (independiente de `factura.timbrar`) para trazabilidad. (3) `timbrarSystem`: aplica el mismo side-effect tras el UPDATE (no usa `withTx` por motivos históricos del job recurrente; la operación es idempotente y no abre transacción nueva). (4) Import añadido `orders` al import group del schema. |
| `src/server/services/orden-servicio/orders.ts` | (1) Import añadido `invoices` al import group del schema. (2) `closeAdministrative`: la fuente de saldo del cierre pasa a ser `sum(invoices.paidCents) WHERE invoices.orderId = before.id AND invoices.status != 'cancelada'` (mismo patrón que `osOutstandingBalance` en finanzas). (3) `outstandingBalanceCents = max(0, soldTotalCents - totalPaidCents)` — `Math.max(0, …)` evita balance negativo defensivo. (4) `closedBalanceCents` se persiste con el saldo calculado. (5) El contrato de anticipo (`advanceProvider.getAdvancePaidCents`) **se conserva intacto** para `authorize` (BR-N244, ≥90% anticipo) — sólo cambia el camino de `closeAdministrative`. (6) `directorException` y motivo obligatorio se preservan sin cambios. (7) Audit `os.closed` y `os.closed_director_exception` sin cambios. |
| `tests/spec-20260817-004.test.ts` | **8 tests nuevos** (`describe("IMPL-20260825-38 · B-4 …")`): importa `invoices`; `closeAdministrative` consulta `invoices.orderId`/`paidCents` y NO `advanceProvider`; cierre con saldo 0 + factura final OK; pago parcial mantiene `OUTSTANDING_BALANCE`; cierre normal conserva `closedBalanceCents=0`; el contrato de anticipo se preserva en `authorize`; `closedBalanceCents` se persiste con el `outstandingBalanceCents`; `Math.max(0, …)` evita balance negativo. |
| `tests/spec-20260817-007.test.ts` | **4 tests nuevos** (`describe("IMPL-20260825-38 · B-4 · timbrar marca finalInvoiceIssued en la OS")`): `timbrar` actualiza `orders.finalInvoiceIssued=true` cuando hay `orderId`; `timbrar` emite audit `os.final_invoice_issued`; `timbrarSystem` también marca el flag; el side-effect es idempotente (sin `WHERE finalInvoiceIssued=false`). |

**Sin cambios en:** `src/server/trpc/routers/facturacion.ts`,
`src/server/trpc/routers/orden-servicio.ts`, `src/server/trpc/routers/cobranza.ts`,
schemas zod, `invoices.ts` (cancel path), `cobranza/cobros.ts`,
schema Drizzle, `audit.service`, `permissions`, UI de cobro
(IMPL-37), UI de OS, UI de Facturapi, PAC/Facturapi.

## Decisiones internas reversibles

- **`invoices.paidCents` como fuente del saldo de cierre, no la
  join `paymentApplications + payments.status='confirmado'`.**
  Justificación: `invoices.paidCents` ya es mantenido por
  `cobranza.cobros.confirm` (+apps) y `cobranza.cobros.reverse`
  (−apps revertidas). Refleja el cobro neto por factura y es
  la métrica más estable para el saldo de cierre. La alternativa
  (join explícito) es funcionalmente equivalente pero más
  costosa y duplica una invariante ya mantenida por SPEC-008.
  Si en el futuro SPEC-008 introduce un `invoices.paidCents`
  divergente del join, este código se puede sustituir con un
  único cambio (sin tocar API pública).

- **`Math.max(0, …)` defensivo en el cierre.** El campo
  `invoices.paidCents` está acotado por
  `validatePaymentApplication` (`availableInvoiceCents =
  totalCents - paidCents`), por lo que no debería haber
  sobrepago. El `Math.max(0, …)` es una defensa adicional para
  el caso borde (migración legacy, replay de auditoría, etc.)
  y NO cambia el comportamiento en el camino normal.

- **`timbrar` usa `withTx` (transaccional con el UPDATE de la
  factura). `timbrarSystem` no.** El side-effect se aplica
  inmediatamente después del UPDATE de la factura en ambos
  casos. La diferencia es que `timbrar` ejecuta el side-effect
  dentro de la misma transacción que el UPDATE (atómico),
  mientras que `timbrarSystem` lo hace fuera (job recurrente,
  no fue migrado a `withTx`). La idempotencia del
  `finalInvoiceIssued = true` (un UPDATE al mismo valor es
  no-op) cierra la ventana de inconsistencia.

- **No filtrar por `finalInvoiceIssued = false` en el UPDATE.**
  La idempotencia se obtiene por el valor constante (`true`),
  no por una condición previa. Si en el futuro se quisiera
  distinguir "primer timbrado" de "re-timbrado cancelado",
  bastará añadir un `WHERE` adicional.

## Validación

- **typecheck (`pnpm typecheck`)**: **PASS** (sin output, exit 0).
- **tests V2 completa (`pnpm test`)**: **1014/1014 PASS** en 32
  ficheros · 8.15 s
  - `tests/spec-20260817-004.test.ts`: **57/57** (49 originales
    + **8 nuevos** B-4 cierre).
  - `tests/spec-20260817-007.test.ts`: **105/105** (101 originales
    + **4 nuevos** B-4 timbrar).
  - `tests/spec-20260817-008.test.ts`: **58/58** (sin regresión).
  - `tests/impl-20260825-34.test.ts`: **65/65** (sin regresión).
  - Resto: **729/729** PASS.
- **lint (`pnpm lint`)**: 17 errores totales, **0 introducidos
  por este incremento**. ESLint directo sobre los 4 archivos
  modificados: **PASS silencioso**. Los 17 errores son
  preexistentes en `tests/autonomous-loop/**` y
  `infrastructure/vectoria-provision/**` (baseline B-3, fuera
  de alcance).
- **Ejecución real contra el backend:** **NO EJECUTADA** en este
  corte. La corrección es un cambio determinista en la consulta
  SQL del cierre y un UPDATE idempotente en `timbrar`; ambos
  patrones ya están en uso en `cobranza.cobros.confirm` y
  `finanzas-service.osOutstandingBalance`. La validación
  funcional real contra staging (con F-00005 `pagada` ya
  persistida por IMPL-37) corresponde al gate GEMINI V3.

## Trazabilidad a criterios

| Criterio | Evidencia |
|---|---|
| **AC-1 (timbrar emitida marca `finalInvoiceIssued`)** | `tests/spec-20260817-007.test.ts` describe B-4 — 4 tests cubren: UPDATE en mismo `tx`, audit `os.final_invoice_issued`, mismo path en `timbrarSystem`, idempotencia. |
| **AC-2 (pago total ⇒ cierre normal sin excepción)** | `tests/spec-20260817-004.test.ts` B-4 — test "cierre con saldo=0 + finalInvoice=true → evaluateCloseAdministrative.ok=true" + test "cierre normal mantiene closedBalanceCents=0". |
| **AC-3 (pago parcial mantiene `OUTSTANDING_BALANCE`)** | `tests/spec-20260817-004.test.ts` B-4 — test "pago parcial mantiene OUTSTANDING_BALANCE (sin excepción Director)" con 6,380,000 de 12,760,000. |
| **AC-4 (factura cancelada no reduce saldo)** | `tests/spec-20260817-004.test.ts` B-4 — test "orders.ts: closeAdministrative consulta invoices.orderId y suma paidCents (no anticipo)" verifica `r.status !== "cancelada"` en el filter. |
| **AC-5 (sin regresión suite)** | V2 1014/1014 PASS; `tests/spec-20260817-008.test.ts` 58/58 (cobranza intacta); `tests/impl-20260825-34.test.ts` 65/65 (sin tocar). |
| **AC-6 (contrato de anticipo intacto)** | `tests/spec-20260817-004.test.ts` B-4 — test "el contrato de anticipo se conserva en `authorize`" verifica que `advanceProvider.getAdvancePaidCents` sigue en uso dentro del bloque `authorize` y NO dentro del bloque `closeAdministrative`. |

## Reversión (sin pérdida de datos)

1. **Revertir `src/server/services/facturacion/invoices.ts`:**
   quitar el bloque `IMPL-20260825-38 · B-4 · side-effect` en
   `timbrar` (líneas 805-821) y el bloque audit
   `os.final_invoice_issued` (líneas 836-847); quitar el bloque
   paralelo en `timbrarSystem` (líneas 1677-1690); revertir el
   import `orders` del schema (línea 52). Validar: 1010/1010.

2. **Revertir `src/server/services/orden-servicio/orders.ts`:**
   sustituir el bloque `IMPL-20260825-38 · B-4 · saldo pendiente`
   (líneas 877-905) por el original con `advanceProvider`.
   Revertir el import `invoices` (línea 36). Validar: 1006/1006.

3. **Revertir los tests:** borrar los dos `describe` B-4 en
   `tests/spec-20260817-004.test.ts` (líneas 510-612) y
   `tests/spec-20260817-007.test.ts` (líneas 2590-2648). Validar:
   1002/1002.

## Riesgos y desviaciones

- **Riesgo bajo**: `timbrar` ya estaba en `withTx`; añadir un
  UPDATE adicional no abre una ventana de inconsistencia. Si el
  UPDATE a `orders` fallara, Drizzle hace rollback del UPDATE a
  `invoices` también.
- **Riesgo bajo**: `closeAdministrative` ya está en `withTx`; la
  nueva consulta a `invoices` se ejecuta dentro del mismo
  contexto transaccional. El saldo se calcula con los datos
  persistidos al momento del UPDATE.
- **Riesgo muy bajo (sistema de job)**: `timbrarSystem` no usa
  `withTx` por motivos históricos. Si el UPDATE a `orders`
  fallara tras un timbrado exitoso, el job habría emitido el
  CFDI pero no habría marcado el flag. Esto se recupera en el
  siguiente intento del job (idempotencia).
- **Sin desviaciones del SPEC-GAP**: el contrato de `cobros`,
  `authorize`, anticipo, OC, suscripción y permisos no se
  modificaron.

## Pendientes ATLAS

- **Gate GEMINI V3** sobre staging LIVE (Frank autorizó billing
  staging en IMPL-37; las facturas F-00005 ya está `pagada`).
  Validar:
  1. Re-timbrar F-00005 no rompe (idempotencia del side-effect).
  2. `closeAdministrative` sobre OS-00001 ahora devuelve 200
     `closed` con `closedBalanceCents=0`.
  3. `finalInvoiceIssued = true` queda persistido en la OS.
  4. Una factura `cancelada` no entra al cómputo del saldo.
- **No** se solicita SPEC-GAP adicional: el alcance B-4 está
  cerrado.

## Cambios a `context/CURRENT.md`

NO se modifica `context/CURRENT.md` en este incremento: la
instrucción del handoff B-3 fue agregar nota "sólo si no mezcla
cambios ajenos". El archivo se modificará al final del turno
cuando ATLAS consolide el WIP del día; mezclar aquí podría
confundir al lector sobre el estado actual del proyecto.

---

# Estado del incremento

| Métrica | Valor |
|---|---|
| Sesiones SOFIA usadas | 1 (≤6) |
| Tool calls totales | <300 |
| Archivos modificados | 4 |
| Líneas añadidas | +237 |
| Líneas modificadas | -12 |
| Tests añadidos | +12 (8 + 4) |
| Tests V2 | 1014/1014 PASS |
| Typecheck | PASS |
| Lint (delta) | 0 errores nuevos |
| Contratos públicos cambiados | 0 |
| Schema/migración | NO |
| Permisos | NO |
| UI | NO |
| Reversibilidad | Sí (sin pérdida de datos) |
| Listo para gate GEMINI V3 | sí |
