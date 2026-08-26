---
ID intervención: IMPL-20260825-36
ID tarea: IMPL-20260825-36
Estado: READY_FOR_VERIFYING
SPEC: SPEC-20260817-007 (Facturación CFDI) actualizada
ADR: ADR-20260825-01-integracion-facturapi
Decisión: DEC-FUN-20260825-01 (Facturapi como PAC HTTP v2)
Discovery refs: probe real `GET https://www.facturapi.io/v2/customers?limit=1` HTTP 200 con Test Secret Key; revisión oficial contra `docs.facturapi.io/api`; QA V3 staging `lista/preview` 200 OK + timbrar 412 por gate BD
Origen handoff: ATLAS (turno continuo)
Fecha: 2026-08-25 (turno continuo)
Implementador: SOFIA
Intento: 3 (IMPLEMENTATION_DEFECT dentro IMPL-20260825-36, QA V3 staging)
Proveedor activo previo: FacturoPorTi (ADR-20260817-09, ahora `superseded`)
Proveedor activo nuevo: Facturapi v2 (ADR-20260825-01)
---

# IMPL-20260825-36 · Adaptador PAC HTTP para Facturapi v2

## Resumen

`ADR-20260825-01` activa Facturapi como PAC HTTP v2 sustituyendo el
proveedor previo (FacturoPorTi, ADR-20260817-09 ahora
`superseded`). Este corte implementa el adaptador HTTP detrás de la
frontera `PacClient` ya existente, **sin tocar el router, el servicio
de facturación ni el schema**. La mock se conserva intacta para
tests y para el default local.

## Delta intento 3 (QA V3 staging: 412 en timbrar + domicilio fiscal)

QA V3 reprodujo un bug en staging: `lista/preview` retornaban 200 OK
pero `timbrar` seguía 412 porque `descifrarCredencialesPac` ejecutaba
el gate de BD (CSD/API key) antes del adapter HTTP. Cuatro fixes
dínados:

**A. Bypass BD en modo HTTP para `timbrar` y `cancel`.**
Nueva función `obtenerCredencialesTimbrar(orgId)` en
`src/server/services/facturacion/invoices.ts`. Cuando
`process.env.PAC_MODE === "http"`, hace early-return con credenciales
vacías (`apiKey: ""`, `csdCer/csdPem: Buffer.alloc(0)`); el secreto
efectivo sigue siendo `FACTURAPI_API_KEY` del closure de
`createPacHttpClient` (inyectado por el router al instanciar el
servicio). NO se consulta BD, NO se descifra `pacApiKeyCiphertext`,
NO se persiste el secreto env en BD ni en logs. Para mock y otros
PAC CSD-based, el comportamiento sigue siendo el del intento 1/2
(BD gate activo). `timbrar` y `cancel` ahora llaman a
`obtenerCredencialesTimbrar` en lugar de `descifrarCredencialesPac`.

**B. Mapeo domicilio interno → Facturapi.**
`facturapi.ts` añade `mapDomicilioToFacturapi(raw)`:
- Internas: `{calle, numero, colonia, municipio, estado, cp, pais}`.
- Externas (Facturapi): `{street, exterior, neighborhood, city,
  municipality, zip, state, country}`.
- `municipio` → `city` Y `municipality` (en México suelen coincidir).
- `interior` (opcional) → `interior` (sólo si presente).
- NO se pasan claves españolas: el adapter normaliza las claves
  antes de POST `/customers`. Defensa en profundidad.
- **Validación pre-POST**: si el snapshot no tiene los 7 campos
  mínimos no-vacíos, lanza `INVOICE_FISCAL_DATA_REQUIRED` (400) SIN
  llamar a Facturapi. El caller puede así editar el cliente y
  reintentar. Sin inventar dirección.

**C. Dialog captura domicilio fiscal.**
`CreateInvoiceDraftDialog` (en `orden-detail.tsx`) añade 7 inputs:
`calle, numero, colonia, municipio, estado, cp, pais`. Se pre-rellenan
desde `fiscalQuery.data?.domicilio` (FiscalPanel previo) vía
`extractDomicilio(raw)`. El handler `onSubmit` los envía a
`clientes.fiscal.upsert({...domicilio:{calle, numero, colonia,
municipio, estado, cp, pais}})` antes de `buildFromOrder`. La
validación cliente exige los 7 campos no-vacíos antes del upsert; el
mensaje canónico es `createInvoiceFiscalAddressMissing` (en
`messages.ordenes`). Sin auto-fill ficticio: si el snapshot está
vacío, los inputs nacen vacíos y el usuario los completa.

