/**
 * Helpers puros del módulo Comercial (SPEC-003).
 *
 * Sin acceso a BD / sesión. Son funciones deterministas testeables en
 * aislamiento. Los servicios (`createXService()`) los usan y los tests
 * Vitest los importan directamente.
 */
import {
  DISCOUNT_BLOCKED_PCT,
  DISCOUNT_FREE_LIMIT_PCT,
  PRESUPUESTO_WARNING_MULTIPLIER,
  QUOTE_MIN_VALIDITY_DAYS,
} from "@/shared/enums";

/**
 * SPEC-003 §4.2 / BR-N143 · Política de descuentos por rol.
 * Devuelve `{ ok: true }` si el descuento es válido para el actor;
 * `{ ok: false, code, status }` si requiere Director o está bloqueado.
 *
 * `discountPct` ∈ [0, 100]. El actor se modela con sus permisos.
 */
export type DiscountPolicyResult =
  | { ok: true }
  | { ok: false; code: "DISCOUNT_NEEDS_DIRECTOR"; status: 403 }
  | { ok: false; code: "DISCOUNT_EXCEEDS_LIMIT"; status: 409 };

export function validateDiscountByRole(
  discountPct: number,
  hasApproveDiscount: boolean,
): DiscountPolicyResult {
  if (!Number.isFinite(discountPct) || discountPct < 0) {
    return { ok: false, code: "DISCOUNT_EXCEEDS_LIMIT", status: 409 };
  }
  if (discountPct > DISCOUNT_BLOCKED_PCT) {
    // > 25% bloqueado sin excepción.
    return { ok: false, code: "DISCOUNT_EXCEEDS_LIMIT", status: 409 };
  }
  if (discountPct <= DISCOUNT_FREE_LIMIT_PCT) {
    return { ok: true };
  }
  // 10 < pct ≤ 25 → requiere Director (`aprobar_descuento`).
  if (!hasApproveDiscount) {
    return { ok: false, code: "DISCOUNT_NEEDS_DIRECTOR", status: 403 };
  }
  return { ok: true };
}

/**
 * SPEC-003 / BR-N411 / AC-12 · Advertencia de desviación presupuestal.
 *
 *  - `presupuesto_declarado_cents` null/0 ⇒ sin advertencia.
 *  - `total_cents > 1.5 × presupuesto_declarado_cents` ⇒ `warn=true`.
 *
 * Caso histórico H-20260817-09: declarado 80,000 MXN (8,000,000¢),
 * total 209,931 MXN (20,993,100¢) → `warn=true`. Caso de control:
 * declarado 80,000 MXN, total 100,000 MXN → `warn=false`.
 */
export interface PresupuestoWarning {
  warn: boolean;
  presupuestoCents: number | null;
  totalCents: number;
  ratio: number | null;
}

export function evaluatePresupuestoWarning(input: {
  presupuestoDeclaradoCents: number | null | undefined;
  totalCents: number;
}): PresupuestoWarning {
  const presupuesto =
    input.presupuestoDeclaradoCents == null
      ? null
      : Math.max(0, Math.floor(input.presupuestoDeclaradoCents));
  const total = Math.max(0, Math.floor(input.totalCents));
  if (presupuesto == null || presupuesto <= 0) {
    return {
      warn: false,
      presupuestoCents: presupuesto,
      totalCents: total,
      ratio: null,
    };
  }
  const ratio = total / presupuesto;
  const warn = total > PRESUPUESTO_WARNING_MULTIPLIER * presupuesto;
  return {
    warn,
    presupuestoCents: presupuesto,
    totalCents: total,
    ratio,
  };
}

/**
 * SPEC-003 / BR-N235 · Vigencia mínima 7 días. Compara `validUntil`
 * (ms epoch) contra `now` (ms epoch). Retorna true si la diferencia
 * es ≥ `QUOTE_MIN_VALIDITY_DAYS` días.
 */
export function meetsMinimumValidity(
  validUntilMs: number,
  nowMs: number = Date.now(),
): boolean {
  const diffMs = validUntilMs - nowMs;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= QUOTE_MIN_VALIDITY_DAYS;
}

