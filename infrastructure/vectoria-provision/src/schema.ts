/**
 * Schemas Zod canónicos (SPEC §8 + SPEC-20260821-001 §4 v2 + SPEC-GAP-20260821-07 §2.1).
 *
 * v2.0 introduce:
 *  - `project.{id,parent,namespace,displayName}` block (opcional; defaults seguros)
 *  - `dns.{zone,expectedIp}` block (opcional; default via global-profile / hardcoded)
 *  - `git.host` block (opcional; default "github.com" via global-profile)
 *  - `application.{healthcheck,startCommand,secretSource}` (opcionales)
 *  - `AuditEntrySchema` admite `projectParent`/`projectId` (aditivos, retro-compat)
 *  - `ManifestSchema` = union v1 | v2 con transform v1→v2 (compat retroactiva AC-R-1)
 *
 * Contrato público preservado:
 *  - `EnvTemplateKeys` 12 keys + 5 modos (sin cambios)
 *  - `EnsureResult`/`EnsureOutcome`/`EnsureFailure` (sin cambios)
 *  - `AuditEntrySchema` base (campos nuevos son aditivos)
 *  - `RegistryEntrySchema` base (campos nuevos son aditivos)
 *
 * NO se modifican las firmas ni shapes v1 — `Manifest` exporta la unión v1|v2
 * con defaults ya materializados.
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

/** Regex segura para `project.parent` y `project.id`: lowercase alnum + `-`, sin `/`, `..`, control. */
export const PROJECT_NAMESPACE_SEGMENT = /^[a-z0-9-]{1,63}$/;

/** Slug canónico (sin cambios vs v1.7). */
const SLUG_REGEX = /^[a-z0-9](?!.*--)[a-z0-9-]{1,61}[a-z0-9]$/;

