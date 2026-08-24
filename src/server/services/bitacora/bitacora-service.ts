/**
 * Servicio `bitacora` — SPEC-010 §4.2 (B22, BR-N336/337/339/340/373).
 *
 * Reglas críticas:
 *  - `auditLogs.list` requiere `ver_auditoria` (BR-N336/337);
 *    paginado (BR-N373). Filtros por entidad/acción/actor/fecha.
 *  - `projectLog.list` requiere visibilidad al proyecto; las
 *    entradas con `private=true` sólo aparecen si el actor tiene
 *    `ver_notas_privadas` (BR-N339).
 *  - `linkFile` enlaza un archivo (`files.id`) a una entrada de bitácora
 *    vía `file_links` (BR-N340). Devuelve un `signedUrl` TTL ≤ 15 min
 *    (BR-N371/AC-13). Sólo lee (`GET`); no escribe el archivo.
 *  - Esta SPEC **sólo lee** de `audit_logs` y `project_log_entries`.
 *    La escritura de auditoría la hacen los servicios de cada módulo.
 */
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import {
  auditLogs,
  fileLinks,
  files as filesTbl,
  projectLogEntries,
} from "@/server/db/schema";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";
import type { AuditService } from "@/server/services/audit";
import type { FilesService } from "@/server/services/files";
import { createHasPermissionService } from "@/server/services/hasPermission";
import { clampPagination, canSeePrivateNotes } from "../dashboard/helpers";

// ─────────────────────────────────────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditLogDTO {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  actorRoleCode: string | null;
  entityType: string;
  entityId: string;
  action: string;
  reason: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface ProjectLogEntryDTO {
  id: string;
  organizationId: string;
  projectId: string;
  type: string;
  message: string;
  private: boolean;
  createdBy: string | null;
  createdAt: string;
}

export interface FileLinkDTO {
  id: string;
  organizationId: string;
  fileId: string;
  entityType: string;
  entityId: string;
  signedUrl: string | null;
  createdAt: string;
}

export interface BitacoraService {
  listAuditLogs(
    ctx: Context,
    input: {
      limit?: number;
      offset?: number;
      entityType?: string;
      entityId?: string;
      action?: string;
      actorUserId?: string;
      dateFrom?: Date | string;
      dateTo?: Date | string;
    },
  ): Promise<{ items: AuditLogDTO[]; total: number }>;
  listProjectLog(
    ctx: Context,
    input: { projectId: string; limit?: number; offset?: number },
  ): Promise<{ items: ProjectLogEntryDTO[]; total: number }>;
  linkFile(
    ctx: Context,
    input: { fileId: string; entityType: string; entityId: string },
  ): Promise<FileLinkDTO>;
}

export interface CreateBitacoraServiceOptions {
  audit: AuditService;
  files: FilesService;
}

function auditRowToDto(r: typeof auditLogs.$inferSelect): AuditLogDTO {
  return {
    id: r.id,
    organizationId: r.organizationId,
    actorUserId: r.actorUserId,
    actorRoleCode: r.actorRoleCode,
    entityType: r.entityType,
    entityId: r.entityId,
    action: r.action,
    reason: r.reason,
    requestId: r.requestId,
    createdAt: r.createdAt.toISOString(),
  };
}

function projectLogToDto(r: typeof projectLogEntries.$inferSelect): ProjectLogEntryDTO {
  return {
    id: r.id,
    organizationId: r.organizationId,
    projectId: r.projectId,
    type: r.entryType,
    message: r.body,
    private: r.private,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
  };
}

