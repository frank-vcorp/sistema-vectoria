---
ID intervención: IMPL-20260825-36
ID tarea: IMPL-20260825-36
Estado: READY_FOR_VERIFYING
SPEC: SPEC-20260817-007 (Facturación CFDI) actualizada
ADR: ADR-20260825-01-integracion-facturapi
Decisión: DEC-FUN-20260825-01 (Facturapi como PAC HTTP v2)
Discovery refs: probe real `GET https://www.facturapi.io/v2/customers?limit=1` HTTP 200 con Test Secret Key; revisión oficial contra `docs.facturapi.io/api`; QA V3 staging `lista/preview` 200 OK + timbrar 412 por gate BD; F-11 is_ready_to_stamp=false con `verification.errors`; F-12 colisión 409 por clave idempotencia sólo RFC+importe; F-11 follow-up `/stamp` 400 con detalle tras `is_ready_to_stamp=false` sin errors[]
Origen handoff: ATLAS (turno continuo)
Fecha: 2026-08-26 (turno continuo)
Implementador: SOFIA
Intento: 6 (IMPLEMENTATION_DEFECT dentro IMPL-20260825-36, F-11 follow-up: dejar que /stamp valide)
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

## Delta intento 6 (F-11 follow-up · dejar que /stamp valide)

QA reprodujo F-11 (follow-up): Facturapi Test confirma el customer
como válido (`GET /v2/customers/{id}/tax-info-validation` →
`is_valid:true, errors:[]`) y el draft externo contiene dirección
completa, pero `POST /v2/invoices` devuelve `is_ready_to_stamp=false`
SIN `verification/errors` en el body. El adapter del intento 4
abortaba localmente con `INVOICE_BUILD_INVALID` antes de llamar a
`/stamp`, por lo que el caller nunca recibía el error oficial del
PAC. Tres fixes mínimos, sin heurísticas, sin email/datos nuevos:

**A. NO abort local sólo por `is_ready_to_stamp === false`.** Se
elimina el `throw new DomainError("INVOICE_BUILD_INVALID", ...)`
que el intento 4 tenía tras el POST `/invoices`. Ahora el
adapter siempre sigue al endpoint oficial
`POST /v2/invoices/{id}/stamp` para que Facturapi valide y
emita su error detallado (típicamente HTTP 400 con
`errors[]`/`message` estructurado). Se conserva una traza de
log informativo (`log("warn", ...)`) para diagnóstico; el
abort sólo ocurre si `/stamp` NO es 2xx.

**B. Protección contra éxito falso.** Si `/stamp` devuelve
4xx (vía `throwFacturapiHttpError`), el adapter:
  (i) NO descarga XML/PDF (sin `requestBuffer`);
  (ii) NO muta la factura interna (la fila `invoices` sólo se
  actualiza en `invoices.timbrar` después de `pac.stamp()` OK);
  (iii) proyecta `errors[]`/`message` sanitizado vía
  `extractFacturapiErrors` (sin PII ni secretos, intento 4).

**C. `case 400` en `throwFacturapiHttpError`.** El intento 4
proyectaba diagnóstico sólo en 409/422. Ahora el 400 (caso
típico de `/stamp` cuando el draft no está listo) también
proyecta `errors[]`/`message` estructurado. Mensajes de error
del intento 4 siguen funcionando idénticos (back-compat).

**NO se agrega email.** El intento 6 NO añade `email` al
customer, NO inventa datos, NO usa heurísticas de "auto-fill".
La respuesta oficial del stamp es la única fuente de verdad.
Si después del 400 el PL/Director decide capturar `email` o
ampliar dirección, se hace en un incremento posterior con
consentimiento del usuario (no es reversible implícitamente).

**Sin cambios de comportamiento en éxito.** Cuando
`is_ready_to_stamp=true` y `/stamp` es 2xx, el flujo sigue
idéntico al intento 4: UUID/XML/PDF como Buffer,
`invoices.status='emitida'`, `cfdi_uuid` persistido.

## Delta intento 5 (F-12 · idempotencia por invoiceId)

