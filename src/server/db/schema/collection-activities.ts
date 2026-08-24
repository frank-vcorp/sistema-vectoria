/**
 * `collection_activities` — SPEC-008 §4.1 (BR-N322/323).
 * PK compuesta `(organization_id, id)`.
 *
 * Una actividad es una acción de cobranza: llamada, email, promesa u
 * otro. Si `type='promesa'`, las columnas `promised_amount_cents` y
 * `promised_date` son obligatorias. La promesa como dato vive en
 * `collection_promises` (BR-N323) — esta tabla es el registro de la
 * actividad sin importar el resultado.
 *
 * Vinculada opcionalmente a una factura (`invoice_id`) y al cliente
 * (`client_id`). Una actividad sin factura es operativa (ej. una
 * llamada general al cliente).
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
import { clients } from "./clients";
import { invoices } from "./invoices";
import { organizations } from "./organizations";
import { users } from "./users";

export const collectionActivities = pgTable(
  "collection_activities",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    clientId: uuid("client_id").notNull(),
    invoiceId: uuid("invoice_id"),
    type: text("type").notNull().default("otro"),
    notes: text("notes"),
    /** Sólo para type='promesa'. */
    promisedAmountCents: bigint("promised_amount_cents", { mode: "number" }),
    /** Sólo para type='promesa'. */
    promisedDate: date("promised_date"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgClientIdx: index("collection_activities_org_client_idx").on(
      t.organizationId,
      t.clientId,
    ),
    orgInvoiceIdx: index("collection_activities_org_invoice_idx").on(
      t.organizationId,
      t.invoiceId,
    ),
    orgTypeIdx: index("collection_activities_org_type_idx").on(
      t.organizationId,
      t.type,
    ),
    clientFk: foreignKey({
      name: "collection_activities_client_fk",
      columns: [t.organizationId, t.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }),
    invoiceFk: foreignKey({
      name: "collection_activities_invoice_fk",
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
    }),
    createdByFk: foreignKey({
      name: "collection_activities_created_by_fk",
      columns: [t.organizationId, t.createdBy],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type CollectionActivity = typeof collectionActivities.$inferSelect;
export type CollectionActivityNew = typeof collectionActivities.$inferInsert;
