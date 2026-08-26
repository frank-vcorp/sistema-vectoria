import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppNavigation } from "@/modules/plataforma/layout/navigation";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { createSessionService } from "@/server/services/session";
import { loadEnv } from "@/lib/env";

const ACCESS_COOKIE_NAME = "vectoria_access";

/**
 * SPEC-001 / AC-71 · Guard server-side del shell de dashboard.
 *
 * IMPL-20260825-40 (P3) · hallazgo de smoke E2E: una visita sin
 * cookie `vectoria_access` o con JWT inválido/expirado renderizaba
 * el shell vacío (AppNavigation + ThemeToggle) antes de que cualquier
 * `useQuery` tRPC devolviera `UNAUTHORIZED`. Esto permitía ver la
 * barra de navegación y daba una sensación de "logueado".
 *
 * El guard reutiliza el mismo `createSessionService` + `loadEnv` +
 * `verifyAccessToken` que el adaptador tRPC. Si la cookie falta,
 * el JWT es inválido/expirado o `loadEnv` falla, redirige a
 * `/login` con `redirect()` de Next.js (`next/navigation`).
 *
 * No inventa identidad: nunca lee un userId/rol del JWT por
 * separado ni acepta un UUID cero. El resultado de
 * `verifyAccessToken` se IGNORA salvo el hecho de que NO lanzó.
 *
 * Sin cambio de API, schema, permisos ni auditoría. Sólo cambia
 * el render inicial del layout.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = cookies();
  const accessToken = jar.get(ACCESS_COOKIE_NAME)?.value ?? null;
  if (!accessToken) {
    redirect("/login");
  }
  let env;
  try {
    env = loadEnv();
  } catch {
    // Env inválido → sin identidad posible. Redirige a login.
    redirect("/login");
  }
  const session = createSessionService({
    sessionSecret: env.SESSION_SECRET,
    accessTtlSeconds: 900,
    refreshTtlDays: 7,
    issuer: env.APP_BASE_URL,
  });
  try {
    await session.verifyAccessToken(accessToken);
  } catch {
    // JWT inválido o expirado → redirige a login (mismo trato que
    // `protectedProcedure` da al tRPC). La cookie queda para que el
    // `/api/auth/refresh` decida si la renueva (best-effort).
    redirect("/login");
  }
  return (
    <div className="min-h-screen lg:flex">
      <AppNavigation />
      <div className="min-w-0 flex-1">
        <header className="hidden h-14 items-center justify-end border-b px-6 lg:flex"><ThemeToggle /></header>
        <main id="main-content" className="mx-auto w-full max-w-7xl p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
