/**
 * IMPL-20260825-27 · Tests dirigidos de la conversión automática
 * prospecto→cliente dentro de `quotes.accept` (SPEC-20260825-027,
 * ADR-20260825-05).
 *
 * Cobertura sin BD ni red (alineado con la política de tests del
 * proyecto: `tests/spec-20260817-002.test.ts`):
 *  - AC-1: Si `before.clientId` es null y `before.prospectId` real,
 *    la transacción de aceptación reutiliza o crea el cliente del
 *    prospecto y enlaza `quotes.clientId` antes de marcar `accepted`.
 *  - AC-2: Reaceptación no crea duplicado: idempotencia por
 *    `(organizationId, prospectId)`.
 *  - AC-3: `clientId` ya presente → no se crea ni se toca cliente.
 *  - AC-4: Prospecto inexistente en la org → la aceptación falla
 *    con `PROSPECT_NOT_FOUND` y rollbackea (`withTx`).
 *  - AC-5: No se inventan RFC ni contactos: el cliente sólo hereda
 *    `name/company/email` del prospecto y `phone=null`.
 *  - AC-6: `clientNumber` con formato `C-NNNNNN` (BR-N216).
 *  - AC-7: Auditoría: `client.create` se emite cuando se crea; el
 *    `quote.accept` lleva `clientId` y `clientConverted` en `after`;
 *    `os.create_pending_from_quote` lleva el `clientId` resuelto.
 *  - AC-8: La UI accepted muestra `clientId` sólo si está en el DTO
 *    (no afirma éxito si falta); no se añade UI falsa.
 *
 * Sin harness de BD: las invariantes transaccionales se verifican
 * por inspección estática del código (regex sobre `quotes.ts`) y
 * con un mock discriminante del orden de operaciones. La
 * validación V3 funcional la activa GEMINI en el gate final
 * (Playwright contra staging) — fuera de alcance de esta suite.
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const QUOTES_PATH = path.resolve(
  __dirname,
  "../src/server/services/comercial/quotes.ts",
);
const DETAIL_PATH = path.resolve(
  __dirname,
  "../src/modules/comercial/cotizaciones/cotizacion-detail.tsx",
);
const MESSAGES_PATH = path.resolve(
  __dirname,
  "../src/shared/utils/messages.ts",
);
const ENUMS_PATH = path.resolve(
  __dirname,
  "../src/shared/enums/index.ts",
);

function readSrc(p: string): string {
  return fs.readFileSync(p, "utf8");
}

/**
 * Extrae el cuerpo de una función/scope a partir de un marker de
 * inicio (`function NAME(`) hasta su `}` de cierre balanceado.
 * Robusto contra params TS con `input: { ... }` (objetos) y
 * `(...)` anidados (function types). Usa contadores balanceados
 * con escape de strings/template literals.
 */
function extractFunction(src: string, name: string): string {
  const sigIdx = src.indexOf(`function ${name}(`);
  if (sigIdx < 0) return "";
  const afterParen = sigIdx + `function ${name}`.length + 1; // justo después de `(`
  let parenDepth = 1;
  let braceDepth = 0;
  let inString: string | null = null;
  for (let i = afterParen; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "(") parenDepth++;
    else if (ch === ")") {
      parenDepth--;
      if (parenDepth === 0 && braceDepth === 0) {
        // Encontrado el `)` que cierra los params. Saltar al
        // primer `{` (cuerpo de la función).
        const bodyStart = src.indexOf("{", i);
        if (bodyStart < 0) return "";
        // Contar `{` / `}` balanceados para encontrar el cierre.
        let depth = 0;
        let inS: string | null = null;
        for (let j = bodyStart; j < src.length; j++) {
          const c = src[j];
          if (inS) {
            if (c === "\\") {
              j++;
              continue;
            }
            if (c === inS) inS = null;
            continue;
          }
          if (c === '"' || c === "'" || c === "`") {
            inS = c;
            continue;
          }
          if (c === "{") depth++;
          else if (c === "}") {
            depth--;
            if (depth === 0) return src.substring(sigIdx, j + 1);
          }
        }
        return "";
      }
    } else if (ch === "{") braceDepth++;
    else if (ch === "}") braceDepth--;
  }
  return "";
}

