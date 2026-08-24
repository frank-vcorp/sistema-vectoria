"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc";
import { messages } from "@/shared/utils";

/**
 * Dashboard por rol (SPEC-010 AC-1/AC-2). 3 columnas en desktop,
 * 1 columna en móvil. Drag&drop persistente (DEC-FUN-28). Default
 * 'Esta semana' (week) con filtro 'Hoy' (today). La API agrega
 * widgets (BR-N373); nunca lista filas crudas.
 */
type WidgetCode = keyof typeof messages.dashboard.widgetLabel;

export function DashboardView() {
  const [view, setView] = React.useState<"week" | "today">("week");
  const q = trpc.dashboard.get.useQuery({ view });
  const utils = trpc.useUtils();
  const save = trpc.dashboard.saveLayout.useMutation({
    onSuccess: () => utils.dashboard.get.invalidate(),
  });

  // Estado local del orden (controlado por drag&drop o por los
  // botones ↑↓ en móvil).
  const [order, setOrder] = React.useState<WidgetCode[]>([]);
  React.useEffect(() => {
    const raw = q.data?.preferences?.widgets;
    if (raw) {
      setOrder(
        raw.filter((w): w is WidgetCode =>
          typeof w === "string" &&
          (Object.keys(messages.dashboard.widgetLabel) as string[]).includes(w),
        ) as WidgetCode[],
      );
    }
  }, [q.data?.preferences?.widgets]);

  const move = (idx: number, dir: -1 | 1) => {
    setOrder((cur) => {
      const next = [...cur] as WidgetCode[];
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

  const widgetMap = React.useMemo(() => {
    const m = new Map<WidgetCode, { label: string; aggregate: Array<{ key: string; count: number; totalCents?: number }>; totalCount: number }>();
    for (const w of q.data?.widgets ?? []) {
      m.set(w.code as WidgetCode, {
        label: w.label,
        aggregate: w.aggregate,
        totalCount: w.totalCount,
      });
    }
    return m;
  }, [q.data?.widgets]);

  const handleSave = () => {
    save.mutate({
      widgets: order,
      layout: order.map((w, i) => ({ widget: w, x: 0, y: i, w: 1, h: 1 })),
      defaultView: view,
    });
  };

  const handleReset = () => {
    if (!q.data) return;
    const defaults = q.data.preferences.widgets as WidgetCode[];
    setOrder(defaults);
    save.mutate({
      widgets: defaults,
      layout: defaults.map((w, i) => ({ widget: w, x: 0, y: i, w: 1, h: 1 })),
      defaultView: view,
    });
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{messages.dashboard.title}</h1>
        <p className="text-sm text-muted-foreground">{messages.dashboard.subtitle}</p>
      </header>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-md border bg-card p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setView("week")}
            className={
              view === "week"
                ? "rounded bg-primary px-3 py-1 text-primary-foreground"
                : "rounded px-3 py-1 text-muted-foreground"
            }
            title="Semana en curso"
          >
            {messages.dashboard.week}
          </button>
          <button
            type="button"
            onClick={() => setView("today")}
            className={
              view === "today"
                ? "rounded bg-primary px-3 py-1 text-primary-foreground"
                : "rounded px-3 py-1 text-muted-foreground"
            }
            title="Solo hoy"
          >
            {messages.dashboard.today}
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={save.isPending}
            className="rounded-md border bg-card px-3 py-1 text-sm hover:bg-accent disabled:opacity-50"
          >
            {messages.dashboard.resetDefault}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={save.isPending || !q.data}
            className="rounded-md border bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {messages.dashboard.saveLayout}
          </button>
        </div>
      </div>
      <p className="rounded-md border bg-secondary/30 p-2 text-xs text-muted-foreground">
        {messages.dashboard.dragHint}
      </p>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {order.length === 0 ? (
          <p className="text-sm text-muted-foreground">{messages.dashboard.noWidgets}</p>
        ) : null}
        {order.map((w, idx) => {
          const data = widgetMap.get(w);
          if (!data) return null;
          return (
            <article
              key={w}
              className="rounded-md border bg-card p-3 text-sm"
              title={`${w} (${data.totalCount})`}
            >
              <header className="mb-2 flex items-start justify-between gap-2">
                <h3 className="font-bold">{data.label}</h3>
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
                </div>
              </header>
              {data.totalCount === 0 ? (
                <p className="text-xs text-muted-foreground">{messages.dashboard.noData}</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {data.aggregate.slice(0, 5).map((a) => (
                    <li key={a.key} className="flex justify-between gap-2">
                      <span className="truncate font-mono">{a.key}</span>
                      <span className="font-mono">
                        {a.totalCents !== undefined && a.totalCents !== 0
                          ? `$${(a.totalCents / 100).toFixed(2)}`
                          : a.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
