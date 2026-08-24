"use client";

import * as React from "react";
import { ProyectosList } from "@/modules/proyectos/proyectos-list";
import { messages } from "@/shared/utils";

export default function ProyectosPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{messages.proyectos.title}</h1>
        <p className="text-sm text-muted-foreground">{messages.proyectos.subtitle}</p>
      </header>
      <ProyectosList />
    </div>
  );
}