/**
 * Helpers puros del módulo Orden de Servicio (SPEC-004 §4/§5/§6).
 *
 * Sin acceso a BD ni sesión. Funciones deterministas testeables en
 * aislamiento. Los servicios (`createOrdersService()`) los invocan y
 * los tests Vitest los importan directamente.
 *
 * Reglas cubiertas:
 *  - BR-N244 · umbral ≥90% de anticipo para autorizar (constante
 *    `OS_ADVANCE_REQUIRED_PCT`; configurabilidad cerrada por Frank).
 *  - BR-N017 / BR-N243 · monto OC debe coincidir con el total vendido
 *    y, si está presente, requiere PDF (file_id).
 *  - BR-N249 / BR-N393 / BR-N394 · cierre administrativo: saldo cero
 *    o excepción Director + factura final emitida.
 *  - BR-N250 · motivo obligatorio (≥3 caracteres) para pausa y
 *    cancelación.
 *  - AC-3 · contrato del evento `os.authorized_to_start` que consume
 *    SPEC-005/SPEC-011: expone `plUserId` y `tipoCobro`.
 */
import {
  OS_ADVANCE_REQUIRED_PCT,
  OS_REASON_MIN_LENGTH,
  type OrderStatus,
  type TipoCobro,
} from "@/shared/enums";

/**
 * BR-N244 · Verifica si el anticipo cobrado alcanza el umbral para
 * autorizar. `requiredPct` es un porcentaje 0-100. Devuelve
 * `{ ok, ratio, missingCents }` para uso diagnóstico en UI/audit.
 *
 * Caso típico: `soldTotalCents = 200_000` (centavos), `advancePaidCents
 * = 180_000` ⇒ ratio=0.9, ok=true. Por debajo: `ratio<0.9`, ok=false.
 */
export interface AdvanceCheckResult {
  ok: boolean;
  requiredPct: number;
  ratio: number;
  /** Centavos faltantes para alcanzar el umbral (≥0 cuando `!ok`). */
  missingCents: number;
}

export function checkAdvanceThreshold(input: {
  soldTotalCents: number;
  advancePaidCents: number;
  requiredPct?: number;
}): AdvanceCheckResult {
  const requiredPct = input.requiredPct ?? OS_ADVANCE_REQUIRED_PCT;
  const total = Math.max(0, Math.floor(input.soldTotalCents));
  const paid = Math.max(0, Math.floor(input.advancePaidCents));
  if (total <= 0) {
    // Sin monto vendido no se puede evaluar el umbral. El caller debe
    // garantizar `soldTotalCents > 0` antes de invocar; aún así, si
    // llega 0, se considera faltante.
    return { ok: false, requiredPct, ratio: 0, missingCents: 0 };
  }
  const ratio = paid / total;
  const requiredRatio = requiredPct / 100;
  const ok = ratio >= requiredRatio;
  const missingCents = ok
    ? 0
    : Math.max(0, Math.ceil(total * requiredRatio) - paid);
  return { ok, requiredPct, ratio, missingCents };
}

/**
 * BR-N121 · Si `tipoCobro === "suscripcion"`, la OS requiere pago
 * inicial antes de autorizar. Devuelve `true` cuando se exige el
 * pago inicial. El caller es responsable de validar el monto
 * cobrado contra `cotizacion.requires_initial_payment`.
 */
export function subscriptionRequiresInitialPayment(
  tipoCobro: TipoCobro,
): boolean {
  return tipoCobro === "suscripcion";
}

/**
 * BR-017 / BR-N243 · Reglas de validación de la OC:
 *  - Si la OS NO requiere OC (sin `ocNumber`/`ocAmountCents`) ⇒ OK.
 *  - Si se cargan campos OC, `ocAmountCents` debe coincidir con
 *    `soldTotalCents` y `ocFileId` debe estar presente (PDF).
 */
export interface OcValidationInput {
  ocNumber?: string | null;
  ocAmountCents?: number | null;
  ocFileId?: string | null;
  soldTotalCents: number;
}

export type OcValidationResult =
  | { ok: true; missingPdf: false }
  | { ok: true; missingPdf: false }
  | { ok: false; reason: "OC_MISMATCH"; expectedCents: number; gotCents: number }
  | { ok: false; reason: "OC_FILE_REQUIRED" };

