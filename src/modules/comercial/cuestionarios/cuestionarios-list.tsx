"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { messages } from "@/shared/utils";

/**
 * Listado de cuestionarios publicados (SPEC-003 B4).
 * Cumple AC-10 (responsive 375/768/1280).
 */
export function CuestionariosList() {
  const query = trpc.comercial.cuestionarios.list.useQuery();
  const items = query.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.cuestionarios.title}</CardTitle>
        <CardDescription>
          {messages.cuestionarios.subtitle} · {items.length}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">{messages.common.loading}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{messages.cuestionarios.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{messages.cuestionarios.code}</TableHead>
                  <TableHead>{messages.cuestionarios.name}</TableHead>
                  <TableHead className="hidden sm:table-cell">{messages.cuestionarios.type}</TableHead>
                  <TableHead>{messages.cuestionarios.status}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono text-xs">{q.code}</TableCell>
                    <TableCell>
                      <a
                        href={`/comercial/cuestionarios/${q.id}`}
                        className="underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {q.name}
                      </a>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{q.type}</TableCell>
                    <TableCell>
                      <span
                        className={
                          q.status === "published"
                            ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700"
                            : "rounded-full bg-muted px-2 py-0.5 text-xs"
                        }
                      >
                        {q.status}
                      </span>
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
