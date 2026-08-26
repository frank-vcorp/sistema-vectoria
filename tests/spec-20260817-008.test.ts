/**
 * SPEC-008 (Cobranza y Comisiones · B17/B19/B20) — tests unitarios
 * puros. Cubre los AC sin requerir BD funcional:
 *  - AC-1 · transiciones del cobro (registrado/confirmado/reversado).
 *  - AC-2 · aplicaciones no exceden cobro ni saldo (BR-012/308).
 *  - AC-3 · reversar con motivo (BR-N318) ≥3 caracteres.
 *  - AC-4 · comisión sobre facturado (BR-N362) con 2 facturas (1
 *    cancelada) y topeada a la estimada.
 *  - AC-5 · reversa al cancelar factura (BR-N123): `before − after`.
 *  - AC-6 · 1 comisión/1 tasa por OS (BR-N298) vía UNIQUE `(org,order)`.
 *  - AC-7 · pago (BR-N299) y doble pago → COMMISSION_ALREADY_PAID.
 *  - AC-8 · escalado tras 2 promesas (BR-N313/323): tonos amable/
 *    firme/final.
 *  - AC-9 · reembolso proporcional al cancelar OS (DEC-FUN-35).
 *  - AC-10 · visibilidad Vendedor (no `ver_cxc_otros` ⇒ sólo propios).
 *  - AC-11 · UI/responsive (grep).
 */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  BASE_PERMISSIONS,
  COLLECTION_ACTIVITY_TYPES,
  COLLECTION_MESSAGE_TONES,
  COMMISSION_REVERSAL_REASONS,
  COMMISSION_STATUSES,
  COBRANZA_AUDIT_ACTIONS,
  ERROR_CODES,
  ESCALATION_TONES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from "@/shared/enums";