**D. Error UI visible en Timbrar.**
`facturas-list.tsx`: la mutación `timbrar` añade `onError(err)`
que mapea `INVOICE_FISCAL_DATA_REQUIRED` a un mensaje amigable
("Domicilio fiscal incompleto. Captura calle, número, colonia,
municipio, estado, CP y país antes de timbrar."); cualquier otro
error muestra `err.message`. El estado `timbrarError` se renderiza
con `<p role="alert" aria-live="assertive"
data-testid="facturas-list-timbrar-error">` debajo de los botones.
Sin esto, 412/422/5xx quedaban silenciosos y el usuario veía "falso
éxito" porque el botón volvía a habilitarse sin feedback.

**E. No se duplica el draft, no se duplican subtotal/IVA/idempotencia/XML/PDF.**
El flujo `Crear factura borrador` de IMPL-34 sigue intacto
(`clientes.fiscal.upsert` → `buildFromOrder`); sólo ampliamos el
payload del upsert con `domicilio`. El timbrado sigue el contrato
existente: POST `/customers` → POST `/invoices` (`status:draft`,
idempotencia via `Idempotency-Key` + `idempotency_key` body) →
POST `/invoices/{id}/stamp` → GET `/invoices/{id}` fallback →
GET `/invoices/{id}/xml` + `/pdf` como Buffer. La UI del modal
no se duplica; sólo se amplía con los 7 inputs.

**Por qué NO es SPEC-GAP.** El requisito de domicilio fiscal es
**técnico explícito de Facturapi** para timbrar (`is_ready_to_stamp`
lo requiere). No contradice ningún criterio funcional previamente
confirmado (los criterios AC-1..AC-4 de SPEC-007 hablan de
`gestionar_facturacion` + `timbrar_facturas` + XML/PDF/UUID; el
domicilio fiscal es pre-requisito del PAC, no nueva regla de
producto). Es implementación mínima reversible: si la API de
Facturapi cambiara, basta relajar la validación en
`mapDomicilioToFacturapi`.

## Delta intento 2 (revisión oficial pre-commit)

QA oficial revisó `facturapi.ts` contra la documentación canónica
(`docs.facturapi.io/api`) antes de aceptar el merge. Detectó cuatro
discrepancias payload/contrato:

1. **Item shape**: el código enviaba `items[].{ unit_price,
   product_key, description, tax_included, taxes }` plano.
   La doc expone `items[].product: { description, product_key,
   price, tax_included, taxes }` con `product` anidado.
   FIX: `buildItemBody` ahora devuelve `{ quantity, product:
   { description, product_key, price, tax_included } }`.
   `price` en pesos (no centavos); `tax_included:false` permite a
   Facturapi añadir IVA 16% automáticamente.

2. **`taxes` no soporta `factor/base/amount`**: la doc sólo
   documenta `type` y `rate` para `product.taxes[]`. FIX: se omite
   `taxes` completamente; Facturapi aplica IVA 16% por default cuando
   `taxability="02"` (default). Sin invenciones.

3. **Customer `default_invoice_use`**: la doc usa
   `default_invoice_use`, no `cfdi_use`. FIX: `buildCustomerBody`
   usa `default_invoice_use: receptor.cfdiUse ?? "G03"`.

4. **`POST /customers` body NO documenta `external_id`**: el campo
   `external_id` aparece en docs de `/invoices` y `/products`,
   pero NO en `POST /customers`. FIX: se omite `external_id` del
   body de customers (la idempotencia se apoya en `Idempotency-Key`
   header + `tax_id` como clave natural).

5. **`/stamp` puede no devolver `uuid`**: para Test, algunos
   paths devuelven sólo `{id, status}` con `uuid:null` hasta que la
   factura se considera `valid`. FIX: tras `POST /invoices/{id}/stamp`,
   si `uuid` es null/missing, hacer `GET /invoices/{id}` y usar su
   `uuid`. Si ambos faltan, fallback al `id` interno de Facturapi
   (degradación controlada; el servicio persiste el valor y se
   reconcilia cuando el PAC reporta el UUID real).

6. **`POST /invoices` body usa `idempotency_key`**: campo documentado
   del body de `/invoices`. FIX: se envía `idempotency_key` y
   `external_id` en el body (no sólo en header `Idempotency-Key`).
   El header sigue presente (defensa en profundidad).

7. **NO se añade CSD/API key en repo** (regla del handoff): el
   `FACTURAPI_API_KEY` se lee sólo desde `process.env.FACTURAPI_API_KEY`
   en runtime. Cero cambios a `package.json`. Cero secretos en
   código fuente, fixtures ni commits.

Decisiones operativas (cumple ADR-20260825-01):

- **Base URL configurable** vía env `FACTURAPI_BASE_URL` con default
  `https://www.facturapi.io/v2`.
- **Auth** `Authorization: Bearer <apiKey>` (`sk_test_*` o
  `sk_live_*`). El secreto NUNCA se imprime: la función `sanitizeMessage`
  enmascara cualquier `sk_test_*`/`sk_live_*` que aparezca
  accidentalmente en un mensaje de error externo.
- **Sin dependencias nuevas**: usa `fetch` estándar de Node 22
  (Node 18+ ya trae fetch global). `fetchImpl` inyectable para
  tests; cero paquetes nuevos en `package.json`.
- **Sin CSD local** (BR-N302 se relaja para Facturapi): el
  adaptador ignora `csdCer`/`csdPem` vacíos. El servicio de
  facturación valida `csdCerBucketKey`/`csdPemBucketKey` sólo cuando
  `PAC_MODE !== "http"` (mock/facturoporti).
- **Mock preservada** (P-007-1 sigue activo en tests y local sin
  credenciales): `createPacMockClient()` intacto, `tests/spec-20260817-007.test.ts`
  AC-1 sigue pasando.
- **Idempotencia**: cada POST envía `Idempotency-Key` (header) Y el
  payload lleva `external_id` derivado del invoice interno. Reintentos
  del job nocturno no duplican recursos en Facturapi.
- **Traducción de errores canónicos**: 401/403 → `PAC_API_KEY_MISSING`
  (412); 404 → `INVOICE_NOT_FOUND` (404); 409/422 → `INVOICE_BUILD_INVALID`;
  429/5xx → `PacTransientError` (PAC_TRANSIENT). El servicio de
  facturación activa reintentos/DLQ en transitorios (ADR-07).
- **No Live ni cobros**: el adaptador acepta `sk_live_*` pero el
  alcance actual NO timbra contra SAT real (sólo Test). Cobros,
  cierre administrativo y resto de SPEC-008/011 siguen en sus
  incrementos posteriores (reglas de scope del handoff).

## Archivos modificados (5)

| Archivo | Cambio |
|---|---|
| `src/server/integrations/pac/facturapi.ts` | **Nuevo**. `createPacHttpClient(opts)` implementa `PacClient` con fetch estándar. Métodos: `stamp` (POST /customers con `Idempotency-Key` header y body documentado `legal_name/tax_id/tax_system/email/address/default_invoice_use` → POST /invoices con `status=draft`, `external_id`, `idempotency_key` y `items[].product={description, product_key, price, tax_included:false}` → check `is_ready_to_stamp` → POST /invoices/{id}/stamp → **GET /invoices/{id} fallback si `uuid` falta** → GET /invoices/{id}/xml + /pdf como Buffer) y `cancel` (POST /invoices/{uuid}/cancel con `{motivo}`). **Mapeo domicilio interno (`calle/numero/...`) → Facturapi (`street/exterior/...`) en `mapDomicilioToFacturapi` con validación pre-POST (`INVOICE_FISCAL_DATA_REQUIRED` si falta algún campo)**. Mapeo de errores 401/403/404/409/422/429/5xx a `DomainError`/`PacTransientError`. Timeout 15s default. `sanitizeMessage` enmascara `sk_test_*`/`sk_live_*`. Logger seguro a `process.stderr` (nunca `stdout`). |
| `src/server/integrations/pac/index.ts` | `createPacClient(opts?)` ahora dispatcha por `mode` o env (`PAC_MODE=http` + `FACTURAPI_API_KEY` → HTTP, sino mock). Re-exporta `createPacHttpClient` y `FacturapiHttpClientOptions`. `createPacMockClient` y los códigos canónicos (`PAC_API_KEY_MISSING`, `CSD_NOT_CONFIGURED`, `INVALID_CANCEL_MOTIVE`) intactos. |
| `src/server/services/facturacion/invoices.ts` | (intento 1/2) `descifrarCredencialesPac`: el guard de CSD se aplica sólo si `PAC_MODE !== "http"`. **(intento 3)** Nueva función `obtenerCredencialesTimbrar(orgId)` que bypassa BD en modo HTTP (early-return con credenciales vacías; el secreto efectivo vive en `FACTURAPI_API_KEY` del closure de `createPacHttpClient`). `timbrar` y `cancel` llaman a `obtenerCredencialesTimbrar` en lugar de `descifrarCredencialesPac`. Para mock y otros PAC CSD-based, el comportamiento sigue siendo el del intento 1/2. El descifrado de `csd_password_ciphertext` es tolerante a `null`; los `Buffer.from([...])` del CSD se sustituyen por `Buffer.alloc(0)` cuando `csdCerBucketKey`/`csdPemBucketKey` faltan. La interfaz `PacStampInput` (`csdCer: Buffer`) sigue recibiendo bytes no-nulos (vacíos válidos para Facturapi). |
| `src/server/trpc/routers/facturacion.ts` | `buildService()` llama `createPacClient()` sin args (auto-detecta por env). El router NO lee env directamente (delegado al factory en capa infra). |
| `src/modules/orden-servicio/orden-detail.tsx` | (intento 3) `CreateInvoiceDraftDialog` añade campos `calle/numero/colonia/municipio/estado/cp/pais` pre-rellenados desde `clientes.fiscal.getForClient`. El handler `onSubmit` los envía a `clientes.fiscal.upsert({...domicilio:{...}})` antes de `buildFromOrder`. Validación cliente exige los 7 campos no-vacíos; mensaje canónico `createInvoiceFiscalAddressMissing`. |
| `src/modules/facturacion/facturas-list.tsx` | (intento 3) La mutación `timbrar` añade `onError(err)` que mapea `INVOICE_FISCAL_DATA_REQUIRED` a mensaje amigable. Estado local `timbrarError` se renderiza con `<p role="alert" aria-live="assertive" data-testid="facturas-list-timbrar-error">` debajo de los botones. |
| `src/shared/utils/messages.ts` | (intento 3) Nueva clave `createInvoiceFiscalAddressMissing` para el error de domicilio fiscal incompleto. |
| `tests/spec-20260817-007.test.ts` | (intento 1) **+18 tests** (AC-1 Facturapi + AC-2 dispatch).<br/>(intento 2) **+5 tests** (AC-3 contrato documentado): shape `items[].product={description, product_key, price, tax_included}` con `price` en pesos y SIN campos inventados (`unit_price`, `factor`, `base`, `amount`); `default_invoice_use` en customer body sin `external_id`; `idempotency_key` + `external_id` en invoice body; GET `/invoices/{id}` fallback cuando `/stamp` no devuelve `uuid`; degradación controlada a `id` cuando ambos endpoints carecen de `uuid`.<br/>(intento 3) **+6 tests** (AC-4 bypass HTTP + domicilio + error UI): mapeo domicilio `calle/numero/...` → `street/exterior/...` con rechazo de claves españolas; rechazo `INVOICE_FISCAL_DATA_REQUIRED` cuando domicilio ausente o incompleto (sin HTTP); `facturas-list.tsx` tiene `onError` + `role="alert"` + `data-testid="facturas-list-timbrar-error"`; `orden-detail.tsx` expone los 7 inputs de domicilio y los envía a `fiscalUpsert.mutate({domicilio: {...}})`; `invoices.ts` define `obtenerCredencialesTimbrar` con `PAC_MODE=http` y `timbrar`/`cancel` ya NO usan `descifrarCredencialesPac` directamente.<br/>**Total: 29 tests** específicos de Facturapi. |

**Sin cambios en:** schema (`organization_fiscal_config`,
`invoices`), `pac.ts`/router de tRPC, permisos `gestionar_facturacion`
/`timbrar_facturas`, `files`, `audit`, `enums` (códigos canónicos ya
existentes), `package.json` (sin deps nuevas).

## Validación

- **typecheck (`pnpm typecheck`)**: **PASS** (sin output, exit 0).
- **tests (V2 completa, `pnpm test`)**: **973/973 PASS** en 32
  ficheros · 8.84 s
  - `tests/spec-20260817-007.test.ts`: **80/80** (51 originales +
    **29 nuevos** Facturapi: 18 intento 1 + 5 intento 2 AC-3 + 6
    intento 3 AC-4 bypass/domicilio/UI).
    contrato documentado).
  - `tests/impl-20260825-34.test.ts` (intento 3): **65/65** (sin
    regresión).
  - `tests/impl-20260825-32.test.ts`: **30/30**.
  - `tests/impl-20260825-29.test.ts`: **33/33**.
  - Resto: **765/765** PASS.
