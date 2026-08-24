/**
 * `quote_items` — SPEC-003 §4.1 (B7, BR-N234/357..N360).
 *
 * Líneas polimórficas de la cotización (DEC-FUN-48):
 *   `service | license | expense | discount`.
 *
 * Cálculo (BR-N357): `total_cents = qty * unit_price_cents - discount_cents`.
 * El total general se deriva: `subtotal = Σ items.total_cents`,
 * `discount_cents = Σ items.kind='discount'.discount_cents`,
 * `tax_cents = (subtotal - discount_cents) * 0.16`, `total = subtotal - discount + tax`
 * (BR-N357..N360).
 */
import {
  bigint,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { catalogServices } from "./catalog-services";
import { organizations } from "./organizations";
import { quotes } from "./quotes";

export const quoteItems = pgTable(
  "quote_items",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    quoteId: uuid("quote_id").notNull(),
    /**
     * BR-N234: `service | license | expense | discount`.
     * `discount` es ítem negativo (sólo se modela como línea de descuento
     * explícita cuando se documenta; los descuentos de ítems positivos
     * viven en `discount_cents`).
     */
    kind: text("kind").notNull().default("service"),
    catalogServiceId: uuid("catalog_service_id"),
    description: text("description").notNull(),
    qty: integer("qty").notNull().default(1),
    unitPriceCents: bigint("unit_price_cents", { mode: "number" })
      .notNull()
      .default(0),
    discountCents: bigint("discount_cents", { mode: "number" })
      .notNull()
      .default(0),
    totalCents: bigint("total_cents", { mode: "number" })
      .notNull()
      .default(0),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgQuoteIdx: index("quote_items_org_quote_idx").on(
      t.organizationId,
      t.quoteId,
    ),
    quoteFk: foreignKey({
      name: "quote_items_quote_fk",
      columns: [t.organizationId, t.quoteId],
      foreignColumns: [quotes.organizationId, quotes.id],
    }),
    catalogServiceFk: foreignKey({
      name: "quote_items_catalog_service_fk",
      columns: [t.organizationId, t.catalogServiceId],
      foreignColumns: [catalogServices.organizationId, catalogServices.id],
    }),
  }),
);

export type QuoteItem = typeof quoteItems.$inferSelect;
export type QuoteItemNew = typeof quoteItems.$inferInsert;