QA reprodujo F-12: el adaptador derivaba `external_id` y
`idempotency_key` sólo de `orgId + rfc + claveProdServ + totalCents`.
Dos facturas distintas del mismo cliente/importe recibían la misma
clave y `POST /v2/invoices` devolvía `409 Conflict`. Además
`PacStampInput` no llevaba `invoiceId` ni `invoiceCode` (el adapter
no podía saber qué invoice interno estaba timbrando). Tres fixes
mínimos, reversibles:

**A. Contrato `PacStampInput` ampliado.** Se añaden `invoiceId:
string` y `invoiceCode: string` (ambos OBLIGATORIOS, no opcionales:
el typecheck protege la regresión). Esto da al adapter la
identidad de la factura a timbrar sin tener que recomputarla.

**B. Claves separadas customer vs invoice.** Se reemplaza
`hashExternalId` por dos helpers:
- `buildCustomerExternalId(input)` → prefijo `cust:` + sha256 de
  `organizationId|rfc`. Estable por cliente fiscal: una sola
  entrada en Facturapi por (org, rfc), múltiples facturas del
  mismo cliente reusan el `customer.id`.
- `buildInvoiceExternalId(input)` → prefijo `inv:` + sha256 de
  `organizationId|invoiceId`. Único por invoiceId interno
  (UUID). Dos facturas distintas (incluso mismo cliente, mismo
  importe, misma descripción) producen claves distintas.

El `Idempotency-Key` header va con `customerExternalId` para
POST `/customers` (estable) y con `invoiceExternalId` para
POST `/invoices` + POST `/invoices/{id}/stamp` (único por
invoice). El campo `idempotency_key` del body sigue el mismo
esquema. El `external_id` en el body de `/invoices` usa
`invoiceExternalId`.

**C. Caller-side.** `invoices.timbrar` y `timbrarSystem` (job
nocturno de facturas recurrentes) ahora pasan `invoiceId: row.id`
y `invoiceCode: row.code` al `pac.stamp`. Cero heurísticas de
recuperación: si el contrato oficial NO permite GET/listar el
draft por `external_id` para reintentos idempotentes, no se
implementa; con la nueva clave única por invoiceId, el job
nocturno NO produce 409 en el flujo normal (cada invoice
tiene su propio recurso en Facturapi).

**Política para 409 por idempotencia.** El intento 5 NO añade
fallback heurístico (GET `/invoices` filtrando por
`external_id`). El contrato oficial de Facturapi v2 NO expone
endpoint de listado con filtro por `external_id` (sólo `id`,
`uuid`, `customer`, `folio_number`, `q` texto libre). Implementar
el fallback requeriría parsear `q` con el hash de 32 chars
(frágil) o asumir que otro recurso es el correcto (anti-seguro
para datos fiscales). Con la clave única por invoiceId la
colisión NO debe ocurrir en flujo normal; si llegara un 409 por
fuera del contrato (ej: doble stamp concurrente), el adapter
sigue mapeándolo a `INVOICE_BUILD_INVALID` (409) con
diagnóstico (intento 4) para que el PL/Director investigue.

**Sin cambios de comportamiento, sin llamadas externas nuevas.**
Mismas firmas `pac.stamp`/`pac.cancel`; mismas respuestas
`PacStampResult`/`PacCancelResult`. Cero deps nuevas. Cero
cambios al router. Cero datos persistidos nuevos.

## Delta intento 4 (F-11 · observabilidad diagnóstica)

QA V3 reprodujo F-11: Facturapi Test acepta un customer con
`tax_id=XAXX010101000 + regimen=616 + domicilio` y crea un invoice
draft 2xx, pero `is_ready_to_stamp=false`. El adapter del intento 3
sólo devolvía el mensaje genérico
`"Facturapi: factura borrador no lista para timbrar (faltan datos del receptor)"`
y descartaba `verification.errors[]`. Sin paths/codes/messages
estructurados, el PL/Director no puede saber qué campo falta ni
cómo corregirlo. Cuatro fixes de observabilidad (sin llamadas
externas nuevas, sin cambio de datos/UI salvo el mensaje):

