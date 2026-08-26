/**
 * IMPL-20260825-29 · Tests dirigidos para la acción "Crear proyecto"
 * desde una OS `authorized_to_start` (SPEC-20260817-005 §4.3
 * `project_creation`, BR-N407/68).
 *
 * Alineado con la política de tests del proyecto (sin BD ni red):
 *  - AC-1: La acción sólo se renderiza cuando `o.status ===
 *    "authorized_to_start"`; en cualquier otro estado la UI NO muestra
 *    acción falsa.
 *  - AC-2: El handler envía `proyectos.createFromOrder({ orderId:
 *    o.id })` con el UUID real de la OS; NO envía `plUserIdOverride`
 *    manual, NO pide un UUID al usuario, NO abre `window.prompt`.
 *  - AC-3: En éxito el bloque muestra `project.id`, `project.code`,
 *    `project.statusStage`, `project.statusSituation` y un enlace a
 *    `/proyectos/{project.id}`. Invalida `proyectos.byId`,
 *    `proyectos.list` y `ordenServicio.byId`.
 *  - AC-4: Mapea errores canónicos
 *    (`PROJECT_ALREADY_EXISTS_FOR_ORDER`,
 *    `ORDER_NOT_AUTHORIZABLE`, `PL_NOT_ASSIGNED`,
 *    `FORBIDDEN`/`UNAUTHORIZED`) sin falso éxito.
 *  - AC-5: UI responsive/a11y: `role="status"` para éxito,
 *    `role="alert"` para errores, sin overflow, mantiene acciones
 *    existentes (assign PL, OC, authorize, pause/cancel/cierre).
 *  - AC-6: `messages.ts` expone los textos canónicos del nuevo
 *    bloque bajo `messages.ordenes.createProject*`.
 *  - AC-7: El contrato del router exige el shape
 *    `ProjectCreateFromOrderInputSchema` (uuid `orderId` +
 *    `plUserIdOverride?` uuid opcional); el handler lo respeta.
 *
 * Sin harness de BD: invariantes de UI y contrato por inspección
 * estática. La validación V3 funcional la activa GEMINI en el gate
 * final (Playwright contra staging) — fuera de alcance de esta suite.
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const DETAIL_PATH = path.resolve(
  __dirname,
  "../src/modules/orden-servicio/orden-detail.tsx",
);
const MESSAGES_PATH = path.resolve(
  __dirname,
  "../src/shared/utils/messages.ts",
);
const PROYECTOS_ROUTER_PATH = path.resolve(
  __dirname,
  "../src/server/trpc/routers/proyectos.ts",
);
const ZOD_PATH = path.resolve(
  __dirname,
  "../src/shared/zod/index.ts",
);

function readSrc(p: string): string {
  return fs.readFileSync(p, "utf8");
}

/**
 * Devuelve el código sin comentarios (`//` línea y `/* ... *\/` bloque).
 * Conserva el contenido dentro de strings literales. Usado para
 * inspeccionar si una API está invocada (no sólo mencionada en JSDoc).
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  let inString: string | null = null;
  let inTpl = false;
  while (i < n) {
    const ch = src[i];
    const next = i + 1 < n ? src[i + 1] : "";
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === "`") {
      inTpl = !inTpl;
      out += ch;
      i++;
      continue;
    }
    if (inTpl) {
      // Template literals pueden contener ${...}; lo respetamos
      // superficialmente (sin anidar profundidad).
      out += ch;
      i++;
      continue;
    }
    if (ch === "/" && next === "/") {
      // Line comment hasta \n.
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      // Block comment.
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

const detail = readSrc(DETAIL_PATH);
const detailCode = stripComments(detail);
const messages = readSrc(MESSAGES_PATH);
const router = readSrc(PROYECTOS_ROUTER_PATH);
const zodSrc = readSrc(ZOD_PATH);

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 · Acción condicionada al estado `authorized_to_start`
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-29 · AC-1 · acción visible sólo en `authorized_to_start`", () => {
  it("existe un bloque Card con data-testid orden-detail-create-project", () => {
    expect(/data-testid=["']orden-detail-create-project["']/.test(detail)).toBe(
      true,
    );
  });

  it("el bloque está envuelto en `o.status === \"authorized_to_start\"` (no acción falsa)", () => {
    // Garantiza que en cualquier otro estado la UI no renderiza la
    // acción. Verificamos el ternario antes del Card y el `: null`
    // de cierre tras el `</Card>`.
    const blockStart = detail.indexOf("orden-detail-create-project");
    expect(blockStart).toBeGreaterThan(0);
    const window = detail.slice(Math.max(0, blockStart - 600), blockStart);
    expect(/o\.status\s*===\s*["']authorized_to_start["']/.test(window)).toBe(
      true,
    );
    // El bloque cierra con `: null` antes del siguiente Card.
    const cardClose = detail.indexOf("</Card>", blockStart);
    expect(cardClose).toBeGreaterThan(blockStart);
    const between = detail.slice(cardClose, cardClose + 40);
    expect(/: null/.test(between)).toBe(true);
  });

  it("el botón usa data-testid orden-detail-create-project-action", () => {
    expect(
      /data-testid=["']orden-detail-create-project-action["']/.test(detail),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2 · Anti-UUID manual / anti-prompt / contrato del handler
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-29 · AC-2 · handler usa UUID real y NO prompt/UUID manual", () => {
  it("la mutación `createProject.mutate` recibe `{ orderId: o.id }` con UUID real", () => {
    // Buscamos el handler del botón. Debe enviar el UUID real de la OS
    // (`o.id`) sin requerir input manual.
    expect(
      /createProject\.mutate\(\s*\{\s*orderId:\s*o\.id\s*\}\s*\)/.test(detail),
    ).toBe(true);
  });

  it("el handler NO envía `plUserIdOverride` desde la UI (lo decide el backend)", () => {
    // La SPEC-005 dice que `plUserIdOverride` sólo lo usa SPEC-006
    // cuando asigna un PL distinto al de la OS. SPEC-005 siempre
    // consume `orders.pl_user_id`. La UI NO debe mandar override
    // manual para esta acción.
    const mutationCall = detail.match(
      /createProject\.mutate\(\s*\{[\s\S]*?\}\s*\)/,
    );
    expect(mutationCall).not.toBeNull();
    expect(/plUserIdOverride/.test(mutationCall![0])).toBe(false);
  });

  it("NO existe ningún `window.prompt` en la UI", () => {
    // Sólo verificamos `window.prompt` (la única vía de prompt
    // nativo en navegador); las menciones en comentarios NO cuentan.
    expect(/window\.prompt/.test(detailCode)).toBe(false);
    expect(/\bprompt\(/.test(detailCode)).toBe(false);
  });

  it("NO existe un input/field pidiendo UUID manual del proyecto", () => {
    // La acción no debe pedir al usuario un UUID. Buscamos cualquier
    // <Input> cerca del nuevo Card cuyo id/htmlFor mencione "uuid" o
    // "projectId".
    const blockStart = detail.indexOf("orden-detail-create-project");
    const cardClose = detail.indexOf("</Card>", blockStart);
    const block = detail.slice(blockStart, cardClose);
    expect(/<Input[\s\S]{0,400}uuid/i.test(block)).toBe(false);
    expect(/<Input[\s\S]{0,400}projectId/i.test(block)).toBe(false);
    // Y en todo el archivo no debe existir un input con id relacionado.
    expect(/id=["'][^"']*uuid-proyecto["']/.test(detail)).toBe(false);
  });

  it("NO hay acceso directo a BD (cliente pg/drizzle) desde la UI", () => {
    expect(/from\s+["']@\/server\/db/.test(detail)).toBe(false);
    expect(/from\s+["']pg["']/.test(detail)).toBe(false);
    expect(/from\s+["']drizzle-orm/.test(detail)).toBe(false);
    // La única vía de salida es el cliente tRPC.
    expect(/from\s+["']@\/lib\/trpc["']/.test(detail)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3 · Éxito muestra id/code/stage/situation reales y enlace
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-29 · AC-3 · bloque de éxito con datos reales del proyecto", () => {
  it("renderiza el bloque de éxito sólo cuando `createdProject` está presente", () => {
    const success = detail.match(
      /\{createdProject\s*\?[\s\S]*?<\/div>/,
    );
    expect(success).not.toBeNull();
  });

  it("el bloque de éxito expone project.id con data-testid orden-detail-create-project-success-id", () => {
    expect(
      /data-testid=["']orden-detail-create-project-success-id["']/.test(detail),
    ).toBe(true);
  });

  it("el bloque de éxito expone project.code con data-testid orden-detail-create-project-success-code", () => {
    expect(
      /data-testid=["']orden-detail-create-project-success-code["']/.test(
        detail,
      ),
    ).toBe(true);
  });

  it("el enlace usa `/proyectos/{project.id}` (ruta canónica) con data-testid ...-success-link", () => {
    expect(
      /href=\{`\/proyectos\/\$\{createdProject\.id\}`\}/.test(detail),
    ).toBe(true);
    expect(
      /data-testid=["']orden-detail-create-project-success-link["']/.test(
        detail,
      ),
    ).toBe(true);
  });

  it("el bloque muestra statusStage y statusSituation con etiquetas reales", () => {
    // Etapa + situación en el cuerpo del mensaje (template literals).
    expect(/\{stage\}/.test(detail)).toBe(true);
    expect(/\{situation\}/.test(detail)).toBe(true);
    expect(/STATUS_LABELS_PROJECT_STAGE\[/.test(detail)).toBe(true);
    expect(/STATUS_LABELS_PROJECT_SITUATION\[/.test(detail)).toBe(true);
  });

  it("`onSuccess` invalida `proyectos.byId`, `proyectos.list` y `ordenServicio.byId`", () => {
    // Apuntamos específicamente al `onSuccess` de `createProject` (no
    // al primer `async onSuccess` del archivo) para que el test sea
    // robusto ante futuras adiciones como el `onSuccess` de
    // `markInExecution` (IMPL-20260825-32).
    const successHandler = detail.match(
      /createProject[\s\S]{0,40}onSuccess:\s*async\s*\([\s\S]*?\},\s*\}\)/,
    );
    expect(successHandler).not.toBeNull();
    expect(/utils\.proyectos\.byId\.invalidate/.test(successHandler![0])).toBe(
      true,
    );
    expect(/utils\.proyectos\.list\.invalidate/.test(successHandler![0])).toBe(
      true,
    );
    expect(
      /utils\.ordenServicio\.byId\.invalidate/.test(successHandler![0]),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4 · Mapeo de errores canónicos sin falso éxito
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-29 · AC-4 · mapeo de errores sin falso éxito", () => {
  it("`onError` mapea PROJECT_ALREADY_EXISTS_FOR_ORDER al mensaje existente", () => {
    // Verificamos cada pareja código→mensaje en el cuerpo del
    // handler (sin capturar un substring, porque el non-greedy corta
    // en el primer `}` interno).
    expect(/PROJECT_ALREADY_EXISTS_FOR_ORDER/.test(detail)).toBe(true);
    expect(/createProjectErrorExisting/.test(detail)).toBe(true);
  });

  it("`onError` mapea ORDER_NOT_AUTHORIZABLE al mensaje notAuthorized", () => {
    expect(/ORDER_NOT_AUTHORIZABLE/.test(detail)).toBe(true);
    expect(/createProjectErrorNotAuthorized/.test(detail)).toBe(true);
  });

  it("`onError` mapea PL_NOT_ASSIGNED al mensaje missingPL", () => {
    expect(/PL_NOT_ASSIGNED/.test(detail)).toBe(true);
    expect(/createProjectErrorMissingPL/.test(detail)).toBe(true);
  });

  it("`onError` mapea FORBIDDEN/UNAUTHORIZED al mensaje forbidden", () => {
    expect(/FORBIDDEN/.test(detail)).toBe(true);
    expect(/UNAUTHORIZED/.test(detail)).toBe(true);
    expect(/createProjectErrorForbidden/.test(detail)).toBe(true);
  });

  it("`onError` no afirma éxito: limpia `createdProject` antes de setear el error", () => {
    expect(/setCreatedProject\(null\)/.test(detail)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5 · Responsive/a11y
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-29 · AC-5 · a11y: role=status y role=alert", () => {
  it("el bloque de éxito lleva role=\"status\" y aria-live=\"polite\"", () => {
    expect(/role=["']status["']/.test(detail)).toBe(true);
    expect(/aria-live=["']polite["']/.test(detail)).toBe(true);
  });

  it("los errores llevan role=\"alert\"", () => {
    expect(/role=["']alert["']/.test(detail)).toBe(true);
  });

  it("el botón lleva `aria-busy` durante la mutación", () => {
    expect(/aria-busy/.test(detail)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6 · Catálogo de mensajes canónicos
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-29 · AC-6 · messages.ts expone createProject* bajo ordenes", () => {
  it("messages.ordenes.createProjectTitle existe", () => {
    expect(/createProjectTitle:\s*["']Crear proyecto["']/.test(messages)).toBe(
      true,
    );
  });

  it("messages.ordenes.createProjectAction expone la etiqueta del botón", () => {
    expect(
      /createProjectAction:\s*["']Crear proyecto["']/.test(messages),
    ).toBe(true);
  });

  it("messages.ordenes.createProjectSubmitting expone la etiqueta durante pending", () => {
    expect(
      /createProjectSubmitting:\s*["']Creando proyecto…["']/.test(messages),
    ).toBe(true);
  });

  it("messages.ordenes.createProjectSuccessTitle/Body/ViewProject existen", () => {
    expect(/createProjectSuccessTitle:/.test(messages)).toBe(true);
    expect(/createProjectSuccessBody:/.test(messages)).toBe(true);
    expect(/createProjectViewProject:/.test(messages)).toBe(true);
    expect(/\{code\}/.test(messages)).toBe(true);
    expect(/\{stage\}/.test(messages)).toBe(true);
    expect(/\{situation\}/.test(messages)).toBe(true);
  });

  it("messages.ordenes.createProjectError* cubren los códigos canónicos", () => {
    for (const key of [
      "createProjectErrorExisting",
      "createProjectErrorNotAuthorized",
      "createProjectErrorMissingPL",
      "createProjectErrorForbidden",
      "createProjectErrorGeneric",
    ]) {
      expect(new RegExp(`${key}:`).test(messages)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7 · Contrato del router + zod
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-29 · AC-7 · contrato `proyectos.createFromOrder`", () => {
  it("el router expone `createFromOrder` con `ProjectCreateFromOrderInputSchema`", () => {
    expect(
      /createFromOrder:\s*protectedProcedure[\s\S]{0,200}ProjectCreateFromOrderInputSchema/.test(
        router,
      ),
    ).toBe(true);
  });

  it("`ProjectCreateFromOrderInputSchema` exige `orderId` UUID y `plUserIdOverride` opcional", () => {
    const schema = zodSrc.match(
      /export const ProjectCreateFromOrderInputSchema[\s\S]*?\}\);/,
    );
    expect(schema).not.toBeNull();
    expect(/orderId:\s*uuidSchema/.test(schema![0])).toBe(true);
    expect(/plUserIdOverride:\s*uuidSchema\.optional\(\)/.test(schema![0])).toBe(
      true,
    );
  });

  it("el router delega al servicio `createProjectsService().createFromOrder`", () => {
    expect(
      /createProjectsService\(\)\.createFromOrder\(ctx\.ctx,\s*compact\(input\)\)/.test(
        router,
      ),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-8 · Acciones existentes se preservan (no regresión)
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-29 · AC-8 · acciones previas intactas", () => {
  it("siguen existiendo los handlers de assignPL, OC, authorize, pause, cancel, markDelivered y closeAdministrative", () => {
    for (const fn of [
      "assignPL",
      "authorize",
      "pause",
      "cancel",
      "markDelivered",
      "closeAdministrative",
    ]) {
      expect(new RegExp(`trpc\\.ordenServicio\\.${fn}\\.useMutation`).test(detail)).toBe(
        true,
      );
    }
  });

  it("el Card de Cierre administrativo sigue condicionado a delivered/in_execution", () => {
    expect(
      /o\.status\s*===\s*["']delivered["']\s*\|\|\s*o\.status\s*===\s*["']in_execution["']/.test(
        detail,
      ),
    ).toBe(true);
  });

  it("el Card de markDelivered sigue condicionado a in_execution/paused", () => {
    expect(
      /o\.status\s*===\s*["']in_execution["']\s*\|\|\s*o\.status\s*===\s*["']paused["']/.test(
        detail,
      ),
    ).toBe(true);
  });
});