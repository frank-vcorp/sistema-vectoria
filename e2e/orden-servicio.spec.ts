import { expect, test } from "@playwright/test";

/**
 * SPEC-004 (Orden de Servicio) — matriz responsive V3.
 *
 * Misma convención que `e2e/clientes-prospectos.spec.ts` y
 * `e2e/comercial.spec.ts`: requiere bootstrap + app + PostgreSQL/
 * MinIO provisionados. Verifica AC-8 a 375 / 768 / 1280.
 *
 * Las acciones de mutación viven en los unit tests del módulo
 * (`tests/spec-20260817-004.test.ts`); aquí validamos que la UI
 * es operable en los tres viewports y que la navegación expone
 * los módulos nuevos.
 *
 * Si el entorno ejecutable NO está provisionado (gate Frank actual),
 * Playwright reportará fallos hasta que ATLAS apruebe el bootstrap;
 * este archivo queda como contrato listo para V3 contra staging LIVE.
 */
test.describe("SPEC-004 · Orden de Servicio · matriz responsive", () => {
  test("ruta /ordenes-servicio es operable y muestra la tabla", async ({ page }) => {
    await page.goto("/ordenes-servicio");
    await expect(
      page.getByRole("heading", { name: /Órdenes de Servicio/i }),
    ).toBeVisible();
    await expect(page.locator("input#ordenes-search")).toBeVisible();
  });

  test("ruta /ordenes-servicio/<id> es operable (UUID dummy, muestra error neutro)", async ({
    page,
  }) => {
    await page.goto("/ordenes-servicio/00000000-0000-0000-0000-000000000088");
    await expect(
      page.getByRole("heading", { name: /Detalle de Orden de Servicio/i }),
    ).toBeVisible();
  });

  test("navegación principal expone el módulo Órdenes de Servicio", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");
    if (isMobile) {
      await page.getByLabel(/Abrir navegación/i).click();
      await expect(page.getByRole("dialog", { name: /Navegación/i })).toBeVisible();
    }
    await expect(
      page.getByRole("link", { name: /Órdenes de Servicio/i }),
    ).toBeVisible();
  });
});
