"use client";

import { AlcanceDetail } from "@/modules/comercial/alcance/alcance-detail";

export default function AlcanceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <AlcanceDetail id={params.id} />;
}
