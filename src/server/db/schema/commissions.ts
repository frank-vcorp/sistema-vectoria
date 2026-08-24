/**
 * `commissions` — SPEC-008 §4.1 (B17/B20, BR-N297-300, BR-N361-365).
 * PK compuesta `(organization_id, id)`.
 *
 * 1 comisión por OS (BR-N298). Se garantiza vía UNIQUE
 * `(organization_id, order_id)`. `rate_pct` es la tasa única de la
 * OS (DEC-FUN-42 / BR-N241). El cálculo de `liberada_cents` está
 * determinado por `computeReleased()` (BR-N362):
 *
 *   liberada = round(estimada × facturado_no_cancelado / total_OS)
 *   tope    = estimada
 *
 * Línea principal de estados (BR-N300):
 *   estimada → devengada → liberada → pagada (terminal)
 * Lateral: `cancelada` (reembolso DEC-FUN-35).
 *
 * Privacidad: Vendedor no ve comisiones ajenas (BR-N207) — el
 * servicio filtra por `vendedor_user_id`.
 *
 * Auditoría: `comision.estimate` / `comision.release` / `comision.pay`
 * / `comision.reverse` con `actor_role_code` (BR-N336).
 */
import {
  bigint,
  foreignKey,
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { orders } from "./orders";
import { organizations } from "./organizations";
import { users } from "./users";

export const commissions = pgTable(
  "commissions",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    orderId: uuid("order_id").notNull(),
    vendedorUserId: uuid("vendedor_user_id").notNull(),
    /** DEC-FUN-42 · 1 sola tasa por OS (BR-N241/298). Porcentaje (0-100). */
    ratePct: numeric("rate_pct", { precision: 6, scale: 3 })
      .notNull()
      .default("0"),
    /** BR-N361 · total_OS × rate / 100, persistido en centavos. */
    estimatedCents: bigint("estimated_cents", { mode: "number" })
      .notNull()
      .default(0),
    /** BR-N362 · topeada a `estimatedCents`; recalculada por release/reverse. */
    releasedCents: bigint("released_cents", { mode: "number" })
      .notNull()
      .default(0),
    status: text("status").notNull().default("estimada"),
    /** Snapshot del total de la OS al momento de timbrar (para recálculo). */
    soldTotalCentsSnapshot: bigint("sold_total_cents_snapshot", {
      mode: "number",
    }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidBy: uuid("paid_by"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
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
    /** BR-N298 · 1 comisión por OS (UNIQUE por org+order). */
    orgOrderUnique: uniqueIndex("commissions_org_order_unique").on(
      t.organizationId,
      t.orderId,
    ),
    orgVendedorIdx: index("commissions_org_vendedor_idx").on(
      t.organizationId,
      t.vendedorUserId,
    ),
    orgStatusIdx: index("commissions_org_status_idx").on(
      t.organizationId,
      t.status,
    ),
    orderFk: foreignKey({
      name: "commissions_order_fk",
      columns: [t.organizationId, t.orderId],
      foreignColumns: [orders.organizationId, orders.id],
    }),
    vendedorFk: foreignKey({
      name: "commissions_vendedor_fk",
      columns: [t.organizationId, t.vendedorUserId],
      foreignColumns: [users.organizationId, users.id],
    }),
    paidByFk: foreignKey({
      name: "commissions_paid_by_fk",
      columns: [t.organizationId, t.paidBy],
      foreignColumns: [users.organizationId, users.id],
    }),
    cancelledByFk: foreignKey({
      name: "commissions_cancelled_by_fk",
      columns: [t.organizationId, t.cancelledBy],
      foreignColumns: [users.organizationId, users.id],
    }),
    createdByFk: foreignKey({
      name: "commissions_created_by_fk",
      columns: [t.organizationId, t.createdBy],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type Commission = typeof commissions.$inferSelect;
export type CommissionNew = typeof commissions.$inferInsert;
