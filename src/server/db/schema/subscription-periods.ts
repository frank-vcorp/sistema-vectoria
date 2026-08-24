/**
 * `subscription_periods` — SPEC-011 §4.1 (B20a · BR-N406).
 *
 * Un periodo por ciclo. `renovar` abre un periodo nuevo y crea la
 * factura borrador (`invoices` con `subscription_id` y `status='borrador'`,
 * propiedad de Facturación SPEC-007). La idempotencia de renovación
 * se garantiza por UNIQUE `(organization_id, subscription_id, period_start)`
 * (AC-9 SPEC-011 / BR-N406).
 *
 * Decisiones:
 *  - PK compuesta `(organization_id, id)` (ADR-02 §8.3).
 *  - FK formal a `subscriptions` para integridad intra-módulo.
 *  - FK a `invoices` se declara **sin** `foreignKey` formal para no
 *    introducir acoplamiento circular con SPEC-007; la referencia es
 *    lógica (nullable) y filtrada por `organization_id` en lectura.
 *    Esto preserva el principio de frontera de módulo del ADR-13.
 *  - `status` enum `SUBSCRIPTION_PERIOD_STATUSES` (modela el ciclo
 *    de vida del periodo individual, no del contrato).
 */
import {
  date,
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
import { subscriptions } from "./subscriptions";

export const subscriptionPeriods = pgTable(
  "subscription_periods",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    /** Suscripción a la que pertenece el periodo. */
    subscriptionId: uuid("subscription_id").notNull(),
    /** Inicio del periodo (inclusive). */
    periodStart: date("period_start").notNull(),
    /** Fin del periodo (inclusive). */
    periodEnd: date("period_end").notNull(),
    /** `activo | facturado | pagado | vencido`. */
    status: text("status").notNull().default("activo"),
    /**
     * Referencia **lógica** (sin FK) a `invoices.id` cuando el periodo
     * ya tiene factura borrador. La unicidad por periodo
     * (`UNIQUE (org, subscription_id, period_start)`) es la defensa
     * anti-duplicado (AC-9); no hace falta FK dura al otro módulo.
     */
    invoiceId: uuid("invoice_id"),
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
    /** Idempotencia de renovación por periodo (AC-9 SPEC-011). */
    orgSubPeriodUnique: uniqueIndex(
      "subscription_periods_org_sub_period_unique",
    ).on(t.organizationId, t.subscriptionId, t.periodStart),
    orgStatusIdx: index("subscription_periods_org_status_idx").on(
      t.organizationId,
      t.status,
    ),
    orgSubscriptionIdx: index("subscription_periods_org_subscription_idx").on(
      t.organizationId,
      t.subscriptionId,
    ),
    /** FK intra-módulo a la suscripción padre. */
    subscriptionFk: foreignKey({
      name: "subscription_periods_subscription_fk",
      columns: [t.organizationId, t.subscriptionId],
      foreignColumns: [subscriptions.organizationId, subscriptions.id],
    }),
  }),
);

export type SubscriptionPeriod = typeof subscriptionPeriods.$inferSelect;
export type SubscriptionPeriodNew = typeof subscriptionPeriods.$inferInsert;
