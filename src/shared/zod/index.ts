/**
 * Esquemas Zod compartidos entre servicios y tRPC (AC-29). La UI también los
 * consume vía `react-hook-form` + `zodResolver`. Estos esquemas son la
 * única fuente de validación de entrada/salida.
 */
import { z } from "zod";
import {
  BASE_PERMISSIONS,
  JOB_STATUSES,
  NOTIFICATION_EVENT_TYPES,
  PROJECT_LOG_ENTRY_TYPES,
} from "@/shared/enums";

export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().email().toLowerCase();

/**
 * Password policy (ADR-03 §3.3, AC-20): mínimo 12 caracteres, mix de clases
 * (minúsculas, mayúsculas, dígito, símbolo). Validación previa al hash.
 */
export const passwordSchema = z
  .string()
  .min(12, "La contraseña debe tener al menos 12 caracteres")
  .max(256, "La contraseña no puede exceder 256 caracteres")
  .refine((s) => /[a-z]/.test(s), "Debe incluir al menos una minúscula")
  .refine((s) => /[A-Z]/.test(s), "Debe incluir al menos una mayúscula")
  .refine((s) => /\d/.test(s), "Debe incluir al menos un dígito")
  .refine((s) => /[^A-Za-z0-9]/.test(s), "Debe incluir al menos un símbolo");

/**
 * `Context` abstracto (SOL inv.5, AC-30, AC-71).
 * Es el único canal por el que la identidad llega a los servicios.
 * NO incluye `cookies`/`headers`/transporte.
 *
 * `user` es **nullable** cuando no hay sesión (AC-71: no se fabrica
 * identidad UUID cero; `protectedProcedure` lanza `UNAUTHORIZED` real).
 */
export const ContextSchema = z.object({
  user: z
    .object({
      id: uuidSchema,
      organization_id: uuidSchema,
    })
    .nullable(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  requestId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  actorRoleCode: z.string().optional(),
});
export type Context = z.infer<typeof ContextSchema>;

export const PermissionCodeSchema = z.enum(BASE_PERMISSIONS);
export const NotificationEventTypeSchema = z.enum(NOTIFICATION_EVENT_TYPES);
export const ProjectLogEntryTypeSchema = z.enum(PROJECT_LOG_ENTRY_TYPES);
export const JobStatusSchema = z.enum(JOB_STATUSES);

/**
 * DTOs de paginación (AC-17).
 */
export const PaginationInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
});
export type PaginationInput = z.infer<typeof PaginationInputSchema>;

export const PaginatedOutputSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    limit: z.number().int(),
    offset: z.number().int(),
  });

/**
 * DTOs de auditoría (BR-N336).
 */
export const AuditInputSchema = z.object({
  entityType: z.string().min(1),
  entityId: uuidSchema,
  action: z.string().min(1),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  reason: z.string().optional(),
});
export type AuditInput = z.infer<typeof AuditInputSchema>;

/**
 * AAD canónico determinista (ADR-03 §9.1):
 *   `"{organization_id}|{schema}.{table}|{column}"`
 */
export function buildAad(orgId: string, table: string, column: string): string {
  return `${orgId}|public.${table}|${column}`;
}

/**
 * Helpers de timezone (AC-24) y moneda (AC-25).
 */
export const CURRENCY_SCHEMA = z.string().length(3).default("MXN");
