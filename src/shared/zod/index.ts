/**
 * Esquemas Zod compartidos entre servicios y tRPC (AC-29). La UI también los
 * consume vía `react-hook-form` + `zodResolver`. Estos esquemas son la
 * única fuente de validación de entrada/salida.
 */
import { z } from "zod";
import {
  ACCEPTANCE_MEDIUMS,
  ACCOUNT_TYPES,
  BASE_PERMISSIONS,
  BILLING_CYCLES,
  CANCEL_MOTIVES_SAT,
  CHANGE_REQUEST_EVIDENCE_KINDS,
  CHANGE_REQUEST_STATUSES,
  CLIENT_STATUSES,
  COLLECTION_ACTIVITY_TYPES,
  COLLECTION_MESSAGE_TONES,
  COMMISSION_REVERSAL_REASONS,
  COMMISSION_STATUSES,
  DASHBOARD_DEFAULT_VIEWS,
  DASHBOARD_WIDGET_CODES,
  DELIVERABLE_STATUSES,
  ESCALATION_TONES,
  HEALTH_REASON_MIN_LENGTH,
  INVOICE_SCHEDULE_STATUSES,
  INVOICE_STATUSES,
  JOB_STATUSES,
  MODULE_HEALTHS,
  MODULE_STATUSES,
  NON_OPERATIVE_KINDS,
  NOTIFICATION_EVENT_TYPES,
  ORDER_STATUSES,
  OS_REASON_MIN_LENGTH,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PROSPECT_MEDIUMS,
  PROSPECT_STATUSES,
  PROJECT_HEALTHS,
  PROJECT_LOG_ENTRY_TYPES,
  PROJECT_MEMBER_ROLES,
  PROJECT_SITUATIONS,
  PROJECT_STAGES,
  QUESTIONNAIRE_ANSWER_TYPES,
  QUESTIONNAIRE_LAYERS,
  QUESTIONNAIRE_STATUSES,
  QUESTIONNAIRE_VERSIONS,
  QUOTE_ITEM_KINDS,
  QUOTE_STATUSES,
  REQUIREMENT_STATUSES,
  SCOPE_STATUSES,
  SCHEDULE_AUTO_OR_DRAFT_KINDS,
  SERVICE_TYPES,
  SUBSCRIPTION_HISTORY_ACTIONS,
  SUBSCRIPTION_PERIOD_STATUSES,
  SUBSCRIPTION_PERIODICITIES,
  SUBSCRIPTION_STATUSES,
  TASK_STATUSES,
  TEMPLATE_TYPES,
  TEST_STATUSES,
  TEST_TYPES,
  TIME_ENTRY_KINDS,
  TIPO_COBRO,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from "@/shared/enums";

export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().email().toLowerCase();

/**
 * Password policy (ADR-03 §3.3, AC-20): mínimo 12 caracteres, mix de clases
 * (minúsculas, mayúsculas, dígito, símbolo). Validación previa al hash.
 */
export const passwordSchema = z
  .string()
  .min(12, "La contraseña debe tener al menos 12 caracteres")
  .max(256, "La contraseña no puede exceder 256 caracteres")
  .refine((s) => /[a-z]/.test(s), "Debe incluir al menos una minúscula")
  .refine((s) => /[A-Z]/.test(s), "Debe incluir al menos una mayúscula")
  .refine((s) => /\d/.test(s), "Debe incluir al menos un dígito")
  .refine((s) => /[^A-Za-z0-9]/.test(s), "Debe incluir al menos un símbolo");

/**
 * `Context` abstracto (SOL inv.5, AC-30, AC-71).
 * Es el único canal por el que la identidad llega a los servicios.
 * NO incluye `cookies`/`headers`/transporte.
 *
 * `user` es **nullable** cuando no hay sesión (AC-71: no se fabrica
 * identidad UUID cero; `protectedProcedure` lanza `UNAUTHORIZED` real).
 */
export const ContextSchema = z.object({
  user: z
    .object({
      id: uuidSchema,
      organization_id: uuidSchema,
    })
    .nullable(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  requestId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  actorRoleCode: z.string().optional(),
});
export type Context = z.infer<typeof ContextSchema>;

export const PermissionCodeSchema = z.enum(BASE_PERMISSIONS);
export const NotificationEventTypeSchema = z.enum(NOTIFICATION_EVENT_TYPES);
export const ProjectLogEntryTypeSchema = z.enum(PROJECT_LOG_ENTRY_TYPES);
export const JobStatusSchema = z.enum(JOB_STATUSES);

// SPEC-002 (Clientes/Prospectos): enums de dominio en código fuente único.
export const ProspectMediumSchema = z.enum(PROSPECT_MEDIUMS);
export const ProspectStatusSchema = z.enum(PROSPECT_STATUSES);
export const ClientStatusSchema = z.enum(CLIENT_STATUSES);

/**
 * DTOs de paginación (AC-17).
 */
export const PaginationInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
});
export type PaginationInput = z.infer<typeof PaginationInputSchema>;

export const PaginatedOutputSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    limit: z.number().int(),
    offset: z.number().int(),
  });

/**
 * DTOs de auditoría (BR-N336).
 */
export const AuditInputSchema = z.object({
  entityType: z.string().min(1),
  entityId: uuidSchema,
  action: z.string().min(1),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  reason: z.string().optional(),
});
export type AuditInput = z.infer<typeof AuditInputSchema>;

/**
 * AAD canónico determinista (ADR-03 §9.1):
 *   `"{organization_id}|{schema}.{table}|{column}"`
 */
export function buildAad(orgId: string, table: string, column: string): string {
  return `${orgId}|public.${table}|${column}`;
}

/**
 * Helpers de timezone (AC-24) y moneda (AC-25).
 */
export const CURRENCY_SCHEMA = z.string().length(3).default("MXN");

/**
 * SPEC-002 · DTOs y entradas de prospectos / clientes / contactos / datos
 * fiscales del cliente. Todos preservan la frontera del transporte (AC-29)
 * y son consumibles por servicios, routers y UI (`react-hook-form`).
 */

/** Código de prospecto por organización (BR-N216, único por org). */
export const ProspectCodeSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/u, "Sólo letras, dígitos, guion y guion bajo");

export const ProspectCreateInputSchema = z.object({
  code: ProspectCodeSchema,
  name: z.string().min(1).max(120),
  company: z.string().max(160).optional(),
  email: z.string().email().optional().or(z.literal("").transform(() => undefined)),
  phone: z.string().max(40).optional(),
  source: z.string().max(80).optional(),
  medium: ProspectMediumSchema.optional(),
  assignedTo: uuidSchema.optional(),
});
export type ProspectCreateInput = z.infer<typeof ProspectCreateInputSchema>;

export const ProspectQualifyInputSchema = z.object({
  prospectId: uuidSchema,
  /** BR-N148: cuestionario vinculado; SPEC-003 lo emite. Aquí validamos presencia. */
  questionnaireId: uuidSchema,
});
export type ProspectQualifyInput = z.infer<typeof ProspectQualifyInputSchema>;

export const ProspectLostInputSchema = z.object({
  prospectId: uuidSchema,
  /** BR-N213: motivo obligatorio para pasar a `perdido`. */
  reason: z.string().min(3).max(280),
});
export type ProspectLostInput = z.infer<typeof ProspectLostInputSchema>;

export const ProspectSuspendInputSchema = z.object({
  prospectId: uuidSchema,
  /** BR-N214: motivo obligatorio para pasar a `suspendido` (reactivable). */
  reason: z.string().min(3).max(280),
});
export type ProspectSuspendInput = z.infer<typeof ProspectSuspendInputSchema>;

export const ProspectReactivateInputSchema = z.object({
  prospectId: uuidSchema,
});
export type ProspectReactivateInput = z.infer<typeof ProspectReactivateInputSchema>;

/** BR-N216: número único por organización, generado por el servicio. */
export const ClientCreateFromProspectInputSchema = z.object({
  prospectId: uuidSchema,
});
export type ClientCreateFromProspectInput = z.infer<
  typeof ClientCreateFromProspectInputSchema
>;

export const ClientArchiveInputSchema = z.object({
  clientId: uuidSchema,
  /** BR-N215 / BR-N213: motivo obligatorio para archivar. */
  reason: z.string().min(3).max(280),
});
export type ClientArchiveInput = z.infer<typeof ClientArchiveInputSchema>;

