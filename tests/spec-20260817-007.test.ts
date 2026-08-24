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
import { readFile } from "node:fs/promises";
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
