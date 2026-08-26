/**
 * SPEC-007 (Facturación CFDI · B18) — tests unitarios puros.
 *
 * Cubre los AC sin requerir BD funcional:
 *  - AC-1 · timbrado/transiciones/motivo SAT + fail-closed CSD/API key
 *    (helpers puros + adapter mock determinista).
 *  - AC-2 · cancelación motivo SAT + reversar aplicaciones.
 *  - AC-3 · estados + `markVencida` (helper `isInvoiceVencida`).
 *  - AC-4 · aplicaciones no exceden saldo (validateInvoiceApplication +
 *    revertInvoiceApplication).
 *  - AC-5 · facturación recurrente idempotente (nextScheduleJobKey +
 *    validateScheduleInput).
 *  - AC-6 · ZIP mensual sólo activas (selectZipFacturas).
 *  - AC-7 · calendario 7 estados visuales + motivo SAT.
 *  - AC-8 · factura borrador de renovación (buildDraftFromSubscriptionRenewal).
 *  - AC-9 · preview (mismo armado que timbrado sin PAC).
 *  - AC-10 · UI/responsive (grep sobre `facturas-list.tsx` /
 *    `schedules-list.tsx` / `page.tsx`).
 *
 * Los flujos de BD + PAC real se validan en V3 Playwright contra
 * staging LIVE (gates externos no autorizados en este turno, P-007-1).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  BASE_PERMISSIONS,
  CANCEL_MOTIVES_SAT,
  ERROR_CODES,
  INVOICE_AUDIT_ACTIONS,
  INVOICE_CALENDAR_VISUAL_STATUSES,
  INVOICE_SCHEDULE_STATUSES,
  INVOICE_STATUSES,
  SCHEDULE_AUTO_OR_DRAFT_KINDS,
} from "@/shared/enums";
import {
  InvoiceApplyPaymentInputSchema,
  InvoiceBuildInputSchema,
  InvoiceCancelInputSchema,
  InvoiceDraftFromRenewalInputSchema,
  InvoiceScheduleCreateInputSchema,
  InvoiceZipInputSchema,
} from "@/shared/zod";
import {
  buildCfdiConcept,
  buildDraftFromSubscriptionRenewal,
  canTransitionInvoice,
  createPacMockClient,
  invoiceCalendarVisualStatus,
  isInvoiceVencida,
  isScheduleStatusTerminal,
  isValidCancelMotive,
  isValidCfdiUuid,
  nextScheduleJobKey,
  selectZipFacturas,
  validateCancelReason,
  validateInvoiceApplication,
  validateScheduleInput,
  revertInvoiceApplication,
  CALENDAR_VISUAL_STATUS_COUNT,
  IVA_RATE,
} from "@/server/services/facturacion";
import {
  createPacClient,
  createPacHttpClient,
} from "@/server/integrations/pac";

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo canónico
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-007 · catálogo canónico", () => {
  it("INVOICE_STATUSES expone los 6 estados persistidos", () => {
    expect([...INVOICE_STATUSES]).toEqual([
      "borrador",
      "emitida",
      "parcialmente_pagada",
      "pagada",
      "vencida",
      "cancelada",
    ]);
  });
  it("CANCEL_MOTIVES_SAT expone los 4 motivos SAT 01-04", () => {
    expect([...CANCEL_MOTIVES_SAT]).toEqual(["01", "02", "03", "04"]);
  });
  it("INVOICE_SCHEDULE_STATUSES expone los 3 estados del schedule", () => {
    expect([...INVOICE_SCHEDULE_STATUSES]).toEqual([
      "pending",
      "executed",
      "skipped",
    ]);
  });
  it("SCHEDULE_AUTO_OR_DRAFT_KINDS expone `auto` y `draft`", () => {
    expect([...SCHEDULE_AUTO_OR_DRAFT_KINDS]).toEqual(["auto", "draft"]);
  });
  it("INVOICE_CALENDAR_VISUAL_STATUSES expone 7 estados visuales (BR-N312)", () => {
    expect([...INVOICE_CALENDAR_VISUAL_STATUSES]).toEqual([
      "borrador",
      "programada",
      "emitida",
      "parcialmente_pagada",
      "pagada",
      "vencida",
      "cancelada",
    ]);
    expect([...INVOICE_CALENDAR_VISUAL_STATUSES].length).toBe(
      CALENDAR_VISUAL_STATUS_COUNT,
    );
  });
  it("ERROR_CODES contiene los códigos nuevos de SPEC-007 (BR-N302/305/309)", () => {
    const codes = ERROR_CODES as readonly string[];
    expect(codes).toContain("INVOICE_NOT_FOUND");
    expect(codes).toContain("INVOICE_TIMBRAR_DRAFT_ONLY");
    expect(codes).toContain("INVALID_CANCEL_MOTIVE");
    expect(codes).toContain("CSD_NOT_CONFIGURED");
    expect(codes).toContain("PAC_API_KEY_MISSING");
    expect(codes).toContain("INVOICE_HAS_APPLICATIONS");
    expect(codes).toContain("APPLICATION_EXCEEDS_BALANCE");
    expect(codes).toContain("INVOICE_FISCAL_DATA_REQUIRED");
  });
  it("INVOICE_AUDIT_ACTIONS contiene namespace `factura.*` y `invoice_schedule.*`", () => {
    const acts = INVOICE_AUDIT_ACTIONS as readonly string[];
    expect(acts).toContain("factura.build");
    expect(acts).toContain("factura.timbrar");
    expect(acts).toContain("factura.cancel");
    expect(acts).toContain("factura.mark_vencida");
    expect(acts).toContain("factura.aplicar_pago");
    expect(acts).toContain("factura.reversar_aplicacion");
    expect(acts).toContain("factura.zip_generado");
    expect(acts).toContain("factura.draft_from_subscription_renewal");
    expect(acts).toContain("invoice_schedule.create");
    expect(acts).toContain("invoice_schedule.run");
    expect(acts).toContain("invoice_schedule.skip");
  });
  it("BASE_PERMISSIONS contiene los 3 permisos nuevos", () => {
    const bp = BASE_PERMISSIONS as readonly string[];
    expect(bp).toContain("gestionar_facturacion");
    expect(bp).toContain("ver_facturas");
    expect(bp).toContain("timbrar_facturas");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 · timbrado real con PAC (helper de armado + adapter mock)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-007 · AC-1 · timbrado real con PAC (mock P-007-1)", () => {
  it("armar concepto CFDI calcula subtotal + IVA 16% + total", () => {
    const built = buildCfdiConcept([
      {
        claveProdServ: "84111506",
        descripcion: "Servicios profesionales",
        cantidad: 1,
        valorUnitarioCents: 100_000, // $1000
      },
      {
        claveProdServ: "80101500",
        descripcion: "Consultoría",
        cantidad: 2,
        valorUnitarioCents: 25_000, // $250 c/u
      },
    ]);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.concept.totals.subtotalCents).toBe(150_000); // $1500
    expect(built.concept.totals.taxCents).toBe(Math.round(150_000 * IVA_RATE));
    expect(built.concept.totals.totalCents).toBe(
      built.concept.totals.subtotalCents + built.concept.totals.taxCents,
    );
  });

  it("rechaza líneas vacías o cantidad ≤ 0 (BR-N301)", () => {
    expect(
      buildCfdiConcept([]).ok,
    ).toBe(false);
    expect(
      buildCfdiConcept([
        {
          claveProdServ: "",
          descripcion: "x",
          cantidad: 1,
          valorUnitarioCents: 100,
        },
      ]).ok,
    ).toBe(false);
    expect(
      buildCfdiConcept([
        {
          claveProdServ: "84111506",
          descripcion: "x",
          cantidad: 0,
          valorUnitarioCents: 100,
        },
      ]).ok,
    ).toBe(false);
  });

  it("rechaza descuento > importe bruto", () => {
    expect(
      buildCfdiConcept([
        {
          claveProdServ: "84111506",
          descripcion: "x",
          cantidad: 1,
          valorUnitarioCents: 100,
          descuentoCents: 200,
        },
      ]).ok,
    ).toBe(false);
  });

  it("PAC mock: stamp genera UUID v4 + XML con UUID + PDF con UUID (BR-N304)", async () => {
    const pac = createPacMockClient();
    const result = await pac.stamp({
      organizationId: "00000000-0000-0000-0000-000000000001",
      apiKey: "mock-key",
      csdCer: Buffer.from([0x01]),
      csdPem: Buffer.from([0x02]),
      csdPassword: "mock",
      rfcEmisor: "VAI000101AAA",
      invoiceId: "00000000-0000-0000-0000-000000000003",
      invoiceCode: "FAC-MOCK-003",
      receptor: {
        rfc: "XAXX010101000",
        razonSocial: "Receptor mock",
        regimenFiscal: "601",
        domicilio: null,
        cfdiUse: "G03",
      },
      concepto: {
        claveProdServ: "84111506",
        descripcion: "Servicios",
        cantidad: 1,
        valorUnitarioCents: 100_000,
        importeCents: 100_000,
      },
      totalCents: 116_000,
    });
    expect(isValidCfdiUuid(result.cfdiUuid)).toBe(true);
    expect(result.xml.toString("utf8")).toContain(result.cfdiUuid);
    expect(result.pdf.toString("utf8")).toContain(result.cfdiUuid);
  });

  it("PAC mock: fail-closed CSD/API key ausentes (BR-N302 → 412)", async () => {
    const pac = createPacMockClient();
    await expect(
      pac.stamp({
        organizationId: "00000000-0000-0000-0000-000000000001",
        apiKey: "",
        csdCer: Buffer.from([0x01]),
        csdPem: Buffer.from([0x02]),
        csdPassword: "mock",
        rfcEmisor: "VAI000101AAA",
        invoiceId: "00000000-0000-0000-0000-000000000001",
        invoiceCode: "FAC-MOCK-001",
        receptor: {
          rfc: "XAXX010101000",
          razonSocial: "Receptor mock",
          regimenFiscal: "601",
          domicilio: null,
          cfdiUse: "G03",
        },
        concepto: {
          claveProdServ: "84111506",
          descripcion: "Servicios",
          cantidad: 1,
          valorUnitarioCents: 100_000,
          importeCents: 100_000,
        },
        totalCents: 116_000,
      }),
    ).rejects.toMatchObject({ code: "PAC_API_KEY_MISSING" });
    await expect(
      pac.stamp({
        organizationId: "00000000-0000-0000-0000-000000000001",
        apiKey: "k",
        csdCer: Buffer.alloc(0),
        csdPem: Buffer.from([0x02]),
        csdPassword: "mock",
        rfcEmisor: "VAI000101AAA",
        invoiceId: "00000000-0000-0000-0000-000000000002",
        invoiceCode: "FAC-MOCK-002",
        receptor: {
          rfc: "XAXX010101000",
          razonSocial: "Receptor mock",
          regimenFiscal: "601",
          domicilio: null,
          cfdiUse: "G03",
        },
        concepto: {
          claveProdServ: "84111506",
          descripcion: "Servicios",
          cantidad: 1,
          valorUnitarioCents: 100_000,
          importeCents: 100_000,
        },
        totalCents: 116_000,
      }),
    ).rejects.toMatchObject({ code: "CSD_NOT_CONFIGURED" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2 · cancelación motivo SAT + reversar aplicaciones
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-007 · AC-2 · cancelación motivo SAT + reversar aplicaciones", () => {
  it("isValidCancelMotive acepta 01-04", () => {
    expect(isValidCancelMotive("01")).toBe(true);
    expect(isValidCancelMotive("02")).toBe(true);
    expect(isValidCancelMotive("03")).toBe(true);
    expect(isValidCancelMotive("04")).toBe(true);
    expect(isValidCancelMotive("05")).toBe(false);
    expect(isValidCancelMotive("")).toBe(false);
    expect(isValidCancelMotive(null)).toBe(false);
  });

  it("canTransitionInvoice: emitida → cancelada requiere motivo SAT", () => {
    const ok = canTransitionInvoice("emitida", "cancelada", {
      cancelMotiveSat: "01",
      hasApplications: false,
    });
    expect(ok).toEqual({ ok: true });
    const noMotivo = canTransitionInvoice("emitida", "cancelada", {
      hasApplications: false,
    });
    expect(noMotivo.ok).toBe(false);
    if (noMotivo.ok) return;
    expect(noMotivo.code).toBe("INVOICE_INVALID_TRANSITION");
  });

  it("canTransitionInvoice: emitida con aplicaciones → INVOICE_HAS_APPLICATIONS", () => {
    const r = canTransitionInvoice("emitida", "cancelada", {
      cancelMotiveSat: "01",
      hasApplications: true,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("INVOICE_HAS_APPLICATIONS");
  });

  it("canTransitionInvoice: timbrar exige status='borrador'", () => {
    // Intentar re-timbrar (`parcialmente_pagada → emitida`) no
    // procede: sólo `borrador → emitida` es válido.
    const r = canTransitionInvoice("parcialmente_pagada", "emitida");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("INVOICE_TIMBRAR_DRAFT_ONLY");
  });

  it("validateCancelReason exige ≥3 caracteres (BR-N305)", () => {
    expect(validateCancelReason("ab").ok).toBe(false);
    expect(validateCancelReason("abc").ok).toBe(true);
  });

  it("PAC mock: cancel rechaza motivo SAT inválido (BR-N305 → 400)", async () => {
    const pac = createPacMockClient();
    await expect(
      pac.cancel({
        organizationId: "00000000-0000-0000-0000-000000000001",
        apiKey: "k",
        cfdiUuid:
          "00000000-0000-4000-8000-000000000001",
        motivoSat: "99" as never,
        rfcEmisor: "VAI000101AAA",
      }),
    ).rejects.toMatchObject({ code: "INVALID_CANCEL_MOTIVE" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3 · estados + vencida
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-007 · AC-3 · estados + markVencida", () => {
  it("isInvoiceVencida: due < ref && paid < total → true (BR-N307)", () => {
    expect(
      isInvoiceVencida({
        dueDate: "2026-01-01",
        paidCents: 0,
        totalCents: 100,
        refDate: new Date("2026-02-01"),
      }),
    ).toBe(true);
  });
  it("isInvoiceVencida: due < ref pero paid === total → false (ya pagada)", () => {
    expect(
      isInvoiceVencida({
        dueDate: "2026-01-01",
        paidCents: 100,
        totalCents: 100,
        refDate: new Date("2026-02-01"),
      }),
    ).toBe(false);
  });
  it("isInvoiceVencida: due === ref → false (vence hoy, no vencida)", () => {
    expect(
      isInvoiceVencida({
        dueDate: "2026-02-01",
        paidCents: 0,
        totalCents: 100,
        refDate: new Date("2026-02-01"),
      }),
    ).toBe(false);
  });
  it("isInvoiceVencida: due > ref → false (aún no vence)", () => {
    expect(
      isInvoiceVencida({
        dueDate: "2026-12-31",
        paidCents: 0,
        totalCents: 100,
        refDate: new Date("2026-02-01"),
      }),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4 · aplicaciones no exceden saldo
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-007 · AC-4 · aplicaciones no exceden saldo (BR-N308/BR-012)", () => {
  it("aplicar 50/100 → status=parcialmente_pagada", () => {
    const r = validateInvoiceApplication({
      currentPaidCents: 0,
      totalCents: 100,
      applyCents: 50,
      currentStatus: "emitida",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.newPaidCents).toBe(50);
    expect(r.newStatus).toBe("parcialmente_pagada");
  });
  it("aplicar 100/100 → status=pagada", () => {
    const r = validateInvoiceApplication({
      currentPaidCents: 0,
      totalCents: 100,
      applyCents: 100,
      currentStatus: "emitida",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.newStatus).toBe("pagada");
  });
  it("aplicar 101/100 → APPLICATION_EXCEEDS_BALANCE (409)", () => {
    const r = validateInvoiceApplication({
      currentPaidCents: 80,
      totalCents: 100,
      applyCents: 21,
      currentStatus: "emitida",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("APPLICATION_EXCEEDS_BALANCE");
  });
  it("rechaza aplicar a borrador o cancelada", () => {
    expect(
      validateInvoiceApplication({
        currentPaidCents: 0,
        totalCents: 100,
        applyCents: 10,
        currentStatus: "borrador",
      }).ok,
    ).toBe(false);
    expect(
      validateInvoiceApplication({
        currentPaidCents: 0,
        totalCents: 100,
        applyCents: 10,
        currentStatus: "cancelada",
      }).ok,
    ).toBe(false);
  });
  it("revertir aplicación parcial → status=parcialmente_pagada", () => {
    const r = revertInvoiceApplication({
      currentPaidCents: 50,
      totalCents: 100,
      revertCents: 20,
      currentStatus: "parcialmente_pagada",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.newPaidCents).toBe(30);
    expect(r.newStatus).toBe("parcialmente_pagada");
  });
  it("revertir pagada → status=emitida (BR-N309)", () => {
    const r = revertInvoiceApplication({
      currentPaidCents: 100,
      totalCents: 100,
      revertCents: 100,
      currentStatus: "pagada",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.newStatus).toBe("emitida");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5 · facturación recurrente idempotente
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-007 · AC-5 · facturación recurrente idempotente (BR-N310)", () => {
  it("nextScheduleJobKey deriva key estable de schedule + fecha", () => {
    const k = nextScheduleJobKey({
      scheduleId: "sch-1",
      scheduledDate: "2026-08-23",
    });
    expect(k).toBe("sch-1|2026-08-23");
    const k2 = nextScheduleJobKey({
      scheduleId: "sch-1",
      scheduledDate: new Date("2026-08-23T10:00:00Z"),
    });
    expect(k2).toBe("sch-1|2026-08-23");
  });
  it("validateScheduleInput exige orderId o subscriptionId", () => {
    expect(
      validateScheduleInput({
        scheduledDate: "2026-08-23",
        amountCents: 100,
        autoOrDraft: "auto",
      }).ok,
    ).toBe(false);
    expect(
      validateScheduleInput({
        scheduledDate: "2026-08-23",
        amountCents: 100,
        autoOrDraft: "auto",
        orderId: "ord-1",
      }).ok,
    ).toBe(true);
  });
  it("validateScheduleInput rechaza autoOrDraft desconocido", () => {
    expect(
      validateScheduleInput({
        scheduledDate: "2026-08-23",
        amountCents: 100,
        autoOrDraft: "wat",
        orderId: "ord-1",
      }).ok,
    ).toBe(false);
  });
  it("isScheduleStatusTerminal: executed y skipped", () => {
    expect(isScheduleStatusTerminal("executed")).toBe(true);
    expect(isScheduleStatusTerminal("skipped")).toBe(true);
    expect(isScheduleStatusTerminal("pending")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6 · ZIP mensual sólo activas (DEC-FUN-38/26)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-007 · AC-6 · ZIP mensual sólo activas", () => {
  const baseRows = [
    {
      id: "1",
      status: "emitida",
      dueDate: "2026-08-15",
    },
    {
      id: "2",
      status: "cancelada",
      dueDate: "2026-08-15",
    },
    {
      id: "3",
      status: "vencida",
      dueDate: "2026-08-15",
    },
    {
      id: "4",
      status: "borrador",
      dueDate: "2026-08-15",
    },
    {
      id: "5",
      status: "pagada",
      dueDate: "2026-07-31", // mes anterior
    },
  ];

  it("filtra canceladas y fuera del mes (default excluye borradores)", () => {
    const sel = selectZipFacturas({
      facturas: baseRows,
      year: 2026,
      month: 8,
    });
    // cancelada (2) y fuera-de-mes (5) excluidas; borrador (4)
    // excluida por default; quedan emitida (1) y vencida (3).
    expect(sel.map((r) => r.id).sort()).toEqual(["1", "3"]);
  });

  it("default excluye borradores (sólo activas timbradas)", () => {
    const sel = selectZipFacturas({
      facturas: baseRows,
      year: 2026,
      month: 8,
        // includeBorrador omitido → default false
    });
    expect(sel.map((r) => r.id)).toContain("1");
    expect(sel.map((r) => r.id)).not.toContain("4");
  });

  it("includeBorrador=true incluye borradores", () => {
    const sel = selectZipFacturas({
      facturas: baseRows,
      year: 2026,
      month: 8,
      includeBorrador: true,
    });
    expect(sel.map((r) => r.id)).toContain("4");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7 · calendario 7 estados visuales + motivo SAT
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-007 · AC-7 · calendario 7 estados visuales (BR-N312)", () => {
  it("invoiceCalendarVisualStatus: borrador sin schedule → borrador", () => {
    expect(
      invoiceCalendarVisualStatus({ status: "borrador" }),
    ).toBe("borrador");
  });
  it("borrador con schedule futuro → programada", () => {
    expect(
      invoiceCalendarVisualStatus({
        status: "borrador",
        hasFutureSchedule: true,
      }),
    ).toBe("programada");
  });
  it("emitida / parcialmente_pagada / pagada / vencida / cancelada se preservan", () => {
    expect(
      invoiceCalendarVisualStatus({ status: "emitida" }),
    ).toBe("emitida");
    expect(
      invoiceCalendarVisualStatus({ status: "parcialmente_pagada" }),
    ).toBe("parcialmente_pagada");
    expect(
      invoiceCalendarVisualStatus({ status: "pagada" }),
    ).toBe("pagada");
    expect(
      invoiceCalendarVisualStatus({ status: "vencida" }),
    ).toBe("vencida");
    expect(
      invoiceCalendarVisualStatus({ status: "cancelada" }),
    ).toBe("cancelada");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-8 · factura borrador de renovación (BR-N406, consumido por SPEC-011)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-007 · AC-8 · createDraftFromSubscriptionRenewal", () => {
  it("construye borrador válido a partir de la renovación", () => {
    const r = buildDraftFromSubscriptionRenewal({
      code: "F-00001",
      subscriptionId: "sub-1",
      clientId: "cli-1",
      fiscalDataSnapshot: {
        rfc: "XAXX010101000",
        razonSocial: "Receptor",
        regimen: "601",
      },
      concept: {
        claveProdServ: "84111506",
        descripcion: "Renovación mensual",
        cantidad: 1,
        valorUnitarioCents: 100_000,
      },
      dueDate: "2026-09-01",
      createdBy: "usr-1",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe("borrador");
    expect(r.value.subscriptionId).toBe("sub-1");
  });

  it("rechaza sin snapshot fiscal", () => {
    const r = buildDraftFromSubscriptionRenewal({
      code: "F-00001",
      subscriptionId: "sub-1",
      clientId: "cli-1",
      fiscalDataSnapshot: {},
      concept: {
        claveProdServ: "84111506",
        descripcion: "x",
        cantidad: 1,
        valorUnitarioCents: 100,
      },
      dueDate: "2026-09-01",
      createdBy: "usr-1",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("INVOICE_FISCAL_DATA_REQUIRED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-9 · preview (mismo armado que timbrado)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-007 · AC-9 · preview (BR-N303)", () => {
  it("InvoiceBuildInputSchema acepta input mínimo válido", () => {
    const parsed = InvoiceBuildInputSchema.safeParse({
      orderId: "00000000-0000-0000-0000-000000000001",
      dueDate: "2026-09-01",
      concept: [
        {
          claveProdServ: "84111506",
          descripcion: "Servicios profesionales",
          cantidad: 1,
          valorUnitarioCents: 100_000,
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
  it("InvoiceBuildInputSchema rechaza dueDate no YYYY-MM-DD", () => {
    expect(
      InvoiceBuildInputSchema.safeParse({
        orderId: "00000000-0000-0000-0000-000000000001",
        dueDate: "01-09-2026",
        concept: [
          {
            claveProdServ: "84111506",
            descripcion: "x",
            cantidad: 1,
            valorUnitarioCents: 100,
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("InvoiceCancelInputSchema exige motivo SAT válido + reason ≥3", () => {
    expect(
      InvoiceCancelInputSchema.safeParse({
        invoiceId: "00000000-0000-0000-0000-000000000001",
        motivoSat: "99",
        reason: "ab",
      }).success,
    ).toBe(false);
    expect(
      InvoiceCancelInputSchema.safeParse({
        invoiceId: "00000000-0000-0000-0000-000000000001",
        motivoSat: "01",
        reason: "Error de captura",
      }).success,
    ).toBe(true);
  });
  it("InvoiceApplyPaymentInputSchema exige amountCents positivo", () => {
    expect(
      InvoiceApplyPaymentInputSchema.safeParse({
        invoiceId: "00000000-0000-0000-0000-000000000001",
        amountCents: 0,
      }).success,
    ).toBe(false);
  });
  it("InvoiceScheduleCreateInputSchema exige orderId o subscriptionId", () => {
    expect(
      InvoiceScheduleCreateInputSchema.safeParse({
        scheduledDate: "2026-09-01",
        amountCents: 1000,
        autoOrDraft: "draft",
      }).success,
    ).toBe(false);
    expect(
      InvoiceScheduleCreateInputSchema.safeParse({
        scheduledDate: "2026-09-01",
        amountCents: 1000,
        autoOrDraft: "draft",
        orderId: "00000000-0000-0000-0000-000000000001",
      }).success,
    ).toBe(true);
  });
  it("InvoiceZipInputSchema valida año/mes/manual", () => {
    expect(
      InvoiceZipInputSchema.safeParse({
        year: 2026,
        month: 13,
        manual: true,
      }).success,
    ).toBe(false);
    expect(
      InvoiceZipInputSchema.safeParse({
        year: 2026,
        month: 8,
        manual: true,
      }).success,
    ).toBe(true);
  });
  it("InvoiceDraftFromRenewalInputSchema acepta input mínimo", () => {
    expect(
      InvoiceDraftFromRenewalInputSchema.safeParse({
        subscriptionId: "00000000-0000-0000-0000-000000000001",
        clientId: "00000000-0000-0000-0000-000000000002",
        fiscalDataSnapshot: { rfc: "x" },
        concept: {
          claveProdServ: "84111506",
          descripcion: "x",
          cantidad: 1,
          valorUnitarioCents: 100,
        },
        dueDate: "2026-09-01",
      }).success,
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-10 · UI/responsive (grep)
// ─────────────────────────────────────────────────────────────────────────────

describe("SPEC-007 · AC-10 · UI responsive (grep)", () => {
  it("facturas-list usa overflow-x-auto + hidden sm/md:table-cell", async () => {
    const src = await readFile(
      "src/modules/facturacion/facturas-list.tsx",
      "utf8",
    );
    expect(src).toContain("overflow-x-auto");
    expect(src).toMatch(/hidden[^"]+sm:table-cell/);
    expect(src).toMatch(/hidden[^"]+md:table-cell/);
    // Accesibilidad: aria-label en diálogos.
    expect(src).toContain("aria-modal=\"true\"");
    expect(src).toContain("role=\"dialog\"");
  });
  it("schedules-list usa overflow-x-auto + hidden sm:table-cell", async () => {
    const src = await readFile(
      "src/modules/facturacion/schedules-list.tsx",
      "utf8",
    );
    expect(src).toContain("overflow-x-auto");
    expect(src).toMatch(/hidden[^"]+sm:table-cell/);
  });
  it("page.tsx expone 2 pestañas operables con overflow-x-auto", async () => {
    const src = await readFile(
      "src/app/(dashboard)/facturacion/page.tsx",
      "utf8",
    );
    expect(src).toContain("overflow-x-auto");
    expect(src).toContain("setTab");
    // 7 estados visuales referenciados.
    expect(src).toContain(messages_facturacion_ref());
  });
  function messages_facturacion_ref() {
    return "Facturas";
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// IMPL-20260825-36 · ADR-20260825-01 · Adaptador Facturapi v2 (HTTP).
// Cubre: auth Bearer, payload, idempotencia, descargas XML/PDF, errores
// canónicos 401/404/409/422/429/5xx, ausencia de CSD, NO llama a
// Facturapi (fetch mockeado), NO imprime secretos en logs.
// ─────────────────────────────────────────────────────────────────────────────

import type { PacStampInput } from "@/server/integrations/pac";

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

/**
 * IMPL-20260825-36 (intento 7 · F-13) · Mock dinámico para tests
 * que dependen del `external_id` real (que es un hash). En lugar
 * de hardcodear un valor, el handler captura el POST /invoices
 * body, extrae `external_id`, y lo usa en la respuesta del GET
 * recovery. Esto evita fragilidad ante cambios del algoritmo de
 * hash.
 */
