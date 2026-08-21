/**
 * Cliente Drizzle (PostgreSQL 16).
 *
 * NOTA sobre arquitectura hexagonal (SOL inv.1, AC-26):
 *   - Este módulo es un adaptador de persistencia. Los servicios de
 *     aplicación lo consumen, la UI NUNCA lo importa directamente
 *     (verificado por grep anti-patrón en `check-antipatterns`).
 *
 * NOTA sobre multi-tenancy (ADR-02 §3):
 *   - El cliente crea un pool. Para activar RLS en el futuro se usaría
 *     `SET LOCAL app.current_org_id` por transacción desde el servicio
 *     de `auth`/`session`. En MVP (RLS inactivo), basta filtrar por
 *     `organization_id` en la capa de servicio (defensa en profundidad).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { loadEnv } from "@/lib/env";
import * as schema from "./schema";

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;
  const env = loadEnv();
  _pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
  });
  return _pool;
}

export function getDb() {
  if (_db) return _db;
  _db = drizzle(getPool(), { schema });
  return _db;
}

/**
 * Resetea el pool. Útil en tests con mocks y al cambiar DATABASE_URL.
 */
export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}

/**
 * Helper transaccional. Envuelve la ejecución en BEGIN/COMMIT/ROLLBACK.
 * Los servicios de aplicación deben usarlo cuando ejecuten efectos múltiples.
 *
 * El callback recibe el mismo tipo de cliente Drizzle (`db`) que `getDb()`
 * devuelve, pero tipado como `PgTransaction` para que las queries dentro de
 * la transacción hereden el contexto transaccional.
 */
export async function withTx<T>(
  fn: (tx: ReturnType<typeof getDb>) => Promise<T>,
): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => fn(tx as unknown as ReturnType<typeof getDb>));
}

export { schema };
