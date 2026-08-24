/**
 * `db:seed:catalog` — SPEC-003 (Comercial).
 *
 * Reemplaza el stub anterior (ADR-04 §2.4, "AC-39 stub idempotente").
 * Materializa el contenido semilla de:
 *  - 6 cuestionarios (P-003-1: conteo Frank) — 4 web + 2 genéricos.
 *  - 9 plantillas (BR-N228) — 4 web + 5 otros.
 *  - Catálogo base de servicios (BR-N226/227) — 4 tipos × 4 ciclos.
 *
 * Idempotencia: si `is_seed=true` ya existe, omite. Si existe con
 * `is_seed=false`, no sobreescribe (preserva cambios manuales).
 *
 * Multi-tenant (ADR-02 §8.3 / P2-1 QA-20260823-05): todas las tablas
 * `questionnaires`/`questionnaire_questions`/`templates`/
 * `catalog_services` tienen `organization_id NOT NULL` y UNIQUE por
 * `(organization_id, code)`. Este script obtiene el `orgId` de la
 * organización seed (`slug='default'`, misma convención que
 * `seed-plataforma.ts`) y lo aplica a todos los INSERTs — sin inventar
 * UUIDs inválidos y respetando el constraint compuesto.
 *
 * Permisos sembrados en `scripts/seed-data.ts` ya cubren los
 * necesarios para Comercial (`gestionar_comercial`, `firmar_alcance`,
 * `aceptar_cotizacion`, `aprobar_descuento` para Director).
 */
import { and, eq } from "drizzle-orm";
import { closeDb, getDb, schema } from "@/server/db/client";
import { loadEnv } from "@/lib/env";

const Q = schema.questionnaires;
const QQ = schema.questionnaireQuestions;
const T = schema.templates;
const CS = schema.catalogServices;
const ORG = schema.organizations;

interface QuestionSeed {
  layer: 1 | 2 | 3 | 4;
  code: string;
  prompt: string;
  answerType:
    | "text"
    | "number"
    | "single_choice"
    | "multi_choice"
    | "boolean"
    | "scale"
    | "date";
  required: boolean;
  options?: Array<{ value: string; label: string }>;
  condition?: { questionCode: string; equals: string | number | boolean };
  sortOrder: number;
  helpText?: string;
}

interface QuestionnaireSeed {
  code: string;
  name: string;
  type: string;
  description: string;
  questions: QuestionSeed[];
}

