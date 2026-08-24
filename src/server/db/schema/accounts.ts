/**
 * `accounts` — SPEC-009 §4.1 (B21, BR-N366).
 * PK compuesta `(organization_id, id)`.
 *
 * Una cuenta es un bucket contable (banco, caja, CxC, CxP, capital,
 * ingreso, gasto). El catálogo es **configurable por Frank** —
 * P-009-1 cerrado en `none`: este turno NO siembra cuentas seed
 * (documentado en IMPL-REPORT-009). El servicio expone CRUD y deja
 * al Director crearlas según necesidad.
 *
 * `opening_balance_cents` es el saldo inicial en centavos; el saldo
 * vivo es `opening + Σ(confirmados tipo ingreso) − Σ(confirmados
 * tipo gasto)` (BR-N366). Las transferencias son patas tipo
 * `transferencia` (no se cuentan como ingreso/gasto operativo).
 *
 * `active` permite archivar (no eliminar) sin romper FKs.
 */
import {
  bigint,
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const accounts = pgTable(
  "accounts",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    name: text("name").notNull(),
    /**
     * BR-N366 · `activo | pasivo | capital | ingreso | gasto`.
     * El reporte separa estas dimensiones para no mezclar ingreso
     * operativo con capital/transferencias.
     */
    type: text("type").notNull().default("activo"),
    currency: text("currency").notNull().default("MXN"),
    /** BR-N366 · saldo inicial (centavos MXN). */
    openingBalanceCents: bigint("opening_balance_cents", { mode: "number" })
      .notNull()
      .default(0),
    active: boolean("active").notNull().default(true),
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
    orgTypeIdx: index("accounts_org_type_idx").on(t.organizationId, t.type),
    orgActiveIdx: index("accounts_org_active_idx").on(
      t.organizationId,
      t.active,
    ),
  }),
);

export type Account = typeof accounts.$inferSelect;
export type AccountNew = typeof accounts.$inferInsert;
