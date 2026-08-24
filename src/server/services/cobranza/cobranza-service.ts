/**
 * Servicio `cobranza` — SPEC-008 §4.2 (B19, BR-N322-325, BR-N313).
 *
 * Gestiona el ciclo de cobranza (no los cobros; ver `cobros.ts`):
 *  - `activities.create`: llamada/email/promesa/otro (BR-N322).
 *  - `promises.create`: crea la promesa ligada a la actividad.
 *  - `promises.fulfill`: marca cumplida (`fulfilled_at`).
 *  - `escalado.evaluate`: si una factura tiene ≥2 promesas
 *    incumplidas, devuelve el tono (`amable`/`firme`/`final`) y la
 *    plantilla (BR-N313/323, BR-N321).
 *
 * Visibilidad (BR-N207): vendedor no ve CxC de otros.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import {
  collectionActivities,
  collectionPromises,
  invoices,
} from "@/server/db/schema";
import {
  COLLECTION_ACTIVITY_TYPES,
  type CollectionActivityType,
  type EscalationTone,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import type { AuditService } from "@/server/services/audit";
import { createHasPermissionService } from "@/server/services/hasPermission";
import { messages } from "@/shared/utils";
import {
  computeEscalation,
  validateCollectionActivity,
} from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────────────────────────────────────

export interface CollectionActivityDTO {
  id: string;
  organizationId: string;
  clientId: string;
  invoiceId: string | null;
  type: CollectionActivityType;
  notes: string | null;
  promisedAmountCents: number | null;
  promisedDate: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface CollectionPromiseDTO {
  id: string;
  organizationId: string;
  invoiceId: string;
  activityId: string;
  promisedAmountCents: number;
  promisedDate: string;
  count: string;
  fulfilledAt: string | null;
  fulfilledBy: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface EscalationResult {
  invoiceId: string;
  tone: EscalationTone;
  template: string;
  brokenPromises: number;
}

export interface CobranzaService {
  createActivity(
    ctx: Context,
    input: {
      clientId: string;
      invoiceId?: string | null;
      type: CollectionActivityType | string;
      notes?: string | null;
      promisedAmountCents?: number | null;
      promisedDate?: Date | string | null;
      createPromise?: boolean;
    },
  ): Promise<{ activity: CollectionActivityDTO; promise: CollectionPromiseDTO | null }>;
  listActivities(
    ctx: Context,
    opts: {
      limit?: number;
      offset?: number;
      invoiceId?: string;
      clientId?: string;
      type?: CollectionActivityType | string;
    },
  ): Promise<{ items: CollectionActivityDTO[]; total: number }>;
  fulfillPromise(
    ctx: Context,
    input: { promiseId: string },
  ): Promise<CollectionPromiseDTO>;
  listPromises(
    ctx: Context,
    opts: {
      limit?: number;
      offset?: number;
      invoiceId?: string;
      fulfilled?: boolean;
    },
  ): Promise<{ items: CollectionPromiseDTO[]; total: number }>;
  evaluateEscalation(
    ctx: Context,
    input: { invoiceId: string; refDate?: Date | string },
  ): Promise<EscalationResult | null>;
}

export interface CreateCobranzaServiceOptions {
  audit: AuditService;
}

export function createCobranzaService(
  opts: CreateCobranzaServiceOptions,
): CobranzaService {
  const db = getDb();
  const hasPerm = createHasPermissionService();
  const audit = opts.audit;

  function activityToDto(
    r: typeof collectionActivities.$inferSelect,
  ): CollectionActivityDTO {
    return {
      id: r.id,
      organizationId: r.organizationId,
      clientId: r.clientId,
      invoiceId: r.invoiceId,
      type: (COLLECTION_ACTIVITY_TYPES as readonly string[]).includes(r.type)
        ? (r.type as CollectionActivityType)
        : "otro",
      notes: r.notes,
      promisedAmountCents: r.promisedAmountCents,
      promisedDate: r.promisedDate
        ? typeof r.promisedDate === "string"
          ? r.promisedDate
          : new Date(r.promisedDate).toISOString().slice(0, 10)
        : null,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    };
  }

  function promiseToDto(
    r: typeof collectionPromises.$inferSelect,
  ): CollectionPromiseDTO {
    return {
      id: r.id,
      organizationId: r.organizationId,
      invoiceId: r.invoiceId,
      activityId: r.activityId,
      promisedAmountCents: r.promisedAmountCents,
      promisedDate:
        typeof r.promisedDate === "string"
          ? r.promisedDate
          : new Date(r.promisedDate).toISOString().slice(0, 10),
      count: r.count,
      fulfilledAt: r.fulfilledAt?.toISOString() ?? null,
      fulfilledBy: r.fulfilledBy,
      notes: r.notes,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async function createActivity(
    ctx: Context,
    input: {
      clientId: string;
      invoiceId?: string | null;
      type: CollectionActivityType | string;
      notes?: string | null;
      promisedAmountCents?: number | null;
      promisedDate?: Date | string | null;
      createPromise?: boolean;
    },
  ): Promise<{ activity: CollectionActivityDTO; promise: CollectionPromiseDTO | null }> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_cobranza", { forceDb: true });
    const validation = validateCollectionActivity({
      type: input.type,
      promisedAmountCents: input.promisedAmountCents ?? null,
      promisedDate: input.promisedDate ?? null,
    });
    if (!validation.ok) {
      throw new DomainError(validation.code, validation.reason, 400);
    }
    if (input.invoiceId) {
      const [inv] = await db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.id, input.invoiceId),
            eq(invoices.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!inv) {
        throw new DomainError(
          "INVOICE_NOT_FOUND",
          "Factura no encontrada",
          404,
        );
      }
    }
    return withTx(async (tx) => {
      const [actRow] = await tx
        .insert(collectionActivities)
        .values({
          organizationId: user.organization_id,
          clientId: input.clientId,
          invoiceId: input.invoiceId ?? null,
          type: input.type,
          notes: input.notes ?? null,
          promisedAmountCents: input.promisedAmountCents ?? null,
          promisedDate: input.promisedDate
            ? typeof input.promisedDate === "string"
              ? input.promisedDate
              : input.promisedDate.toISOString().slice(0, 10)
            : null,
          createdBy: user.id,
        })
        .returning();
      if (!actRow) throw new Error("collection_activities insert sin fila");
      let promise: CollectionPromiseDTO | null = null;
      if (input.type === "promesa" && input.createPromise && input.invoiceId) {
        const [pRow] = await tx
          .insert(collectionPromises)
          .values({
            organizationId: user.organization_id,
            invoiceId: input.invoiceId,
            activityId: actRow.id,
            promisedAmountCents: input.promisedAmountCents ?? 0,
            promisedDate: input.promisedDate
              ? typeof input.promisedDate === "string"
                ? input.promisedDate
                : input.promisedDate.toISOString().slice(0, 10)
              : new Date().toISOString().slice(0, 10),
            count: "0",
            notes: input.notes ?? null,
            createdBy: user.id,
          })
          .returning();
        if (!pRow) throw new Error("collection_promises insert sin fila");
        promise = promiseToDto(pRow);
        await audit.record(ctx, {
          entityType: "promise",
          entityId: pRow.id,
          action: "promesa.create",
          after: {
            invoiceId: pRow.invoiceId,
            promisedAmountCents: pRow.promisedAmountCents,
            promisedDate: pRow.promisedDate,
          },
        });
      }
      await audit.record(ctx, {
        entityType: "collection_activity",
        entityId: actRow.id,
        action: "cobro.register",
        after: {
          clientId: actRow.clientId,
          invoiceId: actRow.invoiceId,
          type: actRow.type,
          notes: actRow.notes,
          promisedAmountCents: actRow.promisedAmountCents,
          promisedDate: actRow.promisedDate,
        },
      });
      return { activity: activityToDto(actRow), promise };
    });
  }

  async function listActivities(
    ctx: Context,
    opts: {
      limit?: number;
      offset?: number;
      invoiceId?: string;
      clientId?: string;
      type?: CollectionActivityType | string;
    } = {},
  ): Promise<{ items: CollectionActivityDTO[]; total: number }> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_cobranza", { forceDb: true }).catch(async () => {
      await hasPerm.require(ctx, "ver_cxc_otros", { forceDb: true });
    });
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const where = [eq(collectionActivities.organizationId, user.organization_id)];
    if (opts.invoiceId) where.push(eq(collectionActivities.invoiceId, opts.invoiceId));
    if (opts.clientId) where.push(eq(collectionActivities.clientId, opts.clientId));
    if (opts.type) {
      if (!(COLLECTION_ACTIVITY_TYPES as readonly string[]).includes(opts.type)) {
        throw new DomainError("INVOICE_BUILD_INVALID", "Tipo inválido", 400);
      }
      where.push(eq(collectionActivities.type, opts.type));
    }
    const cxcOtros = await hasPerm.has(ctx, "ver_cxc_otros", { forceDb: true });
    if (!cxcOtros) {
      where.push(eq(collectionActivities.createdBy, user.id));
    }
    const [totalRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(collectionActivities)
      .where(and(...where));
    const rows = await db
      .select()
      .from(collectionActivities)
      .where(and(...where))
      .orderBy(desc(collectionActivities.createdAt))
      .limit(limit)
      .offset(offset);
    return { items: rows.map(activityToDto), total: totalRow?.c ?? 0 };
  }

  async function fulfillPromise(
    ctx: Context,
    input: { promiseId: string },
  ): Promise<CollectionPromiseDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_cobranza", { forceDb: true });
    return withTx(async (tx) => {
      const [row] = await tx
        .select()
        .from(collectionPromises)
        .where(
          and(
            eq(collectionPromises.id, input.promiseId),
            eq(collectionPromises.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!row) {
        throw new DomainError(
          "COLLECTION_PROMISE_NOT_FOUND",
          "Promesa no encontrada",
          404,
        );
      }
      if (row.fulfilledAt) {
        return promiseToDto(row);
      }
      const [updated] = await tx
        .update(collectionPromises)
        .set({
          fulfilledAt: new Date(),
          fulfilledBy: user.id,
          count: "0",
        })
        .where(
          and(
            eq(collectionPromises.id, row.id),
            eq(collectionPromises.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!updated) throw new Error("collection_promises update sin fila");
      await audit.record(ctx, {
        entityType: "promise",
        entityId: updated.id,
        action: "promesa.fulfill",
        before: { fulfilledAt: row.fulfilledAt, count: row.count },
        after: { fulfilledAt: updated.fulfilledAt?.toISOString() },
      });
      return promiseToDto(updated);
    });
  }

  async function listPromises(
    ctx: Context,
    opts: {
      limit?: number;
      offset?: number;
      invoiceId?: string;
      fulfilled?: boolean;
    } = {},
  ): Promise<{ items: CollectionPromiseDTO[]; total: number }> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_cobranza", { forceDb: true }).catch(async () => {
      await hasPerm.require(ctx, "ver_cxc_otros", { forceDb: true });
    });
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const where = [eq(collectionPromises.organizationId, user.organization_id)];
    if (opts.invoiceId) {
      where.push(eq(collectionPromises.invoiceId, opts.invoiceId));
    }
    if (opts.fulfilled === true) {
      where.push(sql`${collectionPromises.fulfilledAt} IS NOT NULL`);
    } else if (opts.fulfilled === false) {
      where.push(sql`${collectionPromises.fulfilledAt} IS NULL`);
    }
    const [totalRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(collectionPromises)
      .where(and(...where));
    const rows = await db
      .select()
      .from(collectionPromises)
      .where(and(...where))
      .orderBy(asc(collectionPromises.promisedDate))
      .limit(limit)
      .offset(offset);
    return { items: rows.map(promiseToDto), total: totalRow?.c ?? 0 };
  }

  async function evaluateEscalation(
    ctx: Context,
    input: { invoiceId: string; refDate?: Date | string },
  ): Promise<EscalationResult | null> {
    const user = requireUser(ctx);
    const ref = input.refDate
      ? typeof input.refDate === "string"
        ? new Date(input.refDate)
        : input.refDate
      : new Date();
    const refIso = ref.toISOString().slice(0, 10);
    const rows = await db
      .select({ date: collectionPromises.promisedDate, fulfilledAt: collectionPromises.fulfilledAt })
      .from(collectionPromises)
      .where(
        and(
          eq(collectionPromises.organizationId, user.organization_id),
          eq(collectionPromises.invoiceId, input.invoiceId),
        ),
      );
    const broken = rows.filter(
      (r: { date: string; fulfilledAt: Date | null }) =>
        r.fulfilledAt === null &&
        new Date(r.date).toISOString().slice(0, 10) < refIso,
    ).length;
    const esc = computeEscalation({ brokenPromisesCount: broken });
    if (!esc) return null;
    const plantilla = (messages as unknown as { cobranza?: { plantilla?: Record<string, string> } }).cobranza?.plantilla;
    const template = plantilla?.[esc.tone] ?? plantilla?.amable ?? "";
    await audit.record(ctx, {
      entityType: "invoice",
      entityId: input.invoiceId,
      action: "escalado.trigger",
      after: { tone: esc.tone, brokenPromises: broken },
    });
    return { invoiceId: input.invoiceId, tone: esc.tone, template, brokenPromises: broken };
  }

  return {
    createActivity,
    listActivities,
    fulfillPromise,
    listPromises,
    evaluateEscalation,
  };
}
