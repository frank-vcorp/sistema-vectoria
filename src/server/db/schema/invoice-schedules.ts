/**
 * `invoice_schedules` — SPEC-007 §4.1 (BR-N310). PK compuesta
 * `(organization_id, id)`.
 *
 * Un schedule define una **fecha programada** en la que el job
 * nocturno `jobs.facturacionRecurrente` debe crear una factura (auto o
 * en borrador, según `auto_or_draft`). El job es **idempotente** vía
 * `jobsService.enqueue(name, payload, { jobKey })` (SPEC-001 AC-15):
 * `job_key = "{schedule_id}|{YYYY-MM-DD}"` y un schedule ya ejecutado
 * no se vuelve a ejecutar.
 *
 *  - `order_id` o `subscription_id` (al menos uno debe estar presente,
 *    validado por servicio): el schedule aplica a una OS recurrente o a
 *    una suscripción (BR-N310 + SPEC-011).
 *  - `scheduled_date`: día en que se ejecuta.
 *  - `amount_cents`: importe total a facturar en la corrida.
 *  - `auto_or_draft`: `auto` → timbrar de inmediato; `draft` → crear
 *    sólo el borrador (BR-N310). Default `draft` por seguridad
 *    operativa.
 *  - `status`: `pending` | `executed` | `skipped` (idempotencia
 *    observable).
 *
 * Índices:
 *  - `(organization_id, status, scheduled_date)` para que el job
 *    encuentre `pending` por fecha.
 *  - `(organization_id, order_id)` y `(organization_id,
 *    subscription_id)` para UI/listados.
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
import { organizations } from "./organizations";
import { orders } from "./orders";

export const invoiceSchedules = pgTable(
  "invoice_schedules",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    /** BR-N310 · OS recurrente (opcional, ver `subscriptionId`). */
    orderId: uuid("order_id"),
    /** BR-N310 · suscripción recurrente (opcional, ver `orderId`). */
    subscriptionId: uuid("subscription_id"),
    /** BR-N310 · fecha en la que el job debe crear la factura. */
    scheduledDate: date("scheduled_date").notNull(),
    /** BR-N310 · importe a facturar en la corrida (centavos MXN). */
    amountCents: bigint("amount_cents", { mode: "number" })
      .notNull()
      .default(0),
    /** BR-N310 · `auto` timbra; `draft` sólo crea el borrador. */
    autoOrDraft: text("auto_or_draft").notNull().default("draft"),
    /** `pending | executed | skipped` (idempotencia observable). */
    status: text("status").notNull().default("pending"),
    /** Auditoría: invoice_id generada al ejecutar. */
    executedInvoiceId: uuid("executed_invoice_id"),
    executedAt: timestamp("executed_at", { withTimezone: true }),
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
    orgStatusDateIdx: index("invoice_schedules_org_status_date_idx").on(
      t.organizationId,
      t.status,
      t.scheduledDate,
    ),
    orgOrderIdx: index("invoice_schedules_org_order_idx").on(
      t.organizationId,
      t.orderId,
    ),
    orgSubscriptionIdx: index("invoice_schedules_org_subscription_idx").on(
      t.organizationId,
      t.subscriptionId,
    ),
    orderFk: foreignKey({
      name: "invoice_schedules_order_fk",
      columns: [t.organizationId, t.orderId],
      foreignColumns: [orders.organizationId, orders.id],
    }),
  }),
);

export type InvoiceSchedule = typeof invoiceSchedules.$inferSelect;
export type InvoiceScheduleNew = typeof invoiceSchedules.$inferInsert;
