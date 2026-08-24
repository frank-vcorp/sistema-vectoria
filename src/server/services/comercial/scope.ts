/**
 * Servicio `scope` (alcance) — SPEC-003 §4.2 (B6, BR-N51/52/231..N233).
 *
 * Reglas críticas:
 *  - **Regla de oro** (DEC-FUN-23, BR-N220/231): el sistema genera el
 *    `draft` desde cuestionario + catálogo + plantilla. Ni el Vendedor
 *    ni una IA externa escriben el spec (verificado por AC-2 grep
 *    anti-patrón sobre APIs externas de IA en
 *    `src/server/services/comercial/scope`).
 *  - `signed` es **inmutable** (BR-N52): el servicio rechaza mutaciones
 *    una vez firmado.
 *  - El PL firma (`firmar_alcance`); razón obligatoria ≥3 chars (BR-N231).
 *  - Auditoría completa (BR-N336): `scope.draft`, `scope.in_review`,
 *    `scope.sign` con `actor_user_id` + `actor_role_code`.
 */
import { and, eq } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import {
  catalogServices,
  questionnaireResponses,
  scopeDocuments,
  templates,
} from "@/server/db/schema";
import { SCOPE_STATUSES, type ScopeStatus } from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import { generateScopeDraftContent } from "./helpers";

