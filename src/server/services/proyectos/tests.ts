/**
 * Servicio `tests` (pruebas del proyecto) — SPEC-006 §4.3 / AC-5.
 *
 * 7 tipos (TEST_TYPES); los 5 bloqueantes (functional/visual/ui/
 * acceptance/compatibility) cierran el proyecto (BR-N284/285);
 * performance/security sólo `at_risk`.
 *
 * `markNotApplicable` (BR-N389) exige justificación (≥3 chars) y,
 * cuando el tipo es `acceptance`, además aprobación Director
 * (`aprobar_cambios`).
 */
import { and, asc, eq } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import {
  projects,
  tests,
} from "@/server/db/schema";
import {
  TEST_STATUSES,
  TEST_TYPES,
  type TestStatus,
  type TestType,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import {
  validateTestMarkNotApplicable,
  isBlockingTestType,
} from "./helpers-ejecucion";

export interface TestDTO {
  id: string;
  organizationId: string;
  projectId: string;
  moduleId: string | null;
  requirementId: string | null;
  type: TestType;
  status: TestStatus;
  result: string | null;
  incident: string | null;
  notApplicableReason: string | null;
  notApplicableApprovedBy: string | null;
  blocking: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestsService {
  create(
    ctx: Context,
    input: {
      projectId: string;
      moduleId?: string | null;
      requirementId?: string | null;
      type: TestType;
      result?: string;
    },
  ): Promise<TestDTO>;
  transition(
    ctx: Context,
    input: {
      testId: string;
      targetStatus: Exclude<TestStatus, "not_applicable">;
      result?: string;
      incident?: string;
    },
  ): Promise<TestDTO>;
  markNotApplicable(
    ctx: Context,
    input: { testId: string; reason: string },
  ): Promise<TestDTO>;
  list(
    ctx: Context,
    input: { projectId: string; type?: TestType; status?: TestStatus },
  ): Promise<TestDTO[]>;
}

function typeOf(value: string): TestType {
  return (TEST_TYPES as readonly string[]).includes(value)
    ? (value as TestType)
    : "functional";
}

function statusOf(value: string): TestStatus {
  return (TEST_STATUSES as readonly string[]).includes(value)
    ? (value as TestStatus)
    : "pending";
}

function toDto(row: typeof tests.$inferSelect): TestDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    moduleId: row.moduleId ?? null,
    requirementId: row.requirementId ?? null,
    type: typeOf(row.type),
    status: statusOf(row.status),
    result: row.result ?? null,
    incident: row.incident ?? null,
    notApplicableReason: row.notApplicableReason ?? null,
    notApplicableApprovedBy: row.notApplicableApprovedBy ?? null,
    blocking: isBlockingTestType(row.type),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createTestsService(): TestsService {
  const db = getDb();

  async function loadTest(orgId: string, testId: string) {
    const [row] = await db
      .select()
      .from(tests)
      .where(and(eq(tests.organizationId, orgId), eq(tests.id, testId)))
      .limit(1);
    if (!row) {
      throw new DomainError("TEST_NOT_FOUND", "Prueba no encontrada", 404);
    }
    return row;
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
      moduleId?: string | null;
      requirementId?: string | null;
      type: TestType;
      result?: string;
    },
  ): Promise<TestDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "operar_proyectos", {
      forceDb: true,
    });
    await loadProject(user.organization_id, input.projectId);
    const [created] = await db
      .insert(tests)
      .values({
        organizationId: user.organization_id,
        projectId: input.projectId,
        moduleId: input.moduleId ?? null,
        requirementId: input.requirementId ?? null,
        type: input.type,
        status: "pending",
        ...(input.result !== undefined ? { result: input.result } : {}),
      })
      .returning();
    if (!created) throw new Error("test create sin fila");
    const { createAuditService } = await import("@/server/services/audit");
    await createAuditService().record(ctx, {
      entityType: "test",
      entityId: created.id,
      action: "test.create",
      after: {
        projectId: created.projectId,
        type: created.type,
        moduleId: created.moduleId,
        requirementId: created.requirementId,
      },
    });
    return toDto(created);
  }

  async function transition(
    ctx: Context,
    input: {
      testId: string;
      targetStatus: Exclude<TestStatus, "not_applicable">;
      result?: string;
      incident?: string;
    },
  ): Promise<TestDTO> {
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
        .from(tests)
        .where(
          and(
            eq(tests.organizationId, user.organization_id),
            eq(tests.id, input.testId),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("TEST_NOT_FOUND", "Prueba no encontrada", 404);
      }
      if (before.status === "not_applicable") {
        throw new DomainError(
          "TEST_INVALID_TRANSITION",
          "Una prueba marcada como not_applicable no puede transitar de estado",
          409,
        );
      }
      const update: Partial<typeof tests.$inferInsert> = {
        status: input.targetStatus,
      };
      if (input.result !== undefined) update.result = input.result;
      if (input.incident !== undefined) update.incident = input.incident;
      const [after] = await tx
        .update(tests)
        .set(update)
        .where(
          and(
            eq(tests.organizationId, user.organization_id),
            eq(tests.id, input.testId),
          ),
        )
        .returning();
      if (!after) throw new Error("test transition sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "test",
        entityId: after.id,
        action: "test.transition",
        before: { status: before.status },
        after: {
          status: after.status,
          result: after.result ?? null,
          incident: after.incident ?? null,
        },
      });
      return toDto(after);
    });
  }

  async function markNotApplicable(
    ctx: Context,
    input: { testId: string; reason: string },
  ): Promise<TestDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "operar_proyectos", {
      forceDb: true,
    });
    const before = await loadTest(user.organization_id, input.testId);
    const approvalNeeded = before.type === "acceptance";
    const actorHasApprove = approvalNeeded
      ? await createHasPermissionService().has(ctx, "aprobar_cambios")
      : true;
    const validation = validateTestMarkNotApplicable({
      type: before.type,
      reason: input.reason,
      approvedByActorHasApproveCambios: actorHasApprove,
    });
    if (!validation.ok) {
      throw new DomainError(
        validation.code,
        validation.code === "ACCEPTANCE_TEST_REQUIRED"
          ? "Las pruebas acceptance requieren excepción del Director"
          : "Justificación obligatoria (≥3 caracteres)",
        validation.code === "ACCEPTANCE_TEST_REQUIRED" ? 409 : 400,
      );
    }
    const [after] = await db
      .update(tests)
      .set({
        status: "not_applicable",
        notApplicableReason: input.reason.trim(),
        ...(approvalNeeded
          ? { notApplicableApprovedBy: user.id }
          : {}),
      })
      .where(
        and(
          eq(tests.organizationId, user.organization_id),
          eq(tests.id, input.testId),
        ),
      )
      .returning();
    if (!after) throw new Error("test markNotApplicable sin fila");
    const { createAuditService } = await import("@/server/services/audit");
    await createAuditService().record(ctx, {
      entityType: "test",
      entityId: after.id,
      action: "test.mark_not_applicable",
      before: { status: before.status },
      after: {
        status: after.status,
        reason: after.notApplicableReason,
        approvedBy: after.notApplicableApprovedBy,
      },
      ...(ctx.actorRoleCode !== undefined ? { actorRoleCode: ctx.actorRoleCode } : {}),
    });
    return toDto(after);
  }

  async function list(
    ctx: Context,
    input: { projectId: string; type?: TestType; status?: TestStatus },
  ): Promise<TestDTO[]> {
    const user = requireUser(ctx);
    const where = [
      eq(tests.organizationId, user.organization_id),
      eq(tests.projectId, input.projectId),
    ];
    if (input.type) where.push(eq(tests.type, input.type));
    if (input.status) where.push(eq(tests.status, input.status));
    const rows = await db
      .select()
      .from(tests)
      .where(and(...where))
      .orderBy(asc(tests.type), asc(tests.createdAt));
    return rows.map(toDto);
  }

  return { create, transition, markNotApplicable, list };
}
