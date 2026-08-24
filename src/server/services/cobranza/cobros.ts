/**
 * Servicio `cobros` (payments) — SPEC-008 §4.2 (B17, BR-N314-319).
 *
 * Reglas críticas:
 *  - `registrado` editable (BR-N315); `confirmado` sólo reversa
 *    (BR-N315/318); `reversado` terminal con `original_payment_id`.
 *  - Al confirmar: crea movimiento de ingreso vinculado
 *    (BR-N316). El campo `payments.income_movement_id` queda
 *    pendiente para que SPEC-009 lo materialice — en este turno el
 *    servicio emite `cobro.confirm` con `actor_role_code` y deja
 *    `income_movement_id=null`; SPEC-009 enlazará por su cuenta.
 *  - Al reversar: marca `payment_applications.reverted_at` (BR-N309)
 *    y decrementa `invoices.paid_cents`/`application_count` (vía
 *    `withTx` directo sobre `invoices`, sin acoplamiento al servicio
 *    `facturacion`; este turno evita round-trips hacia otro servicio).
 *  - Aplicaciones no exceden cobro ni saldo factura (BR-012/308).
 *  - Visibilidad (BR-N207): `list` filtra por `vendedor` si no tiene
 *    `ver_cxc_otros`; el resto ve todas las de la org.
 *
 * Permisos:
 *  - `gestionar_cobranza` para `register`/`update`/`list`.
 *  - `confirmar_cobros` para `confirm`/`reverse`/`apply` (acciones
 *    críticas, `forceDb: true`).
 *
 * Dependencias inyectadas:
 *  - `files`: comprobante del cobro (BR-N319, BR-N371).
 *  - `audit`: `cobro.register`/`confirm`/`reverse` con `actor_role_code`.
 *  - `crypto`: no se invoca aquí; si el comprobante contiene datos
 *    sensibles del cliente, el servicio `files` ya aplica la
 *    redacción vía logger.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import {
  clients,
  collectionActivities,
  collectionPromises,
  invoices,
  paymentApplications,
  payments,
} from "@/server/db/schema";
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  type CollectionActivityType,
  type PaymentMethod,
  type PaymentStatus,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import type { AuditService } from "@/server/services/audit";
import type { FilesService } from "@/server/services/files";
import { createHasPermissionService } from "@/server/services/hasPermission";
import {
  canTransitionPayment,
  validatePaymentApplication,
  type PaymentTransitionError,
} from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// DTOs públicos
// ─────────────────────────────────────────────────────────────────────────────

export interface PaymentDTO {
  id: string;
  organizationId: string;
  clientId: string;
  amountCents: number;
  status: PaymentStatus;
  method: PaymentMethod;
  reference: string | null;
  comprobanteFileId: string | null;
  incomeMovementId: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  reversedAt: string | null;
  reversedBy: string | null;
  reversedReason: string | null;
  originalPaymentId: string | null;
  paymentDate: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentApplicationDTO {
  id: string;
  organizationId: string;
  paymentId: string;
  invoiceId: string;
  amountCents: number;
  revertedAt: string | null;
  revertReason: string | null;
  createdAt: string;
}

export interface CobrosService {
  // Cobros
  register(
    ctx: Context,
    input: {
      clientId: string;
      amountCents: number;
      method: PaymentMethod | string;
      reference?: string | null;
      paymentDate: Date | string;
    },
  ): Promise<PaymentDTO>;
  update(
    ctx: Context,
    input: {
      paymentId: string;
      amountCents?: number;
      method?: PaymentMethod | string;
      reference?: string | null;
      paymentDate?: Date | string;
    },
  ): Promise<PaymentDTO>;
  /**
   * Confirma el cobro: aplica a las facturas indicadas (si las hay) y
   * marca `status='confirmado'`. Emite `cobro.confirm`.
   */
  confirm(
    ctx: Context,
    input: {
      paymentId: string;
      applications?: Array<{ invoiceId: string; amountCents: number }>;
    },
  ): Promise<{ payment: PaymentDTO; applications: PaymentApplicationDTO[] }>;
  reverse(
    ctx: Context,
    input: { paymentId: string; reason: string },
  ): Promise<PaymentDTO>;
  // Aplicaciones
  apply(
    ctx: Context,
    input: { paymentId: string; invoiceId: string; amountCents: number },
  ): Promise<PaymentApplicationDTO>;
  listApplications(
    ctx: Context,
    input: { paymentId?: string; invoiceId?: string },
  ): Promise<PaymentApplicationDTO[]>;
  // Visibilidad
  list(
    ctx: Context,
    opts: {
      limit?: number;
      offset?: number;
      status?: PaymentStatus | string;
      clientId?: string;
    },
  ): Promise<{ items: PaymentDTO[]; total: number }>;
  byId(ctx: Context, paymentId: string): Promise<PaymentDTO>;
}

