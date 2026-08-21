/**
 * Bootstrap pg-boss (ADR-07).
 *
 * En MVP este módulo expone un factory que recibe `DATABASE_URL` y crea
 * la instancia pg-boss. La inicialización se llama una vez al arranque
 * del worker; las migraciones de esquema las gestiona Drizzle (las tablas
 * `pgboss.*` las crea pg-boss por sí mismo en su `start()`).
 */
import PgBoss from "pg-boss";
import { loadEnv } from "@/lib/env";

let _boss: PgBoss | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (_boss) return _boss;
  const env = loadEnv();
  _boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    retryLimit: 5,
    retryDelay: 30, // primer backoff: 30s; pg-boss aplica backoff propio.
  });
  await _boss.start();
  return _boss;
}

export async function stopBoss(): Promise<void> {
  if (_boss) {
    await _boss.stop({ graceful: true });
    _boss = null;
  }
}
