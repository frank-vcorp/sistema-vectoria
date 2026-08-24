"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc";
import { messages } from "@/shared/utils";

/**
 * Listado de schedules de facturación recurrente (BR-N310).
 *  - Calendario: muestra `scheduled_date`, importe y modo (`auto`/`draft`).
 *  - Acciones: omitir (skip) un schedule pendiente.
 *
 * Responsive: tabla con `overflow-x-auto` y columnas que se ocultan
 * en móvil (`hidden sm:table-cell`).
 */
export function SchedulesList() {
  const list = trpc.facturacion.schedules.list.useQuery({ limit: 50, offset: 0 });
  const utils = trpc.useUtils();
  const skip = trpc.facturacion.schedules.skip.useMutation({
    onSuccess: () => utils.facturacion.schedules.list.invalidate(),
  });
  const runNow = trpc.facturacion.schedules.runNow.useMutation({
    onSuccess: () => utils.facturacion.schedules.list.invalidate(),
  });

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted text-left">
          <tr>
            <th className="px-3 py-2">Fecha</th>
            <th className="hidden px-3 py-2 sm:table-cell">Modo</th>
            <th className="hidden px-3 py-2 sm:table-cell">Order/Subscription</th>
            <th className="px-3 py-2 text-right">Importe</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {list.data?.items.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                {messages.facturacion.empty}
              </td>
            </tr>
          ) : null}
          {list.data?.items.map((s: {
            id: string;
            scheduledDate: string;
            autoOrDraft: string;
            orderId: string | null;
            subscriptionId: string | null;
            amountCents: number;
            status: string;
          }) => (
            <tr key={s.id} className="border-t">
              <td className="px-3 py-2 font-mono">{s.scheduledDate}</td>
              <td className="hidden px-3 py-2 sm:table-cell">{s.autoOrDraft}</td>
              <td className="hidden px-3 py-2 sm:table-cell font-mono text-xs">
                {(s.orderId ?? s.subscriptionId ?? "").slice(0, 8)}
              </td>
              <td className="px-3 py-2 text-right font-mono">
                ${(s.amountCents / 100).toFixed(2)}
              </td>
              <td className="px-3 py-2">
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{s.status}</span>
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {s.status === "pending" ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          runNow.mutate({ scheduleId: s.id, scheduledDate: s.scheduledDate })
                        }
                        disabled={runNow.isPending}
                        className="rounded-md border bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {messages.facturacion.schedulesRunNow}
                      </button>
                      <button
                        type="button"
                        onClick={() => skip.mutate({ scheduleId: s.id })}
                        disabled={skip.isPending}
                        className="rounded-md border bg-card px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                      >
                        {messages.facturacion.schedulesSkip}
                      </button>
                    </>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
