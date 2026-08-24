"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { messages } from "@/shared/utils";

/**
 * Listado de cotizaciones. Cumple AC-10 (responsive 375/768/1280).
 */
export function CotizacionesList() {
  const query = trpc.comercial.cotizaciones.listForProspect.useQuery(
    {
      prospectId: "00000000-0000-0000-0000-000000000fff", // placeholder UI vacía; el router real filtra por prospecto
    },
    { retry: false },
  );
  // En MVP, la lista global por prospecto requiere seleccionar uno.
  // Mostramos mensaje neutro y CTA para crear desde prospecto.
  const items = (query.data as Array<{ id: string; code: string; status: string; totalCents: number }> | undefined) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.cotizaciones.title}</CardTitle>
        <CardDescription>{messages.cotizaciones.subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {messages.cotizaciones.intro}
        </p>
        {items.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{messages.cotizaciones.code}</TableHead>
                  <TableHead>{messages.cotizaciones.status}</TableHead>
                  <TableHead className="text-right">{messages.cotizaciones.total}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono text-xs">
                      <a
                        href={`/comercial/cotizaciones/${q.id}`}
                        className="underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {q.code}
                      </a>
                    </TableCell>
                    <TableCell>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {q.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{Math.round(q.totalCents / 100).toLocaleString("es-MX", { style: "currency", currency: "MXN" })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
