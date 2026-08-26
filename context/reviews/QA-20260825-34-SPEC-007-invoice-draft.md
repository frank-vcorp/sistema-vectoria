---
ID tarea: QA-20260825-34
Auditoría: GEMINI · V3 gate final (Playwright contra staging, desktop 1280 + mobile 375)
SPEC/ADR: SPEC-20260817-007 (Facturación CFDI) + SPEC-20260817-004 (Orden de Servicio) · BR-N301/N218/N303
Incremento: IMPL-20260825-34 — acción "Crear factura borrador" desde OS `delivered`/`closed` (commit `98ea51a`)
Origen handoff: ATLAS (QA-20260825-34)
Fecha: 2026-08-25/26 (turno continuo)
Auditor: GEMINI
---

# QA-20260825-34 · SPEC-007 — "Crear factura borrador" desde OS `delivered`/`closed`

## QA-VERDICT: `FAIL`

El flujo se **verificó E2E contra staging en desktop 1280 (OS-00001) y mobile 375 (OS-00002)**, ambas OS en `delivered`, y el camino UI ("Card → botón → diálogo accesible → validación de fecha") funciona, **pero el criterio núcleo no se alcanza**: la mutación `facturacion.buildFromOrder` devuelve **409 `INVOICE_FISCAL_DATA_REQUIRED`** (0 facturas creadas ⇒ no hay `id`/`code`/`status=borrador`/total que verificar ni persistencia en `/facturacion`). Además se detectó un **defecto financiero latente P1 de doble IVA** (la factura saldría 16% por encima del total de la OS) y un **P2 de fallo silencioso** (el error del backend queda ocluido por el diálogo modal).

- **Criterios PASS (verificados):** botón visible en `delivered` con label exacto y `disabled=false`; diálogo `role=dialog` + `aria-modal` + `aria-label`; validación cliente fecha `< hoy+7` -> `role=alert` "al menos 7 días posterior" **sin request** (0 `buildFromOrder`); fecha válida habilita el submit; sin falso éxito en `onError` (bloque éxito nunca se pinta tras 409); reload sin falso éxito; **0 timbrar/cancelar/pagar** (wire guard = 0 en los 5 endpoints); `overflow=false` en 1280 y 375; `pageErrors=[]`, `requestFailures=[]`, `httpErrors=[]`.
- **Criterios FAIL:** creación de factura (`buildFromOrder` 409, no 200) ⇒ el DoD del handoff ("armar factura borrador desde delivered") no se materializa contra datos reales.
- **Severidades:** **0×P0 · 2×P1 · 1×P2 · 1×P3**. P1-1 (DoD no alcanzado: 409 por datos fiscales faltantes) · P1-2 (doble IVA, factura +16%) · P2-1 (error oculto tras el modal) · P3-1 (`INVOICE_FISCAL_DATA_REQUIRED` sin mapear).

---

## 0. Delimitación y fuentes

| Ítem | Valor (verificado por GEMINI) |
|---|---|
| **Commit desplegado** | `98ea51ae089377ad414f392ab795b87fa4a0c297` (`feat: build invoice draft from delivered order`) · HEAD local coincide (`git rev-parse HEAD`) |
| **Runtime servido** | `/api/health` HTTP 200 `{"status":"ok"}` (curl) |
| **Login** | Director `contacto@vector-ia.mx` + `VECTORIA_SUPERUSER_PASSWORD` (env, valor NO impreso) → 200; `sub` JWT `43487530-4288-4d4f-89de-8486d66210d6` |
| **Alcance** | **reforzada** (flujo de facturación/finanzas CFDI; mutación de contrato `facturacion.buildFromOrder` con permiso `gestionar_facturacion`; primera activación V3 de este camino contra staging) |
| **Incremento auditado** | UI en `src/modules/orden-servicio/orden-detail.tsx` (mutación `buildInvoiceDraft`, Card `orden-detail-create-invoice`, diálogo `CreateInvoiceDraftDialog`), cluster `messages.ordenes.createInvoice*` en `src/shared/utils/messages.ts`. **Sin cambios** en router/schema/servicio/migración/tabla (confirmado por diff: sólo `messages.ts`, `orden-detail.tsx`, test nuevo). |

**Datos reales usados (no sensibles):**

| Viewport | OS | Estado | `soldTotalCents` | Resultado `buildFromOrder` |
|---|---|---|---|---|
| Desktop 1280 | `OS-00001` (`f5a33626-838a-46e0-9eac-e87037529e9a`) | `delivered` | 12,760,000 ($127,600.00) | **409 `INVOICE_FISCAL_DATA_REQUIRED`** |
| Mobile 375 | `OS-00002` (`6413d0d6-4ede-42c0-8407-c595e8ee7828`) | `delivered` | 12,760,000 ($127,600.00) | **409 `INVOICE_FISCAL_DATA_REQUIRED`** |

Probe previo `ordenServicio.list` (read-only): total=2, ambas `delivered`. `facturacion.list` previo: **total=0** (sin facturas existentes); tras el gate sigue **total=0** (la 409 no persiste nada ⇒ sin duplicados ni estado parcial).

**Fuentes de código:** `src/server/services/facturacion/invoices.ts` (`buildFromOrder` :425-520, `loadClientAndFiscalInTx` :1576-1607, `buildPreviewDTO` :1668, `nextInvoiceCodeTx` :1609), `src/server/services/facturacion/helpers.ts` (`buildCfdiConcept` :79-151, `IVA_RATE=0.16` :66), `src/server/services/comercial/helpers.ts` (`calculateQuote` :151-182, `QUOTE_TAX_RATE=0.16`), `src/server/services/orden-servicio/orders.ts` (`soldTotalCents=quote.totalCents` :346), `src/shared/zod/index.ts` (`InvoiceBuildInputSchema` :1191, `CfdiConceptLineInputSchema` :1181), `src/server/trpc/trpc.ts` (`toTrpcError` :103, `errorFormatter` :60).

**Runners Playwright (chromium headless):** `/tmp/kilo/invoice-draft-probe.cjs` (read-only), `/tmp/kilo/invoice-draft-v3.cjs` (V3), `/tmp/kilo/invoice-draft-error-focus.cjs` (oclusión error), `/tmp/kilo/invoice-draft-mobile-complete.cjs` (completamiento mobile). Evidencia en `test-results/invoice-draft-staging-20260825/` (`report-desktop.json`, `report-mobile375.json`, 13 capturas).

---

## 1. Trazabilidad (criterio handoff → implementación → evidencia → resultado)

| # | Criterio (handoff ATLAS) | Implementación | Evidencia V3 (desktop + mobile) | Resultado |
|---|---|---|---|---|
| 1 | Abrir OS `delivered`, confirmar estado | `orden-detail.tsx` `byId` | Detalle 200; `byId` `delivered` (`soldTotalCents=12760000`) en ambos viewports | PASS |
| 2 | Botón "Crear factura borrador" visible **sólo** en `delivered`/`closed`; sin acción fantasma | `orden-detail.tsx:753` Card gated `o.status === "delivered" \|\| o.status === "closed"` | Card `orden-detail-create-invoice` + botón `orden-detail-create-invoice-action` `isVisible=true`, text "Crear factura borrador", `disabled=false` (1280 y 375). Gating por igualdad exacta a `delivered`/`closed` (código). `closed` y estados negativos **N/A por datos** (sólo existen 2 OS, ambas `delivered`) | PASS (delivered funcional; closed/neg N/A, gating por código) |
| 3 | Diálogo accesible; fecha `<hoy+7` bloquea **sin request**; `>=hoy+7` habilita | Dialog `role=dialog`+`aria-modal`+`aria-label`; `Input type="date" min={defaultDueDate}`; validación cliente en `onSubmit` (dueDate pasado / `<hoy+7`) | Dialog `role=dialog` count≥1, `aria-modal=true`, `aria-label="Armar comprobante (borrador)"`; default `dueDate=2026-09-02`, descripción pre-llenada "Servicios profesionales OS OS-0000X", valor `12760000`. `dueDate=2026-08-27` (hoy+1) → `role=alert` "La fecha de vencimiento debe ser al menos 7 días posterior a hoy." + **0** `buildFromOrder` (antes 0 → después 0). `dueDate=2026-09-02` (hoy+7) → submit habilitado y dispara mutación | PASS |
| 4 | Crear factura: `facturacion.buildFromOrder` **200**, invoice `id`/`code`/`status=borrador`/total real + persistencia en `/facturacion` o preview | `onSubmit` → `buildInvoiceDraft.mutate({ orderId, dueDate, concept:[{claveProdServ:"84111506", descripcion, cantidad:1, valorUnitarioCents:o.soldTotalCents}] })` | `buildFromOrder` devuelve **409 `INVOICE_FISCAL_DATA_REQUIRED`** (ambos viewports). `invoice=null`; `successBlockVisible=false`; `/facturacion` `list` total=0 (sin persistencia, sin id/code/total). **No hay factura que verificar** | **FAIL** (P1-1) |
| 5 | Reabrir OS sin falso éxito; **no** timbrar/cancelar/pagar | `onError` hace `setCreatedInvoice(null)` antes de setear error; `setCreatedInvoice` es memoria local | Tras 409, `successBlockVisible=false` (nunca se pinta éxito). Reload: `successBlockAfter=false`, botón reaparece (`delivered`), `buildRequests` total=1 (sin duplicado). Wire guard: `timbrar=0 ✦ cancel=0 ✦ applyPayment=0 ✦ revertPayment=0 ✦ markVencida=0` | PASS |
| 6 | Responsive 1280/375, labels/roles `status`/`alert`, 0 page/request failures, console explicado, overflow | Dialog `items-end sm:items-center`+`max-h-[90vh] overflow-y-auto`; `role=status`/`role=alert` | `overflow=false` en todos los checkpoints (1280 y 375); dialog mobile sin overflow horizontal (`scrollWidth=clientWidth=375`). `pageErrors=[]`, `requestFailures=[]`, `httpErrors=[]`. 1 `console.error` = "Failed to load resource: 409" (el navegador logea la mutación 409 como recurso fallido — consecuencia directa y esperada de la 409, ver nota N-1). `role=alert` con texto (Card) presente; `role=status` count 0 (no hay éxito que mostrar, correcto) | PASS (con N-1) |

Persistencia: **no aplicable** — la 409 impide la inserción; `facturacion.list` previo y posterior = 0 (0 datos persistidos, 0 duplicados).

---

## 2. Validación independiente (comandos reproducibles)

```
set -a; . /home/frank/.config/kilo/integra.secrets.env; set +a

# Health staging
curl -s https://sistema-vectoria.vector-ia.mx/api/health          # 200 {"status":"ok"}

# Probe read-only (estados OS + facturas existentes + soldTotalCents, no muta)
NODE_PATH=/home/frank/repos/sistema-vectoria/node_modules node /tmp/kilo/invoice-draft-probe.cjs

# V3 gate final (Playwright desktop 1280 OS-00001 + mobile 375 OS-00002)
NODE_PATH=/home/frank/repos/sistema-vectoria/node_modules node /tmp/kilo/invoice-draft-v3.cjs

# Verificación enfocada del manejo de error (oclusión del role=alert tras el modal)
NODE_PATH=/home/frank/repos/sistema-vectoria/node_modules node /tmp/kilo/invoice-draft-error-focus.cjs

# Completamiento mobile 375 (overflow diálogo, cierre→error visible, reload sin falso éxito)
NODE_PATH=/home/frank/repos/sistema-vectoria/node_modules node /tmp/kilo/invoice-draft-mobile-complete.cjs
```

**Resultados clave (wire real, no verbal):**
- `ordenServicio.list` → `OS-00001` y `OS-00002` en `delivered`, `soldTotalCents=12760000`.
- `facturacion.list` previo y posterior → `total=0` (0 facturas).
- `facturacion.buildFromOrder` → **409** `{code:"INVOICE_FISCAL_DATA_REQUIRED", httpStatus:409}` (ambos viewports).
- Validación fecha bloqueante → `role=alert` correcto, **0 requests** disparados.
- Guard destructivo → `timbrar/cancel/applyPayment/revertPayment/markVencida` = 0.
- `overflow=false` en 4 checkpoints (desktop) y 3 checkpoints (mobile).
- `pageErrors=[]`, `requestFailures=[]`, `httpErrors=[]`; 1 `console.error` (la 409, explicada en N-1).

**Nota de método:** este modelo no acepta imagen de entrada; las capturas (13 PNG) quedan como evidencia de respaldo. La verificación primaria se basó en **wire de red** (`buildFromOrder` 409, `list`/`byId`) y **aserciones DOM/accesibilidad** (`getByRole`/`data-testid`/`isVisible`/`inputValue`/`elementFromPoint`/`overflow`), que son la evidencia primaria del gate V3 (no el screenshot aislado).

---

## 3. Hallazgos priorizados

| ID | Sev | Hallazgo | Evidencia | Impacto | Owner | Condición de cierre |
|---|---|---|---|---|---|---|
| **P1-1** | **P1** | **DoD no alcanzado: `buildFromOrder` 409 `INVOICE_FISCAL_DATA_REQUIRED` en las OS delivered reales.** Los clientes de OS-00001/00002 no tienen datos fiscales (RFC/razón social/régimen); `loadClientAndFiscalInTx` (`invoices.ts:1599-1604`) rechaza correctamente (BR-N218). El incremento quedó `READY_FOR_VERIFYING` asumiendo 200 sin validar el prerrequisito de datos, y QA-33 nunca llegó a ejercer `buildFromOrder`. | Wire: `buildFromOrder` 409 en 1280 y 375; `loadClientAndFiscalInTx` exige `clientFiscalData` con `rfc/razonSocial/regimen`; `facturacion.list` total=0 (nada persistido). | El flujo "Crear factura borrador" **no funciona E2E** sobre los datos entregados; no hay factura, id, code, total ni persistencia que validar. Bloquea el gate. | **ATLAS** (prerrequisito de datos/SPEC-002 y/o preflight) | (a) Capturar datos fiscales (RFC/razón social/régimen) en los clientes de las OS entregadas, y/o (b) añadir un preflight en la UI que no ofrezca "Crear factura borrador" sin datos fiscales (o que lo informe antes del submit). Re-ejecutar V3 hasta obtener **200** + `status=borrador` + total correcto. |
| **P1-2** | **P1** | **Doble IVA: la factura saldría 16% por encima del total de la OS.** La UI deriva `valorUnitarioCents = o.soldTotalCents` (bruto: `soldTotalCents = quote.totalCents = subtotal + IVA`). `buildCfdiConcept` aplica `IVA_RATE=0.16` sobre esa base → `subtotal(invoice)=12,760,000`, `tax=round(12,760,000×0.16)=2,041,600`, `total=14,801,600` ($148,016.00) = **116%** del total OS ($127,600.00). Cada factura (y futura timbrada) quedaría sobrefacturada en $20,416.00 (~16%). | Código: `orden-detail.tsx:862` (`unitPriceCents={o.soldTotalCents}`) + `orders.ts:346` (`soldTotalCents=quote.totalCents`) + `comercial/helpers.ts:151-174` (total=subtotal+IVA) + `facturacion/helpers.ts:127` (`iva=round(importe×0.16)`). Aritmética con `soldTotalCents=12,760,000` real (12,760,000/1.16=11,000,000 exacto ⇒ subtotal neto real $110,000 + IVA $17,600). **Latente** (la 409 frena antes de insertar), pero determinista. | CFDI materialmente incorrecto (monto/IVA) → riesgo SAT/financiero al timbrar; sobrefacturación al cliente. Ruptura del criterio "total real derivado del total OS". | **ATLAS** (contrato: SPEC-004 OS no persiste subtotal/tax neto; la UI sólo tiene bruto) | Exponer el subtotal/tax neto de la OS (persistir en OS o derivar de la cotización) y usarlo como base para que `totalCents(invoice) == soldTotalCents` ($127,600.00). Nunca timbrar con el cálculo actual. Re-ejecutar con assert `totalCents==12,760,000`. |
| **P2-1** | **P2** | **Error de backend oculto tras el modal (fallo silencioso).** Tras un fallo de `buildFromOrder`, el diálogo permanece abierto y el `role=alert` con el mensaje se renderiza en el Card (detrás del overlay `fixed inset-0 z-50`); el diálogo sólo recibe `fieldError` (validación cliente), no `createInvoiceError`. El operador no ve el motivo sin cerrar el diálogo. | Desktop: `elementFromPoint` en el centro del error → `orden-detail-create-invoice-dialog` (ocluido). Mobile: `dialogFieldErrorVisible=false` con diálogo abierto y error fuera de la vista; al pulsar "Cerrar" el error sí queda visible (`cardErrVisibleAfterClose=true`). `dialogOpenAfter409=true` + `dialogFieldErrorVisible=false` en ambos viewports. | Operabilidad: una operadora de facturación no entiende por qué no se crea la factura (silent no-op con diálogo abierto); el `role=alert` puede no anunciarse/verse. | **SOFIA** (vía ATLAS) | Renderizar `createInvoiceError` **dentro** del diálogo (o cerrar el diálogo al fallar) y exponerlo en `role=alert` visible; conservar la no-falso-éxito. |
| **P3-1** | **P3** | **`INVOICE_FISCAL_DATA_REQUIRED` no está en el mapeo de errores.** El cluster `onError` lista `FORBIDDEN/UNAUTHORIZED/ORDER_NOT_FOUND/CLIENT_NOT_FOUND/ORDER_NOT_DELIVERABLE/INVOICE_BUILD_INVALID`, omitiendo el código que de hecho ocurre en el flujo delivered/closed. | `orden-detail.tsx:141-159` (sin rama `INVOICE_FISCAL_DATA_REQUIRED`). El fallback usa `err.message` (el motivo específico sí llega: "El cliente no tiene datos fiscales… BR-N218"), por lo que el texto final es aceptable. | Contrato de mapeo incompleto; mensaje canónico menos controlado (depende del texto del backend). | **SOFIA** (vía ATLAS) | Añadir rama `INVOICE_FISCAL_DATA_REQUIRED` → mensaje canónico `createInvoiceError*` específico (p. ej. "captura datos fiscales antes de facturar"). |

**Notas (no findings de código):**

- **N-1 (console.error 409, no defecto):** el único `console.error` ("Failed to load resource: the server responded with a status of 409 ()") es el navegador que logea la mutación tRPC 409 como recurso fallido. Es la consecuencia directa de P1-1, no un fallo de aplicación. `pageErrors=[]`, `requestFailures=[]`, `httpErrors=[]`.
- **N-2 (default `dueDate` UTC):** el default observado es `2026-09-02` (hoy UTC + 7d), coherente con la decisión documentada de usar UTC (`defaultDueDate` memo) para evitar drift de zona horaria. No es defecto; en la franja 18:00-24:00 CST el "hoy UTC" puede adelantarse un día respecto al calendario local.
- **N-3 (botón reaparece tras reload):** tras crear/fallar, la OS sigue `delivered`, por lo que el botón vuelve a estar disponible tras recarga (riesgo de UX ya documentado en IMPL-34 §Riesgos). En este gate no se materializó segunda factura (la 409 impidió cualquier inserción). La regla "una factura borrador por OS" sigue siendo decisión ATLAS/SPEC-007 (el servicio no la impone hoy).

---

## 4. Riesgo operativo

- **Sin mutaciones persistentes:** por viewport, 1× `buildFromOrder` (**409**, sin inserción). `facturacion.list` previo y posterior = 0 ⇒ **0 filas creadas/cambiadas** en staging; sin duplicados, sin estado parcial. 2× login 200 (`auth.login.success`).
- **No** se ejecutó `timbrar`, `cancel`, `applyPayment`, `revertPayment`, `markVencida`, ni cierre/cobranza (guard = 0). **No** hubo commit/push/deploy/producción/rollback/delete ni migración.
- **No** se imprimieron secretos: contraseña vía env (sólo nombre de variable); JWT decodificado localmente (sólo `sub` = UUID de usuario). `orderId`/`plUserId`/`invoice` = identificadores de negocio no sensibles (no se reportó ningún invoice id porque no se creó ninguno).
- Los 2 hallazgos P1 quedan **latentes/no manifestados en datos** (P1-2 por 409 previo; P1-1 es el propio bloqueo). Riesgo real si se corrige sólo el dato fiscal sin corregir P1-2: se podrían timbrar CFDI sobrefacturados.

---

## 5. Preparación por entorno

