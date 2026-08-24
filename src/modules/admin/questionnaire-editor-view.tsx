"use client";

import * as React from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { messages } from "@/shared/utils";

/**
 * SPEC-010 AC-7 · Editor visual de cuestionarios (DEC-FUN-45).
 *
 *  - Lista los cuestionarios publicados y, al seleccionar uno, carga
 *    preguntas vía `admin.questionnaireEditor.getForEdit` (que reusa
 *    SPEC-003 questionnaires para la lectura canónica).
 *  - Permite **reordenar** drag&drop (HTML5 drag + botones ↑↓ para
 *    móvil/touch, AC-58), **editar** prompt/helpText/required/opciones,
 *    **agregar** preguntas nuevas y **quitar** preguntas (con
 *    confirmación).
 *  - **Vista previa** en vivo, con selector de 3 viewports (móvil
 *    375px, tablet 768px, escritorio 1024px) — responsive real.
 *  - La UI **NO** accede a BD; todos los cambios pasan por el
 *    servicio `admin.questionnaireEditor.*` (AC-26 SPEC-001).
 *
 * Permiso: `gestionar_cuestionarios` (sembrado en Director y
 * Administrador). El Vendedor NO ve el enlace al editor (la ruta
 * `/admin/questionnaires/*` exige el permiso; `protectedProcedure` +
 * `hasPerm.require` rechaza el acceso).
 */
type Viewport = "mobile" | "tablet" | "desktop";
type QuestionOption = { value: string; label: string };
type LocalQuestion = {
  id: string;
  layer: number;
  code: string;
  prompt: string;
  answerType: string;
  required: boolean;
  helpText: string | null;
  options: QuestionOption[] | null;
  sortOrder: number;
  pending?: "reorder" | "update" | "add" | "remove";
};

const VIEWPORT_WIDTH: Record<Viewport, string> = {
  mobile: "w-[375px]",
  tablet: "w-[768px]",
  desktop: "w-[1024px]",
};

