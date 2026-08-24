/**
 * `orders` (OS) — SPEC-004 §4.1 (B8, BR-N242..N250, BR-N392..N394,
 * BR-N121, BR-N405, BR-N407).
 *
 * La OS **nace** al aceptar una cotización (BR-N237/242). Copia
 * **inmutable** de importes (`soldTotalCents`) y alcance
 * (`soldScopeSnapshot` jsonb, snapshot del `scope_documents.content`
 * firmado); ediciones posteriores a la cotización NO alteran la OS.
 *
 *  - `pl_user_id` es el PL **asignado a la OS** (no al proyecto;
 *    BR-N245). Diferenciado del PL que luego asignará SPEC-005.
 *  - `ocFileId` enlaza la OC (PDF) vía `files` (4 campos opcionales
 *    según BR-N243: `ocNumber`, `ocDate`, `ocAmountCents`, `ocFileId`).
 *  - Estados laterales `paused` / `cancelled` con motivo
 *    obligatorio (BR-N250).
 *  - Estados terminales de negocio `delivered` y `closed`:
 *      `delivered` = cierre técnico (BR-N248) ⇒ saldo pendiente
 *        permitido (BR-N392).
 *      `closed`    = cierre administrativo (BR-N249) ⇒ exige
 *        `saldoTotalCents = 0` o excepción Director (`closedDirectorException`),
 *        factura final emitida (`finalInvoiceIssued=true`,
 *        BR-N393) y proyecto terminado/cancelado (chequeado por
 *        `markClosed` con `OUTSTANDING_BALANCE` y `FINAL_INVOICE_REQUIRED`).
 *  - PK compuesta `(organization_id, id)` (ADR-02 §8.3 / AC-43).
 *
 * Índices:
 *  - `(organization_id, status)`: filtro UI/dashboards.
 *  - `(pl_user_id)`: mis OS / dashboards PL.
 *  - `(organization_id, cotizacion_id)`: 1 OS por cotización aceptada
 *    (BR-N242).
 *
 * Side-effects:
 *  - SPEC-004 NO crea `projects` ni `subscriptions`. La transición
 *    `authorized_to_start` expone `plUserId` y `tipoCobro` (evento
 *    `os.authorized_to_start` en `audit_logs`) para que SPEC-005 y
 *    SPEC-011 los consuman en sus propias transacciones (BR-N246,
 *    BR-N407, BR-N405).
 *  - Cobro del anticipo (BR-N244, BR-N121) es consumido vía contrato:
 *    el servicio `authorize` lee el `audit_logs.os.advance_received`
 *    emitido por SPEC-008/SPEC-011; si SPEC-008 aún no implementó el
 *    payload, se evalúa con un getter `getAdvancePaidCents` que retorna
 *    0 mientras no exista contrato consumible, con un `SPEC-GAP` en
 *    IMPL-REPORT hasta que el módulo lo provea.
 */