**A. Nuevo helper `extractFacturapiErrors(payload)`.** Mantiene
la respuesta completa sólo en memoria (variable local del
flujo), lee `verification.errors[]`, top-level `errors[]` y
`message`, y proyecta **sólo** los campos `path` / `code` /
`message` (todos sanitizados por `sanitizeMessage`). NO incluye
valores de campos del receptor (RFC, razón social, domicilio,
email) — sólo nombres de campo. Limita a 5 entradas para no
desbordar el `DomainError.message`.

**B. Branch `is_ready_to_stamp === false` mejorada.** Ahora
lanza `DomainError(INVOICE_BUILD_INVALID)` con
`formatDiagnostics(header, lines)`. Ejemplo de mensaje:
```
Facturapi: factura borrador no lista para timbrar
  · [customer.address.zip] required Zip code is required
  · [customer.address.municipality] required Municipality is required
```

**C. `throwFacturapiHttpError` 409/422 mejorada.** Aplica el
mismo `extractFacturapiErrors` al body del response 4xx. Si
Facturapi rechaza con 422 antes de devolver un draft, los paths
también se proyectan al `DomainError`. Sin `errors[]`, fallback
al `message` top-level.

**D. Seguridad (sin secretos ni PII).** `sanitizeMessage` aplica
dos filtros: enmascara `sk_test_*`/`sk_live_*` (defensa contra
keys que aparezcan accidentalmente en `message`) y trunca
`path` a 80 chars y `message` a 200 chars (defensa contra body
crudo inflado). NO se loguea ni se persiste el body completo:
sólo las líneas proyectadas viven en el `DomainError.message`
que tRPC expone al cliente.

