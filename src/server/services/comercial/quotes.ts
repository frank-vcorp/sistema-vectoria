/**
 * Servicio `quotes` — SPEC-003 §4.2 (B7).
 *
 * Reglas críticas:
 *  - **Cotización exige spec firmado** (BR-N51, AC-1) → `SIGNED_SCOPE_REQUIRED`.
 *  - **Multi-línea polimórfica** (BR-N234, DEC-FUN-48) → 4 kinds.
 *  - **Cálculo** (BR-N357-360) en `calculateQuote` (helper puro).
 *  - **Descuento por rol** (BR-N143): ≤10% libre, 10-25% Director,
 *    >25% bloqueado (ver `validateDiscountByRole`).
 *  - **1 aceptada por prospecto** (BR-N25) → `PROSPECT_HAS_ACCEPTED_QUOTE`.
 *  - **Aceptación exige identidad+fecha+medio+evidencia** (BR-N237, H-08).
 *  - **Aceptada es inmutable** (BR-N02). Vigencia ≥7 días (BR-N235).
 *  - **Advertencia presupuestal no bloqueante** (BR-N411, AC-12).
  *  - **Side-effect OS delegado a SPEC-004** sin implementar fuera de
 *    alcance: `quotes.accept` registra `os.create_pending_from_quote`
 *    en `audit_logs` con los datos para que SPEC-004 los consuma.
 *  - **Conversión prospecto→cliente al aceptar** (SPEC-027, ADR-05):
 *    si `clientId` es null y `prospectId` real, dentro de la misma
 *    transacción se reutiliza o crea el cliente del prospecto y se
 *    enlaza `quotes.client_id` antes de marcar `accepted`. Si
 *    `clientId` ya existe, no se toca.
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import {
  clients,
  fileLinks,
  files,
  prospects,
  quoteAcceptances,
  quoteItems,
  quotes,
  scopeDocuments,
} from "@/server/db/schema";
import {
  QUOTE_MIN_VALIDITY_DAYS,
  QUOTE_STATUSES,
  type QuoteItemKind,
  type QuoteStatus,
  type TipoCobro,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import {
  calculateQuote,
  computeRequiresInitialPayment,
  evaluatePresupuestoWarning,
  meetsMinimumValidity,
  type PresupuestoWarning,
  type QuoteCalcResult,
} from "./helpers";

export interface QuoteItemDTO {
  id: string;
  organizationId: string;
  quoteId: string;
  kind: QuoteItemKind;
  catalogServiceId: string | null;
  description: string;
  qty: number;
  unitPriceCents: number;
  discountCents: number;
  totalCents: number;
  sortOrder: number;
}

export interface QuoteDTO {
  id: string;
  organizationId: string;
  code: string;
  prospectId: string | null;
  clientId: string | null;
  scopeId: string;
  status: QuoteStatus;
  tipoCobro: TipoCobro;
  requiresInitialPayment: boolean;
  subtotalCents: number;
  discountCents: number;
  discountPct: number;
  taxCents: number;
  totalCents: number;
  presupuestoDeclaradoCents: number | null;
  validUntil: Date | null;
  acceptedAt: Date | null;
  acceptedByProxy: string | null;
  acceptedEvidenceFileId: string | null;
  acceptedByUserId: string | null;
  version: number;
  notes: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: QuoteItemDTO[];
}

export interface CreateQuoteItemInput {
  kind: QuoteItemKind;
  catalogServiceId?: string | null;
  description: string;
  qty: number;
  unitPriceCents: number;
  discountCents: number;
  sortOrder: number;
}

export interface QuotesService {
  create(
    ctx: Context,
    input: {
      prospectId: string | null;
      scopeId: string;
      tipoCobro: TipoCobro;
      notes?: string;
      validUntil: Date;
      items: CreateQuoteItemInput[];
      presupuestoDeclaradoCents?: number | null;
      discountPct?: number;
    },
  ): Promise<QuoteDTO>;
  updateItems(
    ctx: Context,
    input: { quoteId: string; items: CreateQuoteItemInput[]; discountPct?: number },
  ): Promise<QuoteDTO>;
  send(ctx: Context, input: { quoteId: string }): Promise<QuoteDTO>;
  setDiscount(
    ctx: Context,
    input: { quoteId: string; discountPct: number },
  ): Promise<QuoteDTO>;
  presupuestoWarning(
    ctx: Context,
    input: { quoteId: string },
  ): Promise<PresupuestoWarning>;
  accept(
    ctx: Context,
    input: {
      quoteId: string;
      accepterName: string;
      accepterOrg?: string;
      medium: "email" | "telefono" | "presencial" | "otro";
      evidenceFileId: string;
      notes?: string;
      proxy: boolean;
    },
  ): Promise<QuoteDTO>;
  cancel(
    ctx: Context,
    input: { quoteId: string; reason?: string },
  ): Promise<QuoteDTO>;
  expire(
    ctx: Context,
    input: { quoteId: string },
  ): Promise<QuoteDTO>;
  reject(
    ctx: Context,
    input: { quoteId: string; reason?: string },
  ): Promise<QuoteDTO>;
  getById(ctx: Context, quoteId: string): Promise<QuoteDTO>;
  listForProspect(
    ctx: Context,
    input: { prospectId: string },
  ): Promise<QuoteDTO[]>;
  calculatePreview(input: { items: CreateQuoteItemInput[] }): QuoteCalcResult;
}

function statusOf(value: string): QuoteStatus {
  return (QUOTE_STATUSES as readonly string[]).includes(value)
    ? (value as QuoteStatus)
    : "draft";
}

function itemToDto(row: typeof quoteItems.$inferSelect): QuoteItemDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    quoteId: row.quoteId,
    kind: row.kind as QuoteItemKind,
    catalogServiceId: row.catalogServiceId,
    description: row.description,
    qty: row.qty,
    unitPriceCents: row.unitPriceCents,
    discountCents: row.discountCents,
    totalCents: row.totalCents,
    sortOrder: row.sortOrder,
  };
}

function quoteToDto(
  row: typeof quotes.$inferSelect,
  items: QuoteItemDTO[],
): QuoteDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    code: row.code,
    prospectId: row.prospectId,
    clientId: row.clientId,
    scopeId: row.scopeId,
    status: statusOf(row.status),
    tipoCobro: row.tipoCobro as TipoCobro,
    requiresInitialPayment: row.requiresInitialPayment === 1,
    subtotalCents: row.subtotalCents,
    discountCents: row.discountCents,
    discountPct: row.discountPct,
    taxCents: row.taxCents,
    totalCents: row.totalCents,
    presupuestoDeclaradoCents: row.presupuestoDeclaradoCents,
    validUntil: row.validUntil,
    acceptedAt: row.acceptedAt,
    acceptedByProxy: row.acceptedByProxy,
    acceptedEvidenceFileId: row.acceptedEvidenceFileId,
    acceptedByUserId: row.acceptedByUserId,
    version: row.version,
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items,
  };
}

/** Genera el siguiente código `QT-NNNN` por organización. */
async function nextCode(orgId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ code: sql<string>`max(code)` })
    .from(quotes)
    .where(eq(quotes.organizationId, orgId));
  const last = row?.code ?? null;
  if (!last) return "QT-0001";
  const m = /^QT-(\d{1,})$/.exec(last);
  if (!m || !m[1]) return "QT-0001";
  const n = (parseInt(m[1], 10) + 1).toString().padStart(4, "0");
  return `QT-${n}`;
}

