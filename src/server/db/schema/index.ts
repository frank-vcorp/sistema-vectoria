/**
 * Schema index. Drizzle Kit consume este módulo para generar la migración
 * inicial (`drizzle/0000_init.sql`). Las migraciones RLS viven aparte.
 *
 * SPEC-002 (Clientes/Prospectos): las tablas `prospects`, `clients`,
 * `client_contacts` y `client_fiscal_data` se añaden aquí. La
 * migración Drizzle Kit se regenerará al ejecutar `db:generate`.
 */
export * from "./organizations";
export * from "./organization-fiscal-config";
export * from "./users";
export * from "./credentials";
export * from "./invitations";
export * from "./roles";
export * from "./permissions";
export * from "./role-permissions";
export * from "./user-roles";
export * from "./user-permissions";
export * from "./audit-logs";
export * from "./project-log-entries";
export * from "./notifications";
export * from "./files";
export * from "./file-links";
export * from "./job-runs";
export * from "./refresh-tokens";
export * from "./prospects";
export * from "./clients";
export * from "./client-contacts";
export * from "./client-fiscal-data";
// SPEC-003 (Comercial)
export * from "./questionnaires";
export * from "./questionnaire-questions";
export * from "./questionnaire-responses";
export * from "./catalog-services";
export * from "./templates";
export * from "./scope-documents";
export * from "./quotes";
export * from "./quote-items";
export * from "./quote-acceptances";
// SPEC-004 (Orden de Servicio)
export * from "./orders";
// SPEC-005 (Proyectos — artefactos y estados)
export * from "./projects";
// SPEC-006 (Proyectos — equipo y ejecución · B11-B16)
export * from "./requirements";
export * from "./tasks";
export * from "./time-entries";
export * from "./tests";
export * from "./deliverables";
export * from "./change-requests";
// SPEC-007 (Facturación CFDI · B18)
export * from "./invoices";
export * from "./invoice-schedules";
// SPEC-008 (Cobranza y Comisiones · B17/B19/B20)
export * from "./payments";
export * from "./payment-applications";
export * from "./collection-activities";
export * from "./collection-promises";
export * from "./commissions";
export * from "./commission-reversals";
// SPEC-009 (Finanzas y Movimientos · B21/B26)
export * from "./accounts";
export * from "./transactions";
export * from "./transfers";
export * from "./direct-costs";
// SPEC-010 (Dashboard / Administración / Bitácora · B22/B23)
export * from "./user-dashboard-preferences";
// SPEC-011 (Suscripciones · B20a · BR-N399..N406)
export * from "./subscriptions";
export * from "./subscription-periods";
export * from "./subscription-history";
