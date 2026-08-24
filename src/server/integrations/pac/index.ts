/**
 * Adaptador PAC (FacturoPorTi) — SPEC-007 + ADR-20260817-09.
 *
 * Patrón **hexagonal** (AC-27 SPEC-001): este módulo NO contiene reglas
 * de negocio. Su responsabilidad es traducir el comprobante CFDI 4.0
 * armado por el servicio `invoices.build` al protocolo del PAC y
 * devolver la respuesta normalizada (UUID + XML + PDF). Cualquier
 * validación de transición, motivo SAT, o negocio de la factura
 * ocurre en el servicio `facturacion`.
 *
 * Cumple AC-1 SPEC-007 / BR-N301 (timbrado real) y BR-N302
 * (CSD/API key cifrados; descifrado sólo aquí). El adaptador recibe
 * el `apiKey` ya descifrado por `facturacion` justo antes del call y
 * lo mantiene en memoria local — nunca se loguea (ADR-03 §3.5).
 *
 * **Mock por defecto en este turno (P-007-1 cerrado en `none`):**
 * Frank aún no carga CSD/API key reales en Coolify/Contabo. El módulo
 * exporta `createPacMockClient()` que simula timbrado y cancelación
 * deterministas y devuelve un CFDI 4.0 sintético pero estructuralmente
 * válido (UUID v4 + XML/PDF con el UUID embebido). La interfaz
 * `PacClient` queda fija: cuando Frank cargue credenciales reales, se
 * sustituye `createPacMockClient` por `createPacHttpClient` (HTTP al
 * PAC FacturoPorTi) sin tocar `facturacion`.
 *
 * Fail-closed:
 *  - `apiKey` ausente o vacío → `PAC_API_KEY_MISSING` (HTTP 412 si el
 *    caller lo traduce; el servicio lo convierte a `CSD_NOT_CONFIGURED`
 *    cuando también falta el CSD — BR-N302).
 *  - `csdCer`/`csdPem` ausentes → `CSD_NOT_CONFIGURED` (412). El
 *    servicio rechaza el timbrado con ese código canónico.
 *
 * Errores transitorios del PAC (5xx/timeout) → `PacTransientError`
 * para que el servicio active reintentos/DLQ (ADR-07).
 *
 * Cancelación con motivo SAT 01-04: el adaptador exige el motivo y lo
 * envía tal cual al PAC. Si no está en la lista → `INVALID_CANCEL_MOTIVE`
 * (400).
 *
 * Log allowlist (ADR-03 §3.5): nunca se loguea `apiKey`, contenido de
 * `.cer`/`.pem`, ni XML/PDF CFDI.
 */
import { createHash, randomUUID } from "node:crypto";
import {
  CANCEL_MOTIVES_SAT,
  type CancelMotiveSat,
} from "@/shared/enums";
import { DomainError } from "@/shared/errors";

/**
 * Resultado de un timbrado exitoso: UUID CFDI + buffers de XML/PDF.
 * El servicio `facturacion` los persiste en `files` (BR-N371) y guarda
 * los IDs en la fila de `invoices`.
 */
export interface PacStampResult {
  cfdiUuid: string;
  xml: Buffer;
  pdf: Buffer;
  /** Marca `accepted` cuando el PAC lo confirma; `stamped` es éxito. */
  status: "stamped" | "accepted";
}

/**
 * Resultado de una cancelación: el PAC devuelve acuse (`acuseBytes`)
 * y/o estado (`cancelled`). Se conserva para evidencia.
 */
export interface PacCancelResult {
  status: "cancelled";
  acuseBytes: Buffer | null;
}

/**
 * Error transitorio (5xx/timeout). El servicio `facturacion` decide
 * reintentar (ADR-07 jobs).
 */
export class PacTransientError extends Error {
  readonly code = "PAC_TRANSIENT";
  constructor(message: string) {
    super(message);
    this.name = "PacTransientError";
  }
}

/**
 * Contrato del adaptador. **Cualquier** implementación (mock o HTTP)
 * cumple esta interfaz. `facturacion` la inyecta vía factory.
 */
export interface PacClient {
  /** Timbra un comprobante y devuelve UUID + XML + PDF. */
  stamp(input: PacStampInput): Promise<PacStampResult>;
  /** Cancela con motivo SAT (01-04). */
  cancel(input: PacCancelInput): Promise<PacCancelResult>;
}

