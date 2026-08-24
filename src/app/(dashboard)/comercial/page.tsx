"use client";

import * as React from "react";
import { ComercialDashboard } from "@/modules/comercial/comercial-dashboard/comercial-dashboard";

export default function ComercialPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{messagesTitle()}</h1>
        <p className="text-sm text-muted-foreground">{messagesIntro()}</p>
      </header>
      <ComercialDashboard />
    </div>
  );
}

function messagesTitle(): string {
  return "Comercial";
}
function messagesIntro(): string {
  return "Cuestionarios de sondeo, alcance firmado, cotización multi-línea y aceptación.";
}