/** 6 cuestionarios seed (P-003-1). */
const QUESTIONNAIRES: QuestionnaireSeed[] = [
  // 1) Web landing — capa 1 base + capa 2 web_landing.
  {
    code: "Q-WEB-LANDING",
    name: "Cuestionario Web · Landing",
    type: "web_landing",
    description: "Sondeo para proyectos web tipo landing page.",
    questions: [
      { layer: 1, code: "objetivo_principal", prompt: "¿Cuál es el objetivo principal del sitio?", answerType: "single_choice", required: true, sortOrder: 1, options: [
        { value: "captar_leads", label: "Captar leads" },
        { value: "venta_directa", label: "Venta directa" },
        { value: "informar", label: "Informar / presencia" },
        { value: "otro", label: "Otro" },
      ] },
      { layer: 1, code: "audiencia_objetivo", prompt: "Describe brevemente la audiencia objetivo.", answerType: "text", required: true, sortOrder: 2 },
      { layer: 1, code: "presupuesto_estimado_mxn", prompt: "Presupuesto estimado (MXN, sin IVA).", answerType: "number", required: false, sortOrder: 3 },
      { layer: 1, code: "fecha_lanzamiento", prompt: "Fecha objetivo de lanzamiento.", answerType: "date", required: false, sortOrder: 4 },
      { layer: 1, code: "acepta_datos_personales", prompt: "¿Se recolectarán datos personales?", answerType: "boolean", required: true, sortOrder: 5 },
      // Capa 2
      { layer: 2, code: "secciones_requeridas", prompt: "Secciones requeridas (catálogo, contacto, blog, etc.)", answerType: "multi_choice", required: true, sortOrder: 6, options: [
        { value: "hero", label: "Hero" },
        { value: "servicios", label: "Servicios" },
        { value: "portafolio", label: "Portafolio" },
        { value: "blog", label: "Blog" },
        { value: "contacto", label: "Contacto" },
        { value: "faq", label: "FAQ" },
      ] },
      { layer: 2, code: "numero_paginas", prompt: "Número aproximado de páginas.", answerType: "number", required: false, sortOrder: 7 },
      { layer: 2, code: "responsable_contenido", prompt: "¿Quién proveerá los textos?", answerType: "single_choice", required: true, sortOrder: 8, options: [
        { value: "cliente", label: "Cliente" },
        { value: "copy_proveedor", label: "Proveedor (copy)" },
        { value: "mixto", label: "Mixto" },
      ] },
      { layer: 2, code: "logo_disponible", prompt: "¿Cuentan con logo y manual de marca?", answerType: "boolean", required: true, sortOrder: 9 },
      { layer: 2, code: "ejemplos_referencia", prompt: "URLs de sitios de referencia (opcional).", answerType: "text", required: false, sortOrder: 10 },
      // Capa 3
      { layer: 3, code: "service_landing_basico", prompt: "¿Desean servicio de mantenimiento mensual?", answerType: "boolean", required: false, sortOrder: 11 },
      // Capa 4 condicional
      { layer: 4, code: "necesita_accesibilidad", prompt: "¿Necesitan certificar accesibilidad WCAG?", answerType: "boolean", required: false, sortOrder: 12, condition: { questionCode: "objetivo_principal", equals: "informar" } },
    ],
  },
  // 2) Web sitio — más preguntas de arquitectura.
  {
    code: "Q-WEB-SITIO",
    name: "Cuestionario Web · Sitio institucional",
    type: "web_sitio",
    description: "Sondeo para sitios web institucionales / corporativos.",
    questions: [
      { layer: 1, code: "objetivo_principal", prompt: "Objetivo principal", answerType: "single_choice", required: true, sortOrder: 1, options: [
        { value: "presencia", label: "Presencia institucional" },
        { value: "leads", label: "Generar leads" },
        { value: "reclutamiento", label: "Reclutamiento" },
      ] },
      { layer: 1, code: "audiencia_objetivo", prompt: "Audiencia objetivo", answerType: "text", required: true, sortOrder: 2 },
      { layer: 1, code: "presupuesto_estimado_mxn", prompt: "Presupuesto estimado (MXN)", answerType: "number", required: false, sortOrder: 3 },
      { layer: 1, code: "fecha_lanzamiento", prompt: "Fecha objetivo", answerType: "date", required: false, sortOrder: 4 },
      { layer: 1, code: "acepta_datos_personales", prompt: "¿Datos personales?", answerType: "boolean", required: true, sortOrder: 5 },
      { layer: 2, code: "numero_secciones", prompt: "Número de secciones principales", answerType: "number", required: true, sortOrder: 6 },
      { layer: 2, code: "multidioma", prompt: "¿Multidioma?", answerType: "boolean", required: true, sortOrder: 7 },
      { layer: 2, code: "cms_deseado", prompt: "CMS preferido", answerType: "single_choice", required: false, sortOrder: 8, options: [
        { value: "wordpress", label: "WordPress" },
        { value: "headless", label: "Headless (Strapi/Contentful)" },
        { value: "estatico", label: "Estático" },
      ] },
      { layer: 2, code: "ejemplos_referencia", prompt: "Referencias visuales", answerType: "text", required: false, sortOrder: 9 },
      { layer: 2, code: "integraciones", prompt: "Integraciones externas (CRM, analítica, mapas)", answerType: "text", required: false, sortOrder: 10 },
    ],
  },
  // 3) Web app.
  {
    code: "Q-WEB-APP",
    name: "Cuestionario Web · Aplicación",
    type: "web_app",
    description: "Sondeo para aplicaciones web transaccionales.",
    questions: [
      { layer: 1, code: "objetivo_principal", prompt: "Objetivo principal", answerType: "text", required: true, sortOrder: 1 },
      { layer: 1, code: "audiencia_objetivo", prompt: "Audiencia objetivo", answerType: "text", required: true, sortOrder: 2 },
      { layer: 1, code: "presupuesto_estimado_mxn", prompt: "Presupuesto estimado", answerType: "number", required: false, sortOrder: 3 },
      { layer: 1, code: "fecha_lanzamiento", prompt: "Fecha objetivo", answerType: "date", required: false, sortOrder: 4 },
      { layer: 1, code: "acepta_datos_personales", prompt: "¿Datos personales?", answerType: "boolean", required: true, sortOrder: 5 },
      { layer: 2, code: "roles_usuario", prompt: "Roles de usuario previstos", answerType: "text", required: true, sortOrder: 6 },
      { layer: 2, code: "volumen_usuarios", prompt: "Volumen de usuarios esperado (concurrentes)", answerType: "number", required: false, sortOrder: 7 },
      { layer: 2, code: "integraciones_externas", prompt: "Integraciones externas", answerType: "text", required: false, sortOrder: 8 },
      { layer: 2, code: "regulatorio", prompt: "¿Sector regulado (salud/financiero/gobierno)?", answerType: "boolean", required: true, sortOrder: 9 },
    ],
  },
  // 4) Web SaaS.
  {
    code: "Q-WEB-SAAS",
    name: "Cuestionario Web · SaaS",
    type: "web_saas",
    description: "Sondeo para plataformas SaaS multi-tenant.",
    questions: [
      { layer: 1, code: "objetivo_principal", prompt: "Objetivo principal", answerType: "text", required: true, sortOrder: 1 },
      { layer: 1, code: "audiencia_objetivo", prompt: "Audiencia objetivo", answerType: "text", required: true, sortOrder: 2 },
      { layer: 1, code: "presupuesto_estimado_mxn", prompt: "Presupuesto estimado", answerType: "number", required: false, sortOrder: 3 },
      { layer: 1, code: "fecha_lanzamiento", prompt: "Fecha objetivo MVP", answerType: "date", required: false, sortOrder: 4 },
      { layer: 1, code: "acepta_datos_personales", prompt: "¿Datos personales?", answerType: "boolean", required: true, sortOrder: 5 },
      { layer: 2, code: "modelo_pricing", prompt: "Modelo de pricing", answerType: "single_choice", required: true, sortOrder: 6, options: [
        { value: "freemium", label: "Freemium" },
        { value: "suscripcion", label: "Suscripción" },
        { value: "consumo", label: "Por consumo" },
      ] },
      { layer: 2, code: "stripe_mercadopago", prompt: "Pasarela de pago preferida", answerType: "single_choice", required: false, sortOrder: 7, options: [
        { value: "stripe", label: "Stripe" },
        { value: "mercadopago", label: "Mercado Pago" },
        { value: "conekta", label: "Conekta" },
      ] },
      { layer: 2, code: "regulatorio", prompt: "¿Sector regulado?", answerType: "boolean", required: true, sortOrder: 8 },
    ],
  },
  // 5) Genérico — consulta corta para prospectos sin web específica.
  {
    code: "Q-GENERAL",
    name: "Cuestionario General",
    type: "general",
    description: "Sondeo inicial corto para cualquier tipo de proyecto.",
    questions: [
      { layer: 1, code: "objetivo_principal", prompt: "Objetivo principal del proyecto", answerType: "text", required: true, sortOrder: 1 },
      { layer: 1, code: "audiencia_objetivo", prompt: "Audiencia objetivo", answerType: "text", required: true, sortOrder: 2 },
      { layer: 1, code: "presupuesto_estimado_mxn", prompt: "Presupuesto estimado (MXN)", answerType: "number", required: false, sortOrder: 3 },
      { layer: 1, code: "fecha_lanzamiento", prompt: "Fecha objetivo", answerType: "date", required: false, sortOrder: 4 },
      { layer: 1, code: "acepta_datos_personales", prompt: "¿Datos personales?", answerType: "boolean", required: true, sortOrder: 5 },
    ],
  },
  // 6) Genérico soporte / consultoría — ligero, para tickets rápidos.
  {
    code: "Q-SOPORTE",
    name: "Cuestionario Soporte / Consultoría",
    type: "soporte",
    description: "Sondeo breve para servicios de soporte o consultoría.",
    questions: [
      { layer: 1, code: "objetivo_principal", prompt: "Describe brevemente lo que necesitas", answerType: "text", required: true, sortOrder: 1 },
      { layer: 1, code: "audiencia_objetivo", prompt: "¿A quién va dirigido?", answerType: "text", required: false, sortOrder: 2 },
      { layer: 1, code: "presupuesto_estimado_mxn", prompt: "Presupuesto estimado (MXN)", answerType: "number", required: false, sortOrder: 3 },
      { layer: 1, code: "urgencia", prompt: "¿Qué tan urgente es? (1-5)", answerType: "scale", required: true, sortOrder: 4 },
      { layer: 1, code: "acepta_datos_personales", prompt: "¿Datos personales?", answerType: "boolean", required: true, sortOrder: 5 },
    ],
  },
];

