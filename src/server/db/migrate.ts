/**
 * Runner de migración Drizzle. Aplica las migraciones pendientes.
 * No ejecuta automáticamente en MVP (Frank corre `pnpm db:migrate`).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { loadEnv } from "@/lib/env";

async function main() {
  const env = loadEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool);
  // eslint-disable-next-line no-console
  console.info("Aplicando migraciones Drizzle Kit…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  // eslint-disable-next-line no-console
  console.info("Migraciones aplicadas.");
  await pool.end();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("Error en migración:", e.message);
  process.exit(1);
});
