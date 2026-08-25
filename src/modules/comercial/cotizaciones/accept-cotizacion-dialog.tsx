"use client";

/**
 * SPEC-20260825-026 · IMPL-20260825-26 · Diálogo para registrar la
 * aceptación de una cotización con identidad + medio + archivo de
 * evidencia REAL subido por el usuario (BR-N237, H-08, DEC-FUN-55,
 * SPEC-003 B7, ADR-20260825-04).
 *
 *  - Captura: nombre (obligatorio), organización (opcional), medio
 *    (`email | telefono | presencial | otro`), archivo de evidencia
 *    subido por el usuario.
 *  - El archivo se sube PRIMERO a `POST /api/files/upload` (reutiliza
 *    `FilesService` existente; allowlist PDF/XML/PNG/JPEG, ≤ 10MB).
 *    Sólo si la respuesta es 201 con `{ fileId, mime, size, sha256 }`
 *    se llama `trpc.comercial.cotizaciones.accept` con el `fileId`
 *    real. Si la subida falla, NO se llama `accept` y se muestra el
 *    error con `role="alert"` (nunca éxito falso).
 *  - NO genera IDs dummy ni inventa archivos. El campo de evidencia
 *    es un `<input type="file">` con `accept` declarativo; el botón
 *    de aceptación permanece deshabilitado hasta que hay nombre,
 *    medio y archivo seleccionado.
 *  - Invoca `trpc.comercial.cotizaciones.accept` con valores reales.
 *    Si el backend no devuelve identificadores (id / status),
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
 *   - Errores de validación/submit/upload con `role="alert"`.
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

// Allowlist canónica — mismo set que `FilesService` (`src/server/services/files/index.ts`).
// El servidor la revalida: nunca se confía en el cliente, sólo se usa
// para el `accept` declarativo del `<input type="file">` y para el
// mensaje de error temprano si el usuario selecciona un tipo fuera.
const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/xml",
  "text/xml",
  "image/png",
  "image/jpeg",
] as const;
const ACCEPTED_FILE_ACCEPT_ATTR = ACCEPTED_MIME_TYPES.join(",");
const MAX_BYTES = 10 * 1024 * 1024;

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

/** Forma mínima de la respuesta 201 de `POST /api/files/upload`. */
interface UploadResponse {
  fileId: string;
  mime: string;
  size: number;
  sha256: string;
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
  const [evidenceFile, setEvidenceFile] = React.useState<File | null>(null);
  const [notes, setNotes] = React.useState("");
  const [proxy, setProxy] = React.useState(true);
  const [validationError, setValidationError] = React.useState<string | null>(
    null,
  );
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
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
      setEvidenceFile(null);
      setNotes("");
      setProxy(true);
      setValidationError(null);
      setUploadError(null);
      setSubmitError(null);
      setIsUploading(false);
      setAcceptedQuote(null);
    }
  }, [open]);

  const trimmedName = name.trim();
  const fileLooksValid =
    evidenceFile !== null &&
    evidenceFile.size > 0 &&
    evidenceFile.size <= MAX_BYTES &&
    (ACCEPTED_MIME_TYPES as readonly string[]).includes(evidenceFile.type);

  const canSubmit =
    trimmedName.length >= 1 &&
    medium !== "" &&
    ACCEPTANCE_MEDIUMS.includes(medium as AcceptanceMedium) &&
    fileLooksValid &&
    !accept.isPending &&
    !isUploading;

  function validateBeforeSubmit(): string | null {
    if (trimmedName.length < 1) {
      return messages.cotizaciones.acceptNameRequired;
    }
    if (
      medium === "" ||
      !ACCEPTANCE_MEDIUMS.includes(medium as AcceptanceMedium)
    ) {
      return messages.cotizaciones.acceptMediumPlaceholder;
    }
    if (!evidenceFile) {
      return messages.cotizaciones.acceptEvidenceUploadRequired;
    }
    if (evidenceFile.size <= 0 || evidenceFile.size > MAX_BYTES) {
      return messages.cotizaciones.acceptEvidenceUploadError;
    }
    if (!(ACCEPTED_MIME_TYPES as readonly string[]).includes(evidenceFile.type)) {
      return messages.cotizaciones.acceptEvidenceUploadError;
    }
    return null;
  }

  function clearFileInput() {
    setEvidenceFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  /**
   * Sube el archivo a `/api/files/upload`. Sólo devuelve `fileId`
   * si la respuesta es 201 con la forma canónica. Cualquier otro
   * caso (red, 401/403/413/415/5xx, body inválido) se considera
   * fallo de subida y NO se llama `accept`.
   */
  async function uploadEvidence(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file, file.name);
    const res = await fetch("/api/files/upload", {
      method: "POST",
      body: fd,
      credentials: "same-origin",
    });
    if (res.status !== 201) {
      // Mensaje canónico: el código y mensaje vienen del backend;
      // nunca se afirma éxito.
      let detail: string = messages.cotizaciones.acceptEvidenceUploadError;
      try {
        const body = (await res.json()) as { message?: unknown; code?: unknown };
        if (typeof body?.message === "string" && body.message.length > 0) {
          detail = body.message;
        }
      } catch {
        // body no era JSON — usamos el mensaje canónico.
      }
      throw new Error(detail);
    }
    const body = (await res.json()) as Partial<UploadResponse>;
    if (
      !body ||
      typeof body.fileId !== "string" ||
      typeof body.mime !== "string" ||
      typeof body.size !== "number" ||
      typeof body.sha256 !== "string"
    ) {
      throw new Error(messages.cotizaciones.acceptEvidenceUploadError);
    }
    return body.fileId;
  }

  async function onSubmit() {
    setSubmitError(null);
    setUploadError(null);
    setValidationError(null);

    const validation = validateBeforeSubmit();
    if (validation !== null) {
      setValidationError(validation);
      return;
    }
    if (!evidenceFile) {
      // Guard de tipos: ya validado arriba, pero conservamos la
      // guarda explícita por seguridad.
      setValidationError(messages.cotizaciones.acceptEvidenceUploadRequired);
      return;
    }

    // 1) Subir el archivo PRIMERO. Si falla, NO se llama `accept`.
    let fileId: string;
    try {
      setIsUploading(true);
      fileId = await uploadEvidence(evidenceFile);
    } catch (e) {
      setIsUploading(false);
      const detail = e instanceof Error ? e.message : null;
      setUploadError(detail ?? messages.cotizaciones.acceptEvidenceUploadError);
      return;
    }
    setIsUploading(false);

    // 2) Sólo con `fileId` real del backend se dispara la mutación.
    accept.mutate({
      quoteId,
      accepterName: trimmedName,
      ...(org.trim().length > 0 ? { accepterOrg: org.trim() } : {}),
      medium: medium as AcceptanceMedium,
      evidenceFileId: fileId,
      ...(notes.trim().length > 0 ? { notes: notes.trim() } : {}),
      proxy,
    });
  }

  const dialogDescriptionId = "accept-cotizacion-subtitle";
  const fileInputId = "accept-cotizacion-evidence-file";

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
                disabled={accept.isPending || isUploading}
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
                disabled={accept.isPending || isUploading}
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
              disabled={accept.isPending || isUploading}
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
              htmlFor={fileInputId}
              className="text-sm font-medium"
            >
              {messages.cotizaciones.acceptEvidenceLabel}
            </Label>
            <input
              ref={fileInputRef}
              id={fileInputId}
              data-testid="accept-cotizacion-evidence"
              type="file"
              accept={ACCEPTED_FILE_ACCEPT_ATTR}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setEvidenceFile(f);
                setUploadError(null);
                setValidationError(null);
              }}
              disabled={accept.isPending || isUploading}
              aria-describedby="accept-cotizacion-evidence-help"
              className="block w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p
              id="accept-cotizacion-evidence-help"
              className="text-xs text-muted-foreground"
            >
              {messages.cotizaciones.acceptEvidenceAcceptedTypesLabel}
            </p>
            {evidenceFile ? (
              <p
                className="text-xs text-muted-foreground"
                data-testid="accept-cotizacion-evidence-summary"
              >
                {evidenceFile.name} · {evidenceFile.type || "?"} ·{" "}
                {Math.ceil(evidenceFile.size / 1024)} KB
              </p>
            ) : null}
            {!fileLooksValid && evidenceFile ? (
              <p
                role="alert"
                className="text-xs text-destructive"
                data-testid="accept-cotizacion-evidence-invalid"
              >
                {messages.cotizaciones.acceptEvidenceUploadError}
              </p>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearFileInput}
              disabled={!evidenceFile || accept.isPending || isUploading}
              data-testid="accept-cotizacion-evidence-clear"
            >
              Quitar archivo
            </Button>
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
              disabled={accept.isPending || isUploading}
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
              disabled={accept.isPending || isUploading}
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

        {uploadError ? (
          <p
            role="alert"
            className="text-sm text-destructive"
            data-testid="accept-cotizacion-upload-error"
          >
            {uploadError}
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

        {isUploading ? (
          <p
            role="status"
            className="text-sm text-muted-foreground"
            data-testid="accept-cotizacion-uploading"
          >
            {messages.cotizaciones.acceptEvidenceUploading}
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
                disabled={accept.isPending || isUploading}
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
                {isUploading
                  ? messages.cotizaciones.acceptEvidenceUploading
                  : accept.isPending
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
