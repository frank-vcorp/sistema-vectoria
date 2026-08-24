"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc";
import { messages } from "@/shared/utils";

/**
 * Listado de comisiones (SPEC-008 AC-10): `estimada → devengada →
 * liberada → pagada` (+ `cancelada`). Acciones:
 *  - Estimar: crea la comisión por OS (BR-N297/298; 1 por OS).
 *  - Liberar: recalcula `liberada` con la fórmula BR-N362.
 *  - Pagar: Director/Admin marca `pagada` (BR-N299; default día 15
 *    vía job `comisionesDia15`).
 *  - Cancelar OS: reembolso proporcional (DEC-FUN-35).
 *
 * Tabla responsive con `overflow-x-auto` + `hidden sm/md:table-cell`.
 */
export function ComisionesList() {
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [estimateOpen, setEstimateOpen] = React.useState(false);
  const [payId, setPayId] = React.useState<string | null>(null);
  const [cancelOsOpen, setCancelOsOpen] = React.useState<string | null>(null);

  const list = trpc.cobranza.comisiones.list.useQuery({
    limit: 20,
    offset: 0,
    ...(statusFilter ? { status: statusFilter as never } : {}),
  });
  const utils = trpc.useUtils();
  const pay = trpc.cobranza.comisiones.pay.useMutation({
    onSuccess: () => utils.cobranza.comisiones.list.invalidate(),
  });
  const release = trpc.cobranza.comisiones.release.useMutation({
    onSuccess: () => utils.cobranza.comisiones.list.invalidate(),
  });
  const cancelOnOs = trpc.cobranza.comisiones.cancelOnOsCancel.useMutation({
    onSuccess: () => utils.cobranza.comisiones.list.invalidate(),
  });

  return (
    <div className="space-y-4">
      <p className="rounded-md border bg-secondary/40 p-3 text-xs text-muted-foreground">
        {messages.cobranza.regla1}
        <br />
        {messages.cobranza.regla2}
        <br />
        {messages.cobranza.payDayJob}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <label htmlFor="statusFilter" className="text-sm text-muted-foreground">
            {messages.cobranza.status}
          </label>
          <select
            id="statusFilter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-sm"
          >
            <option value="">—</option>
            {(
              [
                "estimada",
                "devengada",
                "liberada",
                "pagada",
                "cancelada",
              ] as const
            ).map((s) => (
              <option key={s} value={s}>
                {messages.cobranza.statusLabel[s]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setEstimateOpen(true)}
          className="rounded-md border bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {messages.cobranza.estimate}
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">{messages.cobranza.order}</th>
              <th className="hidden px-3 py-2 sm:table-cell">{messages.cobranza.vendedor}</th>
              <th className="px-3 py-2 text-right">{messages.cobranza.ratePct}</th>
              <th className="px-3 py-2 text-right">{messages.cobranza.estimated}</th>
              <th className="px-3 py-2 text-right">{messages.cobranza.released}</th>
              <th className="px-3 py-2">{messages.cobranza.status}</th>
              <th className="hidden px-3 py-2 md:table-cell">{messages.cobranza.paidAt}</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">
                  {messages.cobranza.comisionesTitle} — vacío
                </td>
              </tr>
            ) : null}
            {list.data?.items.map((c: {
              id: string;
              orderId: string;
              vendedorUserId: string;
              ratePct: string;
              estimatedCents: number;
              releasedCents: number;
              status: keyof typeof messages.cobranza.statusLabel;
              paidAt: string | null;
            }) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{c.orderId.slice(0, 8)}</td>
                <td className="hidden px-3 py-2 sm:table-cell font-mono text-xs">
                  {c.vendedorUserId.slice(0, 8)}
                </td>
                <td className="px-3 py-2 text-right font-mono">{c.ratePct}%</td>
                <td className="px-3 py-2 text-right font-mono">${(c.estimatedCents / 100).toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-mono">${(c.releasedCents / 100).toFixed(2)}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                    {messages.cobranza.statusLabel[c.status]}
                  </span>
                </td>
                <td className="hidden px-3 py-2 md:table-cell font-mono text-xs">
                  {c.paidAt ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {c.status === "estimada" || c.status === "devengada" ? (
                      <button
                        type="button"
                        onClick={() => release.mutate({ orderId: c.orderId })}
                        disabled={release.isPending}
                        className="rounded-md border bg-card px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                      >
                        {messages.cobranza.release}
                      </button>
                    ) : null}
                    {c.status === "liberada" ? (
                      <button
                        type="button"
                        onClick={() => setPayId(c.id)}
                        disabled={pay.isPending}
                        className="rounded-md border bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {messages.cobranza.pay}
                      </button>
                    ) : null}
                    {c.status !== "pagada" && c.status !== "cancelada" ? (
                      <button
                        type="button"
                        onClick={() => setCancelOsOpen(c.orderId)}
                        disabled={cancelOnOs.isPending}
                        className="rounded-md border bg-destructive px-2 py-1 text-xs text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                      >
                        {messages.cobranza.cancelOnOsCancel}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {payId ? <PayDialog commissionId={payId} onClose={() => setPayId(null)} /> : null}
      {estimateOpen ? (
        <EstimateDialog
          onClose={() => setEstimateOpen(false)}
        />
      ) : null}
      {cancelOsOpen ? (
        <CancelOnOsDialog
          orderId={cancelOsOpen}
          onClose={() => setCancelOsOpen(null)}
        />
      ) : null}
    </div>
  );
}

function PayDialog({
  commissionId,
  onClose,
}: {
  commissionId: string;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const pay = trpc.cobranza.comisiones.pay.useMutation({
    onSuccess: () => {
      utils.cobranza.comisiones.list.invalidate();
      onClose();
    },
  });
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={messages.cobranza.pay}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div className="w-full max-w-md rounded-t-lg bg-background p-6 shadow-xl sm:rounded-lg">
        <h2 className="mb-4 text-lg font-bold">{messages.cobranza.pay}</h2>
        <p className="text-sm text-muted-foreground">{messages.cobranza.payDayJob}</p>
        {pay.error ? (
          <p className="mt-2 text-xs text-destructive">{String(pay.error.message)}</p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border bg-card px-3 py-1 text-sm hover:bg-accent"
          >
            Cerrar
          </button>
          <button
            type="button"
            disabled={pay.isPending}
            onClick={() => pay.mutate({ commissionId })}
            className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {messages.cobranza.pay}
          </button>
        </div>
      </div>
    </div>
  );
}

function EstimateDialog({ onClose }: { onClose: () => void }) {
  const [orderId, setOrderId] = React.useState("");
  const [vendedorUserId, setVendedorUserId] = React.useState("");
  const [ratePct, setRatePct] = React.useState(5);
  const utils = trpc.useUtils();
  const estimate = trpc.cobranza.comisiones.estimate.useMutation({
    onSuccess: () => {
      utils.cobranza.comisiones.list.invalidate();
      onClose();
    },
  });
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={messages.cobranza.estimate}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div className="w-full max-w-md rounded-t-lg bg-background p-6 shadow-xl sm:rounded-lg">
        <h2 className="mb-4 text-lg font-bold">{messages.cobranza.estimate}</h2>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="block text-muted-foreground">{messages.cobranza.order} (UUID)</span>
            <input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1 font-mono"
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </label>
          <label className="block">
            <span className="block text-muted-foreground">{messages.cobranza.vendedor} (UUID)</span>
            <input
              value={vendedorUserId}
              onChange={(e) => setVendedorUserId(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1 font-mono"
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </label>
          <label className="block">
            <span className="block text-muted-foreground">{messages.cobranza.ratePct}</span>
            <input
              type="number"
              step={0.01}
              min={0.01}
              max={100}
              value={ratePct}
              onChange={(e) => setRatePct(Number(e.target.value))}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1"
            />
          </label>
          {estimate.error ? (
            <p className="text-xs text-destructive">{String(estimate.error.message)}</p>
          ) : null}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border bg-card px-3 py-1 text-sm hover:bg-accent"
          >
            Cerrar
          </button>
          <button
            type="button"
            disabled={estimate.isPending || ratePct <= 0}
            onClick={() =>
              estimate.mutate({
                orderId,
                vendedorUserId,
                ratePct,
              })
            }
            className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {messages.cobranza.estimate}
          </button>
        </div>
      </div>
    </div>
  );
}

function CancelOnOsDialog({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = React.useState("");
  const utils = trpc.useUtils();
  const cancel = trpc.cobranza.comisiones.cancelOnOsCancel.useMutation({
    onSuccess: () => {
      utils.cobranza.comisiones.list.invalidate();
      onClose();
    },
  });
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={messages.cobranza.cancelOnOsCancel}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div className="w-full max-w-md rounded-t-lg bg-background p-6 shadow-xl sm:rounded-lg">
        <h2 className="mb-2 text-lg font-bold">{messages.cobranza.cancelOnOsCancel}</h2>
        <p className="mb-3 text-xs text-muted-foreground">{messages.cobranza.cancelOnOsCancel}</p>
        <label className="block">
          <span className="block text-muted-foreground">{messages.cobranza.cancelReason}</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border bg-background px-2 py-1"
            placeholder={messages.cobranza.cancelReason}
          />
        </label>
        {cancel.error ? (
          <p className="mt-2 text-xs text-destructive">{String(cancel.error.message)}</p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border bg-card px-3 py-1 text-sm hover:bg-accent"
          >
            Cerrar
          </button>
          <button
            type="button"
            disabled={cancel.isPending || reason.length < 3}
            onClick={() => cancel.mutate({ orderId, reason })}
            className="rounded-md bg-destructive px-3 py-1 text-sm text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {messages.cobranza.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
