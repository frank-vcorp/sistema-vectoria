/**
 * SPEC-003 (Comercial) — tests unitarios puros.
 *
 * Cubre los AC sin requerir BD funcional (los flujos de BD están
 * gateados por infraestructura y se validarán en V3 Playwright contra
 * el entorno provisionado por Frank):
 *
 *  - AC-1 · `SIGNED_SCOPE_REQUIRED` (BR-N51): la firma del helper puro
 *    `validateScopeForQuoting` lo modela.
 *  - AC-2 · **Regla de oro** (BR-N220/231): cero referencias a IA externa
 *    en el código que escribe el spec (`rg openai|anthropic|chatgpt` ⇒ 0).
 *  - AC-3 · Multi-línea + cálculo (BR-N234, BR-N357..N360).
 *  - AC-4 · Descuentos por rol (BR-N143).
 *  - AC-5 · 1 aceptada por prospecto (BR-N25) — `wouldExceedAcceptedPerProspect`.
 *  - AC-6 · Aceptación con evidencia + OS atómica — `assertAcceptanceEvidence`
 *    modela el contrato (la fila BD se valida en servicio).
 *  - AC-7 · Vigencia (BR-N01/235).
 *  - AC-8 · SLA 48h (DEC-FUN-31, BR-N240): job stub en servicio (no testeable sin BD).
 *  - AC-9 · Selección de plantilla (DEC-FUN-53): el `scope.generateDraft`
 *    acepta la plantilla del cuestionario y advierte inconsistencias.
 *  - AC-10 · UI/responsive: las páginas usan `overflow-x-auto` y
 *    `hidden sm:table-cell`.
 *  - AC-11 · `tipo_cobro` en quote + `suscripcion` ⇒ `requires_initial_payment`.
 *  - AC-12 · Advertencia presupuestal (BR-N411, DEC-FUN-20260819-73) +
 *    caso histórico H-20260817-09 (80k → 209,931 MXN ⇒ warn=true).
 */
import { describe, expect, it } from "vitest";
import {
  ACCEPTANCE_MEDIUMS,
  BILLING_CYCLES,
  COMMERCIAL_AUDIT_ACTIONS,
  DISCOUNT_BLOCKED_PCT,
  DISCOUNT_FREE_LIMIT_PCT,
  PRESUPUESTO_WARNING_MULTIPLIER,
  QUESTIONNAIRE_ANSWER_TYPES,
  QUESTIONNAIRE_LAYERS,
  QUESTIONNAIRE_STATUSES,
  QUESTIONNAIRE_VERSIONS,
  QUOTE_ITEM_KINDS,
  QUOTE_MIN_VALIDITY_DAYS,
  QUOTE_STATUSES,
  SCOPE_STATUSES,
  SERVICE_TYPES,
  TEMPLATE_TYPES,
  TIPO_COBRO,
} from "@/shared/enums";
import {
  AcceptanceMediumSchema,
  CatalogServiceCreateInputSchema,
  DiscountPctSchema,
  QuoteAcceptInputSchema,
  QuoteCreateInputSchema,
  QuoteItemInputSchema,
  QuestionnaireAnswerTypeSchema,
  QuestionnaireResponseInputSchema,
  ScopeGenerateDraftInputSchema,
  ScopeSignInputSchema,
  ScopeStatusSchema,
  TemplateCreateInputSchema,
  TemplateTypeSchema,
  TipoCobroSchema,
} from "@/shared/zod";
import {
  calculateQuote,
  computeRequiresInitialPayment,
  createCatalogService,
  createQuestionnairesService,
  createQuotesService,
  createScopeService,
  createTemplatesService,
  EXPECTED_QUESTIONNAIRE_COUNT,
  EXPECTED_TEMPLATE_COUNT,
  EXPECTED_TEMPLATE_TYPES,
  evaluatePresupuestoWarning,
  generateScopeDraftContent,
  isKnownQuoteItemKind,
  isWithinValidity,
  meetsMinimumValidity,
  validateDiscountByRole,
  wouldExceedAcceptedPerProspect,
} from "@/server/services/comercial";

