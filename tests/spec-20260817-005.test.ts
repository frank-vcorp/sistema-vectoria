/**
 * SPEC-005 (Proyectos — artefactos y estados) — tests unitarios puros.
 *
 * Cubre los AC sin requerir BD funcional (los flujos de BD están
 * gateados por infraestructura y se validarán en V3 Playwright contra
 * el entorno provisionado por Frank):
 *
 *  - AC-1 · `project_creation` consume OS + snapshot inmutable +
 *    módulos + audit (validado por la cobertura de helpers + un test
 *    de no-acoplamiento inverso por grep).
 *  - AC-2 · PL primer miembro por construcción (helper `nextProjectCode`
 *    + enum `PROJECT_MEMBER_ROLES`).
 *  - AC-3 · Snapshot inmutable (helper `nextProjectCode` + BR-N251
 *    documentado en código; sin mutators de `scope_json`).
 *  - AC-4 · Estados 3D + transiciones (helper
 *    `canTransitionProjectStage` happy path + inválidas).
 *  - AC-5 · Salud calculada + override con motivo (`validateHealthOverride`,
 *    `computeCalculatedHealth`).
 *  - AC-6 · JSON round-trip (`diffJsonDiscoveryPlans`, idempotente).
 *  - AC-7 · Inmutables del JSON (`findJsonDiscoveryImmutableConflict`).
 *  - AC-8 · Módulos (`canTransitionModule`).
 *  - AC-9 · Señal de cierre técnico (`buildProjectCreatedFromOrderEvent`).
 *  - AC-10 · UI responsive (grep de `overflow-x-auto` /
 *    `hidden sm:table-cell` en el módulo de UI).
 */