**Por qué NO es SPEC-GAP.** Es diagnóstico de UI/backend, NO
cambio funcional: el comportamiento es el mismo (el draft NO se
timbra cuando `is_ready_to_stamp=false`). Sólo mejora el
feedback al PL/Director para corregir el cliente. Cumple
ADR-03 §3.5 (no loguear secretos) y la regla del handoff
"Conservar la respuesta completa sólo en memoria".

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
| `src/server/integrations/pac/facturapi.ts` | **Nuevo**. `createPacHttpClient(opts)` implementa `PacClient` con fetch estándar. Métodos: `stamp` (POST /customers con `Idempotency-Key` header y body documentado `legal_name/tax_id/tax_system/email/address/default_invoice_use` → POST /invoices con `status=draft`, `external_id`, `idempotency_key` y `items[].product={description, product_key, price, tax_included:false}` → **POST /invoices/{id}/stamp (siempre; intento 6 ya NO aborta por `is_ready_to_stamp === false`)** → **GET /invoices/{id} fallback si `uuid` falta** → GET /invoices/{id}/xml + /pdf como Buffer) y `cancel` (POST /invoices/{uuid}/cancel con `{motivo}`). **Mapeo domicilio interno (`calle/numero/...`) → Facturapi (`street/exterior/...`) en `mapDomicilioToFacturapi` con validación pre-POST (`INVOICE_FISCAL_DATA_REQUIRED` si falta algún campo)**. **(intento 4)** Nuevo helper `extractFacturapiErrors(payload)` que proyecta `verification.errors[]` y `errors[]` en líneas `[path] code message`, sin PII ni secretos. **(intento 6)** Aplicado en `throwFacturapiHttpError` para 400/409/422 (incluye `case 400` específico). El branch `is_ready_to_stamp === false` ya NO aborta localmente: sólo registra `log("warn", ...)` y sigue a `/stamp`. Mapeo de errores 401/403/404/400/409/422/429/5xx a `DomainError`/`PacTransientError`. Timeout 15s default. `sanitizeMessage` enmascara `sk_test_*`/`sk_live_*`. Logger seguro a `process.stderr` (nunca `stdout`). |
| `src/server/integrations/pac/index.ts` | `createPacClient(opts?)` ahora dispatcha por `mode` o env (`PAC_MODE=http` + `FACTURAPI_API_KEY` → HTTP, sino mock). Re-exporta `createPacHttpClient` y `FacturapiHttpClientOptions`. `createPacMockClient` y los códigos canónicos (`PAC_API_KEY_MISSING`, `CSD_NOT_CONFIGURED`, `INVALID_CANCEL_MOTIVE`) intactos. |
| `src/server/services/facturacion/invoices.ts` | (intento 1/2) `descifrarCredencialesPac`: el guard de CSD se aplica sólo si `PAC_MODE !== "http"`. **(intento 3)** Nueva función `obtenerCredencialesTimbrar(orgId)` que bypassa BD en modo HTTP (early-return con credenciales vacías; el secreto efectivo vive en `FACTURAPI_API_KEY` del closure de `createPacHttpClient`). `timbrar` y `cancel` llaman a `obtenerCredencialesTimbrar` en lugar de `descifrarCredencialesPac`. **(intento 5 · F-12)** `timbrar` y `timbrarSystem` pasan `invoiceId: row.id` y `invoiceCode: row.code` al `pac.stamp` para que el adapter derive claves idempotentes únicas por invoice. El descifrado de `csd_password_ciphertext` es tolerante a `null`; los `Buffer.from([...])` del CSD se sustituyen por `Buffer.alloc(0)` cuando `csdCerBucketKey`/`csdPemBucketKey` faltan. La interfaz `PacStampInput` (`csdCer: Buffer`) sigue recibiendo bytes no-nulos (vacíos válidos para Facturapi). |
| `src/server/trpc/routers/facturacion.ts` | `buildService()` llama `createPacClient()` sin args (auto-detecta por env). El router NO lee env directamente (delegado al factory en capa infra). |
| `src/modules/orden-servicio/orden-detail.tsx` | (intento 3) `CreateInvoiceDraftDialog` añade campos `calle/numero/colonia/municipio/estado/cp/pais` pre-rellenados desde `clientes.fiscal.getForClient`. El handler `onSubmit` los envía a `clientes.fiscal.upsert({...domicilio:{...}})` antes de `buildFromOrder`. Validación cliente exige los 7 campos no-vacíos; mensaje canónico `createInvoiceFiscalAddressMissing`. |
| `src/modules/facturacion/facturas-list.tsx` | (intento 3) La mutación `timbrar` añade `onError(err)` que mapea `INVOICE_FISCAL_DATA_REQUIRED` a mensaje amigable. Estado local `timbrarError` se renderiza con `<p role="alert" aria-live="assertive" data-testid="facturas-list-timbrar-error">` debajo de los botones. |
| `src/shared/utils/messages.ts` | (intento 3) Nueva clave `createInvoiceFiscalAddressMissing` para el error de domicilio fiscal incompleto. |
| `tests/spec-20260817-007.test.ts` | (intento 1) **+18 tests** (AC-1 Facturapi + AC-2 dispatch).<br/>(intento 2) **+5 tests** (AC-3 contrato documentado): shape `items[].product={description, product_key, price, tax_included}` con `price` en pesos y SIN campos inventados (`unit_price`, `factor`, `base`, `amount`); `default_invoice_use` en customer body sin `external_id`; `idempotency_key` + `external_id` en invoice body; GET `/invoices/{id}` fallback cuando `/stamp` no devuelve `uuid`; degradación controlada a `id` cuando ambos endpoints carecen de `uuid`.<br/>(intento 3) **+6 tests** (AC-4 bypass HTTP + domicilio + error UI): mapeo domicilio `calle/numero/...` → `street/exterior/...` con rechazo de claves españolas; rechazo `INVOICE_FISCAL_DATA_REQUIRED` cuando domicilio ausente o incompleto (sin HTTP); `facturas-list.tsx` tiene `onError` + `role="alert"` + `data-testid="facturas-list-timbrar-error"`; `orden-detail.tsx` expone los 7 inputs de domicilio y los envía a `fiscalUpsert.mutate({domicilio: {...}})`; `invoices.ts` define `obtenerCredencialesTimbrar` con `PAC_MODE=http` y `timbrar`/`cancel` ya NO usan `descifrarCredencialesPac` directamente.<br/>(intento 4) **+3 tests** (AC-5 diagnóstico errores 4xx): 422 con `errors[]` top-level; 422 sin `errors[]` con fallback a `message` sanitizado; 400 con `message` sanitizado. (Los 4 tests previos de `is_ready_to_stamp=false` que asumían el abort local fueron reemplazados por AC-7 intento 6.)<br/>(intento 5) **+5 tests** (AC-6 idempotencia por invoiceId · F-12): dos `invoiceId` distintos del mismo cliente/importe producen `external_id` distintos; reintento del mismo `invoiceId` produce el mismo `external_id` (estable); customer key estable por org+rfc, independiente del invoiceId; `PacStampInput` requiere `invoiceId: string` y `invoiceCode: string` (no opcionales); `invoices.timbrar` y `timbrarSystem` pasan `invoiceId: row.id` y `invoiceCode: row.code`.<br/>(intento 6) **+5 tests** (AC-7 dejar que /stamp valide · F-11 follow-up): `is_ready_to_stamp=false` → /stamp se llama y devuelve 400 con detalle (`paths[]`/`code`/`message`); `/stamp` 400 con `sk_test_*` accidental → enmascarado en mensaje; `/stamp` 400 PII safety (RFC/domicilio NO aparecen); `/stamp` 400 limita a 5 entradas; `is_ready_to_stamp=true` → /stamp 2xx → continúa con UUID/XML/PDF.<br/>**Total: 42 tests** específicos de Facturapi. |