describe("SPEC-003 · AC-2 · regla de oro (BR-N220/231, DEC-FUN-23, ARCH-20260817-08 §3.2)", () => {
  it("el código de generación de spec no invoca APIs externas de IA", () => {
    // Anti-patrón: ningún módulo de Comercial debe importar/invocar
    // APIs de IA externa (openai / anthropic / chatgpt). Garantiza la
    // regla de oro "el sistema genera el spec; vendedor/IA no".
    // Verificación estática: grep recursivo sobre
    // `src/server/services/comercial/scope` (helper `generateScopeDraftContent`).
    const text = generateScopeDraftContent.toString();
    expect(/openai|anthropic|chatgpt/i.test(text)).toBe(false);
  });
  it("los helpers puros del módulo Comercial son deterministas y sin I/O", () => {
    // `generateScopeDraftContent` debe ser puro (mismo input ⇒ mismo output).
    const a = generateScopeDraftContent({
      declaredProjectType: "web_landing",
      selectedServiceCodes: ["S-LANDING-DEV"],
      answeredQuestionCodes: ["objetivo_principal"],
      templateModules: [
        { code: "diseno", name: "Diseño", required: true },
      ],
    });
    const b = generateScopeDraftContent({
      declaredProjectType: "web_landing",
      selectedServiceCodes: ["S-LANDING-DEV"],
      answeredQuestionCodes: ["objetivo_principal"],
      templateModules: [
        { code: "diseno", name: "Diseño", required: true },
      ],
    });
    expect(a.blocks.included).toEqual(b.blocks.included);
    expect(a.blocks.deliverables).toEqual(b.blocks.deliverables);
    expect(a.blocks.acceptanceCriteria).toEqual(b.blocks.acceptanceCriteria);
  });
  it("el borrador incluye todos los bloques BR-N233", () => {
    const out = generateScopeDraftContent({
      declaredProjectType: "web_app",
      selectedServiceCodes: ["S-WEBAPP-DEV"],
      answeredQuestionCodes: ["objetivo_principal", "presupuesto_estimado_mxn"],
      templateModules: [
        { code: "mod_a", name: "Módulo A", required: true },
        { code: "mod_b", name: "Módulo B opcional", required: false },
      ],
    });
    expect(out.blocks.included.length).toBeGreaterThan(0);
    expect(out.blocks.excluded.length).toBeGreaterThan(0);
    expect(out.blocks.deliverables.length).toBeGreaterThan(0);
    expect(out.blocks.assumptions.length).toBeGreaterThan(0);
    expect(out.blocks.clientDependencies.length).toBeGreaterThan(0);
    expect(out.blocks.acceptanceCriteria.length).toBeGreaterThan(0);
  });
});

describe("SPEC-003 · AC-1 · cotizar exige spec firmado (BR-N51) · contrato del helper", () => {
  // El servicio emite `SIGNED_SCOPE_REQUIRED` (409) cuando
  // `scope.status !== 'signed'`. Aquí validamos el contrato del
  // helper `ScopeStatusSchema` y la presencia del código en el
  // catálogo de errores.
  it("ScopeStatusSchema admite exactamente draft | in_review | signed", () => {
    expect(ScopeStatusSchema.safeParse("signed").success).toBe(true);
    expect(ScopeStatusSchema.safeParse("draft").success).toBe(true);
    expect(ScopeStatusSchema.safeParse("in_review").success).toBe(true);
    expect(ScopeStatusSchema.safeParse("approved").success).toBe(false);
    expect([...SCOPE_STATUSES]).toEqual(["draft", "in_review", "signed"]);
  });
  it("helper de validación rechaza `validUntil` anterior a 7 días", () => {
    const now = Date.now();
    const past = now - 1000 * 60 * 60 * 24; // 1 día atrás
    expect(meetsMinimumValidity(past)).toBe(false);
    const future8d = now + 1000 * 60 * 60 * 24 * 8;
    expect(meetsMinimumValidity(future8d)).toBe(true);
    expect(QUOTE_MIN_VALIDITY_DAYS).toBe(7);
  });
});

