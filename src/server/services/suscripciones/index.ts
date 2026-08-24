/**
 * Barrel del módulo de servicios de Suscripciones (SPEC-011 · B20a).
 */
export {
  createSuscripcionesService,
  type SuscripcionesService,
  type SubscriptionDTO,
  type SubscriptionPeriodDTO,
  type SubscriptionHistoryDTO,
  type SubscriptionFacturacionRowDTO,
  type SubscriptionCobranzaRowDTO,
  type SubscriptionDetailDTO,
  type SubscriptionListResultDTO,
  type SubscriptionHistoryListResultDTO,
  type SubscriptionFacturacionResultDTO,
  type SubscriptionCobranzaResultDTO,
  type RenewResultDTO,
} from "./suscripciones-service";
export {
  canTransition,
  computeNextPeriodStart,
  computePeriodEnd,
  isSamePeriod,
  isValidHistoryAction,
  isValidPeriodicity,
  isValidStatus,
  qualifiesForSubscription,
  validateReason,
} from "./helpers";
