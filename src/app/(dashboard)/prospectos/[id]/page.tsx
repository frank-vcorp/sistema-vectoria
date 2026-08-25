"use client";

import * as React from "react";
import Link from "next/link";
import { messages } from "@/shared/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

/**
 * Detalle de prospecto (SPEC-002). Carga por id y expone las acciones
 * compatibles con los procedimientos existentes:
 *
 *  - `qualify` (BR-N148): requiere cuestionario vinculado (SPEC-003).
 *    No hay endpoint público que liste cuestionarios por prospecto, por
 *    lo que la UI NO consume UUIDs dummy. La acción se muestra bloqueada
 *    con explicación; el gap de contrato se reporta a ATLAS como
 *    `SPEC-GAP` (no se implementa aquí porque requiere contrato nuevo).
 *  - `setLost` / `setSuspended` (BR-N213/214): motivo obligatorio,
 *    capturado en un Dialog inline (sin `window.prompt`).
 *  - `reactivate` (BR-N214): sólo desde `suspendido`; conserva
 *    historial.
 *
 * IMPORTANTE: Next.js 14.2 entrega `params` como objeto plano (no
 * Promise) y React 18.3 no expone `React.use`. Tratarlo como objeto
 * evita la excepción cliente "Application error" en staging.
 */
type ActionDialog = null | "lost" | "suspended";

