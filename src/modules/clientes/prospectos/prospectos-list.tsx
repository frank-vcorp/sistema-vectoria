"use client";

import * as React from "react";
import { messages } from "@/shared/utils";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ProspectosListProps {
  scope: "own" | "all";
}

function statusLabel(status: string): string {
  const k = status as keyof typeof messages.prospectStatus;
  return (messages.prospectStatus[k] as string) ?? status;
}

function mediumLabel(medium: string | null | undefined): string {
  if (!medium) return "—";
  const k = medium as keyof typeof messages.medios;
  return (messages.medios[k] as string) ?? medium;
}

/**
 * Listado de prospectos. Cumple AC-9 (responsive 375/768/1280) y la
 * visibilidad por rol (AC-6): cuando `scope === "own"` la tabla sólo
 * muestra prospectos asignados al usuario actual (Director/Admin ven
 * todos y reciben `scope: "all"`).
 *
 * La creación/edición vive en `/prospectos/[id]` (detalle + acciones).
 * Esta lista es de lectura y CTA hacia detalle/calificación.
 */
export function ProspectosList({ scope }: ProspectosListProps) {
  const [search, setSearch] = React.useState("");
  const utils = trpc.useUtils();
  const query = trpc.clientes.prospectos.list.useQuery({
    limit: 50,
    offset: 0,
    ...(search.length > 0 ? { search } : {}),
  });
  const qualify = trpc.clientes.prospectos.qualify.useMutation({
    onSuccess: () => utils.clientes.prospectos.list.invalidate(),
  });
  const setLost = trpc.clientes.prospectos.setLost.useMutation({
    onSuccess: () => utils.clientes.prospectos.list.invalidate(),
  });
  const suspend = trpc.clientes.prospectos.setSuspended.useMutation({
    onSuccess: () => utils.clientes.prospectos.list.invalidate(),
  });
  const createClient = trpc.clientes.clientes.createFromProspect.useMutation();

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.prospectos.title}</CardTitle>
        <CardDescription>
          {scope === "all"
            ? `Total: ${total} (visibilidad: todos)`
            : `Total: ${total} (visibilidad: propios)`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="prospectos-search">Buscar</Label>
            <Input
              id="prospectos-search"
              placeholder="Nombre, código o empresa"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">{messages.common.loading}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{messages.prospectos.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{messages.prospectos.code}</TableHead>
                  <TableHead>{messages.prospectos.name}</TableHead>
                  <TableHead className="hidden md:table-cell">
                    {messages.prospectos.company}
                  </TableHead>
                  <TableHead>{messages.prospectos.status}</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {messages.prospectos.medium}
                  </TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.code}</TableCell>
                    <TableCell>
                      <a
                        href={`/prospectos/${p.id}`}
                        className="underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {p.name}
                      </a>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {p.company ?? "—"}
                    </TableCell>
                    <TableCell>{statusLabel(p.status)}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {mediumLabel(p.medium)}
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      {p.status === "calificado" ? null : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={qualify.isPending}
                          onClick={() =>
                            qualify.mutate({
                              prospectId: p.id,
                              // SPEC-003 emite el cuestionario real; mientras
                              // no exista, el servicio rechaza con
                              // QUESTIONNAIRE_REQUIRED. En MVP dejamos un
                              // id dummy para validar el flujo.
                              questionnaireId: "00000000-0000-0000-0000-000000000001",
                            })
                          }
                        >
                          {messages.prospectos.qualify}
                        </Button>
                      )}
                      {p.status === "calificado" ? (
                        <Button
                          size="sm"
                          disabled={createClient.isPending}
                          onClick={() =>
                            createClient.mutate({ prospectId: p.id })
                          }
                        >
                          {messages.prospectos.createClient}
                        </Button>
                      ) : null}
                      {p.status !== "perdido" && p.status !== "suspendido" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={setLost.isPending || suspend.isPending}
                          onClick={() => {
                            const reason =
                              typeof window === "undefined"
                                ? "sin motivo"
                                : window.prompt(messages.prospectos.lostReason) ?? "";
                            if (reason.length >= 3) setLost.mutate({ prospectId: p.id, reason });
                          }}
                        >
                          {messages.prospectos.markLost}
                        </Button>
                      ) : null}
                      {p.status !== "perdido" && p.status !== "suspendido" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={setLost.isPending || suspend.isPending}
                          onClick={() => {
                            const reason =
                              typeof window === "undefined"
                                ? "sin motivo"
                                : window.prompt(messages.prospectos.suspendedReason) ?? "";
                            if (reason.length >= 3)
                              suspend.mutate({ prospectId: p.id, reason });
                          }}
                        >
                          {messages.prospectos.markSuspended}
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