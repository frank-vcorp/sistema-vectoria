"use client";

/**
 * SPEC-006 §4.3 · pestañas de EJECUCIÓN del proyecto:
 *  - `RequirementsTab` (BR-N264-267)
 *  - `TestsTab` (BR-N283-290 / BR-N389)
 *  - `DeliverablesTab` (BR-N288-291 / BR-N287 / DEC-FUN-55)
 *  - `ChangeRequestsTab` (BR-N292-296 / BR-N294 / BR-N395)
 *  - `TimeEntriesTab` (BR-N276 / BR-N277 / BR-008)
 *  - `CierreTab` (AC-8 / AC-9)
 *
 * Cada componente es un cliente tRPC que respeta el contrato del
 * servicio (permiso + shape). Las tablas usan `overflow-x-auto` y
 * ocultan columnas en móvil (`hidden sm:table-cell`).
 */
import * as React from "react";
import { messages } from "@/shared/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ── Requerimientos ────────────────────────────────────────────────────────
const REQ_STATUS_LABELS: Record<string, string> = {
  proposed: "Propuesto",
  analysis: "Análisis",
  approved: "Aprobado",
  development: "Desarrollo",
  testing: "Pruebas",
  validated: "Validado",
  rejected: "Rechazado",
  out_of_scope: "Fuera de alcance",
};

const REQ_TRANSITIONS: Record<string, string[]> = {
  proposed: ["analysis"],
  analysis: ["approved", "rejected", "out_of_scope"],
  approved: ["development", "out_of_scope"],
  development: ["testing", "out_of_scope"],
  testing: ["validated"],
  validated: [],
  rejected: [],
  out_of_scope: [],
};

