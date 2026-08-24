/**
 * Servicio `members` (project_members) — SPEC-006 §4.3 / AC-1.
 *
 * Reglas (BR-N382/383, DEC-FUN-56):
 *  - El PL ya es miembro desde SPEC-005 (`project_creation`). Este
 *    servicio NO incorpora al PL (excepción: si la OS no tenía PL,
 *    queda fuera de alcance — el workflow de creación ya lo cubrió).
 *  - Sólo el PL del proyecto (rol activo `lider`) o alguien con
 *    `gestionar_equipo_proyecto` puede incorporar/retirar.
 *  - El retiro pone `active = false` (no se elimina la fila) para
 *    conservar el historial (BR-N383). Las asignaciones/tareas del
 *    miembro retirado siguen en BD (trazabilidad).
 *
 * Visibilidad: la membresía precede a la asignación (BR-N382). El
 * servicio expone `isMember(...)` que el resto de los servicios
 * (tareas, etc.) invocan como precondición.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import {
  projectMembers,
  projects,
  users,
} from "@/server/db/schema";
import {
  PROJECT_MEMBER_ROLES,
  type ProjectMemberRole,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";

export interface ProjectTeamMemberDTO {
  id: string;
  organizationId: string;
  projectId: string;
  userId: string;
  projectRole: ProjectMemberRole;
  active: boolean;
  assignedAt: Date;
  assignedBy: string | null;
  userName: string | null;
  userEmail: string | null;
}

export interface MembersService {
  add(
    ctx: Context,
    input: {
      projectId: string;
      userId: string;
      projectRole?: ProjectMemberRole;
    },
  ): Promise<ProjectTeamMemberDTO>;
  remove(ctx: Context, input: { memberId: string }): Promise<ProjectTeamMemberDTO>;
  list(
    ctx: Context,
    input: { projectId: string; includeInactive?: boolean },
  ): Promise<ProjectTeamMemberDTO[]>;
  /**
   * SPEC-006 / BR-N382 / AC-1 · precondición que el resto de los
   * servicios invocan antes de asignar tareas. Devuelve `true`
   * cuando hay una fila activa para `(projectId, userId)`.
   */
  isMember(input: {
    organizationId: string;
    projectId: string;
    userId: string;
  }): Promise<boolean>;
}

function roleOf(v: string): ProjectMemberRole {
  return (PROJECT_MEMBER_ROLES as readonly string[]).includes(v)
    ? (v as ProjectMemberRole)
    : "programador";
}

function memberToDto(
  row: typeof projectMembers.$inferSelect,
  user?: { name?: string | null; email?: string | null } | null,
): ProjectTeamMemberDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    userId: row.userId,
    projectRole: roleOf(row.projectRole),
    active: row.active,
    assignedAt: row.assignedAt,
    assignedBy: row.assignedBy,
    userName: user?.name ?? null,
    userEmail: user?.email ?? null,
  };
}