export const ClientContactInputSchema = z.object({
  clientId: uuidSchema,
  name: z.string().min(1).max(120),
  role: z.string().max(80).optional(),
  email: z.string().email().optional().or(z.literal("").transform(() => undefined)),
  phone: z.string().max(40).optional(),
  isMain: z.boolean().optional(),
});
export type ClientContactInput = z.infer<typeof ClientContactInputSchema>;

export const ClientContactUpdateInputSchema = z.object({
  contactId: uuidSchema,
  name: z.string().min(1).max(120).optional(),
  role: z.string().max(80).optional(),
  email: z.string().email().optional().or(z.literal("").transform(() => undefined)),
  phone: z.string().max(40).optional(),
  isMain: z.boolean().optional(),
});
export type ClientContactUpdateInput = z.infer<typeof ClientContactUpdateInputSchema>;

export const ClientFiscalUpsertInputSchema = z.object({
  clientId: uuidSchema,
  rfc: z
    .string()
    .regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/u, "RFC inválido")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  razonSocial: z.string().max(160).optional(),
  regimen: z.string().max(40).optional(),
  cfdiUse: z.string().max(8).optional(),
  domicilio: z
    .object({
      calle: z.string().max(120).optional(),
      numero: z.string().max(20).optional(),
      colonia: z.string().max(120).optional(),
      municipio: z.string().max(120).optional(),
      estado: z.string().max(80).optional(),
      cp: z.string().max(10).optional(),
      pais: z.string().max(40).optional(),
    })
    .optional(),
});
export type ClientFiscalUpsertInput = z.infer<typeof ClientFiscalUpsertInputSchema>;


/**
 * SPEC-003 (Comercial) · Esquemas Zod del módulo.
 * Coherentes con `src/shared/enums` (enums como dato en código).
 */

// Cuestionarios (B4)
export const QuestionnaireLayerSchema = z.number().int().min(1).max(4) as unknown as z.ZodType<(typeof QUESTIONNAIRE_LAYERS)[number]>;
export const QuestionnaireAnswerTypeSchema = z.enum(QUESTIONNAIRE_ANSWER_TYPES);
export const QuestionnaireStatusSchema = z.enum(QUESTIONNAIRE_STATUSES);
export const QuestionnaireVersionSchema = z.enum(QUESTIONNAIRE_VERSIONS);

// Catálogo (B5)
export const ServiceTypeSchema = z.enum(SERVICE_TYPES);
export const BillingCycleSchema = z.enum(BILLING_CYCLES);

// Plantillas (B5)
export const TemplateTypeSchema = z.enum(TEMPLATE_TYPES);

// Alcance (B6)
export const ScopeStatusSchema = z.enum(SCOPE_STATUSES);

// Cotización (B7)
export const QuoteStatusSchema = z.enum(QUOTE_STATUSES);
export const QuoteItemKindSchema = z.enum(QUOTE_ITEM_KINDS);
export const TipoCobroSchema = z.enum(TIPO_COBRO);
export const AcceptanceMediumSchema = z.enum(ACCEPTANCE_MEDIUMS);

/**
 * SPEC-003 / BR-N411 · Monto en centavos MXN. Acepta enteros >=0
 * (presupuesto) o cualquier entero (validación en servicio).
 */
export const CentsSchema = z.number().int().min(0);

/**
 * SPEC-003 / BR-N235 · Vigencia mínima 7 días (default).
 * El servicio exige `validUntil - now >= 7 días` en BR-N235.
 */
export const QuoteCodeSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/u, "Sólo letras, dígitos, guion y guion bajo");

export const QuestionnaireCodeSchema = QuoteCodeSchema;
export const CatalogServiceCodeSchema = QuoteCodeSchema;
export const TemplateCodeSchema = QuoteCodeSchema;

/**
 * SPEC-003 §4.1 · Cuestionario de sondeo (registro).
 */
export const QuestionnaireCreateInputSchema = z.object({
  code: QuestionnaireCodeSchema,
  name: z.string().min(1).max(160),
  type: z.string().min(1).max(40).default("general"),
  version: QuestionnaireVersionSchema.default("digital"),
  description: z.string().max(500).optional(),
});
export type QuestionnaireCreateInput = z.infer<typeof QuestionnaireCreateInputSchema>;

export const QuestionnaireQuestionInputSchema = z.object({
  questionnaireId: uuidSchema,
  layer: QuestionnaireLayerSchema,
  code: z.string().min(1).max(80),
  prompt: z.string().min(1).max(280),
  answerType: QuestionnaireAnswerTypeSchema.default("text"),
  required: z.boolean().default(false),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  condition: z
    .object({
      questionCode: z.string().min(1),
      equals: z.union([z.string(), z.number(), z.boolean()]),
    })
    .optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  helpText: z.string().max(280).optional(),
});
export type QuestionnaireQuestionInput = z.infer<typeof QuestionnaireQuestionInputSchema>;

/**
 * SPEC-003 / B4 · Respuesta de cuestionario (vendor aplica al prospecto).
 * `content` keyed por `code` de pregunta (jsonb).
 */
export const QuestionnaireResponseInputSchema = z.object({
  questionnaireId: uuidSchema,
  prospectId: uuidSchema,
  content: z.record(z.unknown()),
  presupuestoDeclaradoCents: CentsSchema.nullable().optional(),
  projectType: z.string().max(40).optional(),
});
export type QuestionnaireResponseInput = z.infer<typeof QuestionnaireResponseInputSchema>;

/**
 * SPEC-003 / B5 · Servicio de catálogo.
 */
export const CatalogServiceCreateInputSchema = z.object({
  code: CatalogServiceCodeSchema,
  name: z.string().min(1).max(160),
  serviceType: ServiceTypeSchema,
  billingCycle: BillingCycleSchema.default("unico"),
  description: z.string().max(500).optional(),
  defaultUnitPriceCents: CentsSchema.nullable().optional(),
});
export type CatalogServiceCreateInput = z.infer<typeof CatalogServiceCreateInputSchema>;

/**
 * SPEC-003 / B5 · Plantilla de alcance.
 */
export const TemplateCreateInputSchema = z.object({
  code: TemplateCodeSchema,
  name: z.string().min(1).max(160),
  type: TemplateTypeSchema,
  description: z.string().max(500).optional(),
  content: z.record(z.unknown()).default({}),
});
export type TemplateCreateInput = z.infer<typeof TemplateCreateInputSchema>;

/**
 * SPEC-003 / B6 · Generación de borrador de alcance (sistema, regla de
 * oro DEC-FUN-23 / BR-N220).
 */
export const ScopeGenerateDraftInputSchema = z.object({
  questionnaireResponseId: uuidSchema,
  templateId: uuidSchema,
});
export type ScopeGenerateDraftInput = z.infer<typeof ScopeGenerateDraftInputSchema>;

export const ScopeSignInputSchema = z.object({
  scopeId: uuidSchema,
  reason: z.string().min(3).max(280),
});
export type ScopeSignInput = z.infer<typeof ScopeSignInputSchema>;

/**
 * SPEC-003 / B7 · Cotización.
 */
export const QuoteItemInputSchema = z.object({
  kind: QuoteItemKindSchema.default("service"),
  catalogServiceId: uuidSchema.nullable().optional(),
  description: z.string().min(1).max(280),
  qty: z.number().int().min(1).max(9999).default(1),
  unitPriceCents: CentsSchema.default(0),
  discountCents: CentsSchema.default(0),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});
export type QuoteItemInput = z.infer<typeof QuoteItemInputSchema>;

export const QuoteCreateInputSchema = z.object({
  prospectId: uuidSchema,
  scopeId: uuidSchema,
  tipoCobro: TipoCobroSchema.default("pago_unico"),
  notes: z.string().max(500).optional(),
  validUntil: z.string().datetime(),
  items: z.array(QuoteItemInputSchema).min(1),
  /** BR-N411: presupuesto declarado copiado del cuestionario (opcional). */
  presupuestoDeclaradoCents: CentsSchema.nullable().optional(),
});
export type QuoteCreateInput = z.infer<typeof QuoteCreateInputSchema>;

export const QuoteUpdateItemsInputSchema = z.object({
  quoteId: uuidSchema,
  items: z.array(QuoteItemInputSchema).min(0),
});
export type QuoteUpdateItemsInput = z.infer<typeof QuoteUpdateItemsInputSchema>;

/**
 * BR-N143 · Política de descuentos por rol:
 *  - `discountPct <= 10`: libre.
 *  - `10 < discountPct <= 25`: requiere Director (`aprobar_descuento`).
 *  - `discountPct > 25`: bloqueado por `DISCOUNT_EXCEEDS_LIMIT`.
 */
