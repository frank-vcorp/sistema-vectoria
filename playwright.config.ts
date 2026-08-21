import { defineConfig, devices } from "@playwright/test";

/**
 * Matriz 4 flujos × 3 viewports (AC-66):
 * - viewports: móvil 375, tableta 768, escritorio 1280.
 * - flujos representativos: login + dashboard, listado+detalle, formulario, modal/destructivo.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  ...(process.env["CI"] ? { workers: 1 } : {}),
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: process.env["E2E_BASE_URL"] ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile-375",
      use: { ...devices["Pixel 5"], viewport: { width: 375, height: 812 } },
    },
    {
      name: "tablet-768",
      use: { viewport: { width: 768, height: 1024 } },
    },
    {
      name: "desktop-1280",
      use: { viewport: { width: 1280, height: 800 } },
    },
  ],
  ...(process.env["E2E_BASE_URL"]
    ? {}
    : {
        webServer: {
          command: "pnpm dev",
          url: "http://localhost:3000",
          reuseExistingServer: !process.env["CI"],
          timeout: 120_000,
        },
      }),
});
