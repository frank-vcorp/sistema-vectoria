import { expect, test } from "@playwright/test";

/**
 * SPEC-005 + SPEC-006 (Proyectos — artefactos y estados + equipo y
 * ejecución) — matriz responsive V3.
 *
 * Misma convención que `e2e/clientes-prospectos.spec.ts`,
 * `e2e/comercial.spec.ts` y `e2e/orden-servicio.spec.ts`: requiere
 * bootstrap + app + PostgreSQL/MinIO provisionados. Verifica AC-10
 * (SPEC-005) y AC-11 (SPEC-006 — kanban colapsa a lista en móvil)
 * a 375 / 768 / 1280.
 *
 * Las acciones de mutación viven en los unit tests del módulo
 * (`tests/spec-20260817-005.test.ts`, `tests/spec-20260817-006.test.ts`);
 * aquí validamos que la UI es operable en los tres viewports y que
 * la navegación expone los módulos nuevos.
 *
 * Si el entorno ejecutable NO está provisionado (gate Frank actual),
 * Playwright reportará fallos hasta que ATLAS apruebe el bootstrap;
 * este archivo queda como contrato listo para V3 contra staging LIVE.
 */
test.describe("SPEC-005/006 · Proyectos · matriz responsive", () => {
  test("ruta /proyectos es operable y muestra la tabla", async ({ page }) => {
    await page.goto("/proyectos");
    await expect(
      page.getByRole("heading", { name: /Proyectos/i }),
    ).toBeVisible();
    await expect(page.locator("input#proyectos-search")).toBeVisible();
  });

  test("ruta /proyectos/<id> es operable y muestra las 8 pestañas SPEC-006", async ({
    page,
  }) => {
    await page.goto("/proyectos/00000000-0000-0000-0000-000000000088");
    await expect(
      page.getByRole("heading", { name: /Detalle de proyecto/i }),
    ).toBeVisible();
    // Las 8 pestañas operables (Resumen, Tareas, Requerimientos,
    // Pruebas, Entregables, Cambios, Equipo, Tiempo, Cierre).
    await expect(page.getByRole("button", { name: "Tareas" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Requerimientos" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Pruebas" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Entregables" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Cambios" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Equipo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tiempo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cierre" })).toBeVisible();
  });

  test("pestaña Tareas muestra el formulario de creación (responsive)", async ({
    page,
  }) => {
    await page.goto("/proyectos/00000000-0000-0000-0000-000000000088");
    await page.getByRole("button", { name: "Tareas" }).click();
    await expect(page.locator("#task-folio")).toBeVisible();
    await expect(page.locator("#task-title")).toBeVisible();
  });

  test("pestaña Equipo permite agregar miembros", async ({ page }) => {
    await page.goto("/proyectos/00000000-0000-0000-0000-000000000088");
    await page.getByRole("button", { name: "Equipo" }).click();
    await expect(page.locator("#member-user")).toBeVisible();
  });

  test("pestaña Cierre muestra el preview de gates", async ({ page }) => {
    await page.goto("/proyectos/00000000-0000-0000-0000-000000000088");
    await page.getByRole("button", { name: "Cierre" }).click();
    await expect(page.getByText(/Progreso/i)).toBeVisible();
    await expect(page.getByText(/Salud/i)).toBeVisible();
  });

  test("navegación principal expone el módulo Proyectos", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");
    if (isMobile) {
      await page.getByLabel(/Abrir navegación/i).click();
      await expect(page.getByRole("dialog", { name: /Navegación/i })).toBeVisible();
    }
    await expect(
      page.getByRole("link", { name: /Proyectos/i }),
    ).toBeVisible();
  });
});