export const DiscountPctSchema = z.number().min(0).max(100);

export const QuoteSetDiscountInputSchema = z.object({
  quoteId: uuidSchema,
  discountPct: DiscountPctSchema,
});
export type QuoteSetDiscountInput = z.infer<typeof QuoteSetDiscountInputSchema>;

/**
 * SPEC-003 §4.2 / BR-N237 · Aceptación de cotización con identidad +
 * fecha + medio + evidencia (archivo).
 */
export const QuoteAcceptInputSchema = z.object({
  quoteId: uuidSchema,
  accepterName: z.string().min(1).max(160),
  accepterOrg: z.string().max(160).optional(),
  medium: AcceptanceMediumSchema,
  evidenceFileId: uuidSchema,
  notes: z.string().max(500).optional(),
  /** DEC-FUN-55 / H-08: el Vendedor registra en nombre del cliente. */
  proxy: z.boolean().default(true),
});
export type QuoteAcceptInput = z.infer<typeof QuoteAcceptInputSchema>;

export const QuoteStatusTransitionInputSchema = z.object({
  quoteId: uuidSchema,
  targetStatus: z.enum(["internal_review", "sent", "negotiation", "rejected", "expired", "cancelled"]),
  reason: z.string().max(280).optional(),
});
export type QuoteStatusTransitionInput = z.infer<typeof QuoteStatusTransitionInputSchema>;

/**
 * SPEC-004 (Orden de Servicio) · Esquemas Zod del módulo.
 *
 * La OS es el artefacto que nace al aceptar cotización (BR-N242). El
 * conjunto `os.*` valida la frontera del transporte; las reglas de
 * negocio viven en `src/server/services/orden-servicio/orders.ts`.
 */

// Estados y referencias (AC-1..AC-8, BR-N242..N250).
export const OrderStatusSchema = z.enum(ORDER_STATUSES);

/**
 * BR-N244 · excepción Director al autorizar (umbral ≥90% anticipo
 * no cumplido). Sólo el Director puede activar este flag.
 */
export const OrderAuthorizeInputSchema = z
  .object({
    orderId: uuidSchema,
    /**
     * Si `true`, se acepta el `os.authorize` aunque el anticipo cobrado
     * sea < 90% (BR-N244). El servicio exige que el actor tenga
     * permiso `autorizar_os` (Director). El audit persiste `actor_role_code`.
     */
    directorException: z.boolean().default(false),
    /** Motivo obligatorio cuando `directorException=true`. */
    directorExceptionReason: z
      .string()
      .min(3, "Motivo de excepción obligatorio")
      .max(280)
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.directorException && !data.directorExceptionReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["directorExceptionReason"],
        message: "Motivo obligatorio cuando directorException=true",
      });
    }
  });
export type OrderAuthorizeInput = z.infer<typeof OrderAuthorizeInputSchema>;

/**
 * BR-N245 · asignar PL a la OS antes de autorizar. `plUserId` debe
 * existir y pertenecer a la misma organización.
 */
export const OrderAssignPLInputSchema = z.object({
  orderId: uuidSchema,
  plUserId: uuidSchema,
});
export type OrderAssignPLInput = z.infer<typeof OrderAssignPLInputSchema>;

/**
 * BR-N243 / DEC-FUN-07 · OC con 4 campos opcionales: `number`, `date`,
 * `amountCents`, `fileId`. `amountCents === soldTotalCents` se valida en
 * el servicio (BR-017). `fileId` requiere `files` ya subido (SPEC-001
 * AC-13). Si la OS no requiere OC, este endpoint puede omitirse.
 */
export const OrderSetOCInputSchema = z.object({
  orderId: uuidSchema,
  ocNumber: z.string().min(1).max(80).optional(),
  ocDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD").optional(),
  ocAmountCents: CentsSchema.optional(),
  ocFileId: uuidSchema.optional(),
});
export type OrderSetOCInput = z.infer<typeof OrderSetOCInputSchema>;

/**
 * BR-N250 · motivo obligatorio para pausar la OS (≥3 caracteres).
 */
export const OrderPauseInputSchema = z.object({
  orderId: uuidSchema,
  reason: z.string().min(OS_REASON_MIN_LENGTH).max(280),
});
export type OrderPauseInput = z.infer<typeof OrderPauseInputSchema>;

/**
 * SPEC-004 / BR-N250 · reanudar OS pausada (no requiere motivo, sólo
 * confirmar).
 */
export const OrderResumeInputSchema = z.object({
  orderId: uuidSchema,
});
export type OrderResumeInput = z.infer<typeof OrderResumeInputSchema>;

/**
 * BR-N250 / DEC-FUN-35 · cancelar la OS con motivo obligatorio (≥3
 * caracteres). Terminal; reembolso se orquesta fuera de SPEC-004.
 */
export const OrderCancelInputSchema = z.object({
  orderId: uuidSchema,
  reason: z.string().min(OS_REASON_MIN_LENGTH).max(280),
});
export type OrderCancelInput = z.infer<typeof OrderCancelInputSchema>;

/**
 * BR-N247 · SPEC-005 confirma la creación del proyecto y emite el
 * side-effect que consume `os.authorized_to_start`. El servicio
 * de OS expone este mutator a SPEC-005 vía router o servicio
 * interno. La UI también puede invocarlo cuando el PL cierra
 * manualmente la transición (modo `manual: true`).
 */
export const OrderMarkInExecutionInputSchema = z.object({
  orderId: uuidSchema,
  /** `true` cuando lo invoca el PL/sistema (orquestador de SPEC-005). */
  manual: z.boolean().default(false),
});
export type OrderMarkInExecutionInput = z.infer<typeof OrderMarkInExecutionInputSchema>;

/**
 * BR-N248 / BR-N392 · cierre técnico de la OS. NO exige saldo cero.
 * Es terminal de la fase de ejecución.
 */
export const OrderMarkDeliveredInputSchema = z.object({
  orderId: uuidSchema,
});
export type OrderMarkDeliveredInput = z.infer<typeof OrderMarkDeliveredInputSchema>;

/**
 * BR-N249 / BR-N393 / BR-N394 · cierre administrativo. Exige saldo
 * total cero **o** excepción Director (con motivo), y factura final
 * emitida (banderín de SPEC-007).
 */
export const OrderCloseAdministrativeInputSchema = z.object({
  orderId: uuidSchema,
  /** BR-N249 · verdadero cuando el Director concede excepción por saldo. */
  directorException: z.boolean().default(false),
  /** Motivo obligatorio cuando `directorException=true`. */
  directorExceptionReason: z
    .string()
    .min(3, "Motivo de excepción obligatorio")
    .max(280)
    .optional(),
});
export type OrderCloseAdministrativeInput = z.infer<
  typeof OrderCloseAdministrativeInputSchema
>;

/**
 * SPEC-004 / AC-1 · crea la OS desde una cotización aceptada. El
 * servicio valida: `quotes.status === "accepted"`, `client_id`
 * presente, `scope_documents.status === "signed"`. NO llama al
 * workflow de proyecto/suscripción — sólo emite el side-effect
 * (audit + readyToAuthorize).
 */
export const OrderCreateFromAcceptedQuoteInputSchema = z.object({
  cotizacionId: uuidSchema,
  anticipoRequiredCents: CentsSchema.nullable().optional(),
});
export type OrderCreateFromAcceptedQuoteInput = z.infer<
  typeof OrderCreateFromAcceptedQuoteInputSchema
>;

export const OrderPaginationInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
});
export type OrderPaginationInput = z.infer<typeof OrderPaginationInputSchema>;

export const OrderListInputSchema = OrderPaginationInputSchema.extend({
  status: OrderStatusSchema.optional(),
});
export type OrderListInput = z.infer<typeof OrderListInputSchema>;

export const OrderByIdInputSchema = z.object({
  orderId: uuidSchema,
});
export type OrderByIdInput = z.infer<typeof OrderByIdInputSchema>;

/**
 * SPEC-005 (Proyectos: artefactos y estados) · Esquemas Zod del
 * módulo. Estados 3D canónicos (etapa / situación / salud), módulos,
 * JSON Discovery round-trip y transiciones con motivo obligatorio.
 */

