/**
 * Barrel del módulo de servicios Admin (SPEC-010). Read-only
 * sobre los catálogos seed + editor visual de cuestionarios
 * (AC-7 / DEC-FUN-45).
 */
export {
  createAdminService,
  type AdminService,
  type CreateAdminServiceOptions,
} from "./admin-service";
export {
  createQuestionnaireEditorService,
  validateReorderIdsShape,
  validateLayer,
  validateAnswerType,
  type QuestionnaireEditorService,
  type QuestionnaireEditorDTO,
  type ReorderResult,
  type AddResult,
  type UpdateResult,
  type RemoveResult,
  type CreateQuestionnaireEditorServiceOptions,
} from "./questionnaire-editor";
