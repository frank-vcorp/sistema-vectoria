/**
 * `quotes` — SPEC-003 §4.1 (B7, BR-N25/51/143/235/236/237/238/239/411).
 *
 * Cotización multi-línea. Cálculo (BR-N357..N360) y descuentos
 * (BR-N143, política por rol) viven en `src/server/services/comercial/quotes.ts`.
 *
 * `presupuesto_declarado_cents` se copia del cuestionario de sondeo al
 * crear la cotización (BR-N411, DEC-FUN-20260819-73). Nullable: si
 * el prospecto no declaró presupuesto, `null` desactiva la advertencia
 * de desviación (AC-12).
 *
 * `accepted_evidence_file_id` apunta a un archivo subido vía
 * `files` (BR-N237, SPEC-001 AC-13). `accepted_by_proxy` registra
 * que el Vendedor aceptó en nombre del cliente (DEC-FUN-55, H-08).
 *
 * 1 sola cotización aceptada por prospecto (BR-N25): el servicio
 * rechaza la 2ª aceptación con `PROSPECT_HAS_ACCEPTED_QUOTE`.
 * Aceptada es **inmutable** (BR-N02). Vigencia mínima 7 días (BR-N235).
 */
import {
  bigint,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { clients } from "./clients";
import { files } from "./files";
import { prospects } from "./prospects";
import { scopeDocuments } from "./scope-documents";
import { users } from "./users";

export const quotes = pgTable(
  "quotes",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    /** Código humano único por organización (`QT-NNNN`). */
    code: text("code").notNull(),
    prospectId: uuid("prospect_id"),
    clientId: uuid("client_id"),
    scopeId: uuid("scope_id").notNull(),
    /**
     * SPEC-003 §4.1:
     *   draft | internal_review | sent | negotiation | accepted | rejected | expired | cancelled
     */
    status: text("status").notNull().default("draft"),
    /**
     * BR-N238:
     *   pago_unico | mensualidades | suscripcion
     * (consumido por SPEC-004 / SPEC-011).
     */
    tipoCobro: text("tipo_cobro").notNull().default("pago_unico"),
    /**
     * BR-N239: si `tipo_cobro='suscripcion'` el sistema marca
     * `requires_initial_payment=true`. SPEC-004 lo valida antes de
     * autorizar (BR-N121).
     */
    requiresInitialPayment: integer("requires_initial_payment")
      .notNull()
      .default(0),
    // Importes (BR-N357..N360) — todos en centavos MXN.
    subtotalCents: bigint("subtotal_cents", { mode: "number" })
      .notNull()
      .default(0),
    discountCents: bigint("discount_cents", { mode: "number" })
      .notNull()
      .default(0),
    discountPct: integer("discount_pct").notNull().default(0),
    taxCents: bigint("tax_cents", { mode: "number" }).notNull().default(0),
    totalCents: bigint("total_cents", { mode: "number" }).notNull().default(0),
    /** BR-N411: presupuesto declarado al crear la cotización (centavos). */
    presupuestoDeclaradoCents: bigint("presupuesto_declarado_cents", {
      mode: "number",
    }),
    /** BR-N235: vigencia mínima 7 días. */
    validUntil: timestamp("valid_until", { withTimezone: true }),
    /** Aceptación (BR-N237, H-08, DEC-FUN-55). */
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByProxy: text("accepted_by_proxy"),
    acceptedEvidenceFileId: uuid("accepted_evidence_file_id"),
    acceptedByUserId: uuid("accepted_by_user_id"),
    /** Versión de la cotización. */
    version: integer("version").notNull().default(1),
    notes: text("notes"),
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
    orgCodeUnique: uniqueIndex("quotes_org_code_unique").on(
      t.organizationId,
      t.code,
    ),
    orgStatusIdx: index("quotes_org_status_idx").on(t.organizationId, t.status),
    orgProspectIdx: index("quotes_org_prospect_idx").on(
      t.organizationId,
      t.prospectId,
    ),
    orgClientIdx: index("quotes_org_client_idx").on(
      t.organizationId,
      t.clientId,
    ),
    scopeFk: foreignKey({
      name: "quotes_scope_fk",
      columns: [t.organizationId, t.scopeId],
      foreignColumns: [scopeDocuments.organizationId, scopeDocuments.id],
    }),
    prospectFk: foreignKey({
      name: "quotes_prospect_fk",
      columns: [t.organizationId, t.prospectId],
      foreignColumns: [prospects.organizationId, prospects.id],
    }),
    clientFk: foreignKey({
      name: "quotes_client_fk",
      columns: [t.organizationId, t.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }),
    acceptedEvidenceFk: foreignKey({
      name: "quotes_accepted_evidence_fk",
      columns: [t.organizationId, t.acceptedEvidenceFileId],
      foreignColumns: [files.organizationId, files.id],
    }),
    acceptedByUserFk: foreignKey({
      name: "quotes_accepted_by_user_fk",
      columns: [t.organizationId, t.acceptedByUserId],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type Quote = typeof quotes.$inferSelect;
export type QuoteNew = typeof quotes.$inferInsert;
