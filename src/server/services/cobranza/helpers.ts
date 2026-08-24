/**
 * Helpers puros del módulo Cobranza y Comisiones (SPEC-008 / B17/B19/B20).
 *
 * Cubre, sin acceso a BD:
 *  - BR-N314-319: transiciones del cobro (`registrado → confirmado →
 *    reversado`) y validación del motivo de reversa.
 *  - BR-012/308: aplicaciones no exceden cobro ni saldo de factura.
 *  - BR-N322/323: validación de actividad de cobranza y de promesa.
 *  - BR-N297-300/BR-N362: cálculo de comisión liberada (`release`)
 *    sobre facturado no cancelado, topeada a estimada (DEC-FUN-49).
 *  - BR-N123: reversa proporcional de comisión al cancelar factura.
 *  - BR-N313/323: condiciones de escalado tras 2 promesas incumplidas.
 *  - BR-N321: tonos de plantilla amable/firme/final según nivel.
 *
 * Funciones deterministas, testeables en aislamiento. El servicio
 * (con BD) vive en `src/server/services/cobranza/*`.
 */
import {
  COLLECTION_ACTIVITY_TYPES,
  COLLECTION_MESSAGE_TONES,
  COMMISSION_REVERSAL_REASONS,
  COMMISSION_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_REVERSE_REASON_MIN_LENGTH,
  PAYMENT_STATUSES,
  type CollectionActivityType,
  type CollectionMessageTone,
  type CommissionStatus,
  type EscalationTone,
  type PaymentMethod,
  type PaymentStatus,
} from "@/shared/enums";

// ─────────────────────────────────────────────────────────────────────────────
// 1) Pagos · transiciones (BR-N314-319)
// ─────────────────────────────────────────────────────────────────────────────

export type PaymentTransitionError =
  | "PAYMENT_NOT_FOUND"
  | "PAYMENT_NOT_EDITABLE"
  | "PAYMENT_NOT_REVERSIBLE"
  | "PAYMENT_REVERSE_REASON_REQUIRED"
  | "PAYMENT_INVALID_TRANSITION";

/**
 * Línea principal:
 *   registrado → confirmado → reversado (terminal)
 *
 * Reglas:
 *  - `registrado` es editable (BR-N315). El caller no invoca
 *    `canTransitionPayment` para editar; sólo para `confirm`/`reverse`.
 *  - `confirmado` sólo se reversa (BR-N315/318).
 *  - `reversado` es terminal.
 *  - `reverse` exige motivo ≥3 caracteres (BR-N318).
 */
