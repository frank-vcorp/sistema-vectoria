/**
 * SPEC-009 (Finanzas y Movimientos · B21/B26) — tests unitarios
 * puros. Cubre los AC sin requerir BD funcional:
 *  - AC-1 · `conciliado` inmutable (BR-013) y reverso con motivo
 *    (BR-N329).
 *  - AC-2 · transferencias/préstamos/retiros no operativos (BR-N326/327/328).
 *  - AC-3 · costo laboral snapshot (BR-N278/334).
 *  - AC-4 · costo directo condicional (BR-N333).
 *  - AC-5 · costo total + margen (BR-N280/281).
 *  - AC-6 · rentabilidad por técnico (DEC-FUN-25, BR-N282).
 *  - AC-7 · calendario como filtro (DEC-FUN-24; verificable en UI).
 *  - AC-8 · clasificación no operativa (transferencia/préstamo/retiro).
 *  - AC-9 · vendido/facturado/cobrado separados (BR-015).
 *  - AC-10 · `osOutstandingBalance` (BR-N249/N394).
 *  - AC-11 · UI/responsive (grep).
 */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  ACCOUNT_TYPES,
  BASE_PERMISSIONS,
  ERROR_CODES,
  FINANZAS_AUDIT_ACTIONS,
  NON_OPERATIVE_KINDS,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from "@/shared/enums";