**Sin cambios en:** schema (`organization_fiscal_config`,
`invoices`), `pac.ts`/router de tRPC, permisos `gestionar_facturacion`
/`timbrar_facturas`, `files`, `audit`, `enums` (códigos canónicos ya
existentes), `package.json` (sin deps nuevas).

## Validación

- **typecheck (`pnpm typecheck`)**: **PASS** (sin output, exit 0).
- **tests (V2 completa, `pnpm test`)**: **986/986 PASS** en 32
  ficheros · 8.88 s
  - `tests/spec-20260817-007.test.ts`: **93/93** (51 originales +
    **42 nuevos** Facturapi: 18 intento 1 + 5 intento 2 AC-3
    + 6 intento 3 AC-4 bypass/domicilio/UI + 3 intento 4 AC-5
    errores 4xx + 5 intento 5 AC-6 idempotencia F-12 + 5 intento 6
    AC-7 dejar que /stamp valide F-11 follow-up).
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

## Riesgos y desviaciones (intento 5)

- **Riesgo muy bajo.** Cambio aditivo al contrato
  `PacStampInput` (2 campos obligatorios) + 2 helpers
  (`buildCustomerExternalId` / `buildInvoiceExternalId`) que
  reemplazan a `hashExternalId`. NO hay cambios de
  comportamiento en el flujo feliz; sólo se garantiza que
  cada invoiceId tenga su propio recurso en Facturapi.

- **Compatibilidad hacia atrás con mocks:** la mock
  `createPacMockClient` sigue funcionando idéntico: no usa
  `invoiceId`/`invoiceCode` para nada, simplemente acepta
  el shape extendido del input. Tests AC-1 verifican que
  mock stamp genera UUID/XML/PDF sin tocar la nueva
  signature.

- **Migración de facturas pre-F-12:** si Frank tenía
  facturas timbradas antes del intento 5 con `external_id`
  derivado de `org+rfc+total`, el adaptador NO las reusa:
  las nuevas invocaciones crean invoices NUEVOS con el
  nuevo `external_id`. Esto es aceptable porque cada
  invoiceId interno produce su propio recurso; no hay
  facturas "huérfanas" porque cada factura timbrada ya
  tiene su fila `invoices` con `cfdiUuid` persistido. El
  único caso de duplicación sería si Frank re-timbra una
  factura histórica: la nueva factura borrador tendrá un
  invoiceId nuevo (las viejas se cancelan con el flujo
  existente, no se re-timbran).

- **Live/producción:** el cambio es backwards-compatible con
  el intento 4 (mismas claves canónicas `cancelled`,
  `borrador`, `emitida`; mismo flujo de UI). No requiere
  cambios al PAC real.

## Riesgos y desviaciones (intento 6)

