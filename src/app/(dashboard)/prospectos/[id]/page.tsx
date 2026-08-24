"use client";

import * as React from "react";
import Link from "next/link";
import { messages } from "@/shared/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Detalle de prospecto. Carga por id; si la visibilidad (AC-6) no
 * permite verlo, el servicio responde `PROSPECT_NOT_FOUND` y mostramos
 * mensaje neutro (no exponer existencia cross-rol).
 */
export default function ProspectoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const query = trpc.clientes.prospectos.byId.useQuery({ prospectId: id });

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">{messages.common.loading}</p>;
  }
  if (query.error || !query.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{messages.errors.notFound}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/prospectos">{messages.common.back}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  const p = query.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{p.name}</CardTitle>
        <CardDescription>
          {p.code} · {(messages.prospectStatus as Record<string, string>)[p.status] ?? p.status}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {p.company ? <p><strong>{messages.prospectos.company}:</strong> {p.company}</p> : null}
        {p.email ? <p><strong>Email:</strong> {p.email}</p> : null}
        {p.phone ? <p><strong>Teléfono:</strong> {p.phone}</p> : null}
        {p.medium ? (
          <p>
            <strong>{messages.prospectos.medium}:</strong>{" "}
            {(messages.medios as Record<string, string>)[p.medium] ?? p.medium}
          </p>
        ) : null}
        {p.lostReason ? <p><strong>{messages.prospectos.lostReason}:</strong> {p.lostReason}</p> : null}
        {p.suspendedReason ? (
          <p><strong>{messages.prospectos.suspendedReason}:</strong> {p.suspendedReason}</p>
        ) : null}
        <Button asChild variant="outline" className="mt-4">
          <Link href="/prospectos">{messages.common.back}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}