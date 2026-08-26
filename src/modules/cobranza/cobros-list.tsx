"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc";
import { messages } from "@/shared/utils";
import { PAYMENT_METHODS, type PaymentMethod } from "@/shared/enums";

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
  const [registerOpen, setRegisterOpen] = React.useState(false);

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
        {/* IMPL-20260825-37 · SPEC-008 AC-1/AC-11 · Alta de cobro
            desde la lista. Completa el camino existente (backend
            `cobros.register`+`confirm` ya operativos). */}
        <button
          type="button"
          onClick={() => setRegisterOpen(true)}
          data-testid="cobros-list-register-open"
          className="rounded-md border bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90"
        >
          {messages.cobranza.new}
        </button>
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
      {registerOpen ? (
        <RegisterCobroDialog onClose={() => setRegisterOpen(false)} />
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

/**
 * IMPL-20260825-37 · SPEC-008 AC-1/AC-11 · Modal responsive para
 * registrar un cobro + aplicarlo a una factura en una sola
 * acción. El backend ya provee `cobros.register` y
 * `cobros.confirm`; esta UI sólo orquesta el camino existente.
 *
 * Submit:
 *  1. `cobranza.cobros.register({ clientId, amountCents, method,
 *     reference?, paymentDate })` → `paymentId`
 *  2. Si (1) responde 2xx, se llama
 *     `cobranza.cobros.confirm({ paymentId, applications:
 *     [{ invoiceId, amountCents }] })`.
 *  3. Sólo tras AMBAS respuestas 2xx se invalida la lista y se
 *     cierra el modal. Si cualquier paso falla, el modal queda
 *     abierto y el error se muestra en `role="alert"`.
 *
 * Validación cliente:
 *  - `clientId` y `invoiceId` son UUIDs válidos (regex).
 *  - `amountCents` se deriva de `amountMXN` (positivos, en
 *    pesos); se convierte a centavos al enviar.
 *  - `paymentDate` formato `YYYY-MM-DD` (default hoy).
 *  - `method` ∈ `PAYMENT_METHODS` (enum cerrado).
 *
 * Errores del backend (incluido "amount > saldo") se
 * proyectan sin filtrar — la UI sólo añade el `role="alert"`.
 */
function RegisterCobroDialog({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const [clientId, setClientId] = React.useState("");
  const [invoiceId, setInvoiceId] = React.useState("");
  const [amountMXN, setAmountMXN] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>(
    PAYMENT_METHODS[0],
  );
  const [reference, setReference] = React.useState("");
  const [paymentDate, setPaymentDate] = React.useState(() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  });
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // UUIDv4 (8-4-4-4-12 hex). Acepta cualquier UUID variante.
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // YYYY-MM-DD.
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;

  const amountCents = (() => {
    const n = Number(amountMXN);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100);
  })();

  const validation = (() => {
    if (!uuidRe.test(clientId)) {
      return messages.cobranza.registerUuidInvalid;
    }
    if (!uuidRe.test(invoiceId)) {
      return messages.cobranza.registerInvoiceRequired;
    }
    if (amountCents === null || amountCents <= 0) {
      return messages.cobranza.registerAmountInvalid;
    }
    if (!dateRe.test(paymentDate)) {
      return messages.cobranza.registerPaymentDateHelp;
    }
    return null;
  })();
  const fieldError = validation;
  const canSubmit = fieldError === null && !submitting;

  const register = trpc.cobranza.cobros.register.useMutation();
  const confirm = trpc.cobranza.cobros.confirm.useMutation();

  async function onSubmit() {
    if (fieldError !== null || amountCents === null || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      // 1) register
      const created = await register.mutateAsync({
        clientId: clientId.trim(),
        amountCents,
        method,
        paymentDate,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
      });
      const paymentId = created.id;
      // 2) confirm con aplicaciones (atómico desde la UI)
      try {
        await confirm.mutateAsync({
          paymentId,
          applications: [{ invoiceId: invoiceId.trim(), amountCents }],
        });
        // Sólo tras AMBAS 2xx cerramos + invalidamos.
        await utils.cobranza.cobros.list.invalidate();
        setRegisterOpen(false);
        onClose();
        return;
      } catch (confirmErr) {
        // El cobro YA está registrado; informamos que la
        // aplicación falló sin fingir éxito.
        const msg =
          confirmErr instanceof Error
            ? confirmErr.message
            : messages.cobranza.empty;
        setSubmitError(`${messages.cobranza.registerSubmitBothError}${msg}`);
      }
    } catch (regErr) {
      const msg =
        regErr instanceof Error ? regErr.message : messages.cobranza.empty;
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // Estado local para evitar el warning de "setRegisterOpen not
  // defined" — usamos onClose para que el padre controle el ciclo.
  function setRegisterOpen(open: boolean) {
    if (!open) onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={messages.cobranza.registerTitle}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      data-testid="cobros-list-register-dialog"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-lg bg-background p-6 shadow-xl sm:rounded-lg">
        <h2 className="mb-1 text-lg font-bold">
          {messages.cobranza.registerTitle}
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          {messages.cobranza.registerAmountHelp}
        </p>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="block text-muted-foreground">
              {messages.cobranza.registerClientId}
            </span>
            <input
              id="cobros-list-register-clientId"
              data-testid="cobros-list-register-clientId"
              value={clientId}
              onChange={(e) => setClientId(e.target.value.trim())}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="mt-1 w-full rounded-md border bg-background px-2 py-1 font-mono"
            />
          </label>
          <label className="block">
            <span className="block text-muted-foreground">
              {messages.cobranza.registerInvoiceId}
            </span>
            <input
              id="cobros-list-register-invoiceId"
              data-testid="cobros-list-register-invoiceId"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value.trim())}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="mt-1 w-full rounded-md border bg-background px-2 py-1 font-mono"
            />
          </label>
          <label className="block">
            <span className="block text-muted-foreground">
              {messages.cobranza.registerAmountMXN}
            </span>
            <input
              id="cobros-list-register-amount"
              data-testid="cobros-list-register-amount"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={amountMXN}
              onChange={(e) => setAmountMXN(e.target.value)}
              placeholder="0.00"
              className="mt-1 w-full rounded-md border bg-background px-2 py-1 font-mono"
            />
          </label>
          <label className="block">
            <span className="block text-muted-foreground">
              {messages.cobranza.method}
            </span>
            <select
              id="cobros-list-register-method"
              data-testid="cobros-list-register-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {messages.cobranza.methodLabel[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-muted-foreground">
              {messages.cobranza.reference}
            </span>
            <input
              id="cobros-list-register-reference"
              data-testid="cobros-list-register-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={messages.cobranza.reference}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1"
            />
          </label>
          <label className="block">
            <span className="block text-muted-foreground">
              {messages.cobranza.paymentDate}
            </span>
            <input
              id="cobros-list-register-paymentDate"
              data-testid="cobros-list-register-paymentDate"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1"
            />
          </label>
          {fieldError !== null ? (
            <p
              role="alert"
              className="text-xs text-destructive"
              data-testid="cobros-list-register-field-error"
            >
              {fieldError}
            </p>
          ) : null}
          {submitError !== null ? (
            <p
              role="alert"
              className="text-xs text-destructive"
              data-testid="cobros-list-register-submit-error"
            >
              {submitError}
            </p>
          ) : null}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            data-testid="cobros-list-register-cancel"
            className="rounded-md border bg-card px-3 py-1 text-sm hover:bg-accent disabled:opacity-50"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            aria-busy={submitting ? true : undefined}
            data-testid="cobros-list-register-submit"
            className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting
              ? messages.cobranza.registerSubmitting
              : messages.cobranza.register}
          </button>
        </div>
      </div>
    </div>
  );
}
