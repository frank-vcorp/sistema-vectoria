/**
 * `transactions` — SPEC-009 §4.1 (B21, BR-N330/331/013/N329/N332).
 * PK compuesta `(organization_id, id)`.
 *
 * Movimiento financiero: ingreso/gasto/transferencia/capital. Estados
 * canónicos:
 *   borrador → confirmado → conciliado (inmutable, BR-013)
 *   laterales: cancelado, reversado (con motivo, BR-N329/014).
 *
 * Clasificación **no operativa** (BR-N326/327/328):
 *  - `type='transferencia'` siempre es no operativa; los reportes la
 *    excluyen de ingreso/costo operativo (DEC-FUN-27).
 *  - `type='capital'` cubre préstamos/aportaciones/retiros; tampoco
 *    operativos (BR-N327/328).
 *  - `sub_kind` permite anotaciones (`transferencia_interna`,
 *    `prestamo_socio`, `retiro_socio`, `pago_proveedor`,
 *    `cobro_cliente`).
 *
 * Vínculos opcionales:
 *  - `linked_payment_id` lo enlaza SPEC-008 al confirmar un cobro
 *    (BR-N316). En este turno queda nullable; SPEC-008 lo cablea.
 *  - `linked_commission_id` referencia `commissions.id` cuando el
 *    gasto es una comisión pagada (BR-N362).
 *  - `linked_order_id` para rentabilidad por OS.
 *  - `project_id` cuando el gasto se imputa al proyecto (BR-N333).
 *  - `transfer_id` cuando es la pata de una transferencia (BR-N326).
 *
 * Reglas:
 *  - `conciliado` no se edita ni elimina (BR-013). Correcciones por
 *    `reverso` con motivo.
 *  - Las transferencias SIEMPRE tienen `transfer_id` (defensa BD
 *    vía NOT NULL cuando `type='transferencia'`).
 *  - Costos directos al proyecto sólo con `status IN ('confirmado',
 *    'conciliado')` (BR-N333).
 *
 * Audit (`movimiento.*`) con `actor_role_code` (BR-N336).
 */
import {
  bigint,
  date,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { commissions } from "./commissions";
import { orders } from "./orders";
import { organizations } from "./organizations";
import { payments } from "./payments";
import { projects } from "./projects";
import { users } from "./users";

export const transactions = pgTable(
  "transactions",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    accountId: uuid("account_id").notNull(),
    /** BR-N331 · `ingreso | gasto | transferencia | capital`. */
    type: text("type").notNull(),
    /** BR-N331 · monto firmado (`+` ingreso/`capital`, `-` gasto). */
    amountCents: bigint("amount_cents", { mode: "number" })
      .notNull()
      .default(0),
    /** BR-N331 · `borrador | confirmado | conciliado | cancelado | reversado`. */
    status: text("status").notNull().default("borrador"),
    /**
     * BR-N326/327/328 · marca explícita no operativa.
     *  - `transferencia_interna`: transferencia entrada/salida.
     *  - `prestamo_socio`: préstamo o aportación de socio.
     *  - `retiro_socio`: retiro de socio.
     *  - `pago_proveedor`: CxP básica (BR-N332).
     *  - `cobro_cliente`: movimiento de ingreso desde SPEC-008.
     * `null` para movimientos operativos puros (ingreso/gasto).
     */
    subKind: text("sub_kind"),
    /** BR-N330 · fecha de la operación. */
    operationDate: date("operation_date").notNull(),
    dueDate: date("due_date"),
    paidDate: date("paid_date"),
    /** BR-N316 · vínculo al cobro (SPEC-008). */
    linkedPaymentId: uuid("linked_payment_id"),
    /** BR-N362 · vínculo a comisión pagada. */
    linkedCommissionId: uuid("linked_commission_id"),
    /** Vinculación a OS para CxC/CxP (BR-N332). */
    linkedOrderId: uuid("linked_order_id"),
    /** BR-N333 · imputación del gasto al proyecto (costo directo). */
    projectId: uuid("project_id"),
    /** BR-N326 · FK a `transfers` cuando es pata de transferencia. */
    transferId: uuid("transfer_id"),
    /** BR-N330 · motivo/descripción. */
    reason: text("reason"),
    /** BR-N013 · momento de conciliación (terminal). */
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    reconciledBy: uuid("reconciled_by"),
    /** BR-N329 · motivo de reverso (≥3 chars si reversado). */
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedBy: uuid("reversed_by"),
    reversedReason: text("reversed_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
    createdBy: uuid("created_by"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedBy: uuid("confirmed_by"),
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
    orgAccountIdx: index("transactions_org_account_idx").on(
      t.organizationId,
      t.accountId,
    ),
    orgStatusIdx: index("transactions_org_status_idx").on(
      t.organizationId,
      t.status,
    ),
    orgTypeIdx: index("transactions_org_type_idx").on(
      t.organizationId,
      t.type,
    ),
    orgProjectIdx: index("transactions_org_project_idx").on(
      t.organizationId,
      t.projectId,
    ),
    orgOrderIdx: index("transactions_org_order_idx").on(
      t.organizationId,
      t.linkedOrderId,
    ),
    orgDateIdx: index("transactions_org_date_idx").on(
      t.organizationId,
      t.operationDate,
    ),
    accountFk: foreignKey({
      name: "transactions_account_fk",
      columns: [t.organizationId, t.accountId],
      foreignColumns: [accounts.organizationId, accounts.id],
    }),
    projectFk: foreignKey({
      name: "transactions_project_fk",
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
    }),
    orderFk: foreignKey({
      name: "transactions_order_fk",
      columns: [t.organizationId, t.linkedOrderId],
      foreignColumns: [orders.organizationId, orders.id],
    }),
    paymentFk: foreignKey({
      name: "transactions_payment_fk",
      columns: [t.organizationId, t.linkedPaymentId],
      foreignColumns: [payments.organizationId, payments.id],
    }),
    commissionFk: foreignKey({
      name: "transactions_commission_fk",
      columns: [t.organizationId, t.linkedCommissionId],
      foreignColumns: [commissions.organizationId, commissions.id],
    }),
    createdByFk: foreignKey({
      name: "transactions_created_by_fk",
      columns: [t.organizationId, t.createdBy],
      foreignColumns: [users.organizationId, users.id],
    }),
    confirmedByFk: foreignKey({
      name: "transactions_confirmed_by_fk",
      columns: [t.organizationId, t.confirmedBy],
      foreignColumns: [users.organizationId, users.id],
    }),
    reconciledByFk: foreignKey({
      name: "transactions_reconciled_by_fk",
      columns: [t.organizationId, t.reconciledBy],
      foreignColumns: [users.organizationId, users.id],
    }),
    reversedByFk: foreignKey({
      name: "transactions_reversed_by_fk",
      columns: [t.organizationId, t.reversedBy],
      foreignColumns: [users.organizationId, users.id],
    }),
    cancelledByFk: foreignKey({
      name: "transactions_cancelled_by_fk",
      columns: [t.organizationId, t.cancelledBy],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type Transaction = typeof transactions.$inferSelect;
export type TransactionNew = typeof transactions.$inferInsert;