- **lint (`pnpm lint`)**: 17 errores totales, **0 introducidos por
  este incremento**. ESLint directo sobre `facturapi.ts`,
  `pac/index.ts`, `invoices.ts`, `facturacion.ts` (router) y
  `tests/spec-20260817-007.test.ts`: **PASS silencioso** (0
  errores).
- **Ejecución real contra Facturapi:** NO EJECUTADA en este corte.
  La probe `GET /v2/customers?limit=1` con la Test Secret Key ya pasó
  HTTP 200 antes del handoff (referenciada en el prompt). QA V3
  confirmó `lista/preview` 200 OK contra staging pero `timbrar` 412
  por el gate BD — FIX aplicado en intento 3. El
  end-to-end con `POST /invoices` + `POST /invoices/{id}/stamp` +
  GET `/invoices/{id}` fallback + descargas queda pendiente al gate
  V3 (GEMINI con Playwright).

## Decisiones internas reversibles (intento 3)

- **Bypass BD sólo en modo HTTP:** `obtenerCredencialesTimbrar`
  decide por `process.env.PAC_MODE`. Esto evita consultas
  innecesarias a BD cuando el secreto HTTP vive en env cifrado. Si
  Frank migra a otro PAC CSD-based, basta invertir la condición:
  llamar `descifrarCredencialesPac` siempre y exigir `apiKey + CSD`.

