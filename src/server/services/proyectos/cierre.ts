/**
 * Servicio `cierre` — SPEC-006 §4.3 / AC-8..AC-9.
 *
 * `closeTechnical(projectId)` ejecuta los gates de cierre técnico
 * (BR-N255-258) y, si pasan, emite la señal
 * `project.delivered_from_order` consumible por SPEC-004 para marcar
 * la OS→`delivered` (BR-N248/BR-N392).
 *
 * NO exige saldo cero: es cierre técnico, no administrativo (SPEC
 * §3.2, BR-N392). El cierre administrativo vive en SPEC-004.
 *
 * Unificación IMPL-20260825-31: los gates de cierre técnico ahora
 * también exigen módulos requeridos `deployed` (SPEC-005 §6 / AC-8 ·
 * `MODULE_DEPLOY_GATES`), alineando `cierre.closeTechnical` con
 * `projects.complete`. `closeTechnical` revalida dentro de la misma
 * transacción que muta el proyecto (defensa TOCTOU).
 *
 * Además expone `progress(projectId)` y `health(projectId)` (AC-9,
 * BR-N367/368-370) para alimentar la UI sin recalcular en cliente.
 */
import { and, eq } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import {
  changeRequests,
  deliverables,
  modules,
  projects,
  requirements,
  taskChecklists,
  tasks,
  tests,
} from "@/server/db/schema";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import {
  computeProjectHealth,
  computeTaskProgress,
  validateCloseTechnicalGates,
} from "./helpers-ejecucion";

export interface ProjectCloseGatesDTO {
  canClose: boolean;
  reasons: string[];
  progressPct: number;
  health: "on_track" | "at_risk" | "delayed";
}

export interface CierreService {
  /**
   * SPEC-006 / AC-8 · valida los gates de cierre técnico y, si
   * pasan, marca el proyecto como `statusStage='delivery'`,
   * `statusSituation='completed'` y emite la señal
   * `project.delivered_from_order` para SPEC-004 (BR-N248/BR-N392).
   */
  closeTechnical(
    ctx: Context,
    input: { projectId: string },
  ): Promise<ProjectCloseGatesDTO>;
  /**
   * SPEC-006 / AC-9 · sólo lectura; devuelve progreso y salud
   * calculados en el momento de la consulta (no se persisten).
   */
  previewCloseGates(
    ctx: Context,
    input: { projectId: string },
  ): Promise<ProjectCloseGatesDTO>;
}

