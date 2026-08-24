/**
 * `commission_reversals` — SPEC-008 §4.1 (BR-N123).
 * PK compuesta `(organization_id, id)`.
 *
 * Reversa de una comisión al cancelar factura u OS. Cada reversa
 * decrementa `commissions.released_cents` en `released_cents_delta`
 * (negativo). Si la comisión queda con `released_cents = 0` y la
 * OS fue cancelada, transita a `cancelada` (DEC-FUN-35); si sólo
 * fue una factura, vuelve a `devengada` (sigue habiendo estimada
 * pero `liberada=0`).
 *
 * Esta tabla auditable es **inmutable**: append-only, con
 * `actor_role_code` y `reason` por construcción (BR-N336).
 */
import {
  bigint,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { commissions } from "./commissions";
import { invoices } from "./invoices";
import { organizations } from "./organizations";
import { users } from "./users";

export const commissionReversals = pgTable(
  "commission_reversals",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    commissionId: uuid("commission_id").notNull(),
    /** Si la reversa viene de cancelar una factura, FK opcional. */
    invoiceId: uuid("invoice_id"),
    /** BR-N123 · delta a restar de `released_cents`. */
    releasedCentsDelta: bigint("released_cents_delta", { mode: "number" })
      .notNull()
      .default(0),
    reason: text("reason").notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgCommissionIdx: index("commission_reversals_org_commission_idx").on(
      t.organizationId,
      t.commissionId,
    ),
    orgInvoiceIdx: index("commission_reversals_org_invoice_idx").on(
      t.organizationId,
      t.invoiceId,
    ),
    commissionFk: foreignKey({
      name: "commission_reversals_commission_fk",
      columns: [t.organizationId, t.commissionId],
      foreignColumns: [commissions.organizationId, commissions.id],
    }),
    invoiceFk: foreignKey({
      name: "commission_reversals_invoice_fk",
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
    }),
    createdByFk: foreignKey({
      name: "commission_reversals_created_by_fk",
      columns: [t.organizationId, t.createdBy],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type CommissionReversal = typeof commissionReversals.$inferSelect;
export type CommissionReversalNew = typeof commissionReversals.$inferInsert;