import {
  bigint,
  boolean,
  date,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { files } from "./files";
import { organizations } from "./organizations";
import { quotes } from "./quotes";
import { users } from "./users";

export const orders = pgTable(
  "orders",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    /** BR-N242 · código humano único por organización (`OS-NNNNN`). */
    code: text("code").notNull(),
    /** BR-N242 · FK a la cotización aceptada que dio origen a la OS. */
    cotizacionId: uuid("cotizacion_id").notNull(),
    /** BR-N242 · FK al cliente (la OS vive con el cliente, no con el prospecto). */
    clientId: uuid("client_id").notNull(),
    /**
     * BR-N245 · PL asignado a la OS (no al proyecto). Nullable hasta
     * que se ejecute `assignPL`. Una vez la OS pasa a
     * `authorized_to_start`, `pl_user_id` debe ser NOT NULL.
     */
    plUserId: uuid("pl_user_id"),
    /**
     * BR-N238 · `pago_unico | mensualidades | suscripcion`.
     * Consumido por SPEC-005 (project_creation universal) y por
     * SPEC-011 (subscription_creation condicional).
     */
    tipoCobro: text("tipo_cobro").notNull(),
    /**
     * BR-N242 · copia **inmutable** del total vendido (centavos MXN).
     * Se copia desde la cotización aceptada en `createFromAcceptedQuote`
     * y **NO** se modifica nunca.
     */
    soldTotalCents: bigint("sold_total_cents", { mode: "number" })
      .notNull()
      .default(0),
    /**
     * BR-N242 · copia **inmutable** del alcance vendido (jsonb).
     * Se copia desde `scope_documents.content` al crear la OS.
     */
    soldScopeSnapshot: jsonb("sold_scope_snapshot").notNull().default({}),
    /**
     * BR-N242 · anticipo requerido (centavos MXN). Copia derivada
     * de la cotización aceptada; puede actualizarse por reglas de
     * SPEC-008/SPEC-011 vía contrato consumible (no implementado en
     * SPEC-004 — sólo se persiste).
     */
    anticipoRequiredCents: bigint("anticipo_required_cents", {
      mode: "number",
    }),
    /** BR-N243 / DEC-FUN-07 · 4 campos opcionales de la OC. */
    ocNumber: text("oc_number"),
    ocDate: date("oc_date"),
    ocAmountCents: bigint("oc_amount_cents", { mode: "number" }),
    ocFileId: uuid("oc_file_id"),
    /**
     * SPEC §4.2 · estados:
     *   pending_deposit | pending_information | authorized_to_start |
     *   in_execution | delivered | closed (+ paused | cancelled).
     */
    status: text("status").notNull().default("pending_deposit"),
    /** BR-N250 · motivo de pausa. */
    pauseReason: text("pause_reason"),
    /** BR-N250 · motivo de cancelación. */
    cancelReason: text("cancel_reason"),
    /** BR-N336 · autorización (quien/ cuando). */
    authorizedAt: timestamp("authorized_at", { withTimezone: true }),
    authorizedBy: uuid("authorized_by"),
    /** BR-N393 · cierre técnico vs administrativo. */
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** BR-N249 / BR-N394 · excepción Director al cierre. */
    closedDirectorException: boolean("closed_director_exception")
      .notNull()
      .default(false),
    closedDirectorExceptionReason: text("closed_director_exception_reason"),
    /** BR-N393 · factura final emitida (consumido vía SPEC-007). */
    finalInvoiceIssued: boolean("final_invoice_issued")
      .notNull()
      .default(false),
    /** BR-N249 · snapshot del saldo al cierre (centavos). */
    closedBalanceCents: bigint("closed_balance_cents", { mode: "number" }),
    /** Monitoreo: cuando SPEC-005 creó el proyecto desde esta OS. */
    projectCreatedAt: timestamp("project_created_at", { withTimezone: true }),
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
    orgCodeUnique: uniqueIndex("orders_org_code_unique").on(
      t.organizationId,
      t.code,
    ),
    orgCotizacionUnique: uniqueIndex("orders_org_cotizacion_unique").on(
      t.organizationId,
      t.cotizacionId,
    ),
    orgStatusIdx: index("orders_org_status_idx").on(t.organizationId, t.status),
    plIdx: index("orders_pl_idx").on(t.plUserId),
    orgClientIdx: index("orders_org_client_idx").on(t.organizationId, t.clientId),
    cotizacionFk: foreignKey({
      name: "orders_cotizacion_fk",
      columns: [t.organizationId, t.cotizacionId],
      foreignColumns: [quotes.organizationId, quotes.id],
    }),
    clientFk: foreignKey({
      name: "orders_client_fk",
      columns: [t.organizationId, t.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }),
    plFk: foreignKey({
      name: "orders_pl_fk",
      columns: [t.organizationId, t.plUserId],
      foreignColumns: [users.organizationId, users.id],
    }),
    authorizedByFk: foreignKey({
      name: "orders_authorized_by_fk",
      columns: [t.organizationId, t.authorizedBy],
      foreignColumns: [users.organizationId, users.id],
    }),
    ocFileFk: foreignKey({
      name: "orders_oc_file_fk",
      columns: [t.organizationId, t.ocFileId],
      foreignColumns: [files.organizationId, files.id],
    }),
  }),
);

export type Order = typeof orders.$inferSelect;
export type OrderNew = typeof orders.$inferInsert;