/** 9 plantillas seed (BR-N228). */
const TEMPLATES = [
  {
    code: "TPL-WEB-LANDING",
    name: "Plantilla · Web Landing",
    type: "web_landing",
    description: "Esqueleto de alcance para una landing page institucional o de conversión.",
    modules: [
      { code: "diseño", name: "Diseño UI/UX responsive", required: true },
      { code: "frontend", name: "Desarrollo frontend (Next.js)", required: true },
      { code: "cms", name: "CMS ligero (Markdown/MDX)", required: false },
      { code: "analytics", name: "Analítica y métricas", required: true },
      { code: "seo", name: "SEO on-page", required: true },
    ],
  },
  {
    code: "TPL-WEB-SITIO",
    name: "Plantilla · Web Sitio",
    type: "web_sitio",
    description: "Sitio institucional multi-sección con CMS.",
    modules: [
      { code: "diseno", name: "Diseño UI/UX responsive", required: true },
      { code: "frontend", name: "Desarrollo frontend", required: true },
      { code: "cms", name: "CMS headless o tradicional", required: true },
      { code: "i18n", name: "Internacionalización (es/en)", required: false },
      { code: "analytics", name: "Analítica", required: true },
      { code: "seo", name: "SEO técnico", required: true },
    ],
  },
  {
    code: "TPL-WEB-APP",
    name: "Plantilla · Web App",
    type: "web_app",
    description: "Aplicación web transaccional con backend y base de datos.",
    modules: [
      { code: "diseno", name: "Diseño UI/UX", required: true },
      { code: "frontend", name: "Frontend", required: true },
      { code: "backend", name: "Backend / API", required: true },
      { code: "db", name: "Base de datos y migraciones", required: true },
      { code: "auth", name: "Autenticación y autorización", required: true },
      { code: "tests", name: "Pruebas E2E", required: true },
      { code: "ops", name: "Despliegue y monitoreo", required: true },
    ],
  },
  {
    code: "TPL-WEB-SAAS",
    name: "Plantilla · Web SaaS",
    type: "web_saas",
    description: "Plataforma SaaS multi-tenant con billing y suscripciones.",
    modules: [
      { code: "diseno", name: "Diseño UI/UX", required: true },
      { code: "frontend", name: "Frontend", required: true },
      { code: "backend", name: "Backend / API", required: true },
      { code: "tenancy", name: "Aislamiento multi-tenant", required: true },
      { code: "billing", name: "Billing / pasarela de pago", required: true },
      { code: "subscriptions", name: "Gestión de suscripciones", required: true },
      { code: "auth", name: "Autenticación y roles", required: true },
      { code: "tests", name: "Pruebas E2E + contract tests", required: true },
      { code: "ops", name: "Despliegue y monitoreo", required: true },
    ],
  },
  {
    code: "TPL-MOBILE-APP",
    name: "Plantilla · Mobile App",
    type: "mobile_app",
    description: "App móvil (iOS/Android) o PWA.",
    modules: [
      { code: "diseno", name: "Diseño UI/UX (mobile)", required: true },
      { code: "frontend", name: "Frontend móvil", required: true },
      { code: "backend", name: "Backend / API", required: true },
      { code: "auth", name: "Autenticación móvil", required: true },
      { code: "store", name: "Publicación en stores", required: false },
      { code: "ops", name: "Despliegue y monitoreo", required: true },
    ],
  },
  {
    code: "TPL-BRANDING",
    name: "Plantilla · Branding",
    type: "branding",
    description: "Identidad de marca (logo, paleta, manual).",
    modules: [
      { code: "logo", name: "Diseño de logo", required: true },
      { code: "paleta", name: "Paleta y tipografía", required: true },
      { code: "manual", name: "Manual de marca", required: true },
      { code: "papeleria", name: "Papelería básica", required: false },
    ],
  },
  {
    code: "TPL-MARKETING",
    name: "Plantilla · Marketing",
    type: "marketing",
    description: "Campaña de marketing digital integral.",
    modules: [
      { code: "estrategia", name: "Estrategia", required: true },
      { code: "contenido", name: "Producción de contenido", required: true },
      { code: "ads", name: "Gestión de pauta digital", required: true },
      { code: "analiticas", name: "Analítica y reportes", required: true },
    ],
  },
  {
    code: "TPL-CONSULTORIA",
    name: "Plantilla · Consultoría",
    type: "consultoria",
    description: "Consultoría por horas/semanas.",
    modules: [
      { code: "diagnostico", name: "Diagnóstico inicial", required: true },
      { code: "entregables", name: "Entregables por hito", required: true },
      { code: "seguimiento", name: "Reuniones de seguimiento", required: true },
    ],
  },
  {
    code: "TPL-SOPORTE",
    name: "Plantilla · Soporte",
    type: "soporte",
    description: "Bolsa de horas de soporte mensual.",
    modules: [
      { code: "bolsa_horas", name: "Bolsa de horas", required: true },
      { code: "sla", name: "SLA definido", required: true },
      { code: "reportes", name: "Reportes mensuales", required: true },
    ],
  },
];