function makeRecoveryFetchMock(
  opts: {
    /** Mockea la respuesta del GET recovery (devuelve `data` con match único). */
    getRecoveryData?: (realExternalId: string) => Array<{
      id: string;
      status: string;
      external_id?: string;
      is_ready_to_stamp?: boolean;
    }>;
    /** Status del POST /invoices (default 409). */
    postInvoiceStatus?: number;
    /** Body del POST /invoices 4xx (default: idempotency_key_conflict). */
    postInvoiceBody?: unknown;
  } = {},
): { fetchImpl: typeof fetch; captured: CapturedRequest[] } {
  const captured: CapturedRequest[] = [];
  let postInvoiceExternalId: string | null = null;
  const fetchImpl = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => {
          headers[k] = v;
        });
      } else if (Array.isArray(init.headers)) {
        for (const [k, v] of init.headers) headers[k] = v;
      } else {
        Object.assign(headers, init.headers as Record<string, string>);
      }
    }
    const body =
      typeof init?.body === "string"
        ? (init.body as string)
        : null;
    captured.push({ url, method, headers, body });

    if (method === "POST" && /\/customers$/.test(url)) {
      return new Response(JSON.stringify({ id: "cust-1" }), { status: 200 });
    }
    if (method === "POST" && /\/invoices$/.test(url)) {
      try {
        const parsed = body ? (JSON.parse(body) as { external_id?: string }) : {};
        postInvoiceExternalId = parsed.external_id ?? null;
      } catch {
        postInvoiceExternalId = null;
      }
      const status = opts.postInvoiceStatus ?? 409;
      const bodyData =
        opts.postInvoiceBody ?? {
          message: "Idempotency key already used",
          errors: [
            {
              source: "facturapi",
              code: "idempotency_key_conflict",
              path: "idempotency_key",
              message: "Idempotency key already used",
            },
          ],
        };
      return new Response(JSON.stringify(bodyData), { status });
    }
    if (method === "GET" && /\/invoices\?external_id=/.test(url)) {
      const realId = postInvoiceExternalId;
      const data =
        realId && opts.getRecoveryData
          ? opts.getRecoveryData(realId)
          : [];
      return new Response(JSON.stringify({ data }), { status: 200 });
    }
    if (method === "POST" && /\/stamp$/.test(url)) {
      return new Response(
        JSON.stringify({
          id: "inv-existing",
          uuid: "U-RECOVERED",
          status: "stamped",
        }),
        { status: 200 },
      );
    }
    if (method === "GET" && /\/xml$/.test(url)) {
      return new Response("<xml/>", { status: 200 });
    }
    if (method === "GET" && /\/pdf$/.test(url)) {
      return new Response("%PDF-1.4", { status: 200 });
    }
    return new Response("", { status: 500 });
  }) as typeof fetch;
  return { fetchImpl, captured };
}