export const ProjectStageSchema = z.enum(PROJECT_STAGES);
export const ProjectSituationSchema = z.enum(PROJECT_SITUATIONS);
export const ProjectHealthSchema = z.enum(PROJECT_HEALTHS);
export const ModuleStatusSchema = z.enum(MODULE_STATUSES);
export const ModuleHealthSchema = z.enum(MODULE_HEALTHS);
export const ProjectMemberRoleSchema = z.enum(PROJECT_MEMBER_ROLES);

/**
 * SPEC-005 / AC-1 · `project_creation` consume `orderId`. El workflow
 * es **universal**: toda OS autorizada crea proyecto (BR-N407/68).
 * `plUserIdOverride` opcional — sólo lo usa SPEC-006 cuando asigne un
 * PL distinto al de la OS; SPEC-005 siempre toma `orders.pl_user_id`.
 */
export const ProjectCreateFromOrderInputSchema = z.object({
  orderId: uuidSchema,
  /** Sólo SPEC-006; SPEC-005 lo ignora si viene. */
  plUserIdOverride: uuidSchema.optional(),
});
export type ProjectCreateFromOrderInput = z.infer<
  typeof ProjectCreateFromOrderInputSchema
>;

/**
 * SPEC-005 / AC-4 · transición de etapa (happy path
 * planning→development→testing→client_validation→delivery, BR-N375..N378).
 */
export const ProjectTransitionStageInputSchema = z.object({
  projectId: uuidSchema,
  targetStage: ProjectStageSchema,
});
export type ProjectTransitionStageInput = z.infer<
  typeof ProjectTransitionStageInputSchema
>;

/**
 * SPEC-005 / BR-N379 · pausar / cancelar con motivo obligatorio.
 */
export const ProjectPauseInputSchema = z.object({
  projectId: uuidSchema,
  reason: z.string().min(HEALTH_REASON_MIN_LENGTH).max(280),
});
export type ProjectPauseInput = z.infer<typeof ProjectPauseInputSchema>;

export const ProjectCancelInputSchema = z.object({
  projectId: uuidSchema,
  reason: z.string().min(HEALTH_REASON_MIN_LENGTH).max(280),
});
export type ProjectCancelInput = z.infer<typeof ProjectCancelInputSchema>;

/**
 * SPEC-005 / AC-5 · override de salud exige motivo (BR-N254). Si
 * `health === healthCalculated`, el servicio rechaza con
 * `HEALTH_REASON_REQUIRED` para no permitir overrides redundantes.
 */
export const ProjectOverrideHealthInputSchema = z
  .object({
    projectId: uuidSchema,
    health: ProjectHealthSchema,
    reason: z.string().max(280).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.reason || data.reason.trim().length < HEALTH_REASON_MIN_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: "Motivo obligatorio (≥3 caracteres)",
      });
    }
  });
export type ProjectOverrideHealthInput = z.infer<
  typeof ProjectOverrideHealthInputSchema
>;

export const ProjectByIdInputSchema = z.object({
  projectId: uuidSchema,
});
export type ProjectByIdInput = z.infer<typeof ProjectByIdInputSchema>;

export const ProjectListInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
  stage: ProjectStageSchema.optional(),
  situation: ProjectSituationSchema.optional(),
});
export type ProjectListInput = z.infer<typeof ProjectListInputSchema>;

/**
 * SPEC-005 / AC-8 · transición de estado de módulo (BR-N113/114/260).
 */
export const ModuleTransitionInputSchema = z.object({
  moduleId: uuidSchema,
  targetStatus: ModuleStatusSchema,
  reason: z.string().max(280).optional(),
});
export type ModuleTransitionInput = z.infer<typeof ModuleTransitionInputSchema>;

export const ModuleListInputSchema = z.object({
  projectId: uuidSchema,
});
export type ModuleListInput = z.infer<typeof ModuleListInputSchema>;

/**
 * SPEC-005 / AC-6/7 · JSON Discovery round-trip. El shape es estable
 * y se valida por inmutables (`project_id`, `folio`, `included`) en
 * servicio (BR-N353). El schema es laxo para admitir libremente las
 * variantes de módulos que la organización acuerde.
 */
export const JsonDiscoveryPlanModuleSchema = z.object({
  code: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  required: z.boolean().default(false),
  depends_on_modules: z.array(z.string()).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});

export const JsonDiscoveryPlanSchema = z.object({
  project_id: uuidSchema,
  folio: z.string().min(1).max(80),
  included: z.array(z.string()).default([]),
  version: z.number().int().min(1),
  modules: z.array(JsonDiscoveryPlanModuleSchema).default([]),
});
export type JsonDiscoveryPlan = z.infer<typeof JsonDiscoveryPlanSchema>;

export const JsonDiscoveryExportInputSchema = z.object({
  projectId: uuidSchema,
});
export type JsonDiscoveryExportInput = z.infer<
  typeof JsonDiscoveryExportInputSchema
>;

export const JsonDiscoveryImportInputSchema = z.object({
  projectId: uuidSchema,
  /** Versión que el PL declara para el plan entrante. */
  version: z.number().int().min(1),
  json: JsonDiscoveryPlanSchema,
});
export type JsonDiscoveryImportInput = z.infer<
  typeof JsonDiscoveryImportInputSchema
>;

/**
 * SPEC-006 (Proyectos — equipo y ejecución · B11-B16) · Esquemas Zod del
 * módulo de ejecución. Cubre requerimientos, tareas (con checklist y
 * evidencia), asignaciones, tiempo, pruebas, entregables y cambios.
 *
 * Coherentes con `src/shared/enums` (enums como dato en código).
 */

// ── Enums transversales del módulo ejecución ─────────────────────────────
export const RequirementStatusSchema = z.enum(REQUIREMENT_STATUSES);
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export const TimeEntryKindSchema = z.enum(TIME_ENTRY_KINDS);
export const TestTypeSchema = z.enum(TEST_TYPES);
export const TestStatusSchema = z.enum(TEST_STATUSES);
export const DeliverableStatusSchema = z.enum(DELIVERABLE_STATUSES);
export const ChangeRequestStatusSchema = z.enum(CHANGE_REQUEST_STATUSES);
export const ChangeRequestEvidenceKindSchema = z.enum(
  CHANGE_REQUEST_EVIDENCE_KINDS,
);

/**
 * SPEC-006 §5 / BR-N382 · La membresía precede a la asignación; nadie
 * recibe módulo/tarea sin pertenecer.
 */
export const ProjectMemberAddInputSchema = z.object({
  projectId: uuidSchema,
  userId: uuidSchema,
  projectRole: ProjectMemberRoleSchema.default("programador"),
});
export type ProjectMemberAddInput = z.infer<
  typeof ProjectMemberAddInputSchema
>;

export const ProjectMemberRemoveInputSchema = z.object({
  memberId: uuidSchema,
});
export type ProjectMemberRemoveInput = z.infer<
  typeof ProjectMemberRemoveInputSchema
>;

export const ProjectMemberListInputSchema = z.object({
  projectId: uuidSchema,
});
export type ProjectMemberListInput = z.infer<
  typeof ProjectMemberListInputSchema
>;

// ── Requerimientos (B11, BR-N264-267) ────────────────────────────────────
export const RequirementCreateInputSchema = z.object({
  projectId: uuidSchema,
  moduleId: uuidSchema.nullable().optional(),
  folio: z.string().min(1).max(40),
  title: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  acceptanceCriteria: z.string().max(2000).optional(),
});
export type RequirementCreateInput = z.infer<
  typeof RequirementCreateInputSchema
>;

export const RequirementTransitionInputSchema = z.object({
  requirementId: uuidSchema,
  targetStatus: RequirementStatusSchema,
  reason: z.string().max(280).optional(),
});
export type RequirementTransitionInput = z.infer<
  typeof RequirementTransitionInputSchema
>;

export const RequirementByIdInputSchema = z.object({
  requirementId: uuidSchema,
});
export type RequirementByIdInput = z.infer<
  typeof RequirementByIdInputSchema
>;

export const RequirementListInputSchema = z.object({
  projectId: uuidSchema,
  status: RequirementStatusSchema.optional(),
});
export type RequirementListInput = z.infer<
  typeof RequirementListInputSchema
>;

// ── Tareas (B11, BR-N268-274) ─────────────────────────────────────────────
export const TaskCreateInputSchema = z.object({
  projectId: uuidSchema,
  moduleId: uuidSchema.nullable().optional(),
  requirementId: uuidSchema.nullable().optional(),
  folio: z.string().min(1).max(40),
  title: z.string().min(1).max(160),
  /** BR-N268 · peso entero ≥1. Default 1. */
  weight: z.number().int().min(1).max(99).default(1),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  dependsOnTaskIds: z.array(uuidSchema).default([]),
});
export type TaskCreateInput = z.infer<typeof TaskCreateInputSchema>;

