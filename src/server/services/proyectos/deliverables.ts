/**
 * Servicio `deliverables` — SPEC-006 §4.3 / AC-6.
 *
 * Aceptación por proxy del PL (BR-N287/DEC-FUN-55): exige identidad,
 * organización, fecha, medio y archivo de evidencia. Sin alguno →
 * `ACCEPTANCE_EVIDENCE_REQUIRED` (409). El PL es REGISTRADOR, no
 * aceptante: el servicio rechaza si `accepterName` coincide con el
 * nombre del PL activo del proyecto.
 */
import { and, asc, eq } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import {
  deliverables,
  files,
  projectMembers,
  projects,
  users,
} from "@/server/db/schema";
import {
  DELIVERABLE_STATUSES,
  type DeliverableStatus,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import {
  canTransitionDeliverable,
  validateDeliverableAcceptance,
} from "./helpers-ejecucion";

export interface DeliverableDTO {
  id: string;
  organizationId: string;
  projectId: string;
  moduleId: string | null;
  name: string;
  version: string;
  status: DeliverableStatus;
  required: boolean;
  committedDate: string;
  actualDate: string | null;
  accepterName: string | null;
  accepterOrg: string | null;
  acceptedAt: Date | null;
  acceptedMedium: string | null;
  evidenceFileId: string | null;
  comments: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliverablesService {
  create(
    ctx: Context,
    input: {
      projectId: string;
      moduleId?: string | null;
      name: string;
      version: string;
      committedDate: string;
      required?: boolean;
    },
  ): Promise<DeliverableDTO>;
  transition(
    ctx: Context,
    input: {
      deliverableId: string;
      targetStatus: Exclude<
        DeliverableStatus,
        "accepted"
      >;
      actualDate?: string;
    },
  ): Promise<DeliverableDTO>;
  accept(
    ctx: Context,
    input: {
      deliverableId: string;
      accepterName: string;
      accepterOrg: string;
      acceptedMedium: string;
      evidenceFileId: string;
      comments?: string;
    },
  ): Promise<DeliverableDTO>;
  list(
    ctx: Context,
    input: { projectId: string; status?: DeliverableStatus },
  ): Promise<DeliverableDTO[]>;
}

function statusOf(value: string): DeliverableStatus {
  return (DELIVERABLE_STATUSES as readonly string[]).includes(value)
    ? (value as DeliverableStatus)
    : "pending";
}

function toDto(row: typeof deliverables.$inferSelect): DeliverableDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    moduleId: row.moduleId ?? null,
    name: row.name,
    version: row.version,
    status: statusOf(row.status),
    required: row.required === "true",
    committedDate: row.committedDate,
    actualDate: row.actualDate ?? null,
    accepterName: row.accepterName ?? null,
    accepterOrg: row.accepterOrg ?? null,
    acceptedAt: row.acceptedAt,
    acceptedMedium: row.acceptedMedium ?? null,
    evidenceFileId: row.evidenceFileId ?? null,
    comments: row.comments ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createDeliverablesService(): DeliverablesService {
  const db = getDb();

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

  async function loadDeliverable(orgId: string, deliverableId: string) {
    const [row] = await db
      .select()
      .from(deliverables)
      .where(
        and(
          eq(deliverables.organizationId, orgId),
          eq(deliverables.id, deliverableId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new DomainError(
        "DELIVERABLE_NOT_FOUND",
        "Entregable no encontrado",
        404,
      );
    }
    return row;
  }

  async function loadFile(orgId: string, fileId: string) {
    const [row] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.organizationId, orgId)))
      .limit(1);
    return row;
  }

  async function loadProjectLeadUserName(
    orgId: string,
    projectId: string,
  ): Promise<string | null> {
    const [row] = await db
      .select({ name: users.name })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(
        and(
          eq(projectMembers.organizationId, orgId),
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.projectRole, "lider"),
          eq(projectMembers.active, true),
        ),
      )
      .limit(1);
    return row?.name ?? null;
  }

  async function create(
    ctx: Context,
    input: {
      projectId: string;
      moduleId?: string | null;
      name: string;
      version: string;
      committedDate: string;
      required?: boolean;
    },
  ): Promise<DeliverableDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_proyectos", {
      forceDb: true,
    });
    await loadProject(user.organization_id, input.projectId);
    const [created] = await db
      .insert(deliverables)
      .values({
        organizationId: user.organization_id,
        projectId: input.projectId,
        moduleId: input.moduleId ?? null,
        name: input.name,
        version: input.version,
        committedDate: input.committedDate,
        required: input.required === false ? "false" : "true",
        status: "pending",
      })
      .returning();
    if (!created) throw new Error("deliverable create sin fila");
    const { createAuditService } = await import("@/server/services/audit");
    await createAuditService().record(ctx, {
      entityType: "deliverable",
      entityId: created.id,
      action: "deliverable.create",
      after: {
        projectId: created.projectId,
        name: created.name,
        version: created.version,
        status: created.status,
      },
    });
    return toDto(created);
  }

  async function transition(
    ctx: Context,
    input: {
      deliverableId: string;
      targetStatus: Exclude<DeliverableStatus, "accepted">;
      actualDate?: string;
    },
  ): Promise<DeliverableDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "operar_proyectos", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const before = await loadDeliverable(
        user.organization_id,
        input.deliverableId,
      );
      const t = canTransitionDeliverable(before.status, input.targetStatus);
      if (!t.ok) {
        throw new DomainError(
          t.code,
          `Transición inválida (${before.status} → ${input.targetStatus})`,
          409,
        );
      }
      const update: Partial<typeof deliverables.$inferInsert> = {
        status: input.targetStatus,
      };
      if (input.targetStatus === "delivered") {
        update.actualDate = input.actualDate ?? new Date().toISOString().slice(0, 10);
      }
      const [after] = await tx
        .update(deliverables)
        .set(update)
        .where(
          and(
            eq(deliverables.organizationId, user.organization_id),
            eq(deliverables.id, input.deliverableId),
          ),
        )
        .returning();
      if (!after) throw new Error("deliverable transition sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "deliverable",
        entityId: after.id,
        action: "deliverable.transition",
        before: { status: before.status },
        after: {
          status: after.status,
          actualDate: after.actualDate,
        },
      });
      return toDto(after);
    });
  }

  async function accept(
    ctx: Context,
    input: {
      deliverableId: string;
      accepterName: string;
      accepterOrg: string;
      acceptedMedium: string;
      evidenceFileId: string;
      comments?: string;
    },
  ): Promise<DeliverableDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_proyectos", {
      forceDb: true,
    });
    const before = await loadDeliverable(
      user.organization_id,
      input.deliverableId,
    );
    if (before.status === "accepted" || before.status === "rejected") {
      throw new DomainError(
        "DELIVERABLE_INVALID_TRANSITION",
        "El entregable ya está cerrado",
        409,
      );
    }
    const validation = validateDeliverableAcceptance({
      accepterName: input.accepterName,
      accepterOrg: input.accepterOrg,
      acceptedMedium: input.acceptedMedium,
      evidenceFileId: input.evidenceFileId,
    });
    if (!validation.ok) {
      throw new DomainError(
        validation.code,
        "Falta identidad/org/medio/evidencia de aceptación",
        409,
      );
    }
    // Defensa adicional: la evidencia debe existir.
    const file = await loadFile(user.organization_id, input.evidenceFileId);
    if (!file) {
      throw new DomainError(
        "ACCEPTANCE_EVIDENCE_REQUIRED",
        "El archivo de evidencia no existe",
        409,
      );
    }
    // DEC-FUN-55 · el PL NO puede figurar como aceptante. Si el
    // `accepterName` coincide con el nombre del PL activo, rechazar.
    const plName = await loadProjectLeadUserName(
      user.organization_id,
      before.projectId,
    );
    if (
      plName &&
      plName.trim().toLowerCase() === input.accepterName.trim().toLowerCase()
    ) {
      throw new DomainError(
        "ACCEPTANCE_EVIDENCE_REQUIRED",
        "El PL es registrador, no aceptante",
        409,
      );
    }
    const [after] = await db
      .update(deliverables)
      .set({
        status: "accepted",
        accepterName: input.accepterName.trim(),
        accepterOrg: input.accepterOrg.trim(),
        acceptedMedium: input.acceptedMedium,
        evidenceFileId: input.evidenceFileId,
        acceptedAt: new Date(),
        ...(input.comments !== undefined ? { comments: input.comments } : {}),
      })
      .where(
        and(
          eq(deliverables.organizationId, user.organization_id),
          eq(deliverables.id, input.deliverableId),
        ),
      )
      .returning();
    if (!after) throw new Error("deliverable accept sin fila");
    const { createAuditService } = await import("@/server/services/audit");
    await createAuditService().record(ctx, {
      entityType: "deliverable",
      entityId: after.id,
      action: "deliverable.accept",
      before: { status: before.status },
      after: {
        status: after.status,
        accepterName: after.accepterName,
        accepterOrg: after.accepterOrg,
        acceptedMedium: after.acceptedMedium,
        evidenceFileId: after.evidenceFileId,
      },
      ...(ctx.actorRoleCode !== undefined ? { actorRoleCode: ctx.actorRoleCode } : {}),
    });
    return toDto(after);
  }

  async function list(
    ctx: Context,
    input: { projectId: string; status?: DeliverableStatus },
  ): Promise<DeliverableDTO[]> {
    const user = requireUser(ctx);
    const where = [
      eq(deliverables.organizationId, user.organization_id),
      eq(deliverables.projectId, input.projectId),
    ];
    if (input.status) where.push(eq(deliverables.status, input.status));
    const rows = await db
      .select()
      .from(deliverables)
      .where(and(...where))
      .orderBy(asc(deliverables.committedDate), asc(deliverables.createdAt));
    return rows.map(toDto);
  }

  return { create, transition, accept, list };
}
