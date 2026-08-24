/** Inspección estática de schema para AC-2; no requiere BD viva. */
import * as schema from "@/server/db/schema";

const businessTables = [
  "organizationFiscalConfig",
  "users",
  "credentials",
  "invitations",
  "roles",
  "permissions",
  "rolePermissions",
  "userRoles",
  "userPermissions",
  "auditLogs",
  "projectLogEntries",
  "notifications",
  "files",
  "fileLinks",
  // SPEC-002 (Clientes/Prospectos).
  "prospects",
  "clients",
  "clientContacts",
  "clientFiscalData",
  // SPEC-003 (Comercial).
  "questionnaires",
  "questionnaireQuestions",
  "questionnaireResponses",
  "catalogServices",
  "templates",
  "scopeDocuments",
  "quotes",
  "quoteItems",
  "quoteAcceptances",
  // SPEC-004 (Orden de Servicio).
  "orders",
  // SPEC-005 (Proyectos — artefactos y estados).
  "projects",
  "projectMembers",
  "projectScopeSnapshots",
  "modules",
  "jsonDiscoveryImports",
  // SPEC-006 (Proyectos — equipo y ejecución · B11-B16).
  "requirements",
  "tasks",
  "taskChecklists",
  "taskEvidence",
  "taskAssignments",
  "timeEntries",
  "tests",
  "deliverables",
  "changeRequests",
  // SPEC-007 (Facturación CFDI · B18).
  "invoices",
  "invoiceSchedules",
  // SPEC-008 (Cobranza y Comisiones · B17/B19/B20).
  "payments",
  "paymentApplications",
  "collectionActivities",
  "collectionPromises",
  "commissions",
  "commissionReversals",
  // SPEC-009 (Finanzas y Movimientos · B21/B26).
  "accounts",
  "transactions",
  "transfers",
  "directCosts",
  // SPEC-010 (Dashboard / Administración / Bitácora · B22/B23).
  "userDashboardPreferences",
  // SPEC-011 (Suscripciones · B20a · BR-N399..N406).
  "subscriptions",
  "subscriptionPeriods",
  "subscriptionHistory",
] as const;
const missing = businessTables.filter((name) => !("organizationId" in (schema[name] as unknown as Record<string, unknown>)));
if (missing.length) { console.error(`ERROR: tablas sin organization_id: ${missing.join(", ")}`); process.exit(1); }
console.info(`OK: ${businessTables.length} tablas con organization_id; 0 sin organization_id`);
