"use client";

/**
 * SPEC-002-UI-20260825-22 + IMPL-20260825-23 · Detalle del alcance.
 *
 * Lee el documento vía `trpc.comercial.alcance.byId` (sin acceso
 * directo a BD, sin UUID dummy) y muestra de forma segura y
 * responsive:
 *  - id, status, prospecto, questionnaireResponseId, templateId,
 *    version, generatedAt y projectType.
 *  - Bloques del contenido (`included`, `excluded`, `deliverables`,
 *    `assumptions`, `clientDependencies`, `acceptanceCriteria`).
 *  - En `signed`: `signedAt`, `signedBy`, `signedReason` y nota de
 *    inmutabilidad (BR-N52).
 *
 * IMPL-20260825-23 cablea las transiciones existentes:
 *  - `draft` → botón "Enviar a revisión" → `alcance.submitForReview`.
 *  - `in_review` → botón "Firmar alcance" → diálogo con motivo
 *    obligatorio (≥3) → `alcance.sign` (BR-N231/52).
 *  - `signed` → ninguna mutación; sólo lectura + nota de inmutabilidad.
 *
 * Errores de permisos o dominio se exponen con `role="alert"`; la UI
 * NO afirma éxito si la mutación falla.
 */
import * as React from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { messages } from "@/shared/utils";
import { trpc } from "@/lib/trpc";
import { SignAlcanceDialog } from "./sign-alcance-dialog";

/** Bloques tal como los produce `generateScopeDraftContent` (helpers.ts). */
interface ScopeDraftBlocks {
  included?: unknown;
  excluded?: unknown;
  deliverables?: unknown;
  assumptions?: unknown;
  clientDependencies?: unknown;
  acceptanceCriteria?: unknown;
}

interface ScopeDraftContentShape {
  projectType?: unknown;
  blocks?: ScopeDraftBlocks;
  generatedAt?: unknown;
}

function readStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const it of raw) {
    if (typeof it === "string" && it.trim().length > 0) out.push(it);
  }
  return out;
}

function readStringOrNull(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim().length > 0 ? raw : null;
}

function statusLabel(status: string): string {
  if (status === "draft") return messages.alcance.statusDraft;
  if (status === "in_review") return messages.alcance.statusInReview;
  if (status === "signed") return messages.alcance.statusSigned;
  return status;
}

