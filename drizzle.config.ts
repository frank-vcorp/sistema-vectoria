import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config (SPEC-001 §3.1, ADR-01 §3).
 * Schema se compone por dominio; para MVP la base vive en `schema/index.ts`
 * que re-exporta los módulos de plataforma.
 */
export default defineConfig({
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgres://localhost:5432/placeholder",
  },
  strict: true,
  verbose: false,
});
