/**
 * `job_runs` — PK `id` simple; `organization_id` **nullable** para jobs
 * globales (`backup-bd`) (ADR-02 §8.5, ADR-07 §2.1). `unique (job_name, job_key)`
 * garantiza idempotencia (AC-15, AC-63).
 */
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id"),
    jobName: text("job_name").notNull(),
    jobKey: text("job_key").notNull(),
    status: text("status").notNull().default("running"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    result: jsonb("result"),
    error: text("error"),
    dlqReason: text("dlq_reason"),
  },
  (t) => ({
    jobKeyUnique: uniqueIndex("job_runs_name_key_unique").on(t.jobName, t.jobKey),
    nameStartedIdx: index("job_runs_name_started_idx").on(t.jobName, t.startedAt),
    statusIdx: index("job_runs_status_idx").on(t.status, t.startedAt),
    orgStartedIdx: index("job_runs_org_started_idx").on(t.organizationId, t.startedAt),
  }),
);

export type JobRun = typeof jobRuns.$inferSelect;
export type JobRunNew = typeof jobRuns.$inferInsert;
