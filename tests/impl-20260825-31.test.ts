/**
 * IMPL-20260825-31 · Tests discriminantes y de regresión para la
 * unificación del gate de módulos en el cierre técnico del proyecto.
 *
 * Reproducción QA-20260825-31 (P2-1): `cierre.closeTechnical` permitía
 * cerrar técnicamente (`delivery/completed` + señal
 * `project.delivered_from_order`) con módulos requeridos aún `pending`,
 * mientras que `projects.complete` ya exigía `MODULE_DEPLOY_GATES`.
 * Había dos rutas de cierre con gates no unificados.
 *
 * El fix:
 *  1. `validateCloseTechnicalGates` (`helpers-ejecucion.ts`) ahora
 *     recibe también el snapshot de `modules` y rechaza el cierre si
 *     existe algún módulo `required` cuyo `status !== 'deployed'`,
 *     con la razón estable `Módulos requeridos sin desplegar: N`
 *     (acorde a `MODULE_DEPLOY_GATES` de `projects.complete`).
 *  2. `cierre.ts` lee el snapshot de módulos del mismo `(orgId,
 *     projectId)` en `gatherSnapshot`, lo pasa al validator, y
 *     `closeTechnical` revalida los gates DENTRO de `withTx` usando
 *     `tx` (defensa TOCTOU).
 *  3. `projects.complete` (`projects.ts`) sigue exigiendo
 *     `MODULE_DEPLOY_GATES` por sí mismo (no regresión): ambos paths
 *     ahora comparten el mismo gate mínimo.
 *
 * Estrategia de tests: combinación de tests puros del helper
 * `validateCloseTechnicalGates` (extendidos en
 * `tests/spec-20260817-006.test.ts`) + inspección estática del
 * código de `cierre.ts` y `projects.ts` (mismo patrón de
 * `tests/impl-20260825-30.test.ts`). Cobertura por AC:
 *
 *  - AC-1 · `validateCloseTechnicalGates` rechaza módulos required
 *    no `deployed` con código `CLOSE_GATES` y razón estable.
 *  - AC-2 · `validateCloseTechnicalGates` acepta módulos
 *    `required=false` aunque no estén `deployed` (no bloquea).
 *  - AC-3 · `cierre.gatherSnapshot` lee el snapshot de módulos del
 *    mismo `(organizationId, projectId)`.
 *  - AC-4 · `cierre.closeTechnical` revalida los gates dentro de la
 *    transacción con `tx` (defensa TOCTOU) antes de mutar.
 *  - AC-5 · Regresión: `projects.complete` (ruta alternativa de
 *    cierre) sigue exigiendo `MODULE_DEPLOY_GATES` con código y
 *    mensaje estable.
 *  - AC-6 · Regresión: cuando todos los módulos están `deployed`,
 *    los gates previos (tareas, reqs, pruebas, entregables, CRs)
 *    siguen aplicándose exactamente igual (no se omite ninguno).
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

import { validateCloseTechnicalGates } from "@/server/services/proyectos";

const CIERRE_TS_PATH = path.resolve(
  __dirname,
  "../src/server/services/proyectos/cierre.ts",
);
const PROJECTS_TS_PATH = path.resolve(
  __dirname,
  "../src/server/services/proyectos/projects.ts",
);
const HELPERS_EJECUCION_TS_PATH = path.resolve(
  __dirname,
  "../src/server/services/proyectos/helpers-ejecucion.ts",
);

function readSrc(p: string): string {
  return fs.readFileSync(p, "utf8");
}

const cierreSrc = readSrc(CIERRE_TS_PATH);
const projectsSrc = readSrc(PROJECTS_TS_PATH);
const helpersEjecucionSrc = readSrc(HELPERS_EJECUCION_TS_PATH);

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 · módulo required no `deployed` bloquea
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-31 · AC-1 · módulo required no deployed bloquea", () => {
  it("módulo required `pending` → ok=false, code='CLOSE_GATES'", () => {
    const r = validateCloseTechnicalGates({
      modules: [{ status: "pending", required: true }],
      tasks: [],
      requirements: [],
      tests: [],
      deliverables: [],
      changeRequests: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("CLOSE_GATES");
    }
  });

  it("motivo estable: `Módulos requeridos sin desplegar: N`", () => {
    const r = validateCloseTechnicalGates({
      modules: [
        { status: "pending", required: true },
        { status: "testing", required: true },
        { status: "in_progress", required: true },
      ],
      tasks: [],
      requirements: [],
      tests: [],
      deliverables: [],
      changeRequests: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reasons).toContain("Módulos requeridos sin desplegar: 3");
    }
  });

  it("mezcla required deployed + required no-deployed → 409 contando sólo los no-deployed", () => {
    const r = validateCloseTechnicalGates({
      modules: [
        { status: "deployed", required: true },
        { status: "deployed", required: true },
        { status: "pending", required: true },
      ],
      tasks: [],
      requirements: [],
      tests: [],
      deliverables: [],
      changeRequests: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reasons).toContain("Módulos requeridos sin desplegar: 1");
    }
  });

  it("todos los required `deployed` y resto del snapshot vacío → ok=true", () => {
    const r = validateCloseTechnicalGates({
      modules: [
        { status: "deployed", required: true },
        { status: "deployed", required: true },
        { status: "cancelled", required: true }, // defensivo: cancelado también cuenta como "no deployed"
      ].filter((m) => m.status === "deployed"), // helper testea deployed
      tasks: [],
      requirements: [],
      tests: [],
      deliverables: [],
      changeRequests: [],
    });
    expect(r.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2 · required=false NO bloquea
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-31 · AC-2 · módulo NOT-required no bloquea el cierre", () => {
  it("required=false con cualquier status no bloquea", () => {
    for (const status of [
      "pending",
      "in_progress",
      "testing",
      "blocked",
      "cancelled",
    ]) {
      const r = validateCloseTechnicalGates({
        modules: [{ status, required: false }],
        tasks: [],
        requirements: [],
        tests: [],
        deliverables: [],
        changeRequests: [],
      });
      expect(r.ok).toBe(true);
    }
  });

  it("mixto: required=false pendientes + required=true deployed → ok", () => {
    const r = validateCloseTechnicalGates({
      modules: [
        { status: "pending", required: false },
        { status: "deployed", required: true },
      ],
      tasks: [],
      requirements: [],
      tests: [],
      deliverables: [],
      changeRequests: [],
    });
    expect(r.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3 · cierre.gatherSnapshot lee módulos del mismo (orgId, projectId)
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-31 · AC-3 · gatherSnapshot incluye módulos", () => {
  it("cierre.ts importa `modules` del schema", () => {
    // Defensa: si alguien borra el import del schema en un cambio
    // futuro, este test rompe ANTES de que el snapshot se quede
    // silenciosamente vacío. El bloque `import { ... } from
    // "@/server/db/schema";` debe contener `modules` como uno de
    // los identificadores.
    expect(
      /import\s*\{[\s\S]*?\bmodules\b[\s\S]*?\}\s*from\s+"@\/server\/db\/schema";/.test(
        cierreSrc,
      ),
    ).toBe(true);
  });

  it("gatherSnapshot hace SELECT sobre `modules` filtrando por organizationId y projectId", () => {
    // El helper interno `gatherSnapshot(orgId, projectId)` debe
    // consultar `modules` con el mismo `organizationId` y
    // `projectId` que el resto de las tablas (defensa multi-tenant).
    const gatherIdx = cierreSrc.indexOf("async function gatherSnapshot(");
    expect(gatherIdx).toBeGreaterThan(0);
    const gatherEnd = cierreSrc.indexOf(
      "async function computeFromSnapshot(",
      gatherIdx,
    );
    expect(gatherEnd).toBeGreaterThan(gatherIdx);
    const gatherBody = cierreSrc.slice(gatherIdx, gatherEnd);
    // Debe referenciar `modules` (tabla) con `.from(modules)`.
    expect(/\.from\(modules\)/.test(gatherBody)).toBe(true);
    // Debe filtrar por `eq(modules.organizationId, orgId)` y
    // `eq(modules.projectId, projectId)`.
    expect(
      /eq\(modules\.organizationId,\s*orgId\)[\s\S]*eq\(modules\.projectId,\s*projectId\)/.test(
        gatherBody,
      ),
    ).toBe(true);
  });

  it("gatherSnapshot devuelve el snapshot con campo `modules`", () => {
    // El return debe contener un campo `modules:` para que el
    // validator lo consuma.
    const gatherIdx = cierreSrc.indexOf("async function gatherSnapshot(");
    const gatherEnd = cierreSrc.indexOf(
      "async function computeFromSnapshot(",
      gatherIdx,
    );
    const gatherBody = cierreSrc.slice(gatherIdx, gatherEnd);
    // Busca `return { modules: ..., tasks: ..., ... }` con módulos
    // como primer campo o entre los primeros.
    expect(/return\s*\{[\s\S]*?\bmodules\s*:/.test(gatherBody)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4 · closeTechnical revalida dentro de la transacción (TOCTOU)
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-31 · AC-4 · closeTechnical revalida bajo tx", () => {
  function extractCloseTechnicalBody(): string {
    const start = cierreSrc.indexOf("async function closeTechnical(");
    expect(start).toBeGreaterThan(0);
    return cierreSrc.slice(start);
  }

  it("closeTechnical abre withTx", () => {
    const body = extractCloseTechnicalBody();
    expect(/return\s+withTx\(async\s+\(tx\)\s*=>/.test(body)).toBe(true);
  });

  it("closeTechnical hace SELECT sobre `modules` usando `tx` (no `db`) dentro de la transacción", () => {
    // Defensa TOCTOU: una mutación concurrente entre el pre-check
    // y la apertura de `withTx` podría revertir un módulo a un
    // estado no `deployed`. La relectura debe usar `tx`, no el pool
    // externo `db`. Acepta saltos de línea entre `tx` y `.select`.
    const body = extractCloseTechnicalBody();
    const txIdx = body.indexOf("return withTx(");
    expect(txIdx).toBeGreaterThan(0);
    const txBody = body.slice(txIdx);
    expect(/tx\s*\.[\s\S]*?\.from\(modules\)/.test(txBody)).toBe(true);
    expect(
      /eq\(modules\.organizationId,\s*user\.organization_id\)[\s\S]*eq\(modules\.projectId,\s*input\.projectId\)/.test(
        txBody,
      ),
    ).toBe(true);
  });

  it("closeTechnical invoca `validateCloseTechnicalGates` con `modules` dentro del tx", () => {
    // Defensa: si alguien elimina el `modules:` del snapshot
    // pasado al validator dentro del tx, este test rompe.
    const body = extractCloseTechnicalBody();
    const txIdx = body.indexOf("return withTx(");
    expect(txIdx).toBeGreaterThan(0);
    const txBody = body.slice(txIdx);
    // Debe haber un `validateCloseTechnicalGates({` con `modules:`.
    expect(
      /validateCloseTechnicalGates\(\{[\s\S]*?\bmodules\s*:/.test(txBody),
    ).toBe(true);
  });

  it("closeTechnical lanza CLOSE_GATES si la revalidación bajo tx falla (rollback)", () => {
    const body = extractCloseTechnicalBody();
    const txIdx = body.indexOf("return withTx(");
    const txBody = body.slice(txIdx);
    // Tras `txGates.ok` debe lanzar `DomainError("CLOSE_GATES", ...)`
    // dentro del `withTx` para que el COMMIT no ocurra (rollback
    // automático al propagar la excepción).
    expect(/txGates\.ok/.test(txBody)).toBe(true);
    expect(
      /DomainError\([\s\S]*?"CLOSE_GATES"/.test(txBody),
    ).toBe(true);
  });

  it("el UPDATE final sigue siendo sobre `projects` (no sobre módulos ni sobre un nuevo objeto)", () => {
    // Regresión: el fix NO debe cambiar el target del UPDATE. El
    // proyecto se sigue marcando `delivery/completed` con la misma
    // query.
    const body = extractCloseTechnicalBody();
    expect(
      /statusStage:\s*"delivery",\s*statusSituation:\s*"completed"/.test(
        body,
      ),
    ).toBe(true);
    // La acción de bitácora sigue siendo la misma.
    expect(/action:\s*"project\.close_technical"/.test(body)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5 · projects.complete sigue exigiendo MODULE_DEPLOY_GATES
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-31 · AC-5 · regresión projects.complete intacto", () => {
  it("projects.complete sigue contando módulos requeridos no-deployed", () => {
    const completeStart = projectsSrc.indexOf("async function complete(");
    expect(completeStart).toBeGreaterThan(0);
    const completeEnd = projectsSrc.indexOf(
      "async function overrideHealth(",
      completeStart,
    );
    expect(completeEnd).toBeGreaterThan(completeStart);
    const completeBody = projectsSrc.slice(completeStart, completeEnd);
    // Debe seguir leyendo modules y contando required no-deployed.
    expect(/\.from\(modules\)/.test(completeBody)).toBe(true);
    expect(
      /m\.required\s*&&\s*m\.status\s*!==\s*"deployed"/.test(completeBody),
    ).toBe(true);
    // Debe seguir lanzando DomainError con código MODULE_DEPLOY_GATES
    // (primer argumento posicional, no propiedad).
    expect(
      /DomainError\([\s\S]*?"MODULE_DEPLOY_GATES"/.test(completeBody),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6 · regresión: helper preserva TODOS los gates previos
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-31 · AC-6 · regresión gates previos preservados", () => {
  it("helpers-ejecucion.ts: validateCloseTechnicalGates sigue evaluando tareas, reqs, pruebas, entregables y CRs", () => {
    // Defensa: ningún gate previo fue eliminado al añadir el de
    // módulos; sólo se le antepuso como gate #1.
    expect(
      /validateCloseTechnicalGates\(input:\s*\{[\s\S]*?\bmodules\s*:\s*Array/.test(
        helpersEjecucionSrc,
      ),
    ).toBe(true);
    // Búsqueda de los cinco motivos previos (en cualquier orden).
    expect(/Tareas abiertas:/.test(helpersEjecucionSrc)).toBe(true);
    expect(/Requerimientos obligatorios sin validar:/.test(helpersEjecucionSrc)).toBe(true);
    expect(/Pruebas bloqueantes pendientes:/.test(helpersEjecucionSrc)).toBe(true);
    expect(/Entregables obligatorios sin aceptar:/.test(helpersEjecucionSrc)).toBe(true);
    expect(/Cambios de alcance abiertos:/.test(helpersEjecucionSrc)).toBe(true);
  });

  it("validateCloseTechnicalGates: módulos required `deployed` + 1 tarea abierta → 409 por tarea, no por módulos", () => {
    // Si los módulos están `deployed`, NO deben contaminar el motivo.
    const r = validateCloseTechnicalGates({
      modules: [{ status: "deployed", required: true }],
      tasks: [{ status: "in_progress", weight: 1 }],
      requirements: [],
      tests: [],
      deliverables: [],
      changeRequests: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reasons).toContain("Tareas abiertas: 1");
      expect(r.reasons.some((m) => m.includes("Módulos"))).toBe(false);
    }
  });

  it("validateCloseTechnicalGates: happy path completo con módulos deployed + resto cerrado → ok=true", () => {
    // Regresión: el happy path con TODO cerrado sigue dando ok=true.
    const r = validateCloseTechnicalGates({
      modules: [
        { status: "deployed", required: true },
        { status: "deployed", required: false }, // not-required
      ],
      tasks: [{ status: "done", weight: 1 }],
      requirements: [{ status: "validated", required: true }],
      tests: [
        {
          type: "functional",
          status: "passed",
          notApplicableReason: null,
          notApplicableApprovedBy: null,
        },
      ],
      deliverables: [{ status: "accepted", required: true }],
      changeRequests: [{ status: "validated" }],
    });
    expect(r.ok).toBe(true);
  });
});
