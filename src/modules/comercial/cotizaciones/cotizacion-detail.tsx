"use client";

import * as React from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { messages } from "@/shared/utils";
import { AcceptCotizacionDialog } from "./accept-cotizacion-dialog";

/**
 * Vista detalle de cotización con:
 *  - Items multi-línea (BR-N234, 4 kinds).
 *  - Advertencia presupuestal (BR-N411, AC-12) si `total >
 *    1.5 × presupuesto_declarado` — bloque amarillo visible con
 *    ambos montos (paridad responsive, AC-10).
 *  - Acciones operables (IMPL-20260825-25, IMPL-20260825-27):
 *      · `Enviar cotización` sólo en `draft` → `cotizaciones.send`
 *        con `{ quoteId }`. En cualquier otro estado NO se muta
 *        `send` (la UI sólo renderiza el botón cuando status='draft').
 *      · `Registrar aceptación` sólo en `sent | negotiation` →
 *        abre `AcceptCotizacionDialog`, que llama a
 *        `cotizaciones.accept` con los valores reales (incluye
 *        `evidenceFileId` UUID obligatorio, sin UUID dummy).
 *      · En `accepted` se muestran los datos de aceptación
 *        (inmutable, BR-N02), el cliente enlazado, el aviso de OS
 *        pendiente (ahora accionable) y el botón `Crear Orden de
 *        Servicio` que invoca
 *        `trpc.ordenServicio.createFromAcceptedQuote({ cotizacionId:
 *        q.id, anticipoRequiredCents })`. El `cotizacionId` es el
 *        UUID real (nunca dummy); el anticipo es opcional y validado
 *        como número MXN no negativo (default null).
 *      · En estados incompatibles (`internal_review`, `rejected`,
 *        `expired`, `cancelled`) se muestra el estado canónico en
 *        sólo lectura — sin botones de envío/aceptación/OS.
 *  - Mensajes canónicos en `messages.cotizaciones.*`; errores con
 *    `role="alert"`; nunca `window.prompt` ni acceso a BD directa.
 *
 * Validación local del anticipo: cadena MXN con hasta 2 decimales;
 * vacío → null. Rechaza negativos, NaN, o > 2 decimales. La
 * validación definitiva (defensa en profundidad) vive en el
 * servicio `orders.createFromAcceptedQuote` (BR-N244/242).
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
  // IMPL-20260825-27 (extensión) · Anticipo opcional para la OS.
  // Cadena MXN que se valida y convierte a centavos antes de
  // enviar al backend. Vacío → null.
  const [anticipoInput, setAnticipoInput] = React.useState<string>("");
  const [anticipoError, setAnticipoError] = React.useState<string | null>(null);
  // Resultado de la creación: OrderDTO completo del backend
  // (status `pending_deposit`, code `OS-NNNNN`, id UUID real).
  const [createdOrder, setCreatedOrder] = React.useState<{
    id: string;
    code: string;
    status: string;
  } | null>(null);
  const [createOsError, setCreateOsError] = React.useState<string | null>(null);

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

  // IMPL-20260825-27 (extensión) · Crear OS desde cotización aceptada.
  // El `cotizacionId` es el UUID real `q.id` (nunca dummy). El
  // `anticipoRequiredCents` se calcula en MXN→centavos en cliente
  // y es validado además por el servicio (defensa en profundidad).
  const createOsMutation = trpc.ordenServicio.createFromAcceptedQuote.useMutation({
    onError: (err) => {
      setCreatedOrder(null);
      const code = err.data?.code ?? null;
      if (code === "QUOTE_HAS_NO_CLIENT") {
        setCreateOsError(messages.cotizaciones.createOsErrorNoClient);
        return;
      }
      if (code === "ORDER_ALREADY_EXISTS_FOR_QUOTE") {
        setCreateOsError(messages.cotizaciones.createOsErrorAlreadyExists);
        return;
      }
      if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
        setCreateOsError(messages.cotizaciones.createOsErrorForbidden);
        return;
      }
      setCreateOsError(
        err.message ?? messages.cotizaciones.createOsErrorGeneric,
      );
    },
    onSuccess: (order) => {
      setCreateOsError(null);
      setAnticipoInput("");
      setAnticipoError(null);
      setCreatedOrder({
        id: order.id,
        code: order.code,
        status: order.status,
      });
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
  // IMPL-20260825-27 (extensión) · Acción `Crear Orden de Servicio`
  // sólo visible en `accepted` y mientras no haya una OS creada en
  // esta sesión (idempotencia observable desde la UI). En cualquier
  // otro estado no se renderiza nada falso.
  const canCreateOs =
    q.status === "accepted" && !createdOrder && !createOsMutation.isPending;

  function onSend() {
    setSendError(null);
    if (!canSend) return;
    sendMutation.mutate({ quoteId: id });
  }

  /**
   * IMPL-20260825-27 (extensión) · Parsea la cadena MXN del input a
   * centavos (`number`) o `null` cuando está vacío. Rechaza números
   * negativos, NaN, o con más de 2 decimales. La validación
   * definitiva la hace el servicio (`orders.createFromAcceptedQuote`).
   */
  function parseAnticipoToCents(raw: string): { ok: true; value: number | null } | { ok: false; reason: string } {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return { ok: true, value: null };
    // Sólo dígitos y un único punto con hasta 2 decimales.
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      return { ok: false, reason: "MXN" };
    }
    const pesos = Number(trimmed);
    if (!Number.isFinite(pesos) || pesos < 0) {
      return { ok: false, reason: "NEG" };
    }
    return { ok: true, value: Math.round(pesos * 100) };
  }

  function onCreateOs() {
    setCreateOsError(null);
    if (!canCreateOs) return;
    const parsed = parseAnticipoToCents(anticipoInput);
    if (!parsed.ok) {
      setAnticipoError(messages.cotizaciones.createOsAnticipoInvalid);
      return;
    }
    setAnticipoError(null);
    // `cotizacionId` es el UUID real de la cotización aceptada
    // (la prop `id` del componente). `anticipoRequiredCents`
    // puede ser null (sin anticipo).
    createOsMutation.mutate({
      cotizacionId: id,
      ...(parsed.value === null
        ? {}
        : { anticipoRequiredCents: parsed.value }),
    });
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
            {q.clientId ? (
              <p>
                <span className="text-muted-foreground">
                  {messages.cotizaciones.acceptedClientLabel}:{" "}
                </span>
                <span
                  className="font-mono text-xs"
                  data-testid="cotizacion-detail-accepted-client"
                >
                  {q.clientId}
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
            {/* IMPL-20260825-27 (extensión) · Bloque "Crear Orden de
                Servicio". Sólo se renderiza dentro de la tarjeta
                `accepted` (este `<Card>` ya está condicionado por
                `q.status === "accepted"`); en cualquier otro estado
                la UI NO muestra acción falsa. */}
            <div
              className="mt-3 space-y-2 border-t pt-3"
              data-testid="cotizacion-detail-create-os-block"
            >
              <div>
                <p className="text-sm font-medium">
                  {messages.cotizaciones.createOsTitle}
                </p>
                <p className="text-xs text-muted-foreground">
                  {messages.cotizaciones.createOsSubtitle}
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cotizacion-detail-create-os-anticipo">
                  {messages.cotizaciones.createOsAnticipoLabel}
                </Label>
                <Input
                  id="cotizacion-detail-create-os-anticipo"
                  name="anticipoMxn"
                  type="text"
                  inputMode="decimal"
                  placeholder={
                    messages.cotizaciones.createOsAnticipoPlaceholder
                  }
                  value={anticipoInput}
                  onChange={(e) => {
                    setAnticipoInput(e.target.value);
                    if (anticipoError) setAnticipoError(null);
                  }}
                  aria-describedby="cotizacion-detail-create-os-anticipo-help"
                  aria-invalid={anticipoError ? true : undefined}
                  data-testid="cotizacion-detail-create-os-anticipo"
                  disabled={createOsMutation.isPending || !!createdOrder}
                />
                <p
                  id="cotizacion-detail-create-os-anticipo-help"
                  className="text-xs text-muted-foreground"
                >
                  {messages.cotizaciones.createOsAnticipoHelp}
                </p>
                {anticipoError ? (
                  <p
                    role="alert"
                    className="text-xs text-destructive"
                    data-testid="cotizacion-detail-create-os-anticipo-error"
                  >
                    {anticipoError}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                onClick={onCreateOs}
                disabled={!canCreateOs}
                aria-busy={createOsMutation.isPending ? true : undefined}
                data-testid="cotizacion-detail-create-os"
              >
                {createOsMutation.isPending
                  ? messages.cotizaciones.createOsSubmitting
                  : messages.cotizaciones.createOsAction}
              </Button>
              {createOsError ? (
                <p
                  role="alert"
                  className="text-sm text-destructive"
                  data-testid="cotizacion-detail-create-os-error"
                >
                  {createOsError}
                </p>
              ) : null}
              {createdOrder ? (
                <div
                  className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900"
                  role="status"
                  aria-live="polite"
                  data-testid="cotizacion-detail-create-os-success"
                >
                  <p className="font-medium">
                    {messages.cotizaciones.createOsSuccessTitle}
                  </p>
                  <p className="mt-1">
                    {messages.cotizaciones.createOsSuccessBody
                      .replace("{code}", createdOrder.code)
                      .replace("{quoteCode}", q.code)}
                  </p>
                  <p className="mt-1">
                    <span className="text-muted-foreground">
                      {messages.ordenes.status}:{" "}
                    </span>
                    <span
                      className="font-mono"
                      data-testid="cotizacion-detail-create-os-success-status"
                    >
                      {messages.ordenes.pendingDeposit} ({createdOrder.status})
                    </span>
                  </p>
                  <p className="mt-1">
                    <span className="text-muted-foreground">
                      {messages.ordenes.code}:{" "}
                    </span>
                    <span
                      className="font-mono"
                      data-testid="cotizacion-detail-create-os-success-code"
                    >
                      {createdOrder.code}
                    </span>
                  </p>
                  <p className="mt-1">
                    <span className="text-muted-foreground">
                      {messages.ordenes.client} (OS):{" "}
                    </span>
                    <span
                      className="font-mono text-xs"
                      data-testid="cotizacion-detail-create-os-success-id"
                    >
                      {createdOrder.id}
                    </span>
                  </p>
                  <p className="mt-2">
                    <Link
                      href={`/ordenes-servicio/${createdOrder.id}`}
                      className="underline"
                      data-testid="cotizacion-detail-create-os-success-link"
                    >
                      {messages.cotizaciones.createOsViewOrder}
                    </Link>
                  </p>
                </div>
              ) : null}
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