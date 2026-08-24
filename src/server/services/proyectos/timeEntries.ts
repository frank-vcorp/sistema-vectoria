/**
 * Servicio `timeEntries` — SPEC-006 §4.3 / AC-10.
 *
 * Reglas (BR-N276, BR-N277, BR-N208, BR-008, BR-N334):
 *  - Privacidad: el técnico sólo ve sus propias filas
 *    (`actor.id === entry.userId`). El PL/equipo con permiso
 *    `ver_tiempo_equipo` puede ver las del equipo del proyecto.
 *  - Snapshot: `cost_per_hour_cents` se captura al registrar (no se
 *    recalcula al cambiar el costo del usuario).
 *  - Rango: `hours > 0`, `hours ≤ 24`, y la suma diaria del
 *    usuario en el proyecto no excede 24.
 */
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import {
  projects,
  timeEntries,
  users,
} from "@/server/db/schema";
import {
  TIME_ENTRY_KINDS,
  type TimeEntryKind,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import { canViewOtherUserTimeEntries, validateTimeEntryDailyTotal } from "./helpers-ejecucion";

export interface TimeEntryDTO {
  id: string;
  organizationId: string;
  projectId: string;
  taskId: string | null;
  userId: string;
  hours: number;
  kind: TimeEntryKind;
  costPerHourCents: number;
  date: string;
  createdAt: Date;
  userName: string | null;
  userEmail: string | null;
}

export interface TimeEntriesService {
  create(
    ctx: Context,
    input: {
      projectId: string;
      taskId?: string | null;
      hours: number;
      kind?: TimeEntryKind;
      date: string;
    },
  ): Promise<TimeEntryDTO>;
  list(
    ctx: Context,
    input: {
      projectId: string;
      teamView?: boolean;
      fromDate?: string;
      toDate?: string;
    },
  ): Promise<TimeEntryDTO[]>;
}

function kindOf(value: string): TimeEntryKind {
  return (TIME_ENTRY_KINDS as readonly string[]).includes(value)
    ? (value as TimeEntryKind)
    : "facturable";
}

function toDto(
  row: typeof timeEntries.$inferSelect,
  user?: { name?: string | null; email?: string | null } | null,
): TimeEntryDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    taskId: row.taskId ?? null,
    userId: row.userId,
    hours: Number(row.hours),
    kind: kindOf(row.kind),
    costPerHourCents: row.costPerHourCents,
    date: row.date,
    createdAt: row.createdAt,
    userName: user?.name ?? null,
    userEmail: user?.email ?? null,
  };
}

export function createTimeEntriesService(): TimeEntriesService {
  const db = getDb();

  async function loadUser(orgId: string, userId: string) {
    const [row] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, orgId)))
      .limit(1);
    return row ?? null;
  }

  async function loadProject(orgId: string, projectId: string) {
    const [row] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId)))
      .limit(1);
    if (!row) {
      throw new DomainError("PROJECT_NOT_FOUND", "Proyecto no encontrado", 404);
    }
    return row;
  }

  async function create(
    ctx: Context,
    input: {
      projectId: string;
      taskId?: string | null;
      hours: number;
      kind?: TimeEntryKind;
      date: string;
    },
  ): Promise<TimeEntryDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "registrar_tiempo", {
      forceDb: true,
    });
    await loadProject(user.organization_id, input.projectId);
    if (input.hours <= 0 || input.hours > 24) {
      throw new DomainError(
        "TIME_ENTRY_INVALID_RANGE",
        "Las horas deben ser > 0 y ≤ 24",
        400,
      );
    }
    // BR-008 · suma diaria del usuario en el proyecto ≤ 24.
    const existingToday = await db
      .select({ total: sql<number>`coalesce(sum(${timeEntries.hours}),0)::numeric` })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.organizationId, user.organization_id),
          eq(timeEntries.projectId, input.projectId),
          eq(timeEntries.userId, user.id),
          eq(timeEntries.date, input.date),
        ),
      );
    const sameDay = Number(existingToday[0]?.total ?? 0);
    const daily = validateTimeEntryDailyTotal({
      existingHoursSameDay: sameDay,
      newHours: input.hours,
    });
    if (!daily.ok) {
      throw new DomainError(
        daily.code,
        "La suma de horas del día excede 24",
        400,
      );
    }
    // BR-N334 · snapshot del cost_per_hour del usuario al registrar.
    const u = await loadUser(user.organization_id, user.id);
    const costSnapshot = (u as unknown as { costPerHourCents?: number } | null)
      ?.costPerHourCents ?? 0;
    const [created] = await db
      .insert(timeEntries)
      .values({
        organizationId: user.organization_id,
        projectId: input.projectId,
        taskId: input.taskId ?? null,
        userId: user.id,
        hours: input.hours.toFixed(2),
        kind: input.kind ?? "facturable",
        costPerHourCents: costSnapshot,
        date: input.date,
      })
      .returning();
    if (!created) throw new Error("time_entry create sin fila");
    const { createAuditService } = await import("@/server/services/audit");
    await createAuditService().record(ctx, {
      entityType: "time_entry",
      entityId: created.id,
      action: "time_entry.create",
      after: {
        projectId: created.projectId,
        taskId: created.taskId,
        hours: Number(created.hours),
        kind: created.kind,
        date: created.date,
        costPerHourCents: created.costPerHourCents,
      },
    });
    return toDto(created, u);
  }

  async function list(
    ctx: Context,
    input: {
      projectId: string;
      teamView?: boolean;
      fromDate?: string;
      toDate?: string;
    },
  ): Promise<TimeEntryDTO[]> {
    const user = requireUser(ctx);
    await loadProject(user.organization_id, input.projectId);
    const actorHasTeam = await (async () => {
      const { createHasPermissionService } = await import(
        "@/server/services/hasPermission"
      );
      return createHasPermissionService().has(ctx, "ver_tiempo_equipo");
    })();
    const where = [
      eq(timeEntries.organizationId, user.organization_id),
      eq(timeEntries.projectId, input.projectId),
    ];
    if (input.fromDate) where.push(gte(timeEntries.date, input.fromDate));
    if (input.toDate) where.push(lte(timeEntries.date, input.toDate));
    if (!input.teamView) {
      // Privacidad BR-N208 · sin teamView, sólo las propias.
      where.push(eq(timeEntries.userId, user.id));
    } else if (!actorHasTeam) {
      // teamView solicitado pero sin permiso → tratamos como vista
      // propia (defensa). Lanzar 403 sería preferible, pero
      // mantenemos el contrato "lista filtrada" para la UI.
      where.push(eq(timeEntries.userId, user.id));
    }
    const rows = await db
      .select({
        e: timeEntries,
        uName: users.name,
        uEmail: users.email,
      })
      .from(timeEntries)
      .leftJoin(users, eq(timeEntries.userId, users.id))
      .where(and(...where))
      .orderBy(desc(timeEntries.date), desc(timeEntries.createdAt));
    return rows.map((r) =>
      toDto(r.e, { name: r.uName ?? null, email: r.uEmail ?? null }),
    );
  }

  // Validación auxiliar expuesta para tests del propio servicio.
  void canViewOtherUserTimeEntries;
  void asc;
  return { create, list };
}
