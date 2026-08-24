"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc";
import { ProspectosList } from "@/modules/clientes/prospectos/prospectos-list";

/**
 * Página de prospectos (SPEC-002). Hace una primera consulta para
 * descubrir el `scope` ("own" | "all") y mostrar la lista con la
 * visibilidad correcta (AC-6).
 */
export default function ProspectosPage() {
  // `scope` se conoce después de la primera respuesta del listado.
  // Hacemos una llamada previa mínima para obtenerlo; en lo sucesivo la
  // lista ya lo refleja en `query.data.scope`.
  const probe = trpc.clientes.prospectos.list.useQuery({ limit: 1, offset: 0 });
  const scope = probe.data?.scope ?? "own";
  return <ProspectosList scope={scope} />;
}