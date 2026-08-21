/**
 * Router raíz tRPC.
 */
import { router } from "./trpc";
import { authRouter } from "./routers/auth";
import { plataformaRouter } from "./routers/plataforma";

export const appRouter = router({
  auth: authRouter,
  plataforma: plataformaRouter,
});

export type AppRouter = typeof appRouter;
