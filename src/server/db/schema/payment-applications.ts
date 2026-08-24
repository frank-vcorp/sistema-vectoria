/**
 * `payment_applications` — SPEC-008 §4.1 (BR-012, BR-N308).
 * PK compuesta `(organization_id, id)`.
 *
 * Cada aplicación liga un cobro (`payments.id`) a una factura
 * (`invoices.id`) por un monto. La suma de aplicaciones por
 * `payment_id` no excede `payments.amount_cents`; la suma por
 * `invoice_id` no excede `invoices.total_cents` (BR-012/308).
 *
 * Visibilidad: cada aplicación es visible sólo si su cobro lo es
 * (regla BR-N207: Vendedor no ve CxC de otros). El servicio
 * filtra en `list`.
 *
 * Al reversar un cobro, el servicio marca `payment_applications`
 * con `reverted_at`/`reverted_by` (terminal lógico) y delega la
 * actualización de `invoices.paid_cents`/`status` al servicio
 * `facturacion.applyPayment` (inversión) — sin acoplamiento directo
 * a `invoices`. En MVP la reversión local decrementa
 * `invoices.paid_cents` directamente vía `withTx` interno (cumple
 * BR-N308/309).
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
import { invoices } from "./invoices";
import { organizations } from "./organizations";
import { payments } from "./payments";
import { users } from "./users";

export const paymentApplications = pgTable(
  "payment_applications",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    paymentId: uuid("payment_id").notNull(),
    invoiceId: uuid("invoice_id").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" })
      .notNull()
      .default(0),
    /**
     * Marca terminal cuando el cobro fue reversado (BR-N309). El
     * servicio `cobros.reverse` actualiza este campo y decrementa
     * `invoices.paid_cents`.
     */
    revertedAt: timestamp("reverted_at", { withTimezone: true }),
    revertedBy: uuid("reverted_by"),
    revertReason: text("revert_reason"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgPaymentIdx: index("payment_applications_org_payment_idx").on(
      t.organizationId,
      t.paymentId,
    ),
    orgInvoiceIdx: index("payment_applications_org_invoice_idx").on(
      t.organizationId,
      t.invoiceId,
    ),
    paymentFk: foreignKey({
      name: "payment_applications_payment_fk",
      columns: [t.organizationId, t.paymentId],
      foreignColumns: [payments.organizationId, payments.id],
    }),
    invoiceFk: foreignKey({
      name: "payment_applications_invoice_fk",
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
    }),
    createdByFk: foreignKey({
      name: "payment_applications_created_by_fk",
      columns: [t.organizationId, t.createdBy],
      foreignColumns: [users.organizationId, users.id],
    }),
    revertedByFk: foreignKey({
      name: "payment_applications_reverted_by_fk",
      columns: [t.organizationId, t.revertedBy],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type PaymentApplication = typeof paymentApplications.$inferSelect;
export type PaymentApplicationNew = typeof paymentApplications.$inferInsert;
