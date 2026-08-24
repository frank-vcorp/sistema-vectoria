"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc";
import { messages } from "@/shared/utils";

/**
 * Listado de cobros (SPEC-008 AC-10): `registrado | confirmado |
 * reversado`. Acciones:
 *  - Confirmar: `cobro.confirm` (sólo en `registrado`).
 *  - Reversar: `cobro.reverse` con motivo ≥3 chars (BR-N318).
 *
 * Visibilidad (BR-N207): si el actor no tiene `ver_cxc_otros`, el
 * servicio filtra por `created_by`. La UI no duplica el filtro.
 *
 * Responsive: tabla con `overflow-x-auto` + `hidden sm/md:table-cell`.
 */
export function CobrosList() {
  const [page, setPage] = React.useState({ limit: 20, offset: 0 });
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [reverseOpen, setReverseOpen] = React.useState<string | null>(null);

  const list = trpc.cobranza.cobros.list.useQuery({
    ...page,
    ...(statusFilter ? { status: statusFilter as never } : {}),
  });

  return (
    <div className="space-y-4">
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
            {(["registrado", "confirmado", "reversado"] as const).map((s) => (
              <option key={s} value={s}>
                {messages.cobranza.statusLabel[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">{messages.cobranza.client}</th>
              <th className="hidden px-3 py-2 sm:table-cell">{messages.cobranza.method}</th>
              <th className="hidden px-3 py-2 md:table-cell">{messages.cobranza.reference}</th>
              <th className="px-3 py-2 text-right">{messages.cobranza.amount}</th>
              <th className="px-3 py-2">{messages.cobranza.status}</th>
              <th className="hidden px-3 py-2 md:table-cell">{messages.cobranza.paymentDate}</th>
              <th className="px-3 py-2">{messages.cobranza.list}</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">
                  {messages.cobranza.empty}
                </td>
              </tr>
            ) : null}
            {list.data?.items.map((p: {
              id: string;
              clientId: string;
              method: keyof typeof messages.cobranza.methodLabel;
              reference: string | null;
              amountCents: number;
              status: keyof typeof messages.cobranza.statusLabel;
              paymentDate: string;
            }) => (
              <tr key={p.id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{p.clientId.slice(0, 8)}</td>
                <td className="hidden px-3 py-2 sm:table-cell">{messages.cobranza.methodLabel[p.method] ?? p.method}</td>
                <td className="hidden px-3 py-2 md:table-cell">{p.reference ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono">${(p.amountCents / 100).toFixed(2)}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                    {messages.cobranza.statusLabel[p.status]}
                  </span>
                </td>
                <td className="hidden px-3 py-2 md:table-cell">{p.paymentDate}</td>
                <td className="px-3 py-2">
                  <CobroActions id={p.id} status={p.status} onReverse={() => setReverseOpen(p.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {list.data && list.data.total > page.limit ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button
            type="button"
            disabled={page.offset === 0}
            onClick={() => setPage((p) => ({ ...p, offset: Math.max(0, p.offset - p.limit) }))}
            className="rounded-md border px-2 py-1 disabled:opacity-50"
          >
            ‹
          </button>
          <span>
            {page.offset + 1}..{Math.min(page.offset + page.limit, list.data.total)} / {list.data.total}
          </span>
          <button
            type="button"
            disabled={page.offset + page.limit >= list.data.total}
            onClick={() => setPage((p) => ({ ...p, offset: p.offset + p.limit }))}
            className="rounded-md border px-2 py-1 disabled:opacity-50"
          >
            ›
          </button>
        </div>
      ) : null}

      {reverseOpen ? (
        <ReverseDialog
          paymentId={reverseOpen}
          onClose={() => setReverseOpen(null)}
        />
      ) : null}
    </div>
  );
}

function CobroActions({
  id,
  status,
  onReverse,
}: {
  id: string;
  status: string;
  onReverse: () => void;
}) {
  const utils = trpc.useUtils();
  const confirm = trpc.cobranza.cobros.confirm.useMutation({
    onSuccess: () => utils.cobranza.cobros.list.invalidate(),
  });
  return (
    <div className="flex flex-wrap items-center gap-1">
      {status === "registrado" ? (
        <button
          type="button"
          onClick={() => confirm.mutate({ paymentId: id })}
          disabled={confirm.isPending}
          className="rounded-md border bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {messages.cobranza.confirm}
        </button>
      ) : null}
      {status === "confirmado" ? (
        <button
          type="button"
          onClick={onReverse}
          className="rounded-md border bg-destructive px-2 py-1 text-xs text-destructive-foreground hover:bg-destructive/90"
        >
          {messages.cobranza.reverse}
        </button>
      ) : null}
    </div>
  );
}

function ReverseDialog({
  paymentId,
  onClose,
}: {
  paymentId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = React.useState("");
  const utils = trpc.useUtils();
  const reverse = trpc.cobranza.cobros.reverse.useMutation({
    onSuccess: () => {
      utils.cobranza.cobros.list.invalidate();
      onClose();
    },
  });
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={messages.cobranza.reverse}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div className="w-full max-w-md rounded-t-lg bg-background p-6 shadow-xl sm:rounded-lg">
        <h2 className="mb-4 text-lg font-bold">{messages.cobranza.reverse}</h2>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="block text-muted-foreground">{messages.cobranza.reverseReason}</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1"
              placeholder={messages.cobranza.reverseReason}
            />
          </label>
          {reverse.error ? (
            <p className="text-xs text-destructive">{String(reverse.error.message)}</p>
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
            disabled={reverse.isPending || reason.length < 3}
            onClick={() => reverse.mutate({ paymentId, reason })}
            className="rounded-md bg-destructive px-3 py-1 text-sm text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {messages.cobranza.reverse}
          </button>
        </div>
      </div>
    </div>
  );
}
