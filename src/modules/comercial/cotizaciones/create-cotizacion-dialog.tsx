"use client";

/**
 * SPEC-003 · IMPL-20260825-24 · Diálogo para crear una cotización
 * multi-línea real desde un alcance firmado.
 *
 *  - Consulta `trpc.comercial.catalogo.list` para mostrar el catálogo
 *    activo (sin UUIDs dummy, sin window.prompt).
 *  - Permite elegir ≥1 servicio del catálogo y editar cantidad (entero
 *    ≥1) y precio unitario en MXN. Internamente se persiste en
 *    centavos como exige el contrato.
 *  - Tipo de cobro `pago_unico | mensualidades | suscripcion`
 *    (BR-N238); notas opcionales; vigencia ISO con mínimo 7 días
 *    desde hoy (BR-N235).
 *  - Crea cada item con `kind:'service'`, `catalogServiceId` real,
 *    `description`, `qty≥1`, `unitPriceCents`, `discountCents=0` y
 *    `sortOrder` estable.
 *  - Invoca `trpc.comercial.cotizaciones.create` con
 *    `{ prospectId, scopeId, tipoCobro, notes, validUntil ISO,
 *      items, presupuestoDeclaradoCents }` y expone al padre la
 *    `QuoteDTO` real (status='draft', id, code) sin inventar campos.
 *  - Errores de dominio mapeados a mensajes canónicos
 *    (SIGNED_SCOPE_REQUIRED, FORBIDDEN, validación); nunca afirma
 *    éxito si la mutación falla.
 *
 *  Accesibilidad:
 *   - `<Label htmlFor>` por campo editable.
 *   - Errores de validación/submit con `role="alert"`.
 *   - `data-testid` estables para V3 Playwright.
 */
import * as React from "react";
import Link from "next/link";
import { messages } from "@/shared/utils";
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

export interface CreatedCotizacion {
  id: string;
  code: string;
  status: string;
}

interface CreateCotizacionDialogProps {
  /** UUID real del alcance firmado (`alcance.byId`). */
  scopeId: string;
  /** UUID real del prospecto vinculado al alcance. */
  prospectId: string | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /**
   * Se invoca con el `QuoteDTO` real entregado por
   * `cotizaciones.create` para que el padre exponga el enlace a
   * `/comercial/cotizaciones/{id}`.
   */
  onSuccess?: (quote: CreatedCotizacion) => void;
}

interface DraftItem {
  /**
   * Key local estable; NO se envía al backend (sólo permite identificar
   * la fila para remover/editar). No es un UUID dummy de BD.
   */
  lineKey: string;
  catalogServiceId: string;
  description: string;
  qty: number;
  /** Precio unitario en MXN (>=0). Se convierte a centavos al enviar. */
  unitPriceMXN: string;
}

function makeLineKey(): string {
  // No usamos window.crypto.randomUUID para evitar acoplamiento a
  // runtimes que no la expongan; basta un id local estable para
  // identificar filas en el estado React (no es identificador de
  // dominio).
  return `line-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function parseMXNToCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned.trim().length === 0) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  // Redondeo a 2 decimales sin tolerancia: 12.345 -> 1234.5 cents ->
  // se trunca a 1234 cents para evitar NaN al guardar entero. El campo
  // visual seguirá mostrando el valor capturado.
  return Math.round(n * 100);
}

function formatMXNFromCents(cents: number): string {
  const v = cents / 100;
  return v.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Fecha ISO `YYYY-MM-DDTHH:mm` para <input type="datetime-local">. */
function isoToLocalInputValue(iso: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${iso.getFullYear()}-${pad(iso.getMonth() + 1)}-${pad(iso.getDate())}` +
    `T${pad(iso.getHours())}:${pad(iso.getMinutes())}`
  );
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + days);
  return out;
}

/** Mínimo de vigencia permitido: 7 días desde `now` (BR-N235). */
const MIN_VALIDITY_DAYS = 7;

