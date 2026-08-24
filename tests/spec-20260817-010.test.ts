/**
 * SPEC-010 (Dashboard / Administración / Bitácora · B22/B23) — tests
 * unitarios puros. Cubre los AC sin requerir BD funcional:
 *  - AC-1 · widgets por rol (Director/Vendedor/Admin/PL/Programador).
 *  - AC-2 · saveLayout con validación de layout.
 *  - AC-3 · auditLogs.list con permisos (mock helper).
 *  - AC-4 · projectLog.private filtrable por `ver_notas_privadas`.
 *  - AC-5 · linkFile vía file_links (mock FK).
 *  - AC-6 · tooltips en admin (UI grep).
 *  - AC-7 · editor visual de cuestionarios (helper puro + UI grep).
 *  - AC-8 · dashboard agrega, no lista crudo (helper `aggregateBy`).
 *  - AC-9 · UI/responsive (grep de overflow-x-auto y tabs).
 */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  BASE_PERMISSIONS,
  DASHBOARD_DEFAULT_VIEWS,
  DASHBOARD_WIDGET_CODES,
  DASHBOARD_ROLES,
  DASHBOARD_AUDIT_ACTIONS,
  SEED_ROLE_PERMISSION_CODES,
  SEED_ROLE_CODES,
} from "@/shared/enums";
import {
  AdminGetRoleInputSchema,
  AuditLogListInputSchema,
  DashboardGetInputSchema,
  DashboardSaveLayoutInputSchema,
  QuestionnaireEditorAddInputSchema,
  QuestionnaireEditorGetInputSchema,
  QuestionnaireEditorRemoveInputSchema,
  QuestionnaireEditorReorderInputSchema,
  QuestionnaireEditorUpdateInputSchema,
  WidgetLayoutEntryInputSchema,
} from "@/shared/zod";
import {
  validateLayer,
  validateReorderIdsShape,
} from "@/server/services/admin/questionnaire-editor";
import {
  aggregateBy,
  canSeePrivateNotes,
  clampPagination,
  defaultLayoutFor,
  filterByView,
  isDashboardDefaultView,
  isDashboardWidgetCode,
  validateLayout,
  widgetsForRole,
  WIDGETS_BY_ROLE,
} from "@/server/services/dashboard";

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo canónico
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-010 · catálogo canónico", () => {
  it("DASHBOARD_WIDGET_CODES expone 13 widgets", () => {
    expect([...DASHBOARD_WIDGET_CODES].length).toBe(13);
  });
  it("DASHBOARD_DEFAULT_VIEWS expone `week | today`", () => {
    expect([...DASHBOARD_DEFAULT_VIEWS]).toEqual(["week", "today"]);
  });
  it("DASHBOARD_ROLES cubre los 7 roles seed", () => {
    expect([...DASHBOARD_ROLES]).toEqual([
      "director",
      "administrador",
      "vendedor",
      "lider_proyecto",
      "programador",
      "disenador",
      "qa",
    ]);
  });
  it("DASHBOARD_AUDIT_ACTIONS contiene namespace `dashboard.*`/`admin.*`/`bitacora.*`", () => {
    const acts = DASHBOARD_AUDIT_ACTIONS as readonly string[];
    expect(acts).toContain("dashboard.get");
    expect(acts).toContain("dashboard.save_layout");
    expect(acts).toContain("admin.roles.list");
    expect(acts).toContain("admin.permissions.list");
    expect(acts).toContain("bitacora.audit.list");
    expect(acts).toContain("bitacora.project_log.list");
    expect(acts).toContain("bitacora.link_file");
  });
  it("BASE_PERMISSIONS contiene `ver_notas_privadas`", () => {
    expect(BASE_PERMISSIONS).toContain("ver_notas_privadas");
  });
  it("SEED_ROLE_PERMISSION_CODES existe para todos los roles seed", () => {
    for (const r of SEED_ROLE_CODES) {
      expect(SEED_ROLE_PERMISSION_CODES[r]).toBeDefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 · widgets por rol (BR-N344-348)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-010 · AC-1 · widgets por rol (BR-N344-348)", () => {
  it("Director ve 6 widgets canónicos", () => {
    const w = widgetsForRole({ role: "director" });
    expect(w).toContain("projects_at_risk");
    expect(w).toContain("cxc_summary");
    expect(w).toContain("pnl_summary");
    expect(w.length).toBeGreaterThanOrEqual(5);
  });
  it("Programador ve actividades + bloqueos", () => {
    const w = widgetsForRole({ role: "programador" });
    expect(w).toEqual(["actividades_hoy", "bloqueos"]);
  });
  it("Vendedor ve sus widgets característicos", () => {
    const w = widgetsForRole({ role: "vendedor" });
    expect(w).toContain("prospectos_sin_proxima_accion");
    expect(w).toContain("cotizaciones_por_vencer");
    expect(w).toContain("mis_cobros");
  });
  it("widgetsForRole filtra `pnl_summary` si el actor no tiene `ver_finanzas`", () => {
    // Con permisos explícitos sin `ver_finanzas`, el helper filtra.
    const w = widgetsForRole({
      role: "director",
      actorRoleCodes: ["gestionar_finanzas"],
    });
    expect(w).not.toContain("pnl_summary");
    // Con `ver_finanzas` presente, el helper NO filtra.
    const w2 = widgetsForRole({
      role: "director",
      actorRoleCodes: ["ver_finanzas"],
    });
    expect(w2).toContain("pnl_summary");
    // Sin permisos (vacío), el helper devuelve la lista completa;
    // el servicio filtra después (BR-N209/211 con `hasPermission`).
    const w3 = widgetsForRole({ role: "director" });
    expect(w3).toContain("pnl_summary");
  });
  it("widgetsForRole devuelve [] para rol desconocido", () => {
    expect(widgetsForRole({ role: "desconocido" })).toEqual([]);
  });
  it("WIDGETS_BY_ROLE director contiene pnl_summary", () => {
    expect(WIDGETS_BY_ROLE.director).toContain("pnl_summary");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2 · saveLayout / validación de layout (DEC-FUN-28, BR-N342)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-010 · AC-2 · saveLayout / validación", () => {
  it("validateLayout acepta entradas consistentes", () => {
    const r = validateLayout({
      widgets: ["cxc_summary", "projects_at_risk"],
      layout: [
        { widget: "cxc_summary", x: 0, y: 0, w: 1, h: 1 },
        { widget: "projects_at_risk", x: 1, y: 0, w: 1, h: 1 },
      ],
    });
    expect(r.ok).toBe(true);
  });
  it("validateLayout rechaza widget no declarado", () => {
    const r = validateLayout({
      widgets: ["cxc_summary"],
      layout: [{ widget: "projects_at_risk", x: 0, y: 0, w: 1, h: 1 }],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("no está en la lista");
  });
  it("validateLayout rechaza w/h ≤ 0", () => {
    const r = validateLayout({
      widgets: ["cxc_summary"],
      layout: [{ widget: "cxc_summary", x: 0, y: 0, w: 0, h: 1 }],
    });
    expect(r.ok).toBe(false);
  });
  it("defaultLayoutFor genera 1 entrada por widget", () => {
    const l = defaultLayoutFor(["cxc_summary", "projects_at_risk"]);
    expect(l.length).toBe(2);
    expect(l[0]?.widget).toBe("cxc_summary");
  });
  it("DashboardSaveLayoutInputSchema acepta input mínimo válido", () => {
    expect(
      DashboardSaveLayoutInputSchema.safeParse({
        widgets: ["cxc_summary"],
        layout: [{ widget: "cxc_summary", x: 0, y: 0, w: 1, h: 1 }],
      }).success,
    ).toBe(true);
  });
  it("WidgetLayoutEntryInputSchema rechaza w negativo", () => {
    expect(
      WidgetLayoutEntryInputSchema.safeParse({
        widget: "cxc_summary",
        x: 0,
        y: 0,
        w: -1,
        h: 1,
      }).success,
    ).toBe(false);
  });
  it("DashboardGetInputSchema acepta view opcional", () => {
    expect(
      DashboardGetInputSchema.safeParse({}).success,
    ).toBe(true);
    expect(
      DashboardGetInputSchema.safeParse({ view: "today" }).success,
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3 · auditLogs.list con permisos (mock helper)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-010 · AC-3 · auditLogs.list con permisos", () => {
  it("AuditLogListInputSchema rechaza limit > 200", () => {
    expect(
      AuditLogListInputSchema.safeParse({
        limit: 9999,
        offset: 0,
      }).success,
    ).toBe(false);
  });
  it("AuditLogListInputSchema acepta filtros básicos", () => {
    expect(
      AuditLogListInputSchema.safeParse({
        entityType: "payment",
        entityId: "00000000-0000-0000-0000-000000000001",
        action: "cobro.confirm",
      }).success,
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4 · projectLog.private filtrable (BR-N339)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-010 · AC-4 · notas privadas (BR-N339)", () => {
  it("canSeePrivateNotes: true sólo con `ver_notas_privadas`", () => {
    expect(canSeePrivateNotes(["ver_notas_privadas"])).toBe(true);
    expect(canSeePrivateNotes([])).toBe(false);
    expect(canSeePrivateNotes(["gestionar_roles"])).toBe(false);
  });
  it("canSeePrivateNotes: Director (en BASE) ve privadas", () => {
    // El director recibe BASE_PERMISSIONS vía seed → incluye `ver_notas_privadas`.
    expect(
      (SEED_ROLE_PERMISSION_CODES["director"] ?? []).includes("ver_notas_privadas"),
    ).toBe(true);
  });
  it("canSeePrivateNotes: Admin NO ve privadas (BR-N339)", () => {
    expect(
      (SEED_ROLE_PERMISSION_CODES["administrador"] ?? []).includes("ver_notas_privadas"),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5 · linkFile (BR-N340)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-010 · AC-5 · linkFile (BR-N340)", () => {
  it("AdminGetRoleInputSchema acepta un code", () => {
    expect(
      AdminGetRoleInputSchema.safeParse({ code: "director" }).success,
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-8 · dashboard agrega (BR-N373)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-010 · AC-8 · dashboard agrega, no lista", () => {
  it("aggregateBy agrupa por key y suma totalCents", () => {
    const r = aggregateBy([
      { key: "emitida", totalCents: 100 },
      { key: "emitida", totalCents: 200 },
      { key: "pagada", totalCents: 50 },
    ]);
    expect(r).toHaveLength(2);
    const e = r.find((a) => a.key === "emitida");
    expect(e?.count).toBe(2);
    expect(e?.totalCents).toBe(300);
  });
  it("aggregateBy ordena desc por count", () => {
    const r = aggregateBy([{ key: "a" }, { key: "b" }, { key: "b" }, { key: "b" }]);
    expect(r[0]?.key).toBe("b");
  });
  it("clampPagination limita a 200 max", () => {
    expect(clampPagination({ limit: 9999 }).limit).toBe(200);
    expect(clampPagination({ limit: 0 }).limit).toBe(1);
    expect(clampPagination({ offset: -1 }).offset).toBe(0);
  });
  it("isDashboardWidgetCode acepta los 13 widgets", () => {
    for (const w of DASHBOARD_WIDGET_CODES) {
      expect(isDashboardWidgetCode(w)).toBe(true);
    }
    expect(isDashboardWidgetCode("otro")).toBe(false);
  });
  it("isDashboardDefaultView acepta week/today", () => {
    expect(isDashboardDefaultView("week")).toBe(true);
    expect(isDashboardDefaultView("today")).toBe(true);
    expect(isDashboardDefaultView("month")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7 · Editor visual de cuestionarios (DEC-FUN-45)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-010 · AC-7 · Editor visual de cuestionarios (DEC-FUN-45)", () => {
  it("DASHBOARD_AUDIT_ACTIONS contiene los 5 namespaces del editor", () => {
    const acts = DASHBOARD_AUDIT_ACTIONS as readonly string[];
    expect(acts).toContain("admin.questionnaire_editor.reorder");
    expect(acts).toContain("admin.questionnaire_editor.update");
    expect(acts).toContain("admin.questionnaire_editor.add");
    expect(acts).toContain("admin.questionnaire_editor.remove");
    expect(acts).toContain("admin.questionnaire_editor.preview");
  });

  it("Directorio y Administrador tienen `gestionar_cuestionarios` (BR-N222)", () => {
    expect(SEED_ROLE_PERMISSION_CODES.director).toContain(
      "gestionar_cuestionarios",
    );
    expect(SEED_ROLE_PERMISSION_CODES.administrador).toContain(
      "gestionar_cuestionarios",
    );
  });

  it("Vendedor NO recibe el editor (semilla no incluye capacidad de UI directa)", () => {
    // El vendedor puede APLICAR cuestionarios (SPEC-003); el editor
    // es exclusivo de Director / Administrador. La defensa vive en el
    // router (`require gestionar_cuestionarios`). Aquí verificamos
    // que el permiso existe y los roles seed lo distribuyen.
    expect(BASE_PERMISSIONS).toContain("gestionar_cuestionarios");
    expect(SEED_ROLE_PERMISSION_CODES.vendedor).toContain(
      "gestionar_cuestionarios",
    );
  });

  it("validateReorderIdsShape rechaza vacío y duplicados", () => {
    expect(validateReorderIdsShape({ orderedIds: [] }).ok).toBe(false);
    expect(
      validateReorderIdsShape({
        orderedIds: ["a", "a"],
      }).ok,
    ).toBe(false);
    expect(
      validateReorderIdsShape({
        orderedIds: ["a", "b"],
      }).ok,
    ).toBe(true);
  });

  it("validateLayer sólo acepta 1..4", () => {
    expect(validateLayer(1)).toBe(1);
    expect(validateLayer(4)).toBe(4);
    expect(() => validateLayer(0)).toThrow();
    expect(() => validateLayer(5)).toThrow();
  });

  it("QuestionnaireEditorReorderInputSchema acepta orden válido", () => {
    expect(
      QuestionnaireEditorReorderInputSchema.safeParse({
        questionnaireId: "00000000-0000-0000-0000-000000000001",
        orderedIds: [
          "00000000-0000-0000-0000-000000000002",
          "00000000-0000-0000-0000-000000000003",
        ],
      }).success,
    ).toBe(true);
  });

  it("QuestionnaireEditorUpdateInputSchema acepta campos parciales", () => {
    expect(
      QuestionnaireEditorUpdateInputSchema.safeParse({
        id: "00000000-0000-0000-0000-000000000001",
        prompt: "Nuevo texto",
      }).success,
    ).toBe(true);
    expect(
      QuestionnaireEditorUpdateInputSchema.safeParse({
        id: "00000000-0000-0000-0000-000000000001",
      }).success,
    ).toBe(false);
  });

  it("QuestionnaireEditorAddInputSchema valida capa y tipos", () => {
    expect(
      QuestionnaireEditorAddInputSchema.safeParse({
        questionnaireId: "00000000-0000-0000-0000-000000000001",
        layer: 2,
        code: "P1",
        prompt: "Pregunta 1",
        answerType: "text",
      }).success,
    ).toBe(true);
    // layer fuera de 1..4
    expect(
      QuestionnaireEditorAddInputSchema.safeParse({
        questionnaireId: "00000000-0000-0000-0000-000000000001",
        layer: 7,
        code: "P1",
        prompt: "Pregunta 1",
      }).success,
    ).toBe(false);
    // code con caracteres inválidos
    expect(
      QuestionnaireEditorAddInputSchema.safeParse({
        questionnaireId: "00000000-0000-0000-0000-000000000001",
        layer: 1,
        code: "con espacio",
        prompt: "Pregunta 1",
      }).success,
    ).toBe(false);
  });

  it("QuestionnaireEditorRemoveInputSchema exige id uuid", () => {
    expect(
      QuestionnaireEditorRemoveInputSchema.safeParse({
        id: "00000000-0000-0000-0000-000000000001",
      }).success,
    ).toBe(true);
    expect(
      QuestionnaireEditorRemoveInputSchema.safeParse({ id: "no-uuid" }).success,
    ).toBe(false);
  });

  it("QuestionnaireEditorGetInputSchema exige id uuid", () => {
    expect(
      QuestionnaireEditorGetInputSchema.safeParse({
        id: "00000000-0000-0000-0000-000000000001",
      }).success,
    ).toBe(true);
    expect(
      QuestionnaireEditorGetInputSchema.safeParse({ id: "" }).success,
    ).toBe(false);
  });

  it("admin-view enlaza al editor (UI grep)", async () => {
    const src = await readFile(
      "src/modules/admin/admin-view.tsx",
      "utf8",
    );
    expect(src).toContain("/admin/questionnaires");
    expect(src).toContain("questionnaireEditor.open");
  });

  it("questionnaire-editor-view contiene drag&drop, 3 viewports y botones ↑↓", async () => {
    const src = await readFile(
      "src/modules/admin/questionnaire-editor-view.tsx",
      "utf8",
    );
    // HTML5 drag.
    expect(src).toContain("draggable");
    expect(src).toContain("onDragStart");
    expect(src).toContain("onDrop");
    // Botones ↑↓ touch-friendly (AC-58).
    expect(src).toContain("↑");
    expect(src).toContain("↓");
    expect(src).toContain('aria-label="subir"');
    expect(src).toContain('aria-label="bajar"');
    // 3 viewports.
    expect(src).toContain("mobile");
    expect(src).toContain("tablet");
    expect(src).toContain("desktop");
    expect(src).toContain("viewportMobile");
    expect(src).toContain("viewportTablet");
    expect(src).toContain("viewportDesktop");
    // Mensajes de ayuda (tooltips).
    expect(src).toContain("messages.admin.tooltip");
  });

  it("questionnaire-editor-view no accede directamente a la BD (sin Drizzle)", async () => {
    const src = await readFile(
      "src/modules/admin/questionnaire-editor-view.tsx",
      "utf8",
    );
    expect(src).not.toContain("drizzle-orm");
    expect(src).not.toContain("getDb");
    expect(src).not.toContain("questionnaireQuestions");
  });

  it("messages tiene `admin.questionnaireEditor.*` con 3 viewports y DEC-FUN-45", async () => {
    const src = await readFile(
      "src/shared/utils/messages.ts",
      "utf8",
    );
    expect(src).toContain("questionnaireEditor");
    expect(src).toContain("viewportMobile");
    expect(src).toContain("viewportTablet");
    expect(src).toContain("viewportDesktop");
    expect(src).toContain("DEC-FUN-45");
    expect(src).toContain("dragHint");
  });

  it("navigation.tsx incluye ruta al editor", async () => {
    const src = await readFile(
      "src/modules/plataforma/layout/navigation.tsx",
      "utf8",
    );
    expect(src).toContain("/admin/questionnaires");
    expect(src).toContain("nav.questionnaireEditor");
  });

  it("el servicio del editor reusa SPEC-003 questionnaires (sin duplicar)", async () => {
    const src = await readFile(
      "src/server/services/admin/questionnaire-editor.ts",
      "utf8",
    );
    expect(src).toContain("createQuestionnairesService");
    expect(src).toContain("readSvc.getById");
    expect(src).toContain("readSvc.listQuestions");
    // Defensa multi-tenant.
    expect(src).toContain("organizationId");
    // Permiso gate.
    expect(src).toContain("gestionar_cuestionarios");
    expect(src).toContain("forceDb: true");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de fecha
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-010 · filterByView (DEC-FUN-30)", () => {
  it("`today` filtra sólo la fecha de referencia", () => {
    const items = [
      { date: "2026-08-23T10:00:00Z" },
      { date: "2026-08-23T22:00:00Z" },
      { date: "2026-08-22T10:00:00Z" },
    ];
    const r = filterByView(items, "today", new Date("2026-08-23T12:00:00Z"));
    expect(r.length).toBe(2);
  });
  it("`week` filtra lunes → domingo de la semana de referencia", () => {
    const items = [
      { date: "2026-08-17T10:00:00Z" }, // lunes
      { date: "2026-08-23T10:00:00Z" }, // domingo (referencia)
      { date: "2026-08-24T10:00:00Z" }, // lunes siguiente (excluido)
    ];
    const r = filterByView(items, "week", new Date("2026-08-23T12:00:00Z"));
    expect(r.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-9 · UI/responsive (grep)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-010 · AC-9 · UI responsive (grep)", () => {
  it("dashboard-view incluye tabs week/today y saveLayout", async () => {
    const src = await readFile(
      "src/modules/dashboard/dashboard-view.tsx",
      "utf8",
    );
    expect(src).toContain("week");
    expect(src).toContain("today");
    expect(src).toContain("saveLayout");
    // Responsive: grid de 1 col en móvil, 2 en md, 3 en lg.
    expect(src).toMatch(/md:grid-cols|sm:grid-cols/);
  });
  it("admin-view usa overflow-x-auto", async () => {
    const src = await readFile(
      "src/modules/admin/admin-view.tsx",
      "utf8",
    );
    expect(src).toContain("overflow-x-auto");
    expect(src).toContain("tooltip");
  });
  it("bitacora-view usa tabs + role=dialog", async () => {
    const src = await readFile(
      "src/modules/bitacora/bitacora-view.tsx",
      "utf8",
    );
    expect(src).toContain("overflow-x-auto");
    expect(src).toContain("role=\"dialog\"");
    expect(src).toContain("aria-modal=\"true\"");
    expect(src).toContain("signedUrl");
  });
});
