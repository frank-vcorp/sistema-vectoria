/**
 * Servicio `templates` — SPEC-003 §4.2 (B5, BR-N228/229/230).
 *
 * 9 plantillas canónicas (4 web + 5 otros, BR-N228) sembradas por
 * `scripts/seed-catalog.ts`. El Director puede crear plantillas
 * aditivas; las `is_seed=true` no se eliminan en operación.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { templates } from "@/server/db/schema";
import {
  TEMPLATE_TYPES,
  type TemplateType,
} from "@/shared/enums";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";

export interface TemplateDTO {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  type: TemplateType;
  description: string | null;
  content: unknown;
  isSeed: boolean;
  active: boolean;
}

export interface TemplateService {
  list(ctx: Context): Promise<TemplateDTO[]>;
  getById(ctx: Context, id: string): Promise<TemplateDTO>;
}

function toDto(row: typeof templates.$inferSelect): TemplateDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    code: row.code,
    name: row.name,
    type: (TEMPLATE_TYPES as readonly string[]).includes(row.type)
      ? (row.type as TemplateType)
      : "consultoria",
    description: row.description,
    content: row.content,
    isSeed: row.isSeed,
    active: row.active,
  };
}

export function createTemplatesService(): TemplateService {
  const db = getDb();

  async function list(ctx: Context): Promise<TemplateDTO[]> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_plantillas", {
      forceDb: true,
    });
    const rows = await db
      .select()
      .from(templates)
      .where(eq(templates.organizationId, user.organization_id))
      .orderBy(templates.code);
    return rows.map(toDto);
  }

  async function getById(ctx: Context, id: string): Promise<TemplateDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_plantillas", {
      forceDb: true,
    });
    const [row] = await db
      .select()
      .from(templates)
      .where(
        and(
          eq(templates.id, id),
          eq(templates.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!row) {
      throw new DomainError("TEMPLATE_NOT_FOUND", "Plantilla no encontrada", 404);
    }
    return toDto(row);
  }

  return { list, getById };
}
