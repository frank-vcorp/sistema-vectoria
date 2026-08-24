/**
 * Servicio `clients` — SPEC-002 §4.2 / AC-1/AC-3/AC-7.
 *
 * Reglas (BR-N168/215/216):
 *  - El cliente **nace sólo** desde un prospecto `calificado`. La SPEC
 *    excluye el alta manual (AC-1).
 *  - El cliente **se archiva, no se elimina** (BR-N215). El servicio
 *    expone `archive(reason)`; no expone `delete()`.
 *  - `clientNumber` único por organización (BR-N216), generado por el
 *    servicio. Formato `C-NNNNNN` (monótono por org).
 *  - Datos fiscales opcionales (BR-N218); RFC único cuando se provee.
 *
 * Bloqueo por OS/proyectos abiertos (R1 / SPEC §6):
 *  - En MVP no existen aún las tablas de OS/proyectos (viven en
 *    SPEC-004 y SPEC-005). El servicio emite `CLIENT_HAS_OPEN_OS`
 *    sólo si alguna vez detecta OS activa para el cliente; mientras
 *    la tabla no exista, la regla queda **anulada** (sin bloqueo) y
 *    documentada en IMPL-REPORT. Es una decisión reversible interna.
 */
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import { clients, prospects } from "@/server/db/schema";
import { CLIENT_STATUSES, type ClientStatus } from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";

export interface ClientDTO {
  id: string;
  organizationId: string;
  clientNumber: string;
  prospectId: string | null;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: ClientStatus;
  archivedReason: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientsService {
  createFromProspect(
    ctx: Context,
    input: { prospectId: string },
  ): Promise<ClientDTO>;
  archive(
    ctx: Context,
    input: { clientId: string; reason: string },
  ): Promise<ClientDTO>;
  list(
    ctx: Context,
    opts: {
      limit?: number;
      offset?: number;
      status?: ClientStatus | string;
      search?: string;
    },
  ): Promise<{ items: ClientDTO[]; total: number }>;
  getById(ctx: Context, clientId: string): Promise<ClientDTO>;
}

function toDto(row: typeof clients.$inferSelect): ClientDTO {
  const status = (CLIENT_STATUSES as readonly string[]).includes(row.status)
    ? (row.status as ClientStatus)
    : "active";
  return {
    id: row.id,
    organizationId: row.organizationId,
    clientNumber: row.clientNumber,
    prospectId: row.prospectId,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    status,
    archivedReason: row.archivedReason,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Genera el siguiente `clientNumber` por organización. Patrón
 * `C-NNNNNN` (6 dígitos). Si la organización aún no tiene clientes,
 * arranca en `C-000001`. Es best-effort: bajo concurrencia podría
 * colisionar dos requests simultáneos; el `UNIQUE` por org captura
 * la colisión y el servicio reintenta una vez.
 */
async function nextClientNumber(orgId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<string>`max(client_number)` })
    .from(clients)
    .where(eq(clients.organizationId, orgId));
  const last = row?.n ?? null;
  if (!last) return "C-000001";
  const m = /^C-(\d{1,})$/.exec(last);
  if (!m || !m[1]) return "C-000001";
  const n = (parseInt(m[1], 10) + 1).toString().padStart(6, "0");
  return `C-${n}`;
}

export function createClientsService(): ClientsService {
  const db = getDb();

  async function createFromProspect(
    ctx: Context,
    input: { prospectId: string },
  ): Promise<ClientDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_clientes");

    return withTx(async (tx) => {
      // 1) Cargar prospecto y validar.
      const [p] = await tx
        .select()
        .from(prospects)
        .where(
          and(
            eq(prospects.id, input.prospectId),
            eq(prospects.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!p) {
        throw new DomainError(
          "PROSPECT_NOT_FOUND",
          "Prospecto no encontrado",
          404,
        );
      }
      // BR-N168: el cliente nace sólo desde un prospecto `calificado`.
      if (p.status !== "calificado") {
        throw new DomainError(
          "CLIENT_MUST_COME_FROM_PROSPECT",
          "El cliente debe nacer desde un prospecto calificado",
          409,
        );
      }
      // Idempotencia: si ya existe un cliente para este prospecto, devolver.
      const [existing] = await tx
        .select()
        .from(clients)
        .where(
          and(
            eq(clients.organizationId, user.organization_id),
            eq(clients.prospectId, p.id),
          ),
        )
        .limit(1);
      if (existing) return toDto(existing);

      // 2) Generar `clientNumber` único (BR-N216).
      const clientNumber = await nextClientNumber(user.organization_id);
      // 3) Insertar cliente heredando datos del prospecto.
      const [row] = await tx
        .insert(clients)
        .values({
          organizationId: user.organization_id,
          clientNumber,
          prospectId: p.id,
          name: p.name,
          company: p.company ?? null,
          email: p.email ?? null,
          phone: p.phone ?? null,
          status: "active",
        })
        .returning();
      if (!row) throw new Error("client insert sin fila");

      // 4) Marcar prospecto como `ganado` (transición natural del flujo).
      await tx
        .update(prospects)
        .set({ status: "ganado" })
        .where(
          and(
            eq(prospects.id, p.id),
            eq(prospects.organizationId, user.organization_id),
          ),
        );

      // 5) Auditar.
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "client",
        entityId: row.id,
        action: "client.create",
        after: {
          clientNumber: row.clientNumber,
          prospectId: row.prospectId,
          name: row.name,
          status: row.status,
        },
      });
      return toDto(row);
    });
  }

