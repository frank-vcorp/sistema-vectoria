/**
 * IMPL-20260825-30 · Tests discriminantes y de regresión para el fix
 * del gap `statusSituation` en `projects.transitionStage`
 * (SPEC-20260817-005 AC-4).
 *
 * Reproducción de QA-20260825-30: `projects.createFromOrder` deja el
 * proyecto en `planning/pending`; la UI transiciona `planning→development`
 * 200 pero mantiene `statusSituation=pending`. SPEC-005 AC-4 exige que un
 * proyecto operativo en `development` esté `active`. El fix promueve
 * `pending→active` atómicamente en el primer `transitionStage`
 * operativo, SIN alterar `paused`/`cancelled`/`completed` y SIN
 * inventar una nueva acción/endpoint público (no cambia contrato).
 *
 * Estrategia de tests: combinación de tests puros del helper
 * `shouldPromoteSituationOnTransitionStage` + inspección estática del
 * código de `projects.ts` y `helpers.ts` (mismo patrón de
 * `tests/impl-20260825-29.test.ts`). Cobertura por AC:
 *
 *  - AC-1 · `createFromOrder` mantiene `planning/pending` al nacer
 *    (SPEC §4.3 obligatorio; la promoción a `active` NO ocurre aquí).
 *  - AC-2 · `transitionStage` promueve `pending→active` atómicamente
 *    sólo cuando `before.statusSituation === 'pending'`.
 *  - AC-3 · Auditoría preserva `before.statusSituation` y registra
 *    `after.statusSituation` cuando hay promoción.
 *  - AC-4 · Regresión: `paused`/`cancelled` siguen bloqueando
 *    `transitionStage` con `409 PROJECT_INVALID_TRANSITION`.
 *  - AC-5 · Regresión: `completed` (situación terminal vía
 *    `closeTechnical`) sigue bloqueando porque `delivery` es etapa
 *    terminal en el helper `canTransitionProjectStage`.
 *  - AC-6 · `closeTechnical` y `complete` (que ponen
 *    `delivery/completed`) NO se ven afectados por este fix.
 *  - AC-7 · Helper puro `shouldPromoteSituationOnTransitionStage`
 *    discrimina por situación.
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  isProjectSituationTerminal,
  shouldPromoteSituationOnTransitionStage,
} from "@/server/services/proyectos";

const PROJECTS_TS_PATH = path.resolve(
  __dirname,
  "../src/server/services/proyectos/projects.ts",
);
const HELPERS_TS_PATH = path.resolve(
  __dirname,
  "../src/server/services/proyectos/helpers.ts",
);
const CLOSURE_TS_PATH = path.resolve(
  __dirname,
  "../src/server/services/proyectos/cierre.ts",
);

function readSrc(p: string): string {
  return fs.readFileSync(p, "utf8");
}

/**
 * Helper para extraer el cuerpo de la función `transitionStage` (entre
 * `async function transitionStage(` y la siguiente `async function` o
 * cierre del servicio). Devuelve un bloque recortado que podemos
 * inspeccionar con regex.
 */
function extractTransitionStageBody(src: string): string {
  const start = src.indexOf("async function transitionStage(");
  if (start < 0) throw new Error("transitionStage no encontrada");
  // Cortamos hasta el próximo `async function` (siguiente servicio) o
  // hasta `return {` final del servicio.
  const tail = src.slice(start);
  const nextAsync = tail.search(/\n\s*async function /);
  const endCandidates = [
    nextAsync > 0 ? nextAsync : tail.length,
    tail.indexOf("\n  return {"),
  ].filter((n) => n > 0);
  const end = Math.min(...endCandidates);
  return tail.slice(0, end);
}

