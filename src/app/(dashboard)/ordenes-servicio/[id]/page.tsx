"use client";

import * as React from "react";
import { OrdenDetail } from "@/modules/orden-servicio/orden-detail";
import { messages } from "@/shared/utils";

export default function OrdenDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{messages.ordenes.detailTitle}</h1>
        <p className="text-sm text-muted-foreground">{params.id}</p>
      </header>
      <OrdenDetail id={params.id} />
    </div>
  );
}
