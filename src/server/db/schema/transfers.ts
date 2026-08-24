/**
 * `transfers` — SPEC-009 §4.1 (BR-N326, DEC-FUN-27).
 * PK compuesta `(organization_id, id)`.
 *
 * Una transferencia interna une DOS movimientos (salida + entrada) en
 * cuentas distintas. NO se clasifica como ingreso ni gasto operativo
 * (los reportes la excluyen). Si falta cualquiera de las dos patas, el
 * helper `validateTransferPair` retorna `TRANSFER_INVALID_PAIR` (400).
 *
 * El servicio `transfers.create(fromAccountId, toAccountId, amount)`
 * crea ambos `transactions` en estado `confirmado` con
 * `type='transferencia'` y `sub_kind='transferencia_interna'`.
 *
 * NOTA: las FKs `outTransactionId` → `transactions` y `inTransactionId`
 * → `transactions` están en el modelo lógico pero NO como constraints
 * en BD para evitar el ciclo de imports circulares entre
 * `transactions.ts` y `transfers.ts`. La invariante referencial se
 * valida en el servicio (`validateTransferPair`).
 */
import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const transfers = pgTable(
  "transfers",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    /** Patas de la transferencia (validadas en servicio). */
    outTransactionId: uuid("out_transaction_id").notNull(),
    inTransactionId: uuid("in_transaction_id").notNull(),
    note: text("note"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgIdx: index("transfers_org_idx").on(t.organizationId),
  }),
);

export type Transfer = typeof transfers.$inferSelect;
export type TransferNew = typeof transfers.$inferInsert;