export const TaskTransitionInputSchema = z.object({
  taskId: uuidSchema,
  targetStatus: TaskStatusSchema,
  reason: z.string().max(280).optional(),
});
export type TaskTransitionInput = z.infer<typeof TaskTransitionInputSchema>;

export const TaskAssignInputSchema = z.object({
  taskId: uuidSchema,
  /** SPEC-006 AC-2 · sólo el PL puede asignar; el técnico puede
   * autoasignarse del backlog. La distinción la aplica el servicio. */
  userId: uuidSchema,
});
export type TaskAssignInput = z.infer<typeof TaskAssignInputSchema>;

export const TaskRejectInputSchema = z.object({
  taskId: uuidSchema,
  reason: z.string().min(3, "Motivo de rechazo obligatorio").max(280),
});
export type TaskRejectInput = z.infer<typeof TaskRejectInputSchema>;

export const TaskReviewInputSchema = z.object({
  taskId: uuidSchema,
  approve: z.boolean(),
  observations: z.string().max(500).optional(),
});
export type TaskReviewInput = z.infer<typeof TaskReviewInputSchema>;

export const TaskChecklistAddInputSchema = z.object({
  taskId: uuidSchema,
  item: z.string().min(1).max(280),
});
export type TaskChecklistAddInput = z.infer<
  typeof TaskChecklistAddInputSchema
>;

export const TaskChecklistToggleInputSchema = z.object({
  checklistId: uuidSchema,
  done: z.boolean(),
});
export type TaskChecklistToggleInput = z.infer<
  typeof TaskChecklistToggleInputSchema
>;

export const TaskEvidenceAddInputSchema = z.object({
  taskId: uuidSchema,
  fileId: uuidSchema,
  note: z.string().max(280).optional(),
});
export type TaskEvidenceAddInput = z.infer<
  typeof TaskEvidenceAddInputSchema
>;

export const TaskByIdInputSchema = z.object({
  taskId: uuidSchema,
});
export type TaskByIdInput = z.infer<typeof TaskByIdInputSchema>;

export const TaskListInputSchema = z.object({
  projectId: uuidSchema,
  status: TaskStatusSchema.optional(),
  moduleId: uuidSchema.optional(),
});
export type TaskListInput = z.infer<typeof TaskListInputSchema>;

// ── Time entries (B13, BR-N276/BR-N277/BR-008) ───────────────────────────
export const TimeEntryCreateInputSchema = z
  .object({
    projectId: uuidSchema,
    taskId: uuidSchema.nullable().optional(),
    hours: z
      .number()
      .positive()
      .max(24, "Las horas por día no pueden exceder 24"),
    kind: TimeEntryKindSchema.default("facturable"),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD"),
  })
  .superRefine((data, ctx) => {
    if (!data.date || data.date.length !== 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["date"],
        message: "fecha requerida",
      });
    }
  });
export type TimeEntryCreateInput = z.infer<
  typeof TimeEntryCreateInputSchema
>;

export const TimeEntryListInputSchema = z.object({
  projectId: uuidSchema,
  /** BR-N277/208 · si false, técnico sólo ve los suyos; PL/equipo, todos. */
  teamView: z.boolean().default(false),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type TimeEntryListInput = z.infer<typeof TimeEntryListInputSchema>;

// ── Pruebas (B14, BR-N283-290/BR-N389) ────────────────────────────────────
export const TestCreateInputSchema = z.object({
  projectId: uuidSchema,
  moduleId: uuidSchema.nullable().optional(),
  requirementId: uuidSchema.nullable().optional(),
  type: TestTypeSchema,
  result: z.string().max(500).optional(),
});
export type TestCreateInput = z.infer<typeof TestCreateInputSchema>;

export const TestTransitionInputSchema = z.object({
  testId: uuidSchema,
  targetStatus: z.enum(["pending", "passed", "failed", "blocked"]),
  result: z.string().max(500).optional(),
  incident: z.string().max(500).optional(),
});
export type TestTransitionInput = z.infer<typeof TestTransitionInputSchema>;

export const TestMarkNotApplicableInputSchema = z.object({
  testId: uuidSchema,
  reason: z.string().min(3, "Justificación obligatoria").max(500),
});
export type TestMarkNotApplicableInput = z.infer<
  typeof TestMarkNotApplicableInputSchema
>;

export const TestListInputSchema = z.object({
  projectId: uuidSchema,
  type: TestTypeSchema.optional(),
  status: TestStatusSchema.optional(),
});
export type TestListInput = z.infer<typeof TestListInputSchema>;

// ── Entregables (B15, BR-N288-291/BR-N391/DEC-FUN-55) ────────────────────
export const DeliverableCreateInputSchema = z.object({
  projectId: uuidSchema,
  moduleId: uuidSchema.nullable().optional(),
  name: z.string().min(1).max(160),
  version: z.string().min(1).max(40),
  committedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD"),
  required: z.boolean().default(true),
});
export type DeliverableCreateInput = z.infer<
  typeof DeliverableCreateInputSchema
>;

export const DeliverableTransitionInputSchema = z.object({
  deliverableId: uuidSchema,
  targetStatus: z.enum([
    "pending",
    "preparing",
    "delivered",
    "observed",
    "corrected",
    "rejected",
  ]),
  actualDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type DeliverableTransitionInput = z.infer<
  typeof DeliverableTransitionInputSchema
>;

/**
 * SPEC-006 / BR-N287 / DEC-FUN-55 · aceptación por proxy. Exige
 * identidad del aceptante, organización, fecha, medio y evidencia
 * (archivo ya subido). El PL es registrador, NO aceptante. Sin
 * esos datos → `409 ACCEPTANCE_EVIDENCE_REQUIRED`.
 */
export const DeliverableAcceptInputSchema = z
  .object({
    deliverableId: uuidSchema,
    accepterName: z.string().min(1).max(160),
    accepterOrg: z.string().min(1).max(160),
    acceptedMedium: AcceptanceMediumSchema,
    evidenceFileId: uuidSchema,
    comments: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.accepterName.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accepterName"],
        message: "Identidad del aceptante obligatoria",
      });
    }
    if (data.accepterOrg.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accepterOrg"],
        message: "Organización del aceptante obligatoria",
      });
    }
  });
export type DeliverableAcceptInput = z.infer<
  typeof DeliverableAcceptInputSchema
>;

export const DeliverableListInputSchema = z.object({
  projectId: uuidSchema,
  status: DeliverableStatusSchema.optional(),
});
export type DeliverableListInput = z.infer<
  typeof DeliverableListInputSchema
>;

// ── Cambios de alcance (B16, BR-N292-296/BR-N395) ────────────────────────
export const ChangeRequestCreateInputSchema = z.object({
  projectId: uuidSchema,
  folio: z.string().min(1).max(40),
  reason: z.string().min(3).max(280),
  /** BR-N294/295 · con costo exige cotización+evidencia. */
  hasCost: z.boolean().default(false),
  impactSummary: z.string().max(500).optional(),
});
export type ChangeRequestCreateInput = z.infer<
  typeof ChangeRequestCreateInputSchema
>;

export const ChangeRequestQuoteInputSchema = z.object({
  changeRequestId: uuidSchema,
  /** BR-N294 · cotización (cualquier quote de la org) o evidencia libre. */
  evidenceKind: ChangeRequestEvidenceKindSchema,
  linkedQuoteId: uuidSchema.nullable().optional(),
  evidenceFileId: uuidSchema.nullable().optional(),
  notes: z.string().max(500).optional(),
});
export type ChangeRequestQuoteInput = z.infer<
  typeof ChangeRequestQuoteInputSchema
>;

export const ChangeRequestAuthorizeInputSchema = z.object({
  changeRequestId: uuidSchema,
});
export type ChangeRequestAuthorizeInput = z.infer<
  typeof ChangeRequestAuthorizeInputSchema
>;

export const ChangeRequestRejectInputSchema = z.object({
  changeRequestId: uuidSchema,
  reason: z.string().min(3).max(280),
});
export type ChangeRequestRejectInput = z.infer<
  typeof ChangeRequestRejectInputSchema
>;

export const ChangeRequestListInputSchema = z.object({
  projectId: uuidSchema,
  status: ChangeRequestStatusSchema.optional(),
});
export type ChangeRequestListInput = z.infer<
  typeof ChangeRequestListInputSchema