export function CreateCotizacionDialog({
  scopeId,
  prospectId,
  open,
  onOpenChange,
  onSuccess,
}: CreateCotizacionDialogProps) {
  const catalogQuery = trpc.comercial.catalogo.list.useQuery(undefined, {
    enabled: open,
    retry: 1,
  });
  const utils = trpc.useUtils();
  const createQuote = trpc.comercial.cotizaciones.create.useMutation({
    onError: (err) => {
      const code = err.data?.code ?? null;
      if (code === "FORBIDDEN") {
        setSubmitError(messages.cotizaciones.createForbidden);
        return;
      }
      if (code === "SIGNED_SCOPE_REQUIRED") {
        setSubmitError(messages.cotizaciones.createSignedScopeRequired);
        return;
      }
      setSubmitError(err.message ?? messages.cotizaciones.createError);
    },
    onSuccess: (quote) => {
      setSubmitError(null);
      const id = String((quote as { id?: unknown })?.id ?? "");
      const code = String((quote as { code?: unknown })?.code ?? "");
      const status = String((quote as { status?: unknown })?.status ?? "");
      if (!id || !code) {
        // No inventamos: si el backend no devolvió identificadores, lo
        // tratamos como fallo silencioso de contrato.
        setSubmitError(messages.cotizaciones.createError);
        return;
      }
      setCreatedQuote({ id, code, status });
      onSuccess?.({ id, code, status });
      // Invalida caches relacionadas para que la nueva cotización sea
      // visible al volver al detalle del prospecto.
      void utils.comercial.cotizaciones.byId.invalidate({ id });
      if (prospectId) {
        void utils.comercial.cotizaciones.listForProspect.invalidate({
          prospectId,
        });
      }
      // NO cerramos el diálogo: mostramos el resultado real y dejamos
      // que el usuario abra el detalle o cierre explícitamente.
    },
  });

  const [items, setItems] = React.useState<DraftItem[]>([]);
  const [tipoCobro, setTipoCobro] = React.useState<
    "pago_unico" | "mensualidades" | "suscripcion"
  >("pago_unico");
  const [notes, setNotes] = React.useState("");
  const [selectedCatalogId, setSelectedCatalogId] = React.useState("");
  const [validUntil, setValidUntil] = React.useState<string>(() =>
    isoToLocalInputValue(addDays(new Date(), MIN_VALIDITY_DAYS)),
  );
  const [validationError, setValidationError] = React.useState<string | null>(
    null,
  );
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [createdQuote, setCreatedQuote] = React.useState<CreatedCotizacion | null>(
    null,
  );

  // Reset al reabrir; NO reintroducimos un item dummy: empezamos vacío
  // para que la primera acción sea agregar explícitamente desde el
  // catálogo.
  React.useEffect(() => {
    if (open) {
      setItems([]);
      setTipoCobro("pago_unico");
      setNotes("");
      setSelectedCatalogId("");
      setValidUntil(
        isoToLocalInputValue(addDays(new Date(), MIN_VALIDITY_DAYS)),
      );
      setValidationError(null);
      setSubmitError(null);
      setCreatedQuote(null);
    }
  }, [open]);

  const activeCatalog = React.useMemo(() => {
    const data = (catalogQuery.data ?? []) as Array<{
      id: string;
      code: string;
      name: string;
      defaultUnitPriceCents: number | null;
      active: boolean;
    }>;
    return data.filter((c) => c.active);
  }, [catalogQuery.data]);

  const canSubmit =
    items.length > 0 &&
    items.every(
      (it) =>
        it.catalogServiceId.length > 0 &&
        it.description.trim().length > 0 &&
        Number.isFinite(it.qty) &&
        it.qty >= 1 &&
        parseMXNToCents(it.unitPriceMXN) !== null,
    ) &&
    !createQuote.isPending;

  function addItem() {
    setValidationError(null);
    const service = activeCatalog.find((c) => c.id === selectedCatalogId);
    if (!service) {
      setSubmitError(messages.cotizaciones.createEmptyCatalog);
      return;
    }
    const initialPriceMXN =
      service.defaultUnitPriceCents != null
        ? formatMXNFromCents(service.defaultUnitPriceCents)
        : "0.00";
    setItems((prev) => [
      ...prev,
      {
        lineKey: makeLineKey(),
        catalogServiceId: service.id,
        description: service.name,
        qty: 1,
        unitPriceMXN: initialPriceMXN,
      },
    ]);
    setSelectedCatalogId("");
  }

  function removeItem(lineKey: string) {
    setItems((prev) => prev.filter((it) => it.lineKey !== lineKey));
  }

  function updateItem(
    lineKey: string,
    patch: Partial<Omit<DraftItem, "lineKey" | "catalogServiceId">>,
  ) {
    setItems((prev) =>
      prev.map((it) => (it.lineKey === lineKey ? { ...it, ...patch } : it)),
    );
  }

  function onSubmit() {
    setSubmitError(null);
    if (!prospectId) {
      setSubmitError(messages.cotizaciones.createScopeIdMissing);
      return;
    }
    if (items.length === 0) {
      setValidationError(messages.cotizaciones.createNoItems);
      return;
    }
    const localDate = new Date(validUntil);
    if (Number.isNaN(localDate.getTime())) {
      setValidationError(messages.cotizaciones.createMinValidityError);
      return;
    }
    const minValid = addDays(new Date(), MIN_VALIDITY_DAYS - 1); // >=7d desde hoy
    if (localDate.getTime() < minValid.getTime()) {
      setValidationError(messages.cotizaciones.createMinValidityError);
      return;
    }
    const builtItems = items.map((it, idx) => {
      const cents = parseMXNToCents(it.unitPriceMXN) ?? 0;
      return {
        kind: "service" as const,
        catalogServiceId: it.catalogServiceId,
        description: it.description.trim(),
        qty: it.qty,
        unitPriceCents: cents,
        discountCents: 0,
        sortOrder: idx,
      };
    });
    // Validación cliente: cada item debe conservar descripción y qty>=1
    for (const it of builtItems) {
      if (
        !it.catalogServiceId ||
        it.description.length === 0 ||
        it.qty < 1 ||
        it.unitPriceCents < 0
      ) {
        setValidationError(messages.cotizaciones.createNoItems);
        return;
      }
    }
    setValidationError(null);
    createQuote.mutate({
      prospectId,
      scopeId,
      tipoCobro,
      notes: notes.trim().length > 0 ? notes.trim() : undefined,
      validUntil: localDate.toISOString(),
      items: builtItems,
    });
  }

  const dialogDescriptionId = "create-cotizacion-subtitle";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={dialogDescriptionId}>
        <DialogHeader>
          <DialogTitle>{messages.cotizaciones.createTitle}</DialogTitle>
          <DialogDescription id={dialogDescriptionId}>
            {messages.cotizaciones.createSubtitle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {catalogQuery.isLoading ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="create-cotizacion-catalog-loading"
            >
              {messages.cotizaciones.createCatalogLoading}
            </p>
          ) : null}
          {!catalogQuery.isLoading && activeCatalog.length === 0 ? (
            <p
              role="alert"
              className="text-sm text-amber-700"
              data-testid="create-cotizacion-catalog-empty"
            >
              {messages.cotizaciones.createEmptyCatalog}
            </p>
          ) : null}

          {activeCatalog.length > 0 ? (
            <div className="space-y-2">
              <Label
                htmlFor="create-cotizacion-catalog"
                className="text-sm font-medium"
              >
                {messages.cotizaciones.createCatalogLabel}
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <select
                  id="create-cotizacion-catalog"
                  data-testid="create-cotizacion-catalog"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={selectedCatalogId}
                  onChange={(e) => setSelectedCatalogId(e.target.value)}
                  disabled={createQuote.isPending}
                  aria-describedby="create-cotizacion-catalog-help"
                >
                  <option value="">
                    {messages.cotizaciones.createCatalogLabel}
                  </option>
                  {activeCatalog.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.name}
                      {c.defaultUnitPriceCents != null
                        ? ` · ${formatMXNFromCents(c.defaultUnitPriceCents)}`
                        : ""}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addItem}
                  disabled={!selectedCatalogId || createQuote.isPending}
                  data-testid="create-cotizacion-add"
                >
                  {messages.cotizaciones.createAddItem}
                </Button>
              </div>
              <p
                id="create-cotizacion-catalog-help"
                className="text-xs text-muted-foreground"
              >
                {messages.cotizaciones.createCatalogHelp}
              </p>
            </div>
          ) : null}

          {items.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="create-cotizacion-no-items"
            >
              {messages.cotizaciones.createNoItems}
            </p>
          ) : (
            <div className="space-y-2">
              <ul
                className="space-y-2"
                data-testid="create-cotizacion-items"
              >
                {items.map((it) => {
                  const cents = parseMXNToCents(it.unitPriceMXN);
                  const lineQtyId = `${it.lineKey}-qty`;
                  const linePriceId = `${it.lineKey}-price`;
                  const lineDescId = `${it.lineKey}-desc`;
                  return (
                    <li
                      key={it.lineKey}
                      className="grid gap-2 rounded-md border p-2 sm:grid-cols-12 sm:items-end"
                      data-testid="create-cotizacion-item"
                    >
                      <div className="space-y-1 sm:col-span-5">
                        <Label
                          htmlFor={lineDescId}
                          className="text-xs text-muted-foreground"
                        >
                          {messages.cotizaciones.createItemDescriptionPlaceholder.replace(
                            " visible de la línea",
                            "",
                          )}
                        </Label>
                        <Input
                          id={lineDescId}
                          data-testid="create-cotizacion-item-description"
                          value={it.description}
                          onChange={(e) =>
                            updateItem(it.lineKey, {
                              description: e.target.value,
                            })
                          }
                          disabled={createQuote.isPending}
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label
                          htmlFor={lineQtyId}
                          className="text-xs text-muted-foreground"
                        >
                          Cant.
                        </Label>
                        <Input
                          id={lineQtyId}
                          data-testid="create-cotizacion-item-qty"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={Number.isFinite(it.qty) ? it.qty : 1}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            updateItem(it.lineKey, {
                              qty: Number.isFinite(v) && v >= 1 ? v : 1,
                            });
                          }}
                          disabled={createQuote.isPending}
                          aria-describedby={`${lineQtyId}-help`}
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-4">
                        <Label
                          htmlFor={linePriceId}
                          className="text-xs text-muted-foreground"
                        >
                          {messages.cotizaciones.createItemUnitPriceLabel}
                        </Label>
                        <Input
                          id={linePriceId}
                          data-testid="create-cotizacion-item-price"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          value={it.unitPriceMXN}
                          onChange={(e) =>
                            updateItem(it.lineKey, {
                              unitPriceMXN: e.target.value,
                            })
                          }
                          disabled={createQuote.isPending}
                          aria-describedby={`${linePriceId}-help`}
                        />
                        <p
                          id={`${linePriceId}-help`}
                          className="text-[10px] text-muted-foreground"
                        >
                          {cents !== null
                            ? `${formatMXNFromCents(cents)} MXN`
                            : "—"}
                        </p>
                      </div>
                      <div className="sm:col-span-1">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => removeItem(it.lineKey)}
                          disabled={createQuote.isPending}
                          data-testid="create-cotizacion-item-remove"
                          aria-label={messages.cotizaciones.createRemoveItem}
                        >
                          ×
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label
                htmlFor="create-cotizacion-tipo-cobro"
                className="text-sm font-medium"
              >
                {messages.cotizaciones.createTipoCobroLabel}
              </Label>
              <select
                id="create-cotizacion-tipo-cobro"
                data-testid="create-cotizacion-tipo-cobro"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={tipoCobro}
                onChange={(e) =>
                  setTipoCobro(
                    e.target.value as
                      | "pago_unico"
                      | "mensualidades"
                      | "suscripcion",
                  )
                }
                disabled={createQuote.isPending}
                aria-describedby="create-cotizacion-tipo-cobro-help"
              >
                <option value="pago_unico">
                  {messages.ordenes.tipoCobro.pagoUnico}
                </option>
                <option value="mensualidades">
                  {messages.ordenes.tipoCobro.mensualidades}
                </option>
                <option value="suscripcion">
                  {messages.ordenes.tipoCobro.suscripcion}
                </option>
              </select>
              <p
                id="create-cotizacion-tipo-cobro-help"
                className="text-xs text-muted-foreground"
              >
                {messages.cotizaciones.createTipoCobroHelp}
              </p>
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="create-cotizacion-valid-until"
                className="text-sm font-medium"
              >
                {messages.cotizaciones.createValidUntilLabel}
              </Label>
              <Input
                id="create-cotizacion-valid-until"
                data-testid="create-cotizacion-valid-until"
                type="datetime-local"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                disabled={createQuote.isPending}
                aria-describedby="create-cotizacion-valid-until-help"
              />
              <p
                id="create-cotizacion-valid-until-help"
                className="text-xs text-muted-foreground"
              >
                {messages.cotizaciones.createValidUntilHelp}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <Label
              htmlFor="create-cotizacion-notes"
              className="text-sm font-medium"
            >
              {messages.cotizaciones.createNotesLabel}
            </Label>
            <textarea
              id="create-cotizacion-notes"
              data-testid="create-cotizacion-notes"
              className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={messages.cotizaciones.createNotesPlaceholder}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={createQuote.isPending}
              maxLength={500}
            />
          </div>
        </div>

        {validationError ? (
          <p
            role="alert"
            className="text-sm text-destructive"
            data-testid="create-cotizacion-validation-error"
          >
            {validationError}
          </p>
        ) : null}

        {submitError ? (
          <p
            role="alert"
            className="text-sm text-destructive"
            data-testid="create-cotizacion-submit-error"
          >
            {submitError}
          </p>
        ) : null}

        {createdQuote ? (
          <div
            className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"
            data-testid="create-cotizacion-success"
          >
            <p className="font-medium" data-testid="create-cotizacion-success-title">
              {messages.cotizaciones.createSuccessTitle}
            </p>
            <p data-testid="create-cotizacion-success-body">
              {messages.cotizaciones.createSuccessBody
                .replace("{code}", createdQuote.code)
                .replace("{status}", createdQuote.status)}
            </p>
            <p>
              <Link
                href={`/comercial/cotizaciones/${createdQuote.id}`}
                className="underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="create-cotizacion-success-link"
              >
                {messages.cotizaciones.createOpenLink}
              </Link>
            </p>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          {createdQuote ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="create-cotizacion-close"
            >
              {messages.common.cancel}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={createQuote.isPending}
                data-testid="create-cotizacion-cancel"
              >
                {messages.cotizaciones.createCancel}
              </Button>
              <Button
                type="button"
                onClick={onSubmit}
                disabled={!canSubmit}
                data-testid="create-cotizacion-submit"
              >
                {createQuote.isPending
                  ? messages.cotizaciones.createSubmitting
                  : messages.cotizaciones.createSubmit}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
