/**
 * Helpers puros del módulo Finanzas y Movimientos (SPEC-009 / B21/B26).
 *
 * Cubre, sin acceso a BD:
 *  - BR-013/N329/N331: transiciones del movimiento (`borrador →
 *    confirmado → conciliado` con laterales `cancelado`/`reversado`).
 *  - BR-N326/327/328: clasificación no operativa de transferencias,
 *    préstamos y retiros.
 *  - BR-N333: validación de imputación de costo directo a proyecto
 *    (sólo con `status ∈ {confirmado, conciliado}`).
 *  - BR-N366: saldo vivo de cuenta = `opening + Σ confirmados tipo
 *    ingreso no operativo + Σ capital entrada − Σ confirmados tipo
 *    gasto no operativo − Σ capital salida`. Transferencias
 *    (BR-N326) y capital (BR-N327/328) se excluyen de
 *    ingreso/gasto operativo pero entran al saldo de la cuenta.
 *  - BR-N278/279/280/281/282/334: fórmulas de costo laboral,
 *    costo directo, costo total, margen y rentabilidad por técnico
 *    (snapshot, centavos enteros).
 *  - BR-N249/N394: `osOutstandingBalance(order, invoices, payments)`
 *    = facturado no cancelado − Σ(cobros confirmados aplicados).
 *
 * Funciones deterministas, testeables en aislamiento. El servicio
 * (con BD) vive en `src/server/services/finanzas/*`.
 */
import {
  ACCOUNT_TYPES,
  NON_OPERATIVE_KINDS,
  TRANSACTION_REVERSE_REASON_MIN_LENGTH,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  type AccountType,
  type NonOperativeKind,
  type TransactionStatus,
  type TransactionType,
} from "@/shared/enums";

// ─────────────────────────────────────────────────────────────────────────────
// 1) Movimientos · transiciones (BR-013/N329/N331)
// ─────────────────────────────────────────────────────────────────────────────

export type TransactionTransitionError =
  | "TRANSACTION_NOT_FOUND"
  | "TRANSACTION_INVALID_TRANSITION"
  | "RECONCILED_IMMUTABLE"
  | "REVERSE_REASON_REQUIRED";

/**
 * Línea principal:
 *   borrador → confirmado → conciliado (inmutable, BR-013)
 * Laterales:
 *   - `cancelado`: en `borrador`/`confirmado` con motivo.
 *   - `reversado`: en `confirmado`/`conciliado` con motivo (BR-N329/014).
 *
 * Reglas:
 *  - `conciliado` no se edita ni elimina (BR-013). Toda corrección va
 *    por `reverso` con motivo.
 *  - `reversado` es terminal.
 *  - `reversado` exige motivo ≥3 caracteres (BR-N329).
 */