>;

// ── Cierre técnico del proyecto (AC-8) ──────────────────────────────────
export const ProjectCloseTechnicalInputSchema = z.object({
  projectId: uuidSchema,
});
export type ProjectCloseTechnicalInput = z.infer<
  typeof ProjectCloseTechnicalInputSchema
>;

// ── Avance y salud (AC-9) ────────────────────────────────────────────────
export const ProjectProgressInputSchema = z.object({
  projectId: uuidSchema,
});
export type ProjectProgressInput = z.infer<
  typeof ProjectProgressInputSchema
>;

// ── SPEC-007 · Facturación CFDI ──────────────────────────────────────────

/** SPEC-007 §4.1 · estados de la factura (BR-N306). */
export const InvoiceStatusSchema = z.enum(INVOICE_STATUSES);

/** SPEC-007 §4.1 · motivos de cancelación SAT (BR-N305). */
export const CancelMotiveSatSchema = z.enum(CANCEL_MOTIVES_SAT);

/** SPEC-007 §4.1 · estados de un schedule (BR-N310). */
export const InvoiceScheduleStatusSchema = z.enum(INVOICE_SCHEDULE_STATUSES);

/** SPEC-007 §4.1 · modo del schedule (BR-N310). */
export const ScheduleAutoOrDraftKindSchema = z.enum(SCHEDULE_AUTO_OR_DRAFT_KINDS);

/** SPEC-007 · línea de concepto CFDI 4.0 (BR-N301). */
export const CfdiConceptLineInputSchema = z.object({
  claveProdServ: z.string().min(1).max(20),
  descripcion: z.string().min(1).max(2000),
  cantidad: z.number().int().positive(),
  valorUnitarioCents: z.number().int().nonnegative(),
  descuentoCents: z.number().int().nonnegative().optional(),
});
export type CfdiConceptLineInput = z.infer<typeof CfdiConceptLineInputSchema>;

/** SPEC-007 AC-1 · input de `invoices.buildFromOrder` (BR-N301/303). */
export const InvoiceBuildInputSchema = z.object({
  orderId: uuidSchema,
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe ser YYYY-MM-DD"),
  concept: z.array(CfdiConceptLineInputSchema).min(1),
});
export type InvoiceBuildInput = z.infer<typeof InvoiceBuildInputSchema>;

/** SPEC-007 · input de `invoices.preview` (BR-N303). */
export const InvoicePreviewInputSchema = z.object({
  invoiceId: uuidSchema,
});

/** SPEC-007 AC-1 · input de `invoices.timbrar` (BR-N301/302). */
export const InvoiceTimbrarInputSchema = z.object({
  invoiceId: uuidSchema,
});

/** SPEC-007 AC-2 · input de `invoices.cancel` (BR-N305/309). */
export const InvoiceCancelInputSchema = z.object({
  invoiceId: uuidSchema,
  motivoSat: CancelMotiveSatSchema,
  reason: z
    .string()
    .min(3, "Motivo ≥3 caracteres (BR-N305)"),
});
export type InvoiceCancelInput = z.infer<typeof InvoiceCancelInputSchema>;

/** SPEC-007 AC-4 · compatibilidad SPEC-008 (BR-012/308). */
export const InvoiceApplyPaymentInputSchema = z.object({
  invoiceId: uuidSchema,
  amountCents: z.number().int().positive(),
});

/** SPEC-007 AC-2 · compatibilidad SPEC-008 (BR-N309). */
export const InvoiceRevertPaymentInputSchema = z.object({
  invoiceId: uuidSchema,
  applicationId: uuidSchema,
});

/** SPEC-007 AC-3 · input de `invoices.markVencida` (BR-N307). */
export const InvoiceMarkVencidaInputSchema = z.object({
  refDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe ser YYYY-MM-DD"),
});

/** SPEC-007 AC-6 · input de `invoices.zipContador` (BR-N311/DEC-FUN-38/26). */
export const InvoiceZipInputSchema = z.object({
  year: z.number().int().min(2000).max(2999),
  month: z.number().int().min(1).max(12),
  manual: z.boolean(),
  includeBorrador: z.boolean().optional(),
});

/** SPEC-007 · listado (7 estados visuales derivados). */
export const InvoiceListInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
  status: InvoiceStatusSchema.optional(),
  clientId: uuidSchema.optional(),
});

/** SPEC-007 · consumo de SPEC-011 (BR-N406). */
export const InvoiceDraftFromRenewalInputSchema = z.object({
  subscriptionId: uuidSchema,
  clientId: uuidSchema,
  fiscalDataSnapshot: z.record(z.string(), z.unknown()),
  concept: CfdiConceptLineInputSchema,
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** SPEC-007 BR-N310 · input de `invoiceSchedules.create`. */
export const InvoiceScheduleCreateInputSchema = z
  .object({
    orderId: uuidSchema.optional(),
    subscriptionId: uuidSchema.optional(),
    scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amountCents: z.number().int().positive(),
    autoOrDraft: ScheduleAutoOrDraftKindSchema,
  })
  .refine(
    (v) => Boolean(v.orderId) || Boolean(v.subscriptionId),
    {
      message: "orderId o subscriptionId obligatorio",
      path: ["orderId"],
    },
  );

/** SPEC-007 BR-N310 · input de `invoiceSchedules.skip`. */
export const InvoiceScheduleSkipInputSchema = z.object({
  scheduleId: uuidSchema,
});

export const InvoiceScheduleListInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
  status: InvoiceScheduleStatusSchema.optional(),
});

/** SPEC-007 · job nocturno (BR-N310). */
export const InvoiceScheduleRunInputSchema = z.object({
  scheduleId: uuidSchema,
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ── SPEC-008 · Cobranza y Comisiones ────────────────────────────────────────

/** SPEC-008 §4.1 · estados del cobro (BR-N314-319). */
export const PaymentStatusSchema = z.enum(PAYMENT_STATUSES);

/** SPEC-008 §4.1 · métodos de cobro. */
export const PaymentMethodSchema = z.enum(PAYMENT_METHODS);

/** SPEC-008 §4.1 · tipos de actividad de cobranza (BR-N322-323). */
export const CollectionActivityTypeSchema = z.enum(COLLECTION_ACTIVITY_TYPES);

/** SPEC-008 §4.1 · tonos de plantilla (BR-N321). */
export const CollectionMessageToneSchema = z.enum(COLLECTION_MESSAGE_TONES);

/** SPEC-008 §4.1 · estados de la comisión (BR-N297-300). */
export const CommissionStatusSchema = z.enum(COMMISSION_STATUSES);

/** SPEC-008 / BR-N123 · razones de reversa de comisión. */
export const CommissionReversalReasonSchema = z.enum(COMMISSION_REVERSAL_REASONS);

/** SPEC-008 / BR-N313 · tonos de escalado. */
export const EscalationToneSchema = z.enum(ESCALATION_TONES);

/** SPEC-008 AC-1 · input de `cobros.register` (BR-N314). */
export const PaymentRegisterInputSchema = z.object({
  clientId: uuidSchema,
  amountCents: z.number().int().positive(),
  method: PaymentMethodSchema,
  reference: z.string().max(280).optional(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type PaymentRegisterInput = z.infer<typeof PaymentRegisterInputSchema>;

/** SPEC-008 AC-1 · input de `cobros.update` (sólo `registrado`). */
export const PaymentUpdateInputSchema = z.object({
  paymentId: uuidSchema,
  amountCents: z.number().int().positive().optional(),
  method: PaymentMethodSchema.optional(),
  reference: z.string().max(280).optional(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** SPEC-008 AC-1 · input de `cobros.confirm` con aplicaciones opcionales. */
export const PaymentConfirmInputSchema = z.object({
  paymentId: uuidSchema,
  applications: z
    .array(
      z.object({
        invoiceId: uuidSchema,
        amountCents: z.number().int().positive(),
      }),
    )
    .optional(),
});

/** SPEC-008 AC-3 · input de `cobros.reverse` con motivo (BR-N318). */
export const PaymentReverseInputSchema = z.object({
  paymentId: uuidSchema,
  reason: z
    .string()
    .min(3, "Motivo ≥3 caracteres (BR-N318)"),
});

/** SPEC-008 AC-2 · input de `cobros.apply` (BR-012/308). */
export const PaymentApplyInputSchema = z.object({
  paymentId: uuidSchema,
  invoiceId: uuidSchema,
  amountCents: z.number().int().positive(),
});

/** SPEC-008 AC-10 · listado de cobros. */
export const PaymentListInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
  status: PaymentStatusSchema.optional(),
  clientId: uuidSchema.optional(),
});

export const PaymentApplicationListInputSchema = z.object({
  paymentId: uuidSchema.optional(),
  invoiceId: uuidSchema.optional(),
});

/** SPEC-008 AC-6 · input de `comisiones.estimate` (BR-N297/298). */
export const CommissionEstimateInputSchema = z
  .object({
    orderId: uuidSchema,
    ratePct: z.number().positive().max(100),
    vendedorUserId: uuidSchema,
  })
  .refine((v) => v.ratePct > 0, {
    message: "rate_pct debe ser > 0 (BR-N297)",
    path: ["ratePct"],
  });

/** SPEC-008 AC-4 · input de `comisiones.release`. */
export const CommissionReleaseInputSchema = z.object({
  orderId: uuidSchema,
});

/** SPEC-008 AC-5 · input de `comisiones.reverseOnCancel` (consumida por SPEC-007). */
export const CommissionReverseOnCancelInputSchema = z.object({
  invoiceId: uuidSchema,
  osCancelled: z.boolean().optional(),
});

/** SPEC-008 AC-7 · input de `comisiones.pay`. */
export const CommissionPayInputSchema = z.object({
  commissionId: uuidSchema,
});

/** SPEC-008 AC-9 · input de `comisiones.cancelOnOsCancel` (DEC-FUN-35). */
export const CommissionCancelOnOsCancelInputSchema = z.object({
  orderId: uuidSchema,
  reason: z.string().min(3),
});

/** SPEC-008 AC-10 · listado de comisiones. */
export const CommissionListInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
  status: CommissionStatusSchema.optional(),
  orderId: uuidSchema.optional(),
  vendedorUserId: uuidSchema.optional(),
});

/** SPEC-008 AC-8 · input de `cobranza.createActivity` (BR-N322-323). */
export const CollectionActivityCreateInputSchema = z.object({
  clientId: uuidSchema,
  invoiceId: uuidSchema.optional(),
  type: CollectionActivityTypeSchema,
  notes: z.string().max(2000).optional(),
  promisedAmountCents: z.number().int().positive().optional(),
  promisedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  createPromise: z.boolean().optional(),
});

/** SPEC-008 AC-8 · input de `cobranza.fulfillPromise`. */
export const CollectionPromiseFulfillInputSchema = z.object({
  promiseId: uuidSchema,
});

export const CollectionActivityListInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
  invoiceId: uuidSchema.optional(),
  clientId: uuidSchema.optional(),
  type: CollectionActivityTypeSchema.optional(),
});

export const CollectionPromiseListInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
  invoiceId: uuidSchema.optional(),
  fulfilled: z.boolean().optional(),
});

