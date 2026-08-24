/**
 * Servicio `changeRequests` — SPEC-006 §4.3 / AC-7.
 *
 * Con costo (BR-N294): exigen cotización+evidencia antes de
 * `authorized`. Sin costo (BR-N395): omiten `quoted`/`authorized`;
 * tras `analysis` el flujo salta directo a `in_progress` (la
 * "autorización" no aplica).
 *
 * El alcance original NO se altera (BR-N296): la autorización sólo
 * incrementa `version` en la metadata del CR.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import {
  changeRequests,
  projects,
  quotes,
} from "@/server/db/schema";
import {
  CHANGE_REQUEST_STATUSES,
  type ChangeRequestStatus,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import {
  canTransitionChangeRequest,
  validateChangeRequestAuthorizeGates,
} from "./helpers-ejecucion";

export interface ChangeRequestDTO {
  id: string;
  organizationId: string;
  projectId: string;
  folio: string;
  status: ChangeRequestStatus;
  hasCost: boolean;
  impact: Record<string, unknown>;
  linkedQuoteId: string | null;
  evidenceFileId: string | null;
  evidenceKind: string;
  reason: string;
  notes: string | null;
  requestedBy: string | null;
  requestedAt: Date;
  authorizedBy: string | null;
  authorizedAt: Date | null;
  version: number;
  quotedAmountCents: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChangeRequestsService {
  create(
    ctx: Context,
    input: {
      projectId: string;
      folio: string;
      reason: string;
      hasCost?: boolean;
      impactSummary?: string;
    },
  ): Promise<ChangeRequestDTO>;
  quote(
    ctx: Context,
    input: {
      changeRequestId: string;
      evidenceKind: "quote" | "custom";
      linkedQuoteId?: string | null;
      evidenceFileId?: string | null;
      notes?: string;
    },
  ): Promise<ChangeRequestDTO>;
  authorize(
    ctx: Context,
    input: { changeRequestId: string },
  ): Promise<ChangeRequestDTO>;
  reject(
    ctx: Context,
    input: { changeRequestId: string; reason: string },
  ): Promise<ChangeRequestDTO>;
  startImplementation(
    ctx: Context,
    input: { changeRequestId: string },
  ): Promise<ChangeRequestDTO>;
  completeImplementation(
    ctx: Context,
    input: { changeRequestId: string },
  ): Promise<ChangeRequestDTO>;
  list(
    ctx: Context,
    input: { projectId: string; status?: ChangeRequestStatus },
  ): Promise<ChangeRequestDTO[]>;
}

function statusOf(value: string): ChangeRequestStatus {
  return (CHANGE_REQUEST_STATUSES as readonly string[]).includes(value)
    ? (value as ChangeRequestStatus)
    : "requested";
}

function toDto(
  row: typeof changeRequests.$inferSelect,
): ChangeRequestDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    folio: row.folio,
    status: statusOf(row.status),
    hasCost: row.hasCost === "true",
    impact: (row.impact ?? {}) as Record<string, unknown>,
    linkedQuoteId: row.linkedQuoteId ?? null,
    evidenceFileId: row.evidenceFileId ?? null,
    evidenceKind: row.evidenceKind,
    reason: row.reason,
    notes: row.notes ?? null,
    requestedBy: row.requestedBy ?? null,
    requestedAt: row.requestedAt,
    authorizedBy: row.authorizedBy ?? null,
    authorizedAt: row.authorizedAt,
    version: row.version,
    quotedAmountCents: row.quotedAmountCents ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createChangeRequestsService(): ChangeRequestsService {
  const db = getDb();

  async function loadCR(orgId: string, id: string) {
    const [row] = await db
      .select()
      .from(changeRequests)
      .where(
        and(eq(changeRequests.organizationId, orgId), eq(changeRequests.id, id)),
      )
      .limit(1);
    if (!row) {
      throw new DomainError(
        "CHANGE_REQUEST_NOT_FOUND",
        "Cambio de alcance no encontrado",
        404,
      );
    }
    return row;
  }

  async function loadProject(orgId: string, projectId: string) {
    const [row] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId)))
      .limit(1);
    if (!row) {
      throw new DomainError("PROJECT_NOT_FOUND", "Proyecto no encontrado", 404);
    }
    return row;
  }

  async function loadQuote(orgId: string, quoteId: string) {
    const [row] = await db
      .select()
      .from(quotes)
      .where(and(eq(quotes.organizationId, orgId), eq(quotes.id, quoteId)))
      .limit(1);
    return row;
  }

  async function create(
    ctx: Context,
    input: {
      projectId: string;
      folio: string;
      reason: string;
      hasCost?: boolean;
      impactSummary?: string;
    },
  ): Promise<ChangeRequestDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_proyectos", {
      forceDb: true,
    });
    await loadProject(user.organization_id, input.projectId);
    const [created] = await db
      .insert(changeRequests)
      .values({
        organizationId: user.organization_id,
        projectId: input.projectId,
        folio: input.folio,
        status: "requested",
        hasCost: input.hasCost ? "true" : "false",
        reason: input.reason,
        ...(input.impactSummary !== undefined
          ? { impact: { summary: input.impactSummary } }
          : {}),
        requestedBy: user.id,
      })
      .returning();
    if (!created) throw new Error("change_request create sin fila");
    const { createAuditService } = await import("@/server/services/audit");
    await createAuditService().record(ctx, {
      entityType: "change_request",
      entityId: created.id,
      action: "change_request.create",
      after: {
        projectId: created.projectId,
        folio: created.folio,
        status: created.status,
        hasCost: created.hasCost,
      },
    });
    return toDto(created);
  }

  async function quote(
    ctx: Context,
    input: {
      changeRequestId: string;
      evidenceKind: "quote" | "custom";
      linkedQuoteId?: string | null;
      evidenceFileId?: string | null;
      notes?: string;
    },
  ): Promise<ChangeRequestDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_proyectos", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const before = await loadCR(user.organization_id, input.changeRequestId);
      const t = canTransitionChangeRequest(before.status, "quoted");
      if (!t.ok) {
        throw new DomainError(
          t.code,
          `No se puede cotizar un CR en estado ${before.status}`,
          409,
        );
      }
      if (!before.hasCost || before.hasCost === "false") {
        // Sin costo no se requiere cotización (BR-N395). El flujo
        // salta de analysis → in_progress. Mantenemos el helper
        // accesible pero permitimos "saltar" la cotización dejando
        // el registro para auditoría sin transición (no mutamos
        // status).
        throw new DomainError(
          "CHANGE_REQUEST_INVALID_TRANSITION",
          "Un CR sin costo no requiere cotización",
          409,
        );
      }
      if (input.evidenceKind === "quote") {
        if (!input.linkedQuoteId) {
          throw new DomainError(
            "CHANGE_QUOTE_REQUIRED",
            "Cotización obligatoria cuando la evidencia es 'quote'",
            409,
          );
        }
        const q = await loadQuote(user.organization_id, input.linkedQuoteId);
        if (!q) {
          throw new DomainError(
            "CHANGE_QUOTE_REQUIRED",
            "Cotización no encontrada",
            409,
          );
        }
      }
      const [after] = await tx
        .update(changeRequests)
        .set({
          status: "quoted",
          evidenceKind: input.evidenceKind,
          ...(input.linkedQuoteId !== undefined
            ? { linkedQuoteId: input.linkedQuoteId }
            : {}),
          ...(input.evidenceFileId !== undefined
            ? { evidenceFileId: input.evidenceFileId }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        })
        .where(
          and(
            eq(
              changeRequests.organizationId,
              user.organization_id,
            ),
            eq(changeRequests.id, input.changeRequestId),
          ),
        )
        .returning();
      if (!after) throw new Error("change_request quote sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "change_request",
        entityId: after.id,
        action: "change_request.quote",
        before: { status: before.status },
        after: {
          status: after.status,
          evidenceKind: after.evidenceKind,
          linkedQuoteId: after.linkedQuoteId,
          evidenceFileId: after.evidenceFileId,
        },
      });
      return toDto(after);
    });
  }

  async function authorize(
    ctx: Context,
    input: { changeRequestId: string },
  ): Promise<ChangeRequestDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "aprobar_cambios", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const before = await loadCR(user.organization_id, input.changeRequestId);
      // Sin costo: saltamos quoted/authorized (BR-N395) y vamos a
      // in_progress. Esta función sólo aplica a CR con costo.
      if (before.hasCost !== "true") {
        throw new DomainError(
          "CHANGE_REQUEST_INVALID_TRANSITION",
          "Un CR sin costo no requiere autorización; use startImplementation",
          409,
        );
      }
      const gates = validateChangeRequestAuthorizeGates({
        hasCost: true,
        evidenceKind: before.evidenceKind,
        linkedQuoteId: before.linkedQuoteId,
        evidenceFileId: before.evidenceFileId,
      });
      if (!gates.ok) {
        throw new DomainError(
          gates.code,
          "Cotización o evidencia obligatoria para autorizar un CR con costo",
          409,
        );
      }
      // Transición: quoted → authorized.
      const t = canTransitionChangeRequest(before.status, "authorized");
      if (!t.ok) {
        throw new DomainError(
          t.code,
          `No se puede autorizar un CR en estado ${before.status}`,
          409,
        );
      }
      const [after] = await tx
        .update(changeRequests)
        .set({
          status: "authorized",
          authorizedBy: user.id,
          authorizedAt: new Date(),
          version: before.version + 1,
        })
        .where(
          and(
            eq(
              changeRequests.organizationId,
              user.organization_id,
            ),
            eq(changeRequests.id, input.changeRequestId),
          ),
        )
        .returning();
      if (!after) throw new Error("change_request authorize sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "change_request",
        entityId: after.id,
        action: "change_request.authorize",
        before: { status: before.status, version: before.version },
        after: {
          status: after.status,
          version: after.version,
          authorizedBy: after.authorizedBy,
        },
        ...(ctx.actorRoleCode !== undefined ? { actorRoleCode: ctx.actorRoleCode } : {}),
      });
      return toDto(after);
    });
  }

  async function reject(
    ctx: Context,
    input: { changeRequestId: string; reason: string },
  ): Promise<ChangeRequestDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "aprobar_cambios", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const before = await loadCR(user.organization_id, input.changeRequestId);
      const t = canTransitionChangeRequest(before.status, "rejected");
      if (!t.ok) {
        throw new DomainError(
          t.code,
          `No se puede rechazar un CR en estado ${before.status}`,
          409,
        );
      }
      const [after] = await tx
        .update(changeRequests)
        .set({
          status: "rejected",
          reason: input.reason.trim(),
        })
        .where(
          and(
            eq(changeRequests.organizationId, user.organization_id),
            eq(changeRequests.id, input.changeRequestId),
          ),
        )
        .returning();
      if (!after) throw new Error("change_request reject sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "change_request",
        entityId: after.id,
        action: "change_request.reject",
        before: { status: before.status },
        after: { status: after.status, reason: after.reason },
      });
      return toDto(after);
    });
  }

  async function startImplementation(
    ctx: Context,
    input: { changeRequestId: string },
  ): Promise<ChangeRequestDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "operar_proyectos", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const before = await loadCR(user.organization_id, input.changeRequestId);
      // Con costo: authorized → in_progress.
      // Sin costo (BR-N395): analysis → in_progress.
      const from =
        before.hasCost === "true" ? "authorized" : "analysis";
      const t = canTransitionChangeRequest(before.status, "in_progress");
      if (!t.ok || before.status !== from) {
        throw new DomainError(
          t.ok ? "CHANGE_REQUEST_INVALID_TRANSITION" : t.code,
          `El CR debe estar en '${from}' para iniciar implementación (actual: ${before.status})`,
          409,
        );
      }
      const [after] = await tx
        .update(changeRequests)
        .set({ status: "in_progress" })
        .where(
          and(
            eq(changeRequests.organizationId, user.organization_id),
            eq(changeRequests.id, input.changeRequestId),
          ),
        )
        .returning();
      if (!after) throw new Error("change_request start sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "change_request",
        entityId: after.id,
        action: "change_request.authorize",
        before: { status: before.status },
        after: { status: after.status },
      });
      return toDto(after);
    });
  }

  async function completeImplementation(
    ctx: Context,
    input: { changeRequestId: string },
  ): Promise<ChangeRequestDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "operar_proyectos", {
      forceDb: true,
    });
    return withTx(async (tx) => {
      const before = await loadCR(user.organization_id, input.changeRequestId);
      const t1 = canTransitionChangeRequest(before.status, "implemented");
      if (!t1.ok) {
        throw new DomainError(
          t1.code,
          `No se puede completar un CR en estado ${before.status}`,
          409,
        );
      }
      const [mid] = await tx
        .update(changeRequests)
        .set({ status: "implemented" })
        .where(
          and(
            eq(changeRequests.organizationId, user.organization_id),
            eq(changeRequests.id, input.changeRequestId),
          ),
        )
        .returning();
      if (!mid) throw new Error("change_request complete sin fila");
      const t2 = canTransitionChangeRequest(mid.status, "validated");
      if (!t2.ok) {
        throw new DomainError(
          t2.code,
          `No se puede validar un CR en estado ${mid.status}`,
          409,
        );
      }
      const [after] = await tx
        .update(changeRequests)
        .set({ status: "validated" })
        .where(
          and(
            eq(changeRequests.organizationId, user.organization_id),
            eq(changeRequests.id, input.changeRequestId),
          ),
        )
        .returning();
      if (!after) throw new Error("change_request validate sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "change_request",
        entityId: after.id,
        action: "change_request.authorize",
        before: { status: before.status },
        after: { status: after.status },
      });
      return toDto(after);
    });
  }

  async function list(
    ctx: Context,
    input: { projectId: string; status?: ChangeRequestStatus },
  ): Promise<ChangeRequestDTO[]> {
    const user = requireUser(ctx);
    const where = [
      eq(changeRequests.organizationId, user.organization_id),
      eq(changeRequests.projectId, input.projectId),
    ];
    if (input.status) where.push(eq(changeRequests.status, input.status));
    const rows = await db
      .select()
      .from(changeRequests)
      .where(and(...where))
      .orderBy(desc(changeRequests.requestedAt), asc(changeRequests.folio));
    return rows.map(toDto);
  }

  return {
    create,
    quote,
    authorize,
    reject,
    startImplementation,
    completeImplementation,
    list,
  };
}
