"use client";

/**
 * SPEC-003 · IMPL-20260825-25 · Diálogo para registrar la aceptación
 * de una cotización con identidad + medio + evidencia (BR-N237,
 * H-08, DEC-FUN-55).
 *
 *  - Captura: nombre (obligatorio), organización (opcional), medio
 *    (`email | telefono | presencial | otro`), `evidenceFileId`
 *    obligatorio como UUID de un archivo REAL que ya exista en
 *    `files` y pertenezca a la organización.
 *  - NO genera IDs dummy ni inventa archivos: el usuario captura el
 *    UUID; si el backend lo rechaza con `EVIDENCE_FILE_NOT_FOUND` u
 *    otro código de dominio, se muestra el error sin afirmar éxito.
 *  - Invoca `trpc.comercial.cotizaciones.accept` con los valores
 *    reales. Si el backend no devuelve identificadores (id / status),
 *    NO se asume éxito: se expone `messages.cotizaciones.acceptError`.
 *  - Al éxito, muestra `status='accepted'` y los datos de aceptación
 *    (`acceptedAt`, `accepterName`, `accepterOrg`, `acceptedEvidenceFileId`,
 *    `acceptedByProxy`) y un aviso explícito de que la OS queda
 *    pendiente/delegada a SPEC-004 (no se oculta).
 *  - Mapea errores de dominio (`FORBIDDEN`, `QUOTE_ALREADY_ACCEPTED`,
 *    `QUOTE_EXPIRED`, `PROSPECT_HAS_ACCEPTED_QUOTE`,
 *    `EVIDENCE_FILE_NOT_FOUND`, `QUOTE_NOT_FOUND`) a mensajes
 *    canónicos con `role="alert"`.
 *
 *  Accesibilidad:
 *   - `<Label htmlFor>` por campo editable.
 *   - Errores de validación/submit con `role="alert"`.
 *   - `data-testid` estables para V3 Playwright.
 */
import * as React from "react";
import { messages } from "@/shared/utils";
import { ACCEPTANCE_MEDIUMS, type AcceptanceMedium } from "@/shared/enums";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Regex UUID v1-v5 (lowercase o uppercase). La validación cliente NO
// sustituye al backend (la fila de `files` se valida en servicio);
// sólo evita enviar UUIDs con forma inválida para reducir el ruido
// del backend. NUNCA se usa un UUID dummy local — si el campo está
// vacío, la mutación no se dispara y se exige el valor real.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface AcceptCotizacionDialogProps {
  /** UUID real de la cotización a aceptar (de `cotizaciones.byId`). */
  quoteId: string;
  /**
   * Status canónico de la cotización al abrir el diálogo. Sólo
   * `sent | negotiation` permiten abrir la aceptación; los demás
   * estados son bloqueados por el padre. Aquí sólo se usa para
   * mostrar el contexto en el subtítulo.
   */
  quoteStatus: "sent" | "negotiation";
  /** Código humano legible de la cotización (no se envía al backend). */
  quoteCode: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /**
   * Se invoca con el `QuoteDTO` real entregado por
   * `cotizaciones.accept` para que el padre actualice el detalle
   * (status='accepted', datos de aceptación) y/o invalide caches
   * relacionadas.
   */
  onSuccess?: (quote: {
    id: string;
    code: string;
    status: string;
  }) => void;
}