/**
 * Genera el siguiente `clientNumber` por organización dentro de una
 * transacción. Espejo de `nextClientNumber` en `services/clientes/
 * clients.ts` (BR-N216) para uso interno en transacciones de
 * aceptación; la colisión bajo concurrencia la captura el
 * `UNIQUE (organizationId, clientNumber)` y la app reintenta.
 */
async function nextClientNumberTx(
  tx: ReturnType<typeof getDb>,
  orgId: string,
): Promise<string> {
  const [row] = await tx
    .select({ n: sql<string>`max(client_number)` })
    .from(clients)
    .where(eq(clients.organizationId, orgId));
  const last = row?.n ?? null;
  if (!last) return "C-000001";
  const m = /^C-(\d{1,})$/.exec(last);
  if (!m || !m[1]) return "C-000001";
  const n = (parseInt(m[1], 10) + 1).toString().padStart(6, "0");
  return `C-${n}`;
}

/**
 * SPEC-027 / ADR-05: garantiza que existe un cliente para el
 * prospecto, dentro de la transacción de aceptación. Si ya existe
 * uno para `(organizationId, prospectId)`, lo reutiliza (idempotente).
 * Si no, lo crea a partir del prospecto (name/company/email; nunca
 * RFC ni contactos inventados). Devuelve el `id` del cliente.
 *
 * Lanza `PROSPECT_NOT_FOUND` (404) si el prospecto no existe en la
 * misma organización. Cualquier fallo de FK/unique queda
 * propagado y la transacción externa hace rollback automático.
 */
