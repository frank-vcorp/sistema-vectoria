/**
 * Barrel del módulo de servicios Dashboard / Admin / Bitácora
 * (SPEC-010). Routers tRPC y jobs importan desde aquí.
 */
export {
  createDashboardService,
  DASHBOARD_DEFAULT_VIEWS,
  type DashboardService,
  type DashboardData,
  type DashboardPreferencesDTO,
  type DashboardWidgetData,
  type CreateDashboardServiceOptions,
} from "./dashboard-service";

export {
  widgetsForRole,
  isDashboardWidgetCode,
  isDashboardDefaultView,
  filterByView,
  validateLayout,
  defaultLayoutFor,
  canSeePrivateNotes,
  clampPagination,
  aggregateBy,
  WIDGETS_BY_ROLE,
  type AggregateItem,
  type WidgetLayoutEntry,
  type LayoutValidationError,
  type Pagination,
} from "./helpers";