export interface PacStampInput {
  organizationId: string;
  /** Datos descifrados sólo al timbrar (NUNCA se loguean). */
  apiKey: string;
  csdCer: Buffer;
  csdPem: Buffer;
  csdPassword: string;
  /** RFC del emisor (= `organization_fiscal_config.rfc`). */
  rfcEmisor: string;
  /** Datos del receptor (snapshot fiscal del cliente). */
  receptor: PacReceptor;
  /** Línea(s) de CFDI 4.0. */
  concepto: PacConcepto;
  /** Total en centavos MXN. */
  totalCents: number;
}

export interface PacCancelInput {
  organizationId: string;
  apiKey: string;
  cfdiUuid: string;
  motivoSat: CancelMotiveSat;
  /** RFC del emisor. */
  rfcEmisor: string;
}

export interface PacReceptor {
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  domicilio: Record<string, unknown> | null;
  cfdiUse: string | null;
  email?: string | null;
}

export interface PacConcepto {
  claveProdServ: string;
  descripcion: string;
  cantidad: number;
  valorUnitarioCents: number;
  importeCents: number;
  descuentoCents?: number;
  impuestos?: {
    tipoImpuesto: "traslado" | "retencion";
    impuesto: string;
    tasa: number;
    baseCents: number;
    importeCents: number;
  }[];
}

/**
 * Fábrica del cliente PAC. En este turno (P-007-1 cerrado en `none`)
 * siempre devuelve el mock determinista. Cuando Frank cargue
 * credenciales reales, este mismo factory leerá el flag y devolverá
 * `createPacHttpClient(...)` con la URL real.
 */
export function createPacClient(_opts?: {
  endpoint?: string;
  mode?: "mock" | "http";
}): PacClient {
  return createPacMockClient();
}

/**
 * Mock determinista del PAC. Simula timbrado y cancelación sin
 * llamadas externas. **Único** cliente PAC activo en este turno
 * (P-007-1 cerrado en `none` por Frank: no hay credenciales reales).
 *
 *  - `stamp` genera un UUID v4 determinista (hash de `organizationId +
 *    csdCer`), un XML sintético con el UUID y un PDF mínimo. Los bytes
 *    son coherentes para que las pruebas puedan validarlos.
 *  - `cancel` exige motivo SAT 01-04 y devuelve un acuse con el UUID.
 *
 * No usa red ni archivos del filesystem. Determinista en el sentido
 * de "mismas entradas ⇒ misma salida estructural"; el UUID cambia
 * entre invocaciones porque incluye timestamp + nonce en el `seed`.
 */