async function ensureClientForProspect(
  ctx: Context,
  tx: ReturnType<typeof getDb>,
  orgId: string,
  prospectId: string,
): Promise<string> {
  // 1) Idempotencia: si ya hay cliente para este prospecto, reusar.
  const [existing] = await tx
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.organizationId, orgId),
        eq(clients.prospectId, prospectId),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  // 2) Cargar prospecto en la misma organización.
  const [p] = await tx
    .select()
    .from(prospects)
    .where(
      and(
        eq(prospects.id, prospectId),
        eq(prospects.organizationId, orgId),
      ),
    )
    .limit(1);
  if (!p) {
    throw new DomainError(
      "PROSPECT_NOT_FOUND",
      "Prospecto no encontrado para conversión al aceptar",
      404,
    );
  }

  // 3) Generar clientNumber y crear cliente con datos del prospecto.
  const clientNumber = await nextClientNumberTx(tx, orgId);
  const [row] = await tx
    .insert(clients)
    .values({
      organizationId: orgId,
      clientNumber,
      prospectId: p.id,
      name: p.name,
      company: p.company ?? null,
      email: p.email ?? null,
      phone: null,
      status: "active",
    })
    .returning();
  if (!row) throw new Error("client insert sin fila (aceptación)");

  // 4) Auditar la creación. No incluye secretos.
  const { createAuditService } = await import("@/server/services/audit");
  await createAuditService().record(ctx, {
    entityType: "client",
    entityId: row.id,
    action: "client.create",
    after: {
      clientNumber: row.clientNumber,
      prospectId: row.prospectId,
      name: row.name,
      status: row.status,
      source: "quote.accept",
    },
  });
  return row.id;
}

