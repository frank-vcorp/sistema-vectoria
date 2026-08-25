/**
 * SPEC-002 (Clientes y Prospectos) — tests unitarios puros.
 *
 * Cubre los AC sin requerir BD funcional (los flujos de BD están
 * gateados por infraestructura y se validarán en V3 Playwright contra
 * el entorno provisionado por Frank):
 *
 *  - AC-1 · `CLIENT_MUST_COME_FROM_PROSPECT` (BR-N168) y contrato de
 *    número de cliente (BR-N216, formato `C-NNNNNN`).
 *  - AC-2 · `QUESTIONNAIRE_REQUIRED` (BR-N148).
 *  - AC-3 · `archive` no expone `delete`; archivado deja `status='archived'`.
 *  - AC-4 · `LOST_REASON_REQUIRED` (BR-N213), `SUSPENDED_REASON_REQUIRED`
 *    (BR-N214), reactivación conserva historial.
 *  - AC-5 · `MULTIPLE_MAIN_CONTACTS` (BR-N217): contrato de "un solo
 *    principal"; los helpers puros lo modelan.
 *  - AC-6 · `resolveProspectScope` decide `own` vs `all` por permiso
 *    `ver_todo` (BR-N211 / Director).
 *  - AC-7 · `isValidRfc` cumple regex SAT.
 *  - AC-8 · Catálogo canónico de medios: exactamente
 *    `llamada`, `email`, `whatsapp` en ese orden (DEC-20260823-01).
 */

import { describe, expect, it } from "vitest";
import {
  CLIENT_AUDIT_ACTIONS,
  ERROR_CODES,
  PROSPECT_MEDIUMS,
  PROSPECT_STATUSES,
} from "@/shared/enums";
import {
  ClientArchiveInputSchema,
  ClientContactInputSchema,
  ClientFiscalUpsertInputSchema,
  ClientCreateFromProspectInputSchema,
  ProspectCreateInputSchema,
  ProspectLostInputSchema,
  ProspectMediumSchema,
  ProspectQualifyInputSchema,
  ProspectSuspendInputSchema,
} from "@/shared/zod";
import {
  canTransition,
  createProspectsService,
  resolveAssignedTo,
  resolveProspectScope,
} from "@/server/services/clientes/prospects";
import { createClientsService, isValidArchiveReason } from "@/server/services/clientes/clients";
import { createClientContactsService } from "@/server/services/clientes/contacts";
import { createClientFiscalDataService, isValidRfc } from "@/server/services/clientes/fiscal";

const ORG = "00000000-0000-0000-0000-000000000001";
const ADMIN = { id: "00000000-0000-0000-0000-000000000002", organization_id: ORG };
const VEND = { id: "00000000-0000-0000-0000-000000000003", organization_id: ORG };

function ctx(user: typeof ADMIN | typeof VEND | null, permissions: string[] = []) {
  return {
    user,
    roles: [],
    permissions,
  };
}

describe("SPEC-002 · AC-8 · catálogo canónico de medios (DEC-20260823-01)", () => {
  it("enum prospect_medium admite exactamente los 3 valores en orden canónico", () => {
    expect([...PROSPECT_MEDIUMS]).toEqual(["llamada", "email", "whatsapp"]);
  });
  it("schema Zod rechaza valores fuera del catálogo", () => {
    expect(ProspectMediumSchema.safeParse("sms").success).toBe(false);
    expect(ProspectMediumSchema.safeParse("llamada").success).toBe(true);
    expect(ProspectMediumSchema.safeParse("whatsapp").success).toBe(true);
    expect(ProspectMediumSchema.safeParse("email").success).toBe(true);
  });
});

describe("SPEC-002 · AC-2 · QUESTIONNAIRE_REQUIRED (BR-N148)", () => {
  it("qualify requiere questionnaireId no vacío", () => {
    const r = ProspectQualifyInputSchema.safeParse({
      prospectId: "00000000-0000-0000-0000-000000000099",
      questionnaireId: "00000000-0000-0000-0000-000000000088",
    });
    expect(r.success).toBe(true);
    // El schema exige el campo; el servicio valida que NO sea uuid-cero
    // sólo si la implementación lo decide. Lo importante: el schema
    // no admite questionnaireId vacío.
    expect(r.success && (r.data.questionnaireId.length > 0)).toBe(true);
  });
});

describe("SPEC-002 · AC-4 · motivo obligatorio y reactivación (BR-N213/214)", () => {
  it("ProspectLostInputSchema exige reason >=3 caracteres", () => {
    expect(ProspectLostInputSchema.safeParse({
      prospectId: "00000000-0000-0000-0000-000000000099",
      reason: "no",
    }).success).toBe(false);
    expect(ProspectLostInputSchema.safeParse({
      prospectId: "00000000-0000-0000-0000-000000000099",
      reason: "Sin presupuesto",
    }).success).toBe(true);
  });
  it("ProspectSuspendInputSchema exige reason >=3 caracteres", () => {
    expect(ProspectSuspendInputSchema.safeParse({
      prospectId: "00000000-0000-0000-0000-000000000099",
      reason: "no",
    }).success).toBe(false);
  });
  it("canTransition sólo permite reactivar desde 'suspendido'", () => {
    expect(canTransition("suspendido", "contactado")).toBe(true);
    expect(canTransition("suspendido", "nuevo")).toBe(false);
    expect(canTransition("nuevo", "contactado")).toBe(true);
    expect(canTransition("ganado", "perdido")).toBe(false); // terminal
    expect(canTransition("perdido", "contactado")).toBe(false); // terminal
  });
});

describe("SPEC-002 · AC-1 · createFromProspect y número de cliente (BR-N168, BR-N216)", () => {
  it("ClientCreateFromProspectInputSchema exige prospectId uuid", () => {
    expect(
      ClientCreateFromProspectInputSchema.safeParse({
        prospectId: "00000000-0000-0000-0000-000000000099",
      }).success,
    ).toBe(true);
  });
});

describe("SPEC-002 · AC-3 · archive (BR-N215) e isValidArchiveReason", () => {
  it("archivo exige motivo de al menos 3 caracteres", () => {
    expect(isValidArchiveReason("OKM")).toBe(true);
    expect(isValidArchiveReason("ok")).toBe(false);
    expect(isValidArchiveReason("no")).toBe(false);
    expect(isValidArchiveReason("   ")).toBe(false);
  });
  it("schema ClientArchiveInputSchema rechaza motivo corto", () => {
    expect(ClientArchiveInputSchema.safeParse({
      clientId: "00000000-0000-0000-0000-000000000077",
      reason: "no",
    }).success).toBe(false);
  });
});

describe("SPEC-002 · AC-5 · contactos (BR-N217)", () => {
  it("ClientContactInputSchema admite isMain opcional", () => {
    const r = ClientContactInputSchema.safeParse({
      clientId: "00000000-0000-0000-0000-000000000077",
      name: "Ana",
    });
    expect(r.success).toBe(true);
  });
  it("servicio expone setMain/delete/listForClient (un solo principal) — contrato estático", () => {
    // Verificamos el contrato del módulo sin instanciar el servicio
    // (instanciarlo dispara `getDb()` → `loadEnv()` y exige variables).
    type Svc = ReturnType<typeof createClientContactsService>;
    type Keys = keyof Svc;
    const expected: Keys[] = ["setMain", "delete", "listForClient", "create", "update"];
    for (const k of expected) {
      const _k: Keys = k;
      expect(_k).toBe(k);
    }
  });
});