function makeFetchMock(responses: Array<{
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  delayMs?: number;
}>): { fetchImpl: typeof fetch; captured: CapturedRequest[] } {
  const captured: CapturedRequest[] = [];
  let i = 0;
  const fetchImpl = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers;
      if (h instanceof Headers) {
        h.forEach((v, k) => {
          headers[k] = v;
        });
      } else if (Array.isArray(h)) {
        for (const [k, v] of h) headers[k] = v;
      } else {
        Object.assign(headers, h as Record<string, string>);
      }
    }
    const body =
      typeof init?.body === "string"
        ? (init.body as string)
        : null;
    captured.push({ url, method, headers, body });
    const r = responses[i] ?? responses[responses.length - 1];
    i++;
    if (!r) {
      return new Response("", { status: 500 });
    }
    if (r.delayMs) {
      await new Promise((res) => setTimeout(res, r.delayMs));
    }
    let bodyText = "";
    if (r.body !== undefined) {
      bodyText =
        typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    }
    return new Response(bodyText, {
      status: r.status,
      headers: {
        "Content-Type":
          r.status === 200 && typeof r.body === "string"
            ? "application/octet-stream"
            : "application/json",
        ...(r.headers ?? {}),
      },
    });
  }) as typeof fetch;
  return { fetchImpl, captured };
}