/**
 * SPEC-003 / BR-N236 · Validez vigente (`!expired && now ≤ validUntil`).
 */
export function isWithinValidity(
  validUntilMs: number | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (validUntilMs == null) return false;
  return validUntilMs >= nowMs;
}

/**
 * SPEC-003 / B26 / BR-N357-360 · Cálculo puro de totales de cotización.
 *
 * Reglas:
 *  - `line_total = qty * unit_price - discount` (BR-N357).
 *  - `subtotal = Σ line_total` (positivos y negativos).
 *  - `discount_total = Σ line_total(kind=discount)` que ya viene
 *    como descuento explícito (línea tipo `discount` con `unit_price`
 *    o `discount_cents` negativos).
 *  - `tax_cents = round((subtotal − line_discount_total) * 0.16)` (BR-N358).
 *  - `total = subtotal − line_discount_total + tax_cents` (BR-N359/360).
 *
 * El descuento por porcentaje (`discountPct`) opera sobre `subtotal`
 * positivo y se aplica como descuento explícito; el servicio caller
 * pasa `items` ya con los descuentos por línea aplicados.
 */
export interface QuoteCalcInputItem {
  kind: "service" | "license" | "expense" | "discount";
  qty: number;
  unitPriceCents: number;
  discountCents: number;
}

export interface QuoteCalcResult {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  /** Totales por línea (BR-N357). */
  lineTotals: number[];
}

export const QUOTE_TAX_RATE = 0.16;

export function calculateQuote(
  items: readonly QuoteCalcInputItem[],
): QuoteCalcResult {
  const lineTotals: number[] = [];
  let subtotal = 0;
  let lineDiscountTotal = 0;
  for (const item of items) {
    const qty = Math.max(0, Math.floor(item.qty));
    const unit = Math.max(0, Math.floor(item.unitPriceCents));
    const disc = Math.max(0, Math.floor(item.discountCents));
    let lineTotal = qty * unit - disc;
    if (item.kind === "discount") {
      // Las líneas de descuento explícito: pueden ser negativas.
      lineTotal = qty * unit - disc; // admite negativo
      lineDiscountTotal += lineTotal; // suma como descuento
    }
    lineTotals.push(lineTotal);
    subtotal += lineTotal;
  }
  // Para descuento explícito, `subtotal` ya refleja el descuento.
  // Aplicamos IVA sobre el subtotal-positivo (BR-N358: IVA sobre la base).
  const taxBase = Math.max(0, subtotal);
  const taxCents = Math.round(taxBase * QUOTE_TAX_RATE);
  const total = subtotal + taxCents;
  return {
    subtotalCents: subtotal,
    discountCents: lineDiscountTotal,
    taxCents,
    totalCents: total,
    lineTotals,
  };
}

/**
 * SPEC-003 §4.2 / BR-N220 · **Regla de oro**: el sistema genera el spec;
 * vendedor/IA no lo escriben (DEC-FUN-23, ARCH-20260817-08 §3.2 opción
 * A). El motor `generateScopeDraft` se auxilia en una **función pura**
 * que produce un esqueleto a partir del cuestionario contestado, el
 * catálogo y la plantilla; **NO** invoca APIs externas.
 */
export interface ScopeDraftInput {
  /** Tipos de proyecto declarados en el cuestionario (DEC-FUN-53). */
  declaredProjectType: string | null;
  /** Lista de códigos de servicio seleccionados. */
  selectedServiceCodes: string[];
  /** Lista de respuestas relevantes (códigos). */
  answeredQuestionCodes: string[];
  /** Bloques de la plantilla (project_modules base, BR-N229). */
  templateModules: Array<{ code: string; name: string; required: boolean }>;
}

export interface ScopeDraftBlock {
  included: string[];
  excluded: string[];
  deliverables: string[];
  assumptions: string[];
  clientDependencies: string[];
  acceptanceCriteria: string[];
}

export interface ScopeDraftContent {
  projectType: string | null;
  blocks: ScopeDraftBlock;
  generatedAt: string; // ISO timestamp del sistema
}

