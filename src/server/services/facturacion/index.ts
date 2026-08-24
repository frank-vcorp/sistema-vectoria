/**
 * Barrel del módulo de servicios de Facturación CFDI (SPEC-007 / B18).
 *
 * Los routers tRPC y los jobs importan desde aquí. La UI **nunca**
 * importa desde aquí directamente (verificado por grep anti-patrón en
 * `scripts/check-antipatterns.ts`).
 *
 * Servicios:
 *  - `invoices` (SPEC-007 AC-1..AC-8): buildFromOrder, timbrar,
 *    cancel, applyPayment, revertPayment, markVencida, zipContador,
 *    createDraftFromSubscriptionRenewal (consumida por SPEC-011).
 *  - `schedules` (BR-N310): create, list, skip, run (idempotente).
 *  - `helpers` (puros): transiciones, motivo SAT, calendar visual,
 *    CFDI build, ZIP filter, UUID v4.
 *  - PAC adapter (hexagonal, mock por defecto en este turno).
 */
export {
  createInvoicesService,
  type InvoiceDTO,
  type InvoicePreviewDTO,
  type InvoiceApplicationDTO,
  type InvoiceScheduleDTO,
  type CreateInvoicesServiceOptions,
  type InvoiceService,
} from "./invoices";

export {
  buildCfdiConcept,
  buildDraftFromSubscriptionRenewal,
  canTransitionInvoice,
  isInvoiceVencida,
  isValidCancelMotive,
  isValidCfdiUuid,
  nextScheduleJobKey,
  revertInvoiceApplication,
  selectZipFacturas,
  validateCancelReason,
  validateInvoiceApplication,
  validateScheduleInput,
  invoiceCalendarVisualStatus,
  isScheduleStatusTerminal,
  CALENDAR_VISUAL_STATUS_COUNT,
  IVA_RATE,
  type CfdiConceptInput,
  type CfdiConceptOutput,
  type CfdiTotals,
  type InvoiceTransitionError,
  type ApplicationCheckError,
  type ScheduleValidationError,
} from "./helpers";

/**
 * Re-exports del adaptador PAC (mock por defecto en este turno).
 * Tests y servicios lo usan para timbrado/cancelación. El router NO
 * importa directamente: `createInvoicesService` ya inyecta el PAC.
 */
export {
  createPacMockClient,
  PacTransientError,
  type PacClient,
  type PacStampInput,
  type PacCancelInput,
  type PacStampResult,
  type PacCancelResult,
} from "@/server/integrations/pac";
