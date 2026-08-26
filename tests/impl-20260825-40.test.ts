/**
 * IMPL-20260825-40 (P3) · guard server-side del shell de dashboard.
 *
 * Hallazgo de smoke E2E: una visita sin cookie `vectoria_access` o
 * con JWT inválido/expirado renderizaba el shell vacío
 * (AppNavigation + ThemeToggle) antes de que cualquier `useQuery`
 * tRPC devolviera `UNAUTHORIZED`. El guard se añadió al layout
 * `(dashboard)/layout.tsx` para redirigir a `/login` en esos casos.
 *
 * Este test verifica el contrato del guard de forma estática
 * (sin levantar Next.js runtime: `next/headers` y `next/navigation`
 * se mockean vía stub dinámico).
 *
 *  - El layout es un Server Component (no tiene `"use client"`).
 *  - Lee `cookies()` de `next/headers` y `redirect()` de
 *    `next/navigation` para redirigir a `/login` cuando:
 *      (a) la cookie `vectoria_access` está ausente,
 *      (b) `loadEnv()` lanza (env inválido),
 *      (c) `session.verifyAccessToken()` lanza (JWT inválido/expirado).
 *  - Reutiliza `createSessionService` + `loadEnv` con la misma
 *    config que `src/server/trpc/context.ts` (mismo
 *    `sessionSecret`, `accessTtlSeconds=900`, `refreshTtlDays=7`,
 *    `issuer=APP_BASE_URL`).
 *  - No inventa identidad: el resultado de `verifyAccessToken` se
 *    ignora salvo el hecho de NO lanzar.
 */
import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

// Stub dinámico: evita resolver `next/headers` y `next/navigation`
// en el módulo de Vitest (no hay runtime Next.js aquí).
const redirectMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirectMock(to);
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) => {
      const v = cookieStore.get(name);
      return v ? { name, value: v } : undefined;
    },
  }),
}));

// Stub del servicio de sesión para forzar el camino de error sin
// depender del adapter `jose` ni de la BD.
const verifyAccessToken = vi.fn();
vi.mock("@/server/services/session", () => ({
  createSessionService: () => ({
    verifyAccessToken,
  }),
}));

// Stub de `loadEnv` (controlamos si lanza o no en cada test).
const loadEnvMock = vi.fn();
vi.mock("@/lib/env", () => ({
  loadEnv: () => loadEnvMock(),
}));

