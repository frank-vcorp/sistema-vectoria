/**
 * `questionnaire_responses` — SPEC-003 §4.1 (B4).
 *
 * Respuesta completada a un cuestionario (vinculada a un prospecto;
 * el PL firma el alcance sobre la respuesta más reciente). El contenido
 * de las respuestas vive en `content` (jsonb keyed por `code` de
 * pregunta) para no acoplar el schema a las preguntas concretas.
 *
 * `presupuesto_declarado_cents` se copia del cuestionario al crear la
 * cotización (BR-N411, DEC-FUN-20260819-73). Nullable: si el prospecto
 * no declaró presupuesto, `null` desactiva la advertencia de desviación
 * (AC-12).
 */
import {
  bigint,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { prospects } from "./prospects";
import { questionnaires } from "./questionnaires";

export const questionnaireResponses = pgTable(
  "questionnaire_responses",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    questionnaireId: uuid("questionnaire_id").notNull(),
    prospectId: uuid("prospect_id").notNull(),
    /** Versión del cuestionario contestado (digital/imprimible/guía). */
    version: text("version").notNull().default("digital"),
    /** Respuestas keyed por `code` de pregunta (jsonb). */
    content: jsonb("content").notNull(),
    /** BR-N411: presupuesto declarado en centavos MXN (nullable). */
    presupuestoDeclaradoCents: bigint("presupuesto_declarado_cents", {
      mode: "number",
    }),
    /** Tipo de proyecto declarado por el prospecto (DEC-FUN-53, BR-N230). */
    projectType: text("project_type"),
    submittedBy: uuid("submitted_by"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgProspectIdx: index("questionnaire_responses_org_prospect_idx").on(
      t.organizationId,
      t.prospectId,
    ),
    orgQuestionnaireIdx: index("questionnaire_responses_org_q_idx").on(
      t.organizationId,
      t.questionnaireId,
    ),
    questionnaireFk: foreignKey({
      name: "questionnaire_responses_questionnaire_fk",
      columns: [t.organizationId, t.questionnaireId],
      foreignColumns: [questionnaires.organizationId, questionnaires.id],
    }),
    prospectFk: foreignKey({
      name: "questionnaire_responses_prospect_fk",
      columns: [t.organizationId, t.prospectId],
      foreignColumns: [prospects.organizationId, prospects.id],
    }),
  }),
);

export type QuestionnaireResponse = typeof questionnaireResponses.$inferSelect;
export type QuestionnaireResponseNew = typeof questionnaireResponses.$inferInsert;