export function createQuotesService(): QuotesService {
  const db = getDb();

  /**
   * Inserta los `quote_items` en BD, calculando totales de línea
   * (BR-N357). Devuelve los DTOs.
   */
  async function insertItems(
    tx: ReturnType<typeof getDb>,
    orgId: string,
    quoteId: string,
    items: CreateQuoteItemInput[],
  ): Promise<{ rowIds: string[]; lineTotals: number[] }> {
    const calc = calculateQuote(items);
    const rowIds: string[] = [];
    let i = 0;
    for (const item of items) {
      const lineTotal = calc.lineTotals[i] ?? 0;
      const [row] = await tx
        .insert(quoteItems)
        .values({
          organizationId: orgId,
          quoteId,
          kind: item.kind,
          catalogServiceId: item.catalogServiceId ?? null,
          description: item.description,
          qty: item.qty,
          unitPriceCents: item.unitPriceCents,
          discountCents: item.discountCents,
          totalCents: lineTotal,
          sortOrder: item.sortOrder,
        })
        .returning();
      if (!row) throw new Error("quote_item insert sin fila");
      rowIds.push(row.id);
      i++;
    }
    return { rowIds, lineTotals: calc.lineTotals };
  }

  async function loadItems(
    orgId: string,
    quoteId: string,
    executor: ReturnType<typeof getDb> = db,
  ): Promise<QuoteItemDTO[]> {
    const rows = await executor
      .select()
      .from(quoteItems)
      .where(
        and(eq(quoteItems.organizationId, orgId), eq(quoteItems.quoteId, quoteId)),
      )
      .orderBy(quoteItems.sortOrder);
    return rows.map(itemToDto);
  }

  function calculatePreview(input: { items: CreateQuoteItemInput[] }): QuoteCalcResult {
    return calculateQuote(input.items);
  }

  async function create(
    ctx: Context,
    input: {
      prospectId: string | null;
      scopeId: string;
      tipoCobro: TipoCobro;
      notes?: string;
      validUntil: Date;
      items: CreateQuoteItemInput[];
      presupuestoDeclaradoCents?: number | null;
      discountPct?: number;
    },
  ): Promise<QuoteDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_comercial", {
      forceDb: true,
    });
    // BR-N51 / AC-1: spec firmado previo.
    const [scope] = await db
      .select()
      .from(scopeDocuments)
      .where(
        and(
          eq(scopeDocuments.id, input.scopeId),
          eq(scopeDocuments.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!scope) {
      throw new DomainError("SCOPE_NOT_FOUND", "Alcance no encontrado", 404);
    }
    if (scope.status !== "signed") {
      throw new DomainError(
        "SIGNED_SCOPE_REQUIRED",
        "La cotización exige spec firmado",
        409,
      );
    }
    // BR-N235: vigencia mínima 7 días.
    if (!meetsMinimumValidity(input.validUntil.getTime())) {
      throw new DomainError(
        "MIN_VIGENCIA_NOT_MET",
        `La vigencia mínima es de ${QUOTE_MIN_VALIDITY_DAYS} días`,
        400,
      );
    }
    // BR-N143: descuento por rol.
    const discountPct = input.discountPct ?? 0;
    if (discountPct > 0) {
      const { has } = createHasPermissionService();
      const ok = await has(ctx, "aprobar_descuento");
      // Importante: importamos el helper puro para validar la política
      // completa (≤10 libre, 10-25 director, >25 bloqueado).
      const { validateDiscountByRole } = await import("./helpers");
      const policy = validateDiscountByRole(discountPct, ok);
      if (!policy.ok) {
        if (policy.code === "DISCOUNT_NEEDS_DIRECTOR") {
          throw new DomainError(
            "DISCOUNT_NEEDS_DIRECTOR",
            "Descuento 10-25% requiere Director",
            policy.status,
          );
        }
        throw new DomainError(
          "DISCOUNT_EXCEEDS_LIMIT",
          "Descuento >25% bloqueado",
          policy.status,
        );
      }
    }
    const calc = calculateQuote(input.items);
    const code = await nextCode(user.organization_id);
    const requiresInitialPayment = computeRequiresInitialPayment(input.tipoCobro) ? 1 : 0;
    return withTx(async (tx) => {
      const [row] = await tx
        .insert(quotes)
        .values({
          organizationId: user.organization_id,
          code,
          prospectId: input.prospectId ?? null,
          scopeId: scope.id,
          status: "draft",
          tipoCobro: input.tipoCobro,
          requiresInitialPayment,
          subtotalCents: calc.subtotalCents,
          discountCents: calc.discountCents,
          discountPct,
          taxCents: calc.taxCents,
          totalCents: calc.totalCents,
          presupuestoDeclaradoCents: input.presupuestoDeclaradoCents ?? null,
          validUntil: input.validUntil,
          version: 1,
          notes: input.notes ?? null,
          createdBy: user.id,
        })
        .returning();
      if (!row) throw new Error("quote insert sin fila");
      await insertItems(
        tx,
        user.organization_id,
        row.id,
        input.items,
      );
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "quote",
        entityId: row.id,
        action: "quote.create",
        after: {
          code: row.code,
          status: row.status,
          tipoCobro: row.tipoCobro,
          totalCents: row.totalCents,
        },
      });
      return loadQuote(user.organization_id, row.id, tx);
    });
  }

  async function loadQuote(
    orgId: string,
    quoteId: string,
    executor: ReturnType<typeof getDb> = db,
  ): Promise<QuoteDTO> {
    const [row] = await executor
      .select()
      .from(quotes)
      .where(
        and(eq(quotes.id, quoteId), eq(quotes.organizationId, orgId)),
      )
      .limit(1);
    if (!row) {
      throw new DomainError("QUOTE_NOT_FOUND", "Cotización no encontrada", 404);
    }
    const items = await loadItems(orgId, quoteId, executor);
    return quoteToDto(row, items);
  }

  async function updateItems(
    ctx: Context,
    input: { quoteId: string; items: CreateQuoteItemInput[]; discountPct?: number },
  ): Promise<QuoteDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_comercial", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(quotes)
        .where(
          and(
            eq(quotes.id, input.quoteId),
            eq(quotes.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("QUOTE_NOT_FOUND", "Cotización no encontrada", 404);
      }
      if (before.status !== "draft") {
        throw new DomainError(
          "QUOTE_NOT_DRAFT",
          "Sólo cotizaciones en draft admiten edición de ítems",
          409,
        );
      }
      const discountPct = input.discountPct ?? before.discountPct;
      if (discountPct > 0) {
        const { has } = createHasPermissionService();
        const ok = await has(ctx, "aprobar_descuento");
        const { validateDiscountByRole } = await import("./helpers");
        const policy = validateDiscountByRole(discountPct, ok);
        if (!policy.ok) {
          if (policy.code === "DISCOUNT_NEEDS_DIRECTOR") {
            throw new DomainError(
              "DISCOUNT_NEEDS_DIRECTOR",
              "Descuento 10-25% requiere Director",
              policy.status,
            );
          }
          throw new DomainError(
            "DISCOUNT_EXCEEDS_LIMIT",
            "Descuento >25% bloqueado",
            policy.status,
          );
        }
      }
      const calc = calculateQuote(input.items);
      // Reemplazar ítems.
      await tx
        .delete(quoteItems)
        .where(
          and(
            eq(quoteItems.quoteId, input.quoteId),
            eq(quoteItems.organizationId, user.organization_id),
          ),
        );
      await insertItems(
        tx,
        user.organization_id,
        input.quoteId,
        input.items,
      );
      const [after] = await tx
        .update(quotes)
        .set({
          subtotalCents: calc.subtotalCents,
          discountCents: calc.discountCents,
          discountPct,
          taxCents: calc.taxCents,
          totalCents: calc.totalCents,
          version: before.version + 1,
        })
        .where(
          and(
            eq(quotes.id, input.quoteId),
            eq(quotes.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("quote update sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "quote",
        entityId: after.id,
        action: "quote.update",
        before: { version: before.version, totalCents: before.totalCents },
        after: { version: after.version, totalCents: after.totalCents },
      });
      return loadQuote(user.organization_id, input.quoteId, tx);
    });
  }

  async function send(
    ctx: Context,
    input: { quoteId: string },
  ): Promise<QuoteDTO> {
    return transitionStatus(ctx, input.quoteId, "sent", "quote.send");
  }

  async function setDiscount(
    ctx: Context,
    input: { quoteId: string; discountPct: number },
  ): Promise<QuoteDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_comercial", {
      forceDb: true,
    });
    const { validateDiscountByRole } = await import("./helpers");
    const { has } = createHasPermissionService();
    const ok = await has(ctx, "aprobar_descuento");
    const policy = validateDiscountByRole(input.discountPct, ok);
    if (!policy.ok) {
      if (policy.code === "DISCOUNT_NEEDS_DIRECTOR") {
        throw new DomainError(
          "DISCOUNT_NEEDS_DIRECTOR",
          "Descuento 10-25% requiere Director",
          policy.status,
        );
      }
      throw new DomainError(
        "DISCOUNT_EXCEEDS_LIMIT",
        "Descuento >25% bloqueado",
        policy.status,
      );
    }
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(quotes)
        .where(
          and(
            eq(quotes.id, input.quoteId),
            eq(quotes.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("QUOTE_NOT_FOUND", "Cotización no encontrada", 404);
      }
      if (before.status === "accepted") {
        throw new DomainError(
          "QUOTE_ALREADY_ACCEPTED",
          "Cotización aceptada es inmutable",
          409,
        );
      }
      // Aplicar descuento como porcentaje sobre el subtotal positivo.
      const subtotalAbs = Math.max(0, before.subtotalCents);
      const newDiscount = Math.round((subtotalAbs * input.discountPct) / 100);
      const taxBase = Math.max(0, subtotalAbs - newDiscount);
      const newTax = Math.round(taxBase * 0.16);
      const newTotal = subtotalAbs - newDiscount + newTax;
      const [after] = await tx
        .update(quotes)
        .set({
          discountPct: input.discountPct,
          discountCents: newDiscount,
          taxCents: newTax,
          totalCents: newTotal,
        })
        .where(
          and(
            eq(quotes.id, input.quoteId),
            eq(quotes.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("quote setDiscount sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "quote",
        entityId: after.id,
        action: "quote.update",
        before: { discountPct: before.discountPct, discountCents: before.discountCents },
        after: {
          discountPct: after.discountPct,
          discountCents: after.discountCents,
          totalCents: after.totalCents,
        },
      });
      return loadQuote(user.organization_id, input.quoteId, tx);
    });
  }

  async function presupuestoWarning(
    ctx: Context,
    input: { quoteId: string },
  ): Promise<PresupuestoWarning> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_comercial", {
      forceDb: true,
    });
    const [row] = await db
      .select({
        presupuesto: quotes.presupuestoDeclaradoCents,
        total: quotes.totalCents,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.id, input.quoteId),
          eq(quotes.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!row) {
      throw new DomainError("QUOTE_NOT_FOUND", "Cotización no encontrada", 404);
    }
    const result = evaluatePresupuestoWarning({
      presupuestoDeclaradoCents: row.presupuesto,
      totalCents: row.total,
    });
    // Si warn=true, auditamos para trazabilidad (sin bloquear).
    if (result.warn) {
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "quote",
        entityId: input.quoteId,
        action: "quote.presupuesto_warning",
        after: {
          warn: true,
          presupuestoCents: result.presupuestoCents,
          totalCents: result.totalCents,
          ratio: result.ratio,
        },
      });
    }
    return result;
  }

  async function transitionStatus(
    ctx: Context,
    quoteId: string,
    target: QuoteStatus,
    auditAction: string,
  ): Promise<QuoteDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_comercial", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(quotes)
        .where(
          and(
            eq(quotes.id, quoteId),
            eq(quotes.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("QUOTE_NOT_FOUND", "Cotización no encontrada", 404);
      }
      if (before.status === "accepted") {
        throw new DomainError(
          "QUOTE_ALREADY_ACCEPTED",
          "Cotización aceptada es inmutable",
          409,
        );
      }
      const [after] = await tx
        .update(quotes)
        .set({ status: target, version: before.version + 1 })
        .where(
          and(
            eq(quotes.id, quoteId),
            eq(quotes.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("quote transition sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "quote",
        entityId: after.id,
        action: auditAction,
        before: { status: before.status },
        after: { status: after.status },
      });
      return loadQuote(user.organization_id, quoteId, tx);
    });
  }

  function assertAcceptanceEvidence(
    fileRow: typeof files.$inferSelect | undefined,
    orgId: string,
  ): void {
    if (!fileRow || fileRow.organizationId !== orgId) {
      throw new DomainError(
        "EVIDENCE_FILE_NOT_FOUND",
        "Archivo de evidencia no encontrado",
        404,
      );
    }
  }

  async function accept(
    ctx: Context,
    input: {
      quoteId: string;
      accepterName: string;
      accepterOrg?: string;
      medium: "email" | "telefono" | "presencial" | "otro";
      evidenceFileId: string;
      notes?: string;
      proxy: boolean;
    },
  ): Promise<QuoteDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    // BR-N237: aceptar requiere `aceptar_cotizacion`.
    await createHasPermissionService().require(ctx, "aceptar_cotizacion", {
      forceDb: true,
    });
    if (!input.accepterName || input.accepterName.trim().length < 1) {
      throw new DomainError(
        "ACCEPTANCE_EVIDENCE_REQUIRED",
        "Identidad del aceptante obligatoria",
        400,
      );
    }
    if (!input.evidenceFileId) {
      throw new DomainError(
        "ACCEPTANCE_EVIDENCE_REQUIRED",
        "Evidencia obligatoria",
        409,
      );
    }
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(quotes)
        .where(
          and(
            eq(quotes.id, input.quoteId),
            eq(quotes.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("QUOTE_NOT_FOUND", "Cotización no encontrada", 404);
      }
      if (before.status === "accepted") {
        throw new DomainError(
          "QUOTE_ALREADY_ACCEPTED",
          "Cotización ya aceptada (inmutable)",
          409,
        );
      }
      // BR-N01 / BR-N235: vigencia vigente.
      const validUntilMs = before.validUntil ? before.validUntil.getTime() : 0;
      if (!validUntilMs || validUntilMs < Date.now()) {
        throw new DomainError(
          "QUOTE_EXPIRED",
          "Cotización expirada o sin vigencia",
          409,
        );
      }
      // BR-N25: 1 aceptada por prospecto.
      if (before.prospectId) {
        const accepted = await tx
          .select({ id: quotes.id })
          .from(quotes)
          .where(
            and(
              eq(quotes.organizationId, user.organization_id),
              eq(quotes.prospectId, before.prospectId),
              eq(quotes.status, "accepted"),
            ),
          )
          .limit(1);
        if (accepted.length > 0 && accepted[0]?.id !== before.id) {
          throw new DomainError(
            "PROSPECT_HAS_ACCEPTED_QUOTE",
            "El prospecto ya tiene una cotización aceptada",
            409,
          );
        }
      }
      // SPEC-027 / ADR-05: conversión prospecto→cliente dentro de la
      // misma transacción. Si la cotización ya tiene `clientId` no se
      // toca. Si `clientId` es null y `prospectId` es real, se
      // reutiliza o crea el cliente del prospecto; cualquier fallo
      // (prospecto inexistente, FK, unique) rollbackea la aceptación
      // completa vía `withTx`.
      let resolvedClientId: string | null = before.clientId;
      if (!before.clientId && before.prospectId) {
        resolvedClientId = await ensureClientForProspect(
          ctx,
          tx,
          user.organization_id,
          before.prospectId,
        );
      }
      // BR-N237: evidencia existe y pertenece a la organización.
      const [fileRow] = await tx
        .select()
        .from(files)
        .where(
          and(
            eq(files.id, input.evidenceFileId),
            eq(files.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      assertAcceptanceEvidence(fileRow, user.organization_id);
      // Insertar `quote_acceptance`.
      const [acceptance] = await tx
        .insert(quoteAcceptances)
        .values({
          organizationId: user.organization_id,
          quoteId: before.id,
          accepterName: input.accepterName,
          accepterOrg: input.accepterOrg ?? null,
          medium: input.medium,
          acceptedAt: new Date(),
          evidenceFileId: input.evidenceFileId,
          proxy: input.proxy,
          registeredBy: user.id,
          notes: input.notes ?? null,
        })
        .returning();
      if (!acceptance) throw new Error("quote_acceptance insert sin fila");
      // Enlazar archivo a la cotización.
      await tx.insert(fileLinks).values({
        organizationId: user.organization_id,
        fileId: input.evidenceFileId,
        entityType: "quote_acceptance",
        entityId: acceptance.id,
      });
      // Cerrar cotización como `accepted`. Si la conversión creó
      // o reutilizó un cliente, se enlaza en el mismo UPDATE para
      // que el DTO devuelto lleve `clientId` (SPEC-027/ADR-05).
      const [after] = await tx
        .update(quotes)
        .set({
          status: "accepted",
          clientId: resolvedClientId,
          acceptedAt: new Date(),
          acceptedByProxy: input.proxy ? "vendedor" : "cliente",
          acceptedByUserId: user.id,
          acceptedEvidenceFileId: input.evidenceFileId,
          version: before.version + 1,
        })
        .where(
          and(
            eq(quotes.id, input.quoteId),
            eq(quotes.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("quote accept sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "quote",
        entityId: after.id,
        action: "quote.accept",
        before: {
          status: before.status,
          clientId: before.clientId,
          prospectId: before.prospectId,
        },
        after: {
          status: after.status,
          acceptedAt: after.acceptedAt,
          acceptedByProxy: after.acceptedByProxy,
          totalCents: after.totalCents,
          clientId: after.clientId,
          clientConverted: !before.clientId && !!resolvedClientId,
        },
        ...(ctx.actorRoleCode !== undefined ? { actorRoleCode: ctx.actorRoleCode } : {}),
      });
      // Side-effect delegado a SPEC-004 (sin implementar fuera de
      // alcance): emitimos `os.create_pending_from_quote` en
      // `audit_logs` con los datos que SPEC-004 consumirá cuando
      // implemente `orders.createFromAcceptedQuote` (BR-N237, BR-N242).
      await createAuditService().record(ctx, {
        entityType: "quote",
        entityId: after.id,
        action: "os.create_pending_from_quote",
        after: {
          quoteId: after.id,
          code: after.code,
          clientId: after.clientId,
          prospectId: after.prospectId,
          tipoCobro: after.tipoCobro,
          requiresInitialPayment: after.requiresInitialPayment === 1,
          totalCents: after.totalCents,
          soldScopeSnapshotRef: `scope_documents/${after.scopeId}`,
          delegatedTo: "SPEC-004 (orders.createFromAcceptedQuote)",
        },
      });
      return loadQuote(user.organization_id, input.quoteId, tx);
    });
  }

  async function cancel(
    ctx: Context,
    input: { quoteId: string; reason?: string },
  ): Promise<QuoteDTO> {
    return transitionStatus(ctx, input.quoteId, "cancelled", "quote.cancel");
  }

  async function expire(
    ctx: Context,
    input: { quoteId: string },
  ): Promise<QuoteDTO> {
    return transitionStatus(ctx, input.quoteId, "expired", "quote.expire");
  }

  async function reject(
    ctx: Context,
    input: { quoteId: string; reason?: string },
  ): Promise<QuoteDTO> {
    return transitionStatus(ctx, input.quoteId, "rejected", "quote.reject");
  }

  async function getById(ctx: Context, quoteId: string): Promise<QuoteDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_comercial", {
      forceDb: true,
    });
    return loadQuote(user.organization_id, quoteId);
  }

  async function listForProspect(
    ctx: Context,
    input: { prospectId: string },
  ): Promise<QuoteDTO[]> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_comercial", {
      forceDb: true,
    });
    const rows = await db
      .select()
      .from(quotes)
      .where(
        and(
          eq(quotes.organizationId, user.organization_id),
          eq(quotes.prospectId, input.prospectId),
        ),
      )
      .orderBy(quotes.createdAt)
      .limit(100);
    const dtos: QuoteDTO[] = [];
    for (const r of rows) {
      const items = await loadItems(user.organization_id, r.id);
      dtos.push(quoteToDto(r, items));
    }
    return dtos;
  }

  return {
    create,
    updateItems,
    send,
    setDiscount,
    presupuestoWarning,
    accept,
    cancel,
    expire,
    reject,
    getById,
    listForProspect,
    calculatePreview,
  };
}
