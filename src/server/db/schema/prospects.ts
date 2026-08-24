/**
 * `prospects` — SPEC-002 §4.1. PK compuesta `(organization_id, id)` (ADR-02 §8.3).
 *
 * Representa una oportunidad de negocio. El cliente (`clients`) nace sólo
 * desde un prospecto `calificado` (BR-N168) y este prospecto a su vez
 * exige cuestionario vinculado para llegar a `calificado` (BR-N148).
 *
 * Estados: `PROSPECT_STATUSES` (enums en `shared/enums`).
 * Visibilidad por rol (ACTORES §3, BR-N207): Vendedor ve los propios
 * (`assigned_to = self`); Director / Admin ven todos vía `ver_todo`
 * (short-circuit de `hasPermission`). El servicio aplica el filtro;
 * esta tabla sólo guarda el dato.
 */
import {
  boolean,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const prospects = pgTable(
  "prospects",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    /** BR-N216: código único por organización (lo genera la operación). */
    code: text("code").notNull(),
    /** Estados de oportunidad del prospecto (enums en código). */
    status: text("status").notNull().default("nuevo"),
    name: text("name").notNull(),
    company: text("company"),
    email: text("email"),
    phone: text("phone"),
    source: text("source"),
    /** DEC-20260823-01: `llamada | email | whatsapp` (orden canónico). */
    medium: text("medium"),
    /** FK compuesta a `users(organization_id, id)`. */
    assignedTo: uuid("assigned_to"),
    /** BR-N213: motivo obligatorio al pasar a `perdido`. */
    lostReason: text("lost_reason"),
    /** BR-N214: motivo obligatorio al pasar a `suspendido` (reactivable). */
    suspendedReason: text("suspended_reason"),
    /** BR-N148: cuestionario vinculado (SPEC-003 lo emite). */
    questionnaireId: uuid("questionnaire_id"),
    questionnaireCompletedAt: timestamp("questionnaire_completed_at", { withTimezone: true }),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
    /** Soft-archive del propio prospecto (no eliminación). */
    archived: boolean("archived").notNull().default(false),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgCodeUnique: uniqueIndex("prospects_org_code_unique").on(t.organizationId, t.code),
    orgIdx: index("prospects_org_idx").on(t.organizationId),
    statusIdx: index("prospects_org_status_idx").on(t.organizationId, t.status),
    assignedIdx: index("prospects_org_assigned_idx").on(t.organizationId, t.assignedTo),
    assignedFk: foreignKey({
      name: "prospects_assigned_fk",
      columns: [t.organizationId, t.assignedTo],
      foreignColumns: [users.organizationId, users.id],
    }),
    createdByFk: foreignKey({
      name: "prospects_created_by_fk",
      columns: [t.organizationId, t.createdBy],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type Prospect = typeof prospects.$inferSelect;
export type ProspectNew = typeof prospects.$inferInsert;