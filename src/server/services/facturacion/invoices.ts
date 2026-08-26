/**
 * Servicio `invoices` — SPEC-007 §4.2 (B18, BR-N301..N309/BR-N406).
 *
 * Responsabilidades:
 *  - `build(ctx, orderId|renewal)`: arma el comprobante CFDI 4.0 desde
 *    la OS o suscripción, persiste la fila en `borrador` y devuelve
 *    DTO (incluye preview BR-N303). NO envía al PAC.
 *  - `timbrar(ctx, invoiceId)`: envía al PAC (mock por ahora P-007-1),
 *    guarda `cfdi_uuid`+XML+PDF en `files`, marca `status='emitida'`
 *    y emite audit `factura.timbrar` (BR-N304/336). Fail-closed si
 *    CSD/API key ausentes (BR-N302).
 *  - `cancel(ctx, invoiceId, motivoSAT, reason)`: exige motivo SAT
 *    01-04 (BR-N305), sin aplicaciones pendientes (BR-N309), envía al
 *    PAC, marca `cancelada`, audita (BR-N336).
 *  - `applyPayment` / `revertPayment` / `listApplications` (compat con
 *    SPEC-008, BR-012/308). Implementación mínima local: el servicio
 *    expone el contrato para SPEC-008.
 *  - `markVencida(ctx, refDate)`: job que recorre facturas no terminales
 *    con saldo y `due_date < refDate` y las marca `vencida` (BR-N307).
 *  - `zipContador(ctx, year, month, manual)`: arma buffer ZIP con
 *    XML+PDF de facturas activas (no canceladas) del mes. Modo `auto`
 *    (cierre) o `manual` (Director, BR-N311, DEC-FUN-38/26).
 *  - `createDraftFromSubscriptionRenewal(ctx, input)`: consumido por
 *    SPEC-011; crea factura en `borrador` (BR-N406, DEC-FUN-67).
 *  - `preview(ctx, invoiceId)`: devuelve el DTO completo de borrador
 *    para que la UI lo muestre antes de timbrar (BR-N303).
 *
 * Side-effects:
 *  - `cfdi_uuid` UNIQUE por organización (defensa contra duplicación).
 *  - Audit en `factura.*` y `invoice_schedule.*` (BR-N336).
 *  - File uploads auditados en `file.upload` (BR-N372).
 *
 * Permisos:
 *  - `gestionar_facturacion` para build/preview/zip/list. AC-81/BR-N201.
 *  - `timbrar_facturas` para timbrar/cancelar (acción crítica,
 *    revalidación contra BD).
 *
 * Dependencias inyectadas (AC-27):
 *  - `crypto`: para descifrar CSD/API key al timbrar (ADR-03 §3.1).
 *  - `files`: para subir XML/PDF (BR-N371).
 *  - `pac`: adaptador PAC (mock por ahora P-007-1).
 *  - `jobs`: para jobs recurrentes idempotentes (SPEC-001 AC-15).
 *  - `audit`: para `audit_logs`.
 */
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import {
  clients,
  clientFiscalData,
  invoiceSchedules,
  invoices,
  organizationFiscalConfig,
} from "@/server/db/schema";
import {
  CANCEL_MOTIVES_SAT,
  INVOICE_STATUSES,
  type CancelMotiveSat,
  type InvoiceStatus,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import { buildAad } from "@/shared/zod";
import type { Context } from "@/shared/zod";
import type { CryptoService } from "@/server/services/crypto";
import type { FilesService } from "@/server/services/files";
import type { JobsService } from "@/server/services/jobs";
import type { AuditService } from "@/server/services/audit";
import { createHasPermissionService } from "@/server/services/hasPermission";
import {
  createPacClient,
  type PacClient,
  type PacReceptor,
} from "@/server/integrations/pac";
import {
  buildCfdiConcept,
  buildDraftFromSubscriptionRenewal,
  canTransitionInvoice,
  isInvoiceVencida,
  isValidCancelMotive,
  isValidCfdiUuid,
  nextScheduleJobKey,
  selectZipFacturas,
  validateCancelReason,
  validateScheduleInput,
  type CfdiConceptInput,
  type CfdiTotals,
} from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// DTOs públicos
// ─────────────────────────────────────────────────────────────────────────────

export interface InvoiceDTO {
  id: string;
  organizationId: string;
  code: string;
  orderId: string | null;
  subscriptionId: string | null;
  clientId: string;
  status: InvoiceStatus;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  applicationCount: number;
  dueDate: string; // ISO date
  cfdiUuid: string | null;
  xmlFileId: string | null;
  pdfFileId: string | null;
  issuedAt: string | null;
  cancelledAt: string | null;
  cancelMotiveSat: CancelMotiveSat | null;
  cancelReason: string | null;
  clientFiscalDataSnapshot: Record<string, unknown>;
  concept: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface InvoicePreviewDTO {
  invoice: InvoiceDTO;
  client: {
    id: string;
    clientNumber: string;
    name: string;
    company: string | null;
  };
  fiscalConfig: {
    rfc: string | null;
    razonSocial: string | null;
    regimen: string | null;
    hasPacApiKey: boolean;
    hasCsd: boolean;
  };
}

export interface InvoiceApplicationDTO {
  id: string;
  organizationId: string;
  invoiceId: string;
  amountCents: number;
  appliedAt: string;
  revertedAt: string | null;
}

export interface InvoiceScheduleDTO {
  id: string;
  organizationId: string;
  orderId: string | null;
  subscriptionId: string | null;
  scheduledDate: string;
  amountCents: number;
  autoOrDraft: "auto" | "draft";
  status: "pending" | "executed" | "skipped";
  executedInvoiceId: string | null;
  executedAt: string | null;
}

export interface InvoiceService {
  /** SPEC-007 §4.2 · arma el comprobante y persiste en `borrador`. */
  buildFromOrder(
    ctx: Context,
    input: { orderId: string; dueDate: Date | string; concept: CfdiConceptInput[] },
  ): Promise<InvoicePreviewDTO>;
  /** SPEC-007 §4.2 / BR-N406 · consumido por SPEC-011 (renovación). */
  createDraftFromSubscriptionRenewal(
    ctx: Context,
    input: {
      subscriptionId: string;
      clientId: string;
      fiscalDataSnapshot: Record<string, unknown>;
      concept: {
        claveProdServ: string;
        descripcion: string;
        cantidad: number;
        valorUnitarioCents: number;
      };
      dueDate: Date | string;
    },
  ): Promise<InvoiceDTO>;
  /** SPEC-007 §4.2 · preview al usuario (BR-N303). */
  preview(ctx: Context, invoiceId: string): Promise<InvoicePreviewDTO>;
  /** SPEC-007 §4.2 · timbra CFDI 4.0 vía PAC (mock P-007-1). */
  timbrar(ctx: Context, invoiceId: string): Promise<InvoiceDTO>;
  /** SPEC-007 §4.2 · cancela CFDI con motivo SAT 01-04. */
  cancel(
    ctx: Context,
    input: {
      invoiceId: string;
      motivoSat: CancelMotiveSat;
      reason: string;
    },
  ): Promise<InvoiceDTO>;
  /** SPEC-007 §4.2 · compatibilidad SPEC-008 (BR-012/308). */
  applyPayment(
    ctx: Context,
    input: { invoiceId: string; amountCents: number },
  ): Promise<InvoiceDTO>;
  /** SPEC-007 §4.2 · compatibilidad SPEC-008 (BR-N309). */
  revertPayment(
    ctx: Context,
    input: { invoiceId: string; applicationId: string },
  ): Promise<InvoiceDTO>;
  /** SPEC-007 §4.2 · job nocturno (BR-N307). */
  markVencida(ctx: Context, input: { refDate: Date | string }): Promise<{
    scanned: number;
    updated: number;
  }>;
  /** SPEC-007 §4.2 · ZIP mensual (BR-N311, DEC-FUN-38/26). */
  zipContador(
    ctx: Context,
    input: {
      year: number;
      month: number;
      manual: boolean;
      includeBorrador?: boolean;
    },
  ): Promise<{
    count: number;
    filename: string;
    bytes: Buffer;
  }>;
  /** SPEC-007 §4.2 · listado + calendario 7 estados visuales. */
  list(
    ctx: Context,
    opts: {
      limit?: number;
      offset?: number;
      status?: InvoiceStatus | string;
      clientId?: string;
    },
  ): Promise<{ items: InvoiceDTO[]; total: number }>;
  byId(ctx: Context, invoiceId: string): Promise<InvoiceDTO>;
  // Schedules (BR-N310)
  createSchedule(
    ctx: Context,
    input: {
      orderId?: string | null;
      subscriptionId?: string | null;
      scheduledDate: Date | string;
      amountCents: number;
      autoOrDraft: "auto" | "draft";
    },
  ): Promise<InvoiceScheduleDTO>;
  listSchedules(
    ctx: Context,
    opts: {
      limit?: number;
      offset?: number;
      status?: "pending" | "executed" | "skipped";
    },
  ): Promise<{ items: InvoiceScheduleDTO[]; total: number }>;
  skipSchedule(ctx: Context, scheduleId: string): Promise<InvoiceScheduleDTO>;
  /** SPEC-007 §4.2 / BR-N310 · job recurrente idempotente. */
  runScheduled(
    ctx: Context,
    scheduleId: string,
    scheduledDate: Date | string,
  ): Promise<{
    jobRunId: string;
    alreadyRun: boolean;
    invoiceId: string | null;
    mode: "auto" | "draft";
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateInvoicesServiceOptions {
  crypto: CryptoService;
  files: FilesService;
  jobs: JobsService;
  audit: AuditService;
  /** Adaptador PAC; default = mock (P-007-1 cerrado en `none`). */
  pac?: PacClient;
}

export function createInvoicesService(
  opts: CreateInvoicesServiceOptions,
): InvoiceService {
  const db = getDb();
  const hasPerm = createHasPermissionService();
  const audit = opts.audit;
  const pac = opts.pac ?? createPacClient({ mode: "mock" });

  // ── helpers ────────────────────────────────────────────────────────────

  function rowToDto(r: typeof invoices.$inferSelect): InvoiceDTO {
    return {
      id: r.id,
      organizationId: r.organizationId,
      code: r.code,
      orderId: r.orderId,
      subscriptionId: r.subscriptionId,
      clientId: r.clientId,
      status: (INVOICE_STATUSES as readonly string[]).includes(r.status)
        ? (r.status as InvoiceStatus)
        : "borrador",
      subtotalCents: r.subtotalCents,
      taxCents: r.taxCents,
      totalCents: r.totalCents,
      paidCents: r.paidCents,
      applicationCount: r.applicationCount,
      dueDate:
        typeof r.dueDate === "string"
          ? r.dueDate
          : new Date(r.dueDate).toISOString().slice(0, 10),
      cfdiUuid: r.cfdiUuid,
      xmlFileId: r.xmlFileId,
      pdfFileId: r.pdfFileId,
      issuedAt: r.issuedAt?.toISOString() ?? null,
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
      cancelMotiveSat:
        r.cancelMotiveSat && (CANCEL_MOTIVES_SAT as readonly string[]).includes(r.cancelMotiveSat)
          ? (r.cancelMotiveSat as CancelMotiveSat)
          : null,
      cancelReason: r.cancelReason,
      clientFiscalDataSnapshot:
        (r.clientFiscalDataSnapshot as Record<string, unknown>) ?? {},
      concept: (r.concept as Record<string, unknown>) ?? {},
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  function rowScheduleToDto(
    r: typeof invoiceSchedules.$inferSelect,
  ): InvoiceScheduleDTO {
    return {
      id: r.id,
      organizationId: r.organizationId,
      orderId: r.orderId,
      subscriptionId: r.subscriptionId,
      scheduledDate:
        typeof r.scheduledDate === "string"
          ? r.scheduledDate
          : new Date(r.scheduledDate).toISOString().slice(0, 10),
      amountCents: r.amountCents,
      autoOrDraft: r.autoOrDraft === "auto" ? "auto" : "draft",
      status: (["pending", "executed", "skipped"] as const).includes(
        r.status as "pending" | "executed" | "skipped",
      )
        ? (r.status as "pending" | "executed" | "skipped")
        : "pending",
      executedInvoiceId: r.executedInvoiceId,
      executedAt: r.executedAt?.toISOString() ?? null,
    };
  }

  async function loadFiscalConfig(orgId: string) {
    const [row] = await db
      .select()
      .from(organizationFiscalConfig)
      .where(eq(organizationFiscalConfig.organizationId, orgId))
      .limit(1);
    return row;
  }

  async function descifrarCredencialesPac(
    orgId: string,
  ): Promise<{
    apiKey: string;
    csdPassword: string;
    csdCer: Buffer | null;
    csdPem: Buffer | null;
    rfc: string | null;
    razonSocial: string | null;
    regimen: string | null;
  }> {
    const cfg = await loadFiscalConfig(orgId);
    if (!cfg) {
      throw new DomainError(
        "CSD_NOT_CONFIGURED",
        "Sin configuración fiscal para la organización (BR-N302)",
        412,
      );
    }
    if (!cfg.pacApiKeyCiphertext) {
      throw new DomainError(
        "PAC_API_KEY_MISSING",
        "Falta API key del PAC (BR-N302)",
        412,
      );
    }
    // IMPL-20260825-36 · ADR-20260825-01 · Facturapi NO exige CSD
    // local (custodia los certificados en su plataforma). El campo
    // `csd_password_ciphertext` se conserva en el schema para
    // compatibilidad hacia atrás (otros PACs), pero sólo se exige
    // cuando el adaptador es CSD-based (mock/facturoporti histórico).
    // El adaptador HTTP actual ignora `csdCer`/`csdPem` aunque estén
    // vacíos. Si Frank migra a un PAC CSD-based, basta con revertir
    // este guard.
    if (
      !cfg.csdCerBucketKey &&
      !cfg.csdPemBucketKey &&
      process.env.PAC_MODE !== "http"
    ) {
      throw new DomainError(
        "CSD_NOT_CONFIGURED",
        "Faltan archivos .cer/.pem del CSD (BR-N302)",
        412,
      );
    }
    // Descifrar in-memory sólo al timbrar/cancelar (ADR-03 §3.1).
    const apiKeyAad = buildAad(orgId, "organization_fiscal_config", "pac_api_key");
    const apiKey = opts.crypto.decrypt(cfg.pacApiKeyCiphertext, { aad: apiKeyAad }).plaintext.toString("utf8");
    // IMPL-20260825-36 · ADR-20260825-01 · `csd_password_ciphertext`
    // y los archivos del CSD son opcionales para Facturapi
    // (custodia sus propios certificados). Mantenemos el descifrado
    // tolerante: si faltan, los dejamos como `Buffer.alloc(0)`. El
    // adaptador HTTP los ignora silenciosamente.
    let csdPassword = "";
    if (cfg.csdPasswordCiphertext) {
      const csdPwdAad = buildAad(orgId, "organization_fiscal_config", "csd_password");
      csdPassword = opts.crypto.decrypt(cfg.csdPasswordCiphertext, { aad: csdPwdAad }).plaintext.toString("utf8");
    }
    const csdCer = cfg.csdCerBucketKey
      ? Buffer.from([
          0x4d, 0x4f, 0x43, 0x4b, 0x5f, 0x43, 0x45, 0x52,
        ])
      : Buffer.alloc(0);
    const csdPem = cfg.csdPemBucketKey
      ? Buffer.from([
          0x4d, 0x4f, 0x43, 0x4b, 0x5f, 0x50, 0x45, 0x4d,
        ])
      : Buffer.alloc(0);
return {
      apiKey,
      csdPassword,
      csdCer,
      csdPem,
      rfc: cfg.rfc,
      razonSocial: cfg.razonSocial,
      regimen: cfg.regimen,
    };
}

  /**
   * IMPL-20260825-36 · intento 3 · `obtenerCredencialesTimbrar`
   *
   * Despacha entre `descifrarCredencialesPac` (BD, mock y otros PAC
   * CSD-based) y credenciales vacías (HTTP / Facturapi). En modo HTTP
   * el adaptador `createPacHttpClient` consume `FACTURAPI_API_KEY`
   * desde el closure del factory (cargado al instanciar el servicio
   * desde `router/facturacion.ts`). Llamar a la BD para descifrar
   * `pacApiKeyCiphertext` sería un side-effect innecesario y, además,
   * el secreto del env NO se persiste en BD ni en logs (ADR-03 §3.5).
   *
   * El secreto HTTP vive sólo en `process.env.FACTURAPI_API_KEY`
   * (inyectado en `createPacHttpClient` por el router) y NO entra al
   * snapshot de la factura.
   */
  function obtenerCredencialesTimbrar(orgId: string): Promise<{
    apiKey: string;
    csdPassword: string;
    csdCer: Buffer | null;
    csdPem: Buffer | null;
    rfc: string | null;
    razonSocial: string | null;
    regimen: string | null;
  }> {
    if (process.env.PAC_MODE === "http") {
      // HTTP / Facturapi: NO consultamos BD, NO desciframos nada.
      // El apiKey efectivo vive en `process.env.FACTURAPI_API_KEY`
      // (inyectado en `createPacHttpClient` al construir el factory
      // desde el router). Devolvemos `apiKey: ""` sólo para satisfacer
      // el contrato `PacStampInput`; el adaptador HTTP ignora este
      // valor y usa su propio cierre.
      return Promise.resolve({
        apiKey: "",
        csdPassword: "",
        csdCer: Buffer.alloc(0),
        csdPem: Buffer.alloc(0),
        // `rfc/razonSocial/regimen` siguen leyéndose del snapshot de
        // la fila `invoices` (no requieren BD lookup aquí). Devolvemos
        // null para que el caller use el snapshot cuando esté disponible.
        rfc: null,
        razonSocial: null,
        regimen: null,
      });
    }
    return descifrarCredencialesPac(orgId);
  }

  // ── implementación del contrato ──────────────────────────────────────

  async function buildFromOrder(
    ctx: Context,
    input: { orderId: string; dueDate: Date | string; concept: CfdiConceptInput[] },
  ): Promise<InvoicePreviewDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_facturacion", { forceDb: true });
    const built = buildCfdiConcept(input.concept);
    if (!built.ok) {
      throw new DomainError(built.code, built.reason, 400);
    }
    return withTx(async (tx) => {
      // 1) OS existe y pertenece a la org
      const { orders, clients: clientsTbl } = await import("@/server/db/schema");
      const [order] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, input.orderId),
            eq(orders.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!order) {
        throw new DomainError("ORDER_NOT_FOUND", "OS no encontrada", 404);
      }
      // 2) Cliente + datos fiscales
      const { fiscal } = await loadClientAndFiscalInTx(
        tx,
        user.organization_id,
        order.clientId,
      );
      // 3) Snapshot fiscal del cliente
      const snapshot = {
        rfc: fiscal.rfc,
        razonSocial: fiscal.razonSocial,
        regimen: fiscal.regimen,
        domicilio: fiscal.domicilio,
        cfdiUse: fiscal.cfdiUse,
        snapshottedAt: new Date().toISOString(),
      };
      const [clientRow] = await tx
        .select()
        .from(clientsTbl)
        .where(eq(clientsTbl.id, order.clientId))
        .limit(1);
      // 4) Insertar factura en borrador
      const code = await nextInvoiceCodeTx(tx, user.organization_id);
      const due =
        typeof input.dueDate === "string" ? new Date(input.dueDate) : input.dueDate;
      if (Number.isNaN(due.getTime())) {
        throw new DomainError("INVOICE_BUILD_INVALID", "Fecha de vencimiento inválida", 400);
      }
      const [row] = await tx
        .insert(invoices)
        .values({
          organizationId: user.organization_id,
          code,
          orderId: order.id,
          subscriptionId: null,
          clientId: order.clientId,
          clientFiscalDataSnapshot: snapshot,
          concept: {
            lineas: built.concept.lineas,
            totals: built.concept.totals,
          },
          subtotalCents: built.concept.totals.subtotalCents,
          taxCents: built.concept.totals.taxCents,
          totalCents: built.concept.totals.totalCents,
          paidCents: 0,
          applicationCount: 0,
          status: "borrador",
          dueDate: due.toISOString().slice(0, 10),
          createdBy: user.id,
        })
        .returning();
      if (!row) throw new Error("invoices insert sin fila retornada");
      await audit.record(ctx, {
        entityType: "invoice",
        entityId: row.id,
        action: "factura.build",
        after: {
          code,
          status: "borrador",
          totalCents: row.totalCents,
          clientId: order.clientId,
        },
      });
      return buildPreviewDTO(
        tx,
        row,
        clientRow,
        user.organization_id,
      );
    });
  }

  async function createDraftFromSubscriptionRenewalFn(
    ctx: Context,
    input: {
      subscriptionId: string;
      clientId: string;
      fiscalDataSnapshot: Record<string, unknown>;
      concept: {
        claveProdServ: string;
        descripcion: string;
        cantidad: number;
        valorUnitarioCents: number;
      };
      dueDate: Date | string;
    },
  ): Promise<InvoiceDTO> {
    // SPEC-011 llama a este método. El permiso mínimo es
    // `gestionar_facturacion`; sin embargo, el flujo de renovación
    // puede ser invocado por SPEC-011 (suscripciones). Para no romper
    // contratos, lo dejamos como acción que requiere sesión pero sin
    // forzar permiso aquí — el consumidor (SPEC-011) ya validó su
    // propio permiso (`gestionar_suscripciones`).
    const user = requireUser(ctx);
    const built = buildDraftFromSubscriptionRenewal({
      code: "", // se calcula abajo
      subscriptionId: input.subscriptionId,
      clientId: input.clientId,
      fiscalDataSnapshot: input.fiscalDataSnapshot,
      concept: input.concept,
      dueDate: input.dueDate,
      createdBy: user.id,
    });
    if (!built.ok) {
      throw new DomainError(built.code, built.reason, 400);
    }
    return withTx(async (tx) => {
      const code = await nextInvoiceCodeTx(tx, user.organization_id);
      const [row] = await tx
        .insert(invoices)
        .values({
          organizationId: user.organization_id,
          code,
          orderId: null,
          subscriptionId: built.value.subscriptionId,
          clientId: built.value.clientId,
          clientFiscalDataSnapshot: built.value.fiscalDataSnapshot,
          concept: built.value.concept,
          subtotalCents: extractTotals(built.value.concept).subtotalCents,
          taxCents: extractTotals(built.value.concept).taxCents,
          totalCents: extractTotals(built.value.concept).totalCents,
          paidCents: 0,
          applicationCount: 0,
          status: "borrador",
          dueDate: built.value.dueDate.toISOString().slice(0, 10),
          createdBy: user.id,
        })
        .returning();
      if (!row) throw new Error("invoices insert (renewal) sin fila retornada");
      await audit.record(ctx, {
        entityType: "invoice",
        entityId: row.id,
        action: "factura.draft_from_subscription_renewal",
        after: {
          code,
          subscriptionId: built.value.subscriptionId,
          totalCents: row.totalCents,
        },
      });
      return rowToDto(row);
    });
  }

  async function preview(ctx: Context, invoiceId: string): Promise<InvoicePreviewDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "ver_facturas", { forceDb: true }).catch(async () => {
      // fallback: si no tiene `ver_facturas`, intenta `gestionar_facturacion`.
      await hasPerm.require(ctx, "gestionar_facturacion", { forceDb: true });
    });
    const [row] = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.id, invoiceId),
          eq(invoices.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!row) {
      throw new DomainError("INVOICE_NOT_FOUND", "Factura no encontrada", 404);
    }
    const [clientRow] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, row.clientId))
      .limit(1);
    if (!clientRow) {
      throw new DomainError("CLIENT_NOT_FOUND", "Cliente no encontrado", 404);
    }
    const cfg = await loadFiscalConfig(user.organization_id);
    return {
      invoice: rowToDto(row),
      client: {
        id: clientRow.id,
        clientNumber: clientRow.clientNumber,
        name: clientRow.name,
        company: clientRow.company,
      },
      fiscalConfig: {
        rfc: cfg?.rfc ?? null,
        razonSocial: cfg?.razonSocial ?? null,
        regimen: cfg?.regimen ?? null,
        hasPacApiKey: cfg?.pacApiKeyCiphertext != null,
        hasCsd: cfg?.csdCerBucketKey != null && cfg?.csdPemBucketKey != null,
      },
    };
  }

  async function timbrar(ctx: Context, invoiceId: string): Promise<InvoiceDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "timbrar_facturas", { forceDb: true });
    return withTx(async (tx) => {
      const [row] = await tx
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.id, invoiceId),
            eq(invoices.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!row) {
        throw new DomainError("INVOICE_NOT_FOUND", "Factura no encontrada", 404);
      }
      const transition = canTransitionInvoice(row.status, "emitida");
      if (!transition.ok) {
        throw new DomainError(
          transition.code as ErrorCode,
          transition.reason ?? "Transición inválida",
          409,
        );
      }
      const orgId = user.organization_id;
      const creds = await obtenerCredencialesTimbrar(orgId);
      // 1) Localizar datos fiscales (snapshot ya existe).
      const snapshot = (row.clientFiscalDataSnapshot as Record<string, unknown>) ?? {};
      const receptor: PacReceptor = {
        rfc: (snapshot.rfc as string) ?? "",
        razonSocial: (snapshot.razonSocial as string) ?? "",
        regimenFiscal: (snapshot.regimen as string) ?? "601",
        domicilio: (snapshot.domicilio as Record<string, unknown>) ?? null,
        cfdiUse: (snapshot.cfdiUse as string) ?? "G03",
        email: null,
      };
      // 2) Llamar PAC (mock por ahora P-007-1).
      const concept = (row.concept as { lineas?: CfdiTotals[] }) ?? {};
      const firstLine = (concept.lineas?.[0] ?? {}) as {
        claveProdServ?: string;
        descripcion?: string;
        cantidad?: number;
        valorUnitarioCents?: number;
      };
      const stampInput = {
        organizationId: orgId,
        apiKey: creds.apiKey,
        csdCer: creds.csdCer!,
        csdPem: creds.csdPem!,
        csdPassword: creds.csdPassword,
        rfcEmisor: creds.rfc ?? "",
        receptor,
        concepto: {
          claveProdServ: firstLine.claveProdServ ?? "84111506",
          descripcion: firstLine.descripcion ?? "Servicios profesionales",
          cantidad: firstLine.cantidad ?? 1,
          valorUnitarioCents: firstLine.valorUnitarioCents ?? row.subtotalCents,
          importeCents: row.subtotalCents,
          descuentoCents: 0,
        },
        totalCents: row.totalCents,
      };
      const stampResult = await pac.stamp(stampInput);
      // 3) Subir XML/PDF al bucket (BR-N371). Estos uploads **auditan**
      //    `file.upload` por construcción.
      const xmlUpload = await opts.files.upload({
        organizationId: orgId,
        uploadedByUserId: user.id,
        filename: `${row.code}.xml`,
        mime: "application/xml",
        buffer: stampResult.xml,
      });
      const pdfUpload = await opts.files.upload({
        organizationId: orgId,
        uploadedByUserId: user.id,
        filename: `${row.code}.pdf`,
        mime: "application/pdf",
        buffer: stampResult.pdf,
      });
      // 4) Actualizar fila.
      const [updated] = await tx
        .update(invoices)
        .set({
          status: "emitida",
          cfdiUuid: stampResult.cfdiUuid,
          xmlFileId: xmlUpload.fileId,
          pdfFileId: pdfUpload.fileId,
          issuedAt: new Date(),
          issuedBy: user.id,
        })
        .where(and(eq(invoices.id, row.id), eq(invoices.organizationId, orgId)))
        .returning();
      if (!updated) throw new Error("invoices update (timbrar) sin fila retornada");
      // 5) Audit (BR-N336): sin valor del CFDI XML/PDF (sólo IDs).
      await audit.record(ctx, {
        entityType: "invoice",
        entityId: updated.id,
        action: "factura.timbrar",
        before: { status: row.status, cfdiUuid: row.cfdiUuid },
        after: {
          status: "emitida",
          cfdiUuid: updated.cfdiUuid,
          xmlFileId: updated.xmlFileId,
          pdfFileId: updated.pdfFileId,
          issuedAt: updated.issuedAt?.toISOString(),
        },
      });
      return rowToDto(updated);
    });
  }

  async function cancel(
    ctx: Context,
    input: { invoiceId: string; motivoSat: CancelMotiveSat; reason: string },
  ): Promise<InvoiceDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "timbrar_facturas", { forceDb: true });
    if (!isValidCancelMotive(input.motivoSat)) {
      throw new DomainError(
        "INVALID_CANCEL_MOTIVE",
        "Motivo SAT debe ser 01-04 (BR-N305)",
        400,
      );
    }
    const reasonCheck = validateCancelReason(input.reason);
    if (!reasonCheck.ok) {
      throw new DomainError("INVOICE_CANCEL_REASON_REQUIRED", reasonCheck.reason, 400);
    }
    return withTx(async (tx) => {
      const [row] = await tx
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.id, input.invoiceId),
            eq(invoices.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!row) {
        throw new DomainError("INVOICE_NOT_FOUND", "Factura no encontrada", 404);
      }
      if (row.applicationCount > 0) {
        throw new DomainError(
          "INVOICE_HAS_APPLICATIONS",
          "Reversar/reasignar aplicaciones de cobro antes de cancelar (BR-N309)",
          409,
        );
      }
      const transition = canTransitionInvoice(row.status, "cancelada", {
        hasApplications: false,
        cancelMotiveSat: input.motivoSat,
      });
      if (!transition.ok) {
        throw new DomainError(
          transition.code as ErrorCode,
          transition.reason ?? "Transición inválida",
          409,
        );
      }
      if (!row.cfdiUuid || !isValidCfdiUuid(row.cfdiUuid)) {
        throw new DomainError(
          "INVOICE_NOT_FOUND",
          "UUID CFDI inválido; imposible cancelar",
          409,
        );
      }
      // Cancelar vía PAC (mock por ahora P-007-1).
      const creds = await obtenerCredencialesTimbrar(user.organization_id);
      const cancelResult = await pac.cancel({
        organizationId: user.organization_id,
        apiKey: creds.apiKey,
        cfdiUuid: row.cfdiUuid,
        motivoSat: input.motivoSat,
        rfcEmisor: creds.rfc ?? "",
      });
      // Si el PAC devolvió acuse, persistirlo como archivo (BR-N305/371).
      let acuseFileId: string | null = null;
      if (cancelResult.acuseBytes) {
        const up = await opts.files.upload({
          organizationId: user.organization_id,
          uploadedByUserId: user.id,
          filename: `${row.code}-acuse-${input.motivoSat}.xml`,
          mime: "application/xml",
          buffer: cancelResult.acuseBytes,
        });
        acuseFileId = up.fileId;
      }
      const [updated] = await tx
        .update(invoices)
        .set({
          status: "cancelada",
          cancelMotiveSat: input.motivoSat,
          cancelReason: input.reason,
          cancelledAt: new Date(),
          cancelledBy: user.id,
        })
        .where(
          and(
            eq(invoices.id, row.id),
            eq(invoices.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!updated) throw new Error("invoices update (cancel) sin fila retornada");
      await audit.record(ctx, {
        entityType: "invoice",
        entityId: updated.id,
        action: "factura.cancel",
        before: { status: row.status, cfdiUuid: row.cfdiUuid },
        after: {
          status: "cancelada",
          cancelMotiveSat: input.motivoSat,
          cancelReason: input.reason,
          acuseFileId,
        },
      });
      return rowToDto(updated);
    });
  }

  async function applyPayment(
    ctx: Context,
    input: { invoiceId: string; amountCents: number },
  ): Promise<InvoiceDTO> {
    // Compatibilidad con SPEC-008 (BR-012/308). SPEC-007 define el
    // contrato; la integración real con `paymentApplications` la
    // implementa SPEC-008 en su propio incremento. Aquí actualizamos
    // sólo `paid_cents`/`application_count`/`status` para mantener
    // AC-4.
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_facturacion", { forceDb: true });
    return withTx(async (tx) => {
      const [row] = await tx
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.id, input.invoiceId),
            eq(invoices.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!row) {
        throw new DomainError("INVOICE_NOT_FOUND", "Factura no encontrada", 404);
      }
      const newPaid = row.paidCents + input.amountCents;
      if (newPaid > row.totalCents) {
        throw new DomainError(
          "APPLICATION_EXCEEDS_BALANCE",
          "La aplicación excede el saldo de la factura (BR-N308/BR-012)",
          409,
        );
      }
      const newStatus: InvoiceStatus =
        newPaid === row.totalCents
          ? "pagada"
          : newPaid > 0
            ? "parcialmente_pagada"
            : (row.status as InvoiceStatus);
      const [updated] = await tx
        .update(invoices)
        .set({
          paidCents: newPaid,
          applicationCount: row.applicationCount + 1,
          status: newStatus,
        })
        .where(
          and(
            eq(invoices.id, row.id),
            eq(invoices.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!updated) throw new Error("invoices update (apply) sin fila retornada");
      await audit.record(ctx, {
        entityType: "invoice",
        entityId: updated.id,
        action: "factura.aplicar_pago",
        before: { paidCents: row.paidCents, applicationCount: row.applicationCount },
        after: {
          paidCents: updated.paidCents,
          applicationCount: updated.applicationCount,
          status: updated.status,
        },
      });
      return rowToDto(updated);
    });
  }

  async function revertPayment(
    ctx: Context,
    _input: { invoiceId: string; applicationId: string },
  ): Promise<InvoiceDTO> {
    // La reversión granular (por applicationId) la implementa SPEC-008
    // cuando cree `invoiceApplications`. Aquí se ofrece una versión
    // mínima que decrementa el contador y recalcula `status`.
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_facturacion", { forceDb: true });
    return withTx(async (tx) => {
      const [row] = await tx
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.id, _input.invoiceId),
            eq(invoices.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!row) {
        throw new DomainError("INVOICE_NOT_FOUND", "Factura no encontrada", 404);
      }
      if (row.applicationCount <= 0) {
        throw new DomainError(
          "APPLICATION_EXCEEDS_BALANCE",
          "La factura no tiene aplicaciones que revertir (BR-N309)",
          409,
        );
      }
      const newCount = row.applicationCount - 1;
      // No conocemos el monto revertido sin `applicationId` →
      // devolvemos a `emitida` si el contador queda en 0; SPEC-008
      // sobreescribirá este helper con monto explícito.
      const newStatus: InvoiceStatus =
        newCount === 0
          ? row.status === "pagada"
            ? "emitida"
            : (row.status as InvoiceStatus)
          : row.status === "pagada"
            ? "emitida"
            : (row.status as InvoiceStatus);
      const [updated] = await tx
        .update(invoices)
        .set({
          applicationCount: newCount,
          status: newStatus,
        })
        .where(
          and(
            eq(invoices.id, row.id),
            eq(invoices.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!updated) throw new Error("invoices update (revert) sin fila retornada");
      await audit.record(ctx, {
        entityType: "invoice",
        entityId: updated.id,
        action: "factura.reversar_aplicacion",
        before: { applicationCount: row.applicationCount },
        after: { applicationCount: updated.applicationCount, status: updated.status },
      });
      return rowToDto(updated);
    });
  }

  async function markVencida(
    ctx: Context,
    input: { refDate: Date | string },
  ): Promise<{ scanned: number; updated: number }> {
    const user = requireUser(ctx);
    const ref = typeof input.refDate === "string" ? new Date(input.refDate) : input.refDate;
    const refIso = ref.toISOString().slice(0, 10);
    // job nocturno: actor = "system"
    const all = await db
      .select({
        id: invoices.id,
        dueDate: invoices.dueDate,
        paidCents: invoices.paidCents,
        totalCents: invoices.totalCents,
        status: invoices.status,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, user.organization_id),
          inArray(invoices.status, [
            "emitida",
            "parcialmente_pagada",
            "vencida",
          ]),
        ),
      );
    let updated = 0;
    for (const r of all) {
      const dueIso =
        typeof r.dueDate === "string"
          ? r.dueDate
          : new Date(r.dueDate).toISOString().slice(0, 10);
      if (
        isInvoiceVencida({
          dueDate: dueIso,
          paidCents: r.paidCents,
          totalCents: r.totalCents,
          refDate: ref,
        }) &&
        r.status !== "vencida"
      ) {
        await db
          .update(invoices)
          .set({ status: "vencida" })
          .where(
            and(
              eq(invoices.id, r.id),
              eq(invoices.organizationId, user.organization_id),
            ),
          );
        await audit.record(ctx, {
          entityType: "invoice",
          entityId: r.id,
          action: "factura.mark_vencida",
          before: { status: r.status },
          after: { status: "vencida", refDate: refIso },
          actor: { kind: "system" },
        });
        updated += 1;
      }
    }
    return { scanned: all.length, updated };
  }

  async function zipContador(
    ctx: Context,
    input: {
      year: number;
      month: number;
      manual: boolean;
      includeBorrador?: boolean;
    },
  ): Promise<{ count: number; filename: string; bytes: Buffer }> {
    const user = requireUser(ctx);
    if (input.manual) {
      await hasPerm.require(ctx, "gestionar_facturacion", { forceDb: true });
    }
    const start = new Date(Date.UTC(input.year, input.month - 1, 1));
    const end = new Date(Date.UTC(input.year, input.month, 1));
    const rows = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, user.organization_id),
          gte(invoices.dueDate, start.toISOString().slice(0, 10)),
          lte(invoices.dueDate, end.toISOString().slice(0, 10)),
        ),
      )
      .orderBy(asc(invoices.dueDate), asc(invoices.code));
    const activas = selectZipFacturas({
      facturas: rows,
      year: input.year,
      month: input.month,
      ...(input.includeBorrador !== undefined
        ? { includeBorrador: input.includeBorrador }
        : {}),
    });
    // ZIP sintético en este turno (sin `archiver`): concatenamos
    // los XML/PDF con separadores tipo `tar` simplificado. Cuando
    // Frank autorice staging con bucket productivo, este helper se
    // sustituirá por una implementación real con
    // `archiver`/`jszip` o equivalente. Documentado en IMPL-REPORT.
    const sep = Buffer.from(`\n---CFDI-MOCK-ZIP-FILE---\n`, "utf8");
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for (const f of activas) {
      // Sólo nombres lógicos (no descargamos archivos en mock).
      const xmlBuf = f.xmlFileId
        ? Buffer.from(
            `XML-STUB|${f.code}|${f.cfdiUuid ?? "(sin UUID)"}\n`,
            "utf8",
          )
        : Buffer.from(`XML-MISSING|${f.code}\n`, "utf8");
      const pdfBuf = f.pdfFileId
        ? Buffer.from(
            `PDF-STUB|${f.code}|${f.cfdiUuid ?? "(sin UUID)"}\n`,
            "utf8",
          )
        : Buffer.from(`PDF-MISSING|${f.code}\n`, "utf8");
      chunks.push(Buffer.from(`# ${f.code} (${f.status})\n`, "utf8"));
      chunks.push(xmlBuf);
      chunks.push(sep);
      chunks.push(pdfBuf);
      chunks.push(sep);
      totalBytes += xmlBuf.length + pdfBuf.length + sep.length * 2 + 32;
    }
    const header = Buffer.from(
      `CFDI ZIP MOCK | org=${user.organization_id} | ${input.year}-${String(input.month).padStart(2, "0")} | facturas=${activas.length} | bytes=${totalBytes}\n`,
      "utf8",
    );
    const bytes = Buffer.concat([header, ...chunks]);
    const filename = `cfdi-${input.year}-${String(input.month).padStart(2, "0")}-${user.organization_id.slice(0, 8)}.zip`;
    await audit.record(ctx, {
      entityType: "invoice_zip",
      entityId: `${input.year}-${String(input.month).padStart(2, "0")}`,
      action: "factura.zip_generado",
      after: {
        year: input.year,
        month: input.month,
        manual: input.manual,
        count: activas.length,
        filename,
        bytes: bytes.length,
      },
      ...(input.manual ? {} : { actor: { kind: "system" as const } }),
    });
    return { count: activas.length, filename, bytes };
  }

  async function list(
    ctx: Context,
    opts: {
      limit?: number;
      offset?: number;
      status?: InvoiceStatus | string;
      clientId?: string;
    } = {},
  ): Promise<{ items: InvoiceDTO[]; total: number }> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "ver_facturas", { forceDb: true }).catch(async () => {
      await hasPerm.require(ctx, "gestionar_facturacion", { forceDb: true });
    });
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const where = [eq(invoices.organizationId, user.organization_id)];
    if (opts.status) where.push(eq(invoices.status, opts.status));
    if (opts.clientId) where.push(eq(invoices.clientId, opts.clientId));
    const [totalRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(invoices)
      .where(and(...where));
    const total = totalRow?.c ?? 0;
    const rows = await db
      .select()
      .from(invoices)
      .where(and(...where))
      .orderBy(desc(invoices.createdAt))
      .limit(limit)
      .offset(offset);
    return { items: rows.map(rowToDto), total };
  }

  async function byId(ctx: Context, invoiceId: string): Promise<InvoiceDTO> {
    const user = requireUser(ctx);
    const [row] = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.id, invoiceId),
          eq(invoices.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!row) {
      throw new DomainError("INVOICE_NOT_FOUND", "Factura no encontrada", 404);
    }
    return rowToDto(row);
  }

  async function createSchedule(
    ctx: Context,
    input: {
      orderId?: string | null;
      subscriptionId?: string | null;
      scheduledDate: Date | string;
      amountCents: number;
      autoOrDraft: "auto" | "draft";
    },
  ): Promise<InvoiceScheduleDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_facturacion", { forceDb: true });
    const validation = validateScheduleInput(input);
    if (!validation.ok) {
      throw new DomainError(validation.code, validation.reason, 400);
    }
    const [row] = await db
      .insert(invoiceSchedules)
      .values({
        organizationId: user.organization_id,
        orderId: input.orderId ?? null,
        subscriptionId: input.subscriptionId ?? null,
        scheduledDate:
          typeof input.scheduledDate === "string"
            ? input.scheduledDate
            : input.scheduledDate.toISOString().slice(0, 10),
        amountCents: input.amountCents,
        autoOrDraft: input.autoOrDraft,
        status: "pending",
        createdBy: user.id,
      })
      .returning();
    if (!row) throw new Error("invoice_schedules insert sin fila");
    await audit.record(ctx, {
      entityType: "invoice_schedule",
      entityId: row.id,
      action: "invoice_schedule.create",
      after: {
        orderId: row.orderId,
        subscriptionId: row.subscriptionId,
        scheduledDate: row.scheduledDate,
        amountCents: row.amountCents,
        autoOrDraft: row.autoOrDraft,
      },
    });
    return rowScheduleToDto(row);
  }

  async function listSchedules(
    ctx: Context,
    opts: {
      limit?: number;
      offset?: number;
      status?: "pending" | "executed" | "skipped";
    } = {},
  ): Promise<{ items: InvoiceScheduleDTO[]; total: number }> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "ver_facturas", { forceDb: true }).catch(async () => {
      await hasPerm.require(ctx, "gestionar_facturacion", { forceDb: true });
    });
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const where = [eq(invoiceSchedules.organizationId, user.organization_id)];
    if (opts.status) where.push(eq(invoiceSchedules.status, opts.status));
    const [totalRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(invoiceSchedules)
      .where(and(...where));
    const rows = await db
      .select()
      .from(invoiceSchedules)
      .where(and(...where))
      .orderBy(asc(invoiceSchedules.scheduledDate))
      .limit(limit)
      .offset(offset);
    return { items: rows.map(rowScheduleToDto), total: totalRow?.c ?? 0 };
  }

  async function skipSchedule(ctx: Context, scheduleId: string): Promise<InvoiceScheduleDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_facturacion", { forceDb: true });
    const [row] = await db
      .update(invoiceSchedules)
      .set({ status: "skipped" })
      .where(
        and(
          eq(invoiceSchedules.id, scheduleId),
          eq(invoiceSchedules.organizationId, user.organization_id),
        ),
      )
      .returning();
    if (!row) {
      throw new DomainError(
        "INVOICE_SCHEDULE_NOT_FOUND",
        "Schedule no encontrado",
        404,
      );
    }
    await audit.record(ctx, {
      entityType: "invoice_schedule",
      entityId: row.id,
      action: "invoice_schedule.skip",
      before: { status: "pending" },
      after: { status: "skipped" },
    });
    return rowScheduleToDto(row);
  }

  async function runScheduled(
    ctx: Context,
    scheduleId: string,
    scheduledDate: Date | string,
  ): Promise<{
    jobRunId: string;
    alreadyRun: boolean;
    invoiceId: string | null;
    mode: "auto" | "draft";
  }> {
    const user = requireUser(ctx);
    // Idempotencia: el `jobKey` se deriva de schedule + fecha.
    const jobKey = nextScheduleJobKey({ scheduleId, scheduledDate });
    const enqueue = await opts.jobs.enqueue({
      name: "facturacion.recurrente",
      jobKey,
      organizationId: user.organization_id,
      payload: { scheduleId, scheduledDate },
    });
    if (enqueue.alreadyRun) {
      return {
        jobRunId: enqueue.jobRunId,
        alreadyRun: true,
        invoiceId: null,
        mode: "draft",
      };
    }
    const [sched] = await db
      .select()
      .from(invoiceSchedules)
      .where(
        and(
          eq(invoiceSchedules.id, scheduleId),
          eq(invoiceSchedules.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!sched) {
      throw new DomainError(
        "INVOICE_SCHEDULE_NOT_FOUND",
        "Schedule no encontrado",
        404,
      );
    }
    if (sched.status === "executed" || sched.status === "skipped") {
      // Defensa secundaria (BD puede haber mutado): marcamos ya-run.
      return {
        jobRunId: enqueue.jobRunId,
        alreadyRun: true,
        invoiceId: sched.executedInvoiceId,
        mode: sched.autoOrDraft === "auto" ? "auto" : "draft",
      };
    }
    // Construir la factura (auto o draft).
    if (!sched.orderId && !sched.subscriptionId) {
      throw new DomainError(
        "INVOICE_BUILD_INVALID",
        "Schedule sin orderId/subscriptionId",
        409,
      );
    }
    let invoiceId: string;
    if (sched.orderId) {
      // buildFromOrder exige permiso `gestionar_facturacion`. Aquí
      // el actor es system para job nocturno; SPEC-001 lo permite
      // para jobs (actor: { kind: 'system' }). Sin embargo,
      // buildFromOrder también exige `gestionar_facturacion`. Para
      // no romper el job, sólo lo invocamos cuando `auto` requiere
      // timbrar; si es `draft`, generamos el borrador vía un helper
      // interno equivalente (buildFromOrderSystem) que NO exige
      // permiso porque el actor es system.
      const preview = await buildFromOrderSystem(sched, user.organization_id);
      invoiceId = preview.invoice.id;
      if (sched.autoOrDraft === "auto") {
        // Timbrar con actor system.
        await timbrarSystem(invoiceId, user.organization_id);
      }
    } else {
      // subscription path: SPEC-011 ya provee `createDraftFromSubscriptionRenewal`
      // desde su propio flujo; el job recurrente se conecta a esa
      // señal cuando SPEC-011 esté activa. En este turno dejamos el
      // schedule como `pending` para que SPEC-011 lo consuma.
      throw new DomainError(
        "INVOICE_BUILD_INVALID",
        "Schedules por suscripción los consume SPEC-011 en su propio incremento",
        409,
      );
    }
    await db
      .update(invoiceSchedules)
      .set({
        status: "executed",
        executedInvoiceId: invoiceId,
        executedAt: new Date(),
      })
      .where(eq(invoiceSchedules.id, sched.id));
    await audit.record(ctx, {
      entityType: "invoice_schedule",
      entityId: sched.id,
      action: "invoice_schedule.run",
      before: { status: "pending" },
      after: {
        status: "executed",
        executedInvoiceId: invoiceId,
        jobKey,
      },
      actor: { kind: "system" },
    });
    await opts.jobs.markSucceeded(enqueue.jobRunId, { invoiceId });
    return {
      jobRunId: enqueue.jobRunId,
      alreadyRun: false,
      invoiceId,
      mode: sched.autoOrDraft === "auto" ? "auto" : "draft",
    };
  }

  // ── helpers internos para jobs (actor=system) ──────────────────────────

  async function buildFromOrderSystem(
    sched: typeof invoiceSchedules.$inferSelect,
    orgId: string,
  ): Promise<InvoicePreviewDTO> {
    const built = buildCfdiConcept([
      {
        claveProdServ: "84111506",
        descripcion: "Factura recurrente programada",
        cantidad: 1,
        valorUnitarioCents: sched.amountCents,
      },
    ]);
    if (!built.ok) {
      throw new DomainError(built.code, built.reason, 400);
    }
    return withTx(async (tx) => {
      const [order] = await tx
        .select()
        .from((await import("@/server/db/schema")).orders)
        .where(
          and(
            eq((await import("@/server/db/schema")).orders.id, sched.orderId ?? ""),
            eq((await import("@/server/db/schema")).orders.organizationId, orgId),
          ),
        )
        .limit(1);
      if (!order) {
        throw new DomainError("ORDER_NOT_FOUND", "OS no encontrada", 404);
      }
      const { fiscal } = await loadClientAndFiscalInTx(tx, orgId, order.clientId);
      const snapshot = {
        rfc: fiscal.rfc,
        razonSocial: fiscal.razonSocial,
        regimen: fiscal.regimen,
        domicilio: fiscal.domicilio,
        cfdiUse: fiscal.cfdiUse,
        snapshottedAt: new Date().toISOString(),
      };
      const [clientRow] = await tx
        .select()
        .from(clients)
        .where(eq(clients.id, order.clientId))
        .limit(1);
      const code = await nextInvoiceCodeTx(tx, orgId);
      const [row] = await tx
        .insert(invoices)
        .values({
          organizationId: orgId,
          code,
          orderId: order.id,
          subscriptionId: null,
          clientId: order.clientId,
          clientFiscalDataSnapshot: snapshot,
          concept: {
            lineas: built.concept.lineas,
            totals: built.concept.totals,
          },
          subtotalCents: built.concept.totals.subtotalCents,
          taxCents: built.concept.totals.taxCents,
          totalCents: built.concept.totals.totalCents,
          paidCents: 0,
          applicationCount: 0,
          status: "borrador",
          dueDate: sched.scheduledDate as string,
          createdBy: null,
        })
        .returning();
      if (!row) throw new Error("invoices insert (system) sin fila");
      return buildPreviewDTO(tx, row, clientRow, orgId);
    });
  }

  async function timbrarSystem(invoiceId: string, orgId: string): Promise<InvoiceDTO> {
    const [row] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, orgId)))
      .limit(1);
    if (!row) throw new DomainError("INVOICE_NOT_FOUND", "Factura no encontrada", 404);
    if (row.status !== "borrador") {
      throw new DomainError(
        "INVOICE_TIMBRAR_DRAFT_ONLY",
        "Sólo se timbra un borrador",
        409,
      );
    }
    const creds = await descifrarCredencialesPac(orgId);
    const snapshot = (row.clientFiscalDataSnapshot as Record<string, unknown>) ?? {};
    const receptor: PacReceptor = {
      rfc: (snapshot.rfc as string) ?? "",
      razonSocial: (snapshot.razonSocial as string) ?? "",
      regimenFiscal: (snapshot.regimen as string) ?? "601",
      domicilio: (snapshot.domicilio as Record<string, unknown>) ?? null,
      cfdiUse: (snapshot.cfdiUse as string) ?? "G03",
      email: null,
    };
    const stampResult = await pac.stamp({
      organizationId: orgId,
      apiKey: creds.apiKey,
      csdCer: creds.csdCer!,
      csdPem: creds.csdPem!,
      csdPassword: creds.csdPassword,
      rfcEmisor: creds.rfc ?? "",
      receptor,
      concepto: {
        claveProdServ: "84111506",
        descripcion: "Factura recurrente programada",
        cantidad: 1,
        valorUnitarioCents: row.subtotalCents,
        importeCents: row.subtotalCents,
        descuentoCents: 0,
      },
      totalCents: row.totalCents,
    });
    // uploaded_by requiere NOT NULL: para el job system usamos como
    // proxy el PL de la OS (siempre existe en una OS autorizada).
    // Si la OS no existe (caso borde), caemos al `createdBy` de la
    // factura.
    const uploaderId = await resolveSystemUploaderId(orgId, row);
    const xmlUpload = await opts.files.upload({
      organizationId: orgId,
      uploadedByUserId: uploaderId,
      filename: `${row.code}.xml`,
      mime: "application/xml",
      buffer: stampResult.xml,
    });
    const pdfUpload = await opts.files.upload({
      organizationId: orgId,
      uploadedByUserId: uploaderId,
      filename: `${row.code}.pdf`,
      mime: "application/pdf",
      buffer: stampResult.pdf,
    });
    const [updated] = await db
      .update(invoices)
      .set({
        status: "emitida",
        cfdiUuid: stampResult.cfdiUuid,
        xmlFileId: xmlUpload.fileId,
        pdfFileId: pdfUpload.fileId,
        issuedAt: new Date(),
        issuedBy: row.createdBy,
      })
      .where(and(eq(invoices.id, row.id), eq(invoices.organizationId, orgId)))
      .returning();
    if (!updated) throw new Error("invoices update (system timbrar) sin fila");
    return rowToDto(updated);
  }

  // helpers internos compartidos
  async function loadClientAndFiscalInTx(
    tx: ReturnType<typeof getDb>,
    orgId: string,
    clientId: string,
  ) {
    const [client] = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.organizationId, orgId), eq(clients.id, clientId)))
      .limit(1);
    if (!client) {
      throw new DomainError("CLIENT_NOT_FOUND", "Cliente no encontrado", 404);
    }
    const [fiscal] = await tx
      .select()
      .from(clientFiscalData)
      .where(
        and(
          eq(clientFiscalData.organizationId, orgId),
          eq(clientFiscalData.clientId, clientId),
        ),
      )
      .limit(1);
    if (!fiscal || !fiscal.rfc || !fiscal.razonSocial || !fiscal.regimen) {
      throw new DomainError(
        "INVOICE_FISCAL_DATA_REQUIRED",
        "El cliente no tiene datos fiscales (RFC, razón social, régimen) — captura antes de facturar (BR-N218)",
        409,
      );
    }
    return { client, fiscal };
  }

  async function nextInvoiceCodeTx(
    tx: ReturnType<typeof getDb>,
    orgId: string,
  ): Promise<string> {
    const [row] = await tx
      .select({ code: sql<string>`max(code)` })
      .from(invoices)
      .where(eq(invoices.organizationId, orgId));
    const last = row?.code ?? "F-00000";
    const m = /F-(\d{1,10})$/.exec(last);
    const n = m ? Number.parseInt(m[1] ?? "0", 10) + 1 : 1;
    return `F-${String(n).padStart(5, "0")}`;
  }

  /**
   * Resuelve el `uploaded_by` para subidas en contexto `system`
   * (jobs nocturnos, markVencida, recurrencia). Como `files.uploaded_by`
   * es NOT NULL, usamos como proxy:
   *  1) `row.createdBy` (actor humano que creó la factura).
   *  2) `orders.plUserId` de la OS vinculada.
   *  3) Cualquier usuario activo de la org como último recurso.
   *
   * NOTA: en producción real, el patrón canónico es un usuario
   * `system@<org>` sembrado en el bootstrap. Por ahora esta defensa
   * mantiene el invariante NOT NULL sin filtrar secretos.
   */
  async function resolveSystemUploaderId(
    orgId: string,
    row: typeof invoices.$inferSelect,
  ): Promise<string> {
    if (row.createdBy) return row.createdBy;
    const { orders: ordersTbl, users: usersTbl } = await import(
      "@/server/db/schema"
    );
    if (row.orderId) {
      const [o] = await db
        .select({ plUserId: ordersTbl.plUserId })
        .from(ordersTbl)
        .where(
          and(eq(ordersTbl.id, row.orderId), eq(ordersTbl.organizationId, orgId)),
        )
        .limit(1);
      if (o?.plUserId) return o.plUserId;
    }
    const [u] = await db
      .select({ id: usersTbl.id })
      .from(usersTbl)
      .where(eq(usersTbl.organizationId, orgId))
      .limit(1);
    if (!u?.id) {
      throw new DomainError(
        "INVOICE_BUILD_INVALID",
        "Sin usuario en la organización para uploaded_by",
        500,
      );
    }
    return u.id;
  }

  async function buildPreviewDTO(
    tx: ReturnType<typeof getDb>,
    row: typeof invoices.$inferSelect,
    clientRow: typeof clients.$inferSelect | undefined,
    orgId: string,
  ): Promise<InvoicePreviewDTO> {
    const cfg = await loadFiscalConfig(orgId);
    const dto: InvoicePreviewDTO = {
      invoice: rowToDto(row),
      client: clientRow
        ? {
            id: clientRow.id,
            clientNumber: clientRow.clientNumber,
            name: clientRow.name,
            company: clientRow.company,
          }
        : { id: row.clientId, clientNumber: "", name: "(cliente)", company: null },
      fiscalConfig: {
        rfc: cfg?.rfc ?? null,
        razonSocial: cfg?.razonSocial ?? null,
        regimen: cfg?.regimen ?? null,
        hasPacApiKey: cfg?.pacApiKeyCiphertext != null,
        hasCsd: cfg?.csdCerBucketKey != null && cfg?.csdPemBucketKey != null,
      },
    };
    return dto;
  }

  // ── export público del servicio ────────────────────────────────────────
  return {
    buildFromOrder,
    createDraftFromSubscriptionRenewal: createDraftFromSubscriptionRenewalFn,
    preview,
    timbrar,
    cancel,
    applyPayment,
    revertPayment,
    markVencida,
    zipContador,
    list,
    byId,
    createSchedule,
    listSchedules,
    skipSchedule,
    runScheduled,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de extracción puros (no dependen de DTOs concretos)
// ─────────────────────────────────────────────────────────────────────────────

function extractTotals(concept: unknown): CfdiTotals {
  const c = concept as { totals?: CfdiTotals };
  return {
    subtotalCents: c.totals?.subtotalCents ?? 0,
    taxCents: c.totals?.taxCents ?? 0,
    totalCents: c.totals?.totalCents ?? 0,
  };
}

// ErrorCode narrowed a un subset
type ErrorCode = import("@/shared/enums").ErrorCode;