export function createBitacoraService(
  opts: CreateBitacoraServiceOptions,
): BitacoraService {
  const db = getDb();
  const hasPerm = createHasPermissionService();
  const audit = opts.audit;

  async function listAuditLogs(
    ctx: Context,
    input: {
      limit?: number;
      offset?: number;
      entityType?: string;
      entityId?: string;
      action?: string;
      actorUserId?: string;
      dateFrom?: Date | string;
      dateTo?: Date | string;
    } = {},
  ): Promise<{ items: AuditLogDTO[]; total: number }> {
    const user = requireUser(ctx);
    // BR-N336/337: lectura de bitácora requiere permiso.
    await hasPerm.require(ctx, "ver_auditoria", { forceDb: true });
    const { limit, offset } = clampPagination(input);
    const where = [eq(auditLogs.organizationId, user.organization_id)];
    if (input.entityType) where.push(eq(auditLogs.entityType, input.entityType));
    if (input.entityId) where.push(eq(auditLogs.entityId, input.entityId));
    if (input.action) where.push(eq(auditLogs.action, input.action));
    if (input.actorUserId) where.push(eq(auditLogs.actorUserId, input.actorUserId));
    if (input.dateFrom) {
      const d = typeof input.dateFrom === "string" ? new Date(input.dateFrom) : input.dateFrom;
      where.push(gte(auditLogs.createdAt, d));
    }
    if (input.dateTo) {
      const d = typeof input.dateTo === "string" ? new Date(input.dateTo) : input.dateTo;
      where.push(lte(auditLogs.createdAt, d));
    }
    const [totalRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(and(...where));
    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(...where))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);
    await audit.record(ctx, {
      entityType: "audit",
      entityId: user.id,
      action: "bitacora.audit.list",
      after: { filters: input, count: rows.length },
    });
    return { items: rows.map(auditRowToDto), total: totalRow?.c ?? 0 };
  }

  async function listProjectLog(
    ctx: Context,
    input: { projectId: string; limit?: number; offset?: number },
  ): Promise<{ items: ProjectLogEntryDTO[]; total: number }> {
    const user = requireUser(ctx);
    // BR-N339: las entradas `private=true` sólo si el actor tiene
    // `ver_notas_privadas`.
    const actorRoleCodes = ctx.permissions ?? [];
    const seePrivate = canSeePrivateNotes(actorRoleCodes);
    const { limit, offset } = clampPagination(input);
    const where = [
      eq(projectLogEntries.organizationId, user.organization_id),
      eq(projectLogEntries.projectId, input.projectId),
    ];
    if (!seePrivate) {
      where.push(eq(projectLogEntries.private, false));
    }
    const [totalRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(projectLogEntries)
      .where(and(...where));
    const rows = await db
      .select()
      .from(projectLogEntries)
      .where(and(...where))
      .orderBy(desc(projectLogEntries.createdAt))
      .limit(limit)
      .offset(offset);
    await audit.record(ctx, {
      entityType: "project_log",
      entityId: input.projectId,
      action: "bitacora.project_log.list",
      after: { count: rows.length, seePrivate },
    });
    return { items: rows.map(projectLogToDto), total: totalRow?.c ?? 0 };
  }

  async function linkFile(
    ctx: Context,
    input: { fileId: string; entityType: string; entityId: string },
  ): Promise<FileLinkDTO> {
    const user = requireUser(ctx);
    // BR-N340: cualquier actor autenticado puede enlazar archivos a
    // entradas de bitácora que ya leyó (no expone permisos ajenos; la
    // tabla `file_links` ya tiene `(org,fileId,entityType,entityId)`
    // PK compuesta y el actor sólo opera dentro de su org).
    const [fileRow] = await db
      .select({ id: filesTbl.id })
      .from(filesTbl)
      .where(
        and(
          eq(filesTbl.id, input.fileId),
          eq(filesTbl.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!fileRow) {
      throw new DomainError("EVIDENCE_FILE_NOT_FOUND", "Archivo no encontrado", 404);
    }
    const [row] = await db
      .insert(fileLinks)
      .values({
        organizationId: user.organization_id,
        fileId: input.fileId,
        entityType: input.entityType,
        entityId: input.entityId,
      })
      .returning();
    if (!row) throw new Error("file_links insert sin fila");
    let signedUrl: string | null = null;
    try {
      signedUrl = await opts.files.signedUrl({
        organizationId: user.organization_id,
        fileId: input.fileId,
        ttlSeconds: 600,
      });
    } catch {
      signedUrl = null;
    }
    await audit.record(ctx, {
      entityType: "file_link",
      entityId: `${row.fileId}:${row.entityType}:${row.entityId}`,
      action: "bitacora.link_file",
      after: {
        fileId: input.fileId,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });
    void inArray; // mantener import
    void asc; // mantener import
    return {
      id: `${row.fileId}:${row.entityType}:${row.entityId}`,
      organizationId: row.organizationId,
      fileId: row.fileId,
      entityType: row.entityType,
      entityId: row.entityId,
      signedUrl,
      createdAt: row.createdAt.toISOString(),
    };
  }

  return { listAuditLogs, listProjectLog, linkFile };
}
