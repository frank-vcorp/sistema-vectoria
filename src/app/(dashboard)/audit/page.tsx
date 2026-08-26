"use client";

import { BitacoraView } from "@/modules/bitacora/bitacora-view";

/**
 * SPEC-010 · ruta `/audit`. IMPL-20260825-39 (F-14/P3): renderiza
 * `BitacoraView` (que ya implementa `trpc.bitacora.audit.list`,
 * `bitacora.projectLog.list`, `linkFile`, tabs, paginación y
 * responsive) en lugar del placeholder estático anterior. Se
 * conserva el path `/audit` para no romper la navegación
 * (`messages.nav.audit`).
 */
export default function AuditPage() {
  return <BitacoraView />;
}