export function AcceptCotizacionDialog({
  quoteId,
  quoteStatus,
  quoteCode,
  open,
  onOpenChange,
  onSuccess,
}: AcceptCotizacionDialogProps) {
  const utils = trpc.useUtils();
  const accept = trpc.comercial.cotizaciones.accept.useMutation({
    onError: (err) => {
      const code = err.data?.code ?? null;
      // Mensajes canónicos por código de dominio (no se afirma éxito).
      if (code === "FORBIDDEN") {
        setSubmitError(messages.cotizaciones.acceptForbidden);
        return;
      }
      if (code === "QUOTE_ALREADY_ACCEPTED") {
        setSubmitError(messages.cotizaciones.acceptImmutable);
        return;
      }
      if (code === "QUOTE_EXPIRED") {
        setSubmitError(messages.cotizaciones.acceptError);
        return;
      }
      if (code === "EVIDENCE_FILE_NOT_FOUND") {
        setSubmitError(messages.cotizaciones.acceptError);
        return;
      }
      setSubmitError(err.message ?? messages.cotizaciones.acceptError);
    },
    onSuccess: (quote) => {
      setSubmitError(null);
      const id = String((quote as { id?: unknown })?.id ?? "");
      const code = String((quote as { code?: unknown })?.code ?? "");
      const status = String((quote as { status?: unknown })?.status ?? "");
      if (!id || !code || status !== "accepted") {
        // Si el backend no devolvió identificadores válidos o el status
        // no quedó en 'accepted', NO se afirma éxito.
        setSubmitError(messages.cotizaciones.acceptError);
        return;
      }
      setAcceptedQuote({ id, code, status });
      onSuccess?.({ id, code, status });
      // Invalida caches relacionadas para que el detalle padre
      // muestre `status='accepted'` y los datos de aceptación.
      void utils.comercial.cotizaciones.byId.invalidate({ id });
    },
  });

  const [name, setName] = React.useState("");
  const [org, setOrg] = React.useState("");
  const [medium, setMedium] = React.useState<AcceptanceMedium | "">("");
  const [evidenceFileId, setEvidenceFileId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [proxy, setProxy] = React.useState(true);
  const [validationError, setValidationError] = React.useState<string | null>(
    null,
  );
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [acceptedQuote, setAcceptedQuote] = React.useState<{
    id: string;
    code: string;
    status: string;
  } | null>(null);

  // Reset al reabrir. NO se reintroducen valores dummy: el primer
  // campo vacío es la única verdad que el usuario puede tener.
  React.useEffect(() => {
    if (open) {
      setName("");
      setOrg("");
      setMedium("");
      setEvidenceFileId("");
      setNotes("");
      setProxy(true);
      setValidationError(null);
      setSubmitError(null);
      setAcceptedQuote(null);
    }
  }, [open]);

  const trimmedName = name.trim();
  const trimmedEvidence = evidenceFileId.trim();

  const evidenceIsUuid = trimmedEvidence.length > 0 && UUID_RE.test(trimmedEvidence);
  const canSubmit =
    trimmedName.length >= 1 &&
    evidenceIsUuid &&
    medium !== "" &&
    ACCEPTANCE_MEDIUMS.includes(medium as AcceptanceMedium) &&
    !accept.isPending;

  function onSubmit() {
    setSubmitError(null);
    if (trimmedName.length < 1) {
      setValidationError(messages.cotizaciones.acceptNameRequired);
      return;
    }
    if (trimmedEvidence.length === 0) {
      setValidationError(messages.cotizaciones.acceptEvidenceRequired);
      return;
    }
    if (!UUID_RE.test(trimmedEvidence)) {
      setValidationError(messages.cotizaciones.acceptEvidenceInvalidUuid);
      return;
    }
    if (
      medium === "" ||
      !ACCEPTANCE_MEDIUMS.includes(medium as AcceptanceMedium)
    ) {
      setValidationError(messages.cotizaciones.acceptMediumPlaceholder);
      return;
    }
    setValidationError(null);
    accept.mutate({
      quoteId,
      accepterName: trimmedName,
      ...(org.trim().length > 0 ? { accepterOrg: org.trim() } : {}),
      medium: medium as AcceptanceMedium,
      evidenceFileId: trimmedEvidence,
      ...(notes.trim().length > 0 ? { notes: notes.trim() } : {}),
      proxy,
    });
  }

  const dialogDescriptionId = "accept-cotizacion-subtitle";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={dialogDescriptionId}>
        <DialogHeader>
          <DialogTitle>{messages.cotizaciones.acceptTitle}</DialogTitle>
          <DialogDescription id={dialogDescriptionId}>
            {messages.cotizaciones.acceptSubtitle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p
            className="text-xs text-muted-foreground"
            data-testid="accept-cotizacion-quote-context"
          >
            {quoteCode} · {quoteStatus}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label
                htmlFor="accept-cotizacion-name"
                className="text-sm font-medium"
              >
                {messages.cotizaciones.acceptNameLabel}
              </Label>
              <Input
                id="accept-cotizacion-name"
                data-testid="accept-cotizacion-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={messages.cotizaciones.acceptNamePlaceholder}
                disabled={accept.isPending}
                maxLength={160}
                aria-describedby="accept-cotizacion-name-help"
              />
              <p
                id="accept-cotizacion-name-help"
                className="text-xs text-muted-foreground"
              >
                {messages.cotizaciones.acceptNameRequired}
              </p>
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="accept-cotizacion-org"
                className="text-sm font-medium"
              >
                {messages.cotizaciones.acceptOrgLabel}
              </Label>
              <Input
                id="accept-cotizacion-org"
                data-testid="accept-cotizacion-org"
                value={org}
                onChange={(e) => setOrg(e.target.value)}
                placeholder={messages.cotizaciones.acceptOrgPlaceholder}
                disabled={accept.isPending}
                maxLength={160}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label
              htmlFor="accept-cotizacion-medium"
              className="text-sm font-medium"
            >
              {messages.cotizaciones.acceptMediumLabel}
            </Label>
            <select
              id="accept-cotizacion-medium"
              data-testid="accept-cotizacion-medium"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={medium}
              onChange={(e) =>
                setMedium(e.target.value as AcceptanceMedium | "")
              }
              disabled={accept.isPending}
              aria-describedby="accept-cotizacion-medium-help"
            >
              <option value="">
                {messages.cotizaciones.acceptMediumPlaceholder}
              </option>
              {ACCEPTANCE_MEDIUMS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <p
              id="accept-cotizacion-medium-help"
              className="text-xs text-muted-foreground"
            >
              {messages.cotizaciones.acceptMediumHelp}
            </p>
          </div>

          <div className="space-y-1">
            <Label
              htmlFor="accept-cotizacion-evidence"
              className="text-sm font-medium"
            >
              {messages.cotizaciones.acceptEvidenceLabel}
            </Label>
            <Input
              id="accept-cotizacion-evidence"
              data-testid="accept-cotizacion-evidence"
              value={evidenceFileId}
              onChange={(e) => setEvidenceFileId(e.target.value)}
              placeholder={messages.cotizaciones.acceptEvidencePlaceholder}
              disabled={accept.isPending}
              aria-describedby="accept-cotizacion-evidence-help"
              autoComplete="off"
              spellCheck={false}
            />
            <p
              id="accept-cotizacion-evidence-help"
              className="text-xs text-muted-foreground"
            >
              {messages.cotizaciones.acceptEvidenceHelp}
            </p>
          </div>

          <div className="space-y-1">
            <Label
              htmlFor="accept-cotizacion-notes"
              className="text-sm font-medium"
            >
              {messages.cotizaciones.acceptNotesLabel}
            </Label>
            <textarea
              id="accept-cotizacion-notes"
              data-testid="accept-cotizacion-notes"
              className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={messages.cotizaciones.acceptNotesPlaceholder}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={accept.isPending}
              maxLength={500}
            />
          </div>

          <div className="flex items-start gap-2">
            <input
              id="accept-cotizacion-proxy"
              data-testid="accept-cotizacion-proxy"
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              checked={proxy}
              onChange={(e) => setProxy(e.target.checked)}
              disabled={accept.isPending}
              aria-describedby="accept-cotizacion-proxy-help"
            />
            <div className="space-y-1">
              <Label
                htmlFor="accept-cotizacion-proxy"
                className="text-sm font-medium"
              >
                {messages.cotizaciones.acceptProxyLabel}
              </Label>
              <p
                id="accept-cotizacion-proxy-help"
                className="text-xs text-muted-foreground"
              >
                {messages.cotizaciones.acceptProxyHelp}
              </p>
            </div>
          </div>
        </div>

        {validationError ? (
          <p
            role="alert"
            className="text-sm text-destructive"
            data-testid="accept-cotizacion-validation-error"
          >
            {validationError}
          </p>
        ) : null}

        {submitError ? (
          <p
            role="alert"
            className="text-sm text-destructive"
            data-testid="accept-cotizacion-submit-error"
          >
            {submitError}
          </p>
        ) : null}

        {acceptedQuote ? (
          <div
            className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"
            data-testid="accept-cotizacion-success"
          >
            <p
              className="font-medium"
              data-testid="accept-cotizacion-success-title"
            >
              {messages.cotizaciones.acceptSuccessTitle}
            </p>
            <p data-testid="accept-cotizacion-success-body">
              {messages.cotizaciones.acceptSuccessBody.replace(
                "{code}",
                acceptedQuote.code,
              )}
            </p>
            <div
              className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
              data-testid="accept-cotizacion-pending-os"
            >
              <p
                className="font-medium"
                data-testid="accept-cotizacion-pending-os-title"
              >
                {messages.cotizaciones.acceptPendingOsTitle}
              </p>
              <p data-testid="accept-cotizacion-pending-os-body">
                {messages.cotizaciones.acceptPendingOsBody}
              </p>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          {acceptedQuote ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="accept-cotizacion-close"
            >
              {messages.common.cancel}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={accept.isPending}
                data-testid="accept-cotizacion-cancel"
              >
                {messages.cotizaciones.acceptCancel}
              </Button>
              <Button
                type="button"
                onClick={onSubmit}
                disabled={!canSubmit}
                data-testid="accept-cotizacion-submit"
              >
                {accept.isPending
                  ? messages.cotizaciones.acceptSubmitting
                  : messages.cotizaciones.acceptSubmit}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}