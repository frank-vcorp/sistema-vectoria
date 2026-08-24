"use client";

import * as React from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { messages } from "@/shared/utils";

/**
 * SPEC-010 AC-6/AC-7 · Admin read-only de roles/permisos (DEC-FUN-20)
 * + acceso al editor visual de cuestionarios (DEC-FUN-45). Las
 * acciones de escritura sobre roles/permisos las cablean los
 * servicios de cada módulo (SPEC-001/SPEC-003); esta UI sólo LEE
 * excepto por el enlace al editor de cuestionarios (que requiere
 * `gestionar_cuestionarios`).
 */
export function AdminView() {
  const roles = trpc.admin.roles.list.useQuery();
  const permissions = trpc.admin.permissions.list.useQuery();
  const [selected, setSelected] = React.useState<string>("director");
  const detail = trpc.admin.roles.get.useQuery(
    { code: selected },
    { enabled: !!selected },
  );
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{messages.admin.title}</h1>
        <p className="text-sm text-muted-foreground">{messages.admin.subtitle}</p>
      </header>
      <p className="rounded-md border bg-secondary/30 p-2 text-xs text-muted-foreground">
        <strong>{messages.admin.tooltip}</strong>
        <br />
        {messages.admin.tooltipAudit}
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        <section className="md:col-span-1">
          <h2 className="mb-2 text-sm font-bold">{messages.admin.roles}</h2>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[280px] text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-3 py-2">Rol</th>
                  <th className="px-3 py-2 text-right"># permisos</th>
                </tr>
              </thead>
              <tbody>
                {roles.data?.map((r: { code: string; permissionCount: number }) => (
                  <tr
                    key={r.code}
                    onClick={() => setSelected(r.code)}
                    className={
                      selected === r.code
                        ? "cursor-pointer border-t bg-secondary/30"
                        : "cursor-pointer border-t hover:bg-secondary/10"
                    }
                  >
                    <td className="px-3 py-2">{r.code}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.permissionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="md:col-span-2">
          <h2 className="mb-2 text-sm font-bold">
            {messages.admin.permissions} — {selected}
          </h2>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[320px] text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-3 py-2">Permiso</th>
                </tr>
              </thead>
              <tbody>
                {detail.data?.permissions.map((p) => (
                  <tr key={p} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{p}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <section className="rounded-md border bg-card p-4 text-sm">
        <h2 className="mb-2 font-bold">{messages.admin.questionnaires}</h2>
        <p className="mb-2 text-xs text-muted-foreground">
          {messages.admin.questionnaireEditor.subtitle}
        </p>
        <Link
          href="/admin/questionnaires"
          className="inline-block rounded-md border bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90"
        >
          {messages.admin.questionnaireEditor.open}
        </Link>
      </section>
      <section className="rounded-md border bg-card p-4 text-sm">
        <h2 className="mb-2 font-bold">{messages.admin.fiscalConfig}</h2>
        <p className="text-xs text-muted-foreground">{messages.admin.tooltipFiscal}</p>
      </section>
      <section className="rounded-md border bg-card p-4 text-sm">
        <h2 className="mb-2 font-bold">Catálogo BASE_PERMISSIONS</h2>
        <p className="text-xs text-muted-foreground">
          {permissions.data?.length ?? 0} permisos en total (todos los módulos).
        </p>
      </section>
    </div>
  );
}
