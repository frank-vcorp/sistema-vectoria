/**
 * `client_fiscal_data` — SPEC-002 §4.1. PK compuesta `(organization_id, id)`.
 *
 * BR-N218: datos fiscales **opcionales** por cliente; cuando se proveen,
 * el RFC debe ser único por organización (constraint `UNIQUE` vía
 * índice parcial sobre `rfc IS NOT NULL`). NO son secretos CSD
 * (ADR-03 distingue `csd_password` y `pac_api_key` de la organización);
 * sólo datos de captura para futura facturación (SPEC-007).
 *
 * Visibilidad: lectura por `gestionar_clientes` (Director/Admin/Vendedor
 * con permiso); los roles sin permiso no ven este registro.
 */
import {
  foreignKey,
  index,
  jsonb,
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
import { users } from "./users";

export const clientFiscalData = pgTable(
  "client_fiscal_data",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    /** UNIQUE (uno a uno) por cliente: una sola fila por cliente (BR-N218). */
    clientId: uuid("client_id").notNull(),
    rfc: text("rfc"),
    razonSocial: text("razon_social"),
    regimen: text("regimen"),
    domicilio: jsonb("domicilio_jsonb"),
    cfdiUse: text("cfdi_use"),
    updatedBy: uuid("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    /** Un cliente tiene a lo sumo una fila de datos fiscales (BR-N218). */
    clientUnique: uniqueIndex("client_fiscal_data_client_unique").on(
      t.organizationId,
      t.clientId,
    ),
    /**
     * RFC único por organización cuando se provee (BR-N218). Defensa
     * secundaria: el servicio también lo valida y emite
     * `RFC_DUPLICATE` antes del INSERT para mantener contrato HTTP
     * determinista.
     */
    rfcUnique: uniqueIndex("client_fiscal_data_rfc_unique")
      .on(t.organizationId, t.rfc)
      .where(sql`${t.rfc} IS NOT NULL`),
    clientFk: foreignKey({
      name: "client_fiscal_data_client_fk",
      columns: [t.organizationId, t.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }),
    orgIdx: index("client_fiscal_data_org_idx").on(t.organizationId),
    updatedByFk: foreignKey({
      name: "client_fiscal_data_updated_by_fk",
      columns: [t.organizationId, t.updatedBy],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type ClientFiscalData = typeof clientFiscalData.$inferSelect;
export type ClientFiscalDataNew = typeof clientFiscalData.$inferInsert;