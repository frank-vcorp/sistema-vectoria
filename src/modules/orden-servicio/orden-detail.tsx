"use client";

import * as React from "react";
import Link from "next/link";
import { messages } from "@/shared/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STATUS_LABELS: Record<string, string> = {
  pending_deposit: messages.ordenes.pendingDeposit,
  pending_information: messages.ordenes.pendingInformation,
  authorized_to_start: messages.ordenes.authorizedToStart,
  in_execution: messages.ordenes.inExecution,
  delivered: messages.ordenes.delivered,
  closed: messages.ordenes.closed,
  paused: messages.ordenes.paused,
  cancelled: messages.ordenes.cancelled,
};

// IMPL-20260825-29 · Etiquetas canónicas de etapa/situación del
// Proyecto (SPEC-20260817-005). Sólo se usan en el bloque de éxito
// de `createProject` para mostrar el `project.statusStage` y
// `project.statusSituation` reales devueltos por el backend.
const STATUS_LABELS_PROJECT_STAGE: Record<string, string> = {
  planning: messages.proyectos.stageLabel.planning,
  development: messages.proyectos.stageLabel.development,
  testing: messages.proyectos.stageLabel.testing,
  client_validation: messages.proyectos.stageLabel.client_validation,
  delivery: messages.proyectos.stageLabel.delivery,
};

const STATUS_LABELS_PROJECT_SITUATION: Record<string, string> = {
  pending: messages.proyectos.situationLabel.pending,
  active: messages.proyectos.situationLabel.active,
  paused: messages.proyectos.situationLabel.paused,
  completed: messages.proyectos.situationLabel.completed,
  cancelled: messages.proyectos.situationLabel.cancelled,
};

function fmtMXN(cents: number): string {
  return (Math.round(cents) / 100).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  });
}

interface OrdenDetailProps {
  id: string;
}

