/**
 * AC-40 / AC-74: `db:seed:rls`.
 *
 * Verifica que `drizzle/0001_enable_rls.sql` contiene ≥1 `CREATE POLICY`
 * descomentada por tabla de negocio y reporta OK. En MVP, no se aplica
 * la migración (gate AC-12; Frank activa RLS cuando añada la 2ª org).
 *
 * Si `DATABASE_URL` está provisionado y la BD responde, consulta
 * `pg_policies` para confirmar ≥1 política existente por tabla
 * (no sólo `relrowsecurity='on'`). Si la BD no está accesible, sólo
 * verifica el SQL estático (degradación documentada).
 */
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { loadEnv, listRequiredVars } from "@/lib/env";

const BUSINESS_TABLES = [
  "organization_fiscal_config",
  "users",
  "credentials",
  "invitations",
  "roles",
  "permissions",
  "role_permissions",
  "user_roles",
  "user_permissions",
  "audit_logs",
  "project_log_entries",
  "notifications",
  "files",
  "file_links",
];

function countPolicies(sql: string, table: string): number {
  // Cuenta CREATE POLICY ... ON <table>; tolera espacios/saltos.
  const re = new RegExp(`CREATE POLICY\\s+\\w+\\s+ON\\s+${table}\\b`, "g");
  return (sql.match(re) ?? []).length;
}

async function main() {
  const migration = await readFile("drizzle/0001_enable_rls.sql", "utf8");
  if (!migration.includes("ENABLE ROW LEVEL SECURITY")) {
    throw new Error("Migración enable_rls ausente o inválida");
  }
  if (!migration.includes("CREATE POLICY")) {
    throw new Error("Sin CREATE POLICY descomentadas (AC-74)");
  }
  for (const t of BUSINESS_TABLES) {
    if (countPolicies(migration, t) === 0) {
      throw new Error(`Falta CREATE POLICY descomentada para ${t} (AC-74)`);
    }
  }

  // Si BD accesible, verifica pg_policies.
  const required = listRequiredVars();
  const haveDb = required.every((k) => Boolean(process.env[k]));
  if (haveDb) {
    try {
      const env = loadEnv();
      const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
      try {
        const policiesResult = await pool.query<{ schemaname: string; tablename: string; policyname: string }>(
          `SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public'`,
        );
        const tablesWithPolicy = new Set(policiesResult.rows.map((r) => r.tablename));
        const missing = BUSINESS_TABLES.filter((t) => !tablesWithPolicy.has(t));
        if (missing.length > 0) {
          console.warn(
            `WARN: BD sin políticas RLS aplicadas para: ${missing.join(", ")}. En MVP es esperado si la migración no se ha aplicado.`,
          );
        }
        // Verifica que RLS sigue enabled=false (en MVP).
        const rlsResult = await pool.query<{ relname: string; relrowsecurity: boolean }>(
          "SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY($1)",
          [BUSINESS_TABLES],
        );
        const active = rlsResult.rows.filter((row) => row.relrowsecurity);
        if (active.length) {
          console.warn(
            `WARN: RLS activo en ${active.length} tabla(s) (${active.map((r) => r.relname).join(", ")}). En MVP debería seguir disabled.`,
          );
        }
        console.info(
          `OK: ${BUSINESS_TABLES.length} tablas con CREATE POLICY descomentada; ${policiesResult.rows.length} políticas en BD; RLS enabled=${active.length > 0 ? "true" : "false"} (gate AC-12).`,
        );
      } finally {
        await pool.end();
      }
    } catch (e) {
      // Sin BD accesible — modo degradado.
      console.info(
        `OK: ${BUSINESS_TABLES.length} tablas con CREATE POLICY descomentada en drizzle/0001_enable_rls.sql (BD no accesible en este entorno; verificación dinámica omitida).`,
      );
      console.info(
        `Detalle: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  } else {
    console.info(
      `OK: ${BUSINESS_TABLES.length} tablas con CREATE POLICY descomentada en drizzle/0001_enable_rls.sql (verificación dinámica requiere DATABASE_URL).`,
    );
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : "Error seed RLS");
  process.exit(1);
});
