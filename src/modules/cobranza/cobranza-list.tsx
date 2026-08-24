"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc";
import { messages } from "@/shared/utils";

/**
 * Listado de actividades de cobranza + promesas + escalado
 * (SPEC-008 AC-8 / BR-N313/322-325). Tras 2 promesas incumplidas la
 * factura escala con plantilla amable/firme/final (BR-N313/321).
 *
 * Acciones:
 *  - Crear actividad (`llamada`/`email`/`promesa`/`otro`).
 *  - Marcar promesa cumplida.
 *  - Evaluar escalado (calcula tono + plantilla).
 *
 * Tabla responsive con `overflow-x-auto` + `hidden sm/md:table-cell`.
 */
export function CobranzaList() {
  const [typeFilter, setTypeFilter] = React.useState<string>("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [escalationInvoiceId, setEscalationInvoiceId] = React.useState<string>("");

  const activities = trpc.cobranza.cobranza.listActivities.useQuery({
    limit: 20,
    offset: 0,
    ...(typeFilter ? { type: typeFilter as never } : {}),
  });
  const promises = trpc.cobranza.cobranza.listPromises.useQuery({
    limit: 50,
    offset: 0,
    fulfilled: false,
  });
  const utils = trpc.useUtils();
  const fulfill = trpc.cobranza.cobranza.fulfillPromise.useMutation({
    onSuccess: () => utils.cobranza.cobranza.listPromises.invalidate(),
  });
  const evaluate = trpc.cobranza.cobranza.evaluateEscalation.useMutation();
  void evaluate;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Actividades</h2>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-md border bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90"
          >
            {messages.cobranza.promesaCreate}
          </button>
        </header>
        <div className="flex items-center gap-2">
          <label htmlFor="typeFilter" className="text-sm text-muted-foreground">
            Tipo
          </label>
          <select
            id="typeFilter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-sm"
          >
            <option value="">—</option>
            {(["llamada", "email", "promesa", "otro"] as const).map((t) => (
              <option key={t} value={t}>
                {messages.cobranza.activityTypeLabel[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-3 py-2">Tipo</th>
                <th className="hidden px-3 py-2 sm:table-cell">Cliente</th>
                <th className="hidden px-3 py-2 md:table-cell">Factura</th>
                <th className="px-3 py-2">Notas</th>
                <th className="hidden px-3 py-2 md:table-cell">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {activities.data?.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                    {messages.cobranza.empty}
                  </td>
                </tr>
              ) : null}
              {activities.data?.items.map((a: {
                id: string;
                type: keyof typeof messages.cobranza.activityTypeLabel;
                clientId: string;
                invoiceId: string | null;
                notes: string | null;
                createdAt: string;
              }) => (
                <tr key={a.id} className="border-t">
                  <td className="px-3 py-2">{messages.cobranza.activityTypeLabel[a.type] ?? a.type}</td>
                  <td className="hidden px-3 py-2 sm:table-cell font-mono text-xs">{a.clientId.slice(0, 8)}</td>
                  <td className="hidden px-3 py-2 md:table-cell font-mono text-xs">
                    {a.invoiceId?.slice(0, 8) ?? "—"}
                  </td>
                  <td className="px-3 py-2">{a.notes ?? ""}</td>
                  <td className="hidden px-3 py-2 md:table-cell font-mono text-xs">{a.createdAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Promesas pendientes</h2>
        </header>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-3 py-2">Factura</th>
                <th className="hidden px-3 py-2 sm:table-cell">Importe</th>
                <th className="px-3 py-2">Fecha prometida</th>
                <th className="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {promises.data?.items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                    {messages.cobranza.empty}
                  </td>
                </tr>
              ) : null}
              {promises.data?.items.map((p: {
                id: string;
                invoiceId: string;
                promisedAmountCents: number;
                promisedDate: string;
              }) => (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{p.invoiceId.slice(0, 8)}</td>
                  <td className="hidden px-3 py-2 sm:table-cell font-mono">
                    ${(p.promisedAmountCents / 100).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 font-mono">{p.promisedDate}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => fulfill.mutate({ promiseId: p.id })}
                        disabled={fulfill.isPending}
                        className="rounded-md border bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {messages.cobranza.promesaFulfill}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEscalationInvoiceId(p.invoiceId)}
                        className="rounded-md border bg-card px-2 py-1 text-xs hover:bg-accent"
                      >
                        {messages.cobranza.escalateEvaluate}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {createOpen ? <CreateActivityDialog onClose={() => setCreateOpen(false)} /> : null}
      {escalationInvoiceId ? (
        <EscalationResult
          invoiceId={escalationInvoiceId}
          refDate={new Date().toISOString().slice(0, 10)}
          onClose={() => setEscalationInvoiceId("")}
        />
      ) : null}
    </div>
  );
}

function CreateActivityDialog({ onClose }: { onClose: () => void }) {
  const [type, setType] = React.useState<"llamada" | "email" | "promesa" | "otro">("llamada");
  const [clientId, setClientId] = React.useState("");
  const [invoiceId, setInvoiceId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [promisedAmountCents, setPromisedAmountCents] = React.useState<number | undefined>(undefined);
  const [promisedDate, setPromisedDate] = React.useState("");
  const [createPromise, setCreatePromise] = React.useState(true);
  const utils = trpc.useUtils();
  const create = trpc.cobranza.cobranza.createActivity.useMutation({
    onSuccess: () => {
      utils.cobranza.cobranza.listActivities.invalidate();
      utils.cobranza.cobranza.listPromises.invalidate();
      onClose();
    },
  });
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={messages.cobranza.promesaCreate}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div className="w-full max-w-md rounded-t-lg bg-background p-6 shadow-xl sm:rounded-lg">
        <h2 className="mb-4 text-lg font-bold">{messages.cobranza.promesaCreate}</h2>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="block text-muted-foreground">Tipo</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1"
            >
              {(["llamada", "email", "promesa", "otro"] as const).map((t) => (
                <option key={t} value={t}>
                  {messages.cobranza.activityTypeLabel[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-muted-foreground">{messages.cobranza.client} (UUID)</span>
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1 font-mono"
            />
          </label>
          <label className="block">
            <span className="block text-muted-foreground">{messages.cobranza.invoice} (UUID, opcional)</span>
            <input
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1 font-mono"
            />
          </label>
          <label className="block">
            <span className="block text-muted-foreground">Notas</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1"
            />
          </label>
          {type === "promesa" ? (
            <>
              <label className="block">
                <span className="block text-muted-foreground">{messages.cobranza.promesaImporte} (¢)</span>
                <input
                  type="number"
                  value={promisedAmountCents ?? ""}
                  onChange={(e) =>
                    setPromisedAmountCents(
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  className="mt-1 w-full rounded-md border bg-background px-2 py-1"
                />
              </label>
              <label className="block">
                <span className="block text-muted-foreground">{messages.cobranza.promesaFecha}</span>
                <input
                  type="date"
                  value={promisedDate}
                  onChange={(e) => setPromisedDate(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background px-2 py-1"
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={createPromise}
                  onChange={(e) => setCreatePromise(e.target.checked)}
                />
                <span className="text-xs">Crear promesa ligada</span>
              </label>
            </>
          ) : null}
          {create.error ? (
            <p className="text-xs text-destructive">{String(create.error.message)}</p>
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
            disabled={create.isPending || !clientId || (type === "promesa" && (!invoiceId || !promisedAmountCents || !promisedDate))}
            onClick={() =>
              create.mutate({
                clientId,
                ...(invoiceId ? { invoiceId } : {}),
                type,
                notes: notes || undefined,
                ...(type === "promesa" && promisedAmountCents !== undefined
                  ? { promisedAmountCents, promisedDate }
                  : {}),
                createPromise: type === "promesa" ? createPromise : undefined,
              })
            }
            className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {messages.cobranza.promesaCreate}
          </button>
        </div>
      </div>
    </div>
  );
}

function EscalationResult({
  invoiceId,
  refDate,
  onClose,
}: {
  invoiceId: string;
  refDate: string;
  onClose: () => void;
}) {
  const evaluate = trpc.cobranza.cobranza.evaluateEscalation.useMutation();
  React.useEffect(() => {
    evaluate.mutate({ invoiceId, refDate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId, refDate]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={messages.cobranza.escalateEvaluate}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div className="w-full max-w-md rounded-t-lg bg-background p-6 shadow-xl sm:rounded-lg">
        <h2 className="mb-2 text-lg font-bold">{messages.cobranza.escalateEvaluate}</h2>
        <p className="mb-3 text-xs text-muted-foreground">{messages.cobranza.escalateHint}</p>
        {evaluate.isPending ? (
          <p className="text-sm">Calculando…</p>
        ) : evaluate.data ? (
          <div className="space-y-2 text-sm">
            <p>
              <strong>Tono:</strong> {messages.cobranza.escalateTone[evaluate.data.tone]}
            </p>
            <p>
              <strong>{messages.cobranza.escalateBroken}:</strong> {evaluate.data.brokenPromises}
            </p>
            <p className="rounded-md border bg-secondary/40 p-3">{evaluate.data.template}</p>
          </div>
        ) : evaluate.data === null ? (
          <p className="text-sm text-muted-foreground">
            La factura aún no acumula 2 promesas incumplidas (BR-N313).
          </p>
        ) : (
          <p className="text-xs text-destructive">{String(evaluate.error?.message ?? "")}</p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border bg-card px-3 py-1 text-sm hover:bg-accent"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
