"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc";
import { messages } from "@/shared/utils";

/**
 * Dashboard de Finanzas y Movimientos (SPEC-009). 5 pestañas
 * operables en 3 viewports (DEC-FUN-72):
 *  - Cuentas: alta/listado + saldo vivo (BR-N366).
 *  - Movimientos: CRUD + ciclo `borrador → confirmado → conciliado`.
 *  - Transferencias: create con patas entrada/salida (BR-N326).
 *  - Costos directos: imputación al proyecto (BR-N333).
 *  - Rentabilidad: projectCostSummary + projectFinancialReport
 *    (BR-280/281) y osOutstandingBalance (BR-N249, consumido por
 *    SPEC-004).
 *
 * Banner P-009-1: el catálogo de cuentas es configurable por Frank
 * (P-009-1 cerrado en `none`); no se siembran cuentas seed.
 *
 * Calendario visual como FILTRO (no entidad; DEC-FUN-24).
 */
export default function FinanzasPage() {
  const [tab, setTab] = React.useState<
    "cuentas" | "movimientos" | "transferencias" | "costos" | "rentabilidad"
  >("cuentas");
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{messages.finanzas.title}</h1>
        <p className="text-sm text-muted-foreground">{messages.finanzas.subtitle}</p>
      </header>
      <div className="rounded-md border bg-secondary/30 p-3 text-xs text-muted-foreground">
        {messages.finanzas.gateSeedAccounts}
      </div>
      <div className="overflow-x-auto">
        <div className="inline-flex min-w-full gap-2 border-b">
          {(
            [
              { key: "cuentas" as const, label: messages.finanzas.tabs.cuentas },
              { key: "movimientos" as const, label: messages.finanzas.tabs.movimientos },
              { key: "transferencias" as const, label: messages.finanzas.tabs.transferencias },
              { key: "costos" as const, label: messages.finanzas.tabs.costos },
              { key: "rentabilidad" as const, label: messages.finanzas.tabs.rentabilidad },
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
      {tab === "cuentas" ? <CuentasTab /> : null}
      {tab === "movimientos" ? <MovimientosTab /> : null}
      {tab === "transferencias" ? <TransferenciasTab /> : null}
      {tab === "costos" ? <CostosTab /> : null}
      {tab === "rentabilidad" ? <RentabilidadTab /> : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cuentas
// ─────────────────────────────────────────────────────────────────────────────

function CuentasTab() {
  const utils = trpc.useUtils();
  const list = trpc.finanzas.accounts.list.useQuery({
    limit: 50,
    offset: 0,
    active: true,
  });
  const create = trpc.finanzas.accounts.create.useMutation({
    onSuccess: () => utils.finanzas.accounts.list.invalidate(),
  });
  const balance = trpc.finanzas.finance.accountBalance.useQuery(
    { accountId: "" },
    { enabled: false },
  );
  const [balanceFor, setBalanceFor] = React.useState<string>("");

  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<
    "activo" | "pasivo" | "capital" | "ingreso" | "gasto"
  >("activo");
  const [opening, setOpening] = React.useState(0);

  React.useEffect(() => {
    if (balanceFor) {
      balance.refetch();
    }
  }, [balanceFor]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-md border bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90"
        >
          {messages.finanzas.createAccount}
        </button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">{messages.finanzas.accountName}</th>
              <th className="hidden px-3 py-2 sm:table-cell">{messages.finanzas.accountType}</th>
              <th className="hidden px-3 py-2 sm:table-cell">{messages.finanzas.currency}</th>
              <th className="px-3 py-2 text-right">{messages.finanzas.openingBalance}</th>
              <th className="px-3 py-2">{messages.finanzas.balance}</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                  {messages.finanzas.empty}
                </td>
              </tr>
            ) : null}
            {list.data?.items.map((acc: {
              id: string;
              name: string;
              type: keyof typeof messages.finanzas.accountTypeLabel;
              currency: string;
              openingBalanceCents: number;
            }) => (
              <tr key={acc.id} className="border-t">
                <td className="px-3 py-2">{acc.name}</td>
                <td className="hidden px-3 py-2 sm:table-cell">{messages.finanzas.accountTypeLabel[acc.type] ?? acc.type}</td>
                <td className="hidden px-3 py-2 sm:table-cell">{acc.currency}</td>
                <td className="px-3 py-2 text-right font-mono">${(acc.openingBalanceCents / 100).toFixed(2)}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setBalanceFor(acc.id)}
                    className="rounded-md border bg-card px-2 py-1 text-xs hover:bg-accent"
                  >
                    Ver saldo
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {balanceFor && balance.data ? (
        <div className="rounded-md border bg-card p-4 text-sm">
          <h3 className="mb-2 font-bold">{messages.finanzas.balance}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={messages.finanzas.accountBalance.opening} value={balance.data.openingCents} />
            <Stat label={messages.finanzas.accountBalance.ingresos} value={balance.data.ingresosCents} />
            <Stat label={messages.finanzas.accountBalance.gastos} value={balance.data.gastosCents} />
            <Stat
              label={messages.finanzas.accountBalance.transferenciasIn}
              value={balance.data.transferenciasInCents}
            />
            <Stat
              label={messages.finanzas.accountBalance.transferenciasOut}
              value={balance.data.transferenciasOutCents}
            />
            <Stat label={messages.finanzas.accountBalance.capitalIn} value={balance.data.capitalInCents} />
            <Stat label={messages.finanzas.accountBalance.capitalOut} value={balance.data.capitalOutCents} />
            <Stat label={messages.finanzas.balance} value={balance.data.balanceCents} bold />
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={messages.finanzas.createAccount}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
        >
          <div className="w-full max-w-md rounded-t-lg bg-background p-6 shadow-xl sm:rounded-lg">
            <h2 className="mb-4 text-lg font-bold">{messages.finanzas.createAccount}</h2>
            <div className="space-y-3 text-sm">
              <label className="block">
                <span className="block text-muted-foreground">{messages.finanzas.accountName}</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background px-2 py-1"
                />
              </label>
              <label className="block">
                <span className="block text-muted-foreground">{messages.finanzas.accountType}</span>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as typeof type)}
                  className="mt-1 w-full rounded-md border bg-background px-2 py-1"
                >
                  {(["activo", "pasivo", "capital", "ingreso", "gasto"] as const).map((t) => (
                    <option key={t} value={t}>
                      {messages.finanzas.accountTypeLabel[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-muted-foreground">{messages.finanzas.openingBalance}</span>
                <input
                  type="number"
                  value={opening}
                  onChange={(e) => setOpening(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border bg-background px-2 py-1"
                />
              </label>
              {create.error ? (
                <p className="text-xs text-destructive">{String(create.error.message)}</p>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-md border bg-card px-3 py-1 text-sm hover:bg-accent"
              >
                Cerrar
              </button>
              <button
                type="button"
                disabled={create.isPending || name.length === 0}
                onClick={() =>
                  create.mutate({
                    name,
                    type,
                    openingBalanceCents: opening,
                    currency: "MXN",
                  })
                }
                className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {messages.finanzas.createAccount}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, bold, neutral }: { label: string; value: number; bold?: boolean; neutral?: boolean }) {
  return (
    <div className="rounded-md border bg-background p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-mono ${bold ? "font-bold" : ""} ${neutral ? "text-muted-foreground" : ""}`}>
        {neutral ? "—" : `$${(value / 100).toFixed(2)}`}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Movimientos
// ─────────────────────────────────────────────────────────────────────────────

function MovimientosTab() {
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [typeFilter, setTypeFilter] = React.useState<string>("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const list = trpc.finanzas.transactions.list.useQuery({
    limit: 50,
    offset: 0,
    ...(statusFilter ? { status: statusFilter as never } : {}),
    ...(typeFilter ? { type: typeFilter as never } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  });
  const utils = trpc.useUtils();
  const confirm = trpc.finanzas.transactions.confirm.useMutation({
    onSuccess: () => utils.finanzas.transactions.list.invalidate(),
  });
  const reconcile = trpc.finanzas.transactions.reconcile.useMutation({
    onSuccess: () => utils.finanzas.transactions.list.invalidate(),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          <option value="">— status —</option>
          {(["borrador", "confirmado", "conciliado", "cancelado", "reversado"] as const).map((s) => (
            <option key={s} value={s}>{messages.finanzas.statusLabel[s]}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          <option value="">— type —</option>
          {(["ingreso", "gasto", "transferencia", "capital"] as const).map((t) => (
            <option key={t} value={t}>{messages.finanzas.transactionTypeLabel[t]}</option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        />
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">{messages.finanzas.operationDate}</th>
              <th className="hidden px-3 py-2 sm:table-cell">{messages.finanzas.account}</th>
              <th className="px-3 py-2">{messages.finanzas.type}</th>
              <th className="hidden px-3 py-2 md:table-cell">{messages.finanzas.subKind}</th>
              <th className="px-3 py-2 text-right">{messages.finanzas.amount}</th>
              <th className="px-3 py-2">{messages.finanzas.status}</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">
                  {messages.finanzas.empty}
                </td>
              </tr>
            ) : null}
            {list.data?.items.map((t: {
              id: string;
              operationDate: string;
              accountId: string;
              type: keyof typeof messages.finanzas.transactionTypeLabel;
              subKind: string | null;
              amountCents: number;
              status: keyof typeof messages.finanzas.statusLabel;
            }) => (
              <tr key={t.id} className="border-t">
                <td className="px-3 py-2 font-mono">{t.operationDate}</td>
                <td className="hidden px-3 py-2 sm:table-cell font-mono text-xs">{t.accountId.slice(0, 8)}</td>
                <td className="px-3 py-2">{messages.finanzas.transactionTypeLabel[t.type] ?? t.type}</td>
                <td className="hidden px-3 py-2 md:table-cell font-mono text-xs">
                  {t.subKind ?? "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono">${(t.amountCents / 100).toFixed(2)}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{messages.finanzas.statusLabel[t.status]}</span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {t.status === "borrador" ? (
                      <button
                        type="button"
                        onClick={() => confirm.mutate({ transactionId: t.id })}
                        disabled={confirm.isPending}
                        className="rounded-md border bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {messages.finanzas.confirm}
                      </button>
                    ) : null}
                    {t.status === "confirmado" ? (
                      <button
                        type="button"
                        onClick={() => reconcile.mutate({ transactionId: t.id })}
                        disabled={reconcile.isPending}
                        className="rounded-md border bg-card px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                      >
                        {messages.finanzas.reconcile}
                      </button>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      {t.status === "conciliado" ? messages.finanzas.reconcileImmut.split(".")[0] : ""}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Transferencias
// ─────────────────────────────────────────────────────────────────────────────

function TransferenciasTab() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="space-y-4">
      <p className="rounded-md border bg-secondary/30 p-3 text-xs text-muted-foreground">
        {messages.finanzas.classificationNote}
      </p>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90"
        >
          {messages.finanzas.transfer}
        </button>
      </div>
      {open ? <CreateTransferDialog onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function CreateTransferDialog({ onClose }: { onClose: () => void }) {
  const [fromAccountId, setFromAccountId] = React.useState("");
  const [toAccountId, setToAccountId] = React.useState("");
  const [amountCents, setAmountCents] = React.useState(0);
  const [operationDate, setOperationDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = React.useState("");
  const utils = trpc.useUtils();
  const create = trpc.finanzas.transfers.create.useMutation({
    onSuccess: () => {
      utils.finanzas.transactions.list.invalidate();
      onClose();
    },
  });
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={messages.finanzas.transfer}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div className="w-full max-w-md rounded-t-lg bg-background p-6 shadow-xl sm:rounded-lg">
        <h2 className="mb-4 text-lg font-bold">{messages.finanzas.transfer}</h2>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="block text-muted-foreground">{messages.finanzas.transferFrom} (UUID)</span>
            <input
              value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1 font-mono"
            />
          </label>
          <label className="block">
            <span className="block text-muted-foreground">{messages.finanzas.transferTo} (UUID)</span>
            <input
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1 font-mono"
            />
          </label>
          <label className="block">
            <span className="block text-muted-foreground">{messages.finanzas.amount}</span>
            <input
              type="number"
              value={amountCents}
              onChange={(e) => setAmountCents(Number(e.target.value))}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1"
            />
          </label>
          <label className="block">
            <span className="block text-muted-foreground">{messages.finanzas.operationDate}</span>
            <input
              type="date"
              value={operationDate}
              onChange={(e) => setOperationDate(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1"
            />
          </label>
          <label className="block">
            <span className="block text-muted-foreground">{messages.finanzas.transferNote}</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1"
            />
          </label>
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
            disabled={
              create.isPending ||
              fromAccountId === "" ||
              toAccountId === "" ||
              fromAccountId === toAccountId ||
              amountCents <= 0
            }
            onClick={() =>
              create.mutate({
                fromAccountId,
                toAccountId,
                amountCents,
                operationDate,
                ...(note ? { note } : {}),
              })
            }
            className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {messages.finanzas.create}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Costos directos
// ─────────────────────────────────────────────────────────────────────────────

function CostosTab() {
  const [open, setOpen] = React.useState(false);
  const list = trpc.finanzas.directCosts.list.useQuery({ limit: 50, offset: 0 });
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90"
        >
          {messages.finanzas.impute}
        </button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">{messages.finanzas.project}</th>
              <th className="hidden px-3 py-2 sm:table-cell">{messages.finanzas.linkedTx}</th>
              <th className="px-3 py-2 text-right">{messages.finanzas.amount}</th>
              <th className="hidden px-3 py-2 md:table-cell">{messages.finanzas.confirmedOrConciliated}</th>
              <th className="hidden px-3 py-2 md:table-cell">{messages.finanzas.description}</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                  {messages.finanzas.empty}
                </td>
              </tr>
            ) : null}
            {list.data?.items.map((c: {
              id: string;
              projectId: string;
              transactionId: string;
              amountCents: number;
              confirmedOrConciliated: string;
              description: string | null;
            }) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{c.projectId.slice(0, 8)}</td>
                <td className="hidden px-3 py-2 sm:table-cell font-mono text-xs">{c.transactionId.slice(0, 8)}</td>
                <td className="px-3 py-2 text-right font-mono">${(c.amountCents / 100).toFixed(2)}</td>
                <td className="hidden px-3 py-2 md:table-cell">{c.confirmedOrConciliated}</td>
                <td className="hidden px-3 py-2 md:table-cell">{c.description ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open ? <ImputeDialog onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function ImputeDialog({ onClose }: { onClose: () => void }) {
  const [projectId, setProjectId] = React.useState("");
  const [transactionId, setTransactionId] = React.useState("");
  const [description, setDescription] = React.useState("");
  const utils = trpc.useUtils();
  const impute = trpc.finanzas.directCosts.impute.useMutation({
    onSuccess: () => {
      utils.finanzas.directCosts.list.invalidate();
      onClose();
    },
  });
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={messages.finanzas.impute}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div className="w-full max-w-md rounded-t-lg bg-background p-6 shadow-xl sm:rounded-lg">
        <h2 className="mb-4 text-lg font-bold">{messages.finanzas.imputeToProject}</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          {messages.finanzas.classificationNote}
        </p>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="block text-muted-foreground">{messages.finanzas.project} (UUID)</span>
            <input
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1 font-mono"
            />
          </label>
          <label className="block">
            <span className="block text-muted-foreground">{messages.finanzas.linkedTx} (UUID)</span>
            <input
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1 font-mono"
            />
          </label>
          <label className="block">
            <span className="block text-muted-foreground">{messages.finanzas.description}</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1"
            />
          </label>
          {impute.error ? (
            <p className="text-xs text-destructive">{String(impute.error.message)}</p>
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
            disabled={impute.isPending || !projectId || !transactionId}
            onClick={() =>
              impute.mutate({
                projectId,
                transactionId,
                ...(description ? { description } : {}),
              })
            }
            className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {messages.finanzas.impute}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rentabilidad
// ─────────────────────────────────────────────────────────────────────────────

function RentabilidadTab() {
  const [projectId, setProjectId] = React.useState("");
  const cost = trpc.finanzas.finance.projectCostSummary.useQuery(
    { projectId },
    { enabled: false },
  );
  const report = trpc.finanzas.finance.projectFinancialReport.useQuery(
    { projectId },
    { enabled: false },
  );
  const handleCompute = () => {
    cost.refetch();
    report.refetch();
  };
  return (
    <div className="space-y-4">
      <p className="rounded-md border bg-secondary/30 p-3 text-xs text-muted-foreground">
        {messages.finanzas.osOutstandingNote}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          placeholder="project UUID"
          className="rounded-md border bg-background px-2 py-1 font-mono text-sm flex-1"
        />
        <button
          type="button"
          onClick={handleCompute}
          disabled={!projectId}
          className="rounded-md border bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Calcular
        </button>
      </div>
      {cost.data ? (
        <div className="rounded-md border bg-card p-4 text-sm">
          <h3 className="mb-2 font-bold">Costo total / margen</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={messages.finanzas.labor} value={cost.data.laborCostCents} />
            <Stat label={messages.finanzas.direct} value={cost.data.directCostCents} />
            <Stat label={messages.finanzas.total} value={cost.data.totalCostCents} bold />
            <Stat
              label={messages.finanzas.margin}
              value={cost.data.marginCents ?? 0}
              neutral={cost.data.marginCents === null}
            />
          </div>
          <h4 className="mt-4 mb-2 font-bold">{messages.finanzas.byTechnician}</h4>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-3 py-2">{messages.finanzas.techId}</th>
                  <th className="px-3 py-2 text-right">{messages.finanzas.hours}</th>
                  <th className="px-3 py-2 text-right">{messages.finanzas.cost}</th>
                  <th className="px-3 py-2 text-right">{messages.finanzas.marginPartial}</th>
                </tr>
              </thead>
              <tbody>
                {cost.data.byTechnician.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                      {messages.finanzas.empty}
                    </td>
                  </tr>
                ) : null}
                {cost.data.byTechnician.map((t: {
                  userId: string;
                  hoursTotal: number;
                  costCents: number;
                  marginCents: number | null;
                }) => (
                  <tr key={t.userId} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{t.userId.slice(0, 8)}</td>
                    <td className="px-3 py-2 text-right font-mono">{t.hoursTotal.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">${(t.costCents / 100).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {t.marginCents === null ? "—" : `$${(t.marginCents / 100).toFixed(2)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {report.data ? (
        <div className="rounded-md border bg-card p-4 text-sm">
          <h3 className="mb-2 font-bold">Reporte (BR-015)</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={messages.finanzas.sold} value={report.data.soldTotalCents} />
            <Stat label={messages.finanzas.invoiced} value={report.data.invoicedTotalCents} />
            <Stat label={messages.finanzas.collected} value={report.data.collectedTotalCents} />
            <Stat label={messages.finanzas.outstanding} value={report.data.outstandingBalanceCents} bold />
          </div>
        </div>
      ) : null}
    </div>
  );
}