export function generateScopeDraftContent(input: ScopeDraftInput): ScopeDraftContent {
  const blocks: ScopeDraftBlock = {
    included: [],
    excluded: [],
    deliverables: [],
    assumptions: [],
    clientDependencies: [],
    acceptanceCriteria: [],
  };
  for (const m of input.templateModules) {
    if (m.required) {
      blocks.included.push(`${m.name} (${m.code})`);
    } else {
      blocks.excluded.push(`${m.name} (${m.code})`);
    }
    blocks.deliverables.push(`Entregable: ${m.name}`);
    blocks.acceptanceCriteria.push(
      `Criterio verificable para ${m.code}: funcional, accesible y operativamente estable.`,
    );
  }
  if (input.selectedServiceCodes.length > 0) {
    blocks.included.push(
      `Servicios seleccionados: ${input.selectedServiceCodes.join(", ")}`,
    );
  }
  if (input.answeredQuestionCodes.length > 0) {
    blocks.assumptions.push(
      `Cuestionario de sondeo respondido (${input.answeredQuestionCodes.length} preguntas).`,
    );
  }
  blocks.clientDependencies.push(
    "Acceso a repositorio / infraestructura del cliente",
  );
  blocks.clientDependencies.push(
    "Disponibilidad del responsable del cliente para validaciones",
  );
  return {
    projectType: input.declaredProjectType,
    blocks,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * SPEC-003 §4.1 · `requires_initial_payment` (BR-N239). Sólo
 * `tipo_cobro='suscripcion'` requiere pago inicial.
 */
export function computeRequiresInitialPayment(
  tipoCobro: "pago_unico" | "mensualidades" | "suscripcion",
): boolean {
  return tipoCobro === "suscripcion";
}

/**
 * SPEC-003 / BR-N25 · Determina si una aceptación crearía una segunda
 * cotización aceptada para el mismo prospecto. `existingAccepted` son
 * los IDs ya aceptados. Retorna `true` si la nueva aceptación
 * (`prospectId`) ya está en la lista.
 */
export function wouldExceedAcceptedPerProspect(
  prospectId: string,
  existingAcceptedForProspect: number,
): boolean {
  return existingAcceptedForProspect > 0 && prospectId != null;
}

/**
 * SPEC-003 / BR-N234 · Polimorfismo de ítems: valida que un ítem
 * pertenezca a uno de los 4 kinds conocidos.
 */
export function isKnownQuoteItemKind(
  kind: string,
): kind is "service" | "license" | "expense" | "discount" {
  return kind === "service" || kind === "license" || kind === "expense" || kind === "discount";
}

/**
 * SPEC-003 / BR-N228 · 9 plantillas canónicas esperadas (4 web + 5 otros).
 * Sirve para validar el sembrado (P-003-1) y como referencia de la UI.
 */
export const EXPECTED_TEMPLATE_TYPES = [
  "web_landing",
  "web_sitio",
  "web_app",
  "web_saas",
  "mobile_app",
  "branding",
  "marketing",
  "consultoria",
  "soporte",
] as const;
export const EXPECTED_TEMPLATE_COUNT = 9;

/**
 * SPEC-003 / P-003-1 · 6 cuestionarios seed (conteo Frank).
 * Sirve como contrato del sembrado; el nombre es libre, el conteo no.
 */
export const EXPECTED_QUESTIONNAIRE_COUNT = 6;

/**
 * Siguiente código por organización (BR-N216 análogo): `QT-NNNN`.
 */
export async function nextQuoteCode(
  orgId: string,
  dbExecutor: {
    selectMax: (orgId: string) => Promise<string | null>;
  },
): Promise<string> {
  const last = await dbExecutor.selectMax(orgId);
  if (!last) return "QT-0001";
  const m = /^QT-(\d{1,})$/.exec(last);
  if (!m || !m[1]) return "QT-0001";
  const n = (parseInt(m[1], 10) + 1).toString().padStart(4, "0");
  return `QT-${n}`;
}