export function createMembersService(): MembersService {
  const db = getDb();

  async function loadProject(orgId: string, projectId: string) {
    const [row] = await db
      .select()
      .from(projects)
      .where(
        and(eq(projects.id, projectId), eq(projects.organizationId, orgId)),
      )
      .limit(1);
    if (!row) {
      throw new DomainError("PROJECT_NOT_FOUND", "Proyecto no encontrado", 404);
    }
    return row;
  }

  async function loadUser(orgId: string, userId: string) {
    const [row] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, orgId)))
      .limit(1);
    return row ?? null;
  }

  async function add(
    ctx: Context,
    input: {
      projectId: string;
      userId: string;
      projectRole?: ProjectMemberRole;
    },
  ): Promise<ProjectTeamMemberDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(
      ctx,
      "gestionar_equipo_proyecto",
      { forceDb: true },
    );
    await loadProject(user.organization_id, input.projectId);
    const targetUser = await loadUser(user.organization_id, input.userId);
    if (!targetUser) {
      throw new DomainError(
        "NOT_A_MEMBER",
        "El usuario no existe en la organización",
        404,
      );
    }
    const role = input.projectRole ?? "programador";
    return withTx(async (tx) => {
      // Defensa: 1 fila activa por (projectId, userId). Si ya existe
      // activa, error 409. Si existe inactiva, la reactivamos.
      const [existing] = await tx
        .select()
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.organizationId, user.organization_id),
            eq(projectMembers.projectId, input.projectId),
            eq(projectMembers.userId, input.userId),
          ),
        )
        .orderBy(desc(projectMembers.assignedAt))
        .limit(1);
      if (existing && existing.active) {
        throw new DomainError(
          "NOT_A_MEMBER",
          "El usuario ya es miembro activo del proyecto",
          409,
        );
      }
      if (existing && !existing.active) {
        const [reactivated] = await tx
          .update(projectMembers)
          .set({
            active: true,
            projectRole: role,
            assignedAt: new Date(),
            assignedBy: user.id,
          })
          .where(
            and(
              eq(projectMembers.organizationId, user.organization_id),
              eq(projectMembers.id, existing.id),
            ),
          )
          .returning();
        if (!reactivated) throw new Error("member reactivate sin fila");
        const { createAuditService } = await import(
          "@/server/services/audit"
        );
        await createAuditService().record(ctx, {
          entityType: "project_member",
          entityId: reactivated.id,
          action: "project_member.add",
          before: { active: false, projectRole: existing.projectRole },
          after: { active: true, projectRole: role },
          reason: `Reactivación de miembro (${input.userId})`,
        });
        return memberToDto(reactivated, targetUser);
      }
      const [created] = await tx
        .insert(projectMembers)
        .values({
          organizationId: user.organization_id,
          projectId: input.projectId,
          userId: input.userId,
          projectRole: role,
          assignedBy: user.id,
          active: true,
        })
        .returning();
      if (!created) throw new Error("member add sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "project_member",
        entityId: created.id,
        action: "project_member.add",
        after: {
          projectId: created.projectId,
          userId: created.userId,
          projectRole: created.projectRole,
        },
      });
      return memberToDto(created, targetUser);
    });
  }

  async function remove(
    ctx: Context,
    input: { memberId: string },
  ): Promise<ProjectTeamMemberDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(
      ctx,
      "gestionar_equipo_proyecto",
      { forceDb: true },
    );
    return withTx(async (tx) => {
      const [existing] = await tx
        .select()
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.organizationId, user.organization_id),
            eq(projectMembers.id, input.memberId),
          ),
        )
        .limit(1);
      if (!existing) {
        throw new DomainError(
          "NOT_A_MEMBER",
          "Membresía no encontrada",
          404,
        );
      }
      if (!existing.active) {
        throw new DomainError(
          "NOT_A_MEMBER",
          "La membresía ya estaba inactiva",
          409,
        );
      }
      if (existing.projectRole === "lider") {
        throw new DomainError(
          "NOT_A_MEMBER",
          "No se puede retirar al PL mientras esté activo",
          409,
        );
      }
      const [after] = await tx
        .update(projectMembers)
        .set({ active: false })
        .where(
          and(
            eq(projectMembers.organizationId, user.organization_id),
            eq(projectMembers.id, input.memberId),
          ),
        )
        .returning();
      if (!after) throw new Error("member remove sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "project_member",
        entityId: after.id,
        action: "project_member.remove",
        before: { active: true },
        after: { active: false },
      });
      return memberToDto(after, await loadUser(user.organization_id, after.userId));
    });
  }

  async function list(
    ctx: Context,
    input: { projectId: string; includeInactive?: boolean },
  ): Promise<ProjectTeamMemberDTO[]> {
    const user = requireUser(ctx);
    await loadProject(user.organization_id, input.projectId);
    const rows = await db
      .select({
        m: projectMembers,
        uName: users.name,
        uEmail: users.email,
      })
      .from(projectMembers)
      .leftJoin(users, eq(projectMembers.userId, users.id))
      .where(
        and(
          eq(projectMembers.organizationId, user.organization_id),
          eq(projectMembers.projectId, input.projectId),
        ),
      )
      .orderBy(desc(projectMembers.active), desc(projectMembers.assignedAt));
    const filtered = input.includeInactive
      ? rows
      : rows.filter((r) => r.m.active);
    return filtered.map((r) =>
      memberToDto(r.m, {
        name: r.uName ?? null,
        email: r.uEmail ?? null,
      }),
    );
  }

  async function isMember(input: {
    organizationId: string;
    projectId: string;
    userId: string;
  }): Promise<boolean> {
    const [row] = await db
      .select({
        ok: sql<number>`case when count(*) > 0 then 1 else 0 end`,
      })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.organizationId, input.organizationId),
          eq(projectMembers.projectId, input.projectId),
          eq(projectMembers.userId, input.userId),
          eq(projectMembers.active, true),
        ),
      )
      .groupBy(projectMembers.id)
      .limit(1);
    return (row?.ok ?? 0) === 1;
  }

  return { add, remove, list, isMember };
}