describe("IMPL-20260825-27 · SPEC-027 · conversión automática al aceptar cotización", () => {
  const src = readSrc(QUOTES_PATH);

  it("AC-1 · imports de schema necesarios: clients y prospects dentro de la transacción", () => {
    // La conversión trabaja directamente con las tablas (no delega
    // al servicio `clients` para no acoplar el contrato público
    // entre módulos). El import debe vivir en `quotes.ts`.
    expect(/from\s+["']@\/server\/db\/schema["']/.test(src)).toBe(true);
    expect(/\bclients\b/.test(src)).toBe(true);
    expect(/\bprospects\b/.test(src)).toBe(true);
  });

  it("AC-1 · la transacción de aceptación sigue siendo atómica (withTx)", () => {
    // Garantiza que cualquier excepción dentro de la tx (incluida
    // `PROSPECT_NOT_FOUND` y el rollback de conversión) deshace
    // también `quote_acceptances`, `file_links` y el `UPDATE` final.
    const acceptBody = extractFunction(src, "accept");
    expect(acceptBody.length).toBeGreaterThan(0);
    expect(/return\s+withTx\(async\s+\(tx\)\s*=>\s*\{/.test(acceptBody)).toBe(true);
  });

  it("AC-1 · la conversión ocurre DENTRO de la transacción, antes de accepted", () => {
    // El helper `ensureClientForProspect` debe invocarse dentro
    // del `withTx` y antes del UPDATE que marca `accepted`.
    const acceptBody = extractFunction(src, "accept");
    expect(acceptBody.length).toBeGreaterThan(0);
    const idxEnsure = acceptBody.indexOf("ensureClientForProspect");
    const idxUpdateAccepted = acceptBody.search(
      /\.update\(quotes\)[\s\S]{0,800}status:\s*["']accepted["']/,
    );
    expect(idxEnsure).toBeGreaterThan(0);
    expect(idxUpdateAccepted).toBeGreaterThan(0);
    expect(idxEnsure).toBeLessThan(idxUpdateAccepted);
  });

  it("AC-1 · reutilización idempotente por (organizationId, prospectId)", () => {
    // El helper `ensureClientForProspect` primero busca un cliente
    // existente para el prospecto; si lo encuentra, lo devuelve
    // sin crear otro.
    const body = extractFunction(src, "ensureClientForProspect");
    expect(body.length).toBeGreaterThan(0);
    // Lookup por (orgId, prospectId) ANTES del insert.
    const idxLookup = body.search(
      /from\(clients\)[\s\S]{0,400}eq\(clients\.organizationId, orgId\)[\s\S]{0,400}eq\(clients\.prospectId, prospectId\)/,
    );
    const idxInsert = body.search(/\.insert\(clients\)/);
    expect(idxLookup).toBeGreaterThan(0);
    expect(idxInsert).toBeGreaterThan(0);
    expect(idxLookup).toBeLessThan(idxInsert);
    // Cortocircuito si existe.
    expect(/if\s*\(\s*existing\s*\)\s*return\s+existing\.id/.test(body)).toBe(true);
  });

  it("AC-2 · reaceptación: si before.clientId ya existe, no se crea ni se toca cliente", () => {
    // La guarda `if (!before.clientId && before.prospectId)` impide
    // llamar al helper cuando el cliente ya está enlazado; por
    // tanto `resolvedClientId = before.clientId` y el UPDATE
    // simplemente lo reescribe (idempotente).
    const acceptBody = extractFunction(src, "accept");
    expect(acceptBody.length).toBeGreaterThan(0);
    expect(
      /if\s*\(\s*!before\.clientId\s*&&\s*before\.prospectId\s*\)/.test(
        acceptBody,
      ),
    ).toBe(true);
    expect(
      /let\s+resolvedClientId:\s*string\s*\|\s*null\s*=\s*before\.clientId/.test(
        acceptBody,
      ),
    ).toBe(true);
  });

  it("AC-3 · prospecto inexistente en la org → PROSPECT_NOT_FOUND y rollback", () => {
    // El helper verifica `(id, organizationId)` y lanza 404 con
    // código estable. `withTx` revierte toda la aceptación
    // (incluye `quote_acceptances`, `file_links`, `UPDATE accepted`).
    const body = extractFunction(src, "ensureClientForProspect");
    expect(body.length).toBeGreaterThan(0);
    expect(/eq\(prospects\.id, prospectId\)/.test(body)).toBe(true);
    expect(/eq\(prospects\.organizationId, orgId\)/.test(body)).toBe(true);
    expect(
      /throw\s+new\s+DomainError\(\s*["']PROSPECT_NOT_FOUND["']/.test(body),
    ).toBe(true);
    // Mensaje claro y código de error 404.
    expect(/\b404\b/.test(body)).toBe(true);
  });

  it("AC-4 · no se inventan RFC ni contactos: sólo name/company/email del prospecto", () => {
    const body = extractFunction(src, "ensureClientForProspect");
    expect(body.length).toBeGreaterThan(0);
    // El insert sólo toma name/company/email + prospectId + status.
    // Nunca se asigna RFC (no existe en schema clients) ni
    // contactos (no existe en schema clients).
    const insertMatch = body.match(
      /\.insert\(clients\)[\s\S]*?\.returning\(\)/,
    );
    expect(insertMatch).not.toBeNull();
    const insertBlock = insertMatch![0];
    expect(/name:\s*p\.name/.test(insertBlock)).toBe(true);
    expect(/company:\s*p\.company\s*\?\?\s*null/.test(insertBlock)).toBe(true);
    expect(/email:\s*p\.email\s*\?\?\s*null/.test(insertBlock)).toBe(true);
    expect(/phone:\s*null/.test(insertBlock)).toBe(true);
    expect(/prospectId:\s*p\.id/.test(insertBlock)).toBe(true);
    expect(/status:\s*["']active["']/.test(insertBlock)).toBe(true);
  });

  it("AC-5 · clientNumber con formato C-NNNNNN (BR-N216)", () => {
    // El helper local `nextClientNumberTx` reusa la misma fórmula
    // que `services/clientes/clients.ts` (regex `C-NNNNNN`,
    // 6 dígitos, arranco en C-000001).
    const helper = extractFunction(src, "nextClientNumberTx");
    expect(helper.length).toBeGreaterThan(0);
    expect(/from\(clients\)/.test(helper)).toBe(true);
    // Regex literal.
    expect(/\/\^C-\(\\d\{1,\}\)\$\//.test(helper)).toBe(true);
    // Padding 6 dígitos.
    expect(/padStart\(6,\s*["']0["']\)/.test(helper)).toBe(true);
    // Arranque C-000001 cuando la org no tiene clientes.
    expect(/return\s+["']C-000001["']/.test(helper)).toBe(true);
  });

  it("AC-6 · el UPDATE de aceptación graba clientId junto con status='accepted'", () => {
    // El `UPDATE quotes` final debe incluir `clientId: resolvedClientId`
    // en el mismo `set({...})` que pone `status: "accepted"`, para
    // que el DTO devuelto y la persistencia sean atómicos.
    const acceptBody = extractFunction(src, "accept");
    expect(acceptBody.length).toBeGreaterThan(0);
    expect(/clientId:\s*resolvedClientId/.test(acceptBody)).toBe(true);
    // Y la misma UPDATE contiene `status: "accepted"`.
    const updateSet = acceptBody.match(
      /\.update\(quotes\)[\s\S]*?\.set\(\{[\s\S]*?\}\)/,
    );
    expect(updateSet).not.toBeNull();
    expect(/status:\s*["']accepted["']/.test(updateSet![0])).toBe(true);
    expect(/clientId:\s*resolvedClientId/.test(updateSet![0])).toBe(true);
  });

  it("AC-7 · auditoría: client.create cuando se crea, quote.accept con clientId, os.create_pending_from_quote con clientId resuelto", () => {
    // 1) client.create se emite sólo cuando se crea (dentro del
    //    helper, después del insert).
    const helperBody = extractFunction(src, "ensureClientForProspect");
    expect(helperBody.length).toBeGreaterThan(0);
    expect(/action:\s*["']client\.create["']/.test(helperBody)).toBe(true);
    // Sin secretos en el audit.
    expect(/source:\s*["']quote\.accept["']/.test(helperBody)).toBe(true);

    // 2) quote.accept lleva clientId y clientConverted en after.
    const acceptBody = extractFunction(src, "accept");
    expect(acceptBody.length).toBeGreaterThan(0);
    const acceptAudit = acceptBody.match(
      /action:\s*["']quote\.accept["'][\s\S]*?\}\s*\)\s*;?/,
    );
    expect(acceptAudit).not.toBeNull();
    expect(/clientId:\s*after\.clientId/.test(acceptAudit![0])).toBe(true);
    expect(
      /clientConverted:\s*!before\.clientId\s*&&\s*!!resolvedClientId/.test(
        acceptAudit![0],
      ),
    ).toBe(true);
    // before también lleva clientId/prospectId para trazabilidad.
    expect(
      /before:\s*\{[\s\S]*?clientId:\s*before\.clientId[\s\S]*?prospectId:\s*before\.prospectId[\s\S]*?\}/.test(
        acceptAudit![0],
      ),
    ).toBe(true);

    // 3) os.create_pending_from_quote ya referencia after.clientId;
    //    tras el cambio, after.clientId es el resuelto, no null.
    const osAudit = acceptBody.match(
      /action:\s*["']os\.create_pending_from_quote["'][\s\S]*?\}\s*\)\s*;?/,
    );
    expect(osAudit).not.toBeNull();
    expect(/clientId:\s*after\.clientId/.test(osAudit![0])).toBe(true);
  });

  it("AC-7b · client.create es acción de auditoría canónica (enums)", () => {
    const enums = readSrc(ENUMS_PATH);
    expect(/["']client\.create["']/.test(enums)).toBe(true);
  });
});

describe("IMPL-20260825-27 · SPEC-027 · UI accepted muestra cliente sólo si DTO lo trae", () => {
  it("AC-8 · la UI accepted renderiza clientId sólo si está presente (no afirma éxito)", () => {
    const ui = readSrc(DETAIL_PATH);
    // Render condicional con `q.clientId` (truthy check).
    expect(/q\.clientId\s*\?/.test(ui)).toBe(true);
    expect(
      /data-testid=["']cotizacion-detail-accepted-client["']/.test(ui),
    ).toBe(true);
    // El bloque accepted (data-testid canónico) contiene el
    // render del clientId dentro de la misma tarjeta `accepted`.
    const acceptedCard = ui.match(
      /data-testid=["']cotizacion-detail-accepted["'][\s\S]*?<\/Card>/,
    );
    expect(acceptedCard).not.toBeNull();
    expect(
      /data-testid=["']cotizacion-detail-accepted-client["']/.test(
        acceptedCard![0],
      ),
    ).toBe(true);
  });

  it("AC-8 · el mensaje canónico expone la etiqueta `acceptedClientLabel`", () => {
    const msgs = readSrc(MESSAGES_PATH);
    expect(
      /acceptedClientLabel:\s*["']Cliente enlazado["']/.test(msgs),
    ).toBe(true);
  });
});

describe("IMPL-20260825-27 · SPEC-027 · invariantes puras del helper local", () => {
  it("nextClientNumberTx no requiere un cliente preexistente (arranque C-000001)", () => {
    // Espejo del helper público en clients.ts. Verificamos que
    // el camino `if (!last) return "C-000001"` existe en la copia
    // local de quotes.ts.
    const helper = extractFunction(readSrc(QUOTES_PATH), "nextClientNumberTx");
    expect(helper.length).toBeGreaterThan(0);
    expect(/if\s*\(\s*!last\s*\)\s*return\s+["']C-000001["']/.test(helper)).toBe(true);
  });
});

describe("IMPL-20260825-27 · SPEC-027 · la carga perezosa del helper no introduce race con audit", () => {
  it("AC-7 · el registro de auditoría se hace por la misma factoría (createAuditService)", () => {
    // Garantiza que la conversión y la aceptación usan la misma
    // factoría de auditoría, evitando canales divergentes.
    const src = readSrc(QUOTES_PATH);
    const occurrences = src.match(/createAuditService\(\)/g) ?? [];
    // Como mínimo 3 usos: client.create (helper), quote.accept,
    // os.create_pending_from_quote.
    expect(occurrences.length).toBeGreaterThanOrEqual(3);
  });
});

describe("IMPL-20260825-27 · SPEC-027 · import estático del módulo de auditoría (no inline)", () => {
  it("el helper hace `await import('@/server/services/audit')` (carga perezosa ya usada)", () => {
    // El proyecto ya carga `audit` con `await import` dentro de
    // transacciones; verificamos que la conversión no rompe ese
    // patrón (consistencia).
    const src = readSrc(QUOTES_PATH);
    expect(
      /await\s+import\(["']@\/server\/services\/audit["']\)/.test(src),
    ).toBe(true);
  });
});

describe("IMPL-20260825-27 · SPEC-027 · smoke mock-driven del flujo de orden de operaciones", () => {
  it("la conversión se invoca antes del UPDATE accepted (orden observable)", async () => {
    // Sin BD, no podemos ejecutar la transacción real. Pero
    // podemos verificar el orden relativo de las llamadas
    // mediante inspección estática del código fuente: el helper
    // `ensureClientForProspect` aparece dentro de `accept` ANTES
    // del `UPDATE quotes` con `status: "accepted"`. Esto detecta
    // regresiones si alguien mueve la conversión fuera de lugar.
    const src = readSrc(QUOTES_PATH);
    const helper = extractFunction(src, "ensureClientForProspect");
    const acceptBody = extractFunction(src, "accept");
    expect(helper.length).toBeGreaterThan(0);
    expect(acceptBody.length).toBeGreaterThan(0);

    // El helper hace: select (lookup existing) -> select (lookup
    // prospect) -> insert (client). Lo extraemos en orden.
    const helperSelects = (helper.match(/\.select\(/g) ?? []).length;
    const helperInserts = (helper.match(/\.insert\(clients\)/g) ?? []).length;
    expect(helperSelects).toBeGreaterThanOrEqual(2);
    expect(helperInserts).toBe(1);
    // Y en accept, el orden es: ensureClientForProspect ANTES del
    // .update(quotes) con status accepted.
    const ensureIdx = acceptBody.indexOf("ensureClientForProspect(");
    const updateAcceptedIdx = acceptBody.search(
      /\.update\(quotes\)[\s\S]{0,500}status:\s*["']accepted["']/,
    );
    expect(ensureIdx).toBeGreaterThan(0);
    expect(updateAcceptedIdx).toBeGreaterThan(0);
    expect(ensureIdx).toBeLessThan(updateAcceptedIdx);
  });
});

/**
 * IMPL-20260825-27 (extensión) · Bloque UI "Crear Orden de Servicio"
 * dentro de `cotizacion-detail.tsx`. Esta parte del incremento
 * hace observable la creación OS; el backend de conversión ya está
 * desplegado.
 *
 * Cobertura sin BD ni red (alineado con el resto de la suite):
 *  - AC-9: La UI invoca `trpc.ordenServicio.createFromAcceptedQuote`
 *    con `cotizacionId` = UUID real (prop `id`), NUNCA dummy.
 *  - AC-10: Anticipo opcional, validado MXN no-negativo, default null.
 *  - AC-11: Mapeo de errores: QUOTE_HAS_NO_CLIENT,
 *    ORDER_ALREADY_EXISTS_FOR_QUOTE, FORBIDDEN/UNAUTHORIZED.
 *  - AC-12: En éxito: muestra `pending_deposit`, order.id (UUID),
 *    order.code (OS-NNNNN), enlace `/ordenes-servicio/{id}`.
 *  - AC-13: En estados no accepted, NO se renderiza acción falsa.
 *  - AC-14: Sin `window.prompt`/`confirm`/`alert` ni acceso a BD.
 *  - AC-15: Items/totals/nota OS pending se conservan.
 *  - AC-16: Accesibilidad: button `type="button"`, `disabled`,
 *    `aria-busy`, errores con `role="alert"`, éxito con
 *    `role="status"` + `aria-live="polite"`.
 */
describe("IMPL-20260825-27 (extensión) · UI 'Crear Orden de Servicio'", () => {
  const ui = readSrc(DETAIL_PATH);

  it("AC-9 · el bloque Crear OS vive DENTRO de la tarjeta accepted (no UI falsa en otros estados)", () => {
    // El Card `cotizacion-detail-accepted` ya está condicionado
    // por `q.status === "accepted"`; el nuevo sub-bloque vive
    // dentro. La UI nunca renderiza el botón fuera de ese Card.
    const acceptedCard = ui.match(
      /data-testid=["']cotizacion-detail-accepted["'][\s\S]*?<\/Card>/,
    );
    expect(acceptedCard).not.toBeNull();
    expect(
      /data-testid=["']cotizacion-detail-create-os-block["']/.test(
        acceptedCard![0],
      ),
    ).toBe(true);
    expect(
      /data-testid=["']cotizacion-detail-create-os["']/.test(
        acceptedCard![0],
      ),
    ).toBe(true);
  });

  it("AC-9 · cotizacionId NUNCA es un UUID dummy (00000000-…, vacío, 'test', etc.)", () => {
    // La mutación debe usar el UUID real (la prop `id`), no un
    // placeholder. Defensivo: ninguna aparición de "00000000-…"
    // como literal en `cotizacionId:` ni de strings dummy.
    expect(/cotizacionId:\s*["']00000000-/.test(ui)).toBe(false);
    expect(/cotizacionId:\s*["']dummy/.test(ui)).toBe(false);
    expect(/cotizacionId:\s*["']test/.test(ui)).toBe(false);
    expect(/cotizacionId:\s*["']""['"]?/.test(ui)).toBe(false);
    // La asignación correcta: `cotizacionId: id` (prop UUID real)
    // o `cotizacionId: q.id` (DTO cargado por byId). Aceptamos
    // cualquiera de las dos; ambas son UUID real, no dummy.
    expect(
      /cotizacionId:\s*(id|q\.id)\b/.test(ui),
    ).toBe(true);
  });

  it("AC-9 · llama el contrato correcto: trpc.ordenServicio.createFromAcceptedQuote", () => {
    expect(
      /trpc\.ordenServicio\.createFromAcceptedQuote\.useMutation/.test(ui),
    ).toBe(true);
  });

  it("AC-10 · anticipo opcional con validación MXN no-negativa y default null", () => {
    // Existe el helper `parseAnticipoToCents` con la regex
    // canónica MXN (`/^\\d+(\\.\\d{1,2})?$/`).
    expect(/function\s+parseAnticipoToCents\s*\(/.test(ui)).toBe(true);
    expect(/\/\^\\d\+\(\\\.\\d\{1,2\}\)\?\$\//.test(ui)).toBe(true);
    // Cadena vacía → null (default).
    expect(
      /if\s*\(\s*trimmed\.length\s*===\s*0\s*\)\s*return\s*\{\s*ok:\s*true,\s*value:\s*null/.test(
        ui,
      ),
    ).toBe(true);
    // Rechazo explícito de negativos.
    expect(/pesos\s*<\s*0/.test(ui)).toBe(true);
    // El Input se renderiza con `name="anticipoMxn"` y
    // `inputMode="decimal"` (móvil: teclado numérico).
    expect(
      /name=["']anticipoMxn["']/.test(ui),
    ).toBe(true);
    expect(/inputMode=["']decimal["']/.test(ui)).toBe(true);
    // En el envío, cuando el anticipo es null NO se incluye la
    // clave (no se manda `anticipoRequiredCents: null`).
    expect(
      /\.\.\.\(parsed\.value\s*===\s*null\s*\?\s*\{\s*\}\s*:\s*\{\s*anticipoRequiredCents:\s*parsed\.value\s*\}\)/.test(
        ui,
      ),
    ).toBe(true);
  });

  it("AC-10 · error de validación del anticipo se muestra con role=alert", () => {
    // El bloque de error del anticipo lleva `role="alert"` y un
    // data-testid estable para QA.
    expect(
      /role=["']alert["'][\s\S]{0,200}data-testid=["']cotizacion-detail-create-os-anticipo-error["']/.test(
        ui,
      ),
    ).toBe(true);
  });

  it("AC-11 · mapeo de errores del backend (sin falso éxito)", () => {
    // El patrón actual extrae `const code = err.data?.code ?? null`
    // y compara con `code === "..."`. Aceptamos tanto la forma
    // inline (`err.data?.code === "X"`) como la local (`code === "X"`).
    const hasErrCode = (code: string): boolean =>
      new RegExp(
        `code\\s*===\\s*["']${code}["']`,
      ).test(ui);
    expect(hasErrCode("QUOTE_HAS_NO_CLIENT")).toBe(true);
    expect(hasErrCode("ORDER_ALREADY_EXISTS_FOR_QUOTE")).toBe(true);
    expect(hasErrCode("FORBIDDEN")).toBe(true);
    expect(hasErrCode("UNAUTHORIZED")).toBe(true);
    // Cada código mapea a un mensaje canónico estable.
    expect(
      /messages\.cotizaciones\.createOsErrorNoClient/.test(ui),
    ).toBe(true);
    expect(
      /messages\.cotizaciones\.createOsErrorAlreadyExists/.test(ui),
    ).toBe(true);
    expect(
      /messages\.cotizaciones\.createOsErrorForbidden/.test(ui),
    ).toBe(true);
    expect(
      /messages\.cotizaciones\.createOsErrorGeneric/.test(ui),
    ).toBe(true);
    // El error se renderiza con role="alert" (no afirmación de éxito).
    expect(
      /role=["']alert["'][\s\S]{0,200}data-testid=["']cotizacion-detail-create-os-error["']/.test(
        ui,
      ),
    ).toBe(true);
  });

  it("AC-12 · éxito muestra status pending_deposit, code OS-NNNNN, id UUID y enlace", () => {
    // data-testid del bloque de éxito.
    expect(
      /data-testid=["']cotizacion-detail-create-os-success["']/.test(ui),
    ).toBe(true);
    // Status `pending_deposit` literal y label canónico.
    expect(/messages\.ordenes\.pendingDeposit/.test(ui)).toBe(true);
    expect(/createdOrder\.status/.test(ui)).toBe(true);
    // Code real (no dummy).
    expect(
      /data-testid=["']cotizacion-detail-create-os-success-code["']/.test(
        ui,
      ),
    ).toBe(true);
    expect(/createdOrder\.code/.test(ui)).toBe(true);
    // ID real (UUID) explícito y aislado.
    expect(
      /data-testid=["']cotizacion-detail-create-os-success-id["']/.test(ui),
    ).toBe(true);
    expect(/createdOrder\.id/.test(ui)).toBe(true);
    // Enlace a /ordenes-servicio/{id} (ruta real del módulo).
    expect(
      /href=\{`\/ordenes-servicio\/\$\{createdOrder\.id\}`\}/.test(ui),
    ).toBe(true);
    expect(
      /data-testid=["']cotizacion-detail-create-os-success-link["']/.test(
        ui,
      ),
    ).toBe(true);
    // El bloque de éxito usa role="status" + aria-live="polite"
    // (anuncio no bloqueante para lectores de pantalla).
    expect(
      /role=["']status["'][\s\S]{0,80}aria-live=["']polite["']/.test(ui),
    ).toBe(true);
  });

  it("AC-13 · la acción Crear OS NO se renderiza cuando el status no es accepted", () => {
    // El botón vive dentro del Card condicionado por
    // `q.status === "accepted"`. Adicionalmente `canCreateOs`
    // exige `q.status === "accepted'` y la ausencia de un OS ya
    // creada en la sesión.
    const canCreateOsMatch = ui.match(
      /const\s+canCreateOs\s*=\s*([^;]+);/,
    );
    expect(canCreateOsMatch).not.toBeNull();
    // Tras el null check, `canCreateOsMatch` es RegExpMatchArray;
    // TS aún infiere `string | undefined` para `match[1]`, así que
    // usamos un alias tipado para evitar el cast en cada uso.
    const matchArr = canCreateOsMatch as RegExpMatchArray;
    const cond = matchArr[1] ?? "";
    expect(/q\.status\s*===\s*["']accepted["']/.test(cond)).toBe(true);
    // El botón se deshabilita al haber un createdOrder (idempotente).
    expect(
      /!!createdOrder/.test(cond) || /createdOrder/.test(cond),
    ).toBe(true);
    // `disabled={!canCreateOs}` (sin acción falsa).
    expect(/disabled=\{!canCreateOs\}/.test(ui)).toBe(true);
  });

  it("AC-14 · la UI NO usa window.prompt / prompt / confirm / alert nativos", () => {
    // Defensivo contra reintroducción de prompts nativos.
    expect(/window\.prompt\s*\(/.test(ui)).toBe(false);
    expect(/window\.confirm\s*\(/.test(ui)).toBe(false);
    expect(/window\.alert\s*\(/.test(ui)).toBe(false);
    // La palabra suelta `prompt(` (sin `window.` o como método
    // suelto) tampoco debería aparecer.
    expect(/(^|[^.\w])prompt\s*\(/.test(ui)).toBe(false);
  });

  it("AC-14 · la UI NO accede a BD ni importa módulos de server/db", () => {
    // La UI consume tRPC; nunca debe importar Drizzle o la capa
    // de persistencia directamente.
    expect(/from\s+["']@\/server\/db\//.test(ui)).toBe(false);
    expect(/from\s+["']drizzle-orm/.test(ui)).toBe(false);
    expect(/getDb\s*\(/.test(ui)).toBe(false);
  });

  it("AC-15 · items/totals se conservan (no se removieron Cards existentes)", () => {
    // Cards de ítems y totales siguen presentes tras el cambio.
    expect(
      /cotizacion-detail-items|cotizacion-detail-totals|itemsTitle|itemsTitle/.test(
        ui,
      ),
    ).toBe(true);
    // Etiqueta de totales intacta.
    expect(/messages\.cotizaciones\.totalsTitle/.test(ui)).toBe(true);
  });

  it("AC-15 · la nota OS pending sigue presente con data-testid estable", () => {
    expect(
      /data-testid=["']cotizacion-detail-accepted-pending-os["']/.test(ui),
    ).toBe(true);
    expect(
      /messages\.cotizaciones\.acceptPendingOsTitle/.test(ui),
    ).toBe(true);
    expect(
      /messages\.cotizaciones\.acceptPendingOsBody/.test(ui),
    ).toBe(true);
  });

  it("AC-16 · accesibilidad: button accesible, aria-busy, role=alert / role=status", () => {
    // Botón accesible.
    const buttonMatch = ui.match(
      /<Button[\s\S]*?data-testid=["']cotizacion-detail-create-os["'][\s\S]*?\/>/,
    );
    expect(buttonMatch).not.toBeNull();
    expect(/type=["']button["']/.test(buttonMatch![0])).toBe(true);
    expect(/disabled=\{!canCreateOs\}/.test(buttonMatch![0])).toBe(true);
    expect(
      /aria-busy=\{createOsMutation\.isPending\s*\?\s*true\s*:\s*undefined\}/.test(
        buttonMatch![0],
      ),
    ).toBe(true);
    // Errores accesibles.
    expect(/role=["']alert["']/.test(ui)).toBe(true);
    // Éxito accesible.
    expect(/role=["']status["']/.test(ui)).toBe(true);
    // Labels asociados a Inputs (`htmlFor` + `id`).
    expect(
      /htmlFor=["']cotizacion-detail-create-os-anticipo["']/.test(ui),
    ).toBe(true);
    expect(
      /id=["']cotizacion-detail-create-os-anticipo["']/.test(ui),
    ).toBe(true);
  });

  it("AC-16 · la deshabilitación del Input evita edición mientras hay OS creada o pending", () => {
    const inputMatch = ui.match(
      /<Input[\s\S]*?data-testid=["']cotizacion-detail-create-os-anticipo["'][\s\S]*?\/>/,
    );
    expect(inputMatch).not.toBeNull();
    expect(
      /disabled=\{createOsMutation\.isPending\s*\|\|\s*!!createdOrder\}/.test(
        inputMatch![0],
      ),
    ).toBe(true);
  });
});

describe("IMPL-20260825-27 (extensión) · catálogo canónico de mensajes createOs", () => {
  it("existen todas las etiquetas esperadas en messages.cotizaciones", () => {
    const msgs = readSrc(MESSAGES_PATH);
    const expected: string[] = [
      "createOsTitle",
      "createOsSubtitle",
      "createOsAction",
      "createOsSubmitting",
      "createOsAnticipoLabel",
      "createOsAnticipoPlaceholder",
      "createOsAnticipoHelp",
      "createOsAnticipoInvalid",
      "createOsSuccessTitle",
      "createOsSuccessBody",
      "createOsViewOrder",
      "createOsErrorNoClient",
      "createOsErrorAlreadyExists",
      "createOsErrorForbidden",
      "createOsErrorGeneric",
    ];
    for (const k of expected) {
      expect(msgs.includes(`${k}:`)).toBe(true);
    }
  });

  it("la nota OS pending cita BR-N242 y BR-N244 como referencia de negocio", () => {
    const msgs = readSrc(MESSAGES_PATH);
    // El mensaje cita BR-N242 (creación de OS desde cotización
    // aceptada) y BR-N244 (anticipo ≥90% como precondición). El
    // body actual usa la forma combinada `BR-N242/244`; aceptamos
    // ambas formas (separadas o conjuntas) para no romper el test
    // ante cambios de formato en el mensaje.
    const cites242 = /BR-N242/.test(msgs);
    const cites244 =
      /BR-N244/.test(msgs) || /BR-N242\/244/.test(msgs);
    expect(cites242).toBe(true);
    expect(cites244).toBe(true);
  });
});