- **Riesgo muy bajo.** Cambio aditivo: se elimina el abort local
  en `is_ready_to_stamp === false` y se añade `case 400` en
  `throwFacturapiHttpError`. NO hay cambio de comportamiento
  en el flujo feliz (cuando `is_ready_to_stamp=true` y `/stamp`
  es 2xx, todo sigue idéntico: UUID/XML/PDF como Buffer).
  El único cambio observable es que ahora se hacen 3 requests
  (customers, invoices, stamp) en lugar de 2 cuando el draft
  no estaba listo, pero el caller tRPC NO ve mutación hasta
  que `/stamp` es 2xx.

- **Logs de `is_ready_to_stamp=false`:** el `log("warn", ...)`
  emite a `process.stderr`. NO contiene secretos, PII ni
  valores del receptor (sólo `draft.id`).

- **Compatibilidad con intento 5:** los tests de idempotencia
  (F-12) siguen pasando. La clave `external_id` por invoiceId
  sigue siendo única por invoiceId, independiente del
  cambio de comportamiento de intento 6.

- **Live/producción:** el cambio es backwards-compatible con
  el intento 5 (mismas claves canónicas `cancelled`,
  `borrador`, `emitida`; mismo flujo de UI). No requiere
  cambios al PAC real.

## Decisiones internas reversibles (intento 6)

- **NO abortar localmente sólo por `is_ready_to_stamp=false`:**
  el intento 4 abortaba aquí con un mensaje genérico. La
  realidad es que la respuesta detallada del PAC vive en
  `/stamp`, no en `/invoices`. Si abortamos en `/invoices`,
  nunca llegamos al endpoint que tiene el error estructurado
  (`errors[]`). Por eso el intento 6 elimina el abort local:
  dejamos que el endpoint oficial valide. Si hay un problema
  real, Facturapi lo emite en `/stamp` (típicamente HTTP 400
  con `errors[]`).

- **Protección contra éxito falso en 3 niveles:** (i) si `/stamp`
  devuelve 4xx, el adapter NO descarga XML/PDF; (ii) NO muta la
  fila `invoices` (esa mutación vive en `invoices.timbrar`
  tras el `pac.stamp()` exitoso); (iii) proyecta diagnóstico
  sanitizado. Tests AC-7 verifican los 3 niveles.

- **Log informativo en `is_ready_to_stamp=false`:** se conserva
  `log("warn", ...)` para diagnóstico en el servicio
  (`process.stderr`, nunca `stdout`). El caller tRPC recibe
  el `DomainError` con mensaje oficial del PAC. Si Facturapi
  responde 2xx en `/stamp` después de un draft con
  `is_ready_to_stamp=false`, NO se loguea warning (la
  validación final pasó).

- **`case 400` específico en `throwFacturapiHttpError`:** antes
  el 400 caía al default que sólo proyectaba `safeMsg` (sin
  `errors[]`). Ahora proyecta `extractFacturapiErrors` como
  409/422. Esto cubre el caso típico de `/stamp` cuando el
  draft no está listo (HTTP 400 con `errors[]`).

- **NO heurística de auto-fill:** el intento 6 NO agrega
  `email` al customer, NO inventa datos, NO intenta
  `PUT /customers/{id}` para corregir el domicilio. La
  respuesta oficial del stamp es la única fuente de verdad;
  si el PL/Director necesita agregar campos (ej. email,
  interior), se hace explícitamente vía `clientes.fiscal.upsert`
  en un incremento posterior con consentimiento del usuario.

## Decisiones internas reversibles (intento 5)

- **Idempotencia por `invoiceId` (UUID interno), no por código
  humano:** el hash incluye `organizationId|invoiceId` pero NO
  `invoiceCode`. El código humano (`FAC-2026-000001`) puede
  cambiar si Frank renumera; el UUID es estable durante toda
  la vida de la factura. Mantener la clave atada al UUID
  preserva idempotencia incluso tras renumeraciones.

- **Customer key por `org|rfc`, independiente del invoice:**
  un mismo cliente fiscal puede tener N facturas, pero un
  sólo registro en Facturapi. Si la clave customer variara
  por invoice, cada factura crearía un customer duplicado
  (con su propio `id`) y la factura pagaría el costo de
  upsert innecesariamente. Mantenerla estable por `(org, rfc)`
  reusa el `customer.id` ya creado.

