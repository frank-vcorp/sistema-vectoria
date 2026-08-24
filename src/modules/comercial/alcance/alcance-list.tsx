"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { messages } from "@/shared/utils";

/**
 * Listado de alcances (SPEC-003 B6). En MVP muestra mensaje neutro;
 * el detalle y firma viven en `/comercial/alcance/[id]`.
 */
export function AlcanceList() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.alcance.title}</CardTitle>
        <CardDescription>{messages.alcance.subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">{messages.alcance.intro}</p>
        <p className="text-xs text-muted-foreground">
          {messages.alcance.seeProspect}:{" "}
          <Link
            href="/prospectos"
            className="underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {messages.nav.prospectos}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
