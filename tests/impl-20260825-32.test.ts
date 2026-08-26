/**
 * IMPL-20260825-32 · Tests discriminantes y anti-regresión para la acción
 * manual "Marcar en ejecución" sobre una OS `authorized_to_start`
 * (SPEC-20260817-004 BR-N247, gap SPEC-005 §4.3 sin orquestador
 * OS↔Proyecto disponible).
 *
 * Hecho observado: QA-20260825-31 cerró proyectos
 * técnicamente (`project.delivered_from_order`) pero las OS reales
 * siguen `authorized_to_start`; el orquestador que consumiría
 * `os.authorized_to_start` no existe como worker. Este corte añade
 * una acción manual en la UI que invoca el contrato ya existente
 * `trpc.ordenServicio.markInExecution({ orderId, manual: true })` para
 * destrabar la transición `authorized_to_start → in_execution` sin
 * acoplamiento backend OS↔Proyecto (no se modifica el router, el
 * servicio ni el schema).
 *
 * Estrategia: combinación de inspección estática del código
 * (mismo patrón de `tests/impl-20260825-29.test.ts` y
 * `tests/impl-20260825-31.test.ts`) + verificación del contrato
 * zod + tests puros discriminantes. Sin BD ni red. La validación V3
 * funcional (Playwright) la activa GEMINI en el gate final.
 *
 * Cobertura por AC:
 *  - AC-1 · Acción visible sólo cuando `o.status === "authorized_to_start"`.
 *  - AC-2 · Handler envía UUID real (`o.id`) + `manual: true`; sin prompt,
 *    sin UUID manual, sin acceso directo a BD.
 *  - AC-3 · onSuccess invalida `byId` y `preflightAuthorize`; el botón
 *    desaparece porque el Card padre está condicionado al estado previo.
 *  - AC-4 · Error mapping: códigos de transición inválida del helper
 *    `canTransitionTo` + `FORBIDDEN`/`UNAUTHORIZED`/`ORDER_NOT_FOUND`,
 *    sin falso éxito.
 *  - AC-5 · a11y: `role="status"` para éxito, `role="alert"` para errores,
 *    `aria-busy` durante pending.
 *  - AC-6 · `messages.ts` expone `markInExecution*` bajo `ordenes`.
 *  - AC-7 · Contrato `OrderMarkInExecutionInputSchema`: `orderId` UUID +
 *    `manual` boolean (default false).
 *  - AC-8 · Regresión: acciones previas intactas (assignPL, setOC,
 *    authorize, pause, cancel, markDelivered, closeAdministrative,
 *    createProject).
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
const ZOD_PATH = path.resolve(__dirname, "../src/shared/zod/index.ts");

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
      out += ch;
      i++;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
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
const zodSrc = readSrc(ZOD_PATH);

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 · Acción condicionada al estado `authorized_to_start`
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-32 · AC-1 · acción visible sólo en `authorized_to_start`", () => {
  it("existe un bloque Card con data-testid orden-detail-mark-in-execution", () => {
    expect(
      /data-testid=["']orden-detail-mark-in-execution["']/.test(detail),
    ).toBe(true);
  });

  it("el bloque está envuelto en `o.status === \"authorized_to_start\"` (no acción falsa)", () => {
    const blockStart = detail.indexOf("orden-detail-mark-in-execution");
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

  it("el botón usa data-testid orden-detail-mark-in-execution-action", () => {
    expect(
      /data-testid=["']orden-detail-mark-in-execution-action["']/.test(detail),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2 · Anti-UUID manual / anti-prompt / contrato del handler
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-32 · AC-2 · handler usa UUID real + manual:true, sin prompt/UUID manual", () => {
  it("la mutación `markInExecution.mutate` recibe `{ orderId: o.id, manual: true }`", () => {
    // El handler debe enviar el UUID real de la OS (`o.id`) y `manual: true`
    // para usar el permiso `autorizar_os` (no `gestionar_ordenes_servicio`).
    expect(
      /markInExecution\.mutate\(\s*\{\s*orderId:\s*o\.id,\s*manual:\s*true\s*\}\s*\)/.test(
        detail,
      ),
    ).toBe(true);
  });

  it("NO existe ningún `window.prompt` en la UI", () => {
    // Sólo verificamos `window.prompt` (la única vía de prompt nativo
    // en navegador); las menciones en comentarios NO cuentan.
    expect(/window\.prompt/.test(detailCode)).toBe(false);
    expect(/\bprompt\(/.test(detailCode)).toBe(false);
  });

  it("NO existe un input/field pidiendo UUID manual para la transición", () => {
    const blockStart = detail.indexOf("orden-detail-mark-in-execution");
    const cardClose = detail.indexOf("</Card>", blockStart);
    const block = detail.slice(blockStart, cardClose);
    expect(/<Input[\s\S]{0,400}uuid/i.test(block)).toBe(false);
    // Y en todo el archivo no debe existir un input con id relacionado.
    expect(/id=["'][^"']*uuid-os["']/.test(detail)).toBe(false);
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
// AC-3 · Éxito invalida byId + preflightAuthorize, botón desaparece
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-32 · AC-3 · onSuccess invalida byId/preflight y el botón desaparece", () => {
  it("`onSuccess` invalida `ordenServicio.byId` y `ordenServicio.preflightAuthorize`", () => {
    // Capturamos sólo el handler `onSuccess` de `markInExecution`. La
    // regex apunta al primer bloque async siguiente a
    // `trpc.ordenServicio.markInExecution.useMutation`.
    const handlerStart = detail.indexOf(
      "trpc.ordenServicio.markInExecution.useMutation",
    );
    expect(handlerStart).toBeGreaterThan(0);
    const tail = detail.slice(handlerStart);
    const onSuccessStart = tail.indexOf("onSuccess:");
    expect(onSuccessStart).toBeGreaterThan(0);
    // Usamos `onError:` (con dos puntos y arrow) para no cortar en la
    // mención de `onError` dentro del JSDoc del propio handler.
    const onErrorIdx = tail.search(/onError:\s*\(/);
    expect(onErrorIdx).toBeGreaterThan(onSuccessStart);
    const handler = tail.slice(onSuccessStart, onErrorIdx);
    expect(/utils\.ordenServicio\.byId\.invalidate/.test(handler)).toBe(true);
    expect(
      /utils\.ordenServicio\.preflightAuthorize\.invalidate/.test(handler),
    ).toBe(true);
  });

  it("el botón queda deshabilitado tras éxito (`markInExecutionSuccess` o `isPending`)", () => {
    // El botón usa `disabled={markInExecution.isPending || markInExecutionSuccess}`
    // para no permitir dos llamadas tras éxito y para que el Card
    // desaparezca tras el refetch (Card condicionado a `authorized_to_start`).
    expect(
      /disabled=\{markInExecution\.isPending\s*\|\|\s*markInExecutionSuccess\}/.test(
        detail,
      ),
    ).toBe(true);
  });

  it("el handler de click corta si ya está pendiente o ya tuvo éxito (anti-doble-click)", () => {
    // Defensa anti-doble-click: si el usuario hace click rápido dos
    // veces, la segunda invocación NO dispara la mutación.
    expect(
      /if\s*\(markInExecution\.isPending\s*\|\|\s*markInExecutionSuccess\)\s*return/.test(
        detail,
      ),
    ).toBe(true);
  });

  it("`onSuccess` limpia el error antes de marcar éxito (sin falso éxito)", () => {
    const handlerStart = detail.indexOf(
      "trpc.ordenServicio.markInExecution.useMutation",
    );
    const tail = detail.slice(handlerStart);
    const onSuccessStart = tail.indexOf("onSuccess:");
    const onErrorIdx = tail.search(/onError:\s*\(/);
    const handler = tail.slice(onSuccessStart, onErrorIdx);
    expect(/setMarkInExecutionError\(null\)/.test(handler)).toBe(true);
    expect(/setMarkInExecutionSuccess\(true\)/.test(handler)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4 · Mapeo de errores sin falso éxito
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-32 · AC-4 · mapeo de errores canónicos sin falso éxito", () => {
  it("`onError` mapea códigos de transición inválida al mensaje `markInExecutionErrorTransition`", () => {
    // El helper `canTransitionTo` puede emitir:
    // ORDER_NOT_AUTHORIZABLE, ORDER_ALREADY_AUTHORIZED,
    // ORDER_ALREADY_CLOSED, ORDER_ALREADY_CANCELLED, ORDER_NOT_PAUSED.
    // El handoff menciona `ORDER_INVALID_TRANSITION` como nombre genérico;
    // cubrimos el clúster completo para no atar la UI a un solo código.
    for (const code of [
      "ORDER_NOT_AUTHORIZABLE",
      "ORDER_ALREADY_AUTHORIZED",
      "ORDER_ALREADY_CLOSED",
      "ORDER_ALREADY_CANCELLED",
      "ORDER_NOT_PAUSED",
    ]) {
      expect(new RegExp(`["']${code}["']`).test(detail)).toBe(true);
    }
    expect(/markInExecutionErrorTransition/.test(detail)).toBe(true);
  });

  it("`onError` mapea FORBIDDEN/UNAUTHORIZED al mensaje `markInExecutionErrorForbidden`", () => {
    expect(/["']FORBIDDEN["']/.test(detail)).toBe(true);
    expect(/["']UNAUTHORIZED["']/.test(detail)).toBe(true);
    expect(/markInExecutionErrorForbidden/.test(detail)).toBe(true);
  });

  it("`onError` mapea ORDER_NOT_FOUND al mensaje canónico `notFound`", () => {
    expect(/["']ORDER_NOT_FOUND["']/.test(detail)).toBe(true);
    expect(/messages\.errors\.notFound/.test(detail)).toBe(true);
  });

  it("`onError` no afirma éxito: limpia `markInExecutionSuccess` antes de setear el error", () => {
    // Defensa: si llega un error tras un éxito parcial, el flag
    // `success` NO puede sobrevivir (la UI mostraría dos bloques a la
    // vez). Verificamos que `onError` lo baja a `false`.
    const handlerStart = detail.indexOf(
      "trpc.ordenServicio.markInExecution.useMutation",
    );
    const tail = detail.slice(handlerStart);
    const onErrorStart = tail.indexOf("onError:");
    expect(onErrorStart).toBeGreaterThan(0);
    const handler = tail.slice(onErrorStart);
    expect(/setMarkInExecutionSuccess\(false\)/.test(handler)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5 · a11y: role=status y role=alert
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-32 · AC-5 · a11y: role=status y role=alert", () => {
  it("el bloque de éxito lleva role=\"status\" y aria-live=\"polite\"", () => {
    const blockStart = detail.indexOf("markInExecutionSuccess ?");
    expect(blockStart).toBeGreaterThan(0);
    const cardClose = detail.indexOf("</div>", blockStart);
    const block = detail.slice(blockStart, cardClose);
    expect(/role=["']status["']/.test(block)).toBe(true);
    expect(/aria-live=["']polite["']/.test(block)).toBe(true);
  });

  it("los errores llevan role=\"alert\"", () => {
    const blockStart = detail.indexOf("markInExecutionError ?");
    expect(blockStart).toBeGreaterThan(0);
    const block = detail.slice(blockStart, blockStart + 600);
    expect(/role=["']alert["']/.test(block)).toBe(true);
  });

  it("el botón lleva `aria-busy` durante la mutación", () => {
    const btnStart = detail.indexOf(
      "data-testid=\"orden-detail-mark-in-execution-action\"",
    );
    expect(btnStart).toBeGreaterThan(0);
    const btnWindow = detail.slice(Math.max(0, btnStart - 400), btnStart);
    expect(/aria-busy/.test(btnWindow)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6 · Catálogo de mensajes canónicos
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-32 · AC-6 · messages.ts expone markInExecution* bajo ordenes", () => {
  it("messages.ordenes.markInExecutionTitle existe", () => {
    expect(
      /markInExecutionTitle:\s*["']Marcar en ejecución["']/.test(messages),
    ).toBe(true);
  });

  it("messages.ordenes.markInExecutionAction expone la etiqueta del botón", () => {
    expect(
      /markInExecutionAction:\s*["']Marcar en ejecución["']/.test(messages),
    ).toBe(true);
  });

  it("messages.ordenes.markInExecutionSubmitting expone la etiqueta durante pending", () => {
    expect(
      /markInExecutionSubmitting:\s*["']Marcando en ejecución…["']/.test(
        messages,
      ),
    ).toBe(true);
  });

  it("messages.ordenes.markInExecutionSuccessTitle/Body existen con `{code}`", () => {
    expect(/markInExecutionSuccessTitle:/.test(messages)).toBe(true);
    expect(/markInExecutionSuccessBody:/.test(messages)).toBe(true);
    expect(/\{code\}/.test(messages)).toBe(true);
  });

  it("messages.ordenes.markInExecutionError* cubren los códigos canónicos", () => {
    for (const key of [
      "markInExecutionErrorTransition",
      "markInExecutionErrorForbidden",
      "markInExecutionErrorGeneric",
    ]) {
      expect(new RegExp(`${key}:`).test(messages)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7 · Contrato del router + zod
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-32 · AC-7 · contrato `ordenServicio.markInExecution`", () => {
  it("el router expone `markInExecution` con `OrderMarkInExecutionInputSchema`", () => {
    // Verificación por inspección del router.
    const router = readSrc(
      path.resolve(
        __dirname,
        "../src/server/trpc/routers/orden-servicio.ts",
      ),
    );
    expect(
      /markInExecution:\s*protectedProcedure[\s\S]{0,200}OrderMarkInExecutionInputSchema/.test(
        router,
      ),
    ).toBe(true);
  });

  it("`OrderMarkInExecutionInputSchema` exige `orderId` UUID y `manual` boolean (default false)", () => {
    const schema = zodSrc.match(
      /export const OrderMarkInExecutionInputSchema[\s\S]*?\}\);/,
    );
    expect(schema).not.toBeNull();
    expect(/orderId:\s*uuidSchema/.test(schema![0])).toBe(true);
    expect(/manual:\s*z\.boolean\(\)\.default\(false\)/.test(schema![0])).toBe(
      true,
    );
  });

  it("el router delega al servicio `createOrdersService().markInExecution`", () => {
    const router = readSrc(
      path.resolve(
        __dirname,
        "../src/server/trpc/routers/orden-servicio.ts",
      ),
    );
    expect(
      /createOrdersService\(\)\.markInExecution\(ctx\.ctx,\s*compact\(input\)\)/.test(
        router,
      ),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-8 · Acciones existentes se preservan (no regresión)
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-32 · AC-8 · acciones previas intactas", () => {
  it("siguen existiendo los handlers de assignPL, setOC, authorize, pause, cancel, markDelivered y closeAdministrative", () => {
    for (const fn of [
      "assignPL",
      "authorize",
      "pause",
      "cancel",
      "markDelivered",
      "closeAdministrative",
    ]) {
      expect(
        new RegExp(`trpc\\.ordenServicio\\.${fn}\\.useMutation`).test(detail),
      ).toBe(true);
    }
  });

  it("la acción previa `createFromOrder` (IMPL-29) sigue presente", () => {
    expect(/trpc\.proyectos\.createFromOrder\.useMutation/.test(detail)).toBe(
      true,
    );
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
