"use client";

/**
 * SPEC-002-UI-20260825-22 · Diálogo para generar el borrador de
 * alcance desde la respuesta de cuestionario recién persistida
 * (SPEC-003 §4.2 B6, BR-N220/231 — regla de oro).
 *
 *  - Lista plantillas ACTIVAS vía `trpc.comercial.plantillas.list`
 *    (sin UUID dummy, sin acceso directo a BD).
 *  - Al confirmar, invoca `trpc.comercial.alcance.generateDraft`
 *    con el `questionnaireResponseId` REAL (provisto por la página
 *    `/prospectos/[id]`) y el `templateId` seleccionado.
 *  - Muestra éxito con `role="status"` y expone el `scopeId` y
 *    `status` REALES al padre mediante `onSuccess` para que la UI
 *    pueda enlazar `/comercial/alcance/{scope.id}`.
 *  - NO avanza a cotización, OS ni Proyecto (esos cortes son de
 *    SPEC-004 / SPEC-005).
 *
 * Accesibilidad: `<Label htmlFor>`, `aria-required` cuando aplica,
 * errores con `role="alert"` enlazados por `aria-describedby`.
 */

import * as React from "react";
import { messages } from "@/shared/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface GenerarAlcanceDialogProps {
  /** UUID real de la respuesta del cuestionario (submitResponse). */
  questionnaireResponseId: string | null;
  /** Código del prospecto a mostrar como contexto. */
  prospectCode: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /**
   * Se invoca con el `ScopeDraftDTO` real devuelto por
   * `alcance.generateDraft` para que la página habilite el enlace
   * al detalle. La página NO debe inventar IDs; sólo propaga lo
   * entregado por el backend.
   */
  onSuccess?: (scope: {
    id: string;
    status: string;
    version: number;
  }) => void;
}

export function GenerarAlcanceDialog({
  questionnaireResponseId,
  prospectCode,
  open,
  onOpenChange,
  onSuccess,
}: GenerarAlcanceDialogProps) {
  const plantillasQ = trpc.comercial.plantillas.list.useQuery(undefined, {
    enabled: open,
  });
  const activeTemplates = React.useMemo(
    () => (plantillasQ.data ?? []).filter((t) => t.active),
    [plantillasQ.data],
  );

  const [templateId, setTemplateId] = React.useState("");
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [validationError, setValidationError] = React.useState<string | null>(
    null,
  );

  // Reset al reabrir.
  React.useEffect(() => {
    if (!open) {
      setTemplateId("");
      setSubmitError(null);
      setValidationError(null);
    }
  }, [open]);

  const generateDraft = trpc.comercial.alcance.generateDraft.useMutation({
    onError: (err) => {
      const code = err.data?.code ?? null;
      if (code === "SCOPE_NOT_FOUND") {
        setSubmitError(messages.alcance.generateError);
        return;
      }
      setSubmitError(err.message ?? messages.alcance.generateError);
    },
    onSuccess: (scope) => {
      setSubmitError(null);
      // `scope` es el `ScopeDraftDTO` real (alcance.generateDraft).
      onOpenChange(false);
      if (scope && typeof scope === "object" && "id" in scope) {
        onSuccess?.({
          id: (scope as { id: string }).id,
          status: String((scope as { status: unknown }).status),
          version: Number((scope as { version: unknown }).version ?? 1),
        });
      }
    },
  });

  const isPending = generateDraft.isPending;
  const isLoadingTemplates = plantillasQ.isLoading;
  const noTemplates =
    open && !isLoadingTemplates && activeTemplates.length === 0;
  const canSubmit =
    !isPending &&
    !noTemplates &&
    templateId.length > 0 &&
    questionnaireResponseId !== null;

  function onSubmit() {
    if (!questionnaireResponseId) {
      setValidationError(messages.alcance.responseMissingNote);
      return;
    }
    if (!templateId) {
      setValidationError(messages.alcance.generateSelectTemplate);
      return;
    }
    setValidationError(null);
    setSubmitError(null);
    generateDraft.mutate({
      questionnaireResponseId,
      templateId,
    });
  }

  const selectId = "generar-alcance-template";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{messages.alcance.generateTitle}</DialogTitle>
          <DialogDescription>
            {messages.alcance.generateSubtitle}
          </DialogDescription>
        </DialogHeader>

        {!questionnaireResponseId ? (
          <p
            role="alert"
            className="text-sm text-destructive"
            data-testid="generar-alcance-missing-response"
          >
            {messages.alcance.responseMissingNote}
          </p>
        ) : null}

        {noTemplates ? (
          <p
            role="alert"
            className="text-sm text-destructive"
            data-testid="generar-alcance-no-templates"
          >
            {messages.alcance.generateNoTemplates}
          </p>
        ) : (
          <div className="space-y-2">
            <label
              htmlFor={selectId}
              className="text-sm font-medium leading-none"
            >
              {messages.alcance.generateSourceLabel}
            </label>
            <p
              id="generar-alcance-source-help"
              className="text-xs text-muted-foreground"
            >
              {prospectCode}
            </p>
            <label
              htmlFor={selectId}
              className="text-sm font-medium leading-none"
            >
              {/* Reutiliza el campo `generate` como label visible. */}
              {messages.alcance.generate}
            </label>
            <select
              id={selectId}
              data-testid="generar-alcance-template-select"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                if (validationError) setValidationError(null);
              }}
              disabled={isPending || isLoadingTemplates}
              aria-required="true"
              aria-invalid={validationError ? true : undefined}
              aria-describedby="generar-alcance-template-help"
            >
              <option value="">
                {isLoadingTemplates
                  ? messages.alcance.generateLoadingTemplates
                  : messages.alcance.generateSelectTemplate}
              </option>
              {activeTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.name}
                </option>
              ))}
            </select>
            <p
              id="generar-alcance-template-help"
              className="text-xs text-muted-foreground"
            >
              {messages.alcance.generateTemplateHelp}
            </p>
          </div>
        )}

        {validationError ? (
          <p
            role="alert"
            className="text-sm text-destructive"
            data-testid="generar-alcance-validation-error"
          >
            {validationError}
          </p>
        ) : null}

        {submitError ? (
          <p
            role="alert"
            className="text-sm text-destructive"
            data-testid="generar-alcance-submit-error"
          >
            {submitError}
          </p>
        ) : null}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {messages.alcance.generateCancel}
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            data-testid="generar-alcance-submit"
          >
            {isPending
              ? messages.alcance.generateSubmitting
              : messages.alcance.generateSubmit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