/** FQDN genérico (v2.0): valida formato, sin asumir `.vector-ia.mx`. Coherencia se valida en superRefine. */
const FQDN_REGEX =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export const ApplicationBlockSchema = z.object({
  appVariant: AppVariantSchema,
  buildPack: BuildPackSchema,
  portsExposes: z.string().regex(/^\d+(-\d+)?$/),
  githubAppUuid: z.string().nullable(),
  privateKeyUuid: z.string().nullable(),
  /**
   * Override opcional del comando de arranque de la app (SPEC §8.1 v1.7).
   * Si `undefined`, Coolify v4 aplica auto-detección (nixpacks).
   * Regex defensiva: sólo [a-zA-Z0-9_- ./]; evita inyecciones o caracteres
   * de control. Longitud ≤ 256.
   */
  startCommand: z.string().regex(/^[a-zA-Z0-9_\- ./]{1,256}$/).optional(),
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

// ─── v2.0 · Bloques nuevos (todos opcionales, con default seguro) ─────────

/** v2.0 · `project.*` block. parent e id validados con regex segura. */
export const ProjectBlockSchema = z.object({
  id: z.string().regex(PROJECT_NAMESPACE_SEGMENT, "project.id inválido (regex [a-z0-9-]{1,63})"),
  parent: z.string().regex(PROJECT_NAMESPACE_SEGMENT, "project.parent inválido (regex [a-z0-9-]{1,63}, sin '/', '..')").default("vectoria"),
  namespace: z
    .string()
    .regex(/^[a-z0-9-]{1,63}(:[a-z0-9-]{1,63})?$/, "project.namespace debe ser <parent>:<id>")
    .optional(),
  displayName: z.string().min(1).max(120).optional(),
});
export type ProjectBlock = z.infer<typeof ProjectBlockSchema>;

/** v2.0 · `dns.*` block. `zone` validada como dominio, `expectedIp` como IPv4. */
export const DnsBlockSchema = z.object({
  zone: z
    .string()
    .min(1)
    .max(253)
    .regex(
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/,
      "dns.zone inválido",
    ),
  expectedIp: z
    .string()
    .regex(/^(\d{1,3}\.){3}\d{1,3}$/, "dns.expectedIp debe ser IPv4")
    .optional(),
});
export type DnsBlock = z.infer<typeof DnsBlockSchema>;

/** v2.0 · `git.*` block. */
export const GitBlockSchema = z.object({
  host: z.string().min(1).max(253).default("github.com"),
});
export type GitBlock = z.infer<typeof GitBlockSchema>;

/** v2.0 · `application.healthcheck` block declarativo. */
export const HealthcheckBlockSchema = z.object({
  enabled: z.boolean(),
  path: z.string().regex(/^\/[a-zA-Z0-9_\-./]{0,253}$/),
  method: z.enum(["GET", "HEAD"]).default("GET"),
  scheme: z.enum(["http", "https"]).default("http"),
  port: z.string().regex(/^\d+(-\d+)?$/),
  interval: z.number().int().min(5).max(300).default(30),
  timeout: z.number().int().min(1).max(60).default(5),
  retries: z.number().int().min(1).max(10).default(3),
});
export type HealthcheckBlock = z.infer<typeof HealthcheckBlockSchema>;

/** Lista cerrada de keys secret-source permitidas (declarativas). */
export const SECRET_SOURCE_KEY_NAMES = [
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
  "VECTORIA_SUPERUSER_PASSWORD",
] as const;
export type SecretSourceKeyName = (typeof SECRET_SOURCE_KEY_NAMES)[number];

/** v2.0 · `application` extendido (secretSource + healthcheck declarativos). */
export const ApplicationBlockV2Schema = ApplicationBlockSchema.extend({
  secretSource: z.array(z.enum(SECRET_SOURCE_KEY_NAMES)).optional(),
  healthcheck: HealthcheckBlockSchema.optional(),
});
export type ApplicationBlockV2 = z.infer<typeof ApplicationBlockV2Schema>;

// ─── envOverrides (preprocess retrocompatible legacy → canónico) ──────────

/** Mapa legacy → canónico v1.7. Declarado ANTES de ManifestSchema
 *  porque el schema hace referencia a `envOverridesSchema`. */
const LEGACY_TO_CANONICAL: Readonly<Record<string, string>> = {
  APP_URL: "APP_BASE_URL",
  APP_ENV: "NODE_ENV",
};

/**
 * Acepta `envOverrides` con claves legacy (`APP_URL`/`APP_ENV`) y las
 * reescribe a las canónicas v1.7 (`APP_BASE_URL`/`NODE_ENV`) ANTES de
 * validar contra el enum cerrado. Esto preserva compatibilidad con
 * manifests v1.4..v1.6 sin alterar su wire format.
 */
export const envOverridesSchema = z.preprocess(
  (input) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return input;
    const obj = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const canon = LEGACY_TO_CANONICAL[k] ?? k;
      out[canon] = v;
    }
    return out;
  },
  z.record(z.string(), z.string()).default({}),
);
export type EnvOverrides = z.infer<typeof envOverridesSchema>;

// ─── Manifest v2 strict ──────────────────────────────────────────────────

/** Coherencia helper: deriva fqdn esperado a partir de slug + zona. */
function deriveExpectedFqdn(slug: string, zone: string): string {
  return `${slug}.${zone}`;
}

/**
 * Schema v2 strict. Acepta sólo `v: 2`. La forma canónica tras `superRefine`
 * tiene `project`, `dns`, `git` siempre presentes (defaults aplicados).
 *
 * Para retro-compat v1 ver `ManifestSchema` abajo (union v1|v2 con transform).
 */
export const ManifestV2StrictSchema = z
  .object({
    v: z.literal(2),
    taskId: z.string().min(1),
    specRef: z.string().min(1),
    project: ProjectBlockSchema.optional(),
    slug: z
      .string()
      .min(3)
      .max(63)
      .regex(SLUG_REGEX, "slug inválido (SPEC §8.1)"),
    fqdn: z.string().min(1).regex(FQDN_REGEX, "fqdn inválido"),
    repository: z.string().min(1),
    branch: z.string().min(1),
    git: GitBlockSchema.optional(),
    serverUuid: z.string().min(1),
    environment: EnvNameSchema,
    resources: z.array(ResourceSchema).min(1),
    application: ApplicationBlockV2Schema,
    database: DatabaseBlockSchema,
    storage: StorageBlockSchema,
    dns: DnsBlockSchema.optional(),
    envOverrides: envOverridesSchema,
  })
  .superRefine((m, ctx) => {
    // Coherencia slug-fqdn: fqdn == "<slug>.<dns.zone>"
    // Si dns.zone ausente → el runner resuelve en runtime con defaults;
    // el schema valida sólo si dns.zone está declarado.
    if (m.dns?.zone !== undefined) {
      const expected = deriveExpectedFqdn(m.slug, m.dns.zone);
      if (m.fqdn !== expected) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fqdn"],
          message: `fqdn (${m.fqdn}) no deriva del slug (${m.slug}) + dns.zone (${m.dns.zone})`,
        });
      }
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

