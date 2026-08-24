/**
 * `invoices` — SPEC-007 §4.1 (B18, BR-N301..N307/BR-N406). PK compuesta
 * `(organization_id, id)`.
 *
 *  - `client_fiscal_data_snapshot` jsonb congela los datos fiscales del
 *    cliente al timbrar (RFC, razón social, régimen, domicilio, CFDI
 *    use). El snapshot es **inmutable** y audita el CFDI aunque el
 *    cliente cambie datos después (BR-N304, BR-N218).
 *  - `concept` jsonb es la línea de CFDI 4.0 (claveProdServ,
 *    cantidad, valor unitario, importe, descuento, IVA). El armado es
 *    del servicio `invoices.build` a partir de la OS o suscripción
 *    (BR-N301).
 *  - `cfdi_uuid` lo asigna el PAC en el timbrado (BR-N304). Único por
 *    organización (defensa anti-duplicado de UUID del SAT).
 *  - `xml_file_id` y `pdf_file_id` referencian `files` (BR-N371).
 *    Nunca se exponen URLs públicas; sólo `signedUrl` TTL ≤ 15 min.
 *  - `status` enum canónico `INVOICE_STATUSES` (BR-N306).
 *  - `cancel_motive_sat` 01-04 (BR-N305) sólo cuando `status='cancelada'`.
 *  - `paid_cents` se actualiza por `factura.aplicar_pago` (servicio
 *    `invoiceApplications`, contrato compatible para SPEC-008 ·
 *    BR-012/308). No excede `total_cents` (BR-N308).
 *  - `application_count` cuenta cuántas aplicaciones tiene la factura;
 *    un conteo > 0 bloquea la cancelación sin reversar (BR-N309).
 *  - `subscription_id` queda **nullable** en MVP; la FK formal la añade
 *    SPEC-011 cuando cree `subscriptions`. Mientras tanto la
 *    referencia es lógica.
 *  - Side-effects:
 *    - `cfdi_uuid` UNIQUE por organización (defensa contra duplicación
 *      accidental del timbrado).
 *    - Índices: `(organization_id, status)` para UI/calendario;
 *      `(organization_id, client_id)` para filtros por cliente;
 *      `(organization_id, due_date)` para `markVencida`.
 *
 * Privacidad: CFDI es dato financiero sensible → visibilidad limitada
 * (BR-N209/211) via permiso `ver_facturas` (SPEC-007). El timbrado y la
 * cancelación registran `audit_logs` (BR-N336).
 */
