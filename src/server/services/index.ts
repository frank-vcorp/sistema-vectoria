/**
 * Barrel export de servicios de aplicación.
 * Los routers tRPC y los jobs importan desde aquí. La UI **nunca** importa
 * desde aquí directamente (verificado por grep anti-patrón).
 */
export * as authService from "./auth";
export * as auditService from "./audit";
export * as bitacoraService from "./bitacora";
export * as clientesService from "./clientes";
export * as comercialService from "./comercial";
export * as cobranzaService from "./cobranza";
export * as dashboardService from "./dashboard";
export * as adminService from "./admin";
export * as finanzasService from "./finanzas";
export * as ordenServicioService from "./orden-servicio";
export * as proyectosService from "./proyectos";
export * as suscripcionesService from "./suscripciones";
export * as cryptoService from "./crypto";
export * as filesService from "./files";
export * as facturacionService from "./facturacion";
export * as fiscalConfigService from "./fiscal-config";
export * as hasPermissionService from "./hasPermission";
export * as invitationsService from "./invitations";
export * as jobsService from "./jobs";
export * as notificationsService from "./notifications";
export * as sessionService from "./session";
export * as userPermissionsService from "./user-permissions";
