/**
 * `questionnaires` — SPEC-003 §4.1 (B4 cuestionarios).
 *
 * Cuestionario de sondeo en 4 capas (DEC-FUN-44 / ARCH-20260817-08):
 * las preguntas viven en `questionnaire_questions` (dato editable,
 * BR-N222) y admiten 3 versiones (digital / imprimible / guía del
 * vendedor, DEC-FUN-18).
 *
 * `status` = `draft | published | archived` — sólo los `published`
 * admiten respuestas (`questionnaire_responses`).
 *
 * El cuestionario semilla (BR-N222, FRANK-confirmación P-003-1) se
 * siembra en `scripts/seed-catalog.ts` con 6 cuestionarios (4 web + 2
 * genéricos).
 */
import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const questionnaires = pgTable(
  "questionnaires",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    /** Código humano único por organización (`Q-NNN`). */
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** Tipo canónico (DEC-FUN-53, BR-N230). */
    type: text("type").notNull().default("general"),
    /** Versión: `digital | imprimible | guia_vendedor` (DEC-FUN-18). */
    version: text("version").notNull().default("digital"),
    /** `draft | published | archived`. */
    status: text("status").notNull().default("draft"),
    description: text("description"),
    isSeed: text("is_seed").notNull().default("false"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgCodeUnique: uniqueIndex("questionnaires_org_code_unique").on(
      t.organizationId,
      t.code,
    ),
    orgStatusIdx: index("questionnaires_org_status_idx").on(
      t.organizationId,
      t.status,
    ),
  }),
);

export type Questionnaire = typeof questionnaires.$inferSelect;
export type QuestionnaireNew = typeof questionnaires.$inferInsert;