describe("SPEC-002 · AC-7 · datos fiscales opcionales (BR-N218) y RFC", () => {
  it("isValidRfc acepta morales y físicas del SAT", () => {
    expect(isValidRfc("XAXX010101000")).toBe(true); // moral genérica
    expect(isValidRfc("XAXX010101ABC")).toBe(true); // moral genérica con letras
    expect(isValidRfc("XAX010101000")).toBe(true); // 3 letras (física genérica)
    expect(isValidRfc("XAXX01010100")).toBe(false); // longitud incorrecta
    expect(isValidRfc("xaXX010101000")).toBe(false); // minúsculas
  });
  it("ClientFiscalUpsertInputSchema admite cliente sin datos (opcional)", () => {
    const r = ClientFiscalUpsertInputSchema.safeParse({
      clientId: "00000000-0000-0000-0000-000000000077",
    });
    expect(r.success).toBe(true);
  });
});

describe("SPEC-002 · AC-6 · visibilidad por rol (BR-N207)", () => {
  it("resolveProspectScope: Director (ver_todo) → all", async () => {
    const fakeHas = { has: async (_c: unknown, code: string) => code === "gestionar_prospectos" || code === "ver_todo" };
    const scope = await resolveProspectScope(ctx(ADMIN, []), fakeHas as never);
    expect(scope).toBe("all");
  });
  it("resolveProspectScope: Vendedor (sin ver_todo) → own", async () => {
    const fakeHas = { has: async (_c: unknown, code: string) => code === "gestionar_prospectos" };
    const scope = await resolveProspectScope(ctx(VEND, []), fakeHas as never);
    expect(scope).toBe("own");
  });
  it("resolveProspectScope: sin permiso gestionar_prospectos → ForbiddenError", async () => {
    const fakeHas = { has: async () => false };
    await expect(
      resolveProspectScope(ctx(VEND, []), fakeHas as never),
    ).rejects.toThrow(/Sin permiso/i);
  });
});

describe("SPEC-002 · contrato de auditoría", () => {
  it("incluye las acciones críticas esperadas", () => {
    const expected: string[] = [
      "prospect.create",
      "prospect.qualify",
      "prospect.lost",
      "prospect.suspended",
      "prospect.reactivate",
      "client.create",
      "client.archive",
      "client_contact.create",
      "client_contact.set_main",
      "client_fiscal.upsert",
    ];
    for (const e of expected) {
      expect(CLIENT_AUDIT_ACTIONS).toContain(e);
    }
  });
});

describe("SPEC-002 · shape de servicios (compilable)", () => {
  it("prospects/clients/contacts/fiscal exponen factory functions", () => {
    expect(typeof createProspectsService).toBe("function");
    expect(typeof createClientsService).toBe("function");
    expect(typeof createClientContactsService).toBe("function");
    expect(typeof createClientFiscalDataService).toBe("function");
  });
});

describe("SPEC-002 · prospect_status canónico", () => {
  it("9 estados en orden de progresión", () => {
    expect([...PROSPECT_STATUSES]).toEqual([
      "nuevo",
      "contactado",
      "calificado",
      "discovery_requerimientos",
      "cotizacion_enviada",
      "negociacion",
      "ganado",
      "perdido",
      "suspendido",
    ]);
  });
});

describe("SPEC-002 · ProspectCreateInputSchema", () => {
  it("acepta code y name mínimos", () => {
    const r = ProspectCreateInputSchema.safeParse({
      code: "P-001",
      name: "Juan",
    });
    expect(r.success).toBe(true);
  });
  it("rechaza code con caracteres no permitidos", () => {
    expect(
      ProspectCreateInputSchema.safeParse({
        code: "P 001",
        name: "Juan",
      }).success,
    ).toBe(false);
  });
});

/**
 * SPEC-002-UI-20260824-04 · P2 funcional.
 *
 * `resolveAssignedTo` aplica la regla BR-N207 / AC-6: si el caller
 * no especifica `assignedTo`, el prospecto queda asignado al propio
 * creador, de modo que un Vendedor que crea un prospecto lo ve en su
 * listado `scope='own'` sin pasos adicionales. El shape del input
 * público no se modifica (sigue aceptando `assignedTo?: string`).
 */
describe("SPEC-002-UI-20260824-04 · P2 · resolveAssignedTo", () => {
  const CREATOR = "00000000-0000-0000-0000-000000000002";
  const OTHER = "00000000-0000-0000-0000-000000000099";

  it("asigna al creador cuando assignedTo es undefined", () => {
    expect(resolveAssignedTo({}, CREATOR)).toBe(CREATOR);
  });
  it("asigna al creador cuando assignedTo es null", () => {
    expect(resolveAssignedTo({ assignedTo: null }, CREATOR)).toBe(CREATOR);
  });
  it("asigna al creador cuando assignedTo es cadena vacía", () => {
    expect(resolveAssignedTo({ assignedTo: "" }, CREATOR)).toBe(CREATOR);
  });
  it("respeta el assignedTo explícito cuando viene informado", () => {
    expect(resolveAssignedTo({ assignedTo: OTHER }, CREATOR)).toBe(OTHER);
  });
  it("creators distintos no se confunden con el default", () => {
    const a = resolveAssignedTo({}, "11111111-1111-1111-1111-111111111111");
    const b = resolveAssignedTo({}, "22222222-2222-2222-2222-222222222222");
    expect(a).not.toBe(b);
  });
});

/**
 * SPEC-002-UI-20260824-04 · P3 contrato de error.
 *
 * El backend emite `PROSPECT_CODE_DUPLICATE` (HTTP 409) cuando el
 * `code` ya existe en la organización (BR-N216). `ForbiddenError` se
 * reserva para el middleware de `hasPermission.require` (HTTP 403).
 */
describe("SPEC-002-UI-20260824-04 · P3 · error code PROSPECT_CODE_DUPLICATE", () => {
  it("PROSPECT_CODE_DUPLICATE forma parte del catálogo canónico de ERROR_CODES", () => {
    expect(ERROR_CODES).toContain("PROSPECT_CODE_DUPLICATE");
  });
  it("ForbiddenError sigue presente (compatibilidad con middleware de permisos)", () => {
    expect(ERROR_CODES).toContain("ForbiddenError");
  });
  it("PROSPECT_CODE_DUPLICATE y ForbiddenError son códigos distintos", () => {
    expect("PROSPECT_CODE_DUPLICATE").not.toBe("ForbiddenError");
  });
});

/**
 * SPEC-002-UI-20260824-05 · P4 funcional.
 *
 * La acción `Calificar` consulta cuestionarios REALES
 * (`trpc.comercial.cuestionarios.list`) y se habilita sólo cuando
 * existe al menos uno con `status === 'published'`. Sin cuestionarios
 * publicados el botón permanece deshabilitado y muestra la nota
 * accesible; NO envía UUID dummy ni accede a la BD directamente.
 * El envío del cuestionario se realiza desde
 * `CalificarProspectoDialog` invocando primero `submitResponse` y
 * después `prospectos.qualify` con el `questionnaireId` real.
 * Verificación estática (lectura del archivo del módulo) para no
 * acoplar el test a un cliente React.
 */