export function QuestionnaireEditorView() {
  // 1) Catálogo de cuestionarios.
  const list = trpc.comercial.cuestionarios.list.useQuery();

  // 2) Estado de selección.
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // 3) Carga inicial.
  React.useEffect(() => {
    if (!selectedId && list.data && list.data.length > 0) {
      const first = list.data[0];
      if (first) setSelectedId(first.id);
    }
  }, [list.data, selectedId]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">
          {messages.admin.questionnaireEditor.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {messages.admin.questionnaireEditor.subtitle}
        </p>
      </header>
      <div className="rounded-md border bg-secondary/30 p-2 text-xs text-muted-foreground">
        {messages.admin.tooltip}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="md:col-span-1">
          <h2 className="mb-2 text-sm font-bold">
            {messages.admin.questionnaires}
          </h2>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[260px] text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {(list.data ?? []).map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => setSelectedId(q.id)}
                    className={
                      selectedId === q.id
                        ? "cursor-pointer border-t bg-secondary/30"
                        : "cursor-pointer border-t hover:bg-secondary/10"
                    }
                  >
                    <td className="px-3 py-2 font-mono text-xs">{q.code}</td>
                    <td className="px-3 py-2">{q.name}</td>
                    <td className="px-3 py-2">{q.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="md:col-span-2">
          {selectedId ? (
            <EditorPane questionnaireId={selectedId} />
          ) : (
            <p className="rounded-md border bg-card p-4 text-sm">
              {messages.admin.questionnaireEditor.noQuestionnaire}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function EditorPane({ questionnaireId }: { questionnaireId: string }) {
  const utils = trpc.useUtils();
  const detail = trpc.admin.questionnaireEditor.getForEdit.useQuery({
    id: questionnaireId,
  });
  const reorderMut = trpc.admin.questionnaireEditor.reorder.useMutation({
    onSuccess: () => utils.admin.questionnaireEditor.getForEdit.invalidate(),
  });
  const updateMut = trpc.admin.questionnaireEditor.update.useMutation({
    onSuccess: () => utils.admin.questionnaireEditor.getForEdit.invalidate(),
  });
  const addMut = trpc.admin.questionnaireEditor.add.useMutation({
    onSuccess: () => utils.admin.questionnaireEditor.getForEdit.invalidate(),
  });
  const removeMut = trpc.admin.questionnaireEditor.remove.useMutation({
    onSuccess: () => utils.admin.questionnaireEditor.getForEdit.invalidate(),
  });

  // Estado local (UI nunca escribe en BD hasta pulsar Guardar).
  const [local, setLocal] = React.useState<LocalQuestion[]>([]);
  const [pendingOrder, setPendingOrder] = React.useState<string[] | null>(null);
  const [viewport, setViewport] = React.useState<Viewport>("desktop");
  const [dragId, setDragId] = React.useState<string | null>(null);

  // Sincronizar local al cambiar la fuente remota (sólo si no hay reorder pendiente).
  React.useEffect(() => {
    if (!detail.data) return;
    if (pendingOrder) return; // mantener el orden local pendiente
    const next: LocalQuestion[] = detail.data.questions.map((q) => ({
      id: q.id,
      layer: q.layer,
      code: q.code,
      prompt: q.prompt,
      answerType: q.answerType,
      required: q.required,
      helpText: q.helpText,
      options: Array.isArray(q.options)
        ? (q.options as QuestionOption[])
        : null,
      sortOrder: q.sortOrder,
    }));
    setLocal(next);
  }, [detail.data, pendingOrder]);

  const move = (idx: number, dir: -1 | 1) => {
    setPendingOrder((cur) => {
      const baseOrder =
        cur ?? local.map((q) => q.id).sort((a, b) => {
          const sa = local.find((q) => q.id === a)?.sortOrder ?? 0;
          const sb = local.find((q) => q.id === b)?.sortOrder ?? 0;
          return sa - sb;
        });
      const next = [...baseOrder];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return cur;
      const a = next[idx];
      const b = next[j];
      if (!a || !b) return cur;
      next[idx] = b;
      next[j] = a;
      return next;
    });
  };

  const onDragStart = (id: string) => () => setDragId(id);
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (targetId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    setPendingOrder((cur) => {
      const baseOrder =
        cur ?? local.map((q) => q.id).sort((a, b) => {
          const sa = local.find((q) => q.id === a)?.sortOrder ?? 0;
          const sb = local.find((q) => q.id === b)?.sortOrder ?? 0;
          return sa - sb;
        });
      const next = [...baseOrder];
      const from = next.indexOf(dragId);
      const to = next.indexOf(targetId);
      if (from < 0 || to < 0) return cur;
      const moved = next.splice(from, 1)[0];
      if (moved) next.splice(to, 0, moved);
      return next;
    });
    setDragId(null);
  };

  const visibleOrder = React.useMemo(() => {
    if (pendingOrder) return pendingOrder;
    return local
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((q) => q.id);
  }, [pendingOrder, local]);

  const handleSaveOrder = () => {
    if (!pendingOrder) return;
    reorderMut.mutate(
      { questionnaireId, orderedIds: pendingOrder },
      {
        onSuccess: () => setPendingOrder(null),
      },
    );
  };

  const updateLocalField = (
    id: string,
    patch: Partial<LocalQuestion>,
  ) => {
    setLocal((cur) =>
      cur.map((q) => (q.id === id ? { ...q, ...patch, pending: "update" } : q)),
    );
  };

  const handleSaveQuestion = (id: string) => {
    const q = local.find((x) => x.id === id);
    if (!q) return;
    updateMut.mutate(
      {
        id,
        prompt: q.prompt,
        helpText: q.helpText,
        required: q.required,
        options: q.options,
      },
      {
        onSuccess: () => {
          setLocal((cur) =>
            cur.map((x) => {
              if (x.id !== id) return x;
              const { pending: _p, ...rest } = x;
              void _p;
              return rest as LocalQuestion;
            }),
          );
        },
      },
    );
  };

  const handleRemove = (id: string) => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(messages.admin.questionnaireEditor.confirmRemove);
      if (!ok) return;
    }
    removeMut.mutate({ id });
  };

  const handleAdd = () => {
    const layer = 1;
    const code = `NEW_${Date.now().toString(36)}`;
    addMut.mutate({
      questionnaireId,
      layer,
      code,
      prompt: "Nueva pregunta",
      answerType: "text",
      required: false,
    });
  };

  if (detail.isLoading) {
    return <p className="text-sm text-muted-foreground">{messages.common.loading}</p>;
  }
  if (!detail.data) {
    return (
      <p className="rounded-md border bg-card p-4 text-sm">
        {messages.admin.questionnaireEditor.noQuestionnaire}
      </p>
    );
  }

  const q = detail.data.questionnaire;
  const orderMap = new Map(visibleOrder.map((id, i) => [id, i]));
  const sortedLocal = local
    .slice()
    .sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-3 text-sm">
        <div>
          <div className="font-bold">{q.name}</div>
          <div className="text-xs text-muted-foreground">
            {q.code} · {q.type} · {q.version} · {q.status}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleAdd}
            disabled={addMut.isPending}
            className="rounded-md border bg-primary px-3 py-1 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {messages.admin.questionnaireEditor.addQuestion}
          </button>
          {pendingOrder ? (
            <button
              type="button"
              onClick={handleSaveOrder}
              disabled={reorderMut.isPending}
              className="rounded-md border bg-secondary px-3 py-1 hover:bg-accent disabled:opacity-50"
            >
              {messages.admin.questionnaireEditor.saveReorder}
            </button>
          ) : null}
        </div>
      </div>

      <p className="rounded-md border bg-secondary/30 p-2 text-xs text-muted-foreground">
        {messages.admin.questionnaireEditor.dragHint}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Editor (lista) */}
        <div className="space-y-2">
          {sortedLocal.length === 0 ? (
            <p className="rounded-md border bg-card p-3 text-sm">
              {messages.admin.questionnaireEditor.empty}
            </p>
          ) : null}
          {sortedLocal.map((qq, idx) => (
            <article
              key={qq.id}
              draggable
              onDragStart={onDragStart(qq.id)}
              onDragOver={onDragOver}
              onDrop={onDrop(qq.id)}
              className="space-y-2 rounded-md border bg-card p-3 text-sm"
            >
              <header className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                    {qq.code}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {messages.admin.questionnaireEditor.layers[
                      qq.layer as 1 | 2 | 3 | 4
                    ] ?? `Capa ${qq.layer}`}
                  </span>
                  {qq.required ? (
                    <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-xs">
                      {messages.admin.questionnaireEditor.required}
                    </span>
                  ) : null}
                  {qq.pending ? (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs">
                      {messages.admin.questionnaireEditor.pending}
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-1 text-xs">
                  <button
                    type="button"
                    aria-label="subir"
                    onClick={() => move(idx, -1)}
                    className="rounded border bg-background px-2 py-0.5 hover:bg-accent"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="bajar"
                    onClick={() => move(idx, 1)}
                    className="rounded border bg-background px-2 py-0.5 hover:bg-accent"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(qq.id)}
                    disabled={removeMut.isPending}
                    className="rounded border bg-destructive/10 px-2 py-0.5 hover:bg-destructive/20 disabled:opacity-50"
                  >
                    {messages.admin.questionnaireEditor.remove}
                  </button>
                </div>
              </header>
              <label className="block">
                <span className="text-xs text-muted-foreground">
                  {messages.admin.questionnaireEditor.prompt}
                </span>
                <input
                  type="text"
                  value={qq.prompt}
                  onChange={(e) =>
                    updateLocalField(qq.id, { prompt: e.target.value })
                  }
                  className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">
                  {messages.admin.questionnaireEditor.helpText}
                </span>
                <input
                  type="text"
                  value={qq.helpText ?? ""}
                  onChange={(e) =>
                    updateLocalField(qq.id, {
                      helpText: e.target.value === "" ? null : e.target.value,
                    })
                  }
                  className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={qq.required}
                    onChange={(e) =>
                      updateLocalField(qq.id, { required: e.target.checked })
                    }
                  />
                  {messages.admin.questionnaireEditor.required}
                </label>
                <span className="rounded bg-muted px-2 py-0.5 font-mono">
                  {qq.answerType}
                </span>
              </div>
              {(qq.answerType === "single_choice" ||
                qq.answerType === "multi_choice") && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    {messages.admin.questionnaireEditor.options} (
                    {qq.options?.length ?? 0})
                  </summary>
                  <div className="mt-1 space-y-1">
                    {(qq.options ?? []).map((opt, oi) => (
                      <div key={oi} className="flex gap-1">
                        <input
                          type="text"
                          value={opt.value}
                          onChange={(e) => {
                            const next = [...(qq.options ?? [])];
                            next[oi] = { ...opt, value: e.target.value };
                            updateLocalField(qq.id, { options: next });
                          }}
                          className="w-1/3 rounded border bg-background px-2 py-1"
                        />
                        <input
                          type="text"
                          value={opt.label}
                          onChange={(e) => {
                            const next = [...(qq.options ?? [])];
                            next[oi] = { ...opt, label: e.target.value };
                            updateLocalField(qq.id, { options: next });
                          }}
                          className="flex-1 rounded border bg-background px-2 py-1"
                        />
                      </div>
                    ))}
                  </div>
                </details>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => handleSaveQuestion(qq.id)}
                  disabled={updateMut.isPending || qq.pending !== "update"}
                  className="rounded border bg-secondary px-3 py-1 text-xs hover:bg-accent disabled:opacity-50"
                >
                  {messages.admin.questionnaireEditor.savePrompt}
                </button>
              </div>
            </article>
          ))}
        </div>

        {/* Preview */}
        <div className="space-y-3">
          <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
            {(["mobile", "tablet", "desktop"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setViewport(v)}
                className={
                  viewport === v
                    ? "rounded bg-primary px-3 py-1 text-primary-foreground"
                    : "rounded px-3 py-1 text-muted-foreground"
                }
              >
                {v === "mobile"
                  ? messages.admin.questionnaireEditor.viewportMobile
                  : v === "tablet"
                    ? messages.admin.questionnaireEditor.viewportTablet
                    : messages.admin.questionnaireEditor.viewportDesktop}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-md border bg-muted/30 p-3">
            <div
              className={`mx-auto rounded-md border bg-card p-3 ${VIEWPORT_WIDTH[viewport]}`}
              data-viewport={viewport}
            >
              <header className="mb-3">
                <h3 className="text-sm font-bold">
                  {messages.admin.questionnaireEditor.previewLabel} · {q.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {q.description ?? ""}
                </p>
              </header>
              <ol className="space-y-2 text-xs">
                {sortedLocal.map((qq, i) => (
                  <li key={qq.id} className="rounded border bg-background p-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">
                        {i + 1}. {qq.prompt}
                      </span>
                      {qq.required ? (
                        <span className="text-destructive">*</span>
                      ) : null}
                    </div>
                    {qq.helpText ? (
                      <p className="mt-0.5 text-muted-foreground">{qq.helpText}</p>
                    ) : null}
                    <PreviewInput qq={qq} />
                  </li>
                ))}
                {sortedLocal.length === 0 ? (
                  <li className="text-muted-foreground">
                    {messages.admin.questionnaireEditor.empty}
                  </li>
                ) : null}
              </ol>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <Link
          href="/admin"
          className="text-xs text-muted-foreground hover:underline"
        >
          ← {messages.admin.questionnaireEditor.back}
        </Link>
      </div>
    </div>
  );
}

function PreviewInput({ qq }: { qq: LocalQuestion }) {
  switch (qq.answerType) {
    case "text":
      return (
        <input
          type="text"
          disabled
          placeholder="(texto)"
          className="mt-1 w-full rounded border bg-muted px-2 py-1"
        />
      );
    case "number":
      return (
        <input
          type="number"
          disabled
          placeholder="(número)"
          className="mt-1 w-full rounded border bg-muted px-2 py-1"
        />
      );
    case "boolean":
      return (
        <div className="mt-1 flex gap-3 text-xs">
          <span>Sí</span>
          <span>No</span>
        </div>
      );
    case "scale":
      return (
        <div className="mt-1 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className="rounded border bg-muted px-2 py-0.5">
              {n}
            </span>
          ))}
        </div>
      );
    case "date":
      return (
        <input
          type="date"
          disabled
          className="mt-1 w-full rounded border bg-muted px-2 py-1"
        />
      );
    case "single_choice":
      return (
        <div className="mt-1 space-y-1">
          {(qq.options ?? []).map((o, i) => (
            <label key={i} className="flex items-center gap-2 text-xs">
              <input type="radio" disabled /> {o.label}
            </label>
          ))}
          {(qq.options ?? []).length === 0 ? (
            <span className="text-xs text-muted-foreground">
              {messages.admin.questionnaireEditor.optionsEmpty}
            </span>
          ) : null}
        </div>
      );
    case "multi_choice":
      return (
        <div className="mt-1 space-y-1">
          {(qq.options ?? []).map((o, i) => (
            <label key={i} className="flex items-center gap-2 text-xs">
              <input type="checkbox" disabled /> {o.label}
            </label>
          ))}
          {(qq.options ?? []).length === 0 ? (
            <span className="text-xs text-muted-foreground">
              {messages.admin.questionnaireEditor.optionsEmpty}
            </span>
          ) : null}
        </div>
      );
    default:
      return null;
  }
}
