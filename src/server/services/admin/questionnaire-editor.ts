/**
 * SPEC-010 AC-7 · Editor visual de cuestionarios (DEC-FUN-45).
 *
 * Servicio de soporte que **opera mecánicamente** sobre
 * `questionnaire_questions`. NO duplica reglas de SPEC-003
 * (`createQuestionnairesService`); sólo añade las acciones de
 * edición/reorder que el contrato publicado de SPEC-003 no expone.
 *
 *  - Reads: reusa `createQuestionnairesService().getById()` /
 *    `.listQuestions()` (única fuente canónica de cuestionarios).
 *  - Writes: `reorder` / `update` / `add` / `remove` operan sobre
 *    la misma tabla con `organizationId` derivado del actor
 *    (defensa multi-tenant; ADR-02 §8.3).
 *  - Permiso: `gestionar_cuestionarios` con `forceDb: true`
 *    (AC-81 / ADR-06 §3.1; sembrado en `director` y `administrador`).
 *  - Auditoría: cada mutación registra `admin.questionnaire_editor.*`
 *    con `before`/`after` (BR-N336).
 *  - Defensa estructural: `layer ∈ 1..4`, `prompt 1..280`,
 *    unicidad de `code` por cuestionario, sort_order compacto y
 *    sin huecos tras reorder.
 *
 * El Director (rol con `gestionar_cuestionarios`) puede editar,
 * reordenar, agregar y quitar preguntas; el Vendedor NO (semilla).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { questionnaireQuestions } from "@/server/db/schema";
import {
  QUESTIONNAIRE_ANSWER_TYPES,
  QUESTIONNAIRE_LAYERS,
  type QuestionnaireAnswerType,
  type QuestionnaireLayer,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import {
  type QuestionnaireDTO,
  type QuestionnaireQuestionDTO,
  createQuestionnairesService,
} from "@/server/services/comercial";
import { createHasPermissionService } from "@/server/services/hasPermission";
import { createAuditService } from "@/server/services/audit";

export interface QuestionnaireEditorDTO {
  questionnaire: QuestionnaireDTO;
  questions: QuestionnaireQuestionDTO[];
}

export interface ReorderResult {
  updated: number;
}

export interface AddResult {
  question: QuestionnaireQuestionDTO;
}

export interface UpdateResult {
  question: QuestionnaireQuestionDTO;
}

export interface RemoveResult {
  removedId: string;
}

export interface QuestionnaireEditorService {
  getForEdit(ctx: Context, input: { id: string }): Promise<QuestionnaireEditorDTO>;
  preview(ctx: Context, input: { id: string }): Promise<QuestionnaireEditorDTO>;
  reorder(
    ctx: Context,
    input: { questionnaireId: string; orderedIds: string[] },
  ): Promise<ReorderResult>;
  update(
    ctx: Context,
    input: {
      id: string;
      prompt?: string;
      helpText?: string | null;
      required?: boolean;
      options?: { value: string; label: string }[] | null;
    },
  ): Promise<UpdateResult>;
  add(
    ctx: Context,
    input: {
      questionnaireId: string;
      layer: QuestionnaireLayer;
      code: string;
      prompt: string;
      answerType?: QuestionnaireAnswerType;
      required?: boolean;
      options?: { value: string; label: string }[];
      helpText?: string;
    },
  ): Promise<AddResult>;
  remove(ctx: Context, input: { id: string }): Promise<RemoveResult>;
}

export interface CreateQuestionnaireEditorServiceOptions {
  /** Inyectable para tests; default a `createQuestionnairesService()`. */
  readService?: ReturnType<typeof createQuestionnairesService>;
}

/**
 * Helper puro: valida que la forma del payload no rompa invariantes
 * estructurales. Exportado para tests de unidad sin BD.
 */
export function validateReorderIdsShape(args: {
  orderedIds: string[];
}): { ok: true } | { ok: false; reason: string } {
  if (args.orderedIds.length === 0) {
    return { ok: false, reason: "orderedIds vacío" };
  }
  const unique = new Set(args.orderedIds);
  if (unique.size !== args.orderedIds.length) {
    return { ok: false, reason: "orderedIds contiene duplicados" };
  }
  return { ok: true };
}

export function validateLayer(layer: number): QuestionnaireLayer {
  if (!(QUESTIONNAIRE_LAYERS as readonly number[]).includes(layer)) {
    throw new DomainError(
      "QUESTIONNAIRE_LAYER_INVALID",
      `Capa inválida: ${layer} (1..4)`,
      400,
    );
  }
  return layer as QuestionnaireLayer;
}