import {
  AccountCreateInputSchema,
  DirectCostImputeInputSchema,
  OsOutstandingBalanceInputSchema,
  TransactionCancelInputSchema,
  TransactionRecordInputSchema,
  TransactionReverseInputSchema,
  TransferCreateInputSchema,
} from "@/shared/zod";
import {
  buildProjectCostSummary,
  buildProjectFinancialReport,
  canTransitionTransaction,
  computeAccountBalance,
  computeDirectCost,
  computeLaborCost,
  computeOsOutstandingBalance,
  isAccountTypeValid,
  isNonOperativeSubKind,
  isOperativeTransaction,
  isReconciledImmutably,
  isTransactionAdmittedForDirectCost,
  isTransactionTypeValid,
  validateDirectCostInput,
  validateSubKind,
} from "@/server/services/finanzas";

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo canónico
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-009 · catálogo canónico", () => {
  it("ACCOUNT_TYPES expone los 5 tipos", () => {
    expect([...ACCOUNT_TYPES]).toEqual([
      "activo",
      "pasivo",
      "capital",
      "ingreso",
      "gasto",
    ]);
  });
  it("TRANSACTION_TYPES expone los 4 tipos", () => {
    expect([...TRANSACTION_TYPES]).toEqual([
      "ingreso",
      "gasto",
      "transferencia",
      "capital",
    ]);
  });
  it("TRANSACTION_STATUSES expone los 5 estados", () => {
    expect([...TRANSACTION_STATUSES]).toEqual([
      "borrador",
      "confirmado",
      "conciliado",
      "cancelado",
      "reversado",
    ]);
  });
  it("NON_OPERATIVE_KINDS expone las 5 subclasificaciones", () => {
    expect([...NON_OPERATIVE_KINDS]).toEqual([
      "transferencia_interna",
      "prestamo_socio",
      "retiro_socio",
      "pago_proveedor",
      "cobro_cliente",
    ]);
  });
  it("ERROR_CODES contiene los 12 códigos nuevos de SPEC-009", () => {
    const codes = ERROR_CODES as readonly string[];
    expect(codes).toContain("ACCOUNT_NOT_FOUND");
    expect(codes).toContain("ACCOUNT_INACTIVE");
    expect(codes).toContain("TRANSACTION_NOT_FOUND");
    expect(codes).toContain("TRANSACTION_INVALID_TRANSITION");
    expect(codes).toContain("TRANSFER_NOT_FOUND");
    expect(codes).toContain("TRANSFER_INVALID_PAIR");
    expect(codes).toContain("TRANSFER_DIFFERENT_ORG");
    expect(codes).toContain("RECONCILED_IMMUTABLE");
    expect(codes).toContain("COST_NOT_CONFIRMED");
    expect(codes).toContain("REVERSE_REASON_REQUIRED");
    expect(codes).toContain("TRANSACTION_NON_OPERATIVE");
    expect(codes).toContain("DIRECT_COST_NOT_FOUND");
  });
  it("FINANZAS_AUDIT_ACTIONS contiene namespace `cuenta.*`/`movimiento.*`/`transferencia.*`/`costo_directo.*`/`rentabilidad.*`", () => {
    const acts = FINANZAS_AUDIT_ACTIONS as readonly string[];
    expect(acts).toContain("cuenta.create");
    expect(acts).toContain("cuenta.update");
    expect(acts).toContain("cuenta.deactivate");
    expect(acts).toContain("movimiento.record");
    expect(acts).toContain("movimiento.confirm");
    expect(acts).toContain("movimiento.reconcile");
    expect(acts).toContain("movimiento.cancel");
    expect(acts).toContain("movimiento.reverse");
    expect(acts).toContain("transferencia.create");
    expect(acts).toContain("costo_directo.imputar");
    expect(acts).toContain("costo_directo.desimputar");
    expect(acts).toContain("rentabilidad.consulta");
  });
  it("BASE_PERMISSIONS contiene los 2 permisos nuevos de SPEC-009", () => {
    const bp = BASE_PERMISSIONS as readonly string[];
    expect(bp).toContain("gestionar_finanzas");
    expect(bp).toContain("ver_finanzas");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 · conciliado inmutable (BR-013) + reverso (BR-N329)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-009 · AC-1 · conciliado inmutable (BR-013)", () => {
  it("isReconciledImmutably: true sólo en `conciliado`", () => {
    expect(isReconciledImmutably("conciliado")).toBe(true);
    expect(isReconciledImmutably("confirmado")).toBe(false);
    expect(isReconciledImmutably("borrador")).toBe(false);
  });
  it("canTransitionTransaction: borrador → confirmado OK", () => {
    expect(canTransitionTransaction("borrador", "confirmado").ok).toBe(true);
  });
  it("canTransitionTransaction: confirmado → conciliado OK", () => {
    expect(canTransitionTransaction("confirmado", "conciliado").ok).toBe(true);
  });
  it("conciliado → reversado requiere motivo", () => {
    expect(
      canTransitionTransaction("conciliado", "reversado").ok,
    ).toBe(false);
    expect(
      canTransitionTransaction("conciliado", "reversado", {
        reverseReason: "ab",
      }).ok,
    ).toBe(false);
    expect(
      canTransitionTransaction("conciliado", "reversado", {
        reverseReason: "Corrección auditoría",
      }).ok,
    ).toBe(true);
  });
  it("reversado/cancelado son terminales", () => {
    expect(canTransitionTransaction("reversado", "confirmado").ok).toBe(false);
    expect(canTransitionTransaction("cancelado", "conciliado").ok).toBe(false);
  });
  it("TransactionReverseInputSchema exige reason ≥3", () => {
    expect(
      TransactionReverseInputSchema.safeParse({
        transactionId: "00000000-0000-0000-0000-000000000001",
        reason: "ab",
      }).success,
    ).toBe(false);
    expect(
      TransactionReverseInputSchema.safeParse({
        transactionId: "00000000-0000-0000-0000-000000000001",
        reason: "Auditoría 2026-Q3",
      }).success,
    ).toBe(true);
  });
  it("TransactionCancelInputSchema exige reason ≥3", () => {
    expect(
      TransactionCancelInputSchema.safeParse({
        transactionId: "00000000-0000-0000-0000-000000000001",
        reason: "ab",
      }).success,
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2 · Transferencia vinculada (BR-N326)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-009 · AC-2 · transferencia no operativa (BR-N326)", () => {
  it("isOperativeTransaction: false para transferencia/capital", () => {
    expect(isOperativeTransaction({ type: "transferencia", subKind: null })).toBe(false);
    expect(isOperativeTransaction({ type: "capital", subKind: null })).toBe(false);
  });
  it("isOperativeTransaction: true para ingreso/gasto", () => {
    expect(isOperativeTransaction({ type: "ingreso", subKind: null })).toBe(true);
    expect(isOperativeTransaction({ type: "gasto", subKind: null })).toBe(true);
  });
  it("isNonOperativeSubKind: true para transferencia_interna/prestamo/retiro", () => {
    expect(isNonOperativeSubKind("transferencia_interna")).toBe(true);
    expect(isNonOperativeSubKind("prestamo_socio")).toBe(true);
    expect(isNonOperativeSubKind("retiro_socio")).toBe(true);
  });
  it("validateSubKind: transferencia ⇒ transferencia_interna", () => {
    expect(
      validateSubKind({ type: "transferencia", subKind: "transferencia_interna" }).ok,
    ).toBe(true);
    expect(
      validateSubKind({ type: "transferencia", subKind: "prestamo_socio" }).ok,
    ).toBe(false);
  });
  it("validateSubKind: capital ⇒ prestamo_socio | retiro_socio", () => {
    expect(
      validateSubKind({ type: "capital", subKind: "prestamo_socio" }).ok,
    ).toBe(true);
    expect(
      validateSubKind({ type: "capital", subKind: "transferencia_interna" }).ok,
    ).toBe(false);
  });
  it("validateSubKind: ingreso ⇒ cobro_cliente", () => {
    expect(
      validateSubKind({ type: "ingreso", subKind: "cobro_cliente" }).ok,
    ).toBe(true);
    expect(
      validateSubKind({ type: "ingreso", subKind: "pago_proveedor" }).ok,
    ).toBe(false);
  });
  it("validateSubKind: gasto ⇒ pago_proveedor", () => {
    expect(
      validateSubKind({ type: "gasto", subKind: "pago_proveedor" }).ok,
    ).toBe(true);
    expect(
      validateSubKind({ type: "gasto", subKind: "cobro_cliente" }).ok,
    ).toBe(false);
  });
  it("TransferCreateInputSchema rechaza fromAccountId === toAccountId", () => {
    expect(
      TransferCreateInputSchema.safeParse({
        fromAccountId: "00000000-0000-0000-0000-000000000001",
        toAccountId: "00000000-0000-0000-0000-000000000001",
        amountCents: 100,
        operationDate: "2026-08-23",
      }).success,
    ).toBe(false);
    expect(
      TransferCreateInputSchema.safeParse({
        fromAccountId: "00000000-0000-0000-0000-000000000001",
        toAccountId: "00000000-0000-0000-0000-000000000002",
        amountCents: 100,
        operationDate: "2026-08-23",
      }).success,
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3 · Costo laboral snapshot (BR-N278/334)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-009 · AC-3 · costo laboral snapshot (BR-N278/334)", () => {
  it("labor = Σ horas × cost_per_hour_snapshot (BR-N278)", () => {
    const r = computeLaborCost([
      { hours: 2, costPerHourCents: 50_00, userId: "u1", projectId: "p1" },
      { hours: 1, costPerHourCents: 60_00, userId: "u1", projectId: "p1" },
      { hours: 4, costPerHourCents: 70_00, userId: "u2", projectId: "p1" },
    ]);
    expect(r.total).toBe(100_00 + 60_00 + 280_00);
    expect(r.byUser.get("u1")).toBe(160_00);
    expect(r.byUser.get("u2")).toBe(280_00);
    expect(r.byUserHours.get("u1")).toBe(3);
    expect(r.byUserHours.get("u2")).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4 · Costo directo condicional (BR-N333)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-009 · AC-4 · costo directo condicional (BR-N333)", () => {
  it("isTransactionAdmittedForDirectCost: confirmado/ conciliado sí; borrador no", () => {
    expect(isTransactionAdmittedForDirectCost("confirmado")).toBe(true);
    expect(isTransactionAdmittedForDirectCost("conciliado")).toBe(true);
    expect(isTransactionAdmittedForDirectCost("borrador")).toBe(false);
    expect(isTransactionAdmittedForDirectCost("reversado")).toBe(false);
  });
  it("validateDirectCostInput: borrador ⇒ COST_NOT_CONFIRMED", () => {
    const r = validateDirectCostInput({
      amountCents: 100,
      transactionStatus: "borrador",
      projectId: "p1",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("COST_NOT_CONFIRMED");
  });
  it("validateDirectCostInput: confirmado OK", () => {
    const r = validateDirectCostInput({
      amountCents: 100,
      transactionStatus: "confirmado",
      projectId: "p1",
    });
    expect(r.ok).toBe(true);
  });
  it("validateDirectCostInput: monto ≤ 0 rechazado", () => {
    expect(
      validateDirectCostInput({
        amountCents: 0,
        transactionStatus: "confirmado",
        projectId: "p1",
      }).ok,
    ).toBe(false);
  });
  it("computeDirectCost suma directa de `amountCents`", () => {
    expect(
      computeDirectCost([{ amountCents: 100 }, { amountCents: 200 }]),
    ).toBe(300);
  });
  it("DirectCostImputeInputSchema acepta projectId + transactionId", () => {
    expect(
      DirectCostImputeInputSchema.safeParse({
        projectId: "00000000-0000-0000-0000-000000000001",
        transactionId: "00000000-0000-0000-0000-000000000002",
      }).success,
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5 · Costo total + margen (BR-N280/281)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-009 · AC-5 · costo total + margen (BR-N280/281)", () => {
  it("costo total = laboral + directo; margen = vendido − costo total", () => {
    const r = buildProjectCostSummary({
      projectId: "p1",
      laborCostCents: 200_000,
      directCostCents: 50_000,
      soldTotalCents: 400_000,
      timeEntries: [
        { hours: 4, costPerHourCents: 50_000, userId: "u1", projectId: "p1" },
      ],
    });
    expect(r.totalCostCents).toBe(250_000);
    expect(r.marginCents).toBe(150_000);
  });
  it("margen = null sin vendido", () => {
    const r = buildProjectCostSummary({
      projectId: "p1",
      laborCostCents: 100,
      directCostCents: 0,
      soldTotalCents: null,
      timeEntries: [],
    });
    expect(r.marginCents).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6 · Rentabilidad por técnico (DEC-FUN-25, BR-N282)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-009 · AC-6 · rentabilidad por técnico (DEC-FUN-25, BR-N282)", () => {
  it("byTechnician desglosa por userId con horas y costo", () => {
    const r = buildProjectCostSummary({
      projectId: "p1",
      laborCostCents: 200_000,
      directCostCents: 0,
      soldTotalCents: 400_000,
      timeEntries: [
        { hours: 4, costPerHourCents: 50_000, userId: "u1", projectId: "p1" },
        { hours: 1, costPerHourCents: 0, userId: "u2", projectId: "p1" },
      ],
    });
    expect(r.byTechnician.length).toBe(2);
    const u1 = r.byTechnician.find((t) => t.userId === "u1");
    expect(u1?.hoursTotal).toBe(4);
    expect(u1?.costCents).toBe(200_000);
    // Margen parcial prorrateado por horas (4/5 × 200_000 = 160_000).
    expect(u1?.marginCents).toBe(Math.round((4 / 5) * 200_000));
  });
  it("byTechnician: margenCents = null si soldTotal es null", () => {
    const r = buildProjectCostSummary({
      projectId: "p1",
      laborCostCents: 100,
      directCostCents: 0,
      soldTotalCents: null,
      timeEntries: [{ hours: 1, costPerHourCents: 100, userId: "u1", projectId: "p1" }],
    });
    expect(r.byTechnician[0]?.marginCents).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-8 · Clasificación no operativa (BR-N326/327/328)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-009 · AC-8 · clasificación no operativa", () => {
  it("isOperativeTransaction: true para ingreso/gasto", () => {
    expect(isOperativeTransaction({ type: "ingreso", subKind: null })).toBe(true);
    expect(isOperativeTransaction({ type: "gasto", subKind: null })).toBe(true);
  });
  it("transferencia + capital nunca son operativos", () => {
    expect(isOperativeTransaction({ type: "transferencia", subKind: "otro" as never })).toBe(false);
    expect(isOperativeTransaction({ type: "capital", subKind: null })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-9 · Vendido/facturado/cobrado separados (BR-015)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-009 · AC-9 · vendido/facturado/cobrado separados (BR-015)", () => {
  it("buildProjectFinancialReport expone los 3 importes por separado", () => {
    const r = buildProjectFinancialReport({
      soldTotalCents: 1_000_000,
      nonCancelledInvoicedCents: 600_000,
      confirmedPaidCents: 300_000,
    });
    expect(r.soldTotalCents).toBe(1_000_000);
    expect(r.invoicedTotalCents).toBe(600_000);
    expect(r.collectedTotalCents).toBe(300_000);
    expect(r.outstandingBalanceCents).toBe(300_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-10 · osOutstandingBalance (BR-N249/N394)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-009 · AC-10 · osOutstandingBalance (BR-N249/N394)", () => {
  it("OsOutstandingBalanceInputSchema acepta orderId", () => {
    expect(
      OsOutstandingBalanceInputSchema.safeParse({
        orderId: "00000000-0000-0000-0000-000000000001",
      }).success,
    ).toBe(true);
  });
  it("computeOsOutstandingBalance: facturado − cobrado + CxP + comisiones", () => {
    const r = computeOsOutstandingBalance({
      nonCancelledInvoicedCents: 1_000_000,
      confirmedPaidCents: 700_000,
      pendingCxpCents: 50_000,
      pendingCommissionsCents: 25_000,
    });
    expect(r).toBe(300_000 + 50_000 + 25_000);
  });
  it("saldo = 0 ⇒ SPEC-004 puede cerrar la OS", () => {
    const r = computeOsOutstandingBalance({
      nonCancelledInvoicedCents: 500_000,
      confirmedPaidCents: 500_000,
    });
    expect(r).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers varios
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-009 · helpers varios", () => {
  it("isAccountTypeValid: true para los 5 tipos", () => {
    expect(isAccountTypeValid("activo")).toBe(true);
    expect(isAccountTypeValid("capital")).toBe(true);
    expect(isAccountTypeValid("otro")).toBe(false);
  });
  it("isTransactionTypeValid: true para los 4 tipos", () => {
    expect(isTransactionTypeValid("ingreso")).toBe(true);
    expect(isTransactionTypeValid("transferencia")).toBe(true);
    expect(isTransactionTypeValid("otro")).toBe(false);
  });
  it("computeAccountBalance: ingresos/gastos + transferencias + capital", () => {
    const r = computeAccountBalance({
      openingCents: 1_000,
      transactions: [
        { accountId: "a", type: "ingreso", amountCents: 100, status: "confirmado" },
        { accountId: "a", type: "gasto", amountCents: 50, status: "confirmado" },
        { accountId: "a", type: "transferencia", amountCents: -25, status: "confirmado" },
        { accountId: "a", type: "transferencia", amountCents: 30, status: "confirmado" },
        { accountId: "a", type: "capital", amountCents: 10, status: "confirmado" },
        { accountId: "a", type: "capital", amountCents: -5, status: "confirmado" },
        // borrador NO se cuenta.
        { accountId: "a", type: "gasto", amountCents: 999, status: "borrador" },
      ],
    });
    expect(r.balanceCents).toBe(1000 + 100 - 50 - 25 + 30 + 10 - 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-11 · UI/responsive (grep)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-009 · AC-11 · UI responsive (grep)", () => {
  it("finanzas/page.tsx usa overflow-x-auto + hidden sm/md:table-cell", async () => {
    const src = await readFile(
      "src/app/(dashboard)/finanzas/page.tsx",
      "utf8",
    );
    expect(src).toContain("overflow-x-auto");
    expect(src).toMatch(/hidden[^"]+sm:table-cell/);
    expect(src).toMatch(/hidden[^"]+md:table-cell/);
    // 5 pestañas operables
    expect(src).toContain("cuentas");
    expect(src).toContain("movimientos");
    expect(src).toContain("transferencias");
    expect(src).toContain("costos");
    expect(src).toContain("rentabilidad");
    // Banner P-009-1
    expect(src).toContain("gateSeedAccounts");
  });
  it("schemas Zod principales válidos", () => {
    expect(
      AccountCreateInputSchema.safeParse({
        name: "Banco principal",
        type: "activo",
        currency: "MXN",
        openingBalanceCents: 0,
      }).success,
    ).toBe(true);
    expect(
      TransactionRecordInputSchema.safeParse({
        accountId: "00000000-0000-0000-0000-000000000001",
        type: "gasto",
        amountCents: -1000,
        operationDate: "2026-08-23",
      }).success,
    ).toBe(true);
    expect(
      TransactionRecordInputSchema.safeParse({
        accountId: "00000000-0000-0000-0000-000000000001",
        type: "ingreso",
        amountCents: 0, // rechazamos
        operationDate: "2026-08-23",
      }).success,
    ).toBe(false);
  });
});
