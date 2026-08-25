"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { messages } from "@/shared/utils";
import { AcceptCotizacionDialog } from "./accept-cotizacion-dialog";

/**
 * Vista detalle de cotización con:
 *  - Items multi-línea (BR-N234, 4 kinds).
 *  - Advertencia presupuestal (BR-N411, AC-12) si `total >
 *    1.5 × presupuesto_declarado` — bloque amarillo visible con
 *    ambos montos (paridad responsive, AC-10).
 *  - Acciones operables (IMPL-20260825-25):
 *      · `Enviar cotización` sólo en `draft` → `cotizaciones.send`
 *        con `{ quoteId }`. En cualquier otro estado NO se muta
 *        `send` (la UI sólo renderiza el botón cuando status='draft').
 *      · `Registrar aceptación` sólo en `sent | negotiation` →
 *        abre `AcceptCotizacionDialog`, que llama a
 *        `cotizaciones.accept` con los valores reales (incluye
 *        `evidenceFileId` UUID obligatorio, sin UUID dummy).
 *      · En `accepted` se muestran los datos de aceptación
 *        (inmutable, BR-N02) y el aviso de OS pendiente/delegada
 *        a SPEC-004.
 *      · En estados incompatibles (`internal_review`, `rejected`,
 *        `expired`, `cancelled`) se muestra el estado canónico en
 *        sólo lectura — sin botones de envío/aceptación.
 *  - Mensajes canónicos en `messages.cotizaciones.*`; errores con
 *    `role="alert"`; nunca `window.prompt` ni acceso a BD directa.
 */
function fmtMXN(cents: number): string {
  const pesos = Math.round(cents) / 100;
  return pesos.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  });
}

function kindLabel(kind: string): string {
  return (
    ({
      service: "Servicio",
      license: "Licencia",
      expense: "Gasto",
      discount: "Descuento",
    } as Record<string, string>)[kind] ?? kind
  );
}

/**
 * Mapea un `status` del backend a la etiqueta canónica en
 * `messages.cotizaciones.statusLabel`. Si el status no aparece en el
 * catálogo, se devuelve el valor crudo (defensa contra enums nuevos
 * no migrados a mensajes).
 */
function statusLabelFor(status: string): string {
  const map = messages.cotizaciones.statusLabel as Record<string, string>;
  return map[status] ?? status;
}

