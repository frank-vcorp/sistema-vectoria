"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc";
import { ClientesList } from "@/modules/clientes/clientes/clientes-list";

export default function ClientesPage() {
  const probe = trpc.clientes.clientes.list.useQuery({ limit: 1, offset: 0 });
  // La lista de clientes no expone scope propio del servicio; usamos
  // "all" como etiqueta neutra cuando la visibilidad es amplia.
  const scope = "all" as const;
  return (
    <>
      <div hidden>{probe.isLoading ? "loading" : "ok"}</div>
      <ClientesList scope={scope} />
    </>
  );
}