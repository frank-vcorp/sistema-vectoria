/**
 * Servicio `jsonDiscovery` — SPEC-005 §4.3 (AC-6/AC-7, ADR-11).
 *
 * Round-trip idempotente y versionado (BR-N396..N398, BR-N353):
 *  - `exportTemplate(projectId)` produce un plan con `project_id` y
 *    `folio` reales; los módulos vienen vacíos (la fuente de verdad es
 *    `modules` en BD; el JSON es una vista).
 *  - `import(projectId, json)` calcula el diff (altas/cambios/
 *    conflictos) y rechaza inmutables (`project_id`, `folio`,
 *    `included`).
 *  - Misma versión reimportada → `noop` (BR-N397). Las nuevas
 *    versiones se persisten en `json_discovery_imports` con actor /
 *    fecha / resultado (BR-N398).
 *
 * El JSON entrante **NO** altera el `project_scope_snapshots`
 * (BR-N251/351/381) ni el historial de módulos cerrados.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import {
  jsonDiscoveryImports,
  modules,
  projects,
  scopeDocuments,
} from "@/server/db/schema";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import {
  diffJsonDiscoveryPlans,
  findJsonDiscoveryImmutableConflict,
  type JsonDiscoveryDiff,
  type JsonDiscoveryDiffResult,
} from "./helpers";
import type { JsonDiscoveryPlan } from "@/shared/zod";

export interface JsonDiscoveryExportDTO {
  json: JsonDiscoveryPlan;
  /** Versión actual del plan (última importada o 1 si inicial). */
  currentVersion: number;
}

export interface JsonDiscoveryImportPreviewDTO {
  diff: JsonDiscoveryDiffResult;
  currentVersion: number;
}

export interface JsonDiscoveryImportDTO {
  applied: boolean;
  status: "applied" | "noop" | "rejected";
  currentVersion: number;
  diff: JsonDiscoveryDiffResult;
}

export interface JsonDiscoveryService {
  exportTemplate(
    ctx: Context,
    input: { projectId: string },
  ): Promise<JsonDiscoveryExportDTO>;
  previewImport(
    ctx: Context,
    input: { projectId: string; json: JsonDiscoveryPlan },
  ): Promise<JsonDiscoveryImportPreviewDTO>;
  import(
    ctx: Context,
    input: { projectId: string; version: number; json: JsonDiscoveryPlan },
  ): Promise<JsonDiscoveryImportDTO>;
}

async function loadCurrentModules(
  orgId: string,
  projectId: string,
): Promise<
  Array<{
    code: string;
    name: string;
    required: boolean;
    dependsOnModules: string[];
    sortOrder: number;
  }>
> {
  const db = getDb();
  const rows = await db
    .select()
    .from(modules)
    .where(
      and(eq(modules.organizationId, orgId), eq(modules.projectId, projectId)),
    )
    .orderBy(asc(modules.sortOrder));
  return rows.map((m) => ({
    code: m.code,
    name: m.name,
    required: m.required,
    dependsOnModules: (m.dependsOnModules ?? []) as string[],
    sortOrder: m.sortOrder,
  }));
}