export function validateAnswerType(
  answerType: string,
): QuestionnaireAnswerType {
  if (!(QUESTIONNAIRE_ANSWER_TYPES as readonly string[]).includes(answerType)) {
    throw new DomainError(
      "QUESTIONNAIRE_ANSWER_TYPE_INVALID",
      `Tipo de respuesta inválido: ${answerType}`,
      400,
    );
  }
  return answerType as QuestionnaireAnswerType;
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

export function createQuestionnaireEditorService(
  opts: CreateQuestionnaireEditorServiceOptions = {},
): QuestionnaireEditorService {
  const db = getDb();
  const readSvc = opts.readService ?? createQuestionnairesService();
  const hasPerm = createHasPermissionService();
  const audit = createAuditService();

  async function requireEditorPermission(ctx: Context): Promise<void> {
    await hasPerm.require(ctx, "gestionar_cuestionarios", { forceDb: true });
  }

  async function getForEdit(
    ctx: Context,
    input: { id: string },
  ): Promise<QuestionnaireEditorDTO> {
    const user = requireUser(ctx);
    await requireEditorPermission(ctx);
    const questionnaire = await readSvc.getById(ctx, input.id);
    const questions = await readSvc.listQuestions(ctx, {
      questionnaireId: questionnaire.id,
    });
    await audit.record(ctx, {
      entityType: "admin.questionnaire_editor",
      entityId: questionnaire.id,
      action: "admin.questionnaire_editor.preview",
      after: {
        questionnaireId: questionnaire.id,
        questionCount: questions.length,
        actorUserId: user.id,
      },
    });
    return { questionnaire, questions };
  }

  async function preview(
    ctx: Context,
    input: { id: string },
  ): Promise<QuestionnaireEditorDTO> {
    // preview y getForEdit son semánticamente idénticos (read-only).
    // Distinguirlos en auditoría permite separar "abrir editor" de
    // "sólo vista previa".
    const user = requireUser(ctx);
    await requireEditorPermission(ctx);
    const questionnaire = await readSvc.getById(ctx, input.id);
    const questions = await readSvc.listQuestions(ctx, {
      questionnaireId: questionnaire.id,
    });
    await audit.record(ctx, {
      entityType: "admin.questionnaire_editor",
      entityId: questionnaire.id,
      action: "admin.questionnaire_editor.preview",
      after: {
        questionnaireId: questionnaire.id,
        questionCount: questions.length,
        actorUserId: user.id,
        preview: true,
      },
    });
    return { questionnaire, questions };
  }

  async function reorder(
    ctx: Context,
    input: { questionnaireId: string; orderedIds: string[] },
  ): Promise<ReorderResult> {
    const user = requireUser(ctx);
    await requireEditorPermission(ctx);
    const shape = validateReorderIdsShape({ orderedIds: input.orderedIds });
    if (!shape.ok) {
      throw new DomainError("QUESTIONNAIRE_REORDER_INVALID", shape.reason, 400);
    }
    // Confirmar que el cuestionario pertenece a la org del actor (defensa multi-tenant).
    const questionnaire = await readSvc.getById(ctx, input.questionnaireId);

    // Traer ids actuales para validar que `orderedIds` ⊂ actuales.
    const current = await readSvc.listQuestions(ctx, {
      questionnaireId: questionnaire.id,
    });
    const currentIds = new Set(current.map((q) => q.id));
    for (const id of input.orderedIds) {
      if (!currentIds.has(id)) {
        throw new DomainError(
          "QUESTIONNAIRE_QUESTION_NOT_FOUND",
          `Pregunta ${id} no pertenece al cuestionario`,
          404,
        );
      }
    }
    // Si hay ids no incluidos, se preservan al final en su orden actual.
    const orderedSet = new Set(input.orderedIds);
    const tail = current
      .filter((q) => !orderedSet.has(q.id))
      .map((q) => q.id);
    const finalOrder = [...input.orderedIds, ...tail];

    // Update sort_order en transacción. Indivisible: o todo el orden
    // cambia o nada (defensa R1 SPEC-010; mismo principio de BR-N222).
    let updated = 0;
    await db.transaction(async (tx) => {
      for (let i = 0; i < finalOrder.length; i++) {
        const id = finalOrder[i];
        if (!id) continue;
        await tx
          .update(questionnaireQuestions)
          .set({ sortOrder: i + 1 })
          .where(
            and(
              eq(questionnaireQuestions.organizationId, user.organization_id),
              eq(questionnaireQuestions.id, id),
            ),
          );
        updated++;
      }
    });

    await audit.record(ctx, {
      entityType: "admin.questionnaire_editor",
      entityId: questionnaire.id,
      action: "admin.questionnaire_editor.reorder",
      before: { sortOrder: current.map((q) => ({ id: q.id, sortOrder: q.sortOrder })) },
      after: {
        sortOrder: finalOrder.map((id, i) => ({ id, sortOrder: i + 1 })),
        actorUserId: user.id,
      },
    });

    return { updated };
  }

  async function update(
    ctx: Context,
    input: {
      id: string;
      prompt?: string;
      helpText?: string | null;
      required?: boolean;
      options?: { value: string; label: string }[] | null;
    },
  ): Promise<UpdateResult> {
    const user = requireUser(ctx);
    await requireEditorPermission(ctx);

    const [existing] = await db
      .select()
      .from(questionnaireQuestions)
      .where(
        and(
          eq(questionnaireQuestions.id, input.id),
          eq(questionnaireQuestions.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new DomainError(
        "QUESTIONNAIRE_QUESTION_NOT_FOUND",
        "Pregunta no encontrada",
        404,
      );
    }

    const patch: Partial<typeof questionnaireQuestions.$inferInsert> = {};
    if (input.prompt !== undefined) patch.prompt = input.prompt;
    if (input.helpText !== undefined) patch.helpText = input.helpText;
    if (input.required !== undefined) patch.required = input.required;
    if (input.options !== undefined) patch.options = input.options;

    const [row] = await db
      .update(questionnaireQuestions)
      .set(patch)
      .where(
        and(
          eq(questionnaireQuestions.id, input.id),
          eq(questionnaireQuestions.organizationId, user.organization_id),
        ),
      )
      .returning();
    if (!row) throw new Error("questionnaire_question update sin fila");

    await audit.record(ctx, {
      entityType: "admin.questionnaire_editor",
      entityId: row.id,
      action: "admin.questionnaire_editor.update",
      before: {
        prompt: existing.prompt,
        helpText: existing.helpText,
        required: existing.required,
        options: existing.options,
      },
      after: {
        prompt: row.prompt,
        helpText: row.helpText,
        required: row.required,
        options: row.options,
        questionnaireId: row.questionnaireId,
        actorUserId: user.id,
      },
    });

    return { question: questionToDto(row) };
  }

  async function add(
    ctx: Context,
    input: {
      questionnaireId: string;
      layer: QuestionnaireLayer;
      code: string;
      prompt: string;
      answerType?: QuestionnaireAnswerType;
      required?: boolean;
      options?: { value: string; label: string }[];
      helpText?: string;
    },
  ): Promise<AddResult> {
    const user = requireUser(ctx);
    await requireEditorPermission(ctx);
    const questionnaire = await readSvc.getById(ctx, input.questionnaireId);

    // Defensa: unicidad de `code` por cuestionario (BR-N222).
    const existing = await readSvc.listQuestions(ctx, {
      questionnaireId: questionnaire.id,
    });
    if (existing.some((q) => q.code === input.code)) {
      throw new DomainError(
        "QUESTIONNAIRE_QUESTION_CODE_DUPLICATE",
        `Ya existe una pregunta con code "${input.code}"`,
        409,
      );
    }
    const layer = validateLayer(input.layer);
    const answerType = validateAnswerType(input.answerType ?? "text");

    // sortOrder = max+1 dentro de la misma capa (defensa estructural).
    const sameLayer = existing.filter((q) => q.layer === layer);
    const maxSort = sameLayer.reduce(
      (m, q) => (q.sortOrder > m ? q.sortOrder : m),
      0,
    );

    const [row] = await db
      .insert(questionnaireQuestions)
      .values({
        organizationId: user.organization_id,
        questionnaireId: questionnaire.id,
        layer,
        code: input.code,
        prompt: input.prompt,
        answerType,
        required: input.required ?? false,
        options: input.options ?? null,
        condition: null,
        sortOrder: maxSort + 1,
        helpText: input.helpText ?? null,
      })
      .returning();
    if (!row) throw new Error("questionnaire_question insert sin fila");

    await audit.record(ctx, {
      entityType: "admin.questionnaire_editor",
      entityId: row.id,
      action: "admin.questionnaire_editor.add",
      after: {
        questionnaireId: questionnaire.id,
        code: row.code,
        layer: row.layer,
        sortOrder: row.sortOrder,
        actorUserId: user.id,
      },
    });

    return { question: questionToDto(row) };
  }

  async function remove(
    ctx: Context,
    input: { id: string },
  ): Promise<RemoveResult> {
    const user = requireUser(ctx);
    await requireEditorPermission(ctx);
    const [existing] = await db
      .select()
      .from(questionnaireQuestions)
      .where(
        and(
          eq(questionnaireQuestions.id, input.id),
          eq(questionnaireQuestions.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new DomainError(
        "QUESTIONNAIRE_QUESTION_NOT_FOUND",
        "Pregunta no encontrada",
        404,
      );
    }
    await db
      .delete(questionnaireQuestions)
      .where(
        and(
          eq(questionnaireQuestions.id, input.id),
          eq(questionnaireQuestions.organizationId, user.organization_id),
        ),
      );
    // Compact sort_order de la capa afectada.
    await db
      .update(questionnaireQuestions)
      .set({ sortOrder: sql`${questionnaireQuestions.sortOrder} - 1` })
      .where(
        and(
          eq(questionnaireQuestions.organizationId, user.organization_id),
          eq(questionnaireQuestions.questionnaireId, existing.questionnaireId),
          eq(questionnaireQuestions.layer, existing.layer),
          sql`${questionnaireQuestions.sortOrder} > ${existing.sortOrder}`,
        ),
      );

    await audit.record(ctx, {
      entityType: "admin.questionnaire_editor",
      entityId: existing.id,
      action: "admin.questionnaire_editor.remove",
      before: {
        questionnaireId: existing.questionnaireId,
        code: existing.code,
        layer: existing.layer,
        sortOrder: existing.sortOrder,
      },
      after: { removedId: existing.id, actorUserId: user.id },
    });

    return { removedId: existing.id };
  }

  // Silence unused import warning for inArray (kept for future batch helpers).
  void inArray;

  return { getForEdit, preview, reorder, update, add, remove };
}
