/**
 * Helpers de timezone y moneda (AC-24, AC-25).
 * Las fechas se persisten en UTC (PostgreSQL `timestamptz`); se presentan
 * en el timezone de la organización.
 */
import { format, parseISO } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

export const DEFAULT_TZ = "America/Mexico_City";
export const DEFAULT_LOCALE = "es-MX";
export const DEFAULT_CURRENCY = "MXN";

/** Convierte UTC → hora en tz de la organización. */
export function formatInOrgTz(date: Date | string, orgTimezone: string = DEFAULT_TZ): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return formatInTimeZone(d, orgTimezone, "yyyy-MM-dd HH:mm:ss zzz");
}

/** Convierte UTC → Date que representa la hora local en tz de la organización (para orden). */
export function toOrgLocal(date: Date | string, orgTimezone: string = DEFAULT_TZ): Date {
  const d = typeof date === "string" ? parseISO(date) : date;
  return toZonedTime(d, orgTimezone);
}

/** Formato corto es-MX. */
export function formatShortEsMx(date: Date | string, orgTimezone: string = DEFAULT_TZ): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return formatInTimeZone(d, orgTimezone, "dd/MM/yyyy HH:mm");
}

/** Formato de moneda MXN por defecto. */
export function formatCurrency(
  amount: number,
  currency: string = DEFAULT_CURRENCY,
  orgLocale: string = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(orgLocale, {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
  }).format(amount);
}

/** ISO date ahora. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Date ahora. */
export function nowDate(): Date {
  return new Date();
}

/** Calcula un offset de fecha en minutos (para lockout_window). */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** Calcula un offset de fecha en días (para invitaciones). */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60_000);
}

/** Suma segundos. */
export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

/** Date en formato yyyy-MM-dd (clave de job_key determinista diaria). */
export function dayKey(date: Date = new Date(), orgTimezone: string = DEFAULT_TZ): string {
  return formatInTimeZone(date, orgTimezone, "yyyy-MM-dd");
}

/** Year-month (YYYY-MM) para job_key mensual. */
export function monthKey(date: Date = new Date(), orgTimezone: string = DEFAULT_TZ): string {
  return formatInTimeZone(date, orgTimezone, "yyyy-MM");
}

/** Helper de fechas en español. */
export function formatHumanEs(date: Date | string, orgTimezone: string = DEFAULT_TZ): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  const fmt = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone: orgTimezone,
    dateStyle: "long",
    timeStyle: "short",
  });
  return fmt.format(d);
}

// Para conservar formato estándar.
export const __unused_format__ = format;