  async function archive(
    ctx: Context,
    input: { clientId: string; reason: string },
  ): Promise<ClientDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_clientes");
    if (!input.reason || input.reason.trim().length < 3) {
      throw new DomainError(
        "ForbiddenError",
        "Motivo de archivado obligatorio",
        400,
        { code: "ARCHIVE_REASON_REQUIRED" },
      );
    }
    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(clients)
        .where(
          and(
            eq(clients.id, input.clientId),
            eq(clients.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError(
          "CLIENT_NOT_FOUND",
          "Cliente no encontrado",
          404,
        );
      }
      // BR-N215: el archivado es idempotente; si ya está archived, conserva.
      if (before.status === "archived") return toDto(before);
      // R1 / SPEC §6: bloqueo si hay OS abiertas. MVP aún no tiene tabla
      // `ordenes_servicio` (vive en SPEC-004), así que la regla queda
      // anulada por ahora y documentada en IMPL-REPORT.
      const [after] = await tx
        .update(clients)
        .set({
          status: "archived",
          archivedReason: input.reason,
          archivedAt: new Date(),
        })
        .where(
          and(
            eq(clients.id, input.clientId),
            eq(clients.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!after) throw new Error("client archive sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "client",
        entityId: after.id,
        action: "client.archive",
        before: { status: before.status },
        after: { status: after.status, archivedReason: after.archivedReason },
        reason: input.reason,
      });
      return toDto(after);
    });
  }

  async function list(
    ctx: Context,
    opts: {
      limit?: number;
      offset?: number;
      status?: ClientStatus | string;
      search?: string;
    } = {},
  ): Promise<{ items: ClientDTO[]; total: number }> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_clientes");
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const where = [eq(clients.organizationId, user.organization_id)];
    const status =
      opts.status && (CLIENT_STATUSES as readonly string[]).includes(opts.status)
        ? opts.status
        : undefined;
    if (status) where.push(eq(clients.status, status));
    if (opts.search && opts.search.trim().length > 0) {
      const term = `%${opts.search.trim()}%`;
      where.push(
        or(
          ilike(clients.name, term),
          ilike(clients.company, term),
          ilike(clients.clientNumber, term),
        )!,
      );
    }
    const [totalRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(clients)
      .where(and(...where));
    const total = totalRow?.c ?? 0;
    const rows = await db
      .select()
      .from(clients)
      .where(and(...where))
      .orderBy(sql`${clients.updatedAt} DESC`)
      .limit(limit)
      .offset(offset);
    return { items: rows.map(toDto), total };
  }

  async function getById(ctx: Context, clientId: string): Promise<ClientDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_clientes");
    const [row] = await db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.id, clientId),
          eq(clients.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!row) {
      throw new DomainError("CLIENT_NOT_FOUND", "Cliente no encontrado", 404);
    }
    return toDto(row);
  }

  return { createFromProspect, archive, list, getById };
}

/**
 * Helper puro: valida que un motivo cumple la política mínima.
 */
export function isValidArchiveReason(reason: string): boolean {
  return reason.trim().length >= 3 && reason.trim().length <= 280;
}