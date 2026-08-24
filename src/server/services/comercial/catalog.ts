/**
 * Servicio `catalog` — SPEC-003 §4.2 (B5, BR-N226/227).
 *
 * Catálogo de servicios. `active=false` desactiva lógicamente sin
 * perder trazabilidad histórica (las cotizaciones ya emitidas siguen
 * mostrando el nombre vía snapshot). El sembrado se realiza en
 * `scripts/seed-catalog.ts` (P-003-1).
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { catalogServices } from "@/server/db/schema";
import {
  BILLING_CYCLES,
  SERVICE_TYPES,
  type BillingCycle,
  type ServiceType,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";

export interface CatalogServiceDTO {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  serviceType: ServiceType;
  billingCycle: BillingCycle;
  description: string | null;
  defaultUnitPriceCents: number | null;
  active: boolean;
  isSeed: boolean;
}

export interface CatalogServiceInput {
  code: string;
  name: string;
  serviceType: ServiceType;
  billingCycle: BillingCycle;
  description?: string;
  defaultUnitPriceCents?: number | null;
}

export interface CatalogService {
  create(ctx: Context, input: CatalogServiceInput): Promise<CatalogServiceDTO>;
  update(
    ctx: Context,
    input: {
      id: string;
      name?: string;
      billingCycle?: BillingCycle;
      description?: string;
      defaultUnitPriceCents?: number | null;
    },
  ): Promise<CatalogServiceDTO>;
  deactivate(ctx: Context, input: { id: string }): Promise<CatalogServiceDTO>;
  list(ctx: Context): Promise<CatalogServiceDTO[]>;
  getById(ctx: Context, id: string): Promise<CatalogServiceDTO>;
}

function toDto(row: typeof catalogServices.$inferSelect): CatalogServiceDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    code: row.code,
    name: row.name,
    serviceType: (SERVICE_TYPES as readonly string[]).includes(row.serviceType)
      ? (row.serviceType as ServiceType)
      : "servicio_unico",
    billingCycle: (BILLING_CYCLES as readonly string[]).includes(row.billingCycle)
      ? (row.billingCycle as BillingCycle)
      : "unico",
    description: row.description,
    defaultUnitPriceCents: row.defaultUnitPriceCents,
    active: row.active,
    isSeed: row.isSeed === "true",
  };
}

export function createCatalogService(): CatalogService {
  const db = getDb();

  async function create(
    ctx: Context,
    input: CatalogServiceInput,
  ): Promise<CatalogServiceDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_catalogos", {
      forceDb: true,
    });
    const [exists] = await db
      .select({ id: catalogServices.id })
      .from(catalogServices)
      .where(
        and(
          eq(catalogServices.organizationId, user.organization_id),
          eq(catalogServices.code, input.code),
        ),
      )
      .limit(1);
    if (exists) {
      throw new DomainError(
        "ForbiddenError",
        `Código de catálogo duplicado: ${input.code}`,
        409,
      );
    }
    const [row] = await db
      .insert(catalogServices)
      .values({
        organizationId: user.organization_id,
        code: input.code,
        name: input.name,
        serviceType: input.serviceType,
        billingCycle: input.billingCycle,
        description: input.description ?? null,
        defaultUnitPriceCents: input.defaultUnitPriceCents ?? null,
        active: true,
        isSeed: "false",
      })
      .returning();
    if (!row) throw new Error("catalog_service insert sin fila");
    const { createAuditService } = await import("@/server/services/audit");
    await createAuditService().record(ctx, {
      entityType: "catalog_service",
      entityId: row.id,
      action: "catalog_service.create",
      after: {
        code: row.code,
        name: row.name,
        serviceType: row.serviceType,
        billingCycle: row.billingCycle,
      },
    });
    return toDto(row);
  }

  async function update(
    ctx: Context,
    input: {
      id: string;
      name?: string;
      billingCycle?: BillingCycle;
      description?: string;
      defaultUnitPriceCents?: number | null;
    },
  ): Promise<CatalogServiceDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_catalogos", {
      forceDb: true,
    });
    const [before] = await db
      .select()
      .from(catalogServices)
      .where(
        and(
          eq(catalogServices.id, input.id),
          eq(catalogServices.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!before) {
      throw new DomainError(
        "CATALOG_SERVICE_NOT_FOUND",
        "Servicio de catálogo no encontrado",
        404,
      );
    }
    const set: Partial<typeof catalogServices.$inferInsert> = {};
    if (input.name !== undefined) set.name = input.name;
    if (input.billingCycle !== undefined) set.billingCycle = input.billingCycle;
    if (input.description !== undefined) set.description = input.description;
    if (input.defaultUnitPriceCents !== undefined) {
      set.defaultUnitPriceCents = input.defaultUnitPriceCents;
    }
    const [after] = await db
      .update(catalogServices)
      .set(set)
      .where(
        and(
          eq(catalogServices.id, input.id),
          eq(catalogServices.organizationId, user.organization_id),
        ),
      )
      .returning();
    if (!after) throw new Error("catalog_service update sin fila");
    const { createAuditService } = await import("@/server/services/audit");
    await createAuditService().record(ctx, {
      entityType: "catalog_service",
      entityId: after.id,
      action: "catalog_service.update",
      before: {
        name: before.name,
        billingCycle: before.billingCycle,
        defaultUnitPriceCents: before.defaultUnitPriceCents,
      },
      after: {
        name: after.name,
        billingCycle: after.billingCycle,
        defaultUnitPriceCents: after.defaultUnitPriceCents,
      },
    });
    return toDto(after);
  }

  async function deactivate(
    ctx: Context,
    input: { id: string },
  ): Promise<CatalogServiceDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_catalogos", {
      forceDb: true,
    });
    const [before] = await db
      .select()
      .from(catalogServices)
      .where(
        and(
          eq(catalogServices.id, input.id),
          eq(catalogServices.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!before) {
      throw new DomainError(
        "CATALOG_SERVICE_NOT_FOUND",
        "Servicio de catálogo no encontrado",
        404,
      );
    }
    const [after] = await db
      .update(catalogServices)
      .set({ active: false })
      .where(
        and(
          eq(catalogServices.id, input.id),
          eq(catalogServices.organizationId, user.organization_id),
        ),
      )
      .returning();
    if (!after) throw new Error("catalog_service deactivate sin fila");
    const { createAuditService } = await import("@/server/services/audit");
    await createAuditService().record(ctx, {
      entityType: "catalog_service",
      entityId: after.id,
      action: "catalog_service.deactivate",
      before: { active: before.active },
      after: { active: after.active },
    });
    return toDto(after);
  }

  async function list(ctx: Context): Promise<CatalogServiceDTO[]> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_catalogos", {
      forceDb: true,
    });
    const rows = await db
      .select()
      .from(catalogServices)
      .where(eq(catalogServices.organizationId, user.organization_id))
      .orderBy(catalogServices.code);
    return rows.map(toDto);
  }

  async function getById(ctx: Context, id: string): Promise<CatalogServiceDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_catalogos", {
      forceDb: true,
    });
    const [row] = await db
      .select()
      .from(catalogServices)
      .where(
        and(
          eq(catalogServices.id, id),
          eq(catalogServices.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!row) {
      throw new DomainError(
        "CATALOG_SERVICE_NOT_FOUND",
        "Servicio de catálogo no encontrado",
        404,
      );
    }
    return toDto(row);
  }

  return { create, update, deactivate, list, getById };
}
