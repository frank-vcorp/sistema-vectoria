/**
 * PROVISION-V3-20260823-01 condición 6 · Redacción stdout/stderr/audit.
 *
 * Verifica estáticamente que `scripts/seed-plataforma.ts` no imprima
 * el enlace/token de invitación del Director:
 *  - `issued.link` no aparece dentro de un `console.*` /
 *    `process.stdout.write` / `process.stderr.write` / template literal
 *    que sí termine en stdout.
 *  - `issued.token` se mantiene fuera de cualquier impresión.
 *  - El código defensivo `void issued;` está presente para descartar
 *    el valor sin filtrarlo.
 *  - No hay `console.log`/`console.info`/`console.warn` con la cadena
 *    `link` o `token` interpolada.
 *
 * Esta verificación es estática porque el seed requiere DB real (no
 * queremos acoplar este test a Postgres disposable). La defensa real
 * es: el código NUNCA intenta imprimir esos campos.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SEED_PATH = resolve(__dirname, "..", "scripts", "seed-plataforma.ts");

function readSeed(): string {
  return readFileSync(SEED_PATH, "utf8");
}

describe("PROVISION-V3.redact.seed", () => {
  it("NO imprime issued.link en stdout/stderr/audit", () => {
    const src = readSeed();
    const linkPrintPatterns = [
      /console\.(log|info|warn|error)\s*\([^)]*issued\.link/,
      /process\.stdout\.write\s*\(\s*[^)]*issued\.link/,
      /process\.stderr\.write\s*\(\s*[^)]*issued\.link/,
      /appendAudit\s*\([^)]*issued\.link/,
      /console\.(log|info|warn|error)\s*\(\s*`[^`]*\$\{issued\.link\}/,
    ];
    for (const rx of linkPrintPatterns) {
      expect(rx.test(src), `seed imprime issued.link; patrón: ${rx}`).toBe(false);
    }
  });

  it("NO imprime issued.token en stdout/stderr/audit", () => {
    const src = readSeed();
    const tokenPrintPatterns = [
      /console\.(log|info|warn|error)\s*\([^)]*issued\.token/,
      /process\.stdout\.write\s*\(\s*[^)]*issued\.token/,
      /process\.stderr\.write\s*\(\s*[^)]*issued\.token/,
      /console\.(log|info|warn|error)\s*\(\s*`[^`]*\$\{issued\.token\}/,
    ];
    for (const rx of tokenPrintPatterns) {
      expect(rx.test(src), `seed imprime issued.token; patrón: ${rx}`).toBe(false);
    }
  });

  it("descarta issued explícitamente con `void issued;`", () => {
    const src = readSeed();
    expect(src).toMatch(/void\s+issued\s*;/);
  });

  it("la invitación se sigue emitiendo (idempotencia preservada)", () => {
    const src = readSeed();
    expect(src).toMatch(/createInvitationsService\(\)\.issue\(/);
    expect(src).toMatch(/eq\(invitations\.consumedAt,\s*null/);
  });

  it("el mensaje emitido NO contiene URLs de invitación", () => {
    const src = readSeed();
    expect(/\/invitacion\?token=/.test(src)).toBe(false);
  });
});

/**
 * SPEC-002-UI-20260824-02 · FND-20260824-04 — asignación idempotente
 * del rol `director` al usuario Director en el seed de plataforma.
 *
 * Verificación estática del contrato:
 *  - El helper `ensureDirectorRoleAssigned` está definido y se invoca
 *    desde `main()` después del paso 6 (invitación).
 *  - Usa el schema real de `user_roles` (PK compuesta
 *    `organization_id` + `user_id` + `role_id`, `assignedBy` como actor
 *    técnico). NO inventa columnas.
 *  - Inserta sólo si la fila no existe (idempotencia).
 *  - No imprime email ni UUIDs ni enlaces en stdout/stderr.
 *
 * El test es estático para no acoplar a Postgres disposable; la
 * verificación de runtime la hará V3 staging autenticado (login Director
 * → `clientes.prospectos.create` → 200/201 en lugar de 403).
 */
