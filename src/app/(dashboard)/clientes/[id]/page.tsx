"use client";

import Link from "next/link";
import { messages } from "@/shared/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ContactsPanel } from "@/modules/clientes/clientes/contacts-panel";
import { FiscalPanel } from "@/modules/clientes/clientes/fiscal-panel";

/**
 * Detalle de cliente (SPEC-002). Carga ficha + panel de contactos y
 * panel de datos fiscales. Los datos fiscales son opcionales (BR-N218).
 *
 * IMPORTANTE: Next.js 14.2 entrega `params` como objeto plano (no
 * Promise) y React 18.3 no expone `React.use`. Tratarlo como objeto
 * evita la excepción cliente que mostraba el overlay "Application
 * error" en staging.
 */
export default function ClienteDetallePage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const query = trpc.clientes.clientes.byId.useQuery({ clientId: id });

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
            <Link href="/clientes">{messages.common.back}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  const c = query.data;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{c.name}</CardTitle>
          <CardDescription>
            {c.clientNumber} ·{" "}
            {c.status === "archived" ? messages.clientes.archived : messages.clientes.active}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {c.company ? <p><strong>{messages.prospectos.company}:</strong> {c.company}</p> : null}
          {c.email ? <p><strong>Email:</strong> {c.email}</p> : null}
          {c.phone ? <p><strong>Teléfono:</strong> {c.phone}</p> : null}
          {c.archivedReason ? (
            <p><strong>{messages.clientes.archiveReason}:</strong> {c.archivedReason}</p>
          ) : null}
          <Button asChild variant="outline" className="mt-4">
            <Link href="/clientes">{messages.common.back}</Link>
          </Button>
        </CardContent>
      </Card>
      <ContactsPanel clientId={c.id} />
      <FiscalPanel clientId={c.id} />
    </div>
  );
}