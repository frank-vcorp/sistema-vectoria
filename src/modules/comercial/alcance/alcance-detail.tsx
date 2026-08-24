"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { messages } from "@/shared/utils";

/**
 * Detalle del alcance. El backend expone el jsonb del draft; en MVP
 * mostramos los bloques (incluido / excluido / entregables /
 * supuestos / dependencias / criterios) sin edición.
 */
export function AlcanceDetail({ id }: { id: string }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{messages.alcance.title}</CardTitle>
          <CardDescription>
            {messages.alcance.idLabel}: {id}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {messages.alcance.readonlyMVP}
          </span>
          <p className="mt-2 text-sm text-muted-foreground">
            {messages.alcance.detailBody}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