export function CotizacionDetail({ id }: { id: string }) {
  const byId = trpc.comercial.cotizaciones.byId.useQuery({ id });
  const warning = trpc.comercial.cotizaciones.presupuestoWarning.useQuery({
    quoteId: id,
  });
  const utils = trpc.useUtils();
  const q = byId.data;

  const [acceptOpen, setAcceptOpen] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);

  const sendMutation = trpc.comercial.cotizaciones.send.useMutation({
    onError: (err) => {
      const code = err.data?.code ?? null;
      if (code === "FORBIDDEN") {
        setSendError(messages.cotizaciones.sendForbidden);
        return;
      }
      if (code === "QUOTE_ALREADY_ACCEPTED") {
        setSendError(messages.cotizaciones.sendImmutable);
        return;
      }
      setSendError(err.message ?? messages.cotizaciones.sendError);
    },
    onSuccess: async () => {
      setSendError(null);
      // Refresca el detalle para que el padre observe el nuevo status.
      await utils.comercial.cotizaciones.byId.invalidate({ id });
    },
  });

  if (!q) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{messages.common.loading}</CardTitle>
        </CardHeader>
        <CardContent />
      </Card>
    );
  }

  const warn = warning.data;
  const showWarning = !!warn?.warn;

  // Sólo se renderiza el botón Enviar cuando la cotización está en
  // `draft`. En estados no-draft la UI NO muta `send` (la mutación
  // existe pero el botón está oculto, evitando 409 BACKEND_STATE).
  const canSend = q.status === "draft" && !sendMutation.isPending;
  // Sólo se renderiza el botón Aceptar cuando la cotización está en
  // `sent` o `negotiation`. En `accepted` es inmutable (BR-N02); en
  // `internal_review | rejected | expired | cancelled` no aplica.
  const canAccept = q.status === "sent" || q.status === "negotiation";

  function onSend() {
    setSendError(null);
    if (!canSend) return;
    sendMutation.mutate({ quoteId: id });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {q.code} · {messages.cotizaciones.title}
          </CardTitle>
          <CardDescription>
            {q.tipoCobro} · {q.status}
            {q.requiresInitialPayment ? " · requiere pago inicial" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <span
              className="rounded-full bg-muted px-2 py-0.5 text-xs"
              data-testid="cotizacion-detail-status"
            >
              {statusLabelFor(q.status)} ({q.status})
            </span>
            {q.tipoCobro === "suscripcion" ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                suscripción
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Vigencia: {q.validUntil ? new Date(q.validUntil).toLocaleDateString("es-MX") : "—"}
          </p>

          {canSend || canAccept || q.status === "accepted" ? (
            <div
              className="flex flex-wrap gap-2 pt-1"
              data-testid="cotizacion-detail-actions"
            >
              {canSend ? (
                <Button
                  type="button"
                  onClick={onSend}
                  disabled={sendMutation.isPending}
                  data-testid="cotizacion-detail-send"
                >
                  {sendMutation.isPending
                    ? messages.cotizaciones.sendSubmitting
                    : messages.cotizaciones.send}
                </Button>
              ) : null}
              {canAccept ? (
                <Button
                  type="button"
                  onClick={() => setAcceptOpen(true)}
                  data-testid="cotizacion-detail-open-accept"
                >
                  {messages.cotizaciones.accept}
                </Button>
              ) : null}
            </div>
          ) : null}

          {sendError ? (
            <p
              role="alert"
              className="text-sm text-destructive"
              data-testid="cotizacion-detail-send-error"
            >
              {sendError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {showWarning ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <strong>{messages.cotizaciones.presupuestoWarningTitle}</strong>
          <p className="mt-1">
            {messages.cotizaciones.presupuestoWarningBody
              .replace("{presupuesto}", fmtMXN(warn!.presupuestoCents ?? 0))
              .replace("{total}", fmtMXN(warn!.totalCents))}
          </p>
          <p className="mt-1 text-xs">
            {messages.cotizaciones.presupuestoWarningNonBlocking}
          </p>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{messages.cotizaciones.itemsTitle}</CardTitle>
          <CardDescription>
            {messages.cotizaciones.multiLineHint} · {q.items.length} ítems
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Tipo</th>
                  <th className="py-2">Descripción</th>
                  <th className="py-2 text-right">Cant.</th>
                  <th className="py-2 text-right">P. Unit.</th>
                  <th className="py-2 text-right">Desc.</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {q.items.map((it) => (
                  <tr key={it.id} className="border-b">
                    <td className="py-2 text-xs">{kindLabel(it.kind)}</td>
                    <td className="py-2">{it.description}</td>
                    <td className="py-2 text-right">{it.qty}</td>
                    <td className="py-2 text-right">{fmtMXN(it.unitPriceCents)}</td>
                    <td className="py-2 text-right">{fmtMXN(it.discountCents)}</td>
                    <td className="py-2 text-right font-medium">{fmtMXN(it.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{messages.cotizaciones.totalsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Row label={messages.cotizaciones.subtotal} value={fmtMXN(q.subtotalCents)} />
          <Row label={messages.cotizaciones.discount} value={fmtMXN(q.discountCents)} />
          <Row label={messages.cotizaciones.tax} value={fmtMXN(q.taxCents)} />
          <Row label={messages.cotizaciones.total} value={fmtMXN(q.totalCents)} bold />
        </CardContent>
      </Card>

      {q.status === "accepted" ? (
        <Card data-testid="cotizacion-detail-accepted">
          <CardHeader>
            <CardTitle>
              {statusLabelFor(q.status)} · {messages.cotizaciones.acceptedByProxyLabel}
            </CardTitle>
            <CardDescription>
              {messages.cotizaciones.statusCanonicalNote}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {q.acceptedAt ? (
              <p>
                <span className="text-muted-foreground">
                  {messages.cotizaciones.acceptedAtLabel}:{" "}
                </span>
                <span data-testid="cotizacion-detail-accepted-at">
                  {new Date(q.acceptedAt).toLocaleString("es-MX")}
                </span>
              </p>
            ) : null}
            {q.acceptedByProxy ? (
              <p>
                <span className="text-muted-foreground">
                  {messages.cotizaciones.acceptedByProxyLabel}:{" "}
                </span>
                <span data-testid="cotizacion-detail-accepted-by-proxy">
                  {q.acceptedByProxy}
                </span>
              </p>
            ) : null}
            {q.acceptedEvidenceFileId ? (
              <p>
                <span className="text-muted-foreground">
                  {messages.cotizaciones.acceptedEvidenceLabel}:{" "}
                </span>
                <span
                  className="font-mono text-xs"
                  data-testid="cotizacion-detail-accepted-evidence"
                >
                  {q.acceptedEvidenceFileId}
                </span>
              </p>
            ) : null}
            <div
              className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
              data-testid="cotizacion-detail-accepted-pending-os"
            >
              <p className="font-medium">
                {messages.cotizaciones.acceptPendingOsTitle}
              </p>
              <p>{messages.cotizaciones.acceptPendingOsBody}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {canAccept ? (
        <AcceptCotizacionDialog
          quoteId={q.id}
          quoteStatus={q.status as "sent" | "negotiation"}
          quoteCode={q.code}
          open={acceptOpen}
          onOpenChange={setAcceptOpen}
          onSuccess={() => {
            // El diálogo ya invalida el cache al éxito; aquí sólo
            // cerramos para que el padre observe el nuevo estado.
            void utils.comercial.cotizaciones.byId.invalidate({ id });
          }}
        />
      ) : null}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "border-t pt-1 font-semibold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}