/**
 * Router raíz tRPC.
 */
import { router } from "./trpc";
import { authRouter } from "./routers/auth";
import { adminRouter, bitacoraRouter, dashboardRouter } from "./routers/dashboard-admin-bitacora";
import { clientesRouter } from "./routers/clientes";
import { comercialRouter } from "./routers/comercial";
import { cobranzaRouter } from "./routers/cobranza";
import { facturacionRouter } from "./routers/facturacion";
import { finanzasRouter } from "./routers/finanzas";
import { ordenServicioRouter } from "./routers/orden-servicio";
import { proyectosRouter } from "./routers/proyectos";
import { plataformaRouter } from "./routers/plataforma";
import { suscripcionesRouter } from "./routers/suscripciones";

export const appRouter = router({
  auth: authRouter,
  admin: adminRouter,
  bitacora: bitacoraRouter,
  clientes: clientesRouter,
  comercial: comercialRouter,
  cobranza: cobranzaRouter,
  dashboard: dashboardRouter,
  facturacion: facturacionRouter,
  finanzas: finanzasRouter,
  ordenServicio: ordenServicioRouter,
  proyectos: proyectosRouter,
  plataforma: plataformaRouter,
  suscripciones: suscripcionesRouter,
});

export type AppRouter = typeof appRouter;