export function OrdenDetail({ id }: OrdenDetailProps) {
  const utils = trpc.useUtils();
  const detail = trpc.ordenServicio.byId.useQuery({ orderId: id });
  const preflight = trpc.ordenServicio.preflightAuthorize.useQuery({ orderId: id });
  // IMPL-20260825-34 (intento 3 · fix React #310) · Los hooks de
  // IMPL-20260825-34 intento 2 (`quoteQuery`, `fiscalQuery`,
  // `fiscalUpsert`) se declaraban DESPUÉS de los early-returns de
  // carga/error (`if (detail.isLoading) return ...; if (detail.error
  // || !detail.data) return ...`), violando Rules of Hooks y
  // colapsando todo el detalle OS (QA staging). Se reordenan para
  // existir en TODOS los renders. Los inputs usan placeholders
  // seguros (`detail.data?.cotizacionId ?? ""`) y la consulta se
  // activa sólo cuando `detail.data` está disponible y la OS está
  // en `delivered` o `closed` (`enabled` flag), de modo que no se
  // inventen IDs ni se consulte con `undefined`. La mutación no
  // depende de los datos para declararse.
  const quoteQuery = trpc.comercial.cotizaciones.byId.useQuery(
    { id: detail.data?.cotizacionId ?? "" },
    {
      enabled:
        !!detail.data &&
        (detail.data.status === "delivered" ||
          detail.data.status === "closed"),
    },
  );
  const fiscalQuery = trpc.clientes.fiscal.getForClient.useQuery(
    { clientId: detail.data?.clientId ?? "" },
    {
      enabled:
        !!detail.data &&
        (detail.data.status === "delivered" ||
          detail.data.status === "closed"),
    },
  );
  const fiscalUpsert = trpc.clientes.fiscal.upsert.useMutation({
    onSuccess: () => {
      // `clientId` puede no existir todavía durante el primer render
      // (detail todavía cargando); la invalidación se hace sólo si
      // hay datos. NO inventa IDs.
      const clientId = detail.data?.clientId;
      if (clientId) {
        utils.clientes.fiscal.getForClient.invalidate({ clientId });
      }
    },
  });
  const authorize = trpc.ordenServicio.authorize.useMutation({
    onSuccess: () => {
      utils.ordenServicio.byId.invalidate({ orderId: id });
      utils.ordenServicio.preflightAuthorize.invalidate({ orderId: id });
    },
  });
  const pause = trpc.ordenServicio.pause.useMutation({
    onSuccess: () => utils.ordenServicio.byId.invalidate({ orderId: id }),
  });
  const cancel = trpc.ordenServicio.cancel.useMutation({
    onSuccess: () => utils.ordenServicio.byId.invalidate({ orderId: id }),
  });
  const assignPL = trpc.ordenServicio.assignPL.useMutation({
    onSuccess: () => utils.ordenServicio.byId.invalidate({ orderId: id }),
  });
  const markDelivered = trpc.ordenServicio.markDelivered.useMutation({
    onSuccess: () => utils.ordenServicio.byId.invalidate({ orderId: id }),
  });
  // IMPL-20260825-32 · Transición manual OS `authorized_to_start → in_execution`
  // (SPEC-20260817-004 BR-N247 + gap SPEC-005 AC §4.3). Se expone como acción
  // del PL/Director mientras el orquestador de SPEC-005 que consume el
  // evento `os.authorized_to_start` no esté disponible, sin acoplamiento
  // backend OS↔Proyecto. El handler envía `manual: true` para que el
  // servicio use el permiso `autorizar_os` (no `gestionar_ordenes_servicio`).
  // En éxito invalida `byId` y `preflightAuthorize`; el Card padre está
  // condicionado a `o.status === "authorized_to_start"`, de modo que tras
  // el refetch el botón desaparece sin acción manual del usuario.
  const markInExecution = trpc.ordenServicio.markInExecution.useMutation({
    onSuccess: async () => {
      setMarkInExecutionError(null);
      setMarkInExecutionSuccess(true);
      await Promise.all([
        utils.ordenServicio.byId.invalidate({ orderId: id }),
        utils.ordenServicio.preflightAuthorize.invalidate({ orderId: id }),
      ]);
    },
    onError: (err) => {
      setMarkInExecutionSuccess(false);
      const code = err.data?.code ?? null;
      // Códigos de transición inválida (helper `canTransitionTo`):
      // ORDER_NOT_AUTHORIZABLE / ORDER_ALREADY_AUTHORIZED /
      // ORDER_ALREADY_CLOSED / ORDER_ALREADY_CANCELLED / ORDER_NOT_PAUSED.
      // El handoff menciona `ORDER_INVALID_TRANSITION` como nombre genérico;
      // mapeamos el clúster completo para no ligar la UI a un solo código.
      if (
        code === "ORDER_NOT_AUTHORIZABLE" ||
        code === "ORDER_ALREADY_AUTHORIZED" ||
        code === "ORDER_ALREADY_CLOSED" ||
        code === "ORDER_ALREADY_CANCELLED" ||
        code === "ORDER_NOT_PAUSED"
      ) {
        setMarkInExecutionError(messages.ordenes.markInExecutionErrorTransition);
        return;
      }
      if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
        setMarkInExecutionError(messages.ordenes.markInExecutionErrorForbidden);
        return;
      }
      if (code === "ORDER_NOT_FOUND") {
        setMarkInExecutionError(messages.errors.notFound);
        return;
      }
      setMarkInExecutionError(
        err.message ?? messages.ordenes.markInExecutionErrorGeneric,
      );
    },
  });
  const closeAdmin = trpc.ordenServicio.closeAdministrative.useMutation({
    onSuccess: () => utils.ordenServicio.byId.invalidate({ orderId: id }),
  });

  // IMPL-20260825-34 · Construir factura borrador (CFDI) desde una OS
  // `delivered` o `closed` (SPEC-20260817-007 BR-N301/BR-N218). El
  // contrato ya existente `facturacion.buildFromOrder` exige OS + cliente
  // y persiste la factura en estado `borrador` (sin timbrar ni cobrar).
  // La UI envía el UUID real de la OS (`o.id`) y deriva la línea inicial
  // de `o.soldTotalCents` (qty 1, valor unitario en centavos). NO pide
  // UUID manual, NO abre `window.prompt`, NO accede a BD. Sólo orquesta
  // el contrato y mapea errores canónicos; en éxito invalida los
  // listados de facturación para que el módulo los vea sin recargar la
  // página manualmente.
  const buildInvoiceDraft = trpc.facturacion.buildFromOrder.useMutation({
    onError: (err) => {
      setCreatedInvoice(null);
      const code = err.data?.code ?? null;
      if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
        setCreateInvoiceError(messages.ordenes.createInvoiceErrorForbidden);
        return;
      }
      if (code === "ORDER_NOT_FOUND" || code === "CLIENT_NOT_FOUND") {
        setCreateInvoiceError(messages.ordenes.createInvoiceErrorNotFound);
        return;
      }
      // IMPL-20260825-34 (intento 2) · BR-N218: el cliente no tiene
      // RFC/razón social/régimen capturados. El error se muestra
      // fuera del diálogo (banner arriba del Card) para que el
      // usuario pueda reabrir y completar el formulario, sin que
      // el mensaje quede ocluido por el overlay del modal.
      if (code === "INVOICE_FISCAL_DATA_REQUIRED") {
        setCreateInvoiceError(messages.ordenes.createInvoiceFiscalMissing);
        return;
      }
      if (code === "ORDER_NOT_DELIVERABLE" || code === "INVOICE_BUILD_INVALID") {
        setCreateInvoiceError(messages.ordenes.createInvoiceErrorTransition);
        return;
      }
      setCreateInvoiceError(
        err.message ?? messages.ordenes.createInvoiceErrorGeneric,
      );
    },
    onSuccess: async (preview) => {
      setCreateInvoiceError(null);
      // El router devuelve un InvoicePreview/DTO con `id`, `code`,
      // `status` y totales. La UI los expone literalmente para
      // mantener el contrato visible y anti-falso-éxito: nunca se
      // afirma éxito con un id inventado. `buildFromOrder` retorna
      // `InvoicePreviewDTO = { invoice: InvoiceDTO, client, fiscalConfig }`,
      // de modo que la identidad viene de `preview.invoice`.
      const invoice = preview?.invoice;
      if (!invoice) {
        // Defensa: si el backend cambiara el shape, NO afirmamos éxito.
        setCreateInvoiceError(messages.ordenes.createInvoiceErrorGeneric);
        return;
      }
      setCreatedInvoice({
        id: invoice.id,
        code: invoice.code,
        status: invoice.status,
        totalCents: invoice.totalCents,
      });
      // Refresca el listado de facturación para que la nueva factura
      // borrador aparezca al abrir el módulo sin recarga manual.
      await Promise.all([
        utils.facturacion.list.invalidate(),
        utils.facturacion.byId.invalidate(),
      ]);
    },
  });

  // IMPL-20260825-29 · Crear Proyecto desde una OS `authorized_to_start`.
  // El contrato `proyectos.createFromOrder({ orderId })` recibe el UUID
  // real de la OS (`o.id`) y resuelve el PL desde la OS en el servicio
  // (BR-N407). La UI NO pide un UUID manual ni abre prompt(). En
  // cualquier otro estado el botón no se renderiza, evitando una acción
  // falsa. En éxito se invalida el detalle/listado de proyectos y el
  // detalle de la OS para que el padre observe los cambios.
  const createProject = trpc.proyectos.createFromOrder.useMutation({
    onError: (err) => {
      setCreatedProject(null);
      const code = err.data?.code ?? null;
      if (code === "PROJECT_ALREADY_EXISTS_FOR_ORDER") {
        setCreateProjectError(messages.ordenes.createProjectErrorExisting);
        return;
      }
      if (code === "ORDER_NOT_AUTHORIZABLE") {
        setCreateProjectError(messages.ordenes.createProjectErrorNotAuthorized);
        return;
      }
      if (code === "PL_NOT_ASSIGNED") {
        setCreateProjectError(messages.ordenes.createProjectErrorMissingPL);
        return;
      }
      if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
        setCreateProjectError(messages.ordenes.createProjectErrorForbidden);
        return;
      }
      setCreateProjectError(
        err.message ?? messages.ordenes.createProjectErrorGeneric,
      );
    },
    onSuccess: async (project) => {
      setCreateProjectError(null);
      setCreatedProject({
        id: project.id,
        code: project.code,
        statusStage: project.statusStage,
        statusSituation: project.statusSituation,
      });
      // Refresca el detalle de la OS (por si la transición secundaria
      // toca estado), el detalle del proyecto creado (para quien lo
      // abra desde el enlace) y el listado de proyectos.
      await Promise.all([
        utils.ordenServicio.byId.invalidate({ orderId: id }),
        utils.proyectos.byId.invalidate({ projectId: project.id }),
        utils.proyectos.list.invalidate(),
      ]);
    },
  });

  const [plUserId, setPlUserId] = React.useState("");
  const [pauseReason, setPauseReason] = React.useState("");
  const [cancelReason, setCancelReason] = React.useState("");
  const [directorReason, setDirectorReason] = React.useState("");
  // IMPL-20260825-29 · Estado local del resultado `createFromOrder`.
  // Se conserva sólo en memoria: tras una recarga del componente el
  // padre vuelve a evaluar `o.status` para decidir si mantiene la
  // acción (no se inventa `projectId`).
  const [createdProject, setCreatedProject] = React.useState<
    | {
        id: string;
        code: string;
        statusStage: string;
        statusSituation: string;
      }
    | null
  >(null);
  const [createProjectError, setCreateProjectError] = React.useState<
    string | null
  >(null);
  // IMPL-20260825-32 · Estado local de `markInExecution`. `success` se
  // conserva sólo en memoria para mostrar feedback `role="status"` entre
  // el `onSuccess` y la siguiente invalidación/refetch de `byId`; al
  // re-renderizar, el padre vuelve a evaluar `o.status` y la acción
  // desaparece porque el Card está condicionado al estado previo.
  const [markInExecutionSuccess, setMarkInExecutionSuccess] =
    React.useState(false);
  const [markInExecutionError, setMarkInExecutionError] = React.useState<
    string | null
  >(null);
  // IMPL-20260825-34 · Estado local del flujo "Crear factura borrador"
  // (SPEC-20260817-007 BR-N301/BR-N218, intento 2). Conserva sólo en
  // memoria mientras la sesión del usuario sigue activa. El valor
  // unitario se deriva del SUBTOTAL NETO de la cotización
  // (`quote.subtotalCents`), NO de `o.soldTotalCents` (que es total
  // bruto post-IVA): si se pasara el bruto como `valorUnitarioCents`,
  // `buildCfdiConcept` añadiría un segundo 16% y produciría doble IVA.
  // Antes de armar el comprobante se persisten los datos fiscales del
  // cliente (`clientes.fiscal.upsert`) para evitar el 409
  // `INVOICE_FISCAL_DATA_REQUIRED`. Si upsert falla, NO se llama
  // `buildFromOrder`.
  const [createInvoiceOpen, setCreateInvoiceOpen] = React.useState(false);
  const defaultDueDate = React.useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  }, []);
  const [createInvoiceDescription, setCreateInvoiceDescription] =
    React.useState("");
  const [createInvoiceFieldError, setCreateInvoiceFieldError] = React.useState<
    string | null
  >(null);
  const [createdInvoice, setCreatedInvoice] = React.useState<
    | {
        id: string;
        code: string;
        status: string;
        totalCents: number | null;
      }
    | null
  >(null);
  const [createInvoiceError, setCreateInvoiceError] = React.useState<
    string | null
  >(null);
  // IMPL-20260825-34 intento 2 · Estado del upsert fiscal: bandera
  // para evitar doble submit y conservar el último error de upsert
  // en `createInvoiceError` (visible fuera del diálogo).
  const [fiscalSubmitting, setFiscalSubmitting] = React.useState(false);

  if (detail.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{messages.common.loading}</CardTitle>
        </CardHeader>
        <CardContent />
      </Card>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{messages.errors.notFound}</CardTitle>
          <CardDescription>
            {(detail.error as Error | null)?.message ?? messages.common.error}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const o = detail.data;
  const pf = preflight.data;

  // IMPL-20260825-34 (intento 2) · Datos fiscales del cliente
  // (BR-N218) y subtotal neto de la cotización. El detalle de OS no
  // expone `subtotalCents` directamente, así que consultamos
  // `comercial.cotizaciones.byId` para derivar el valor unitario de
  // la línea inicial del CFDI sin doble IVA. La consulta de fiscal
  // pre-rellena el formulario (RFC, razón social, régimen) para que
  // el usuario sólo confirme o ajuste.
  //
  // IMPL-20260825-34 (intento 3 · fix React #310) · Los hooks
  // `quoteQuery`, `fiscalQuery` y `fiscalUpsert` están HOISTED
  // arriba del componente (justo después de `preflight`); aquí ya
  // no se redeclaran. Sólo se deriva `invoiceUnitPriceCents` con
  // acceso seguro a `detail.data` (puede ser undefined durante el
  // primer render).
  // Subtotal neto del CFDI: preferir `quote.subtotalCents` (neto,
  // pre-IVA). Si la cotización aún no está disponible o no tiene
  // `subtotalCents`, hacemos fallback a `o.soldTotalCents` (total
  // bruto post-IVA) sólo como contingencia operacional y marcamos
  // explícitamente la advertencia para evitar doble IVA silencioso.
  const invoiceUnitPriceCents = (() => {
    if (quoteQuery.data?.subtotalCents != null) {
      return { value: quoteQuery.data.subtotalCents, source: "quote" as const };
    }
    if (typeof o.soldTotalCents === "number") {
      return { value: o.soldTotalCents, source: "soldTotal" as const };
    }
    return { value: 0, source: "unknown" as const };
  })();
  const canAuthorize = !!pf?.canAuthorize;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {o.code} · {messages.ordenes.title}
          </CardTitle>
          <CardDescription>
            {STATUS_LABELS[o.status] ?? o.status} · {o.tipoCobro}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">{messages.ordenes.cotizacion}</p>
              <p className="font-mono text-xs">{o.cotizacionId}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{messages.ordenes.client}</p>
              <p className="font-mono text-xs">{o.clientId}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{messages.ordenes.soldTotal}</p>
              <p>{fmtMXN(o.soldTotalCents)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{messages.ordenes.pl}</p>
              <p>{o.plUserId ?? "—"}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">OC</p>
              <p>
                {o.ocNumber ?? "—"} · {o.ocAmountCents != null ? fmtMXN(o.ocAmountCents) : "—"} ·{" "}
                {o.ocFileId ? "PDF" : "sin PDF"}
              </p>
            </div>
          </div>
          {o.pauseReason ? (
            <p className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-900">
              {messages.ordenes.pauseReason}: {o.pauseReason}
            </p>
          ) : null}
          {o.cancelReason ? (
            <p className="rounded-md bg-red-100 px-2 py-1 text-xs text-red-900">
              {messages.ordenes.cancelReason}: {o.cancelReason}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Acciones de gestión */}
      <Card>
        <CardHeader>
          <CardTitle>{messages.ordenes.actionsTitle}</CardTitle>
          <CardDescription>
            {messages.ordenes.actionsSubtitle}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Asignar PL */}
          <div className="space-y-2">
            <Label htmlFor="pl-input">{messages.ordenes.assignPL}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="pl-input"
                placeholder={messages.ordenes.plPlaceholder}
                value={plUserId}
                onChange={(e) => setPlUserId(e.target.value)}
              />
              <Button
                onClick={() => assignPL.mutate({ orderId: o.id, plUserId })}
                disabled={!plUserId || assignPL.isPending}
              >
                {messages.ordenes.assign}
              </Button>
            </div>
          </div>

          {/* Pausar */}
          <div className="space-y-2">
            <Label htmlFor="pause-input">{messages.ordenes.pauseAction}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="pause-input"
                placeholder={messages.ordenes.reasonPlaceholder}
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
              />
              <Button
                variant="secondary"
                onClick={() => pause.mutate({ orderId: o.id, reason: pauseReason })}
                disabled={pauseReason.trim().length < 3 || pause.isPending}
              >
                {messages.ordenes.pauseAction}
              </Button>
            </div>
          </div>

          {/* Cancelar */}
          <div className="space-y-2">
            <Label htmlFor="cancel-input">{messages.ordenes.cancelAction}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="cancel-input"
                placeholder={messages.ordenes.reasonPlaceholder}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
              <Button
                variant="destructive"
                onClick={() => cancel.mutate({ orderId: o.id, reason: cancelReason })}
                disabled={cancelReason.trim().length < 3 || cancel.isPending}
              >
                {messages.ordenes.cancelAction}
              </Button>
            </div>
          </div>

          {/* Cierre técnico */}
          {o.status === "in_execution" || o.status === "paused" ? (
            <Button
              variant="outline"
              onClick={() => markDelivered.mutate({ orderId: o.id })}
              disabled={markDelivered.isPending}
            >
              {messages.ordenes.markDelivered}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {/* Autorizar */}
      <Card>
        <CardHeader>
          <CardTitle>{messages.ordenes.authorizeTitle}</CardTitle>
          <CardDescription>
            {messages.ordenes.authorizeSubtitle}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ul className="list-disc space-y-1 pl-5">
            <li className={pf?.plAssigned ? "text-green-700" : "text-amber-700"}>
              {messages.ordenes.preflight.plAssigned}: {pf?.plAssigned ? "OK" : "—"}
            </li>
            <li className={pf?.ocValid ? "text-green-700" : "text-amber-700"}>
              {messages.ordenes.preflight.ocValid}: {pf?.ocValid ? "OK" : "—"}
            </li>
            <li className="text-amber-700">
              {messages.ordenes.preflight.advance}:{" "}
              {pf?.advancePaidCents != null
                ? `${(pf.advancePaidCents / 100).toFixed(2)} MXN (${pf.advanceProviderSource})`
                : "—"}
            </li>
          </ul>
          <div className="space-y-2">
            <Label htmlFor="director-reason">
              {messages.ordenes.directorExceptionReason}
            </Label>
            <Input
              id="director-reason"
              placeholder={messages.ordenes.reasonPlaceholder}
              value={directorReason}
              onChange={(e) => setDirectorReason(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                authorize.mutate({
                  orderId: o.id,
                  directorException: false,
                })
              }
              disabled={!canAuthorize || authorize.isPending}
            >
              {messages.ordenes.authorize}
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                authorize.mutate({
                  orderId: o.id,
                  directorException: true,
                  directorExceptionReason: directorReason,
                })
              }
              disabled={!directorReason.trim() || authorize.isPending}
            >
              {messages.ordenes.authorizeDirectorException}
            </Button>
          </div>
          {authorize.error ? (
            <p className="rounded-md bg-red-100 px-2 py-1 text-xs text-red-900">
              {authorize.error.message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* IMPL-20260825-32 · Marcar OS en ejecución (transición manual
          `authorized_to_start → in_execution`, SPEC-20260817-004 BR-N247).
          Sólo se renderiza cuando `o.status === "authorized_to_start"`;
          en cualquier otro estado la UI NO muestra acción falsa (ni
          siquiera si `markInExecutionSuccess=true` mientras el refetch
          de `byId` aún no llegó: el Card desaparece en el siguiente
          render cuando `o.status` ya es `in_execution`). El handler
          envía el UUID real de la OS (`o.id`) con `manual: true` (permiso
          `autorizar_os`); NO pide un UUID manual ni abre `window.prompt`.
          En éxito invalida `byId` y `preflightAuthorize`; el botón
          desaparece sin acción manual del usuario. */}
      {o.status === "authorized_to_start" ? (
        <Card data-testid="orden-detail-mark-in-execution">
          <CardHeader>
            <CardTitle>{messages.ordenes.markInExecutionTitle}</CardTitle>
            <CardDescription>
              {messages.ordenes.markInExecutionSubtitle}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              {messages.ordenes.markInExecutionHelp}
            </p>
            <Button
              type="button"
              onClick={() => {
                setMarkInExecutionError(null);
                setMarkInExecutionSuccess(false);
                if (markInExecution.isPending || markInExecutionSuccess) return;
                // `orderId` es el UUID real de la OS (`o.id`); `manual: true`
                // para usar el permiso `autorizar_os` (gap SPEC-004↔SPEC-005).
                markInExecution.mutate({ orderId: o.id, manual: true });
              }}
              disabled={markInExecution.isPending || markInExecutionSuccess}
              aria-busy={markInExecution.isPending ? true : undefined}
              data-testid="orden-detail-mark-in-execution-action"
            >
              {markInExecution.isPending
                ? messages.ordenes.markInExecutionSubmitting
                : messages.ordenes.markInExecutionAction}
            </Button>
            {markInExecutionError ? (
              <p
                role="alert"
                className="text-sm text-destructive"
                data-testid="orden-detail-mark-in-execution-error"
              >
                {markInExecutionError}
              </p>
            ) : null}
            {markInExecutionSuccess ? (
              <div
                role="status"
                aria-live="polite"
                className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900"
                data-testid="orden-detail-mark-in-execution-success"
              >
                <p className="font-medium">
                  {messages.ordenes.markInExecutionSuccessTitle}
                </p>
                <p className="mt-1">
                  {messages.ordenes.markInExecutionSuccessBody.replace(
                    "{code}",
                    o.code,
                  )}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* IMPL-20260825-29 · Crear Proyecto desde OS autorizada
          (SPEC-20260817-005 · project_creation universal, BR-N407).
          Sólo se renderiza cuando `o.status === "authorized_to_start"`;
          en cualquier otro estado la UI NO muestra acción falsa. El
          backend (`proyectos.createFromOrder`) valida que la OS esté
          en `authorized_to_start` y que tenga PL asignado, de modo que
          la UI sólo dispara la mutación y mapea los códigos canónicos. */}
      {o.status === "authorized_to_start" ? (
        <Card data-testid="orden-detail-create-project">
          <CardHeader>
            <CardTitle>{messages.ordenes.createProjectTitle}</CardTitle>
            <CardDescription>
              {messages.ordenes.createProjectSubtitle}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              {messages.ordenes.createProjectHelp}
            </p>
            <Button
              type="button"
              onClick={() => {
                setCreateProjectError(null);
                if (createProject.isPending || createdProject) return;
                // `orderId` es el UUID real de la OS (`o.id`). El PL
                // lo toma el servicio desde la propia OS, por lo que
                // la UI no envía `plUserIdOverride`.
                createProject.mutate({ orderId: o.id });
              }}
              disabled={createProject.isPending || !!createdProject}
              aria-busy={createProject.isPending ? true : undefined}
              data-testid="orden-detail-create-project-action"
            >
              {createProject.isPending
                ? messages.ordenes.createProjectSubmitting
                : messages.ordenes.createProjectAction}
            </Button>
            {createProjectError ? (
              <p
                role="alert"
                className="text-sm text-destructive"
                data-testid="orden-detail-create-project-error"
              >
                {createProjectError}
              </p>
            ) : null}
            {createdProject ? (
              <div
                role="status"
                aria-live="polite"
                className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900"
                data-testid="orden-detail-create-project-success"
              >
                <p className="font-medium">
                  {messages.ordenes.createProjectSuccessTitle}
                </p>
                <p className="mt-1">
                  {messages.ordenes.createProjectSuccessBody
                    .replace("{code}", createdProject.code)
                    .replace("{stage}", STATUS_LABELS_PROJECT_STAGE[createdProject.statusStage] ?? createdProject.statusStage)
                    .replace("{situation}", STATUS_LABELS_PROJECT_SITUATION[createdProject.statusSituation] ?? createdProject.statusSituation)}
                </p>
                <p className="mt-1">
                  <span className="text-muted-foreground">ID: </span>
                  <span
                    className="font-mono"
                    data-testid="orden-detail-create-project-success-id"
                  >
                    {createdProject.id}
                  </span>
                </p>
                <p className="mt-1">
                  <span className="text-muted-foreground">Código: </span>
                  <span
                    className="font-mono"
                    data-testid="orden-detail-create-project-success-code"
                  >
                    {createdProject.code}
                  </span>
                </p>
                <p className="mt-2">
                  <Link
                    href={`/proyectos/${createdProject.id}`}
                    className="underline"
                    data-testid="orden-detail-create-project-success-link"
                  >
                    {messages.ordenes.createProjectViewProject}
                  </Link>
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Cierre administrativo */}
      {o.status === "delivered" || o.status === "in_execution" ? (
        <Card>
          <CardHeader>
            <CardTitle>{messages.ordenes.closeAdminTitle}</CardTitle>
            <CardDescription>{messages.ordenes.closeAdminSubtitle}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="close-reason">
                {messages.ordenes.directorExceptionReason}
              </Label>
              <Input
                id="close-reason"
                placeholder={messages.ordenes.reasonPlaceholder}
                value={directorReason}
                onChange={(e) => setDirectorReason(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  closeAdmin.mutate({ orderId: o.id, directorException: false })
                }
                disabled={closeAdmin.isPending}
              >
                {messages.ordenes.closeAdmin}
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  closeAdmin.mutate({
                    orderId: o.id,
                    directorException: true,
                    directorExceptionReason: directorReason,
                  })
                }
                disabled={!directorReason.trim() || closeAdmin.isPending}
              >
                {messages.ordenes.closeAdminException}
              </Button>
            </div>
            {closeAdmin.error ? (
              <p className="rounded-md bg-red-100 px-2 py-1 text-xs text-red-900">
                {closeAdmin.error.message}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* IMPL-20260825-34 (intento 2) · Banner de error GLOBAL del
          flujo "Crear factura borrador". Se renderiza ARRIBA del Card
          (no adentro del Card ni del diálogo) y con `z-[60]` para
          quedar visible por encima del overlay del diálogo
          (`z-50`). Cubre: `INVOICE_FISCAL_DATA_REQUIRED`, errores
          de `clientes.fiscal.upsert` y errores de
          `facturacion.buildFromOrder`. Sin esto el error quedaría
          ocluido por el modal y el usuario vería "falso éxito". */}
      {(createInvoiceError && (o.status === "delivered" || o.status === "closed")) ? (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed left-1/2 top-4 z-[60] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive shadow-lg"
          data-testid="orden-detail-create-invoice-error"
        >
          {createInvoiceError}
        </div>
      ) : null}

      {/* IMPL-20260825-34 · Crear factura borrador desde OS `delivered`
          o `closed` (SPEC-20260817-007 BR-N301/BR-N218). Sólo se
          renderiza cuando `o.status === "delivered"` o `o.status ===
          "closed"`; en cualquier otro estado la UI NO muestra acción
          falsa. El contrato `facturacion.buildFromOrder` ya exige OS
          + cliente y persiste la factura en `borrador` (sin timbrar,
          sin cobrar). NO se envía UUID manual ni se abre prompt();
          `o.id` es el UUID real de la OS y la línea inicial se deriva
          de `o.soldTotalCents` (qty 1). Tras éxito se invalida el
          listado de facturas para que aparezcan al abrir Facturación. */}
      {o.status === "delivered" || o.status === "closed" ? (
        <Card data-testid="orden-detail-create-invoice">
          <CardHeader>
            <CardTitle>{messages.ordenes.createInvoiceTitle}</CardTitle>
            <CardDescription>
              {messages.ordenes.createInvoiceSubtitle}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              {messages.ordenes.createInvoiceHelp}
            </p>
            <Button
              type="button"
              onClick={() => {
                setCreateInvoiceError(null);
                if (buildInvoiceDraft.isPending || createdInvoice) return;
                setCreateInvoiceDescription(
                  messages.ordenes.createInvoiceDescriptionPlaceholder.replace(
                    "{code}",
                    o.code,
                  ),
                );
                setCreateInvoiceOpen(true);
              }}
              disabled={buildInvoiceDraft.isPending || !!createdInvoice}
              aria-busy={buildInvoiceDraft.isPending ? true : undefined}
              data-testid="orden-detail-create-invoice-action"
            >
              {buildInvoiceDraft.isPending
                ? messages.ordenes.createInvoiceSubmitting
                : messages.ordenes.createInvoiceAction}
            </Button>
            {createdInvoice ? (
              <div
                role="status"
                aria-live="polite"
                className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900"
                data-testid="orden-detail-create-invoice-success"
              >
                <p className="font-medium">
                  {messages.ordenes.createInvoiceSuccessTitle}
                </p>
                <p className="mt-1">
                  <span className="text-muted-foreground">ID: </span>
                  <span
                    className="font-mono"
                    data-testid="orden-detail-create-invoice-success-id"
                  >
                    {createdInvoice.id}
                  </span>
                </p>
                <p className="mt-1">
                  <span className="text-muted-foreground">Código: </span>
                  <span
                    className="font-mono"
                    data-testid="orden-detail-create-invoice-success-code"
                  >
                    {createdInvoice.code}
                  </span>
                </p>
                <p className="mt-1">
                  <span className="text-muted-foreground">Estado: </span>
                  <span
                    className="font-mono"
                    data-testid="orden-detail-create-invoice-success-status"
                  >
                    {createdInvoice.status}
                  </span>
                </p>
                {createdInvoice.totalCents != null ? (
                  <p className="mt-1">
                    <span className="text-muted-foreground">Total: </span>
                    <span
                      className="font-mono"
                      data-testid="orden-detail-create-invoice-success-total"
                    >
                      {fmtMXN(createdInvoice.totalCents)}
                    </span>
                  </p>
                ) : null}
                <p className="mt-2">
                  <Link
                    href="/facturacion"
                    className="underline"
                    data-testid="orden-detail-create-invoice-success-link"
                  >
                    {messages.ordenes.createInvoiceOpenList}
                  </Link>
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {createInvoiceOpen ? (
        <CreateInvoiceDraftDialog
          orderId={o.id}
          clientId={o.clientId}
          orderCode={o.code}
          unitPriceCents={invoiceUnitPriceCents.value}
          unitPriceSource={invoiceUnitPriceCents.source}
          fiscalPreFill={{
            rfc: fiscalQuery.data?.rfc ?? "",
            razonSocial: fiscalQuery.data?.razonSocial ?? "",
            regimen: fiscalQuery.data?.regimen ?? "",
            cfdiUse: fiscalQuery.data?.cfdiUse ?? "",
          }}
          defaultDueDate={defaultDueDate}
          defaultDescription={createInvoiceDescription}
          submitting={buildInvoiceDraft.isPending || fiscalUpsert.isPending || fiscalSubmitting}
          onSubmit={async (input) => {
            setCreateInvoiceFieldError(null);
            setCreateInvoiceError(null);
            // Validación de vigencia en cliente antes de salir al
            // backend: dueDate >= hoy y >= hoy+7d, valor unitario
            // no negativo. La firma YYYY-MM-DD la exige el zod
            // (`InvoiceBuildInputSchema`).
            if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
              setCreateInvoiceFieldError(
                messages.ordenes.createInvoiceErrorDueDatePast,
              );
              return;
            }
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);
            const due = new Date(`${input.dueDate}T00:00:00.000Z`);
            if (Number.isNaN(due.getTime()) || due.getTime() < today.getTime()) {
              setCreateInvoiceFieldError(
                messages.ordenes.createInvoiceErrorDueDatePast,
              );
              return;
            }
            const min = new Date(today);
            min.setUTCDate(min.getUTCDate() + 7);
            if (due.getTime() < min.getTime()) {
              setCreateInvoiceFieldError(
                messages.ordenes.createInvoiceErrorDueDateMin,
              );
              return;
            }
            if (input.valorUnitarioCents < 0) {
              setCreateInvoiceFieldError(
                messages.ordenes.createInvoiceErrorMontoNegativo,
              );
              return;
            }
            if (input.descripcion.trim().length === 0) {
              setCreateInvoiceFieldError(
                messages.ordenes.createInvoiceErrorGeneric,
              );
              return;
            }
            // Validación fiscal: RFC, razón social y régimen son
            // obligatorios para `buildFromOrder` (BR-N218). Si
            // faltan, no llegamos a `build` y marcamos error visible
            // fuera del diálogo (banner arriba del Card).
            const rfc = (input.rfc ?? "").trim().toUpperCase();
            const razonSocialTrim = (input.razonSocial ?? "").trim();
            const regimen = (input.regimen ?? "").trim();
            const cfdiUse = (input.cfdiUse ?? "").trim();
            if (!rfc || !razonSocialTrim || !regimen) {
              setCreateInvoiceError(
                messages.ordenes.createInvoiceFiscalMissing,
              );
              return;
            }
            // RFC: 3-4 letras + 6 dígitos + 3 alfanuméricos.
            if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/u.test(rfc)) {
              setCreateInvoiceError(
                messages.ordenes.createInvoiceFiscalInvalidRFC,
              );
              return;
            }
            // IMPL-20260825-34 (intento 2) · Cadena upsert → build.
            // Si `fiscalUpsert` falla, NO se llama `buildInvoiceDraft`.
            // El error del upsert (visible en `createInvoiceError` por
            // `onError` abajo) NO queda ocluido por el diálogo.
            setFiscalSubmitting(true);
            try {
              await new Promise<void>((resolve, reject) => {
                fiscalUpsert.mutate(
                  {
                    clientId: o.clientId,
                    rfc,
                    razonSocial: razonSocialTrim,
                    regimen,
                    ...(cfdiUse ? { cfdiUse } : {}),
                  },
                  {
                    onSuccess: () => resolve(),
                    onError: (err) => {
                      const code = err.data?.code ?? null;
                      if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
                        setCreateInvoiceError(
                          messages.ordenes.createInvoiceErrorForbidden,
                        );
                      } else if (
                        code === "CLIENT_NOT_FOUND" ||
                        code === "ORDER_NOT_FOUND"
                      ) {
                        setCreateInvoiceError(
                          messages.ordenes.createInvoiceErrorNotFound,
                        );
                      } else if (code === "RFC_DUPLICATE") {
                        setCreateInvoiceError(
                          messages.ordenes.createInvoiceFiscalInvalidRFC,
                        );
                      } else {
                        setCreateInvoiceError(
                          err.message ??
                            messages.ordenes.createInvoiceFiscalUpsertError,
                        );
                      }
                      reject(err);
                    },
                  },
                );
              });
              // Sólo después de upsert exitoso se llama `build`.
              buildInvoiceDraft.mutate({
                orderId: id,
                dueDate: input.dueDate,
                concept: [
                  {
                    claveProdServ: "84111506",
                    descripcion: input.descripcion.trim(),
                    cantidad: 1,
                    // Subtotal NETO de la cotización (no bruto). Si
                    // por alguna razón la cotización no expone
                    // `subtotalCents`, se hace fallback a
                    // `soldTotalCents` (warning visible arriba del
                    // Card); pero el camino por defecto es net.
                    valorUnitarioCents: input.valorUnitarioCents,
                  },
                ],
              });
            } finally {
              setFiscalSubmitting(false);
            }
          }}
          onClose={() => {
            if (buildInvoiceDraft.isPending || fiscalUpsert.isPending || fiscalSubmitting) return;
            setCreateInvoiceOpen(false);
            setCreateInvoiceFieldError(null);
          }}
          fieldError={createInvoiceFieldError}
        />
      ) : null}
    </div>
  );
}

/**
 * IMPL-20260825-34 · Diálogo accesible para armar la factura borrador
 * (SPEC-20260817-007 BR-N301/BR-N218). El formulario NO pide UUID
 * manual: `orderId` y `clientId` se reciben del padre. El valor
 * unitario inicial se deriva del SUBTOTAL NETO de la cotización
 * (`unitPriceSource === "quote"`); sólo como fallback se usa
 * `soldTotalCents` (visible en UI con warning). El diálogo captura
 * RFC, razón social y régimen del cliente (BR-N218) ANTES de
 * armar el comprobante, para evitar 409
 * `INVOICE_FISCAL_DATA_REQUIRED`. NO abre `window.prompt` ni accede
 * a BD.
 */
function CreateInvoiceDraftDialog({
  orderId,
  clientId,
  orderCode,
  unitPriceCents,
  unitPriceSource,
  fiscalPreFill,
  defaultDueDate,
  defaultDescription,
  submitting,
  fieldError,
  onSubmit,
  onClose,
}: {
  orderId: string;
  clientId: string;
  orderCode: string;
  unitPriceCents: number;
  unitPriceSource: "quote" | "soldTotal" | "unknown";
  fiscalPreFill: {
    rfc: string;
    razonSocial: string;
    regimen: string;
    cfdiUse: string;
  };
  defaultDueDate: string;
  defaultDescription: string;
  submitting: boolean;
  fieldError: string | null;
  onSubmit: (input: {
    dueDate: string;
    descripcion: string;
    valorUnitarioCents: number;
    rfc: string;
    razonSocial: string;
    regimen: string;
    cfdiUse: string;
  }) => void | Promise<void>;
  onClose: () => void;
}) {
  const [dueDate, setDueDate] = React.useState(defaultDueDate);
  const [descripcion, setDescripcion] = React.useState(defaultDescription);
  const [valorUnitarioCents, setValorUnitarioCents] =
    React.useState(unitPriceCents);
  const [rfc, setRfc] = React.useState(fiscalPreFill.rfc);
  const [razonSocial, setRazonSocial] = React.useState(
    fiscalPreFill.razonSocial,
  );
  const [regimen, setRegimen] = React.useState(fiscalPreFill.regimen);
  const [cfdiUse, setCfdiUse] = React.useState(fiscalPreFill.cfdiUse);
  // Sincroniza el valor unitario y los datos fiscales cuando el
  // padre los actualiza (ej. tras refetch de la cotización).
  React.useEffect(() => {
    setValorUnitarioCents(unitPriceCents);
  }, [unitPriceCents]);
  React.useEffect(() => {
    setRfc(fiscalPreFill.rfc);
    setRazonSocial(fiscalPreFill.razonSocial);
    setRegimen(fiscalPreFill.regimen);
    setCfdiUse(fiscalPreFill.cfdiUse);
  }, [
    fiscalPreFill.rfc,
    fiscalPreFill.razonSocial,
    fiscalPreFill.regimen,
    fiscalPreFill.cfdiUse,
  ]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={messages.ordenes.createInvoiceDialogTitle}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      data-testid="orden-detail-create-invoice-dialog"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-lg bg-background p-6 shadow-xl sm:rounded-lg">
        <h2 className="mb-1 text-lg font-bold">
          {messages.ordenes.createInvoiceDialogTitle}
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          {messages.ordenes.createInvoiceDialogDescription}
        </p>
        <div className="space-y-3 text-sm">
          <div>
            <Label htmlFor="ci-due-date">
              {messages.ordenes.createInvoiceDueDate}
            </Label>
            <Input
              id="ci-due-date"
              type="date"
              value={dueDate}
              min={defaultDueDate}
              onChange={(e) => setDueDate(e.target.value)}
              data-testid="orden-detail-create-invoice-dialog-due"
            />
          </div>
          <div>
            <Label htmlFor="ci-descripcion">
              {messages.ordenes.createInvoiceDescription}
            </Label>
            <Input
              id="ci-descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={messages.ordenes.createInvoiceDescriptionPlaceholder.replace(
                "{code}",
                orderCode,
              )}
              data-testid="orden-detail-create-invoice-dialog-descripcion"
            />
          </div>
          <div>
            <Label htmlFor="ci-valor">
              {messages.ordenes.createInvoiceUnitPriceCents}
            </Label>
            <Input
              id="ci-valor"
              type="number"
              min={0}
              value={valorUnitarioCents}
              onChange={(e) =>
                setValorUnitarioCents(Number(e.target.value) || 0)
              }
              data-testid="orden-detail-create-invoice-dialog-valor"
            />
            {unitPriceSource !== "quote" ? (
              <p
                role="note"
                className="mt-1 text-xs text-amber-700"
                data-testid="orden-detail-create-invoice-dialog-valor-warning"
              >
                {messages.ordenes.createInvoiceQuoteSubtotalFallback}
              </p>
            ) : null}
          </div>
          <fieldset className="rounded-md border bg-secondary/30 p-3">
            <legend className="px-1 text-xs font-medium">
              {messages.ordenes.createInvoiceFiscalSectionTitle}
            </legend>
            <p className="mb-2 text-xs text-muted-foreground">
              {messages.ordenes.createInvoiceFiscalSectionHelp}
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <Label htmlFor="ci-rfc">{messages.clientes.rfc}</Label>
                <Input
                  id="ci-rfc"
                  value={rfc}
                  onChange={(e) => setRfc(e.target.value.toUpperCase())}
                  placeholder="XAXX010101000"
                  data-testid="orden-detail-create-invoice-dialog-rfc"
                />
              </div>
              <div>
                <Label htmlFor="ci-razon">
                  {messages.clientes.razonSocial}
                </Label>
                <Input
                  id="ci-razon"
                  value={razonSocial}
                  onChange={(e) => setRazonSocial(e.target.value)}
                  data-testid="orden-detail-create-invoice-dialog-razon"
                />
              </div>
              <div>
                <Label htmlFor="ci-regimen">
                  {messages.clientes.regimen}
                </Label>
                <Input
                  id="ci-regimen"
                  value={regimen}
                  onChange={(e) => setRegimen(e.target.value)}
                  data-testid="orden-detail-create-invoice-dialog-regimen"
                />
              </div>
              <div>
                <Label htmlFor="ci-cfdi-use">
                  {messages.clientes.cfdiUse}
                </Label>
                <Input
                  id="ci-cfdi-use"
                  value={cfdiUse}
                  onChange={(e) => setCfdiUse(e.target.value)}
                  data-testid="orden-detail-create-invoice-dialog-cfdi-use"
                />
              </div>
            </div>
            <p className="mt-2 break-all text-xs text-muted-foreground">
              Cliente: <span className="font-mono">{clientId}</span>
            </p>
          </fieldset>
          <div className="rounded-md border bg-secondary/40 p-2 text-xs">
            <p className="font-medium">{messages.ordenes.createInvoiceSummary}</p>
            <p>
              OS: <span className="font-mono">{orderId}</span> · qty 1 ·{" "}
              {fmtMXN(valorUnitarioCents)}
            </p>
          </div>
          {fieldError ? (
            <p
              role="alert"
              className="text-xs text-destructive"
              data-testid="orden-detail-create-invoice-dialog-error"
            >
              {fieldError}
            </p>
          ) : null}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
            data-testid="orden-detail-create-invoice-dialog-cancel"
          >
            Cerrar
          </Button>
          <Button
            type="button"
            onClick={() =>
              onSubmit({
                dueDate,
                descripcion,
                valorUnitarioCents,
                rfc,
                razonSocial,
                regimen,
                cfdiUse,
              })
            }
            disabled={
              submitting ||
              descripcion.trim().length === 0 ||
              rfc.trim().length === 0 ||
              razonSocial.trim().length === 0 ||
              regimen.trim().length === 0
            }
            aria-busy={submitting ? true : undefined}
            data-testid="orden-detail-create-invoice-dialog-submit"
          >
            {submitting
              ? messages.ordenes.createInvoiceSubmitting
              : messages.ordenes.createInvoiceAction}
          </Button>
        </div>
      </div>
    </div>
  );
}
