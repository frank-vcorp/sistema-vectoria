/**
 * Schemas Zod canónicos (SPEC §8). El manifest es INMUTABLE para el runner
 * (§8.1): se valida contra schema y NO se modifican sus campos.
 *
 * Los schemas exportan tipos (`z.infer`) que se usan en todo el código.
 */
import { z } from "zod";

// ─── 8.1 Manifest ───────────────────────────────────────────────────────

export const ResourceSchema = z.enum([
  "project",
  "environment",
  "application",
  "database",
  "storage",
]);
export type Resource = z.infer<typeof ResourceSchema>;

export const AppVariantSchema = z.enum(["public", "private-github-app", "private-deploy-key"]);
export const BuildPackSchema = z.enum(["nixpacks", "dockerfile", "static"]);
export const StorageServiceTypeSchema = z.enum(["garage"]);
export const DatabaseEngineSchema = z.enum(["postgresql"]);
export const EnvNameSchema = z.enum(["production", "staging", "development"]);

export const ApplicationBlockSchema = z.object({
  appVariant: AppVariantSchema,
  buildPack: BuildPackSchema,
  portsExposes: z.string().regex(/^\d+(-\d+)?$/),
  githubAppUuid: z.string().nullable(),
  privateKeyUuid: z.string().nullable(),
});
export type ApplicationBlock = z.infer<typeof ApplicationBlockSchema>;

export const DatabaseBlockSchema = z.object({
  engine: DatabaseEngineSchema,
  name: z.string().min(1).max(63),
});
export type DatabaseBlock = z.infer<typeof DatabaseBlockSchema>;

export const StorageBlockSchema = z.object({
  serviceType: StorageServiceTypeSchema,
  name: z.string().min(1).max(63),
});
export type StorageBlock = z.infer<typeof StorageBlockSchema>;

export const ManifestSchema = z
  .object({
    v: z.literal(1),
    taskId: z.string().min(1),
    specRef: z.string().min(1),
    slug: z
      .string()
      .min(3)
      .max(63)
      .regex(/^[a-z0-9](?!.*--)[a-z0-9-]{1,61}[a-z0-9]$/, "slug inválido (SPEC §8.1)"),
    fqdn: z
      .string()
      .min(1)
      .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vector-ia\.mx$/, "fqdn inválido (SPEC §8.1)"),
    repository: z.string().min(1),
    branch: z.string().min(1),
    serverUuid: z.string().min(1),
    environment: EnvNameSchema,
    resources: z.array(ResourceSchema).min(1),
    application: ApplicationBlockSchema,
    database: DatabaseBlockSchema,
    storage: StorageBlockSchema,
    envOverrides: z.record(z.string(), z.string()).default({}),
  })
  .superRefine((m, ctx) => {
    // Coherencia slug-fqdn: <fqdn> == `${slug}.vector-ia.mx`
    if (m.fqdn !== `${m.slug}.vector-ia.mx`) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fqdn"],
        message: `fqdn (${m.fqdn}) no deriva del slug (${m.slug})`,
      });
    }
    // Repo privado requiere githubAppUuid+privateKeyUuid consistentes (§12)
    if (m.application.appVariant === "private-github-app") {
      const gh = m.application.githubAppUuid;
      const pk = m.application.privateKeyUuid;
      if ((gh === null) !== (pk === null)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["application"],
          message: "private-github-app exige githubAppUuid+privateKeyUuid ambos null o ambos presentes",
        });
      }
    }
  });
export type Manifest = z.infer<typeof ManifestSchema>;

// ─── 8.2 Registry ───────────────────────────────────────────────────────

export const RegistrySourceSchema = z.enum(["coolify-response", "adopted"]);
export type RegistrySource = z.infer<typeof RegistrySourceSchema>;

export const RegistryEntrySchema = z.object({
  ts: z.string().min(1),
  taskId: z.string().min(1),
  slug: z.string().min(1),
  fqdn: z.string().optional(),
  resource: ResourceSchema,
  uuid: z.string().min(1),
  serverUuid: z.string().min(1),
  parentUuid: z.string().nullable(),
  attrs: z.record(z.string(), z.string()).default({}),
  source: RegistrySourceSchema,
});
export type RegistryEntry = z.infer<typeof RegistryEntrySchema>;

// ─── 8.3 Plantilla env (enum cerrado) ───────────────────────────────────