- **Prefijos `cust:` / `inv:` en claves:** aunque sha256 de
  32 hex ya es prácticamente no-colisionable, los prefijos
  aportan (a) legibilidad en logs de Facturapi (se distingue
  customer key vs invoice key), (b) defensa contra un cambio
  futuro del algoritmo de hash (los prefijos preservan el
  espacio de claves al migrar).

- **NO fallback heurístico para 409 por idempotencia:** el
  contrato oficial de Facturapi v2 NO expone endpoint de
  listado con filtro por `external_id`. Implementar un GET
  fallback requeriría parsear `q=<external_id>` (frágil) o
  asumir que otro recurso es el correcto (anti-seguro para
  datos fiscales). Con la nueva clave única por invoiceId
  la colisión NO debe ocurrir en flujo normal; si llegara un
  409 por fuera del contrato (ej: doble stamp concurrente
  en HA), el adapter sigue mapeándolo a
  `INVOICE_BUILD_INVALID` (409) con diagnóstico (intento 4)
  para que el PL/Director investigue. Esta política es
  reversible: si el contrato agregara un endpoint de búsqueda
  por `external_id`, basta implementar el fallback en
  `facturapi.ts` con un guard adicional.

- **`invoiceId: string` OBLIGATORIO en `PacStampInput`:** el
  typecheck protege la regresión. Un caller que olvide
  `invoiceId` NO compila; tests AC-6 verifican esto estático.

- **`invoiceCode` se incluye para trazabilidad, no para el
  hash:** permite que los logs del PAC muestren el código
  humano sin perder idempotencia estable. Si el código cambia
  en el futuro, la idempotencia NO se rompe.

## Decisiones internas reversibles (intento 4)

- **Respuesta completa sólo en memoria, NO persistida:** la
  variable `draft` (full Facturapi response) vive en el stack
  durante la llamada a `stamp`. Después del throw de
  `DomainError` se libera. NO se loguea ni se persiste en BD.
  Cumple ADR-03 §3.5 (secretos) y la regla del handoff
  "Conserva la respuesta completa sólo en memoria".

- **Proyección sin PII:** el helper `extractFacturapiErrors`
  sólo emite `path` (nombre del campo), `code` (categoría) y un
  resumen corto de `message`. NO incluye valores (`tax_id`,
  `legal_name`, `address.*`, `email`). Si el path excede 80
  chars o el message excede 200 chars, se truncan con `...`.
  Tests AC-5 verifican explícitamente que `XAXX010101000`,
  `Blvd. Atardecer` y `Huatabampo` NO aparecen en el mensaje.

- **Sanitización de secretos:** `sanitizeMessage` se aplica por
  ELEMENTO (path, code, message) antes de concatenar al
  `DomainError.message`. Tests AC-5 verifican que un `sk_test_*`
  inyectado accidentalmente en el body se enmascara como
  `MASKED` (defensa contra keys que aparezcan en `message`).

- **Límite de 5 entradas:** `extractFacturapiErrors` retorna
  como máximo 5 líneas proyectadas para no desbordar el
  `DomainError.message`. Si Facturapi devuelve 12 errores, los
  primeros 5 (típicamente los más relevantes: required/invalid)
  son los que el PL ve. Tests AC-5 verifican el límite.

- **NO se reescribe el cliente ni se agrega `errorLog`:** el
  scope es exclusivamente observabilidad. Si ATLAS quiere
  persistir los diagnósticos en `audit_logs` o en un nuevo
  `pac_error_logs`, queda para un incremento posterior. Aquí
  sólo mejora el mensaje al cliente tRPC.

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

## Riesgos y desviaciones (intento 4)

- **Riesgo muy bajo (sólo observabilidad):** cambio aditivo de
  un helper (`extractFacturapiErrors`) + una llamada a
  `formatDiagnostics` en dos sitios (`is_ready_to_stamp=false`
  branch + `throwFacturapiHttpError` 409/422). NO modifica el
  comportamiento de timbrado: el draft NO se timbra cuando
  `is_ready_to_stamp=false`, igual que antes; sólo cambia el
  mensaje del `DomainError` que el cliente ve.