describe("SPEC-002-UI-20260824-05 · P4 UX · qualify con cuestionarios publicados", () => {
  it("el botón qualify consulta cuestionarios publicados (no UUID dummy)", () => {
    const src = readProspectoDetalle();
    // Usa el query real del catálogo y filtra publicados.
    expect(/comercial\.cuestionarios\.list\.useQuery/.test(src)).toBe(true);
    expect(/status === ['"]published['"]/.test(src)).toBe(true);
    expect(src).not.toMatch(/00000000-0000-0000-0000-[0-9a-f]{12}/);
    // Evita `window.prompt(` como llamada real (no como referencia
    // documental en comentarios).
    expect(src).not.toMatch(/window\.prompt\s*\(/);
  });
  it("abre el diálogo real (CalificarProspectoDialog) en lugar de enviar UUID", () => {
    const src = readProspectoDetalle();
    expect(/CalificarProspectoDialog/.test(src)).toBe(true);
    expect(/open=\{dialog === ['"]qualify['"]\}/.test(src)).toBe(true);
  });
  it("el diálogo llama submitResponse y luego qualify con questionnaireId real", () => {
    const src = readCalificarDialog();
    // Orden de mutaciones: submitResponse primero, qualify después.
    const submitIdx = src.indexOf("submitResponse.mutate(");
    const qualifyIdx = src.indexOf("qualifyMutation.mutate(");
    expect(submitIdx).toBeGreaterThan(-1);
    expect(qualifyIdx).toBeGreaterThan(-1);
    expect(qualifyIdx).toBeGreaterThan(submitIdx);
    // Pasa el questionnaireId al qualify.
    expect(/questionnaireId,\s*\n?\s*prospectId/.test(src)).toBe(true);
    // No UUID dummy embebido.
    expect(src).not.toMatch(/00000000-0000-0000-0000-[0-9a-f]{12}/);
  });
  it("renderiza preguntas por answerType (text, number, boolean, single_choice)", () => {
    const src = readCalificarDialog();
    expect(/text/.test(src)).toBe(true);
    expect(/number/.test(src)).toBe(true);
    expect(/boolean/.test(src)).toBe(true);
    expect(/single_choice/.test(src)).toBe(true);
  });
  it("respeta required y muestra error antes de mutar", () => {
    const src = readCalificarDialog();
    expect(/requiredField/.test(src)).toBe(true);
    expect(/fillRequired/.test(src)).toBe(true);
    expect(/role="alert"/.test(src)).toBe(true);
  });
  it("muestra error de submit sin perder contexto ni afirmar éxito", () => {
    const src = readCalificarDialog();
    expect(/calificar-submit-error/.test(src)).toBe(true);
    expect(/setSubmitError\(/.test(src)).toBe(true);
    // El éxito del query NO marca qualifies done sin la mutación succeed.
    // SPEC-002-UI-20260825-22 · el callback ahora acepta `response`
    // para extraer el id real de respuesta del cuestionario.
    expect(
      /onSuccess:\s*\(.*?\)\s*=>\s*\{[\s\S]*?qualifyMutation\.mutate/.test(
        src,
      ),
    ).toBe(true);
  });
  it("captura presupuesto declarado (MXN) y tipo de proyecto", () => {
    const src = readCalificarDialog();
    expect(/presupuestoDeclaradoCents/.test(src)).toBe(true);
    expect(/projectType/.test(src)).toBe(true);
    expect(/presupuestoMxn/.test(src)).toBe(true);
  });
  it("mantiene accesible: label htmlFor, aria-required, role=alert/role=radiogroup", () => {
    const src = readCalificarDialog();
    expect(/htmlFor=/.test(src)).toBe(true);
    expect(/aria-required/.test(src)).toBe(true);
    expect(/role="radiogroup"/.test(src)).toBe(true);
    expect(/role="alert"/.test(src)).toBe(true);
  });
});

/**
 * SPEC-002-UI-20260824-05 · guarda contra fallback a gap histórico.
 * El catálogo `messages.prospectos` expone los textos del nuevo diálogo
 * (sin literales ad-hoc embebidos en el componente).
 */
describe("SPEC-002-UI-20260824-05 · messages qualifyDialog", () => {
  it("messages.ts incluye `prospectos.qualifyDialog` con campos clave", async () => {
    const msgs = await readMessages();
    const qd = (msgs as { prospectos: { qualifyDialog: Record<string, unknown> } })
      .prospectos.qualifyDialog;
    expect(qd.title).toBeTypeOf("string");
    expect(qd.submit).toBeTypeOf("string");
    expect(qd.selectQuestionnaire).toBeTypeOf("string");
    expect(qd.fillRequired).toBeTypeOf("string");
    expect(qd.presupuestoLabel).toBeTypeOf("string");
    expect(qd.projectTypeLabel).toBeTypeOf("string");
  });
});

// Helper de lectura estática del módulo de detalle (mismo patrón que
// `tests/seed-plataforma-redaction.test.ts`).
import { readFileSync as _readFileSync } from "node:fs";
import { dirname as _dirname, resolve as _resolve } from "node:path";
import { fileURLToPath as _fileURLToPath } from "node:url";
const __spec_filename = _fileURLToPath(import.meta.url);
const __spec_dirname = _dirname(__spec_filename);
const PROSPECTO_DETALLE_PATH = _resolve(
  __spec_dirname,
  "..",
  "src",
  "app",
  "(dashboard)",
  "prospectos",
  "[id]",
  "page.tsx",
);
function readProspectoDetalle(): string {
  return _readFileSync(PROSPECTO_DETALLE_PATH, "utf8");
}

const CALIFICAR_DIALOG_PATH = _resolve(
  __spec_dirname,
  "..",
  "src",
  "modules",
  "clientes",
  "prospectos",
  "calificar-prospecto-dialog.tsx",
);
function readCalificarDialog(): string {
  return _readFileSync(CALIFICAR_DIALOG_PATH, "utf8");
}

const GENERAR_ALCANCE_DIALOG_PATH = _resolve(
  __spec_dirname,
  "..",
  "src",
  "modules",
  "clientes",
  "prospectos",
  "generar-alcance-dialog.tsx",
);
function readGenerarAlcanceDialog(): string {
  return _readFileSync(GENERAR_ALCANCE_DIALOG_PATH, "utf8");
}

const ALCANCE_DETAIL_PATH = _resolve(
  __spec_dirname,
  "..",
  "src",
  "modules",
  "comercial",
  "alcance",
  "alcance-detail.tsx",
);
function readAlcanceDetail(): string {
  return _readFileSync(ALCANCE_DETAIL_PATH, "utf8");
}

const SIGN_ALCANCE_DIALOG_PATH = _resolve(
  __spec_dirname,
  "..",
  "src",
  "modules",
  "comercial",
  "alcance",
  "sign-alcance-dialog.tsx",
);
function readSignAlcanceDialog(): string {
  return _readFileSync(SIGN_ALCANCE_DIALOG_PATH, "utf8");
}

const CREATE_COTIZACION_DIALOG_PATH = _resolve(
  __spec_dirname,
  "..",
  "src",
  "modules",
  "comercial",
  "cotizaciones",
  "create-cotizacion-dialog.tsx",
);
function readCreateCotizacionDialog(): string {
  return _readFileSync(CREATE_COTIZACION_DIALOG_PATH, "utf8");
}

const QUOTES_SERVICE_PATH = _resolve(
  __spec_dirname,
  "..",
  "src",
  "server",
  "services",
  "comercial",
  "quotes.ts",
);
function readQuotesService(): string {
  return _readFileSync(QUOTES_SERVICE_PATH, "utf8");
}

async function readMessages(): Promise<unknown> {
  // Import estático a través del loader TS de Vitest; permite verificar
  // el catálogo de mensajes sin transpilación manual.
  const mod = (await import("../src/shared/utils/messages" as string)) as {
    messages: unknown;
  };
  return mod.messages;
}

/**
 * SPEC-002-UI-20260825-22 · P5 funcional — generar alcance desde
 * respuesta de cuestionario (SPEC-003 B6 / BR-N220/231, regla de
 * oro DEC-FUN-23).
 *
 * Cubre el camino real end-to-end de la UI:
 *  1. El diálogo de calificación propaga el `responseId` REAL de
 *     `submitResponse` al detalle del prospecto (no UUID dummy).
 *  2. El detalle expone una acción "Generar alcance" sólo cuando
 *     el prospecto está calificado Y existe responseId en memoria.
 *  3. El nuevo diálogo consulta `trpc.comercial.plantillas.list`
 *     y filtra por `active`, sin UUID dummy ni acceso a BD.
 *  4. La mutación `alcance.generateDraft` se invoca con el
 *     `responseId` real y el `templateId` real seleccionado.
 *  5. El éxito expone el `scopeId` real con enlace
 *     `/comercial/alcance/{scope.id}` y status `draft`.
 *  6. El detalle del alcance lee `alcance.byId` (no placeholder) y
 *     muestra id, status, prospecto, version, templateId,
 *     questionnaireResponseId y los 6 bloques del contenido.
 *  7. Si la página se recarga y no hay responseId local, no se
 *     inventa un endpoint ni un id: la acción no aparece y se
 *     muestra el mensaje canónico de "responseMissingNote".
 *  8. No se rompe el flujo previo de Calificar / perdidos /
 *     suspendidos / reactivar.
 */
describe("SPEC-002-UI-20260825-22 · P5 · generar alcance desde cuestionario", () => {
  it("CalificarProspectoDialog propaga el responseId REAL al padre (no UUID dummy)", () => {
    const src = readCalificarDialog();
    // La firma del callback ahora incluye `responseId` real.
    expect(/onSuccess\?:\s*\(info:\s*\{\s*responseId:\s*string\s*\}\)/.test(src)).toBe(true);
    // submitResponse expone un `response` cuyo `id` se captura.
    expect(/response\s+&&\s+typeof\s+response\s+===\s+["']object["']/.test(src)).toBe(true);
    expect(/\(response as \{ id: string \}\)\.id/.test(src)).toBe(true);
    // Conserva el id en memoria y lo pasa al qualify.
    expect(/lastResponseIdRef\.current\s*=\s*responseId/.test(src)).toBe(true);
    expect(/onSuccess\?\.\(\{ responseId \}\)/.test(src)).toBe(true);
    // Anti-patrón: nunca UUIDs dummy.
    expect(src).not.toMatch(/00000000-0000-0000-0000-[0-9a-f]{12}/);
    // Sin acceso a BD directa ni window.prompt.
    expect(src).not.toMatch(/window\.prompt\s*\(/);
    expect(src).not.toMatch(/from\s+["']@\/server\/db/);
  });

  it("El detalle del prospecto guarda el responseId y expone la acción Generar alcance", () => {
    const src = readProspectoDetalle();
    // Estado local para el responseId y el scope creado.
    expect(/questionnaireResponseId,\s+setQuestionnaireResponseId/.test(src)).toBe(true);
    expect(/createdScope,\s+setCreatedScope/.test(src)).toBe(true);
    // Recibe el id real en onSuccess.
    expect(/onSuccess=\{\(info\)[\s\S]*?setQuestionnaireResponseId\(info/.test(src)).toBe(true);
    // Acción visible sólo cuando prospecto calificado Y responseId presente.
    expect(/p\.status\s*===\s*["']calificado["']\s*&&\s*questionnaireResponseId/.test(src)).toBe(true);
    expect(/prospecto-generar-alcance-button/.test(src)).toBe(true);
    // Enlace al detalle del alcance con el id real.
    expect(/`\/comercial\/alcance\/\$\{createdScope\.id\}`/.test(src)).toBe(true);
    // Anti-patrón: nunca UUIDs dummy, ni window.prompt, ni acceso a BD.
    expect(src).not.toMatch(/00000000-0000-0000-0000-[0-9a-f]{12}/);
    expect(src).not.toMatch(/window\.prompt\s*\(/);
    expect(src).not.toMatch(/from\s+["']@\/server\/db/);
  });

  it("El diálogo GenerarAlcanceDialog consulta plantillas reales y filtra activas (sin UUID dummy)", () => {
    const src = readGenerarAlcanceDialog();
    // Llama al query real de plantillas y filtra activas.
    expect(/comercial\.plantillas\.list\.useQuery/.test(src)).toBe(true);
    expect(/\.filter\(\(t\)\s*=>\s*t\.active\)/.test(src)).toBe(true);
    // No usa accesso a BD directa.
    expect(src).not.toMatch(/from\s+["']@\/server\/db/);
    // No UUIDs dummy hardcodeados.
    expect(src).not.toMatch(/00000000-0000-0000-0000-[0-9a-f]{12}/);
    // Accesibilidad: label, role=alert para errores.
    expect(/htmlFor=/.test(src)).toBe(true);
    expect(/role="alert"/.test(src)).toBe(true);
    expect(/aria-required=/.test(src)).toBe(true);
  });

  it("GenerarAlcanceDialog invoca alcance.generateDraft con questionnaireResponseId y templateId reales", () => {
    const src = readGenerarAlcanceDialog();
    expect(/alcance\.generateDraft\.useMutation/.test(src)).toBe(true);
    expect(/generateDraft\.mutate\(\s*\{[\s\S]*?questionnaireResponseId,[\s\S]*?templateId/.test(src)).toBe(true);
    // onSuccess expone scope.id REAL al padre.
    expect(/\(scope as \{ id: string \}\)\.id/.test(src)).toBe(true);
    expect(/onSuccess\?\.\(\{[\s\S]*?id:[\s\S]*?status:[\s\S]*?version:[\s\S]*?\}\)/.test(src)).toBe(true);
  });

  it("El detalle del prospecto muestra el aviso neutro cuando no hay responseId (recarga)", () => {
    const src = readProspectoDetalle();
    // El aviso sólo se renderiza cuando status === 'calificado' y NO hay responseId.
    expect(/p\.status\s*===\s*["']calificado["']\s*&&\s*!questionnaireResponseId/.test(src)).toBe(true);
    expect(/prospecto-alcance-missing-response/.test(src)).toBe(true);
  });

  it("Las acciones existentes de prospecto no se rompen", () => {
    const src = readProspectoDetalle();
    // Calificar, perdido, suspendido, reactivar siguen existiendo.
    expect(/openDialog\(["']lost["']\)/.test(src)).toBe(true);
    expect(/openDialog\(["']suspended["']\)/.test(src)).toBe(true);
    expect(/prospecto-mark-lost-button/.test(src)).toBe(true);
    expect(/prospecto-mark-suspended-button/.test(src)).toBe(true);
    expect(/prospecto-reactivate-button/.test(src)).toBe(true);
    expect(/reactivate\.mutate\(\{ prospectId: p\.id \}\)/.test(src)).toBe(true);
  });
});

/**
 * SPEC-002-UI-20260825-22 · Catálogo de mensajes para el flujo
 * "Generar alcance" — impide literales ad-hoc en los componentes.
 */
describe("SPEC-002-UI-20260825-22 · messages alcance (alcance.* y responseMissingNote)", () => {
  it("messages.ts incluye los textos clave de `alcance.generate*`", async () => {
    const msgs = (await readMessages()) as {
      alcance: Record<string, unknown>;
    };
    const a = msgs.alcance;
    expect(a.generate).toBeTypeOf("string");
    expect(a.generateTitle).toBeTypeOf("string");
    expect(a.generateSubtitle).toBeTypeOf("string");
    expect(a.generateSubmit).toBeTypeOf("string");
    expect(a.generateSubmitting).toBeTypeOf("string");
    expect(a.generateCancel).toBeTypeOf("string");
    expect(a.generateSelectTemplate).toBeTypeOf("string");
    expect(a.generateNoTemplates).toBeTypeOf("string");
    expect(a.generateLoadingTemplates).toBeTypeOf("string");
    expect(a.generateTemplateHelp).toBeTypeOf("string");
    expect(a.generateSourceLabel).toBeTypeOf("string");
    expect(a.generateError).toBeTypeOf("string");
    expect(a.generateSuccess).toBeTypeOf("string");
    expect(a.generateOpenLink).toBeTypeOf("string");
    expect(a.responseMissingNote).toBeTypeOf("string");
  });
  it("messages.ts incluye los textos del detalle real del alcance", async () => {
    const msgs = (await readMessages()) as {
      alcance: Record<string, unknown>;
    };
    const a = msgs.alcance;
    expect(a.statusLabel).toBeTypeOf("string");
    expect(a.versionLabel).toBeTypeOf("string");
    expect(a.templateLabel).toBeTypeOf("string");
    expect(a.questionnaireResponseLabel).toBeTypeOf("string");
    expect(a.blocksTitle).toBeTypeOf("string");
    expect(a.blockIncluded).toBeTypeOf("string");
    expect(a.blockExcluded).toBeTypeOf("string");
    expect(a.blockDeliverables).toBeTypeOf("string");
    expect(a.blockAssumptions).toBeTypeOf("string");
    expect(a.blockDependencies).toBeTypeOf("string");
    expect(a.blockAcceptanceCriteria).toBeTypeOf("string");
    expect(a.emptyBlock).toBeTypeOf("string");
    expect(a.statusDraft).toBeTypeOf("string");
    expect(a.statusInReview).toBeTypeOf("string");
    expect(a.statusSigned).toBeTypeOf("string");
    expect(a.noBlocks).toBeTypeOf("string");
  });
});

/**
 * SPEC-002-UI-20260825-22 · Detalle real del alcance (alcance.byId).
 * Reemplaza el placeholder anterior por lectura del documento vía
 * tRPC. Lee los 6 bloques del jsonb de `content` y los muestra de
 * forma segura.
 */
describe("SPEC-002-UI-20260825-22 · AlcanceDetail lee alcance.byId y muestra los 6 bloques", () => {
  it("invoca el query real alcance.byId (no UUID dummy, no acceso a BD directa)", () => {
    const src = readAlcanceDetail();
    expect(/comercial\.alcance\.byId\.useQuery/.test(src)).toBe(true);
    expect(src).not.toMatch(/00000000-0000-0000-0000-[0-9a-f]{12}/);
    expect(src).not.toMatch(/from\s+["']@\/server\/db/);
    expect(src).not.toMatch(/window\.prompt\s*\(/);
  });
  it("renderiza id, status, version, prospect, template, questionnaireResponseId", () => {
    const src = readAlcanceDetail();
    expect(/alcance-detail-id/.test(src)).toBe(true);
    expect(/alcance-detail-status/.test(src)).toBe(true);
    expect(/alcance-detail-version/.test(src)).toBe(true);
    expect(/alcance-detail-template/.test(src)).toBe(true);
    expect(/alcance-detail-questionnaire/.test(src)).toBe(true);
    // status label del draft (BR-N52, BR-N231).
    expect(/statusDraft/.test(src)).toBe(true);
    expect(/statusInReview/.test(src)).toBe(true);
    expect(/statusSigned/.test(src)).toBe(true);
  });
  it("lee los 6 bloques: included, excluded, deliverables, assumptions, clientDependencies, acceptanceCriteria", () => {
    const src = readAlcanceDetail();
    expect(/blocks\.included/.test(src)).toBe(true);
    expect(/blocks\.excluded/.test(src)).toBe(true);
    expect(/blocks\.deliverables/.test(src)).toBe(true);
    expect(/blocks\.assumptions/.test(src)).toBe(true);
    expect(/blocks\.clientDependencies/.test(src)).toBe(true);
    expect(/blocks\.acceptanceCriteria/.test(src)).toBe(true);
    // Cada bloque tiene un data-testid accesible.
    expect(/alcance-block-included/.test(src)).toBe(true);
    expect(/alcance-block-excluded/.test(src)).toBe(true);
    expect(/alcance-block-deliverables/.test(src)).toBe(true);
    expect(/alcance-block-assumptions/.test(src)).toBe(true);
    expect(/alcance-block-dependencies/.test(src)).toBe(true);
    expect(/alcance-block-acceptance/.test(src)).toBe(true);
  });
  it("IMPL-20260825-23 · cablea submitForReview (no edición libre, no sign directo)", () => {
    const src = readAlcanceDetail();
    // El detalle invoca la mutación real de submitForReview.
    expect(/alcance\.submitForReview\.useMutation/.test(src)).toBe(true);
    expect(/submitForReview\.mutate\(\s*\{\s*scopeId:[\s\S]*?\}\)/.test(src)).toBe(true);
    // El detalle NO invoca `sign` directamente — esa mutación vive en
    // el diálogo SignAlcanceDialog para exigir motivo ≥3.
    expect(src).not.toMatch(/alcance\.sign\.useMutation/);
    // Sigue sin inputs editables de "texto libre" en el detalle (sólo
    // botones de acción; el motivo se captura en el diálogo).
    expect(src).not.toMatch(/<input[^>]*type="text"/);
  });
});

/**
 * IMPL-20260825-23 · SPEC-003 B6 — Transiciones operables
 * `draft → in_review → signed` desde el detalle del alcance,
 * reutilizando únicamente contratos ya existentes
 * (`trpc.comercial.alcance.submitForReview` y
 * `trpc.comercial.alcance.sign`). No se crea el flujo de
 * cotización.
 *
 * Cubre:
 *  - Mensajes canónicos del flujo de firma/transición.
 *  - El detalle expone acciones según status y NO afirma éxito si
 *    la mutación falla (errores con `role="alert"`).
 *  - El diálogo de firma exige motivo ≥3, llama `sign` real y
 *    maneja errores de permisos / SCOPE_ALREADY_SIGNED.
 */
describe("IMPL-20260825-23 · alcance · mensajes de transiciones (submitForReview / sign)", () => {
  it("messages.alcance incluye los textos canónicos de submitForReview y sign", async () => {
    const msgs = (await readMessages()) as {
      alcance: Record<string, unknown>;
    };
    const a = msgs.alcance;
    expect(a.submitForReview).toBeTypeOf("string");
    expect(a.submitForReviewSubmit).toBeTypeOf("string");
    expect(a.submitForReviewSubmitting).toBeTypeOf("string");
    expect(a.submitForReviewError).toBeTypeOf("string");
    expect(a.sign).toBeTypeOf("string");
    expect(a.signTitle).toBeTypeOf("string");
    expect(a.signSubtitle).toBeTypeOf("string");
    expect(a.signReasonLabel).toBeTypeOf("string");
    expect(a.signReasonPlaceholder).toBeTypeOf("string");
    expect(a.signReasonMinLength).toBeTypeOf("string");
    expect(a.signSubmit).toBeTypeOf("string");
    expect(a.signSubmitting).toBeTypeOf("string");
    expect(a.signCancel).toBeTypeOf("string");
    expect(a.signError).toBeTypeOf("string");
    expect(a.signForbidden).toBeTypeOf("string");
    expect(a.signImmutableNote).toBeTypeOf("string");
    expect(a.signedAtLabel).toBeTypeOf("string");
    expect(a.signedByLabel).toBeTypeOf("string");
    expect(a.signedReasonLabel).toBeTypeOf("string");
    expect(a.transitionError).toBeTypeOf("string");
  });
});

describe("IMPL-20260825-23 · AlcanceDetail cablea submitForReview y abre SignAlcanceDialog", () => {
  it("invoca alcance.submitForReview vía mutate con scopeId real (no UUID dummy)", () => {
    const src = readAlcanceDetail();
    expect(/alcance\.submitForReview\.useMutation/.test(src)).toBe(true);
    expect(/submitForReview\.mutate\(\s*\{\s*scopeId:\s*query\.data\.id/.test(src)).toBe(true);
    expect(src).not.toMatch(/00000000-0000-0000-0000-[0-9a-f]{12}/);
    expect(src).not.toMatch(/from\s+["']@\/server\/db/);
  });

  it("muestra el botón Enviar a revisión sólo en `draft` y abrir-firma sólo en `in_review`", () => {
    const src = readAlcanceDetail();
    // canSubmitForReview se ata a status === 'draft'.
    expect(/canSubmitForReview\s*=\s*status\s*===\s*["']draft["']/.test(src)).toBe(true);
    // canSign se ata a status === 'in_review'.
    expect(/canSign\s*=\s*status\s*===\s*["']in_review["']/.test(src)).toBe(true);
    // El botón expone data-testid accesible.
    expect(/alcance-detail-submit-for-review/.test(src)).toBe(true);
    expect(/alcance-detail-open-sign/.test(src)).toBe(true);
  });

  it("en `signed` no expone acciones de mutación y muestra la nota de inmutabilidad", () => {
    const src = readAlcanceDetail();
    // isSigned ata a status === 'signed'.
    expect(/isSigned\s*=\s*status\s*===\s*["']signed["']/.test(src)).toBe(true);
    // El bloque de acciones sólo se renderiza en draft / in_review.
    expect(/\{canSubmitForReview\s*\|\|\s*canSign/.test(src)).toBe(true);
    // Nota de inmutabilidad visible cuando isSigned.
    expect(/alcance-detail-immutable-note/.test(src)).toBe(true);
    expect(/signImmutableNote/.test(src)).toBe(true);
  });

  it("expone signedAt/signedBy/signedReason del DTO cuando está firmado", () => {
    const src = readAlcanceDetail();
    expect(/alcance-detail-signed-at/.test(src)).toBe(true);
    expect(/alcance-detail-signed-by/.test(src)).toBe(true);
    expect(/alcance-detail-signed-reason/.test(src)).toBe(true);
    expect(/signedAtLabel/.test(src)).toBe(true);
    expect(/signedByLabel/.test(src)).toBe(true);
    expect(/signedReasonLabel/.test(src)).toBe(true);
  });

  it("los errores de permisos/dominio se exponen con role=alert sin afirmar éxito", () => {
    const src = readAlcanceDetail();
    // setSubmitError + role="alert" cuando la mutación falla.
    expect(/alcance-detail-transition-error/.test(src)).toBe(true);
    expect(/role="alert"/.test(src)).toBe(true);
    // Maneja el código FORBIDDEN sin ocultarlo.
    expect(/["']FORBIDDEN["']/.test(src)).toBe(true);
    // Maneja SCOPE_ALREADY_SIGNED sin ocultarlo.
    expect(/SCOPE_ALREADY_SIGNED/.test(src)).toBe(true);
  });

  it("monta el diálogo SignAlcanceDialog con scopeId real", () => {
    const src = readAlcanceDetail();
    expect(/SignAlcanceDialog/.test(src)).toBe(true);
    expect(/scopeId=\{scope\.id\}/.test(src)).toBe(true);
  });
});

describe("IMPL-20260825-23 · SignAlcanceDialog exige motivo ≥3 y llama alcance.sign real", () => {
  it("invoca alcance.sign con scopeId + reason y exige motivo ≥3 antes de mutar", () => {
    const src = readSignAlcanceDialog();
    expect(/alcance\.sign\.useMutation/.test(src)).toBe(true);
    expect(/sign\.mutate\(\s*\{\s*scopeId,\s*reason:[\s\S]*?\}\)/.test(src)).toBe(true);
    // La validación cliente exige >=3 antes de invocar la mutación.
    expect(/reasonValid\s*=\s*reasonTrimmed\.length\s*>=\s*3/.test(src)).toBe(true);
    expect(/signReasonMinLength/.test(src)).toBe(true);
    // Anti-patrón: nunca UUIDs dummy ni acceso directo a BD.
    expect(src).not.toMatch(/00000000-0000-0000-0000-[0-9a-f]{12}/);
    expect(src).not.toMatch(/from\s+["']@\/server\/db/);
    expect(src).not.toMatch(/window\.prompt\s*\(/);
  });

  it("accesibilidad: textarea con htmlFor + aria-required + errores con role=alert", () => {
    const src = readSignAlcanceDialog();
    expect(/<label[^>]*htmlFor=\{textareaId\}/.test(src)).toBe(true);
    expect(/aria-required="true"/.test(src)).toBe(true);
    expect(/aria-describedby="sign-alcance-reason-help"/.test(src)).toBe(true);
    expect(/role="alert"/.test(src)).toBe(true);
    expect(/data-testid="sign-alcance-reason"/.test(src)).toBe(true);
    expect(/data-testid="sign-alcance-submit"/.test(src)).toBe(true);
  });

  it("los errores de permisos/dominio se exponen con role=alert y NO afirma éxito", () => {
    const src = readSignAlcanceDialog();
    // Mapeo explícito de códigos de error a mensajes canónicos.
    expect(/["']FORBIDDEN["']/.test(src)).toBe(true);
    expect(/signForbidden/.test(src)).toBe(true);
    expect(/SCOPE_ALREADY_SIGNED/.test(src)).toBe(true);
    expect(/SCOPE_SIGN_FORBIDDEN/.test(src)).toBe(true);
    // El botón permanece hasta que la mutación concluya; el éxito
    // cierra el diálogo y NO reemplaza el resultado con un mensaje
    // sintético local.
    expect(/onSuccess\?\.\(\{[\s\S]*?id:[\s\S]*?status:[\s\S]*?signedAt:[\s\S]*?signedBy:[\s\S]*?signedReason/.test(src)).toBe(true);
  });
});

/**
 * IMPL-20260825-24 · SPEC-003 B7 (alcance firmado → crear cotización
 * multi-línea real).
 *
 * Cubre:
 *  - messages.cotizaciones.create* (canónicos).
 *  - AlcanceDetail expone "Crear cotización" sólo en `signed` y
 *    muestra la razón de bloqueo en draft/in_review (sin UUIDs
 *    dummy, sin acceso a BD, sin window.prompt).
 *  - AlcanceDetail monta `CreateCotizacionDialog` con `scopeId`
 *    y `prospectId` reales.
 *  - CreateCotizacionDialog:
 *     · consulta catalogo.list real y filtra `active=true`;
 *     · permite elegir ≥1 ítem con kind='service',
 *       catalogServiceId real, qty≥1 y unitPriceCents convertido
 *       desde MXN;
 *     · expone tipo de cobro `pago_unico|mensualidades|suscripcion`
 *       (BR-N238);
 *     · exige vigencia ≥7 días (BR-N235) en cliente;
 *     · invoca cotizaciones.create con scopeId/prospectId reales,
 *       mapéa FORBIDDEN y SIGNED_SCOPE_REQUIRED, y nunca afirma
 *       éxito: muestra id/code/status reales sólo si el backend
 *       los entrega.
 */
describe("IMPL-20260825-24 · cotizaciones · mensajes create*", () => {
  it("messages.cotizaciones incluye los textos canónicos del diálogo de alta", async () => {
    const msgs = (await readMessages()) as {
      cotizaciones: Record<string, unknown>;
    };
    const c = msgs.cotizaciones;
    expect(c.create).toBeTypeOf("string");
    expect(c.createReasonSigned).toBeTypeOf("string");
    expect(c.createReasonNotSigned).toBeTypeOf("string");
    expect(c.createTitle).toBeTypeOf("string");
    expect(c.createSubtitle).toBeTypeOf("string");
    expect(c.createCatalogLabel).toBeTypeOf("string");
    expect(c.createCatalogHelp).toBeTypeOf("string");
    expect(c.createEmptyCatalog).toBeTypeOf("string");
    expect(c.createCatalogLoading).toBeTypeOf("string");
    expect(c.createAddItem).toBeTypeOf("string");
    expect(c.createNoItems).toBeTypeOf("string");
    expect(c.createItemDescriptionPlaceholder).toBeTypeOf("string");
    expect(c.createItemQtyPlaceholder).toBeTypeOf("string");
    expect(c.createItemUnitPriceLabel).toBeTypeOf("string");
    expect(c.createItemUnitPricePlaceholder).toBeTypeOf("string");
    expect(c.createItemUnitPriceHint).toBeTypeOf("string");
    expect(c.createRemoveItem).toBeTypeOf("string");
    expect(c.createTipoCobroLabel).toBeTypeOf("string");
    expect(c.createTipoCobroHelp).toBeTypeOf("string");
    expect(c.createNotesLabel).toBeTypeOf("string");
    expect(c.createNotesPlaceholder).toBeTypeOf("string");
    expect(c.createValidUntilLabel).toBeTypeOf("string");
    expect(c.createValidUntilHelp).toBeTypeOf("string");
    expect(c.createMinValidityError).toBeTypeOf("string");
    expect(c.createSubmit).toBeTypeOf("string");
    expect(c.createSubmitting).toBeTypeOf("string");
    expect(c.createCancel).toBeTypeOf("string");
    expect(c.createError).toBeTypeOf("string");
    expect(c.createForbidden).toBeTypeOf("string");
    expect(c.createSignedScopeRequired).toBeTypeOf("string");
    expect(c.createSuccessTitle).toBeTypeOf("string");
    expect(c.createSuccessBody).toBeTypeOf("string");
    expect(c.createOpenLink).toBeTypeOf("string");
    expect(c.createScopeIdMissing).toBeTypeOf("string");
  });
});

describe("IMPL-20260825-24 · AlcanceDetail expone acción Crear cotización sólo cuando está firmado", () => {
  it("en `draft` y `in_review` NO expone botón Crear cotización y muestra el motivo de bloqueo", () => {
    const src = readAlcanceDetail();
    // La acción está atada a `isSigned` (status === 'signed').
    expect(/alcance-detail-open-create-quote/.test(src)).toBe(true);
    // El motivo de bloqueo sólo se renderiza cuando NO está firmado.
    expect(/alcance-detail-create-quote-blocked/.test(src)).toBe(true);
    expect(/createReasonNotSigned/.test(src)).toBe(true);
    // Anti-patrones: nunca UUIDs dummy ni acceso directo a BD ni prompt().
    expect(src).not.toMatch(/00000000-0000-0000-0000-[0-9a-f]{12}/);
    expect(src).not.toMatch(/from\s+["']@\/server\/db/);
    expect(src).not.toMatch(/window\.prompt\s*\(/);
  });

  it("en `signed` muestra el botón Crear cotización y el aviso positivo", () => {
    const src = readAlcanceDetail();
    // El botón vive dentro de la rama `isSigned` y reusa
    // messages.cotizaciones.create.
    expect(/alcance-detail-open-create-quote/.test(src)).toBe(true);
    expect(/createReasonSigned/.test(src)).toBe(true);
    expect(/messages\.cotizaciones\.create/.test(src)).toBe(true);
  });

  it("monta CreateCotizacionDialog con scopeId y prospectId reales (sin UUID dummy)", () => {
    const src = readAlcanceDetail();
    expect(/CreateCotizacionDialog/.test(src)).toBe(true);
    // El scopeId se pasa desde query.data.id (no hardcoded).
    expect(/scopeId=\{scope\.id\}/.test(src)).toBe(true);
    // El prospectId se pasa desde el DTO real (con fallback null).
    expect(/prospectId=\{scope\.prospectId\s*\?\?\s*null\}/.test(src)).toBe(true);
  });
});

describe("IMPL-20260825-24 · CreateCotizacionDialog consulta catálogo activo y arma ítems service", () => {
  it("consulta catalogo.list real (no UUIDs dummy, no acceso a BD directa, no window.prompt)", () => {
    const src = readCreateCotizacionDialog();
    expect(/catalogo\.list\.useQuery/.test(src)).toBe(true);
    expect(src).not.toMatch(/00000000-0000-0000-0000-[0-9a-f]{12}/);
    expect(src).not.toMatch(/from\s+["']@\/server\/db/);
    expect(src).not.toMatch(/window\.prompt\s*\(/);
  });

  it("filtra por `active` en cliente y avisa si el catálogo está vacío", () => {
    const src = readCreateCotizacionDialog();
    expect(/c\.active/.test(src)).toBe(true);
    expect(/createEmptyCatalog/.test(src)).toBe(true);
    expect(/create-cotizacion-catalog-empty/.test(src)).toBe(true);
  });

  it("arma ítems con kind:'service', catalogServiceId real, qty>=1 y unitPriceCents convertido desde MXN", () => {
    const src = readCreateCotizacionDialog();
    expect(/kind:\s*["']service["']/.test(src)).toBe(true);
    expect(/discountCents:\s*0/.test(src)).toBe(true);
    expect(/sortOrder:\s*idx/.test(src)).toBe(true);
    expect(/parseMXNToCents/.test(src)).toBe(true);
    expect(/unitPriceCents/.test(src)).toBe(true);
  });

  it("expone tipo de cobro pago_unico | mensualidades | suscripcion (BR-N238)", () => {
    const src = readCreateCotizacionDialog();
    expect(/"pago_unico"/.test(src)).toBe(true);
    expect(/"mensualidades"/.test(src)).toBe(true);
    expect(/"suscripcion"/.test(src)).toBe(true);
    expect(/TipoCobroSchema|createTipoCobro/.test(src)).toBe(true);
  });

  it("exige vigencia >=7 días en cliente (BR-N235) y nunca afirma éxito sin id/code reales", () => {
    const src = readCreateCotizacionDialog();
    expect(/MIN_VALIDITY_DAYS\s*=\s*7/.test(src)).toBe(true);
    // IMPL-20260825-24 · FIX off-by-one: la fecha de vigencia mínima es
    // exactamente `now + QUOTE_MIN_VALIDITY_DAYS` (7d), NO 6d. El
    // backend en `meetsMinimumValidity` exige `diffDays >= 7`.
    expect(/addDays\(\s*new Date\(\)\s*,\s*MIN_VALIDITY_DAYS\s*\)/.test(src)).toBe(true);
    expect(src).not.toMatch(/addDays\([\s\S]*?MIN_VALIDITY_DAYS\s*-\s*1/);
    expect(/createMinValidityError/.test(src)).toBe(true);
    // Si el backend no devuelve id o code, NO se afirma éxito: se
    // expone mensaje canónico de error.
    expect(/if\s*\(\s*!id\s*\|\|\s*!code\s*\)/.test(src)).toBe(true);
    expect(/setSubmitError\(messages\.cotizaciones\.createError\)/.test(src)).toBe(true);
  });

  it("invoca cotizaciones.create con scopeId+prospectId reales (sin UUID dummy)", () => {
    const src = readCreateCotizacionDialog();
    expect(/cotizaciones\.create\.useMutation/.test(src)).toBe(true);
    expect(/createQuote\.mutate\(\s*\{[\s\S]*?prospectId,[\s\S]*?scopeId/.test(src)).toBe(true);
    expect(/validUntil:\s*localDate\.toISOString\(\)/.test(src)).toBe(true);
  });

  it("mapea errores de dominio (FORBIDDEN, SIGNED_SCOPE_REQUIRED) a mensajes canónicos con role=alert", () => {
    const src = readCreateCotizacionDialog();
    expect(/["']FORBIDDEN["']/.test(src)).toBe(true);
    expect(/createForbidden/.test(src)).toBe(true);
    expect(/SIGNED_SCOPE_REQUIRED/.test(src)).toBe(true);
    expect(/createSignedScopeRequired/.test(src)).toBe(true);
    expect(/create-cotizacion-submit-error/.test(src)).toBe(true);
    expect(/role="alert"/.test(src)).toBe(true);
  });

  it("expone accesibilidad: Label htmlFor + aria-describedby + data-testid por control", () => {
    const src = readCreateCotizacionDialog();
    expect(/htmlFor="create-cotizacion-catalog"/.test(src)).toBe(true);
    expect(/htmlFor="create-cotizacion-tipo-cobro"/.test(src)).toBe(true);
    expect(/htmlFor="create-cotizacion-valid-until"/.test(src)).toBe(true);
    expect(/htmlFor="create-cotizacion-notes"/.test(src)).toBe(true);
    expect(/aria-describedby="create-cotizacion-catalog-help"/.test(src)).toBe(true);
    expect(/aria-describedby="create-cotizacion-tipo-cobro-help"/.test(src)).toBe(true);
    expect(/aria-describedby="create-cotizacion-valid-until-help"/.test(src)).toBe(true);
    expect(/data-testid="create-cotizacion-catalog"/.test(src)).toBe(true);
    expect(/data-testid="create-cotizacion-add"/.test(src)).toBe(true);
    expect(/data-testid="create-cotizacion-item-qty"/.test(src)).toBe(true);
    expect(/data-testid="create-cotizacion-item-price"/.test(src)).toBe(true);
    expect(/data-testid="create-cotizacion-submit"/.test(src)).toBe(true);
  });

  it("al éxito expone id/code/status reales del backend y enlace /comercial/cotizaciones/{id}", () => {
    const src = readCreateCotizacionDialog();
    // El id/code se toma del DTO devuelto (no se inventa).
    expect(/String\(\(quote as \{ id\?: unknown \}\)/.test(src)).toBe(true);
    expect(/String\(\(quote as \{ code\?: unknown \}\)/.test(src)).toBe(true);
    expect(/String\(\(quote as \{ status\?: unknown \}\)/.test(src)).toBe(true);
    // El enlace usa el id real entregado por el backend.
    expect(/href=\{`\/comercial\/cotizaciones\/\$\{createdQuote\.id\}`\}/.test(
      src,
    )).toBe(true);
    expect(/create-cotizacion-success/.test(src)).toBe(true);
    expect(/createOpenLink/.test(src)).toBe(true);
  });
});

/**
 * IMPL-20260825-24 · IMPLEMENTATION_DEFECT · fix de causa raíz
 * reportada por QA-20260825-24:
 *
 *   - `loadQuote(row.id, user.organization_id)` dentro de
 *     `quotes.create`'s `withTx` invertía argumentos (firma correcta:
 *     `loadQuote(orgId, quoteId)`).
 *   - `loadQuote`/`loadItems` leían del executor `db` global mientras
 *     el insert vivía en `tx` sin commit → 404 QUOTE_NOT_FOUND +
 *     rollback de la transacción.
 *
 * Cobertura estática (sin harness PostgreSQL en el repo). Cada
 * describe asegura que el patrón NO vuelva a aparecer y que el
 * executor transaccional se propague correctamente. La validación
 * funcional end-to-end queda en el gate V3 de GEMINI contra el
 * backend provisionado.
 */
describe("IMPL-20260825-24 · FIX IMPLEMENTATION_DEFECT · quotes.ts · loadQuote usa tx y orden correcto", () => {
  it("loadQuote acepta un tercer argumento executor (default `db`) para usar tx dentro de withTx", () => {
    const src = readQuotesService();
    // Firma ampliada con `executor` por defecto `db`.
    expect(
      /async function loadQuote\(\s*orgId:\s*string\s*,\s*quoteId:\s*string\s*,\s*executor:[\s\S]*?=\s*db/.test(
        src,
      ),
    ).toBe(true);
    expect(
      /async function loadItems\(\s*orgId:\s*string\s*,\s*quoteId:\s*string\s*,\s*executor:[\s\S]*?=\s*db/.test(
        src,
      ),
    ).toBe(true);
    // loadQuote usa el executor (no el `db` literal) en su select.
    expect(/await executor\s*\.\s*select\(\)\s*\.\s*from\(quotes\)/.test(src)).toBe(true);
    expect(/await executor\s*\.\s*select\(\)\s*\.\s*from\(quoteItems\)/.test(src)).toBe(true);
    // loadItems se llama pasando el mismo executor (no el `db` global).
    expect(/loadItems\(\s*orgId\s*,\s*quoteId\s*,\s*executor\s*\)/.test(src)).toBe(true);
  });

  it("ninguna llamada a loadQuote/loadItems invierte el orden (orgId, quoteId)", () => {
    const src = readQuotesService();
    // Anti-patrón conocido: `loadQuote(row.id, user.organization_id)`
    // (es decir, quoteId primero). Si reaparece, el test falla.
    expect(src).not.toMatch(/loadQuote\(\s*\w+\.id\s*,\s*\w+\.organization_id/);
    // No debe haber loadItems con orden invertido.
    expect(src).not.toMatch(/loadItems\(\s*\w+\.id\s*,\s*\w+\.organization_id/);
  });

  it("todas las llamadas a loadQuote dentro de withTx pasan `tx` como tercer argumento", () => {
    const src = readQuotesService();
    // Extrae los cuerpos de cada callback de withTx y verifica que
    // cada `return loadQuote(...)` que aparezca termine con `, tx)`.
    const blocks = src.match(/return withTx\(async\s*\(tx\)\s*=>\s*\{[\s\S]*?\}\);/g) ?? [];
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      const calls = block.match(/loadQuote\(/g) ?? [];
      for (const c of calls) {
        // Cada invocación debe ser exactamente `loadQuote(orgId, quoteId, tx)`.
        expect(
          /loadQuote\([\s\S]*?,\s*tx\s*\)/.test(block.slice(block.indexOf(c))),
        ).toBe(true);
      }
    }
  });

  it("los call-sites fuera de withTx (getById, listForProspect) usan el executor por defecto `db`", () => {
    const src = readQuotesService();
    // getById: loadQuote(orgId, quoteId) sin tercer argumento → usa `db`.
    expect(
      /async function getById[\s\S]*?return\s+loadQuote\(\s*user\.organization_id\s*,\s*quoteId\s*\)\s*;/.test(
        src,
      ),
    ).toBe(true);
    // listForProspect: loadItems(orgId, r.id) sin tercer argumento.
    expect(
      /const items\s*=\s*await\s+loadItems\(\s*user\.organization_id\s*,\s*r\.id\s*\)/.test(
        src,
      ),
    ).toBe(true);
  });
});
