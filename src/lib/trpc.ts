/**
 * Cliente tRPC (browser). Sólo se importa desde módulos de UI (no desde
 * servicios — la UI es adaptador; AC-26).
 */
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/trpc/root";

export const trpc = createTRPCReact<AppRouter>();
