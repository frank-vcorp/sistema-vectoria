"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc";
import { messages } from "@/shared/utils";

/**
 * SPEC-010 AC-3/AC-4/AC-5 · Bitácora con dos pestañas:
 *  - Auditoría: `audit_logs` filtrable por entidad/acción/actor/fecha
 *    (paginado, BR-N373). Requiere `ver_auditoria`.
 *  - Notas de proyecto: `project_log_entries` filtradas por
 *    `private=false` para usuarios sin `ver_notas_privadas`
 *    (BR-N339).
 *
 * Enlace firmado (`signedUrl` TTL ≤ 15 min) en cada archivo
 * (BR-N371 / AC-13 / BR-N340). El modal `linkFile` crea la fila en
 * `file_links` vía `bitacora.linkFile`.
 */
export function BitacoraView() {
  const [tab, setTab] = React.useState<"audit" | "projectLog">("audit");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{messages.bitacora.title}</h1>
        <p className="text-sm text-muted-foreground">{messages.bitacora.subtitle}</p>
      </header>
      <div className="overflow-x-auto">
        <div className="inline-flex min-w-full gap-2 border-b">
          {(
            [
              { key: "audit" as const, label: messages.bitacora.auditTab },
              { key: "projectLog" as const, label: messages.bitacora.projectLogTab },
            ]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                tab === t.key
                  ? "border-b-2 border-primary px-3 py-2 text-sm font-medium"
                  : "px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === "audit" ? <AuditTab /> : <ProjectLogTab />}
    </div>
  );
}

function AuditTab() {
  const [page, setPage] = React.useState({ limit: 25, offset: 0 });
  const [entityType, setEntityType] = React.useState("");
  const [action, setAction] = React.useState("");
  const list = trpc.bitacora.audit.list.useQuery({
    ...page,
    ...(entityType ? { entityType } : {}),
    ...(action ? { action } : {}),
  });
  return (
    <div className="space-y-3">
      <p className="rounded-md border bg-secondary/30 p-2 text-xs text-muted-foreground">
        {messages.bitacora.noAccess}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          placeholder={messages.bitacora.entityType}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        />
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder={messages.bitacora.action}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        />
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="hidden px-3 py-2 sm:table-cell">Actor</th>
              <th className="hidden px-3 py-2 md:table-cell">Rol</th>
              <th className="px-3 py-2">{messages.bitacora.entityType}</th>
              <th className="hidden px-3 py-2 md:table-cell">Entity ID</th>
              <th className="px-3 py-2">{messages.bitacora.action}</th>
              <th className="hidden px-3 py-2 md:table-cell">{messages.bitacora.actor}</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">
                  {messages.finanzas.empty}
                </td>
              </tr>
            ) : null}
            {list.data?.items.map((a: {
              id: string;
              createdAt: string;
              actorUserId: string | null;
              actorRoleCode: string | null;
              entityType: string;
              entityId: string;
              action: string;
            }) => (
              <tr key={a.id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{a.createdAt.slice(0, 19)}</td>
                <td className="hidden px-3 py-2 sm:table-cell font-mono text-xs">
                  {a.actorUserId?.slice(0, 8) ?? "—"}
                </td>
                <td className="hidden px-3 py-2 md:table-cell">{a.actorRoleCode ?? "—"}</td>
                <td className="px-3 py-2">{a.entityType}</td>
                <td className="hidden px-3 py-2 md:table-cell font-mono text-xs">
                  {a.entityId.slice(0, 8)}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{a.action}</td>
                <td className="hidden px-3 py-2 md:table-cell font-mono text-xs">
                  {a.entityId.slice(0, 8)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.data && list.data.total > page.limit ? (
        <div className="flex justify-end gap-2 text-sm">
          <button
            type="button"
            disabled={page.offset === 0}
            onClick={() => setPage((p) => ({ ...p, offset: Math.max(0, p.offset - p.limit) }))}
            className="rounded-md border px-2 py-1 disabled:opacity-50"
          >
            ‹
          </button>
          <span>
            {page.offset + 1}..{Math.min(page.offset + page.limit, list.data.total)} / {list.data.total}
          </span>
          <button
            type="button"
            disabled={page.offset + page.limit >= list.data.total}
            onClick={() => setPage((p) => ({ ...p, offset: p.offset + p.limit }))}
            className="rounded-md border px-2 py-1 disabled:opacity-50"
          >
            ›
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ProjectLogTab() {
  const [projectId, setProjectId] = React.useState("");
  const list = trpc.bitacora.projectLog.list.useQuery(
    { projectId, limit: 25, offset: 0 },
    { enabled: !!projectId },
  );
  const [linkOpen, setLinkOpen] = React.useState<string | null>(null);
  return (
    <div className="space-y-3">
      <p className="rounded-md border bg-secondary/30 p-2 text-xs text-muted-foreground">
        {messages.bitacora.noAccessPrivate}
      </p>
      <input
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        placeholder="projectId"
        className="rounded-md border bg-background px-2 py-1 font-mono text-sm w-full max-w-md"
      />
      {list.data ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="hidden px-3 py-2 sm:table-cell">Tipo</th>
                <th className="px-3 py-2">Mensaje</th>
                <th className="hidden px-3 py-2 md:table-cell">Visibilidad</th>
                <th className="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                    {messages.finanzas.empty}
                  </td>
                </tr>
              ) : null}
              {list.data.items.map((e: {
                id: string;
                createdAt: string;
                type: string;
                message: string;
                private: boolean;
              }) => (
                <tr key={e.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{e.createdAt.slice(0, 19)}</td>
                  <td className="hidden px-3 py-2 sm:table-cell">{e.type}</td>
                  <td className="px-3 py-2">{e.message}</td>
                  <td className="hidden px-3 py-2 md:table-cell">
                    {e.private ? messages.bitacora.privateNote : messages.bitacora.publicNote}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setLinkOpen(e.id)}
                      className="rounded-md border bg-card px-2 py-1 text-xs hover:bg-accent"
                    >
                      {messages.bitacora.linkFile}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {linkOpen ? (
        <LinkFileDialog
          entityType="project_log_entry"
          entityId={linkOpen}
          onClose={() => setLinkOpen(null)}
        />
      ) : null}
    </div>
  );
}

function LinkFileDialog({
  entityType,
  entityId,
  onClose,
}: {
  entityType: string;
  entityId: string;
  onClose: () => void;
}) {
  const [fileId, setFileId] = React.useState("");
  const utils = trpc.useUtils();
  const link = trpc.bitacora.linkFile.useMutation({
    onSuccess: () => utils.bitacora.audit.list.invalidate(),
  });
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={messages.bitacora.linkFile}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div className="w-full max-w-md rounded-t-lg bg-background p-6 shadow-xl sm:rounded-lg">
        <h2 className="mb-4 text-lg font-bold">{messages.bitacora.linkFile}</h2>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="block text-muted-foreground">fileId</span>
            <input
              value={fileId}
              onChange={(e) => setFileId(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1 font-mono"
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </label>
          {link.error ? (
            <p className="text-xs text-destructive">{String(link.error.message)}</p>
          ) : null}
          {link.data ? (
            <div className="rounded-md border bg-secondary/30 p-2 text-xs">
              <p>
                <strong>{messages.bitacora.signedUrl}:</strong>
              </p>
              <code className="block break-all text-[10px]">{link.data.signedUrl ?? "(no signedUrl)"}</code>
            </div>
          ) : null}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border bg-card px-3 py-1 text-sm hover:bg-accent"
          >
            Cerrar
          </button>
          <button
            type="button"
            disabled={link.isPending || !fileId}
            onClick={() => link.mutate({ fileId, entityType, entityId })}
            className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {messages.bitacora.linkFile}
          </button>
        </div>
      </div>
    </div>
  );
}