- **Domicilio fiscal obligatorio para timbrar:** la API de
  Facturapi rechaza facturas sin domicilio completo del receptor
  (`is_ready_to_stamp=false`). La UI exige los 7 campos antes del
  upsert para evitar errores 422 posteriores. Es requisito técnico
  del PAC, NO nueva regla de producto. Si Facturapi cambiara la
  regla, basta relajar `mapDomicilioToFacturapi` (devolver domicilio
  vacío o parcial).

- **Domicilio pre-rellenado desde `FiscalPanel`:** `clientes.fiscal
  .getForClient` ya devuelve el domicilio si existe; lo reutilizamos
  para no duplicar captura. NO auto-rellenamos con valores ficticios.

- **`onError` mapea `INVOICE_FISCAL_DATA_REQUIRED` a mensaje
  amigable:** sin el mape el mensaje crudo "INVOICE_FISCAL_DATA_REQUIRED"
  es críptico. Con el mape, el PL ve el texto que el formulario
  ya exige y sabe exactamente qué corregir.

- **NO se reescribe `facturas-list.tsx` arquitectura:** sólo se añade
  estado local + bloque `role="alert"`. La estructura del componente
  (Card con botones) se conserva. Si ATLAS quiere consolidar los
  errores UI de la lista en un sólo banner, es un refactor mayor.

## Decisiones internas reversibles (intento 2)

- **GET `/invoices/{id}` fallback cuando `/stamp` no devuelve
  `uuid`:** la doc muestra `uuid` en la respuesta de POST
  `/invoices`/`/stamp`, pero algunos Test paths (Test=true, factura
  `stamped` pero no `valid` aún) devuelven `uuid: null`. El adapter
  hace `GET /invoices/{id}` para recuperar el `uuid` cuando la
  respuesta inmediata del stamp lo omite. Si AMBOS endpoints
  carecen de `uuid`, el adapter cae al `id` interno de Facturapi
  (degradación controlada, NO error). Documentado para ATLAS como
  comportamiento explícito.
- **NO campos inventados:** `taxes[]` sólo lleva `type` y `rate`
  según la doc; NO se incluyen `factor/base/amount`. `tax_included:
  false` activa el cálculo automático de IVA 16% por Facturapi.
  Esto evita drift entre lo que la API acepta y lo que el adapter
  envía.
- **Customer body: `default_invoice_use`:** la doc no expone
  `cfdi_use` ni `external_id` para `POST /customers`. Sólo
  `legal_name/tax_id/tax_system/email/address/default_invoice_use`
  están documentados. La idempotencia del customer se apoya en
  `Idempotency-Key` header y en la unicidad natural de `tax_id`.
- **`POST /invoices` body: `idempotency_key` + `external_id`:** ambos
  campos son documentados en el body. El header `Idempotency-Key`
  se mantiene como redundancia defensiva.
