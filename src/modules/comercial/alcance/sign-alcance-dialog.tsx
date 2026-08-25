"use client";

/**
 * SPEC-003 B6 · IMPL-20260825-23 · Diálogo para firmar el alcance
 * (BR-N51/52/231, SPEC-003 §4.2).
 *
 *  - Motivo obligatorio ≥3 caracteres (ScopeSignInputSchema en
 *    `src/shared/zod`; servicio `createScopeService().sign`).
 *  - Invoca `trpc.comercial.alcance.sign({ scopeId, reason })`.
 *    El backend exige `firmar_alcance`; si el actor no lo tiene,
 *    lanza error y la UI lo muestra con `role="alert"`.
 *  - `onSuccess` expone el `ScopeDraftDTO` real (status='signed',
 *    signedAt, signedBy, signedReason) al detalle para que la
 *    página refresque su cache local sin inventar campos.
 *  - NO inventa IDs ni acciones; sólo propaga lo entregado por el
 *    backend.
 *
 * Accesibilidad: `<Label htmlFor>`, `aria-required`, errores con
 * `role="alert"` enlazados por `aria-describedby`.
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

interface SignAlcanceDialogProps {
  /** UUID real del alcance (`alcance.byId`). */
  scopeId: string;
  /** Código del prospecto o contexto para mostrar en el subtítulo. */
  scopeContext?: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /**
   * Se invoca con el `ScopeDraftDTO` real devuelto por `alcance.sign`
   * para que el padre refresque su UI con `status='signed'` y los
   * campos `signedAt`/`signedBy`/`signedReason`.
   */
  onSuccess?: (scope: {
    id: string;
    status: string;
    version: number;
    signedAt: unknown;
    signedBy: unknown;
    signedReason: unknown;
  }) => void;
}

export function SignAlcanceDialog({
  scopeId,
  scopeContext,
  open,
  onOpenChange,
  onSuccess,
}: SignAlcanceDialogProps) {
  const [reason, setReason] = React.useState("");
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [validationError, setValidationError] = React.useState<string | null>(
    null,
  );

  // Reset al reabrir.
  React.useEffect(() => {
    if (!open) {
      setReason("");
      setSubmitError(null);
      setValidationError(null);
    }
  }, [open]);

  const sign = trpc.comercial.alcance.sign.useMutation({
    onError: (err) => {
      const code = err.data?.code ?? null;
      if (code === "FORBIDDEN") {
        setSubmitError(messages.alcance.signForbidden);
        return;
      }
      if (code === "SCOPE_SIGN_FORBIDDEN") {
        setSubmitError(err.message ?? messages.alcance.signError);
        return;
      }
      if (code === "SCOPE_ALREADY_SIGNED") {
        setSubmitError(err.message ?? messages.alcance.signImmutableNote);
        return;
      }
      setSubmitError(err.message ?? messages.alcance.signError);
    },
    onSuccess: (scope) => {
      setSubmitError(null);
      onOpenChange(false);
      if (scope && typeof scope === "object" && "id" in scope) {
        const s = scope as {
          id: string;
          status: string;
          version: number;
          signedAt: unknown;
          signedBy: unknown;
          signedReason: unknown;
        };
        onSuccess?.({
          id: s.id,
          status: String(s.status),
          version: Number(s.version ?? 1),
          signedAt: s.signedAt,
          signedBy: s.signedBy,
          signedReason: s.signedReason,
        });
      }
    },
  });

  const isPending = sign.isPending;
  const reasonTrimmed = reason.trim();
  const reasonValid = reasonTrimmed.length >= 3;

  function onSubmit() {
    if (!reasonValid) {
      setValidationError(messages.alcance.signReasonMinLength);
      return;
    }
    setValidationError(null);
    setSubmitError(null);
    sign.mutate({ scopeId, reason: reasonTrimmed });
  }

  const textareaId = "sign-alcance-reason";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{messages.alcance.signTitle}</DialogTitle>
          <DialogDescription>
            {messages.alcance.signSubtitle}
            {scopeContext ? (
              <span className="mt-1 block text-xs text-muted-foreground">
                {scopeContext}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label
            htmlFor={textareaId}
            className="text-sm font-medium leading-none"
          >
            {messages.alcance.signReasonLabel}
          </label>
          <textarea
            id={textareaId}
            data-testid="sign-alcance-reason"
            className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            placeholder={messages.alcance.signReasonPlaceholder}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (validationError) setValidationError(null);
            }}
            disabled={isPending}
            aria-required="true"
            aria-invalid={validationError ? true : undefined}
            aria-describedby="sign-alcance-reason-help"
          />
          <p
            id="sign-alcance-reason-help"
            className="text-xs text-muted-foreground"
          >
            {messages.alcance.signReasonPlaceholder}
          </p>
        </div>

        {validationError ? (
          <p
            role="alert"
            className="text-sm text-destructive"
            data-testid="sign-alcance-validation-error"
          >
            {validationError}
          </p>
        ) : null}

        {submitError ? (
          <p
            role="alert"
            className="text-sm text-destructive"
            data-testid="sign-alcance-submit-error"
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
            {messages.alcance.signCancel}
          </Button>
          <Button
            type="button"
            disabled={isPending || !reasonValid}
            onClick={onSubmit}
            data-testid="sign-alcance-submit"
          >
            {isPending
              ? messages.alcance.signSubmitting
              : messages.alcance.signSubmit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}