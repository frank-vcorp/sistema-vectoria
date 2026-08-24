/**
 * Helpers puros del módulo Facturación CFDI (SPEC-007 / ADR-20260817-09).
 *
 * Cubre, sin acceso a BD:
 *  - BR-N301..N306/BR-N311/BR-N312/BR-N406: armado de concepto,
 *    validación de motivo SAT, transición de estado, conteo de 7
 *    estados visuales del calendario.
 *  - BR-N303: preview (mismo armado que timbrado, sin enviar al PAC).
 *  - BR-N307: `isVencida`.
 *  - BR-N308/BR-012: aplicación de pago sin exceder saldo.
 *  - BR-N309: la cancelación exige reversar aplicaciones primero
 *    (contrato con SPEC-008).
 *  - BR-N310: validación de schedule (auto/draft + fecha + importe).
 *  - BR-N311/DEC-FUN-38/26: ZIP mensual/manual — sólo facturas activas
 *    (no canceladas) del mes pedido.
 *  - BR-N371: validación de UUID CFDI v4 (formato) para cancelación.
 *
 * Los servicios (con BD) viven en `src/server/services/facturacion/*`
 * y orquestan transacciones + audit + adaptadores. Estos helpers son
 * deterministas y testeables en aislamiento.
 */
import {
  CANCEL_MOTIVES_SAT,
  INVOICE_CALENDAR_VISUAL_STATUSES,
  INVOICE_CANCEL_REASON_MIN_LENGTH,
  INVOICE_STATUSES,
  SCHEDULE_AUTO_OR_DRAFT_KINDS,
  type CancelMotiveSat,
  type InvoiceCalendarVisualStatus,
  type InvoiceScheduleStatus,
  type InvoiceStatus,
  type ScheduleAutoOrDraftKind,
} from "@/shared/enums";

// ─────────────────────────────────────────────────────────────────────────────
// 1) CFDI 4.0 · armado del comprobante (BR-N301/303)
// ─────────────────────────────────────────────────────────────────────────────

export interface CfdiConceptInput {
  claveProdServ: string;
  descripcion: string;
  cantidad: number;
  valorUnitarioCents: number;
  /** descuento aplicado al concepto (centavos). Default 0. */
  descuentoCents?: number;
}

export interface CfdiConceptOutput {
  claveProdServ: string;
  descripcion: string;
  cantidad: number;
  valorUnitarioCents: number;
  importeCents: number;
  descuentoCents: number;
  /** Traslado IVA 16% por defecto (BR-N301). */
  ivaTrasladadoCents: number;
}