- **NO se añade CSD/API key al repo:** el `FACTURAPI_API_KEY` se
  lee desde `process.env` en runtime (siguiendo el patrón del
  router); nunca se persiste en código fuente, fixtures ni
  commits. Cumple regla explícita del handoff.

## Decisiones internas reversibles (intento 1)

- **`fetch` estándar Node 22, sin deps:** cumple ADR-22 (mínimo código
  suficiente) y mantiene el adapter ligero. Tests usan fetch mockeado
  con `vi.stubGlobal` o `fetchImpl` inyectable; cero red real desde
  el suite.
- **Selector de modo por env (`PAC_MODE` + `FACTURAPI_API_KEY`):** el
  factory `createPacClient(opts?)` decide en runtime, sin que el
  router ni el servicio conozcan el proveedor. Esto facilita revertir
  a mock poniendo `PAC_MODE=mock` o quitando `FACTURAPI_API_KEY`
  del env de staging.
- **Idempotencia con `Idempotency-Key` + `external_id`:** ambos se
  pasan para máxima defensividad. `Idempotency-Key` (header) es el
  contrato HTTP canónico de Facturapi para evitar duplicados al
  reintentar; `external_id` (body) es la clave lógica del cliente/
  invoice en Facturapi. Si la API futura cambia el contrato, basta
  ajustar `request()` en `facturapi.ts`.
- **No exigir CSD en modo HTTP:** la liberación del guard CSD en
  `descifrarCredencialesPac` se acota a `PAC_MODE === "http"`. Si
  Frank cambia a otro PAC CSD-based en el futuro, basta revertir esa
  condición.
- **Mensajes de error sanitizados:** la regex
  `/sk_(?:test|live)_[A-Za-z0-9_-]+/g` enmascara cualquier `sk_*`
  presente en `message` de la respuesta externa. Defense in depth:
  aunque Facturapi nunca debería incluir el secreto en `message`,
  el adapter lo trata como comprometido y lo enmascara antes de
  propagar el error.
- **Status `draft` + `is_ready_to_stamp`:** se sigue el flujo
  recomendado por Facturapi para revisar antes de timbrar. Si
  `is_ready_to_stamp === false` (datos incompletos del receptor),
  abortamos con `INVOICE_BUILD_INVALID` (400) ANTES de llamar a
  `/stamp`, evitando consumo innecesario y registros sucios.
- **PDF/XML como Buffer:** se descargan como binarios (no JSON) con
  `arrayBuffer()`. Esto evita errores de parseo cuando Facturapi
  sirve streams binarios con headers `application/pdf` /
  `application/xml`.
- **Cancelación con motivo SAT sólo `01..04`:** se valida en el
  adapter (`CANCEL_MOTIVES_SAT.includes`) antes de cualquier HTTP.
  Motivos `01`/`02` con folioSustitucion (factura sustituta) NO se
  soportan en este corte: la SPEC-008 los activará cuando agregue
  cobros. Documentado para ATLAS.
- **`Authorization` header en TODAS las requests:** incluídas las
  descargas XML/PDF. Facturapi lo requiere para cualquier endpoint.

## Trazabilidad AC ↔ pruebas