| Entorno | Estado | Justificación |
|---|---|---|
| **Calidad** | **NO_EVALUADO** | `pnpm typecheck/test` no re-ejecutados: el diff de IMPL-34 es puramente UI y ya fue cubierto por V2 de SOFIA (918/918); el gate es funcional V3. Las fallas detectadas son de **comportamiento/contrato** (409 por datos + doble IVA), no de compilación/tests unitarios. |
| **Staging** | **NO_LISTO** | Criterio núcleo (#4) no alcanzado: `buildFromOrder` 409 en ambos viewports; no hay factura ni persistencia que validar. UI del flujo (botón/diálogo/validación/guard) funciona, pero el camino no produce el resultado de negocio. |
| **Producción** | **NO_LISTO** | Sin OK explícito de Frank; además P1-2 (doble IVA) y P1-1 (prerrequisito de datos fiscales) son bloqueantes absolutos para cualquier timbrado/facturación real. |

---

## 6. Handoff a ATLAS

**Acción concreta (no ejecutada por GEMINI):**

1. Aceptar **`FAIL`** — el camino UI del incremento existe y es accesible/responsive, pero el criterio núcleo no se cumple (409 `INVOICE_FISCAL_DATA_REQUIRED`) y existe un defecto financiero latente de doble IVA.
2. **P1-2 (doble IVA)** — decisión de contrato ATLAS: SPEC-004 (OS) debe persistir el **subtotal neto + tax** (hoy sólo guarda `soldTotalCents` bruto) o SPEC-007 `buildFromOrder` debe aceptar total bruto y desglosar IVA. Tras actualizar SPEC, pivotar a SOFIA. **No timbrar con el cálculo actual.**
3. **P1-1 (datos fiscales ausentes)** — ATLAS decide si el prerrequisito se resuelve (a) capturando datos fiscales de los clientes de las OS entregadas (SPEC-002) y/o (b) con preflight en UI. Es prerrequisito de datos/contrato, no de este corte de UI.
4. **P2-1 + P3-1 (UI de error)** — pivotar a SOFIA: mostrar `createInvoiceError` dentro del diálogo y mapear `INVOICE_FISCAL_DATA_REQUIRED` a mensaje canónico.
5. **Re-auditoría V3** una vez resueltos 1-4, con assert: `buildFromOrder` 200 → `status=borrador` → `totalCents == soldTotalCents` (12,760,000) → persistencia en `/facturacion`/preview, y el flujo `<hoy+7` sigue bloqueando sin request.
6. **No** marcar `DONE` ni producción por GEMINI. CRONISTA aplica la transición autorizada por ATLAS (devuelve a corrección/`IN_PROGRESS`).

---

## 7. Autoauditoría GEMINI

- ✅ Delimité el incremento (UI "Crear factura borrador"; HEAD `98ea51a` == desplegado) y verifiqué health/login y estado físico real de las OS (`byId`/`list` del wire) y facturas existentes (`facturacion.list`=0) antes de mutar.
- ✅ Evidencia independiente real (no sólo reporte SOFIA): wire `buildFromOrder` 409 (no DTO inventado), `facturacion.list` 0 (persistencia nula), DOM/accesibilidad (`role=dialog`/`aria-modal`/`aria-label`, `role=alert` en la validación de fecha y en el error, `elementFromPoint` para oclusión), `overflow` y guard destructivo = 0.
- ✅ No edité código/tests/config/`discovery`/SPEC/`PROYECTO.md`; no commit/push/deploy. Runners en `/tmp/kilo`; evidencia en `test-results/invoice-draft-staging-20260825/` (autorizado).
- ✅ No imprimí secretos (contraseña vía env; JWT decodificado localmente, sólo `sub`; `orderId`/`sub` = identificadores no sensibles; ningún invoice id puesto que no se creó factura). Sin dumps sensibles.
- ✅ Cada finding con evidencia/impacto/owner/cierre; severidad QA (P0-P3) separada de niveles L1/L2/L3; QA/staging/producción separados; distinguí defecto nuevo (P1-2/P2-1/P3-1) de prerrequisito de datos (P1-1) y de notas (N-1..N-3).
- ✅ No invoqué subagentes ni declaré `DONE`; handoff vuelve a ATLAS con acción concreta.

---

**QA-VERDICT (intento 1)**: `FAIL` · 0×P0 · **2×P1** (P1-1 DoD no alcanzado: `buildFromOrder` 409 `INVOICE_FISCAL_DATA_REQUIRED`; P1-2 doble IVA +16%) · **1×P2** (P2-1 error oculto tras el modal) · **1×P3** (P3-1 código fiscal no mapeado) · UI del flujo verificada (botón `delivered` → diálogo accesible → `<hoy+7` bloqueado sin request → guard sin timbre/cobro) · `0` page/request/http errors · `overflow=false` 1280/375 · staging `NO_LISTO` · producción `NO_LISTO`.

---

# REAPERTURA · QA-20260825-34 · intento 2 (commit `bd7aa07`)

## QA-VERDICT (intento 2, definitivo): `FAIL`

El incremento de corrección **introdujo una regresión P1 de pantalla completa**: el detalle de Orden de Servicio **se cae al cargar** con `Error: Minified React error #310` ("Rendered more hooks than during the previous render"). El DOM de `/ordenes-servicio/{id}` muestra "Application error: a client-side exception has occurred (see the browser console for more information)" y **ningún** componente del detalle (ni el nuevo Card "Crear factura borrador" ni las acciones preexistentes assignPL/autorizar/pausar/cancelar/cierre técnico/cierre administrativo) se renderiza.

**Causa raíz (confirmada en código):** IMPL-20260825-34 intento 2 añadió tres hooks — `quoteQuery` (`comercial.cotizaciones.byId.useQuery`), `fiscalQuery` (`clientes.fiscal.getForClient.useQuery`) y `fiscalUpsert` (`clientes.fiscal.upsert.useMutation`) — **después** de los early-returns `if (detail.isLoading) return …` y `if (detail.error || !detail.data) return …` (`orden-detail.tsx:317-338` hooks en `:350-365`). Esto viola las Rules of Hooks: en el primer render (`isLoading=true`) el componente retorna temprano sin llamar esos 3 hooks; cuando `detail` resuelve, llama 3 hooks más → React #310 → colapso del componente vía error boundary de Next.js.

**Consecuencia directa:** ninguno de los 6 criterios del handoff del intento 2 (abrir → capturar RFC → `clientes.fiscal.upsert` 200 → `buildFromOrder` 200 borrador con subtotal neto sin doble IVA → fecha `<7` sin requests → reabrir sin timbrar) pudo ejercerse: la página se cae antes de renderizar cualquier cosa. Los fixes de intento 2 (fiscal upsert previo, subtotal neto desde quote, banner externo con `z-[60]`) **existen en el código pero son inverificables E2E** en este estado.

**Severidades (intento 2): 0×P0 · 1×P1 · 0×P2 nuevos · 0×P3 nuevos.** Hallazgo P1-3 (regresión). Los P1-1/P1-2/P2-1/P3-1 del intento 1 siguen pendientes de re-verificación (no cerrados).

---

## 0. Delimitación y fuentes (intento 2)

| Ítem | Valor (verificado por GEMINI) |
|---|---|
| **Commit desplegado** | `bd7aa0721bbcdf59ed2adaceec026dd4d52c0cbd` (`fix: prepare fiscal data for invoice drafts`) · HEAD local coincide (`git rev-parse HEAD`) |
| **Deployment** | `kuxumhqotu2ewy8aa5ocaz0n` finished · `/api/health` 200 `{"status":"ok"}` (curl) |
| **Diff auditado** | `98ea51a..bd7aa07` → 3 archivos: `src/modules/orden-servicio/orden-detail.tsx` (+337/-46), `src/shared/utils/messages.ts` (+18), `tests/impl-20260825-34.test.ts` (+442) |
| **OS en staging** | `OS-00001` (`f5a33626…`) y `OS-00002` (`6413d0d6…`) ambas `delivered`, `soldTotalCents=12,760,000`; clientes distintos (`ce834a67…` / `e214b886…`), cotizaciones distintas (`cff70d9f…` / `1305c329…`) |
| **Facturas existentes** | `facturacion.list` = **0** (el 409 del intento 1 no persistió; sin borradores previos → no aplica "sin duplicar") |
| **Observado** | `/ordenes-servicio/{id}` colapsa en **ambos viewports** (1280 y 375) con React #310; `/ordenes-servicio` (listado), `/facturacion`, `/login`, `/api/health` **siguen operativos** (la regresión está aislada al componente de detalle). |

**Datos:** probe read-only `ordenServicio.byId` devolvió `clientId` y `cotizacionId` correctos; `comercial.cotizaciones.byId` y `clientes.fiscal.getForClient` **no se llegan a disparar** porque el componente colapsa antes del render (evidencia de que el build servido sí es el nuevo, cuyo detalle rompe).

**Runners:** `/tmp/kilo/invoice-draft2-probe.cjs`, `invoice-draft2-urls.cjs`, `invoice-draft2-dialog-check.cjs`, `invoice-draft2-state.cjs`, `invoice-draft2-crash.cjs`. Evidencia en `test-results/invoice-draft-staging-20260825/` (attempt 1) — el intento 2 no produce capturas de flujo (la página no renderiza), sólo los reportes de consola/estado arriba.

---

## 1. Trazabilidad (intento 2 → evidencia)

| # | Criterio intento 2 | Resultado | Evidencia |
|---|---|---|---|
| 1 | Abrir "Crear factura borrador" desde OS delivered | **FAIL/NO VERIFICABLE** | `/ordenes-servicio/{id}` colapsa antes de renderizar el Card; `data-testid="orden-detail-create-invoice-action"` count=0 en 1280 y 375 |
| 2 | Capturar RFC/razón/régimen y ver `clientes.fiscal.upsert` 200 antes de `buildFromOrder` | **NO VERIFICABLE** | el diálogo (con los nuevos campos RFC/razón/régimen, `:1215-1270`) nunca se abre porque el detalle no renderiza |
| 3 | `buildFromOrder` 200, factura `borrador` con subtotal neto (sin doble IVA) y snapshot fiscal | **NO VERIFICABLE** | la mutación no puede dispararse; `facturacion.list` sigue 0 |
| 4 | Fecha `<7` bloquea sin requests (fiscal + build no se llaman) | **NO VERIFICABLE** | validación cliente (`onSubmit`) inalcanzable por el crash |
| 5 | Reabrir factura/listado/OS sin timbrar/pagar/cancelar | **NO VERIFICABLE** | sin factura creada; guard destructivo no ejercitable |
| 6 | Error RFC inválido / fiscal backend visible fuera del diálogo, responsive/a11y/overflow, 0 failures | **NO VERIFICABLE (excepto el crash)** | banner `z-[60]` implementado (`orden-detail.tsx:796-813`) pero nunca se renderiza; console `Error: React #310`, `pageErrors=[]` (el crash lo atrapa el error boundary de Next, se loguea por `console.error`) |

---

## 2. Validación independiente (intento 2)

```
set -a; . /home/frank/.config/kilo/integra.secrets.env; set +a
curl -s https://sistema-vectoria.vector-ia.mx/api/health          # 200 {"status":"ok"}

# probe read-only: estados/OS/facturas/cotizaciones/fiscal (las dos últimas no disparan por el crash)
NODE_PATH=/home/frank/repos/sistema-vectoria/node_modules node /tmp/kilo/invoice-draft2-probe.cjs

# URLs trpc del detalle → sólo ordenServicio.byId+preflightAuthorize (las nuevas queries nunca salen)
NODE_PATH=/home/frank/repos/sistema-vectoria/node_modules node /tmp/kilo/invoice-draft2-urls.cjs

# estado DOM del detalle → "Application error" + React #310
NODE_PATH=/home/frank/repos/sistema-vectoria/node_modules node /tmp/kilo/invoice-draft2-state.cjs   # desktop 1280
NODE_PATH=/home/frank/repos/sistema-vectoria/node_modules node /tmp/kilo/invoice-draft2-crash.cjs  # mobile 375
```

**Resultados (wire/DOM real):**
- `/ordenes-servicio/{id}` (1280 y 375) → body = "Application error: a client-side exception has occurred (see the browser console for more information)".
- console.error = `Error: Minified React error #310; visit https://react.dev/errors/310 …` (ambos viewports).
- `data-testid="orden-detail-create-invoice-action"` count=0; `NEXT buildId` no expuesto.
- `/ordenes-servicio` (listado) → 200, `OS-00001`/`OS-00002` `delivered` (el listado no usa el componente roto).
- `facturacion.list` → 0.

---

## 3. Hallazgo (intento 2)

| ID | Sev | Hallazgo | Evidencia | Impacto | Owner | Condición de cierre |
|---|---|---|---|---|---|---|
| **P1-3** | **P1** | **Regresión: detalle de OS colapsa por violación de Rules of Hooks.** `quoteQuery`/`fiscalQuery`/`fiscalUpsert` (hooks) fueron colocados **después** de los early-returns `if (detail.isLoading) return` / `if (detail.error || !detail.data) return`. En el primer render el componente retorna antes de esos 3 hooks; al resolver `detail` llama 3 hooks extra → React #310 → la pantalla entera de detalle de OS cae (sin navegación, sin acciones). | `orden-detail.tsx:317-338` (early returns) y `:350-365` (hooks) — orden verificable. DOM "Application error…" + `Error: Minified React error #310` en 1280 y 375. El listado y el resto de módulos siguen OK. | **Regresión de pantalla completa** del detalle de OS: no sólo el nuevo flujo "Crear factura borrador" queda inutilizable, sino **todas** las acciones de OS preexistentes (assignPL, autorizar, pausar, cancelar, cierre técnico/administrativo, crear proyecto). Bloquea cualquier validación V3 del intento 2. | **SOFIA** (vía ATLAS) — `IMPLEMENTATION_DEFECT` | Reordenar: llamar los 3 hooks **antes** de los early-returns (derivar `o = detail.data` y usar `enabled: !!o && (o.status==="delivered"\|\|o.status==="closed")` para las 2 queries), para que el número de hooks sea constante en cada render. Verificar `pnpm typecheck` + tests y re-desplegar. |

**Notas (intento 2):**

- **N-4 (crash sin `pageerror`):** el colapso lo captura el error boundary de Next (`error.tsx`/`error.js`), por eso `pageErrors=[]` y el síntoma sale por `console.error` + DOM "Application error". No es un fallo de red ni de datos.
- **N-5 (los fixes de intento 2 no se re-verifican):** la lógica añadida es, a nivel de código, la corrección correcta de P1-1/P1-2/P2-1/P3-1 (fiscal upsert previo a build; subtotal `quote.subtotalCents` neto con fallback explícito a `soldTotal` + warning; error en banner `fixed top-4 z-[60]` por encima del overlay; mapeo de `INVOICE_FISCAL_DATA_REQUIRED`). Todo ello **queda pendiente de validación E2E** hasta corregir P1-3. El fallback a `soldTotalCents` cuando la cotización no expone `subtotalCents` (mensaje `createInvoiceQuoteSubtotalFallback`) re-introduciría el doble IVA si se activa en producción → debe confirmarse en V3 que `source==="quote"` (subtotal neto 11,000,000) y no `"soldTotal"`.
- **N-6 (P1-1/P1-2/P2-1/P3-1 siguen abiertos):** no se cierran ni se cierran en falso; se re-auditarán cuando P1-3 se resuelva y el flujo vuelva a ser ejercitable.

---

## 4. Riesgo operativo (intento 2)

- **0 mutaciones ejecutadas**: la página de detalle colapsa antes de disparar cualquier endpoint de escritura. No se llamó `clientes.fiscal.upsert` ni `facturacion.buildFromOrder` ni timbre/cobro/pago (verificable: `facturacion.list`=0, sin wires de mutación). 2× login 200 únicamente.
- **No** commit/push/deploy/producción/rollback/delete/migración. **No** secretos impresos (contraseña vía env; JWT sólo `sub`).
- La regresión está contenida en staging; no hay riesgo de datos (ningún dato nuevo).

## 5. Preparación por entorno (intento 2)

| Entorno | Estado | Justificación |
|---|---|---|
| **Calidad** | **NO_EVALUADO** | El crash es de runtime/React (no de typecheck): `pnpm typecheck`/`test` de SOFIA no detectan violaciones de Rules of Hooks en todos los casos (aunque `eslint-plugin-react-hooks` sí lo haría al lint del archivo). No re-ejecutado por ausencia de delta en compilación. |
| **Staging** | **NO_LISTO** | Detalle de OS colapsado (React #310) en 1280 y 375; el flujo y las acciones de OS no operan. |
| **Producción** | **NO_LISTO** | Sin OK de Frank; regresión P1 bloqueante. |

## 6. Handoff a ATLAS (intento 2)

1. Aceptar **`FAIL`** (intento 2) — el fix introdujo una regresión P1 (React #310) que rompe el detalle de OS.
2. **P1-3** → pivotar a **SOFIA** (misma SPEC, `IMPLEMENTATION_DEFECT`): reordenar los hooks antes de los early-returns (y volver a `pnpm typecheck && pnpm test`; idealmente correr `eslint` de react-hooks sobre `orden-detail.tsx`, que el `pnpm lint` baseline no cubre los errores nuevos porque están en `infrastructure/**`/`tests/autonomous-loop/**`, no en este archivo).
3. Tras el fix y re-deploy, **re-ejecutar V3** con los 6 criterios del intento 2, con asserts concretos: `clientes.fiscal.upsert` **200** antes de `facturacion.buildFromOrder` **200**; factura `borrador` con `id`/`code`/snapshot fiscal; `subtotalCents == quote.subtotalCents == 11,000,000` (NO `soldTotal`), `taxCents == 1,760,000`, `totalCents == 12,760,000` (== `soldTotalCents`, sin doble IVA); fecha `<hoy+7` bloquea con **0** requests fiscales/build; sin timbrar/pagar/cancelar; banner de error (RFC inválido / fiscal) visible fuera del diálogo.
4. **Confirmar en V3** que `unitPriceSource === "quote"` (no cae al fallback `soldTotal` que re-introduciría doble IVA).
5. **No** marcar `DONE` ni producción por GEMINI; CRONISTA aplica la transición autorizada por ATLAS.

## 7. Autoauditoría GEMINI (intento 2)

- ✅ Delimité el intento 2 (commit `bd7aa07`, diff 3 archivos) y verifiqué health/deploy y estado físico real (list/byId, `facturacion.list`=0).
- ✅ Evidencia independiente real: DOM "Application error" + `Error: React #310` en 1280 y 375; código fuente con hooks tras early-returns; URLs trpc que no incluyen las nuevas queries (colapso previo al render).
- ✅ No edité código/tests/config/SPEC/`PROYECTO.md`; no commit/push/deploy. Runners en `/tmp/kilo`; el intento 2 no generó capturas de flujo (página no renderiza).
- ✅ No imprimí secretos; `clientId`/`cotizacionId`/`orderId` = identificadores no sensibles; sin volcar RFC/razón social reales.
- ✅ Finding con evidencia/impacto/owner/cierre; severidad QA separada de niveles L1/L2/L3; QA/staging/producción separados; NUEVO hallazgo P1-3 distinguido de los P1-1/P1-2/P2-1/P3-1 previos (que permanecen abiertos, no cerrados).
- ✅ No invoqué subagentes ni declaré `DONE`; handoff vuelve a ATLAS con acción concreta y condición de re-auditoría.

---

**QA-VERDICT (intento 2, definitivo)**: `FAIL` · 0×P0 · **1×P1 nuevo** (P1-3 regresión React #310: detalle de OS colapsa) · P1-1/P1-2/P2-1/P3-1 previos **abiertos (no re-verificados)** · los 6 criterios del intento 2 **no verificables** (página colapsa antes de renderizar) · `/ordenes-servicio` y `/facturacion` operativos (regresión aislada al detalle) · staging `NO_LISTO` · producción `NO_LISTO`.

---

# REAPERTURA · QA-20260825-34 · intento 3 (commit `ab124db`)

## QA-VERDICT (intento 3, definitivo): `PASS`

El flujo "Crear factura borrador" desde OS `delivered` se **verificó de extremo a extremo contra staging en desktop 1280 (OS-00001) y mobile 375 (OS-00002)**, con todos los criterios cumplidos y sin hallazgos bloqueantes:

- **Detalle estable:** sin React #310 ni "Application error"; `comercial.cotizaciones.byId` devolvió `subtotalCents=11,000,000` (neto) y `clientes.fiscal.getForClient` devolvió `null` (sin datos previos) — ambas queries disparadas con `enabled` sólo en `delivered`/`closed`.
- **Diálogo:** valor unitario inicial = **11,000,000** (subtotal neto de la cotización, no `soldTotal`; `unitPriceSource==="quote"`), default `dueDate=hoy+7`, RFC pre-llenado vacío, botón submit deshabilitado hasta capturar RFC/razón/régimen.
- **Fecha `<hoy+7` bloquea sin requests:** `role=alert` "al menos 7 días posterior", **0** requests (ni fiscal ni build).
- **RFC inválido:** banner `role=alert` "RFC inválido…" `fixed top-4 z-[60]`, **no ocluido** por el diálogo (`elementFromPoint` = banner), **0** requests.
- **Cadena fiscal→build:** `clientes.fiscal.upsert` **200** (n=1) → `facturacion.buildFromOrder` **200** (n=2), orden verificable en el wire.
- **Factura `borrador` persistida con total coherente (sin doble IVA):** desktop `F-00001` (`daa543d3-…`), mobile `F-00002` (`e68e610b-…`); ambas `status=borrador`, `subtotalCents=11,000,000` (=`quote.subtotalCents`), `taxCents=1,760,000` (=16%), `totalCents=12,760,000` (=`subtota+tax` = `soldTotalCents`), `cfdiUuid=null`, `paidCents=0`, snapshot fiscal presente (RFC/razón/régimen).
- **Persistencia independiente:** `facturacion.list` re-leído (no el DTO del mutate) devuelve `F-00001` y `F-00002` en `borrador`; reload de la OS **sin falso éxito**; 1× build por OS (sin duplicados).
- **Guard destructivo:** `timbrar=0 ✦ cancel=0 ✦ applyPayment=0 ✦ revertPayment=0 ✦ markVencida=0`.
- **Responsive/a11y/overflow:** `overflow=false` en todos los checkpoints (1280 y 375); `pageErrors=[]`, `requestFailures=[]`, `httpErrors=[]`, `consoleErrors=[]` en ambos viewports.

**Severidades (intento 3): 0×P0 · 0×P1 · 0×P2 · 0×P3.** Los P1-1/P1-2/P2-1/P3-1 (intento 1) y P1-3 (intento 2) quedan **resueltos/superados**: P1-1 (fiscal ausente) resuelto por la captura fiscal previa; P1-2 (doble IVA) resuelto (subtotal neto verificado); P2-1 (error oculto) resuelto (banner `z-[60]`); P3-1 (código no mapeado) resuelto (rama `INVOICE_FISCAL_DATA_REQUIRED` + validación cliente); P1-3 (React #310) resuelto (hooks hoisted).

---

## 0. Delimitación y fuentes (intento 3)

| Ítem | Valor (verificado por GEMINI) |
|---|---|
| **Commit desplegado** | `ab124dbd20fdbc2c9f97e5d74b62761081a71759` (`fix:` hooks hoisted + fiscal + subtotal neto) · HEAD local coincide |
| **Deployment** | `lc4u88ro8x9lagtdrwvhpmue` finished · `/api/health` 200 `{"status":"ok"}`; app `running:healthy` |
| **Diff auditado** | `bd7aa07..ab124db` → 2 archivos: `orden-detail.tsx` (+64/-21) y `tests/impl-20260825-34.test.ts` (+113). Los 3 hooks (`quoteQuery`, `fiscalQuery`, `fiscalUpsert`) fueron **hoisted** arriba del componente (justo tras `preflight`), usando `detail.data?.cotizacionId ?? ""` / `detail.data?.clientId ?? ""` con `enabled` guard — reglas de hooks respetadas. |
| **Datos previos al gate** | `facturacion.list`=0 (sin facturas); `getForClient`=null (sin fiscal); `quote.subtotalCents=11,000,000`, `taxCents=1,760,000`, `totalCents=12,760,000` |
| **Datos creados por el gate** | 2 facturas `borrador` (una por OS): `F-00001` (OS-00001, desktop), `F-00002` (OS-00002, mobile); 2× `client_fiscal_data` (una por cliente) vía `clientes.fiscal.upsert` 200 |

**RFC/razón social usados:** valores **sintéticos** (ficticios, no PII real): RFC de persona moral de 12 caracteres formato-válido por viewport (distintos entre clientes), razón social "Cliente Prueba Vectoria S.A. de C.V.", régimen "601". No se imprimen completos en este reporte (sólo longitudes en la evidencia JSON).

**Runners:** `/tmp/kilo/invoice-draft3-smoke.cjs` (smoke: sin crash + quote/fiscal + valor neto) y `/tmp/kilo/invoice-draft3-v3.cjs` (V3 completa). Evidencia en `test-results/invoice-draft-staging-20260825/`: `report3-desktop.json`, `report3-mobile375.json`, 12 capturas nuevas (`*-00…06`).

---

## 1. Trazabilidad (intento 3 → implementación → evidencia → resultado)

| # | Criterio | Implementación | Evidencia V3 (desktop + mobile) | Resultado |
|---|---|---|---|---|
| 1 | Detalle no colapsa (sin React #310); queries fiscales/quote sólo cuando corresponde | Hooks hoisted antes de early-returns; `quoteQuery`/`fiscalQuery` con `enabled: !!detail.data && (delivered\|closed)` | `react310=false`, `bodyApplicationError=false`; `comercial.cotizaciones.byId` devuelve subtotal neto y `clientes.fiscal.getForClient` dispara en `delivered` (ambos viewports). Negativo N/A (no hay OS no-delivered; guard `enabled` por código) | PASS |
| 2 | Abrir "Crear factura borrador" | Card/botón gated `delivered\|closed`; diálogo con campos RFC/razón/régimen | Botón visible; diálogo: `valor=11000000` (neto), `due=2026-09-02`, RFC vacío pre-llenado, submit `disabled` inicial | PASS |
| 3 | Fecha `<hoy+7` bloquea sin requests | Validación cliente en `onSubmit` (dueDate < min) previa a fiscal/build | `dueDate=2026-08-27` → `role=alert` "al menos 7 días posterior", `seq` 0→0 (ni upsert ni build) | PASS |
| 4 | RFC/razón/régimen válidos → `clientes.fiscal.upsert` 200 → `facturacion.buildFromOrder` 200 | Cadena `fiscalUpsert.mutate` (await) → `buildInvoiceDraft.mutate`; upsert primero | `seq=[{fiscalUpsert,200,n:1},{buildFromOrder,200,n:2}]` en ambos viewports; upsert 200, build 200 | PASS |
| 5 | Factura `borrador` con id/code, snapshot fiscal, `subtotal=quote.subtotal`, `tax=16%`, `total=subtotal+tax` (sin doble IVA) | `concept[0].valorUnitarioCents = quote.subtotalCents`; `buildCfdiConcept` aplica 16% | Invoice wire: `status=borrador`, `code=F-00001/F-00002`, `subtotal=11,000,000` (=quote), `tax=1,760,000` (=16%), `total=12,760,000` (=subtotal+tax = soldTotal, sin doble IVA); `hasFiscalSnapshot=true` (rfcLen 12, razonLen 36, regimenLen 3); `cfdiUuid=null`, `paidCents=0` | PASS |
| 6 | Reabrir lista/OS, éxito, responsive/a11y/overflow, 0 failures; no timbrar/pagar/cancelar | `onSuccess` invalida `facturacion.list/byId`; guard = 0 | `facturacion.list` retorna `F-00001`/`F-00002` borrador (persistencia independiente); reload `successBlockAfter=false` (sin falso éxito), `buildTotal=1` (sin duplicado); `overflow=false` (todos los checkpoints); `console/page/request/http errors = []`; guard destructivo = 0 | PASS |
| 7 | (barato) RFC inválido/error fiscal visible fuera del diálogo | Banner `fixed top-4 z-[60]` (sobre overlay `z-50`) con `role=alert` | RFC="XYZ" → banner visible "RFC inválido…", `elementFromPoint` = banner (no ocluido por diálogo), 0 requests | PASS |

---

## 2. Validación independiente (intento 3)

```
set -a; . /home/frank/.config/kilo/integra.secrets.env; set +a
curl -s https://sistema-vectoria.vector-ia.mx/api/health          # 200 {"status":"ok"}

# smoke: sin React #310, quote/fiscal disparan, valor neto
NODE_PATH=/home/frank/repos/sistema-vectoria/node_modules node /tmp/kilo/invoice-draft3-smoke.cjs

# V3 gate final (desktop 1280 OS-00001 + mobile 375 OS-00002)
NODE_PATH=/home/frank/repos/sistema-vectoria/node_modules node /tmp/kilo/invoice-draft3-v3.cjs
```

**Resultados clave (wire real, no verbal):**
- `comercial.cotizaciones.byId` → `{subtotalCents:11000000, taxCents:1760000, totalCents:12760000}`.
- `clientes.fiscal.upsert` **200** y `facturacion.buildFromOrder` **200** (orden fiscal→build). Facturas `F-00001`/`F-00002` en `borrador` con `subtotal=11000000`, `tax=1760000`, `total=12760000`.
- `facturacion.list` post-gate → 2 items (`F-00001` OS-00001, `F-00002` OS-00002), ambos `borrador`.
- `consoleErrors=[]`, `pageErrors=[]`, `requestFailures=[]`, `httpErrors=[]` en ambos viewports; `overflow=false`.

**Nota de método:** capturas PNG como respaldo; verificación primaria por wire (`buildFromOrder` 200, `facturacion.list`, `fiscalUpsert` 200, secuencia `seq`) y DOM/accesibilidad (`getByRole`/`data-testid`/`inputValue`/`isVisible`/`elementFromPoint`/`overflow`).

---

## 3. Hallazgos (intento 3)

**Sin hallazgos bloqueantes.** Los hallazgos de intentos previos se consideran resueltos y verificados E2E en este gate:

| ID previo | Estado (intento 3) | Evidencia de cierre |
|---|---|---|
| P1-1 (fiscal 409) | **Resuelto** | La UI captura RFC/razón/régimen y hace `clientes.fiscal.upsert` 200 antes de `buildFromOrder` 200; ya no hay 409 |
| P1-2 (doble IVA) | **Resuelto** | `valorUnitarioCents = quote.subtotalCents = 11,000,000` (neto); `totalCents=12,760,000 == soldTotalCents` (no 14,801,600) |
| P2-1 (error oculto) | **Resuelto** | Banner `role=alert` `fixed top-4 z-[60]`, verificado no ocluido (`elementFromPoint`); `RFC inválido` visible fuera del diálogo |
| P3-1 (código no mapeado) | **Resuelto** | Rama `INVOICE_FISCAL_DATA_REQUIRED` + validación RFC cliente + mensajes canónicos nuevos en `messages.ts` |
| P1-3 (React #310) | **Resuelto** | Hooks hoisted antes de early-returns; `react310=false`, detalle renderiza normal |

**Observaciones (no findings, no bloqueantes):**

- **N-7 (botón disponible tras reload / una factura por OS):** tras crear la factura, la OS sigue `delivered`, por lo que el botón "Crear factura borrador" reaparece tras recargar y permite armar una segunda factura borrador de la misma OS (la regla "una factura por OS" no la impone hoy el servicio `buildFromOrder`, que no valida duplicados). Ownership **ATLAS** (decisión de negocio/SPEC-007); si procede, vive en el servicio, no en la UI. **No bloquea el gate** (las 2 facturas creadas corresponden a 2 OS distintos, sin duplicados).
- **N-8 (`role=alert` transitorio en reload):** el `roleAlertCount=1` en página asentada es el `__next-route-announcer__` de Next.js (vacío/benigno), no un error de aplicación.
- **N-9 (fallback a `soldTotalCents`):** `unitPriceSource==="quote"` corroborado (valor=11,000,000, sin warning `role=note`); el fallback `createInvoiceQuoteSubtotalFallback` (que re-introduciría doble IVA) **no se activó** en staging. Recomendar a ATLAS/SOFIA que, si `quote.subtotalCents` llegara a estar ausente en otros datos, se **bloquee** la creación en vez de caer al fallback a `soldTotal`.

---

## 4. Riesgo operativo (intento 3)

- **Mutaciones ejecutadas (efecto esperado del gate, autorizadas):** 2× `clientes.fiscal.upsert` 200 (una por cliente) y 2× `facturacion.buildFromOrder` 200 (una por OS). Datos nuevos: 2 filas `client_fiscal_data` (RFC/razón/régimen sintéticos) y 2 facturas `borrador` (`F-00001`, `F-00002`). **No** se timbró, canceló ni pagó (guard=0; `cfdiUuid=null`, `paidCents=0`). 4× login 200.
- Las facturas quedan en `borrador` (reversibles vía `facturacion.cancel`/limpieza SQL si ATLAS lo decide); los RFC son sintéticos y no representan PII real.
- **No** commit/push/deploy/producción/rollback/delete/migración. **No** secretos impresos (contraseña vía env; JWT sólo `sub`; RFC/razón/régimen sintéticos sin volcar completos en el reporte).
- App `running:healthy` y `/api/health` 200 durante toda la auditoría.

## 5. Preparación por entorno (intento 3)

| Entorno | Estado | Justificación |
|---|---|---|
| **Calidad** | **LISTO** | `pnpm typecheck/test` de SOFIA en verde (918 + 113 nuevos tests); la regresión de hooks es de runtime pero ya validada E2E (sin #310). Sin delta de compilación pendiente. |
| **Staging** | **LISTO** | Flujo completo verificado E2E en 1280 y 375: detalle estable → diálogo → bloqueo fecha → RFC inválido visible → upsert→build 200 → factura borrador con total correcto (sin doble IVA) → persistencia en `/facturacion` → reload sin falso éxito → guard destructivo 0 → 0 failures/overflow. |
| **Producción** | **NO_LISTO** | Sin OK explícito de Frank para desplegar a producción (no solicitado/ejecutado). Además N-7/N-9 son decisiones ATLAS pendientes (regla "una factura por OS" y endurecimiento del fallback de subtotal) — no bloquean staging pero conviene cerrarlas antes de producción. |

## 6. Handoff a ATLAS (intento 3)

1. Aceptar **`PASS`** — el flujo "Crear factura borrador" desde OS `delivered` está verificado E2E en ambos viewports, con total sin doble IVA y persistencia confirmada.
2. **N-7** (regla "una factura borrador por OS" en el servicio, no en la UI): decisión de negocio ATLAS/SPEC-007; si procede, enrutar a SOFIA.
3. **N-9** (endurecer el fallback de subtotal): valorar bloquear la creación si `quote.subtotalCents` está ausente, en vez de caer a `soldTotalCents` (evita doble IVA latente). Ownership ATLAS/SOFIA.
4. **Gate siguiente:** las dos facturas quedan en `borrador`; el timbrado/cobranza (SPEC-007/008/009) y el cierre administrativo de OS (`closed`) quedan pendientes por instrucción.
5. **No** marcar `DONE` ni producción por GEMINI. CRONISTA aplica la transición autorizada por ATLAS.

## 7. Autoauditoría GEMINI (intento 3)

- ✅ Delimité el intento 3 (commit `ab124db`, diff 2 archivos, hooks hoisted) y verifiqué health/deploy y estado real (probe `list`/`byId`, `facturacion.list`=0, `getForClient`=null, `quote.subtotalCents`) antes de mutar.
- ✅ Evidencia independiente real (no reporte SOFIA): wire `clientes.fiscal.upsert` 200 → `facturacion.buildFromOrder` 200 (orden `seq`), `facturacion.list` re-leído con las 2 facturas, banner RFC inválido no ocluido (`elementFromPoint`), `overflow`/errors/guard destructivo.
- ✅ No edité código/tests/config/`discovery`/SPEC/`PROYECTO.md`; no commit/push/deploy. Runners en `/tmp/kilo`; evidencia en `test-results/invoice-draft-staging-20260825/`.
- ✅ No imprimí secretos ni PII real (RFC/razón/régimen sintéticos; sólo longitudes en el reporte). Sin dumps sensibles.
- ✅ Findings/observaciones con evidencia/impacto/owner; separé QA/staging/producción y severity de niveles L1/L2/L3; cerré hallazgos previos con evidencia E2E.
- ✅ No invoqué subagentes ni declaré `DONE`; handoff vuelve a ATLAS con acción concreta.

---

**QA-VERDICT (intento 3, definitivo)**: `PASS` · 0×P0 · 0×P1 · 0×P2 · 0×P3 · flujo "Crear factura borrador" desde OS `delivered` verificado E2E en 1280/375 · `clientes.fiscal.upsert` 200 → `facturacion.buildFromOrder` 200 · facturas `F-00001`/`F-00002` en `borrador` con `subtotal=11,000,000` + `tax=1,760,000` = `total=12,760,000` (sin doble IVA) · snapshot fiscal presente · fecha `<hoy+7` y RFC inválido bloquean sin requests · persistenia en `/facturacion` + reload sin falso éxito · guard destructivo 0 · 0 page/console/request/http errors · `overflow=false` 1280/375 · staging `LISTO` · producción `NO_LISTO` · observaciones N-7/N-9 (ATLAS).

---

# CIERRE ADMINISTRATIVO (billing staging) · autorización Frank 2026-08-25

> Autorización explícita de Frank: «dale esto era pa hoy» — continuar billing en **staging únicamente**, datos sintéticos y PAC/mock.

## QA-VERDICT (cierre administrativo): `BLOCKED`

Detenido en el **primer bloqueo** exactamente como instruyó el handoff (#6). El timbrado no puede ejecutarse porque la **configuración fiscal de la organización (emisor) no está configurada** en staging. Verificado con evidencia doble (read-only + intento real):

- `facturacion.preview` (query) → `fiscalConfig = { rfc:null, razonSocial:null, regimen:null, hasPacApiKey:false, hasCsd:false }`.
- `facturacion.timbrar` (intento real autorizado, no destructivo) → **HTTP 412** `{ code:"CSD_NOT_CONFIGURED", message:"Sin configuración fiscal para la organización (BR-N302)" }`.

**Consecuencia:** el flujo "timbrado → pago → cierre administrativo" queda bloqueado en cascada: el pago (`cobro.confirm` → aplicación) y el cierre administrativo (`closeAdministrative` exige saldo cero) requieren factura `emitida`, que a su vez requiere el timbrado. No se inventó configuración (PAC/CSD son secretos de emisor + archivos .cer/.pem que Frank/ATLAS deben proveer).

---

## 0. Verificación previa (criterio 1 del handoff) — PASS

| Ítem | Valor |
|---|---|
| `F-00001` | presente, `status=borrador`, `id daa543d3-423e-45a6-8aa3-9b520d570372`, `orderId=OS-00001`, `paidCents=0`, `totalCents=12,760,000`, `cfdiUuid=null` |
| `F-00002` | presente, `status=borrador`, `id e68e610b-34c7-4c43-900c-b2b9cd4cc898`, `orderId=OS-00002`, `paidCents=0`, `totalCents=12,760,000`, `cfdiUuid=null` |
| `OS-00001` | `status=delivered`, `finalInvoiceIssued=false`, `soldTotalCents=12,760,000`, `closedDirectorException=false`, `projectCreatedAt=2026-08-26T00:22:19Z` (proyecto creado) |
| Cliente (preview F-00002) | "Prospecto QA27 Mobile (C-000002)" — dato sintético de QA27 |

Ambas facturas siguen asociadas a sus OS `delivered`; no hubo estado intermedio ni duplicados (2 facturas, 2 OS distintos).

---

## 1. Timbrado mock (criterio 2) — BLOCKED

**Intento real desde la UI (`/facturacion` → botón "Timbrar" por fila `F-00001`):**

| Campo | Valor |
|---|---|
| endpoint | `facturacion.timbrar` |
| HTTP | **412** |
| code | `CSD_NOT_CONFIGURED` |
| message | `Sin configuración fiscal para la organización (BR-N302)` |
| data | `null` (sin UUID/folio) |

**Causa raíz exacta (código + evidencia):**

1. `facturacion.timbrar` → `descifrarCredencialesPac(orgId)` (`invoices.ts:664-665`) exige `organization_fiscal_config` con `pacApiKeyCiphertext` + `csdPasswordCiphertext` + `csdCerBucketKey` + `csdPemBucketKey`. En staging **no existe esa fila** (`loadFiscalConfig` → `null`).
2. `facturacion.preview` (query, sin mutar) confirma `hasPacApiKey=false`, `hasCsd=false` y `rfc/razonSocial/regimen` del emisor en `null`.
3. El preview de UI lo advierte explícitamente: *"La organización no tiene CSD/API key del PAC configurados. Solicita al Director configurar antes de timbrar (BR-N302)."* + nota *"Timbrado en modo MOCK (P-007-1): no hay credenciales PAC reales. El UUID y los archivos XML/PDF son sintéticos."*

**Gap de diseño (raíz del bloque, ownership ATLAS):** aunque el PAC está en `mode:"mock"` (P-007-1), `timbrar` ejecuta `descifrarCredencialesPac` **antes** de `pac.stamp`, por lo que el mock no puede timbrar sin credenciales reales (API key + CSD password + archivos .cer/.pem en bucket). Para habilitar el timbrado mock en staging hace falta: (a) sembrar `organization_fiscal_config` con credenciales sintéticas (acción de Director + secretos, **no factible por GEMINI**), o (b) que el camino mock del PAC no exija credenciales reales (decisión de contrato → ATLAS/SOFIA).

---

## 2..5 Criterios restantes — BLOCKED en cascada

| Criterio | Estado | Causa |
|---|---|---|
| 2 · timbrado mock (UUID/folio/estado) | **BLOCKED** | 412 `CSD_NOT_CONFIGURED` (sin config fiscal emisor) |
| 3 · pago de prueba (`paidCents`/estado/sin duplicación) | **BLOCKED** | el pago (cobro confirm → aplicar) exige factura `emitida`; `borrador→emitida` es la única transición y depende del timbrado |
| 4 · cierre administrativo OS/proyecto | **BLOCKED** | `closeAdministrative` exige saldo cero (`outstandingBalance = 12,760,000 − paid`) o `directorException=true`; el camino normal "después del pago" depende del pago (bloqueado). La excepción es un camino distinto al solicitado |
| 5 · responsive/reload/sin duplicados | **N/A** | flujo no alcanzable |
| 6 · guard (no prod/secretos/delete/rollback/código) | **PASS** | respetado en todo momento |

---

## 3. Hallazgo del cierre administrativo

| ID | Sev | Hallazgo | Evidencia | Impacto | Owner | Condición de cierre |
|---|---|---|---|---|---|---|
| **B-1** | **— (bloqueo de dependencia)** | **Configuración fiscal del emisor ausente en staging → timbrado (incluso mock) no ejecutable.** `organization_fiscal_config` sin fila; `hasPacApiKey=false`, `hasCsd=false`; `descifrarCredencialesPac` tira `CSD_NOT_CONFIGURED` (412) antes de `pac.stamp`. | Wire `timbrar` 412 + `preview` fiscalConfig `{hasPacApiKey:false, hasCsd:false}` + banner UI "no tiene CSD/API key del PAC" | Toda la cadena billing (timbrar → pagar → cerrar) queda parada en staging. | **Frank/ATLAS** (proveer/decidir configuración fiscal emisor) o **SOFIA** (mock PAC sin gate de credenciales) | Sembrar `organization_fiscal_config` (RFC emisor + PAC API key + CSD password sintéticos) y cargar CSD .cer/.pem (bucket), **o** hacer que `mode:"mock"` no exija credenciales reales. GEMINI no fabrica configuración. |
| **B-2** | **P2** | **El botón "Timbrar" no muestra el error al operador.** `FacturaRowActions.timbrar` (`facturas-list.tsx:176-178`) sólo define `onSuccess` (invalidar listado), sin `onError` ni render de error; un 412 queda silencioso (sólo `console.error` "Failed to load resource: 412"). El preview sí advierte del faltante, pero la acción directa fracasa sin feedback. | Wire 412 capturado; `consoleErrors=["Failed to load resource: 412"]`; sin texto de error en la fila/diálogo tras el click | Operabilidad: un operador no ve por qué no se timbró si salta el preview. | **SOFIA** (vía ATLAS) — deuda preexistente de SPEC-007 | Añadir `onError` + `role=alert` en la fila/diálogo de timbrado (mensaje canónico por código: `CSD_NOT_CONFIGURED`, `PAC_API_KEY_MISSING`, `INVOICE_*`). |

---

## 4. Validación independiente (cierre administrativo)

```
set -a; . /home/frank/.config/kilo/integra.secrets.env; set +a
curl -s https://sistema-vectoria.vector-ia.mx/api/health          # 200 {"status":"ok"}

# probe read-only: facturas/estado OS/config fiscal
NODE_PATH=/home/frank/repos/sistema-vectoria/node_modules node /tmp/kilo/billing-probe.cjs

# intento timbrado (autorizado, no destructivo) → 412 CSD_NOT_CONFIGURED
NODE_PATH=/home/frank/repos/sistema-vectoria/node_modules node /tmp/kilo/billing-timbrar-attempt.cjs

# evidencia visual preview (banner "no tiene CSD/API key" + mock notice)
NODE_PATH=/home/frank/repos/sistema-vectoria/node_modules node /tmp/kilo/billing-evidence.cjs
```

**Resultados:** `facturacion.list` → F-00001/F-00002 `borrador` (paid=0, cfdiUuid=null). `facturacion.preview` → `fiscalConfig {hasPacApiKey:false, hasCsd:false}`. `facturacion.timbrar` → 412 `CSD_NOT_CONFIGURED`. Banner preview visible. Screenshots `billing-00-list.png`, `billing-01-preview.png` en `test-results/invoice-draft-staging-20260825/`.

---

## 5. Riesgo operativo (cierre administrativo)

- **Sin estado cambiado** de las facturas ni de las OS: el único intento de mutación (`timbrar`) falló limpio con 412 y **no alteró** `status` (siguen `borrador`), `cfdiUuid=null`, `paidCents=0`. **0 filas nuevas/modificadas** por este cierre (a diferencia del gate intento 3, que sí creó las 2 facturas). 3× login 200.
- **No** se timbró, pagó, cerró, canceló ni reversó nada. **No** producción, delete, rollback, migración ni cambios de código. **No** secretos impresos (el bloqueo es por **ausencia** de secretos; no se introdujo ningún valor).
- No hay riesgo de doble cobro ni factura fantasma: la cadena está detenida en el primer eslabón con estado consistente.

## 6. Preparación por entorno (cierre administrativo)

| Entorno | Estado | Justificación |
|---|---|---|
| **Calidad** | **LISTO** | Sin delta de código en este cierre (sólo ejecución E2E). El gate previo (intento 3) ya está en verde. |
| **Staging** | **NO_LISTO (para billing)** | Timbrado bloqueado por ausencia de configuración fiscal del emisor; pago y cierre dependen de él. |
| **Producción** | **NO_LISTO** | Sin OK de Frank; y el mismo gap de config fiscal emisor aplica. |

## 7. Handoff a ATLAS (cierre administrativo)

1. Aceptar **`BLOCKED`** del cierre administrativo billing: el primer bloqueo es real y reproducible (`CSD_NOT_CONFIGURED` 412), sin configuración inventada.
2. **Desbloqueo** (decisión Frank/ATLAS): sembrar la config fiscal emisor en staging (RFC/razón/régimen emisor + PAC API key + CSD password **sintéticos** + CSD .cer/.pem en bucket), **o** pivotar a SOFIA para que el PAC en `mode:"mock"` no exija credenciales reales (`descifrarCredencialesPac` opcional en mock).
3. **B-2** (P2): pivotar a SOFIA para que el botón "Timbrar" muestre el error (onError + role=alert).
4. Al desbloquear, **re-ejecutar la secuencia**: timbrado (capturar UUID/folio `emitida`) → pago sintético (cobro + confirm → `paidCents`/`estado` sin duplicación) → cierre administrativo (saldo cero) → responsive/reload/sin duplicados.
5. **No** marcar `DONE` ni producción por GEMINI. CRONISTA aplica la transición autorizada por ATLAS (queda `BLOCKED`).

## 8. Autoauditoría GEMINI (cierre administrativo)

- ✅ Verifiqué estado real (facturas `borrador`, OS `delivered`, `finalInvoiceIssued=false`) antes de intentar mutar.
- ✅ Detección del bloqueo con doble evidencia (read-only `preview` + intento real `timbrar` 412), sin inventar configuración ni secretos.
- ✅ No edité código/tests/config/SPEC/`PROYECTO.md`; no commit/push/deploy; no delete/rollback/migración. Runners en `/tmp/kilo`; screenshots en `test-results/`.
- ✅ No imprimí secretos ni PII real (datos sintéticos QA27); el bloqueo se reporta con la causa exacta y sin valores sensibles.
- ✅ Separé QA/staging/producción y severidad; documenté un P2 (B-2) y un bloqueo de dependencia (B-1); distinguí deuda preexistente (botón Timbrar sin onError) del gap de diseño mock-PAC.
- ✅ No invoqué subagentes ni declaré `DONE`; handoff vuelve a ATLAS con acción concreta y condición de re-ejecución.

---

**QA-VERDICT (cierre administrativo billing)**: `BLOCKED` · detenido en el primer bloqueo (#6) · `facturacion.timbrar` → 412 `CSD_NOT_CONFIGURED` "Sin configuración fiscal para la organización (BR-N302)" · causa: `organization_fiscal_config` (emisor) ausente — `hasPacApiKey=false`, `hasCsd=false`, RFC/razón/régimen emisor nulos · el PAC es mock pero `descifrarCredencialesPac` gatea antes de `pac.stamp` · pago y cierre administrativo bloqueados en cascada · facturas F-00001/F-00002 siguen `borrador` (sin cambio de estado, 0 mutaciones efectivas) · 1 hallazgo P2 (botón Timbrar sin onError) · guard respetado (no prod/secretos/delete/rollback/código) · evidencia `billing-00-list.png`/`billing-01-preview.png` + runners `/tmp/kilo/billing-*.cjs` · staging `NO_LISTO (billing)` · producción `NO_LISTO` · handoff con acción de desbloqueo (sembrar config fiscal sintética o mock-PAC sin gate de credenciales).

---

# FACTURAPI TEST (timbrado real v2) · commit `f766b97` · autorización Frank

> Frank autorizó billing staging; adaptador Facturapi Test desplegado (`PAC_MODE=http`, `FACTURAPI_BASE_URL=https://www.facturapi.io/v2`, `FACTURAPI_API_KEY` Test). Regla estricta: **nunca exponer el key**.

## QA-VERDICT (Facturapi Test): `BLOCKED`

Detenido en el **primer criterio** (#1 "abrir lista y tomar una factura borrador"). El listado de Facturación ya no renderiza: la query `facturacion.list` devuelve **412 `PAC_API_KEY_MISSING`**, por lo que ninguna fila de factura es seleccionable y no puede abrirse preview ni llegar al timbrado.

- **Observado (wire real):** `facturacion.list` → HTTP 412 `{ code:"PAC_API_KEY_MISSING", httpStatus:412, message:"Facturapi API key ausente; configure FACTURAPI_API_KEY" }`. La tabla queda vacía; `console.error` = "Failed to load resource: 412". Screenshot `facturapi-00-list-error.png`.
- **Estado preservado (criterio #7):** ninguna mutación fue intentada (el bloqueo está en la lectura). `F-00001`/`F-00002` siguen `borrador`; `OS-00001` sigue `delivered` con `finalInvoiceIssued=false` (verificado por `ordenServicio.byId`, que no pasa por el servicio de facturación). Cero facturas timbradas, cero UUID, cero cobros.

**Causa raíz:**

1. **`FACTURAPI_API_KEY` no está presente/vacío en el proceso Node en ejecución.** `buildService()` (`facturacion.ts:57-65`) llama `createPacClient()` sin argumentos → en modo `http` (por `PAC_MODE=http`) construye `createPacHttpClient({ apiKey: process.env.FACTURAPI_API_KEY })`; al estar vacío, `createPacHttpClient` lanza `PAC_API_KEY_MISSING` (`facturapi.ts:95-100`). Esto contradice el handoff ("FACTURAPI_API_KEY Test en Coolify"): el secret **no está siendo inyectado al contenedor en ejecución** (gap de deployment/variable), o el nombre de la variable difiere del esperado por la app.
2. **`createPacClient()` se ejecuta eager en `buildService()`**, y `buildService()` es invocado por **todos** los procedures de `facturacion` (incluidos `list`/`preview`/`byId`, que son de sólo lectura y no timbran). Por eso un error de configuración PAC (que sólo debería afectar `timbrar`/`cancel`) derriba el módulo entero de Facturación — contradice el comentario "Inyección perezosa" del router.

---

## 0. Estado antes del gate

| Ítem | Valor |
|---|---|
| `facturacion.list` | **412** (no renderiza filas) |
| `F-00001` / `F-00002` | sin cambios: `borrador`, `cfdiUuid=null`, `paidCents=0` (no mutadas) |
| `OS-00001` | `delivered`, `finalInvoiceIssued=false` |
| Emisor (org) fiscal config | no legible por este gate (el endpoint de facturación 412) |

## Trazabilidad (criterios del handoff → resultado)

| # | Criterio | Resultado | Evidencia |
|---|---|---|---|
| 1 | Abrir lista y tomar factura borrador (F-00001) | **BLOCKED** | `facturacion.list` 412 `PAC_API_KEY_MISSING`; tabla vacía |
| 2 | Abrir preview; RFC/razón/régimen completos | **BLOCKED** | no hay row para abrir preview |
| 3 | Timbrar en Test (emitida, cfdiUuid, XML/PDF, livemode=false, audit `factura.timbrar`) | **BLOCKED** | inalcanzable (bloqueo en #1) |
| 4 | Reload sin duplicación/doble timbrado; no cancelar | **N/A** | flujo inalcanzable |
| 5 | Factura borrador adicional sólo si el primer caso pasa | **N/A** | no aplica (bloqueo) |
| 6 | No pagar/cerrar hasta timbrado Test OK e IDs reportados | **PASS** | no se pagó ni cerró nada |
| 7 | Conservar estado previo; reportar HTTP/mensaje/cuerpo sanitizado sin secretos | **PASS** | estado intacto; 412 con mensaje sanitizado (sin key) |
| 8 | Reporte + evidencia + veredicto | **PASS** | esta sección + captures + runners |

---

## 3. Hallazgos (Facturapi Test)

| ID | Sev | Hallazgo | Evidencia | Impacto | Owner | Cierre |
|---|---|---|---|---|---|---|
| **F-1** | **P1** | **`FACTURAPI_API_KEY` no inyectada en el runtime de staging → módulo Facturación caído (412).** El secret existe en Coolify según el handoff, pero el proceso lo lee vacío. | wire `list` 412 + `facturapi.ts:95-100` + `index.ts:176-194` (lee `process.env.FACTURAPI_API_KEY`) | Bloquea todo el módulo de Facturación (incluso lectura). Sin timbrado posible. | **Frank/ATLAS (infra)** | Inyectar `FACTURAPI_API_KEY` (Test) real al contenedor y verificar con un probe reactor (el adaptador debe poder leerla). |
| **F-2** | **P1** | **`createPacClient()` eager en `buildService()` rompe endpoints read-only.** `buildService()` construye el PAC para list/preview/byId; un error de config PAC derriba todo el módulo. Contradice el comentario "Inyección perezosa". | `facturacion.ts:57-65` + procedures list/preview/byId invocan `buildService()` | Cualquier fallo de PAC (key ausente, red) tumba la consulta de facturas. | **SOFIA (via ATLAS)** | Construir el PAC cliente de forma perezosa sólo en `timbrar`/`cancel` (o hacer que `createPacClient` no lance en build y difiera el error al `stamp`). |
| **F-3** | **P3** | **Ambigüedad de fuente de key entre env y DB.** El adapter HTTP autentica con `opts.apiKey` (env del constructor) e ignora `input.apiKey` (que `timbrar` descifra de `organization_fiscal_config.pac_api_key_ciphertext`); además `descifrarCredencialesPac` aún exige `pacApiKeyCiphertext` en DB, en contradicción con ADR "nunca registrar la llave". | `facturapi.ts:125` (usa `opts.apiKey`) vs `invoices.ts` `descifrarCredencialesPac` + `stampInput.apiKey`; ADR-20260825-01 | Riesgo de doble fuente divergente al desbloquear F-1; el DB key quedaría ignorado. | **ATLAS/SOFIA** | Definir UNA única fuente (env `FACTURAPI_API_KEY`) y retirar el gate de `pacApiKeyCiphertext` para Facturapi; documentar en ADR. |
| **F-4** | **P3** | **Subtitle UX de Facturación obsoleto** ("Timbrado CFDI 4.0 via PAC (mock en este turno)") pese al adaptador Facturapi real. | DOM `/facturacion` (header) | Cosmético/documentación. | **SOFIA** | Actualizar `messages.facturacion.subtitle`. |

---

## 4. Validación independiente

```
set -a; . /home/frank/.config/kilo/integra.secrets.env; set +a
curl -s https://sistema-vectoria.vector-ia.mx/api/health          # 200 {"status":"ok"}
NODE_PATH=/home/frank/repos/sistema-vectoria/node_modules node /tmp/kilo/facturapi-probe.cjs
NODE_PATH=/home/frank/repos/sistema-vectoria/node_modules node /tmp/kilo/facturapi-diag.cjs
NODE_PATH=/home/frank/repos/sistema-vectoria/node_modules node /tmp/kilo/facturapi-evidence.cjs
```

Resultados: `facturacion.list` 412 `PAC_API_KEY_MISSING` (mensaje sanitizado, sin key); tabla vacía; `ordenServicio.byId` OS-00001 `delivered`/`finalInvoiceIssued=false`. Screenshots `facturapi-00-list-error.png`, `facturapi-01-os.png`.

## 5. Riesgo operativo

- **0 mutaciones** efectuadas (bloqueo en lectura); facturas y OS intactas. **No** producción, delete, rollback, migración ni cambios de código. **No** secretos impresos (el error no contiene el key; sólo el nombre de la variable). 3× login 200.
- Sin riesgo de doble timbrado ni factura fantasma: no se llegó a `stamp`.

## 6. Preparación por entorno

| Entorno | Estado | Justificación |
|---|---|---|
| Calidad | **LISTO** | Test suite (`tests/spec-20260817-007.test.ts`, 643 líneas) añadida en el commit; sin delta de runtime. |
| Staging | **NO_LISTO (Facturapi)** | `FACTURAPI_API_KEY` no inyectada → módulo Facturación 412. |
| Producción | **NO_LISTO** | Sin OK/Live key; y se arrastra el mismo gap de configuración. |

## 7. Handoff a ATLAS (Facturapi Test)

1. Aceptar **`BLOCKED`** (Facturapi Test) — bloqueo real y reproducible en lectura, sin configuración inventada.
2. **Desbloquear F-1:** inyectar `FACTURAPI_API_KEY` (Test) al contenedor staging y confirmar que el proceso la lee (re-probe).
3. **F-2/F-3:** pivotar a SOFIA — PAC client perezoso sólo en `timbrar`/`cancel` + fuente de key única (env) + retirar el gate duplicado de `pac_api_key_ciphertext` para Facturapi.
4. **Re-ejecutar V3** una vez desbloqueado: lista → preview (RFC/razón/régimen completos y dirección del receptor, que hoy es `domicilio=null` y probablemente gatillará `is_ready_to_stamp=false` en Facturapi) → timbrar (capturar `emitida`/`cfdiUuid`/XML-PDF/`livemode=false`/audit `factura.timbrar`) → reload sin duplicación.
5. **Advertencia proactiva (no bloqueante aún):** el snapshot fiscal del receptor (`client_fiscal_data`) carece de `domicilio` (CP/dirección). Facturapi puede devolver `is_ready_to_stamp=false` → `INVOICE_BUILD_INVALID`. Anticipar captura de dirección antes o al reintentar.
6. **No** pagar ni cerrar administrativo hasta timbrado OK e IDs reportados (criterio #6). **No** `DONE`/producción por GEMINI.

## 8. Autoauditoría GEMINI (Facturapi Test)

- ✅ Verifiqué HEAD `f766b97` + health y estado pre (F-00001/F-00002 `borrador`, OS `delivered`) antes de actuar.
- ✅ Detección del bloqueo con wire real (`list` 412) + código (`createPacClient` eager, key desde env), sin tocar secrets.
- ✅ No edité código/SPEC/ADR/`PROYECTO.md`; no commit/push/deploy; no delete/rollback/migración; runners en `/tmp/kilo`; captures en `test-results/`.
- ✅ No imprimí el key ni PII real; el mensaje de error reportado es sanitizado (nombre de variable y texto canónico).
- ✅ Hallazgos con evidencia/impacto/owner/cierre; distingui infra (F-1) de código (F-2), wiring de contrato (F-3) y deuda UX (F-4); QA/staging/producción separados.
- ✅ No invoqué subagentes ni declaré `DONE`; handoff vuelve a ATLAS con acción concreta.

---

**QA-VERDICT (Facturapi Test)**: `BLOCKED` · módulo Facturación caído en lectura: `facturacion.list` → 412 `PAC_API_KEY_MISSING` "Facturapi API key ausente; configure FACTURAPI_API_KEY" · causa: `FACTURAPI_API_KEY` no inyectada en runtime staging + `createPacClient()` eager en `buildService()` (rompe read-only) · 0 mutaciones (F-00001/F-00002 siguen `borrador`, OS `delivered`/`finalInvoiceIssued=false`) · 2×P1 (F-1 infra, F-2 código) + 2×P3 (F-3, F-4) · evidencia `facturapi-00-list-error.png`/`facturapi-01-os.png` + runners `/tmp/kilo/facturapi-*.cjs` · staging `NO_LISTO (Facturapi)` · producción `NO_LISTO` · handoff con acción de desbloqueo (inyectar key + PAC perezoso) y advertencia proactiva `domicilio=null`→`is_ready_to_stamp=false`.

---

# FACTURAPI TEST — reintento tras fix infra · deployment `5qxjgwtaxpwipm7u7kw5pkmp`

> Fix infra aplicado: `FACTURAPI_API_KEY` runtime presente (valor **nunca** impreso), `PAC_MODE=http`, `FACTURAPI_BASE_URL` correcta. Commit `f766b97`, app `running:healthy`, `/api/health` 200.

## QA-VERDICT (Facturapi Test, reintento): `BLOCKED`

El fix de infra **resolvió el bloqueo de lectura** (F-1/F-2 del round anterior): `facturacion.list` ya no devuelve 412 y el listado renderiza filas. Pero el **timbrado vuelve a bloquearse** en el eslabón siguiente, y ahora queda claro que es un **gap de código/contrato**, no de infraestructura:

- **Criterio 1 (lista/preview sin 412) → PASS.** `facturacion.list` 200, `F-00001`/`F-00002` `borrador`. Preview de `F-00001` 200.
- **Criterio 2 (timbrar Test) → BLOCKED.** `facturacion.timbrar` F-00001 → **412 `CSD_NOT_CONFIGURED`** "Sin configuración fiscal para la organización (BR-N302)".
- **Criterio 3/4/5/6 → BLOCKED/N-A en cascada** (sin timbrado no hay emitida/UUID/XML/PDF; no se pagó/cerró/canceló; 0 mutaciones efectivas). **Sin doble factura**: F-00001/F-00002 siguen `borrador`, `cfdiUuid=null`, `paidCents=0` tras el intento.

---

## Causa raíz (definitiva, código — no infra)

1. `facturacion.timbrar` (`invoices.ts`) **sigue llamando** `descifrarCredencialesPac(orgId)` **antes** de `pac.stamp`. Ese helper exige `organization_fiscal_config` (fila del emisor) con `pac_api_key_ciphertext`; en staging **esa fila no existe** (`hasPacApiKey=false`, `rfc/razonSocial/regimen` del emisor en `null`, verificado por `facturacion.preview` fiscalConfig). Por eso lanza `CSD_NOT_CONFIGURED` (412).
2. El fix de infra sólo corrigió el **env** `FACTURAPI_API_KEY`, que el adaptador HTTP (`createPacHttpClient`) usa para el header `Authorization` (`facturapi.ts:125`). Pero **ese key no se consulta** hasta después de que `descifrarCredencialesPac` (que lee la **BD**, no el env) apruebe. Resultado: con la key env ok, el listado funciona (porque la construcción eager de `createPacClient` ya no lanza), pero el timbrado sigue atascado en el gate de BD.

**Contradicción de contrato (F-3 agravada):** ADR-20260825-01 dice *"nunca registrar la llave"* y que la autenticación es `Bearer <secret>` de Facturapi (env). Pero `timbrar` aún exige una fila `organization_fiscal_config` con key cifrada en BD. La fuente real (env) y el gate (BD) están desconectados: **hay que eliminar el gate de BD para `PAC_MODE=http`** (usar directamente `FACTURAPI_API_KEY` del adapter) o, en su defecto, sembrar la fila del emisor con la misma key — pero esto último contradice el ADR.

---

## Trazabilidad (reintento → resultado)

| # | Criterio | Resultado | Evidencia |
|---|---|---|---|
| 1 | Lista/preview sin 412 y sin crash | **PASS** | `facturacion.list` 200 (F-00001/F-00002 borrador); preview F-00001 200; `facturapi-retry-list-ok.png` |
| 2 | Timbrar Test → `emitida`, `livemode=false`, UUID, XML/PDF, audit `factura.timbrar` | **BLOCKED** | `timbrar` 412 `CSD_NOT_CONFIGURED` (gate BD previo a Facturapi) |
| 3 | Sin doble factura; reload/2º click idempotente | **NO DOBLE** (parcial PASS) | list después = idéntico (`borrador`, `cfdiUuid=null`); 1 sólo intento; sin emisión |
| 4 | No pagar/cerrar/cancelar | **PASS** | guard respetado (sólo 1× timbrar que falló limpio) |
| 5 | Reportar error contrato/datos faltantes sanitzado | **PASS** | 412 con mensaje canónico (sin secretos) |
| 6 | Actualizar reporte/evidencia/veredicto | **PASS** | esta sección |

## 3. Hallazgos (reintento Facturapi)

| ID | Sev | Hallazgo | Evidencia | Impacto | Owner | Cierre |
|---|---|---|---|---|---|---|
| **F-3′** | **P1** | **`timbrar` aún exige `organization_fiscal_config` (fila emisor + `pac_api_key_ciphertext`) pese a que Facturapi es env-key.** `descifrarCredencialesPac` gatea por BD y lanza `CSD_NOT_CONFIGURED` (412) antes de `pac.stamp`; el env key (ya inyectado) no se consulta hasta después. | wire `timbrar` 412 `CSD_NOT_CONFIGURED` + `invoices.ts` `timbrar`→`descifrarCredencialesPac` + `facturapi.ts:125` (usa env) + ADR "nunca registrar la llave" | El timbrado Test no puede ejecutarse aunque la infra ya esté resuelta. | **SOFIA (vía ATLAS)** — contrato | En `PAC_MODE=http` no invocar `descifrarCredencialesPac`; dejar que el adapter use `FACTURAPI_API_KEY` del env (y eliminar el gate de BD/`pac_api_key_ciphertext` para Facturapi). |
| **F-5** | **P2** | **Receptor sin `domicilio` (CP/dirección) → Facturapi probablemente `is_ready_to_stamp=false`.** El snapshot fiscal del cliente (`client_fiscal_data.domicilio`) es `null`. El CFDI exige `DomicilioFiscalReceptor` + `CP`. | `facturacion.preview` → `snapshot.domicilio=null`; `facturapi.ts:207-216 buildCustomerBody` envía `address: receptor.domicilio ?? undefined`. | Una vez resuelto F-3′, el timbrado Facturapi probablemente devolverá `is_ready_to_stamp=false` → `INVOICE_BUILD_INVALID` (400). | **ATLAS/SOFIA** | Capturar `domicilio` del cliente (mínimo `cp` + calle/colonia) antes de timbrar. |
| **F-6** | **P2** | **Mapping de campos de dirección interno→Facturapi no implementado.** El snapshot usa claves en español (`calle`,`numero`,`colonia`,`municipio`,`estado`,`cp`,`pais`; ver `ClientFiscalUpsertInputSchema.domicilio`) pero `buildCustomerBody` pasa `receptor.domicilio` **tal cual** mientras Facturapi espera `{street, exterior, interior, neighborhood, city, municipality, zip, state, country}`. | `facturapi.ts:207-216` (no hay mapeo) vs `zod/index.ts:256-264` (claves internas) | Aun capturando domicilio, el payload de dirección llegaría con claves erróneas → 422 o dirección ignorada. | **SOFIA (vía ATLAS)** | Mapear `{calle→street, colonia→neighborhood, municipio→municipality/city, estado→state, cp→zip, ...}` en `buildCustomerBody`. |
| **F-2′** | **P2** | **El botón "Timbrar" sigue sin mostrar el error** (sólo `onSuccess` en `FacturaRowActions.timbrar`). El 412 queda silencioso para el operador. | body tras click sin mensaje de error; `console.error` "Failed to load resource: 412"; `facturas-list.tsx:176-178` | Operabilidad: el operador no ve por qué no timbró. | **SOFIA** (deuda preexistente) | Añadir `onError` + `role=alert` en fila/diálogo. |

**Nota:** sin doble factura ni doble timbrado (F-00001/F-00002 siguen `borrador`, `cfdiUuid=null`, `paidCents=0` tras 1 intento fallido; el error 412 aborta la transacción antes de cualquier `pac.stamp`, por lo que no hay llamada externa a Facturapi todavía).

## 5. Riesgo operativo

0 mutaciones efectivas; 1× `timbrar` (412, sin cambio de estado ni llamada externa). No producción/delete/rollback/migración/código; sin secretos impresos (mensaje canónico sanitizado). 3× login 200.

## 6. Preparación

| Entorno | Estado |
|---|---|
| Calidad | LISTO (tests añadidos en el commit; sin delta de runtime) |
| Staging | **NO_LISTO (Facturapi)** — listo para lectura, no para timbrado (gate BD pendiente) |
| Producción | NO_LISTO |

## 7. Handoff a ATLAS

1. Aceptar **`BLOCKED`**. El fix de infra desbloqueó la lectura; el timbrado sigue bloqueado por **contrato de código** (`descifrarCredencialesPac` vs env-key), no por infra.
2. **F-3′** → SOFIA: en `PAC_MODE=http` saltar `descifrarCredencialesPac` y dejar que el adapter autentique con `FACTURAPI_API_KEY` (env). Eliminar el gate de `pac_api_key_ciphertext` para Facturapi.
3. **F-5/F-6** → capturar `domicilio` del receptor y mapear claves español→inglés en `buildCustomerBody` (o el timbrado caerá en `is_ready_to_stamp=false`/422 después de F-3′).
4. **F-2′** → SOFIA: mostrar el error de timbrado al operador.
5. **Re-ejecutar V3** tras 2-4: timbrar Test → `emitida`/`cfdiUuid`/XML-PDF/`livemode=false`/audit `factura.timbrar` → reload sin duplicar.
6. No pagar/cerrar/cancelar hasta timbrado OK (criterio #4). No `DONE`/producción por GEMINI.

## 8. Autoauditoría

✅ Verifiqué salud/deploy y estado pre (borrador) antes de mutar; detección con wire real (412). ✅ No edité código/SPEC/ADR/`PROYECTO.md`; no commit/push/deploy/delete/rollback; runners en `/tmp/kilo`; captures en `test-results/`. ✅ No imprimí el key ni PII real; error sanitizado. ✅ Hallazgos F-3′/F-5/F-6/F-2′ con evidencia/impacto/owner/cierre; QA/staging/producción separados. ✅ No invoqué subagentes ni declaré `DONE`.

---

**QA-VERDICT (Facturapi Test, reintento)**: `BLOCKED` · lectura OK (`facturacion.list`/`preview` 200) · timbrado bloqueado: `facturacion.timbrar` F-00001 → 412 `CSD_NOT_CONFIGURED` "Sin configuración fiscal para la organización (BR-N302)" · causa de **código/contrato**: `timbrar` aún gatea por `organization_fiscal_config` (BD) antes de usar el env `FACTURAPI_API_KEY` (ADR "nunca registrar la llave") · sin doble factura (F-00001/F-00002 `borrador`, 0 mutaciones efectivas, sin llamada externa) · 1×P1 (F-3′) + 3×P2 (F-5/F-6/F-2′) · evidencia `facturapi-retry-list-ok.png` + runners `/tmp/kilo/facturapi-{timbrar-attempt,probe,shot}.cjs` · staging `NO_LISTO (timbrado)` · producción `NO_LISTO` · handoff con fix de contrato (quitar gate BD en http + mapear domicilio) antes de re-ejecutar.

---

# FACTURAPI TEST — intento 3 · commit `928786c` · deployment `jcqv5rrvnz6vi7hrkdmyvmex`

> Fixes desplegados: `PAC_MODE=http` salta gate BD CSD/API key (`obtenerCredencialesTimbrar`); mapeo de domicilio interno→Facturapi; UI captura/persiste 7 campos de domicilio; botón Timbrar con `role=alert`; adapter payload `items[].product`.

## QA-VERDICT (Facturapi Test, intento 3): `BLOCKED`

La **integración Facturapi quedó funcionalmente demostrada** (el timbrado ya llega a la llamada HTTP real `POST /customers` y Facturapi responde), pero el timbrado **no completa** (`emitida`/`cfdiUuid`) porque **Facturapi rechaza el RFC** con 400. El bloqueo es de **calidad de dato + validación**, no de wiring.

**Evidencia decisiva (wire real):**

| Paso | Resultado |
|---|---|
| Lista/preview sin 412, sin crash | `facturacion.list`/`preview` 200 |
| Diálogo muestra 7 campos de domicilio (criterio 1) | `calle/numero/colonia/municipio/estado/cp/pais` = 7 inputs (país pre-llenado "MEX", resto vacíos) |
| Timbrado F-00001 (existente, snapshot sin domicilio) | **400 `INVOICE_FISCAL_DATA_REQUIRED`** "El receptor no tiene domicilio fiscal…" — **gate local, 0 llamadas externas, error visible** (`role=alert`) |
| Build con domicilio sintético | `clientes.fiscal.upsert` 200 → `facturacion.buildFromOrder` 200 → **F-00003** con `snapshot.domicilio` presente (7 campos) |
| Timbrado F-00003 (con domicilio) | **400 `INVOICE_BUILD_INVALID`** — `"Facturapi 400 en POST /customers: El campo "tax_id" tiene un formato inválido."` — **llamada real a Facturapi realizada** (no 401/412/CSD) |
| Estado tras ambos intentos | F-00001/F-00002/F-00003 siguen `borrador`, `cfdiUuid=null`, 0 doble timbrado (1 request por intento) |

**Lo que quedó probado (aspectos PASS de la cadena):**
1. **Gate BD CSD/API key eliminado** (F-3′): el timbrado ya NO cae en `CSD_NOT_CONFIGURED`/`PAC_API_KEY_MISSING`; llega hasta `mapDomicilioToFacturapi` (F-00001) y hasta `POST /customers` real (F-00003). ✓
2. **Gate de domicilio** (F-5/F-6): sin domicilio → 400 local sin llamada externa; con domicilio → el mapeo `{calle→street, colonia→neighborhood, cp→zip…}` se ejecuta y POST /customers envía la dirección. ✓
3. **`role=alert` visible** (F-2′): el error del timbrado se muestra (`facturas-list-timbrar-error`). ✓
4. **Persistencia del domicilio** vía `clientes.fiscal.upsert` → snapshot de la nueva factura lo incluye (criterio 2). ✓
5. **Sin duplicación**: 1 único `buildFromOrder` (F-00003) y 1 único intento de timbrado por factura; facturas intactas tras 4xx (criterio 7). ✓

**El bloqueo (único):** el RFC sintético usado (`VEC860825ABC`, creado en el gate del intento 3) es **formato-inválido para el SAT/Facturapi**: pasa el regex interno `/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/` (3 letras + 6 dígitos + 3 alfanuméricos, terminando en `C`), pero el SAT exige que el último carácter (dígito verificador) sea `[0-9A]` y un checksum correcto. Facturapi lo rechaza en `tax_id`.

---

## 0. Estado y datos

| Ítem | Valor |
|---|---|
| `facturacion.list` | F-00001/F-00002/F-00003 `borrador` (sin timbrar) |
| `F-00003` | nueva factura con `snapshot.domicilio` completo (calle "Calle Ficticia", numero "999", colonia "Colonia Test", municipio "Guadalajara", estado "Jalisco", cp "44600", pais "MEX") — **sintético, no PII real** |
| `F-00001`/`F-00002` | `borrador` con `snapshot.domicilio=null` (pre-fix; **inmutables → no timbrables**) |
| `OS-00001` | `delivered`, `finalInvoiceIssued=false` (proxy: no se emitió) |
| RFC receptor | `VEC860825ABC` (sintético, **formato SAT-inválido** — dígito verificador) |

**Hallazgo de diseño/dato asociado:** las facturas `borrador` existentes creadas **antes** del fix de domicilio (F-00001/F-00002) quedaron con `clientFiscalDataSnapshot.domicilio=null` y **no pueden timbrarse en el estado actual** (el snapshot es inmutable y no hay re-snapshot). Sólo una factura nueva (F-00003) captura el domicilio. Requiere decisión ATLAS (reconstruir vs añadir re-snapshot).

## 1. Trazabilidad (criterios → resultado)

| # | Criterio | Resultado | Evidencia |
|---|---|---|---|
| 1 | Liste/preview sin 412; formulario muestra domicilio | **PASS** | list 200; 7 campos presentes |
| 2 | Domicilio sintético → fiscal upsert → usar/crear factura | **PASS (parcial)** | upsert 200 → build 200 → F-00003 con domicilio; F-00001 inmutable (pre-fix) |
| 3 | Timbrar Test → emitida/cfdiUuid/XML-PDF/livemode=false/audit | **BLOCKED** | 400 Facturapi `tax_id` inválido antes de `emitida` |
| 4 | Reload/2º intento idempotente sin duplicar | **PASS (sin dup)** | 1 request por intento; facturas `borrador` intactas |
| 5 | Validación domicilio incompleto (barato) | **PASS** | F-00001 → 400 local, visible, 0 externas |
| 6 | No pagar/cerrar/cancelar | **PASS** | guard respetado |
| 7 | 4xx → reportar sanitizado + factura intacta | **PASS** | 400 reportado; F-00003 `borrador` |

## 2. Hallazgos (intento 3)

| ID | Sev | Hallazgo | Evidencia | Impacto | Owner | Cierre |
|---|---|---|---|---|---|---|
| **F-7** | **P1** | **Validación RFC interna más laxa que el PAC → timbrado falla tarde.** `ClientFiscalUpsertInputSchema.rfc`/`isValidRfc` usan `/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/` (sin dígito verificador ni regla de último carácter `[0-9A]`); un RFC como `VEC860825ABC` pasa la UI pero Facturapi lo rechaza en `tax_id` (400 `INVOICE_BUILD_INVALID`). | Facturapi 400 "El campo tax_id tiene un formato inválido" + regex interno (zod/index.ts:245-251) | El operador cree tener RFC válido; el fallo aparece sólo al timbrar (tarde, con llamada externa fallida). | **SOFIA/ATLAS** | Alinear el validador con SAT (incluir checksum/dígito verificador) y/o usar RFC SAT-válido en datos de prueba (p. ej. genérico `XAXX010101000`). Re-ejecutar timbrado con RFC válido. |
| **F-8** | **P3** | **Facturas borrador pre-fix no timbrables (snapshot inmutable sin domicilio).** F-00001/F-00002 tienen `clientFiscalDataSnapshot.domicilio=null` y no hay re-snapshot; sólo facturas nuevas capturan domicilio. | `preview` snapshot.domicilio=null; 400 `INVOICE_FISCAL_DATA_REQUIRED` al timbrar | Las OS entregadas pre-fix no pueden facturarse sin reconstruir factura. | **ATLAS** | Decidir reconstruir vs añadir re-snapshot en `timbrar` (releer `client_fiscal_data`). |
| **F-9** | **P3** | **`livemode` no expuesto en el DTO.** El adaptador devuelve `{cfdiUuid, xml, pdf, status}` sin `livemode`; se infiere Test por la key `sk_test_*` (ADR) y porque la respuesta 400 provino del sandbox Facturapi. | facturapi.ts `stamp` (no mapea livemode) | Observabilidad: para confirmar "sin validez fiscal" hay que confiar en la key, no en el dato. | **SOFIA** (opcional) | Persistir/exponer `livemode` en el DTO/auditoría para evidencia explícita. |

## 3. Validación independiente

```
set -a; . /home/frank/.config/kilo/integra.secrets.env; set +a
curl -s https://sistema-vectoria.vector-ia.mx/api/health          # 200
NODE_PATH=... node /tmp/kilo/facturapi3-phaseA.cjs   # domicilio campo + timbrar F-00001 -> 400 fiscal data
NODE_PATH=... node /tmp/kilo/facturapi3-phaseB.cjs   # build F-00003 + timbrar -> 400 Facturapi tax_id
```

**Wire:** `fiscal.upsert` 200 → `buildFromOrder` 200 (F-00003, snapshot.domicilio presente) → `facturacion.timbrar` 400 `INVOICE_BUILD_INVALID` "Facturapi 400 en POST /customers: El campo tax_id tiene un formato inválido." (mensaje sanitizado, sin key). `timbrar` F-00001 → 400 `INVOICE_FISCAL_DATA_REQUIRED` (sin llamada externa). 0 doble timbrado; facturas intactas.

## 4. Riesgo operativo

Mutaciones: 1× `fiscal.upsert` (200) + 1× `buildFromOrder` (200, F-00003) + 2× `timbrar` (ambas 400, sin cambio de estado). Sin pagar/cerrar/cancelar. Sin producción/delete/rollback/migración/código; sin secretos impresos (mensaje 400 sanitizado). Sin validez fiscal (Test).

## 5. Preparación

| Entorno | Estado |
|---|---|
| Calidad | LISTO (tests añadidos; sin delta runtime) |
| Staging | **NO_LISTO (timbrado)** — integración funcional, RFC inválido impide `emitida` |
| Producción | NO_LISTO |

## 6. Handoff a ATLAS

1. Aceptar **`BLOCKED`**: la integración Facturapi está **funcional** (llamada real `POST /customers` con 400 real, no 401/412/BD gate); el bloqueo único es el **RFC inválido** (`VEC860825ABC`).
2. **F-7** → SOFIA: endurecer validación RFC (checksum SAT) y/o usar un RFC SAT-válido en los datos de prueba (genérico `XAXX010101000`). Tras corregir el RFC del cliente, **reconstruir factura** (el snapshot es inmutable) y re-timbrar.
3. **F-8** → ATLAS: decidir reconstruir facturas pre-fix o añadir re-snapshot en `timbrar`.
4. **F-9** (opcional) → SOFIA: exponer `livemode` en DTO/auditoría.
5. **Re-ejecutar V3** tras corregir RFC: esperar `emitida` + `cfdiUuid` + XML/PDF en files + audit `factura.timbrar` + `livemode=false`.
6. No pagar/cerrar/cancelar hasta timbrado OK (criterio #6). No `DONE`/producción por GEMINI.

## 7. Autoauditoría

✅ Verifiqué health/deploy/código (diff) y estado pre antes de mutar. ✅ Detección con wire real (400 vs 400 local). ✅ No edité código/SPEC/ADR/`PROYECTO.md`; no commit/push/deploy/delete/rollback; runners en `/tmp/kilo`; captures en `test-results/`. ✅ No imprimí key ni PII real (domicilio sintético; mensajes sanitizados). ✅ Hallazgos F-7/F-8/F-9 con evidencia/impacto/owner/cierre; QA/staging/producción separados. ✅ No invoqué subagentes ni declaré `DONE`.

---

**QA-VERDICT (Facturapi Test, intento 3)**: `BLOCKED` · integración Facturapi **funcional** (POST /customers real → 400 real, no 401/412/gate BD) · timbrado no completa: 400 `INVOICE_BUILD_INVALID` "El campo tax_id tiene un formato inválido" (RFC sintético `VEC860825ABC` SAT-inválido; validación RFC interna laxa — **F-7 P1**) · gate de domicilio y `role=alert` verificados (F-00001 → 400 local, visible, 0 externas) · F-00003 con snapshot.domicilio creado y persistido · facturas intactas (`borrador`), sin duplicar ni pagar/cerrar/cancelar · evidencias `facturapi3-0[0-5]-*.png` + runners `/tmp/kilo/facturapi3-phase[A-B].cjs` · F-8/F-9 P3 · staging `NO_LISTO (timbrado)` · producción `NO_LISTO` · handoff: corregir RFC (checksum) → reconstruir → re-timbrar.

---

# FACTURAPI TEST — RFC genérico SAT válido · `XAXX010101000`

> Instrucción Frank/ATLAS: F-7 es dato sintético inválido (no código). Reintentar con RFC genérico SAT válido `XAXX010101000`, misma razón social sintética, régimen 601, domicilio sintético ya capturado. Nueva factura única (no borrar/modificar F-00001/02/03).

## QA-VERDICT (RFC genérico): `BLOCKED`

El RFC genérico **fue aceptado** por Facturapi (desapareció el error `tax_id`), pero el timbrado vuelve a bloquearse en **otro campo**: `tax_system` con valor `"601"` es rechazado.

- **`POST /customers` real → 400** `INVOICE_BUILD_INVALID`: `"Facturapi 400 en POST /customers: El campo "tax_system" no tiene un valor permitido."` (mensaje sanitizado, sin key).
- El **RFC `XAXX010101000` ya NO es el problema** (no hay error `tax_id`): F-7 (RFC inválido) queda **resuelto como dato de prueba reemplazado**.
- El **`tax_system`** se envía como `receptor.regimenFiscal` = `snapshot.regimen` = `"601"` (General de Ley Personas Morales). Facturapi lo rechaza.

**Causa probable (a confirmar por ATLAS/SOFIA, no inventada):** `"601"` es régimen de **persona moral**, pero `XAXX010101000` es el RFC genérico de **persona física** (nacional). El sistema **no cruza** tipo-de-persona ↔ régimen, así que la combinación inconsistente llega al PAC y se rechaza tarde. El régimen consistente para el genérico nacional sería `"616"` (Sin Obligaciones Fiscales) u otro de persona física — **propuesta a confirmar**, no ejecutada.

---

## 0. Estado y datos (RFC genérico)

| Ítem | Valor |
|---|---|
| `clientes.fiscal.upsert` | **200** (RFC → `XAXX010101000`, régimen 601, razón social sintética, domicilio completo) |
| `facturacion.buildFromOrder` | **200** → **F-00004** (`2fb82e3d-…`), snapshot `rfc=XAXX010101000`, `regimen=601`, `domicilio` completo |
| `facturacion.timbrar` F-00004 | **400** `INVOICE_BUILD_INVALID` — `tax_system` "601" no permitido |
| F-00001/02/03/04 | `borrador`, `cfdiUuid=null` (intactas, sin tocar F-00001/02/03) |
| Prefill confirmado | RFC `VEC860825ABC` (pre-cambio), razón "Cliente Prueba Vectoria S.A. de C.V.", régimen 601, domicilio pre-llenado (calle "Calle Ficticia", cp 44600, …) |

## 1. Trazabilidad (RFC genérico → resultado)

| Criterio | Resultado | Evidencia |
|---|---|---|
| Upsert fiscal (RFC genérico) + build draft | **PASS** | upsert 200 → build 200 (F-00004, snapshot rfc=XAXX010101000 + domicilio) |
| POST customers 2xx + payload canónico | **FAIL (400)** | 400 `tax_system`; la llamada real se realizó (no 401/412) |
| POST invoice draft / stamp / GET XML-PDF 2xx | **NO ALCANZADO** | aborta en `POST /customers` |
| Factura `emitida` / `cfdiUuid` / XML-PDF / audit `factura.timbrar` | **NO ALCANZADO** | F-00004 sigue `borrador` |
| Reload sin duplicación | **PASS** | 1 `timbrar`; F-00004 `borrador` intacto |
| No cancelar/pagar/cerrar | **PASS** | guard respetado |

## 2. Hallazgos (RFC genérico)

| ID | Sev | Hallazgo | Estado/F-7 | Owner | Cierre |
|---|---|---|---|---|---|
| **F-7** | P1 | RFC sintético `VEC860825ABC` SAT-inválido | **RESUELTO como dato reemplazado**: `XAXX010101000` aceptado (sin error `tax_id`) | ATLAS (dato) | — (no requiere código, aunque endurecer `isValidRfc` con checksum sigue recomendado) |
| **F-10** | **P2** | **`tax_system="601"` rechazado por Facturapi** para el RFC genérico. El sistema mapea `regimen`→`tax_system` sin validar consistencia tipo-de-persona↔régimen. | Bloquea el timbrado (segundo campo) | **ATLAS (dato) / SOFIA (opcional validación cruzada)** | Usar régimen consistente con el genérico (`616` Sin Obligaciones Fiscales, a confirmar) o un RFC moral válido con `601`; re-timbrar. |

## 3. Validación independiente

```
set -a; . /home/frank/.config/kilo/integra.secrets.env; set +a
NODE_PATH=... node /tmp/kilo/facturapi4.cjs
```

Wire: upsert 200 (RFC `XAXX010101000`) → build 200 (F-00004, snapshot rfc genérico + domicilio) → timbrar 400 `INVOICE_BUILD_INVALID` "El campo tax_system no tiene un valor permitido." (sanitizado). F-00004 `borrador` tras 400. `audit` sin entradas de `factura.timbrar` (el timbrado no completó).

## 4. Riesgo operativo

Mutaciones: 1× `fiscal.upsert` (200, actualiza RFC del cliente) + 1× `buildFromOrder` (200, F-00004) + 1× `timbrar` (400, sin cambio de estado). Sin pagar/cerrar/cancelar. Sin producción/delete/rollback/migración/código; sin secretos (mensaje 400 sanitizado). Sin validez fiscal (Test).

## 5. Preparación

| Entorno | Estado |
|---|---|
| Calidad | LISTO |
| Staging | **NO_LISTO (timbrado)** — RFC resuelto, `tax_system` rechazado |
| Producción | NO_LISTO |

## 6. Handoff a ATLAS

1. Aceptar **`BLOCKED`**. F-7 resuelto (RFC genérico aceptado); nuevo bloqueo en `tax_system`.
2. **F-10** → decidir el régimen correcto para el RFC genérico (`616` Sin Obligaciones Fiscales, a confirmar) y reconstruir factura (o actualizar el dato y re-timbrar). Alternativa: usar un RFC **moral** con `601` consistente.
3. **Opcional** → SOFIA: validación cruzada tipo-de-persona↔régimen para fallar temprano.
4. No pagar/cerrar/cancelar hasta timbrado OK. No `DONE`/producción por GEMINI.

## 7. Autoauditoría

✅ Verifiqué salud/estado y seguí el flujo UI real (upsert+build, no mutación ciega). ✅ Detección con wire real (400) y reporte sanitizado; facturas intactas; sin duplicación. ✅ No edité código/SPEC/ADR/`PROYECTO.md`; no commit/push/deploy/delete/rollback; runners en `/tmp/kilo`; captures en `test-results/`. ✅ No imprimí key ni PII real. ✅ F-10 con evidencia/impacto/owner/cierre; F-7 marcado resuelto como dato. ✅ No invoqué subagentes ni declaré `DONE`.

---

**QA-VERDICT (RFC genérico)**: `BLOCKED` · RFC `XAXX010101000` **aceptado** (F-7 resuelto como dato) · nuevo bloqueo: `facturacion.timbrar` F-00004 → 400 `INVOICE_BUILD_INVALID` "El campo tax_system no tiene un valor permitido" (`regimen=601` inconsistente con genérico-física) · F-00004 `borrador` intacto, F-00001/02/03 sin tocar · 1 upsert (200) + 1 build (200) + 1 timbrar (400) · evidencias `facturapi4-0[0-3]-*.png` + runner `/tmp/kilo/facturapi4.cjs` · F-10 P2 · staging `NO_LISTO (timbrado)` · producción `NO_LISTO` · handoff: confirmar régimen consistente (`616`?) → reconstruir → re-timbrar.

---

# FACTURAPI TEST — combinación coherente `XAXX010101000` + régimen `616`

> F-10 es inconsistencia de datos. Para staging: RFC `XAXX010101000` + régimen `616` (Sin Obligaciones Fiscales), razón social y domicilio sintéticos. Nueva factura única (F-00005), sin tocar F-00001/02/03/04.

## QA-VERDICT (RFC genérico + 616): `BLOCKED`

El régimen `616` **fue aceptado** (F-10 resuelto con evidencia 2xx), y el flujo avanzó dos pasos más: **`POST /customers` 2xx** y **`POST /invoices` (draft) 2xx**. El bloqueo ahora es `is_ready_to_stamp=false` — la factura borrador de Facturapi **no está lista para timbrar** por "faltan datos del receptor", y el adaptador **descarta el detalle** del campo faltante.

- **`facturacion.timbrar` F-00005 → 400 `INVOICE_BUILD_INVALID`**: `"Facturapi: factura borrador no lista para timbrar (faltan datos del receptor)"` (mensaje sanitizado).
- **Cadena Facturapi demostrada hasta este punto:** `POST /customers` 2xx (tax_id `XAXX010101000` ✓, tax_system `616` ✓) → `POST /invoices` 2xx (draft creado, `is_ready_to_stamp=false`) → **NO llega a** `POST /stamp` ni `GET xml/pdf`.
- **`F-10` RESUelto** (con evidencia 2xx: la creación de cliente pasó `tax_system` sin error); **F-7** ya resuelto.
- **F-00005 `borrador` intacto**; 1 único `timbrar`; sin pagar/cerrar/cancelar.

---

## 0. Estado y datos (616)

| Ítem | Valor |
|---|---|
| `clientes.fiscal.upsert` | **200** (régimen → 616; RFC ya `XAXX010101000`; razón social + domicilio sintéticos) |
| `facturacion.buildFromOrder` | **200** → **F-00005** (`e4827b7c-…`), snapshot `rfc=XAXX010101000`, `regimen=616`, `domicilio` completo |
| `facturacion.timbrar` F-00005 | **400** `INVOICE_BUILD_INVALID` — `is_ready_to_stamp=false` (receptor incompleto) |
| Prefill confirmado | RFC `XAXX010101000`, régimen `601` (cambiado a `616`), razón social sintética, domicilio pre-llenado |

## 1. Trazabilidad (616 → resultado)

| Criterio | Resultado | Evidencia |
|---|---|---|
| POST customers 2xx (payload canónico) | **PASS** | sin error `tax_id`/`tax_system`; avanzó a crear invoice draft |
| POST invoice draft 2xx | **PASS (parcial)** | draft creado con `is_ready_to_stamp=false` |
| POST stamp 2xx / GET XML-PDF 2xx | **NO ALCANZADO** | aborta en `is_ready_to_stamp=false` |
| Factura `emitida`/`cfdiUuid`/XML-PDF/audit `factura.timbrar` | **NO ALCANZADO** | F-00005 `borrador` |
| `616` rechazado → detener | **N/A (no rechazado)** | `616` aceptado |
| Reload sin duplicación / no cancelar-pagar-cerrar | **PASS** | 1 `timbrar`; F-00005 `borrador` |

## 2. Hallazgos

| ID | Sev | Hallazgo | Estado |
|---|---|---|---|
| **F-7** | P1 | RFC sintético SAT-inválido | **RESUELTO** (RFC genérico aceptado) |
| **F-10** | P2 | `tax_system=601` rechazado | **RESUELTO** (régimen `616` aceptado, 2xx en customers) |
| **F-11** | **P2** | **`is_ready_to_stamp=false`: faltan datos del receptor, pero el adaptador descarta el detalle.** Facturapi crea el draft pero no lo deja timbrar; el error canónico sólo dice "faltan datos del receptor" sin indicar **qué** campo. | Bloquea el stamp. Owner **SOFIA** (exponer `verification`/`errors` del invoice para conocer el campo exacto) + **ATLAS** (completar el dato del receptor, probablemente `email` o un detalle de `address`). |

**Nota (no inventada):** el cliente sintético no tiene `email` (el snapshot interno no lo captura), y Facturapi suele requerir datos de notificación/dirección completos para `is_ready_to_stamp`. Se recomienda exponer el detalle de verificación de Facturapi (el campo `verification.errors` del objeto invoice) en el error del adaptador, en lugar de adivinar el campo.

## 3. Validación independiente

```
set -a; . /home/frank/.config/kilo/integra.secrets.env; set +a
NODE_PATH=... node /tmp/kilo/facturapi5.cjs
```

Wire: upsert 200 (régimen 616) → build 200 (F-00005, snapshot rfc genérico + régimen 616 + domicilio) → timbrar 400 `INVOICE_BUILD_INVALID` "factura borrador no lista para timbrar (faltan datos del receptor)". F-00005 `borrador`. Audit sin `factura.timbrar`.

## 4. Riesgo operativo

Mutaciones: 1× upsert (200) + 1× build (200, F-00005) + 1× timbrar (400, sin cambio). Sin pagar/cerrar/cancelar. Sin producción/delete/rollback/código; sin secretos. En el lado Facturapi quedó un **draft** (idempotente por `external_id`; no genera factura fiscal).

## 5. Preparación

| Entorno | Estado |
|---|---|
| Calidad | LISTO |
| Staging | **NO_LISTO (timbrado)** — `is_ready_to_stamp=false` |
| Producción | NO_LISTO |

## 6. Handoff a ATLAS

1. Aceptar **`BLOCKED`**. F-7 y F-10 resueltos; nuevo bloqueo F-11 (`is_ready_to_stamp=false`, campo no especificado).
2. **F-11** → SOFIA: exponer el detalle `verification`/`errors` de Facturapi en el error (para saber **qué** dato del receptor falta, sin adivinar). ATLAS: completar el dato faltante (probablemente `email` del receptor o un detalle de `address`).
3. Re-ejecutar tras conocer el campo exacto. Mantener el snapshot inmutable → nueva factura (F-00006).
4. No pagar/cerrar/cancelar hasta timbrado OK. No `DONE`/producción por GEMINI.

## 7. Autoauditoría

✅ Seguí el flujo UI real (upsert+build) con la combinación indicada; no probé más combinaciones tras el nuevo bloqueo. ✅ Detección wire real (400) y reporte sanitizado; facturas intactas; sin duplicación. ✅ No edité código/SPEC/ADR/`PROYECTO.md`; no commit/push/deploy/delete/rollback; runners en `/tmp/kilo`; captures en `test-results/`. ✅ No imprimí key ni PII real. ✅ F-10 resuelto con evidencia 2xx; F-11 nuevo con evidencia. ✅ No invoqué subagentes ni declaré `DONE`.

---

**QA-VERDICT (RFC genérico + 616)**: `BLOCKED` · F-7 y F-10 **resueltos** (RFC `XAXX010101000` y régimen `616` aceptados por Facturapi, 2xx en customers) · cadena avanzó a `POST /invoices` draft 2xx con `is_ready_to_stamp=false` · nuevo bloqueo: `facturacion.timbrar` F-00005 → 400 `INVOICE_BUILD_INVALID` "faltan datos del receptor" (detalle descartado por el adaptador — **F-11 P2**) · F-00005 `borrador` intacto, sin duplicar ni pagar/cerrar/cancelar · evidencias `facturapi5-0[0-3]-*.png` + runner `/tmp/kilo/facturapi5.cjs` · staging `NO_LISTO (timbrado)` · producción `NO_LISTO` · handoff: exponer `verification.errors` + completar dato del receptor → re-timbrar.

---

# FACTURAPI TEST — reintento timbrado F-00005 · deploy `cbbb842` (surfacing `verification.errors`)

## QA-VERDICT (reintento F-00005): `BLOCKED`

El reintento únicamente del timbrado de F-00005 (sin crear factura ni tocar F-00001..05) **no llega a `verification.errors`**: Facturapi responde **409 por colisión de `idempotency_key`**, porque el intento anterior (`facturapi5`) ya creó el draft con ese mismo `external_id`. El código nuevo de surfacing (`extractFacturapiErrors`) **sí funcionó** — extrajo y formateó el mensaje de la 409 — pero no es el detalle de verificación.

- **`facturacion.timbrar` F-00005 → 409 `INVOICE_BUILD_INVALID`**: `"Facturapi 409 en POST /invoices\n  · La clave de idempotencia (idempotency_key) ya está siendo usada."` (sanitizado, sin PII/secretos).
- **`role=alert` visible** con el mismo texto. F-00005 sigue `borrador`, `cfdiUuid=null`, intacta. 1 único `timbrar`.

**Diagnóstico exacto:** el `external_id`/`idempotency_key` derivado por el adaptador (`hash(organizationId + receptor.rfc + claveProdServ + totalCents)`) **no incluye el identificador de la factura interna**. Por tanto:
1. Un **reintento** de la misma factura colisiona consigo mismo → 409 (observado).
2. **Dos facturas distintas** del mismo cliente+concepto+importe colisionarían entre sí (latente: F-00004 y F-00005 comparten `rfc=XAXX010101000`/importe) → mismo `external_id`.

Al no manejar el 409 recuperando el draft existente, el adaptador **no puede leer** `verification.errors`/`is_ready_to_stamp` del draft ya creado en Facturapi; la pregunta "qué campo falta (email u otro)" **sigue sin responder** por esta vía.

---

## 0. Estado (reintento F-00005)

| Ítem | Valor |
|---|---|
| `facturacion.timbrar` F-00005 | **409** `INVOICE_BUILD_INVALID` — `idempotency_key` ya usada |
| F-00001..05 | `borrador`, intactas (`cfdiUuid=null`), sin tocar |
| Draft en Facturapi | existe (creado en `facturapi5` con `is_ready_to_stamp=false`), `external_id` = hash org+RFC+clave+total |

## 1. Hallazgos (reintento F-00005)

| ID | Sev | Hallazgo | Evidencia | Owner | Cierre |
|---|---|---|---|---|---|
| **F-12** | **P1** | **`external_id`/`idempotency_key` no es por-factura** (no incluye `invoice.id`/`code`), derivado de `organizationId+rfc+clave+total`. Causa (a) 409 en reintentos de la misma factura (observado) y (b) colisión entre facturas distintas del mismo cliente+concepto+importe (latente). | `facturapi.ts hashExternalId` (líneas ~540-560) + 409 real "idempotency_key ya usada" | Bloquea el reintento de timbrado; riesgo de colisión real entre facturas. | **SOFIA** | Derivar `external_id` con el `invoice.id`/`code`; y/o manejar 409 de Facturapi recuperando el invoice existente (GET by `external_id`) y continuar al stamp. |
| **F-11** | P2 | `verification.errors` del draft existente no legible: el reintento 409 bloquea antes de `is_ready_to_stamp`; el adaptador no hace GET del invoice ya creado. | 409 en POST /invoices; sin `verification` | No se puede determinar el campo receptor faltante (email u otro) sin fetch del draft. | **SOFIA** | En 409 idempotencia, GET `/invoices` por `external_id` y extraer `verification.errors`/`is_ready_to_stamp`. |

**Nota positiva:** el nuevo `extractFacturapiErrors`/`formatDiagnostics` (intento 4) **funciona**: convirtió una 409 genérica en un mensaje con diagnóstico estructurado "· idempotency_key ya usada". La base está puesta; falta el manejo 409→fetch.

## 2. Validación independiente

```
set -a; . /home/frank/.config/kilo/integra.secrets.env; set +a
NODE_PATH=... node /tmp/kilo/facturapi6.cjs
```

Wire: `facturacion.timbrar` F-00005 → 409 `INVOICE_BUILD_INVALID` "Facturapi 409 en POST /invoices · La clave de idempotencia (idempotency_key) ya está siendo usada." (sanitizado). `role=alert` visible. F-00005 `borrador`. 1 único request.

## 3. Riesgo operativo

0 nuevas mutaciones de negocio (sólo 1× `timbrar` 409). F-00001..05 intactas. Sin pagar/cerrar/cancelar; sin secretos; Test mode. El draft de Facturapi (idempotente) no genera factura fiscal.

## 4. Preparación

| Entorno | Estado |
|---|---|
| Calidad | LISTO |
| Staging | **NO_LISTO (timbrado)** — 409 idempotencia bloquea el reintento |
| Producción | NO_LISTO |

## 5. Handoff a ATLAS

1. Aceptar **`BLOCKED`**. La 409 es por el `external_id` no-por-factura (F-12), no por datos del receptor.
2. **F-12** → SOFIA: `external_id` con identificador de factura; y/o manejar 409 recuperando el invoice (GET por `external_id`).
3. **F-11** → SOFIA: en el fetch del draft existente, extraer `verification.errors`/`is_ready_to_stamp` para conocer el campo receptor faltante (email u otro).
4. No pagar/cerrar/cancelar hasta timbrado OK. No `DONE`/producción por GEMINI.

## 6. Autoauditoría

✅ Reintenté ÚNICAMENTE el timbrado de F-00005 (1×); no creé factura ni toqué F-00001..05. ✅ Detección wire real (409) con mensaje sanitizado; F-00005 intacta. ✅ No edité código/SPEC/ADR/`PROYECTO.md`; no commit/push/deploy/delete/rollback; runner en `/tmp/kilo`; capture en `test-results/`. ✅ No imprimí key/PII. ✅ F-12/F-11 con evidencia/owner/cierre. ✅ No invoqué subagentes ni declaré `DONE`.

---

**QA-VERDICT (reintento F-00005)**: `BLOCKED` · `facturacion.timbrar` F-00005 → 409 `INVOICE_BUILD_INVALID` "La clave de idempotencia (idempotency_key) ya está siendo usada." · causa: `external_id`/`idempotency_key` **no por-factura** (sin `invoice.id`/`code`) → reintento/colisiones (F-12 P1) · `verification.errors` ilegible (F-11 P2: falta 409→fetch del draft) · F-00005 `borrador` intacto, sin duplicar · 1× timbrar (409) · sufacer `extractFacturapiErrors` funcionando (diagnóstico 409 estructurado) · evidencia `facturapi6-00-timbrar-error.png` + runner `/tmp/kilo/facturapi6.cjs` · staging `NO_LISTO (timbrado)` · producción `NO_LISTO` · handoff: external_id por-factura + fetch draft en 409 → re-timbrar.

---

# FACTURAPI TEST — idempotencia por invoiceId · commit `7f2eb4e` · deployment `hzookawyfrssuwzw6s5kwo0m`

## QA-VERDICT (idempotencia por invoiceId): `BLOCKED`

La **idempotencia quedó corregida** (F-12 resuelto: ya no hay 409), y el timbrado vuelve a rebotar en `is_ready_to_stamp=false` — pero **sin el detalle `verification.errors`**: el adaptador no obtiene la razón del readiness desde la respuesta del draft.

- **`facturacion.timbrar` F-00005 → 400 `INVOICE_BUILD_INVALID`**: `"Facturapi: factura borrador no lista para timbrar"` — **sin líneas de diagnóstico** (el extractor no halló `verification.errors`/`errors`/`message` en la respuesta de `POST /invoices`).
- **Ya no hay 409** (F-12 resuelto): `external_id = inv:hash(organizationId+invoiceId)` y `idempotency_key` de customer `cust:hash(orgId+rfc)` — estables y por-factura.
- `role=alert` visible (mensaje báre); F-00005 `borrador` intacta; 1 único `timbrar`.

**Diagnóstico exacto:** `extractFacturapiErrors(draft)` retorna vacío porque **Facturapi no expone la razón del readiness en el response de `POST /invoices`** bajo `verification.errors`/`errors`/`message`. El draft (`is_ready_to_stamp=false`) NO trae los campos faltantes (email, dirección, etc.). Para conocerlos hay que hacer un follow-up (p. ej. `GET /customers/{id}`) y leer el `verification.errors` del CUSTOMER, no del invoice.

---

## 0. Estado (idempotencia por invoiceId)

| Ítem | Valor |
|---|---|
| `facturacion.timbrar` F-00005 | **400** `INVOICE_BUILD_INVALID` "factura borrador no lista para timbrar" (sin detalle) |
| 409 idempotencia | **ausente** (F-12 resuelto) |
| F-00001..05 | `borrador`, intactas |
| Keys | customer `cust:hash(orgId+rfc)` estable; invoice `inv:hash(orgId+invoiceId)` por-factura |

## 1. Trazabilidad (idempotencia por invoiceId → resultado)

| Criterio | Resultado | Evidencia |
|---|---|---|
| Timbrar F-00005 (1×) | **ejecutado** | 400 arriba |
| Si `is_ready_to_stamp=false` → `verification.errors` exactos | **NO OBTENIDO** | mensaje báre, sin detalles |
| Pasa readiness → stamp/XML-PDF/emitida/audit/livemode=false | **NO ALCANZADO** | aborta en readiness |
| No 409 + keys estables/por-factura | **PASS** | sin 409; código de keys |
| No pagar/cancelar/cerrar | **PASS** | guard respetado |

## 2. Hallazgos (idempotencia por invoiceId)

| ID | Sev | Hallazgo | Estado |
|---|---|---|---|
| **F-12** | P1 | `external_id`/`idempotency_key` no por-factura (409/colisión) | **RESUELTO**: `inv:hash(orgId+invoiceId)`; sin 409 |
| **F-11** | P2 | `verification.errors` ilegible | **RE-SCOPED**: la razón del `is_ready_to_stamp=false` NO está en el response de `POST /invoices`; falta un follow-up `GET /customers/{id}` (o endpoint correcto) para leer `verification.errors` del cliente |

**Nota positiva:** el cambio introdujo la separación correcta de claves (customer vs invoice) y eliminó la 409; el pipeline completo (`customers → invoices draft → readiness`) está operativo; sólo falta la fuente del detalle de readiness.

## 3. Validación independiente

```
set -a; . /home/frank/.config/kilo/integra.secrets.env; set +a
NODE_PATH=... node /tmp/kilo/facturapi6.cjs
```

Wire: `facturacion.timbrar` F-00005 → 400 `INVOICE_BUILD_INVALID` "Facturapi: factura borrador no lista para timbrar" (sin líneas). F-00005 `borrador`. 1 request. Sin 409.

## 4. Riesgo operativo

0 mutaciones de negocio (1× timbrar 400). F-00001..05 intactas. Sin pagar/cerrar/cancelar; sin secretos; Test mode.

## 5. Preparación

| Entorno | Estado |
|---|---|
| Calidad | LISTO |
| Staging | **NO_LISTO (timbrado)** — readiness sin detalle |
| Producción | NO_LISTO |

## 6. Handoff a ATLAS

1. Aceptar **`BLOCKED`**. F-12 resuelto; F-11 re-scoped (la razón del readiness no viene en `POST /invoices`).
2. **F-11** → SOFIA: ante `is_ready_to_stamp=false`, hacer `GET /customers/{id}` (o el endpoint correcto) y extraer `verification.errors` del cliente; exponer paths/codes. No adivinar campos.
3. Tras conocer el campo exacto (email/cp/address), completar el dato del receptor sintético y re-timbrar (F-00005; la idempotencia por-factura ya asegura que el reintento reutiliza el draft).
4. No pagar/cerrar/cancelar hasta timbrado OK. No `DONE`/producción por GEMINI.

## 7. Autoauditoría

✅ Reintenté ÚNICAMENTE el timbrado de F-00005 (1×); no creé factura ni toqué F-00001..05. ✅ Detección wire real (400) y mensaje sanitizado; facturas intactas. ✅ No edité código/SPEC/ADR/`PROYECTO.md`; no commit/push/deploy/delete/rollback; runner en `/tmp/kilo`; capture en `test-results/`. ✅ No imprimí key/PII. ✅ F-12 resuelto con evidencia (sin 409); F-11 re-scoped con evidencia. ✅ No invoqué subagentes ni declaré `DONE`.

---

**QA-VERDICT (idempotencia por invoiceId)**: `BLOCKED` · F-12 **resuelto** (sin 409; keys `cust:`/`inv:` estables y por-factura) · nuevo/último bloqueo: `facturacion.timbrar` F-00005 → 400 `INVOICE_BUILD_INVALID` "factura borrador no lista para timbrar" **sin detalle** — la razón del readiness no viene en `POST /invoices`, falta `GET /customers/{id}` para `verification.errors` (F-11 re-scoped) · F-00005 `borrador` intacto, sin duplicar · 1× timbrar (400) · evidencia `facturapi6-00-timbrar-error.png` + runner `/tmp/kilo/facturapi6.cjs` · staging `NO_LISTO (timbrado)` · producción `NO_LISTO` · handoff: follow-up del readiness → completar dato → re-timbrar.

---

# FACTURAPI TEST — /stamp sin abort local · commit `2326c39a` · deployment `lzvnkqfubajtzmtmzexcaia6`

## QA-VERDICT (F-00005 · /stamp oficial): `BLOCKED`

El cambio (NO abortar por `is_ready_to_stamp=false`, dejar que `/stamp` valide) **no llegó a ejercerse**: el timbrado rebota **antes**, en `POST /invoices`, con **409 por idempotencia de reintento**.

- **`facturacion.timbrar` F-00005 → 409 `INVOICE_BUILD_INVALID`**: `"Facturapi 409 en POST /invoices · La clave de idempotencia (idempotency_key) ya está siendo usada."` (sanitizado, sin PII/secretos).
- **No se alcanzó `POST /stamp`** (el 409 ocurre en `POST /invoices`) → no hay validación oficial detallada que reportar.
- **No hubo GET XML/PDF ni mutación interna** (F-00005 sigue `borrador`, `cfdiUuid=null`, `data=null`; 1 único `timbrar`). ✓ (criterio #3)
- `role=alert` visible con el mensaje 409.

**Diagnóstico exacto:** la clave `external_id`/`idempotency_key` por-factura (`inv:hash(organizationId+invoiceId)`) es **estable** (bien), pero en **reintento** de la misma factura Facturapi devuelve **409** (no el draft existente), y el adaptador **no hace `GET /invoices` por `external_id`** para recuperar el draft y continuar. El intento 5 (`7f2eb4e`) ya creó el draft con ese `inv:hash(...)`; este reintento reutiliza la misma clave → 409. La mejora del intento 6 (proceder a `/stamp`) queda **inalcanzable** para F-00005 hasta resolver el 409.

---

## 0. Estado (F-00005 · /stamp)

| Ítem | Valor |
|---|---|
| `facturacion.timbrar` F-00005 | **409** en `POST /invoices` (idempotencia reintento) |
| `POST /stamp` | **no alcanzado** |
| GET XML/PDF | **no ejecutados** (aborta antes) |
| F-00001..05 | `borrador`, intactas |

## 1. Hallazgos

| ID | Sev | Hallazgo | Estado/Owner |
|---|---|---|---|
| **F-12** | P1 | `external_id` no por-factura (colisión RFC+importe) | **RESUELTO** (clave `inv:hash(orgId+invoiceId)` por-factura) |
| **F-13** | **P1** | **Reintento → 409.** La clave por-factura es estable pero en reintento Facturapi devuelve 409 ("idempotency_key ya usada") y el adaptador no recupera el draft existente (`GET /invoices?external_id=`). Bloquea `/stamp` y la validación oficial. | **SOFIA** — en 409 (o antes de POST) recuperar el draft por `external_id`, leer `verification` y continuar a `/stamp`. |
| **F-11** | P2 | `verification.errors` del draft no legible | **sigue bloqueado** por F-13 (no llega al draft) |

## 2. Validación independiente

```
set -a; . /home/frank/.config/kilo/integra.secrets.env; set +a
NODE_PATH=... node /tmp/kilo/facturapi6.cjs
```

Wire: `facturacion.timbrar` F-00005 → 409 `INVOICE_BUILD_INVALID` "Facturapi 409 en POST /invoices · La clave de idempotencia (idempotency_key) ya está siendo usada." (sanitizado). Sin `/stamp` ni GET XML/PDF. F-00005 `borrador`. 1 request.

## 3. Riesgo operativo

0 mutaciones de negocio (1× `timbrar` 409). Sin pagar/cerrar/cancelar; sin secretos; Test mode. F-00001..05 intactas.

## 4. Preparación

| Entorno | Estado |
|---|---|
| Calidad | LISTO |
| Staging | **NO_LISTO (timbrado)** — 409 reintento |
| Producción | NO_LISTO |

## 5. Handoff a ATLAS

1. Aceptar **`BLOCKED`**. F-12 resuelto; nuevo bloqueo F-13 (409 reintento).
2. **F-13** → SOFIA: en 409 de `POST /invoices` (idempotencia), hacer `GET /invoices` por `external_id` para recuperar el draft existente y continuar (`verification` → `/stamp`). Alternativa: no enviar `idempotency_key` en el body y usar sólo `external_id`/`Idempotency-Key` header.
3. Reintentar F-00005 (misma factura, sin crear nueva) tras F-13; capturar `/stamp` oficial.
4. No pagar/cerrar/cancelar hasta timbrado OK. No `DONE`/producción por GEMINI.

## 6. Autoauditoría

✅ Reintenté ÚNICAMENTE el timbrado de F-00005 (1×); no creé factura ni toqué F-00001..05. ✅ Detección wire real (409) y mensaje sanitizado; sin `/stamp`/XML-PDF/mutación. ✅ No edité código/SPEC/ADR/`PROYECTO.md`; no commit/push/deploy/delete/rollback; runner en `/tmp/kilo`; capture en `test-results/`. ✅ No imprimí key/PII. ✅ F-13 con evidencia; F-12 resuelto. ✅ No invoqué subagentes ni declaré `DONE`.

---

**QA-VERDICT (F-00005 · /stamp oficial)**: `BLOCKED` · `facturacion.timbrar` F-00005 → 409 en `POST /invoices` "La clave de idempotencia (idempotency_key) ya está siendo usada." · **no se alcanzó `/stamp`** (bloqueo previo) · sin GET XML/PDF ni mutación interna (F-00005 `borrador` intacta) · F-12 **resuelto** (clave por-factura) · **F-13 P1** (reintento 409: falta `GET /invoices` por `external_id` para recuperar draft y continuar) · F-11 sigue bloqueado · 1× timbrar (409) · evidencia `facturapi6-00-timbrar-error.png` + runner `/tmp/kilo/facturapi6.cjs` · staging `NO_LISTO (timbrado)` · producción `NO_LISTO` · handoff: resolver 409 reintento → re-timbrar F-00005.

---

# FACTURAPI TEST — FINAL · commit `a10ea77` · deployment `dosp5httn8lyaqjrwmwqzefs`

> El adaptador ahora recupera el draft tras 409 (`GET /invoices?external_id=<X>&limit=100`, match EXACTO, sin POST adicional) y continúa a `/stamp`.

## QA-VERDICT (FINAL del timbrado Facturapi Test): `PASS_WITH_WARNINGS`

**El timbrado Test culminó con éxito.** La única acción "Timbrar" sobre F-00005 devolvió **200 y la factura quedó `emitida`**, con CFDI UUID y XML/PDF persistidos; la cadena completa (409-recovery → `/stamp` → GET XML/PDF) funcionó de forma real contra Facturapi Test.

**Resultado del timbrado (wire real):**

| Campo | Valor |
|---|---|
| `facturacion.timbrar` F-00005 | **200** |
| `status` | `emitida` |
| `cfdiUuid` | `58595b60-d9e2-441c-aab6-ad1e627fbbf6` |
| `xmlFileId` | `bca9afba-1ea7-468f-99b0-fe635b737723` |
| `pdfFileId` | `b156aea4-7320-4642-9f52-d37f76401c4a` |
| Lista tras reload | F-00005 `emitida` + `cfdiUuid` (única) |

**Verificación de criterios:**
- **409 recovery funcionó**: el draft previo (`inv:hash(orgId+F-00005.id)`) se recuperó vía `GET /invoices?external_id=` y se continuó a `/stamp` (ya no devuelve el 409 al caller).
- **`POST /stamp` 2xx** → `cfdiUuid` (el UUID Test de Facturapi).
- **GET XML/PDF 2xx** → `xmlFileId` y `pdfFileId` persistidos en `files`.
- **Idempotencia / sin duplicación**: 1 único `timbrar`; reload muestra F-00005 `emitida` una sola vez; el botón "Timbrar" desaparece en `emitida` (0) y aparece "Cancel" (1) → **no hay doble timbrado posible desde la UI**.
- **Test / no SAT**: key `sk_test_*` → `livemode=false`; el UUID es del sandbox Facturapi Test, sin validez fiscal (nota abajo F-9 sobre `livemode` no expuesto en DTO).
- **No pagar, cancelar ni cerrar**: respetado (sólo 1× timbrar).

---

## 0. Estado final

| Ítem | Valor |
|---|---|
| `F-00005` | **`emitida`**, `cfdiUuid=58595b60-d9e2-441c-aab6-ad1e627fbbf6`, XML/PDF persistidos |
| `F-00001..04` | `borrador` (pre-fix, snapshots inmutables — F-8) |
| OS-00001 | `delivered`, `finalInvoiceIssued` sin verificar aún (el timbrado no cambia el flag de OS) |
| Mutaciones de la ronda | 1× `timbrar` (**200**); 0 pagos/cierres/cancelaciones |

## 1. Hallazgos — cierre

| ID | Sev | Estado |
|---|---|---|
| F-7 (RFC) | P1 | **RESUELTO** (dato reemplazado) |
| F-10 (tax_system 601) | P2 | **RESUELTO** (régimen 616 aceptado) |
| F-11 (verification ilegible) | P2 | **RESUELTO/moot** (al continuar a `/stamp`, la validación oficial ya no depende del readiness local) |
| F-12 (external_id no por-factura) | P1 | **RESUELTO** (clave `inv:hash(orgId+invoiceId)`) |
| F-13 (409 reintento) | P1 | **RESUELTO** (`GET /invoices?external_id=` con match exacto) |
| **F-14** | **P3** | **`/audit` muestra "No hay eventos para mostrar".** El código escribe `action:"factura.timbrar"` (`invoices.ts:808`) en el camino exitoso (y el timbrado devolvió 200), pero la bitácora UI está vacía → no pude confirmar la entrada por UI. Posible gap en la query de bitácora (SPEC-010), a revisar aparte. Owner **ATLAS/SOFIA**. |
| F-9 (livemode no en DTO) | P3 | sigue: `livemode=false` se infiere de la key `sk_test_*` + sandbox, no del DTO (opcional exponerlo). |
| F-8 (pre-fix no timbrables) | P3 | sigue: F-00001..04 `borrador` con snapshots inmutables; requieren reconstrucción/re-snapshot. |

## 2. Validación independiente

```
set -a; . /home/frank/.config/kilo/integra.secrets.env; set +a
NODE_PATH=... node /tmp/kilo/facturapi6.cjs          # timbrar F-00005 → 200 emitida
NODE_PATH=... node /tmp/kilo/facturapi7.cjs          # post: list/preview/audit/no-double
NODE_PATH=... node /tmp/kilo/facturapi7-audit.cjs    # audit list (vacía → F-14)
```

Wire: `timbrar` 200 → `emitida`, `cfdiUuid`, `xmlFileId`, `pdfFileId`. Preview F-00005 confirma `cfdiUuid` + `xmlFileId` + `pdfFileId`. List reload: `emitida` única. Audit UI: "No hay eventos".

## 3. Riesgo operativo

Mutaciones: 1× `timbrar` **200** (emitida). Sin pagos/cierres/cancelaciones. Sin producción/delete/rollback/código. Sin secretos. Test mode (`sk_test_*`, sin validez fiscal).

## 4. Preparación

| Entorno | Estado |
|---|---|
| Calidad | LISTO |
| Staging | **LISTO (timbrado Test)** — F-00005 emitida con UUID/XML/PDF |
| Producción | NO_LISTO (Live key + autorización pendientes) |

## 5. Handoff a ATLAS

1. Aceptar **`PASS_WITH_WARNINGS`** del timbrado Facturapi Test: cadena completa verificada (409-recovery → `/stamp` → XML/PDF → `emitida`).
2. **F-14** → revisar la bitácora `/audit` (muestra vacía) para poder confirmar `factura.timbrar` por UI.
3. **F-9** (opcional) → exponer `livemode` en DTO/auditoría.
4. **F-8** → decidir reconstruir/re-snapshot de F-00001..04 antes de facturar las OS pre-fix.
5. **Siguiente paso (por instrucción, no ejecutado):** pagos/cobranza y cierre administrativo, sólo tras el OK explícito para esa fase; la emisión ya está en Test (sin validez fiscal). No `DONE`/producción por GEMINI.

## 6. Autoauditoría

✅ Timbré F-00005 UNA sola vez; no creé factura ni toqué F-00001..05; no pagué/cerré/cancelé. ✅ Evidencia wire real (200 emitida + UUID + file IDs); reload sin duplicar. ✅ No edité código/SPEC/ADR/`PROYECTO.md`; no commit/push/deploy/delete/rollback; runners en `/tmp/kilo`; captures en `test-results/`. ✅ No imprimí key/PII (el cfdiUuid/file IDs de negocio no son secretos). ✅ Hallazgos F-7/F-10/F-11/F-12/F-13 cerrados con evidencia; F-14/F-9/F-8 documentados. ✅ Separé QA/staging/producción. ✅ No invoqué subagentes ni declaré `DONE`.

---

**QA-VERDICT (FINAL del timbrado Facturapi Test)**: `PASS_WITH_WARNINGS` · `facturacion.timbrar` F-00005 → **200 `emitida`** · `cfdiUuid=58595b60-d9e2-441c-aab6-ad1e627fbbf6` · `xmlFileId`/`pdfFileId` persistidos · 409-recovery vía `GET /invoices?external_id=` (match exacto, sin POST extra) · `/stamp` 2xx · GET XML/PDF 2xx · Test `sk_test_*` (sin validez fiscal) · reload sin duplicación (botón Timbrar ausente en emitida) · sin pagar/cancelar/cerrar · F-7/F-10/F-11/F-12/F-13 **resueltos** · warnings P3: F-14 (/audit bitácora vacía), F-9 (livemode no en DTO), F-8 (F-00001..04 borrador pre-fix) · evidencias `facturapi7-0[0-1]-*.png` + runners `/tmp/kilo/facturapi{6,7}*.cjs` · staging `LISTO (timbrado Test)` · producción `NO_LISTO` · handoff: revisar bitácora, decidir construcción pre-fix, y pagos/cierre sólo tras OK explícito.

---

# CIERRE ADMINISTRATIVO billing (pago sintético) · autorización Frank · F-00005/OS-00001

## QA-VERDICT (pago + cierre): `BLOCKED`

Verifiqué el estado de F-00005 (emitida, correcta) y **me detuve en el primer bloqueo**: **no existe un flujo de UI para registrar un pago**. El endpoint `cobranza.cobros.register` existe en backend, pero **ningún componente UI lo invoca**.

- **Criterio 1 (F-00005 emitida + saldo + UUID/XML/PDF) → PASS.** `emitida`, `totalCents=12,760,000`, `paidCents=0`, `cfdiUuid=58595b60-d9e2-441c-aab6-ad1e627fbbf6`, `xmlFileId`/`pdfFileId` persistidos.
- **Criterio 2 (registrar/aplicar pago sintético) → BLOCKED.** `cobranza.cobros.list` = 0 items; el tab "Cobros" (`CobrosList`) sólo tiene **listar / confirmar / reversar** — **no hay botón "Registrar pago"/"Nuevo cobro"**. `cobros.register` (SPEC-008 AC-1) está expuesto en el router pero sin caller en `src/modules`.
- **Criterio 3 (cierre administrativo tras saldo cero) → BLOCKED en cascada.** Sin pago no hay saldo cero; `closeAdministrative` (`orders.ts:887-903`) exige `outstandingBalanceCents=0` o `directorException=true` (`os.delivered` muestra 12,760,000 pendiente). El botón "Cerrar con excepción Director" es un camino distinto (excepción, no "después del pago") y queda fuera del alcance autorizado.
- **Criterio 4 → parcial**: sin overflow ni errores en lo alcanzable (desktop); el flujo no llega a mobile porque está bloqueado.
- **Criterio 5 → PASS**: no cancelé, no producción/Live, no delete/rollback; no inventé API.

---

## 0. Estado

| Ítem | Valor |
|---|---|
| `F-00005` | `emitida`, `totalCents=12,760,000`, `paidCents=0`, `cfdiUuid`/XML/PDF persistidos |
| `cobranza.cobros.list` | **total=0** (no hay cobros) |
| `OS-00001` | `delivered`, `soldTotalCents=12,760,000`, `finalInvoiceIssued=false` |
| Cierre administrativo | card visible: "Cerrar OS" (saldo cero exigido) + "Cerrar con excepción Director" |

## 1. Hallazgo

| ID | Sev | Hallazgo | Evidencia | Impacto | Owner | Cierre |
|---|---|---|---|---|---|---|
| **B-3** | **P1** | **SPEC-008 "Registrar cobro" sin UI.** `cobranza.cobros.register`/`confirm`/`applyPayment` existen en el router/servicio, pero no hay componente que cree un cobro: `CobrosList` sólo `list`/`confirm`/`reverse`; con `total=0` no hay fila que confirmar; no hay botón "Registrar pago". | grep de `src/modules` sin caller de `cobros.register`; UI de `/cobranza` sin botón registrar; `cobros.list` total=0 | El pago (registrar + aplicar) no puede ejecutarse desde la UI real; bloquea el cierre por saldo cero. | **ATLAS/SOFIA** — SPEC-008 | Añadir UI de registro de cobro (formulario que llame `cobros.register` con `clientId` + `amountCents` + `method` + `reference`, luego `confirm`) o exponer el flujo existente. Re-ejecutar pago + cierre. |

## 2. Validación independiente

```
set -a; . /home/frank/.config/kilo/integra.secrets.env; set +a
NODE_PATH=... node /tmp/kilo/billing2-probe.cjs
```

Wire/DOM: `facturacion.list` F-00005 emitida (paidCents=0, totalCents=12,760,000); `preview` F-00005 cfdiUuid + xml/pdf; `cobranza.cobros.list` total=0; `/cobranza` sin botón "Registrar pago"; `/ordenes-servicio/OS-00001` delivered con card "Cierre administrativo" (2 botones).

## 3. Riesgo operativo

0 mutaciones (sólo lecturas). No cancelé/producción/Live/delete/rollback; sin secretos. F-00005 sigue `emitida` sin pagar; OS-00001 `delivered` sin cerrar.

## 4. Preparación

| Entorno | Estado |
|---|---|
| Calidad | LISTO |
| Staging | **NO_LISTO (pago/cierre)** — falta UI de registro de cobro (B-3) |
| Producción | NO_LISTO |

## 5. Handoff a ATLAS

1. Aceptar **`BLOCKED`** del pago + cierre. El bloqueo es B-3 (falta UI de registro de cobro), no un dato/permiso.
2. **B-3** → ATLAS/SOFIA: dar de alta la UI de "Registrar cobro" (formulario `cobros.register`) o confirmar el flujo existente. Tras ello, el flujo es: `register` (total exacto 12,760,000) → `confirm` (aplica a F-00005 → `pagada`, `paidCents=total`) → verificar saldo cero → `closeAdministrative` (sin excepción).
3. Re-ejecutar V3 de pago + cierre una vez exista la UI.
4. No cancelar/pagar-de-más/cerrar-con-excepción; no producción/Live. No `DONE` por GEMINI.

## 6. Autoauditoría

✅ Verifiqué F-00005 emitida + saldo + UUID/XML/PDF (lectura) y detecté el bloqueo de UI (no codeé, no inventé API). ✅ 0 mutaciones; no cancelé/producción/Live/delete. ✅ No imprimí secretos/PII. ✅ B-3 con evidencia/owner/cierre. ✅ Separé QA/staging/producción. ✅ No invoqué subagentes ni declaré `DONE`.

---

**QA-VERDICT (pago + cierre)**: `BLOCKED` · criterio 1 PASS (F-00005 `emitida`, saldo 12,760,000, UUID/XML/PDF ok) · criterio 2 BLOCKED: **no hay UI de registro de cobro** (`cobranza.cobros.register` sin caller; `cobros.list`=0; sin botón "Registrar pago") — **B-3 P1** · criterio 3 BLOCKED en cascada (sin pago → sin saldo cero → `closeAdministrative` exige saldo cero) · 0 mutaciones, sin pagar/cancelar/cerrar, sin producción/Live/delete · staging `NO_LISTO (pago/cierre)` · producción `NO_LISTO` · handoff: construir UI de registro de cobro (SPEC-008) antes de re-ejecutar pago + cierre.

---

# PAGO SINTÉTICO + CIERRE · commit `e002224` · deployment `tvwpgxvu5p3ci5xmfzobzyod`

> UI "Registrar cobro" ya existe (`cobros-list.tsx`, `RegisterCobroDialog`): `register → confirm → invalidate/cierre`. Backend `cobros.register`/`confirm` preexistente.

## QA-VERDICT (pago + cierre): `PASS_WITH_WARNINGS` (pago PASS · cierre BLOCKED en B-4)

**El pago sintético E2E funcionó completo** (el incremento IMPL-37). El **cierre administrativo quedó bloqueado** por un gap de contrato backend (B-4), no por la UI.

### Pago (PASS)
| Paso | Resultado |
|---|---|
| `cobranza.cobros.register` | **200** → `paymentId=b383e711-5bdd-47ec-b163-31d903cb8a79` |
| `cobranza.cobros.confirm (applications)` | **200** → `status=confirmado`; `application ca293b14-…` → invoice F-00005, `amountCents=12,760,000` |
| Cobro en lista | 1 cobro, `method=transferencia`, `reference=TEST-FACTURAPI-20260826`, `paymentDate=2026-08-26`, `monto=12,760,000¢`, `confirmado` |
| F-00005 | **`pagada`**, `paidCents=12,760,000 = totalCents`, `cfdiUuid` conservado |
| Sin sobrepago / sin duplicar | reload: 1 cobro confirmado, F-00005 pagada única (`paidCents=total`) |
| Desktop 1280 + mobile 375 | `overflow=false`, `requestFailures=[]`, `httpErrors=[]`, `pageErrors=[]` |

### Cierre administrativo (BLOCKED en B-4)
- `closeAdministrative` ("Cerrar OS", sin excepción) → **409 `OUTSTANDING_BALANCE`** "Saldo pendiente sin excepción Director".
- **Causa raíz:** `closeAdministrative` (`orders.ts:881-890`) calcula el saldo con `advanceProvider.getAdvancePaidCents(...)` (anticipo de la cotización), **no** con el `paidCents` de la factura. La factura F-00005 está `pagada` (paidCents=total), pero el saldo de la OS sigue siendo `12,760,000` porque el proveedor de anticipo no refleja el cobro SPEC-008.
- **Bloqueo latente adicional:** `finalInvoiceIssued` permanece `false` (ningún side-effect de SPEC-007 lo pone en `true`); aun con saldo cero, el cierre fallaría con `FINAL_INVOICE_REQUIRED`.

---

## 0. Estado final (IDs reales, del wire)

| Entidad | Valor |
|---|---|
| Cobro | `b383e711-5bdd-47ec-b163-31d903cb8a79` (confirmado, $127,600.00, transferencia) |
| Aplicación | `ca293b14-1477-474a-b575-6472847a38f1` → F-00005, 12,760,000¢ |
| F-00005 | `pagada`, `paidCents=12,760,000`, `cfdiUuid=58595b60-d9e2-441c-aab6-ad1e627fbbf6` |
| OS-00001 | `delivered` (sin cerrar), `soldTotalCents=12,760,000`, `finalInvoiceIssued=false` |
| clientId / invoiceId | `ce834a67-…` / `e4827b7c-…` (obtenidos del wire, no inventados) |

## 1. Hallazgos

| ID | Sev | Hallazgo | Owner | Cierre |
|---|---|---|---|---|
| **B-3** | P1 | UI registro de cobro inexistente | **RESUELTO** (IMPL-37) |
| **B-4** | **P1** | **Cierre administrativo no reconcilia pago SPEC-008 con saldo OS.** `closeAdministrative` lee el saldo del `advanceProvider` (anticipo de cotización), no del `paidCents` de la factura. Factura `pagada` ⇒ saldo OS sigue `12,760,000` ⇒ 409 `OUTSTANDING_BALANCE`. Adicionalmente `finalInvoiceIssued` nunca se activa (`FINAL_INVOICE_REQUIRED` latente). | **ATLAS** (SPEC-004↔007↔008) | Definir la fuente de saldo de cierre (pagos SPEc-008 vs anticipo) y el side-effect `finalInvoiceIssued=true` al timbrar/emitir. Re-ejecutar cierre tras reconciliar. |

## 2. Validación independiente

```
set -a; . /home/frank/.config/kilo/integra.secrets.env; set +a
NODE_PATH=... node /tmp/kilo/billing3-payment.cjs   # desktop: register+confirm, F-00005 pagada, cierre 409
NODE_PATH=... node /tmp/kilo/billing3-mobile.cjs    # mobile: pagada + overflow/errors
```

Wire: register 200 → confirm 200 (confirmado + application) → F-00005 `pagada` (`paidCents=total`) → reload sin duplicar → `closeAdministrative` 409 `OUTSTANDING_BALANCE`. Mobile: `pagada` + `overflow=false` + 0 errors.

## 3. Riesgo operativo

Mutaciones: 1× `cobros.register` (200) + 1× `cobros.confirm` (200, aplica a F-00005) + 1× `closeAdministrative` (409, sin cambio de estado). **No** cancelé/reversé/producción/Live/delete. Sin secretos. La factura F-00005 queda `pagada` (Test, sin validez fiscal); la OS `delivered` (sin cerrar).

## 4. Preparación

| Entorno | Estado |
|---|---|
| Calidad | LISTO |
| Staging | **LISTO (pago) / NO_LISTO (cierre)** — pago completo; cierre bloqueado por B-4 |
| Producción | NO_LISTO |

## 5. Handoff a ATLAS

1. Aceptar **`PASS_WITH_WARNINGS`** del pago (IMPL-37 UI cobro verificado E2E) y **B-4** (cierre no reconcilia saldo SPEC-008).
2. **B-4** → ATLAS: decidir la fuente de saldo del cierre (pagos SPEc-008 vs anticipo) y el side-effect `finalInvoiceIssued=true`; luego SOFIA implementa. Re-ejecutar cierre tras reconciliar.
3. No cancelar/reversar/producción/Live hasta el OK explícito de Frank para esa fase. No `DONE` por GEMINI.

## 6. Autoauditoría

✅ Obtuve UUIDs reales del wire (no inventé); registré/confirmé UNA vez; no sobrepagué ni dupliqué. ✅ Verifiqué pagada + paidCents=total + reload + desktop/mobile sin overflow/errors. ✅ Detecté y reporté el bloqueo de cierre con evidencia (409 + código). ✅ No edité código/SPEC/ADR/`PROYECTO.md`; no cancelé/producción/Live/delete/rollback; runners en `/tmp/kilo`; captures en `test-results/`. ✅ No imprimí secretos/PII (IDs de negocio). ✅ B-3 cerrado, B-4 nuevo con evidencia. ✅ No invoqué subagentes ni declaré `DONE`.

---

**QA-VERDICT (pago + cierre)**: `PASS_WITH_WARNINGS` · **pago PASS** (`cobros.register` 200 → `cobros.confirm` 200 → F-00005 `pagada` `paidCents=12,760,000=total`, cobro `confirmado`, sin sobrepago ni duplicación, desktop+mobile overflow=false/0 errors) · **cierre BLOCKED** (`closeAdministrative` 409 `OUTSTANDING_BALANCE`: el saldo se lee del anticipo y no refleja el pago SPEC-008; `finalInvoiceIssued=false` latente → **B-4 P1**) · IDs: cobro `b383e711-…`, aplicación `ca293b14-…`, F-00005 `pagada` (cfdiUuid conservado), OS-00001 `delivered` · staging `LISTO (pago) / NO_LISTO (cierre)` · producción `NO_LISTO` · handoff: reconciliar fuente de saldo + `finalInvoiceIssued` → re-ejecutar cierre.

---

# CIERRE ADMINISTRATIVO (truncado) · commit `3b0f4d4` · deployment `dvobpzi1cjgm4redjydpbaza`

> Fix B-4: `closeAdministrative` ya calcula el saldo desde `paidCents` de las facturas de la OS (no anticipo); `timbrar` marca `orders.finalInvoiceIssued=true` (side-effect, idempotente). Turno autónomo autorizado por Frank.

## QA-VERDICT (cierre tras fix B-4): `BLOCKED`

El **saldo ya es cero** (la parte de saldo de B-4 está resuelta), pero el cierre se detiene en el **segundo** requisito: `finalInvoiceIssued=false`, que quedó **stale** porque F-00005 fue timbrada **antes** de que existiera el side-effect.

- **Lectura (criterio 1):** F-00005 `pagada` (`paidCents=12,760,000=total`), cobro `confirmado`, `finalInvoiceIssued=false` (no `true` como se esperaba), saldo OS = 0 (por el nuevo cálculo).
- **`closeAdministrative` ("Cerrar OS", sin excepción, 1 único intento) → 409 `FINAL_INVOICE_REQUIRED`** "Factura final no emitida".
- OS-00001 sigue `delivered` (sin cerrar), `closedBalanceCents` sin setear; el flag `finalInvoiceIssued` no cambió.

**Causa raíz exacta:** el side-effect `finalInvoiceIssued=true` (IMPL-38, `invoices.ts`) **sólo se ejecuta en `timbrar`**. F-00005 fue timbrada en el round `a10ea77` (anterior a este deploy); por tanto su timbrado no disparó el side-effect y el flag quedó `false`. No hay backfill para facturas ya `emitida`/`pagada` anteriores al deploy. El saldo ya reconcilia (`totalPaidCents=12,760,000`), y por eso el error pasó de `OUTSTANDING_BALANCE` a `FINAL_INVOICE_REQUIRED`.

---

## 0. Estado

| Entidad | Valor |
|---|---|
| F-00005 | `pagada`, `paidCents=12,760,000`, `cfdiUuid` conservado |
| Cobro | `b383e711-…` `confirmado` ($127,600.00) |
| OS-00001 | `delivered`, `finalInvoiceIssued=false`, saldo efectivo 0 (cálculo nuevo) |
| `closeAdministrative` | 409 `FINAL_INVOICE_REQUIRED` |

## 1. Hallazgos

| ID | Sev | Hallazgo | Estado | Owner | Cierre |
|---|---|---|---|---|---|
| B-4 (saldo) | P1 | Saldo de cierre desde anticipo (fuera de reconcilación) | **RESUELTO** (saldo desde `paidCents`; ya no hay `OUTSTANDING_BALANCE`) | ATLAS/SOFIA | ✓ |
| B-4 (`finalInvoiceIssued`) | P1 | `finalInvoiceIssued` nunca se activaba | **RESUELTO para timbrados POST-deploy** (side-effect en `timbrar`) | ATLAS/SOFIA | ✓ |
| **B-5** | **P1** | **No hay backfill para facturas timbradas ANTES del deploy.** El side-effect es unidireccional (sólo al timbrar); F-00005 (emitida→pagada en `a10ea77`) dejó `finalInvoiceIssued=false` → cierre 409 `FINAL_INVOICE_REQUIRED`. | wire 409 + byId `finalInvoiceIssued=false` + código (`timbrar` marca el flag, sin backfill) | Bloquea el cierre de OS con facturas ya emitidas pre-deploy. | **ATLAS** (decisión de datos) | Backfill idempotente: `UPDATE orders SET finalInvoiceIssued=true WHERE id IN (SELECT orderId FROM invoices WHERE status IN ('emitida','pagada') ...)` (o re-emisión del side-effect). Re-ejecutar cierre. |

## 2. Validación independiente

```
set -a; . /home/frank/.config/kilo/integra.secrets.env; set +a
NODE_PATH=... node /tmp/kilo/billing4-probe.cjs   # read-only: F-00005 pagada, cobro confirmado, finalInvoiceIssued=false
NODE_PATH=... node /tmp/kilo/billing4-close.cjs   # closeAdministrative 1× → 409 FINAL_INVOICE_REQUIRED
```

Wire: byId `finalInvoiceIssued=false` + saldo 0; F-00005 `pagada`; close 409 `FINAL_INVOICE_REQUIRED` "Factura final no emitida". Sin cambio de estado.

## 3. Riesgo operativo

Mutaciones: 1× `closeAdministrative` (409, sin cambio de estado). **No** cancelé/reversé/pagué/timbré/producción. Sin secretos. F-00005 `pagada` (Test), OS `delivered`.

## 4. Preparación

| Entorno | Estado |
|---|---|
| Calidad | LISTO |
| Staging | **NO_LISTO (cierre)** — saldo OK, `finalInvoiceIssued` stale (B-5) |
| Producción | NO_LISTO |

## 5. Handoff a ATLAS

1. Aceptar **`BLOCKED`** del cierre: el saldo ya reconcília (B-4 saldo resuelto), pero falta backfill de `finalInvoiceIssued` (B-5).
2. **B-5** → ATLAS: backfill idempotente `finalInvoiceIssued=true` para OS con factura `emitida`/`pagada` (autorizado por Frank). Luego re-ejecutar `closeAdministrative` (sin excepción).
3. No cancelar/reversar/pagar/timbrar/producción. No `DONE` por GEMINI.

## 6. Autoauditoría

✅ Leí estado real (byId/list/cobros) y ejecuté `closeAdministrative` UNA sola vez; no reintenté ciegamente. ✅ Detecté el bloqueo exacto (409 FINAL_INVOICE_REQUIRED) y lo correlacioné con el código (side-effect sin backfill). ✅ No edité código/SPEC/ADR/`PROYECTO.md`; no cancelé/producción/Live/delete; runners en `/tmp/kilo`; captures en `test-results/`. ✅ No imprimí secretos/PII. ✅ B-4 saldo resuelto, B-5 nuevo con evidencia. ✅ No invoqué subagentes ni declaré `DONE`.

---

**QA-VERDICT (cierre tras fix B-4)**: `BLOCKED` · saldo cero **confirmado** (B-4-saldo resuelto; el error dejó de ser `OUTSTANDING_BALANCE`) · `closeAdministrative` (sin excepción, 1×) → **409 `FINAL_INVOICE_REQUIRED`** "Factura final no emitida" · causa: `finalInvoiceIssued=false` **stale** (F-00005 timbrada pre-deploy, sin backfill del side-effect) — **B-5 P1** · OS-00001 `delivered` (sin cerrar) · F-00005 `pagada`, cobro `b383e711-…` confirmado · evidencia `billing4-00-close.png` + runners `/tmp/kilo/billing4-{probe,close}.cjs` · staging `NO_LISTO (cierre)` · producción `NO_LISTO` · handoff: backfill `finalInvoiceIssued=true` → re-ejecutar cierre.

---

# GATE FINAL DE CIERRE · commit `9493ecf` · deployment `faymoapwdyllwrx4z9zhpnsc`

> B-5 resuelto: `closeAdministrative` backfillea `finalInvoiceIssued=true` en la misma transacción si existe factura de la OS con status válido (`pagada`), y cierra.

## QA-VERDICT (gate final de cierre): `PASS_WITH_WARNINGS`

**El cierre administrativo culminó correctamente.** La cadena billing quedó completa de extremo a extremo en staging (Test, sin validez fiscal):

```
Factura borrador → emitida (timbrado Facturapi Test) → pagada (cobro) → closed (cierre administrativo)
```

| Verificación | Resultado |
|---|---|
| Lectura previa | F-00005 `pagada`, cobro `confirmado`, OS-00001 `delivered`, `finalInvoiceIssued=false` |
| `closeAdministrative` ("Cerrar OS", sin excepción, 1×) | **200** → `status=closed`, `closedBalanceCents=0`, `closedAt=2026-08-26T08:34:00.862Z`, `closedDirectorException=false`, **`finalInvoiceIssued=true`** (backfill) |
| Reload desktop 1280 | OS `closed` (persistido), botón "Cerrar OS" **ausente**, card "Cierre administrativo" oculta |
| Reload mobile 375 | OS `closed`, botón ausente, `overflow=false` |
| Errores | `consoleErrors=[]`, `requestFailures=[]`, `httpErrors=[]`, `pageErrors=[]` |
| Segundo click | ausente (botón desaparecido) — no muta |

**Estado final (IDs reales del wire):**
- OS-00001: `closed`, `closedBalanceCents=0`, `finalInvoiceIssued=true`, `closedDirectorException=false`.
- F-00005: `pagada`, `paidCents=12,760,000=total`, `cfdiUuid=58595b60-…`, XML/PDF persistidos.
- Cobro: `b383e711-…` `confirmado`.

**Nota de auditoría:** el cierre escribe `os.final_invoice_issued` (source `backfill_on_close`) y `os.closed` en el audit log (código `orders.ts:944-963` y `:1027-1033`, en el camino exitoso). La **confirmación por UI queda pendiente**: la bitácora `/audit` sigue mostrando "No hay eventos" (F-14, P3, gap de SPEC-010 de lectura, no del cierre).

---

## 0. Resumen de la cadena billing completa (staging, Test)

| Paso | Estado final |
|---|---|
| F-00005 | `emitida` → `pagada` (`paidCents=total`), UUID + XML/PDF |
| Cobro | `confirmado`, aplicación total `ca293b14-…` |
| OS-00001 | `delivered` → `closed` (`closedBalanceCents=0`) |

## 1. Hallazgos (cierre)

| ID | Sev | Estado |
|---|---|---|
| B-4 (saldo) | P1 | **RESUELTO** (saldo desde `paidCents`) |
| B-4 (`finalInvoiceIssued` side-effect) | P1 | **RESUELTO** (side-effect en `timbrar`) |
| B-5 (backfill pre-deploy) | P1 | **RESUELTO** (backfill en `closeAdministrative`; verificado: `false → true` en el cierre) |
| **F-14** | **P3** | persiste: bitácora `/audit` vacía ("No hay eventos") — no permite confirmar `os.closed`/`os.final_invoice_issued` por UI (escritura verificada por código + cierre 200). Owner **ATLAS/SOFIA** (SPEC-010 lectura). |

## 2. Validación independiente

```
set -a; . /home/frank/.config/kilo/integra.secrets.env; set +a
NODE_PATH=... node /tmp/kilo/billing5-close.cjs    # desktop: cierre 200 + reload
NODE_PATH=... node /tmp/kilo/billing5-mobile.cjs   # mobile: closed + overflow/errors
NODE_PATH=... node /tmp/kilo/billing5-audit.cjs    # audit UI (vacía → F-14)
```

Wire: `closeAdministrative` 200 → `closed`/`closedBalanceCents=0`/`finalInvoiceIssued=true`; reload desktop y mobile confirman persistencia y ausencia del botón; 0 errors; `overflow=false`.

## 3. Riesgo operativo

Mutaciones: 1× `closeAdministrative` (200, cierre). **No** cancelé/reversé/pagué/timbré/producción. Sin secretos. Todo en Test (`sk_test_*`, sin validez fiscal).

## 4. Preparación

| Entorno | Estado |
|---|---|
| Calidad | LISTO |
| Staging | **LISTO (billing completo)** — emisión + pago + cierre Test verificados |
| Producción | NO_LISTO (Live + autorización pendientes) |

## 5. Handoff a ATLAS

1. Aceptar **`PASS_WITH_WARNINGS`** del gate final de cierre: la cadena billing está completa en staging (Test).
2. **F-14** → ATLAS/SOFIA: revisar la lectura de bitácora (`/audit` vacía) para poder confirmar `os.closed`/`os.final_invoice_issued` por UI.
3. Siguientes fases (cancelación/reembolso, producción Live) requieren autorización explícita aparte. No `DONE`/producción por GEMINI.

## 6. Autoauditoría

✅ Leí estado real previo y ejecuté `closeAdministrative` UNA sola vez (sin reintento). ✅ Verifiqué 200→closed + saldo 0 + `finalInvoiceIssued=true` (backfill) + reload desktop/mobile + botón ausente + 0 errors + overflow false. ✅ No edité código/SPEC/ADR/`PROYECTO.md`; no cancelé/reversé/pagué/timbré/producción/delete; runners en `/tmp/kilo`; captures en `test-results/`. ✅ No imprimí secretos/PII. ✅ B-5 resuelto con evidencia; F-14 persistente documentado. ✅ No invoqué subagentes ni declaré `DONE`.

---

**QA-VERDICT (gate final de cierre)**: `PASS_WITH_WARNINGS` · `closeAdministrative` ("Cerrar OS", sin excepción, 1×) → **200 `closed`** · `closedBalanceCents=0` · **`finalInvoiceIssued=true`** (backfill B-5 verificado) · OS-00001 `delivered → closed` (persistido), F-00005 `pagada` (cfdiUuid/XML/PDF), cobro `b383e711-…` confirmado · reload desktop/mobile: botón ausente, 0 errors, `overflow=false` · warning P3: F-14 (bitácora `/audit` vacía) · evidencias `billing5-0[0-1]-*.png` + runners `/tmp/kilo/billing5-{close,mobile,audit}.cjs` · **cadena billing completa en staging (Test)**: borrador → emitida → pagada → closed · staging `LISTO (billing completo)` · producción `NO_LISTO`.