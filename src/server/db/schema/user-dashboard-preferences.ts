/**
 * `user_dashboard_preferences` — SPEC-010 §4.1 (B23, DEC-FUN-28/30).
 * PK compuesta `(organization_id, id)`.
 *
 * Preferencias por usuario:
 *  - `widgets` jsonb: lista ordenada de `DashboardWidgetCode`
 *    visibles para el usuario (drag&drop persistente; BR-N342).
 *  - `layout` jsonb: coordenadas / tamaño de cada widget en el
 *    dashboard (drag&drop; DEC-FUN-28).
 *  - `default_view` enum `week | today` (DEC-FUN-30 / BR-N343).
 *  - `last_seen_at`: opcional, auditable.
 *
 * El usuario tiene exactamente una fila por organización. El servicio
 * `upsertFromDefaults` la crea al primer `dashboard.get` si no
 * existe. P-010-1 cerrado en `none`: no se siembran defaults masivos.
 *
 * PRIVACIDAD:
 *  - La fila es **del usuario**; nadie más la lee ni la edita
 *    (DEC-FUN-28). El servicio filtra por `user_id=actor.id`.
 *  - Las acciones sobre estas preferencias (`dashboard.save_layout`)
 *    se auditan en `audit_logs` con `actor_role_code` (BR-N336).
 */
import {
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
import { users } from "./users";

export const userDashboardPreferences = pgTable(
  "user_dashboard_preferences",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    /** El usuario dueño de la fila (1:1 con `users.id`). */
    userId: uuid("user_id").notNull(),
    /**
     * Lista ordenada de widgets visibles. Lista de strings
     * (`DashboardWidgetCode[]`).
     */
    widgets: jsonb("widgets").notNull().default([]),
    /**
     * Coordenadas / tamaño de cada widget (`{ widget: code, x, y, w, h }[]`).
     * El servicio normaliza; la UI lo lee tal cual.
     */
    layout: jsonb("layout").notNull().default([]),
    /** `week` (default) o `today` (DEC-FUN-30). */
    defaultView: text("default_view").notNull().default("week"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
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
    userIdx: index("user_dashboard_prefs_org_user_idx").on(
      t.organizationId,
      t.userId,
    ),
    userFk: foreignKey({
      name: "user_dashboard_prefs_user_fk",
      columns: [t.organizationId, t.userId],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type UserDashboardPreferences = typeof userDashboardPreferences.$inferSelect;
export type UserDashboardPreferencesNew = typeof userDashboardPreferences.$inferInsert;