/** Catálogo base de servicios (BR-N226/227). */
const CATALOG_SERVICES = [
  {
    code: "S-LANDING-DEV",
    name: "Desarrollo de landing page",
    serviceType: "servicio_unico" as const,
    billingCycle: "unico" as const,
    description: "Diseño y desarrollo de landing page institucional o de conversión.",
    defaultUnitPriceCents: 3500000,
  },
  {
    code: "S-SITIO-DEV",
    name: "Desarrollo de sitio web",
    serviceType: "servicio_unico" as const,
    billingCycle: "unico" as const,
    description: "Sitio institucional multi-sección con CMS.",
    defaultUnitPriceCents: 12000000,
  },
  {
    code: "S-WEBAPP-DEV",
    name: "Desarrollo de aplicación web",
    serviceType: "servicio_unico" as const,
    billingCycle: "unico" as const,
    description: "Aplicación web transaccional con backend y BD.",
    defaultUnitPriceCents: 25000000,
  },
  {
    code: "S-SAAS-MANT",
    name: "Mantenimiento SaaS mensual",
    serviceType: "servicio_recurrente" as const,
    billingCycle: "mensual" as const,
    description: "Bolsa de horas mensual para mantenimiento y mejora continua.",
    defaultUnitPriceCents: 2500000,
  },
  {
    code: "S-CONSULTORIA-HR",
    name: "Consultoría por horas",
    serviceType: "servicio_unico" as const,
    billingCycle: "unico" as const,
    description: "Horas de consultoría técnica o de producto.",
    defaultUnitPriceCents: 35000,
  },
  {
    code: "S-LICENCIA-ANUAL",
    name: "Licencia anual de producto",
    serviceType: "producto_recurrente" as const,
    billingCycle: "anual" as const,
    description: "Licencia anual de producto (suscripción).",
    defaultUnitPriceCents: 6000000,
  },
  {
    code: "S-DISENO-HORAS",
    name: "Diseño por horas",
    serviceType: "servicio_unico" as const,
    billingCycle: "unico" as const,
    description: "Diseño UI/UX por horas.",
    defaultUnitPriceCents: 25000,
  },
  {
    code: "S-HOSTING-MENSUAL",
    name: "Hosting mensual",
    serviceType: "servicio_recurrente" as const,
    billingCycle: "mensual" as const,
    description: "Hosting administrado mensual.",
    defaultUnitPriceCents: 150000,
  },
];

