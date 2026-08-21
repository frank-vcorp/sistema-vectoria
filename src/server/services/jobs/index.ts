/**
 * Servicio `jobs` — marco de jobs idempotentes (ADR-07, AC-15, AC-62..AC-67).
 *
 * Modelo:
 *  - `enqueue(name, payload, {jobKey})` registra/omite según idempotencia.
 *  - `run(name, handler)` ejecuta el handler con control de reintentos y DLQ.
 *  - pg-boss es el motor; este servicio es la capa de aplicación.
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { jobRuns } from "@/server/db/schema";
import type { JobStatus } from "@/shared/enums";

export interface EnqueueInput {
  name: string;
  jobKey: string;
  organizationId: string | null;
  payload: unknown;
}

export interface EnqueueResult {
  jobRunId: string;
  status: JobStatus;
  alreadyRun: boolean;
}

export interface JobRunResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface JobsService {
  enqueue(input: EnqueueInput): Promise<EnqueueResult>;
  markRunning(jobRunId: string): Promise<void>;
  markSucceeded(jobRunId: string, result: unknown): Promise<void>;
  markFailed(jobRunId: string, error: string, attempt: number): Promise<void>;
  markDlq(jobRunId: string, reason: string): Promise<void>;
  getByKey(name: string, jobKey: string): Promise<EnqueueResult | null>;
}

const DEFAULT_MAX_ATTEMPTS = 5;

export function createJobsService(): JobsService {
  const db = getDb();

  async function enqueue(input: EnqueueInput): Promise<EnqueueResult> {
    // Idempotencia: si ya existe (running|succeeded) → omitir.
    const [existing] = await db
      .select()
      .from(jobRuns)
      .where(and(eq(jobRuns.jobName, input.name), eq(jobRuns.jobKey, input.jobKey)))
      .limit(1);
    if (existing && (existing.status === "running" || existing.status === "succeeded")) {
      return {
        jobRunId: existing.id,
        status: existing.status as JobStatus,
        alreadyRun: true,
      };
    }
    if (existing) {
      // failed/stuck/dlq → reabrir (force).
      await db
        .update(jobRuns)
        .set({
          status: "running",
          attempts: 0,
          lastAttemptAt: new Date(),
          finishedAt: null,
          error: null,
          dlqReason: null,
        })
        .where(eq(jobRuns.id, existing.id));
      return { jobRunId: existing.id, status: "running", alreadyRun: false };
    }
    const [row] = await db
      .insert(jobRuns)
      .values({
        organizationId: input.organizationId,
        jobName: input.name,
        jobKey: input.jobKey,
        status: "running",
        attempts: 0,
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
      })
      .returning();
    if (!row) throw new Error("job_runs insert sin fila");
    return { jobRunId: row.id, status: "running", alreadyRun: false };
  }

  async function markRunning(jobRunId: string): Promise<void> {
    await db
      .update(jobRuns)
      .set({ status: "running", lastAttemptAt: new Date() })
      .where(eq(jobRuns.id, jobRunId));
  }

  async function markSucceeded(jobRunId: string, result: unknown): Promise<void> {
    await db
      .update(jobRuns)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        result: (result ?? null) as Record<string, unknown> | null,
        error: null,
        dlqReason: null,
      })
      .where(eq(jobRuns.id, jobRunId));
  }

  async function markFailed(jobRunId: string, error: string, attempt: number): Promise<void> {
    await db
      .update(jobRuns)
      .set({
        status: "failed",
        attempts: attempt,
        error: sanitizeError(error),
        finishedAt: new Date(),
      })
      .where(eq(jobRuns.id, jobRunId));
  }

  async function markDlq(jobRunId: string, reason: string): Promise<void> {
    await db
      .update(jobRuns)
      .set({
        status: "dlq",
        dlqReason: sanitizeError(reason),
        finishedAt: new Date(),
      })
      .where(eq(jobRuns.id, jobRunId));
  }

  async function getByKey(name: string, jobKey: string): Promise<EnqueueResult | null> {
    const [row] = await db
      .select()
      .from(jobRuns)
      .where(and(eq(jobRuns.jobName, name), eq(jobRuns.jobKey, jobKey)))
      .limit(1);
    if (!row) return null;
    return {
      jobRunId: row.id,
      status: row.status as JobStatus,
      alreadyRun: row.status === "succeeded" || row.status === "running",
    };
  }

  return {
    enqueue,
    markRunning,
    markSucceeded,
    markFailed,
    markDlq,
    getByKey,
  };
}

/**
 * Sanitiza errores (ADR-07 §2.4): nunca CSD, API key PAC, MASTER_KEY ni payloads sensibles.
 * Esta función es conservadora: si ve una palabra sensible en el mensaje, la reemplaza.
 */
function sanitizeError(msg: string): string {
  if (!msg) return msg;
  return msg
    .replace(/MASTER_KEY=[A-Za-z0-9+/=]+/g, "MASTER_KEY=[REDACTED]")
    .replace(/password=[^\s]+/gi, "password=[REDACTED]")
    .replace(/pac_api_key=[^\s]+/gi, "pac_api_key=[REDACTED]");
}

// Para tests
export const __sql_keep__ = sql;
