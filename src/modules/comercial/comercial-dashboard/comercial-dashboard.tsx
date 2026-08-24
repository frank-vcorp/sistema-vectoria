"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { messages } from "@/shared/utils";

/**
 * Panel Comercial — SPEC-003. Cumple AC-10 (responsive 375/768/1280).
 * Concentra los módulos: cuestionarios, alcance, cotizaciones.
 */
export function ComercialDashboard() {
  const links = [
    { href: "/comercial/cuestionarios", title: messages.nav.cuestionarios, desc: messages.comercial.cuestionariosDesc },
    { href: "/comercial/alcance", title: messages.nav.alcance, desc: messages.comercial.alcanceDesc },
    { href: "/comercial/cotizaciones", title: messages.nav.cotizaciones, desc: messages.comercial.cotizacionesDesc },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="block rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Card className="h-full transition hover:shadow-md">
            <CardHeader>
              <CardTitle>{l.title}</CardTitle>
              <CardDescription>{l.desc}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {messages.comercial.openModule}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
