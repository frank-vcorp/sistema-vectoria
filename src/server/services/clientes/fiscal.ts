/**
 * Servicio `client_fiscal_data` — SPEC-002 §4.1 / AC-7 (BR-N218).
 *
 * Datos fiscales opcionales por cliente. RFC único por organización
 * cuando se provee. Una sola fila por cliente (`UNIQUE(client_id)`).
 * NO son secretos (no CSD); visibilidad por permiso `gestionar_clientes`.
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { clientFiscalData, clients } from "@/server/db/schema";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";

export interface ClientFiscalDataDTO {
  id: string;
  organizationId: string;
  clientId: string;
  rfc: string | null;
  razonSocial: string | null;
  regimen: string | null;
  cfdiUse: string | null;
  domicilio: Record<string, unknown> | null;
  updatedBy: string | null;
  updatedAt: Date;
  createdAt: Date;
}

export interface ClientFiscalDataService {
  upsert(
    ctx: Context,
    input: {
      clientId: string;
      rfc?: string;
      razonSocial?: string;
      regimen?: string;
      cfdiUse?: string;
      domicilio?: Record<string, unknown>;
    },
  ): Promise<ClientFiscalDataDTO>;
  getForClient(ctx: Context, input: { clientId: string }): Promise<ClientFiscalDataDTO | null>;
}

function toDto(row: typeof clientFiscalData.$inferSelect): ClientFiscalDataDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    clientId: row.clientId,
    rfc: row.rfc,
    razonSocial: row.razonSocial,
    regimen: row.regimen,
    cfdiUse: row.cfdiUse,
    domicilio: row.domicilio as Record<string, unknown> | null,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  };
}

export function createClientFiscalDataService(): ClientFiscalDataService {
  const db = getDb();

  async function upsert(
    ctx: Context,
    input: {
      clientId: string;
      rfc?: string;
      razonSocial?: string;
      regimen?: string;
      cfdiUse?: string;
      domicilio?: Record<string, unknown>;
    },
  ): Promise<ClientFiscalDataDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_clientes");

    // Verificar cliente padre.
    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(
        and(
          eq(clients.id, input.clientId),
          eq(clients.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!client) {
      throw new DomainError("CLIENT_NOT_FOUND", "Cliente no encontrado", 404);
    }

    // RFC duplicado por organización → 409 (defensa de servicio).
    if (input.rfc && input.rfc.length > 0) {
      const [rfcDup] = await db
        .select({ id: clientFiscalData.id, clientId: clientFiscalData.clientId })
        .from(clientFiscalData)
        .where(
          and(
            eq(clientFiscalData.organizationId, user.organization_id),
            eq(clientFiscalData.rfc, input.rfc),
          ),
        )
        .limit(1);
      if (rfcDup && rfcDup.clientId !== input.clientId) {
        throw new DomainError(
          "RFC_DUPLICATE",
          `RFC ya registrado para otro cliente: ${input.rfc}`,
          409,
        );
      }
    }

    // Carga fila existente.
    const [existing] = await db
      .select()
      .from(clientFiscalData)
      .where(
        and(
          eq(clientFiscalData.organizationId, user.organization_id),
          eq(clientFiscalData.clientId, input.clientId),
        ),
      )
      .limit(1);
    const beforeDto = existing ? toDto(existing) : null;
    const set: Partial<typeof clientFiscalData.$inferInsert> = {
      updatedBy: user.id,
    };
    if (input.rfc !== undefined) set.rfc = input.rfc ?? null;
    if (input.razonSocial !== undefined) set.razonSocial = input.razonSocial ?? null;
    if (input.regimen !== undefined) set.regimen = input.regimen ?? null;
    if (input.cfdiUse !== undefined) set.cfdiUse = input.cfdiUse ?? null;
    if (input.domicilio !== undefined) set.domicilio = input.domicilio ?? null;
    let row;
    if (existing) {
      const [u] = await db
        .update(clientFiscalData)
        .set(set)
        .where(eq(clientFiscalData.id, existing.id))
        .returning();
      row = u;
    } else {
      const [i] = await db
        .insert(clientFiscalData)
        .values({
          organizationId: user.organization_id,
          clientId: input.clientId,
          rfc: input.rfc ?? null,
          razonSocial: input.razonSocial ?? null,
          regimen: input.regimen ?? null,
          cfdiUse: input.cfdiUse ?? null,
          domicilio: input.domicilio ?? null,
          updatedBy: user.id,
        })
        .returning();
      row = i;
    }
    if (!row) throw new Error("client_fiscal_data upsert sin fila");
    const { createAuditService } = await import("@/server/services/audit");
    await createAuditService().record(ctx, {
      entityType: "client_fiscal_data",
      entityId: row.id,
      action: "client_fiscal.upsert",
      before: beforeDto
        ? {
            rfc: beforeDto.rfc,
            razonSocial: beforeDto.razonSocial,
            regimen: beforeDto.regimen,
          }
        : null,
      after: {
        rfc: row.rfc,
        razonSocial: row.razonSocial,
        regimen: row.regimen,
      },
    });
    return toDto(row);
  }

  async function getForClient(
    ctx: Context,
    input: { clientId: string },
  ): Promise<ClientFiscalDataDTO | null> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_clientes");
    const [row] = await db
      .select()
      .from(clientFiscalData)
      .where(
        and(
          eq(clientFiscalData.organizationId, user.organization_id),
          eq(clientFiscalData.clientId, input.clientId),
        ),
      )
      .limit(1);
    return row ? toDto(row) : null;
  }

  return { upsert, getForClient };
}

/** Helper puro: valida formato de RFC (moral o física). */
export function isValidRfc(rfc: string): boolean {
  return /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/u.test(rfc);
}

/** Helper puro (testeable): count de filas fiscales por cliente. */
export async function countFiscalForClient(
  orgId: string,
  clientId: string,
): Promise<number> {
  const db = getDb();
  const [r] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(clientFiscalData)
    .where(
      and(
        eq(clientFiscalData.organizationId, orgId),
        eq(clientFiscalData.clientId, clientId),
      ),
    );
  return r?.c ?? 0;
}