const projectsSrc = readSrc(PROJECTS_TS_PATH);
const helpersSrc = readSrc(HELPERS_TS_PATH);
const cierreSrc = readSrc(CLOSURE_TS_PATH);
const transitionBody = extractTransitionStageBody(projectsSrc);

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 · `createFromOrder` mantiene `planning/pending` al nacer
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-30 · AC-1 · createFromOrder nace en planning/pending", () => {
  it("el INSERT en createFromOrder fija statusSituation='pending'", () => {
    // El SPEC §4.3 (paso 1) exige `planning/pending` al crear.
    // Verificamos que el insert del proyecto en `createFromOrder`
    // sigue fijando `pending` (no se ha modificado a `active`).
    const createStart = projectsSrc.indexOf("async function createFromOrder(");
    expect(createStart).toBeGreaterThan(0);
    const createEnd = projectsSrc.indexOf(
      "async function transitionStage(",
      createStart,
    );
    const createBody = projectsSrc.slice(createStart, createEnd);
    expect(/statusSituation:\s*"pending"/.test(createBody)).toBe(true);
    // No debe promover a `active` dentro del INSERT del create.
    expect(/statusSituation:\s*"active"/.test(createBody)).toBe(false);
  });

  it("statusStage inicial sigue siendo 'planning'", () => {
    const createStart = projectsSrc.indexOf("async function createFromOrder(");
    const createEnd = projectsSrc.indexOf(
      "async function transitionStage(",
      createStart,
    );
    const createBody = projectsSrc.slice(createStart, createEnd);
    expect(/statusStage:\s*"planning"/.test(createBody)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2 · `transitionStage` promueve `pending→active` atómicamente
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-30 · AC-2 · transitionStage promueve pending→active", () => {
  it("el SET incluye `statusSituation: 'active'` condicionado al helper", () => {
    // La promoción debe aparecer dentro del SET (`.set(updateSet)`)
    // de `transitionStage` y usar el helper
    // `shouldPromoteSituationOnTransitionStage`. Verificamos el patrón
    // estructural para asegurar atomicidad (un único UPDATE por
    // transición).
    expect(/situationPromotesToActive/.test(transitionBody)).toBe(true);
    expect(/shouldPromoteSituationOnTransitionStage\(/.test(transitionBody)).toBe(
      true,
    );
    // El SET es único (un solo .set() sobre `projects`) y combina
    // stage + situation condicionalmente vía el objeto `updateSet`.
    const setMatches = transitionBody.match(/\.set\(/g) ?? [];
    expect(setMatches.length).toBe(1);
    expect(/\.set\(updateSet\)/.test(transitionBody)).toBe(true);
    // El helper se usa para decidir si se añade la asignación.
    expect(
      /if\s*\(situationPromotesToActive\)\s*\{[\s\S]*?updateSet\.statusSituation\s*=\s*"active"/.test(
        transitionBody,
      ),
    ).toBe(true);
  });

  it("NO se hace un UPDATE separado posterior para promover la situación", () => {
    // La atomicidad es requisito del fix: un solo UPDATE. Si hubiera
    // un segundo UPDATE sólo para `statusSituation`, se rompería la
    // atomicidad transaccional ante un fallo de BD.
    const updateMatches = transitionBody.match(/\.update\(projects\)/g) ?? [];
    expect(updateMatches.length).toBe(1);
  });

  it("NO introduce una nueva acción de servicio público (no rompe contrato)", () => {
    // El contrato público observable (router + zod) NO debe cambiar:
    // la firma de `transitionStage` sigue aceptando sólo
    // `{ projectId, targetStage }`. La promoción a `active` es interna.
    const sig = transitionBody.match(
      /async function transitionStage\([\s\S]*?targetStage:\s*ProjectStage[\s\S]*?\):\s*Promise<ProjectDTO>/,
    );
    expect(sig).not.toBeNull();
    // La firma NO menciona `statusSituation` como argumento.
    expect(sig![0]).not.toMatch(/statusSituation/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3 · Auditoría preserva situación y registra promoción
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-30 · AC-3 · auditoría preserva situación", () => {
  it("el audit `project.transition_stage` incluye `before.statusSituation`", () => {
    // AC-7 de SPEC-005/006 exige auditoría de transiciones críticas
    // con `actor_role_code`. La situación debe quedar en `before` para
    // que el cambio `pending→active` sea trazable.
    expect(
      /before:\s*\{[\s\S]*?statusSituation:\s*before\.statusSituation[\s\S]*?\}/.test(
        transitionBody,
      ),
    ).toBe(true);
  });

  it("el audit `after` añade `statusSituation` cuando hay promoción", () => {
    // Sólo cuando `situationPromotesToActive` se debe añadir la
    // situación al bloque `after`; en transiciones posteriores ya
    // `active`, no se duplica el campo.
    expect(
      /after:\s*\{[\s\S]*?\.\.\.\(situationPromotesToActive[\s\S]*?\}\)/.test(
        transitionBody,
      ),
    ).toBe(true);
  });

  it("NO se elimina el audit del proyecto (multitenancy + trazabilidad)", () => {
    // Verifica que sigue existiendo UN audit `project.transition_stage`
    // dentro de transitionStage.
    const auditMatches =
      transitionBody.match(/action:\s*"project\.transition_stage"/g) ?? [];
    expect(auditMatches.length).toBe(1);
    // Y se conserva el import de `createAuditService()`.
    expect(
      /createAuditService\(\)\.record\(ctx,\s*\{[\s\S]*?entityType:\s*"project"/.test(
        transitionBody,
      ),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4 · Regresión: paused/cancelled siguen bloqueando
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-30 · AC-4 · regresión paused/cancelled siguen bloqueando", () => {
  it("guard de `paused` permanece en transitionStage (409)", () => {
    // `paused` debe lanzar PROJECT_INVALID_TRANSITION antes del
    // UPDATE. Si el guard desapareciera, el fix podría mutar
    // accidentalmente un proyecto pausado.
    expect(
      /if\s*\(before\.statusSituation\s*===\s*"paused"\)\s*\{[\s\S]*?throw\s+new\s+DomainError\(\s*"PROJECT_INVALID_TRANSITION"/.test(
        transitionBody,
      ),
    ).toBe(true);
  });

  it("guard de `cancelled` permanece en transitionStage (409)", () => {
    // `cancelled` es terminal absoluto (DEC-FUN-35); el fix NO
    // promueve situación en cancelados ni los deja pasar a `active`.
    expect(
      /if\s*\(before\.statusSituation\s*===\s*"cancelled"\)\s*\{[\s\S]*?throw\s+new\s+DomainError\(\s*"PROJECT_INVALID_TRANSITION"/.test(
        transitionBody,
      ),
    ).toBe(true);
  });

  it("la promoción a `active` está condicionada a `pending` (helper puro)", () => {
    // El helper discrimina: sólo `pending` se promueve. `paused`,
    // `active`, `completed`, `cancelled` retornan false.
    expect(shouldPromoteSituationOnTransitionStage("pending")).toBe(true);
    expect(shouldPromoteSituationOnTransitionStage("active")).toBe(false);
    expect(shouldPromoteSituationOnTransitionStage("paused")).toBe(false);
    expect(shouldPromoteSituationOnTransitionStage("cancelled")).toBe(false);
    expect(shouldPromoteSituationOnTransitionStage("completed")).toBe(false);
    // Defensa contra typos / valores fuera del enum.
    expect(shouldPromoteSituationOnTransitionStage("unknown")).toBe(false);
    expect(shouldPromoteSituationOnTransitionStage("")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5 · Regresión: completed (terminal) sigue bloqueando
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-30 · AC-5 · regresión completed sigue bloqueando", () => {
  it("`delivery` permanece como etapa terminal en canTransitionProjectStage", () => {
    // Un proyecto `completed` siempre está en `delivery` (lo fija
    // `closeTechnical` y `complete`). El helper debe rechazar
    // cualquier `transitionStage` desde `delivery`.
    expect(/case\s+"delivery":/.test(helpersSrc)).toBe(true);
    // La rama explícita de `delivery` rechaza cualquier transición
    // con `PROJECT_INVALID_TRANSITION` (no usa `break;` porque hace
    // `return { ok: false, ... }` directamente).
    const deliveryBlock =
      /case\s+"delivery":[\s\S]*?return\s*\{\s*ok:\s*false,\s*code:\s*"PROJECT_INVALID_TRANSITION"\s*\}\s*;/.exec(
        helpersSrc,
      );
    expect(deliveryBlock).not.toBeNull();
  });

  it("`closeTechnical` sigue siendo el ÚNICO path a `completed`+`delivery`", () => {
    // Verificamos que el cierre técnico sigue fijando ambos campos en
    // un solo UPDATE (no se ha duplicado ni movido a transitionStage).
    const closeBody = cierreSrc.slice(
      cierreSrc.indexOf("async function closeTechnical("),
    );
    expect(
      /statusStage:\s*"delivery",\s*statusSituation:\s*"completed"/.test(
        closeBody,
      ),
    ).toBe(true);
    // Y existe el audit `project.close_technical`.
    expect(/action:\s*"project\.close_technical"/.test(closeBody)).toBe(true);
  });

  it("el helper `isProjectSituationTerminal` reconoce `completed` y `cancelled`", () => {
    expect(isProjectSituationTerminal("completed")).toBe(true);
    expect(isProjectSituationTerminal("cancelled")).toBe(true);
    expect(isProjectSituationTerminal("active")).toBe(false);
    expect(isProjectSituationTerminal("pending")).toBe(false);
    expect(isProjectSituationTerminal("paused")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6 · closeTechnical / complete NO se ven afectados
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-30 · AC-6 · regresión cierre técnico intacto", () => {
  it("`complete` (proyectos.ts) sigue fijando delivery+completed atómicamente", () => {
    const completeStart = projectsSrc.indexOf("async function complete(");
    expect(completeStart).toBeGreaterThan(0);
    const completeEnd = projectsSrc.indexOf(
      "async function overrideHealth(",
      completeStart,
    );
    const completeBody = projectsSrc.slice(completeStart, completeEnd);
    expect(
      /statusSituation:\s*"completed",\s*statusStage:\s*"delivery"/.test(
        completeBody,
      ),
    ).toBe(true);
    // No se ha añadido una promoción condicional (no aplica al cierre).
    expect(/shouldPromoteSituationOnTransitionStage/.test(completeBody)).toBe(
      false,
    );
  });

  it("`closeTechnical` (cierre.ts) sigue fijando delivery+completed atómicamente", () => {
    const closeStart = cierreSrc.indexOf("async function closeTechnical(");
    expect(closeStart).toBeGreaterThan(0);
    const closeBody = cierreSrc.slice(closeStart);
    expect(
      /statusStage:\s*"delivery",\s*statusSituation:\s*"completed"/.test(
        closeBody,
      ),
    ).toBe(true);
    expect(/shouldPromoteSituationOnTransitionStage/.test(closeBody)).toBe(
      false,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7 · Helper puro discrimina correctamente
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-30 · AC-7 · helper puro shouldPromoteSituationOnTransitionStage", () => {
  it("promueve sólo `pending`", () => {
    expect(shouldPromoteSituationOnTransitionStage("pending")).toBe(true);
  });
  it("NO promueve `active` (transición normal entre etapas)", () => {
    expect(shouldPromoteSituationOnTransitionStage("active")).toBe(false);
  });
  it("NO promueve situaciones terminales ni laterales", () => {
    expect(shouldPromoteSituationOnTransitionStage("paused")).toBe(false);
    expect(shouldPromoteSituationOnTransitionStage("cancelled")).toBe(false);
    expect(shouldPromoteSituationOnTransitionStage("completed")).toBe(false);
  });
});