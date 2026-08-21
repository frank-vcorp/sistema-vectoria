/** Verifica entorno y conectividad sin imprimir secretos (AC-36). */
import net from "node:net";
import { Pool } from "pg";
import { assertMasterKeyBytes, listRequiredVars, loadEnv } from "@/lib/env";

async function tcp(url: string): Promise<void> {
  const normalized = url.includes("://") ? url : `http://${url}`;
  const parsed = new URL(normalized);
  const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
  await new Promise<void>((resolve, reject) => {
    const socket = net.connect({ host: parsed.hostname, port });
    socket.once("connect", () => { socket.end(); resolve(); });
    socket.once("error", reject);
    socket.setTimeout(4_000, () => { socket.destroy(); reject(new Error(`Timeout TCP ${parsed.hostname}:${port}`)); });
  });
}

async function main() {
  const missing = listRequiredVars().filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Variables obligatorias ausentes: ${missing.join(", ")}`);
  const env = loadEnv();
  assertMasterKeyBytes(env.MASTER_KEY);
  await tcp(env.DATABASE_URL);
  await tcp(env.S3_ENDPOINT);
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
  try {
    const result = await pool.query<{ version: string }>("SELECT version()");
    if (!/PostgreSQL\s+(1[6-9]|[2-9]\d)/.test(result.rows[0]?.version ?? "")) throw new Error("PostgreSQL >=16 requerido");
  } finally { await pool.end(); }
  console.info("OK: dependencias, secretos y conectividad verificados");
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Error deps:check"); process.exit(1); });
