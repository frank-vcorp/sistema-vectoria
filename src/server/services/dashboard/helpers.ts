/**
 * Helpers puros del módulo Dashboard / Admin / Bitácora (SPEC-010
 * / B22/B23). Cubre, sin acceso a BD:
 *  - BR-N344-348: widgets por rol (lista canónica).
 *  - DEC-FUN-28: validación de layout (`{ widget, x, y, w, h }[]`).
 *  - DEC-FUN-30: vista default (`week`/`today`).
 *  - BR-N339: filtro de notas privadas por `ver_notas_privadas`.
 *  - AC-1/AC-8: agregados puros (sin tocar BD).
 *
 * Deterministas, testeables en aislamiento.
 */
import {
  DASHBOARD_DEFAULT_VIEWS,
  DASHBOARD_ROLES,
  DASHBOARD_WIDGET_CODES,
  type DashboardDefaultView,
  type DashboardRole,
  type DashboardWidgetCode,
} from "@/shared/enums";

// ─────────────────────────────────────────────────────────────────────────────
// 1) Widgets por rol (BR-N344-348)
// ─────────────────────────────────────────────────────────────────────────────

export const WIDGETS_BY_ROLE: Record<DashboardRole, DashboardWidgetCode[]> = {
  director: [
    "projects_at_risk",
    "cxc_summary",
    "pnl_summary",
    "audit_recent",
    "cobros_hoy",
    "facturas_vencidas",
  ],
  administrador: [
    "facturas_vencidas",
    "cobros_hoy",
    "pnl_summary",
    "users_recent_activity",
    "audit_recent",
  ],
  vendedor: [
    "prospectos_sin_proxima_accion",
    "cotizaciones_por_vencer",
    "mis_cobros",
    "cxc_summary",
  ],
  lider_proyecto: [
    "actividades_hoy",
    "projects_at_risk",
    "proximas_entregas",
    "bloqueos",
  ],
  programador: ["actividades_hoy", "bloqueos"],
  disenador: ["actividades_hoy", "bloqueos"],
  qa: ["actividades_hoy", "bloqueos"],
};

/**
 * Devuelve la lista canónica de widgets para un rol (BR-N344-348).
 * Si `actorRoleCodes` se pasa, devuelve la intersección del rol
 * principal con los códigos de permisos del actor (DEC-FUN-20/AC-1).
 *
 * Por defecto el caller pasa `actorRoleCodes = []` y devolvemos la
 * lista completa del rol. El servicio filtra widgets según
 * permisos del actor antes de persistir/mostrar.
 */
export function widgetsForRole(input: {
  role: DashboardRole | string;
  actorRoleCodes?: string[];
}): DashboardWidgetCode[] {
  if (!(DASHBOARD_ROLES as readonly string[]).includes(input.role)) return [];
  const base = WIDGETS_BY_ROLE[input.role as DashboardRole];
  if (!input.actorRoleCodes || input.actorRoleCodes.length === 0) return [...base];
  // Regla simple: si el actor no tiene `ver_finanzas`, no ve `pnl_summary`.
  // El servicio aplica más reglas (BR-N344-348) por permisos.
  const filtered = base.filter((w) => {
    if (w === "pnl_summary") return input.actorRoleCodes!.includes("ver_finanzas");
    return true;
  });
  return filtered;
}