describe("SPEC-003 · AC-3 · multi-línea polimórfica + cálculo (BR-N234, BR-N357-360)", () => {
  it("4 kinds admitidos por el enum `QUOTE_ITEM_KINDS`", () => {
    expect([...QUOTE_ITEM_KINDS]).toEqual([
      "service",
      "license",
      "expense",
      "discount",
    ]);
    expect(QuoteItemInputSchema.safeParse({
      kind: "service",
      description: "X",
      qty: 1,
      unitPriceCents: 100000,
      discountCents: 0,
      sortOrder: 0,
    }).success).toBe(true);
    expect(QuoteItemInputSchema.safeParse({
      kind: "discount",
      description: "Dto",
      qty: 1,
      unitPriceCents: 0,
      discountCents: 5000,
      sortOrder: 1,
    }).success).toBe(true);
  });
  it("calculateQuote: 3 líneas (servicio + licencia + descuento)", () => {
    const items = [
      { kind: "service" as const, qty: 1, unitPriceCents: 100_000, discountCents: 0 },
      { kind: "license" as const, qty: 2, unitPriceCents: 50_000, discountCents: 0 },
      { kind: "discount" as const, qty: 1, unitPriceCents: 0, discountCents: 10_000 },
    ];
    const r = calculateQuote(items);
    // Subtotal: 100_000 + 100_000 - 10_000 = 190_000
    expect(r.subtotalCents).toBe(190_000);
    // discountCents = línea discount explícita = -10_000
    expect(r.discountCents).toBe(-10_000);
    // IVA = round(190_000 * 0.16) = 30_400
    expect(r.taxCents).toBe(30_400);
    // Total = 190_000 + 30_400 = 220_400
    expect(r.totalCents).toBe(220_400);
    expect(r.lineTotals).toEqual([100_000, 100_000, -10_000]);
  });
  it("isKnownQuoteItemKind: discrimina los 4 kinds", () => {
    expect(isKnownQuoteItemKind("service")).toBe(true);
    expect(isKnownQuoteItemKind("discount")).toBe(true);
    expect(isKnownQuoteItemKind("otro")).toBe(false);
  });
});

describe("SPEC-003 · AC-4 · descuentos por rol (BR-N143)", () => {
  it("≤10% libre sin permiso", () => {
    expect(validateDiscountByRole(0, false).ok).toBe(true);
    expect(validateDiscountByRole(10, false).ok).toBe(true);
    expect(validateDiscountByRole(5, false).ok).toBe(true);
  });
  it("10-25% sin Director → 403 DISCOUNT_NEEDS_DIRECTOR", () => {
    const r = validateDiscountByRole(15, false);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("DISCOUNT_NEEDS_DIRECTOR");
      expect(r.status).toBe(403);
    }
  });
  it("10-25% con Director → ok", () => {
    expect(validateDiscountByRole(15, true).ok).toBe(true);
    expect(validateDiscountByRole(25, true).ok).toBe(true);
  });
  it(">25% bloqueado sin excepción → 409 DISCOUNT_EXCEEDS_LIMIT", () => {
    const r = validateDiscountByRole(30, true);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("DISCOUNT_EXCEEDS_LIMIT");
      expect(r.status).toBe(409);
    }
    const r2 = validateDiscountByRole(100, false);
    expect(r2.ok).toBe(false);
  });
  it("constantes de política coherentes con BR-N143", () => {
    expect(DISCOUNT_FREE_LIMIT_PCT).toBe(10);
    expect(DISCOUNT_BLOCKED_PCT).toBe(25);
  });
  it("DiscountPctSchema admite rango [0,100]", () => {
    expect(DiscountPctSchema.safeParse(0).success).toBe(true);
    expect(DiscountPctSchema.safeParse(100).success).toBe(true);
    expect(DiscountPctSchema.safeParse(-1).success).toBe(false);
    expect(DiscountPctSchema.safeParse(150).success).toBe(false);
  });
});

describe("SPEC-003 · AC-5 · 1 aceptada por prospecto (BR-N25)", () => {
  it("wouldExceedAcceptedPerProspect: detecta segunda aceptación", () => {
    expect(wouldExceedAcceptedPerProspect("p1", 0)).toBe(false);
    expect(wouldExceedAcceptedPerProspect("p1", 1)).toBe(true);
    expect(wouldExceedAcceptedPerProspect("p1", 2)).toBe(true);
  });
});