export function canTransitionTransaction(
  current: TransactionStatus | string,
  target: TransactionStatus | string,
  opts: { reverseReason?: string | null; cancelReason?: string | null } = {},
): { ok: true } | { ok: false; code: TransactionTransitionError; reason?: string } {
  if (!TRANSACTION_STATUSES.includes(current as TransactionStatus)) {
    return { ok: false, code: "TRANSACTION_NOT_FOUND" };
  }
  if (!TRANSACTION_STATUSES.includes(target as TransactionStatus)) {
    return { ok: false, code: "TRANSACTION_INVALID_TRANSITION", reason: "Estado destino inválido" };
  }
  if (current === target) {
    return { ok: false, code: "TRANSACTION_INVALID_TRANSITION", reason: "Mismo estado" };
  }
  if (current === "reversado" || current === "cancelado") {
    return {
      ok: false,
      code: "TRANSACTION_INVALID_TRANSITION",
      reason: "cancelado/reversado son terminales",
    };
  }
  switch (target) {
    case "confirmado":
      if (current !== "borrador") {
        return {
          ok: false,
          code: "TRANSACTION_INVALID_TRANSITION",
          reason: "Sólo se confirma un borrador",
        };
      }
      return { ok: true };
    case "conciliado": {
      if (current !== "confirmado") {
        return {
          ok: false,
          code: "TRANSACTION_INVALID_TRANSITION",
          reason: "Sólo se concilia un confirmado",
        };
      }
      return { ok: true };
    }
    case "cancelado": {
      if (current !== "borrador" && current !== "confirmado") {
        return {
          ok: false,
          code: "TRANSACTION_INVALID_TRANSITION",
          reason: "Sólo se cancela un borrador/confirmado",
        };
      }
      const reason = opts.cancelReason ?? null;
      if (typeof reason !== "string" || reason.length < TRANSACTION_REVERSE_REASON_MIN_LENGTH) {
        return {
          ok: false,
          code: "REVERSE_REASON_REQUIRED",
          reason: `Motivo ≥${TRANSACTION_REVERSE_REASON_MIN_LENGTH} caracteres`,
        };
      }
      return { ok: true };
    }
    case "reversado": {
      const reason = opts.reverseReason ?? null;
      if (typeof reason !== "string" || reason.length < TRANSACTION_REVERSE_REASON_MIN_LENGTH) {
        return {
          ok: false,
          code: "REVERSE_REASON_REQUIRED",
          reason: `Motivo ≥${TRANSACTION_REVERSE_REASON_MIN_LENGTH} caracteres (BR-N329)`,
        };
      }
      return { ok: true };
    }
    default:
      return {
        ok: false,
        code: "TRANSACTION_INVALID_TRANSITION",
        reason: "Transición no soportada",
      };
  }
}

