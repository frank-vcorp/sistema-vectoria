"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { messages } from "@/shared/utils";

/**
 * Vista detalle de cuestionario con sus preguntas agrupadas por capa
 * (SPEC-003 B4, ARCH-20260817-08, 4 capas adaptativas).
 *
 * Editor visual de las preguntas (DEC-FUN-45): el Director ve las
 * preguntas como dato (read-only en MVP; el editor drag&drop queda
 * diferido). El Vendedor usa esta vista para aplicar el cuestionario.
 */
export function CuestionarioDetail({ id }: { id: string }) {
  const byId = trpc.comercial.cuestionarios.byId.useQuery({ id });
  const questions = trpc.comercial.cuestionarios.listQuestions.useQuery({
    questionnaireId: id,
  });
  const list = questions.data ?? [];
  const grouped = list.reduce<Record<number, typeof list>>((acc, q) => {
    (acc[q.layer] ??= []).push(q);
    return acc;
  }, {});
  const layerLabels: Record<number, string> = {
    1: messages.cuestionarios.layer1,
    2: messages.cuestionarios.layer2,
    3: messages.cuestionarios.layer3,
    4: messages.cuestionarios.layer4,
  };
  const q = byId.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{q?.name ?? messages.common.loading}</CardTitle>
          <CardDescription>
            {q?.code} · {q?.type} · {q?.version}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {q?.description ? (
            <p className="text-sm text-muted-foreground">{q.description}</p>
          ) : null}
          <div className="mt-2 flex gap-2">
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{q?.status}</span>
            {q?.isSeed ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">seed</span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {[1, 2, 3, 4].map((layer) => {
        const items = grouped[layer] ?? [];
        return (
          <Card key={layer}>
            <CardHeader>
              <CardTitle>{layerLabels[layer]}</CardTitle>
              <CardDescription>
                {items.length} {messages.cuestionarios.questionsCount}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">{messages.cuestionarios.noQuestions}</p>
              ) : (
                items.map((qq) => (
                  <div
                    key={qq.id}
                    className="rounded-md border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {qq.code}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {qq.answerType}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{qq.prompt}</p>
                    {qq.helpText ? (
                      <p className="mt-1 text-xs text-muted-foreground">{qq.helpText}</p>
                    ) : null}
                    {qq.required ? (
                      <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                        {messages.cuestionarios.required}
                      </span>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
