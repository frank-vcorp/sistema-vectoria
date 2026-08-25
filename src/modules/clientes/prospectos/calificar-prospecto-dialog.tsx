"use client";

/**
 * SPEC-002-UI-20260824-05 · Calificar prospecto con cuestionario real
 * (BR-N148, SPEC-003 §4.2 B4).
 *
 * Componente cliente controlado por el detalle `/prospectos/[id]`.
 * Lista los cuestionarios **publicados** de la organización
 * (`trpc.comercial.cuestionarios.list`), filtra por `status==='published'`
 * en cliente y, al elegir uno, carga sus preguntas
 * (`listQuestions`). Renderiza cada pregunta según `answerType`:
 * `text`, `number`, `boolean`, `single_choice`, `multi_choice`.
 *
 * Flujo de envío (acorde al contrato existente):
 *  1. `submitResponse` con `content` (key por `code` de pregunta),
 *     `presupuestoDeclaradoCents` opcional y `projectType` opcional.
 *  2. Si la respuesta es exitosa, `prospectos.qualify` con el
 *     `questionnaireId` real obtenido del catálogo (nunca UUID dummy).
 *
 * Validación:
 *  - Preguntas `required` sin respuesta → bloquea envío y muestra error.
 *  - Errores de servidor se exponen con `role="alert"` y NO se
 *    borra el contexto del formulario (la UI nunca afirma éxito si
 *    la mutación falla).
 *
 * Accesibilidad:
 *  - Cada input lleva `<Label htmlFor>` y `aria-required` cuando
 *    aplica.
 *  - Errores con `role="alert"` enlazados por `aria-describedby`.
 *  - Roles semánticos (`radiogroup`, `group`).
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CalificarProspectoDialogProps {
  prospectId: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSuccess?: () => void;
}

/** Estructura flexible de opciones en `questionnaire_questions.options`. */
interface QuestionOption {
  value: string;
  label: string;
}

function readOptions(raw: unknown): QuestionOption[] {
  if (!Array.isArray(raw)) return [];
  const out: QuestionOption[] = [];
  for (const it of raw) {
    if (it && typeof it === "object" && "value" in it) {
      const v = (it as { value: unknown }).value;
      const l = (it as { label?: unknown }).label;
      if (typeof v === "string") {
        out.push({
          value: v,
          label: typeof l === "string" ? l : v,
        });
      }
    }
  }
  return out;
}

type AnswerValue = string | number | boolean | string[] | null;

function emptyForType(type: string): AnswerValue {
  switch (type) {
    case "multi_choice":
      return [];
    case "number":
      return "";
    case "boolean":
      return null;
    default:
      return "";
  }
}

