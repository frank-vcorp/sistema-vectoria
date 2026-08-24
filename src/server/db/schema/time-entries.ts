/**
 * `time_entries` — SPEC-006 §4.1 (B13, BR-N276, BR-008, BR-N277,
 * BR-N208, DEC-FUN-25).
 *
 * Registro de tiempo por usuario/proyecto/tarea. La columna
 * `cost_per_hour_cents` es **snapshot** del costo por hora al
 * momento del registro (BR-008/BR-N334): si el `users.cost_per_hour`
 * cambia después, las filas históricas no se recalculan (decisión
 * contable).
 *
 * Privacidad (BR-N277/BR-N208): por defecto el técnico sólo ve
 * sus propias filas. El permiso `ver_tiempo_equipo` (PL/equipo)
 * permite ver las del equipo del proyecto. El filtrado vive en el
 * servicio (no RLS en MVP).
 *
 * PK compuesta `(organization_id, id)`. La suma de horas por usuario/
 * día no debe exceder 24 (BR-008), validado por Zod y por el servicio.
 */
import {
  bigint,
  foreignKey,
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { tasks } from "./tasks";
import { organizations } from "./organizations";
import { users } from "./users";

export const timeEntries = pgTable(
  "time_entries",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    /** BR-N276 · opcional: tiempo a nivel proyecto o a nivel tarea. */
    taskId: uuid("task_id"),
    userId: uuid("user_id").notNull(),
    /**
     * BR-N276 · `hours` con 2 decimales (numeric). Rango estricto:
     * `> 0` y `≤ 24` por fila (BR-008); la suma diaria se valida en
     * servicio (`validateTimeEntryDailyTotal`).
     */
    hours: numeric("hours", { precision: 6, scale: 2 }).notNull(),
    /** BR-N276 · `facturable | interna | retrabajo | soporte`. */
    kind: text("kind").notNull().default("facturable"),
    /**
     * BR-008 / BR-N334 · snapshot del costo/hora al registrar.
     * `bigint` para centavos. NO se recalcula al cambiar el costo del
     * usuario (decisión contable).
     */
    costPerHourCents: bigint("cost_per_hour_cents", { mode: "number" })
      .notNull()
      .default(0),
    /** BR-N276 · fecha de la jornada (AAAA-MM-DD). */
    date: text("date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgProjectDateIdx: index("time_entries_org_project_date_idx").on(
      t.organizationId,
      t.projectId,
      t.date,
    ),
    orgUserDateIdx: index("time_entries_org_user_date_idx").on(
      t.organizationId,
      t.userId,
      t.date,
    ),
    projectFk: foreignKey({
      name: "time_entries_project_fk",
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
    }),
    taskFk: foreignKey({
      name: "time_entries_task_fk",
      columns: [t.organizationId, t.taskId],
      foreignColumns: [tasks.organizationId, tasks.id],
    }),
    userFk: foreignKey({
      name: "time_entries_user_fk",
      columns: [t.organizationId, t.userId],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type TimeEntry = typeof timeEntries.$inferSelect;
export type TimeEntryNew = typeof timeEntries.$inferInsert;