export function validateOc(input: OcValidationInput): OcValidationResult {
  const hasAny =
    !!input.ocNumber || input.ocAmountCents != null || !!input.ocFileId;
  if (!hasAny) {
    return { ok: true, missingPdf: false };
  }
  if (input.ocAmountCents == null) {
    // Presentó número/archivo sin monto ⇒ debe haber monto.
    return {
      ok: false,
      reason: "OC_MISMATCH",
      expectedCents: Math.max(0, Math.floor(input.soldTotalCents)),
      gotCents: 0,
    };
  }
  if (input.ocAmountCents !== input.soldTotalCents) {
    return {
      ok: false,
      reason: "OC_MISMATCH",
      expectedCents: Math.max(0, Math.floor(input.soldTotalCents)),
      gotCents: Math.max(0, Math.floor(input.ocAmountCents)),
    };
  }
  if (!input.ocFileId) {
    return { ok: false, reason: "OC_FILE_REQUIRED" };
  }
  return { ok: true, missingPdf: false };
}

/**
 * BR-N250 · motivo obligatorio. Valida longitud mínima (≥3). Devuelve
 * `null` si pasa, o un código de error.
 */
export type ReasonValidation =
  | { ok: true }
  | { ok: false; reason: "OS_PAUSE_REASON_REQUIRED" }
  | { ok: false; reason: "OS_CANCEL_REASON_REQUIRED" };

export function validateOsReason(
  raw: string | null | undefined,
  kind: "pause" | "cancel",
): ReasonValidation {
  const text = (raw ?? "").trim();
  if (text.length < OS_REASON_MIN_LENGTH) {
    return {
      ok: false,
      reason:
        kind === "pause" ? "OS_PAUSE_REASON_REQUIRED" : "OS_CANCEL_REASON_REQUIRED",
    };
  }
  return { ok: true };
}

/**
 * BR-N249 / BR-N394 · evalúa el saldo y la excepción Director para
 * el cierre administrativo. Devuelve la lista de errores aplicables
 * (puede haber más de uno: saldo y/o factura final).
 */
export interface CloseAdministrativeInput {
  outstandingBalanceCents: number;
  finalInvoiceIssued: boolean;
  directorException: boolean;
}

export type CloseAdministrativeError =
  | "OUTSTANDING_BALANCE"
  | "FINAL_INVOICE_REQUIRED";