| AC (handoff ATLAS) | Implementación | Prueba |
|---|---|---|
| AC-1 · Sustituir FacturoPorTi por Facturapi HTTP REST v2 con fetch estándar, sin deps nuevas | `facturapi.ts` usa `globalThis.fetch` (Node 18+); sin entrada en `package.json`; `index.ts` re-exporta `createPacHttpClient` | `tests/spec-20260817-007.test.ts` AC-1 (8 tests: apiKey ausente, default baseUrl canónica, factory dispatch, Authorization Bearer sin impresión, idempotency + external_id, downloads XML/PDF como Buffer, CSD vacío aceptado, `is_ready_to_stamp=false`) |
| AC-2 · Mantener frontera `PacClient` y reglas en `facturacion`; mock sólo para tests | `facturapi.ts` implementa la interfaz existente `PacClient`; `facturacion` (`invoices.ts`) sigue orquestando con `pac.stamp/cancel`; `createPacMockClient` intacto | AC-1 test "createPacClient({ mode: 'http' }) → mock"; AC-2 test "default sin env → mock"; tests originales de mock (`pac.stamp genera UUID v4`, `pac.cancel motivo 01-04`) intactos |
| AC-3 · Base URL configurable (default `https://www.facturapi.io/v2`); secreto sólo desde config/env cifrada, nunca logs; `Authorization: Bearer` | `facturapi.ts` constante `DEFAULT_BASE_URL`; `createPacHttpClient({ baseUrl, apiKey })` rechaza apiKey vacía; `sanitizeMessage` enmascara `sk_test_*`/`sk_live_*`; `defaultSafeLog` usa `process.stderr` (nunca `stdout`); TODAS las requests llevan `Authorization: Bearer` (incluidos GET /xml /pdf) | AC-1 test "default baseUrl es `https://www.facturapi.io/v2`"; AC-1 test "Authorization Bearer envía la apiKey y NO la imprime en ningún campo"; AC-1 test "mensaje sanitizado: sk_test_xxx en body del 5xx → MASKED"; AC-1 test "downloads XML y PDF se hacen como buffers" |
| AC-4 · Mapear receptor y concepto al contrato Facturapi; crear Test con `status=draft`, `external_id`/`idempotency_key` derivados del invoice; consultar readiness; POST `/invoices/{id}/stamp`; descargar `/xml` y `/pdf`; devolver UUID/XML/PDF normalizados; Test key produce `livemode=false` y NO SAT | `facturapi.ts` `stamp()`: `buildCustomerBody({ legal_name, tax_id, tax_system, email, address, default_invoice_use })` (intento 2: NO `cfdi_use` ni `external_id`); `buildItemBody({ quantity, product: { description, product_key, price (pesos), tax_included: false } })` (intento 2: SIN `unit_price`, SIN `factor/base/amount`); POST `/customers` con `Idempotency-Key`; POST `/invoices` con `status: 'draft'` + `external_id` + `idempotency_key` (body); check `is_ready_to_stamp` (abort si false); POST `/invoices/{id}/stamp`; si `uuid` falta, GET `/invoices/{id}` fallback (intento 2); GET `/invoices/{id}/xml` y `/pdf` como Buffer; `cfdiUuid = stamped.uuid ?? (fullInvoice.uuid ?? fullInvoice.id)`. `livemode=false` es propiedad del secret `sk_test_*` | AC-1 tests originales + **AC-3 test "item: shape anidado `items[].product = { description, product_key, price, tax_included }`"**; AC-3 test "customer body: `default_invoice_use` (no `cfdi_use`), sin `external_id`"; AC-3 test "invoice body: `idempotency_key` Y `external_id`"; AC-3 test "/stamp sin uuid → GET /invoices/{id} fallback"; AC-3 test "/stamp sin uuid, GET sin uuid → fallback al `id`" |
| AC-5 · Cancelación POST/DELETE según docs y motivo SAT; normalizar acuse sin filtrar secreto | `facturapi.ts` `cancel()`: POST `/invoices/{uuid}/cancel` con `{ motivo: '01'\|'02'\|'03'\|'04' }` + `Idempotency-Key`; `serializeAcuse()` extrae `acuse` (XML) si viene, sino JSON; `sanitizeMessage` aplicado a errores 4xx/5xx | AC-1 test "cancel envía POST /invoices/{uuid}/cancel con motivo SAT e idempotency key"; AC-1 test "cancel motivo SAT inválido → INVALID_CANCEL_MOTIVE sin HTTP" |
| AC-6 · No exigir CSD local; mantener compatibilidad del mock y errores canónicos seguros | `invoices.ts` `descifrarCredencialesPac` libera guard CSD cuando `PAC_MODE === "http"`; `Buffer.alloc(0)` para CSDs vacíos; códigos canónicos (`PAC_API_KEY_MISSING`, `CSD_NOT_CONFIGURED`, `INVALID_CANCEL_MOTIVE`, `INVOICE_BUILD_INVALID`, `INVOICE_NOT_FOUND`) en `facturapi.ts` mapean 401/403/404/409/422 | AC-1 test "acepta buffers CSD vacíos (Facturapi NO exige CSD local)" |
| AC-7 · Configurar router/servicio para Facturapi HTTP en staging vía variables explícitas; mock en tests/default local; no hardcodear la llave | `index.ts` `createPacClient(opts?)` auto-detecta: lee `process.env.PAC_MODE` y `process.env.FACTURAPI_API_KEY`. `router/facturacion.ts` llama `createPacClient()` sin args. **El router NO lee env directamente** (separación de capas) | AC-1 test "createPacClient({ mode: 'http' }) con apiKey inválida → mock"; AC-2 test "default (sin env, sin opts) → mock". Grep en `facturacion.ts` (router): sin `process.env`. Grep en `invoices.ts`: sin `process.env` |
| AC-8 · Idempotencia para no duplicar recursos externos en reintentos | `request()` aplica `Idempotency-Key` header en POST/DELETE; bodies llevan `external_id` derivado de `sha256(orgId\|rfc\|claveProdServ\|totalCents)` truncado a 32 hex | AC-1 test "Idempotency-Key en POST (customers, invoices, stamp) y external_id estable"; AC-1 test "cancel ... idempotency key" |
| AC-9 · Traduce 401/4xx/429/5xx a errores del adaptador | `throwFacturapiHttpError(res)` mapea por status; `request()` catch mapea network/AbortError | AC-1 tests "401/403 → PAC_API_KEY_MISSING", "404 → INVOICE_NOT_FOUND", "409 → INVOICE_BUILD_INVALID", "422 → INVOICE_BUILD_INVALID", "429 → PacTransientError", "5xx → PacTransientError" |
| AC-10 · Tests dirigidos con fetch mock para auth, payload, stamp, descargas, errores y ausencia de CSD; NO llama a Facturapi | `makeFetchMock(responses[])` retorna `fetchImpl` inyectable; captura `url/method/headers/body`. 18 tests deterministas con `vi.stubGlobal` o `fetchImpl`. Cero DNS real | Cobertura arriba por AC; inspección: ningún test hace `fetch(url)` sin mock |
| AC-11 · Actualizar IMPL-REPORT con evidencia y riesgos | Este documento | n/a |
| AC-12 · typecheck, tests dirigidos, suite V2 y lint propio; READY_FOR_VERIFYING | typecheck PASS; suite V2 962/962; lint 0 nuevos | Bloque "Validación" arriba |

## Riesgos y desviaciones (intento 3)

- **`is_ready_to_stamp=false` mitigado (intento 3).** El formulario
  de "Crear factura borrador" exige los 7 campos de domicilio fiscal
  antes del upsert y `mapDomicilioToFacturapi` revalida antes del
  POST. Si el cliente no tiene domicilio fiscal completo, el
  servicio aborta con `INVOICE_FISCAL_DATA_REQUIRED` (400) SIN
  llamar a Facturapi. El usuario completa el domicilio y reintenta.

