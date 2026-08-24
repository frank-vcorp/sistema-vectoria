/**
 * Barrel del módulo de servicios de Orden de Servicio (SPEC-004).
 */
export {
  createOrdersService,
  placeholderAdvancePaidProvider,
  type AdvancePaidProvider,
  type CreateOrdersServiceOptions,
  type OrderDTO,
  type OrdersService,
} from "./orders";

export {
  buildOsAuthorizedEvent,
  canTransitionTo,
  checkAdvanceThreshold,
  evaluateCloseAdministrative,
  isOrderTerminal,
  nextOrderCode,
  subscriptionRequiresInitialPayment,
  validateOc,
  validateOsReason,
  type AdvanceCheckResult,
  type CloseAdministrativeError,
  type CloseAdministrativeInput,
  type OcValidationResult,
  type OsAuthorizedEvent,
  type ReasonValidation,
  type TransitionError,
} from "./helpers";