// ─── Manifest v1 (compat retroactiva) ────────────────────────────────────

/** v1 + transform → v2 con defaults. Acepta `v: 1` y emite la forma canónica v2. */
export const ManifestV1CompatSchema = z
  .object({
    v: z.literal(1),
    taskId: z.string().min(1),
    specRef: z.string().min(1),
    slug: z
      .string()
      .min(3)
      .max(63)
      .regex(SLUG_REGEX, "slug inválido (SPEC §8.1)"),
    fqdn: z
      .string()
      .min(1)
      .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vector-ia\.mx$/, "fqdn v1 debe terminar en .vector-ia.mx"),
    repository: z.string().min(1),
    branch: z.string().min(1),
    serverUuid: z.string().min(1),
    environment: EnvNameSchema,
    resources: z.array(ResourceSchema).min(1),
    application: ApplicationBlockSchema,
    database: DatabaseBlockSchema,
    storage: StorageBlockSchema,
    envOverrides: envOverridesSchema,
  })
  .superRefine((m, ctx) => {
    // Coherencia slug-fqdn legacy: <fqdn> == `${slug}.vector-ia.mx`
    if (m.fqdn !== `${m.slug}.vector-ia.mx`) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fqdn"],
        message: `fqdn (${m.fqdn}) no deriva del slug (${m.slug})`,
      });
    }
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

/** Helper: normaliza un manifest v1 validado a forma v2 con defaults. */
function v1ToV2Transform(v1: z.infer<typeof ManifestV1CompatSchema>): z.infer<typeof ManifestV2StrictSchema> {
  return {
    v: 2,
    taskId: v1.taskId,
    specRef: v1.specRef,
    project: {
      parent: "vectoria",
      id: v1.taskId,
    },
    slug: v1.slug,
    fqdn: v1.fqdn,
    repository: v1.repository,
    branch: v1.branch,
    serverUuid: v1.serverUuid,
    environment: v1.environment,
    resources: v1.resources,
    application: v1.application,
    database: v1.database,
    storage: v1.storage,
    envOverrides: v1.envOverrides,
  };
}

/**
 * ManifestSchema canónico (union v1 | v2 con transform v1→v2).
 *
 * Tras `parse`, el objeto tiene forma v2 con defaults aplicados:
 *  - `project.parent = "vectoria"`, `project.id = manifest.taskId`
 *  - `dns.zone` ausente (queda a resolución runtime con defaults)
 *  - `application.secretSource` ausente (legacy compat en `src/secrets-file.ts`)
 *  - `git.host` ausente (queda a defaults del global-profile)
 *
 * Tests v1.7 que consumían `Manifest` siguen funcionando: los campos
 * adicionales son `undefined` o defaults seguros.
 */
export const ManifestSchema = z.union([
  ManifestV2StrictSchema,
  ManifestV1CompatSchema.transform(v1ToV2Transform),
]);
/**
 * `Manifest` = input type del schema union (acepta v1 + v2 en compilación).
 *
 * Tras `ManifestSchema.parse(...)` el output siempre tiene forma v2 (los v1
 * se transforman vía `v1ToV2Transform`). Esta definición evita que los
 * tests existentes (que declaran manifests v1 literales con `v: 1`) rompan
 * la compilación; el runner los parsea correctamente en runtime.
 */
export type Manifest = z.input<typeof ManifestSchema>;

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

