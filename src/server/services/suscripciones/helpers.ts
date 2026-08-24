/**
 * SPEC-011 (Suscripciones · B20a) · Helpers puros sin BD.
 *
 * Estos helpers NO dependen de Drizzle ni del cliente de BD; se
 * prueban en unit tests (`tests/spec-20260817-011.test.ts`) sin
 * requerir PostgreSQL.
 *
 *  - `computePeriodEnd(start, periodicity)`: a partir de una fecha
 *    de inicio y la periodicidad canónica, devuelve el último día
 *    del periodo (inclusive). Maneja correctamente meses de distinta
 *    duración (28/29/30/31) sin desbordes.
 *  - `computeNextPeriodStart(end)`: día siguiente al fin del periodo.
 *  - `canTransition(from, to)`: aplica la matriz BR-N404.
 *  - `validateRenewalPeriodShape`: idempotencia estructural de la
 *    renovación (mismo `period_start` ⇒ no duplicar).
 */

import {
  SUBSCRIPTION_HISTORY_ACTIONS,
  SUBSCRIPTION_PERIODICITIES,
  SUBSCRIPTION_STATUSES,
  type SubscriptionHistoryAction,
  type SubscriptionPeriodicity,
  type SubscriptionStatus,
} from "@/shared/enums";

/** Valida que la periodicidad sea una de las 4 canónicas. */
export function isValidPeriodicity(p: string): p is SubscriptionPeriodicity {
  return (SUBSCRIPTION_PERIODICITIES as readonly string[]).includes(p);
}

/** Valida que el status sea uno de los 4 canónicos. */
export function isValidStatus(s: string): s is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(s);
}

/** Valida que la acción de historial sea canónica. */
export function isValidHistoryAction(a: string): a is SubscriptionHistoryAction {
  return (SUBSCRIPTION_HISTORY_ACTIONS as readonly string[]).includes(a);
}

/**
 * Calcula el fin del periodo (inclusive) sumando N meses a la fecha
 * de inicio, donde N depende de la periodicidad. La regla canónica:
 *  - `mensual` → +1 mes, día -1 (siguiente mes menos 1 día = fin del
 *    mes de inicio).
 *  - `trimestral` → +3 meses -1 día.
 *  - `semestral` → +6 meses -1 día.
 *  - `anual` → +12 meses -1 día.
 *
 * Si el resultado cae en día inexistente (p.ej. 31-feb), se ajusta al
 * último día del mes (Drizzle `date` lo aceptará). Devuelve la fecha
 * en formato ISO `YYYY-MM-DD` para serialización directa.
 */
export function computePeriodEnd(
  startIso: string,
  periodicity: SubscriptionPeriodicity,
): string {
  const start = parseIsoDate(startIso);
  const months = periodicityToMonths(periodicity);
  const end = addMonths(start, months);
  end.setUTCDate(end.getUTCDate() - 1);
  return toIsoDate(end);
}

/** Día siguiente al fin del periodo (inicio del siguiente). */
export function computeNextPeriodStart(endIso: string): string {
  const end = parseIsoDate(endIso);
  end.setUTCDate(end.getUTCDate() + 1);
  return toIsoDate(end);
}

/** Suma `months` meses a una fecha UTC, sin desbordes. */
function addMonths(d: Date, months: number): Date {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  // Nuevo mes clamped al último día del mes destino.
  const targetYear = year + Math.floor((month + months) / 12);
  const targetMonth = ((month + months) % 12 + 12) % 12;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  const safeDay = Math.min(day, lastDayOfTargetMonth);
  return new Date(Date.UTC(targetYear, targetMonth, safeDay));
}

function periodicityToMonths(p: SubscriptionPeriodicity): number {
  switch (p) {
    case "mensual":
      return 1;
    case "trimestral":
      return 3;
    case "semestral":
      return 6;
    case "anual":
      return 12;
    default:
      throw new Error(`periodicidad desconocida: ${String(p)}`);
  }
}

function parseIsoDate(iso: string): Date {
  // `YYYY-MM-DD` → Date UTC.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) {
    throw new Error(`fecha inválida: ${iso} (esperado YYYY-MM-DD)`);
  }
  const [, y, mo, d] = m;
  return new Date(DateUTC(Number(y), Number(mo) - 1, Number(d)));
}

function DateUTC(y: number, m: number, d: number): number {
  return Date.UTC(y, m, d);
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * SPEC-011 / BR-N404 · matriz de transiciones permitidas.
 *  - `activa↔pausada`: ambas direcciones permitidas.
 *  - `activa→vencida`: vía `markVencida` (job).
 *  - `vencida→activa`: vía `renovar` (reactivación por renovación).
 *  - `activa|pausada→cancelada`: cancelación manual.
 *  - `cancelada→activa`: vía `reactivar` (conserva historial).
 *
 * Devuelve `true` si la transición es válida. `vencer` se modela
 * con `from=activa, to=vencida` para uso del job `markVencida`.
 */
export function canTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): boolean {
  if (from === to) return false;
  if (from === "activa" && to === "pausada") return true;
  if (from === "pausada" && to === "activa") return true;
  if (from === "activa" && to === "vencida") return true; // markVencida
  if (from === "vencida" && to === "activa") return true; // renovar
  if (from === "activa" && to === "cancelada") return true;
  if (from === "pausada" && to === "cancelada") return true;
  if (from === "cancelada" && to === "activa") return true; // reactivar
  return false;
}

/**
 * SPEC-011 / AC-9 · idempotencia de renovación por periodo.
 * Devuelve `true` si `(periodStart, existingPeriodStart)` indican
 * que el periodo ya existe (no duplicar). El servicio caller usa
 * el índice UNIQUE de BD como defensa dura; este helper permite
 * pre-validar antes del INSERT.
 */
export function isSamePeriod(
  periodStartA: string,
  periodStartB: string,
): boolean {
  return periodStartA === periodStartB;
}

/**
 * SPEC-011 / BR-N405 · ¿la OS califica para `subscription_creation`?
 * Una OS califica sólo si `status='authorized_to_start'` y
 * `tipo_cobro='suscripcion'`. Esta función pura NO toca BD; el
 * caller (servicio) lee la fila y aplica el filtro.
 */
export function qualifiesForSubscription(input: {
  orderStatus: string;
  orderTipoCobro: string;
}): boolean {
  return (
    input.orderStatus === "authorized_to_start" &&
    input.orderTipoCobro === "suscripcion"
  );
}

/**
 * SPEC-011 / BR-N404 · valida la razón declarada en pausar /
 * cancelar / reactivar. ≥3 caracteres (alineado con OS).
 */
export function validateReason(raw: string | null | undefined): {
  ok: true;
  text: string;
} | { ok: false; reason: "SUBSCRIPTION_REASON_REQUIRED" } {
  const text = (raw ?? "").trim();
  if (text.length < 3) {
    return { ok: false, reason: "SUBSCRIPTION_REASON_REQUIRED" };
  }
  return { ok: true, text };
}
