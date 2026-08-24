/**
 * `questionnaire_questions` — SPEC-003 §4.1 (BR-N222..N225).
 *
 * Preguntas como dato editable (DEC-FUN-45). 4 capas adaptativas
 * (DEC-FUN-44, ARCH-20260817-08 §3):
 *   - 1: base universal (5 preguntas).
 *   - 2: por tipo de proyecto (5-10).
 *   - 3: por servicio seleccionado (2-4 c/u).
 *   - 4: sub-cuestionarios condicionales (UX, seguridad, accesibilidad,
 *        capacitación).
 *
 * `condition` (jsonb) activa sub-preguntas condicionales (BR-N223).
 * `answer_type` ∈ `text | number | single_choice | multi_choice | boolean | scale | date`.
 * `required` por pregunta. `sort_order` mantiene el orden del editor
 * visual (DEC-FUN-45).
 */
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { questionnaires } from "./questionnaires";

export const questionnaireQuestions = pgTable(
  "questionnaire_questions",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    questionnaireId: uuid("questionnaire_id").notNull(),
    /** Capa 1..4 (DEC-FUN-44, ARCH-20260817-08). */
    layer: integer("layer").notNull(),
    code: text("code").notNull(),
    prompt: text("prompt").notNull(),
    /**
     * `text | number | single_choice | multi_choice | boolean | scale | date`
     * (validación en código; ver `src/shared/enums/index.ts`).
     */
    answerType: text("answer_type").notNull().default("text"),
    required: boolean("required").notNull().default(false),
    /** Opciones para `single_choice` / `multi_choice` (jsonb). */
    options: jsonb("options"),
    /** Activación condicional (BR-N223) — código de pregunta + valor esperado. */
    condition: jsonb("condition"),
    sortOrder: integer("sort_order").notNull().default(0),
    helpText: text("help_text"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgQuestionnaireIdx: index("questionnaire_questions_org_q_idx").on(
      t.organizationId,
      t.questionnaireId,
    ),
    orgLayerIdx: index("questionnaire_questions_org_layer_idx").on(
      t.organizationId,
      t.layer,
    ),
    questionnaireFk: foreignKey({
      name: "questionnaire_questions_questionnaire_fk",
      columns: [t.organizationId, t.questionnaireId],
      foreignColumns: [questionnaires.organizationId, questionnaires.id],
    }),
  }),
);

export type QuestionnaireQuestion = typeof questionnaireQuestions.$inferSelect;
export type QuestionnaireQuestionNew = typeof questionnaireQuestions.$inferInsert;