function isAnswered(value: AnswerValue, type: string): boolean {
  if (type === "multi_choice") return Array.isArray(value) && value.length > 0;
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

function toAnswerTypeUnknown(type: string, value: AnswerValue): unknown {
  switch (type) {
    case "number": {
      if (typeof value === "number") return value;
      if (typeof value === "string" && value.trim().length > 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    }
    case "boolean":
      return typeof value === "boolean" ? value : null;
    case "multi_choice":
      return Array.isArray(value) ? value : [];
    default:
      return typeof value === "string" ? value : "";
  }
}

export function CalificarProspectoDialog({
  prospectId,
  open,
  onOpenChange,
  onSuccess,
}: CalificarProspectoDialogProps) {
  const utils = trpc.useUtils();
  const allQ = trpc.comercial.cuestionarios.list.useQuery(undefined, {
    enabled: open,
  });
  const published = React.useMemo(
    () => (allQ.data ?? []).filter((q) => q.status === "published"),
    [allQ.data],
  );

  const [questionnaireId, setQuestionnaireId] = React.useState("");
  const [answers, setAnswers] = React.useState<Record<string, AnswerValue>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [presupuestoMxn, setPresupuestoMxn] = React.useState("");
  const [projectType, setProjectType] = React.useState("");
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const questionsQ = trpc.comercial.cuestionarios.listQuestions.useQuery(
    { questionnaireId },
    { enabled: open && questionnaireId.length > 0 },
  );

  // Reset al cambiar de cuestionario o al reabrir.
  React.useEffect(() => {
    if (!open) {
      setQuestionnaireId("");
      setAnswers({});
      setErrors({});
      setPresupuestoMxn("");
      setProjectType("");
      setSubmitError(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (questionnaireId.length === 0) return;
    const list = questionsQ.data ?? [];
    const next: Record<string, AnswerValue> = {};
    for (const q of list) next[q.code] = emptyForType(q.answerType);
    setAnswers(next);
    setErrors({});
  }, [questionnaireId, questionsQ.data]);

  function setAnswer(code: string, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [code]: value }));
    if (errors[code]) {
      setErrors((prev) => {
        const cp = { ...prev };
        delete cp[code];
        return cp;
      });
    }
  }

  const questions = questionsQ.data ?? [];
  const questionnaireMissing =
    open && !allQ.isLoading && published.length === 0;

  const submitResponse = trpc.comercial.cuestionarios.submitResponse.useMutation(
    {
      onError: (err) => {
        setSubmitError(
          err.message ?? messages.prospectos.form.errors.createFailed,
        );
      },
    },
  );

  const qualifyMutation = trpc.clientes.prospectos.qualify.useMutation({
    onSuccess: () => {
      setSubmitError(null);
      void utils.clientes.prospectos.byId.invalidate({ prospectId });
      void utils.clientes.prospectos.list.invalidate();
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err) => {
      const code = err.data?.code ?? null;
      if (code === "QUESTIONNAIRE_REQUIRED") {
        setSubmitError(messages.prospectos.qualifyNeedsQuestionnaire);
        return;
      }
      setSubmitError(err.message ?? messages.prospectos.form.errors.createFailed);
    },
  });

  function validate(): boolean {
    if (!questionnaireId) {
      setSubmitError(messages.prospectos.qualifyDialog.selectQuestionnaire);
      return false;
    }
    const nextErrors: Record<string, string> = {};
    for (const q of questions) {
      const v = answers[q.code];
      if (q.required && !isAnswered(v ?? null, q.answerType)) {
        nextErrors[q.code] = messages.prospectos.qualifyDialog.requiredField;
        continue;
      }
      if (
        q.answerType === "number" &&
        typeof v === "string" &&
        v.trim().length > 0 &&
        !Number.isFinite(Number(v))
      ) {
        nextErrors[q.code] = messages.prospectos.qualifyDialog.invalidNumber;
      }
      if (
        (q.answerType === "single_choice" || q.answerType === "multi_choice") &&
        isAnswered(v ?? null, q.answerType)
      ) {
        const opts = readOptions(q.options).map((o) => o.value);
        if (q.answerType === "single_choice") {
          if (typeof v !== "string" || !opts.includes(v)) {
            nextErrors[q.code] = messages.prospectos.qualifyDialog.invalidChoice;
          }
        } else {
          const arr = Array.isArray(v) ? v : [];
          if (arr.some((x) => !opts.includes(x))) {
            nextErrors[q.code] = messages.prospectos.qualifyDialog.invalidChoice;
          }
        }
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setSubmitError(messages.prospectos.qualifyDialog.fillRequired);
      return false;
    }
    setErrors({});
    setSubmitError(null);
    return true;
  }

  function onSubmit() {
    if (!validate()) return;
    const content: Record<string, unknown> = {};
    for (const q of questions) {
      const raw = answers[q.code];
      content[q.code] = toAnswerTypeUnknown(
        q.answerType,
        raw === undefined ? emptyForType(q.answerType) : raw,
      );
    }
    const presupuestoCents =
      presupuestoMxn.trim().length > 0 && Number.isFinite(Number(presupuestoMxn))
        ? Math.round(Number(presupuestoMxn) * 100)
        : null;
    const projectTypeValue =
      projectType.trim().length > 0 ? projectType.trim() : undefined;

    submitResponse.mutate(
      {
        questionnaireId,
        prospectId,
        content,
        presupuestoDeclaradoCents: presupuestoCents,
        ...(projectTypeValue !== undefined ? { projectType: projectTypeValue } : {}),
      },
      {
        onSuccess: () => {
          qualifyMutation.mutate({ prospectId, questionnaireId });
        },
      },
    );
  }

  const isPending = submitResponse.isPending || qualifyMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{messages.prospectos.qualifyDialog.title}</DialogTitle>
          <DialogDescription>
            {messages.prospectos.qualifyDialog.subtitle}
          </DialogDescription>
        </DialogHeader>

        {questionnaireMissing ? (
          <p
            role="alert"
            className="text-sm text-destructive"
            data-testid="calificar-no-questionnaire"
          >
            {messages.prospectos.qualifyBlockedBody}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="calificar-questionnaire">
                {messages.prospectos.qualifyDialog.questionnaireLabel}
              </Label>
              <select
                id="calificar-questionnaire"
                data-testid="calificar-questionnaire-select"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={questionnaireId}
                onChange={(e) => setQuestionnaireId(e.target.value)}
                disabled={isPending || allQ.isLoading}
                aria-describedby="calificar-questionnaire-help"
              >
                <option value="">
                  {allQ.isLoading
                    ? messages.common.loading
                    : messages.prospectos.qualifyDialog.questionnairePlaceholder}
                </option>
                {published.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.code} · {q.name}
                  </option>
                ))}
              </select>
              <p
                id="calificar-questionnaire-help"
                className="text-xs text-muted-foreground"
              >
                {messages.prospectos.qualifyDialog.requiredHint}
              </p>
            </div>

            {questionnaireId.length > 0 && questionsQ.isLoading ? (
              <p className="text-sm text-muted-foreground">
                {messages.common.loading}
              </p>
            ) : null}

            {questionnaireId.length > 0 &&
            !questionsQ.isLoading &&
            questions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {messages.prospectos.qualifyDialog.noQuestions}
              </p>
            ) : null}

            <div className="space-y-3">
              {questions.map((q) => {
                const id = `calificar-q-${q.code}`;
                const err = errors[q.code];
                const value = answers[q.code];
                return (
                  <div key={q.id} className="space-y-1">
                    <Label htmlFor={id}>
                      {q.prompt}
                      {q.required ? (
                        <span
                          aria-hidden="true"
                          className="ml-1 text-destructive"
                        >
                          *
                        </span>
                      ) : null}
                    </Label>
                    {q.helpText ? (
                      <p className="text-xs text-muted-foreground">
                        {q.helpText}
                      </p>
                    ) : null}
                    <QuestionInput
                      questionId={id}
                      type={q.answerType}
                      required={q.required}
                      value={
                        value === undefined ? emptyForType(q.answerType) : value
                      }
                      options={readOptions(q.options)}
                      onChange={(v) => setAnswer(q.code, v)}
                      disabled={isPending}
                      hasError={Boolean(err)}
                      errorId={err ? `${id}-err` : undefined}
                    />
                    {err ? (
                      <p
                        id={`${id}-err`}
                        role="alert"
                        className="text-xs text-destructive"
                      >
                        {err}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="space-y-3 border-t pt-3">
              <div className="space-y-1">
                <Label htmlFor="calificar-presupuesto">
                  {messages.prospectos.qualifyDialog.presupuestoLabel}
                </Label>
                <Input
                  id="calificar-presupuesto"
                  name="presupuesto"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={presupuestoMxn}
                  onChange={(e) => setPresupuestoMxn(e.target.value)}
                  disabled={isPending}
                  aria-describedby="calificar-presupuesto-help"
                  data-testid="calificar-presupuesto-input"
                />
                <p
                  id="calificar-presupuesto-help"
                  className="text-xs text-muted-foreground"
                >
                  {messages.prospectos.qualifyDialog.presupuestoHint}
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="calificar-project-type">
                  {messages.prospectos.qualifyDialog.projectTypeLabel}
                </Label>
                <Input
                  id="calificar-project-type"
                  name="projectType"
                  type="text"
                  maxLength={40}
                  value={projectType}
                  onChange={(e) => setProjectType(e.target.value)}
                  disabled={isPending}
                  placeholder={
                    messages.prospectos.qualifyDialog.projectTypePlaceholder
                  }
                  data-testid="calificar-project-type-input"
                />
              </div>
            </div>

            {submitError ? (
              <p
                role="alert"
                className="text-sm text-destructive"
                data-testid="calificar-submit-error"
              >
                {submitError}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {messages.prospectos.qualifyDialog.cancel}
          </Button>
          <Button
            type="button"
            disabled={isPending || questionnaireMissing}
            onClick={onSubmit}
            data-testid="calificar-submit"
          >
            {isPending
              ? messages.prospectos.qualifyDialog.submitting
              : messages.prospectos.qualifyDialog.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface QuestionInputProps {
  questionId: string;
  type: string;
  required: boolean;
  value: AnswerValue;
  options: QuestionOption[];
  onChange: (next: AnswerValue) => void;
  disabled: boolean;
  hasError: boolean;
  errorId: string | undefined;
}

function QuestionInput({
  questionId,
  type,
  required,
  value,
  options,
  onChange,
  disabled,
  hasError,
  errorId,
}: QuestionInputProps) {
  const common = {
    id: questionId,
    disabled,
    "aria-required": required || undefined,
    "aria-invalid": hasError || undefined,
    "aria-describedby": errorId,
  } as const;

  if (type === "text" || type === "date") {
    return (
      <Input
        id={questionId}
        type={type === "date" ? "date" : "text"}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-required={required || undefined}
        aria-invalid={hasError || undefined}
        aria-describedby={errorId}
      />
    );
  }
  if (type === "number" || type === "scale") {
    return (
      <Input
        id={questionId}
        type="number"
        inputMode="decimal"
        min={type === "scale" ? 1 : undefined}
        max={type === "scale" ? 10 : undefined}
        value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-required={required || undefined}
        aria-invalid={hasError || undefined}
        aria-describedby={errorId}
      />
    );
  }
  if (type === "boolean") {
    return (
      <div role="radiogroup" aria-labelledby={questionId} className="flex gap-3">
        {[true, false].map((v) => (
          <label key={String(v)} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={questionId}
              value={String(v)}
              checked={value === v}
              onChange={() => onChange(v)}
              disabled={disabled}
            />
            <span>{v ? "Sí" : "No"}</span>
          </label>
        ))}
        {required ? (
          <span className="sr-only" aria-hidden="false">
            Campo obligatorio
          </span>
        ) : null}
      </div>
    );
  }
  if (type === "single_choice") {
    if (options.length === 0) {
      return (
        <Input
          id={questionId}
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-required={required || undefined}
          aria-invalid={hasError || undefined}
          aria-describedby={errorId}
          placeholder="—"
        />
      );
    }
    return (
      <select
        id={questionId}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-required={required || undefined}
        aria-invalid={hasError || undefined}
        aria-describedby={errorId}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (type === "multi_choice") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div role="group" aria-labelledby={questionId} className="space-y-1">
        {options.map((o) => {
          const checked = arr.includes(o.value);
          return (
            <label
              key={o.value}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                value={o.value}
                checked={checked}
                onChange={(e) => {
                  if (e.target.checked) {
                    onChange([...arr, o.value]);
                  } else {
                    onChange(arr.filter((x) => x !== o.value));
                  }
                }}
                disabled={disabled}
                aria-required={required || undefined}
              />
              <span>{o.label}</span>
            </label>
          );
        })}
      </div>
    );
  }
  // Fallback textual (evita perder respuesta si el tipo no es soportado).
  return (
    <Input
      {...common}
      type="text"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}