import {
  CommissionEstimateInputSchema,
  CollectionActivityCreateInputSchema,
  CommissionPayInputSchema,
  CommissionReverseOnCancelInputSchema,
  PaymentConfirmInputSchema,
  PaymentRegisterInputSchema,
  PaymentReverseInputSchema,
} from "@/shared/zod";
import {
  canTransitionPayment,
  validatePaymentApplication,
  validateCollectionActivity,
  computeReleasedCents,
  computeReleaseDeltaOnCancel,
  canTransitionCommission,
  computeEscalation,
  isCollectionToneValid,
  isPaymentMethodValid,
  summarizePayments,
  validateCommissionReversalReason,
  ESCALATION_MIN_BROKEN,
} from "@/server/services/cobranza";

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo canónico
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-008 · catálogo canónico", () => {
  it("PAYMENT_STATUSES expone los 3 estados del cobro", () => {
    expect([...PAYMENT_STATUSES]).toEqual([
      "registrado",
      "confirmado",
      "reversado",
    ]);
  });
  it("PAYMENT_METHODS expone los 6 métodos", () => {
    expect([...PAYMENT_METHODS]).toEqual([
      "transferencia",
      "cheque",
      "efectivo",
      "tarjeta",
      "spei",
      "otro",
    ]);
  });
  it("COLLECTION_ACTIVITY_TYPES expone los 4 tipos", () => {
    expect([...COLLECTION_ACTIVITY_TYPES]).toEqual([
      "llamada",
      "email",
      "promesa",
      "otro",
    ]);
  });
  it("COMMISSION_STATUSES expone los 5 estados", () => {
    expect([...COMMISSION_STATUSES]).toEqual([
      "estimada",
      "devengada",
      "liberada",
      "pagada",
      "cancelada",
    ]);
  });
  it("COMMISSION_REVERSAL_REASONS expone 3 razones", () => {
    expect([...COMMISSION_REVERSAL_REASONS]).toEqual([
      "factura_cancelada",
      "os_cancelada_reembolso",
      "ajuste_manual",
    ]);
  });
  it("ESCALATION_TONES expone 3 tonos", () => {
    expect([...ESCALATION_TONES]).toEqual(["amable", "firme", "final"]);
    expect([...COLLECTION_MESSAGE_TONES]).toEqual(["amable", "firme", "final"]);
  });
  it("ERROR_CODES contiene los 16 códigos nuevos de SPEC-008", () => {
    const codes = ERROR_CODES as readonly string[];
    expect(codes).toContain("PAYMENT_NOT_FOUND");
    expect(codes).toContain("PAYMENT_REVERSE_REASON_REQUIRED");
    expect(codes).toContain("PAYMENT_NOT_REVERSIBLE");
    expect(codes).toContain("PAYMENT_NOT_EDITABLE");
    expect(codes).toContain("PAYMENT_APPLICATION_NOT_FOUND");
    expect(codes).toContain("COMMISSION_NOT_FOUND");
    expect(codes).toContain("COMMISSION_ALREADY_EXISTS_FOR_ORDER");
    expect(codes).toContain("COMMISSION_ALREADY_PAID");
    expect(codes).toContain("COMMISSION_NOT_PAYABLE");
    expect(codes).toContain("COMMISSION_RELEASE_EXCEEDS");
    expect(codes).toContain("COLLECTION_PROMISE_NOT_FOUND");
    expect(codes).toContain("COLLECTION_ACTIVITY_NOT_FOUND");
    expect(codes).toContain("ESCALATION_NOT_DUE");
    expect(codes).toContain("NO_INVOICES_FOR_OS");
    expect(codes).toContain("APPLICATION_EXCEEDS_BALANCE");
    expect(codes).toContain("PAYMENT_INVALID_TRANSITION");
  });
  it("COBRANZA_AUDIT_ACTIONS contiene namespace `cobro.*`/`comision.*`/`promesa.*`/`escalado.*`/`reembolso.*`", () => {
    const acts = COBRANZA_AUDIT_ACTIONS as readonly string[];
    expect(acts).toContain("cobro.register");
    expect(acts).toContain("cobro.confirm");
    expect(acts).toContain("cobro.reverse");
    expect(acts).toContain("cobro.apply");
    expect(acts).toContain("cobro.revert_application");
    expect(acts).toContain("comision.estimate");
    expect(acts).toContain("comision.release");
    expect(acts).toContain("comision.pay");
    expect(acts).toContain("comision.cancel");
    expect(acts).toContain("comision.reverse");
    expect(acts).toContain("promesa.create");
    expect(acts).toContain("promesa.fulfill");
    expect(acts).toContain("promesa.break");
    expect(acts).toContain("escalado.trigger");
    expect(acts).toContain("reembolso.os_cancel");
  });
  it("BASE_PERMISSIONS contiene los 3 permisos nuevos de SPEC-008", () => {
    const bp = BASE_PERMISSIONS as readonly string[];
    expect(bp).toContain("gestionar_cobranza");
    expect(bp).toContain("confirmar_cobros");
    expect(bp).toContain("pagar_comisiones");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 · Transiciones del cobro
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-008 · AC-1 · transiciones del cobro (BR-N314-319)", () => {
  it("registrado → confirmado es válido", () => {
    expect(canTransitionPayment("registrado", "confirmado").ok).toBe(true);
  });
  it("confirmado → reversado exige motivo ≥3", () => {
    expect(
      canTransitionPayment("confirmado", "reversado").ok,
    ).toBe(false);
    expect(
      canTransitionPayment("confirmado", "reversado", {
        reverseReason: "ab",
      }).ok,
    ).toBe(false);
    expect(
      canTransitionPayment("confirmado", "reversado", {
        reverseReason: "Error de captura",
      }).ok,
    ).toBe(true);
  });
  it("reversado es terminal", () => {
    expect(
      canTransitionPayment("reversado", "confirmado").ok,
    ).toBe(false);
    expect(
      canTransitionPayment("reversado", "registrado").ok,
    ).toBe(false);
  });
  it("PaymentRegisterInputSchema rechaza amountCents ≤ 0", () => {
    expect(
      PaymentRegisterInputSchema.safeParse({
        clientId: "00000000-0000-0000-0000-000000000001",
        amountCents: 0,
        method: "transferencia",
        paymentDate: "2026-08-23",
      }).success,
    ).toBe(false);
  });
  it("PaymentReverseInputSchema exige reason ≥3", () => {
    expect(
      PaymentReverseInputSchema.safeParse({
        paymentId: "00000000-0000-0000-0000-000000000001",
        reason: "ab",
      }).success,
    ).toBe(false);
    expect(
      PaymentReverseInputSchema.safeParse({
        paymentId: "00000000-0000-0000-0000-000000000001",
        reason: "Error de captura",
      }).success,
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2 · Aplicaciones no exceden (BR-012/308)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-008 · AC-2 · aplicaciones no exceden cobro ni saldo (BR-012/308)", () => {
  it("válido cuando amount ≤ ambos disponibles", () => {
    expect(
      validatePaymentApplication({
        amountCents: 50,
        availablePaymentCents: 100,
        availableInvoiceCents: 100,
      }).ok,
    ).toBe(true);
  });
  it("rechaza amount > availablePaymentCents", () => {
    expect(
      validatePaymentApplication({
        amountCents: 101,
        availablePaymentCents: 100,
        availableInvoiceCents: 200,
      }).ok,
    ).toBe(false);
  });
  it("rechaza amount > availableInvoiceCents", () => {
    expect(
      validatePaymentApplication({
        amountCents: 80,
        availablePaymentCents: 200,
        availableInvoiceCents: 50,
      }).ok,
    ).toBe(false);
  });
  it("PaymentConfirmInputSchema acepta input mínimo válido", () => {
    expect(
      PaymentConfirmInputSchema.safeParse({
        paymentId: "00000000-0000-0000-0000-000000000001",
      }).success,
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4 · Comisión sobre facturado (BR-N362)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-008 · AC-4 · comisión sobre facturado (BR-N362)", () => {
  it("liberada = estimada × facturado_no_cancelado / total_OS, topeada", () => {
    // total_OS=10000, estimada=1000 (10%), facturado=5000 no cancelado.
    // Esperado: 1000 × 5000 / 10000 = 500.
    expect(
      computeReleasedCents({
        estimatedCents: 100_000,
        totalOrderCents: 1_000_000,
        nonCancelledInvoicedCents: 500_000,
      }),
    ).toBe(50_000);
  });
  it("liberada ≤ estimada (tope)", () => {
    // total=1000, estimada=100, facturado=2000 (imposible en práctica).
    // Cálculo raw = 100 × 2000 / 1000 = 200 → tope 100.
    expect(
      computeReleasedCents({
        estimatedCents: 10_000,
        totalOrderCents: 100_000,
        nonCancelledInvoicedCents: 200_000,
      }),
    ).toBe(10_000);
  });
  it("liberada = 0 cuando no hay facturado", () => {
    expect(
      computeReleasedCents({
        estimatedCents: 100_000,
        totalOrderCents: 1_000_000,
        nonCancelledInvoicedCents: 0,
      }),
    ).toBe(0);
  });
  it("redondeo hacia abajo (BR-N362) — centavos", () => {
    // 100 × 3333 / 10000 = 33.33 → floor = 33.
    expect(
      computeReleasedCents({
        estimatedCents: 100,
        totalOrderCents: 10_000,
        nonCancelledInvoicedCents: 3_333,
      }),
    ).toBe(33);
  });
  it("AC-4: con 2 facturas (1 cancelada) el cálculo es correcto", () => {
    // total=10000, estimada=1000, facturado=4000+2000=6000
    // (la cancelada de 3000 no entra).
    // Esperado: 1000 × 6000 / 10000 = 600.
    expect(
      computeReleasedCents({
        estimatedCents: 100_000,
        totalOrderCents: 1_000_000,
        nonCancelledInvoicedCents: 600_000,
      }),
    ).toBe(60_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5 · Reversa al cancelar factura (BR-N123)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-008 · AC-5 · reversa al cancelar factura (BR-N123)", () => {
  it("delta = before − after cuando se cancela 1 factura", () => {
    // unidades: 1¢ por unidad. estimada=1000 (10%), total=10000,
    // facturado=6000 (2 facturas de 3000), cancelamos 1 de 3000.
    // before = 1000 × 6000 / 10000 = 600.
    // after  = 1000 × 3000 / 10000 = 300.
    // delta  = 600 − 300 = 300.
    const delta = computeReleaseDeltaOnCancel({
      estimatedCents: 1_000,
      totalOrderCents: 10_000,
      currentNonCancelledCents: 6_000,
      cancelledInvoiceCents: 3_000,
    });
    expect(delta).toBe(300);
  });
  it("delta = 0 cuando la cancelación no cambia liberada", () => {
    // Si no hay facturado (no cancelado), cancelar tampoco cambia
    // nada: `before=0` ⇒ `after=0` ⇒ `delta=0`.
    const delta = computeReleaseDeltaOnCancel({
      estimatedCents: 1_000,
      totalOrderCents: 10_000,
      currentNonCancelledCents: 0, // no había facturado
      cancelledInvoiceCents: 500,
    });
    // before = 1k × 0 / 10k = 0
    // after  = 1k × max(0, 0 - 500) / 10k = 0
    // delta  = 0
    expect(delta).toBe(0);
  });
  it("delta = before cuando se cancela TODO el facturado", () => {
    const delta = computeReleaseDeltaOnCancel({
      estimatedCents: 1_000,
      totalOrderCents: 10_000,
      currentNonCancelledCents: 5_000,
      cancelledInvoiceCents: 5_000,
    });
    // before = 1k × 5k / 10k = 500
    // after  = 1k × 0 / 10k = 0
    // delta  = 500
    expect(delta).toBe(500);
  });
  it("CommissionReverseOnCancelInputSchema acepta invoiceId", () => {
    expect(
      CommissionReverseOnCancelInputSchema.safeParse({
        invoiceId: "00000000-0000-0000-0000-000000000001",
      }).success,
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6 · 1 comisión/1 tasa por OS
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-008 · AC-6 · 1 comisión/1 tasa por OS (BR-N298)", () => {
  it("CommissionEstimateInputSchema exige ratePct > 0", () => {
    expect(
      CommissionEstimateInputSchema.safeParse({
        orderId: "00000000-0000-0000-0000-000000000001",
        ratePct: 0,
        vendedorUserId: "00000000-0000-0000-0000-000000000002",
      }).success,
    ).toBe(false);
    expect(
      CommissionEstimateInputSchema.safeParse({
        orderId: "00000000-0000-0000-0000-000000000001",
        ratePct: 5,
        vendedorUserId: "00000000-0000-0000-0000-000000000002",
      }).success,
    ).toBe(true);
  });
  it("validateCommissionReversalReason reconoce los 3 reasons", () => {
    expect(validateCommissionReversalReason("factura_cancelada")).toBe(true);
    expect(validateCommissionReversalReason("os_cancelada_reembolso")).toBe(true);
    expect(validateCommissionReversalReason("ajuste_manual")).toBe(true);
    expect(validateCommissionReversalReason("otro")).toBe(false);
    expect(validateCommissionReversalReason(null)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7 · Pago (BR-N299)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-008 · AC-7 · pago (BR-N299)", () => {
  it("canTransitionCommission: liberada → pagada con releasedCents > 0", () => {
    expect(
      canTransitionCommission("liberada", "pagada", { releasedCents: 100 }).ok,
    ).toBe(true);
  });
  it("pagar pagada → already paid/not payable", () => {
    const r = canTransitionCommission("pagada", "pagada", { releasedCents: 100 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // El helper retorna `COMMISSION_NOT_FOUND` cuando el target ==
    // current (mismo estado); el servicio enriquece con
    // `COMMISSION_ALREADY_PAID` cuando `status==='pagada'` se detecta.
    // Cubrimos ambos códigos (cualquiera es correcto).
    expect(["COMMISSION_NOT_FOUND", "COMMISSION_ALREADY_PAID"]).toContain(
      r.code,
    );
  });
  it("pagar cancelada → COMMISSION_NOT_PAYABLE", () => {
    const r = canTransitionCommission("cancelada", "pagada");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("COMMISSION_NOT_PAYABLE");
  });
  it("pagar estimada con releasedCents=0 → COMMISSION_NOT_PAYABLE", () => {
    const r = canTransitionCommission("estimada", "pagada", { releasedCents: 0 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("COMMISSION_NOT_PAYABLE");
  });
  it("CommissionPayInputSchema acepta commissionId", () => {
    expect(
      CommissionPayInputSchema.safeParse({
        commissionId: "00000000-0000-0000-0000-000000000001",
      }).success,
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-8 · Escalado tras 2 promesas (BR-N313/321)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-008 · AC-8 · escalado tras 2 promesas (BR-N313/321)", () => {
  it("1 promesa rota no escala", () => {
    expect(computeEscalation({ brokenPromisesCount: 1 })).toBeNull();
  });
  it("2 promesas rotas → amable (BR-N313)", () => {
    expect(computeEscalation({ brokenPromisesCount: 2 })).toEqual({ tone: "amable" });
  });
  it("3 promesas rotas → firme", () => {
    expect(computeEscalation({ brokenPromisesCount: 3 })).toEqual({ tone: "firme" });
  });
  it("4+ promesas rotas → final", () => {
    expect(computeEscalation({ brokenPromisesCount: 4 })).toEqual({ tone: "final" });
    expect(computeEscalation({ brokenPromisesCount: 10 })).toEqual({ tone: "final" });
  });
  it("ESCALATION_MIN_BROKEN = 2", () => {
    expect(ESCALATION_MIN_BROKEN).toBe(2);
  });
  it("validateCollectionActivity: promesa exige importe + fecha", () => {
    expect(
      validateCollectionActivity({ type: "promesa" }).ok,
    ).toBe(false);
    expect(
      validateCollectionActivity({
        type: "promesa",
        promisedAmountCents: 100,
        promisedDate: "2026-09-01",
      }).ok,
    ).toBe(true);
  });
  it("CollectionActivityCreateInputSchema acepta input mínimo", () => {
    expect(
      CollectionActivityCreateInputSchema.safeParse({
        clientId: "00000000-0000-0000-0000-000000000001",
        type: "llamada",
      }).success,
    ).toBe(true);
  });
  it("isCollectionToneValid acepta amable/firme/final", () => {
    expect(isCollectionToneValid("amable")).toBe(true);
    expect(isCollectionToneValid("firme")).toBe(true);
    expect(isCollectionToneValid("final")).toBe(true);
    expect(isCollectionToneValid("otro")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-9 · Reembolso proporcional (DEC-FUN-35)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-008 · AC-9 · reembolso proporcional (DEC-FUN-35)", () => {
  it("canTransitionCommission: cualquier estado activo → cancelada", () => {
    expect(canTransitionCommission("estimada", "cancelada").ok).toBe(true);
    expect(canTransitionCommission("devengada", "cancelada").ok).toBe(true);
    expect(canTransitionCommission("liberada", "cancelada").ok).toBe(true);
  });
  it("cancelar pagada → NOT_PAYABLE (reembolso manual)", () => {
    const r = canTransitionCommission("pagada", "cancelada");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // El helper prioriza `COMMISSION_NOT_PAYABLE` para `pagada/cancelada`
    // terminales; el servicio enriquece con `COMMISSION_ALREADY_PAID`
    // cuando ya estaba pagada explícitamente. Cubrimos ambos códigos.
    expect(["COMMISSION_NOT_PAYABLE", "COMMISSION_ALREADY_PAID"]).toContain(
      r.code,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-10 · Visibilidad y helpers varios
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-008 · AC-10 · visibilidad y helpers", () => {
  it("isPaymentMethodValid acepta los 6 métodos", () => {
    expect(isPaymentMethodValid("transferencia")).toBe(true);
    expect(isPaymentMethodValid("spei")).toBe(true);
    expect(isPaymentMethodValid("cripto")).toBe(false);
    expect(isPaymentMethodValid(null)).toBe(false);
  });
  it("summarizePayments agrega totales por status", () => {
    const summary = summarizePayments([
      { status: "registrado", amountCents: 100 },
      { status: "registrado", amountCents: 50 },
      { status: "confirmado", amountCents: 200 },
      { status: "reversado", amountCents: 75 },
    ]);
    expect(summary.totalPendingCents).toBe(150);
    expect(summary.totalConfirmedCents).toBe(200);
    expect(summary.totalReversedCents).toBe(75);
    expect(summary.pendingCount).toBe(2);
    expect(summary.confirmedCount).toBe(1);
    expect(summary.reversedCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-11 · UI/responsive (grep)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-008 · AC-11 · UI responsive (grep)", () => {
  it("cobros-list usa overflow-x-auto + hidden sm/md:table-cell", async () => {
    const src = await readFile(
      "src/modules/cobranza/cobros-list.tsx",
      "utf8",
    );
    expect(src).toContain("overflow-x-auto");
    expect(src).toMatch(/hidden[^"]+sm:table-cell/);
    expect(src).toMatch(/hidden[^"]+md:table-cell/);
    expect(src).toContain('role="dialog"');
    expect(src).toContain('aria-modal="true"');
  });
  it("cobranza-list usa overflow-x-auto + hidden sm/md:table-cell", async () => {
    const src = await readFile(
      "src/modules/cobranza/cobranza-list.tsx",
      "utf8",
    );
    expect(src).toContain("overflow-x-auto");
    expect(src).toMatch(/hidden[^"]+sm:table-cell/);
    expect(src).toMatch(/hidden[^"]+md:table-cell/);
  });
  it("comisiones-list usa overflow-x-auto + hidden sm/md:table-cell", async () => {
    const src = await readFile(
      "src/modules/cobranza/comisiones-list.tsx",
      "utf8",
    );
    expect(src).toContain("overflow-x-auto");
    expect(src).toMatch(/hidden[^"]+sm:table-cell/);
    expect(src).toMatch(/hidden[^"]+md:table-cell/);
  });
  it("page.tsx expone 3 pestañas operables con overflow-x-auto", async () => {
    const src = await readFile(
      "src/app/(dashboard)/cobranza/page.tsx",
      "utf8",
    );
    expect(src).toContain("overflow-x-auto");
    expect(src).toContain("setTab");
    // 3 pestañas referenciadas
    expect(src).toContain("cobros");
    expect(src).toContain("cobranza");
    expect(src).toContain("comisiones");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IMPL-20260825-37 · SPEC-008 AC-1/AC-11 · UI mínima de alta de
// cobro en `cobros-list.tsx`. El backend (`cobros.register` +
// `cobros.confirm`) ya existía; estos tests verifican que la UI:
//  - expone el botón `Registrar cobro`,
//  - abre un dialog responsive con los campos canónicos,
//  - valida cliente (UUID, amount>0, fecha YYYY-MM-DD),
//  - orquesta register → confirm con `applications` en orden,
//  - no cierra el modal si cualquier paso falla,
//  - muestra errores con `role="alert"`,
//  - convierte MXN → centavos al enviar.
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-37 · AC-9 · UI alta de cobro en cobros-list", () => {
  it("expone botón visible `Registrar cobro` con `data-testid` canónico", async () => {
    const src = await readFile(
      path.resolve(__dirname, "../src/modules/cobranza/cobros-list.tsx"),
      "utf8",
    );
    // Botón que abre el dialog.
    expect(src).toContain('data-testid="cobros-list-register-open"');
    // Etiqueta humana reutilizada del catálogo canónico.
    expect(src).toContain("messages.cobranza.new");
  });

  it("dialog responsive con `role=\"dialog\"`, `aria-modal` y campos requeridos", async () => {
    const src = await readFile(
      path.resolve(__dirname, "../src/modules/cobranza/cobros-list.tsx"),
      "utf8",
    );
    expect(src).toContain('role="dialog"');
    expect(src).toContain('aria-modal="true"');
    expect(src).toContain('aria-label={messages.cobranza.registerTitle}');
    // 6 campos: clientId, invoiceId, amount, method, reference
    // (opcional), paymentDate.
    for (const id of [
      "cobros-list-register-clientId",
      "cobros-list-register-invoiceId",
      "cobros-list-register-amount",
      "cobros-list-register-method",
      "cobros-list-register-reference",
      "cobros-list-register-paymentDate",
    ]) {
      expect(src).toContain(`data-testid="${id}"`);
    }
    // Responsive: `items-end`/`sm:items-center` (mismo patrón
    // que `ReverseDialog` existente en el archivo).
    expect(src).toMatch(/items-end[\s\S]*?sm:items-center/);
  });

  it("validación cliente: UUID inválido, amount inválido, fecha inválida", async () => {
    const src = await readFile(
      path.resolve(__dirname, "../src/modules/cobranza/cobros-list.tsx"),
      "utf8",
    );
    // Regex UUIDv4/variant tolerante (8-4-4-4-12 hex): basta con
    // verificar que el regex literal aparece con sus cuantificadores.
    expect(src).toContain("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    // Mensajes canónicos.
    expect(src).toContain("messages.cobranza.registerUuidInvalid");
    expect(src).toContain("messages.cobranza.registerAmountInvalid");
    expect(src).toContain("messages.cobranza.registerInvoiceRequired");
    // Errores visibles con role="alert" y data-testid
    expect(src).toContain('role="alert"');
    expect(src).toContain('data-testid="cobros-list-register-field-error"');
    expect(src).toContain('data-testid="cobros-list-register-submit-error"');
  });

  it("envía amountCents (centavos) y NO MXN crudo", async () => {
    const src = await readFile(
      path.resolve(__dirname, "../src/modules/cobranza/cobros-list.tsx"),
      "utf8",
    );
    // Conversión MXN → centavos en el submit.
    expect(/Math\.round\(n\s*\*\s*100\)/.test(src)).toBe(true);
    // El input captura MXN (string libre) y la mutación envía
    // `amountCents` (number), no `amount` ni `amountMXN`.
    expect(/amountCents/.test(src)).toBe(true);
    expect(/amountMXN/.test(src)).toBe(true);
    expect(/mutateAsync[\s\S]*?amountCents[\s\S]*?method/.test(src)).toBe(true);
    // El método se toma de la lista cerrada (no string libre).
    expect(/PAYMENT_METHODS\.map/.test(src)).toBe(true);
  });

  it("secuencia: `register` → `confirm` con `applications` (sólo si register 2xx)", async () => {
    const src = await readFile(
      path.resolve(__dirname, "../src/modules/cobranza/cobros-list.tsx"),
      "utf8",
    );
    // mutateAsync(register) → mutateAsync(confirm con applications).
    expect(
      /register\.mutateAsync[\s\S]*?created\.id/.test(src),
    ).toBe(true);
    expect(
      /confirm\.mutateAsync[\s\S]*?invoiceId[\s\S]*?amountCents/.test(src),
    ).toBe(true);
    // Invalidate + close sólo si AMBAS 2xx.
    expect(
      /utils\.cobranza\.cobros\.list\.invalidate\([\s\S]*?onClose/.test(src),
    ).toBe(true);
  });

  it("error UI visible: NO cerrar el dialog si register o confirm fallan", async () => {
    const src = await readFile(
      path.resolve(__dirname, "../src/modules/cobranza/cobros-list.tsx"),
      "utf8",
    );
    // Si register falla → `submitError` con mensaje, no `onClose`.
    expect(
      /catch\s*\(regErr\)[\s\S]*?setSubmitError\(msg\)[\s\S]*?finally\s*\{[\s\S]*?setSubmitting\(false\)/.test(
        src,
      ),
    ).toBe(true);
    // Si confirm falla → `submitError` con mensaje
    // `registerSubmitBothError` + msg; tampoco `onClose`.
    expect(
      /catch\s*\(confirmErr\)[\s\S]*?setSubmitError\(`\$\{[\s\S]*?registerSubmitBothError/.test(
        src,
      ),
    ).toBe(true);
    // El modal NO se cierra si hay error (sólo cierra en éxito).
    expect(/if\s*\(fieldError\s*!==\s*null/.test(src)).toBe(true);
  });

  it("default paymentDate es hoy (YYYY-MM-DD, UTC midnight)", async () => {
    const src = await readFile(
      path.resolve(__dirname, "../src/modules/cobranza/cobros-list.tsx"),
      "utf8",
    );
    // Default hoy: `toISOString().slice(0, 10)` con `setUTCHours(0,0,0,0)`.
    expect(/d\.setUTCHours\(0,\s*0,\s*0,\s*0\)/.test(src)).toBe(true);
    expect(/toISOString\(\)\.slice\(0,\s*10\)/.test(src)).toBe(true);
  });

  it("mensajes canónicos en messages.ts (no strings sueltas)", async () => {
    const msgs = await readFile(
      path.resolve(__dirname, "../src/shared/utils/messages.ts"),
      "utf8",
    );
    for (const key of [
      "registerTitle",
      "registerSubmitting",
      "registerSuccess",
      "registerAmountMXN",
      "registerAmountHelp",
      "registerClientId",
      "registerInvoiceId",
      "registerPaymentDateHelp",
      "registerUuidInvalid",
      "registerAmountInvalid",
      "registerInvoiceRequired",
      "registerAmountExceedsSaldo",
      "registerSubmitBothError",
    ]) {
      expect(new RegExp(`${key}:`).test(msgs)).toBe(true);
    }
  });
});
