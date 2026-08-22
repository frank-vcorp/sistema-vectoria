/**
 * Global Profile — vectoria-provision v2.0
 *
 * Implementa SPEC-20260821-001 §3.1 + §5 + SPEC-GAP-20260821-07 §2.2:
 *  - Carga opcional desde `~/.config/kilo/vectoria-provision/global-profile.json`
 *    (override por env `VECTORIA_PROVISION_GLOBAL_PROFILE`).
 *  - Si el archivo no existe / es inválido → WARN stderr + fallback a defaults
 *    hardcoded (capa 0). El runner NO aborta.
 *  - Schema validado con Zod (`GlobalProfileSchema`).
 *  - NO contiene secretos de proyecto (AC-R-18): sólo paths, defaults operativos
 *    y organizations con defaults públicos.
 *  - Expone `resolveProjectNamespace(parent, id)` para namespacing consistente
 *    en registry/audit/locks/HKDF.
 *
 * Precedencia (de mayor a menor):
 *   manifest v2 (capa 4) → env vars VECTORIA_PROVISION_* (capa 3) →
 *   per-project secret-source file (capa 2) → global-profile (capa 1) →
 *   hardcoded defaults (capa 0).
 */
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

/** Healthcheck declarativo (mismo shape que manifest v2 application.healthcheck). */
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

/** Defaults globales (capa 1). Sobre estos operan los overrides del manifest. */
export const GlobalDefaultsSchema = z.object({
  serverUuid: z.string().min(1).default("03tz1uabcrjaihnvrhysbstv"),
  dnsWildcardDomain: z.string().min(1).default("vector-ia.mx"),
  dnsExpectedIp: z
    .string()
    .regex(/^(\d{1,3}\.){3}\d{1,3}$/, "dnsExpectedIp debe ser IPv4")
    .default("212.28.185.217"),
  gitHost: z.string().min(1).default("github.com"),
  hkdfInfoPrefix: z.string().min(1).default("vectoria"),
  secretSourceBaseDir: z.string().default("~/.config/kilo/vectoria-provision/secrets"),
  registryBaseDir: z.string().default("~/.config/kilo/vectoria-provision/registry"),
  auditBaseDir: z.string().default("~/.config/kilo/vectoria-provision/audit"),
  defaultDirectorEmail: z.string().email().default("contacto@vector-ia.mx"),
  defaultOrgName: z.string().min(1).default("Vector IA"),
  healthcheck: HealthcheckBlockSchema.optional(),
  startCommand: z
    .string()
    .regex(/^[a-zA-Z0-9_\- ./]{1,256}$/)
    .optional(),
});
export type GlobalDefaults = z.infer<typeof GlobalDefaultsSchema>;

/** Organización: defaults específicos por `project.parent` (p.ej. "vectoria", "acme-corp"). */
export const OrganizationBlockSchema = z.object({
  defaultDirectorEmail: z.string().email().optional(),
  defaultOrgName: z.string().min(1).max(120).optional(),
  healthcheck: HealthcheckBlockSchema.optional(),
  startCommand: z
    .string()
    .regex(/^[a-zA-Z0-9_\- ./]{1,256}$/)
    .optional(),
});
export type OrganizationBlock = z.infer<typeof OrganizationBlockSchema>;

export const GlobalProfileSchema = z.object({
  $schema: z.string().optional(),
  v: z.literal(1),
  defaults: GlobalDefaultsSchema.default({}),
  organizations: z
    .record(z.string().regex(/^[a-z0-9-]{1,63}$/), OrganizationBlockSchema)
    .default({}),
  globalSecretsFile: z.string().default("~/.config/kilo/integra.secrets.env"),
  lockDirNamespaceDepth: z.number().int().min(1).max(5).default(3),
  auditTargetFieldsExtra: z.array(z.string()).default(["projectParent", "projectId"]),
});
export type GlobalProfile = z.infer<typeof GlobalProfileSchema>;

const HOME_FALLBACK = process.env["HOME"] ?? "/root";

/** Expande `~` al HOME del proceso (idempotente). */
export function expandHomePath(p: string): string {
  if (p.startsWith("~/")) return `${HOME_FALLBACK}${p.slice(1)}`;
  if (p === "~") return HOME_FALLBACK;
  return p;
}

/**
 * Carga global-profile. Si el archivo no existe, está malformado o no cumple
 * schema → WARN stderr + fallback a defaults (capa 0). NO aborta.
 *
 * La función es sync (readFileSync) para mantener compat con el call site
 * principal de `index.ts` y los tests; el archivo es <1 KiB.
 */
export function loadGlobalProfile(path: string | undefined): GlobalProfile {
  const target = path ?? `${HOME_FALLBACK}/.config/kilo/vectoria-provision/global-profile.json`;
  if (!existsSync(target)) {
    process.stderr.write(
      `[vectoria-provision] WARN: global profile missing (${target}), using hardcoded defaults; override via VECTORIA_PROVISION_GLOBAL_PROFILE\n`,
    );
    return GlobalProfileSchema.parse({ v: 1 });
  }
  let raw: string;
  try {
    raw = readFileSync(target, "utf8");
  } catch {
    process.stderr.write(
      `[vectoria-provision] WARN: global profile unreadable (${target}), using hardcoded defaults\n`,
    );
    return GlobalProfileSchema.parse({ v: 1 });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    process.stderr.write(
      `[vectoria-provision] WARN: global profile malformed JSON (${target}), using hardcoded defaults\n`,
    );
    return GlobalProfileSchema.parse({ v: 1 });
  }
  const res = GlobalProfileSchema.safeParse(parsed);
  if (!res.success) {
    process.stderr.write(
      `[vectoria-provision] WARN: global profile invalid (${target}); using hardcoded defaults\n`,
    );
    return GlobalProfileSchema.parse({ v: 1 });
  }
  return res.data;
}

/** Computa `project.namespace` en formato `<parent>:<id>`. Determinista. */
export function resolveProjectNamespace(parent: string, id: string): string {
  return `${parent}:${id}`;
}

/** Compone paths namespaced. `base` puede empezar por `~` (se expande). */
export function namespacedRegistryPath(
  registryBaseDir: string,
  parent: string,
  id: string,
): string {
  return `${expandHomePath(registryBaseDir)}/${parent}/${id}/registry.jsonl`;
}

export function namespacedAuditPath(auditBaseDir: string, parent: string, id: string): string {
  return `${expandHomePath(auditBaseDir)}/${parent}/${id}/audit.jsonl`;
}

export function namespacedLockDir(
  registryBaseDir: string,
  parent: string,
  id: string,
): string {
  return `${expandHomePath(registryBaseDir)}/${parent}/${id}/registry.jsonl.locks`;
}

export function namespacedSecretSourcePath(
  secretSourceBaseDir: string,
  parent: string,
  id: string,
): string {
  return `${expandHomePath(secretSourceBaseDir)}/${parent}/${id}.env`;
}