export default function ProspectoDetallePage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const utils = trpc.useUtils();
  const query = trpc.clientes.prospectos.byId.useQuery({ prospectId: id });

  const [dialog, setDialog] = React.useState<ActionDialog>(null);
  const [reason, setReason] = React.useState("");
  const [reasonError, setReasonError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const setLost = trpc.clientes.prospectos.setLost.useMutation({
    onSuccess: () => {
      setDialog(null);
      setReason("");
      setReasonError(null);
      setActionError(null);
      void utils.clientes.prospectos.byId.invalidate({ prospectId: id });
      void utils.clientes.prospectos.list.invalidate();
    },
    onError: (err) => {
      const code = err.data?.code ?? null;
      if (code === "LOST_REASON_REQUIRED") {
        setReasonError(messages.prospectos.form.errors.reasonMinLength);
        return;
      }
      setActionError(err.message ?? messages.prospectos.form.errors.createFailed);
    },
  });

  const setSuspended = trpc.clientes.prospectos.setSuspended.useMutation({
    onSuccess: () => {
      setDialog(null);
      setReason("");
      setReasonError(null);
      setActionError(null);
      void utils.clientes.prospectos.byId.invalidate({ prospectId: id });
      void utils.clientes.prospectos.list.invalidate();
    },
    onError: (err) => {
      const code = err.data?.code ?? null;
      if (code === "SUSPENDED_REASON_REQUIRED") {
        setReasonError(messages.prospectos.form.errors.reasonMinLength);
        return;
      }
      setActionError(err.message ?? messages.prospectos.form.errors.createFailed);
    },
  });

  const reactivate = trpc.clientes.prospectos.reactivate.useMutation({
    onSuccess: () => {
      setActionError(null);
      void utils.clientes.prospectos.byId.invalidate({ prospectId: id });
      void utils.clientes.prospectos.list.invalidate();
    },
    onError: (err) => {
      setActionError(err.message ?? messages.prospectos.form.errors.createFailed);
    },
  });

  if (query.isLoading) {
    return (
      <p className="text-sm text-muted-foreground">{messages.common.loading}</p>
    );
  }
  if (query.error || !query.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{messages.errors.notFound}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/prospectos">{messages.common.back}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  const p = query.data;
  const isLost = p.status === "perdido";
  const isSuspended = p.status === "suspendido";
  const canSetLostOrSuspended = !isLost; // perdido es terminal; suspendido permite ambos antes
  const reasonMinLength = 3;

  function openDialog(target: ActionDialog) {
    setReason("");
    setReasonError(null);
    setActionError(null);
    setDialog(target);
  }

  function submitReason() {
    if (reason.trim().length < reasonMinLength) {
      setReasonError(messages.prospectos.form.errors.reasonMinLength);
      return;
    }
    setReasonError(null);
    if (dialog === "lost") {
      setLost.mutate({ prospectId: p.id, reason: reason.trim() });
    } else if (dialog === "suspended") {
      setSuspended.mutate({ prospectId: p.id, reason: reason.trim() });
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>{p.name}</CardTitle>
              <CardDescription>
                {p.code} ·{" "}
                {(messages.prospectStatus as Record<string, string>)[p.status] ??
                  p.status}
              </CardDescription>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <Link href="/prospectos">{messages.common.back}</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {p.company ? (
            <p>
              <strong>{messages.prospectos.company}:</strong> {p.company}
            </p>
          ) : null}
          {p.email ? (
            <p>
              <strong>{messages.prospectos.email}:</strong> {p.email}
            </p>
          ) : null}
          {p.phone ? (
            <p>
              <strong>{messages.prospectos.phone}:</strong> {p.phone}
            </p>
          ) : null}
          {p.source ? (
            <p>
              <strong>{messages.prospectos.source}:</strong> {p.source}
            </p>
          ) : null}
          {p.medium ? (
            <p>
              <strong>{messages.prospectos.medium}:</strong>{" "}
              {(messages.medios as Record<string, string>)[p.medium] ?? p.medium}
            </p>
          ) : null}
          {p.lostReason ? (
            <p>
              <strong>{messages.prospectos.lostReason}:</strong> {p.lostReason}
            </p>
          ) : null}
          {p.suspendedReason ? (
            <p>
              <strong>{messages.prospectos.suspendedReason}:</strong>{" "}
              {p.suspendedReason}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{messages.prospectos.actions.title}</CardTitle>
          <CardDescription>
            {messages.prospectos.actions.subtitle}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {/*
              SPEC-002-UI-20260824-04 · P3 UX: la acción `Calificar` se
              mantiene SIEMPRE deshabilitada mientras SPEC-003 no
              exponga cuestionarios publicados por prospecto (BR-N148).
              El botón no invoca handler ni envía UUID dummy: sin
              cuestionario real, la acción no debe parecer operable.
              La nota accesible vinculada por `aria-describedby`
              comunica el motivo sin afectar el layout.
            */}
            <Button
              variant="default"
              size="sm"
              disabled
              title={messages.prospectos.qualifyNeedsQuestionnaire}
              aria-describedby="prospecto-qualify-blocked-note"
              data-testid="prospecto-qualify-button"
              aria-disabled
            >
              {messages.prospectos.qualify}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canSetLostOrSuspended || setLost.isPending}
              onClick={() => openDialog("lost")}
              data-testid="prospecto-mark-lost-button"
            >
              {messages.prospectos.markLost}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canSetLostOrSuspended || setSuspended.isPending}
              onClick={() => openDialog("suspended")}
              data-testid="prospecto-mark-suspended-button"
            >
              {messages.prospectos.markSuspended}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!isSuspended || reactivate.isPending}
              onClick={() => reactivate.mutate({ prospectId: p.id })}
              data-testid="prospecto-reactivate-button"
            >
              {messages.prospectos.reactivate}
            </Button>
          </div>

          <p
            id="prospecto-qualify-blocked-note"
            className="text-xs text-muted-foreground"
            role="note"
            data-testid="prospecto-qualify-blocked-note"
          >
            {messages.prospectos.qualifyNeedsQuestionnaire}
          </p>

          {actionError ? (
            <p
              role="alert"
              className="text-sm text-destructive"
              data-testid="prospecto-action-error"
            >
              {actionError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={dialog !== null}
        onOpenChange={(next) => {
          if (!next) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "lost"
                ? messages.prospectos.actions.markLostTitle
                : messages.prospectos.actions.markSuspendedTitle}
            </DialogTitle>
            <DialogDescription>
              {dialog === "suspended"
                ? messages.prospectos.suspendedReason
                : messages.prospectos.lostReason}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="prospecto-reason">
              {dialog === "suspended"
                ? messages.prospectos.suspendedReason
                : messages.prospectos.lostReason}
            </Label>
            <Input
              id="prospecto-reason"
              name="reason"
              autoComplete="off"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (reasonError) setReasonError(null);
              }}
              placeholder={messages.prospectos.actions.reasonPlaceholder}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={
                reasonError ? "prospecto-reason-error" : undefined
              }
              disabled={setLost.isPending || setSuspended.isPending}
            />
            {reasonError ? (
              <p
                id="prospecto-reason-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {reasonError}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialog(null)}
              disabled={setLost.isPending || setSuspended.isPending}
            >
              {messages.prospectos.actions.cancel}
            </Button>
            <Button
              type="button"
              disabled={setLost.isPending || setSuspended.isPending}
              onClick={submitReason}
              data-testid="prospecto-action-confirm"
            >
              {messages.prospectos.actions.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}