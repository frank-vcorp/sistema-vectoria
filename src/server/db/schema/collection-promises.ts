/**
 * `collection_promises` — SPEC-008 §4.1 (BR-N313/323).
 * PK compuesta `(organization_id, id)`.
 *
 * Una promesa representa un compromiso de pago del cliente. Se crea
 * desde una `collection_activities` con `type='promesa'`. El campo
 * `count` se incrementa cuando una promesa es incumplida (BR-N323);
 * tras 2 incumplidas la factura escala (BR-N313).
 *
 * Estados lógicos (sin columna `status` — derivable):
 *  - pendiente: `promised_date >= hoy` y no `fulfilled_at`.
 *  - cumplida: `fulfilled_at` no nulo.
 *  - incumplida: `promised_date < hoy` y no `fulfilled_at`.
 *
 * El conteo de incumplidas (`count`) lo gestiona `cobranza.escalado`.
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
  uuid,
} from "drizzle-orm/pg-core";
import { collectionActivities } from "./collection-activities";
import { invoices } from "./invoices";
import { organizations } from "./organizations";
import { users } from "./users";

export const collectionPromises = pgTable(
  "collection_promises",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    invoiceId: uuid("invoice_id").notNull(),
    /** Actividad de cobranza que originó la promesa. */
    activityId: uuid("activity_id").notNull(),
    promisedAmountCents: bigint("promised_amount_cents", { mode: "number" })
      .notNull()
      .default(0),
    promisedDate: date("promised_date").notNull(),
    /**
     * Contador de incumplimientos (BR-N323). Se incrementa cuando
     * `promised_date < hoy` y la promesa sigue sin cumplir. ≥2
     * dispara escalado (BR-N313).
     */
    count: text("count").notNull().default("0"),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    fulfilledBy: uuid("fulfilled_by"),
    notes: text("notes"),
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
    orgInvoiceIdx: index("collection_promises_org_invoice_idx").on(
      t.organizationId,
      t.invoiceId,
    ),
    orgActivityIdx: index("collection_promises_org_activity_idx").on(
      t.organizationId,
      t.activityId,
    ),
    invoiceFk: foreignKey({
      name: "collection_promises_invoice_fk",
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
    }),
    activityFk: foreignKey({
      name: "collection_promises_activity_fk",
      columns: [t.organizationId, t.activityId],
      foreignColumns: [collectionActivities.organizationId, collectionActivities.id],
    }),
    fulfilledByFk: foreignKey({
      name: "collection_promises_fulfilled_by_fk",
      columns: [t.organizationId, t.fulfilledBy],
      foreignColumns: [users.organizationId, users.id],
    }),
    createdByFk: foreignKey({
      name: "collection_promises_created_by_fk",
      columns: [t.organizationId, t.createdBy],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type CollectionPromise = typeof collectionPromises.$inferSelect;
export type CollectionPromiseNew = typeof collectionPromises.$inferInsert;
