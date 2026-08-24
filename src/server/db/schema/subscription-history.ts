/**
 * `subscription_history` — SPEC-011 §4.1 (B20a · BR-N404 / DEC-FUN-65).
 *
 * Historial de transiciones de la suscripción. Cada `pausar` /
 * `cancelar` / `reactivar` / `renovar` / `vencer` (job `markVencida`)
 * registra una fila aquí con `from_status`, `to_status`, `action`,
 * `reason`, `actor_user_id` y `actor_role_code` (BR-N336).
 *
 * La reactivación **conserva** el historial (DEC-FUN-65): NO se borra
 * al volver de `cancelada → activa`; el contrato tiene vida
 * administrativa larga con memoria.
 *
 * Decisiones:
 *  - PK compuesta `(organization_id, id)` (ADR-02 §8.3).
 *  - FK a `subscriptions` para integridad intra-módulo.
 *  - `actor_user_id` y `actor_role_code` son **snapshot** del actor
 *    al momento del cambio (no FK viva a `users` para no romper la
 *    memoria histórica ante rotación de personal).
 *  - `action` ∈ `SUBSCRIPTION_HISTORY_ACTIONS`.
 */
import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { foreignKey } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { subscriptions } from "./subscriptions";

export const subscriptionHistory = pgTable(
  "subscription_history",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    /** Suscripción a la que pertenece la entrada. */
    subscriptionId: uuid("subscription_id").notNull(),
    /** Estado anterior (null en `create`). */
    fromStatus: text("from_status"),
    /** Estado nuevo (null reservado para futuro). */
    toStatus: text("to_status").notNull(),
    /** `create | renovar | pausar | cancelar | reactivar | vencer`. */
    action: text("action").notNull(),
    /** Motivo declarado (BR-N404; ≥3 caracteres cuando aplica). */
    reason: text("reason"),
    /** Snapshot del `actor_user_id` (sin FK viva). */
    actorUserId: uuid("actor_user_id"),
    /** Snapshot del `actor_role_code` (BR-N336). */
    actorRoleCode: text("actor_role_code"),
    /** Snapshot de `actor_kind` ("user" o "system") para distinguir
     *  transiciones manuales de las automáticas del job `markVencida`. */
    actorKind: text("actor_kind").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgSubscriptionIdx: index("subscription_history_org_subscription_idx").on(
      t.organizationId,
      t.subscriptionId,
      t.createdAt,
    ),
    orgActionIdx: index("subscription_history_org_action_idx").on(
      t.organizationId,
      t.action,
    ),
    subscriptionFk: foreignKey({
      name: "subscription_history_subscription_fk",
      columns: [t.organizationId, t.subscriptionId],
      foreignColumns: [subscriptions.organizationId, subscriptions.id],
    }),
  }),
);

export type SubscriptionHistory = typeof subscriptionHistory.$inferSelect;
export type SubscriptionHistoryNew = typeof subscriptionHistory.$inferInsert;
