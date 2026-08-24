/**
 * `catalog_services` — SPEC-003 §4.1 (B5, BR-N226/227).
 *
 * Catálogo base de servicios ofrecidos. `service_type` distingue
 * el tipo de entregable y `billing_cycle` la cadencia de cobro
 * (BR-N238, consumido por SPEC-004).
 *
 * El catálogo seed vive en `scripts/seed-catalog.ts` (P-003-1) y
 * reemplaza el stub `db:seed:catalog` (ADR-04 §2.4). Director / Admin
 * pueden dar de alta / baja lógica (`active=false`) sin perder
 * trazabilidad histórica.
 */
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const catalogServices = pgTable(
  "catalog_services",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    /** Código humano único por organización (`S-NNN`). */
    code: text("code").notNull(),
    name: text("name").notNull(),
    /**
     * BR-N227:
     *  - `servicio_unico`    (entrega única, pago único)
     *  - `servicio_recurrente` (suscripción de servicio)
     *  - `producto_unico`    (licencia perpetua)
     *  - `producto_recurrente` (suscripción de producto)
     */
    serviceType: text("service_type").notNull(),
    /**
     * BR-N238:
     *  - `unico | mensual | anual | a_convenir`
     */
    billingCycle: text("billing_cycle").notNull().default("unico"),
    description: text("description"),
    /** Precio unitario por defecto en centavos MXN (nullable: a convenir). */
    defaultUnitPriceCents: integer("default_unit_price_cents"),
    active: boolean("active").notNull().default(true),
    isSeed: text("is_seed").notNull().default("false"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgCodeUnique: uniqueIndex("catalog_services_org_code_unique").on(
      t.organizationId,
      t.code,
    ),
    orgActiveIdx: index("catalog_services_org_active_idx").on(
      t.organizationId,
      t.active,
    ),
  }),
);

export type CatalogService = typeof catalogServices.$inferSelect;
export type CatalogServiceNew = typeof catalogServices.$inferInsert;
