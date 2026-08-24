"use client";

import * as React from "react";
import { CobrosList } from "@/modules/cobranza/cobros-list";
import { ComisionesList } from "@/modules/cobranza/comisiones-list";
import { CobranzaList } from "@/modules/cobranza/cobranza-list";
import { messages } from "@/shared/utils";

/**
 * Dashboard de Cobranza y Comisiones (SPEC-008). 3 pestañas operables
 * en 3 viewports (DEC-FUN-72 / AC-10 SPEC-001):
 *  - "Cobros": listado de pagos (registrado/confirmado/reversado),
 *    confirmar y reversar con motivo (BR-N315/318).
 *  - "Cobranza": actividades (llamada/email/promesa/otro), promesas
 *    pendientes, escalado tras 2 incumplidas (BR-N313/322-325).
 *  - "Comisiones": 1 por OS (BR-N298), estimada→devengada→liberada→
 *    pagada, fórmula BR-N362, día 15 (BR-N299), reembolso DEC-FUN-35.
 *
 * Selector responsive con `overflow-x-auto`.
 */
export default function CobranzaPage() {
  const [tab, setTab] = React.useState<"cobros" | "cobranza" | "comisiones">("cobros");
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{messages.cobranza.title}</h1>
        <p className="text-sm text-muted-foreground">{messages.cobranza.subtitle}</p>
      </header>
      <div className="overflow-x-auto">
        <div className="inline-flex min-w-full gap-2 border-b">
          {(
            [
              { key: "cobros" as const, label: messages.cobranza.tabs.cobros },
              { key: "cobranza" as const, label: messages.cobranza.tabs.cobranza },
              { key: "comisiones" as const, label: messages.cobranza.tabs.comisiones },
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
      {tab === "cobros" ? <CobrosList /> : null}
      {tab === "cobranza" ? <CobranzaList /> : null}
      {tab === "comisiones" ? <ComisionesList /> : null}
    </div>
  );
}
