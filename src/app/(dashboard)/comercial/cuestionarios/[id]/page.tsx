"use client";

import { CuestionarioDetail } from "@/modules/comercial/cuestionarios/cuestionario-detail";

export default function CuestionarioDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <CuestionarioDetail id={params.id} />;
}
