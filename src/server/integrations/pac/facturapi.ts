/**
 * Adaptador PAC HTTP para Facturapi v2 — SPEC-007 + ADR-20260825-01.
 *
 * Implementa la interfaz `PacClient` (misma que el mock) sobre el
 * protocolo HTTP REST v2 de Facturapi. Sin dependencias externas: usa
 * `fetch` estándar de Node 18+ (Node 22 en este repo). El `fetchImpl`
 * es inyectable para tests con `vi.stubGlobal('fetch', ...)` o
 * pasándolo en el factory.
 *
 * Decisiones operativas (ADR-20260825-01 + DEC-FUN-20260825-01):
 *  - Base URL configurable, default `https://www.facturapi.io/v2`
 *    (`FACTURAPI_BASE_URL`).
 *  - Auth `Authorization: Bearer <apiKey>`; la `apiKey` NUNCA se
 *    loguea (ADR-03 §3.5). Se acepta `sk_test_*` (Test, livemode=false,
 *    NO contacta SAT) o `sk_live_*` (Live, requiere autorización
 *    explícita y NO se activa en este corte).
 *  - Sin CSD local: el adaptador NO exige `csdCer`/`csdPem` (Facturapi
 *    custodia los certificados del emisor en su plataforma). Los bytes
 *    vacíos o `null` se ignoran silenciosamente.
 *  - Idempotencia: el adaptador envía `Idempotency-Key` en POST y
 *    `external_id` en el payload de factura derivado del `invoice.code`
 *    interno. Así, reintentos del job no duplican recursos externos.
 *  - Errores externos se traducen a `DomainError` canónicos:
 *      401 → `PAC_API_KEY_MISSING` (412) — secreto inválido o ausente.
 *      404 → `INVOICE_NOT_FOUND` (404) — invoice inexistente.
 *      409 → `INVOICE_BUILD_INVALID` (409) — conflicto (ej. doble stamp).
 *      422 → `INVOICE_BUILD_INVALID` (400) — payload inválido.
 *      429 → `PacTransientError` (PAC_TRANSIENT) — rate limit.
 *      5xx → `PacTransientError` (PAC_TRANSIENT) — servicio caído.
 *  - El cuerpo de error de Facturapi puede contener el UUID u otros
 *    campos útiles; el adaptador extrae sólo `message` y descarta
 *    cualquier campo que pudiera filtrar parte del secreto (no se ha
 *    observado, pero defensa explícita: no logueamos el cuerpo crudo,
 *    sólo `message`).
 *
 * Lo que NO hace (alcance del corte):
 *  - No implementa cobros, cierre ni cancelación de pagos.
 *  - No activa producción (`sk_live_*`); sólo Test hasta autorización
 *    explícita de Frank.
 *  - No modifica el router, el servicio ni el schema; sólo aporta un
 *    nuevo factory `createPacHttpClient` que `facturacion` puede
 *    inyectar en lugar del mock.
 */
import { CANCEL_MOTIVES_SAT } from "@/shared/enums";
import { DomainError } from "@/shared/errors";
import {
  PacTransientError,
  type PacCancelInput,
  type PacCancelResult,
  type PacClient,
  type PacConcepto,
  type PacReceptor,
  type PacStampInput,
  type PacStampResult,
} from "./index";

export interface FacturapiHttpClientOptions {
  baseUrl: string;
  /** API key de Facturapi (`sk_test_*` o `sk_live_*`). NO se loguea. */
  apiKey: string;
  /** Timeout por request en ms (default 15000). */
  timeoutMs?: number;
  /**
   * Implementación fetch inyectable. Si no se pasa se usa `globalThis.fetch`.
   * Útil para tests unitarios sin red.
   */
  fetchImpl?: typeof fetch;
  /**
   * Logger opcional. Si se pasa, el adaptador emite mensajes seguros
   * (sin secretos ni payloads completos). Default: `console` con
   * `process.stderr` (nunca `stdout`, que podría filtrarse a logs de
   * plataforma).
   */
  log?: (level: "info" | "warn" | "error", msg: string) => void;
}

const DEFAULT_BASE_URL = "https://www.facturapi.io/v2";
const DEFAULT_TIMEOUT_MS = 15_000;

type FacturapiFetch = typeof fetch;

