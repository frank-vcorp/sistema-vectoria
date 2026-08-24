/**
 * Servicio `questionnaires` — SPEC-003 §4.2 (B4).
 *
 * Cuestionarios de sondeo (4 capas, ARCH-20260817-08). Las preguntas
 * viven en `questionnaire_questions` (dato editable). Las respuestas
 * se persisten en `questionnaire_responses` (vinculadas al prospecto;
 * el Vendedor las aplica, BR-N219..N225).
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import {
  questionnaireQuestions,
  questionnaireResponses,
  questionnaires,
} from "@/server/db/schema";
import {
  QUESTIONNAIRE_ANSWER_TYPES,
  QUESTIONNAIRE_LAYERS,
  QUESTIONNAIRE_STATUSES,
  QUESTIONNAIRE_VERSIONS,
  type QuestionnaireAnswerType,
  type QuestionnaireLayer,
  type QuestionnaireStatus,
  type QuestionnaireVersion,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";

export interface QuestionnaireDTO {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  type: string;
  version: QuestionnaireVersion;
  status: QuestionnaireStatus;
  description: string | null;
  isSeed: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuestionnaireQuestionDTO {
  id: string;
  organizationId: string;
  questionnaireId: string;
  layer: QuestionnaireLayer;
  code: string;
  prompt: string;
  answerType: QuestionnaireAnswerType;
  required: boolean;
  options: unknown;
  condition: unknown;
  sortOrder: number;
  helpText: string | null;
}

export interface QuestionnaireResponseDTO {
  id: string;
  organizationId: string;
  questionnaireId: string;
  prospectId: string;
  version: QuestionnaireVersion;
  content: unknown;
  presupuestoDeclaradoCents: number | null;
  projectType: string | null;
  submittedBy: string | null;
  submittedAt: Date;
}

export interface QuestionnaireService {
  list(ctx: Context): Promise<QuestionnaireDTO[]>;
  getById(ctx: Context, id: string): Promise<QuestionnaireDTO>;
  listQuestions(
    ctx: Context,
    input: { questionnaireId: string },
  ): Promise<QuestionnaireQuestionDTO[]>;
  submitResponse(
    ctx: Context,
    input: {
      questionnaireId: string;
      prospectId: string;
      content: Record<string, unknown>;
      presupuestoDeclaradoCents?: number | null;
      projectType?: string;
    },
  ): Promise<QuestionnaireResponseDTO>;
  getResponse(
    ctx: Context,
    input: { responseId: string },
  ): Promise<QuestionnaireResponseDTO>;
}

function toDto(row: typeof questionnaires.$inferSelect): QuestionnaireDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    code: row.code,
    name: row.name,
    type: row.type,
    version: (QUESTIONNAIRE_VERSIONS as readonly string[]).includes(row.version)
      ? (row.version as QuestionnaireVersion)
      : "digital",
    status: (QUESTIONNAIRE_STATUSES as readonly string[]).includes(row.status)
      ? (row.status as QuestionnaireStatus)
      : "draft",
    description: row.description,
    isSeed: row.isSeed === "true",
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function questionToDto(
  row: typeof questionnaireQuestions.$inferSelect,
): QuestionnaireQuestionDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    questionnaireId: row.questionnaireId,
    layer: (QUESTIONNAIRE_LAYERS as readonly number[]).includes(row.layer)
      ? (row.layer as QuestionnaireLayer)
      : 1,
    code: row.code,
    prompt: row.prompt,
    answerType: (QUESTIONNAIRE_ANSWER_TYPES as readonly string[]).includes(
      row.answerType,
    )
      ? (row.answerType as QuestionnaireAnswerType)
      : "text",
    required: row.required,
    options: row.options,
    condition: row.condition,
    sortOrder: row.sortOrder,
    helpText: row.helpText,
  };
}

function responseToDto(
  row: typeof questionnaireResponses.$inferSelect,
): QuestionnaireResponseDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    questionnaireId: row.questionnaireId,
    prospectId: row.prospectId,
    version: (QUESTIONNAIRE_VERSIONS as readonly string[]).includes(row.version)
      ? (row.version as QuestionnaireVersion)
      : "digital",
    content: row.content,
    presupuestoDeclaradoCents: row.presupuestoDeclaradoCents,
    projectType: row.projectType,
    submittedBy: row.submittedBy,
    submittedAt: row.submittedAt,
  };
}

export function createQuestionnairesService(): QuestionnaireService {
  const db = getDb();

  async function list(ctx: Context): Promise<QuestionnaireDTO[]> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_cuestionarios", {
      forceDb: true,
    });
    const rows = await db
      .select()
      .from(questionnaires)
      .where(eq(questionnaires.organizationId, user.organization_id))
      .orderBy(questionnaires.code);
    return rows.map(toDto);
  }

  async function getById(ctx: Context, id: string): Promise<QuestionnaireDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_cuestionarios", {
      forceDb: true,
    });
    const [row] = await db
      .select()
      .from(questionnaires)
      .where(
        and(
          eq(questionnaires.id, id),
          eq(questionnaires.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!row) {
      throw new DomainError(
        "QUESTIONNAIRE_NOT_FOUND",
        "Cuestionario no encontrado",
        404,
      );
    }
    return toDto(row);
  }

  async function listQuestions(
    ctx: Context,
    input: { questionnaireId: string },
  ): Promise<QuestionnaireQuestionDTO[]> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_cuestionarios", {
      forceDb: true,
    });
    const rows = await db
      .select()
      .from(questionnaireQuestions)
      .where(
        and(
          eq(questionnaireQuestions.organizationId, user.organization_id),
          eq(questionnaireQuestions.questionnaireId, input.questionnaireId),
        ),
      )
      .orderBy(questionnaireQuestions.sortOrder);
    return rows.map(questionToDto);
  }

  async function submitResponse(
    ctx: Context,
    input: {
      questionnaireId: string;
      prospectId: string;
      content: Record<string, unknown>;
      presupuestoDeclaradoCents?: number | null;
      projectType?: string;
    },
  ): Promise<QuestionnaireResponseDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    // `gestionar_cuestionarios` cubre al Vendedor (sembrado en SPEC-003).
    await createHasPermissionService().require(ctx, "gestionar_cuestionarios", {
      forceDb: true,
    });
    const [q] = await db
      .select()
      .from(questionnaires)
      .where(
        and(
          eq(questionnaires.id, input.questionnaireId),
          eq(questionnaires.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!q) {
      throw new DomainError(
        "QUESTIONNAIRE_NOT_FOUND",
        "Cuestionario no encontrado",
        404,
      );
    }
    if (q.status !== "published") {
      throw new DomainError(
        "QUESTIONNAIRE_NOT_PUBLISHED",
        "El cuestionario no está publicado",
        409,
      );
    }
    const [row] = await db
      .insert(questionnaireResponses)
      .values({
        organizationId: user.organization_id,
        questionnaireId: q.id,
        prospectId: input.prospectId,
        version: q.version,
        content: input.content,
        presupuestoDeclaradoCents: input.presupuestoDeclaradoCents ?? null,
        projectType: input.projectType ?? null,
        submittedBy: user.id,
      })
      .returning();
    if (!row) throw new Error("questionnaire_response insert sin fila");
    const { createAuditService } = await import("@/server/services/audit");
    await createAuditService().record(ctx, {
      entityType: "questionnaire_response",
      entityId: row.id,
      action: "questionnaire_response.submit",
      after: {
        questionnaireId: row.questionnaireId,
        prospectId: row.prospectId,
        presupuestoDeclaradoCents: row.presupuestoDeclaradoCents,
      },
    });
    return responseToDto(row);
  }

  async function getResponse(
    ctx: Context,
    input: { responseId: string },
  ): Promise<QuestionnaireResponseDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_cuestionarios", {
      forceDb: true,
    });
    const [row] = await db
      .select()
      .from(questionnaireResponses)
      .where(
        and(
          eq(questionnaireResponses.id, input.responseId),
          eq(questionnaireResponses.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!row) {
      throw new DomainError(
        "QUESTIONNAIRE_RESPONSE_NOT_FOUND",
        "Respuesta de cuestionario no encontrada",
        404,
      );
    }
    return responseToDto(row);
  }

  return { list, getById, listQuestions, submitResponse, getResponse };
}
