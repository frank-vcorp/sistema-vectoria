/**
 * `scope_documents` — SPEC-003 §4.1 (B6, BR-N51/52/231..N233).
 *
 * Borrador de alcance funcional. La regla de oro (DEC-FUN-23, BR-N220)
 * exige que el **sistema** genere `draft` desde cuestionario + catálogo
 * + plantilla; el PL revisa y firma (`draft → in_review → signed`).
 *
 * `signed` es **inmutable** (BR-N52): cambios vía change request
 * (BR-N232) — fuera del alcance del MVP; el servicio rechaza mutaciones
 * una vez firmado. `content` (jsonb) guarda los bloques del alcance:
 * incluido / excluido / entregables / supuestos / dependencias /
 * criterios de aceptación (BR-N233).
 */
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { clients } from "./clients";
import { questionnaireResponses } from "./questionnaire-responses";
import { prospects } from "./prospects";
import { templates } from "./templates";

export const scopeDocuments = pgTable(
  "scope_documents",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    prospectId: uuid("prospect_id"),
    clientId: uuid("client_id"),
    questionnaireResponseId: uuid("questionnaire_response_id").notNull(),
    templateId: uuid("template_id").notNull(),
    /** `draft | in_review | signed`. */
    status: text("status").notNull().default("draft"),
    /** Bloques del alcance (BR-N233) — jsonb. */
    content: jsonb("content").notNull().default({}),
    /** Versión monótona del documento. */
    version: integer("version").notNull().default(1),
    /** Firmado por (PL, BR-N231). */
    signedBy: uuid("signed_by"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    /** Razón de firma (auditable, BR-N231). */
    signedReason: text("signed_reason"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgProspectIdx: index("scope_documents_org_prospect_idx").on(
      t.organizationId,
      t.prospectId,
    ),
    orgStatusIdx: index("scope_documents_org_status_idx").on(
      t.organizationId,
      t.status,
    ),
    questionnaireFk: foreignKey({
      name: "scope_documents_questionnaire_response_fk",
      columns: [t.organizationId, t.questionnaireResponseId],
      foreignColumns: [
        questionnaireResponses.organizationId,
        questionnaireResponses.id,
      ],
    }),
    templateFk: foreignKey({
      name: "scope_documents_template_fk",
      columns: [t.organizationId, t.templateId],
      foreignColumns: [templates.organizationId, templates.id],
    }),
    prospectFk: foreignKey({
      name: "scope_documents_prospect_fk",
      columns: [t.organizationId, t.prospectId],
      foreignColumns: [prospects.organizationId, prospects.id],
    }),
    clientFk: foreignKey({
      name: "scope_documents_client_fk",
      columns: [t.organizationId, t.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }),
  }),
);

export type ScopeDocument = typeof scopeDocuments.$inferSelect;
export type ScopeDocumentNew = typeof scopeDocuments.$inferInsert;
