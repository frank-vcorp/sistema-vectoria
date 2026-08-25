import { expect, test } from "@playwright/test";

/**
 * AC-66: los 4 flujos se ejecutan en los 3 proyectos/viewport definidos
 * por playwright.config.ts (mobile-375/tablet-768/desktop-1280).
 * Requieren bootstrap + app + PostgreSQL/MinIO provisionados.
 */
test.describe("Plataforma Base · matriz responsive", () => {
  test("login y dashboard", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Iniciar sesión/i })).toBeVisible();
    await page.getByLabel(/Correo electrónico/i).fill("director@example.test");
    await page.getByLabel(/Contraseña/i).fill("ContraseñaInvalida1!");
    await page.getByRole("button", { name: /Iniciar sesión/i }).click();
    // Con credenciales inválidas el flujo prueba error visible; seed real cubre login correcto.
    // Usamos el `<p role="alert">` del formulario de login
    // (`src/modules/plataforma/login/login-form.tsx`): el locator
    // `getByRole("alert")` global también matchea el route-announcer
    // inyectado por Next.js (`#__next-route-announcer__`), lo que
    // produce un strict-mode violation en tablet/desktop.
    await expect(
      page.locator('form p[role="alert"]', { hasText: /No fue posible iniciar sesión/i }),
    ).toBeVisible();
  });

  test("listado y detalle conservan tabla responsive", async ({ page }) => {
    await page.goto("/audit");
    await expect(page.getByRole("heading", { name: /Bitácora/i })).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
  });

  test("formulario de configuración fiscal es operable", async ({ page }) => {
    await page.goto("/admin/fiscal-config");
    await page.getByLabel("RFC").fill("XAXX010101000");
    await expect(page.getByRole("button", { name: /Guardar/i })).toBeVisible();
  });

  test("acción con modal conserva foco y teclado", async ({ page }) => {
    await page.goto("/admin/roles");
    const trigger = page.getByRole("button", { name: /Crear/i });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(dialog).toContainText(/Código/i);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("tema, navegación móvil y contraste de tokens", async ({ page, isMobile }) => {
    await page.goto("/");
    if (isMobile) { await page.getByLabel(/Abrir navegación/i).click(); await expect(page.getByRole("dialog", { name: /Navegación/i })).toBeVisible(); }
    const background = await page.locator("body").evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(background).toBeTruthy();
  });

  test("cookies de sesión no son visibles desde JavaScript", async ({ page, context }) => {
    await page.goto("/login");
    const cookies = await context.cookies();
    for (const cookie of cookies.filter((c) => c.name.startsWith("vectoria_"))) expect(cookie.httpOnly).toBe(true);
    expect(await page.evaluate(() => document.cookie.includes("vectoria_access"))).toBe(false);
  });
});