describe("SPEC-002-UI.director-role-assignment.seed", () => {
  it("importa la tabla `userRoles` desde el schema", () => {
    const src = readSeed();
    expect(src).toMatch(/userRoles[^a-zA-Z]/);
  });

  it("define el helper `ensureDirectorRoleAssigned`", () => {
    const src = readSeed();
    expect(src).toMatch(
      /async\s+function\s+ensureDirectorRoleAssigned\s*\(/,
    );
  });

  it("invoca el helper desde main() tras la emisión de invitación", () => {
    const src = readSeed();
    expect(src).toMatch(
      /ensureDirectorRoleAssigned\(\s*orgId\s*,\s*superUserId\s*,\s*env\.VECTORIA_DIRECTOR_EMAIL\s*\)/,
    );
  });

  it("usa la PK compuesta real: organization_id + user_id + role_id", () => {
    const src = readSeed();
    // Localiza el helper para acotar la búsqueda y no contaminar con
    // cualquier `userRoles` que aparezca en otros lugares.
    const helperMatch = src.match(
      /async\s+function\s+ensureDirectorRoleAssigned[\s\S]*?\n\}/,
    );
    expect(helperMatch, "helper ensureDirectorRoleAssigned no encontrado").not.toBeNull();
    const body = helperMatch![0]!;
    expect(body).toMatch(/organizationId\s*:\s*orgId/);
    expect(body).toMatch(/userId\s*:\s*directorUser\.id/);
    expect(body).toMatch(/roleId\s*:\s*directorRoleId/);
    expect(body).toMatch(/assignedBy\s*:\s*superUserId/);
  });

  it("busca el usuario Director por email en minúsculas", () => {
    const src = readSeed();
    const helperMatch = src.match(
      /async\s+function\s+ensureDirectorRoleAssigned[\s\S]*?\n\}/,
    );
    expect(helperMatch).not.toBeNull();
    const body = helperMatch![0]!;
    expect(body).toMatch(/\.toLowerCase\(\)/);
    expect(body).toMatch(/eq\(users\.email,\s*email\)/);
  });

  it("NO imprime el email del Director en stdout/stderr", () => {
    const src = readSeed();
    const helperMatch = src.match(
      /async\s+function\s+ensureDirectorRoleAssigned[\s\S]*?\n\}/,
    );
    expect(helperMatch).not.toBeNull();
    const body = helperMatch![0]!;
    expect(
      /console\.(log|info|warn|error)\s*\([^)]*directorEmail/.test(body),
    ).toBe(false);
    expect(
      /console\.(log|info|warn|error)\s*\([^)]*directorUser\.id/.test(body),
    ).toBe(false);
  });

  it("omite sin error si el usuario aún no existe (invitación pendiente)", () => {
    const src = readSeed();
    const helperMatch = src.match(
      /async\s+function\s+ensureDirectorRoleAssigned[\s\S]*?\n\}/,
    );
    expect(helperMatch).not.toBeNull();
    const body = helperMatch![0]!;
    // Debe existir un `if (!directorUser) return;` para el caso pendiente.
    expect(body).toMatch(/if\s*\(\s*!directorUser\s*\)\s*\{[^}]*return[^}]*\}/);
  });

  it("verifica existencia previa antes de insertar (idempotencia)", () => {
    const src = readSeed();
    const helperMatch = src.match(
      /async\s+function\s+ensureDirectorRoleAssigned[\s\S]*?\n\}/,
    );
    expect(helperMatch).not.toBeNull();
    const body = helperMatch![0]!;
    // El helper hace un `select` sobre `userRoles` antes del `insert`.
    expect(body).toMatch(/from\(userRoles\)/);
    expect(body).toMatch(/db\.insert\(userRoles\)/);
  });
});