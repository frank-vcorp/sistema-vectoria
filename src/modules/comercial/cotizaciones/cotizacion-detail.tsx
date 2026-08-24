"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { messages } from "@/shared/utils";

/**
 * Vista detalle de cotización con:
 *  - Items multi-línea (BR-N234, 4 kinds).
 *  - Advertencia presupuestal (BR-N411, AC-12) si `total >
 *    1.5 × presupuesto_declarado` — bloque amarillo visible con
 *    ambos montos (paridad responsive, AC-10).
 *  - Acciones: send / accept / cancel (delegadas al router tRPC).
 */
function fmtMXN(cents: number): string {
  const pesos = Math.round(cents) / 100;
  return pesos.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  });
}

function kindLabel(kind: string): string {
  return (
    ({
      service: "Servicio",
      license: "Licencia",
      expense: "Gasto",
      discount: "Descuento",
    } as Record<string, string>)[kind] ?? kind
  );
}

export function CotizacionDetail({ id }: { id: string }) {
  const byId = trpc.comercial.cotizaciones.byId.useQuery({ id });
  const warning = trpc.comercial.cotizaciones.presupuestoWarning.useQuery({
    quoteId: id,
  });
  const q = byId.data;

  if (!q) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{messages.common.loading}</CardTitle>
        </CardHeader>
        <CardContent />
      </Card>
    );
  }

  const warn = warning.data;
  const showWarning = !!warn?.warn;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {q.code} · {messages.cotizaciones.title}
          </CardTitle>
          <CardDescription>
            {q.tipoCobro} · {q.status}
            {q.requiresInitialPayment ? " · requiere pago inicial" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{q.status}</span>
            {q.tipoCobro === "suscripcion" ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                suscripción
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Vigencia: {q.validUntil ? new Date(q.validUntil).toLocaleDateString("es-MX") : "—"}
          </p>
        </CardContent>
      </Card>

      {showWarning ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <strong>{messages.cotizaciones.presupuestoWarningTitle}</strong>
          <p className="mt-1">
            {messages.cotizaciones.presupuestoWarningBody
              .replace("{presupuesto}", fmtMXN(warn!.presupuestoCents ?? 0))
              .replace("{total}", fmtMXN(warn!.totalCents))}
          </p>
          <p className="mt-1 text-xs">
            {messages.cotizaciones.presupuestoWarningNonBlocking}
          </p>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{messages.cotizaciones.itemsTitle}</CardTitle>
          <CardDescription>
            {messages.cotizaciones.multiLineHint} · {q.items.length} ítems
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Tipo</th>
                  <th className="py-2">Descripción</th>
                  <th className="py-2 text-right">Cant.</th>
                  <th className="py-2 text-right">P. Unit.</th>
                  <th className="py-2 text-right">Desc.</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {q.items.map((it) => (
                  <tr key={it.id} className="border-b">
                    <td className="py-2 text-xs">{kindLabel(it.kind)}</td>
                    <td className="py-2">{it.description}</td>
                    <td className="py-2 text-right">{it.qty}</td>
                    <td className="py-2 text-right">{fmtMXN(it.unitPriceCents)}</td>
                    <td className="py-2 text-right">{fmtMXN(it.discountCents)}</td>
                    <td className="py-2 text-right font-medium">{fmtMXN(it.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{messages.cotizaciones.totalsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Row label={messages.cotizaciones.subtotal} value={fmtMXN(q.subtotalCents)} />
          <Row label={messages.cotizaciones.discount} value={fmtMXN(q.discountCents)} />
          <Row label={messages.cotizaciones.tax} value={fmtMXN(q.taxCents)} />
          <Row label={messages.cotizaciones.total} value={fmtMXN(q.totalCents)} bold />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "border-t pt-1 font-semibold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
