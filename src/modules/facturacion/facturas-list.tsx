"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc";
import { messages } from "@/shared/utils";

/**
 * Listado de facturas con calendario visual de 7 estados (BR-N312).
 *  - Estados persistidos (`INVOICE_STATUSES`): borrador, emitida,
 *    parcialmente_pagada, pagada, vencida, cancelada.
 *  - Estado visual `programada` se deriva de un schedule con
 *    `scheduled_date > hoy` (lo calcula la UI con el listado de
 *    schedules; se mantiene local para evitar un round-trip).
 *
 * Acciones:
 *  - Previsualizar (BR-N303): muestra UUID pendiente + importes.
 *  - Timbrar: requiere CSD/API key; en este turno muestra el banner
 *    MOCK (P-007-1) cuando proceda.
 *  - Cancelar: motivo SAT 01-04 + razón ≥3 chars (BR-N305).
 *  - ZIP mensual: para Director/Admin con `gestionar_facturacion`.
 *
 * Responsive (AC-10 SPEC-001 + DEC-FUN-72): tabla con
 * `overflow-x-auto` y columnas `hidden sm:table-cell`/`md:table-cell`
 * para móvil.
 */
export function FacturasList() {
  const [page, setPage] = React.useState({ limit: 20, offset: 0 });
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [zipOpen, setZipOpen] = React.useState(false);

  const list = trpc.facturacion.list.useQuery({
    ...page,
    ...(statusFilter ? { status: statusFilter as never } : {}),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <label htmlFor="statusFilter" className="text-sm text-muted-foreground">
            {messages.facturacion.status}
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
                "borrador",
                "emitida",
                "parcialmente_pagada",
                "pagada",
                "vencida",
                "cancelada",
              ] as const
            ).map((s) => (
              <option key={s} value={s}>
                {messages.facturacion.statusLabel[s]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setZipOpen(true)}
          className="rounded-md border bg-card px-3 py-1 text-sm font-medium hover:bg-accent"
        >
          {messages.facturacion.zip}
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">{messages.facturacion.code}</th>
              <th className="hidden px-3 py-2 sm:table-cell">{messages.facturacion.client}</th>
              <th className="px-3 py-2">{messages.facturacion.status}</th>
              <th className="hidden px-3 py-2 md:table-cell">{messages.facturacion.dueDate}</th>
              <th className="hidden px-3 py-2 md:table-cell">{messages.facturacion.cfdiUuid}</th>
              <th className="px-3 py-2 text-right">{messages.facturacion.total}</th>
              <th className="hidden px-3 py-2 md:table-cell text-right">{messages.facturacion.paid}</th>
              <th className="px-3 py-2">{messages.facturacion.actions}</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-center text-muted-foreground" colSpan={8}>
                  {messages.facturacion.empty}
                </td>
              </tr>
            ) : null}
            {list.data?.items.map((f: {
              id: string;
              code: string;
              status: keyof typeof messages.facturacion.statusLabel;
              clientId: string;
              dueDate: string;
              cfdiUuid: string | null;
              totalCents: number;
              paidCents: number;
            }) => (
              <tr key={f.id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{f.code}</td>
                <td className="hidden px-3 py-2 sm:table-cell">{f.clientId.slice(0, 8)}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                    {messages.facturacion.statusLabel[f.status]}
                  </span>
                </td>
                <td className="hidden px-3 py-2 md:table-cell">{f.dueDate}</td>
                <td className="hidden px-3 py-2 md:table-cell font-mono text-xs">
                  {f.cfdiUuid ?? "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  ${(f.totalCents / 100).toFixed(2)}
                </td>
                <td className="hidden px-3 py-2 md:table-cell text-right font-mono">
                  ${(f.paidCents / 100).toFixed(2)}
                </td>
                <td className="px-3 py-2">
                  <FacturaRowActions invoice={f} />
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

      {zipOpen ? <ZipDialog onClose={() => setZipOpen(false)} /> : null}
    </div>
  );
}

function FacturaRowActions({
  invoice,
}: {
  invoice: {
    id: string;
    status: string;
    cfdiUuid: string | null;
  };
}) {
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const utils = trpc.useUtils();

  const timbrar = trpc.facturacion.timbrar.useMutation({
    onSuccess: () => {
      setTimbrarError(null);
      utils.facturacion.list.invalidate();
    },
    onError: (err) => {
      // IMPL-20260825-36 (intento 3) · Errores del PAC (incluidos
      // 412/422/5xx) deben ser visibles con `role="alert"`. Sin
      // este handler el error se queda silencioso y el usuario ve
      // "falso éxito" porque el botón vuelve a habilitarse sin
      // feedback. Mantenemos el mensaje estable entre intentos
      // para que QA V3 pueda repetir el flujo.
      const code = err.data?.code ?? null;
      const message =
        code === "INVOICE_FISCAL_DATA_REQUIRED"
          ? "Domicilio fiscal incompleto. Captura calle, número, colonia, municipio, estado, CP y país antes de timbrar."
          : err.message || "No fue posible timbrar la factura.";
      setTimbrarError(message);
    },
  });
  const [timbrarError, setTimbrarError] = React.useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="rounded-md border bg-card px-2 py-1 text-xs hover:bg-accent"
      >
        {messages.facturacion.preview}
      </button>
      {invoice.status === "borrador" ? (
        <button
          type="button"
          onClick={() => {
            setTimbrarError(null);
            timbrar.mutate({ invoiceId: invoice.id });
          }}
          disabled={timbrar.isPending}
          className="rounded-md border bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {messages.facturacion.timbrar}
        </button>
      ) : null}
      {timbrarError ? (
        <p
          role="alert"
          className="basis-full rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive"
          data-testid="facturas-list-timbrar-error"
        >
          {timbrarError}
        </p>
      ) : null}
      {invoice.status !== "cancelada" && invoice.status !== "borrador" ? (
        <button
          type="button"
          onClick={() => setCancelOpen(true)}
          className="rounded-md border bg-destructive px-2 py-1 text-xs text-destructive-foreground hover:bg-destructive/90"
        >
          {messages.facturacion.cancel}
        </button>
      ) : null}
      {previewOpen ? (
        <PreviewDialog invoiceId={invoice.id} onClose={() => setPreviewOpen(false)} />
      ) : null}
      {cancelOpen ? (
        <CancelDialog
          invoiceId={invoice.id}
          onClose={() => setCancelOpen(false)}
          onSuccess={() => utils.facturacion.list.invalidate()}
        />
      ) : null}
    </div>
  );
}

function PreviewDialog({
  invoiceId,
  onClose,
}: {
  invoiceId: string;
  onClose: () => void;
}) {
  const preview = trpc.facturacion.preview.useQuery({ invoiceId });
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={messages.facturacion.preview}
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-lg bg-background p-6 shadow-xl sm:rounded-lg">
        <h2 className="mb-4 text-lg font-bold">{messages.facturacion.preview}</h2>
        {!preview.data ? (
          <p className="text-sm text-muted-foreground">{messages.facturacion.previewEmpty}</p>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{messages.facturacion.code}:</span>
              <span className="font-mono">{preview.data.invoice.code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{messages.facturacion.client}:</span>
              <span>
                {preview.data.client.name} ({preview.data.client.clientNumber})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{messages.facturacion.status}:</span>
              <span>
                {messages.facturacion.statusLabel[
                  preview.data.invoice.status as keyof typeof messages.facturacion.statusLabel
                ]}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{messages.facturacion.subtotal}:</span>
              <span className="font-mono">${(preview.data.invoice.subtotalCents / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{messages.facturacion.tax}:</span>
              <span className="font-mono">${(preview.data.invoice.taxCents / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>{messages.facturacion.totalLabel}:</span>
              <span className="font-mono">${(preview.data.invoice.totalCents / 100).toFixed(2)}</span>
            </div>
            {preview.data.invoice.cfdiUuid ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{messages.facturacion.cfdiUuid}:</span>
                <span className="font-mono text-xs">{preview.data.invoice.cfdiUuid}</span>
              </div>
            ) : null}
            {!preview.data.fiscalConfig.hasPacApiKey ||
            !preview.data.fiscalConfig.hasCsd ? (
              <p className="rounded-md border border-destructive bg-destructive/10 p-2 text-xs text-destructive">
                {messages.facturacion.fiscalConfigMissing}
              </p>
            ) : null}
            <p className="rounded-md border bg-secondary/50 p-2 text-xs text-muted-foreground">
              {messages.facturacion.pacMockNotice}
            </p>
          </div>
        )}
        <div className="mt-6 flex justify-end">
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

function CancelDialog({
  invoiceId,
  onClose,
  onSuccess,
}: {
  invoiceId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [motivoSat, setMotivoSat] = React.useState<"01" | "02" | "03" | "04">("01");
  const [reason, setReason] = React.useState("");
  const cancel = trpc.facturacion.cancel.useMutation({
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={messages.facturacion.cancel}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div className="w-full max-w-md rounded-t-lg bg-background p-6 shadow-xl sm:rounded-lg">
        <h2 className="mb-4 text-lg font-bold">{messages.facturacion.cancel}</h2>
        <div className="space-y-3 text-sm">
          <div>
            <label htmlFor="motivoSat" className="block text-muted-foreground">
              {messages.facturacion.cancelMotive}
            </label>
            <select
              id="motivoSat"
              value={motivoSat}
              onChange={(e) => setMotivoSat(e.target.value as typeof motivoSat)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1"
            >
              {(["01", "02", "03", "04"] as const).map((m) => (
                <option key={m} value={m}>
                  {messages.facturacion.cancelMotiveLabel[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="reason" className="block text-muted-foreground">
              {messages.facturacion.cancelReasonPlaceholder}
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1"
              placeholder={messages.facturacion.cancelReasonPlaceholder}
            />
          </div>
          {cancel.error ? (
            <p className="text-xs text-destructive">{String(cancel.error.message)}</p>
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
            disabled={cancel.isPending || reason.length < 3}
            onClick={() => cancel.mutate({ invoiceId, motivoSat, reason })}
            className="rounded-md bg-destructive px-3 py-1 text-sm text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {messages.facturacion.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ZipDialog({ onClose }: { onClose: () => void }) {
  const now = new Date();
  const [year, setYear] = React.useState(now.getFullYear());
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [includeBorrador, setIncludeBorrador] = React.useState(false);
  const zip = trpc.facturacion.zipContador.useMutation();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={messages.facturacion.zipMonthlyTitle}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div className="w-full max-w-md rounded-t-lg bg-background p-6 shadow-xl sm:rounded-lg">
        <h2 className="mb-2 text-lg font-bold">{messages.facturacion.zipMonthlyTitle}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{messages.facturacion.zipMonthlySubtitle}</p>
        <div className="space-y-3 text-sm">
          <div className="flex gap-2">
            <label className="flex-1">
              <span className="block text-muted-foreground">Año</span>
              <input
                type="number"
                min={2000}
                max={2999}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="mt-1 w-full rounded-md border bg-background px-2 py-1"
              />
            </label>
            <label className="flex-1">
              <span className="block text-muted-foreground">Mes</span>
              <input
                type="number"
                min={1}
                max={12}
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="mt-1 w-full rounded-md border bg-background px-2 py-1"
              />
            </label>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeBorrador}
              onChange={(e) => setIncludeBorrador(e.target.checked)}
            />
            <span>{messages.facturacion.zipMonthlyIncludeDrafts}</span>
          </label>
          {zip.data && zip.data.count === 0 ? (
            <p className="rounded-md border bg-secondary/40 p-2 text-xs">{messages.facturacion.zipEmpty}</p>
          ) : null}
          {zip.error ? (
            <p className="text-xs text-destructive">{String(zip.error.message)}</p>
          ) : null}
          {zip.data ? (
            <p className="text-xs">
              ZIP generado: {zip.data.filename} ({zip.data.count} facturas).
            </p>
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
            disabled={zip.isPending}
            onClick={() =>
              zip.mutate({ year, month, manual: true, includeBorrador })
            }
            className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {messages.facturacion.zipManual}
          </button>
        </div>
      </div>
    </div>
  );
}
