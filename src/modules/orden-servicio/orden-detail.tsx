"use client";

import * as React from "react";
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
  const closeAdmin = trpc.ordenServicio.closeAdministrative.useMutation({
    onSuccess: () => utils.ordenServicio.byId.invalidate({ orderId: id }),
  });

  const [plUserId, setPlUserId] = React.useState("");
  const [pauseReason, setPauseReason] = React.useState("");
  const [cancelReason, setCancelReason] = React.useState("");
  const [directorReason, setDirectorReason] = React.useState("");

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
    </div>
  );
}