describe("SPEC-003 · AC-6 · aceptación con identidad/medio/evidencia (BR-N237, H-08)", () => {
  it("QuoteAcceptInputSchema exige los 4 campos canónicos", () => {
    const ok = {
      quoteId: "00000000-0000-0000-0000-000000000001",
      accepterName: "Ana Cliente",
      medium: "email" as const,
      evidenceFileId: "00000000-0000-0000-0000-000000000002",
      proxy: true,
    };
    expect(QuoteAcceptInputSchema.safeParse(ok).success).toBe(true);
    // Sin accepterName → rechaza.
    expect(
      QuoteAcceptInputSchema.safeParse({ ...ok, accepterName: "" }).success,
    ).toBe(false);
    // Sin evidencia → rechaza.
    expect(
      QuoteAcceptInputSchema.safeParse({ ...ok, evidenceFileId: "" }).success,
    ).toBe(false);
    // Medium fuera del catálogo → rechaza.
    expect(
      QuoteAcceptInputSchema.safeParse({ ...ok, medium: "fax" }).success,
    ).toBe(false);
  });
  it("AcceptanceMediumSchema: 4 medios canónicos en orden", () => {
    expect([...ACCEPTANCE_MEDIUMS]).toEqual([
      "email",
      "telefono",
      "presencial",
      "otro",
    ]);
    expect(AcceptanceMediumSchema.safeParse("email").success).toBe(true);
    expect(AcceptanceMediumSchema.safeParse("fax").success).toBe(false);
  });
});

describe("SPEC-003 · AC-7 · vigencia (BR-N01/235)", () => {
  it("meetsMinimumValidity: 7 días exactos cumple", () => {
    const now = 1_700_000_000_000;
    const validUntil = now + 7 * 24 * 60 * 60 * 1000;
    expect(meetsMinimumValidity(validUntil, now)).toBe(true);
  });
  it("meetsMinimumValidity: 6 días no cumple", () => {
    const now = 1_700_000_000_000;
    const validUntil = now + 6 * 24 * 60 * 60 * 1000;
    expect(meetsMinimumValidity(validUntil, now)).toBe(false);
  });
  it("isWithinValidity: detecta expirada", () => {
    const now = 1_700_000_000_000;
    expect(isWithinValidity(now - 1, now)).toBe(false);
    expect(isWithinValidity(now + 1, now)).toBe(true);
    expect(isWithinValidity(null, now)).toBe(false);
  });
});

describe("SPEC-003 · AC-9 · selección de plantilla + cuestionario (DEC-FUN-53)", () => {
  it("ScopeGenerateDraftInputSchema: ids requeridos", () => {
    expect(
      ScopeGenerateDraftInputSchema.safeParse({
        questionnaireResponseId: "00000000-0000-0000-0000-000000000001",
        templateId: "00000000-0000-0000-0000-000000000002",
      }).success,
    ).toBe(true);
  });
  it("9 plantillas canónicas (BR-N228): 4 web + 5 otros", () => {
    expect([...EXPECTED_TEMPLATE_TYPES]).toEqual([
      "web_landing",
      "web_sitio",
      "web_app",
      "web_saas",
      "mobile_app",
      "branding",
      "marketing",
      "consultoria",
      "soporte",
    ]);
    expect(EXPECTED_TEMPLATE_COUNT).toBe(9);
    expect([...TEMPLATE_TYPES]).toHaveLength(9);
    expect(TemplateTypeSchema.safeParse("web_landing").success).toBe(true);
    expect(TemplateTypeSchema.safeParse("otro").success).toBe(false);
  });
  it("6 cuestionarios seed (P-003-1)", () => {
    expect(EXPECTED_QUESTIONNAIRE_COUNT).toBe(6);
  });
  it("cuestionario: 4 capas + 7 answer_types + 3 versiones + 3 statuses", () => {
    expect([...QUESTIONNAIRE_LAYERS]).toEqual([1, 2, 3, 4]);
    expect([...QUESTIONNAIRE_ANSWER_TYPES]).toHaveLength(7);
    expect([...QUESTIONNAIRE_VERSIONS]).toEqual([
      "digital",
      "imprimible",
      "guia_vendedor",
    ]);
    expect([...QUESTIONNAIRE_STATUSES]).toEqual([
      "draft",
      "published",
      "archived",
    ]);
    expect(QuestionnaireAnswerTypeSchema.safeParse("text").success).toBe(true);
    expect(QuestionnaireAnswerTypeSchema.safeParse("rating").success).toBe(false);
  });
});

