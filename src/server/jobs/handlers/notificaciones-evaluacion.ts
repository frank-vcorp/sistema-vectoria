/**
 * Handler `notificaciones-evaluacion` (job nocturno). Itera los eventos
 * de BR-N350 y crea `notifications` in-app. En MVP este handler es
 * idempotente por `jobKey` diario (ADR-07 §2.2, AC-15).
 */
import { getBoss } from "../boss";
import { dayKey } from "@/shared/utils";

export const JOB_NAME = "notificaciones-evaluacion";

export async function scheduleNotificacionesEvaluacion(): Promise<void> {
  const boss = await getBoss();
  const queue = JOB_NAME;
  // Schedule diario 02:00 hora de organización (UTC por simplicidad en MVP).
  await boss.schedule(queue, "0 2 * * *");
  await boss.work(queue, async () => {
    const today = dayKey();
    const jobKey = `${queue}:${today}`;
    // La idempotencia la gestiona el servicio `jobs` al encolar; aquí
    // sólo ejecutamos el trabajo. Las policies de reintento las
    // controla pg-boss (retryLimit, retryDelay).
    // eslint-disable-next-line no-console
    console.info(`[${JOB_NAME}] jobKey=${jobKey} ejecutando evaluación de notificaciones`);
    // MVP: sin eventos que disparar. Las SPECs de módulo añadirán
    // aquí su lógica de evaluación.
    return { jobKey, ranAt: new Date().toISOString() };
  });
}