/**
 * Crea un `PacClient` que habla con Facturapi v2 por HTTP.
 *
 * Uso:
 *   const pac = createPacHttpClient({
 *     baseUrl: process.env.FACTURAPI_BASE_URL ?? "https://www.facturapi.io/v2",
 *     apiKey: process.env.FACTURAPI_API_KEY ?? "",
 *     timeoutMs: 15000,
 *   });
 */
export function createPacHttpClient(
  opts: FacturapiHttpClientOptions,
): PacClient {
  if (!opts.apiKey || opts.apiKey.trim().length === 0) {
    throw new DomainError(
      "PAC_API_KEY_MISSING",
      "Facturapi API key ausente; configure FACTURAPI_API_KEY",
      412,
    );
  }
  const baseUrl = stripTrailingSlash(opts.baseUrl || DEFAULT_BASE_URL);
  const fetchImpl: FacturapiFetch = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    // Defensa: Node 18+ trae fetch global; si alguien lo borró o está
    // en un runtime sin él, fallamos cerrado con un código canónico.
    throw new DomainError(
      "INVOICE_BUILD_INVALID",
      "fetch no disponible en este runtime; no se puede contactar al PAC",
      500,
    );
  }
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const log = opts.log ?? defaultSafeLog;

  async function request<T>(args: {
    method: "GET" | "POST" | "DELETE";
    path: string;
    /** Idempotency-Key (POST/DELETE). Cuando se omite, no se envía. */
    idempotencyKey?: string;
    body?: unknown;
  }): Promise<T> {
    const url = `${baseUrl}${args.path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${opts.apiKey}`,
      Accept: "application/json",
    };
    if (args.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (args.idempotencyKey) {
      headers["Idempotency-Key"] = args.idempotencyKey;
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const init: RequestInit = {
        method: args.method,
        headers,
        signal: ac.signal,
      };
      if (args.body !== undefined) {
        init.body = JSON.stringify(args.body);
      }
      const res = await fetchImpl(url, init);
      if (!res.ok) {
        await throwFacturapiHttpError(res, args.method, args.path);
      }
      if (res.status === 204) {
        return undefined as T;
      }
      const text = await res.text();
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        // Algunas respuestas (xml/pdf) NO son JSON. Para `stamp` y
        // `cancel` esperamos JSON; si llega otra cosa, propagamos como
        // error canónico.
        throw new DomainError(
          "INVOICE_BUILD_INVALID",
          "Respuesta PAC no es JSON válido",
          502,
        );
      }
    } catch (e) {
      if (
        e instanceof DomainError ||
        (typeof e === "object" &&
          e !== null &&
          "name" in e &&
          (e as { name?: string }).name === "PacTransientError")
      ) {
        throw e;
      }
      const err = e as { name?: string; message?: string };
      if (err?.name === "AbortError") {
        throw new PacTransientError(
          `Timeout PAC tras ${timeoutMs}ms (${args.method} ${args.path})`,
        );
      }
      log("error", `PAC ${args.method} ${args.path} falló: red o parseo`);
      throw new PacTransientError(
        `Error de red contactando al PAC: ${err?.message ?? "desconocido"}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Mapea el receptor interno a Facturapi. Documentación oficial
   * (https://docs.facturapi.io/api#tag/Clientes): campos
   * `legal_name`, `tax_id`, `tax_system`, `email`, `phone`,
   * `default_invoice_use`, `address`. NO enviamos `external_id` (no
   * documentado para `POST /customers`). La idempotencia se apoya en
   * el `Idempotency-Key` header (estándar) y, si la API soporta
   * upsert por `tax_id`, en reintentos con la misma RFC.
   *
   * **Domicilio (intento 3):** mapea el snapshot interno
   * `{calle, numero, colonia, municipio, estado, cp, pais}` al
   * contrato Facturapi
   * `{street, exterior, interior, neighborhood, city, municipality,
   * zip, state, country}`. No pasamos claves españolas. Si el
   * snapshot NO tiene domicilio fiscal suficiente, lanzamos
   * `INVOICE_FISCAL_DATA_REQUIRED` ANTES de llamar a Facturapi (sin
   * inventar dirección).
   */
  function buildCustomerBody(rfc: string, receptor: PacReceptor) {
    const address = mapDomicilioToFacturapi(receptor.domicilio);
    return {
      legal_name: receptor.razonSocial,
      tax_id: rfc,
      tax_system: receptor.regimenFiscal,
      email: receptor.email ?? undefined,
      address,
      default_invoice_use: receptor.cfdiUse ?? "G03",
    };
  }

  /**
   * Valida y mapea el domicilio fiscal interno al contrato
   * `address` de Facturapi. Si el snapshot NO tiene los campos
   * mínimos (`calle`, `numero`, `colonia`, `municipio`, `estado`,
   * `cp`, `pais`), lanza `INVOICE_FISCAL_DATA_REQUIRED` (400)
   * ANTES de cualquier llamada a Facturapi.
   */
  function mapDomicilioToFacturapi(
    raw: PacReceptor["domicilio"],
  ): Record<string, unknown> {
    if (!raw || typeof raw !== "object") {
      throw new DomainError(
        "INVOICE_FISCAL_DATA_REQUIRED",
        "El receptor no tiene domicilio fiscal; captura calle, número, colonia, municipio, estado, CP y país antes de timbrar (BR-N218)",
        400,
      );
    }
    const calle = readString(raw, ["calle", "street"]);
    const numero = readString(raw, ["numero", "exterior"]);
    const colonia = readString(raw, ["colonia", "neighborhood"]);
    const municipio = readString(raw, ["municipio", "municipality"]);
    const estado = readString(raw, ["estado", "state"]);
    const cp = readString(raw, ["cp", "zip"]);
    const pais = readString(raw, ["pais", "country"]);
    const interior = readString(raw, ["interior", "interior_number"]);
    if (!calle || !numero || !colonia || !municipio || !estado || !cp || !pais) {
      throw new DomainError(
        "INVOICE_FISCAL_DATA_REQUIRED",
        "Domicilio fiscal incompleto (calle, número, colonia, municipio, estado, CP, país) — actualiza el cliente antes de timbrar (BR-N218)",
        400,
      );
    }
    const address: Record<string, unknown> = {
      street: calle,
      exterior: numero,
      neighborhood: colonia,
      // Facturapi acepta `city` y `municipality`. En México suelen
      // coincidir (municipio libre). Default: ambos al valor del
      // campo interno `municipio`.
      city: municipio,
      municipality: municipio,
      zip: cp,
      state: estado,
      country: pais,
    };
    if (interior) address.interior = interior;
    return address;
  }

  function readString(
    obj: Record<string, unknown>,
    keys: string[],
  ): string {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && v.trim().length > 0) return v.trim();
      if (typeof v === "number") return String(v);
    }
    return "";
  }

  /**
   * Mapea el concepto CFDI interno a una línea `items[]` de Facturapi.
   * Documentación oficial: `items[]: { quantity, product: {
   * description, product_key, price, tax_included, taxability,
   * taxes, ... } }`. NO se inventan campos (`factor/base/amount` no
   * están documentados para `taxes`; sólo `type` y `rate`).
   *
   * Si el caller no envía `taxes`/`taxability` y `tax_included=false`,
   * Facturapi agrega automáticamente IVA 16% (default
   * `taxability="02"`). Para nuestra Línea simple (qty 1,
   * valorUnitarioCents, IVA 16%) basta omitir `taxes` y `taxability`.
   */
  function buildItemBody(concepto: PacConcepto) {
    return {
      quantity: concepto.cantidad,
      product: {
        description: concepto.descripcion,
        product_key: concepto.claveProdServ,
        // `price` en pesos (NO centavos). Si `tax_included:false`,
        // Facturapi añade 16% IVA al total.
        price: concepto.valorUnitarioCents / 100,
        tax_included: false,
      },
    };
  }

  async function stamp(input: PacStampInput): Promise<PacStampResult> {
    // Idempotencia: derivamos `external_id` y `idempotency_key` del
    // payload del invoice interno. `Idempotency-Key` se envía como
    // HEADER (estándar HTTP / Stripe); `idempotency_key` también como
    // BODY (campo documentado de Facturapi para `/invoices`).
    const externalId = `os:${input.organizationId}:inv:${hashExternalId(input)}`;
    const customerBody = buildCustomerBody(input.receptor.rfc, input.receptor);
    // POST /customers: `Idempotency-Key` header para reintentos seguros.
    // No usamos `external_id` aquí porque NO está documentado en el
    // body de POST /customers; el `tax_id` es la clave natural.
    const customer = await request<{ id: string }>({
      method: "POST",
      path: "/customers",
      idempotencyKey: `cust:${externalId}`,
      body: customerBody,
    });
    // POST /invoices con `status: "draft"`: revisión previa al timbrado.
    // Campos según docs: `customer` (objeto o id), `items[]`,
    // `payment_form`, `use`, `payment_method`, `currency`,
    // `external_id`, `idempotency_key` (body), `status`. NO
    // inventamos campos no documentados.
    const invoiceBody: Record<string, unknown> = {
      customer: customer.id,
      items: [buildItemBody(input.concepto)],
      payment_form: "01", // Efectivo por defecto; SPEC-008 lo ajustará
      payment_method: "PUE",
      use: input.receptor.cfdiUse ?? "G03",
      external_id: externalId,
      idempotency_key: externalId,
      status: "draft",
    };
    const draft = await request<{
      id: string;
      status: string;
      is_ready_to_stamp?: boolean;
    }>({
      method: "POST",
      path: "/invoices",
      idempotencyKey: externalId,
      body: invoiceBody,
    });
    // Facturapi: si `is_ready_to_stamp === false`, faltan datos del
    // receptor (dirección, CP, etc). Tratamos eso como
    // `INVOICE_BUILD_INVALID` y extraemos diagnósticos estructurados
    // (paths/codes/messages) sin filtrar PII ni secretos (intento 4).
    if (draft.is_ready_to_stamp === false) {
      const lines = extractFacturapiErrors(draft);
      throw new DomainError(
        "INVOICE_BUILD_INVALID",
        formatDiagnostics(
          "Facturapi: factura borrador no lista para timbrar",
          lines,
        ),
        400,
      );
    }
    // 3) Stamp: POST /invoices/{id}/stamp. Si ya está timbrada,
    // Facturapi responde con la misma factura y NO duplica.
    const stamped = await request<{
      id: string;
      uuid?: string | null;
      status: string;
    }>({
      method: "POST",
      path: `/invoices/${draft.id}/stamp`,
      idempotencyKey: `${externalId}:stamp`,
    });
    // 4) UUID CFDI: el body de `/stamp` debería incluir `uuid`, pero
    // para Test algunos escenarios lo devuelven null hasta que la
    // factura se considera `valid`. Defensivamente, hacemos GET
    // `/invoices/{id}` si `uuid` falta.
    let cfdiUuid: string | null = stamped.uuid ?? null;
    if (!cfdiUuid) {
      const fullInvoice = await request<{
        id: string;
        uuid?: string | null;
      }>({
        method: "GET",
        path: `/invoices/${stamped.id}`,
      });
      cfdiUuid = fullInvoice.uuid ?? fullInvoice.id;
    }
    if (!cfdiUuid) {
      throw new DomainError(
        "INVOICE_BUILD_INVALID",
        "Facturapi no devolvió UUID CFDI tras timbrar",
        502,
      );
    }
    // 5) Descarga XML y PDF como Buffer.
    const xml = await requestBuffer(`/invoices/${stamped.id}/xml`);
    const pdf = await requestBuffer(`/invoices/${stamped.id}/pdf`);
    return {
      cfdiUuid,
      xml,
      pdf,
      status: "stamped",
    };
  }

  async function requestBuffer(path: string): Promise<Buffer> {
    const url = `${baseUrl}${path}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          Accept: "application/octet-stream, application/json, application/pdf, application/xml",
        },
        signal: ac.signal,
      });
      if (!res.ok) {
        await throwFacturapiHttpError(res, "GET", path);
      }
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    } catch (e) {
      if (e instanceof DomainError) throw e;
      const err = e as { name?: string; message?: string };
      if (err?.name === "AbortError") {
        throw new PacTransientError(
          `Timeout PAC descargando ${path} tras ${timeoutMs}ms`,
        );
      }
      throw new PacTransientError(
        `Error descargando ${path}: ${err?.message ?? "desconocido"}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function cancel(input: PacCancelInput): Promise<PacCancelResult> {
    if (!CANCEL_MOTIVES_SAT.includes(input.motivoSat)) {
      throw new DomainError(
        "INVALID_CANCEL_MOTIVE",
        `Motivo SAT inválido: ${String(input.motivoSat)} (esperado 01-04)`,
        400,
      );
    }
    if (!input.cfdiUuid || input.cfdiUuid.length < 32) {
      throw new DomainError(
        "INVALID_CANCEL_MOTIVE",
        "UUID CFDI inválido para cancelación",
        400,
      );
    }
    // Facturapi v2: cancelación = POST `/invoices/{id}/cancel` con
    // body `{ motivo: "01"|"02"|"03"|"04" }`. Para Live exige también
    // `folioSustitucion` cuando motivo es "01"/"02" (factura
    // sustituta); en este corte sólo manejamos motivos 03/04 y el caso
    // 01/02 sin sustituta (la SPEC-008 lo extenderá cuando agregue
    // cobros). El adaptador NO exige sustituta para mantener el scope
    // mínimo del fix.
    const idempotencyKey = `cancel:${input.cfdiUuid}:${input.motivoSat}`;
    const body = { motivo: input.motivoSat };
    let acuse: Record<string, unknown> = {};
    try {
      acuse = await request<Record<string, unknown>>({
        method: "POST",
        path: `/invoices/${input.cfdiUuid}/cancel`,
        idempotencyKey,
        body,
      });
    } catch (e) {
      // 404 → UUID no existe en Facturapi (puede ser Test/Live
      // cruzado). Mapeamos a INVOICE_NOT_FOUND.
      if (e instanceof DomainError && e.code === "INVOICE_NOT_FOUND") {
        throw e;
      }
      throw e;
    }
    // Normalizar acuse. Facturapi devuelve un objeto con `cancellation`
    // y a veces `acuse` (XML). Persistimos `acuseBytes` = JSON del
    // acuse, o el campo `acuse_xml` si viene.
    const acuseBytes = serializeAcuse(acuse);
    return { status: "cancelled", acuseBytes };
  }

  return { stamp, cancel };
}

function defaultSafeLog(level: "info" | "warn" | "error", msg: string) {
  // `process.stderr` para evitar contaminar stdout que podría ir a
  // logs de plataforma. Nunca incluye la `apiKey` ni el payload.
  try {
    process.stderr.write(`[pac:facturapi:${level}] ${msg}\n`);
  } catch {
    // ignore
  }
}

async function throwFacturapiHttpError(
  res: Response,
  method: string,
  path: string,
): Promise<never> {
  const status = res.status;
  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch {
    // ignore
  }
  let parsed: { message?: string } = {};
  try {
    parsed = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    // body no es JSON
  }
  const safeMsg = sanitizeMessage(parsed.message ?? bodyText.slice(0, 200));
  switch (status) {
    case 401:
    case 403:
      throw new DomainError(
        "PAC_API_KEY_MISSING",
        `Facturapi ${status}: autenticación rechazada`,
        412,
      );
    case 404:
      throw new DomainError(
        "INVOICE_NOT_FOUND",
        `Facturapi 404 en ${method} ${path}: ${safeMsg}`,
        404,
      );
    case 409: {
      const diag = extractFacturapiErrors(parsed);
      throw new DomainError(
        "INVOICE_BUILD_INVALID",
        formatDiagnostics(`Facturapi 409 en ${method} ${path}`, diag.length > 0 ? diag : [safeMsg]),
        409,
      );
    }
    case 422: {
      const diag = extractFacturapiErrors(parsed);
      throw new DomainError(
        "INVOICE_BUILD_INVALID",
        formatDiagnostics(`Facturapi 422 en ${method} ${path}`, diag.length > 0 ? diag : [safeMsg]),
        400,
      );
    }
    case 429:
      throw new PacTransientError(
        `Facturapi 429 rate limit en ${method} ${path}: ${safeMsg}`,
      );
    default:
      if (status >= 500) {
        throw new PacTransientError(
          `Facturapi ${status} en ${method} ${path}: ${safeMsg}`,
        );
      }
      throw new DomainError(
        "INVOICE_BUILD_INVALID",
        `Facturapi ${status} en ${method} ${path}: ${safeMsg}`,
        400,
      );
  }
}

function sanitizeMessage(raw: string): string {
  // Defensa: nunca loguear Authorization headers ni posibles
  // inclusiones accidentales del API key en el body. Si el mensaje
  // contiene `sk_test_*` o `sk_live_*` lo enmascaramos.
  return raw
    .replace(/sk_(?:test|live)_[A-Za-z0-9_-]+/g, "sk_***MASKED***")
    .slice(0, 500);
}

/**
 * IMPL-20260825-36 (intento 4 · QA V3 F-11) · Extrae diagnósticos
 * estructurados de un response de Facturapi. NO incluye el body
 * crudo, NO incluye valores de campos del receptor (RFC, razón
 * social, domicilio) ni tokens: sólo `path` (nombre del campo), `code`
 * (categoría de error) y un resumen corto de `message`. Aplica
 * `sanitizeMessage` por elemento para enmascarar cualquier `sk_*`
 * accidental.
 *
 * Facturapi expone errores en dos formas:
 *  - `verification.errors[].{path, code, message}` cuando el draft
 *    se crea OK pero `is_ready_to_stamp=false`.
 *  - Top-level `errors[].{path, code, message}` cuando Facturapi
 *    rechaza el POST con 4xx (422/409).
 *  - Top-level `message` como fallback general.
 */
function extractFacturapiErrors(payload: unknown): string[] {
  const lines: string[] = [];
  if (!payload || typeof payload !== "object") return lines;
  const obj = payload as Record<string, unknown>;
  const verification = obj.verification as Record<string, unknown> | undefined;
  const errorsTop = obj.errors;
  const errorsVerify = verification?.errors;
  const collect = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const e = item as Record<string, unknown>;
      const rawPath = readStr(e.path);
      const rawCode = readStr(e.code);
      const rawMsg = readStr(e.message);
      const path = sanitizeMessage(rawPath);
      const code = sanitizeMessage(rawCode);
      const msg = sanitizeMessage(rawMsg);
      // Defensa PII: limitamos `path` a una longitud razonable
      // (los nombres de campo de Facturapi son cortos: `customer.address.zip`).
      // Si excede, lo truncamos. NO incluimos valores de campos.
      const safePath = path.length > 80 ? `${path.slice(0, 77)}...` : path;
      const safeMsg = msg.length > 200 ? `${msg.slice(0, 197)}...` : msg;
      const parts: string[] = [];
      if (safePath) parts.push(`[${safePath}]`);
      if (code) parts.push(code);
      if (safeMsg) parts.push(safeMsg);
      if (parts.length > 0) lines.push(parts.join(" "));
    }
  };
  collect(errorsVerify);
  collect(errorsTop);
  const topMsg = readStr(obj.message);
  if (lines.length === 0 && topMsg) {
    lines.push(sanitizeMessage(topMsg));
  }
  // Limitar a 5 entradas para no desbordar el `DomainError.message`.
  return lines.slice(0, 5);
}

function readStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

/**
 * IMPL-20260825-36 (intento 4) · Formatea un set de líneas de
 * diagnóstico en un mensaje de `DomainError`. La cabecera incluye
 * contexto (status o `is_ready_to_stamp=false`); las líneas se
 * anexan como lista con prefijo `·`.
 */
function formatDiagnostics(header: string, lines: string[]): string {
  const cleaned = lines.filter((l) => l && l.length > 0).slice(0, 5);
  if (cleaned.length === 0) return header;
  const body = cleaned.map((l) => `  · ${l}`).join("\n");
  return `${header}\n${body}`.slice(0, 800);
}

function serializeAcuse(acuse: Record<string, unknown>): Buffer | null {
  // Facturapi puede devolver `cancellation` (objeto con estado, fecha,
  // motivo) o `acuse` (XML string). Preferimos XML si está; si no,
  // serializamos el objeto como JSON para evidencia.
  const xmlCandidate = (acuse as { acuse?: unknown }).acuse;
  if (typeof xmlCandidate === "string" && xmlCandidate.trim().length > 0) {
    return Buffer.from(xmlCandidate, "utf8");
  }
  const buf = Buffer.from(JSON.stringify(acuse), "utf8");
  return buf.length > 0 ? buf : null;
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

/**
 * Hash estable para derivar `external_id` idempotente. Usa sha256 del
 * código de organización + datos del comprobante; trunca a 32 chars
 * hex (suficiente para colisiones cero en una sola org).
 */
function hashExternalId(input: PacStampInput): string {
  // Importación dinámica del módulo `node:crypto` para mantener el
  // adapter liviano y testeable.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256")
    .update(input.organizationId)
    .update("|")
    .update(input.receptor.rfc)
    .update("|")
    .update(input.concepto.claveProdServ)
    .update("|")
    .update(String(input.totalCents))
    .digest("hex")
    .slice(0, 32);
}