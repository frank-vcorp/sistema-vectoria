"use client";

import * as React from "react";
import { messages } from "@/shared/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

const STAGE_LABELS: Record<string, string> = {
  planning: messages.proyectos.stageLabel.planning,
  development: messages.proyectos.stageLabel.development,
  testing: messages.proyectos.stageLabel.testing,
  client_validation: messages.proyectos.stageLabel.client_validation,
  delivery: messages.proyectos.stageLabel.delivery,
};

const SITUATION_LABELS: Record<string, string> = {
  pending: messages.proyectos.situationLabel.pending,
  active: messages.proyectos.situationLabel.active,
  paused: messages.proyectos.situationLabel.paused,
  completed: messages.proyectos.situationLabel.completed,
  cancelled: messages.proyectos.situationLabel.cancelled,
};

const HEALTH_LABELS: Record<string, string> = {
  on_track: messages.proyectos.healthLabel.on_track,
  at_risk: messages.proyectos.healthLabel.at_risk,
  delayed: messages.proyectos.healthLabel.delayed,
};

const MODULE_STATUS_LABELS: Record<string, string> = {
  pending: messages.proyectos.moduleStatus.pending,
  in_progress: messages.proyectos.moduleStatus.in_progress,
  testing: messages.proyectos.moduleStatus.testing,
  deployed: messages.proyectos.moduleStatus.deployed,
  paused: messages.proyectos.moduleStatus.paused,
  blocked: messages.proyectos.moduleStatus.blocked,
  cancelled: messages.proyectos.moduleStatus.cancelled,
};

interface ProyectoDetailProps {
  id: string;
}

const STAGE_OPTIONS = [
  "planning",
  "development",
  "testing",
  "client_validation",
  "delivery",
] as const;

const HEALTH_OPTIONS = ["on_track", "at_risk", "delayed"] as const;

const MODULE_TRANSITIONS: Record<string, string[]> = {
  pending: ["in_progress", "cancelled"],
  in_progress: ["testing", "paused", "blocked", "cancelled"],
  testing: ["deployed", "in_progress", "paused", "blocked", "cancelled"],
  deployed: ["testing"],
  paused: ["in_progress", "blocked", "cancelled"],
  blocked: ["in_progress", "paused", "cancelled"],
  cancelled: [],
};

function TextareaShim({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <textarea
      rows={10}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
    />
  );
}

