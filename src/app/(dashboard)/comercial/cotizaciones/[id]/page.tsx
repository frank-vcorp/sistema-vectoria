"use client";

import { CotizacionDetail } from "@/modules/comercial/cotizaciones/cotizacion-detail";

export default function CotizacionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <CotizacionDetail id={params.id} />;
}
