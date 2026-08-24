/**
 * `payments` — SPEC-008 §4.1 (B17, BR-N314-319).
 * PK compuesta `(organization_id, id)`.
 *
 * Línea principal: `registrado → confirmado → reversado` (terminal).
 *  - `registrado`: editable (BR-N315). `comprobante_file_id` se sube
 *    en `confirm` y queda inmutable; en `registrado` es opcional.
 *  - `confirmado`: ya no se edita; sólo `reverse` (BR-N318).
 *  - `reversado`: terminal con `reversed_reason` (≥3 chars) y
 *    `original_payment_id` apuntando al confirmado original. La
 *    reversa **revierte aplicaciones** vía `payment_applications`
 *    y `invoices.paid_cents` (delegado al servicio `cobros.reverse`).
 *
 * Movimiento de ingreso vinculado (BR-N316) lo crea el servicio al
 * confirmar; la tabla `accounts`/`movements` la define SPEC-009.
 * Aquí sólo dejamos `income_movement_id` opcional para que SPEC-009
 * pueda enlazar sin acoplamiento inverso.
 *
 * Privacidad:
 *  - Vendedor NO ve CxC de otros (BR-N207) — filtro en servicio.
 *  - Comprobante: archivo en bucket S3 con `signedUrl` TTL ≤ 15 min
 *    (BR-N371).
 *  - Audit (`cobro.register`/`cobro.confirm`/`cobro.reverse`) con
 *    `actor_role_code` (BR-N336).
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
import { clients } from "./clients";
import { files } from "./files";
import { organizations } from "./organizations";
import { users } from "./users";

export const payments = pgTable(
  "payments",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    clientId: uuid("client_id").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" })
      .notNull()
      .default(0),
    status: text("status").notNull().default("registrado"),
    method: text("method").notNull().default("transferencia"),
    /** BR-N319 · referencia bancaria / número de cheque / etc. */
    reference: text("reference"),
    /** BR-N319 · comprobante (PDF/imagen) subido al bucket. */
    comprobanteFileId: uuid("comprobante_file_id"),
    /** BR-N316 · vínculo al movimiento de ingreso (definido en SPEC-009). */
    incomeMovementId: uuid("income_movement_id"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedBy: uuid("confirmed_by"),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedBy: uuid("reversed_by"),
    reversedReason: text("reversed_reason"),
    /** BR-N318 · puntero al cobro original cuando este row es la reversa. */
    originalPaymentId: uuid("original_payment_id"),
    /** Fecha del cobro — útil para vencimientos y reportes contables. */
    paymentDate: date("payment_date").notNull(),
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
    orgStatusIdx: index("payments_org_status_idx").on(
      t.organizationId,
      t.status,
    ),
    orgClientIdx: index("payments_org_client_idx").on(
      t.organizationId,
      t.clientId,
    ),
    orgOriginalIdx: index("payments_org_original_idx").on(
      t.organizationId,
      t.originalPaymentId,
    ),
    clientFk: foreignKey({
      name: "payments_client_fk",
      columns: [t.organizationId, t.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }),
    comprobanteFk: foreignKey({
      name: "payments_comprobante_fk",
      columns: [t.organizationId, t.comprobanteFileId],
      foreignColumns: [files.organizationId, files.id],
    }),
    originalPaymentFk: foreignKey({
      name: "payments_original_payment_fk",
      columns: [t.organizationId, t.originalPaymentId],
      foreignColumns: [t.organizationId, t.id],
    }),
    confirmedByFk: foreignKey({
      name: "payments_confirmed_by_fk",
      columns: [t.organizationId, t.confirmedBy],
      foreignColumns: [users.organizationId, users.id],
    }),
    reversedByFk: foreignKey({
      name: "payments_reversed_by_fk",
      columns: [t.organizationId, t.reversedBy],
      foreignColumns: [users.organizationId, users.id],
    }),
    createdByFk: foreignKey({
      name: "payments_created_by_fk",
      columns: [t.organizationId, t.createdBy],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type Payment = typeof payments.$inferSelect;
export type PaymentNew = typeof payments.$inferInsert;