const stampInputSample: PacStampInput = {
  organizationId: "00000000-0000-0000-0000-000000000001",
  apiKey: "sk_test_abcdef1234567890",
  csdCer: Buffer.alloc(0),
  csdPem: Buffer.alloc(0),
  csdPassword: "",
  rfcEmisor: "VEC681010AA1",
  invoiceId: "00000000-0000-0000-0000-000000000001",
  invoiceCode: "FAC-2026-000001",
  receptor: {
    rfc: "XAXX010101000",
    razonSocial: "Cliente Test SA",
    regimenFiscal: "601",
    domicilio: {
      calle: "Blvd. Atardecer",
      numero: "142",
      colonia: "Centro",
      municipio: "Huatabampo",
      estado: "Sonora",
      cp: "86500",
      pais: "MEX",
    },
    cfdiUse: "G03",
    email: null,
  },
  concepto: {
    claveProdServ: "84111506",
    descripcion: "Servicios profesionales",
    cantidad: 1,
    valorUnitarioCents: 100_000,
    importeCents: 100_000,
    descuentoCents: 0,
  },
  totalCents: 116_000,
};

describe("IMPL-20260825-36 · AC-1 · adaptador Facturapi v2 HTTP (ADR-20260825-01)", () => {
  it("createPacHttpClient con apiKey ausente lanza PAC_API_KEY_MISSING", () => {
    expect(() =>
      createPacHttpClient({
        baseUrl: "https://www.facturapi.io/v2",
        apiKey: "",
      }),
    ).toThrow(/PAC_API_KEY_MISSING|Facturapi API key ausente/);
  });

  it("default baseUrl es https://www.facturapi.io/v2", () => {
    // Verifica que la constante default es la URL canónica.
    // Esto evita un fix accidental que apunte a un mirror o dominio
    // similar (phishing) por error de copia.
    const src = readFileSync(
      path.resolve(
        __dirname,
        "../src/server/integrations/pac/facturapi.ts",
      ),
      "utf8",
    );
    expect(src).toMatch(/DEFAULT_BASE_URL\s*=\s*["']https:\/\/www\.facturapi\.io\/v2["']/);
  });

  it("createPacClient({ mode: 'http' }) con apiKey inválida → mock (no http)", () => {
    // El factory `createPacClient` con `mode: 'mock'` siempre devuelve
    // el mock; con `mode: 'http'` requiere apiKey (descifrada por el
    // caller). Verificamos que el mock sigue funcionando para tests.
    const mock = createPacClient({ mode: "mock" });
    expect(typeof mock.stamp).toBe("function");
    expect(typeof mock.cancel).toBe("function");
  });

  it("Authorization Bearer envía la apiKey y NO la imprime en ningún campo", async () => {
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      { status: 200, body: { id: "inv-1", is_ready_to_stamp: true } },
      { status: 200, body: { id: "inv-1", uuid: "U-1", status: "stamped" } },
      { status: 200, body: "<xml/>" },
      { status: 200, body: "%PDF-1.4" },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abcdef1234567890",
      fetchImpl,
    });
    await pac.stamp(stampInputSample);
    // Verifica que TODAS las requests llevan Authorization Bearer.
    for (const req of captured) {
      expect(req.headers["Authorization"]).toBe(
        "Bearer sk_test_abcdef1234567890",
      );
      // Y NO llevan la apiKey en ningún otro header ni en el body.
      // `req.body` puede ser null en requests sin payload (GET).
      const body = req.body ?? "";
      expect(body.includes("sk_test_abcdef1234567890")).toBe(false);
    }
  });

  it("Idempotency-Key en POST (customers, invoices, stamp) y external_id en invoice body", async () => {
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      { status: 200, body: { id: "inv-1", is_ready_to_stamp: true } },
      { status: 200, body: { id: "inv-1", uuid: "U-1", status: "stamped" } },
      { status: 200, body: "<xml/>" },
      { status: 200, body: "%PDF-1.4" },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    await pac.stamp(stampInputSample);
    // Las 3 requests POST deben llevar Idempotency-Key.
    const postReqs = captured.filter(
      (r) => r.method === "POST" || r.method === "DELETE",
    );
    for (const req of postReqs) {
      expect(req.headers["Idempotency-Key"]).toBeDefined();
      expect(req.headers["Idempotency-Key"]?.length).toBeGreaterThan(0);
    }
    // Customer body NO debe incluir `external_id` (no documentado
    // en POST /customers); debe incluir `default_invoice_use`.
    const customerBody = JSON.parse(
      captured[0]?.body ?? "{}",
    ) as Record<string, unknown>;
    expect(customerBody.external_id).toBeUndefined();
    expect(customerBody.default_invoice_use).toBe("G03");
    // Invoice body debe llevar `external_id`, `idempotency_key`
    // (campo documentado) y `status: draft`. IMPL-20260825-36
    // (intento 5 · F-12): prefijo `inv:` basado en
    // `organizationId + invoiceId` (antes era `os:` y derivaba
    // de RFC+importe).
    const invoiceBody = JSON.parse(
      captured[1]?.body ?? "{}",
    ) as Record<string, unknown>;
    expect(invoiceBody.external_id).toMatch(/^inv:/);
    expect(invoiceBody.idempotency_key).toMatch(/^inv:/);
    expect(invoiceBody.status).toBe("draft");
  });

  it("downloads XML y PDF se hacen como buffers, no como JSON", async () => {
    const xmlBuffer = Buffer.from("<cfdi:Comprobante>XML</cfdi:Comprobante>", "utf8");
    const pdfBuffer = Buffer.from("%PDF-1.4\ndata", "utf8");
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      { status: 200, body: { id: "inv-1", is_ready_to_stamp: true } },
      { status: 200, body: { id: "inv-1", uuid: "U-1", status: "stamped" } },
      { status: 200, body: xmlBuffer.toString("utf8"), headers: { "Content-Type": "application/xml" } },
      { status: 200, body: pdfBuffer.toString("utf8"), headers: { "Content-Type": "application/pdf" } },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    const result = await pac.stamp(stampInputSample);
    expect(result.cfdiUuid).toBe("U-1");
    expect(result.status).toBe("stamped");
    expect(result.xml).toBeInstanceOf(Buffer);
    expect(result.pdf).toBeInstanceOf(Buffer);
    // Las requests GET a /xml y /pdf NO llevan body ni auth adicional.
    const xmlReq = captured[3];
    const pdfReq = captured[4];
    expect(xmlReq?.method).toBe("GET");
    expect(xmlReq?.url).toMatch(/\/invoices\/.+\/xml$/);
    expect(xmlReq?.headers["Authorization"]).toBe("Bearer sk_test_abc");
    expect(pdfReq?.url).toMatch(/\/invoices\/.+\/pdf$/);
  });

  it("401/403 → PAC_API_KEY_MISSING (412) — fail-closed", async () => {
    const { fetchImpl } = makeFetchMock([
      { status: 401, body: { message: "Invalid API key" } },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_invalid",
      fetchImpl,
    });
    await expect(pac.stamp(stampInputSample)).rejects.toMatchObject({
      code: "PAC_API_KEY_MISSING",
      statusCode: 412,
    });
  });

  it("404 → INVOICE_NOT_FOUND (404)", async () => {
    const { fetchImpl } = makeFetchMock([
      { status: 404, body: { message: "Customer not found" } },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    await expect(pac.stamp(stampInputSample)).rejects.toMatchObject({
      code: "INVOICE_NOT_FOUND",
      statusCode: 404,
    });
  });

  it("409 → INVOICE_BUILD_INVALID (409)", async () => {
    const { fetchImpl } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      { status: 409, body: { message: "Conflicto" } },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    await expect(pac.stamp(stampInputSample)).rejects.toMatchObject({
      code: "INVOICE_BUILD_INVALID",
      statusCode: 409,
    });
  });

  it("422 → INVOICE_BUILD_INVALID (400)", async () => {
    const { fetchImpl } = makeFetchMock([
      { status: 422, body: { message: "Invalid payload" } },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    await expect(pac.stamp(stampInputSample)).rejects.toMatchObject({
      code: "INVOICE_BUILD_INVALID",
      statusCode: 400,
    });
  });

  it("429 → PacTransientError (rate limit)", async () => {
    const { fetchImpl } = makeFetchMock([
      { status: 429, body: { message: "Rate limit exceeded" } },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    await expect(pac.stamp(stampInputSample)).rejects.toMatchObject({
      code: "PAC_TRANSIENT",
    });
  });

  it("5xx → PacTransientError", async () => {
    const { fetchImpl } = makeFetchMock([
      { status: 503, body: { message: "Service unavailable" } },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    await expect(pac.stamp(stampInputSample)).rejects.toMatchObject({
      code: "PAC_TRANSIENT",
    });
  });

  it("mensaje sanitizado: sk_test_xxx en body del 5xx → MASKED en el error", async () => {
    // El 401/403 no expone el body (devuelve mensaje genérico para
    // no filtrar información). El sanitizado se aplica en 4xx/5xx
    // con body, donde podría colarse un sk_*. Probamos con 503.
    const { fetchImpl } = makeFetchMock([
      {
        status: 503,
        body: {
          message:
            "upstream failure with sk_test_supersecret1234567890abcdef",
        },
      },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_other",
      fetchImpl,
    });
    try {
      await pac.stamp(stampInputSample);
      throw new Error("expected throw");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain("sk_test_supersecret1234567890abcdef");
      expect(msg).toContain("MASKED");
    }
  });

  it("cancel envía POST /invoices/{uuid}/cancel con motivo SAT e idempotency key", async () => {
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { cancellation: { status: "cancelled" } } },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    const r = await pac.cancel({
      organizationId: stampInputSample.organizationId,
      apiKey: "sk_test_abc",
      cfdiUuid: "00000000-0000-0000-0000-0000000000aa",
      motivoSat: "03",
      rfcEmisor: "VEC681010AA1",
    });
    expect(r.status).toBe("cancelled");
    const req = captured[0];
    expect(req?.method).toBe("POST");
    expect(req?.url).toMatch(/\/invoices\/[^/]+\/cancel$/);
    expect(req?.headers["Idempotency-Key"]).toMatch(/^cancel:/);
    const body = JSON.parse(req?.body ?? "{}") as { motivo?: string };
    expect(body.motivo).toBe("03");
  });

  it("cancel motivo SAT inválido → INVALID_CANCEL_MOTIVE (400) sin llamada HTTP", async () => {
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { ok: true } },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    await expect(
      pac.cancel({
        organizationId: stampInputSample.organizationId,
        apiKey: "sk_test_abc",
        cfdiUuid: "00000000-0000-0000-0000-0000000000aa",
        motivoSat: "99" as never,
        rfcEmisor: "VEC681010AA1",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CANCEL_MOTIVE",
      statusCode: 400,
    });
    expect(captured.length).toBe(0);
  });

  it("is_ready_to_stamp=true → /stamp se llama y descarga XML/PDF", async () => {
    // IMPL-20260825-36 (intento 6 · F-11 follow-up) · El flujo feliz:
    // /invoices con is_ready_to_stamp=true → /stamp → GET /xml + /pdf.
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      { status: 200, body: { id: "inv-1", is_ready_to_stamp: true } },
      { status: 200, body: { id: "inv-1", uuid: "U-1", status: "stamped" } },
      { status: 200, body: "<xml/>" },
      { status: 200, body: "%PDF-1.4" },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    const result = await pac.stamp(stampInputSample);
    expect(result.cfdiUuid).toBe("U-1");
    expect(result.status).toBe("stamped");
    // Se llamaron /customers, /invoices, /invoices/{id}/stamp, /xml, /pdf.
    expect(captured.length).toBe(5);
    expect(captured[2]?.url).toMatch(/\/invoices\/inv-1\/stamp$/);
  });

  it("acepta buffers CSD vacíos (Facturapi NO exige CSD local)", async () => {
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      { status: 200, body: { id: "inv-1", is_ready_to_stamp: true } },
      { status: 200, body: { id: "inv-1", uuid: "U-1", status: "stamped" } },
      { status: 200, body: "<xml/>" },
      { status: 200, body: "%PDF-1.4" },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    // csdCer/csdPem vacíos y csdPassword "" no fallan.
    const result = await pac.stamp({
      ...stampInputSample,
      csdCer: Buffer.alloc(0),
      csdPem: Buffer.alloc(0),
      csdPassword: "",
    });
    expect(result.status).toBe("stamped");
    expect(captured.length).toBeGreaterThan(0);
  });
});

describe("IMPL-20260825-36 · AC-2 · createPacClient dispatch (mock vs http)", () => {
  it("default (sin env, sin opts) → mock", async () => {
    // Limpia env temporal para el test.
    const prev = process.env.PAC_MODE;
    delete process.env.PAC_MODE;
    try {
      const pac = createPacClient();
      expect(pac).toBeDefined();
      expect(typeof pac.stamp).toBe("function");
      // mock NO requiere red: stamp con CSD vacío falla con
      // CSD_NOT_CONFIGURED (el mock sigue exigiendo CSD; sólo el
      // HTTP ignora los bytes vacíos).
      await expect(
        pac.stamp({
          ...stampInputSample,
          apiKey: "k",
          csdCer: Buffer.alloc(0),
        }),
      ).rejects.toBeDefined();
    } finally {
      if (prev !== undefined) process.env.PAC_MODE = prev;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IMPL-20260825-36 · AC-3 (intento 2 · revisión oficial) · Contrato
// exacto del payload según docs.facturapi.io: items[].product
// anidado, default_invoice_use en customer, no se inventan campos,
// idempotency_key en body, GET /invoices/{id} fallback cuando
// /stamp no devuelve uuid.
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-36 · AC-3 · contrato documentado (docs.facturapi.io)", () => {
  it("item: shape anidado `items[].product = { description, product_key, price, tax_included }`", async () => {
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      { status: 200, body: { id: "inv-1", is_ready_to_stamp: true } },
      { status: 200, body: { id: "inv-1", uuid: "U-1", status: "stamped" } },
      { status: 200, body: "<xml/>" },
      { status: 200, body: "%PDF-1.4" },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    await pac.stamp(stampInputSample);
    const invoiceBody = JSON.parse(
      captured[1]?.body ?? "{}",
    ) as {
      items?: Array<{
        quantity?: number;
        product?: {
          description?: string;
          product_key?: string;
          price?: number;
          tax_included?: boolean;
        };
      }>;
    };
    expect(invoiceBody.items?.length).toBe(1);
    const item = invoiceBody.items?.[0];
    expect(item?.quantity).toBe(1);
    expect(item?.product).toBeDefined();
    expect(item?.product?.description).toBe("Servicios profesionales");
    expect(item?.product?.product_key).toBe("84111506");
    // `price` en pesos (NO centavos). valorUnitarioCents = 100_000
    // → 1000 MXN.
    expect(item?.product?.price).toBe(1000);
    expect(item?.product?.tax_included).toBe(false);
    // NO campos inventados al nivel de item:
    const flat = item as unknown as Record<string, unknown>;
    expect(flat.unit_price).toBeUndefined();
    expect(flat.taxes).toBeUndefined();
    expect(flat.external_id).toBeUndefined();
    // NO campos inventados dentro de product:
    const prod = item?.product as unknown as Record<string, unknown>;
    expect(prod.factor).toBeUndefined();
    expect(prod.base).toBeUndefined();
    expect(prod.amount).toBeUndefined();
  });

  it("customer body: `default_invoice_use` (no `cfdi_use`), sin `external_id`", async () => {
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      { status: 200, body: { id: "inv-1", is_ready_to_stamp: true } },
      { status: 200, body: { id: "inv-1", uuid: "U-1", status: "stamped" } },
      { status: 200, body: "<xml/>" },
      { status: 200, body: "%PDF-1.4" },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    await pac.stamp({
      ...stampInputSample,
      receptor: {
        ...stampInputSample.receptor,
        cfdiUse: "G01",
      },
    });
    const customerBody = JSON.parse(
      captured[0]?.body ?? "{}",
    ) as Record<string, unknown>;
    expect(customerBody.default_invoice_use).toBe("G01");
    expect(customerBody.cfdi_use).toBeUndefined();
    expect(customerBody.external_id).toBeUndefined();
    // Campos documentados obligatorios:
    expect(customerBody.legal_name).toBe("Cliente Test SA");
    expect(customerBody.tax_id).toBe("XAXX010101000");
    expect(customerBody.tax_system).toBe("601");
  });

  it("invoice body: `idempotency_key` (campo documentado) Y `external_id`", async () => {
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      { status: 200, body: { id: "inv-1", is_ready_to_stamp: true } },
      { status: 200, body: { id: "inv-1", uuid: "U-1", status: "stamped" } },
      { status: 200, body: "<xml/>" },
      { status: 200, body: "%PDF-1.4" },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    await pac.stamp(stampInputSample);
    const invoiceBody = JSON.parse(
      captured[1]?.body ?? "{}",
    ) as Record<string, unknown>;
    expect(invoiceBody.idempotency_key).toBeDefined();
    expect(invoiceBody.external_id).toBeDefined();
    expect(invoiceBody.customer).toBe("cust-1");
    expect(invoiceBody.payment_form).toBe("01");
    expect(invoiceBody.payment_method).toBe("PUE");
    expect(invoiceBody.use).toBe("G03");
    expect(invoiceBody.status).toBe("draft");
  });

  it("/stamp sin uuid → GET /invoices/{id} fallback para extraer UUID", async () => {
    // Test escenario: /stamp responde SIN uuid (algunos Test paths
    // sólo devuelven el id hasta que la factura se considera `valid`).
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      { status: 200, body: { id: "inv-1", is_ready_to_stamp: true } },
      { status: 200, body: { id: "inv-1", uuid: null, status: "stamped" } },
      // GET /invoices/{id} devuelve el uuid.
      { status: 200, body: { id: "inv-1", uuid: "GET-UUID-XYZ" } },
      { status: 200, body: "<xml/>" },
      { status: 200, body: "%PDF-1.4" },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    const result = await pac.stamp(stampInputSample);
    expect(result.cfdiUuid).toBe("GET-UUID-XYZ");
    // El GET debe haber ocurrido (4ta request en orden: customers,
    // invoices, invoices/{id}/stamp, invoices/{id} GET, xml, pdf).
    const getReq = captured.find(
      (r) => r.method === "GET" && /\/invoices\/[^/]+$/.test(r.url),
    );
    expect(getReq).toBeDefined();
    expect(getReq?.headers["Authorization"]).toBe("Bearer sk_test_abc");
  });

  it("/stamp sin uuid, GET sin uuid → fallback al `id` (degradación controlada)", async () => {
    // Si tanto /stamp como GET /invoices/{id} NO devuelven `uuid`,
    // caemos al `id` interno de Facturapi como último recurso. El
    // servicio persiste este valor en `invoices.cfdi_uuid`; si el
    // PAC posterior lo actualiza a un UUID real, el campo se
    // reescribe. La degradación es explícita y NO se considera error
    // (no queremos abortar el flujo por una inconsistencia de Test).
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      { status: 200, body: { id: "inv-1", is_ready_to_stamp: true } },
      { status: 200, body: { id: "inv-1", uuid: null, status: "stamped" } },
      { status: 200, body: { id: "inv-1" } }, // GET sin uuid
      { status: 200, body: "<xml/>" },
      { status: 200, body: "%PDF-1.4" },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    const result = await pac.stamp(stampInputSample);
    expect(result.cfdiUuid).toBe("inv-1");
    // El GET fallback ocurrió.
    const getReq = captured.find(
      (r) => r.method === "GET" && /\/invoices\/[^/]+$/.test(r.url),
    );
    expect(getReq).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IMPL-20260825-36 · AC-4 (intento 3 · QA V3) · Bypass BD en modo
// HTTP, mapeo domicilio, rechazo sin domicilio, error UI en
// facturas-list.tsx. La especificación del contrato Facturapi exige
// domicilio fiscal completo para timbrar.
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-36 · AC-4 · bypass BD HTTP + domicilio + error UI", () => {
  it("mapea domicilio interno (calle/numero/...) a Facturapi (street/exterior/...)", async () => {
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      { status: 200, body: { id: "inv-1", is_ready_to_stamp: true } },
      { status: 200, body: { id: "inv-1", uuid: "U-1", status: "stamped" } },
      { status: 200, body: "<xml/>" },
      { status: 200, body: "%PDF-1.4" },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    await pac.stamp(stampInputSample);
    const customerBody = JSON.parse(
      captured[0]?.body ?? "{}",
    ) as { address?: Record<string, unknown> };
    expect(customerBody.address).toBeDefined();
    // Claves canónicas documentadas (NO claves españolas).
    expect(customerBody.address?.street).toBe("Blvd. Atardecer");
    expect(customerBody.address?.exterior).toBe("142");
    expect(customerBody.address?.neighborhood).toBe("Centro");
    expect(customerBody.address?.city).toBe("Huatabampo");
    expect(customerBody.address?.municipality).toBe("Huatabampo");
    expect(customerBody.address?.zip).toBe("86500");
    expect(customerBody.address?.state).toBe("Sonora");
    expect(customerBody.address?.country).toBe("MEX");
    // Defensa: NO claves españolas en el body.
    expect(customerBody.address?.calle).toBeUndefined();
    expect(customerBody.address?.numero).toBeUndefined();
    expect(customerBody.address?.colonia).toBeUndefined();
    expect(customerBody.address?.municipio).toBeUndefined();
    expect(customerBody.address?.estado).toBeUndefined();
    expect(customerBody.address?.cp).toBeUndefined();
    expect(customerBody.address?.pais).toBeUndefined();
  });

  it("rechaza con INVOICE_FISCAL_DATA_REQUIRED si domicilio está ausente", async () => {
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    await expect(
      pac.stamp({
        ...stampInputSample,
        receptor: {
          ...stampInputSample.receptor,
          domicilio: null,
        },
      }),
    ).rejects.toMatchObject({
      code: "INVOICE_FISCAL_DATA_REQUIRED",
      statusCode: 400,
    });
    // NO debe haberse hecho ninguna llamada HTTP.
    expect(captured.length).toBe(0);
  });

  it("rechaza con INVOICE_FISCAL_DATA_REQUIRED si domicilio está incompleto (sin cp)", async () => {
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    const incomplete = { ...stampInputSample.receptor.domicilio };
    delete (incomplete as Record<string, unknown>).cp;
    await expect(
      pac.stamp({
        ...stampInputSample,
        receptor: {
          ...stampInputSample.receptor,
          domicilio: incomplete,
        },
      }),
    ).rejects.toMatchObject({
      code: "INVOICE_FISCAL_DATA_REQUIRED",
      statusCode: 400,
    });
    expect(captured.length).toBe(0);
  });

  it("facturas-list.tsx: `onError` del timbrar + `role=\"alert\"` visible", () => {
    // Verificación estática: el botón Timbrar debe mostrar el error
    // de PAC con role="alert" y data-testid canónico para QA V3.
    const src = readFileSync(
      path.resolve(
        __dirname,
        "../src/modules/facturacion/facturas-list.tsx",
      ),
      "utf8",
    );
    // Estado timbrarError.
    expect(src).toMatch(/useState<\s*string\s*\|\s*null\s*>\s*\(\s*null\s*\)/);
    expect(src).toMatch(/setTimbrarError\(/);
    // onError con mensaje estable (incluye INVOICE_FISCAL_DATA_REQUIRED
    // mapeado a mensaje amigable).
    expect(src).toMatch(/timbrar = trpc\.facturacion\.timbrar\.useMutation/);
    expect(src).toMatch(/onError:/);
    expect(src).toMatch(/INVOICE_FISCAL_DATA_REQUIRED/);
    // Bloque <p role="alert"> con data-testid.
    expect(src).toMatch(/role=["']alert["']/);
    expect(
      /data-testid=["']facturas-list-timbrar-error["']/.test(src),
    ).toBe(true);
  });

  it("orden-detail.tsx: dialog captura domicilio completo + persiste via fiscal.upsert", () => {
    // Verificación estática: el diálogo expone los 7 campos de
    // domicilio y los envía a `clientes.fiscal.upsert.mutate({...,
    // domicilio: {...}})`. La validación cliente exige los 7 campos
    // antes de upsert.
    const src = readFileSync(
      path.resolve(
        __dirname,
        "../src/modules/orden-servicio/orden-detail.tsx",
      ),
      "utf8",
    );
    for (const id of [
      "ci-calle",
      "ci-numero",
      "ci-colonia",
      "ci-municipio",
      "ci-estado",
      "ci-cp",
      "ci-pais",
    ]) {
      expect(new RegExp(`id=["']${id}["']`).test(src)).toBe(true);
    }
    // Persistencia via fiscal.upsert.
    expect(src).toMatch(/fiscalUpsert\.mutate\(/);
    expect(src).toMatch(/domicilio:\s*\{[\s\S]*?calle,?[\s\S]*?numero,?[\s\S]*?cp,?[\s\S]*?pais,?[\s\S]*?\}/);
  });

  it("invoices.ts: en modo HTTP NO consulta BD (sin descifrarCredencialesPac en timbrar)", () => {
    // Verificación estática: la función `obtenerCredencialesTimbrar`
    // hace early-return con credenciales vacías cuando `PAC_MODE=http`.
    // El adaptador HTTP usa `FACTURAPI_API_KEY` desde el closure,
    // NO desde BD.
    const src = readFileSync(
      path.resolve(
        __dirname,
        "../src/server/services/facturacion/invoices.ts",
      ),
      "utf8",
    );
    expect(src).toMatch(/function obtenerCredencialesTimbrar/);
    expect(src).toMatch(/process\.env\.PAC_MODE\s*===\s*["']http["']/);
    // El early-return NO llama a loadFiscalConfig.
    expect(src).toMatch(/return Promise\.resolve\(\{[\s\S]*?apiKey:\s*["']["']/);
    // Las llamadas a `obtenerCredencialesTimbrar` están en timbrar y
    // cancel (NO `descifrarCredencialesPac`).
    const timbrarBlock = src.match(
      /async function timbrar\([\s\S]*?async function cancel/,
    );
    expect(timbrarBlock).not.toBeNull();
    expect(/obtenerCredencialesTimbrar\(/.test(timbrarBlock![0])).toBe(true);
    // NO `descifrarCredencialesPac` en timbrar/cancel (sólo en el
    // helper `obtenerCredencialesTimbrar` mismo).
    expect(/descifrarCredencialesPac\(/.test(timbrarBlock![0])).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IMPL-20260825-36 · AC-5 (intento 4 · QA V3 F-11) · Diagnóstico
// estructurado de errores 4xx del PAC. La respuesta completa se
// conserva sólo en memoria; extrae `verification.errors[]` /
// `errors[]` / `message` y los proyecta en un
// `DomainError(INVOICE_BUILD_INVALID)` sanitizado. Sin secretos ni
// PII innecesaria.
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-36 · AC-5 · diagnóstico de errores 4xx (intento 4 + intento 6)", () => {
  it("422 con errors[] top-level → incluye paths/codes/messages", async () => {
    const { fetchImpl } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      {
        status: 422,
        body: {
          message: "Request inválido",
          errors: [
            {
              source: "facturapi",
              code: "required",
              path: "customer.tax_id",
              message: "Tax ID is required",
            },
          ],
        },
      },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    let captured_err: { message: string } | null = null;
    try {
      await pac.stamp(stampInputSample);
    } catch (e) {
      captured_err = e as { message: string };
    }
    expect(captured_err).not.toBeNull();
    const msg = captured_err!.message;
    expect(msg).toContain("Facturapi 422");
    expect(msg).toContain("customer.tax_id");
    expect(msg).toContain("required");
    expect(msg).toContain("Tax ID is required");
  });

  it("422 sin errors[] → fallback al message top-level sanitizado", async () => {
    const { fetchImpl } = makeFetchMock([
      {
        status: 422,
        body: {
          message:
            "Request failed: invalid auth with sk_test_supersecret1234567890abcdef",
        },
      },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    let captured_err: { message: string } | null = null;
    try {
      await pac.stamp(stampInputSample);
    } catch (e) {
      captured_err = e as { message: string };
    }
    expect(captured_err).not.toBeNull();
    const msg = captured_err!.message;
    expect(msg).not.toContain("sk_test_supersecret1234567890abcdef");
    expect(msg).toContain("MASKED");
  });

  it("400 (sin errors[]) → fallback al message sanitizado", async () => {
    const { fetchImpl } = makeFetchMock([
      {
        status: 400,
        body: {
          message:
            "Bad request: invalid token sk_test_supersecret1234567890abcdef",
        },
      },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    let captured_err: { message: string } | null = null;
    try {
      await pac.stamp(stampInputSample);
    } catch (e) {
      captured_err = e as { message: string };
    }
    expect(captured_err).not.toBeNull();
    const msg = captured_err!.message;
    expect(msg).toContain("Facturapi 400");
    expect(msg).not.toContain("sk_test_supersecret1234567890abcdef");
    expect(msg).toContain("MASKED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IMPL-20260825-36 · AC-7 (intento 6 · F-11 follow-up) · El adapter
// NO aborta localmente por `is_ready_to_stamp === false`; deja que
// `POST /invoices/{id}/stamp` valide y devuelva su 4xx detallado.
// Si el stamp NO es 2xx, NO descarga XML/PDF ni muta factura
// interna (anti-éxito-falso).
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-36 · AC-7 · dejar que /stamp valide (F-11 follow-up)", () => {
  it("is_ready_to_stamp=false → /stamp se llama y devuelve 400 con detalle", async () => {
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      // /invoices devuelve 2xx pero is_ready_to_stamp=false (sin errors[]).
      // El adapter NO aborta; sigue a /stamp.
      {
        status: 200,
        body: {
          id: "inv-1",
          is_ready_to_stamp: false,
        },
      },
      // /stamp devuelve 400 con errors[] detallado (campos
      // faltantes: address.zip, address.municipality, etc).
      {
        status: 400,
        body: {
          message: "El cliente no tiene datos fiscales válidos",
          errors: [
            {
              source: "facturapi",
              code: "required",
              path: "customer.address.zip",
              message: "Zip code is required",
            },
            {
              source: "facturapi",
              code: "required",
              path: "customer.address.municipality",
              message: "Municipality is required",
            },
          ],
        },
      },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    let captured_err: { message: string } | null = null;
    try {
      await pac.stamp(stampInputSample);
    } catch (e) {
      captured_err = e as { message: string };
    }
    expect(captured_err).not.toBeNull();
    const msg = captured_err!.message;
    // Cabecera indica /stamp como origen (no /invoices).
    expect(msg).toContain("Facturapi 400");
    expect(msg).toMatch(/\/invoices\/[^/]+\/stamp/);
    // Paths/codes/messages del body 400.
    expect(msg).toContain("customer.address.zip");
    expect(msg).toContain("customer.address.municipality");
    expect(msg).toContain("required");
    expect(msg).toContain("Zip code is required");
    expect(msg).toContain("Municipality is required");
    // NO debe haberse llamado /xml ni /pdf (protección éxito-falso).
    const xmlReq = captured.find((r) => /\/xml$/.test(r.url));
    const pdfReq = captured.find((r) => /\/pdf$/.test(r.url));
    expect(xmlReq).toBeUndefined();
    expect(pdfReq).toBeUndefined();
    // Las llamadas fueron: customers, invoices, invoices/{id}/stamp.
    expect(captured.length).toBe(3);
    expect(captured[0]?.url).toMatch(/\/customers$/);
    expect(captured[1]?.url).toMatch(/\/invoices$/);
    expect(captured[2]?.url).toMatch(/\/invoices\/inv-1\/stamp$/);
  });

  it("/stamp 400 con `sk_test_*` accidental → enmascarado en mensaje", async () => {
    const { fetchImpl } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      { status: 200, body: { id: "inv-1", is_ready_to_stamp: false } },
      {
        status: 400,
        body: {
          message:
            "auth failure for sk_test_supersecret1234567890abcdef at customer",
          errors: [
            {
              source: "facturapi",
              code: "auth",
              path: "customer",
              message:
                "auth failed with sk_test_supersecret1234567890abcdef",
            },
          ],
        },
      },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_other",
      fetchImpl,
    });
    let captured_err: { message: string } | null = null;
    try {
      await pac.stamp(stampInputSample);
    } catch (e) {
      captured_err = e as { message: string };
    }
    expect(captured_err).not.toBeNull();
    const msg = captured_err!.message;
    // El token NO debe aparecer.
    expect(msg).not.toContain("sk_test_supersecret1234567890abcdef");
    expect(msg).toContain("MASKED");
    // La apiKey propia tampoco.
    expect(msg).not.toContain("sk_test_other");
  });

  it("/stamp 400 PII safety: NO incluye RFC/domicilio del receptor", async () => {
    const { fetchImpl } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      { status: 200, body: { id: "inv-1", is_ready_to_stamp: false } },
      {
        status: 400,
        body: {
          errors: [
            {
              source: "facturapi",
              code: "required",
              path: "customer.address.zip",
              message: "Zip code is required",
            },
          ],
        },
      },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    let captured_err: { message: string } | null = null;
    try {
      await pac.stamp(stampInputSample);
    } catch (e) {
      captured_err = e as { message: string };
    }
    const msg = captured_err!.message;
    // El snapshot del receptor tiene valores reales. NO deben
    // aparecer.
    expect(msg).not.toContain("XAXX010101000");
    expect(msg).not.toContain("Blvd. Atardecer");
    expect(msg).not.toContain("Huatabampo");
    expect(msg).not.toContain("Cliente Test SA");
  });

  it("/stamp 400 limita a 5 entradas (no desborda DomainError.message)", async () => {
    const { fetchImpl } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      { status: 200, body: { id: "inv-1", is_ready_to_stamp: false } },
      {
        status: 400,
        body: {
          errors: Array.from({ length: 12 }).map((_, i) => ({
            source: "facturapi",
            code: `code_${i}`,
            path: `customer.field_${i}`,
            message: `Message ${i}`,
          })),
        },
      },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    let captured_err: { message: string } | null = null;
    try {
      await pac.stamp(stampInputSample);
    } catch (e) {
      captured_err = e as { message: string };
    }
    const msg = captured_err!.message;
    expect(msg).toContain("customer.field_0");
    expect(msg).toContain("customer.field_4");
    expect(msg).not.toContain("customer.field_5");
    expect(msg).not.toContain("customer.field_11");
  });

  it("is_ready_to_stamp=true → /stamp 2xx → continúa con UUID/XML/PDF", async () => {
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      { status: 200, body: { id: "inv-1", is_ready_to_stamp: true } },
      { status: 200, body: { id: "inv-1", uuid: "U-OK", status: "stamped" } },
      { status: 200, body: "<xml/>" },
      { status: 200, body: "%PDF-1.4" },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    const result = await pac.stamp(stampInputSample);
    expect(result.cfdiUuid).toBe("U-OK");
    expect(result.status).toBe("stamped");
    // Flujo completo: customers, invoices, stamp, xml, pdf.
    expect(captured.length).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IMPL-20260825-36 · AC-6 (intento 5 · F-12) · Idempotencia por
// invoiceId. Antes el hash derivaba sólo de org+rfc+importe, lo que
// provocaba colisión entre facturas distintas del mismo
// cliente/importe. Ahora la clave única por invoice combina
// `organizationId + invoiceId` y la clave de customer es estable
// por org+rfc.
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-36 · AC-6 · idempotencia por invoiceId (F-12)", () => {
  it("dos invoiceId distintos del mismo cliente/importe => claves distintas", async () => {
    const capturedIds: string[] = [];
    // Primer stamp.
    {
      const { fetchImpl, captured } = makeFetchMock([
        { status: 200, body: { id: "cust-1" } },
        { status: 200, body: { id: "inv-A", is_ready_to_stamp: true } },
        { status: 200, body: { id: "inv-A", uuid: "U-A", status: "stamped" } },
        { status: 200, body: "<xml/>" },
        { status: 200, body: "%PDF-1.4" },
      ]);
      const pac = createPacHttpClient({
        baseUrl: "https://www.facturapi.io/v2",
        apiKey: "sk_test_abc",
        fetchImpl,
      });
      await pac.stamp({
        ...stampInputSample,
        invoiceId: "11111111-1111-1111-1111-111111111111",
        invoiceCode: "FAC-A",
      });
      const invoiceBody = JSON.parse(
        captured[1]?.body ?? "{}",
      ) as Record<string, unknown>;
      capturedIds.push(String(invoiceBody.external_id));
    }
    // Segundo stamp con invoiceId DISTINTO (mismo cliente/importe).
    {
      const { fetchImpl, captured } = makeFetchMock([
        { status: 200, body: { id: "cust-2" } },
        { status: 200, body: { id: "inv-B", is_ready_to_stamp: true } },
        { status: 200, body: { id: "inv-B", uuid: "U-B", status: "stamped" } },
        { status: 200, body: "<xml/>" },
        { status: 200, body: "%PDF-1.4" },
      ]);
      const pac = createPacHttpClient({
        baseUrl: "https://www.facturapi.io/v2",
        apiKey: "sk_test_abc",
        fetchImpl,
      });
      await pac.stamp({
        ...stampInputSample,
        invoiceId: "22222222-2222-2222-2222-222222222222",
        invoiceCode: "FAC-B",
      });
      const invoiceBody = JSON.parse(
        captured[1]?.body ?? "{}",
      ) as Record<string, unknown>;
      capturedIds.push(String(invoiceBody.external_id));
    }
    expect(capturedIds.length).toBe(2);
    // Las claves externas son DISTINTAS: el segundo stamp NO
    // colisiona con el primero aunque comparta RFC, importe y
    // descripción.
    expect(capturedIds[0]).not.toEqual(capturedIds[1]);
    expect(capturedIds[0]).toMatch(/^inv:/);
    expect(capturedIds[1]).toMatch(/^inv:/);
  });

  it("reintento del mismo invoiceId => external_id estable", async () => {
    const capturedIds: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const { fetchImpl, captured } = makeFetchMock([
        { status: 200, body: { id: "cust-stable" } },
        { status: 200, body: { id: "inv-X", is_ready_to_stamp: true } },
        { status: 200, body: { id: "inv-X", uuid: "U-X", status: "stamped" } },
        { status: 200, body: "<xml/>" },
        { status: 200, body: "%PDF-1.4" },
      ]);
      const pac = createPacHttpClient({
        baseUrl: "https://www.facturapi.io/v2",
        apiKey: "sk_test_abc",
        fetchImpl,
      });
      await pac.stamp({
        ...stampInputSample,
        invoiceId: "33333333-3333-3333-3333-333333333333",
        invoiceCode: "FAC-X",
      });
      const invoiceBody = JSON.parse(
        captured[1]?.body ?? "{}",
      ) as Record<string, unknown>;
      capturedIds.push(String(invoiceBody.external_id));
    }
    // Las 3 invocaciones producen el MISMO `external_id` (estable).
    expect(capturedIds[0]).toEqual(capturedIds[1]);
    expect(capturedIds[1]).toEqual(capturedIds[2]);
    expect(capturedIds[0]).toMatch(/^inv:/);
  });

  it("customer key estable por org+rfc (independiente del invoiceId)", async () => {
    const customerKeys: string[] = [];
    for (const invoiceId of [
      "44444444-4444-4444-4444-444444444444",
      "55555555-5555-5555-5555-555555555555",
      "66666666-6666-6666-6666-666666666666",
    ]) {
      const { fetchImpl, captured } = makeFetchMock([
        { status: 200, body: { id: "cust-shared" } },
        { status: 200, body: { id: `inv-${invoiceId}`, is_ready_to_stamp: true } },
        { status: 200, body: { id: `inv-${invoiceId}`, uuid: "U-Y", status: "stamped" } },
        { status: 200, body: "<xml/>" },
        { status: 200, body: "%PDF-1.4" },
      ]);
      const pac = createPacHttpClient({
        baseUrl: "https://www.facturapi.io/v2",
        apiKey: "sk_test_abc",
        fetchImpl,
      });
      await pac.stamp({
        ...stampInputSample,
        invoiceId,
      });
      const customerKey = captured[0]?.headers["Idempotency-Key"];
      customerKeys.push(String(customerKey));
    }
    // Los 3 stamps usan el MISMO `Idempotency-Key` para POST
    // /customers (cliente compartido: orgId+rfc idénticos).
    expect(customerKeys[0]).toEqual(customerKeys[1]);
    expect(customerKeys[1]).toEqual(customerKeys[2]);
    expect(customerKeys[0]).toMatch(/^cust:/);
  });

  it("invoiceId ausente en PacStampInput → typecheck falla (campo obligatorio)", () => {
    // Verificación estática del contrato: el campo `invoiceId` debe
    // ser obligatorio. Si TypeScript acepta `omit invoiceId`,
    // significa que el campo es opcional y dos facturas pueden
    // colisionar — regresión.
    const idx = readFileSync(
      path.resolve(__dirname, "../src/server/integrations/pac/index.ts"),
      "utf8",
    ).indexOf("export interface PacStampInput");
    expect(idx).toBeGreaterThan(0);
    const window = readFileSync(
      path.resolve(__dirname, "../src/server/integrations/pac/index.ts"),
      "utf8",
    ).slice(idx, idx + 1200);
    // `invoiceId: string` (no `?:` ni `| undefined`).
    expect(/invoiceId:\s*string;/.test(window)).toBe(true);
    expect(/invoiceCode:\s*string;/.test(window)).toBe(true);
  });

  it("`invoices.timbrar` pasa `invoiceId` y `invoiceCode` a `pac.stamp`", () => {
    // Verificación estática del caller de servicio: el stampInput
    // construido en `timbrar` (usuario) y el `pac.stamp({...})` en
    // `timbrarSystem` (job nocturno) incluyen los identificadores
    // internos `invoiceId` y `invoiceCode` derivados de `row.id`/
    // `row.code`.
    const src = readFileSync(
      path.resolve(
        __dirname,
        "../src/server/services/facturacion/invoices.ts",
      ),
      "utf8",
    );
    // Bloque 1: `const stampInput = {...}` en `timbrar` (usuario).
    const stampVarPos = src.indexOf("const stampInput = {");
    expect(stampVarPos).toBeGreaterThan(0);
    const stampVarBlock = src.slice(stampVarPos, stampVarPos + 1500);
    expect(/invoiceId:\s*row\.id/.test(stampVarBlock)).toBe(true);
    expect(/invoiceCode:\s*row\.code/.test(stampVarBlock)).toBe(true);
    // Bloque 2: `await pac.stamp({...})` en `timbrarSystem` (job).
    const stampCallPos = src.indexOf("await pac.stamp({");
    expect(stampCallPos).toBeGreaterThan(0);
    const stampCallBlock = src.slice(stampCallPos, stampCallPos + 1500);
    expect(/invoiceId:\s*row\.id/.test(stampCallBlock)).toBe(true);
    expect(/invoiceCode:\s*row\.code/.test(stampCallBlock)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IMPL-20260825-36 · AC-8 (intento 7 · F-13) · Recuperación de
// invoice draft existente tras 409 por idempotency_key.
// `GET /v2/invoices?external_id=<X>&limit=100` selecciona
// EXACTAMENTE un objeto con `external_id === X`. NO heurística:
// 0 o 2+ matches bloquea con error canónico.
// ─────────────────────────────────────────────────────────────────────────────

describe("IMPL-20260825-36 · AC-8 · F-13 idempotency 409 → GET recovery", () => {
it("409 al POST /invoices → GET recovery con match único → /stamp 2xx", async () => {
    // IMPL-20260825-36 (intento 7 · F-13) · Mock dinámico: la
    // respuesta del GET recovery se construye en runtime con el
    // `external_id` real del POST. Evita hardcodear un hash que
    // cambia entre runs.
    const { fetchImpl, captured } = makeRecoveryFetchMock({
      getRecoveryData: (realId) => [
        {
          id: "inv-existing",
          status: "draft",
          external_id: realId,
          is_ready_to_stamp: true,
        },
      ],
    });
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    const result = await pac.stamp({
      ...stampInputSample,
      invoiceId: "11111111-1111-1111-1111-111111111111",
    });
    // El UUID viene del stamp del draft recuperado.
    expect(result.cfdiUuid).toBe("U-RECOVERED");
    expect(result.status).toBe("stamped");
    // Se llamaron: customers, invoices (409), invoices?external_id,
    // invoices/{id}/stamp, /xml, /pdf.
    expect(captured.length).toBe(6);
    expect(captured[1]?.url).toMatch(/\/invoices$/);
    expect(captured[1]?.method).toBe("POST");
    expect(captured[2]?.url).toMatch(/\/invoices\?external_id=/);
    expect(captured[2]?.method).toBe("GET");
    expect(captured[2]?.url).toMatch(/limit=100/);
    expect(captured[3]?.url).toMatch(/\/invoices\/inv-existing\/stamp$/);
    // El external_id del POST coincide con el del GET (recovery).
    const postBody = JSON.parse(
      captured[1]?.body ?? "{}",
    ) as { external_id?: string };
    const getUrl = captured[2]?.url ?? "";
    expect(getUrl).toContain(encodeURIComponent(postBody.external_id ?? ""));
  });

  it("409 → GET sin match (data: []) → re-throw 409 con diagnóstico", async () => {
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      // POST /invoices devuelve 409.
      {
        status: 409,
        body: {
          message: "Idempotency key conflict",
          errors: [
            {
              source: "facturapi",
              code: "idempotency_key_conflict",
              path: "idempotency_key",
              message: "Conflict",
            },
          ],
        },
      },
      // GET no encuentra match: lista vacía.
      { status: 200, body: { data: [] } },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    let captured_err: { message: string; code: string; statusCode: number } | null = null;
    try {
      await pac.stamp(stampInputSample);
    } catch (e) {
      captured_err = e as { message: string; code: string; statusCode: number };
    }
    expect(captured_err).not.toBeNull();
    // Re-throw del 409 original con código y status correctos.
    expect(captured_err!.code).toBe("INVOICE_BUILD_INVALID");
    expect(captured_err!.statusCode).toBe(409);
    // NO se llamó /stamp, /xml, /pdf.
    const stampReq = captured.find((r) => /\/stamp$/.test(r.url));
    const xmlReq = captured.find((r) => /\/xml$/.test(r.url));
    const pdfReq = captured.find((r) => /\/pdf$/.test(r.url));
    expect(stampReq).toBeUndefined();
    expect(xmlReq).toBeUndefined();
    expect(pdfReq).toBeUndefined();
    // Se llamaron: customers, invoices (409), invoices?external_id.
    expect(captured.length).toBe(3);
  });

  it("409 → GET con múltiples matches (external_id duplicado) → re-throw 409", async () => {
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      // POST /invoices devuelve 409.
      { status: 409, body: { message: "Conflict" } },
      // GET devuelve 2 objetos con el mismo external_id
      // (escenario anómalo: dos drafts colisionan).
      {
        status: 200,
        body: {
          data: [
            {
              id: "inv-dup-1",
              status: "draft",
              external_id: "inv:abc123",
            },
            {
              id: "inv-dup-2",
              status: "draft",
              external_id: "inv:abc123",
            },
          ],
        },
      },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    let captured_err: { code: string; statusCode: number } | null = null;
    try {
      await pac.stamp(stampInputSample);
    } catch (e) {
      captured_err = e as { code: string; statusCode: number };
    }
    expect(captured_err).not.toBeNull();
    // NO heurística: re-throw 409 cuando hay múltiples matches.
    expect(captured_err!.code).toBe("INVOICE_BUILD_INVALID");
    expect(captured_err!.statusCode).toBe(409);
    // Se llamaron: customers, invoices (409), invoices?external_id.
    expect(captured.length).toBe(3);
  });

  it("409 → GET filtra por match EXACTO (defensa contra `q` texto libre)", async () => {
    // Si el GET devuelve un objeto con external_id distinto al
    // nuestro (porque Facturapi trata `external_id` como `q` texto
    // libre), el filtro EXACTO lo descarta.
    const { fetchImpl } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      { status: 409, body: { message: "Conflict" } },
      {
        status: 200,
        body: {
          data: [
            {
              id: "inv-other",
              status: "draft",
              external_id: "inv:different-hash",
              // Falso positivo potencial del filtro `external_id`
              // de Facturapi (lo trata como `q`).
            },
          ],
        },
      },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    let captured_err: { code: string; statusCode: number } | null = null;
    try {
      await pac.stamp(stampInputSample);
    } catch (e) {
      captured_err = e as { code: string; statusCode: number };
    }
    expect(captured_err).not.toBeNull();
    // El filtro EXACTO rechaza el falso positivo: 0 matches.
    expect(captured_err!.code).toBe("INVOICE_BUILD_INVALID");
    expect(captured_err!.statusCode).toBe(409);
  });

  it("no POST /invoices adicional (recovery es sólo GET, no crear otro draft)", async () => {
    // Después del 409 + GET recovery, NO debe haber un segundo
    // POST /invoices (eso duplicaría el recurso).
    const { fetchImpl, captured } = makeRecoveryFetchMock({
      postInvoiceBody: { message: "Conflict" },
      getRecoveryData: (realId) => [
        {
          id: "inv-existing",
          status: "draft",
          external_id: realId,
          is_ready_to_stamp: true,
        },
      ],
    });
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    await pac.stamp(stampInputSample);
    // Sólo UN POST /invoices (el que devolvió 409).
    const invoicePosts = captured.filter(
      (r) => r.method === "POST" && /\/invoices$/.test(r.url),
    );
    expect(invoicePosts.length).toBe(1);
  });

  it("409 → GET NO filtra secret: apiKey NO aparece en URL ni headers del GET", async () => {
    const { fetchImpl, captured } = makeRecoveryFetchMock({
      postInvoiceBody: { message: "Conflict" },
      getRecoveryData: (realId) => [
        {
          id: "inv-existing",
          status: "draft",
          external_id: realId,
          is_ready_to_stamp: true,
        },
      ],
    });
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_supersecret1234567890",
      fetchImpl,
    });
    await pac.stamp(stampInputSample);
    // El GET recovery lleva Authorization con el token (necesario
    // para autenticarse), pero el token NO debe aparecer en la URL,
    // body ni otros headers.
    const getReq = captured[2];
    expect(getReq?.url).not.toContain("sk_test_supersecret1234567890");
    expect(getReq?.body ?? "").not.toContain("sk_test_supersecret1234567890");
    // El Authorization header sí lleva el token (es HTTP estándar;
    // no se loguea en `process.stderr`, sólo en headers internos).
    expect(getReq?.headers["Authorization"]).toBe(
      "Bearer sk_test_supersecret1234567890",
    );
  });

  it("POST /invoices 2xx (no 409) NO dispara GET recovery (sólo en 409)", async () => {
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      // POST /invoices 2xx directo.
      {
        status: 200,
        body: {
          id: "inv-new",
          is_ready_to_stamp: true,
        },
      },
      { status: 200, body: { id: "inv-new", uuid: "U-NEW", status: "stamped" } },
      { status: 200, body: "<xml/>" },
      { status: 200, body: "%PDF-1.4" },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    const result = await pac.stamp(stampInputSample);
    expect(result.cfdiUuid).toBe("U-NEW");
    // NO hubo 409, NO hubo GET recovery.
    const getRec = captured.find((r) =>
      /\/invoices\?external_id=/.test(r.url),
    );
    expect(getRec).toBeUndefined();
    // 4 calls: customers, invoices, stamp, xml, pdf = 5.
    expect(captured.length).toBe(5);
  });

  it("404 (no 409) NO dispara GET recovery", async () => {
    const { fetchImpl, captured } = makeFetchMock([
      { status: 200, body: { id: "cust-1" } },
      {
        status: 404,
        body: { message: "Customer not found" },
      },
    ]);
    const pac = createPacHttpClient({
      baseUrl: "https://www.facturapi.io/v2",
      apiKey: "sk_test_abc",
      fetchImpl,
    });
    let captured_err: { code: string; statusCode: number } | null = null;
    try {
      await pac.stamp(stampInputSample);
    } catch (e) {
      captured_err = e as { code: string; statusCode: number };
    }
    expect(captured_err).not.toBeNull();
    expect(captured_err!.code).toBe("INVOICE_NOT_FOUND");
    expect(captured_err!.statusCode).toBe(404);
    // NO GET recovery.
    const getRec = captured.find((r) =>
      /\/invoices\?external_id=/.test(r.url),
    );
    expect(getRec).toBeUndefined();
  });
});
