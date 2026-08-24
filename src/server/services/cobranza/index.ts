/**
 * Barrel del módulo de servicios de Cobranza y Comisiones (SPEC-008
 * / B17/B19/B20). Los routers tRPC y los jobs importan desde aquí.
 *
 * Servicios:
 *  - `cobros` (SPEC-008 AC-1..AC-3): register/update/confirm/reverse/apply.
 *  - `comisiones` (SPEC-008 AC-4..AC-7/AC-9): estimate/release/
 *    reverseOnCancel/pay/cancelOnOsCancel.
 *  - `cobranza` (SPEC-008 AC-8): createActivity/fulfillPromise/
 *    evaluateEscalation.
 *  - `helpers` (puros): transiciones de pago/aplicación/actividad/
 *    comisión; cálculo de liberada (BR-N362) y delta (BR-N123);
 *    escalado (BR-N313); summary.
 */
export {
  createCobrosService,
  type CobrosService,
  type PaymentDTO,
  type PaymentApplicationDTO,
  type CreateCobrosServiceOptions,
} from "./cobros";

export {
  createComisionesService,
  type ComisionesService,
  type CommissionDTO,
  type CommissionReversalDTO,
  type CreateComisionesServiceOptions,
} from "./comisiones";

export {
  createCobranzaService,
  type CobranzaService,
  type CollectionActivityDTO,
  type CollectionPromiseDTO,
  type EscalationResult,
  type CreateCobranzaServiceOptions,
} from "./cobranza-service";

export {
  canTransitionPayment,
  validatePaymentApplication,
  validateCollectionActivity,
  computeReleasedCents,
  computeReleaseDeltaOnCancel,
  canTransitionCommission,
  computeEscalation,
  isCollectionToneValid,
  isPaymentMethodValid,
  summarizePayments,
  validateCommissionReversalReason,
  COMMISSION_REVERSAL_REASONS_MAP,
  ESCALATION_MIN_BROKEN,
  type ApplicationCheckError,
  type CollectionActivityError,
  type CommissionTransitionError,
  type PaymentTransitionError,
  type CollectionSummary,
} from "./helpers";