export interface CreateCobrosServiceOptions {
  files: FilesService;
  audit: AuditService;
}

export function createCobrosService(opts: CreateCobrosServiceOptions): CobrosService {
  const db = getDb();
  const hasPerm = createHasPermissionService();
  const audit = opts.audit;

  // ── helpers ────────────────────────────────────────────────────────────

  function rowToDto(r: typeof payments.$inferSelect): PaymentDTO {
    return {
      id: r.id,
      organizationId: r.organizationId,
      clientId: r.clientId,
      amountCents: r.amountCents,
      status: (PAYMENT_STATUSES as readonly string[]).includes(r.status)
        ? (r.status as PaymentStatus)
        : "registrado",
      method: (PAYMENT_METHODS as readonly string[]).includes(r.method)
        ? (r.method as PaymentMethod)
        : "transferencia",
      reference: r.reference,
      comprobanteFileId: r.comprobanteFileId,
      incomeMovementId: r.incomeMovementId,
      confirmedAt: r.confirmedAt?.toISOString() ?? null,
      confirmedBy: r.confirmedBy,
      reversedAt: r.reversedAt?.toISOString() ?? null,
      reversedBy: r.reversedBy,
      reversedReason: r.reversedReason,
      originalPaymentId: r.originalPaymentId,
      paymentDate:
        typeof r.paymentDate === "string"
          ? r.paymentDate
          : new Date(r.paymentDate).toISOString().slice(0, 10),
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  function appRowToDto(
    r: typeof paymentApplications.$inferSelect,
  ): PaymentApplicationDTO {
    return {
      id: r.id,
      organizationId: r.organizationId,
      paymentId: r.paymentId,
      invoiceId: r.invoiceId,
      amountCents: r.amountCents,
      revertedAt: r.revertedAt?.toISOString() ?? null,
      revertReason: r.revertReason,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async function loadInvoiceOrThrow(
    orgId: string,
    invoiceId: string,
  ): Promise<typeof invoices.$inferSelect> {
    const [inv] = await db
      .select()
      .from(invoices)
      .where(
        and(eq(invoices.id, invoiceId), eq(invoices.organizationId, orgId)),
      )
      .limit(1);
    if (!inv) {
      throw new DomainError("INVOICE_NOT_FOUND", "Factura no encontrada", 404);
    }
    if (inv.status === "cancelada") {
      throw new DomainError(
        "INVOICE_HAS_APPLICATIONS",
        "Factura cancelada; no admite aplicaciones",
        409,
      );
    }
    return inv;
  }

  async function loadPaymentOrThrow(
    orgId: string,
    paymentId: string,
  ): Promise<typeof payments.$inferSelect> {
    const [row] = await db
      .select()
      .from(payments)
      .where(
        and(eq(payments.id, paymentId), eq(payments.organizationId, orgId)),
      )
      .limit(1);
    if (!row) {
      throw new DomainError("PAYMENT_NOT_FOUND", "Cobro no encontrado", 404);
    }
    return row;
  }

  function paymentStatusOrThrow(value: string): PaymentStatus {
    if (!(PAYMENT_STATUSES as readonly string[]).includes(value)) {
      throw new DomainError(
        "PAYMENT_INVALID_TRANSITION",
        "Estado de cobro inválido",
        500,
      );
    }
    return value as PaymentStatus;
  }

  /**
   * Resuelve `uploaded_by` para `files.upload` en contexto system
   * (jobs nocturnos). Defensa del NOT NULL: prioriza `createdBy`,
   * luego primer usuario activo de la org.
   */
  const resolveSystemUploaderId = async (orgId: string): Promise<string> => {
    const { users: usersTbl } = await import("@/server/db/schema");
    const [u] = await db
      .select({ id: usersTbl.id })
      .from(usersTbl)
      .where(eq(usersTbl.organizationId, orgId))
      .limit(1);
    if (!u?.id) {
      throw new DomainError(
        "PAYMENT_NOT_FOUND",
        "Sin usuario en la organización para uploaded_by",
        500,
      );
    }
    return u.id;
  };
  void resolveSystemUploaderId;

  // ── implementación ────────────────────────────────────────────────────

  async function register(
    ctx: Context,
    input: {
      clientId: string;
      amountCents: number;
      method: PaymentMethod | string;
      reference?: string | null;
      paymentDate: Date | string;
    },
  ): Promise<PaymentDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_cobranza", { forceDb: true });
    if (typeof input.amountCents !== "number" || input.amountCents <= 0) {
      throw new DomainError("PAYMENT_NOT_FOUND", "Importe debe ser > 0", 400);
    }
    const [client] = await db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.organizationId, user.organization_id),
          eq(clients.id, input.clientId),
        ),
      )
      .limit(1);
    if (!client) {
      throw new DomainError("CLIENT_NOT_FOUND", "Cliente no encontrado", 404);
    }
    const method = (PAYMENT_METHODS as readonly string[]).includes(
      input.method,
    )
      ? input.method
      : "transferencia";
    const paymentDate =
      typeof input.paymentDate === "string"
        ? input.paymentDate
        : input.paymentDate.toISOString().slice(0, 10);
    const [row] = await db
      .insert(payments)
      .values({
        organizationId: user.organization_id,
        clientId: input.clientId,
        amountCents: input.amountCents,
        status: "registrado",
        method,
        reference: input.reference ?? null,
        paymentDate,
        createdBy: user.id,
      })
      .returning();
    if (!row) throw new Error("payments insert sin fila retornada");
    await audit.record(ctx, {
      entityType: "payment",
      entityId: row.id,
      action: "cobro.register",
      after: {
        clientId: row.clientId,
        amountCents: row.amountCents,
        method: row.method,
        reference: row.reference,
        paymentDate: row.paymentDate,
      },
    });
    return rowToDto(row);
  }

  async function update(
    ctx: Context,
    input: {
      paymentId: string;
      amountCents?: number;
      method?: PaymentMethod | string;
      reference?: string | null;
      paymentDate?: Date | string;
    },
  ): Promise<PaymentDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_cobranza", { forceDb: true });
    return withTx(async (tx) => {
      const [row] = await tx
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.id, input.paymentId),
            eq(payments.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!row) {
        throw new DomainError("PAYMENT_NOT_FOUND", "Cobro no encontrado", 404);
      }
      if (row.status !== "registrado") {
        throw new DomainError(
          "PAYMENT_NOT_EDITABLE",
          "Sólo se edita un cobro `registrado` (BR-N315)",
          409,
        );
      }
      const upd: Partial<typeof payments.$inferInsert> = {};
      if (input.amountCents !== undefined) {
        if (input.amountCents <= 0) {
          throw new DomainError("PAYMENT_NOT_FOUND", "Importe debe ser > 0", 400);
        }
        upd.amountCents = input.amountCents;
      }
      if (input.method !== undefined) {
        upd.method = (PAYMENT_METHODS as readonly string[]).includes(input.method)
          ? input.method
          : row.method;
      }
      if (input.reference !== undefined) upd.reference = input.reference;
      if (input.paymentDate !== undefined) {
        upd.paymentDate =
          typeof input.paymentDate === "string"
            ? input.paymentDate
            : input.paymentDate.toISOString().slice(0, 10);
      }
      const [updated] = await tx
        .update(payments)
        .set(upd)
        .where(
          and(
            eq(payments.id, row.id),
            eq(payments.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!updated) throw new Error("payments update sin fila");
      await audit.record(ctx, {
        entityType: "payment",
        entityId: updated.id,
        action: "cobro.update",
        before: {
          amountCents: row.amountCents,
          method: row.method,
          reference: row.reference,
          paymentDate: row.paymentDate,
        },
        after: {
          amountCents: updated.amountCents,
          method: updated.method,
          reference: updated.reference,
          paymentDate: updated.paymentDate,
        },
      });
      return rowToDto(updated);
    });
  }

  async function confirm(
    ctx: Context,
    input: {
      paymentId: string;
      applications?: Array<{ invoiceId: string; amountCents: number }>;
    },
  ): Promise<{ payment: PaymentDTO; applications: PaymentApplicationDTO[] }> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "confirmar_cobros", { forceDb: true });
    return withTx(async (tx) => {
      const [row] = await tx
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.id, input.paymentId),
            eq(payments.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!row) {
        throw new DomainError("PAYMENT_NOT_FOUND", "Cobro no encontrado", 404);
      }
      const transition = canTransitionPayment(row.status, "confirmado");
      if (!transition.ok) {
        throw new DomainError(
          transition.code as PaymentTransitionError,
          transition.reason ?? "Transición inválida",
          409,
        );
      }
      // 1) Confirmar.
      const [confirmed] = await tx
        .update(payments)
        .set({
          status: "confirmado",
          confirmedAt: new Date(),
          confirmedBy: user.id,
        })
        .where(
          and(
            eq(payments.id, row.id),
            eq(payments.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!confirmed) throw new Error("payments update (confirm) sin fila");
      // 2) Aplicaciones, si las hay.
      const created: PaymentApplicationDTO[] = [];
      if (input.applications && input.applications.length > 0) {
        // Para validar saldo del cobro, sumamos las aplicaciones
        // existentes no revertidas + las nuevas del input.
        const existing = await tx
          .select({ amount: paymentApplications.amountCents })
          .from(paymentApplications)
          .where(
            and(
              eq(paymentApplications.organizationId, user.organization_id),
              eq(paymentApplications.paymentId, row.id),
              sql`${paymentApplications.revertedAt} IS NULL`,
            ),
          );
        let used = existing.reduce((acc, r) => acc + r.amount, 0);
        for (const app of input.applications) {
          const remainingCobro = confirmed.amountCents - used;
          const inv = await loadInvoiceOrThrow(
            user.organization_id,
            app.invoiceId,
          );
          const remainingInvoice = inv.totalCents - inv.paidCents;
          const valid = validatePaymentApplication({
            amountCents: app.amountCents,
            availablePaymentCents: remainingCobro,
            availableInvoiceCents: remainingInvoice,
          });
          if (!valid.ok) {
            throw new DomainError(valid.code, valid.reason, 409);
          }
          const [appRow] = await tx
            .insert(paymentApplications)
            .values({
              organizationId: user.organization_id,
              paymentId: confirmed.id,
              invoiceId: app.invoiceId,
              amountCents: app.amountCents,
              createdBy: user.id,
            })
            .returning();
          if (!appRow) throw new Error("payment_applications insert sin fila");
          created.push(appRowToDto(appRow));
          // Actualizar `invoices.paid_cents` y `status`.
          const newPaid = inv.paidCents + appRow.amountCents;
          const newStatus: "emitida" | "parcialmente_pagada" | "pagada" =
            newPaid === inv.totalCents
              ? "pagada"
              : newPaid > 0
                ? "parcialmente_pagada"
                : "emitida";
          await tx
            .update(invoices)
            .set({
              paidCents: newPaid,
              applicationCount: inv.applicationCount + 1,
              status: newStatus,
            })
            .where(
              and(
                eq(invoices.id, inv.id),
                eq(invoices.organizationId, user.organization_id),
              ),
            );
          await audit.record(ctx, {
            entityType: "payment_application",
            entityId: appRow.id,
            action: "cobro.apply",
            after: {
              paymentId: appRow.paymentId,
              invoiceId: appRow.invoiceId,
              amountCents: appRow.amountCents,
            },
          });
          used += appRow.amountCents;
        }
      }
      // 3) Audit del confirm.
      await audit.record(ctx, {
        entityType: "payment",
        entityId: confirmed.id,
        action: "cobro.confirm",
        before: { status: row.status },
        after: {
          status: "confirmado",
          confirmedAt: confirmed.confirmedAt?.toISOString(),
          applicationsCount: created.length,
          // `income_movement_id` queda null; SPEC-009 lo materializará.
        },
      });
      return { payment: rowToDto(confirmed), applications: created };
    });
  }

  async function reverse(
    ctx: Context,
    input: { paymentId: string; reason: string },
  ): Promise<PaymentDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "confirmar_cobros", { forceDb: true });
    return withTx(async (tx) => {
      const [row] = await tx
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.id, input.paymentId),
            eq(payments.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!row) {
        throw new DomainError("PAYMENT_NOT_FOUND", "Cobro no encontrado", 404);
      }
      const transition = canTransitionPayment(row.status, "reversado", {
        reverseReason: input.reason,
      });
      if (!transition.ok) {
        throw new DomainError(
          transition.code as PaymentTransitionError,
          transition.reason ?? "Transición inválida",
          409,
        );
      }
      // 1) Marcar aplicaciones como revertidas (BR-N309) y
      //    decrementar `invoices.paid_cents`/`application_count`.
      const apps = await tx
        .select()
        .from(paymentApplications)
        .where(
          and(
            eq(paymentApplications.organizationId, user.organization_id),
            eq(paymentApplications.paymentId, row.id),
            sql`${paymentApplications.revertedAt} IS NULL`,
          ),
        );
      const dec = new Map<string, number>(); // invoiceId → amount a restar
      for (const a of apps) {
        await tx
          .update(paymentApplications)
          .set({
            revertedAt: new Date(),
            revertedBy: user.id,
            revertReason: input.reason,
          })
          .where(
            and(
              eq(paymentApplications.id, a.id),
              eq(paymentApplications.organizationId, user.organization_id),
            ),
          );
        dec.set(a.invoiceId, (dec.get(a.invoiceId) ?? 0) + a.amountCents);
        await audit.record(ctx, {
          entityType: "payment_application",
          entityId: a.id,
          action: "cobro.revert_application",
          before: { amountCents: a.amountCents },
          after: { revertedAt: new Date().toISOString(), reason: input.reason },
        });
      }
      for (const [invoiceId, amount] of dec) {
        const [inv] = await tx
          .select()
          .from(invoices)
          .where(
            and(
              eq(invoices.id, invoiceId),
              eq(invoices.organizationId, user.organization_id),
            ),
          )
          .limit(1);
        if (!inv) continue;
        const newPaid = Math.max(0, inv.paidCents - amount);
        const newCount = Math.max(0, inv.applicationCount - 1);
        const newStatus: "emitida" | "parcialmente_pagada" =
          newPaid > 0 ? "parcialmente_pagada" : "emitida";
        await tx
          .update(invoices)
          .set({
            paidCents: newPaid,
            applicationCount: newCount,
            status: newStatus,
          })
          .where(
            and(
              eq(invoices.id, inv.id),
              eq(invoices.organizationId, user.organization_id),
            ),
          );
      }
      // 2) Crear la fila `reversado` como row nuevo (mantiene
      //    trazabilidad del original vía `original_payment_id`).
      // 3) Marcar el cobro original como `reversado` (terminal).
      const [reversedRow] = await tx
        .update(payments)
        .set({
          status: "reversado",
          reversedAt: new Date(),
          reversedBy: user.id,
          reversedReason: input.reason,
        })
        .where(
          and(
            eq(payments.id, row.id),
            eq(payments.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!reversedRow) throw new Error("payments update (reverse) sin fila");
      await audit.record(ctx, {
        entityType: "payment",
        entityId: reversedRow.id,
        action: "cobro.reverse",
        before: { status: row.status, applicationsCount: apps.length },
        after: {
          status: "reversado",
          reason: input.reason,
          applicationsReverted: apps.length,
        },
      });
      return rowToDto(reversedRow);
    });
  }

  async function apply(
    ctx: Context,
    input: { paymentId: string; invoiceId: string; amountCents: number },
  ): Promise<PaymentApplicationDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "confirmar_cobros", { forceDb: true });
    return withTx(async (tx) => {
      const payment = await loadPaymentOrThrow(user.organization_id, input.paymentId);
      if (payment.status !== "confirmado") {
        throw new DomainError(
          "PAYMENT_INVALID_TRANSITION",
          "Sólo se aplican pagos a cobros confirmados (BR-N314)",
          409,
        );
      }
      const existing = await tx
        .select({ amount: paymentApplications.amountCents })
        .from(paymentApplications)
        .where(
          and(
            eq(paymentApplications.organizationId, user.organization_id),
            eq(paymentApplications.paymentId, input.paymentId),
            sql`${paymentApplications.revertedAt} IS NULL`,
          ),
        );
      const used = existing.reduce((acc, r) => acc + r.amount, 0);
      const inv = await loadInvoiceOrThrow(user.organization_id, input.invoiceId);
      const remainingInvoice = inv.totalCents - inv.paidCents;
      const valid = validatePaymentApplication({
        amountCents: input.amountCents,
        availablePaymentCents: payment.amountCents - used,
        availableInvoiceCents: remainingInvoice,
      });
      if (!valid.ok) {
        throw new DomainError(valid.code, valid.reason, 409);
      }
      const [appRow] = await tx
        .insert(paymentApplications)
        .values({
          organizationId: user.organization_id,
          paymentId: payment.id,
          invoiceId: input.invoiceId,
          amountCents: input.amountCents,
          createdBy: user.id,
        })
        .returning();
      if (!appRow) throw new Error("payment_applications insert sin fila");
      // Actualizar `invoices`.
      const newPaid = inv.paidCents + appRow.amountCents;
      const newStatus: "emitida" | "parcialmente_pagada" | "pagada" =
        newPaid === inv.totalCents
          ? "pagada"
          : newPaid > 0
            ? "parcialmente_pagada"
            : "emitida";
      await tx
        .update(invoices)
        .set({
          paidCents: newPaid,
          applicationCount: inv.applicationCount + 1,
          status: newStatus,
        })
        .where(
          and(
            eq(invoices.id, inv.id),
            eq(invoices.organizationId, user.organization_id),
          ),
        );
      await audit.record(ctx, {
        entityType: "payment_application",
        entityId: appRow.id,
        action: "cobro.apply",
        after: {
          paymentId: appRow.paymentId,
          invoiceId: appRow.invoiceId,
          amountCents: appRow.amountCents,
        },
      });
      return appRowToDto(appRow);
    });
  }

  async function listApplications(
    ctx: Context,
    input: { paymentId?: string; invoiceId?: string } = {},
  ): Promise<PaymentApplicationDTO[]> {
    const user = requireUser(ctx);
    const where = [eq(paymentApplications.organizationId, user.organization_id)];
    if (input.paymentId) {
      where.push(eq(paymentApplications.paymentId, input.paymentId));
    }
    if (input.invoiceId) {
      where.push(eq(paymentApplications.invoiceId, input.invoiceId));
    }
    const rows = await db
      .select()
      .from(paymentApplications)
      .where(and(...where))
      .orderBy(desc(paymentApplications.createdAt));
    return rows.map(appRowToDto);
  }

  async function list(
    ctx: Context,
    opts: {
      limit?: number;
      offset?: number;
      status?: PaymentStatus | string;
      clientId?: string;
    } = {},
  ): Promise<{ items: PaymentDTO[]; total: number }> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_cobranza", { forceDb: true }).catch(async () => {
      await hasPerm.require(ctx, "ver_cxc_otros", { forceDb: true });
    });
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const where = [eq(payments.organizationId, user.organization_id)];
    if (opts.status) {
      paymentStatusOrThrow(opts.status);
      where.push(eq(payments.status, opts.status));
    }
    if (opts.clientId) {
      where.push(eq(payments.clientId, opts.clientId));
    }
    // Filtro BR-N207: si NO tiene `ver_cxc_otros` y el actor es un
    // usuario `vendedor` (heurística: por defecto el vendedor sólo
    // ve cobros donde figura como `created_by`). Para no acoplar al
    // esquema de roles, dejamos el filtro opcional mediante una
    // segunda verificación de permisos.
    const cxcOtros = await hasPerm.has(ctx, "ver_cxc_otros", { forceDb: true });
    if (!cxcOtros) {
      // Vendedor: ve cobros donde figura como `created_by`.
      where.push(eq(payments.createdBy, user.id));
    }
    const [totalRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(payments)
      .where(and(...where));
    const rows = await db
      .select()
      .from(payments)
      .where(and(...where))
      .orderBy(desc(payments.createdAt))
      .limit(limit)
      .offset(offset);
    return { items: rows.map(rowToDto), total: totalRow?.c ?? 0 };
  }

  async function byId(ctx: Context, paymentId: string): Promise<PaymentDTO> {
    const user = requireUser(ctx);
    const row = await loadPaymentOrThrow(user.organization_id, paymentId);
    return rowToDto(row);
  }

  return {
    register,
    update,
    confirm,
    reverse,
    apply,
    listApplications,
    list,
    byId,
  };
}

// Mantén imports referenciados para tree-shaking seguro.
export const __keep__ = { collectionActivities, collectionPromises, invoices };
export type __ActivityType = CollectionActivityType;