export function ProyectoDetail({ id }: ProyectoDetailProps) {
  const utils = trpc.useUtils();
  const detail = trpc.proyectos.byId.useQuery({ projectId: id });
  const exportJson = trpc.proyectos.jsonDiscovery.exportTemplate.useQuery(
    { projectId: id },
    { enabled: false },
  );

  const transitionStage = trpc.proyectos.transitionStage.useMutation({
    onSuccess: () => utils.proyectos.byId.invalidate({ projectId: id }),
  });
  const pause = trpc.proyectos.pause.useMutation({
    onSuccess: () => utils.proyectos.byId.invalidate({ projectId: id }),
  });
  const resume = trpc.proyectos.resume.useMutation({
    onSuccess: () => utils.proyectos.byId.invalidate({ projectId: id }),
  });
  const cancel = trpc.proyectos.cancel.useMutation({
    onSuccess: () => utils.proyectos.byId.invalidate({ projectId: id }),
  });
  const complete = trpc.proyectos.complete.useMutation({
    onSuccess: () => utils.proyectos.byId.invalidate({ projectId: id }),
  });
  const overrideHealth = trpc.proyectos.overrideHealth.useMutation({
    onSuccess: () => utils.proyectos.byId.invalidate({ projectId: id }),
  });
  const transitionModule = trpc.proyectos.modules.transition.useMutation({
    onSuccess: () => utils.proyectos.byId.invalidate({ projectId: id }),
  });
  const importJson = trpc.proyectos.jsonDiscovery.import.useMutation({
    onSuccess: () => utils.proyectos.byId.invalidate({ projectId: id }),
  });
  const previewJson = trpc.proyectos.jsonDiscovery.previewImport.useQuery(
    { projectId: id, json: { project_id: id, folio: "", included: [], version: 1, modules: [] } },
    { enabled: false },
  );

  const [targetStage, setTargetStage] = React.useState<string>("development");
  const [pauseReason, setPauseReason] = React.useState("");
  const [cancelReason, setCancelReason] = React.useState("");
  const [healthTarget, setHealthTarget] = React.useState<string>("on_track");
  const [healthReason, setHealthReason] = React.useState("");
  const [jsonText, setJsonText] = React.useState<string>("");
  const [moduleTarget, setModuleTarget] = React.useState<Record<string, string>>({});
  const [moduleReason, setModuleReason] = React.useState<Record<string, string>>({});

  if (detail.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{messages.common.loading}</CardTitle>
        </CardHeader>
        <CardContent />
      </Card>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{messages.errors.notFound}</CardTitle>
          <CardDescription>
            {(detail.error as Error | null)?.message ?? messages.common.error}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const p = detail.data;
  const isTerminal = p.statusSituation === "completed" || p.statusSituation === "cancelled";

  async function handleExport() {
    const res = await exportJson.refetch();
    if (res.data) setJsonText(JSON.stringify(res.data.json, null, 2));
  }

  async function handleImport() {
    if (!jsonText.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return;
    }
    const plan = parsed as { version?: number };
    const preview = await previewJson.refetch();
    void preview;
    await importJson.mutateAsync({
      projectId: id,
      version: plan.version ?? p.planVersion + 1,
      json: parsed as never,
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {p.code} · {messages.proyectos.detailTitle}
          </CardTitle>
          <CardDescription>
            {STAGE_LABELS[p.statusStage] ?? p.statusStage} ·{" "}
            {SITUATION_LABELS[p.statusSituation] ?? p.statusSituation}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">{messages.proyectos.order}</p>
              <p className="font-mono text-xs">{p.orderId}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{messages.proyectos.client}</p>
              <p className="font-mono text-xs">{p.clientId}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">PL</p>
              <p className="font-mono text-xs">{p.plUserId}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{messages.proyectos.template}</p>
              <p className="font-mono text-xs">{p.templateId}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{messages.proyectos.health}</p>
              <p>
                {HEALTH_LABELS[p.health] ?? p.health} ·{" "}
                <span className="text-xs text-muted-foreground">
                  ({messages.proyectos.healthLabel[p.healthCalculated] ?? p.healthCalculated})
                </span>
              </p>
              {p.healthOverrideReason ? (
                <p className="text-xs italic">{p.healthOverrideReason}</p>
              ) : null}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{messages.proyectos.planVersion}</p>
              <p>{p.planVersion}</p>
            </div>
          </div>
          {p.pauseReason ? (
            <p className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-900">
              {messages.proyectos.pauseReason}: {p.pauseReason}
            </p>
          ) : null}
          {p.cancelReason ? (
            <p className="rounded-md bg-red-100 px-2 py-1 text-xs text-red-900">
              {messages.proyectos.cancelReason}: {p.cancelReason}
            </p>
          ) : null}
          <p className="rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-900">
            {messages.proyectos.createdFromOrder}
          </p>
        </CardContent>
      </Card>

      {/* Acciones: etapa / pause / cancel / complete */}
      <Card>
        <CardHeader>
          <CardTitle>{messages.proyectos.actionsTitle}</CardTitle>
          <CardDescription>{messages.proyectos.actionsSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="stage-target">{messages.proyectos.transitionTitle}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                id="stage-target"
                className="rounded-md border bg-background px-2 py-1 text-sm"
                value={targetStage}
                onChange={(e) => setTargetStage(e.target.value)}
                disabled={isTerminal || p.statusSituation === "paused"}
              >
                {STAGE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
              <Button
                onClick={() =>
                  transitionStage.mutate({ projectId: p.id, targetStage: targetStage as never })
                }
                disabled={isTerminal || p.statusSituation === "paused" || transitionStage.isPending}
              >
                {messages.proyectos.transitionTitle}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{messages.proyectos.transitionSubtitle}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pause-reason">{messages.proyectos.pauseTitle}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="pause-reason"
                placeholder={messages.proyectos.reasonPlaceholder}
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                disabled={isTerminal || p.statusSituation === "paused"}
              />
              <Button
                variant="secondary"
                onClick={() => pause.mutate({ projectId: p.id, reason: pauseReason })}
                disabled={
                  pauseReason.trim().length < 3 ||
                  isTerminal ||
                  p.statusSituation === "paused" ||
                  pause.isPending
                }
              >
                {messages.proyectos.pauseTitle}
              </Button>
              <Button
                variant="outline"
                onClick={() => resume.mutate({ projectId: p.id })}
                disabled={p.statusSituation !== "paused" || resume.isPending}
              >
                Reanudar
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cancel-reason">{messages.proyectos.cancelTitle}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="cancel-reason"
                placeholder={messages.proyectos.reasonPlaceholder}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                disabled={isTerminal}
              />
              <Button
                variant="destructive"
                onClick={() => cancel.mutate({ projectId: p.id, reason: cancelReason })}
                disabled={cancelReason.trim().length < 3 || isTerminal || cancel.isPending}
              >
                {messages.proyectos.cancelTitle}
              </Button>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => complete.mutate({ projectId: p.id })}
            disabled={isTerminal || complete.isPending}
          >
            Cierre técnico
          </Button>
        </CardContent>
      </Card>

      {/* Salud calculada + override */}
      <Card>
        <CardHeader>
          <CardTitle>{messages.proyectos.healthTitle}</CardTitle>
          <CardDescription>{messages.proyectos.healthSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Calculada: {HEALTH_LABELS[p.healthCalculated] ?? p.healthCalculated} · Manual:{" "}
            {HEALTH_LABELS[p.health] ?? p.health}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              className="rounded-md border bg-background px-2 py-1 text-sm"
              value={healthTarget}
              onChange={(e) => setHealthTarget(e.target.value)}
            >
              {HEALTH_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {HEALTH_LABELS[h]}
                </option>
              ))}
            </select>
            <Input
              placeholder={messages.proyectos.healthReasonPlaceholder}
              value={healthReason}
              onChange={(e) => setHealthReason(e.target.value)}
            />
            <Button
              variant="secondary"
              onClick={() =>
                overrideHealth.mutate({
                  projectId: p.id,
                  health: healthTarget as never,
                  reason: healthReason,
                })
              }
              disabled={healthReason.trim().length < 3 || overrideHealth.isPending}
            >
              Override
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Módulos */}
      <Card>
        <CardHeader>
          <CardTitle>{messages.proyectos.modulesTitle}</CardTitle>
          <CardDescription>{messages.proyectos.modulesSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          {p.modules.length === 0 ? (
            <p className="text-sm text-muted-foreground">{messages.proyectos.modulesEmpty}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Requerido</TableHead>
                    <TableHead className="hidden md:table-cell">Dependencias</TableHead>
                    <TableHead>{messages.proyectos.moduleTransition}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p.modules.map((m) => {
                    const targets = MODULE_TRANSITIONS[m.status] ?? [];
                    const currentTarget = moduleTarget[m.id] ?? targets[0] ?? "";
                    const reason = moduleReason[m.id] ?? "";
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-mono text-xs">{m.code}</TableCell>
                        <TableCell>{m.name}</TableCell>
                        <TableCell>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                            {MODULE_STATUS_LABELS[m.status] ?? m.status}
                          </span>
                        </TableCell>
                        <TableCell>{m.required ? "Sí" : "No"}</TableCell>
                        <TableCell className="hidden font-mono text-xs md:table-cell">
                          {m.dependsOnModules.join(", ") || "—"}
                        </TableCell>
                        <TableCell>
                          {targets.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <select
                                className="rounded-md border bg-background px-2 py-1 text-xs"
                                value={currentTarget}
                                onChange={(e) =>
                                  setModuleTarget((prev) => ({
                                    ...prev,
                                    [m.id]: e.target.value,
                                  }))
                                }
                              >
                                {targets.map((t) => (
                                  <option key={t} value={t}>
                                    {MODULE_STATUS_LABELS[t]}
                                  </option>
                                ))}
                              </select>
                              {currentTarget === "deployed" ? (
                                <Input
                                  placeholder="Motivo ≥3"
                                  value={reason}
                                  onChange={(e) =>
                                    setModuleReason((prev) => ({
                                      ...prev,
                                      [m.id]: e.target.value,
                                    }))
                                  }
                                />
                              ) : null}
                              <Button
                                size="sm"
                                onClick={() =>
                                  transitionModule.mutate({
                                    moduleId: m.id,
                                    targetStatus: currentTarget as never,
                                    ...(currentTarget === "deployed"
                                      ? { reason: reason || "sin motivo" }
                                      : {}),
                                  })
                                }
                                disabled={
                                  currentTarget === "deployed" && reason.trim().length < 3
                                }
                              >
                                →
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* JSON Discovery round-trip */}
      <Card>
        <CardHeader>
          <CardTitle>{messages.proyectos.jsonDiscoveryTitle}</CardTitle>
          <CardDescription>{messages.proyectos.jsonDiscoverySubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button variant="outline" onClick={handleExport}>
              {messages.proyectos.jsonExport}
            </Button>
          </div>
          <TextareaShim
            value={jsonText}
            placeholder={messages.proyectos.jsonEmptyPlan}
            onChange={setJsonText}
          />
          <Button
            onClick={handleImport}
            disabled={!jsonText.trim() || importJson.isPending}
          >
            {messages.proyectos.jsonImport}
          </Button>
          {importJson.error ? (
            <p className="rounded-md bg-red-100 px-2 py-1 text-xs text-red-900">
              {importJson.error.message}
            </p>
          ) : null}
          {importJson.data ? (
            <div className="space-y-1 text-xs">
              <p>
                <strong>{messages.proyectos.jsonVersion}:</strong>{" "}
                {importJson.data.currentVersion} ({importJson.data.status})
              </p>
              <p>{messages.proyectos.jsonDiffAdd}: {importJson.data.diff.adds.length}</p>
              <p>{messages.proyectos.jsonDiffChange}: {importJson.data.diff.changes.length}</p>
              <p>
                {messages.proyectos.jsonDiffConflict}:{" "}
                {importJson.data.diff.conflicts.length}
              </p>
              {importJson.data.diff.conflicts.length > 0 ? (
                <p className="text-red-700">{messages.proyectos.jsonImmutableRejected}</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {Object.values({
        transitionStage: transitionStage.error?.message,
        pause: pause.error?.message,
        cancel: cancel.error?.message,
        complete: complete.error?.message,
        overrideHealth: overrideHealth.error?.message,
      })
        .filter(Boolean)
        .map((m, i) => (
          <p
            key={i}
            className="rounded-md bg-red-100 px-2 py-1 text-xs text-red-900"
          >
            {m}
          </p>
        ))}
    </div>
  );
}