export function canTransitionPayment(
  current: PaymentStatus | string,
  target: PaymentStatus | string,
  opts: { reverseReason?: string | null } = {},
): { ok: true } | { ok: false; code: PaymentTransitionError; reason?: string } {
  if (!PAYMENT_STATUSES.includes(current as PaymentStatus)) {
    return { ok: false, code: "PAYMENT_NOT_FOUND" };
  }
  if (!PAYMENT_STATUSES.includes(target as PaymentStatus)) {
    return { ok: false, code: "PAYMENT_INVALID_TRANSITION", reason: "Estado destino inválido" };
  }
  if (current === target) {
    return { ok: false, code: "PAYMENT_INVALID_TRANSITION", reason: "Mismo estado" };
  }
  if (current === "reversado") {
    return { ok: false, code: "PAYMENT_NOT_REVERSIBLE", reason: "reversado es terminal" };
  }
  if (target === "confirmado") {
    if (current !== "registrado") {
      return { ok: false, code: "PAYMENT_INVALID_TRANSITION", reason: "Sólo se confirma un cobro registrado" };
    }
    return { ok: true };
  }
  if (target === "reversado") {
    if (current !== "confirmado") {
      return { ok: false, code: "PAYMENT_NOT_REVERSIBLE", reason: "Sólo se reversa un cobro confirmado" };
    }
    const reason = opts.reverseReason ?? null;
    if (
      typeof reason !== "string" ||
      reason.length < PAYMENT_REVERSE_REASON_MIN_LENGTH
    ) {
      return {
        ok: false,
        code: "PAYMENT_REVERSE_REASON_REQUIRED",
        reason: `Motivo ≥${PAYMENT_REVERSE_REASON_MIN_LENGTH} caracteres (BR-N318)`,
      };
    }
    return { ok: true };
  }
  return { ok: false, code: "PAYMENT_INVALID_TRANSITION", reason: "Transición no soportada" };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Aplicaciones de cobro (BR-012/308)
// ─────────────────────────────────────────────────────────────────────────────

export type ApplicationCheckError =
  | "APPLICATION_EXCEEDS_BALANCE"
  | "PAYMENT_NOT_FOUND"
  | "PAYMENT_INVALID_TRANSITION";

/**
 * Valida que una aplicación de un cobro a una factura no exceda el
 * saldo disponible del cobro ni el saldo de la factura (BR-012/308).
 *
 * `availablePaymentCents` = `payment.amount_cents` − Σ aplicaciones
 * existentes no revertidas.
 * `availableInvoiceCents` = `invoice.total_cents` − `invoice.paid_cents`.
 */
export function validatePaymentApplication(input: {
  amountCents: number;
  availablePaymentCents: number;
  availableInvoiceCents: number;
}): { ok: true } | { ok: false; code: ApplicationCheckError; reason: string } {
  if (typeof input.amountCents !== "number" || input.amountCents <= 0) {
    return {
      ok: false,
      code: "APPLICATION_EXCEEDS_BALANCE",
      reason: "Importe a aplicar debe ser > 0",
    };
  }
  if (input.amountCents > input.availablePaymentCents) {
    return {
      ok: false,
      code: "APPLICATION_EXCEEDS_BALANCE",
      reason: "La aplicación excede el saldo del cobro",
    };
  }
  if (input.amountCents > input.availableInvoiceCents) {
    return {
      ok: false,
      code: "APPLICATION_EXCEEDS_BALANCE",
      reason: "La aplicación excede el saldo de la factura",
    };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Cobranza · actividades y promesas (BR-N322/323)
// ─────────────────────────────────────────────────────────────────────────────

export type CollectionActivityError =
  | "INVOICE_BUILD_INVALID"
  | "PAYMENT_NOT_FOUND"
  | "COMMISSION_NOT_FOUND";

export function validateCollectionActivity(input: {
  type: CollectionActivityType | string;
  promisedAmountCents?: number | null;
  promisedDate?: Date | string | null;
}):
  | { ok: true }
  | { ok: false; code: CollectionActivityError; reason: string } {
  if (!COLLECTION_ACTIVITY_TYPES.includes(input.type as CollectionActivityType)) {
    return {
      ok: false,
      code: "INVOICE_BUILD_INVALID",
      reason: "Tipo de actividad inválido",
    };
  }
  if (input.type === "promesa") {
    if (
      typeof input.promisedAmountCents !== "number" ||
      input.promisedAmountCents <= 0
    ) {
      return {
        ok: false,
        code: "INVOICE_BUILD_INVALID",
        reason: "promesa exige importe prometido > 0",
      };
    }
    if (
      !input.promisedDate ||
      Number.isNaN(new Date(input.promisedDate).getTime())
    ) {
      return {
        ok: false,
        code: "INVOICE_BUILD_INVALID",
        reason: "promesa exige fecha",
      };
    }
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) Comisión · cálculo (BR-N362, DEC-FUN-49) y estados (BR-N297-300)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fórmula canónica del ADR-20260817-10 (BR-N362):
 *   liberada = round(estimada × facturado_no_cancelado / total_OS)
 *   tope    = min(estimada, liberada)
 *
 * Decisión sobre redondeo (R1, ADR §3): usamos `Math.floor` para
 * asegurar que el redondeo siempre redondea hacia abajo en centavos
 * enteros. Esto es conservador: nunca se libera más de lo que
 * corresponde.
 */
export function computeReleasedCents(input: {
  estimatedCents: number;
  totalOrderCents: number;
  /** Suma de facturas no canceladas de la OS, en centavos. */
  nonCancelledInvoicedCents: number;
}): number {
  if (
    typeof input.estimatedCents !== "number" ||
    input.estimatedCents < 0 ||
    typeof input.totalOrderCents !== "number" ||
    input.totalOrderCents <= 0
  ) {
    return 0;
  }
  if (
    typeof input.nonCancelledInvoicedCents !== "number" ||
    input.nonCancelledInvoicedCents <= 0
  ) {
    return 0;
  }
  // cappedAtEstimated evita que el redondeo altere el tope.
  const raw = Math.floor(
    (input.estimatedCents * input.nonCancelledInvoicedCents) /
      input.totalOrderCents,
  );
  return Math.min(input.estimatedCents, Math.max(0, raw));
}

export type CommissionTransitionError =
  | "COMMISSION_NOT_FOUND"
  | "COMMISSION_NOT_PAYABLE"
  | "COMMISSION_ALREADY_PAID"
  | "COMMISSION_RELEASE_EXCEEDS";

/**
 * Transiciones de comisión (BR-N300):
 *   estimada → devengada → liberada → pagada (terminal)
 *   lateral: cancelada (terminal)
 *
 * El helper es determinista; el servicio decide cuándo pasar de
 * `estimada → devengada` (primer cálculo de `liberada`) y de
 * `devengada → liberada` (`liberada > 0`).
 */
export function canTransitionCommission(
  current: CommissionStatus | string,
  target: CommissionStatus | string,
  opts: { releasedCents?: number; paidOnce?: boolean } = {},
): { ok: true } | { ok: false; code: CommissionTransitionError; reason?: string } {
  if (!COMMISSION_STATUSES.includes(current as CommissionStatus)) {
    return { ok: false, code: "COMMISSION_NOT_FOUND" };
  }
  if (!COMMISSION_STATUSES.includes(target as CommissionStatus)) {
    return { ok: false, code: "COMMISSION_NOT_FOUND", reason: "Estado destino inválido" };
  }
  if (current === target) {
    return { ok: false, code: "COMMISSION_NOT_FOUND", reason: "Mismo estado" };
  }
  if (current === "pagada" || current === "cancelada") {
    if (target === "pagada" && opts.paidOnce) {
      return { ok: false, code: "COMMISSION_ALREADY_PAID" };
    }
    return {
      ok: false,
      code: "COMMISSION_NOT_PAYABLE",
      reason: "pagada/cancelada son terminales",
    };
  }
  switch (target) {
    case "devengada":
      if (current !== "estimada") {
        return {
          ok: false,
          code: "COMMISSION_NOT_PAYABLE",
          reason: "Sólo desde `estimada`",
        };
      }
      return { ok: true };
    case "liberada":
      if (current !== "estimada" && current !== "devengada") {
        return {
          ok: false,
          code: "COMMISSION_NOT_PAYABLE",
          reason: "Sólo desde `estimada` o `devengada`",
        };
      }
      if ((opts.releasedCents ?? 0) <= 0) {
        return {
          ok: false,
          code: "COMMISSION_RELEASE_EXCEEDS",
          reason: "No se puede liberar sin importe > 0",
        };
      }
      return { ok: true };
    case "pagada":
      if (current !== "liberada") {
        return {
          ok: false,
          code: "COMMISSION_NOT_PAYABLE",
          reason: "Sólo se paga una comisión `liberada`",
        };
      }
      if ((opts.releasedCents ?? 0) <= 0) {
        return {
          ok: false,
          code: "COMMISSION_RELEASE_EXCEEDS",
          reason: "Liberada debe ser > 0",
        };
      }
      return { ok: true };
    case "cancelada":
      return { ok: true };
    default:
      return {
        ok: false,
        code: "COMMISSION_NOT_FOUND",
        reason: "Transición no soportada",
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) Reversa de comisión al cancelar factura (BR-N123)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula el delta a restar de `released_cents` cuando se cancela
 * una factura con `factura.total_cents = invTotal`. La cancelación
 * reduce el `facturado_no_cancelado`, así que la `liberada` baja
 * proporcionalmente. El delta es **negativo** (lo que se quita).
 */
export function computeReleaseDeltaOnCancel(input: {
  estimatedCents: number;
  totalOrderCents: number;
  /** Facturado no cancelado **antes** de cancelar esta factura. */
  currentNonCancelledCents: number;
  /** Total de la factura cancelada. */
  cancelledInvoiceCents: number;
}): number {
  const before = computeReleasedCents({
    estimatedCents: input.estimatedCents,
    totalOrderCents: input.totalOrderCents,
    nonCancelledInvoicedCents: input.currentNonCancelledCents,
  });
  const afterNonCancelled = Math.max(
    0,
    input.currentNonCancelledCents - input.cancelledInvoiceCents,
  );
  const after = computeReleasedCents({
    estimatedCents: input.estimatedCents,
    totalOrderCents: input.totalOrderCents,
    nonCancelledInvoicedCents: afterNonCancelled,
  });
  // delta = before − after; positivo = cuánto se quita de `released_cents`.
  return Math.max(0, before - after);
}

export function validateCommissionReversalReason(
  reason: string | null | undefined,
): reason is keyof typeof COMMISSION_REVERSAL_REASONS_MAP {
  if (!reason) return false;
  return Object.prototype.hasOwnProperty.call(COMMISSION_REVERSAL_REASONS_MAP, reason);
}

export const COMMISSION_REVERSAL_REASONS_MAP: Record<
  (typeof COMMISSION_REVERSAL_REASONS)[number],
  true
> = COMMISSION_REVERSAL_REASONS.reduce(
  (acc, r) => ({ ...acc, [r]: true }),
  {} as Record<(typeof COMMISSION_REVERSAL_REASONS)[number], true>,
);

// ─────────────────────────────────────────────────────────────────────────────
// 6) Escalado tras 2 promesas incumplidas (BR-N313/323)
// ─────────────────────────────────────────────────────────────────────────────

export const ESCALATION_MIN_BROKEN = 2;

/**
 * Determina si una factura debe escalar. Devuelve `null` si no escala
 * o el tono (`amable` | `firme` | `final`) si escala. El tono se
 * deriva del contador de promesas incumplidas:
 *   2 → `amable`
 *   3 → `firme`
 *   4+ → `final`
 *
 * La plantilla de mensaje (texto) la construye el servicio con
 * `messages.cobranza.plantilla[tono]` (BR-N321).
 */
export function computeEscalation(input: {
  brokenPromisesCount: number;
}): { tone: EscalationTone } | null {
  if (input.brokenPromisesCount < ESCALATION_MIN_BROKEN) {
    return null;
  }
  let tone: EscalationTone;
  if (input.brokenPromisesCount === 2) tone = "amable";
  else if (input.brokenPromisesCount === 3) tone = "firme";
  else tone = "final";
  return { tone };
}

export function isCollectionToneValid(
  tone: string | null | undefined,
): tone is CollectionMessageTone {
  if (!tone) return false;
  return (COLLECTION_MESSAGE_TONES as readonly string[]).includes(tone);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7) Métodos de pago · validación defensiva
// ─────────────────────────────────────────────────────────────────────────────

export function isPaymentMethodValid(
  method: string | null | undefined,
): method is PaymentMethod {
  if (!method) return false;
  return (PAYMENT_METHODS as readonly string[]).includes(method);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8) Resumen de cobranza (util para SPEC-009 dashboard)
// ─────────────────────────────────────────────────────────────────────────────

export interface CollectionSummary {
  totalPendingCents: number;
  totalConfirmedCents: number;
  totalReversedCents: number;
  pendingCount: number;
  confirmedCount: number;
  reversedCount: number;
}

/**
 * Suma agregada de cobros. Sólo lectura; el dashboard la consume
 * (sin servicio, sin BD). SPEC-009 la enriquecerá con cuentas/
 * movimientos cuando se implemente.
 */
export function summarizePayments<
  T extends { status: PaymentStatus | string; amountCents: number },
>(rows: T[]): CollectionSummary {
  const summary: CollectionSummary = {
    totalPendingCents: 0,
    totalConfirmedCents: 0,
    totalReversedCents: 0,
    pendingCount: 0,
    confirmedCount: 0,
    reversedCount: 0,
  };
  for (const r of rows) {
    if (r.status === "registrado") {
      summary.totalPendingCents += r.amountCents;
      summary.pendingCount += 1;
    } else if (r.status === "confirmado") {
      summary.totalConfirmedCents += r.amountCents;
      summary.confirmedCount += 1;
    } else if (r.status === "reversado") {
      summary.totalReversedCents += r.amountCents;
      summary.reversedCount += 1;
    }
  }
  return summary;
}