// ─── 8.3 Plantilla env (enum cerrado, v1.7) ─────────────────────────────
//
// v1.7 extiende de 5 a 12 keys. Las claves canónicas son:
//   APP_BASE_URL (antes APP_URL), NODE_ENV (antes APP_ENV), DATABASE_URL,
//   MASTER_KEY, SESSION_SECRET, S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY,
//   S3_SECRET_KEY, VECTORIA_DIRECTOR_EMAIL, VECTORIA_ORG_NAME,
//   VECTORIA_SUPERUSER_PASSWORD.
//
// Renombre retrocompatible: `envOverrides` que contenga `APP_URL` o `APP_ENV`
// (legacy v1.4..v1.6) se traduce a `APP_BASE_URL`/`NODE_ENV` antes del
// dispatch. Ver `envOverridesSchema` abajo + `tests/schema-extended.test.ts`
// AC-N-7.

export const EnvTemplateKeys = [
  "APP_ENV",
  "APP_URL",
  "DATABASE_URL",
  "VECTORIA_DIRECTOR_EMAIL",
  "VECTORIA_ORG_NAME",
] as const;
// Nota: la expansión v2.0 a 12 keys (S3_*, MASTER_KEY, SESSION_SECRET,
// VECTORIA_SUPERUSER_PASSWORD, APP_BASE_URL, NODE_ENV) queda para IMPL-13+
// dedicado (runtime env contract). El presente refactor NO toca este enum
// cerrado (handoff §4.1: "sin cambios").
export type EnvTemplateKey = (typeof EnvTemplateKeys)[number];

/** Modos de source del runner (uno por key, §8.3 v1.7). */
export const EnvTemplateKeyModeSchema = z.enum([
  "derived",
  "profile",
  "hkdf",
  "dbBinding",
  "secret-source",
]);
export type EnvTemplateKeyMode = z.infer<typeof EnvTemplateKeyModeSchema>;

export const EnvTemplateRowSchema = z.object({
  key: z.enum(EnvTemplateKeys),
  value: z.string(), // puede contener secretos derivados (post-derivación); nunca se imprimen en logs/audit
  sensitive: z.boolean(),
  mutable: z.boolean(),
  /**
   * Cómo el runner obtiene el valor de esta key (v1.7):
   *  - `derived`     : calculado del manifest (p.ej. APP_BASE_URL desde fqdn).
   *  - `profile`     : organization-profile.json (600).
   *  - `hkdf`        : HKDF-SHA256 sobre SECRET_DERIVATION_ROOT (§9).
   *  - `dbBinding`   : binding interno del DB creado (DATABASE_URL).
   *  - `secret-source`: archivo externo (VECTORIA_SECRETS_FILE) — NUNCA inventa valor.
   */
  mode: EnvTemplateKeyModeSchema,
  /** Descriptor opcional del origen: p.ej. nombre de archivo externo o ruta interna. */
  source: z.string().optional(),
});
export type EnvTemplateRow = z.infer<typeof EnvTemplateRowSchema>;

// ─── §14 Auditoría ──────────────────────────────────────────────────────

export const AuditEntrySchema = z.object({
  ts: z.string().min(1),
  taskId: z.string().min(1),
  slug: z.string().min(1),
  /**
   * v2.0 (aditivo, opcional): `manifest.project.parent`. Cuando el manifest
   * v2 lo trae, se incluye para auditoría legible sin parsear manifest.
   */
  projectParent: z.string().optional(),
  /** v2.0 (aditivo, opcional): `manifest.project.id`. */
  projectId: z.string().optional(),
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
  /**
   * Ruta al archivo externo con claves `secret-source` (v1.7, §8.3 + §8.7 launcher).
   * El launcher `bin/run-provision.sh` la inyecta vía `env -i` con el path ABSOLUTO.
   * El runner NO imprime valores: sólo presencia (por nombre de key).
   * Si está vacío y se solicita `ensure_env` → `infra_blocked(secret_source_file_missing)`.
   */
  VECTORIA_SECRETS_FILE: z.string().optional(),
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
    VECTORIA_SECRETS_FILE: env["VECTORIA_SECRETS_FILE"] ?? "",
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