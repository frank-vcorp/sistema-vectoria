/**
 * `organizations` — raíz del tenant. PK simple `id` (ADR-02 §8.3: excepción
 * documentada; las demás tablas de negocio llevan PK compuesta).
 */
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("MXN"),
  locale: text("locale").notNull().default("es-MX"),
  timezone: text("timezone").notNull().default("America/Mexico_City"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

export type Organization = typeof organizations.$inferSelect;
export type OrganizationNew = typeof organizations.$inferInsert;