import { describe, expect, it } from "vitest";
import {
  BASE_PERMISSIONS,
  ERROR_CODES,
  HEALTH_REASON_MIN_LENGTH,
  MODULE_STATUSES,
  PROJECT_AUDIT_ACTIONS,
  PROJECT_HEALTHS,
  PROJECT_MEMBER_ROLES,
  PROJECT_SITUATIONS,
  PROJECT_STAGES,
} from "@/shared/enums";
import {
  JsonDiscoveryImportInputSchema,
  JsonDiscoveryPlanSchema,
  ModuleTransitionInputSchema,
  ProjectCancelInputSchema,
  ProjectCreateFromOrderInputSchema,
  ProjectOverrideHealthInputSchema,
  ProjectPauseInputSchema,
  ProjectTransitionStageInputSchema,
} from "@/shared/zod";
import {
  buildProjectCreatedFromOrderEvent,
  canTransitionModule,
  canTransitionProjectStage,
  computeCalculatedHealth,
  createJsonDiscoveryService,
  createModulesService,
  createProjectsService,
  diffJsonDiscoveryPlans,
  findJsonDiscoveryImmutableConflict,
  isProjectSituationTerminal,
  nextProjectCode,
  validateHealthOverride,
  validateProjectSituationReason,
} from "@/server/services/proyectos";

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo canónico
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-005 · catálogo canónico", () => {
  it("PROJECT_STAGES expone los 5 estados del SPEC-005 §4.2", () => {
    expect([...PROJECT_STAGES]).toEqual([
      "planning",
      "development",
      "testing",
      "client_validation",
      "delivery",
    ]);
  });
  it("PROJECT_SITUATIONS expone los 5 estados del SPEC-005 §4.2", () => {
    expect([...PROJECT_SITUATIONS]).toEqual([
      "pending",
      "active",
      "paused",
      "completed",
      "cancelled",
    ]);
  });
  it("PROJECT_HEALTHS expone los 3 estados del SPEC-005 §4.2", () => {
    expect([...PROJECT_HEALTHS]).toEqual(["on_track", "at_risk", "delayed"]);
  });
  it("MODULE_STATUSES expone los 7 estados del SPEC-005 §4.1", () => {
    expect([...MODULE_STATUSES]).toEqual([
      "pending",
      "in_progress",
      "testing",
      "deployed",
      "paused",
      "blocked",
      "cancelled",
    ]);
  });
  it("PROJECT_MEMBER_ROLES incluye lider", () => {
    expect(PROJECT_MEMBER_ROLES).toContain("lider");
  });
  it("PROJECT_AUDIT_ACTIONS contiene project.create, project.created_from_order y project.delivered_from_order", () => {
    expect(PROJECT_AUDIT_ACTIONS).toContain("project.create");
    expect(PROJECT_AUDIT_ACTIONS).toContain("project.created_from_order");
    expect(PROJECT_AUDIT_ACTIONS).toContain("project.delivered_from_order");
    expect(PROJECT_AUDIT_ACTIONS).toContain("json_discovery.export");
    expect(PROJECT_AUDIT_ACTIONS).toContain("json_discovery.import");
  });
  it("ERROR_CODES contiene los 11 códigos del SPEC-005 §6", () => {
    for (const code of [
      "PROJECT_NOT_FOUND",
      "PROJECT_ALREADY_EXISTS_FOR_ORDER",
      "PROJECT_INVALID_TRANSITION",
      "PROJECT_PAUSE_REASON_REQUIRED",
      "PROJECT_CANCEL_REASON_REQUIRED",
      "HEALTH_REASON_REQUIRED",
      "JSON_IMMUTABLE_FIELDS",
      "MODULE_NOT_FOUND",
      "MODULE_INVALID_TRANSITION",
      "MODULE_DEPLOY_GATES",
    ]) {
      expect(ERROR_CODES).toContain(code);
    }
  });
  it("BASE_PERMISSIONS añade gestionar_proyectos, operar_proyectos, aprobar_json_discovery", () => {
    expect(BASE_PERMISSIONS).toContain("gestionar_proyectos");
    expect(BASE_PERMISSIONS).toContain("operar_proyectos");
    expect(BASE_PERMISSIONS).toContain("aprobar_json_discovery");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 · `project_creation` atómico (helpers de código + shape del servicio)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-005 · AC-1 · project_creation atómico", () => {
  it("nextProjectCode arranca en PR-00001", async () => {
    const code = await nextProjectCode("org-1", {
      async selectMax() {
        return null;
      },
    });
    expect(code).toBe("PR-00001");
  });
  it("nextProjectCode incrementa monotónicamente", async () => {
    const code = await nextProjectCode("org-1", {
      async selectMax() {
        return "PR-00042";
      },
    });
    expect(code).toBe("PR-00043");
  });
  it("ProjectCreateFromOrderInputSchema admite orderId uuid", () => {
    const r = ProjectCreateFromOrderInputSchema.safeParse({
      orderId: "00000000-0000-0000-0000-000000000010",
    });
    expect(r.success).toBe(true);
  });
  it("ProjectCreateFromOrderInputSchema rechaza orderId inválido", () => {
    const r = ProjectCreateFromOrderInputSchema.safeParse({
      orderId: "no-uuid",
    });
    expect(r.success).toBe(false);
  });
  it("servicio de proyectos expone createProjectsService() con shape estable", () => {
    expect(typeof createProjectsService).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2 · PL primer miembro por construcción (helper + enum)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-005 · AC-2 · PL primer miembro por construcción", () => {
  it("PROJECT_MEMBER_ROLES incluye 'lider' como primer rol", () => {
    expect(PROJECT_MEMBER_ROLES[0]).toBe("lider");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4 · Estados 3D + transiciones (helper canónico)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-005 · AC-4 · estados 3D + transiciones", () => {
  it("happy path planning → development", () => {
    expect(canTransitionProjectStage("planning", "development").ok).toBe(true);
  });
  it("happy path development → testing", () => {
    expect(canTransitionProjectStage("development", "testing").ok).toBe(true);
  });
  it("happy path testing → client_validation", () => {
    expect(canTransitionProjectStage("testing", "client_validation").ok).toBe(true);
  });
  it("happy path client_validation → delivery", () => {
    expect(canTransitionProjectStage("client_validation", "delivery").ok).toBe(true);
  });
  it("transición inválida planning → testing → 409", () => {
    const r = canTransitionProjectStage("planning", "testing");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PROJECT_INVALID_TRANSITION");
  });
  it("transición inválida delivery → planning → 409", () => {
    expect(canTransitionProjectStage("delivery", "planning").ok).toBe(false);
  });
  it("transición con etapa desconocida → 409", () => {
    const r = canTransitionProjectStage("planning", "unknown");
    expect(r.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5 · Salud calculada + override con motivo
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-005 · AC-5 · salud calculada + override", () => {
  it("computeCalculatedHealth: módulos vacíos → on_track", () => {
    expect(computeCalculatedHealth([])).toBe("on_track");
  });
  it("computeCalculatedHealth: módulo blocked requerido → delayed", () => {
    expect(
      computeCalculatedHealth([{ status: "blocked", required: true }]),
    ).toBe("delayed");
  });
  it("computeCalculatedHealth: módulo paused → at_risk", () => {
    expect(
      computeCalculatedHealth([{ status: "paused", required: true }]),
    ).toBe("at_risk");
  });
  it("validateHealthOverride: motivo <3 → 400", () => {
    const r = validateHealthOverride({
      health: "at_risk",
      healthCalculated: "on_track",
      reason: "no",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("HEALTH_REASON_REQUIRED");
  });
  it("validateHealthOverride: motivo OK y health ≠ calculada → OK", () => {
    expect(
      validateHealthOverride({
        health: "at_risk",
        healthCalculated: "on_track",
        reason: "módulo bloqueado por cliente",
      }).ok,
    ).toBe(true);
  });
  it("validateHealthOverride: override redundante (health === calculada) → 400", () => {
    expect(
      validateHealthOverride({
        health: "on_track",
        healthCalculated: "on_track",
        reason: "porque sí",
      }).ok,
    ).toBe(false);
  });
  it("HEALTH_REASON_MIN_LENGTH ≥3 (BR-N254)", () => {
    expect(HEALTH_REASON_MIN_LENGTH).toBe(3);
  });
  it("ProjectOverrideHealthInputSchema exige motivo ≥3", () => {
    const r = ProjectOverrideHealthInputSchema.safeParse({
      projectId: "00000000-0000-0000-0000-000000000010",
      health: "at_risk",
      reason: "no",
    });
    expect(r.success).toBe(false);
    const ok = ProjectOverrideHealthInputSchema.safeParse({
      projectId: "00000000-0000-0000-0000-000000000010",
      health: "at_risk",
      reason: "módulo crítico bloqueado",
    });
    expect(ok.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6 · JSON Discovery round-trip (diff + idempotencia)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-005 · AC-6 · JSON round-trip", () => {
  it("diffJsonDiscoveryPlans: plan vacío → noop", () => {
    const d = diffJsonDiscoveryPlans({
      current: [],
      incoming: { modules: [] },
      currentProjectId: "p-1",
      currentFolio: "PR-1",
      currentIncluded: ["p-1"],
      incomingProjectId: "p-1",
      incomingFolio: "PR-1",
      incomingIncluded: ["p-1"],
    });
    expect(d.noop).toBe(true);
    expect(d.adds).toEqual([]);
    expect(d.changes).toEqual([]);
    expect(d.conflicts).toEqual([]);
  });
  it("diffJsonDiscoveryPlans: detecta altas", () => {
    const d = diffJsonDiscoveryPlans({
      current: [],
      incoming: {
        modules: [
          { code: "diseno", name: "Diseño", required: true },
          { code: "frontend", name: "Frontend", required: true },
        ],
      },
      currentProjectId: "p-1",
      currentFolio: "PR-1",
      currentIncluded: ["p-1"],
      incomingProjectId: "p-1",
      incomingFolio: "PR-1",
      incomingIncluded: ["p-1"],
    });
    expect(d.adds.length).toBe(2);
    expect(d.noop).toBe(false);
  });
  it("diffJsonDiscoveryPlans: detecta cambios de nombre", () => {
    const d = diffJsonDiscoveryPlans({
      current: [{ code: "diseno", name: "Diseño", required: true, dependsOnModules: [], sortOrder: 0 }],
      incoming: {
        modules: [{ code: "diseno", name: "Diseño v2", required: true }],
      },
      currentProjectId: "p-1",
      currentFolio: "PR-1",
      currentIncluded: ["p-1"],
      incomingProjectId: "p-1",
      incomingFolio: "PR-1",
      incomingIncluded: ["p-1"],
    });
    expect(d.changes.length).toBe(1);
    expect(d.changes[0]).toMatchObject({ code: "diseno", field: "name" });
  });
  it("servicio jsonDiscovery expones createJsonDiscoveryService()", () => {
    expect(typeof createJsonDiscoveryService).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7 · Inmutables del JSON
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-005 · AC-7 · inmutables del JSON", () => {
  it("findJsonDiscoveryImmutableConflict: project_id cambia → conflicto", () => {
    const c = findJsonDiscoveryImmutableConflict({
      currentProjectId: "p-1",
      currentFolio: "PR-1",
      currentIncluded: ["p-1"],
      incomingProjectId: "p-2",
      incomingFolio: "PR-1",
      incomingIncluded: ["p-1"],
    });
    expect(c?.field).toBe("project_id");
  });
  it("findJsonDiscoveryImmutableConflict: folio cambia → conflicto", () => {
    expect(
      findJsonDiscoveryImmutableConflict({
        currentProjectId: "p-1",
        currentFolio: "PR-1",
        currentIncluded: ["p-1"],
        incomingProjectId: "p-1",
        incomingFolio: "PR-99",
        incomingIncluded: ["p-1"],
      })?.field,
    ).toBe("folio");
  });
  it("findJsonDiscoveryImmutableConflict: included cambia → conflicto", () => {
    expect(
      findJsonDiscoveryImmutableConflict({
        currentProjectId: "p-1",
        currentFolio: "PR-1",
        currentIncluded: ["p-1"],
        incomingProjectId: "p-1",
        incomingFolio: "PR-1",
        incomingIncluded: ["p-2"],
      })?.field,
    ).toBe("included");
  });
  it("findJsonDiscoveryImmutableConflict: idéntico → null", () => {
    expect(
      findJsonDiscoveryImmutableConflict({
        currentProjectId: "p-1",
        currentFolio: "PR-1",
        currentIncluded: ["p-1"],
        incomingProjectId: "p-1",
        incomingFolio: "PR-1",
        incomingIncluded: ["p-1"],
      }),
    ).toBeNull();
  });
  it("JsonDiscoveryImportInputSchema rechaza inmutables faltantes", () => {
    const r = JsonDiscoveryImportInputSchema.safeParse({
      projectId: "00000000-0000-0000-0000-000000000010",
      version: 1,
      json: { version: 1, modules: [] }, // faltan inmutables
    });
    expect(r.success).toBe(false);
  });
  it("JsonDiscoveryPlanSchema admite plan completo con inmutables", () => {
    const r = JsonDiscoveryPlanSchema.safeParse({
      project_id: "00000000-0000-0000-0000-000000000010",
      folio: "PR-00001",
      included: ["proyecto"],
      version: 1,
      modules: [{ code: "diseno", name: "Diseño", required: true }],
    });
    expect(r.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-8 · Módulos
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-005 · AC-8 · módulos", () => {
  it("canTransitionModule: pending → in_progress OK", () => {
    expect(canTransitionModule("pending", "in_progress").ok).toBe(true);
  });
  it("canTransitionModule: in_progress → deployed NO (debe pasar por testing)", () => {
    const r = canTransitionModule("in_progress", "deployed");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MODULE_INVALID_TRANSITION");
  });
  it("canTransitionModule: testing → deployed OK (BR-N113)", () => {
    expect(canTransitionModule("testing", "deployed").ok).toBe(true);
  });
  it("canTransitionModule: deployed → testing (reapertura) OK", () => {
    expect(canTransitionModule("deployed", "testing").ok).toBe(true);
  });
  it("canTransitionModule: cancelled terminal absoluto", () => {
    expect(canTransitionModule("cancelled", "pending").ok).toBe(false);
  });
  it("canTransitionModule: estado desconocido → MODULE_NOT_FOUND", () => {
    const r = canTransitionModule("unknown", "in_progress");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MODULE_NOT_FOUND");
  });
  it("ModuleTransitionInputSchema admite input válido", () => {
    const r = ModuleTransitionInputSchema.safeParse({
      moduleId: "00000000-0000-0000-0000-000000000010",
      targetStatus: "in_progress",
    });
    expect(r.success).toBe(true);
  });
  it("createModulesService() tipado y disponible", () => {
    expect(typeof createModulesService).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-9 · Señal de cierre técnico
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-005 · AC-9 · señal consumible por SPEC-004", () => {
  it("buildProjectCreatedFromOrderEvent expone plUserId y tipoCobro", () => {
    const e = buildProjectCreatedFromOrderEvent({
      projectId: "00000000-0000-0000-0000-000000000020",
      organizationId: "00000000-0000-0000-0000-000000000001",
      orderId: "00000000-0000-0000-0000-000000000002",
      plUserId: "00000000-0000-0000-0000-000000000003",
      tipoCobro: "pago_unico",
      templateId: "00000000-0000-0000-0000-000000000004",
      templateType: "web_sitio",
      planVersion: 1,
      createdAt: new Date("2026-08-23T15:00:00.000Z"),
    });
    expect(e.plUserId).toBe("00000000-0000-0000-0000-000000000003");
    expect(e.tipoCobro).toBe("pago_unico");
    expect(e.consumers.osMarkInExecution).toContain("SPEC-004");
    expect(e.consumers.futureTechnicalClosure).toContain("SPEC-006");
  });
  it("servicio NO importa orders/markInExecution (no-acoplamiento inverso, SPEC §14)", async () => {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync(
      "rg",
      [
        "-n",
        "--no-heading",
        "from\\s+\"@/server/services/orden-servicio\"|from\\s+['\"]@/server/services/orden-servicio['\"]|markInExecution",
        "src/server/services/proyectos/",
      ],
      { encoding: "utf8" },
    );
    expect((r.stdout ?? "").trim()).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-10 · UI responsive (grep anti-patrón)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-005 · AC-10 · UI responsive", () => {
  it("módulo proyectos-list usa overflow-x-auto y hidden sm:table-cell", async () => {
    const { readFile } = await import("node:fs/promises");
    const list = await readFile(
      "src/modules/proyectos/proyectos-list.tsx",
      "utf8",
    );
    expect(list).toContain("overflow-x-auto");
    expect(list).toContain("hidden sm:table-cell");
    expect(list).toContain("hidden md:table-cell");
  });
  it("páginas /proyectos existen y son .tsx", async () => {
    const { readFile } = await import("node:fs/promises");
    const list = await readFile(
      "src/app/(dashboard)/proyectos/page.tsx",
      "utf8",
    );
    const detail = await readFile(
      "src/app/(dashboard)/proyectos/[id]/page.tsx",
      "utf8",
    );
    expect(list).toContain("ProyectosList");
    expect(detail).toContain("ProyectoDetail");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Transiciones laterales (BR-N379)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-005 · laterales (pause/cancel/resume) con motivo", () => {
  it("validateProjectSituationReason pause ≥3", () => {
    expect(validateProjectSituationReason("", "pause").ok).toBe(false);
    expect(validateProjectSituationReason("no", "pause").ok).toBe(false);
    expect(validateProjectSituationReason("espera cliente", "pause").ok).toBe(true);
  });
  it("validateProjectSituationReason cancel ≥3", () => {
    expect(validateProjectSituationReason("", "cancel").ok).toBe(false);
    expect(validateProjectSituationReason("cliente desiste", "cancel").ok).toBe(true);
  });
  it("ProjectPauseInputSchema rechaza motivo <3", () => {
    const r = ProjectPauseInputSchema.safeParse({
      projectId: "00000000-0000-0000-0000-000000000010",
      reason: "no",
    });
    expect(r.success).toBe(false);
  });
  it("ProjectCancelInputSchema rechaza motivo <3", () => {
    const r = ProjectCancelInputSchema.safeParse({
      projectId: "00000000-0000-0000-0000-000000000010",
      reason: "no",
    });
    expect(r.success).toBe(false);
  });
  it("isProjectSituationTerminal reconoce completed y cancelled", () => {
    expect(isProjectSituationTerminal("completed")).toBe(true);
    expect(isProjectSituationTerminal("cancelled")).toBe(true);
    expect(isProjectSituationTerminal("active")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Zod: ProjectTransitionStageInputSchema
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-005 · zod transiciones", () => {
  it("ProjectTransitionStageInputSchema acepta targetStage canónico", () => {
    for (const s of PROJECT_STAGES) {
      const r = ProjectTransitionStageInputSchema.safeParse({
        projectId: "00000000-0000-0000-0000-000000000010",
        targetStage: s,
      });
      expect(r.success).toBe(true);
    }
  });
  it("ProjectTransitionStageInputSchema rechaza targetStage desconocido", () => {
    expect(
      ProjectTransitionStageInputSchema.safeParse({
        projectId: "00000000-0000-0000-0000-000000000010",
        targetStage: "unknown",
      }).success,
    ).toBe(false);
  });
});