/**
 * Servicio de configuración fiscal (BR-N201, AC-10, AC-81). Sólo Director.
 *
 * Campos sensibles (pac_api_key, csd_password) se cifran con AES-256-GCM
 * (AAD canónico ADR-03 §9.1). El audit registra sin valor de secretos.
 *
 * AC-81 / ADR-06 §3.1: `require('gestionar_config_fiscal')` se invoca
 * con `{ forceDb: true }` — acción crítica revalida contra BD (no cache
 * del JWT). Garantiza revocación efectiva inmediata tras cambio de rol.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { organizationFiscalConfig } from "@/server/db/schema";
import { createHasPermissionService } from "@/server/services/hasPermission";
import { createAuditService } from "@/server/services/audit";
import type { CryptoService } from "@/server/services/crypto";
import { buildAad } from "@/shared/zod";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";

export interface FiscalConfigUpdateInput {
  rfc?: string;
  razonSocial?: string;
  regimen?: string;
  pacApiKey?: string;
  csdPassword?: string;
}

export interface FiscalConfigDTO {
  id: string;
  organizationId: string;
  rfc: string | null;
  razonSocial: string | null;
  regimen: string | null;
  hasPacApiKey: boolean;
  hasCsdPassword: boolean;
  csdCerBucketKey: string | null;
  csdPemBucketKey: string | null;
  updatedBy: string | null;
  updatedAt: Date;
}

export interface FiscalConfigService {
  get(ctx: Context): Promise<FiscalConfigDTO>;
  upsert(ctx: Context, input: FiscalConfigUpdateInput): Promise<FiscalConfigDTO>;
}

function toDto(row: typeof organizationFiscalConfig.$inferSelect, fields: {
  hasPacApiKey: boolean;
  hasCsdPassword: boolean;
}): FiscalConfigDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    rfc: row.rfc,
    razonSocial: row.razonSocial,
    regimen: row.regimen,
    hasPacApiKey: fields.hasPacApiKey,
    hasCsdPassword: fields.hasCsdPassword,
    csdCerBucketKey: row.csdCerBucketKey,
    csdPemBucketKey: row.csdPemBucketKey,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
  };
}

export function createFiscalConfigService(deps: {
  crypto: CryptoService;
}): FiscalConfigService {
  const db = getDb();
  const hasPerm = createHasPermissionService();
  const audit = createAuditService();
  const crypto = deps.crypto;

  async function get(ctx: Context): Promise<FiscalConfigDTO> {
    const user = requireUser(ctx);
    const [row] = await db
      .select()
      .from(organizationFiscalConfig)
      .where(eq(organizationFiscalConfig.organizationId, user.organization_id))
      .limit(1);
    if (!row) {
      // DTO vacío.
      return {
        id: "",
        organizationId: user.organization_id,
        rfc: null,
        razonSocial: null,
        regimen: null,
        hasPacApiKey: false,
        hasCsdPassword: false,
        csdCerBucketKey: null,
        csdPemBucketKey: null,
        updatedBy: null,
        updatedAt: new Date(0),
      };
    }
    return toDto(row, {
      hasPacApiKey: row.pacApiKeyCiphertext !== null,
      hasCsdPassword: row.csdPasswordCiphertext !== null,
    });
  }

  async function upsert(
    ctx: Context,
    input: FiscalConfigUpdateInput,
  ): Promise<FiscalConfigDTO> {
    const user = requireUser(ctx);
    await hasPerm.require(ctx, "gestionar_config_fiscal", { forceDb: true });
    const [before] = await db
      .select()
      .from(organizationFiscalConfig)
      .where(eq(organizationFiscalConfig.organizationId, user.organization_id))
      .limit(1);
    const beforeDto = before
      ? toDto(before, {
          hasPacApiKey: before.pacApiKeyCiphertext !== null,
          hasCsdPassword: before.csdPasswordCiphertext !== null,
        })
      : null;
    const update: Partial<typeof organizationFiscalConfig.$inferInsert> = {
      organizationId: user.organization_id,
      updatedBy: user.id,
      updatedAt: new Date(),
    };
    if (input.rfc !== undefined) update.rfc = input.rfc;
    if (input.razonSocial !== undefined) update.razonSocial = input.razonSocial;
    if (input.regimen !== undefined) update.regimen = input.regimen;
    if (input.pacApiKey !== undefined) {
      const aad = buildAad(user.organization_id, "organization_fiscal_config", "pac_api_key");
      const { bytes } = crypto.encrypt(input.pacApiKey, { aad });
      update.pacApiKeyCiphertext = bytes;
    }
    if (input.csdPassword !== undefined) {
      const aad = buildAad(user.organization_id, "organization_fiscal_config", "csd_password");
      const { bytes } = crypto.encrypt(input.csdPassword, { aad });
      update.csdPasswordCiphertext = bytes;
    }

    let row: typeof organizationFiscalConfig.$inferSelect;
    if (before) {
      const [r] = await db
        .update(organizationFiscalConfig)
        .set(update)
        .where(
          and(
            eq(organizationFiscalConfig.id, before.id),
            eq(organizationFiscalConfig.organizationId, user.organization_id),
          ),
        )
        .returning();
      if (!r) throw new Error("fiscal_config update sin fila");
      row = r;
    } else {
      const [r] = await db
        .insert(organizationFiscalConfig)
        .values(update as typeof organizationFiscalConfig.$inferInsert)
        .returning();
      if (!r) throw new Error("fiscal_config insert sin fila");
      row = r;
    }

    // Audit: before/after sin secretos (sólo booleanos).
    const afterDto = toDto(row, {
      hasPacApiKey: row.pacApiKeyCiphertext !== null,
      hasCsdPassword: row.csdPasswordCiphertext !== null,
    });
    await audit.record(ctx, {
      entityType: "organization_fiscal_config",
      entityId: row.id,
      action: before ? "fiscal_config.update" : "fiscal_config.create",
      before: beforeDto
        ? {
            rfc: beforeDto.rfc,
            razonSocial: beforeDto.razonSocial,
            regimen: beforeDto.regimen,
            hasPacApiKey: beforeDto.hasPacApiKey,
            hasCsdPassword: beforeDto.hasCsdPassword,
          }
        : null,
      after: {
        rfc: afterDto.rfc,
        razonSocial: afterDto.razonSocial,
        regimen: afterDto.regimen,
        hasPacApiKey: afterDto.hasPacApiKey,
        hasCsdPassword: afterDto.hasCsdPassword,
      },
    });
    return afterDto;
  }

  return { get, upsert };
}

/** Helper de decifrado (no exportado al servicio público). */
export async function decryptFiscalField(
  crypto: CryptoService,
  organizationId: string,
  column: "pac_api_key" | "csd_password",
  ciphertext: Buffer,
): Promise<string> {
  const aad = buildAad(organizationId, "organization_fiscal_config", column);
  const { plaintext } = crypto.decrypt(ciphertext, { aad });
  return plaintext.toString("utf8");
}

export const __DomainError_keep__ = DomainError;
