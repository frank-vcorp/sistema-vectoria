"use client";

import * as React from "react";
import { ProyectoDetail } from "@/modules/proyectos/proyecto-detail";
import { EquipoTab } from "@/modules/proyectos/equipo-tab";
import { TareasKanban } from "@/modules/proyectos/tareas-kanban";
import {
  ChangeRequestsTab,
  CierreTab,
  DeliverablesTab,
  RequirementsTab,
  TestsTab,
  TimeEntriesTab,
} from "@/modules/proyectos/ejecucion-tabs";
import { messages } from "@/shared/utils";

type Tab =
  | "summary"
  | "tasks"
  | "requirements"
  | "tests"
  | "deliverables"
  | "changes"
  | "team"
  | "time"
  | "closure";

export default function ProyectoDetailPage({ params }: { params: { id: string } }) {
  const [tab, setTab] = React.useState<Tab>("summary");
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "summary", label: messages.proyectos.tabs.summary },
    { id: "tasks", label: messages.proyectos.tabs.tasks },
    { id: "requirements", label: messages.proyectos.tabs.requirements },
    { id: "tests", label: messages.proyectos.tabs.tests },
    { id: "deliverables", label: messages.proyectos.tabs.deliverables },
    { id: "changes", label: messages.proyectos.tabs.changes },
    { id: "team", label: messages.proyectos.tabs.team },
    { id: "time", label: messages.proyectos.tabs.time },
    { id: "closure", label: messages.proyectos.tabs.closure },
  ];
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{messages.proyectos.detailTitle}</h1>
        <p className="text-sm text-muted-foreground">{params.id}</p>
      </header>

      <nav
        aria-label="Pestañas del proyecto"
        className="-mx-2 flex flex-wrap gap-1 overflow-x-auto px-2"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ${
              tab === t.id
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-secondary/50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "summary" ? <ProyectoDetail id={params.id} /> : null}
      {tab === "tasks" ? <TareasKanban projectId={params.id} /> : null}
      {tab === "requirements" ? <RequirementsTab projectId={params.id} /> : null}
      {tab === "tests" ? <TestsTab projectId={params.id} /> : null}
      {tab === "deliverables" ? <DeliverablesTab projectId={params.id} /> : null}
      {tab === "changes" ? <ChangeRequestsTab projectId={params.id} /> : null}
      {tab === "team" ? <EquipoTab projectId={params.id} /> : null}
      {tab === "time" ? <TimeEntriesTab projectId={params.id} /> : null}
      {tab === "closure" ? <CierreTab projectId={params.id} /> : null}
    </div>
  );
}