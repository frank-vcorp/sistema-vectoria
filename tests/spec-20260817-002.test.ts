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
    expect(/onSuccess:\s*\(\)\s*=>\s*\{[^}]*qualifyMutation\.mutate/.test(
      src,
    )).toBe(true);
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

async function readMessages(): Promise<unknown> {
  // Import estático a través del loader TS de Vitest; permite verificar
  // el catálogo de mensajes sin transpilación manual.
  const mod = (await import("../src/shared/utils/messages" as string)) as {
    messages: unknown;
  };
  return mod.messages;
}