export function evaluateCloseAdministrative(
  input: CloseAdministrativeInput,
): { ok: true } | { ok: false; errors: CloseAdministrativeError[] } {
  const errors: CloseAdministrativeError[] = [];
  const balance = Math.max(0, Math.floor(input.outstandingBalanceCents));
  if (balance > 0 && !input.directorException) {
    errors.push("OUTSTANDING_BALANCE");
  }
  if (!input.finalInvoiceIssued) {
    errors.push("FINAL_INVOICE_REQUIRED");
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * AC-3 / §3.1 · contrato del evento que expone `pl_user_id` y
 * `tipo_cobro`. Esta función **forma** el payload consumido por
 * SPEC-005/SPEC-011; el servicio `authorize` lo emite como
 * `audit.action = "os.authorized_to_start"`.
 *
 * El contrato es estable; cualquier cambio requiere una nueva
 * decisión funcional (DEC-FUN).
 */
export interface OsAuthorizedEvent {
  /** `orders.id`. */
  orderId: string;
  organizationId: string;
  /** SPEC-004 / BR-N245 — **no nulo** al autorizar. */
  plUserId: string;
  /** SPEC-004 / BR-N238 / BR-N405 — consumido por SPEC-011 si `suscripcion`. */
  tipoCobro: TipoCobro;
  /** Copia inmutable del total vendido. */
  soldTotalCents: number;
  /** Snapshot inmutable del alcance (jsonb). */
  soldScopeSnapshot: Record<string, unknown>;
  /** Cotización de origen. */
  cotizacionId: string;
  /** Cliente asociado. */
  clientId: string;
  /** ¿Requiere pago inicial por tipo_cobro? Derivado para SPEC-011. */
  requiresInitialPayment: boolean;
  /** Timestamp ISO 8601 del evento (cuándo se autorizó). */
  authorizedAt: string;
  /** Consumidores canónicos; mantiene el contrato explícito. */
  consumers: {
    projectCreation: "SPEC-005 (universal, BR-N407/N246)";
    subscriptionCreation:
      | "SPEC-011 (condicional a tipo_cobro=suscripcion, BR-N405)"
      | "n/a";
  };
}

export function buildOsAuthorizedEvent(input: {
  orderId: string;
  organizationId: string;
  plUserId: string;
  tipoCobro: TipoCobro;
  soldTotalCents: number;
  soldScopeSnapshot: Record<string, unknown>;
  cotizacionId: string;
  clientId: string;
  authorizedAt: Date;
}): OsAuthorizedEvent {
  return {
    orderId: input.orderId,
    organizationId: input.organizationId,
    plUserId: input.plUserId,
    tipoCobro: input.tipoCobro,
    soldTotalCents: input.soldTotalCents,
    soldScopeSnapshot: input.soldScopeSnapshot,
    cotizacionId: input.cotizacionId,
    clientId: input.clientId,
    requiresInitialPayment: subscriptionRequiresInitialPayment(input.tipoCobro),
    authorizedAt: input.authorizedAt.toISOString(),
    consumers: {
      projectCreation: "SPEC-005 (universal, BR-N407/N246)",
      subscriptionCreation: subscriptionRequiresInitialPayment(input.tipoCobro)
        ? "SPEC-011 (condicional a tipo_cobro=suscripcion, BR-N405)"
        : "n/a",
    },
  };
}

/**
 * BR-N249 · indica si la OS ya está cerrada/cancelada (terminal).
 * Usado por `authorize`, `markInExecution`, `markDelivered` para
 * rechazar transiciones inválidas.
 */
export function isOrderTerminal(status: OrderStatus): boolean {
  return status === "closed" || status === "cancelled";
}

/**
 * SPEC-004 / BR-N249 / BR-N247 · valida la transición de estado de
 * la OS. Devuelve `null` si pasa o el código de error.
 */
export type TransitionError =
  | "ORDER_ALREADY_AUTHORIZED"
  | "ORDER_ALREADY_DELIVERED"
  | "ORDER_ALREADY_CLOSED"
  | "ORDER_ALREADY_CANCELLED"
  | "ORDER_NOT_AUTHORIZABLE"
  | "ORDER_NOT_PAUSED";

export function canTransitionTo(
  current: OrderStatus,
  target: OrderStatus,
): { ok: true } | { ok: false; code: TransitionError } {
  if (isOrderTerminal(current)) {
    if (current === "closed") return { ok: false, code: "ORDER_ALREADY_CLOSED" };
    return { ok: false, code: "ORDER_ALREADY_CANCELLED" };
  }
  switch (target) {
    case "authorized_to_start":
      if (current === "authorized_to_start") {
        return { ok: false, code: "ORDER_ALREADY_AUTHORIZED" };
      }
      if (
        current !== "pending_deposit" &&
        current !== "pending_information" &&
        current !== "paused"
      ) {
        return { ok: false, code: "ORDER_NOT_AUTHORIZABLE" };
      }
      return { ok: true };
    case "in_execution":
      if (current !== "authorized_to_start" && current !== "paused") {
        return { ok: false, code: "ORDER_NOT_AUTHORIZABLE" };
      }
      return { ok: true };
    case "delivered":
      if (current === "delivered") {
        return { ok: false, code: "ORDER_ALREADY_DELIVERED" };
      }
      if (current !== "in_execution" && current !== "paused") {
        return { ok: false, code: "ORDER_NOT_AUTHORIZABLE" };
      }
      return { ok: true };
    case "closed":
      if (current === "closed") return { ok: false, code: "ORDER_ALREADY_CLOSED" };
      if (current === "cancelled") {
        return { ok: false, code: "ORDER_ALREADY_CANCELLED" };
      }
      if (current !== "delivered" && current !== "in_execution") {
        return { ok: false, code: "ORDER_NOT_AUTHORIZABLE" };
      }
      return { ok: true };
    case "paused":
      if (current === "paused") return { ok: false, code: "ORDER_NOT_PAUSED" };
      if (isOrderTerminal(current)) {
        return { ok: false, code: "ORDER_ALREADY_CLOSED" };
      }
      return { ok: true };
    case "pending_deposit":
      // Sólo se vuelve a `pending_deposit` desde `paused` (resume
      // lógico). Transiciones reversas desde estados avanzados están
      // prohibidas.
      if (current !== "paused") {
        return { ok: false, code: "ORDER_NOT_AUTHORIZABLE" };
      }
      return { ok: true };
    case "pending_information":
      // `pending_information` es un estado inicial (cotización con
      // datos faltantes del cliente). Sólo válido desde
      // `pending_deposit` o `paused`.
      if (current !== "pending_deposit" && current !== "paused") {
        return { ok: false, code: "ORDER_NOT_AUTHORIZABLE" };
      }
      return { ok: true };
    default:
      return { ok: false, code: "ORDER_NOT_AUTHORIZABLE" };
  }
}

/** BR-N216 análogo · siguiente código de OS por organización (`OS-NNNNN`). */
export async function nextOrderCode(
  orgId: string,
  dbExecutor: { selectMax: (orgId: string) => Promise<string | null> },
): Promise<string> {
  const last = await dbExecutor.selectMax(orgId);
  if (!last) return "OS-00001";
  const m = /^OS-(\d{1,})$/.exec(last);
  if (!m || !m[1]) return "OS-00001";
  const n = (parseInt(m[1], 10) + 1).toString().padStart(5, "0");
  return `OS-${n}`;
}