- **PII: doble defensa.** (a) Sólo se emiten `path/code/message`
  (no valores). (b) `sanitizeMessage` enmascara `sk_test_*` /
  `sk_live_*`. Tests AC-5 verifican explícitamente que el RFC y
  domicilio del snapshot NO aparecen en el mensaje.

- **Tamaño de mensaje:** limitado a 800 chars totales (cabecera +
  5 líneas × ~150 chars cada una). Compatible con UI, logs y
  audit sin truncar.

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
  **Escenarios V3 intento 4 (3):**
  - 21. **`is_ready_to_stamp=false` con `verification.errors`:** el
     PL/Director intenta timbrar con un cliente que tiene domicilio
     parcial (ej: zip vacío). ASSERT: el `DomainError(INVOICE_BUILD_INVALID)`
     expone al menos un path (`customer.address.zip`), el code
     (`required`) y el mensaje ("Zip code is required"); NO expone
     RFC, NO expone domicilio literal, NO expone `sk_test_*`.
  - 22. **422 con `errors[]` top-level:** forzar un POST
     `/v2/customers` rechazado por 422 (ej: tax_id duplicado).
     ASSERT: el `DomainError(INVOICE_BUILD_INVALID)` muestra
     `Facturapi 422` + path + code + message.
  - 23. **`sk_test_*` enmascarado en error message:** inyectar un
     body de error con `sk_test_supersecret...` accidentalmente.
     ASSERT: el `DomainError.message` contiene `MASKED`, NO
     contiene la clave original.
  **Escenarios V3 intento 5 (3):**
  - 24. **Idempotencia por invoiceId:** crear dos OS reales del
     mismo cliente/importe (mismo RFC, mismo producto,
     mismo `totalCents`). Timbrar ambas en orden. ASSERT:
     (a) ambas requests `POST /v2/invoices` llevan
     `external_id` DISTINTOS (prefijo `inv:` + hashes
     distintos). (b) NO se devuelve 409 por colisión de
     idempotencia. (c) cada factura se timbra con su propio
     `cfdi_uuid`.
  - 25. **Reintento mismo invoiceId:** ejecutar `timbrar`
     dos veces para la misma OS. ASSERT: la segunda llamada
     devuelve 200 OK con el MISMO `cfdi_uuid` de la primera
     (idempotencia real), no crea un segundo draft ni un
     segundo stamp. (El comportamiento depende de la
     respuesta de Facturapi al POST `/invoices/{id}/stamp`
     con el mismo `idempotency_key`; en Test, Facturapi
     responde con el mismo `id` ya timbrado.)
  - 26. **Customer key estable entre invoices:** verificar
     que las 2 requests `POST /v2/customers` (uno por cada
     factura) llevan el MISMO `Idempotency-Key` (prefijo
     `cust:` + mismo hash). No se crea un customer duplicado.
  **Escenarios V3 intento 6 (2):**
  - 27. **Draft `is_ready_to_stamp=false` sin errors[] +
     /stamp 400 detallado:** crear un cliente con domicilio
     parcial (ej. `zip=""`) y forzar que `POST /v2/invoices`
     devuelva `is_ready_to_stamp=false` SIN `errors`. ASSERT:
     el adapter hace `POST /v2/invoices/{id}/stamp`; Facturapi
     responde 400 con `errors[]` detallado. El
     `DomainError(INVOICE_BUILD_INVALID)` muestra el path
     (`customer.address.zip`), el code (`required`) y el
     message ("Zip code is required") en el message. NO se
     descarga XML/PDF; la fila `invoices` NO se muta a
     `emitida`.
  - 28. **No heurística: el adapter NO agrega email ni inventa
     datos:** ejecutar V3 27 y verificar que NO hay un PUT/
     POST adicional a `/customers/{id}` ni que se invente
     dirección. La única fuente de verdad es la respuesta
     oficial del stamp; el PL/Director decide si ampliar el
     formulario con `clientes.fiscal.upsert` en otro
     incremento.
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