export function isDashboardWidgetCode(
  w: string | null | undefined,
): w is DashboardWidgetCode {
  if (!w) return false;
  return (DASHBOARD_WIDGET_CODES as readonly string[]).includes(w);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Vista default (DEC-FUN-30)
// ─────────────────────────────────────────────────────────────────────────────

export function isDashboardDefaultView(
  v: string | null | undefined,
): v is DashboardDefaultView {
  if (!v) return false;
  return (DASHBOARD_DEFAULT_VIEWS as readonly string[]).includes(v);
}

/**
 * Filtra un agregado por vista (`week`/`today`). `refDate` es la
 * fecha de referencia (Date o YYYY-MM-DD). Devuelve el subconjunto
 * cuyas fechas caen dentro de la ventana.
 */
export function filterByView<T extends { date: string | Date }>(
  items: T[],
  view: DashboardDefaultView | string,
  refDate: Date,
): T[] {
  const refDay = startOfDay(refDate).getTime();
  if (!isDashboardDefaultView(view)) return items;
  if (view === "today") {
    const next = refDay + 24 * 60 * 60 * 1000;
    return items.filter((i) => {
      const t = toDate(i.date).getTime();
      return t >= refDay && t < next;
    });
  }
  // week (lunes → domingo de la semana de `refDate`)
  const dow = refDate.getDay();
  const daysSinceMon = (dow + 6) % 7; // 0=lunes
  const weekStart = startOfDay(new Date(refDate)).getTime() - daysSinceMon * 86_400_000;
  const weekEnd = weekStart + 7 * 86_400_000;
  return items.filter((i) => {
    const t = toDate(i.date).getTime();
    return t >= weekStart && t < weekEnd;
  });
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toDate(d: string | Date): Date {
  return typeof d === "string" ? new Date(d) : d;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Layout validation (DEC-FUN-28)
// ─────────────────────────────────────────────────────────────────────────────

export interface WidgetLayoutEntry {
  widget: DashboardWidgetCode | string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LayoutValidationError = "INVALID_LAYOUT";

export function validateLayout(input: {
  widgets: DashboardWidgetCode[] | string[];
  layout: WidgetLayoutEntry[];
}): { ok: true } | { ok: false; code: LayoutValidationError; reason: string } {
  if (!Array.isArray(input.layout)) {
    return { ok: false, code: "INVALID_LAYOUT", reason: "layout debe ser array" };
  }
  const seen = new Set<string>();
  for (const e of input.layout) {
    if (
      typeof e !== "object" ||
      e === null ||
      typeof e.widget !== "string" ||
      typeof e.x !== "number" ||
      typeof e.y !== "number" ||
      typeof e.w !== "number" ||
      typeof e.h !== "number"
    ) {
      return {
        ok: false,
        code: "INVALID_LAYOUT",
        reason: "Cada entrada debe tener widget/x/y/w/h numéricos",
      };
    }
    if (e.w <= 0 || e.h <= 0) {
      return {
        ok: false,
        code: "INVALID_LAYOUT",
        reason: "w/h deben ser > 0",
      };
    }
    seen.add(e.widget);
  }
  // Defensa opcional: cada widget declarado debe estar en `widgets`.
  const declared = new Set((input.widgets ?? []).map((w) => String(w)));
  for (const s of seen) {
    if (!declared.has(s)) {
      return {
        ok: false,
        code: "INVALID_LAYOUT",
        reason: `widget '${s}' no está en la lista de widgets`,
      };
    }
  }
  return { ok: true };
}

/**
 * Genera un layout **por defecto** a partir de una lista de widgets
 * (ordenados por el usuario). Usado en `dashboard.get` cuando el
 * usuario aún no tiene layout persistido (P-010-1 cerrado en `none`).
 * Cada widget ocupa 1 columna × 1 fila; la UI puede reorganizar.
 */
export function defaultLayoutFor(
  widgets: DashboardWidgetCode[] | string[],
): WidgetLayoutEntry[] {
  return widgets.map((w, i) => ({ widget: String(w), x: 0, y: i, w: 1, h: 1 }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) Visibilidad de notas privadas (BR-N339)
// ─────────────────────────────────────────────────────────────────────────────

export type PrivateVisibilityError = "FORBIDDEN_PRIVATE_NOTES";

export function canSeePrivateNotes(actorRoleCodes: string[]): boolean {
  return actorRoleCodes.includes("ver_notas_privadas");
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) Auditoría global · paginación (BR-N373)
// ─────────────────────────────────────────────────────────────────────────────

export interface Pagination {
  limit: number;
  offset: number;
}

export function clampPagination(input: { limit?: number; offset?: number }): Pagination {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  return { limit, offset };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6) Agregados puros del dashboard (AC-8)
// ─────────────────────────────────────────────────────────────────────────────

export interface AggregateItem {
  key: string;
  count: number;
  /** Total agregado (ej. monto en centavos). */
  totalCents?: number;
}

/**
 * Suma agregada simple: cuenta por `key` y suma `totalCents` cuando
 * existe. El dashboard **agrega** (BR-N373), no lista filas crudas.
 */
export function aggregateBy<T extends { key: string; totalCents?: number }>(
  rows: T[],
): AggregateItem[] {
  const map = new Map<string, AggregateItem>();
  for (const r of rows) {
    const cur = map.get(r.key) ?? { key: r.key, count: 0, totalCents: 0 };
    cur.count += 1;
    cur.totalCents = (cur.totalCents ?? 0) + (r.totalCents ?? 0);
    map.set(r.key, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
