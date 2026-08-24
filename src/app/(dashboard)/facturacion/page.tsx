"use client";

import * as React from "react";
import { FacturasList } from "@/modules/facturacion/facturas-list";
import { SchedulesList } from "@/modules/facturacion/schedules-list";
import { messages } from "@/shared/utils";

/**
 * Dashboard de Facturación CFDI (SPEC-007). Dos pestañas operables
 * en 3 viewports:
 *  - "Facturas": listado con calendario de 7 estados visuales,
 *    preview, timbrado, cancelación y ZIP mensual (BR-N312).
 *  - "Schedules": programaciones de facturación recurrente (BR-N310).
 *
 * Selector responsive con `overflow-x-auto` para el detalle por
 * pestaña (DEC-FUN-72 / AC-10 SPEC-001).
 */
export default function FacturacionPage() {
  const [tab, setTab] = React.useState<"facturas" | "schedules">("facturas");
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{messages.facturacion.title}</h1>
        <p className="text-sm text-muted-foreground">{messages.facturacion.subtitle}</p>
      </header>
      <div className="overflow-x-auto">
        <div className="inline-flex min-w-full gap-2 border-b">
          {(
            [
              { key: "facturas" as const, label: "Facturas" },
              { key: "schedules" as const, label: messages.facturacion.schedules },
            ]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                tab === t.key
                  ? "border-b-2 border-primary px-3 py-2 text-sm font-medium"
                  : "px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === "facturas" ? <FacturasList /> : <SchedulesList />}
    </div>
  );
}
