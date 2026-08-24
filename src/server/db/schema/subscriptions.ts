/**
 * `subscriptions` — SPEC-011 §4.1 (B20a · BR-N399..N406).
 *
 * La Suscripción es **entidad propia** del módulo Suscripciones:
 * nace al autorizar una OS con `tipo_cobro='suscripción'`
 * (BR-N405) y conserva el vínculo con `orders` (la OS), `clients`
 * y `quotes` (la cotización aceptada).
 *
 * Decisiones de diseño (SPEC-011 §4.1 + ADR-13):
 *  - PK compuesta `(organization_id, id)` (ADR-02 §8.3).
 *  - UNIQUE `(organization_id, order_id)` para garantizar 1:1 con
 *    la OS autorizada (BR-N405); `idempotency_key` alternativo vía
 *    índice (la unicidad por OS ya es el mecanismo canónico).
 *  - `current_period_start`/`current_period_end` y `next_renewal_date`
 *    se calculan con helper puro `computeNextPeriodEnd` a partir de
 *    `periodicity` (mensual/trimestral/semestral/anual, BR-N400).
 *  - `amount_cents` (bigint): monto por periodo, congelado en la
 *    creación y consumido por la factura borrador de renovación
 *    (SPEC-007 `createDraftFromSubscriptionRenewal`).
 *  - `status` enum canónico `SUBSCRIPTION_STATUSES` (BR-N403).
 *  - FK a `clients`, `quotes`, `orders` con la PK compuesta
 *    (ADR-02 §8.3 + defensa multi-tenant).
 *
 * Privacidad: el Vendedor NO recibe el permiso `gestionar_suscripciones`
 * (BR-N402 + DEC-FUN-63); la cartera la operan Director / Administrador.
 */
import {
  bigint,
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
import { clients } from "./clients";
import { orders } from "./orders";
import { organizations } from "./organizations";
import { quotes } from "./quotes";

export const subscriptions = pgTable(
  "subscriptions",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    /** BR-N399 · cliente de la suscripción (mismo cliente que la OS). */
    clientId: uuid("client_id").notNull(),
    /** BR-N399 · cotización aceptada origen (nullable para suscripciones
     *  manuales futuras; en el MVP siempre viene de la OS). */
    cotizacionId: uuid("cotizacion_id"),
    /** BR-N399/405 · OS autorizada. UNIQUE por organización: 1
     *  suscripción por OS autorizada. */
    orderId: uuid("order_id").notNull(),
    /** BR-N403 · `activa | pausada | cancelada | vencida`. */
    status: text("status").notNull().default("activa"),
    /** BR-N400 · periodicidad canónica. */
    periodicity: text("periodicity").notNull().default("mensual"),
    /** Inicio del periodo vigente (inclusive). */
    currentPeriodStart: date("current_period_start").notNull(),
    /** Fin del periodo vigente (inclusive). */
    currentPeriodEnd: date("current_period_end").notNull(),
    /** BR-N405 · monto por periodo en centavos MXN. */
    amountCents: bigint("amount_cents", { mode: "number" })
      .notNull()
      .default(0),
    /** Próxima fecha en que el job de renovación debe operar. */
    nextRenewalDate: date("next_renewal_date"),
    /** BR-N336 · autor de la creación (suele ser Director). */
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
    /** 1 suscripción por OS (BR-N405). */
    orgOrderUnique: uniqueIndex("subscriptions_org_order_unique").on(
      t.organizationId,
      t.orderId,
    ),
    orgStatusIdx: index("subscriptions_org_status_idx").on(
      t.organizationId,
      t.status,
    ),
    orgClientIdx: index("subscriptions_org_client_idx").on(
      t.organizationId,
      t.clientId,
    ),
    orgPeriodicityIdx: index("subscriptions_org_periodicity_idx").on(
      t.organizationId,
      t.periodicity,
    ),
    orgNextRenewalIdx: index("subscriptions_org_next_renewal_idx").on(
      t.organizationId,
      t.nextRenewalDate,
    ),
    clientFk: foreignKey({
      name: "subscriptions_client_fk",
      columns: [t.organizationId, t.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }),
    orderFk: foreignKey({
      name: "subscriptions_order_fk",
      columns: [t.organizationId, t.orderId],
      foreignColumns: [orders.organizationId, orders.id],
    }),
    quoteFk: foreignKey({
      name: "subscriptions_quote_fk",
      columns: [t.organizationId, t.cotizacionId],
      foreignColumns: [quotes.organizationId, quotes.id],
    }),
  }),
);

export type Subscription = typeof subscriptions.$inferSelect;
export type SubscriptionNew = typeof subscriptions.$inferInsert;