export const EnvTemplateKeys = [
  "APP_ENV",
  "APP_URL",
  "DATABASE_URL",
  "VECTORIA_DIRECTOR_EMAIL",
  "VECTORIA_ORG_NAME",
] as const;
export type EnvTemplateKey = (typeof EnvTemplateKeys)[number];

export const EnvTemplateRowSchema = z.object({
  key: z.enum(EnvTemplateKeys),
  value: z.string(), // puede contener secretos derivados (post-derivación); nunca se imprimen en logs/audit
  sensitive: z.boolean(),
  mutable: z.boolean(),
});
export type EnvTemplateRow = z.infer<typeof EnvTemplateRowSchema>;

// ─── §14 Auditoría ──────────────────────────────────────────────────────

export const AuditEntrySchema = z.object({
  ts: z.string().min(1),
  taskId: z.string().min(1),
  slug: z.string().min(1),
  op: z.string().min(1),
  target: z.record(z.string(), z.unknown()).default({}),
  result: z.enum(["created", "adopted", "failure", "rejected"]),
  uuid: z.string().optional(),
  code: z.string().optional(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

// ─── §19 Runner Config (env) ────────────────────────────────────────────

function nonEmptyString(v: unknown): string {
  return typeof v === "string" && v.length > 0 ? v : "";
}

export const RunnerConfigSchema = z.object({
  COOLIFY_READ_TOKEN: z.string().default(""),
  COOLIFY_WRITE_TOKEN: z.string().default(""),
  SECRET_DERIVATION_ROOT: z.string().default(""),
  COOLIFY_BASE_URL: z.string().default("https://app.coolify.io"),
  COOLIFY_API_PREFIX: z.string().default("/api/v1"),
  COOLIFY_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  PROVISION_REGISTRY_PATH: z.string().default(
    `${process.env["HOME"] ?? "/root"}/.config/kilo/vectoria-provision/registry.jsonl`,
  ),
  PROVISION_AUDIT_PATH: z.string().default(
    `${process.env["HOME"] ?? "/root"}/.config/kilo/vectoria-provision/audit.jsonl`,
  ),
  PROVISION_PROFILE_PATH: z.string().default(
    `${process.env["HOME"] ?? "/root"}/.config/kilo/vectoria-provision/organization-profile.json`,
  ),
  PROVISION_WAIT_LOCK_MS: z.coerce.number().int().min(0).default(0),
});
export type RunnerConfig = z.infer<typeof RunnerConfigSchema>;

/**
 * Snapshot inmutable de la configuración del runner para pasarlo entre módulos
 * sin que se pueda mutar el `process.env` por accidente.
 */
export function snapshotConfig(env: NodeJS.ProcessEnv = process.env): RunnerConfig {
  const raw = {
    COOLIFY_READ_TOKEN: nonEmptyString(env["COOLIFY_READ_TOKEN"]),
    COOLIFY_WRITE_TOKEN: nonEmptyString(env["COOLIFY_WRITE_TOKEN"]),
    SECRET_DERIVATION_ROOT: nonEmptyString(env["SECRET_DERIVATION_ROOT"]),
    COOLIFY_BASE_URL: env["COOLIFY_BASE_URL"],
    COOLIFY_API_PREFIX: env["COOLIFY_API_PREFIX"],
    COOLIFY_TIMEOUT_MS: env["COOLIFY_TIMEOUT_MS"],
    PROVISION_REGISTRY_PATH: env["PROVISION_REGISTRY_PATH"],
    PROVISION_AUDIT_PATH: env["PROVISION_AUDIT_PATH"],
    PROVISION_PROFILE_PATH: env["PROVISION_PROFILE_PATH"],
    PROVISION_WAIT_LOCK_MS: env["PROVISION_WAIT_LOCK_MS"],
  };
  return RunnerConfigSchema.parse(raw);
}

/** Util: ruta a organization-profile.json (600). */
export function defaultProfilePath(): string {
  return `${process.env["HOME"] ?? "/root"}/.config/kilo/vectoria-provision/organization-profile.json`;
}

/** Util: ruta a registry.jsonl (600). */
export function defaultRegistryPath(): string {
  return `${process.env["HOME"] ?? "/root"}/.config/kilo/vectoria-provision/registry.jsonl`;
}

/** Util: ruta a audit.jsonl (600). */
export function defaultAuditPath(): string {
  return `${process.env["HOME"] ?? "/root"}/.config/kilo/vectoria-provision/audit.jsonl`;
}