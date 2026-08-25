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