export interface CfdiTotals {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

/** Tasa de IVA por defecto (BR-N301). */
export const IVA_RATE = 0.16;

/**
 * Construye el concepto CFDI a partir de una o varias líneas. Calcula
 * el importe (`cantidad × valor unitario − descuento`) y el IVA
 * trasladado (16% por defecto).
 *
 * Reglas (BR-N301):
 *  - Cantidad > 0.
 *  - valorUnitario ≥ 0.
 *  - descuento ≤ importe bruto.
 *  - Línea con descripción no vacía.
 */
export function buildCfdiConcept(
  lineas: CfdiConceptInput[],
): {
  ok: true;
  concept: { lineas: CfdiConceptOutput[]; totals: CfdiTotals };
} | {
  ok: false;
  code:
    | "INVOICE_BUILD_INVALID"
    | "INVOICE_FISCAL_DATA_REQUIRED"
    | "INVOICE_TIMBRAR_DRAFT_ONLY";
  reason: string;
} {
  if (!Array.isArray(lineas) || lineas.length === 0) {
    return {
      ok: false,
      code: "INVOICE_BUILD_INVALID",
      reason: "Se requiere al menos una línea de concepto",
    };
  }
  const lineasOut: CfdiConceptOutput[] = [];
  for (const l of lineas) {
    if (!l.claveProdServ || l.claveProdServ.length === 0) {
      return { ok: false, code: "INVOICE_BUILD_INVALID", reason: "Falta claveProdServ" };
    }
    if (!l.descripcion || l.descripcion.trim().length === 0) {
      return { ok: false, code: "INVOICE_BUILD_INVALID", reason: "Falta descripción" };
    }
    if (typeof l.cantidad !== "number" || l.cantidad <= 0) {
      return { ok: false, code: "INVOICE_BUILD_INVALID", reason: "Cantidad debe ser > 0" };
    }
    if (typeof l.valorUnitarioCents !== "number" || l.valorUnitarioCents < 0) {
      return {
        ok: false,
        code: "INVOICE_BUILD_INVALID",
        reason: "Valor unitario debe ser ≥ 0",
      };
    }
    const descuento = l.descuentoCents ?? 0;
    const bruto = l.cantidad * l.valorUnitarioCents;
    if (descuento > bruto) {
      return {
        ok: false,
        code: "INVOICE_BUILD_INVALID",
        reason: "Descuento no puede exceder importe bruto",
      };
    }
    const importe = bruto - descuento;
    const iva = Math.round(importe * IVA_RATE);
    lineasOut.push({
      claveProdServ: l.claveProdServ,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      valorUnitarioCents: l.valorUnitarioCents,
      importeCents: importe,
      descuentoCents: descuento,
      ivaTrasladadoCents: iva,
    });
  }
  const subtotal = lineasOut.reduce((acc, l) => acc + l.importeCents, 0);
  const tax = lineasOut.reduce((acc, l) => acc + l.ivaTrasladadoCents, 0);
  return {
    ok: true,
    concept: {
      lineas: lineasOut,
      totals: {
        subtotalCents: subtotal,
        taxCents: tax,
        totalCents: subtotal + tax,
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Estado · transiciones y validación (BR-N306/307/309)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Línea principal (BR-N306):
 *   borrador → emitida → parcialmente_pagada → pagada
 * Laterales:
 *   - emitida → cancelada (con motivo SAT 01-04, BR-N305)
 *   - parcialmente_pagada → cancelada (mismo motivo, BR-N309)
 *   - pagada → cancelada (con motivo 01-04 — poco común, BR-N305)
 *   - vencida: NO es transición manual. La asigna `markVencida` (job).
 *   - borrador → borrador: idempotente (preview).
 */
export type InvoiceTransitionError =
  | "INVOICE_NOT_FOUND"
  | "INVOICE_INVALID_TRANSITION"
  | "INVOICE_TIMBRAR_DRAFT_ONLY"
  | "INVOICE_HAS_APPLICATIONS";

export function canTransitionInvoice(
  current: InvoiceStatus | string,
  target: InvoiceStatus | string,
  opts: {
    hasApplications?: boolean;
    cancelMotiveSat?: CancelMotiveSat | string | null;
  } = {},
): { ok: true } | { ok: false; code: InvoiceTransitionError; reason?: string } {
  if (!INVOICE_STATUSES.includes(current as InvoiceStatus)) {
    return { ok: false, code: "INVOICE_NOT_FOUND" };
  }
  if (!INVOICE_STATUSES.includes(target as InvoiceStatus)) {
    return { ok: false, code: "INVOICE_INVALID_TRANSITION", reason: "Estado destino inválido" };
  }
  if (current === target) {
    return { ok: false, code: "INVOICE_INVALID_TRANSITION", reason: "Mismo estado" };
  }
  if (current === "vencida" || current === "cancelada") {
    return {
      ok: false,
      code: "INVOICE_INVALID_TRANSITION",
      reason: "vencida/cancelada son terminales",
    };
  }
  if (target === "vencida") {
    return {
      ok: false,
      code: "INVOICE_INVALID_TRANSITION",
      reason: "vencida sólo la asigna markVencida (job)",
    };
  }
  switch (target) {
    case "emitida":
      if (current !== "borrador") {
        return {
          ok: false,
          code: "INVOICE_TIMBRAR_DRAFT_ONLY",
          reason: "Sólo se timbra un borrador",
        };
      }
      return { ok: true };
    case "parcialmente_pagada":
      if (current === "borrador") {
        return {
          ok: false,
          code: "INVOICE_INVALID_TRANSITION",
          reason: "Una borrador no puede pasar a parcialmente_pagada",
        };
      }
      return { ok: true };
    case "pagada":
      if (current === "borrador") {
        return {
          ok: false,
          code: "INVOICE_INVALID_TRANSITION",
          reason: "Una borrador no puede pasar a pagada",
        };
      }
      return { ok: true };
    case "cancelada": {
      const motivo = opts.cancelMotiveSat ?? null;
      if (!motivo || !CANCEL_MOTIVES_SAT.includes(motivo as CancelMotiveSat)) {
        return {
          ok: false,
          code: "INVOICE_INVALID_TRANSITION",
          reason: "Falta motivo SAT 01-04 (BR-N305)",
        };
      }
      if (opts.hasApplications) {
        return {
          ok: false,
          code: "INVOICE_HAS_APPLICATIONS",
          reason: "Reversar/reasignar aplicaciones de cobro antes (BR-N309)",
        };
      }
      return { ok: true };
    }
    default:
      return {
        ok: false,
        code: "INVOICE_INVALID_TRANSITION",
        reason: "Transición no soportada",
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Vencida (BR-N307) + saldo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determina si una factura está vencida en una fecha de referencia.
 * `due_date < refDate && paid_cents < total_cents` (BR-N307). El
 * servicio `markVencida` itera y actualiza en batch.
 */
export function isInvoiceVencida(input: {
  dueDate: Date | string;
  paidCents: number;
  totalCents: number;
  refDate?: Date;
}): boolean {
  const ref = input.refDate ?? new Date();
  const due = typeof input.dueDate === "string" ? new Date(input.dueDate) : input.dueDate;
  if (Number.isNaN(due.getTime())) return false;
  // Compara por día (no hora). `due < ref` significa "venció antes de hoy".
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const refDay = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
  return dueDay < refDay && input.paidCents < input.totalCents;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) Aplicaciones de cobro (BR-N308 / BR-012)
// ─────────────────────────────────────────────────────────────────────────────

export type ApplicationCheckError =
  | "APPLICATION_EXCEEDS_BALANCE"
  | "INVOICE_TIMBRAR_DRAFT_ONLY"
  | "INVOICE_NOT_FOUND";

/**
 * Valida que una aplicación de cobro (compat con SPEC-008) no exceda
 * el saldo (BR-N308 / BR-012). Devuelve el nuevo `paid_cents` que la
 * factura debe persistir.
 */
export function validateInvoiceApplication(input: {
  currentPaidCents: number;
  totalCents: number;
  applyCents: number;
  currentStatus: InvoiceStatus | string;
}):
  | { ok: true; newPaidCents: number; newStatus: InvoiceStatus }
  | { ok: false; code: ApplicationCheckError; reason: string } {
  if (!INVOICE_STATUSES.includes(input.currentStatus as InvoiceStatus)) {
    return { ok: false, code: "INVOICE_NOT_FOUND", reason: "Estado desconocido" };
  }
  if (input.currentStatus === "borrador" || input.currentStatus === "cancelada") {
    return {
      ok: false,
      code: "INVOICE_TIMBRAR_DRAFT_ONLY",
      reason: "Sólo se aplican pagos a facturas emitidas/parciales/pagadas",
    };
  }
  if (input.applyCents <= 0) {
    return {
      ok: false,
      code: "APPLICATION_EXCEEDS_BALANCE",
      reason: "Importe a aplicar debe ser > 0",
    };
  }
  if (input.currentPaidCents + input.applyCents > input.totalCents) {
    return {
      ok: false,
      code: "APPLICATION_EXCEEDS_BALANCE",
      reason: "La aplicación excede el saldo de la factura",
    };
  }
  const newPaid = input.currentPaidCents + input.applyCents;
  const newStatus: InvoiceStatus =
    newPaid === input.totalCents
      ? "pagada"
      : newPaid > 0
        ? "parcialmente_pagada"
        : (input.currentStatus as InvoiceStatus);
  return { ok: true, newPaidCents: newPaid, newStatus };
}

/**
 * Reversión de aplicación de cobro (BR-N309). Devuelve el nuevo
 * `paid_cents` y `status` derivado.
 */
export function revertInvoiceApplication(input: {
  currentPaidCents: number;
  totalCents: number;
  revertCents: number;
  currentStatus: InvoiceStatus | string;
}):
  | { ok: true; newPaidCents: number; newStatus: InvoiceStatus }
  | { ok: false; code: ApplicationCheckError; reason: string } {
  if (input.revertCents <= 0) {
    return {
      ok: false,
      code: "APPLICATION_EXCEEDS_BALANCE",
      reason: "Reversión debe ser > 0",
    };
  }
  if (input.revertCents > input.currentPaidCents) {
    return {
      ok: false,
      code: "APPLICATION_EXCEEDS_BALANCE",
      reason: "Reversión excede lo aplicado",
    };
  }
  const newPaid = input.currentPaidCents - input.revertCents;
  // Determinamos status:
  // - si estaba pagada → vuelve a emitida (no a parcialmente_pagada)
  //   (BR-N306: pagada se rompe porque la reversión implica reasignar).
  // - si estaba parcialmente_pagada y queda en 0 → emitida.
  let newStatus: InvoiceStatus;
  if (input.currentStatus === "pagada") {
    newStatus = "emitida";
  } else if (newPaid === 0) {
    newStatus = "emitida";
  } else {
    newStatus = "parcialmente_pagada";
  }
  return { ok: true, newPaidCents: newPaid, newStatus };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) Cancelación · motivo SAT (BR-N305)
// ─────────────────────────────────────────────────────────────────────────────

export function isValidCancelMotive(
  motive: string | null | undefined,
): motive is CancelMotiveSat {
  if (!motive) return false;
  return (CANCEL_MOTIVES_SAT as readonly string[]).includes(motive);
}

export function validateCancelReason(reason: string): {
  ok: true;
} | { ok: false; reason: string } {
  if (typeof reason !== "string" || reason.length < INVOICE_CANCEL_REASON_MIN_LENGTH) {
    return {
      ok: false,
      reason: `Motivo de cancelación debe tener ≥${INVOICE_CANCEL_REASON_MIN_LENGTH} caracteres`,
    };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6) Calendar · 7 estados visuales (BR-N312)
// ─────────────────────────────────────────────────────────────────────────────

export const CALENDAR_VISUAL_STATUS_COUNT = 7;

/**
 * Devuelve el estado visual del calendario (BR-N312). Si la factura
 * está emitida, suma `programada` derivada de `invoice_schedules`
 * (≠ la factura en sí). El calendario agrega 7 estados visuales:
 *  `borrador | programada | emitida | parcialmente_pagada | pagada |
 *   vencida | cancelada`.
 */
export function invoiceCalendarVisualStatus(input: {
  status: InvoiceStatus;
  hasFutureSchedule?: boolean;
}): InvoiceCalendarVisualStatus {
  if (input.hasFutureSchedule && input.status === "borrador") {
    return "programada";
  }
  if ((INVOICE_CALENDAR_VISUAL_STATUSES as readonly string[]).includes(input.status)) {
    return input.status;
  }
  return "borrador";
}

// ─────────────────────────────────────────────────────────────────────────────
// 7) Schedules · validación (BR-N310)
// ─────────────────────────────────────────────────────────────────────────────

export type ScheduleValidationError =
  | "INVOICE_SCHEDULE_NOT_FOUND"
  | "INVOICE_SCHEDULE_DUPLICATED"
  | "INVOICE_BUILD_INVALID";

export function validateScheduleInput(input: {
  scheduledDate: Date | string;
  amountCents: number;
  autoOrDraft: ScheduleAutoOrDraftKind | string;
  orderId?: string | null;
  subscriptionId?: string | null;
}):
  | { ok: true }
  | { ok: false; code: ScheduleValidationError; reason: string } {
  if (!input.scheduledDate || Number.isNaN(new Date(input.scheduledDate).getTime())) {
    return { ok: false, code: "INVOICE_BUILD_INVALID", reason: "Fecha programada inválida" };
  }
  if (typeof input.amountCents !== "number" || input.amountCents <= 0) {
    return {
      ok: false,
      code: "INVOICE_BUILD_INVALID",
      reason: "Importe del schedule debe ser > 0",
    };
  }
  if (
    !input.autoOrDraft ||
    !(SCHEDULE_AUTO_OR_DRAFT_KINDS as readonly string[]).includes(input.autoOrDraft)
  ) {
    return {
      ok: false,
      code: "INVOICE_BUILD_INVALID",
      reason: "autoOrDraft debe ser 'auto' o 'draft'",
    };
  }
  if (!input.orderId && !input.subscriptionId) {
    return {
      ok: false,
      code: "INVOICE_BUILD_INVALID",
      reason: "orderId o subscriptionId es obligatorio",
    };
  }
  return { ok: true };
}

export function nextScheduleJobKey(input: {
  scheduleId: string;
  scheduledDate: Date | string;
}): string {
  const d = typeof input.scheduledDate === "string"
    ? new Date(input.scheduledDate)
    : input.scheduledDate;
  const isoDay = d.toISOString().slice(0, 10);
  return `${input.scheduleId}|${isoDay}`;
}

export function isScheduleStatusTerminal(
  status: InvoiceScheduleStatus | string,
): boolean {
  return status === "executed" || status === "skipped";
}

// ─────────────────────────────────────────────────────────────────────────────
// 8) ZIP mensual · sólo facturas activas (DEC-FUN-38/26, BR-N311)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filtra el conjunto de facturas a incluir en el ZIP del contador:
 * sólo facturas **activas** (no canceladas) del mes pedido (DEC-FUN-38).
 * `vencida` es activa (saldo pendiente). `pagada`/`parcialmente_pagada`
 * son activas. `borrador` se incluye si Frank lo requiere (default
 * false — sólo se timbran al cierre del periodo contable).
 */
export function selectZipFacturas<
  T extends { id: string; status: InvoiceStatus | string; dueDate: Date | string },
>(input: {
  facturas: T[];
  year: number;
  month: number; // 1-12
  includeBorrador?: boolean;
}): T[] {
  const includeDraft = input.includeBorrador ?? false;
  const start = new Date(Date.UTC(input.year, input.month - 1, 1));
  const end = new Date(Date.UTC(input.year, input.month, 1));
  return input.facturas.filter((f) => {
    if (f.status === "cancelada") return false;
    if (f.status === "borrador" && !includeDraft) return false;
    const due = typeof f.dueDate === "string" ? new Date(f.dueDate) : f.dueDate;
    if (Number.isNaN(due.getTime())) return false;
    return due >= start && due < end;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 9) UUID CFDI v4 (BR-N304/371)
// ─────────────────────────────────────────────────────────────────────────────

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidCfdiUuid(uuid: string | null | undefined): boolean {
  if (!uuid) return false;
  return UUID_V4_REGEX.test(uuid.trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// 10) Factura borrador desde renovación (BR-N406, consumido por SPEC-011)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye una factura en `borrador` a partir de los parámetros de
 * renovación de suscripción que SPEC-011 entrega. Devuelve el input
 * listo para `invoices.create` (no llama a BD).
 */
export function buildDraftFromSubscriptionRenewal(input: {
  code: string;
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
  createdBy: string;
}): {
  ok: true;
  value: {
    code: string;
    subscriptionId: string;
    clientId: string;
    fiscalDataSnapshot: Record<string, unknown>;
    concept: unknown;
    dueDate: Date;
    status: "borrador";
    createdBy: string;
  };
} | { ok: false; code: "INVOICE_BUILD_INVALID" | "INVOICE_FISCAL_DATA_REQUIRED"; reason: string } {
  if (!input.code || input.code.length === 0) {
    return { ok: false, code: "INVOICE_BUILD_INVALID", reason: "Falta código de factura" };
  }
  if (!input.subscriptionId || !input.clientId) {
    return {
      ok: false,
      code: "INVOICE_BUILD_INVALID",
      reason: "subscriptionId y clientId son obligatorios",
    };
  }
  if (
    !input.fiscalDataSnapshot ||
    typeof input.fiscalDataSnapshot !== "object" ||
    Object.keys(input.fiscalDataSnapshot).length === 0
  ) {
    return {
      ok: false,
      code: "INVOICE_FISCAL_DATA_REQUIRED",
      reason: "Faltan datos fiscales del cliente (snapshot)",
    };
  }
  const built = buildCfdiConcept([
    {
      claveProdServ: input.concept.claveProdServ,
      descripcion: input.concept.descripcion,
      cantidad: input.concept.cantidad,
      valorUnitarioCents: input.concept.valorUnitarioCents,
    },
  ]);
  if (!built.ok) {
    // Narrow al dominio declarado en esta función (no exponemos
    // INVOICE_TIMBRAR_DRAFT_ONLY aquí, que sólo aplica a `timbrar`).
    return { ok: false, code: "INVOICE_BUILD_INVALID", reason: built.reason };
  }
  const due =
    typeof input.dueDate === "string" ? new Date(input.dueDate) : input.dueDate;
  if (Number.isNaN(due.getTime())) {
    return { ok: false, code: "INVOICE_BUILD_INVALID", reason: "Fecha de vencimiento inválida" };
  }
  return {
    ok: true,
    value: {
      code: input.code,
      subscriptionId: input.subscriptionId,
      clientId: input.clientId,
      fiscalDataSnapshot: input.fiscalDataSnapshot,
      concept: {
        lineas: built.concept.lineas,
        totals: built.concept.totals,
      },
      dueDate: due,
      status: "borrador",
      createdBy: input.createdBy,
    },
  };
}
