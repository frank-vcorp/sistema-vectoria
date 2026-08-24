/**
 * Servicio `requirements` — SPEC-006 §4.3 / AC-1.
 *
 * Requerimientos del proyecto. Línea principal:
 *   proposed → analysis → approved → development → testing → validated
 * Laterales: `rejected`, `out_of_scope` (terminales).
 *
 * El servicio exige permisos `gestionar_proyectos` para crear/transition
 * (el PL/director/equipo amplío opera sobre el módulo). El
 * `canTransitionRequirement` puro vive en `helpers-ejecucion.ts`.
 */
import { and, asc, eq } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import {
  requirements,
  projects,
} from "@/server/db/schema";
import {
  REQUIREMENT_STATUSES,
  type RequirementStatus,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import { canTransitionRequirement } from "./helpers-ejecucion";

export interface RequirementDTO {
  id: string;
  organizationId: string;
  projectId: string;
  moduleId: string | null;
  folio: string;
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
  status: RequirementStatus;
  reason: string | null;
  assignedTo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RequirementsService {
  create(
    ctx: Context,
    input: {
      projectId: string;
      moduleId?: string | null;
      folio: string;
      title: string;
      description?: string;
      acceptanceCriteria?: string;
    },
  ): Promise<RequirementDTO>;
  transition(
    ctx: Context,
    input: {
      requirementId: string;
      targetStatus: RequirementStatus;
      reason?: string;
    },
  ): Promise<RequirementDTO>;
  byId(
    ctx: Context,
    input: { requirementId: string },
  ): Promise<RequirementDTO>;
  list(
    ctx: Context,
    input: { projectId: string; status?: RequirementStatus },
  ): Promise<RequirementDTO[]>;
}

function statusOf(value: string): RequirementStatus {
  return (REQUIREMENT_STATUSES as readonly string[]).includes(value)
    ? (value as RequirementStatus)
    : "proposed";
}

function toDto(row: typeof requirements.$inferSelect): RequirementDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    moduleId: row.moduleId ?? null,
    folio: row.folio,
    title: row.title,
    description: row.description ?? null,
    acceptanceCriteria: row.acceptanceCriteria ?? null,
    status: statusOf(row.status),
    reason: row.reason ?? null,
    assignedTo: row.assignedTo ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createRequirementsService(): RequirementsService {
  const db = getDb();

  async function loadRequirement(orgId: string, reqId: string) {
    const [row] = await db
      .select()
      .from(requirements)
      .where(
        and(
          eq(requirements.organizationId, orgId),
          eq(requirements.id, reqId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new DomainError(
        "REQUIREMENT_NOT_FOUND",
        "Requerimiento no encontrado",
        404,
      );
    }
    return row;
  }

  async function create(
    ctx: Context,
    input: {
      projectId: string;
      moduleId?: string | null;
      folio: string;
      title: string;
      description?: string;
      acceptanceCriteria?: string;
    },
  ): Promise<RequirementDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_proyectos", {
      forceDb: true,
    });
    const [project] = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, input.projectId),
          eq(projects.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!project) {
      throw new DomainError("PROJECT_NOT_FOUND", "Proyecto no encontrado", 404);
    }
    return withTx(async (tx) => {
      const [created] = await tx
        .insert(requirements)
        .values({
          organizationId: user.organization_id,
          projectId: input.projectId,
          moduleId: input.moduleId ?? null,
          folio: input.folio,
          title: input.title,
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.acceptanceCriteria !== undefined
            ? { acceptanceCriteria: input.acceptanceCriteria }
            : {}),
          status: "proposed",
        })
        .returning();
      if (!created) throw new Error("requirement create sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "requirement",
        entityId: created.id,
        action: "requirement.create",
        after: {
          projectId: created.projectId,
          folio: created.folio,
          title: created.title,
          status: created.status,
        },
      });
      return toDto(created);
    });
  }

  async function transition(
    ctx: Context,
    input: {
      requirementId: string;
      targetStatus: RequirementStatus;
      reason?: string;
    },
  ): Promise<RequirementDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "operar_proyectos", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(requirements)
        .where(
          and(
            eq(requirements.organizationId, user.organization_id),
            eq(requirements.id, input.requirementId),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError(
          "REQUIREMENT_NOT_FOUND",
          "Requerimiento no encontrado",
          404,
        );
      }
      const t = canTransitionRequirement(before.status, input.targetStatus);
      if (!t.ok) {
        throw new DomainError(
          t.code,
          `Transición inválida (${before.status} → ${input.targetStatus})`,
          409,
        );
      }
      const [after] = await tx
        .update(requirements)
        .set({
          status: input.targetStatus,
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
        })
        .where(
          and(
            eq(requirements.organizationId, user.organization_id),
            eq(requirements.id, input.requirementId),
          ),
        )
        .returning();
      if (!after) throw new Error("requirement transition sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "requirement",
        entityId: after.id,
        action: "requirement.transition",
        before: { status: before.status },
        after: {
          status: after.status,
          reason: input.reason ?? null,
        },
      });
      return toDto(after);
    });
  }

  async function byId(
    ctx: Context,
    input: { requirementId: string },
  ): Promise<RequirementDTO> {
    const user = requireUser(ctx);
    const row = await loadRequirement(user.organization_id, input.requirementId);
    return toDto(row);
  }

  async function list(
    ctx: Context,
    input: { projectId: string; status?: RequirementStatus },
  ): Promise<RequirementDTO[]> {
    const user = requireUser(ctx);
    const where = [
      eq(requirements.organizationId, user.organization_id),
      eq(requirements.projectId, input.projectId),
    ];
    if (input.status) where.push(eq(requirements.status, input.status));
    const rows = await db
      .select()
      .from(requirements)
      .where(and(...where))
      .orderBy(
        asc(requirements.folio),
        asc(requirements.createdAt),
      );
    return rows.map(toDto);
  }

  return { create, transition, byId, list };
}