- **Bypass BD en modo HTTP (intento 3).** El secreto
  `FACTURAPI_API_KEY` vive sólo en env cifrado de Coolify. No se
  persiste en BD ni en logs. `obtenerCredencialesTimbrar` retorna
  credenciales vacías para satisfacer el contrato `PacStampInput`;
  el adaptador HTTP usa su propio closure. Si Frank migra a otro
  PAC CSD-based, basta invertir la condición en
  `obtenerCredencialesTimbrar`.

- **Error UI visible (intento 3).** El botón Timbrar muestra
  `role="alert"` con mensaje amigable. Sin este mape el error 412
  quedaba silencioso y el usuario veía "falso éxito" porque el
  botón volvía a habilitarse.

- **Riesgo bajo.** Sustitución de proveedor sin cambio de contrato
  público (mismas firmas `pac.stamp`/`pac.cancel`); el caller
  (`facturacion`) NO distingue entre mock y HTTP salvo por la
  presencia del secreto. Si Frank provee un secreto inválido en
  staging, `facturapi.stamp` fallará con `PAC_API_KEY_MISSING` (412)
  y el servicio lo mapeará a error canónico para el cliente.

- **`sk_test_*` filter regex limitado a `[A-Za-z0-9_-]`:** si el
  secreto contiene caracteres fuera de este set, la sanitización NO
  los enmascara. Defensa: validar formato `sk_test_*` y `sk_live_*`
  al cargar la key (sólo ASCII base64). Documentado.

- **Live/producción NO activado:** este corte sólo valida el camino
  Test. Producción requiere `sk_live_*` + autorización explícita de
  Frank + revisión de cumplimiento fiscal; queda fuera de alcance
  según ADR-20260825-01.

- **Cobros / cierre NO implementados:** el adaptador NO expone
  endpoints de pagos, sólo timbrado y cancelación. La cancelación
  para motivo `01`/`02` (factura sustituta) NO soporta
  `folioSustitucion`; la SPEC-008 lo agregará cuando active cobros.
- **Lint baseline:** los 17 errores de `pnpm lint` son preexistentes
  en `infrastructure/vectoria-provision/**` y
  `tests/autonomous-loop/**`. ESLint directo sobre los archivos
  modificados: 0 errores, 0 warnings.
- **Ejecución real contra Facturapi:** NO EJECUTADA en este corte.
  La probe `GET /v2/customers?limit=1` con la Test Secret Key ya pasó
  HTTP 200 antes del handoff. El end-to-end con POST /invoices +
  stamp + downloads + cancel queda para V3 GEMINI contra staging.

## Requiere GEMINI: sí (regla 5.5 — gate final)

El adaptador HTTP introduce un camino nuevo que interactúa con un
sistema externo (Facturapi). Aunque los tests deterministas con fetch
mockeado cubren 18 escenarios, la verificación V3 contra staging LIVE
es **necesaria** para validar:

1. **Camino feliz (cliente Test con fiscal completo):** OS `delivered`
   → cliente con RFC/razón/regimen/domicilio → timbrar → POST
   `/customers` idempotente → POST `/invoices` con `status=draft`
   → POST `/invoices/{id}/stamp` → GET `/xml` + `/pdf` → ASSERT:
   `cfdiUuid` se persiste en `invoices.cfdi_uuid`, `xmlFileId`
   + `pdfFileId` apuntan al bucket, `status === 'emitida'`,
   `livemode === false` (Test key).
2. **Idempotencia de stamp:** re-disparar el mismo flujo (mismo
   `external_id`) → ASSERT: NO se crea un segundo `customer` ni un
   segundo `invoice` en Facturapi (response del segundo call trae el
   mismo `id` que el primero).
3. **`is_ready_to_stamp === false`:** cliente con RFC/razón/regimen
   pero domicilio incompleto → ASSERT: el servicio rechaza con
   `INVOICE_BUILD_INVALID` (NO llama `/stamp`), factura interna
   queda en `borrador`.
4. **Cancelación motivo `03`:** invoice timbrada Test → POST
   `/invoices/{uuid}/cancel` con `{ motivo: '03' }` → ASSERT: status
   `cancelada`, `cancelMotiveSat='03'`, acuse persistido.
5. **Cancelación motivo inválido `99`:** intento de cancelación con
   motivo `99` → ASSERT: 400 `INVALID_CANCEL_MOTIVE` SIN llamada HTTP
   al PAC.
6. **401 (secreto inválido):** `FACTURAPI_API_KEY` configurada con un
   valor revocado → ASSERT: 412 `PAC_API_KEY_MISSING` con mensaje
   "Facturapi 401: autenticación rechazada" (sin filtrar el secreto).
7. **5xx transitorio:** simular 503 → ASSERT:
   `PacTransientError` con `code: 'PAC_TRANSIENT'`.
8. **429 rate limit:** simular 429 → ASSERT:
   `PacTransientError` (reintentable por ADR-07).
9. **Ausencia de CSD:** crear OS con cliente fiscal y timbrar SIN
   CSD cargado → ASSERT: el adapter HTTP ignora los buffers vacíos;
   la factura se timbra correctamente.
10. **No expone secretos en logs:** cualquier error 4xx/5xx cuyo
    body contenga `sk_test_xxx` → ASSERT: el `message` del
    `DomainError`/`PacTransientError` contiene `MASKED`, NO contiene
    la clave original.

## Requiere DEBY: no

