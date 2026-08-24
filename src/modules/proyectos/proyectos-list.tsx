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

const STAGE_LABELS: Record<string, string> = {
  planning: messages.proyectos.stageLabel.planning,
  development: messages.proyectos.stageLabel.development,
  testing: messages.proyectos.stageLabel.testing,
  client_validation: messages.proyectos.stageLabel.client_validation,
  delivery: messages.proyectos.stageLabel.delivery,
};

const SITUATION_LABELS: Record<string, string> = {
  pending: messages.proyectos.situationLabel.pending,
  active: messages.proyectos.situationLabel.active,
  paused: messages.proyectos.situationLabel.paused,
  completed: messages.proyectos.situationLabel.completed,
  cancelled: messages.proyectos.situationLabel.cancelled,
};

const HEALTH_LABELS: Record<string, string> = {
  on_track: messages.proyectos.healthLabel.on_track,
  at_risk: messages.proyectos.healthLabel.at_risk,
  delayed: messages.proyectos.healthLabel.delayed,
};

/**
 * Listado de Proyectos (SPEC-005 · AC-10 UI/responsive).
 *
 * Tabla responsive con `overflow-x-auto` + columnas ocultas en móvil
 * (`hidden sm:table-cell` / `hidden md:table-cell`). Filtro libre por
 * código / OS / cliente.
 */
export function ProyectosList() {
  const [search, setSearch] = React.useState("");
  const list = trpc.proyectos.list.useQuery({ limit: 50, offset: 0 });
  const items = React.useMemo(() => list.data?.items ?? [], [list.data]);
  const total = list.data?.total ?? 0;
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (p) =>
        p.code.toLowerCase().includes(q) ||
        p.orderId.toLowerCase().includes(q) ||
        p.clientId.toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.proyectos.title}</CardTitle>
        <CardDescription>
          Total: {total} · {messages.proyectos.subtitle}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1">
            <Label htmlFor="proyectos-search">Buscar</Label>
            <Input
              id="proyectos-search"
              placeholder={messages.proyectos.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{messages.proyectos.code}</TableHead>
                <TableHead className="hidden sm:table-cell">
                  {messages.proyectos.client}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {messages.proyectos.order}
                </TableHead>
                <TableHead>{messages.proyectos.stage}</TableHead>
                <TableHead className="hidden sm:table-cell">
                  {messages.proyectos.situation}
                </TableHead>
                <TableHead>{messages.proyectos.health}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    {messages.proyectos.empty}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        href={`/proyectos/${p.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {p.code}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {p.clientId.slice(0, 8)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {p.orderId.slice(0, 8)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {STAGE_LABELS[p.statusStage] ?? p.statusStage}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {SITUATION_LABELS[p.statusSituation] ?? p.statusSituation}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          p.health === "delayed"
                            ? "rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-900"
                            : p.health === "at_risk"
                              ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900"
                              : "rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-900"
                        }
                      >
                        {HEALTH_LABELS[p.health] ?? p.health}
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