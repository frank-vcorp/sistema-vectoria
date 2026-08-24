"use client";

import * as React from "react";
import { OrdenesList } from "@/modules/orden-servicio/ordenes-list";
import { messages } from "@/shared/utils";

export default function OrdenesServicioPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{messages.ordenes.title}</h1>
        <p className="text-sm text-muted-foreground">{messages.ordenes.subtitle}</p>
      </header>
      <OrdenesList />
    </div>
  );
}
