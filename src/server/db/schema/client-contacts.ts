/**
 * `client_contacts` — SPEC-002 §4.1. PK compuesta `(organization_id, id)`.
 *
 * BR-N217: varios contactos por cliente, **sólo uno** `is_main=true`.
 * El servicio garantiza el invariante transaccionalmente: al marcar
 * un contacto como principal se desmarcan los demás del mismo cliente
 * dentro de la misma transacción. La unicidad del principal se refuerza
 * con índice parcial (`unique_main_per_client`) para defensa secundaria
 * a nivel BD.
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
import { sql } from "drizzle-orm";
import { clients } from "./clients";
import { organizations } from "./organizations";

export const clientContacts = pgTable(
  "client_contacts",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    clientId: uuid("client_id").notNull(),
    name: text("name").notNull(),
    role: text("role"),
    email: text("email"),
    phone: text("phone"),
    isMain: boolean("is_main").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    clientFk: foreignKey({
      name: "client_contacts_client_fk",
      columns: [t.organizationId, t.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }),
    clientIdx: index("client_contacts_client_idx").on(t.organizationId, t.clientId),
    /**
     * Defensa secundaria a nivel BD (BR-N217): un solo `is_main=true`
     * por cliente. Postgres soporta `CREATE UNIQUE INDEX ... WHERE`
     * (índice parcial). El servicio aplica el invariante
     * transaccionalmente; este índice es defensa secundaria.
     */
    mainUnique: uniqueIndex("client_contacts_main_unique")
      .on(t.organizationId, t.clientId)
      .where(sql`${t.isMain} = true`),
  }),
);

export type ClientContact = typeof clientContacts.$inferSelect;
export type ClientContactNew = typeof clientContacts.$inferInsert;