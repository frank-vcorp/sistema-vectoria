/**
 * `quote_acceptance` — SPEC-003 §4.1 (BR-N237, H-08, DEC-FUN-55).
 *
 * Evidencia de aceptación de cotización. 4 campos canónicos:
 *   - `accepter_name`: identidad del aceptante (BR-N237).
 *   - `accepter_org`: organización / cargo del aceptante.
 *   - `accepted_at`: fecha del acto de aceptación.
 *   - `medium`: medio por el que se aceptó (`email | telefono | presencial | otro`,
 *     BR-N237).
 *   - `evidence_file_id`: archivo adjunto a `files` (PDF firmado, foto
 *     del correo, etc.) — enlace firmado ≤15 min (SPEC-001 AC-13).
 *
 * El Vendedor registra en nombre del cliente (proxy, DEC-FUN-55 / H-08);
 * `proxy=true` indica que el registro es indirecto.
 */
import {
  boolean,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { files } from "./files";
import { organizations } from "./organizations";
import { quotes } from "./quotes";
import { users } from "./users";

export const quoteAcceptances = pgTable(
  "quote_acceptance",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    quoteId: uuid("quote_id").notNull(),
    accepterName: text("accepter_name").notNull(),
    accepterOrg: text("accepter_org"),
    /** `email | telefono | presencial | otro` (BR-N237). */
    medium: text("medium").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    evidenceFileId: uuid("evidence_file_id").notNull(),
    /** DEC-FUN-55 / H-08: el Vendedor registra en nombre del cliente. */
    proxy: boolean("proxy").notNull().default(true),
    registeredBy: uuid("registered_by").notNull(),
    notes: text("notes"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    quoteFk: foreignKey({
      name: "quote_acceptance_quote_fk",
      columns: [t.organizationId, t.quoteId],
      foreignColumns: [quotes.organizationId, quotes.id],
    }),
    evidenceFk: foreignKey({
      name: "quote_acceptance_evidence_fk",
      columns: [t.organizationId, t.evidenceFileId],
      foreignColumns: [files.organizationId, files.id],
    }),
    registeredByFk: foreignKey({
      name: "quote_acceptance_registered_by_fk",
      columns: [t.organizationId, t.registeredBy],
      foreignColumns: [users.organizationId, users.id],
    }),
    quoteIdx: index("quote_acceptance_quote_idx").on(
      t.organizationId,
      t.quoteId,
    ),
  }),
);

export type QuoteAcceptance = typeof quoteAcceptances.$inferSelect;
export type QuoteAcceptanceNew = typeof quoteAcceptances.$inferInsert;
