/**
 * Servicio `modules` — SPEC-005 §4.3 (AC-8).
 *
 * Reglas (BR-N113/114/260..263):
 *  - `pending → in_progress | cancelled`.
 *  - `in_progress → testing | paused | blocked | cancelled`.
 *  - `testing → deployed | in_progress | paused | blocked | cancelled`.
 *  - `deployed` es cierre técnico (DEC-FUN-59); sólo admite `testing`
 *    (reapertura) para correcciones post-cierre.
 *  - `cancelled` terminal absoluto.
 *  - `deployed` sin gates (BR-N113) — los gates de aceptación los
 *    ejecuta SPEC-006. Aquí sólo se valida la transición.
 *
 * `dependsOnModules` (jsonb) registra las dependencias módulo-a-módulo
 * para que la UI y futuros jobs respeten el orden lógico (BR-N114).
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import { modules, projects } from "@/server/db/schema";
import {
  MODULE_STATUSES,
  type ModuleStatus,
  type ProjectHealth,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import { canTransitionModule, computeCalculatedHealth } from "./helpers";

export interface ModuleDTO {
  id: string;
  organizationId: string;
  projectId: string;
  code: string;
  name: string;
  status: ModuleStatus;
  required: boolean;
  dependsOnModules: string[];
  sortOrder: number;
  deployedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModulesService {
  list(ctx: Context, input: { projectId: string }): Promise<ModuleDTO[]>;
  transition(
    ctx: Context,
    input: { moduleId: string; targetStatus: ModuleStatus; reason?: string },
  ): Promise<ModuleDTO>;
}

function statusOf(value: string): ModuleStatus {
  return (MODULE_STATUSES as readonly string[]).includes(value)
    ? (value as ModuleStatus)
    : "pending";
}

function toDto(row: typeof modules.$inferSelect): ModuleDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    code: row.code,
    name: row.name,
    status: statusOf(row.status),
    required: row.required,
    dependsOnModules: (row.dependsOnModules ?? []) as string[],
    sortOrder: row.sortOrder,
    deployedAt: row.deployedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createModulesService(): ModulesService {
  const db = getDb();

  async function list(
    ctx: Context,
    input: { projectId: string },
  ): Promise<ModuleDTO[]> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "operar_proyectos", {
      forceDb: true,
    });
    const rows = await db
      .select()
      .from(modules)
      .where(
        and(
          eq(modules.organizationId, user.organization_id),
          eq(modules.projectId, input.projectId),
        ),
      )
      .orderBy(asc(modules.sortOrder));
    return rows.map(toDto);
  }

  async function transition(
    ctx: Context,
    input: { moduleId: string; targetStatus: ModuleStatus; reason?: string },
  ): Promise<ModuleDTO> {
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
        .from(modules)
        .where(
          and(
            eq(modules.id, input.moduleId),
            eq(modules.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("MODULE_NOT_FOUND", "Módulo no encontrado", 404);
      }
      const t = canTransitionModule(before.status, input.targetStatus);
      if (!t.ok) {
        throw new DomainError(
          t.code,
          `Transición inválida (${before.status} → ${input.targetStatus})`,
          409,
        );
      }
      // Si va a `deployed`, exigimos motivo ≥3 (trazabilidad del cierre
      // técnico — defensa de auditoría).
      if (input.targetStatus === "deployed" && (input.reason ?? "").trim().length < 3) {
        throw new DomainError(
          "MODULE_DEPLOY_GATES",
          "El cierre técnico del módulo requiere motivo (≥3 caracteres)",
          400,
        );
      }
      const [after] = await tx
        .update(modules)
        .set({
          status: input.targetStatus,
          deployedAt: input.targetStatus === "deployed" ? new Date() : before.deployedAt,
        })
        .where(
          and(
            eq(modules.id, input.moduleId),
            eq(modules.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("module transition sin fila");
      // Recalcular salud calculada del proyecto.
      const moduleRows = await tx
        .select({ status: modules.status, required: modules.required })
        .from(modules)
        .where(
          and(
            eq(modules.organizationId, user.organization_id),
            eq(modules.projectId, before.projectId),
          ),
        );
      const newCalc: ProjectHealth = computeCalculatedHealth(
        moduleRows.map((m) => ({ status: m.status, required: m.required })),
      );
      await tx
        .update(projects)
        .set({ healthCalculated: newCalc })
        .where(
          and(
            eq(projects.organizationId, user.organization_id),
            eq(projects.id, before.projectId),
          ),
        );
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "module",
        entityId: after.id,
        action: "module.transition",
        before: { status: before.status },
        after: {
          status: after.status,
          deployedAt: after.deployedAt,
          projectHealthCalculated: newCalc,
          reason: input.reason ?? null,
        },
      });
      return toDto(after);
    });
  }

  return { list, transition };
}

// Re-export the helper used externally.
export { sql, desc };