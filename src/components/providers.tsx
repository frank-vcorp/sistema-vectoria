"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { ThemeProvider } from "next-themes";
import * as React from "react";
import { trpc } from "@/lib/trpc";

/**
 * Política de reintentos para queries tRPC.
 *
 * React Query reintenta por defecto 3 veces con backoff exponencial
 * (hasta ≈7 s en el peor caso). Para una SPA contra nuestra propia
 * API eso produce esperas inútiles:
 *
 *   1. 401/403 (sesión ausente o insuficiente): reintentar no
 *      recupera credenciales; sólo retrasa la rama de error de la UI.
 *   2. 4xx en general (NOT_FOUND, BAD_REQUEST, CONFLICT, …): el
 *      estado del servidor no cambia sólo por volver a llamar.
 *
 * Política:
 *   - NO reintentar cuando `error.data.httpStatus` ∈ {400..499}
 *     (extraído por el errorFormatter del servidor cuando el error
 *     viene de un DomainError con `statusCode`).
 *   - NO reintentar cuando el mensaje canónico del middleware
 *     `protectedProcedure` ("No autenticado") aparece: cubre el caso
 *     en que el formatter no extrae `httpStatus` para TRPCError
 *     lanzados directamente por middlewares.
 *   - Permitir 1 reintento para el resto (5xx transitorio, red):
 *     un solo intento basta para absorber picos breves sin ocultar
 *     errores persistentes (tras el reintento el error sigue
 *     llegando a `query.error`).
 *
 * El comportamiento de datos y errores permanece idéntico desde el
 * punto de vista del consumidor: los errores se siguen viendo en
 * `query.error` con la misma forma; sólo desaparece la espera de ≈7 s
 * sobre 4xx.
 */
function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof TRPCClientError) {
    const data = error.data as { httpStatus?: number | null } | null;
    const httpStatus = data?.httpStatus;
    if (
      typeof httpStatus === "number" &&
      httpStatus >= 400 &&
      httpStatus < 500
    ) {
      return false;
    }
    // Respaldo para TRPCError lanzados directamente por middlewares
    // (p.ej. protectedProcedure) cuyo httpStatus queda null en el
    // formatter. Mensaje canónico: "No autenticado".
    if (/No autenticado|Unauthorized|Forbidden/i.test(error.message)) {
      return false;
    }
  }
  return failureCount < 1;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: shouldRetryQuery,
          },
        },
      }),
  );
  const [trpcClient] = React.useState(() =>
    trpc.createClient({ links: [httpBatchLink({ url: "/api/trpc" })] }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </trpc.Provider>
    </ThemeProvider>
  );
}
