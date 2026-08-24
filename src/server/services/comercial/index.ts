/**
 * Barrel del módulo de servicios Comerciales (SPEC-003).
 */
export {
  calculateQuote,
  computeRequiresInitialPayment,
  evaluatePresupuestoWarning,
  EXPECTED_QUESTIONNAIRE_COUNT,
  EXPECTED_TEMPLATE_COUNT,
  EXPECTED_TEMPLATE_TYPES,
  generateScopeDraftContent,
  isKnownQuoteItemKind,
  isWithinValidity,
  meetsMinimumValidity,
  nextQuoteCode,
  QUOTE_TAX_RATE,
  validateDiscountByRole,
  wouldExceedAcceptedPerProspect,
  type DiscountPolicyResult,
  type PresupuestoWarning,
  type QuoteCalcInputItem,
  type QuoteCalcResult,
  type ScopeDraftBlock,
  type ScopeDraftContent,
  type ScopeDraftInput,
} from "./helpers";

export {
  createCatalogService,
  type CatalogService,
  type CatalogServiceDTO,
  type CatalogServiceInput,
} from "./catalog";

export {
  createTemplatesService,
  type TemplateDTO,
  type TemplateService,
} from "./templates";

export {
  createQuestionnairesService,
  type QuestionnaireDTO,
  type QuestionnaireQuestionDTO,
  type QuestionnaireResponseDTO,
  type QuestionnaireService,
} from "./questionnaires";

export {
  createScopeService,
  type ScopeDraftDTO,
  type ScopeService,
} from "./scope";

export {
  createQuotesService,
  type CreateQuoteItemInput,
  type QuoteDTO,
  type QuoteItemDTO,
  type QuotesService,
} from "./quotes";