export function RequirementsTab({ projectId }: { projectId: string }) {
  const utils = trpc.useUtils();
  const list = trpc.proyectos.requirements.list.useQuery(
    { projectId },
    { staleTime: 10_000 },
  );
  const create = trpc.proyectos.requirements.create.useMutation({
    onSuccess: () => utils.proyectos.requirements.list.invalidate({ projectId }),
  });
  const transition = trpc.proyectos.requirements.transition.useMutation({
    onSuccess: () => utils.proyectos.requirements.list.invalidate({ projectId }),
  });
  const [folio, setFolio] = React.useState("");
  const [title, setTitle] = React.useState("");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.proyectos.requirementsTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-1">
            <Label htmlFor="req-folio">Folio</Label>
            <Input
              id="req-folio"
              value={folio}
              onChange={(e) => setFolio(e.target.value)}
              placeholder="R-001"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="req-title">Título</Label>
            <Input
              id="req-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Requerimiento"
            />
          </div>
          <Button
            disabled={!folio.trim() || !title.trim() || create.isPending}
            onClick={() =>
              create.mutate(
                { projectId, folio, title },
                {
                  onSuccess: () => {
                    setFolio("");
                    setTitle("");
                  },
                },
              )
            }
          >
            {messages.proyectos.requirementsNew}
          </Button>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.folio}</TableCell>
                  <TableCell>{r.title}</TableCell>
                  <TableCell>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {REQ_STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <select
                      className="rounded-md border bg-background px-1 py-0.5 text-xs"
                      value=""
                      onChange={(e) => {
                        const target = e.target.value;
                        if (
                          target &&
                          REQ_TRANSITIONS[r.status]?.includes(target)
                        ) {
                          transition.mutate({
                            requirementId: r.id,
                            targetStatus: target as never,
                          });
                        }
                      }}
                    >
                      <option value="">→…</option>
                      {(REQ_TRANSITIONS[r.status] ?? []).map((s) => (
                        <option key={s} value={s}>
                          {REQ_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Pruebas ───────────────────────────────────────────────────────────────
const TEST_TYPE_LABELS: Record<string, string> = {
  functional: "Funcional",
  visual: "Visual",
  ui: "UI",
  acceptance: "Aceptación",
  performance: "Performance",
  security: "Seguridad",
  compatibility: "Compatibilidad",
};

const TEST_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  passed: "Aprobada",
  failed: "Fallida",
  blocked: "Bloqueada",
  not_applicable: "N/A",
};

const TEST_TYPES = [
  "functional",
  "visual",
  "ui",
  "acceptance",
  "performance",
  "security",
  "compatibility",
] as const;

const TEST_STATUSES = ["pending", "passed", "failed", "blocked"] as const;

export function TestsTab({ projectId }: { projectId: string }) {
  const utils = trpc.useUtils();
  const list = trpc.proyectos.tests.list.useQuery(
    { projectId },
    { staleTime: 10_000 },
  );
  const create = trpc.proyectos.tests.create.useMutation({
    onSuccess: () => utils.proyectos.tests.list.invalidate({ projectId }),
  });
  const transition = trpc.proyectos.tests.transition.useMutation({
    onSuccess: () => utils.proyectos.tests.list.invalidate({ projectId }),
  });
  const markNA = trpc.proyectos.tests.markNotApplicable.useMutation({
    onSuccess: () => utils.proyectos.tests.list.invalidate({ projectId }),
  });
  const [type, setType] = React.useState<(typeof TEST_TYPES)[number]>(
    "functional",
  );
  const [naReasons, setNaReasons] = React.useState<Record<string, string>>({});
  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.proyectos.testsTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            className="rounded-md border bg-background px-2 py-1 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as (typeof TEST_TYPES)[number])}
          >
            {TEST_TYPES.map((t) => (
              <option key={t} value={t}>
                {TEST_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <Button
            onClick={() => create.mutate({ projectId, type })}
            disabled={create.isPending}
          >
            {messages.proyectos.testsNew}
          </Button>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden md:table-cell">Resultado</TableHead>
                <TableHead className="hidden sm:table-cell">Incidente</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data ?? []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        t.blocking
                          ? "bg-amber-100 text-amber-900"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {TEST_TYPE_LABELS[t.type] ?? t.type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {TEST_STATUS_LABELS[t.status] ?? t.status}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-xs md:table-cell">
                    {t.result ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-xs sm:table-cell">
                    {t.incident ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <select
                        className="rounded-md border bg-background px-1 py-0.5 text-xs"
                        value=""
                        onChange={(e) => {
                          const target = e.target.value;
                          if (target && TEST_STATUSES.includes(target as never)) {
                            transition.mutate({
                              testId: t.id,
                              targetStatus: target as never,
                            });
                          }
                        }}
                      >
                        <option value="">→…</option>
                        {TEST_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {TEST_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                      <div className="flex flex-col gap-1 sm:flex-row">
                        <Input
                          placeholder={messages.proyectos.testsReasonNA}
                          value={naReasons[t.id] ?? ""}
                          onChange={(e) =>
                            setNaReasons((prev) => ({
                              ...prev,
                              [t.id]: e.target.value,
                            }))
                          }
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={(naReasons[t.id] ?? "").trim().length < 3}
                          onClick={() => {
                            const reason = (naReasons[t.id] ?? "").trim();
                            if (reason.length < 3) return;
                            markNA.mutate({ testId: t.id, reason });
                          }}
                        >
                          {messages.proyectos.testsMarkNotApplicable}
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Entregables ──────────────────────────────────────────────────────────
const DELIV_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  preparing: "En preparación",
  delivered: "Entregado",
  accepted: "Aceptado",
  observed: "Observado",
  corrected: "Corregido",
  rejected: "Rechazado",
  cancelled: "Cancelado",
};

const MEDIUMS = ["email", "telefono", "presencial", "otro"] as const;

export function DeliverablesTab({ projectId }: { projectId: string }) {
  const utils = trpc.useUtils();
  const list = trpc.proyectos.deliverables.list.useQuery(
    { projectId },
    { staleTime: 10_000 },
  );
  const create = trpc.proyectos.deliverables.create.useMutation({
    onSuccess: () => utils.proyectos.deliverables.list.invalidate({ projectId }),
  });
  const transition = trpc.proyectos.deliverables.transition.useMutation({
    onSuccess: () => utils.proyectos.deliverables.list.invalidate({ projectId }),
  });
  const accept = trpc.proyectos.deliverables.accept.useMutation({
    onSuccess: () => utils.proyectos.deliverables.list.invalidate({ projectId }),
  });

  const [name, setName] = React.useState("");
  const [version, setVersion] = React.useState("1.0");
  const [committedDate, setCommittedDate] = React.useState(
    new Date().toISOString().slice(0, 10),
  );

  // Estado local por entregable para el formulario de aceptación.
  const [acceptForm, setAcceptForm] = React.useState<
    Record<string, {
      accepterName: string;
      accepterOrg: string;
      acceptedMedium: "email" | "telefono" | "presencial" | "otro";
      evidenceFileId: string;
    }>
  >({});

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.proyectos.deliverablesTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="del-name">Nombre</Label>
            <Input
              id="del-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="del-version">{messages.proyectos.deliverablesVersion}</Label>
            <Input
              id="del-version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="del-committed">{messages.proyectos.deliverablesCommitted}</Label>
            <Input
              id="del-committed"
              type="date"
              value={committedDate}
              onChange={(e) => setCommittedDate(e.target.value)}
            />
          </div>
          <Button
            disabled={
              !name.trim() || !version.trim() || !committedDate.trim() ||
              create.isPending
            }
            onClick={() =>
              create.mutate(
                {
                  projectId,
                  name,
                  version,
                  committedDate,
                  required: true,
                },
                {
                  onSuccess: () => {
                    setName("");
                    setVersion("1.0");
                  },
                },
              )
            }
          >
            {messages.proyectos.deliverablesNew}
          </Button>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entregable</TableHead>
                <TableHead className="hidden md:table-cell">Versión</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden sm:table-cell">Comprometido</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data ?? []).map((d) => {
                const form = acceptForm[d.id] ?? {
                  accepterName: "",
                  accepterOrg: "",
                  acceptedMedium: "email" as const,
                  evidenceFileId: "",
                };
                const update = (patch: Partial<typeof form>) =>
                  setAcceptForm((prev) => ({
                    ...prev,
                    [d.id]: { ...form, ...patch },
                  }));
                return (
                  <TableRow key={d.id}>
                    <TableCell>{d.name}</TableCell>
                    <TableCell className="hidden font-mono text-xs md:table-cell">
                      {d.version}
                    </TableCell>
                    <TableCell>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {DELIV_STATUS_LABELS[d.status] ?? d.status}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {d.committedDate}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap gap-1">
                          {d.status === "pending" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                transition.mutate({
                                  deliverableId: d.id,
                                  targetStatus: "preparing",
                                })
                              }
                            >
                              Preparar
                            </Button>
                          ) : null}
                          {d.status === "preparing" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                transition.mutate({
                                  deliverableId: d.id,
                                  targetStatus: "delivered",
                                })
                              }
                            >
                              Entregar
                            </Button>
                          ) : null}
                        </div>
                        {d.status === "delivered" ? (
                          <div className="space-y-1 rounded-md border bg-muted/30 p-2">
                            <Input
                              placeholder={messages.proyectos.deliverablesAccepterName}
                              value={form.accepterName}
                              onChange={(e) =>
                                update({ accepterName: e.target.value })
                              }
                            />
                            <Input
                              placeholder={messages.proyectos.deliverablesAccepterOrg}
                              value={form.accepterOrg}
                              onChange={(e) =>
                                update({ accepterOrg: e.target.value })
                              }
                            />
                            <select
                              className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                              value={form.acceptedMedium}
                              onChange={(e) =>
                                update({
                                  acceptedMedium: e.target.value as
                                    | "email"
                                    | "telefono"
                                    | "presencial"
                                    | "otro",
                                })
                              }
                            >
                              {MEDIUMS.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                            <Input
                              placeholder={messages.proyectos.deliverablesEvidenceFile}
                              value={form.evidenceFileId}
                              onChange={(e) =>
                                update({ evidenceFileId: e.target.value })
                              }
                            />
                            <Button
                              size="sm"
                              onClick={() =>
                                accept.mutate({
                                  deliverableId: d.id,
                                  accepterName: form.accepterName,
                                  accepterOrg: form.accepterOrg,
                                  acceptedMedium: form.acceptedMedium,
                                  evidenceFileId: form.evidenceFileId,
                                })
                              }
                              disabled={
                                !form.accepterName.trim() ||
                                !form.accepterOrg.trim() ||
                                !form.evidenceFileId.trim()
                              }
                            >
                              {messages.proyectos.deliverablesAccept}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Cambios de alcance ──────────────────────────────────────────────────
const CR_STATUS_LABELS: Record<string, string> = {
  requested: "Solicitado",
  analysis: "Análisis",
  quoted: "Cotizado",
  authorized: "Autorizado",
  rejected: "Rechazado",
  cancelled: "Cancelado",
  in_progress: "En implementación",
  implemented: "Implementado",
  validated: "Validado",
};

export function ChangeRequestsTab({ projectId }: { projectId: string }) {
  const utils = trpc.useUtils();
  const list = trpc.proyectos.changeRequests.list.useQuery(
    { projectId },
    { staleTime: 10_000 },
  );
  const create = trpc.proyectos.changeRequests.create.useMutation({
    onSuccess: () => utils.proyectos.changeRequests.list.invalidate({ projectId }),
  });
  const quote = trpc.proyectos.changeRequests.quote.useMutation({
    onSuccess: () => utils.proyectos.changeRequests.list.invalidate({ projectId }),
  });
  const authorize = trpc.proyectos.changeRequests.authorize.useMutation({
    onSuccess: () => utils.proyectos.changeRequests.list.invalidate({ projectId }),
  });
  const reject = trpc.proyectos.changeRequests.reject.useMutation({
    onSuccess: () => utils.proyectos.changeRequests.list.invalidate({ projectId }),
  });
  const start = trpc.proyectos.changeRequests.startImplementation.useMutation({
    onSuccess: () => utils.proyectos.changeRequests.list.invalidate({ projectId }),
  });
  const complete = trpc.proyectos.changeRequests.completeImplementation.useMutation({
    onSuccess: () => utils.proyectos.changeRequests.list.invalidate({ projectId }),
  });
  const [folio, setFolio] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [hasCost, setHasCost] = React.useState(true);
  const [quoteForms, setQuoteForms] = React.useState<
    Record<string, { kind: "quote" | "custom"; quoteId: string; fileId: string }>
  >({});
  const [reasons, setReasons] = React.useState<Record<string, string>>({});

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.proyectos.changesTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="cr-folio">Folio</Label>
            <Input
              id="cr-folio"
              value={folio}
              onChange={(e) => setFolio(e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="cr-reason">{messages.proyectos.changesReason}</Label>
            <Input
              id="cr-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Costo</Label>
            <select
              className="w-full rounded-md border bg-background px-2 py-1 text-sm"
              value={hasCost ? "yes" : "no"}
              onChange={(e) => setHasCost(e.target.value === "yes")}
            >
              <option value="yes">{messages.proyectos.changesHasCost}</option>
              <option value="no">{messages.proyectos.changesNoCost}</option>
            </select>
          </div>
          <Button
            disabled={!folio.trim() || reason.trim().length < 3 || create.isPending}
            onClick={() =>
              create.mutate(
                { projectId, folio, reason, hasCost },
                {
                  onSuccess: () => {
                    setFolio("");
                    setReason("");
                  },
                },
              )
            }
          >
            {messages.proyectos.changesNew}
          </Button>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Costo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data ?? []).map((c) => {
                const form = quoteForms[c.id] ?? {
                  kind: c.hasCost ? "quote" : "custom",
                  quoteId: "",
                  fileId: "",
                };
                const update = (patch: Partial<typeof form>) =>
                  setQuoteForms((prev) => ({
                    ...prev,
                    [c.id]: { ...form, ...patch },
                  }));
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.folio}</TableCell>
                    <TableCell className="text-xs">{c.reason}</TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          c.hasCost
                            ? "bg-amber-100 text-amber-900"
                            : "bg-muted"
                        }`}
                      >
                        {c.hasCost
                          ? messages.proyectos.changesHasCost
                          : messages.proyectos.changesNoCost}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {CR_STATUS_LABELS[c.status] ?? c.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {c.status === "requested" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => reject.mutate({ changeRequestId: c.id, reason: "rechazado por revisión inicial" })}
                          >
                            {messages.proyectos.changesReject}
                          </Button>
                        ) : null}
                        {c.status === "analysis" && c.hasCost ? (
                          <div className="space-y-1 rounded-md border bg-muted/30 p-2">
                            <select
                              className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                              value={form.kind}
                              onChange={(e) =>
                                update({ kind: e.target.value as "quote" | "custom" })
                              }
                            >
                              <option value="quote">{messages.proyectos.changesQuoteNoun}</option>
                              <option value="custom">{messages.proyectos.changesCustom}</option>
                            </select>
                            {form.kind === "quote" ? (
                              <Input
                                placeholder={messages.proyectos.changesLinkedQuote}
                                value={form.quoteId}
                                onChange={(e) => update({ quoteId: e.target.value })}
                              />
                            ) : (
                              <Input
                                placeholder={messages.proyectos.changesEvidenceFile}
                                value={form.fileId}
                                onChange={(e) => update({ fileId: e.target.value })}
                              />
                            )}
                            <Button
                              size="sm"
                              onClick={() =>
                                quote.mutate({
                                  changeRequestId: c.id,
                                  evidenceKind: form.kind,
                                  ...(form.kind === "quote"
                                    ? { linkedQuoteId: form.quoteId }
                                    : { evidenceFileId: form.fileId }),
                                })
                              }
                              disabled={
                                (form.kind === "quote" && !form.quoteId.trim()) ||
                                (form.kind === "custom" && !form.fileId.trim())
                              }
                            >
                              {messages.proyectos.changesQuoteAction}
                            </Button>
                          </div>
                        ) : null}
                        {c.status === "quoted" ? (
                          <Button
                            size="sm"
                            onClick={() => authorize.mutate({ changeRequestId: c.id })}
                          >
                            {messages.proyectos.changesAuthorize}
                          </Button>
                        ) : null}
                        {c.hasCost && c.status === "authorized" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => start.mutate({ changeRequestId: c.id })}
                          >
                            Iniciar
                          </Button>
                        ) : null}
                        {!c.hasCost && c.status === "analysis" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => start.mutate({ changeRequestId: c.id })}
                          >
                            Iniciar
                          </Button>
                        ) : null}
                        {c.status === "in_progress" ? (
                          <Button
                            size="sm"
                            onClick={() => complete.mutate({ changeRequestId: c.id })}
                          >
                            Completar
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="text-xs text-muted-foreground">
          {Object.keys(reasons).length === 0 ? null : "(motivos pendientes por enviar)"}
        </div>
      </CardContent>
    </Card>
  );
  void reasons;
  void setReasons;
}

// ── Time entries ────────────────────────────────────────────────────────
const TIME_KIND_LABELS: Record<string, string> = {
  facturable: "Facturable",
  interna: "Interna",
  retrabajo: "Retrabajo",
  soporte: "Soporte",
};

export function TimeEntriesTab({ projectId }: { projectId: string }) {
  const utils = trpc.useUtils();
  const list = trpc.proyectos.timeEntries.list.useQuery(
    { projectId, teamView: false },
    { staleTime: 5_000 },
  );
  const listTeam = trpc.proyectos.timeEntries.list.useQuery(
    { projectId, teamView: true },
    { staleTime: 5_000, enabled: false },
  );
  const create = trpc.proyectos.timeEntries.create.useMutation({
    onSuccess: () => utils.proyectos.timeEntries.list.invalidate({ projectId }),
  });
  const [hours, setHours] = React.useState("1");
  const [kind, setKind] = React.useState<"facturable" | "interna" | "retrabajo" | "soporte">(
    "facturable",
  );
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [teamView, setTeamView] = React.useState(false);
  const rows = teamView ? listTeam.data ?? [] : list.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.proyectos.timeTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="time-hours">{messages.proyectos.timeHours}</Label>
            <Input
              id="time-hours"
              type="number"
              step="0.25"
              min="0.25"
              max="24"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="time-kind">{messages.proyectos.timeKind}</Label>
            <select
              id="time-kind"
              className="w-full rounded-md border bg-background px-2 py-1 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              {(["facturable", "interna", "retrabajo", "soporte"] as const).map((k) => (
                <option key={k} value={k}>
                  {TIME_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="time-date">{messages.proyectos.timeDate}</Label>
            <Input
              id="time-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="time-team">Vista</Label>
            <select
              id="time-team"
              className="w-full rounded-md border bg-background px-2 py-1 text-sm"
              value={teamView ? "team" : "self"}
              onChange={async (e) => {
                const v = e.target.value === "team";
                setTeamView(v);
                if (v) await listTeam.refetch();
              }}
            >
              <option value="self">Propio</option>
              <option value="team">{messages.proyectos.timeTeamView}</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button
              disabled={
                !hours.trim() ||
                Number(hours) <= 0 ||
                Number(hours) > 24 ||
                create.isPending
              }
              onClick={() =>
                create.mutate({
                  projectId,
                  hours: Number(hours),
                  kind,
                  date,
                })
              }
            >
              {messages.proyectos.timeRegister}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Horas</TableHead>
                <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                <TableHead className="hidden md:table-cell">Costo/h</TableHead>
                <TableHead className="hidden md:table-cell">Usuario</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.date}</TableCell>
                  <TableCell>{r.hours.toFixed(2)}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {TIME_KIND_LABELS[r.kind] ?? r.kind}
                    </span>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs md:table-cell">
                    ${(r.costPerHourCents / 100).toFixed(2)}
                  </TableCell>
                  <TableCell className="hidden text-xs md:table-cell">
                    {r.userName ?? r.userId}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Cierre técnico ──────────────────────────────────────────────────────
export function CierreTab({ projectId }: { projectId: string }) {
  const utils = trpc.useUtils();
  const preview = trpc.proyectos.cierre.previewCloseGates.useQuery(
    { projectId },
    { staleTime: 10_000 },
  );
  const close = trpc.proyectos.cierre.closeTechnical.useMutation({
    onSuccess: () => {
      utils.proyectos.cierre.previewCloseGates.invalidate({ projectId });
      utils.proyectos.byId.invalidate({ projectId });
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.proyectos.closureTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {messages.proyectos.closureSubtitle}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs uppercase text-muted-foreground">
              {messages.proyectos.closureProgress}
            </p>
            <p className="text-2xl font-semibold">
              {preview.data?.progressPct ?? 0}%
            </p>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs uppercase text-muted-foreground">
              {messages.proyectos.closureHealth}
            </p>
            <p className="text-2xl font-semibold capitalize">
              {preview.data?.health ?? "—"}
            </p>
          </div>
          <div className="flex items-end">
            <Button
              disabled={!preview.data?.canClose || close.isPending}
              onClick={() => close.mutate({ projectId })}
            >
              {messages.proyectos.closureClose}
            </Button>
          </div>
        </div>

        {preview.data?.canClose ? (
          <p className="rounded-md bg-green-50 px-2 py-1 text-xs text-green-900">
            {messages.proyectos.closeGatesOk}
          </p>
        ) : (
          <div className="rounded-md border bg-red-50 px-2 py-1 text-xs text-red-900">
            <p className="font-medium">{messages.proyectos.closeGatesReasons}:</p>
            <ul className="ml-4 list-disc">
              {(preview.data?.reasons ?? []).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-900">
          {messages.proyectos.closureSignalHint}
        </p>
      </CardContent>
    </Card>
  );
}