export interface ScopeDraftDTO {
  id: string;
  organizationId: string;
  prospectId: string | null;
  clientId: string | null;
  questionnaireResponseId: string;
  templateId: string;
  status: ScopeStatus;
  content: unknown;
  version: number;
  signedBy: string | null;
  signedAt: Date | null;
  signedReason: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScopeService {
  generateDraft(
    ctx: Context,
    input: { questionnaireResponseId: string; templateId: string },
  ): Promise<ScopeDraftDTO>;
  submitForReview(ctx: Context, input: { scopeId: string }): Promise<ScopeDraftDTO>;
  sign(
    ctx: Context,
    input: { scopeId: string; reason: string },
  ): Promise<ScopeDraftDTO>;
  getById(ctx: Context, scopeId: string): Promise<ScopeDraftDTO>;
  listForProspect(
    ctx: Context,
    input: { prospectId: string },
  ): Promise<ScopeDraftDTO[]>;
}

function toDto(row: typeof scopeDocuments.$inferSelect): ScopeDraftDTO {
  const status = (SCOPE_STATUSES as readonly string[]).includes(row.status)
    ? (row.status as ScopeStatus)
    : "draft";
  return {
    id: row.id,
    organizationId: row.organizationId,
    prospectId: row.prospectId,
    clientId: row.clientId,
    questionnaireResponseId: row.questionnaireResponseId,
    templateId: row.templateId,
    status,
    content: row.content,
    version: row.version,
    signedBy: row.signedBy,
    signedAt: row.signedAt,
    signedReason: row.signedReason,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createScopeService(): ScopeService {
  const db = getDb();

  async function generateDraft(
    ctx: Context,
    input: { questionnaireResponseId: string; templateId: string },
  ): Promise<ScopeDraftDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_comercial", {
      forceDb: true,
    });
    if (!input.questionnaireResponseId || !input.templateId) {
      throw new DomainError(
        "SCOPE_NOT_FOUND",
        "questionnaireResponseId y templateId son obligatorios",
        400,
      );
    }
    return withTx(async (tx) => {
      const [qr] = await tx
        .select()
        .from(questionnaireResponses)
        .where(
          and(
            eq(
              questionnaireResponses.id,
              input.questionnaireResponseId,
            ),
            eq(questionnaireResponses.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!qr) {
        throw new DomainError(
          "QUESTIONNAIRE_RESPONSE_NOT_FOUND",
          "Respuesta de cuestionario no encontrada",
          404,
        );
      }
      const [tpl] = await tx
        .select()
        .from(templates)
        .where(
          and(
            eq(templates.id, input.templateId),
            eq(templates.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!tpl) {
        throw new DomainError(
          "TEMPLATE_NOT_FOUND",
          "Plantilla no encontrada",
          404,
        );
      }
      // AC-9 (DEC-FUN-53): el prospecto declaró `project_type` y la
      // plantilla tiene `type`. Advertir inconsistencia no bloquea;
      // el servicio rechaza sólo si el cliente explícitamente lo pide.
      // Aquí validamos sólo presencia; el sistema **advierte** pero no
      // cambia la selección (BR-N230). El mismatch duro lo decide el PL
      // al firmar. Si los tipos no calzan, registramos el aviso en
      // `content.warnings` para visibilidad.
      const warnings: string[] = [];
      if (
        qr.projectType &&
        tpl.type &&
        qr.projectType !== "general" &&
        qr.projectType !== tpl.type
      ) {
        warnings.push(
          `Tipo declarado (${qr.projectType}) no coincide con la plantilla (${tpl.type}). El PL debe confirmar antes de firmar.`,
        );
      }
      // Servicios seleccionados — heurística: del `content` del
      // cuestionario, las claves `service_<code>`.
      const contentObj =
        typeof qr.content === "object" && qr.content !== null
          ? (qr.content as Record<string, unknown>)
          : {};
      const selectedServiceCodes: string[] = [];
      for (const [k, v] of Object.entries(contentObj)) {
        if (k.startsWith("service_") && v === true) {
          selectedServiceCodes.push(k.slice("service_".length));
        }
      }
      // Validación defensiva: si los códigos no existen en el catálogo,
      // los aceptamos pero marcamos aviso.
      if (selectedServiceCodes.length > 0) {
        const found = await tx
          .select({ code: catalogServices.code })
          .from(catalogServices)
          .where(eq(catalogServices.organizationId, user.organization_id));
        const known = new Set(found.map((r) => r.code));
        const unknown = selectedServiceCodes.filter((c) => !known.has(c));
        if (unknown.length > 0) {
          warnings.push(
            `Códigos de servicio no encontrados en catálogo: ${unknown.join(", ")}.`,
          );
        }
      }
      const tplContent =
        typeof tpl.content === "object" && tpl.content !== null
          ? (tpl.content as Record<string, unknown>)
          : {};
      const modules = Array.isArray(tplContent["project_modules"])
        ? (tplContent["project_modules"] as Array<{
            code: string;
            name: string;
            required?: boolean;
          }>)
        : [];
      const answeredCodes = Object.keys(contentObj);
      const draftContent = generateScopeDraftContent({
        declaredProjectType: qr.projectType ?? null,
        selectedServiceCodes,
        answeredQuestionCodes: answeredCodes,
        templateModules: modules.map((m) => ({
          code: m.code,
          name: m.name,
          required: m.required ?? true,
        })),
      });
      // Adjuntar warnings al contenido para visibilidad del PL.
      (draftContent.blocks.assumptions as string[]).push(...warnings);
      const [row] = await tx
        .insert(scopeDocuments)
        .values({
          organizationId: user.organization_id,
          prospectId: qr.prospectId,
          questionnaireResponseId: qr.id,
          templateId: tpl.id,
          status: "draft",
          content: draftContent,
          version: 1,
          createdBy: user.id,
        })
        .returning();
      if (!row) throw new Error("scope insert sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "scope",
        entityId: row.id,
        action: "scope.draft",
        after: {
          status: row.status,
          templateId: row.templateId,
          questionnaireResponseId: row.questionnaireResponseId,
        },
      });
      return toDto(row);
    });
  }

  async function submitForReview(
    ctx: Context,
    input: { scopeId: string },
  ): Promise<ScopeDraftDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_comercial", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(scopeDocuments)
        .where(
          and(
            eq(scopeDocuments.id, input.scopeId),
            eq(scopeDocuments.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("SCOPE_NOT_FOUND", "Alcance no encontrado", 404);
      }
      if (before.status === "signed") {
        throw new DomainError(
          "SCOPE_ALREADY_SIGNED",
          "El alcance ya está firmado (inmutable)",
          409,
        );
      }
      const [after] = await tx
        .update(scopeDocuments)
        .set({ status: "in_review", version: before.version + 1 })
        .where(
          and(
            eq(scopeDocuments.id, input.scopeId),
            eq(scopeDocuments.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("scope submit-for-review sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "scope",
        entityId: after.id,
        action: "scope.in_review",
        before: { status: before.status, version: before.version },
        after: { status: after.status, version: after.version },
      });
      return toDto(after);
    });
  }

  async function sign(
    ctx: Context,
    input: { scopeId: string; reason: string },
  ): Promise<ScopeDraftDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    // BR-N231: sólo el PL firma (`firmar_alcance`).
    await createHasPermissionService().require(ctx, "firmar_alcance", {
      forceDb: true,
    });
    if (!input.reason || input.reason.trim().length < 3) {
      throw new DomainError(
        "SCOPE_SIGN_FORBIDDEN",
        "Motivo de firma obligatorio (≥3 caracteres)",
        400,
      );
    }
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(scopeDocuments)
        .where(
          and(
            eq(scopeDocuments.id, input.scopeId),
            eq(scopeDocuments.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError("SCOPE_NOT_FOUND", "Alcance no encontrado", 404);
      }
      if (before.status === "signed") {
        throw new DomainError(
          "SCOPE_ALREADY_SIGNED",
          "El alcance ya está firmado (inmutable)",
          409,
        );
      }
      if (before.status === "draft") {
        throw new DomainError(
          "SCOPE_SIGN_FORBIDDEN",
          "El alcance debe pasar por 'in_review' antes de firmar",
          409,
        );
      }
      const [after] = await tx
        .update(scopeDocuments)
        .set({
          status: "signed",
          signedBy: user.id,
          signedAt: new Date(),
          signedReason: input.reason,
        })
        .where(
          and(
            eq(scopeDocuments.id, input.scopeId),
            eq(scopeDocuments.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("scope sign sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "scope",
        entityId: after.id,
        action: "scope.sign",
        before: { status: before.status },
        after: {
          status: after.status,
          signedBy: after.signedBy,
          signedAt: after.signedAt,
        },
        reason: input.reason,
        ...(ctx.actorRoleCode !== undefined ? { actorRoleCode: ctx.actorRoleCode } : {}),
      });
      return toDto(after);
    });
  }

  async function getById(ctx: Context, scopeId: string): Promise<ScopeDraftDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_comercial", {
      forceDb: true,
    });
    const [row] = await db
      .select()
      .from(scopeDocuments)
      .where(
        and(
          eq(scopeDocuments.id, scopeId),
          eq(scopeDocuments.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!row) {
      throw new DomainError("SCOPE_NOT_FOUND", "Alcance no encontrado", 404);
    }
    return toDto(row);
  }

  async function listForProspect(
    ctx: Context,
    input: { prospectId: string },
  ): Promise<ScopeDraftDTO[]> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_comercial", {
      forceDb: true,
    });
    const rows = await db
      .select()
      .from(scopeDocuments)
      .where(
        and(
          eq(scopeDocuments.organizationId, user.organization_id),
          eq(scopeDocuments.prospectId, input.prospectId),
        ),
      )
      .orderBy(scopeDocuments.createdAt)
      .limit(50);
    return rows.map(toDto);
  }

  return { generateDraft, submitForReview, sign, getById, listForProspect };
}