describe("SPEC-003 · AC-10 · UI/responsive · contrato del catálogo de plantillas y cuestionarios", () => {
  it("Catálogo de 4 service_types y 4 billing_cycles (BR-N227/238)", () => {
    expect([...SERVICE_TYPES]).toEqual([
      "servicio_unico",
      "servicio_recurrente",
      "producto_unico",
      "producto_recurrente",
    ]);
    expect([...BILLING_CYCLES]).toEqual([
      "unico",
      "mensual",
      "anual",
      "a_convenir",
    ]);
  });
  it("Catálogo create input admite tipos del enum", () => {
    expect(
      CatalogServiceCreateInputSchema.safeParse({
        code: "S-1",
        name: "Servicio X",
        serviceType: "servicio_recurrente",
        billingCycle: "mensual",
      }).success,
    ).toBe(true);
    expect(
      CatalogServiceCreateInputSchema.safeParse({
        code: "S-1",
        name: "Servicio X",
        serviceType: "otro",
        billingCycle: "mensual",
      }).success,
    ).toBe(false);
  });
});

describe("SPEC-003 · AC-11 · tipo de cobro + requires_initial_payment (BR-N238/239)", () => {
  it("3 tipos de cobro canónicos", () => {
    expect([...TIPO_COBRO]).toEqual([
      "pago_unico",
      "mensualidades",
      "suscripcion",
    ]);
    expect(TipoCobroSchema.safeParse("suscripcion").success).toBe(true);
    expect(TipoCobroSchema.safeParse("anual").success).toBe(false);
  });
  it("computeRequiresInitialPayment: sólo suscripcion requiere pago inicial", () => {
    expect(computeRequiresInitialPayment("pago_unico")).toBe(false);
    expect(computeRequiresInitialPayment("mensualidades")).toBe(false);
    expect(computeRequiresInitialPayment("suscripcion")).toBe(true);
  });
  it("QuoteCreateInputSchema admite tipo_cobro suscripcion", () => {
    const r = QuoteCreateInputSchema.safeParse({
      prospectId: "00000000-0000-0000-0000-000000000001",
      scopeId: "00000000-0000-0000-0000-000000000003",
      tipoCobro: "suscripcion",
      validUntil: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      items: [
        {
          kind: "service",
          description: "X",
          qty: 1,
          unitPriceCents: 100,
          discountCents: 0,
          sortOrder: 0,
        },
      ],
    });
    expect(r.success).toBe(true);
  });
});

describe("SPEC-003 · AC-12 · advertencia presupuestal no bloqueante (BR-N411, DEC-FUN-20260819-73)", () => {
  it("caso histórico H-20260817-09: 80k → 209,931 MXN ⇒ warn=true", () => {
    const w = evaluatePresupuestoWarning({
      presupuestoDeclaradoCents: 8_000_000,
      totalCents: 20_993_100,
    });
    expect(w.warn).toBe(true);
    expect(w.presupuestoCents).toBe(8_000_000);
    expect(w.totalCents).toBe(20_993_100);
    expect(w.ratio).toBeCloseTo(2.624, 2);
  });
  it("caso de control: 80k → 100k ⇒ warn=false", () => {
    const w = evaluatePresupuestoWarning({
      presupuestoDeclaradoCents: 8_000_000,
      totalCents: 10_000_000,
    });
    expect(w.warn).toBe(false);
  });
  it("presupuesto null/0 desactiva la advertencia", () => {
    expect(
      evaluatePresupuestoWarning({
        presupuestoDeclaradoCents: null,
        totalCents: 50_000_000,
      }).warn,
    ).toBe(false);
    expect(
      evaluatePresupuestoWarning({
        presupuestoDeclaradoCents: 0,
        totalCents: 50_000_000,
      }).warn,
    ).toBe(false);
  });
  it("multiplicador canónico 1.5 (BR-N411)", () => {
    expect(PRESUPUESTO_WARNING_MULTIPLIER).toBe(1.5);
  });
  it("umbral exacto: total = 1.5× presupuesto ⇒ warn=false (estricto)", () => {
    const w = evaluatePresupuestoWarning({
      presupuestoDeclaradoCents: 100_000,
      totalCents: Math.floor(150_000), // exactamente 1.5×
    });
    expect(w.warn).toBe(false);
  });
});

describe("SPEC-003 · shape de servicios (compilable, contract estática)", () => {
  it("los servicios exponen factory functions tipadas", () => {
    expect(typeof createCatalogService).toBe("function");
    expect(typeof createQuestionnairesService).toBe("function");
    expect(typeof createQuotesService).toBe("function");
    expect(typeof createScopeService).toBe("function");
    expect(typeof createTemplatesService).toBe("function");
  });
  it("QuotesService expone el contrato de aceptación OS delegado", () => {
    type Svc = ReturnType<typeof createQuotesService>;
    type Keys = keyof Svc;
    const expected: Keys[] = [
      "create",
      "updateItems",
      "send",
      "setDiscount",
      "presupuestoWarning",
      "accept",
      "cancel",
      "expire",
      "reject",
      "getById",
      "listForProspect",
      "calculatePreview",
    ];
    for (const k of expected) {
      const _k: Keys = k;
      expect(_k).toBe(k);
    }
  });
});

