/**
 * Barrel del módulo de servicios de Proyectos (SPEC-005 + SPEC-006).
 *
 * Los routers tRPC y los jobs importan desde aquí. La UI **nunca**
 * importa desde aquí directamente (verificado por grep anti-patrón en
 * `scripts/check-antipatterns.ts`).
 *
 * Servicios:
 *  - `projects` (SPEC-005): createFromOrder, transition, pause/resume,
 *    cancel, complete, overrideHealth, getById, list.
 *  - `modules` (SPEC-005): list, transition.
 *  - `jsonDiscovery` (SPEC-005): exportTemplate, previewImport, import.
 *  - `members` (SPEC-006 AC-1): add, remove, list, isMember.
 *  - `requirements` (SPEC-006 BR-N264-267): create, transition, list.
 *  - `tasks` (SPEC-006 BR-N268-274/AC-2..AC-4): create, transition,
 *    assign, reject, review, checklist*, evidenceAdd.
 *  - `timeEntries` (SPEC-006 AC-10/BR-N276-277): create, list.
 *  - `tests` (SPEC-006 AC-5/BR-N283-290): create, transition,
 *    markNotApplicable.
 *  - `deliverables` (SPEC-006 AC-6/BR-N287/DEC-FUN-55): create,
 *    transition, accept.
 *  - `changeRequests` (SPEC-006 AC-7/BR-N292-296): create, quote,
 *    authorize, reject, startImplementation, completeImplementation.
 *  - `cierre` (SPEC-006 AC-8..AC-9): closeTechnical, previewCloseGates.
 */
export {
  createProjectsService,
  recordProjectDeliveredSignal,
  type ProjectDTO,
  type ProjectDetailDTO,
  type ProjectMemberDTO,
  type ProjectsService,
  type TechnicalClosureSignalInput,
} from "./projects";

export {
  createModulesService,
  type ModuleDTO,
  type ModulesService,
} from "./modules";

export {
  createJsonDiscoveryService,
  type JsonDiscoveryExportDTO,
  type JsonDiscoveryImportDTO,
  type JsonDiscoveryImportPreviewDTO,
  type JsonDiscoveryService,
} from "./jsonDiscovery";

export {
  createMembersService,
  type MembersService,
  type ProjectTeamMemberDTO,
} from "./members";

export {
  createRequirementsService,
  type RequirementsService,
  type RequirementDTO,
} from "./requirements";

export {
  createTasksService,
  type TasksService,
  type TaskDTO,
  type TaskDetailDTO,
  type TaskChecklistDTO,
  type TaskEvidenceDTO,
} from "./tasks";

export {
  createTimeEntriesService,
  type TimeEntriesService,
  type TimeEntryDTO,
} from "./timeEntries";

export {
  createTestsService,
  type TestsService,
  type TestDTO,
} from "./tests";

export {
  createDeliverablesService,
  type DeliverablesService,
  type DeliverableDTO,
} from "./deliverables";

export {
  createChangeRequestsService,
  type ChangeRequestsService,
  type ChangeRequestDTO,
} from "./changeRequests";

export {
  createCierreService,
  type CierreService,
  type ProjectCloseGatesDTO,
} from "./cierre";

export {
  buildProjectCreatedFromOrderEvent,
  canTransitionModule,
  canTransitionProjectStage,
  computeCalculatedHealth,
  diffJsonDiscoveryPlans,
  findJsonDiscoveryImmutableConflict,
  isProjectSituationTerminal,
  nextProjectCode,
  validateHealthOverride,
  validateProjectSituationReason,
  JSON_DISCOVERY_IMMUTABLE_FIELDS,
  type JsonDiscoveryDiff,
  type JsonDiscoveryDiffConflict,
  type JsonDiscoveryDiffAdd,
  type JsonDiscoveryDiffChange,
  type JsonDiscoveryDiffResult,
  type JsonDiscoveryImmutableField,
  type ModuleTransitionError,
  type ProjectCreatedFromOrderEvent,
  type ProjectStageTransitionError,
} from "./helpers";

// SPEC-006 · helpers de ejecución
export {
  canTransitionRequirement,
  canTransitionTask,
  canTransitionDeliverable,
  canTransitionChangeRequest,
  validateTaskDoneGates,
  validateTaskRejectReason,
  validateChangeRequestAuthorizeGates,
  validateTestMarkNotApplicable,
  validateTimeEntryDailyTotal,
  validateDeliverableAcceptance,
  validateCloseTechnicalGates,
  computeTaskProgress,
  computeProjectHealth,
  isBlockingTestType,
  canViewOtherUserTimeEntries,
  type RequirementTransitionError,
  type TaskTransitionError,
  type DeliverableTransitionError,
  type DeliverableAcceptError,
  type ChangeRequestTransitionError,
  type TestNotApplicableError,
  type CloseTechnicalGateError,
  type ProjectHealthComputed,
} from "./helpers-ejecucion";