import {
  bigint,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { clients } from "./clients";
import { files } from "./files";
import { orders } from "./orders";
import { organizations } from "./organizations";
import { users } from "./users";

export const invoices = pgTable(
  "invoices",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    /** Código humano único por organización (`F-NNNNN`). */
    code: text("code").notNull(),
    /** BR-N304 · OS origen cuando la factura nace de un proyecto/OS. */
    orderId: uuid("order_id"),
    /** BR-N406 · suscripción cuando nace de renovación (SPEC-011). */
    subscriptionId: uuid("subscription_id"),
    /** BR-N301 · cliente fiscal de la factura. */
    clientId: uuid("client_id").notNull(),
    /**
     * Snapshot inmutable de los datos fiscales del cliente al timbrar
     * (BR-N218/BR-N304). Congela RFC, razón social, régimen,
     * domicilio y CFDI use para que cambios posteriores del cliente
     * no afecten al CFDI ya emitido.
     */
    clientFiscalDataSnapshot: jsonb("client_fiscal_data_snapshot")
      .notNull()
      .default({}),
    /**
     * BR-N301 · líneas CFDI 4.0 (claveProdServ, descripción,
     * cantidad, valor unitario, importe, descuento, impuestos).
     * Estructura definida por SPEC-007 §4.1.
     */
    concept: jsonb("concept").notNull().default({}),
    /** Subtotal en centavos MXN (sin impuestos). */
    subtotalCents: bigint("subtotal_cents", { mode: "number" })
      .notNull()
      .default(0),
    /** Impuestos en centavos MXN (IVA + otros). */
    taxCents: bigint("tax_cents", { mode: "number" }).notNull().default(0),
    /** Total en centavos MXN (subtotal + impuestos). */
    totalCents: bigint("total_cents", { mode: "number" })
      .notNull()
      .default(0),
    /**
     * BR-N306/307/308 · suma de aplicaciones de cobro en centavos.
     * Si `paid_cents === total_cents` → `status='pagada'`.
     * Si `0 < paid_cents < total_cents` → `status='parcialmente_pagada'`.
     * Si `paid_cents === 0` y `due_date < hoy` → `vencida` (job).
     */
    paidCents: bigint("paid_cents", { mode: "number" })
      .notNull()
      .default(0),
    /**
     * BR-N309 · cantidad de aplicaciones de cobro. > 0 bloquea la
     * cancelación (la UI/servicio exige reversar primero; SPEC-008
     * provee el contrato).
     */
    applicationCount: integer("application_count").notNull().default(0),
    /** BR-N306 · estados: borrador | emitida | parcialmente_pagada | pagada | vencida | cancelada. */
    status: text("status").notNull().default("borrador"),
    /** BR-N304 · UUID CFDI asignado por el PAC al timbrar (UNIQUE por org). */
    cfdiUuid: text("cfdi_uuid"),
    /** BR-N304 · archivo XML (en bucket S3). */
    xmlFileId: uuid("xml_file_id"),
    /** BR-N304 · archivo PDF (en bucket S3). */
    pdfFileId: uuid("pdf_file_id"),
    /** BR-N304 · momento del timbrado exitoso. */
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    /** BR-N306/307 · fecha de vencimiento (calculada por `build`). */
    dueDate: date("due_date").notNull(),
    /** BR-N305 · motivo SAT 01-04 (sólo si `status='cancelada'`). */
    cancelMotiveSat: text("cancel_motive_sat"),
    /** BR-N305/309 · momento de cancelación + motivo ≥3 caracteres. */
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    /** BR-N336 · autor del timbrado/cancelación (audit). */
    createdBy: uuid("created_by"),
    issuedBy: uuid("issued_by"),
    cancelledBy: uuid("cancelled_by"),
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
    orgCodeUnique: uniqueIndex("invoices_org_code_unique").on(
      t.organizationId,
      t.code,
    ),
    /** Defensa contra duplicación de `cfdi_uuid` por organización. */
    cfdiUuidUnique: uniqueIndex("invoices_org_cfdi_uuid_unique")
      .on(t.organizationId, t.cfdiUuid)
      .where(sql`${t.cfdiUuid} IS NOT NULL`),
    orgStatusIdx: index("invoices_org_status_idx").on(
      t.organizationId,
      t.status,
    ),
    orgClientIdx: index("invoices_org_client_idx").on(
      t.organizationId,
      t.clientId,
    ),
    orgDueIdx: index("invoices_org_due_idx").on(
      t.organizationId,
      t.dueDate,
    ),
    orgOrderIdx: index("invoices_org_order_idx").on(
      t.organizationId,
      t.orderId,
    ),
    orgSubscriptionIdx: index("invoices_org_subscription_idx").on(
      t.organizationId,
      t.subscriptionId,
    ),
    clientFk: foreignKey({
      name: "invoices_client_fk",
      columns: [t.organizationId, t.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }),
    orderFk: foreignKey({
      name: "invoices_order_fk",
      columns: [t.organizationId, t.orderId],
      foreignColumns: [orders.organizationId, orders.id],
    }),
    xmlFileFk: foreignKey({
      name: "invoices_xml_file_fk",
      columns: [t.organizationId, t.xmlFileId],
      foreignColumns: [files.organizationId, files.id],
    }),
    pdfFileFk: foreignKey({
      name: "invoices_pdf_file_fk",
      columns: [t.organizationId, t.pdfFileId],
      foreignColumns: [files.organizationId, files.id],
    }),
    createdByFk: foreignKey({
      name: "invoices_created_by_fk",
      columns: [t.organizationId, t.createdBy],
      foreignColumns: [users.organizationId, users.id],
    }),
    issuedByFk: foreignKey({
      name: "invoices_issued_by_fk",
      columns: [t.organizationId, t.issuedBy],
      foreignColumns: [users.organizationId, users.id],
    }),
    cancelledByFk: foreignKey({
      name: "invoices_cancelled_by_fk",
      columns: [t.organizationId, t.cancelledBy],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type Invoice = typeof invoices.$inferSelect;
export type InvoiceNew = typeof invoices.$inferInsert;
