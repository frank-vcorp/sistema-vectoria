"use client";

/**
 * Tablero de tareas — SPEC-006 §4.3 / AC-11 (kanban/lista responsive).
 *
 * Línea principal (BR-N268-274):
 *   backlog → ready → in_progress → in_review → done
 * Laterales: `blocked`, `cancelled`.
 *
 * Responsive (ADR-03, DEC-FUN-72): en móvil el kanban colapsa a
 * lista apilada; las columnas se ocultan progresivamente con
 * `hidden md:flex`. En desktop se muestran 5 columnas (backlog,
 * ready, in_progress, in_review, done).
 *
 * El módulo sólo orquesta — las reglas viven en `createTasksService()`
 * (BR-007 done exige checklist+evidencia; BR-N269 sólo PL asigna;
 * BR-N270 reject con motivo). Esta vista NO invoca el servicio
 * directamente: consume el router tRPC.
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

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  ready: "Lista",
  in_progress: "En curso",
  in_review: "En revisión",
  done: "Hecha",
  blocked: "Bloqueada",
  cancelled: "Cancelada",
};

const STATUS_ORDER: Array<
  "backlog" | "ready" | "in_progress" | "in_review" | "done"
> = ["backlog", "ready", "in_progress", "in_review", "done"];

const TRANSITIONS: Record<string, string[]> = {
  backlog: ["ready", "cancelled"],
  ready: ["in_progress", "backlog", "blocked", "cancelled"],
  in_progress: ["in_review", "ready", "blocked", "cancelled"],
  in_review: ["done", "in_progress", "blocked", "cancelled"],
  done: [],
  blocked: ["ready", "in_progress", "cancelled"],
  cancelled: [],
};

interface TareasKanbanProps {
  projectId: string;
}

interface TaskCardProps {
  taskId: string;
  onOpen: (taskId: string) => void;
}

function TaskCard({ taskId, onOpen }: TaskCardProps) {
  const detail = trpc.proyectos.tasks.byId.useQuery(
    { taskId },
    { staleTime: 10_000 },
  );
  const data = detail.data;
  if (!data) {
    return (
      <div className="rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground">
        …
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(data.id)}
      className="w-full rounded-md border bg-background p-2 text-left text-xs hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="font-mono text-[10px] text-muted-foreground">
        {data.folio}
      </div>
      <div className="font-medium">{data.title}</div>
      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>Peso {data.weight}</span>
        <span>·</span>
        <span>{data.priority}</span>
        {data.checklists.length > 0 ? (
          <>
            <span>·</span>
            <span>
              {data.checklists.filter((c) => c.done).length}/{data.checklists.length} ✓
            </span>
          </>
        ) : null}
        {data.evidence.length > 0 ? (
          <>
            <span>·</span>
            <span>{data.evidence.length} evid.</span>
          </>
        ) : null}
      </div>
    </button>
  );
}

export function TareasKanban({ projectId }: TareasKanbanProps) {
  const list = trpc.proyectos.tasks.list.useQuery(
    { projectId },
    { staleTime: 5_000 },
  );
  const utils = trpc.useUtils();

  const create = trpc.proyectos.tasks.create.useMutation({
    onSuccess: () => utils.proyectos.tasks.list.invalidate({ projectId }),
  });
  const transition = trpc.proyectos.tasks.transition.useMutation({
    onSuccess: () => utils.proyectos.tasks.list.invalidate({ projectId }),
  });
  const assign = trpc.proyectos.tasks.assign.useMutation({
    onSuccess: () => utils.proyectos.tasks.list.invalidate({ projectId }),
  });
  const reject = trpc.proyectos.tasks.reject.useMutation({
    onSuccess: () => utils.proyectos.tasks.list.invalidate({ projectId }),
  });

  const [newFolio, setNewFolio] = React.useState("");
  const [newTitle, setNewTitle] = React.useState("");
  const [openTaskId, setOpenTaskId] = React.useState<string | null>(null);
  const [rejectReason, setRejectReason] = React.useState<Record<string, string>>(
    {},
  );
  const [assignUser, setAssignUser] = React.useState<Record<string, string>>({});

  const grouped = React.useMemo(() => {
    const items = list.data ?? [];
    const out: Record<string, typeof items> = {
      backlog: [],
      ready: [],
      in_progress: [],
      in_review: [],
      done: [],
      blocked: [],
      cancelled: [],
    };
    for (const t of items) {
      const key = (t.status as keyof typeof out) ?? "backlog";
      const bucket = out[key];
      if (bucket) bucket.push(t);
      else out.backlog!.push(t);
    }
    return out;
  }, [list.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.proyectos.tasksTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="task-folio">{messages.proyectos.tasksFolio}</Label>
            <Input
              id="task-folio"
              value={newFolio}
              onChange={(e) => setNewFolio(e.target.value)}
              placeholder="T-001"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="task-title">{messages.proyectos.tasksTitle}</Label>
            <Input
              id="task-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Título"
            />
          </div>
          <Button
            disabled={
              !newFolio.trim() ||
              !newTitle.trim() ||
              create.isPending
            }
            onClick={() =>
              create.mutate(
                {
                  projectId,
                  folio: newFolio,
                  title: newTitle,
                  weight: 1,
                  priority: "normal",
                },
                {
                  onSuccess: () => {
                    setNewFolio("");
                    setNewTitle("");
                  },
                },
              )
            }
          >
            {messages.proyectos.tasksNew}
          </Button>
        </div>

        {/* Kanban responsive: en móvil (md-) colapsa a lista vertical; en ≥md muestra 5 columnas. */}
        <div className="flex flex-col gap-3 md:hidden">
          {STATUS_ORDER.map((s) => (
            <div key={s} className="space-y-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                {STATUS_LABELS[s]}
              </p>
              <div className="space-y-1">
                {(grouped[s] ?? []).map((t) => (
                  <TaskCard key={t.id} taskId={t.id} onOpen={setOpenTaskId} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="hidden gap-2 md:grid md:grid-cols-5">
          {STATUS_ORDER.map((s) => (
            <div key={s} className="rounded-md border bg-muted/30 p-2">
              <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                {STATUS_LABELS[s]} ({grouped[s]?.length ?? 0})
              </p>
              <div className="flex flex-col gap-2">
                {(grouped[s] ?? []).map((t) => (
                  <TaskCard key={t.id} taskId={t.id} onOpen={setOpenTaskId} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Tabla compacta con acciones */}
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{messages.proyectos.tasksFolio}</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden sm:table-cell">Peso</TableHead>
                <TableHead className="hidden md:table-cell">Prioridad</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data ?? []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.folio}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="underline-offset-2 hover:underline"
                      onClick={() => setOpenTaskId(t.id)}
                    >
                      {t.title}
                    </button>
                  </TableCell>
                  <TableCell>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {STATUS_LABELS[t.status] ?? t.status}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{t.weight}</TableCell>
                  <TableCell className="hidden md:table-cell">{t.priority}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <select
                        className="rounded-md border bg-background px-1 py-0.5 text-xs"
                        value=""
                        onChange={(e) => {
                          const target = e.target.value;
                          if (
                            target &&
                            TRANSITIONS[t.status]?.includes(target)
                          ) {
                            transition.mutate({
                              taskId: t.id,
                              targetStatus: target as never,
                            });
                          }
                        }}
                      >
                        <option value="">→…</option>
                        {(TRANSITIONS[t.status] ?? []).map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                      <div className="flex flex-col gap-1 sm:flex-row">
                        <Input
                          placeholder={messages.proyectos.teamUserPlaceholder}
                          value={assignUser[t.id] ?? ""}
                          onChange={(e) =>
                            setAssignUser((prev) => ({
                              ...prev,
                              [t.id]: e.target.value,
                            }))
                          }
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const userId = (assignUser[t.id] ?? "").trim();
                            if (!userId) return;
                            assign.mutate({ taskId: t.id, userId });
                          }}
                        >
                          {messages.proyectos.tasksAssign}
                        </Button>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row">
                        <Input
                          placeholder={messages.proyectos.tasksRejectReason}
                          value={rejectReason[t.id] ?? ""}
                          onChange={(e) =>
                            setRejectReason((prev) => ({
                              ...prev,
                              [t.id]: e.target.value,
                            }))
                          }
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            const reason = (rejectReason[t.id] ?? "").trim();
                            if (reason.length < 3) return;
                            reject.mutate({ taskId: t.id, reason });
                          }}
                          disabled={(rejectReason[t.id] ?? "").trim().length < 3}
                        >
                          {messages.proyectos.tasksReject}
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {openTaskId ? (
          <TaskDetailDrawer
            taskId={openTaskId}
            onClose={() => setOpenTaskId(null)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function TaskDetailDrawer({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const detail = trpc.proyectos.tasks.byId.useQuery({ taskId });
  const utils = trpc.useUtils();
  const checklistAdd = trpc.proyectos.tasks.checklistAdd.useMutation({
    onSuccess: () => utils.proyectos.tasks.byId.invalidate({ taskId }),
  });
  const checklistToggle = trpc.proyectos.tasks.checklistToggle.useMutation({
    onSuccess: () => utils.proyectos.tasks.byId.invalidate({ taskId }),
  });
  const evidenceAdd = trpc.proyectos.tasks.evidenceAdd.useMutation({
    onSuccess: () => utils.proyectos.tasks.byId.invalidate({ taskId }),
  });
  const review = trpc.proyectos.tasks.review.useMutation({
    onSuccess: () => utils.proyectos.tasks.byId.invalidate({ taskId }),
  });

  const [item, setItem] = React.useState("");
  const [fileId, setFileId] = React.useState("");
  const [evNote, setEvNote] = React.useState("");

  if (!detail.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>…</CardTitle>
        </CardHeader>
      </Card>
    );
  }
  const t = detail.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>
            {t.folio} · {t.title}
          </span>
          <Button size="sm" variant="outline" onClick={onClose}>
            ✕
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          Estado: <strong>{STATUS_LABELS[t.status] ?? t.status}</strong>
        </p>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Checklist ({t.checklists.filter((c) => c.done).length}/{t.checklists.length})
          </p>
          <ul className="space-y-1">
            {t.checklists.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={c.done}
                  onChange={(e) =>
                    checklistToggle.mutate({
                      checklistId: c.id,
                      done: e.target.checked,
                    })
                  }
                />
                <span className={c.done ? "line-through" : ""}>{c.item}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1 sm:flex-row">
            <Input
              placeholder={messages.proyectos.tasksChecklistPlaceholder}
              value={item}
              onChange={(e) => setItem(e.target.value)}
            />
            <Button
              size="sm"
              onClick={() => {
                if (!item.trim()) return;
                checklistAdd.mutate(
                  { taskId, item },
                  { onSuccess: () => setItem("") },
                );
              }}
            >
              {messages.proyectos.tasksChecklistAdd}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Evidencia ({t.evidence.length})
          </p>
          <ul className="space-y-1 text-xs">
            {t.evidence.map((e) => (
              <li key={e.id} className="font-mono">
                {e.fileId} {e.note ? `· ${e.note}` : ""}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1 sm:flex-row">
            <Input
              placeholder={messages.proyectos.tasksEvidencePlaceholder}
              value={fileId}
              onChange={(e) => setFileId(e.target.value)}
            />
            <Input
              placeholder={messages.proyectos.tasksEvidenceNote}
              value={evNote}
              onChange={(e) => setEvNote(e.target.value)}
            />
            <Button
              size="sm"
              onClick={() => {
                if (!fileId.trim()) return;
                evidenceAdd.mutate(
                  {
                    taskId,
                    fileId,
                    ...(evNote.trim() ? { note: evNote.trim() } : {}),
                  },
                  {
                    onSuccess: () => {
                      setFileId("");
                      setEvNote("");
                    },
                  },
                );
              }}
            >
              {messages.proyectos.tasksEvidenceAdd}
            </Button>
          </div>
        </div>

        {t.status === "in_review" ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              size="sm"
              onClick={() => review.mutate({ taskId, approve: true })}
            >
              {messages.proyectos.tasksReviewApprove}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => review.mutate({ taskId, approve: false })}
            >
              {messages.proyectos.tasksReviewReject}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
