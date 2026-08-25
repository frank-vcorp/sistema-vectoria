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
 *
 * Incremento SPEC-002-UI-20260824-01: añade cobertura E2E dirigida a
 * la alta de prospectos. Si el entorno no dispone de sesión real, la
 * mutación tRPC fallará con `UNAUTHORIZED`; en ese caso la prueba
 * verifica exclusivamente la presencia del CTA + apertura del Dialog
 * + accesibilidad de los campos, sin falsificar un PASS de creación.
 * Cuando ATLAS habilite sesión autenticada, la prueba del flujo de
 * creación se cubrirá sin cambios de selector.
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

  test("navegación principal expone los nuevos módulos", async ({ page }) => {
    await page.goto("/");
    // La navegación se renderiza como drawer (botón "Abrir navegación"
    // visible) cuando el viewport está por debajo del breakpoint `lg`
    // de Tailwind (1024 px): mobile-375 y tablet-768. En desktop-1280
    // la navegación es inline y el botón no existe. Detectamos por
    // presencia real del botón en lugar de por `isMobile` (que sólo
    // es true para el proyecto mobile-375 de Playwright).
    const navToggle = page.getByLabel(/Abrir navegación/i);
    if (await navToggle.isVisible()) {
      await navToggle.click();
      await expect(page.getByRole("dialog", { name: /Navegación/i })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: /Prospectos/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Clientes/i })).toBeVisible();
  });
});

test.describe("SPEC-002-UI · Alta de prospectos (incremento 20260824-01)", () => {
  test("CTA 'Nuevo prospecto' visible y abre el Dialog con todos los campos", async ({
    page,
  }) => {
    await page.goto("/prospectos");
    const cta = page.getByTestId("prospectos-new-button");
    await expect(cta).toBeVisible();
    await cta.click();
    // Título del Dialog.
    await expect(
      page.getByRole("heading", { name: /Alta de prospecto/i }),
    ).toBeVisible();
    // Campos del contrato `code`, `name`, `company`, `email`, `phone`,
    // `source`, `medium` (select nativo).
    await expect(page.locator("#prospecto-form-code")).toBeVisible();
    await expect(page.locator("#prospecto-form-name")).toBeVisible();
    await expect(page.locator("#prospecto-form-company")).toBeVisible();
    await expect(page.locator("#prospecto-form-email")).toBeVisible();
    await expect(page.locator("#prospecto-form-phone")).toBeVisible();
    await expect(page.locator("#prospecto-form-source")).toBeVisible();
    await expect(page.locator("#prospecto-form-medium")).toBeVisible();
    // Catálogo cerrado DEC-20260823-01: tres medios exactos.
    const options = await page.locator("#prospecto-form-medium option").allTextContents();
    const optsNormalized = options.map((s) => s.trim()).filter(Boolean);
    expect(optsNormalized).toContain("Llamada");
    expect(optsNormalized).toContain("Email");
    expect(optsNormalized).toContain("WhatsApp");
    expect(optsNormalized.length).toBe(4); // placeholder + 3 medios
  });

  test("validación inline: código y nombre requeridos", async ({ page }) => {
    await page.goto("/prospectos");
    await page.getByTestId("prospectos-new-button").click();
    // Submit sin datos → mensajes de validación.
    await page.getByTestId("prospecto-form-submit").click();
    await expect(
      page.getByText(/El código es obligatorio\./i),
    ).toBeVisible();
    await expect(
      page.getByText(/El nombre es obligatorio\./i),
    ).toBeVisible();
  });

  test("alta completa: emite mutate y resuelve sin crashear (éxito o error de auth)", async ({
    page,
  }) => {
    // Criterio explícito (SPEC-002-UI-20260824-01 §Implementación
    // mínima): el submit dispara la mutación tRPC y la respuesta se
    // refleja en UI. No se exige éxito de negocio (depende de sesión
    // real y de BD provisionada); sí se exige que la mutación se
    // ejecute y que el cliente reaccione sin crashear. Cuando ATLAS
    // habilite sesión autenticada, este criterio se endurece a
    // `await expect(getByTestId('prospecto-form-success')).toBeVisible()`
    // + aserción sobre la fila creada en la lista.
    await page.goto("/prospectos");
    await page.getByTestId("prospectos-new-button").click();
    await page.locator("#prospecto-form-code").fill("PW-PLAYWRIGHT");
    await page.locator("#prospecto-form-name").fill("Playwright Prospecto");
    await page.locator("#prospecto-form-email").fill("play@example.com");
    await page
      .locator("#prospecto-form-medium")
      .selectOption({ label: "Email" });
    await page.getByTestId("prospecto-form-submit").click();
    // La mutación resuelve en éxito (con sesión) o en serverError (sin
    // sesión — UNAUTHORIZED). En ambos casos la UI emite un feedback
    // verificable: `prospecto-form-success` o `prospecto-form-server-error`.
    await expect(
      page
        .getByTestId("prospecto-form-success")
        .or(page.getByTestId("prospecto-form-server-error")),
    ).toBeVisible({ timeout: 15_000 });
  });
});