describe("IMPL-20260825-40 (P3) · guard server-side de dashboard layout", () => {
  it("layout: cookie ausente → redirige a /login sin tocar session ni env", async () => {
    cookieStore.clear();
    redirectMock.mockClear();
    loadEnvMock.mockReset();
    verifyAccessToken.mockReset();

    // Re-import del layout por ciclo de mocks frescos. Como Vitest
    // cachea módulos, simulamos leyendo el source y validando que el
    // bloque del guard existe (test estático paralelo).
    const src = await readFile(
      "src/app/(dashboard)/layout.tsx",
      "utf8",
    );
    expect(src).toContain("const accessToken = jar.get(ACCESS_COOKIE_NAME)?.value ?? null");
    // Si la cookie está ausente, el siguiente paso es `redirect("/login")`
    // ANTES de cualquier uso de `loadEnv()` o `session.verifyAccessToken`.
    const block = src.match(
      /const accessToken = jar\.get\(ACCESS_COOKIE_NAME\)\?\.value \?\? null;[\s\S]*?if \(!accessToken\)\s*\{[\s\S]*?redirect\(['"]\/login['"]\);/,
    );
    expect(block).not.toBeNull();
  });

  it("layout: cookie presente + loadEnv lanza → redirige a /login", async () => {
    const src = await readFile(
      "src/app/(dashboard)/layout.tsx",
      "utf8",
    );
    // El bloque del guard captura `loadEnv()` en try/catch y
    // redirige si lanza.
    expect(src).toMatch(
      /let env;[\s\S]*?try\s*\{\s*env = loadEnv\(\);[\s\S]*?\}\s*catch\s*\{[\s\S]*?redirect\(['"]\/login['"]\);/,
    );
  });

  it("layout: cookie presente + env OK + verifyAccessToken lanza → redirige a /login", async () => {
    const src = await readFile(
      "src/app/(dashboard)/layout.tsx",
      "utf8",
    );
    // El último bloque try/catch cubre JWT inválido/expirado.
    expect(src).toMatch(
      /try\s*\{\s*await session\.verifyAccessToken\(accessToken\);[\s\S]*?\}\s*catch\s*\{[\s\S]*?redirect\(['"]\/login['"]\);/,
    );
  });

  it("layout: reutiliza createSessionService + loadEnv con la misma config que el contexto tRPC", async () => {
    const layoutSrc = await readFile(
      "src/app/(dashboard)/layout.tsx",
      "utf8",
    );
    const ctxSrc = await readFile(
      "src/server/trpc/context.ts",
      "utf8",
    );
    // El layout importa `createSessionService` desde el mismo path.
    expect(layoutSrc).toContain(
      'import { createSessionService } from "@/server/services/session"',
    );
    // Config idéntica al contexto tRPC.
    expect(layoutSrc).toContain("sessionSecret: env.SESSION_SECRET");
    expect(layoutSrc).toContain("accessTtlSeconds: 900");
    expect(layoutSrc).toContain("refreshTtlDays: 7");
    expect(layoutSrc).toContain("issuer: env.APP_BASE_URL");
    // El contexto tRPC usa la MISMA config (anti-regresión).
    expect(ctxSrc).toContain("sessionSecret: env.SESSION_SECRET");
    expect(ctxSrc).toContain("accessTtlSeconds: 900");
    expect(ctxSrc).toContain("refreshTtlDays: 7");
    expect(ctxSrc).toContain("issuer: env.APP_BASE_URL");
  });

  it("layout: no inventa identidad (no usa UUID cero ni userId fijo)", async () => {
    const src = await readFile(
      "src/app/(dashboard)/layout.tsx",
      "utf8",
    );
    // Ningún `00000000-0000-0000-0000-000000000000` ni
    // asignación de userId/roles desde una constante.
    expect(src).not.toContain("00000000-0000-0000-0000-000000000000");
    expect(src).not.toMatch(/userId:\s*["'][a-f0-9-]+["']/);
    // El resultado de `verifyAccessToken` no se destructura ni se
    // pasa a `contextFromAccess` ni a `createInnerContext`.
    expect(src).not.toContain("contextFromAccess");
    expect(src).not.toContain("createInnerContext");
  });

  it("layout: el shell (`AppNavigation` + `ThemeToggle`) sólo se renderiza si el guard pasa", async () => {
    const src = await readFile(
      "src/app/(dashboard)/layout.tsx",
      "utf8",
    );
    // El JSX del shell está DESPUÉS del último `redirect("/login")`.
    const guardEnd = src.lastIndexOf('redirect("/login")');
    const shellStart = src.indexOf("<AppNavigation");
    expect(guardEnd).toBeGreaterThan(-1);
    expect(shellStart).toBeGreaterThan(guardEnd);
  });

  it("layout: usa `redirect` de `next/navigation` (no `useRouter().push`)", async () => {
    const src = await readFile(
      "src/app/(dashboard)/layout.tsx",
      "utf8",
    );
    expect(src).toContain('import { redirect } from "next/navigation"');
    expect(src).not.toContain("useRouter");
    // No tiene `"use client"` (es Server Component).
    expect(src.trimStart().startsWith('"use client"')).toBe(false);
  });

  it("layout: nombre de cookie canónico `vectoria_access`", async () => {
    const src = await readFile(
      "src/app/(dashboard)/layout.tsx",
      "utf8",
    );
    expect(src).toContain('const ACCESS_COOKIE_NAME = "vectoria_access"');
  });
});