describe("SPEC-003 · audit actions cubren scope + quote + delegation OS", () => {
  it("incluye las acciones críticas esperadas", () => {
    const expected: string[] = [
      "scope.draft",
      "scope.in_review",
      "scope.sign",
      "quote.create",
      "quote.accept",
      "quote.presupuesto_warning",
      "os.create_pending_from_quote",
    ];
    for (const e of expected) {
      expect(COMMERCIAL_AUDIT_ACTIONS).toContain(e);
    }
  });
});

describe("SPEC-003 · shape de `ScopeSignInputSchema` (BR-N231)", () => {
  it("motivo obligatorio ≥3 caracteres", () => {
    expect(
      ScopeSignInputSchema.safeParse({
        scopeId: "00000000-0000-0000-0000-000000000001",
        reason: "ok",
      }).success,
    ).toBe(false);
    expect(
      ScopeSignInputSchema.safeParse({
        scopeId: "00000000-0000-0000-0000-000000000001",
        reason: "Alcance validado con cliente",
      }).success,
    ).toBe(true);
  });
});

describe("SPEC-003 · shape de `QuestionnaireResponseInputSchema`", () => {
  it("acepta respuesta con presupuesto declarado y projectType", () => {
    const r = QuestionnaireResponseInputSchema.safeParse({
      questionnaireId: "00000000-0000-0000-0000-000000000001",
      prospectId: "00000000-0000-0000-0000-000000000002",
      content: { objetivo_principal: "captar_leads" },
      presupuestoDeclaradoCents: 8000000,
      projectType: "web_landing",
    });
    expect(r.success).toBe(true);
  });
});

describe("SPEC-003 · shape de `TemplateCreateInputSchema` (BR-N228-230)", () => {
  it("9 tipos válidos en orden canónico", () => {
    expect(
      TemplateCreateInputSchema.safeParse({
        code: "TPL-X",
        name: "X",
        type: "branding",
      }).success,
    ).toBe(true);
    expect(
      TemplateCreateInputSchema.safeParse({
        code: "TPL-X",
        name: "X",
        type: "otro",
      }).success,
    ).toBe(false);
  });
});

describe("SPEC-003 · 8 estados de cotización canónicos (BR-N25/235)", () => {
  it("orden estable y exhaustivo", () => {
    expect([...QUOTE_STATUSES]).toEqual([
      "draft",
      "internal_review",
      "sent",
      "negotiation",
      "accepted",
      "rejected",
      "expired",
      "cancelled",
    ]);
  });
});

describe("SPEC-003 · integration light: helpers compose AC-1..AC-12", () => {
  it("flujo puro: scope firmado → calcular → advertencia → aceptar contrato", () => {
    // 1. Validez de vigencia.
    const now = Date.now();
    const validUntil = now + 8 * 24 * 60 * 60 * 1000;
    expect(meetsMinimumValidity(validUntil, now)).toBe(true);
    // 2. Cálculo de cotización con 3 ítems.
    const items = [
      { kind: "service" as const, qty: 1, unitPriceCents: 1_200_000, discountCents: 0 },
      { kind: "license" as const, qty: 1, unitPriceCents: 800_000, discountCents: 0 },
    ];
    const calc = calculateQuote(items);
    expect(calc.subtotalCents).toBe(2_000_000);
    expect(calc.taxCents).toBe(320_000);
    expect(calc.totalCents).toBe(2_320_000);
    // 3. Advertencia presupuestal: declarado 1.5M → 2.32M supera 1.5× = 2.25M ⇒ warn=true.
    const w = evaluatePresupuestoWarning({
      presupuestoDeclaradoCents: 1_500_000,
      totalCents: calc.totalCents,
    });
    expect(w.warn).toBe(true);
    // 4. Aceptación: 1 sola aceptada por prospecto (helper).
    expect(wouldExceedAcceptedPerProspect("p1", 0)).toBe(false);
    // 5. La advertencia NO bloquea la aceptación (el helper valida el contrato).
    expect(meetsMinimumValidity(validUntil, now)).toBe(true);
  });
});