export function createPacMockClient(): PacClient {
  async function stamp(input: PacStampInput): Promise<PacStampResult> {
    if (!input.apiKey || input.apiKey.trim().length === 0) {
      throw new DomainError(
        "PAC_API_KEY_MISSING",
        "API key del PAC ausente o vacía",
        412,
      );
    }
    if (
      !input.csdCer ||
      input.csdCer.length === 0 ||
      !input.csdPem ||
      input.csdPem.length === 0
    ) {
      throw new DomainError(
        "CSD_NOT_CONFIGURED",
        "CSD (.cer/.pem) ausente; configura el CSD antes de timbrar (BR-N302)",
        412,
      );
    }
    // UUID determinista-ish: hash de orgId+cer+timestamp+nonce. La parte
    // fija permite que tests reproduzcan estructura; el nonce evita
    // colisiones entre invocaciones reales.
    const seed = createHash("sha256")
      .update(input.organizationId)
      .update(input.csdCer)
      .update(Date.now().toString())
      .update(Math.random().toString())
      .digest("hex");
    const cfdiUuid = formatUuidV4FromSeed(seed);
    const xml = buildMockXml({
      uuid: cfdiUuid,
      rfcEmisor: input.rfcEmisor,
      receptor: input.receptor,
      concepto: input.concepto,
      totalCents: input.totalCents,
      stampAt: new Date(),
    });
    const pdf = buildMockPdf({ uuid: cfdiUuid, totalCents: input.totalCents });
    return { cfdiUuid, xml, pdf, status: "stamped" };
  }

  async function cancel(input: PacCancelInput): Promise<PacCancelResult> {
    if (!input.apiKey || input.apiKey.trim().length === 0) {
      throw new DomainError(
        "PAC_API_KEY_MISSING",
        "API key del PAC ausente o vacía",
        412,
      );
    }
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
    const acuse = Buffer.from(
      `PAC-MOCK|ACUSE|${input.cfdiUuid}|${input.motivoSat}|${input.rfcEmisor}|${new Date().toISOString()}`,
      "utf8",
    );
    return { status: "cancelled", acuseBytes: acuse };
  }

  return { stamp, cancel };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos (mock)
// ─────────────────────────────────────────────────────────────────────────────

function formatUuidV4FromSeed(seedHex: string): string {
  // Dripple: tomar los primeros 32 hex chars y forzar version 4 / variant 8/9.
  const hex = seedHex.replace(/[^0-9a-f]/gi, "").padEnd(32, "0").slice(0, 32);
  const chars = hex.split("");
  chars[12] = "4";
  chars[16] = "8";
  return `${chars.slice(0, 8).join("")}-${chars.slice(8, 12).join("")}-${chars
    .slice(12, 16)
    .join("")}-${chars.slice(16, 20).join("")}-${chars.slice(20, 32).join("")}`;
}

function buildMockXml(input: {
  uuid: string;
  rfcEmisor: string;
  receptor: PacReceptor;
  concepto: PacConcepto;
  totalCents: number;
  stampAt: Date;
}): Buffer {
  // XML CFDI 4.0 *sintético* — sólo para evidenciar UUID + importes;
  // no pretende ser SAT-conforme (depende del PAC real).
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"',
    `  Fecha="${input.stampAt.toISOString()}"`,
    `  SubTotal="${(input.concepto.importeCents / 100).toFixed(2)}"`,
    `  Total="${(input.totalCents / 100).toFixed(2)}"`,
    `  Moneda="MXN" TipoDeComprobante="I" Exportacion="01"`,
    `  LugarExpedicion="00000"`,
    `  NoCertificado="00001000000000000000"`,
    `  Sello="(mock)"`,
    '>',
    `  <cfdi:Emisor Rfc="${esc(input.rfcEmisor)}" Nombre="(mock)" RegimenFiscal="601"/>`,
    `  <cfdi:Receptor Rfc="${esc(input.receptor.rfc)}" Nombre="${esc(input.receptor.razonSocial)}" DomicilioFiscalReceptor="${esc(
      (input.receptor.domicilio as { cp?: string } | null)?.cp ?? "00000",
    )}" RegimenFiscalReceptor="${esc(input.receptor.regimenFiscal)}" UsoCFDI="${esc(input.receptor.cfdiUse ?? "G03")}"/>`,
    '  <cfdi:Conceptos>',
    '    <cfdi:Concepto',
    `      ClaveProdServ="${esc(input.concepto.claveProdServ)}"`,
    `      Cantidad="${input.concepto.cantidad}"`,
    `      ClaveUnidad="E48"`,
    `      Descripcion="${esc(input.concepto.descripcion)}"`,
    `      ValorUnitario="${(input.concepto.valorUnitarioCents / 100).toFixed(2)}"`,
    `      Importe="${(input.concepto.importeCents / 100).toFixed(2)}"`,
    '      ObjetoImp="02">',
    '      <cfdi:Impuestos>',
    '        <cfdi:Traslados>',
    '          <cfdi:Traslado Base="' +
      (input.concepto.importeCents / 100).toFixed(2) +
      '" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="' +
      Math.round(input.concepto.importeCents * 0.16) / 100 +
      '"/>',
    '        </cfdi:Traslados>',
    '      </cfdi:Impuestos>',
    '    </cfdi:Concepto>',
    '  </cfdi:Conceptos>',
    '  <cfdi:Complemento>',
    `    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="${input.uuid}" FechaTimbrado="${input.stampAt.toISOString()}" NoCertificadoSAT="00001000000000000000" SelloSAT="(mock)" SelloCFD="(mock)" Version="1.1"/>`,
    '  </cfdi:Complemento>',
    '</cfdi:Comprobante>',
  ];
  return Buffer.from(lines.join("\n"), "utf8");
}

function buildMockPdf(input: {
  uuid: string;
  totalCents: number;
}): Buffer {
  // PDF "fake" determinista: header mínimo + texto plano del UUID.
  // NO es un PDF real (FacturoPorTi/PAC genera el real); sólo sirve
  // para evidenciar el UUID y permitir `signedUrl` en tests.
  const text = `CFDI 4.0 (MOCK) | UUID: ${input.uuid} | Total: $${(input.totalCents / 100).toFixed(2)} MXN | Generado: ${new Date().toISOString()}`;
  return Buffer.from(`%PDF-1.4\n%MOCK PAC FacturoPorTi\n1 0 obj<<>>endobj\nstream\n${text}\nendstream\n%%EOF\n`, "utf8");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * UUID helper: cuando se requiere aleatoriedad criptográfica real
 * (no determinista), `randomUUID` es la fuente.
 */
export const __randomUuid = randomUUID;
