"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc";
import { messages } from "@/shared/utils";

/**
 * SPEC-011 (Suscripciones · B20a) · Panel de cartera y detalle.
 *
 * Operable en 3 viewports (DEC-FUN-72 / AC-10 SPEC-001):
 *  - Lista principal con filtro por periodicidad (BR-N400) y estado.
 *  - Selección → detalle con tabs (Historial, Facturación, Cobranza).
 *  - Acciones: renovar / pausar / cancelar / reactivar (BR-N404).
 *  - Crear desde OS autorizada (`suscripciones.createFromOrder`).
 *  - Modal `role="dialog"` para razón obligatoria (≥3 caracteres).
 *
 * La UI NO accede a BD (AC-26 SPEC-001); consume los endpoints
 * `suscripciones.*` exclusivamente.
 */
type Status = keyof typeof messages.suscripciones.statusLabels;
type Periodicity = keyof typeof messages.suscripciones.periodicityLabels;

export function SuscripcionesPanel() {
  const [status, setStatus] = React.useState<Status | "todas">("todas");
  const [periodicity, setPeriodicity] = React.useState<Periodicity | "todas">(
    "todas",
  );
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"history" | "facturacion" | "cobranza">(
    "history",
  );

  const list = trpc.suscripciones.list.useQuery({
    ...(status === "todas" ? {} : { status }),
    ...(periodicity === "todas" ? {} : { periodicity }),
    limit: 50,
    offset: 0,
  });

  const detail = trpc.suscripciones.get.useQuery(
    { id: selectedId ?? "" },
    { enabled: !!selectedId },
  );
  const history = trpc.suscripciones.history.useQuery(
    { id: selectedId ?? "", limit: 50, offset: 0 },
    { enabled: !!selectedId && tab === "history" },
  );
  const facturacion = trpc.suscripciones.facturacion.useQuery(
    { id: selectedId ?? "" },
    { enabled: !!selectedId && tab === "facturacion" },
  );
  const cobranza = trpc.suscripciones.cobranza.useQuery(
    { id: selectedId ?? "" },
    { enabled: !!selectedId && tab === "cobranza" },
  );

  const utils = trpc.useUtils();
  const pausarMut = trpc.suscripciones.pausar.useMutation({
    onSuccess: () => {
      utils.suscripciones.get.invalidate();
      utils.suscripciones.history.invalidate();
      utils.suscripciones.list.invalidate();
    },
  });
  const cancelarMut = trpc.suscripciones.cancelar.useMutation({
    onSuccess: () => {
      utils.suscripciones.get.invalidate();
      utils.suscripciones.history.invalidate();
      utils.suscripciones.list.invalidate();
    },
  });
  const reactivarMut = trpc.suscripciones.reactivar.useMutation({
    onSuccess: () => {
      utils.suscripciones.get.invalidate();
      utils.suscripciones.history.invalidate();
      utils.suscripciones.list.invalidate();
    },
  });
  const renovarMut = trpc.suscripciones.renovar.useMutation({
    onSuccess: () => {
      utils.suscripciones.get.invalidate();
      utils.suscripciones.history.invalidate();
      utils.suscripciones.list.invalidate();
    },
  });
  const createFromOrderMut = trpc.suscripciones.createFromOrder.useMutation({
    onSuccess: () => {
      utils.suscripciones.list.invalidate();
    },
  });

  const [actionModal, setActionModal] = React.useState<
    null | { kind: "pausar" | "cancelar" | "reactivar"; id: string }
  >(null);
  const [reason, setReason] = React.useState("");
  const [orderIdInput, setOrderIdInput] = React.useState("");

  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const periodLabel = (p: string) =>
    messages.suscripciones.periodicityLabels[p as Periodicity] ?? p;
  const statusLabel = (s: string) =>
    messages.suscripciones.statusLabels[s as Status] ?? s;

  const sub = detail.data?.subscription;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{messages.suscripciones.title}</h1>
        <p className="text-sm text-muted-foreground">
          {messages.suscripciones.subtitle}
        </p>
      </header>
      <p className="rounded-md border bg-secondary/30 p-2 text-xs text-muted-foreground">
        {messages.suscripciones.tooltipOS}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Status | "todas")}
          className="rounded border bg-card px-2 py-1 text-xs"
          aria-label={messages.suscripciones.filterByStatus}
        >
          <option value="todas">{messages.suscripciones.all}</option>
          {(
            ["activa", "pausada", "vencida", "cancelada"] as Array<Status>
          ).map((s) => (
            <option key={s} value={s}>
              {messages.suscripciones.statusLabels[s]}
            </option>
          ))}
        </select>
        <select
          value={periodicity}
          onChange={(e) =>
            setPeriodicity(e.target.value as Periodicity | "todas")
          }
          className="rounded border bg-card px-2 py-1 text-xs"
          aria-label={messages.suscripciones.filterByPeriodicity}
        >
          <option value="todas">{messages.suscripciones.all}</option>
          {(
            [
              "mensual",
              "trimestral",
              "semestral",
              "anual",
            ] as Array<Periodicity>
          ).map((p) => (
            <option key={p} value={p}>
              {periodLabel(p)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-sm font-bold">{messages.suscripciones.list}</h2>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[300px] text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-3 py-2">OS</th>
                  <th className="px-3 py-2">Periodicidad</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {(list.data?.items ?? []).map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={
                      selectedId === s.id
                        ? "cursor-pointer border-t bg-secondary/30"
                        : "cursor-pointer border-t hover:bg-secondary/10"
                    }
                  >
                    <td className="px-3 py-2 font-mono text-xs">
                      {s.orderId.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2">{periodLabel(s.periodicity)}</td>
                    <td className="px-3 py-2">{statusLabel(s.status)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {fmt(s.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-md border bg-card p-3">
            <h3 className="mb-2 text-xs font-bold">
              {messages.suscripciones.createFromOrder}
            </h3>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="orderId (uuid)"
                value={orderIdInput}
                onChange={(e) => setOrderIdInput(e.target.value)}
                className="min-w-[260px] flex-1 rounded border bg-background px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  if (!orderIdInput) return;
                  createFromOrderMut.mutate({ orderId: orderIdInput });
                }}
                disabled={createFromOrderMut.isPending || !orderIdInput}
                className="rounded border bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {messages.suscripciones.createFromOrder}
              </button>
            </div>
            {createFromOrderMut.error ? (
              <p className="mt-2 text-xs text-destructive">
                {createFromOrderMut.error.message}
              </p>
            ) : null}
            {createFromOrderMut.data ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {messages.suscripciones.notAuthorizedOS}
              </p>
            ) : null}
          </div>
        </section>

        <section className="space-y-3">
          {!sub ? (
            <p className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
              {messages.suscripciones.detail}
            </p>
          ) : (
            <>
              <header className="rounded-md border bg-card p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      OS · {sub.orderId.slice(0, 8)} · Cliente ·{" "}
                      {sub.clientId.slice(0, 8)}
                    </div>
                    <div className="font-bold">
                      {statusLabel(sub.status)} ·{" "}
                      {periodLabel(sub.periodicity)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {messages.suscripciones.currentPeriod}:{" "}
                      {sub.currentPeriodStart} → {sub.currentPeriodEnd}
                      {sub.nextRenewalDate
                        ? ` · ${messages.suscripciones.nextRenewal}: ${sub.nextRenewalDate}`
                        : ""}
                      {" · "}
                      {messages.suscripciones.amount}:{" "}
                      {fmt(sub.amountCents)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {sub.status === "activa" || sub.status === "vencida" ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (sub.id)
                            renovarMut.mutate({ id: sub.id });
                        }}
                        disabled={renovarMut.isPending}
                        className="rounded border bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {messages.suscripciones.renovar}
                      </button>
                    ) : null}
                    {sub.status === "activa" ? (
                      <button
                        type="button"
                        onClick={() =>
                          setActionModal({ kind: "pausar", id: sub.id })
                        }
                        className="rounded border bg-secondary px-3 py-1 text-xs hover:bg-accent"
                      >
                        {messages.suscripciones.pausar}
                      </button>
                    ) : null}
                    {sub.status === "cancelada" ? (
                      <button
                        type="button"
                        onClick={() =>
                          setActionModal({ kind: "reactivar", id: sub.id })
                        }
                        className="rounded border bg-secondary px-3 py-1 text-xs hover:bg-accent"
                      >
                        {messages.suscripciones.reactivar}
                      </button>
                    ) : null}
                    {sub.status === "activa" || sub.status === "pausada" ? (
                      <button
                        type="button"
                        onClick={() =>
                          setActionModal({ kind: "cancelar", id: sub.id })
                        }
                        className="rounded border bg-destructive/10 px-3 py-1 text-xs hover:bg-destructive/20"
                      >
                        {messages.suscripciones.cancelar}
                      </button>
                    ) : null}
                  </div>
                </div>
                {renovarMut.data ? (
                  <p className="mt-2 rounded bg-secondary/40 p-2 text-xs">
                    {renovarMut.data.idempotent
                      ? messages.suscripciones.renewIdempotent
                      : `${messages.suscripciones.facturacion}: ${renovarMut.data.invoice?.code ?? "(sin borrador)"}`}
                  </p>
                ) : null}
                {(pausarMut.error ??
                  cancelarMut.error ??
                  reactivarMut.error ??
                  renovarMut.error) ? (
                  <p className="mt-2 text-xs text-destructive">
                    {pausarMut.error?.message ??
                      cancelarMut.error?.message ??
                      reactivarMut.error?.message ??
                      renovarMut.error?.message}
                  </p>
                ) : null}
              </header>

              <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
                {(
                  [
                    { key: "history" as const, label: messages.suscripciones.history },
                    { key: "facturacion" as const, label: messages.suscripciones.facturacion },
                    { key: "cobranza" as const, label: messages.suscripciones.cobranza },
                  ]
                ).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={
                      tab === t.key
                        ? "rounded bg-primary px-3 py-1 text-primary-foreground"
                        : "rounded px-3 py-1 text-muted-foreground"
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "history" ? (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[320px] text-sm">
                    <thead className="bg-muted text-left">
                      <tr>
                        <th className="px-3 py-2">Fecha</th>
                        <th className="px-3 py-2">Acción</th>
                        <th className="px-3 py-2">De → A</th>
                        <th className="px-3 py-2">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(history.data?.items ?? []).map((h) => (
                        <tr key={h.id} className="border-t">
                          <td className="px-3 py-2 font-mono text-xs">
                            {new Date(h.createdAt).toISOString().slice(0, 10)}
                          </td>
                          <td className="px-3 py-2">{h.action}</td>
                          <td className="px-3 py-2">
                            {h.fromStatus ?? "∅"} → {h.toStatus}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {h.reason ?? ""}
                          </td>
                        </tr>
                      ))}
                      {(history.data?.items ?? []).length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-3 py-3 text-center text-xs text-muted-foreground"
                          >
                            {messages.suscripciones.noHistory}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {tab === "facturacion" ? (
                <div className="space-y-2">
                  <p className="rounded-md border bg-secondary/30 p-2 text-xs text-muted-foreground">
                    {messages.suscripciones.readOnlyHint}
                  </p>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[320px] text-sm">
                      <thead className="bg-muted text-left">
                        <tr>
                          <th className="px-3 py-2">Código</th>
                          <th className="px-3 py-2">Estado</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th className="px-3 py-2 text-right">Pagado</th>
                          <th className="px-3 py-2">Vence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(facturacion.data?.items ?? []).map((f) => (
                          <tr key={f.invoiceId} className="border-t">
                            <td className="px-3 py-2 font-mono text-xs">{f.code}</td>
                            <td className="px-3 py-2">{f.status}</td>
                            <td className="px-3 py-2 text-right font-mono">
                              {fmt(f.totalCents)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">
                              {fmt(f.paidCents)}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">
                              {typeof f.dueDate === "string"
                                ? f.dueDate
                                : new Date(f.dueDate).toISOString().slice(0, 10)}
                            </td>
                          </tr>
                        ))}
                        {(facturacion.data?.items ?? []).length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-3 py-3 text-center text-xs text-muted-foreground"
                            >
                              {messages.suscripciones.noFacturacion}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {tab === "cobranza" ? (
                <div className="space-y-2">
                  <p className="rounded-md border bg-secondary/30 p-2 text-xs text-muted-foreground">
                    {messages.suscripciones.readOnlyHint}
                  </p>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[320px] text-sm">
                      <thead className="bg-muted text-left">
                        <tr>
                          <th className="px-3 py-2">Fecha</th>
                          <th className="px-3 py-2">Método</th>
                          <th className="px-3 py-2 text-right">Monto</th>
                          <th className="px-3 py-2">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(cobranza.data?.items ?? []).map((p) => (
                          <tr key={p.paymentId} className="border-t">
                            <td className="px-3 py-2 font-mono text-xs">
                              {typeof p.paymentDate === "string"
                                ? p.paymentDate
                                : new Date(p.paymentDate).toISOString().slice(0, 10)}
                            </td>
                            <td className="px-3 py-2">{p.method}</td>
                            <td className="px-3 py-2 text-right font-mono">
                              {fmt(p.amountCents)}
                            </td>
                            <td className="px-3 py-2">{p.status}</td>
                          </tr>
                        ))}
                        {(cobranza.data?.items ?? []).length === 0 ? (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-3 py-3 text-center text-xs text-muted-foreground"
                            >
                              {messages.suscripciones.noCobranza}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>

      {actionModal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={messages.suscripciones.confirmAction}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-md border bg-card p-4 shadow-xl">
            <h2 className="mb-2 text-sm font-bold">
              {actionModal.kind === "pausar"
                ? messages.suscripciones.pausar
                : actionModal.kind === "cancelar"
                  ? messages.suscripciones.cancelar
                  : messages.suscripciones.reactivar}
            </h2>
            <label className="block text-xs">
              {messages.suscripciones.reason}
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={messages.suscripciones.reasonPlaceholder}
                className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm"
                rows={3}
              />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setActionModal(null);
                  setReason("");
                }}
                className="rounded border bg-secondary px-3 py-1 text-xs hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  reason.trim().length < 3 ||
                  pausarMut.isPending ||
                  cancelarMut.isPending ||
                  reactivarMut.isPending
                }
                onClick={() => {
                  if (actionModal.kind === "pausar") {
                    pausarMut.mutate({ id: actionModal.id, reason });
                  } else if (actionModal.kind === "cancelar") {
                    cancelarMut.mutate({ id: actionModal.id, reason });
                  } else {
                    reactivarMut.mutate({ id: actionModal.id, reason });
                  }
                  setActionModal(null);
                  setReason("");
                }}
                className="rounded border bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
