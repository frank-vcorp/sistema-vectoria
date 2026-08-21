/**
 * Handler `backup-bd` (job nocturno, global). En MVP es dry-run: registra
 * en `job_runs` que la verificación corrió. La ejecución operativa del
 * respaldo físico y la retención 30 días es de Frank (DEC-FUN-41, AC-19).
 */
import { getBoss } from "../boss";
import { dayKey } from "@/shared/utils";

export const JOB_NAME = "backup-bd";

export async function scheduleBackupBd(): Promise<void> {
  const boss = await getBoss();
  const queue = JOB_NAME;
  // Diario 03:00 UTC.
  await boss.schedule(queue, "0 3 * * *");
  await boss.work(queue, async () => {
    const today = dayKey();
    const jobKey = `${queue}:${today}`;
    return {
      jobKey,
      mode: "dry-run",
      ranAt: new Date().toISOString(),
      note: "Operativo (respaldo físico) es responsabilidad de Frank (DEC-FUN-41)",
    };
  });
}
