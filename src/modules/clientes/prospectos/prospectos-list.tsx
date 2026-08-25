"use client";

import * as React from "react";
import { messages } from "@/shared/utils";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProspectoForm } from "./prospecto-form";

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
 * Listado de prospectos (SPEC-002). Cumple AC-9 (responsive 375/768/1280)
 * y la visibilidad por rol (AC-6): cuando `scope === "own"` la tabla sólo
 * muestra prospectos asignados al usuario actual (Director/Admin ven
 * todos y reciben `scope: "all"`).
 *
 * El alta se realiza con el formulario `ProspectoForm` (Dialog). Las
 * acciones de calificación/pérdida/suspensión/reactivación se ejecutan
 * desde el detalle `/prospectos/[id]` para mantener contexto y evitar
 * solapamiento de Dialogs en la lista (cumple SPEC-002 §4.2; el
 * formulario de calificación real vive en SPEC-003 y aún no expone
 * cuestionarios por prospecto — ver IMPL-REPORT / SPEC-GAP).
 */
export function ProspectosList({ scope }: ProspectosListProps) {
  const [search, setSearch] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const utils = trpc.useUtils();
  const query = trpc.clientes.prospectos.list.useQuery({
    limit: 50,
    offset: 0,
    ...(search.length > 0 ? { search } : {}),
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>{messages.prospectos.title}</CardTitle>
              <CardDescription>
                {scope === "all"
                  ? `Total: ${total} (visibilidad: todos)`
                  : `Total: ${total} (visibilidad: propios)`}
              </CardDescription>
            </div>
            <Button
              onClick={() => setFormOpen(true)}
              data-testid="prospectos-new-button"
              className="shrink-0"
            >
              {messages.prospectos.new}
            </Button>
          </div>
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
            <p className="text-sm text-muted-foreground">
              {messages.common.loading}
            </p>
          ) : items.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="prospectos-empty"
            >
              {messages.prospectos.empty}
            </p>
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
                      <TableCell className="text-right">
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="text-xs"
                        >
                          <a href={`/prospectos/${p.id}`}>Abrir</a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ProspectoForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreated={() => {
          // La invalidación del listado la hace `ProspectoForm` en onSuccess.
          void utils.clientes.prospectos.list.invalidate();
        }}
      />
    </>
  );
}