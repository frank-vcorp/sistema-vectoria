/**
 * `organization_fiscal_config` — 1:1 con `organizations` (SPEC §4.1, BR-N201).
 * PK compuesta `(organization_id, id)`. Como sólo existe una fila por
 * organización, `id` se mantiene estable para referencias externas y
 * `organization_id` es UNIQUE — la PK compuesta garantiza unicidad
 * mecánica y aislamiento multi-tenant (AC-43).
 *
 * Campos sensibles:
 *  - `pac_api_key_ciphertext` (bytea, AES-256-GCM)
 *  - `csd_password_ciphertext` (bytea, AES-256-GCM)
 * AAD canónico = `"{organization_id}|public.organization_fiscal_config|{column}"` (ADR-03 §9.1).
 */
import { customType, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * Tipo `bytea` para Drizzle. PostgreSQL bytea retorna Buffer.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const organizationFiscalConfig = pgTable(
  "organization_fiscal_config",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    rfc: text("rfc"),
    razonSocial: text("razon_social"),
    regimen: text("regimen"),
    pacApiKeyCiphertext: bytea("pac_api_key_ciphertext"),
    csdPasswordCiphertext: bytea("csd_password_ciphertext"),
    csdCerBucketKey: text("csd_cer_bucket_key"),
    csdPemBucketKey: text("csd_pem_bucket_key"),
    updatedBy: uuid("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
  }),
);

export type OrganizationFiscalConfig = typeof organizationFiscalConfig.$inferSelect;
export type OrganizationFiscalConfigNew = typeof organizationFiscalConfig.$inferInsert;
