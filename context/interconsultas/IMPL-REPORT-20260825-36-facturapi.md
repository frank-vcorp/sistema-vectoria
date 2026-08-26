---
ID intervención: IMPL-20260825-36
ID tarea: IMPL-20260825-36
Estado: READY_FOR_VERIFYING
SPEC: SPEC-20260817-007 (Facturación CFDI) actualizada
ADR: ADR-20260825-01-integracion-facturapi
Decisión: DEC-FUN-20260825-01 (Facturapi como PAC HTTP v2)
Discovery refs: probe real `GET https://www.facturapi.io/v2/customers?limit=1` HTTP 200 con Test Secret Key; revisión oficial contra `docs.facturapi.io/api`
Origen handoff: ATLAS (turno continuo)
Fecha: 2026-08-25 (turno continuo)
Implementador: SOFIA
Intento: 2 (IMPLEMENTATION_DEFECT dentro IMPL-20260825-36, revisión oficial pre-commit)
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

## Archivos modificados (4)

| Archivo | Cambio |
|---|---|
| `src/server/integrations/pac/facturapi.ts` | **Nuevo**. `createPacHttpClient(opts)` implementa `PacClient` con fetch estándar. Métodos: `stamp` (POST /customers con `Idempotency-Key` header y body documentado `legal_name/tax_id/tax_system/email/address/default_invoice_use` → POST /invoices con `status=draft`, `external_id`, `idempotency_key` y `items[].product={description, product_key, price, tax_included:false}` → check `is_ready_to_stamp` → POST /invoices/{id}/stamp → **GET /invoices/{id} fallback si `uuid` falta** → GET /invoices/{id}/xml + /pdf como Buffer) y `cancel` (POST /invoices/{uuid}/cancel con `{motivo}`). Mapeo de errores 401/403/404/409/422/429/5xx a `DomainError`/`PacTransientError`. Timeout 15s default. `sanitizeMessage` enmascara `sk_test_*`/`sk_live_*`. Logger seguro a `process.stderr` (nunca `stdout`). |
| `src/server/integrations/pac/index.ts` | `createPacClient(opts?)` ahora dispatcha por `mode` o env (`PAC_MODE=http` + `FACTURAPI_API_KEY` → HTTP, sino mock). Re-exporta `createPacHttpClient` y `FacturapiHttpClientOptions`. `createPacMockClient` y los códigos canónicos (`PAC_API_KEY_MISSING`, `CSD_NOT_CONFIGURED`, `INVALID_CANCEL_MOTIVE`) intactos. |
| `src/server/services/facturacion/invoices.ts` | `descifrarCredencialesPac`: el guard de CSD se aplica sólo si `PAC_MODE !== "http"` (línea `:387-394`). El descifrado de `csd_password_ciphertext` es tolerante a `null`; los `Buffer.from([...])` del CSD se sustituyen por `Buffer.alloc(0)` cuando `csdCerBucketKey`/`csdPemBucketKey` faltan. La interfaz `PacStampInput` (`csdCer: Buffer`) sigue recibiendo bytes no-nulos (vacíos válidos para Facturapi). |
| `src/server/trpc/routers/facturacion.ts` | `buildService()` llama `createPacClient()` sin args (auto-detecta por env). El router NO lee env directamente (delegado al factory en capa infra). |
| `tests/spec-20260817-007.test.ts` | (intento 1) **+18 tests** (AC-1 Facturapi + AC-2 dispatch).<br/>(intento 2) **+5 tests** (AC-3 contrato documentado): shape `items[].product={description, product_key, price, tax_included}` con `price` en pesos y SIN campos inventados (`unit_price`, `factor`, `base`, `amount`); `default_invoice_use` en customer body sin `external_id`; `idempotency_key` + `external_id` en invoice body; GET `/invoices/{id}` fallback cuando `/stamp` no devuelve `uuid`; degradación controlada a `id` cuando ambos endpoints carecen de `uuid`.<br/>**Total: 23 tests** específicos de Facturapi. |

**Sin cambios en:** schema (`organization_fiscal_config`,
`invoices`), `pac.ts`/router de tRPC, permisos `gestionar_facturacion`
/`timbrar_facturas`, `files`, `audit`, `enums` (códigos canónicos ya
existentes), `package.json` (sin deps nuevas).

## Validación

- **typecheck (`pnpm typecheck`)**: **PASS** (sin output, exit 0).
- **tests (V2 completa, `pnpm test`)**: **967/967 PASS** en 32
  ficheros · 7.34 s
  - `tests/spec-20260817-007.test.ts`: **74/74** (51 originales +
    **23 nuevos** Facturapi: 18 intento 1 + 5 intento 2 AC-3
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
  HTTP 200 antes del handoff (referenciada en el prompt). El
  end-to-end con `POST /invoices` + `POST /invoices/{id}/stamp` +
  GET `/invoices/{id}` fallback + descargas queda pendiente al gate
  V3 (GEMINI con Playwright).

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

## Riesgos y desviaciones

- **Riesgo bajo.** Sustitución de proveedor sin cambio de contrato
  público (mismas firmas `pac.stamp`/`pac.cancel`); el caller
  (`facturacion`) NO distingue entre mock y HTTP salvo por la
  presencia del secreto. Si Frank provee un secreto inválido en
  staging, `facturapi.stamp` fallará con `PAC_API_KEY_MISSING` (412)
  y el servicio lo mapeará a error canónico para el cliente.
- **`is_ready_to_stamp === false` en producción:** si un cliente no
  tiene dirección fiscal completa (CP, calle, municipio, estado) la
  factura se quedará como `borrador` eternamente. Defensa: el servicio
  exige RFC/razón social/régimen vía `clientes.fiscal.upsert` (IMPL-34)
  pero NO exige domicilio completo. Documentado: el siguiente
  incremento (probablemente IMPL-37) ampliará el formulario fiscal
  con domicilio cuando Facturapi devenga más errores `is_ready_to_stamp`.
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

- **Redeploy + Gate final GEMINI (V3)** con los 10 escenarios del
  bloque anterior contra staging LIVE. ATLAS redeployará a staging
  (no requiere migración) y notificará a GEMINI con la reapertura
  del gate V3 con asserts específicos para Facturapi Test.
  **Escenarios V3 adicionales del intento 2:**
  - 11. **`items[].product` shape exacto:** Playwright intercepta
     la request `POST /v2/invoices` y verifica que el body lleva
     `items: [{ quantity, product: { description, product_key,
     price, tax_included: false } }]` con `price` en pesos (NO
     `unit_price` plano). ASSERT: NO existe `unit_price`, NO
     existe `factor`, NO existe `base`, NO existe `amount`.
  - 12. **`default_invoice_use` en customer:** Playwright
     intercepta `POST /v2/customers` y verifica que el body NO
     contiene `cfdi_use` Y contiene `default_invoice_use` con el
     valor del cliente (G01/G03/etc).
  - 13. **`idempotency_key` en body de invoice:** Playwright
     intercepta `POST /v2/invoices` y verifica que el body lleva
     `idempotency_key` (no sólo el header). Ambos coinciden
     (`Idempotency-Key` header == `idempotency_key` body).
  - 14. **GET `/invoices/{id}` fallback:** simular Test donde
     `/stamp` devuelve `uuid: null`. ASSERT: el adapter hace
     `GET /v2/invoices/{id}` y persiste el `uuid` resultante.
  - 15. **Cero secretos en repo:** `git grep -nE "sk_(test|live)_"`
     sobre el árbol completo devuelve 0 hits (sólo aparece en
     fixtures de tests con valores sintéticos como
     `sk_test_abcdef1234567890`).
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