/** SPEC-008 AC-8 · input de `cobranza.evaluateEscalation`. */
export const EscalationEvaluateInputSchema = z.object({
  invoiceId: uuidSchema,
  refDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ── SPEC-009 · Finanzas y Movimientos ──────────────────────────────────────

/** SPEC-009 §4.1 · tipos de cuenta (BR-N366). */
export const AccountTypeSchema = z.enum(ACCOUNT_TYPES);

/** SPEC-009 §4.1 · tipos de movimiento (BR-N331). */
export const TransactionTypeSchema = z.enum(TRANSACTION_TYPES);

/** SPEC-009 §4.1 · estados del movimiento (BR-013/N331). */
export const TransactionStatusSchema = z.enum(TRANSACTION_STATUSES);

/** SPEC-009 §4.1 · subclasificación no operativa (BR-N326-328). */
export const NonOperativeKindSchema = z.enum(NON_OPERATIVE_KINDS);

/** SPEC-009 AC-1 · input de `accounts.create`. */
export const AccountCreateInputSchema = z.object({
  name: z.string().min(1).max(120),
  type: AccountTypeSchema,
  currency: z.string().length(3).default("MXN"),
  openingBalanceCents: z.number().int().default(0),
});

/** SPEC-009 AC-7 · input de `transactions.record`. */
export const TransactionRecordInputSchema = z
  .object({
    accountId: uuidSchema,
    type: TransactionTypeSchema,
    amountCents: z.number().int().refine((n) => n !== 0, "Monto debe ser ≠ 0"),
    subKind: NonOperativeKindSchema.optional(),
    operationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    linkedPaymentId: uuidSchema.optional(),
    linkedCommissionId: uuidSchema.optional(),
    linkedOrderId: uuidSchema.optional(),
    projectId: uuidSchema.optional(),
    reason: z.string().max(500).optional(),
  });

export const TransactionConfirmInputSchema = z.object({
  transactionId: uuidSchema,
});

export const TransactionReconcileInputSchema = z.object({
  transactionId: uuidSchema,
});

export const TransactionCancelInputSchema = z.object({
  transactionId: uuidSchema,
  reason: z.string().min(3),
});

export const TransactionReverseInputSchema = z.object({
  transactionId: uuidSchema,
  reason: z.string().min(3),
});

/** SPEC-009 AC-7 · listado con filtro calendario (DEC-FUN-24). */
export const TransactionListInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
  status: TransactionStatusSchema.optional(),
  type: TransactionTypeSchema.optional(),
  accountId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  orderId: uuidSchema.optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** SPEC-009 AC-2 · input de `transfers.create`. */
export const TransferCreateInputSchema = z
  .object({
    fromAccountId: uuidSchema,
    toAccountId: uuidSchema,
    amountCents: z.number().int().positive(),
    operationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().max(280).optional(),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: "fromAccountId y toAccountId deben ser distintos (BR-N326)",
    path: ["toAccountId"],
  });

/** SPEC-009 AC-4 · input de `direct_costs.imputar` (BR-N333). */
export const DirectCostImputeInputSchema = z.object({
  projectId: uuidSchema,
  transactionId: uuidSchema,
  description: z.string().max(500).optional(),
});

export const DirectCostListInputSchema = z.object({
  projectId: uuidSchema.optional(),
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
});

/** SPEC-009 AC-3 · input de `finance.projectCostSummary`. */
export const ProjectCostSummaryInputSchema = z.object({
  projectId: uuidSchema,
});

/** SPEC-009 AC-9 · input de `finance.projectFinancialReport`. */
export const ProjectFinancialReportInputSchema = z.object({
  projectId: uuidSchema,
});

/** SPEC-009 AC-10 · input de `finance.osOutstandingBalance` (consumido por SPEC-004). */
export const OsOutstandingBalanceInputSchema = z.object({
  orderId: uuidSchema,
});

/** SPEC-009 AC-7 · input de `finance.accountBalance`. */
export const AccountBalanceInputSchema = z.object({
  accountId: uuidSchema,
});

// ── SPEC-010 · Dashboard / Administración / Bitácora ────────────────────────

/** SPEC-010 / DEC-FUN-30 · vista default. */
export const DashboardDefaultViewSchema = z.enum(DASHBOARD_DEFAULT_VIEWS);

/** SPEC-010 / BR-N344-348 · códigos canónicos de widgets. */
export const DashboardWidgetCodeSchema = z.enum(DASHBOARD_WIDGET_CODES);

/** SPEC-010 / DEC-FUN-28 · entrada de layout. */
export const WidgetLayoutEntryInputSchema = z.object({
  widget: DashboardWidgetCodeSchema,
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});

/** SPEC-010 AC-2 · input de `dashboard.get`. */
export const DashboardGetInputSchema = z.object({
  view: DashboardDefaultViewSchema.optional(),
  refDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** SPEC-010 AC-2 · input de `dashboard.saveLayout`. */
export const DashboardSaveLayoutInputSchema = z.object({
  widgets: z.array(DashboardWidgetCodeSchema),
  layout: z.array(WidgetLayoutEntryInputSchema),
  defaultView: DashboardDefaultViewSchema.optional(),
});

/** SPEC-010 AC-3 · input de `auditLogs.list`. */
export const AuditLogListInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
  entityType: z.string().optional(),
  entityId: uuidSchema.optional(),
  action: z.string().optional(),
  actorUserId: uuidSchema.optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** SPEC-010 AC-4 · input de `projectLog.list`. */
export const ProjectLogListInputSchema = z.object({
  projectId: uuidSchema,
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
});

/** SPEC-010 AC-5 · input de `linkFile`. */
export const BitacoraLinkFileInputSchema = z.object({
  fileId: uuidSchema,
  entityType: z.string().min(1).max(60),
  entityId: uuidSchema,
});

/** SPEC-010 AC-6 · input de `admin.getRole`. */
export const AdminGetRoleInputSchema = z.object({
  code: z.string().min(1).max(60),
});

/**
 * SPEC-010 AC-7 / Editor visual de cuestionarios (DEC-FUN-45).
 *
 * Estos esquemas median las acciones de edición mecánica sobre
 * `questionnaire_questions` que NO están publicadas por el contrato
 * de SPEC-003 (`createQuestionnairesService`). El servicio
 * `createQuestionnaireEditorService` (SPEC-010 admin) los usa para
 * reordenar/editar/agregar/quitar preguntas; la UI NO accede a BD
 * directamente (AC-26 SPEC-001).
 *
 * Las reglas de negocio (versión publicada, prospecto, respuesta)
 * siguen siendo del SPEC-003. Aquí sólo se valida la forma del
 * payload y los límites estructurales (capa 1..4, prompt 1..280).
 */

/** Reordenar preguntas: `orderedIds` define el nuevo `sort_order`
 *  (índice + 1). Todos los ids deben pertenecer al mismo cuestionario. */
export const QuestionnaireEditorReorderInputSchema = z.object({
  questionnaireId: uuidSchema,
  orderedIds: z.array(uuidSchema).min(1).max(500),
});

/** Editar pregunta: prompt/helpText/required/opciones parciales. */
export const QuestionnaireEditorUpdateInputSchema = z
  .object({
    id: uuidSchema,
    prompt: z.string().min(1).max(280).optional(),
    helpText: z.string().max(280).nullable().optional(),
    required: z.boolean().optional(),
    options: z
      .array(
        z.object({
          value: z.string().min(1).max(80),
          label: z.string().min(1).max(160),
        }),
      )
      .max(40)
      .nullable()
      .optional(),
  })
  .refine(
    (v) =>
      v.prompt !== undefined ||
      v.helpText !== undefined ||
      v.required !== undefined ||
      v.options !== undefined,
    { message: "Debes enviar al menos un campo a actualizar" },
  );

/** Agregar pregunta al final de la capa. */
export const QuestionnaireEditorAddInputSchema = z.object({
  questionnaireId: uuidSchema,
  layer: QuestionnaireLayerSchema,
  code: z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/u, "Sólo letras, dígitos, guion y guion bajo"),
  prompt: z.string().min(1).max(280),
  answerType: QuestionnaireAnswerTypeSchema.default("text"),
  required: z.boolean().default(false),
  options: z
    .array(z.object({ value: z.string().min(1).max(80), label: z.string().min(1).max(160) }))
    .max(40)
    .optional(),
  helpText: z.string().max(280).optional(),
});

/** Quitar pregunta por id (operación irreversible; SPEC-003 no expone
 *  delete). La UI confirma antes de invocar. */
export const QuestionnaireEditorRemoveInputSchema = z.object({
  id: uuidSchema,
});

/** Cargar cuestionario + preguntas para editor. */
export const QuestionnaireEditorGetInputSchema = z.object({
  id: uuidSchema,
});
export type QuestionnaireEditorReorderInput = z.infer<
  typeof QuestionnaireEditorReorderInputSchema
>;
export type QuestionnaireEditorUpdateInput = z.infer<
  typeof QuestionnaireEditorUpdateInputSchema
>;
export type QuestionnaireEditorAddInput = z.infer<
  typeof QuestionnaireEditorAddInputSchema
>;
export type QuestionnaireEditorRemoveInput = z.infer<
  typeof QuestionnaireEditorRemoveInputSchema
>;
export type QuestionnaireEditorGetInput = z.infer<
  typeof QuestionnaireEditorGetInputSchema
>;

// ── SPEC-011 · Suscripciones ───────────────────────────────────────────────

/** BR-N399-403 · estados de la suscripción. */
export const SubscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);

/** BR-N400 · periodicidad canónica. */
export const SubscriptionPeriodicitySchema = z.enum(SUBSCRIPTION_PERIODICITIES);

/** Estados del periodo (modelo del ciclo individual). */
export const SubscriptionPeriodStatusSchema = z.enum(
  SUBSCRIPTION_PERIOD_STATUSES,
);

/** BR-N404 · acciones del historial. */
export const SubscriptionHistoryActionSchema = z.enum(
  SUBSCRIPTION_HISTORY_ACTIONS,
);

/** SPEC-011 · motivo obligatorio para pausar/cancelar (BR-N404).
 *  ≥3 caracteres (alineado con OS_REASON_MIN_LENGTH). */
export const SubscriptionReasonSchema = z
  .string()
  .min(OS_REASON_MIN_LENGTH)
  .max(280);

/** SPEC-011 AC-1 · input de `subscriptions.createFromOrder` (BR-N405/407).
 *  Workflow `subscription_creation`: condicional al `os.tipo_cobro='suscripcion'`. */
export const SubscriptionCreateFromOrderInputSchema = z.object({
  orderId: uuidSchema,
});

/** SPEC-011 AC-3 · input de `subscriptions.pausar` (BR-N404). */
export const SubscriptionPauseInputSchema = z.object({
  id: uuidSchema,
  reason: SubscriptionReasonSchema,
});

/** SPEC-011 AC-3 · input de `subscriptions.cancelar` (BR-N404). */
export const SubscriptionCancelInputSchema = z.object({
  id: uuidSchema,
  reason: SubscriptionReasonSchema,
});

/** SPEC-011 AC-3 · input de `subscriptions.reactivar` (DEC-FUN-65). */
export const SubscriptionReactivateInputSchema = z.object({
  id: uuidSchema,
  reason: SubscriptionReasonSchema,
});

/** SPEC-011 AC-4 / AC-9 · input de `subscriptions.renovar` (BR-N406). */
export const SubscriptionRenovarInputSchema = z.object({
  id: uuidSchema,
  /** Fecha de inicio del nuevo periodo (inclusive). Por defecto usa
   *  `current_period_end + 1 día` calculado por el servicio. */
  nextPeriodStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe ser YYYY-MM-DD")
    .optional(),
});

/** SPEC-011 AC-7 · input de `subscriptions.markVencida` (job). */
export const SubscriptionMarkVencidaInputSchema = z.object({
  refDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe ser YYYY-MM-DD"),
});

/** SPEC-011 AC-6 · input de `subscriptions.list` (panel, BR-N400). */
export const SubscriptionListInputSchema = z.object({
  status: SubscriptionStatusSchema.optional(),
  periodicity: SubscriptionPeriodicitySchema.optional(),
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
});

/** SPEC-011 · input de `subscriptions.get`. */
export const SubscriptionGetInputSchema = z.object({
  id: uuidSchema,
});

/** SPEC-011 · input de `subscriptions.history`. */
export const SubscriptionHistoryListInputSchema = z.object({
  id: uuidSchema,
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

/** SPEC-011 AC-8 · input de `subscriptions.facturacion` (lectura). */
export const SubscriptionFacturacionInputSchema = z.object({
  id: uuidSchema,
});

/** SPEC-011 AC-8 · input de `subscriptions.cobranza` (lectura). */
export const SubscriptionCobranzaInputSchema = z.object({
  id: uuidSchema,
});

export type SubscriptionCreateFromOrderInput = z.infer<
  typeof SubscriptionCreateFromOrderInputSchema
>;
export type SubscriptionPauseInput = z.infer<
  typeof SubscriptionPauseInputSchema
>;
export type SubscriptionCancelInput = z.infer<
  typeof SubscriptionCancelInputSchema
>;
export type SubscriptionReactivateInput = z.infer<
  typeof SubscriptionReactivateInputSchema
>;
export type SubscriptionRenovarInput = z.infer<
  typeof SubscriptionRenovarInputSchema
>;
export type SubscriptionMarkVencidaInput = z.infer<
  typeof SubscriptionMarkVencidaInputSchema
>;
export type SubscriptionListInput = z.infer<typeof SubscriptionListInputSchema>;
export type SubscriptionGetInput = z.infer<typeof SubscriptionGetInputSchema>;
export type SubscriptionHistoryListInput = z.infer<
  typeof SubscriptionHistoryListInputSchema
>;
export type SubscriptionFacturacionInput = z.infer<
  typeof SubscriptionFacturacionInputSchema
>;
export type SubscriptionCobranzaInput = z.infer<
  typeof SubscriptionCobranzaInputSchema
>;