/** `conciliado` no se edita (BR-013). */
export function isReconciledImmutably(
  status: TransactionStatus | string,
): boolean {
  return status === "conciliado";
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Clasificación no operativa (BR-N326/327/328)
// ─────────────────────────────────────────────────────────────────────────────

/** Una transferencia o un capital NO son ingreso ni gasto operativo. */
export function isOperativeTransaction(input: {
  type: TransactionType | string;
  subKind: string | null | undefined;
}): boolean {
  if (input.type === "transferencia" || input.type === "capital") return false;
  // Ingreso/gasto explícitamente operativo; los sub_kind no operativos
  // (pago_proveedor, cobro_cliente) cuentan como operativos a nivel
  // tipo (BR-N326 sólo excluye transferencia y capital explícitamente).
  return true;
}

/**
 * Clasifica si un movimiento se considera "no operativo" para
 * ingreso/gasto. `transferencia_interna` (BR-N326), `prestamo_socio`
 * (BR-N327), `retiro_socio` (BR-N328) ⇒ no operativo.
 */
export function isNonOperativeSubKind(
  subKind: string | null | undefined,
): boolean {
  if (!subKind) return false;
  return (NON_OPERATIVE_KINDS as readonly string[]).includes(subKind);
}

/**
 * Verifica que un `sub_kind` sea válido para el `type` dado. Reglas:
 *  - `transferencia` ⇒ `transferencia_interna` (BR-N326).
 *  - `capital` ⇒ `prestamo_socio` | `retiro_socio` (BR-N327/328).
 *  - `ingreso` ⇒ `cobro_cliente` (movimiento de ingreso desde SPEC-008).
 *  - `gasto` ⇒ `pago_proveedor` (CxP básica, BR-N332).
 *  - `null` permitido para operativos puros.
 */
export function validateSubKind(input: {
  type: TransactionType | string;
  subKind: string | null | undefined;
}): { ok: true } | { ok: false; code: "INVALID_SUB_KIND"; reason: string } {
  const subKind = input.subKind ?? null;
  if (!subKind) return { ok: true };
  if (!(NON_OPERATIVE_KINDS as readonly string[]).includes(subKind)) {
    return { ok: false, code: "INVALID_SUB_KIND" as never, reason: `subKind inválido: ${subKind}` };
  }
  const map: Record<TransactionType, NonOperativeKind[]> = {
    ingreso: ["cobro_cliente"],
    gasto: ["pago_proveedor"],
    transferencia: ["transferencia_interna"],
    capital: ["prestamo_socio", "retiro_socio"],
  };
  const allowed = map[input.type as TransactionType] ?? [];
  if (!(allowed as readonly string[]).includes(subKind)) {
    return {
      ok: false,
      code: "INVALID_SUB_KIND" as never,
      reason: `subKind '${subKind}' no aplica a type='${input.type}'`,
    };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Costo directo (BR-N333)
// ─────────────────────────────────────────────────────────────────────────────

export type DirectCostValidationError = "COST_NOT_CONFIRMED" | "TRANSACTION_NOT_FOUND";

export function isTransactionAdmittedForDirectCost(
  status: TransactionStatus | string,
): boolean {
  return status === "confirmado" || status === "conciliado";
}

export function validateDirectCostInput(input: {
  amountCents: number;
  transactionStatus: TransactionStatus | string;
  projectId: string;
}): { ok: true } | { ok: false; code: DirectCostValidationError; reason: string } {
  if (typeof input.amountCents !== "number" || input.amountCents <= 0) {
    return { ok: false, code: "COST_NOT_CONFIRMED", reason: "Monto debe ser > 0" };
  }
  if (!isTransactionAdmittedForDirectCost(input.transactionStatus)) {
    return {
      ok: false,
      code: "COST_NOT_CONFIRMED",
      reason: "Sólo se imputa con movimiento confirmado o conciliado (BR-N333)",
    };
  }
  if (!input.projectId) {
    return { ok: false, code: "TRANSACTION_NOT_FOUND", reason: "projectId requerido" };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) Saldo de cuenta (BR-N366)
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountBalance {
  accountId: string;
  openingCents: number;
  ingresosCents: number;
  gastosCents: number;
  transferenciasInCents: number;
  transferenciasOutCents: number;
  capitalInCents: number;
  capitalOutCents: number;
  /**
   * Saldo vivo = opening + ingresos − gastos + transferencias_in
   *             − transferencias_out + capital_in − capital_out
   *             (BR-N366).
   */
  balanceCents: number;
}

/**
 * Suma agregada por cuenta (sólo movimientos `confirmado`/`conciliado`,
 * terminales o no). Las transferencias y capital modifican el saldo
 * pero NO cuentan como ingreso/gasto operativo (BR-N326/327/328).
 */
export function computeAccountBalance<
  T extends {
    accountId: string;
    type: TransactionType | string;
    amountCents: number;
    status: TransactionStatus | string;
  },
>(input: {
  openingCents: number;
  transactions: T[];
}): AccountBalance {
  let ingresos = 0;
  let gastos = 0;
  let transferenciasIn = 0;
  let transferenciasOut = 0;
  let capitalIn = 0;
  let capitalOut = 0;
  for (const t of input.transactions) {
    if (t.status !== "confirmado" && t.status !== "conciliado") continue;
    const amount = Math.abs(t.amountCents);
    if (t.type === "ingreso") {
      ingresos += amount;
    } else if (t.type === "gasto") {
      gastos += amount;
    } else if (t.type === "transferencia") {
      // En una transferencia la pata "out" tiene `amountCents<0` y la
      // "in" `>0`; sin signo, sumamos por separado.
      if (t.amountCents >= 0) transferenciasIn += amount;
      else transferenciasOut += amount;
    } else if (t.type === "capital") {
      if (t.amountCents >= 0) capitalIn += amount;
      else capitalOut += amount;
    }
  }
  const balance =
    input.openingCents +
    ingresos -
    gastos +
    transferenciasIn -
    transferenciasOut +
    capitalIn -
    capitalOut;
  return {
    accountId: "",
    openingCents: input.openingCents,
    ingresosCents: ingresos,
    gastosCents: gastos,
    transferenciasInCents: transferenciasIn,
    transferenciasOutCents: transferenciasOut,
    capitalInCents: capitalIn,
    capitalOutCents: capitalOut,
    balanceCents: balance,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) Costos / margen / rentabilidad (BR-N278..N282, ADR-20260817-12)
// ─────────────────────────────────────────────────────────────────────────────

export interface TimeEntryCostInput {
  hours: number;
  costPerHourCents: number;
  /** técnico que registra (userId). */
  userId: string;
  projectId: string;
}

export interface ProjectTechnicianBreakdown {
  userId: string;
  hoursTotal: number;
  costCents: number;
  /** margen parcial si el proyecto tiene importe vendido. */
  marginCents: number | null;
}

export interface ProjectCostSummary {
  projectId: string;
  laborCostCents: number;
  directCostCents: number;
  totalCostCents: number;
  soldTotalCents: number | null;
  /** BR-N281 · margen bruto = vendido − costo total (si vendido). */
  marginCents: number | null;
  byTechnician: ProjectTechnicianBreakdown[];
}

/**
 * BR-N278/334 · costo laboral = Σ horas × snapshot (inmutable).
 * No recalcula con cambios de tarifa actual (defensa del histórico).
 */
export function computeLaborCost(
  entries: TimeEntryCostInput[],
): { total: number; byUser: Map<string, number>; byUserHours: Map<string, number> } {
  const total = entries.reduce(
    (acc, e) => acc + Math.round(e.hours * e.costPerHourCents),
    0,
  );
  const byUser = new Map<string, number>();
  const byUserHours = new Map<string, number>();
  for (const e of entries) {
    byUser.set(e.userId, (byUser.get(e.userId) ?? 0) + Math.round(e.hours * e.costPerHourCents));
    byUserHours.set(e.userId, (byUserHours.get(e.userId) ?? 0) + e.hours);
  }
  return { total, byUser, byUserHours };
}

/**
 * BR-N279/333 · costo directo = Σ direct_costs cuyo transaction está
 * confirmado o conciliado. El servicio filtra antes de llamar.
 */
export function computeDirectCost(
  directCosts: Array<{ amountCents: number }>,
): number {
  return directCosts.reduce((acc, d) => acc + d.amountCents, 0);
}

/**
 * BR-N280/281/282 · costo total = laboral + directo. Margen = vendido
 * − costo total. Rentabilidad por técnico: Σ sus horas × snapshot.
 */
export function buildProjectCostSummary(input: {
  projectId: string;
  laborCostCents: number;
  directCostCents: number;
  soldTotalCents: number | null;
  timeEntries: TimeEntryCostInput[];
}): ProjectCostSummary {
  const total = input.laborCostCents + input.directCostCents;
  const margin =
    input.soldTotalCents === null ? null : input.soldTotalCents - total;

  // Rentabilidad por técnico (DEC-FUN-25, BR-N282).
  const laborByUser = new Map<string, number>();
  const hoursByUser = new Map<string, number>();
  for (const e of input.timeEntries) {
    laborByUser.set(
      e.userId,
      (laborByUser.get(e.userId) ?? 0) + Math.round(e.hours * e.costPerHourCents),
    );
    hoursByUser.set(e.userId, (hoursByUser.get(e.userId) ?? 0) + e.hours);
  }

  // Para el margen por técnico usamos la prorrata de horas:
  // `técnico_margen = (sus_horas / total_horas) × (vendido − costo_total)`,
  // sólo si vendido es no nulo y total_horas > 0.
  const totalHours = input.timeEntries.reduce((acc, e) => acc + e.hours, 0);
  const byTechnician: ProjectTechnicianBreakdown[] = [];
  for (const [userId, cost] of laborByUser) {
    const hours = hoursByUser.get(userId) ?? 0;
    let userMargin: number | null = null;
    if (input.soldTotalCents !== null && totalHours > 0) {
      const ratio = hours / totalHours;
      userMargin = Math.round(margin === null ? 0 : margin * ratio);
    }
    byTechnician.push({
      userId,
      hoursTotal: hours,
      costCents: cost,
      marginCents: userMargin,
    });
  }
  byTechnician.sort((a, b) => b.costCents - a.costCents);

  return {
    projectId: input.projectId,
    laborCostCents: input.laborCostCents,
    directCostCents: input.directCostCents,
    totalCostCents: total,
    soldTotalCents: input.soldTotalCents,
    marginCents: margin,
    byTechnician,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6) Saldo de OS para cierre administrativo (BR-N249/N394)
// ─────────────────────────────────────────────────────────────────────────────

export interface OsBalanceInput {
  /** Facturas no canceladas (en centavos). */
  nonCancelledInvoicedCents: number;
  /**
   * Suma de aplicaciones de cobros **confirmados** a esas facturas
   * (en centavos). Las reversiones se excluyen.
   */
  confirmedPaidCents: number;
  /** Pagos de proveedor / CxP pendientes (en centavos), default 0. */
  pendingCxpCents?: number;
  /** Comisiones a pagar pendientes (en centavos), default 0. */
  pendingCommissionsCents?: number;
}

/**
 * BR-N249 · saldo total pendiente = (facturado no cancelado − cobrado
 * confirmado aplicado) + CxP pendientes + comisiones pendientes.
 * SPEC-004 consume esto para validar `closed` (saldo = 0 o
 * excepción Director).
 */
export function computeOsOutstandingBalance(input: OsBalanceInput): number {
  const pendingCxp = input.pendingCxpCents ?? 0;
  const pendingComm = input.pendingCommissionsCents ?? 0;
  return (
    input.nonCancelledInvoicedCents -
    input.confirmedPaidCents +
    pendingCxp +
    pendingComm
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7) Reporte: vendido / facturado / cobrado (BR-015) separados
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectFinancialReport {
  soldTotalCents: number;
  invoicedTotalCents: number; // no cancelado
  collectedTotalCents: number; // confirmado aplicado
  outstandingBalanceCents: number;
}

/**
 * BR-015 · vendido (OS), facturado no cancelado (CFDI), cobrado
 * confirmado (aplicado). Se muestran por separado.
 */
export function buildProjectFinancialReport(input: {
  soldTotalCents: number;
  nonCancelledInvoicedCents: number;
  confirmedPaidCents: number;
  pendingCxpCents?: number;
  pendingCommissionsCents?: number;
}): ProjectFinancialReport {
  const outstanding = computeOsOutstandingBalance({
    nonCancelledInvoicedCents: input.nonCancelledInvoicedCents,
    confirmedPaidCents: input.confirmedPaidCents,
    ...(input.pendingCxpCents !== undefined
      ? { pendingCxpCents: input.pendingCxpCents }
      : {}),
    ...(input.pendingCommissionsCents !== undefined
      ? { pendingCommissionsCents: input.pendingCommissionsCents }
      : {}),
  });
  return {
    soldTotalCents: input.soldTotalCents,
    invoicedTotalCents: input.nonCancelledInvoicedCents,
    collectedTotalCents: input.confirmedPaidCents,
    outstandingBalanceCents: outstanding,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8) Validación defensiva de cuentas (helper de servicio)
// ─────────────────────────────────────────────────────────────────────────────

export function isAccountTypeValid(t: string | null | undefined): t is AccountType {
  if (!t) return false;
  return (ACCOUNT_TYPES as readonly string[]).includes(t);
}

export function isTransactionTypeValid(t: string | null | undefined): t is TransactionType {
  if (!t) return false;
  return (TRANSACTION_TYPES as readonly string[]).includes(t);
}