No se han observado fallos en la implementación. No hay bug
reproductible, crash, race o causa raíz pendiente. El adaptador usa
`AbortController` para timeouts; `Idempotency-Key` evita duplicados
en reintentos; la sanitización evita filtración de secretos en logs.
El factory `createPacClient` mantiene compat con mock (tests y local
siguen funcionando idénticos).

## Pendientes ATLAS

- **Redeploy + Gate final GEMINI (V3)** con los escenarios de los
  3 intentos contra staging LIVE. ATLAS redeployará a staging (no
  requiere migración) y notificará a GEMINI con la reapertura del
  gate V3.
  **Escenarios V3 intento 1 (10):** ver bloque anterior.
  **Escenarios V3 intento 2 (5):** ver bloque anterior (`items[].product`,
  `default_invoice_use`, `idempotency_key`, GET fallback, cero secretos).
  **Escenarios V3 intento 3 (5):**
  - 16. **Bypass BD en modo HTTP:** activar `PAC_MODE=http` +
     `FACTURAPI_API_KEY` en staging. Crear OS real → cliente real →
     borrador real → timbrar. ASSERT: la query log de BD NO contiene
     `SELECT ... FROM organization_fiscal_config` durante timbrar;
     sólo se ve `POST /v2/customers` + `POST /v2/invoices` etc. Si el
     log SÍ muestra el SELECT, el bypass NO está activo.
  - 17. **Domicilio fiscal completo en POST `/customers`:** el cliente
     tiene domicilio completo (calle, número, colonia, municipio,
     estado, CP, país) capturado en el dialog. ASSERT: el body de
     `POST /v2/customers` lleva `address.street`, `address.exterior`,
     `address.neighborhood`, `address.city`, `address.municipality`,
     `address.zip`, `address.state`, `address.country` Y NO lleva
     claves españolas.
  - 18. **Rechazo pre-POST con domicilio incompleto:** forzar un
     cliente con domicilio parcial (sólo RFC/razón/régimen, sin
     dirección). ASSERT: el dialog bloquea el submit con
     `createInvoiceFiscalAddressMissing` y NO se hace POST a
     Facturapi. Verificar en Network panel.
  - 19. **Timbrar con domicilio completo:** OS real → cliente con
     domicilio completo → borrador → timbrar. ASSERT: timbrado
     devuelve 200 OK, `invoices.status='emitida'`,
     `invoices.cfdi_uuid` se persiste, NO devuelve 412.
- 20. **Error UI visible en Timbrar:** forzar un error 412/422
     del backend. ASSERT: Playwright captura
     `data-testid="facturas-list-timbrar-error"` con `role="alert"`
     y mensaje legible (no el código crudo).
- **Live/producción:** pendiente autorización explícita de Frank +
- **Live/producción:** pendiente autorización explícita de Frank +
  provisión de `sk_live_*` + revisión de cumplimiento fiscal + CSD
  del emisor (que Facturapi NO custodia; hay que subirlo via
  `csdCerBucketKey`/`csdPemBucketKey` o el panel de Facturapi). NO
  en este corte.
- **Domicilio fiscal completo en `clientes.fiscal.upsert`:** si QA
  detecta que `is_ready_to_stamp=false` por domicilio incompleto,
  IMPL-37 ampliará el formulario fiscal con `calle/numero/colonia/
  municipio/estado/cp/pais` (el schema Zod ya lo soporta,
  `ClientFiscalUpsertInputSchema.domicilio`). Ownership ATLAS/SPEC-007.
- **Cobros (SPEC-008):** la cancelación motivo `01`/`02` con
  `folioSustitucion` se activará cuando SPEC-008 implemente pagos.
- **P3-1 (DTO stale en mutaciones de tarea) y P3-2 (dependencias de
  módulo):** siguen abiertos; ownership ATLAS.
- Sin commit/push/deploy; sin editar `discovery/`, SPEC, ADR ni
  `PROYECTO.md`; sin IDs en código fuente. La llave `FACTURAPI_API_KEY`
  queda **sólo en env cifrado** de Coolify (no en este repo).

## Notas de reversión

Reversible sin pérdida de datos (sólo cambia el adaptador HTTP):

1. Restaurar `src/server/integrations/pac/index.ts` →
   `createPacClient` siempre devuelve `createPacMockClient()`.
2. Borrar `src/server/integrations/pac/facturapi.ts`.
3. Restaurar `src/server/services/facturacion/invoices.ts`:
   re-añadir el guard CSD previo (sin condición `PAC_MODE !== "http"`).
4. Revertir `src/server/trpc/routers/facturacion.ts`:
   `createPacClient({ mode: "mock" })` explícito (opcional; el
   factory por defecto ya devuelve mock si no hay env).
5. Borrar las 18 pruebas nuevas del bloque
   `IMPL-20260825-36 · AC-1` y `AC-2` en
   `tests/spec-20260817-007.test.ts` (mantener sólo las originales).
6. Validar: `pnpm typecheck && pnpm test` debe volver a 944/944
   (sin los 18 nuevos).

No hay datos persistidos que requieran limpieza: ningún cambio a
schema, ninguna migración, ningún dato nuevo en BD introducido por
este incremento. El adaptador HTTP habla con Facturapi pero NO escribe
en BD directamente; el servicio `facturacion` sigue siendo el único
que persiste filas `invoices`. Si ATLAS rechaza, las facturas
timbadas durante gate V3 se identifican por `cfdiUuid` en la tabla
`invoices` y se pueden revertir con `facturacion.cancel` (ya
existente) o vía `DELETE /api/v2/invoices/{id}` en Facturapi.