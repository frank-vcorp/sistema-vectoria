"use client";

import * as React from "react";
import { messages } from "@/shared/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ClientesListProps {
  scope: "own" | "all";
}

function statusLabel(status: string): string {
  return status === "archived" ? messages.clientes.archived : messages.clientes.active;
}

/**
 * Listado de clientes. Cumple AC-9 (responsive) y AC-3 (archivado, no
 * eliminación). La creación sólo ocurre desde prospecto calificado
 * (BR-N168); el botón "Crear" abre prompt de prospecto (AC-1).
 */
export function ClientesList({ scope }: ClientesListProps) {
  const [search, setSearch] = React.useState("");
  const utils = trpc.useUtils();
  const query = trpc.clientes.clientes.list.useQuery({
    limit: 50,
    offset: 0,
    ...(search.length > 0 ? { search } : {}),
  });
  const archive = trpc.clientes.clientes.archive.useMutation({
    onSuccess: () => utils.clientes.clientes.list.invalidate(),
  });
  const createFromProspect = trpc.clientes.clientes.createFromProspect.useMutation({
    onSuccess: () => utils.clientes.clientes.list.invalidate(),
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.clientes.title}</CardTitle>
        <CardDescription>
          {scope === "all"
            ? `Total: ${total} (visibilidad: todos)`
            : `Total: ${total}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1">
            <Label htmlFor="clientes-search">Buscar</Label>
            <Input
              id="clientes-search"
              placeholder="Número, nombre o empresa"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              const id =
                typeof window === "undefined"
                  ? ""
                  : window.prompt("UUID del prospecto calificado") ?? "";
              if (id) createFromProspect.mutate({ prospectId: id });
            }}
          >
            {messages.clientes.new}
          </Button>
        </div>

        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">{messages.common.loading}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{messages.clientes.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden md:table-cell">Empresa</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.clientNumber}</TableCell>
                    <TableCell>
                      <a
                        href={`/clientes/${c.id}`}
                        className="underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {c.name}
                      </a>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {c.company ?? "—"}
                    </TableCell>
                    <TableCell>{statusLabel(c.status)}</TableCell>
                    <TableCell className="text-right">
                      {c.status === "active" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={archive.isPending}
                          onClick={() => {
                            const reason =
                              typeof window === "undefined"
                                ? ""
                                : window.prompt(messages.clientes.archiveReason) ?? "";
                            if (reason.length >= 3)
                              archive.mutate({ clientId: c.id, reason });
                          }}
                        >
                          {messages.clientes.archive}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}