/**
 * Resuelve la organización seed (`slug='default'`). La crea si no
 * existe (idempotente: misma fila que `seed-plataforma.ts` cuando
 * corre primero; defensivo: permite ejecutar este script standalone).
 * Devuelve el `orgId` válido para usarlo en los INSERTs de las
 * tablas que requieren `organization_id NOT NULL` (P2-1 QA-05).
 */
async function resolveDefaultOrgId(): Promise<string> {
  const db = getDb();
  const env = loadEnv();
  const [existing] = await db
    .select()
    .from(ORG)
    .where(eq(ORG.slug, "default"))
    .limit(1);
  if (existing) return existing.id;
  const [org] = await db
    .insert(ORG)
    .values({
      slug: "default",
      name: env.VECTORIA_ORG_NAME,
      currency: "MXN",
      locale: "es-MX",
      timezone: "America/Mexico_City",
      active: true,
    })
    .returning();
  if (!org) throw new Error("No se pudo crear organización seed");
  return org.id;
}

async function seed() {
  const db = getDb();
  const orgId = await resolveDefaultOrgId();

  // 1) Cuestionarios + preguntas (idempotente, multi-tenant).
  let questionnairesCreated = 0;
  let questionsCreated = 0;
  for (const q of QUESTIONNAIRES) {
    const existing = await db
      .select({ id: Q.id, isSeed: Q.isSeed })
      .from(Q)
      .where(and(eq(Q.code, q.code), eq(Q.organizationId, orgId)))
      .limit(1);
    let qid: string;
    if (existing.length > 0) {
      const e = existing[0]!;
      qid = e.id;
      if (e.isSeed !== "true") {
        // No sobreescribimos cambios manuales.
        continue;
      }
    } else {
      const [row] = await db
        .insert(Q)
        .values({
          organizationId: orgId,
          code: q.code,
          name: q.name,
          type: q.type,
          version: "digital",
          status: "published",
          description: q.description,
          isSeed: "true",
        })
        .returning();
      if (!row) throw new Error(`No se pudo crear cuestionario ${q.code}`);
      qid = row.id;
      questionnairesCreated++;
    }
    // Preguntas: si ya existen preguntas seed del cuestionario, no duplicamos.
    const existingQ = await db
      .select({ id: QQ.id })
      .from(QQ)
      .where(
        and(
          eq(QQ.organizationId, orgId),
          eq(QQ.questionnaireId, qid),
          eq(QQ.code, q.questions[0]?.code ?? "_none_"),
        ),
      )
      .limit(1);
    if (existingQ.length > 0) continue;
    for (const qq of q.questions) {
      await db.insert(QQ).values({
        organizationId: orgId,
        questionnaireId: qid,
        layer: qq.layer,
        code: qq.code,
        prompt: qq.prompt,
        answerType: qq.answerType,
        required: qq.required,
        options: qq.options ?? null,
        condition: qq.condition ?? null,
        sortOrder: qq.sortOrder,
        helpText: qq.helpText ?? null,
      });
      questionsCreated++;
    }
  }

  // 2) Plantillas (idempotente, multi-tenant).
  let templatesCreated = 0;
  for (const t of TEMPLATES) {
    const existing = await db
      .select({ id: T.id, isSeed: T.isSeed })
      .from(T)
      .where(and(eq(T.code, t.code), eq(T.organizationId, orgId)))
      .limit(1);
    if (existing.length > 0) {
      if (existing[0]!.isSeed !== true) continue;
      continue;
    }
    await db.insert(T).values({
      organizationId: orgId,
      code: t.code,
      name: t.name,
      type: t.type,
      description: t.description,
      content: { project_modules: t.modules },
      isSeed: true,
      active: true,
    });
    templatesCreated++;
  }

  // 3) Catálogo base (idempotente, multi-tenant).
  let servicesCreated = 0;
  for (const s of CATALOG_SERVICES) {
    const existing = await db
      .select({ id: CS.id, isSeed: CS.isSeed })
      .from(CS)
      .where(and(eq(CS.code, s.code), eq(CS.organizationId, orgId)))
      .limit(1);
    if (existing.length > 0) {
      if (existing[0]!.isSeed !== "true") continue;
      continue;
    }
    await db.insert(CS).values({
      organizationId: orgId,
      code: s.code,
      name: s.name,
      serviceType: s.serviceType,
      billingCycle: s.billingCycle,
      description: s.description,
      defaultUnitPriceCents: s.defaultUnitPriceCents,
      active: true,
      isSeed: "true",
    });
    servicesCreated++;
  }

  console.info(
    `OK: seed catálogo (Comercial) · cuestionarios=${questionnairesCreated} nuevos (esperado 6), preguntas=${questionsCreated} nuevas, plantillas=${templatesCreated} nuevas (esperado 9), servicios=${servicesCreated} nuevos (esperado ${CATALOG_SERVICES.length})`,
  );
}

seed()
  .then(async () => {
    await closeDb();
  })
  .catch(async (e: unknown) => {
    console.error(
      "ERROR: seed catálogo (Comercial):",
      e instanceof Error ? e.message : e,
    );
    await closeDb();
    process.exit(1);
  });
