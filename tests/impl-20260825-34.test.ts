/**
 * IMPL-20260825-34 · Tests discriminantes y anti-regresión para la acción
 * "Crear factura borrador" desde una OS `delivered` o `closed`
 * (SPEC-20260817-007 BR-N301/BR-N218; SPEC-20260817-004 OS).
 *
 * Hecho observado: QA-20260825-33 PASS dejó OS reales en `delivered`;
 * el contrato `facturacion.buildFromOrder` ya exige OS + cliente,
 * copia total/conceptos y deja la factura en estado `borrador`
 * (NO timbra, NO cobra). Este corte hace operable la acción desde
 * `orden-detail.tsx` sin tocar schema/router/service:
 *  - Card visible sólo cuando `o.status === "delivered"` o
 *    `o.status === "closed"`.
 *  - Diálogo accesible con fecha de vencimiento (default hoy+7d) y
 *    descripción; valor unitario derivado de `o.soldTotalCents` (qty 1).
 *  - Éxito expone `invoice.id/code/status=borrador` y totales
 *    (`role="status"`) + enlace a `/facturacion`.
 *  - Errores canónicos (`FORBIDDEN`/`UNAUTHORIZED`,
 *    `ORDER_NOT_FOUND`/`CLIENT_NOT_FOUND`, `ORDER_NOT_DELIVERABLE`,
 *    `INVOICE_BUILD_INVALID`) caen en `role="alert"`.
 *  - Sin `window.prompt`, sin UUID manual, sin acceso directo a BD.
 *  - Validación de vigencia en cliente: dueDate >= hoy y >= hoy+7d;
 *    valor unitario no negativo.
 *
 * Estrategia: inspección estática del código (mismo patrón de
 * `tests/impl-20260825-32.test.ts`) + verificación del contrato zod
 * (`InvoiceBuildInputSchema` exige `orderId` UUID, `dueDate` YYYY-MM-DD,
 * `concept[]` con `claveProdServ`+`descripcion`+`cantidad`+
 * `valorUnitarioCents` no negativos). Sin BD ni red. V3 Playwright la
 * activa GEMINI en el gate final.
 *
 * Cobertura por AC:
 *  - AC-1 · Acción visible sólo en `delivered`/`closed` (no acción falsa).
 *  - AC-2 · Handler usa UUID real (`id`), `o.soldTotalCents` y qty 1;
 *    sin prompt, sin UUID manual, sin acceso directo a BD.
 *  - AC-3 · Diálogo accesible (`role="dialog"`, `aria-modal`,
 *    `aria-label`), formulario con `Label`+`Input` (dueDate/descripción/
 *    valor unitario), default >=7d, responsive.
 *  - AC-4 · onSuccess pinta id/code/status=borrador/total + enlace a
 *    `/facturacion` con `role="status"` y `aria-live="polite"`.
 *  - AC-5 · onError mapea `FORBIDDEN`/`UNAUTHORIZED`,
 *    `ORDER_NOT_FOUND`/`CLIENT_NOT_FOUND`,
 *    `ORDER_NOT_DELIVERABLE`/`INVOICE_BUILD_INVALID` y cae en
 *    `role="alert"` (sin falso éxito).
 *  - AC-6 · `messages.ts` expone `createInvoice*` bajo `ordenes`.
 *  - AC-7 · Contrato `InvoiceBuildInputSchema`: `orderId` UUID,
 *    `dueDate` YYYY-MM-DD, `concept[]` con campos canónicos y
 *    `valorUnitarioCents` no negativo.
 *  - AC-8 · No regresión: cards previas intactas (assignPL, setOC,
 *    authorize, pause, cancel, markDelivered, markInExecution,
 *    createProject, closeAdmin).
 *
 * ─── Intento 2 (QA-20260825-34 FAIL) ───────────────────────────────────────
 *  - AC-9 · Cadena `clientes.fiscal.upsert` ANTES de
 *    `facturacion.buildFromOrder`; si upsert falla, build NO se
 *    llama; errores de upsert caen en `createInvoiceError` (visible
 *    fuera del diálogo).
 *  - AC-10 · Mapeo `INVOICE_FISCAL_DATA_REQUIRED` → mensaje canónico
 *    `createInvoiceFiscalMissing` con `role="alert"` arriba del Card.
 *  - AC-11 · Valor unitario derivado del SUBTOTAL NETO
 *    (`quote.subtotalCents`); no se usa `soldTotalCents` (bruto) como
 *    `valorUnitarioCents`. Si la cotización no expone subtotal, fallback
 *    a `soldTotalCents` con warning visible.
 *  - AC-12 · Validación cliente: RFC formato
 *    `^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$`, RFC+razón+regimen obligatorios;
 *    no se llama upsert ni build si faltan.
 *  - AC-13 · Banner de error `role="alert"` con `z-[60]` (por encima
 *    del overlay `z-50` del diálogo); el error NO queda ocluido.
 *  - AC-14 · Diálogo captura RFC, razón social, régimen y CFDI use
 *    pre-rellenados de `clientes.fiscal.getForClient`.
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
const ROUTER_PATH = path.resolve(
  __dirname,
  "../src/server/trpc/routers/facturacion.ts",
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
const routerSrc = readSrc(ROUTER_PATH);

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 · Acción condicionada al estado `delivered` o `closed`
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-34 · AC-1 · acción visible sólo en `delivered` o `closed`", () => {
  it("existe un bloque Card con data-testid orden-detail-create-invoice", () => {
    expect(
      /data-testid=["']orden-detail-create-invoice["']/.test(detail),
    ).toBe(true);
  });

  it("el bloque está envuelto en `o.status === \"delivered\" || o.status === \"closed\"`", () => {
    const blockStart = detail.indexOf("orden-detail-create-invoice");
    expect(blockStart).toBeGreaterThan(0);
    const window = detail.slice(Math.max(0, blockStart - 600), blockStart);
    expect(
      /o\.status\s*===\s*["']delivered["']\s*\|\|\s*o\.status\s*===\s*["']closed["']/.test(
        window,
      ),
    ).toBe(true);
    // El bloque cierra con `: null` antes del siguiente fragmento.
    const cardClose = detail.indexOf("</Card>", blockStart);
    expect(cardClose).toBeGreaterThan(blockStart);
    const between = detail.slice(cardClose, cardClose + 40);
    expect(/: null/.test(between)).toBe(true);
  });

  it("NO se muestra acción para otros estados (no hay otro bloque sin condición)", () => {
    // El único bloque que abre el diálogo debe estar condicionado a
    // delivered/closed. Verificamos que no hay un componente
    // CreateInvoiceDraftDialog renderizado fuera de esa condición.
    const dialogRenders = detail.match(
      /<CreateInvoiceDraftDialog[\s\S]*?\/>/g,
    );
    expect(dialogRenders).not.toBeNull();
    expect(dialogRenders!.length).toBe(1);
  });

  it("el botón usa data-testid orden-detail-create-invoice-action", () => {
    expect(
      /data-testid=["']orden-detail-create-invoice-action["']/.test(detail),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2 · Anti-UUID manual / anti-prompt / contrato del handler
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-34 · AC-2 · handler usa UUID real + soldTotalCents, sin prompt/UUID manual", () => {
  it("la mutación `buildInvoiceDraft.mutate` envía orderId, dueDate y concept con campos canónicos", () => {
    // Verificamos por bloques para no caer en regex frágiles. El
    // bloque `mutate({...})` debe contener `orderId: id` (UUID real
    // de la OS), `dueDate: input.dueDate` y `concept: [...]` con
    // `claveProdServ`, `descripcion`, `cantidad: 1` y
    // `valorUnitarioCents: input.valorUnitarioCents`.
    const mutateMatch = detailCode.match(
      /buildInvoiceDraft\.mutate\(\{[\s\S]*?\}\)/,
    );
    expect(mutateMatch).not.toBeNull();
    const block = mutateMatch![0];
    expect(/orderId:\s*id/.test(block)).toBe(true);
    expect(/dueDate:\s*input\.dueDate/.test(block)).toBe(true);
    expect(/claveProdServ:\s*["']84111506["']/.test(block)).toBe(true);
    expect(/cantidad:\s*1,/.test(block)).toBe(true);
    expect(/valorUnitarioCents:\s*input\.valorUnitarioCents/.test(block)).toBe(
      true,
    );
  });

  it("la UI deriva el valor unitario inicial del SUBTOTAL NETO de la cotización (no de `soldTotalCents`, que es bruto)", () => {
    // IMPL-20260825-34 (intento 2) · Anti doble-IVA. `o.soldTotalCents`
    // es el total bruto post-IVA; pasarlo como `valorUnitarioCents`
    // provocaría que `buildCfdiConcept` añadiera un segundo 16%.
    // Por eso la UI consulta `comercial.cotizaciones.byId({ id: o.cotizacionId })`
    // y usa `quote.subtotalCents` (neto) como valor unitario. Si la
    // cotización no expone `subtotalCents`, se hace fallback a
    // `soldTotalCents` con warning visible (no silencioso).
    expect(
      /trpc\.comercial\.cotizaciones\.byId\.useQuery\(\s*\{\s*id:\s*o\.cotizacionId\s*\}/.test(
        detailCode,
      ),
    ).toBe(true);
    // Subtotal neto explícitamente preferido sobre el total bruto.
    expect(/quoteQuery\.data\?\.subtotalCents/.test(detail)).toBe(true);
    expect(/invoiceUnitPriceCents\.value/.test(detail)).toBe(true);
    expect(
      /unitPriceCents=\{invoiceUnitPriceCents\.value\}/.test(detail),
    ).toBe(true);
    // El diálogo ya NO recibe `unitPriceCents={o.soldTotalCents}`
    // (eso era el camino del intento 1 que producía doble IVA).
    expect(/unitPriceCents=\{o\.soldTotalCents\}/.test(detail)).toBe(false);
    // NO hay un input con id="*-uuid-*"".
    expect(/id=["'][^"']*-uuid-os["']/.test(detail)).toBe(false);
    expect(/id=["'][^"']*-order-id["']/.test(detail)).toBe(false);
  });

  it("NO existe ningún `window.prompt` ni `prompt(` en la UI", () => {
    expect(/window\.prompt/.test(detailCode)).toBe(false);
    expect(/\bprompt\(/.test(detailCode)).toBe(false);
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
// AC-3 · Diálogo accesible + validación de vigencia + responsive
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-34 · AC-3 · diálogo accesible con validación de vigencia", () => {
  it("el diálogo expone `role=\"dialog\"`, `aria-modal=\"true\"` y `aria-label`", () => {
    expect(
      /role=["']dialog["']/.test(detail),
    ).toBe(true);
    expect(
      /aria-modal=["']true["']/.test(detail),
    ).toBe(true);
    expect(
      /aria-label=\{messages\.ordenes\.createInvoiceDialogTitle\}/.test(
        detail,
      ),
    ).toBe(true);
  });

  it("el formulario tiene labels asociados (Label + htmlFor) para dueDate/descripción/valor", () => {
    for (const id of ["ci-due-date", "ci-descripcion", "ci-valor"]) {
      expect(new RegExp(`id=["']${id}["']`).test(detail)).toBe(true);
      expect(new RegExp(`htmlFor=["']${id}["']`).test(detail)).toBe(true);
    }
  });

  it("el default `dueDate` es >= 7 días desde hoy (UTC, YYYY-MM-DD)", () => {
    // El default se calcula con `d.setUTCDate(d.getUTCDate() + 7)`
    // y se devuelve con `toISOString().slice(0,10)`. Verificamos
    // que el código usa esa expresión literal.
    expect(
      /d\.setUTCDate\(d\.getUTCDate\(\)\s*\+\s*7\)/.test(detail),
    ).toBe(true);
    expect(/toISOString\(\)\.slice\(0,\s*10\)/.test(detail)).toBe(true);
  });

  it("la validación de vigencia rechaza dueDate en el pasado o <hoy+7d", () => {
    expect(
      /createInvoiceErrorDueDatePast/.test(detail),
    ).toBe(true);
    expect(
      /createInvoiceErrorDueDateMin/.test(detail),
    ).toBe(true);
    // Se compara en milisegundos y exige `due < min`.
    expect(/min\.setUTCDate\(min\.getUTCDate\(\)\s*\+\s*7\)/.test(detail)).toBe(
      true,
    );
  });

  it("la validación rechaza valor unitario negativo", () => {
    expect(/createInvoiceErrorMontoNegativo/.test(detail)).toBe(true);
    expect(/input\.valorUnitarioCents\s*<\s*0/.test(detail)).toBe(true);
  });

  it("diálogo responsive: usa `items-end sm:items-center` y ancho máximo acotado", () => {
    expect(/items-end[\s\S]*?sm:items-center/.test(detail)).toBe(true);
    expect(/max-w-lg overflow-y-auto/.test(detail)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4 · Éxito expone id/code/status/total + enlace a /facturacion (role=status)
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-34 · AC-4 · éxito expone id/code/status/total + link (role=status)", () => {
  it("`onSuccess` pinta id/code/status con data-testid explícitos", () => {
    for (const tag of [
      "orden-detail-create-invoice-success-id",
      "orden-detail-create-invoice-success-code",
      "orden-detail-create-invoice-success-status",
    ]) {
      expect(new RegExp(`data-testid=["']${tag}["']`).test(detail)).toBe(true);
    }
  });

  it("`onSuccess` accede a `preview.invoice` (no al top-level) y muestra totales", () => {
    // El router devuelve InvoicePreviewDTO con shape
    // `{ invoice: InvoiceDTO, client, fiscalConfig }`; la UI debe
    // tomar `preview.invoice.*`. Defensa anti-falso-éxito: si no
    // viene `invoice`, se mapea a error genérico y NO se pinta
    // éxito con id inventado.
    expect(/const invoice = preview\?\.invoice/.test(detail)).toBe(true);
    expect(/if\s*\(!invoice\)/.test(detail)).toBe(true);
    expect(
      /setCreateInvoiceError\(messages\.ordenes\.createInvoiceErrorGeneric\)/.test(
        detail,
      ),
    ).toBe(true);
    expect(/invoice\.totalCents/.test(detail)).toBe(true);
  });

  it("hay enlace a `/facturacion` con `role=\"status\"` y `aria-live=\"polite\"`", () => {
    expect(/href=["']\/facturacion["']/.test(detail)).toBe(true);
    // Tomamos el bloque que contiene `data-testid="orden-detail-create-invoice-success"`
    // y nos desplazamos hacia atrás para incluir el `role="status"` del `<div>` padre.
    const successBlockStart = detail.indexOf(
      'data-testid="orden-detail-create-invoice-success"',
    );
    expect(successBlockStart).toBeGreaterThan(0);
    const window = detail.slice(
      Math.max(0, successBlockStart - 200),
      successBlockStart + 2000,
    );
    expect(/role=["']status["']/.test(window)).toBe(true);
    expect(/aria-live=["']polite["']/.test(window)).toBe(true);
  });

  it("`onSuccess` invalida `facturacion.list` y `facturacion.byId`", () => {
    // Extraemos el handler `onSuccess` por delimitadores estructurales:
    // desde el primer `onSuccess: async` hasta el cierre `},` del
    // options object. Usamos un método de bloques balanceados simple.
    const handlerStart = detail.indexOf(
      "trpc.facturacion.buildFromOrder.useMutation",
    );
    expect(handlerStart).toBeGreaterThan(0);
    const tail = detail.slice(handlerStart);
    const onSuccessStart = tail.indexOf("onSuccess:");
    expect(onSuccessStart).toBeGreaterThan(0);
    // Después de `onSuccess: async (...) => {` debe cerrar con `},`
    // (el siguiente handler o cierre del options object). Buscamos el
    // cierre del bloque async usando balanceo de llaves (simple, sin
    // strings anidados: la inspección aquí es estructural y los
    // strings no contienen llaves balanceadas en este código).
    let depth = 0;
    let i = onSuccessStart;
    let startBlock = -1;
    while (i < tail.length) {
      const ch = tail[i];
      if (ch === "{") {
        if (startBlock === -1) startBlock = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (startBlock !== -1 && depth === 0) {
          // captura hasta la llave de cierre + coma de options.
          break;
        }
      }
      i++;
    }
    expect(startBlock).toBeGreaterThan(0);
    const handler = tail.slice(startBlock, i + 1);
    expect(/utils\.facturacion\.list\.invalidate/.test(handler)).toBe(true);
    expect(/utils\.facturacion\.byId\.invalidate/.test(handler)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5 · Errores canónicos mapeados a role=alert, sin falso éxito
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-34 · AC-5 · errores canónicos mapeados (role=alert)", () => {
  it("`onError` mapea FORBIDDEN/UNAUTHORIZED al mensaje `createInvoiceErrorForbidden`", () => {
    expect(/["']FORBIDDEN["']/.test(detail)).toBe(true);
    expect(/["']UNAUTHORIZED["']/.test(detail)).toBe(true);
    expect(/createInvoiceErrorForbidden/.test(detail)).toBe(true);
  });

  it("`onError` mapea ORDER_NOT_FOUND/CLIENT_NOT_FOUND al mensaje `createInvoiceErrorNotFound`", () => {
    expect(/["']ORDER_NOT_FOUND["']/.test(detail)).toBe(true);
    expect(/["']CLIENT_NOT_FOUND["']/.test(detail)).toBe(true);
    expect(/createInvoiceErrorNotFound/.test(detail)).toBe(true);
  });

  it("`onError` mapea ORDER_NOT_DELIVERABLE/INVOICE_BUILD_INVALID al mensaje `createInvoiceErrorTransition`", () => {
    expect(/["']ORDER_NOT_DELIVERABLE["']/.test(detail)).toBe(true);
    expect(/["']INVOICE_BUILD_INVALID["']/.test(detail)).toBe(true);
    expect(/createInvoiceErrorTransition/.test(detail)).toBe(true);
  });

  it("`onError` mapea cualquier otro error a `createInvoiceErrorGeneric`", () => {
    expect(/createInvoiceErrorGeneric/.test(detail)).toBe(true);
    expect(
      /err\.message\s*\?\?\s*messages\.ordenes\.createInvoiceErrorGeneric/.test(
        detail,
      ),
    ).toBe(true);
  });

  it("`onError` limpia el éxito previo antes de setear el error (sin falso éxito)", () => {
    const handlerStart = detail.indexOf(
      "trpc.facturacion.buildFromOrder.useMutation",
    );
    const tail = detail.slice(handlerStart);
    const onErrorStart = tail.indexOf("onError:");
    expect(onErrorStart).toBeGreaterThan(0);
    const handler = tail.slice(onErrorStart);
    expect(/setCreatedInvoice\(null\)/.test(handler)).toBe(true);
  });

  it("los errores UI llevan `role=\"alert\"`", () => {
    // IMPL-20260825-34 (intento 2) · El banner de error se renderiza
    // FUERA del Card (arriba del Card) con `z-[60]` para quedar
    // visible por encima del overlay del diálogo (`z-50`). El
    // detalle local de campo (validación de formulario) sigue
    // dentro del diálogo con su propio `role="alert"`.
    // Banner externo: aparece con guard `createInvoiceError && (o.status === "delivered" || o.status === "closed")`
    expect(/createInvoiceError\s*&&\s*\(o\.status/.test(detail)).toBe(true);
    expect(/role=["']alert["']/.test(detail)).toBe(true);
    expect(/aria-live=["']assertive["']/.test(detail)).toBe(true);
    // `z-[60]` para quedar encima del overlay (`z-50`).
    expect(/z-\[60\]/.test(detail)).toBe(true);
    // El banner referencia el data-testid canónico
    // `orden-detail-create-invoice-error`.
    expect(
      /data-testid=["']orden-detail-create-invoice-error["']/.test(detail),
    ).toBe(true);
    // Errores de validación del diálogo también llevan role=alert.
    const dialogErrStart = detail.indexOf(
      "orden-detail-create-invoice-dialog-error",
    );
    expect(dialogErrStart).toBeGreaterThan(0);
    const dialogErr = detail.slice(
      Math.max(0, dialogErrStart - 300),
      dialogErrStart,
    );
    expect(/role=["']alert["']/.test(dialogErr)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6 · Catálogo de mensajes canónicos
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-34 · AC-6 · messages.ts expone createInvoice* bajo ordenes", () => {
  it("messages.ordenes.createInvoiceTitle existe", () => {
    expect(
      /createInvoiceTitle:\s*["']Crear factura borrador["']/.test(messages),
    ).toBe(true);
  });

  it("messages.ordenes.createInvoiceAction expone la etiqueta del botón", () => {
    expect(
      /createInvoiceAction:\s*["']Crear factura borrador["']/.test(messages),
    ).toBe(true);
  });

  it("messages.ordenes.createInvoiceSubmitting expone la etiqueta durante pending", () => {
    expect(
      /createInvoiceSubmitting:\s*["']Creando factura…["']/.test(messages),
    ).toBe(true);
  });

  it("messages.ordenes.createInvoiceSuccessTitle/Body existen con `{code}`", () => {
    expect(/createInvoiceSuccessTitle:/.test(messages)).toBe(true);
    expect(/createInvoiceSuccessBody:/.test(messages)).toBe(true);
    expect(/\{code\}/.test(messages)).toBe(true);
  });

  it("messages.ordenes.createInvoiceError* cubren los códigos canónicos", () => {
    for (const key of [
      "createInvoiceErrorDueDatePast",
      "createInvoiceErrorDueDateMin",
      "createInvoiceErrorMontoNegativo",
      "createInvoiceErrorTransition",
      "createInvoiceErrorForbidden",
      "createInvoiceErrorNotFound",
      "createInvoiceErrorGeneric",
    ]) {
      expect(new RegExp(`${key}:`).test(messages)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7 · Contrato del router + zod
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-34 · AC-7 · contrato `facturacion.buildFromOrder`", () => {
  it("el router expone `buildFromOrder` con `InvoiceBuildInputSchema`", () => {
    expect(
      /buildFromOrder:\s*protectedProcedure[\s\S]{0,200}InvoiceBuildInputSchema/.test(
        routerSrc,
      ),
    ).toBe(true);
  });

  it("`InvoiceBuildInputSchema` exige `orderId` UUID, `dueDate` YYYY-MM-DD y `concept[]` con campos canónicos", () => {
    const schema = zodSrc.match(
      /export const InvoiceBuildInputSchema[\s\S]*?\}\);/,
    );
    expect(schema).not.toBeNull();
    expect(/orderId:\s*uuidSchema/.test(schema![0])).toBe(true);
    expect(
      /dueDate:\s*z\.string\(\)\.regex\(\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/,\s*["']Fecha debe ser YYYY-MM-DD["']\)/.test(
        schema![0],
      ),
    ).toBe(true);
    expect(/concept:\s*z\.array\(CfdiConceptLineInputSchema\)/.test(schema![0])).toBe(
      true,
    );
  });

  it("`CfdiConceptLineInputSchema` exige `claveProdServ`, `descripcion`, `cantidad` > 0 y `valorUnitarioCents` no negativo", () => {
    const schema = zodSrc.match(
      /export const CfdiConceptLineInputSchema[\s\S]*?\}\);/,
    );
    expect(schema).not.toBeNull();
    expect(/claveProdServ:\s*z\.string\(\)\.min\(1\)\.max\(20\)/.test(schema![0])).toBe(
      true,
    );
    expect(/descripcion:\s*z\.string\(\)\.min\(1\)\.max\(2000\)/.test(schema![0])).toBe(
      true,
    );
    expect(/cantidad:\s*z\.number\(\)\.int\(\)\.positive\(\)/.test(schema![0])).toBe(
      true,
    );
    expect(
      /valorUnitarioCents:\s*z\.number\(\)\.int\(\)\.nonnegative\(\)/.test(
        schema![0],
      ),
    ).toBe(true);
  });

  it("el router NO se modifica en este corte (prefijo de router intacto)", () => {
    // Verifica que la firma de `buildFromOrder` usa el schema y el
    // servicio correctos (defensa contra edición accidental).
    expect(
      /InvoiceBuildInputSchema[\s\S]{0,300}\.mutation\([\s\S]{0,500}svc\.buildFromOrder\(ctx\.ctx,\s*\{[\s\S]{0,400}orderId: input\.orderId/.test(
        routerSrc,
      ),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-9 (intento 2) · Cadena upsert → build; build NO se llama si upsert falla
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-34 · AC-9 · cadena upsert→build; build no se llama si upsert falla", () => {
  it("existe `fiscalUpsert = trpc.clientes.fiscal.upsert.useMutation`", () => {
    expect(
      /trpc\.clientes\.fiscal\.upsert\.useMutation/.test(detail),
    ).toBe(true);
  });

  it("existen queries `cotizaciones.byId` y `clientes.fiscal.getForClient`", () => {
    expect(
      /trpc\.comercial\.cotizaciones\.byId\.useQuery/.test(detail),
    ).toBe(true);
    expect(
      /trpc\.clientes\.fiscal\.getForClient\.useQuery/.test(detail),
    ).toBe(true);
  });

  it("el handler del diálogo llama `fiscalUpsert.mutate` ANTES de `buildInvoiceDraft.mutate`", () => {
    // La cadena es upsert → build. Extraemos el bloque del handler
    // `onSubmit` por balanceo de llaves (sin strings anidados con
    // llaves balanceadas en este código).
    const dialogStart = detail.indexOf(
      "function CreateInvoiceDraftDialog",
    );
    expect(dialogStart).toBeGreaterThan(0);
    // El handler del padre está en el JSX, antes del componente.
    // Buscamos el bloque `onSubmit={async (input) => { ... }}`.
    const submitArrow = detail.indexOf(
      "onSubmit={async (input) => {",
    );
    expect(submitArrow).toBeGreaterThan(0);
    let depth = 0;
    let startBlock = -1;
    let i = submitArrow;
    while (i < detail.length) {
      const ch = detail[i];
      if (ch === "{") {
        if (startBlock === -1) startBlock = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (startBlock !== -1 && depth === 0) {
          break;
        }
      }
      i++;
    }
    expect(startBlock).toBeGreaterThan(0);
    const handler = detail.slice(startBlock, i + 1);
    // Orden estricto: `fiscalUpsert.mutate(...)` aparece antes que
    // `buildInvoiceDraft.mutate(...)`.
    const upsertPos = handler.indexOf("fiscalUpsert.mutate(");
    const buildPos = handler.indexOf("buildInvoiceDraft.mutate(");
    expect(upsertPos).toBeGreaterThan(0);
    expect(buildPos).toBeGreaterThan(upsertPos);
    // El bloque usa `await new Promise<void>(...)` para secuenciar.
    expect(
      /await new Promise<void>\(\s*\(resolve, reject\)\s*=>\s*\{/.test(
        handler,
      ),
    ).toBe(true);
  });

  it("si `fiscalUpsert` falla, `buildInvoiceDraft` NO se llama (rechazo en `onError`)", () => {
    // El `onError` del upsert llama `reject(err)` y NUNCA resuelve,
    // de modo que `await new Promise(...)` rechaza y el flujo sale
    // por el `finally` sin disparar `buildInvoiceDraft.mutate`.
    const submitArrow = detail.indexOf(
      "onSubmit={async (input) => {",
    );
    expect(submitArrow).toBeGreaterThan(0);
    let depth = 0;
    let startBlock = -1;
    let i = submitArrow;
    while (i < detail.length) {
      const ch = detail[i];
      if (ch === "{") {
        if (startBlock === -1) startBlock = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (startBlock !== -1 && depth === 0) {
          break;
        }
      }
      i++;
    }
    const handler = detail.slice(startBlock, i + 1);
    // El `onError` del upsert debe llamar `reject(err)`.
    expect(/onError:\s*\(err\)\s*=>\s*\{[\s\S]*?reject\(err\)/.test(handler)).toBe(
      true,
    );
  });

  it("errores de `fiscalUpsert` mapean a `createInvoiceError*` y NO a `createInvoiceFieldError`", () => {
    // Errores del upsert deben caer en `createInvoiceError` (visible
    // fuera del diálogo), NO en `createInvoiceFieldError` (ocluso).
    const submitArrow = detail.indexOf(
      "onSubmit={async (input) => {",
    );
    expect(submitArrow).toBeGreaterThan(0);
    let depth = 0;
    let startBlock = -1;
    let i = submitArrow;
    while (i < detail.length) {
      const ch = detail[i];
      if (ch === "{") {
        if (startBlock === -1) startBlock = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (startBlock !== -1 && depth === 0) break;
      }
      i++;
    }
    const handler = detail.slice(startBlock, i + 1);
    // En el `onError` del upsert se usa `setCreateInvoiceError` con
    // uno de los mensajes canónicos (no `setCreateInvoiceFieldError`).
    expect(/setCreateInvoiceError\(/.test(handler)).toBe(true);
    expect(/createInvoiceFiscalUpsertError/.test(handler)).toBe(true);
    expect(/createInvoiceErrorForbidden/.test(handler)).toBe(true);
    expect(/createInvoiceErrorNotFound/.test(handler)).toBe(true);
  });

  it("`RFC_DUPLICATE` del upsert mapea a `createInvoiceFiscalInvalidRFC`", () => {
    expect(/["']RFC_DUPLICATE["']/.test(detail)).toBe(true);
    expect(/createInvoiceFiscalInvalidRFC/.test(detail)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-10 (intento 2) · INVOICE_FISCAL_DATA_REQUIRED → mensaje canónico
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-34 · AC-10 · INVOICE_FISCAL_DATA_REQUIRED mapeado", () => {
  it("`onError` de `buildInvoiceDraft` mapea `INVOICE_FISCAL_DATA_REQUIRED` a `createInvoiceFiscalMissing`", () => {
    // El helper `loadClientWithFiscal` del servicio emite
    // `INVOICE_FISCAL_DATA_REQUIRED` (409) si el cliente no tiene
    // RFC/razón social/régimen. La UI lo mapea explícitamente.
    expect(/["']INVOICE_FISCAL_DATA_REQUIRED["']/.test(detail)).toBe(true);
    expect(/createInvoiceFiscalMissing/.test(detail)).toBe(true);
  });

  it("el servicio emite `INVOICE_FISCAL_DATA_REQUIRED` (verificación de contrato)", () => {
    const invoicesService = readSrc(
      path.resolve(
        __dirname,
        "../src/server/services/facturacion/invoices.ts",
      ),
    );
    expect(/INVOICE_FISCAL_DATA_REQUIRED/.test(invoicesService)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-11 (intento 2) · Valor unitario = quote.subtotalCents, no soldTotalCents
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-34 · AC-11 · no doble IVA: unitario = quote.subtotalCents", () => {
  it("`invoiceUnitPriceCents` prefiere `quoteQuery.data.subtotalCents`", () => {
    expect(
      /if\s*\(quoteQuery\.data\?\.subtotalCents\s*!=\s*null\)/.test(detail),
    ).toBe(true);
    expect(
      /quoteQuery\.data\.subtotalCents/.test(detail),
    ).toBe(true);
  });

  it("si la cotización no expone subtotal, fallback a `soldTotalCents` con warning visible", () => {
    // El fallback debe ser explícito y acompañado de un mensaje de
    // advertencia visible en el diálogo (`createInvoiceQuoteSubtotalFallback`).
    expect(/soldTotalCents/.test(detail)).toBe(true);
    expect(/createInvoiceQuoteSubtotalFallback/.test(messages)).toBe(true);
    // El diálogo debe mostrar el warning cuando `unitPriceSource !== "quote"`.
    expect(/unitPriceSource\s*!==\s*["']quote["']/.test(detail)).toBe(true);
  });

  it("no se divide entre 1.16 (precio neto = total / 1.16) — se usa subtotal directo", () => {
    // Defensa anti-doble-IVA: la UI NO aplica el inverso del IVA
    // sobre `soldTotalCents`. Usa el subtotal de la cotización
    // directamente (camino canónico). Si alguna vez se añadiera un
    // fallback por cálculo, este test debería romperse para forzar
    // revisión.
    expect(/soldTotalCents\s*\/\s*1\.16/.test(detail)).toBe(false);
    expect(/Math\.round\(.*?1\.16/.test(detail)).toBe(false);
  });

  it("el valor unitario se pasa a `buildFromOrder` como `valorUnitarioCents` (no se multiplica por IVA)", () => {
    // El bloque `mutate({...})` debe enviar `valorUnitarioCents` con
    // el mismo valor que `input.valorUnitarioCents` (el subtotal
    // neto), sin transformación adicional.
    const mutateMatch = detailCode.match(
      /buildInvoiceDraft\.mutate\(\{[\s\S]*?\}\)/,
    );
    expect(mutateMatch).not.toBeNull();
    const block = mutateMatch![0];
    expect(/valorUnitarioCents:\s*input\.valorUnitarioCents/.test(block)).toBe(
      true,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-12 (intento 2) · Validación cliente RFC + razón social + regimen
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-34 · AC-12 · validación cliente RFC + fiscal", () => {
  it("el handler valida RFC con regex `^[A-ZÑ&]{3,4}\\d{6}[A-Z0-9]{3}$`", () => {
    // El regex literal en el archivo es `/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/u`.
    // Buscamos los anclajes y cuantificadores canónicos sin
    // escapar la `^` (en JS regex literal la `^` no se escapa).
    expect(/\^?\[A-ZÑ&\]\{3,4\}\\d\{6\}\[A-Z0-9\]\{3\}\$/.test(detail)).toBe(
      true,
    );
    expect(/\{3,4\}/.test(detail)).toBe(true);
    expect(/\\d\{6\}/.test(detail)).toBe(true);
    expect(/\[A-Z0-9\]\{3\}\$/.test(detail)).toBe(true);
    expect(/\/u(?:\.test|\.exec|\.match)?/.test(detail)).toBe(true);
  });

  it("el handler exige RFC + razonSocial + regimen no vacíos antes de upsert", () => {
    expect(/if\s*\(\s*!rfc\s*\|\|\s*!razonSocialTrim\s*\|\|\s*!regimen\s*\)/.test(detail)).toBe(
      true,
    );
  });

  it("si faltan datos fiscales, se setea `createInvoiceFiscalMissing` (no `createInvoiceFieldError`)", () => {
    const submitArrow = detail.indexOf(
      "onSubmit={async (input) => {",
    );
    expect(submitArrow).toBeGreaterThan(0);
    let depth = 0;
    let startBlock = -1;
    let i = submitArrow;
    while (i < detail.length) {
      const ch = detail[i];
      if (ch === "{") {
        if (startBlock === -1) startBlock = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (startBlock !== -1 && depth === 0) break;
      }
      i++;
    }
    const handler = detail.slice(startBlock, i + 1);
    expect(
      /setCreateInvoiceError\(\s*messages\.ordenes\.createInvoiceFiscalMissing[^)]*\)/.test(
        handler,
      ),
    ).toBe(true);
  });

  it("el botón de submit se deshabilita si faltan RFC/razón/regimen", () => {
    expect(
      /disabled=\{[\s\S]*?razonSocial\.trim\(\)\.length\s*===\s*0/.test(
        detail,
      ),
    ).toBe(true);
    expect(
      /disabled=\{[\s\S]*?regimen\.trim\(\)\.length\s*===\s*0/.test(
        detail,
      ),
    ).toBe(true);
    expect(
      /disabled=\{[\s\S]*?rfc\.trim\(\)\.length\s*===\s*0/.test(detail),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-13 (intento 2) · Banner OUTSIDE/ABOVE con z-[60] sobre overlay z-50
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-34 · AC-13 · banner de error fuera del diálogo con z-[60]", () => {
  it("el banner está en el nivel del padre, NO dentro del `<Card>` del flujo", () => {
    // El banner debe aparecer como hermano del Card, antes del Card
    // en el árbol (no dentro del CardContent). Usamos la posición
    // del data-testid y verificamos que NO está dentro de la zona
    // `<Card data-testid=\"orden-detail-create-invoice\">`.
    const cardStart = detail.indexOf(
      'data-testid="orden-detail-create-invoice"',
    );
    const errorBannerStart = detail.indexOf(
      'data-testid="orden-detail-create-invoice-error"',
    );
    expect(cardStart).toBeGreaterThan(0);
    expect(errorBannerStart).toBeGreaterThan(0);
    // El banner aparece en dos sitios: el `<div>` padre (antes del
    // Card) Y dentro del flujo del diálogo. El externo es el que
    // aparece con `z-[60]` y el banner interno no debe tener z-60.
    // El externo debe estar ANTES del Card en orden de aparición
    // en el JSX (renderizado fuera del Card).
    const cardOpening = detail.lastIndexOf("<Card", cardStart);
    // El bloque JSX del banner externo aparece inmediatamente antes
    // de `<Card data-testid=\"orden-detail-create-invoice\">`.
    const beforeCard = detail.slice(
      Math.max(0, cardOpening - 2000),
      cardOpening,
    );
    expect(/z-\[60\]/.test(beforeCard)).toBe(true);
    expect(/createInvoiceError/.test(beforeCard)).toBe(true);
  });

  it("el banner externo usa `role=\"alert\"` y `aria-live=\"assertive\"`", () => {
    const cardOpening = detail.lastIndexOf(
      "<Card",
      detail.indexOf('data-testid="orden-detail-create-invoice"'),
    );
    const beforeCard = detail.slice(
      Math.max(0, cardOpening - 2000),
      cardOpening,
    );
    expect(/role=["']alert["']/.test(beforeCard)).toBe(true);
    expect(/aria-live=["']assertive["']/.test(beforeCard)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-14 (intento 2) · Diálogo captura RFC/razón/regimen/CFDI use
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-34 · AC-14 · diálogo captura datos fiscales", () => {
  it("el diálogo tiene campos para RFC, razón social, régimen y CFDI use", () => {
    for (const id of [
      "ci-rfc",
      "ci-razon",
      "ci-regimen",
      "ci-cfdi-use",
    ]) {
      expect(new RegExp(`id=["']${id}["']`).test(detail)).toBe(true);
      expect(new RegExp(`htmlFor=["']${id}["']`).test(detail)).toBe(true);
    }
  });

  it("los campos se pre-rellenan con `clientes.fiscal.getForClient`", () => {
    // El padre pasa `fiscalPreFill={{ rfc, razonSocial, regimen, cfdiUse }}`
    // derivado de la query `fiscalQuery.data`. El diálogo usa
    // `useState(fiscalPreFill.rfc)` etc. y un `useEffect` que
    // sincroniza cuando cambian.
    expect(/fiscalPreFill=\{[\s\S]*?razonSocial:\s*fiscalQuery\.data\?\.razonSocial/.test(detail)).toBe(
      true,
    );
    expect(/fiscalQuery\.data\?\.rfc/.test(detail)).toBe(true);
    expect(/fiscalQuery\.data\?\.regimen/.test(detail)).toBe(true);
    expect(/fiscalQuery\.data\?\.cfdiUse/.test(detail)).toBe(true);
  });

  it("`clientId` real del padre se pasa al diálogo (no se pide manual)", () => {
    expect(/clientId=\{o\.clientId\}/.test(detail)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-15 (intento 2) · Mensajes `createInvoiceFiscal*` en `messages.ts`
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-34 · AC-15 · mensajes `createInvoiceFiscal*` y `createInvoiceQuoteSubtotalFallback`", () => {
  it("existen las claves de mensajes fiscales", () => {
    for (const key of [
      "createInvoiceFiscalSectionTitle",
      "createInvoiceFiscalSectionHelp",
      "createInvoiceFiscalMissing",
      "createInvoiceFiscalUpsertError",
      "createInvoiceFiscalInvalidRFC",
      "createInvoiceQuoteMissing",
      "createInvoiceQuoteSubtotalFallback",
    ]) {
      expect(new RegExp(`${key}:`).test(messages)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-8 · Acciones existentes se preservan (no regresión)
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-34 · AC-8 · cards y mutaciones previas intactas", () => {
  it("siguen existiendo los handlers previos del detalle de OS", () => {
    for (const fn of [
      "assignPL",
      "authorize",
      "pause",
      "cancel",
      "markDelivered",
      "closeAdministrative",
      "markInExecution",
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

  it("el Card de cierre administrativo sigue condicionado a delivered/in_execution", () => {
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

  it("el Card de markInExecution sigue condicionado a authorized_to_start", () => {
    expect(
      /o\.status\s*===\s*["']authorized_to_start["']/.test(detail),
    ).toBe(true);
  });

  it("la lista de facturas previa (facturas-list.tsx) NO se modifica", () => {
    const facturasList = readSrc(
      path.resolve(
        __dirname,
        "../src/modules/facturacion/facturas-list.tsx",
      ),
    );
    // El test anti-regresión es estático: basta con que el archivo
    // siga conteniendo las claves que `tests/spec-20260817-007.test.ts`
    // exige (overflow-x-auto, role=dialog, aria-modal).
    expect(facturasList).toContain("overflow-x-auto");
    expect(facturasList).toContain('role="dialog"');
    expect(facturasList).toContain('aria-modal="true"');
  });
});
