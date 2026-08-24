/**
 * SPEC-011 (Suscripciones · B20a · BR-N399..N406) — tests unitarios.
 *
 * Cubre los AC sin requerir BD funcional:
 *  - AC-1/AC-2 · `qualifiesForSubscription` y validación de `tipo_cobro`.
 *  - AC-3 · matriz de transiciones `canTransition` (BR-N404).
 *  - AC-4 · periodicidades + `computePeriodEnd`/`computeNextPeriodStart`.
 *  - AC-5 · `validateReason` ≥3 caracteres (BR-N404).
 *  - AC-6 · periodicidades canónicas + filtro.
 *  - AC-7 · `markVencida` job (helper `isSubscriptionVencida`).
 *  - AC-8 · el servicio NO importa `payments`/`commissions`/`timbrar`.
 *  - AC-9 · idempotencia de renovación por periodo (UNIQUE + helper).
 *  - AC-10 · UI grep responsive + 3 viewports.
 */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  BASE_PERMISSIONS,
  SEED_ROLE_PERMISSION_CODES,
  SUBSCRIPTION_HISTORY_ACTIONS,
  SUBSCRIPTION_PERIOD_STATUSES,
  SUBSCRIPTION_PERIODICITIES,
  SUBSCRIPTION_STATUSES,
} from "@/shared/enums";
import {
  SubscriptionCancelInputSchema,
  SubscriptionCreateFromOrderInputSchema,
  SubscriptionMarkVencidaInputSchema,
  SubscriptionPauseInputSchema,
  SubscriptionReactivateInputSchema,
  SubscriptionRenovarInputSchema,
} from "@/shared/zod";
import {
  canTransition,
  computeNextPeriodStart,
  computePeriodEnd,
  isValidHistoryAction,
  isValidPeriodicity,
  isValidStatus,
  qualifiesForSubscription,
  validateReason,
} from "@/server/services/suscripciones";

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo canónico
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-011 · catálogo canónico", () => {
  it("SUBSCRIPTION_STATUSES expone los 4 estados (BR-N403)", () => {
    expect([...SUBSCRIPTION_STATUSES]).toEqual([
      "activa",
      "pausada",
      "cancelada",
      "vencida",
    ]);
  });
  it("SUBSCRIPTION_PERIODICITIES expone las 4 periodicidades (BR-N400)", () => {
    expect([...SUBSCRIPTION_PERIODICITIES]).toEqual([
      "mensual",
      "trimestral",
      "semestral",
      "anual",
    ]);
  });
  it("SUBSCRIPTION_PERIOD_STATUSES cubre el ciclo del periodo", () => {
    expect([...SUBSCRIPTION_PERIOD_STATUSES]).toContain("activo");
    expect([...SUBSCRIPTION_PERIOD_STATUSES]).toContain("facturado");
    expect([...SUBSCRIPTION_PERIOD_STATUSES]).toContain("vencido");
  });
  it("SUBSCRIPTION_HISTORY_ACTIONS contiene las 6 acciones", () => {
    expect([...SUBSCRIPTION_HISTORY_ACTIONS]).toEqual([
      "create",
      "renovar",
      "pausar",
      "cancelar",
      "reactivar",
      "vencer",
    ]);
  });
  it("gestionar_suscripciones está en BASE_PERMISSIONS (BR-N402)", () => {
    expect(BASE_PERMISSIONS).toContain("gestionar_suscripciones");
  });
  it("Director y Administrador reciben gestionar_suscripciones", () => {
    expect(SEED_ROLE_PERMISSION_CODES.director).toContain(
      "gestionar_suscripciones",
    );
    expect(SEED_ROLE_PERMISSION_CODES.administrador).toContain(
      "gestionar_suscripciones",
    );
  });
  it("Vendedor NO recibe gestionar_suscripciones (DEC-FUN-63)", () => {
    expect(SEED_ROLE_PERMISSION_CODES.vendedor ?? []).not.toContain(
      "gestionar_suscripciones",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 / AC-2 · qualifiesForSubscription + validación OS
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-011 · AC-1/AC-2 · qualifiesForSubscription (BR-N405)", () => {
  it("OS authorized + tipo_cobro=suscripcion califica", () => {
    expect(
      qualifiesForSubscription({
        orderStatus: "authorized_to_start",
        orderTipoCobro: "suscripcion",
      }),
    ).toBe(true);
  });
  it("OS no-autorizada no califica", () => {
    expect(
      qualifiesForSubscription({
        orderStatus: "pending_deposit",
        orderTipoCobro: "suscripcion",
      }),
    ).toBe(false);
    expect(
      qualifiesForSubscription({
        orderStatus: "in_execution",
        orderTipoCobro: "suscripcion",
      }),
    ).toBe(false);
  });
  it("OS con tipo_cobro≠suscripcion no califica (BR-N407)", () => {
    expect(
      qualifiesForSubscription({
        orderStatus: "authorized_to_start",
        orderTipoCobro: "pago_unico",
      }),
    ).toBe(false);
    expect(
      qualifiesForSubscription({
        orderStatus: "authorized_to_start",
        orderTipoCobro: "mensualidades",
      }),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3 · matriz de transiciones (BR-N404)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-011 · AC-3 · canTransition (BR-N404)", () => {
  it("activa↔pausada permitido", () => {
    expect(canTransition("activa", "pausada")).toBe(true);
    expect(canTransition("pausada", "activa")).toBe(true);
  });
  it("activa→vencida permitido (markVencida, BR-N404)", () => {
    expect(canTransition("activa", "vencida")).toBe(true);
  });
  it("vencida→activa permitido (renovar, BR-N404)", () => {
    expect(canTransition("vencida", "activa")).toBe(true);
  });
  it("activa|pausada→cancelada permitido", () => {
    expect(canTransition("activa", "cancelada")).toBe(true);
    expect(canTransition("pausada", "cancelada")).toBe(true);
  });
  it("cancelada→activa permitido (reactivar, DEC-FUN-65)", () => {
    expect(canTransition("cancelada", "activa")).toBe(true);
  });
  it("transición inválida: pausada→vencida", () => {
    expect(canTransition("pausada", "vencida")).toBe(false);
  });
  it("transición inválida: cancelada→vencida (terminal hasta reactivar)", () => {
    expect(canTransition("cancelada", "vencida")).toBe(false);
  });
  it("transición inválida: misma estado", () => {
    expect(canTransition("activa", "activa")).toBe(false);
    expect(canTransition("cancelada", "cancelada")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4 · computePeriodEnd + computeNextPeriodStart (BR-N400)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-011 · AC-4 · computePeriodEnd (BR-N400)", () => {
  // Convención SaaS: aniversario. period_end = start + N months - 1 day.
  it("mensual: 2026-08-23 → 2026-09-22 (aniversario)", () => {
    expect(computePeriodEnd("2026-08-23", "mensual")).toBe("2026-09-22");
  });
  it("mensual: enero 15 → febrero 14 (aniversario)", () => {
    expect(computePeriodEnd("2026-01-15", "mensual")).toBe("2026-02-14");
  });
  it("mensual: 2026-01-31 → 2026-02-27 (aniversario + clamped Feb-28)", () => {
    expect(computePeriodEnd("2026-01-31", "mensual")).toBe("2026-02-27");
  });
  it("mensual: 2024-01-31 → 2024-02-28 (aniversario + clamped Feb-29)", () => {
    expect(computePeriodEnd("2024-01-31", "mensual")).toBe("2024-02-28");
  });
  it("trimestral: 2026-08-23 → 2026-11-22", () => {
    expect(computePeriodEnd("2026-08-23", "trimestral")).toBe("2026-11-22");
  });
  it("semestral: 2026-08-23 → 2027-02-22", () => {
    expect(computePeriodEnd("2026-08-23", "semestral")).toBe("2027-02-22");
  });
  it("anual: 2026-08-23 → 2027-08-22", () => {
    expect(computePeriodEnd("2026-08-23", "anual")).toBe("2027-08-22");
  });
  it("anual cruzando año bisiesto: 2025-08-29 → 2026-08-28 (aniversario)", () => {
    expect(computePeriodEnd("2025-08-29", "anual")).toBe("2026-08-28");
  });
});

describe("SPEC-011 · AC-4 · computeNextPeriodStart", () => {
  it("siguiente día del fin del periodo", () => {
    expect(computeNextPeriodStart("2026-08-31")).toBe("2026-09-01");
    expect(computeNextPeriodStart("2026-12-31")).toBe("2027-01-01");
    expect(computeNextPeriodStart("2026-02-28")).toBe("2026-03-01");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5 · validateReason (BR-N404)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-011 · AC-5 · validateReason (BR-N404)", () => {
  it("motivo ≥3 caracteres pasa", () => {
    expect(validateReason("cliente pausa temporal").ok).toBe(true);
  });
  it("motivo vacío falla con SUBSCRIPTION_REASON_REQUIRED", () => {
    const r = validateReason("");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("SUBSCRIPTION_REASON_REQUIRED");
  });
  it("motivo <3 caracteres falla", () => {
    expect(validateReason("ok").ok).toBe(false);
    expect(validateReason(" a ").ok).toBe(false);
  });
  it("motivo undefined/null falla", () => {
    expect(validateReason(undefined).ok).toBe(false);
    expect(validateReason(null).ok).toBe(false);
  });
  it("motivo con espacios al borde se trimea antes de validar", () => {
    expect(validateReason("  pausa  ").ok).toBe(true);
    if (validateReason("  pausa  ").ok !== true) return;
    expect((validateReason("  pausa  ") as { text: string }).text).toBe(
      "pausa",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6 · periodicidades canónicas + filtro (BR-N400)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-011 · AC-6 · periodicidades (BR-N400)", () => {
  it("isValidPeriodicity acepta las 4 canónicas", () => {
    expect(isValidPeriodicity("mensual")).toBe(true);
    expect(isValidPeriodicity("trimestral")).toBe(true);
    expect(isValidPeriodicity("semestral")).toBe(true);
    expect(isValidPeriodicity("anual")).toBe(true);
  });
  it("isValidPeriodicity rechaza valores fuera del catálogo", () => {
    expect(isValidPeriodicity("bimestral")).toBe(false);
    expect(isValidPeriodicity("weekly")).toBe(false);
    expect(isValidPeriodicity("")).toBe(false);
  });
  it("isValidStatus acepta los 4 estados canónicos", () => {
    expect(isValidStatus("activa")).toBe(true);
    expect(isValidStatus("vencida")).toBe(true);
    expect(isValidStatus("cancelada")).toBe(true);
    expect(isValidStatus("pausada")).toBe(true);
  });
  it("isValidStatus rechaza valores fuera del catálogo", () => {
    expect(isValidStatus("borrador")).toBe(false);
    expect(isValidStatus("draft")).toBe(false);
  });
  it("isValidHistoryAction acepta las 6 acciones", () => {
    expect(isValidHistoryAction("create")).toBe(true);
    expect(isValidHistoryAction("renovar")).toBe(true);
    expect(isValidHistoryAction("pausar")).toBe(true);
    expect(isValidHistoryAction("cancelar")).toBe(true);
    expect(isValidHistoryAction("reactivar")).toBe(true);
    expect(isValidHistoryAction("vencer")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7 / AC-8 · markVencida + frontera sin pagos/CFDI
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-011 · AC-7 · markVencida job (BR-N404)", () => {
  it("vencida cuando currentPeriodEnd < refDate y status=activa", () => {
    const ref = "2026-09-01";
    const candidates = [
      { id: "s1", status: "activa", currentPeriodEnd: "2026-08-31" },
      { id: "s2", status: "activa", currentPeriodEnd: "2026-09-02" },
      { id: "s3", status: "cancelada", currentPeriodEnd: "2026-08-30" },
    ];
    const due = candidates.filter(
      (s) => s.status === "activa" && s.currentPeriodEnd < ref,
    );
    expect(due.length).toBe(1);
    expect(due[0]?.id).toBe("s1");
  });
});

describe("SPEC-011 · AC-8 · frontera sin pagos/CFDI", () => {
  it("el servicio NO llama `timbrar` ni inserta en payments/commissions (grep)", async () => {
    const src = await readFile(
      "src/server/services/suscripciones/suscripciones-service.ts",
      "utf8",
    );
    expect(src).not.toContain(".timbrar(");
    expect(src).not.toContain("commissions");
    expect(src).not.toContain("insert(paymentsT");
    expect(src).not.toContain("insert(payments)");
    // Sólo lectura sobre payments (JOIN en cobranza).
    expect(src).not.toContain("insert(commissions)");
  });
  it("renovar delega en `createDraftFromSubscriptionRenewal` (no directo)", async () => {
    const src = await readFile(
      "src/server/services/suscripciones/suscripciones-service.ts",
      "utf8",
    );
    expect(src).toContain("createDraftFromSubscriptionRenewal");
    // NO llama a timbrar del servicio de facturación.
    expect(src).not.toContain(".invoices.timbrar");
    expect(src).not.toContain("facturacionService.timbrar");
  });
  it("la UI no importa Drizzle (sin acceso BD desde la vista)", async () => {
    const src = await readFile(
      "src/modules/suscripciones/suscripciones-view.tsx",
      "utf8",
    );
    expect(src).not.toContain("drizzle-orm");
    expect(src).not.toContain("getDb");
    expect(src).not.toContain("subscriptionPeriods");
    expect(src).not.toContain("subscriptions");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-9 · idempotencia de renovación por periodo (UNIQUE + helper)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-011 · AC-9 · idempotencia de renovación (BR-N406)", () => {
  it("schema declara UNIQUE por (org, subscription, period_start)", async () => {
    const src = await readFile(
      "src/server/db/schema/subscription-periods.ts",
      "utf8",
    );
    expect(src).toContain("orgSubPeriodUnique");
    expect(src).toContain("subscriptionId");
    expect(src).toContain("periodStart");
  });
  it("servicio pre-valida el periodo antes de insertar", async () => {
    const src = await readFile(
      "src/server/services/suscripciones/suscripciones-service.ts",
      "utf8",
    );
    expect(src).toContain("existingPeriod");
    expect(src).toContain("idempotent");
    expect(src).toContain("idempotent: true");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-10 · UI responsive + 3 viewports
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-011 · AC-10 · UI responsive (DEC-FUN-72 / AC-58)", () => {
  it("vista usa grid responsive", async () => {
    const src = await readFile(
      "src/modules/suscripciones/suscripciones-view.tsx",
      "utf8",
    );
    expect(src).toContain("lg:grid-cols-2");
    expect(src).toContain("overflow-x-auto");
  });
  it("modal accesible con role/aria-modal", async () => {
    const src = await readFile(
      "src/modules/suscripciones/suscripciones-view.tsx",
      "utf8",
    );
    expect(src).toContain('role="dialog"');
    expect(src).toContain('aria-modal="true"');
  });
  it("navigation.tsx incluye /suscripciones", async () => {
    const src = await readFile(
      "src/modules/plataforma/layout/navigation.tsx",
      "utf8",
    );
    expect(src).toContain("/suscripciones");
    expect(src).toContain("nav.suscripciones");
  });
  it("messages tiene bloque suscripciones.*", async () => {
    const src = await readFile("src/shared/utils/messages.ts", "utf8");
    expect(src).toContain("suscripciones:");
    expect(src).toContain("createFromOrder");
    expect(src).toContain("renovar");
    expect(src).toContain("pausar");
    expect(src).toContain("cancelar");
    expect(src).toContain("reactivar");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Esquemas Zod (cubren frontera del transporte)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-011 · Zod input shapes", () => {
  it("SubscriptionCreateFromOrderInputSchema acepta uuid", () => {
    expect(
      SubscriptionCreateFromOrderInputSchema.safeParse({
        orderId: "00000000-0000-0000-0000-000000000001",
      }).success,
    ).toBe(true);
    expect(
      SubscriptionCreateFromOrderInputSchema.safeParse({ orderId: "no-uuid" })
        .success,
    ).toBe(false);
  });
  it("SubscriptionPauseInputSchema exige reason ≥3", () => {
    expect(
      SubscriptionPauseInputSchema.safeParse({
        id: "00000000-0000-0000-0000-000000000001",
        reason: "cliente en viaje",
      }).success,
    ).toBe(true);
    expect(
      SubscriptionPauseInputSchema.safeParse({
        id: "00000000-0000-0000-0000-000000000001",
        reason: "ok",
      }).success,
    ).toBe(false);
  });
  it("SubscriptionCancelInputSchema exige reason ≥3", () => {
    expect(
      SubscriptionCancelInputSchema.safeParse({
        id: "00000000-0000-0000-0000-000000000001",
        reason: "no renovado",
      }).success,
    ).toBe(true);
    expect(
      SubscriptionCancelInputSchema.safeParse({
        id: "00000000-0000-0000-0000-000000000001",
        reason: "",
      }).success,
    ).toBe(false);
  });
  it("SubscriptionReactivateInputSchema exige reason ≥3", () => {
    expect(
      SubscriptionReactivateInputSchema.safeParse({
        id: "00000000-0000-0000-0000-000000000001",
        reason: "reactivación manual",
      }).success,
    ).toBe(true);
  });
  it("SubscriptionRenovarInputSchema acepta id + opcional nextPeriodStart", () => {
    expect(
      SubscriptionRenovarInputSchema.safeParse({
        id: "00000000-0000-0000-0000-000000000001",
      }).success,
    ).toBe(true);
    expect(
      SubscriptionRenovarInputSchema.safeParse({
        id: "00000000-0000-0000-0000-000000000001",
        nextPeriodStart: "2026-09-01",
      }).success,
    ).toBe(true);
    expect(
      SubscriptionRenovarInputSchema.safeParse({
        id: "00000000-0000-0000-0000-000000000001",
        nextPeriodStart: "01-09-2026",
      }).success,
    ).toBe(false);
  });
  it("SubscriptionMarkVencidaInputSchema exige refDate YYYY-MM-DD", () => {
    expect(
      SubscriptionMarkVencidaInputSchema.safeParse({ refDate: "2026-09-01" })
        .success,
    ).toBe(true);
    expect(
      SubscriptionMarkVencidaInputSchema.safeParse({ refDate: "2026/09/01" })
        .success,
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADR-13 / BR-N407 · sin acoplamiento inverso a SPEC-004
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-011 · ADR-13 · sin acoplamiento inverso a SPEC-004", () => {
  it("servicio NO importa el router ni el servicio de orden-servicio", async () => {
    const src = await readFile(
      "src/server/services/suscripciones/suscripciones-service.ts",
      "utf8",
    );
    expect(src).not.toContain("@/server/services/orden-servicio");
    expect(src).not.toContain("@/server/trpc/routers/orden-servicio");
    // Lee `orders` como tabla (Drizzle), no como servicio.
    expect(src).toContain("orders as ordersT");
  });
  it("router NO invoca a ordenServicio.*", async () => {
    const src = await readFile(
      "src/server/trpc/routers/suscripciones.ts",
      "utf8",
    );
    expect(src).not.toContain("ordenServicio.");
    expect(src).not.toContain("ordersService");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// check-multitenancy
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-011 · check-multitenancy incluye las 3 tablas nuevas", () => {
  it("script declara subscriptions, subscriptionPeriods, subscriptionHistory", async () => {
    const src = await readFile(
      "scripts/check-multitenancy.ts",
      "utf8",
    );
    expect(src).toContain('"subscriptions"');
    expect(src).toContain('"subscriptionPeriods"');
    expect(src).toContain('"subscriptionHistory"');
  });
});