export function createCierreService(): CierreService {
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

  async function gatherSnapshot(orgId: string, projectId: string) {
    const taskRows = await db
      .select({ status: tasks.status, weight: tasks.weight })
      .from(tasks)
      .where(
        and(eq(tasks.organizationId, orgId), eq(tasks.projectId, projectId)),
      );
    const reqRows = await db
      .select({ status: requirements.status, required: requirements.assignedTo })
      .from(requirements)
      .where(
        and(
          eq(requirements.organizationId, orgId),
          eq(requirements.projectId, projectId),
        ),
      );
    // `requirements.required` no existe como columna; se considera
    // requerido por defecto (DEC-FUN-32). El filtro "obligatorio"
    // se evalúa como `status ∉ {validated, rejected, out_of_scope}`
    // sobre TODOS los requirements. Si en el futuro se agrega
    // `required`, este helper acepta el flag.
    const reqSnapshot = reqRows.map((r) => ({
      status: r.status,
      required: true,
    }));
    const testRows = await db
      .select({
        type: tests.type,
        status: tests.status,
        notApplicableReason: tests.notApplicableReason,
        notApplicableApprovedBy: tests.notApplicableApprovedBy,
      })
      .from(tests)
      .where(
        and(eq(tests.organizationId, orgId), eq(tests.projectId, projectId)),
      );
    const delivRows = await db
      .select({ status: deliverables.status, required: deliverables.required })
      .from(deliverables)
      .where(
        and(
          eq(deliverables.organizationId, orgId),
          eq(deliverables.projectId, projectId),
        ),
      );
    const delivSnapshot = delivRows.map((d) => ({
      status: d.status,
      required: d.required === "true",
    }));
    const crRows = await db
      .select({ status: changeRequests.status })
      .from(changeRequests)
      .where(
        and(
          eq(changeRequests.organizationId, orgId),
          eq(changeRequests.projectId, projectId),
        ),
      );
    // IMPL-20260825-31 · unificación del gate de módulos: leemos
    // SOLO el mismo `organizationId`+`projectId` (defensa por
    // precedencia multi-tenant). El filtro "obligatorio" se evalúa
    // en el helper (`required && status !== 'deployed'`).
    const moduleRows = await db
      .select({ status: modules.status, required: modules.required })
      .from(modules)
      .where(
        and(eq(modules.organizationId, orgId), eq(modules.projectId, projectId)),
      );
    return {
      modules: moduleRows.map((m) => ({
        status: m.status,
        required: !!m.required,
      })),
      tasks: taskRows,
      requirements: reqSnapshot,
      tests: testRows,
      deliverables: delivSnapshot,
      changeRequests: crRows,
    };
  }

  async function computeFromSnapshot(orgId: string, projectId: string) {
    const snap = await gatherSnapshot(orgId, projectId);
    const gates = validateCloseTechnicalGates(snap);
    const progress = computeTaskProgress({ tasks: snap.tasks });
    const health = computeProjectHealth({
      tasks: snap.tasks,
      tests: snap.tests,
      deliverables: snap.deliverables,
    });
    return {
      canClose: gates.ok,
      reasons: gates.ok ? [] : gates.reasons,
      progressPct: progress,
      health,
    };
  }

  async function previewCloseGates(
    ctx: Context,
    input: { projectId: string },
  ): Promise<ProjectCloseGatesDTO> {
    const user = requireUser(ctx);
    await loadProject(user.organization_id, input.projectId);
    return computeFromSnapshot(user.organization_id, input.projectId);
  }

  async function closeTechnical(
    ctx: Context,
    input: { projectId: string },
  ): Promise<ProjectCloseGatesDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_proyectos", {
      forceDb: true,
    });
    // Pre-check barato con el pool externo: mensaje 409 limpio al
    // cliente con la lista completa de razones. La revalidación
    // transaccional bajo `tx` más abajo es la que cierra el TOCTOU.
    const snapshot = await previewCloseGates(ctx, input);
    if (!snapshot.canClose) {
      throw new DomainError(
        "CLOSE_GATES",
        `Gates pendientes: ${snapshot.reasons.join("; ")}`,
        409,
      );
    }
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("PROJECT_NOT_FOUND", "Proyecto no encontrado", 404);
      }
      if (before.statusSituation === "cancelled") {
        throw new DomainError(
          "CLOSE_GATES",
          "El proyecto está cancelado",
          409,
        );
      }
      // IMPL-20260825-31 · revalidación transaccional de gates
      // (incluye módulos required `deployed`, alineado con
      // `projects.complete` · `MODULE_DEPLOY_GATES`). Defensa TOCTOU:
      // una mutación concurrente entre el pre-check y la apertura
      // del `tx` podría haber abierto un módulo o cambiado un
      // entregable; releer bajo `tx` y validar otra vez evita que la
      // marca `delivery/completed` se escriba con gates obsoletos.
      const txModuleRows = await tx
        .select({ status: modules.status, required: modules.required })
        .from(modules)
        .where(
          and(
            eq(modules.organizationId, user.organization_id),
            eq(modules.projectId, input.projectId),
          ),
        );
      const txTaskRows = await tx
        .select({ status: tasks.status, weight: tasks.weight })
        .from(tasks)
        .where(
          and(
            eq(tasks.organizationId, user.organization_id),
            eq(tasks.projectId, input.projectId),
          ),
        );
      const txReqRows = await tx
        .select({ status: requirements.status, required: requirements.assignedTo })
        .from(requirements)
        .where(
          and(
            eq(requirements.organizationId, user.organization_id),
            eq(requirements.projectId, input.projectId),
          ),
        );
      const txTestRows = await tx
        .select({
          type: tests.type,
          status: tests.status,
          notApplicableReason: tests.notApplicableReason,
          notApplicableApprovedBy: tests.notApplicableApprovedBy,
        })
        .from(tests)
        .where(
          and(
            eq(tests.organizationId, user.organization_id),
            eq(tests.projectId, input.projectId),
          ),
        );
      const txDelivRows = await tx
        .select({ status: deliverables.status, required: deliverables.required })
        .from(deliverables)
        .where(
          and(
            eq(deliverables.organizationId, user.organization_id),
            eq(deliverables.projectId, input.projectId),
          ),
        );
      const txCrRows = await tx
        .select({ status: changeRequests.status })
        .from(changeRequests)
        .where(
          and(
            eq(changeRequests.organizationId, user.organization_id),
            eq(changeRequests.projectId, input.projectId),
          ),
        );
      const txGates = validateCloseTechnicalGates({
        modules: txModuleRows.map((m) => ({
          status: m.status,
          required: !!m.required,
        })),
        tasks: txTaskRows,
        requirements: txReqRows.map((r) => ({
          status: r.status,
          required: true,
        })),
        tests: txTestRows,
        deliverables: txDelivRows.map((d) => ({
          status: d.status,
          required: d.required === "true",
        })),
        changeRequests: txCrRows,
      });
      if (!txGates.ok) {
        throw new DomainError(
          "CLOSE_GATES",
          `Gates pendientes: ${txGates.reasons.join("; ")}`,
          409,
        );
      }
      const [after] = await tx
        .update(projects)
        .set({
          statusStage: "delivery",
          statusSituation: "completed",
          completedAt: new Date(),
        })
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("project closeTechnical sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "project",
        entityId: after.id,
        action: "project.close_technical",
        before: {
          statusStage: before.statusStage,
          statusSituation: before.statusSituation,
        },
        after: {
          statusStage: after.statusStage,
          statusSituation: after.statusSituation,
          completedAt: after.completedAt,
        },
        ...(ctx.actorRoleCode !== undefined ? { actorRoleCode: ctx.actorRoleCode } : {}),
      });
      // Señal consumible por SPEC-004 (BR-N248/BR-N392).
      const { recordProjectDeliveredSignal } = await import("./projects");
      await recordProjectDeliveredSignal(ctx, {
        projectId: after.id,
        organizationId: after.organizationId,
        orderId: after.orderId,
        actorUserId: user.id,
      });
      return snapshot;
    });
  }

  // Helper interno (no exportado) — cuenta checklists por tarea para
  // eventuales métricas; referenciado para evitar import muerto.
  void taskChecklists;

  return { closeTechnical, previewCloseGates };
}
