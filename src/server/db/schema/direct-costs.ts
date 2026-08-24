/**
 * `direct_costs` — SPEC-009 §4.1 (B21, BR-N279/333).
 * PK compuesta `(organization_id, id)`.
 *
 * Costo directo **imputado a un proyecto**. El monto del costo es el
 * del `transactions.amount_cents` al que apunta `transaction_id`. El
 * campo `confirmed_or_conciliated` es snapshot del estado de la
 * transacción al imputar (sólo `confirmado` o `conciliado` admite
 * imputación, BR-N333). Si la transacción se reversa después, el
 * `direct_costs` queda inmutable (los reportes lo cuentan como
 * histórico pero lo excluyen del costo total vigente — ver
 * `computeProjectCost`).
 *
 * Privacidad: técnicos no ven costos ajenos (BR-N207/208). El
 * servicio filtra por `project_id` cuando el actor no tiene
 * `ver_costos` o `ver_tiempo_equipo`.
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
import { organizations } from "./organizations";
import { projects } from "./projects";
import { transactions } from "./transactions";
import { users } from "./users";

export const directCosts = pgTable(
  "direct_costs",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    transactionId: uuid("transaction_id").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" })
      .notNull()
      .default(0),
    description: text("description"),
    /**
     * Snapshot del estado de la transacción al imputar (BR-N333).
     * `true` si la transacción estaba `confirmado` o `conciliado`.
     * Falso para `borrador/cancelado/reversado`.
     */
    confirmedOrConciliated: text("confirmed_or_conciliated")
      .notNull()
      .default("false"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgProjectIdx: index("direct_costs_org_project_idx").on(
      t.organizationId,
      t.projectId,
    ),
    orgTransactionIdx: index("direct_costs_org_transaction_idx").on(
      t.organizationId,
      t.transactionId,
    ),
    projectFk: foreignKey({
      name: "direct_costs_project_fk",
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
    }),
    transactionFk: foreignKey({
      name: "direct_costs_transaction_fk",
      columns: [t.organizationId, t.transactionId],
      foreignColumns: [transactions.organizationId, transactions.id],
    }),
    createdByFk: foreignKey({
      name: "direct_costs_created_by_fk",
      columns: [t.organizationId, t.createdBy],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type DirectCost = typeof directCosts.$inferSelect;
export type DirectCostNew = typeof directCosts.$inferInsert;