export function AlcanceDetail({ id }: { id: string }) {
  const query = trpc.comercial.alcance.byId.useQuery(
    { id },
    { enabled: id.length > 0, retry: 1 },
  );

  const [signOpen, setSignOpen] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const submitForReview = trpc.comercial.alcance.submitForReview.useMutation({
    onError: (err) => {
      const code = err.data?.code ?? null;
      if (code === "FORBIDDEN") {
        setSubmitError(messages.alcance.transitionError);
        return;
      }
      if (code === "SCOPE_ALREADY_SIGNED") {
        setSubmitError(err.message ?? messages.alcance.signImmutableNote);
        return;
      }
      setSubmitError(err.message ?? messages.alcance.submitForReviewError);
    },
    onSuccess: () => {
      setSubmitError(null);
      void query.refetch();
    },
  });

  if (query.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{messages.alcance.title}</CardTitle>
          <CardDescription>{messages.common.loading}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (query.error || !query.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{messages.alcance.title}</CardTitle>
          <CardDescription>
            {query.error?.message ?? messages.alcance.detailError}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/comercial/alcance">{messages.common.back}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const scope = query.data;
  const status = scope.status;
  const canSubmitForReview = status === "draft";
  const canSign = status === "in_review";
  const isSigned = status === "signed";

  function onSubmitForReview() {
    if (!query.data) return;
    setSubmitError(null);
    submitForReview.mutate({ scopeId: query.data.id });
  }

  const content: ScopeDraftContentShape =
    scope.content && typeof scope.content === "object"
      ? (scope.content as ScopeDraftContentShape)
      : {};
  const blocks = content.blocks ?? {};
  const included = readStringArray(blocks.included);
  const excluded = readStringArray(blocks.excluded);
  const deliverables = readStringArray(blocks.deliverables);
  const assumptions = readStringArray(blocks.assumptions);
  const dependencies = readStringArray(blocks.clientDependencies);
  const acceptance = readStringArray(blocks.acceptanceCriteria);
  const projectType = readStringOrNull(content.projectType);
  const generatedAt = readStringOrNull(content.generatedAt);
  const hasAnyBlock =
    included.length +
      excluded.length +
      deliverables.length +
      assumptions.length +
      dependencies.length +
      acceptance.length >
    0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>{messages.alcance.title}</CardTitle>
              <CardDescription>
                {messages.alcance.idLabel}:{" "}
                <span
                  className="font-mono"
                  data-testid="alcance-detail-id"
                >
                  {scope.id}
                </span>
              </CardDescription>
            </div>
            <span
              className="self-start rounded-full bg-muted px-2 py-0.5 text-xs"
              data-testid="alcance-detail-status"
            >
              {statusLabel(scope.status)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p data-testid="alcance-detail-version">
            <strong>{messages.alcance.versionLabel}:</strong> {scope.version}
          </p>
          {scope.prospectId ? (
            <p data-testid="alcance-detail-prospect">
              <strong>{messages.alcance.templateLabel}:</strong>{" "}
              <span className="font-mono">{scope.prospectId}</span>
            </p>
          ) : null}
          <p data-testid="alcance-detail-template">
            <strong>{messages.alcance.templateLabel}:</strong>{" "}
            <span className="font-mono">{scope.templateId}</span>
          </p>
          <p data-testid="alcance-detail-questionnaire">
            <strong>{messages.alcance.questionnaireResponseLabel}:</strong>{" "}
            <span className="font-mono">{scope.questionnaireResponseId}</span>
          </p>
          {projectType ? (
            <p data-testid="alcance-detail-project-type">
              <strong>{messages.alcance.projectTypeLabel}:</strong>{" "}
              {projectType}
            </p>
          ) : null}
          {generatedAt ? (
            <p data-testid="alcance-detail-generated-at">
              <strong>{messages.alcance.generatedAtLabel}:</strong>{" "}
              {generatedAt}
            </p>
          ) : null}
          {isSigned ? (
            <>
              {readStringOrNull(scope.signedAt) ? (
                <p data-testid="alcance-detail-signed-at">
                  <strong>{messages.alcance.signedAtLabel}:</strong>{" "}
                  {String(scope.signedAt)}
                </p>
              ) : null}
              {readStringOrNull(scope.signedBy) ? (
                <p data-testid="alcance-detail-signed-by">
                  <strong>{messages.alcance.signedByLabel}:</strong>{" "}
                  <span className="font-mono">{scope.signedBy}</span>
                </p>
              ) : null}
              {readStringOrNull(scope.signedReason) ? (
                <p
                  className="sm:col-span-2"
                  data-testid="alcance-detail-signed-reason"
                >
                  <strong>{messages.alcance.signedReasonLabel}:</strong>{" "}
                  {scope.signedReason}
                </p>
              ) : null}
            </>
          ) : null}
        </CardContent>
        {canSubmitForReview || canSign ? (
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {canSubmitForReview ? (
              <Button
                type="button"
                onClick={onSubmitForReview}
                disabled={submitForReview.isPending}
                data-testid="alcance-detail-submit-for-review"
              >
                {submitForReview.isPending
                  ? messages.alcance.submitForReviewSubmitting
                  : messages.alcance.submitForReview}
              </Button>
            ) : null}
            {canSign ? (
              <Button
                type="button"
                onClick={() => setSignOpen(true)}
                data-testid="alcance-detail-open-sign"
              >
                {messages.alcance.sign}
              </Button>
            ) : null}
          </CardContent>
        ) : null}
        {isSigned ? (
          <CardContent>
            <p
              className="text-xs text-muted-foreground"
              data-testid="alcance-detail-immutable-note"
            >
              {messages.alcance.signImmutableNote}
            </p>
          </CardContent>
        ) : null}
      </Card>

      {submitError ? (
        <p
          role="alert"
          className="text-sm text-destructive"
          data-testid="alcance-detail-transition-error"
        >
          {submitError}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{messages.alcance.blocksTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasAnyBlock ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <BlockSection
                testId="alcance-block-included"
                title={messages.alcance.blockIncluded}
                items={included}
              />
              <BlockSection
                testId="alcance-block-excluded"
                title={messages.alcance.blockExcluded}
                items={excluded}
              />
              <BlockSection
                testId="alcance-block-deliverables"
                title={messages.alcance.blockDeliverables}
                items={deliverables}
              />
              <BlockSection
                testId="alcance-block-assumptions"
                title={messages.alcance.blockAssumptions}
                items={assumptions}
              />
              <BlockSection
                testId="alcance-block-dependencies"
                title={messages.alcance.blockDependencies}
                items={dependencies}
              />
              <BlockSection
                testId="alcance-block-acceptance"
                title={messages.alcance.blockAcceptanceCriteria}
                items={acceptance}
              />
            </div>
          ) : (
            <p
              className="text-sm text-muted-foreground"
              data-testid="alcance-detail-no-blocks"
            >
              {messages.alcance.noBlocks}
            </p>
          )}
        </CardContent>
      </Card>

      <SignAlcanceDialog
        scopeId={scope.id}
        scopeContext={`${messages.alcance.idLabel}: ${scope.id}`}
        open={signOpen}
        onOpenChange={setSignOpen}
        onSuccess={() => {
          setSignOpen(false);
          void query.refetch();
        }}
      />
    </div>
  );
}

function BlockSection({
  testId,
  title,
  items,
}: {
  testId: string;
  title: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <section
      className="space-y-1"
      data-testid={testId}
      aria-label={title}
    >
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
        {items.map((it, idx) => (
          <li key={`${testId}-${idx}`}>{it}</li>
        ))}
      </ul>
    </section>
  );
}
