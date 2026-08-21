/**
 * Servicio `audit` (BR-N336/337). Escribe en `audit_logs`.
 *
 * Restricciones:
 *  - Recibe `Context` por parámetro (SOL inv.5, AC-30).
 *  - Redacta automáticamente campos sensibles antes de persistir (AC-11).
 *  - No expone filas Drizzle crudas; devuelve DTO `AuditEntry`.
 *  - Soporta eventos de **sistema** (actor_user_id=null) — AC-73.
 *    El caller marca el evento como sistema vía `actor: "system"` para
 *    distinguirlo de un actor humano. Si `actor === "system"`, se
 *    omite la comprobación `!ctx.user?.id` y se persiste con
 *    `actor_user_id = null`, `actor_role_code = null`, `request_id`
 *    propagado del contexto si existe.
 */
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import { redact } from "@/lib/logger";
import { buildAad } from "@/shared/zod";
import type { Context } from "@/shared/zod";

export type AuditActor =
  | { kind: "user" }
  | { kind: "system" }
  | { kind: "user"; actorUserId: string; actorRoleCode?: string };

export interface AuditEntryInput {
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  /**
   * `system` para eventos sin actor humano (seed-catalog, rotación crypto,
   * jobs globales). Cuando es `system`, se persiste `actor_user_id = null`
   * y `actor_role_code = null`. AC-73.
   */
  actor?: AuditActor;
  /**
   * Caller-provided actor override (admin tools, audit replay). Sólo se
   * usa cuando `actor.kind === "user"` y se quiere forzar el actor.
   */
  actorUserId?: string;
  actorRoleCode?: string;
}

export interface AuditEntryDTO {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  actorRoleCode: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  requestId: string | null;
  createdAt: Date;
}

export interface AuditService {
  record(ctx: Context, input: AuditEntryInput): Promise<AuditEntryDTO>;
  list(
    ctx: Context,
    opts: {
      entityType?: string;
      entityId?: string;
      action?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ items: AuditEntryDTO[]; total: number }>;
}

function toDto(row: typeof auditLogs.$inferSelect): AuditEntryDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    actorUserId: row.actorUserId,
    actorRoleCode: row.actorRoleCode,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    before: row.before ?? null,
    after: row.after ?? null,
    reason: row.reason,
    requestId: row.requestId,
    createdAt: row.createdAt,
  };
}

export function createAuditService(): AuditService {
  const db = getDb();

  async function record(ctx: Context, input: AuditEntryInput): Promise<AuditEntryDTO> {
    const isSystemEvent = input.actor?.kind === "system";
    if (!isSystemEvent && !ctx.user?.id) {
      // Evento humano sin usuario autenticado → rechazar. (Antes lanzaba
      // ForbiddenError por `!ctx.user?.id` siempre; ahora permite system.)
      throw new Error("audit.record requiere actor user o actor: { kind: 'system' }");
    }
    // Redacta before/after (defensa: nunca secretos en BD vía audit).
    const safeBefore = input.before !== undefined ? redact(input.before) : null;
    const safeAfter = input.after !== undefined ? redact(input.after) : null;

    const actorUserId = isSystemEvent
      ? null
      : (input.actorUserId ?? ctx.user?.id ?? null);
    const actorRoleCode = isSystemEvent
      ? null
      : (input.actorRoleCode ?? ctx.actorRoleCode ?? null);
    // Evento de sistema sin organization_id del contexto → requiere
    // `organizationId` explícito en `before/after` o falla.
    const organizationId = isSystemEvent
      ? ((input.after as { organizationId?: string } | null)?.organizationId ??
        (input.before as { organizationId?: string } | null)?.organizationId ??
        ctx.user?.organization_id ??
        null)
      : ctx.user!.organization_id;
    if (!organizationId) {
      throw new Error(
        "audit.record (system) requiere organization_id en before/after o ctx.user",
      );
    }
    const [row] = await db
      .insert(auditLogs)
      .values({
        organizationId,
        actorUserId,
        actorRoleCode,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        before: safeBefore as Record<string, unknown> | null,
        after: safeAfter as Record<string, unknown> | null,
        reason: input.reason ?? null,
        requestId: ctx.requestId ?? null,
      })
      .returning();
    if (!row) throw new Error("audit insert sin fila retornada");
    return toDto(row);
  }

  async function list(
    ctx: Context,
    opts: {
      entityType?: string;
      entityId?: string;
      action?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ items: AuditEntryDTO[]; total: number }> {
    if (!ctx.user?.id) {
      return { items: [], total: 0 };
    }
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const where = [eq(auditLogs.organizationId, ctx.user.organization_id)];
    if (opts.entityType) where.push(eq(auditLogs.entityType, opts.entityType));
    if (opts.entityId) where.push(eq(auditLogs.entityId, opts.entityId));
    if (opts.action) where.push(eq(auditLogs.action, opts.action));

    const [totalRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(and(...where));
    const total = totalRow?.c ?? 0;

    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(...where))
      .orderBy(sql`${auditLogs.createdAt} DESC`)
      .limit(limit)
      .offset(offset);

    return { items: rows.map(toDto), total };
  }

  return { record, list };
}

/** Helper para tests: prueba que un actor registrado produjo un audit específico. */
export async function findAuditByEntity(
  ctx: Context,
  entityType: string,
  entityId: string,
): Promise<AuditEntryDTO | null> {
  if (!ctx.user?.id) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.organizationId, ctx.user.organization_id),
        eq(auditLogs.entityType, entityType),
        eq(auditLogs.entityId, entityId),
      ),
    )
    .orderBy(sql`${auditLogs.createdAt} DESC`)
    .limit(1);
  if (!row) return null;
  return toDto(row);
}

// Mantén imports referenciados para tree-shaking seguro.
export const __keep__ = { buildAad };
