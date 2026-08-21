/** AC-41. Requiere PostgreSQL+secretos; prueba health local y estructura tras seed. */
import { getDb, closeDb } from "@/server/db/client";
import { organizations, roles } from "@/server/db/schema";
import { eq, and, sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, "default")).limit(1);
  if (!org || org.currency !== "MXN") throw new Error("Organización seed MXN ausente");
  const seedCount = await db.select({ count: sql<number>`count(*)::int` }).from(roles).where(and(eq(roles.organizationId, org.id), eq(roles.isSeed, true)));
  const count = seedCount[0]?.count;
  if (count !== 7) throw new Error(`Se esperaban 7 roles seed, recibidos ${count}`);
  const health = await fetch("http://localhost:3000/health");
  if (!health.ok) throw new Error("/health no respondió 200");
  console.info("OK: smoke plataforma completado"); await closeDb();
}
main().catch(async (e: unknown) => { console.error(e instanceof Error ? e.message : "Error smoke"); await closeDb(); process.exit(1); });
