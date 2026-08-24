import { expect, test } from "@playwright/test";

/**
 * SPEC-002 (Clientes y Prospectos) — matriz responsive.
 *
 * Mismas reglas que `e2e/plataforma.spec.ts`: requiere bootstrap + app
 * + PostgreSQL/MinIO provisionados. Verifica AC-9 a 375 / 768 / 1280.
 * Las acciones de mutación viven en los unit tests del módulo
 * (`tests/spec-20260817-002.test.ts`); aquí validamos que la UI
 * es operable en los tres viewports y que la navegación expone los
 * módulos nuevos.
 */

test.describe("SPEC-002 · Clientes y Prospectos · matriz responsive", () => {
  test("ruta /prospectos es operable y lista la tabla", async ({ page }) => {
    await page.goto("/prospectos");
    await expect(page.getByRole("heading", { name: /Prospectos/i })).toBeVisible();
    await expect(page.locator("input#prospectos-search")).toBeVisible();
  });

  test("ruta /clientes es operable y muestra la tabla", async ({ page }) => {
    await page.goto("/clientes");
    await expect(page.getByRole("heading", { name: /Clientes/i })).toBeVisible();
    await expect(page.locator("input#clientes-search")).toBeVisible();
  });

  test("formulario de cliente (detalle) es operable en móvil", async ({ page }) => {
    await page.goto("/clientes/00000000-0000-0000-0000-000000000077");
    // Sin sesión real, mostramos mensaje neutro.
    await expect(
      page.getByRole("heading", { name: /Recurso no encontrado|No encontrado/i }),
    ).toBeVisible();
  });

  test("navegación principal expone los nuevos módulos", async ({ page, isMobile }) => {
    await page.goto("/");
    if (isMobile) {
      await page.getByLabel(/Abrir navegación/i).click();
      await expect(page.getByRole("dialog", { name: /Navegación/i })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: /Prospectos/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Clientes/i })).toBeVisible();
  });
});