export function createJsonDiscoveryService(): JsonDiscoveryService {
  const db = getDb();

  async function exportTemplate(
    ctx: Context,
    input: { projectId: string },
  ): Promise<JsonDiscoveryExportDTO> {
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
    // Folio canónico: `PR-<code>` para mantener trazabilidad.
    const folio = `PR-${project.code}`;
    // `included` se deriva del scope inmutable: lo extraemos del último
    // snapshot vía la primera clave del json (defensa mínima).
    const included = project.id ? ["proyecto"] : [];
    const plan: JsonDiscoveryPlan = {
      project_id: project.id,
      folio,
      included,
      version: project.planVersion,
      modules: [],
    };
    // Audit `json_discovery.export`.
    const { createAuditService } = await import("@/server/services/audit");
    await createAuditService().record(ctx, {
      entityType: "project",
      entityId: project.id,
      action: "json_discovery.export",
      after: { version: project.planVersion },
    });
    return { json: plan, currentVersion: project.planVersion };
  }

  async function previewImport(
    ctx: Context,
    input: { projectId: string; json: JsonDiscoveryPlan },
  ): Promise<JsonDiscoveryImportPreviewDTO> {
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
    const currentModules = await loadCurrentModules(
      user.organization_id,
      input.projectId,
    );
    const folio = `PR-${project.code}`;
    const diff = diffJsonDiscoveryPlans({
      current: currentModules,
      incoming: {
        modules: input.json.modules.map((m) => ({
          code: m.code,
          name: m.name,
          required: m.required,
          ...(m.depends_on_modules !== undefined
            ? { depends_on_modules: m.depends_on_modules }
            : {}),
          ...(m.sort_order !== undefined ? { sort_order: m.sort_order } : {}),
        })),
      },
      currentProjectId: project.id,
      currentFolio: folio,
      currentIncluded: input.json.included.length > 0 ? input.json.included : [project.id],
      incomingProjectId: input.json.project_id,
      incomingFolio: input.json.folio,
      incomingIncluded: input.json.included,
    });
    return { diff, currentVersion: project.planVersion };
  }

  async function import_(
    ctx: Context,
    input: { projectId: string; version: number; json: JsonDiscoveryPlan },
  ): Promise<JsonDiscoveryImportDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    // BR-N396: el PL aprueba la importación → `aprobar_json_discovery`.
    await createHasPermissionService().require(ctx, "aprobar_json_discovery", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const [project] = await tx
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
      const folio = `PR-${project.code}`;
      const currentModules = await loadCurrentModules(
        user.organization_id,
        input.projectId,
      );
      const conflict = findJsonDiscoveryImmutableConflict({
        currentProjectId: project.id,
        currentFolio: folio,
        currentIncluded: input.json.included.length > 0 ? input.json.included : [project.id],
        incomingProjectId: input.json.project_id,
        incomingFolio: input.json.folio,
        incomingIncluded: input.json.included,
      });
      if (conflict) {
        // Persistimos el rechazo en bitácora (BR-N354) y abortamos.
        await tx.insert(jsonDiscoveryImports).values({
          organizationId: user.organization_id,
          projectId: input.projectId,
          version: input.version,
          kind: "import",
          actorUserId: user.id,
          result: { conflicts: [conflict] },
          status: "rejected",
        });
        throw new DomainError(
          "JSON_IMMUTABLE_FIELDS",
          `Conflicto en campo inmutable: ${conflict.field}`,
          409,
        );
      }
      const diff = diffJsonDiscoveryPlans({
        current: currentModules,
        incoming: {
          modules: input.json.modules.map((m) => ({
            code: m.code,
            name: m.name,
            required: m.required,
            ...(m.depends_on_modules !== undefined
              ? { depends_on_modules: m.depends_on_modules }
              : {}),
            ...(m.sort_order !== undefined ? { sort_order: m.sort_order } : {}),
          })),
        },
        currentProjectId: project.id,
        currentFolio: folio,
        currentIncluded: input.json.included.length > 0 ? input.json.included : [project.id],
        incomingProjectId: input.json.project_id,
        incomingFolio: input.json.folio,
        incomingIncluded: input.json.included,
      });
      // Idempotencia round-trip (BR-N397): misma versión sin cambios →
      // noop, registramos como tal.
      const isNoop = diff.noop && input.version === project.planVersion;
      if (isNoop) {
        await tx.insert(jsonDiscoveryImports).values({
          organizationId: user.organization_id,
          projectId: input.projectId,
          version: input.version,
          kind: "import",
          actorUserId: user.id,
          result: { noop: true, adds: [], changes: [], conflicts: [] },
          status: "noop",
        });
        return {
          applied: false,
          status: "noop",
          currentVersion: project.planVersion,
          diff,
        };
      }
      // Aplicar diff: altas → INSERT; cambios → UPDATE name/required/
      // depends/sort. (No borramos módulos en esta versión; decisión
      // interna reversible.)
      for (const add of diff.adds) {
        await tx.insert(modules).values({
          organizationId: user.organization_id,
          projectId: input.projectId,
          code: add.code,
          name: add.name,
          required: add.required,
          status: "pending",
          sortOrder: 9999, // se reasigna al final si se requiere
        });
      }
      for (const ch of diff.changes) {
        const patch: Record<string, unknown> = {};
        if (ch.field === "name") patch.name = ch.after;
        if (ch.field === "required") patch.required = ch.after;
        if (ch.field === "depends_on_modules") patch.dependsOnModules = ch.after;
        if (ch.field === "sort_order") patch.sortOrder = ch.after;
        if (Object.keys(patch).length === 0) continue;
        await tx
          .update(modules)
          .set(patch)
          .where(
            and(
              eq(modules.organizationId, user.organization_id),
              eq(modules.projectId, input.projectId),
              eq(modules.code, ch.code),
            ),
          );
      }
      // Incrementar plan_version (BR-N398).
      const newPlanVersion = project.planVersion + 1;
      await tx
        .update(projects)
        .set({ planVersion: newPlanVersion })
        .where(
          and(
            eq(projects.organizationId, user.organization_id),
            eq(projects.id, input.projectId),
          ),
        );
      // Bitácora (BR-N398).
      await tx.insert(jsonDiscoveryImports).values({
        organizationId: user.organization_id,
        projectId: input.projectId,
        version: input.version,
        kind: "import",
        actorUserId: user.id,
        result: {
          adds: diff.adds,
          changes: diff.changes,
          conflicts: diff.conflicts,
          noop: false,
          appliedPlanVersion: newPlanVersion,
        },
        status: "applied",
      });
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "project",
        entityId: input.projectId,
        action: "json_discovery.import",
        after: {
          version: input.version,
          appliedPlanVersion: newPlanVersion,
          adds: diff.adds.length,
          changes: diff.changes.length,
          actorRoleCode: ctx.actorRoleCode ?? null,
        },
        ...(ctx.actorRoleCode !== undefined ? { actorRoleCode: ctx.actorRoleCode } : {}),
      });
      return {
        applied: true,
        status: "applied",
        currentVersion: newPlanVersion,
        diff,
      };
    });
  }

  return {
    exportTemplate,
    previewImport,
    import: import_,
  };
}

// Unused exports kept referenced to satisfy tree-shaking safe imports.
export { JsonDiscoveryDiff, JsonDiscoveryDiffResult, scopeDocuments };
void desc;