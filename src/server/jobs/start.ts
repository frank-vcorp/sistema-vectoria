/**
 * Bootstrap de jobs. Registra todos los handlers en pg-boss al arranque
 * del worker (no del proceso web).
 */
import { scheduleNotificacionesEvaluacion } from "./handlers/notificaciones-evaluacion";
import { scheduleBackupBd } from "./handlers/backup-bd";

export async function startJobs(): Promise<void> {
  await scheduleNotificacionesEvaluacion();
  await scheduleBackupBd();
}
