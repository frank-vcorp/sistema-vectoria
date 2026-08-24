"use client";

import * as React from "react";
import Link from "next/link";
import { messages } from "@/shared/utils";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_LABELS: Record<string, string> = {
  pending_deposit: messages.ordenes.pendingDeposit,
  pending_information: messages.ordenes.pendingInformation,
  authorized_to_start: messages.ordenes.authorizedToStart,
  in_execution: messages.ordenes.inExecution,
  delivered: messages.ordenes.delivered,
  closed: messages.ordenes.closed,
  paused: messages.ordenes.paused,
  cancelled: messages.ordenes.cancelled,
};

const TIPO_COBRO_LABELS: Record<string, string> = {
  pago_unico: messages.ordenes.tipoCobro.pagoUnico,
  mensualidades: messages.ordenes.tipoCobro.mensualidades,
  suscripcion: messages.ordenes.tipoCobro.suscripcion,
};

function fmtMXN(cents: number): string {
  return (Math.round(cents) / 100).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  });
}

/**
 * Listado de Órdenes de Servicio (SPEC-004 · AC-8 UI/responsive).
 *
 * Tabla responsive con `overflow-x-auto` + columnas ocultas en móvil
 * (`hidden sm:table-cell` / `hidden md:table-cell`). Filtro libre por
 * código/cliente. Enlaza al detalle por OS.
 */
export function OrdenesList() {
  const [search, setSearch] = React.useState("");
  const list = trpc.ordenServicio.list.useQuery({ limit: 50, offset: 0 });
  const items = React.useMemo(() => list.data?.items ?? [], [list.data]);
  const total = list.data?.total ?? 0;
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((o) =>
      o.code.toLowerCase().includes(q) ||
      o.cotizacionId.toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.ordenes.title}</CardTitle>
        <CardDescription>
          Total: {total} · {messages.ordenes.subtitle}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1">
            <Label htmlFor="ordenes-search">Buscar</Label>
            <Input
              id="ordenes-search"
              placeholder={messages.ordenes.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{messages.ordenes.code}</TableHead>
                <TableHead className="hidden sm:table-cell">
                  {messages.ordenes.client}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {messages.ordenes.tipoCobroLabel}
                </TableHead>
                <TableHead>{messages.ordenes.soldTotal}</TableHead>
                <TableHead>{messages.ordenes.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    {messages.ordenes.empty}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link
                        href={`/ordenes-servicio/${o.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {o.code}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {o.clientId.slice(0, 8)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {TIPO_COBRO_LABELS[o.tipoCobro] ?? o.tipoCobro}
                    </TableCell>
                    <TableCell>{fmtMXN(o.soldTotalCents)}</TableCell>
                    <TableCell>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {STATUS_LABELS[o.status] ?? o.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
