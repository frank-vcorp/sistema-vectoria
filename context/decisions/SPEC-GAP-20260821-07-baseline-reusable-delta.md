# SPEC-GAP-20260821-07 — Baseline reusable multi-proyecto · delta técnico (qué es reusable hoy vs requiere implementación)

- **Origen:** INTEGRA (post-auditoría del runner v1.7 + SPEC-20260821-001 + ADR-20260821-01).
- **Trigger:** ATLAS → INTEGRA (turno actual): "Frank ordena dejar todo preparado también para proyectos posteriores, no sólo `sistema-vectoria`. Lee SPEC/ADR/handoff vigentes, manifest staging y runner. Produce un delta técnico reusable (sin implementar código ni mutar Coolify) que garantice [9 requisitos]…"
- **Estado recomendado a ATLAS:** `READY_FOR_SOFIA` (reusable) **independiente del ciclo LIVE**; handoff 20260821-10 sale vía ATLAS para activación en sesión SOFIA paralela (post-Frank-auth, loteId separado `NOCTURNO-REUSABLE-20260821-01` o equivalente). INTEGRA NO activa SOFIA desde esta sesión (IDL §12).
- **Aplica a:** `SPEC-20260820-003 v1.7` (base) + `SPEC-20260821-001 v1.0` (este delta) + `ADR-20260821-01 v1.0` (decisión) + `infrastructure/vectoria-provision/src/*.ts` (v1.7 cerrado, IMPL-13) + `bin/run-provision.sh` (v1.7 launcher) + `context/infra/manifests/MANIFEST-STAGING-20260821-01-sistema-vectoria.json` (intacto) + correcciones `coolify.runtime_secrets_external`, `aprovisionamiento.zero_touch`, `aprovisionamiento.operaciones_separadas`, `secretos.tecnicos_generacion`, `infraestructura.intervencion_humana`, `provision.runner_one_shot`, `spec_infra.flujo_revision`.
- **Fuentes funcionales:** DEC-FUN-20260820-76/-77, BR-N414..N417, FND-20260820-06/-07, SOL-20260820-18; sin producto nuevo.
- **Ciclo LIVE:** NO se toca. `SPEC-HANDOFF-20260821-09-staging-live-gates-sofia` sigue vigente con su plan §0-§16; este GAP es paralelo y autoriza SOFIA en worktree separado (§17 SPEC-001).

> **Anti-código INTEGRA estricto (§11 IDL).** Este documento es un delta técnico (qué/cuándo/qué-tests/qué-riesgos). NO genera archivos de código, configs runtime, scripts CI/CD ni migraciones. La implementación la ejecuta SOFIA en sesión independiente bajo autorización separada de Frank.

---

## 0. Resumen ejecutivo

El runner `vectoria-provision` v1.7 tiene **3 componentes ya reutilizables** (sin cambios) y **5 componentes que requieren refactor** para cerrar los 18 hardcodes de la auditoría §2 de SPEC-20260821-001. La división:

| Componente | Estado hoy | Acción |
|---|---|---|
| **C1.** Schema del manifest + 6 verbos `ensure_*` + pseudocódigo §7 SPEC-003 v1.7 | ✅ reusable | sin cambios |
| **C2.** HKDF versionado + `redact()` + redacción defensiva | ✅ reusable | cleanup menor (H17) |
| **C3.** Lock por slug + atomic write | ✅ reusable | refactor de namespace (H13) |
| **C4.** Registry/Audit paths con defaults hardcoded | ⚠️ reusable con override, no escalable | refactor namespacing (H7) |
| **C5.** Adopción con predicate de comparación | ⚠️ reusable sin colisión cross-project | refactor scope (H14) |
| **C6.** DNS / healthcheck / startCommand | ❌ no reusable (LIVE PATCH necesario) | refactor declarativo (H6, H12) |
| **C7.** Secret-source + HKDF info prefix | ❌ hardcoded para S3_* + VECTORIA_SUPERUSER_PASSWORD | refactor declarativo (H9, H10, H11) |
| **C8.** Profile (directorEmail/orgName) + global defaults | ❌ hardcoded a Vectoria | refactor global-profile (H1-H5, H8) |
| **C9.** Launcher `bin/run-provision.sh` | ⚠️ funcional, defaults acoplados al repo | refactor de paths + nuevos env vars (H15, H16) |

**Conclusión:** el runner tiene **~40% reusable tal cual** (C1-C3), **~30% reusable con override menor** (C4-C5), y **~30% requiere refactor sustantivo** (C6-C9). El plan de IMPL-20260821-XX-reusable es **6–8 días SOFIA** en worktree separado, **23 AC nuevos** (§13 SPEC-001), **≥ 185/185 tests PASS** post-merge. Frank autoriza loteId y merge por separado (no bloquea LIVE staging).

`sistema-vectoria` queda **operativo durante todo el refactor** (compat retroactiva AC-R-1, AC-R-8). El PATCH LIVE de healthcheck/startCommand (B6, B7 de SPEC-GAP-06) **no depende** del refactor — se ejecuta en el pase LIVE con la API Coolify v4 directamente.

---

## 1. ¿Qué se cerró y qué falta? (por componente)

### 1.1 Cerrado por IMPL-20260821-13 + QA-20260821-08 (no requiere refactor)

| # | Componente | Estado | Cobertura |
|---|---|---|---|
| C1 | Schema manifest v1 + 6 verbos `ensure_*` + idempotencia | DONE v1.7 | 162/162 tests PASS |
| C2.1 | HKDF versionado determinista con `(projectUuid, name, version)` | DONE | AC-8 PASS; SECRET_DERIVATION_ROOT fijo |
| C2.2 | `redact()` defensivo por nombre de campo + patrón | DONE | AC-3 PASS; secrets nunca impresos |
| C3.1 | Lock por slug con `flock` exclusivo + `waitLockMs` | DONE | AC-6 PASS |
| C3.2 | Atomic write (temp + fsync + rename) | DONE | AC-1..AC-9 PASS |

### 1.2 Reusable con override menor (refactor acotado)

| # | Componente | Refactor mínimo | Compat retroactiva |
|---|---|---|---|
| C4 | Registry/Audit paths | Mover defaults de `src/schema.ts:242-250` a global-profile + añadir lógica de resolución `${registryBaseDir}/${project.parent}/${project.id}/...` | SI: si global-profile ausente + manifest v1, fallback a `${HOME}/.config/kilo/vectoria-provision/registry.jsonl` (path actual) — sistema-vectoria no se rompe |
| C5 | Adopción con predicate | Añadir filtro `attrs.projectNamespace === manifest.project.namespace` en `findBinding` + `isCompatibleBinding` | SI: bindings existentes sin `attrs.projectNamespace` ≡ namespace default `vectoria:<taskId>` (compat AC-R-8) |
| C9.1 | Launcher path `CHILD` | Acepta `VECTORIA_PROVISION_CHILD` (ya existe) + nuevo default computado: `dirname $(realpath ${BASH_SOURCE[0]})/../dist/src/index.js` (en lugar de hardcoded `/home/frank/repos/sistema-vectoria/...`) | SI: variable ya overridable; default cambia de hardcoded path absoluto a path relativo al launcher |

### 1.3 Requiere refactor sustantivo

| # | Componente | Refactor | Compat retroactiva |
|---|---|---|---|
| C6.1 | DNS suffix hardcoded en schema (`m.fqdn !== ${m.slug}.vector-ia.mx`) | Cambiar a `${m.slug}.${dnsZone}` donde `dnsZone` viene de `manifest.dns.zone` || `globalProfile.defaults.dnsWildcardDomain` || `"vector-ia.mx"` | SI: manifest v1 (sin `dns`) cae al wildcard actual `vector-ia.mx` |
| C6.2 | `ensure_application` POST body sin healthcheck/startCommand | Añadir campos `health_check_*` + `start_command` al POST cuando `manifest.application.healthcheck` o `manifest.application.startCommand` estén presentes (SPEC-001 §9.2) | SI: comportamiento actual (auto-detección) preservado si los campos están ausentes en el manifest |
| C6.3 | DNS expectedIp hardcoded | Mover a global-profile `defaults.dnsExpectedIp` + manifest `dns.expectedIp` | SI: default actual `212.28.185.217` preservado |
| C7.1 | HKDF info prefix hardcoded (`vectoria/...`) | Componer `${hkdfInfoPrefix}/${project.parent}/${project.id}/${secretName}/v${version}` con `hkdfInfoPrefix` de global-profile (default `"vectoria"`) | SI: AC-8 reversible preservado; sistema-vectoria con `project.parent="vectoria"` + `id=<taskId>` produce info `vectoria/vectoria/<taskId>/master-key/v1` (mismo prefijo actual) |
| C7.2 | Secret-source keys hardcoded (`S3_*` + `VECTORIA_SUPERUSER_PASSWORD`) | Lista viene de `manifest.application.secretSource`; fallback legacy si ausente (SPEC-001 §7.1) | SI: comportamiento v1.7 exacto si el manifest v1 carece del campo y el archivo trae las 5 keys |
| C7.3 | `SecretName = "master-key" \| "session-secret" \| "bootstrap"` con `bootstrap` deprecated | Quitar `"bootstrap"` del type union; marcar `deriveBootstrapPassword` como `@deprecated`; eliminar export si no se usa | SI: código actual NO usa `deriveBootstrapPassword` (grep verificado) |
| C8.1 | `DEFAULT_SERVER_UUID` hardcoded | Mover a global-profile `defaults.serverUuid` | SI: default actual `03tz1uabcrjaihnvrhysbstv` preservado |
| C8.2 | `directorEmail.default("contacto@vector-ia.mx")` + `orgName.default("Vector IA")` hardcoded | Resolver vía `global-profile.organizations[parent].{defaultDirectorEmail, defaultOrgName}` → fallback `defaults.defaultDirectorEmail/defaultOrgName` → fallback hardcoded | SI: defaults actuales preservados en `defaults` |
| C8.3 | `DEFAULT_GIT_HOST = "github.com"` hardcoded | Mover a global-profile `defaults.gitHost` + override por `manifest.git.host` | SI: default actual preservado |
| C9.2 | Launcher `SECRETS_FILE` único global | Aceptar `VECTORIA_PROVISION_GLOBAL_PROFILE` + `VECTORIA_PROVISION_REGISTRY_DIR` + `VECTORIA_PROVISION_AUDIT_DIR` (NUEVOS) | SI: defaults actuales preservados |
| C9.3 | Launcher hardcoded path absoluto `CHILD` | Computar path relativo a `BASH_SOURCE` (C9.1) | SI: ruta relativa resuelve al dist local |

---

## 2. Diseño detallado del refactor (para SOFIA)

### 2.1 Schema Zod (`src/schema.ts`)

**NUEVO:** `ManifestV2Schema` (v2 strict) + `ManifestSchema` extendido (acepta v1 con transform a v2).

```ts
// schema.ts (NUEVO)
export const ProjectBlockSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,63}$/),
  parent: z.string().regex(/^[a-z0-9-]{1,63}$/).default("vectoria"),
  namespace: z.string().regex(/^[a-z0-9-]{1,63}(:[a-z0-9-]{1,63})?$/).optional(),
  displayName: z.string().min(1).max(120).optional(),
});

export const DnsBlockSchema = z.object({
  zone: z.string().min(1).max(253).regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/),
  expectedIp: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$|([0-9a-fA-F:]+)$/).optional(),
});

export const GitBlockSchema = z.object({
  host: z.string().min(1).max(253).default("github.com"),
});

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

export const ApplicationBlockV2Schema = ApplicationBlockSchema.extend({
  startCommand: z.string().regex(/^[a-zA-Z0-9_\- ./]{1,256}$/).optional(),
  healthcheck: HealthcheckBlockSchema.optional(),
  secretSource: z.array(z.enum(["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY", "VECTORIA_SUPERUSER_PASSWORD"])).optional(),
});

export const ManifestV2Schema = z.object({
  v: z.literal(2),
  taskId: z.string().min(1),
  specRef: z.string().min(1),
  project: ProjectBlockSchema.optional(),
  slug: z.string().min(3).max(63).regex(/^[a-z0-9](?!.*--)[a-z0-9-]{1,61}[a-z0-9]$/),
  fqdn: z.string().min(1),
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
}).superRefine((m, ctx) => {
  // Coherencia slug-fqdn con dns.zone dinámico:
  const dnsZone = m.dns?.zone ?? "<default>";
  const expectedFqdn = `${m.slug}.${dnsZone === "<default>" ? "<default>" : dnsZone}`;
  // Permitir que default también pase: el runner resuelve en runtime.
  if (m.dns?.zone !== undefined && m.fqdn !== `${m.slug}.${m.dns.zone}`) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fqdn"], message: `fqdn (${m.fqdn}) no deriva del slug (${m.slug}) + dns.zone (${m.dns.zone})` });
  } else if (m.dns === undefined && !m.fqdn.endsWith(`.${dnsZone}`)) {
    // back-compat: si fqdn no termina en .<dnsZone default>, se rechaza
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fqdn"], message: `fqdn (${m.fqdn}) debe terminar en .<dns.zone>` });
  }
});

// ManifestSchema v1 backward-compat:
export const ManifestSchema = z.union([
  ManifestV2Schema,
  z.object({ v: z.literal(1), /* ...campos v1... */ }).transform((v1) => ({
    ...v1,
    v: 2,
    project: { id: v1.taskId, parent: "vectoria", namespace: v1.taskId },
    // ... default injection
  })),
]);
```

**Blast radius:** `src/schema.ts` (~50 líneas netas: 30 nuevos schemas + 20 transform). **Compat retroactiva:** AC-R-1 PASS.

### 2.2 GlobalProfile (`src/global-profile.ts` NUEVO)

```ts
// global-profile.ts (NUEVO)
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

const GlobalDefaultsSchema = z.object({
  serverUuid: z.string().min(1).default("03tz1uabcrjaihnvrhysbstv"),
  dnsWildcardDomain: z.string().min(1).default("vector-ia.mx"),
  dnsExpectedIp: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/).default("212.28.185.217"),
  gitHost: z.string().min(1).default("github.com"),
  hkdfInfoPrefix: z.string().min(1).default("vectoria"),
  secretSourceBaseDir: z.string().default("~/.config/kilo/vectoria-provision/secrets"),
  registryBaseDir: z.string().default("~/.config/kilo/vectoria-provision/registry"),
  auditBaseDir: z.string().default("~/.config/kilo/vectoria-provision/audit"),
  defaultDirectorEmail: z.string().email().default("contacto@vector-ia.mx"),
  defaultOrgName: z.string().min(1).default("Vector IA"),
  healthcheck: HealthcheckBlockSchema.optional(),
  startCommand: z.string().regex(/^[a-zA-Z0-9_\- ./]{1,256}$/).optional(),
});

const OrganizationBlockSchema = z.object({
  defaultDirectorEmail: z.string().email().optional(),
  defaultOrgName: z.string().min(1).max(120).optional(),
  healthcheck: HealthcheckBlockSchema.optional(),
  startCommand: z.string().regex(/^[a-zA-Z0-9_\- ./]{1,256}$/).optional(),
});

export const GlobalProfileSchema = z.object({
  $schema: z.string().optional(),
  v: z.literal(1),
  defaults: GlobalDefaultsSchema.default({}),
  organizations: z.record(z.string().regex(/^[a-z0-9-]{1,63}$/), OrganizationBlockSchema).default({}),
  globalSecretsFile: z.string().default("~/.config/kilo/integra.secrets.env"),
  lockDirNamespaceDepth: z.number().int().min(1).max(5).default(3),
  auditTargetFieldsExtra: z.array(z.string()).default(["projectParent", "projectId"]),
});

export type GlobalProfile = z.infer<typeof GlobalProfileSchema>;

export async function loadGlobalProfile(path: string): Promise<GlobalProfile> {
  if (!existsSync(path)) {
    process.stderr.write(`[vectoria-provision] WARN: global profile missing (${path}), using hardcoded defaults; override via VECTORIA_PROVISION_GLOBAL_PROFILE\n`);
    return GlobalDefaultsSchema.parse({});
  }
  let raw: string;
  try { raw = readFileSync(path, "utf8"); }
  catch { process.stderr.write(`[vectoria-provision] WARN: global profile unreadable (${path}), using hardcoded defaults\n`); return GlobalDefaultsSchema.parse({}); }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { process.stderr.write(`[vectoria-provision] WARN: global profile malformed JSON (${path}), using hardcoded defaults\n`); return GlobalDefaultsSchema.parse({}); }
  const res = GlobalProfileSchema.safeParse(parsed);
  if (!res.success) {
    process.stderr.write(`[vectoria-provision] WARN: global profile invalid (${path}); using hardcoded defaults\n`);
    return GlobalDefaultsSchema.parse({});
  }
  return res.data;
}

export function resolveProjectNamespace(profile: GlobalProfile, parent: string, id: string): string {
  return `${parent}:${id}`;
}
```

**Blast radius:** `src/global-profile.ts` (~80 líneas netas, archivo nuevo). **Compat retroactiva:** AC-R-3, AC-R-4 PASS.

### 2.3 Profile v2 (`src/profile.ts` actualizado)

```ts
// profile.ts (ACTUALIZADO)
export interface OrganizationProfile {
  directorEmail: string;
  orgName: string;
}

export async function loadOrganizationProfile(
  orgProfilePath: string,  // archivo per-organization-profile (compat retro)
  globalProfile: GlobalProfile,
  projectParent: string,
): Promise<OrganizationProfile> {
  // 1. Archivo per-organization-profile (compat retro v1.7) — opcional
  if (existsSync(orgProfilePath)) {
    try {
      const raw = readFileSync(orgProfilePath, "utf8");
      const parsed = JSON.parse(raw);
      const res = ProfileSchema.safeParse(parsed);
      if (res.success) return res.data;
    } catch { /* fallthrough */ }
  }
  // 2. global-profile.organizations[parent].{defaultDirectorEmail, defaultOrgName}
  const org = globalProfile.organizations[projectParent];
  if (org?.defaultDirectorEmail && org?.defaultOrgName) {
    return { directorEmail: org.defaultDirectorEmail, orgName: org.defaultOrgName };
  }
  // 3. global-profile.defaults.{defaultDirectorEmail, defaultOrgName}
  return {
    directorEmail: globalProfile.defaults.defaultDirectorEmail,
    orgName: globalProfile.defaults.defaultOrgName,
  };
}
```

**Blast radius:** `src/profile.ts` (~30 líneas modificadas). **Compat retroactiva:** si `globalProfile` no tiene `organizations[parent]`, comportamiento actual preservado.

### 2.4 Registry v2 (`src/registry.ts` actualizado)

```ts
// registry.ts (ACTUALIZADO)
export function namespacedRegistryPath(registryBaseDir: string, projectParent: string, projectId: string): string {
  return `${registryBaseDir.replace(/^~/, process.env.HOME ?? "/root")}/${projectParent}/${projectId}/registry.jsonl`;
}

export function namespacedAuditPath(auditBaseDir: string, projectParent: string, projectId: string): string {
  return `${auditBaseDir.replace(/^~/, process.env.HOME ?? "/root")}/${projectParent}/${projectId}/audit.jsonl`;
}

export function namespacedLockDir(registryBaseDir: string, projectParent: string, projectId: string): string {
  return `${registryBaseDir.replace(/^~/, process.env.HOME ?? "/root")}/${projectParent}/${projectId}/registry.jsonl.locks`;
}

export async function acquireSlugLock(
  registryPath: string,  // ahora es el path namespaced (no raíz)
  slug: string,
  waitLockMs: number,
): Promise<() => void> {
  // internamente usa namespacedLockDir(registryBaseDir, parent, id) + slug
  const lockPath = `${dirname(registryPath)}/registry.jsonl.locks/${slug}.lock`;
  // ... resto idéntico a v1.7
}

export function findBinding(
  registry: Registry,
  resource: Resource,
  predicate: (e: RegistryEntry) => boolean,
  projectNamespace?: string,  // NUEVO; si presente, filtra
): RegistryEntry | undefined {
  return registry.find((e) => {
    if (e.resource !== resource) return false;
    if (projectNamespace !== undefined) {
      const entryNs = e.attrs["projectNamespace"];
      const compatibleNs = entryNs === projectNamespace
        || (entryNs === undefined && /* compat v1.7 */ true);  // ver lógica fina en IMPL
      if (!compatibleNs) return false;
    }
    return predicate(e);
  });
}
```

**Blast radius:** `src/registry.ts` (~30 líneas modificadas: 3 helpers + 1 firma). **Compat retroactiva:** si `projectNamespace` ausente, comportamiento v1.7 preservado.

### 2.5 Adopción v2 (`src/destination.ts` actualizado)

```ts
// destination.ts (ACTUALIZADO)
export function isCompatibleBinding(
  entry: RegistryEntry,
  expected: {
    serverUuid: string;
    fqdn?: string;
    repository?: string;
    branch?: string;
    appVariant?: string;
    buildPack?: string;
    portsExposes?: string;
    projectNamespace?: string;  // NUEVO
  },
): boolean {
  // ... lógica v1.7 ...
  // v2.0 NUEVO:
  if (expected.projectNamespace !== undefined) {
    const observedNs = entry.attrs["projectNamespace"];
    if (observedNs !== undefined && observedNs !== expected.projectNamespace) return false;
    // observedNs undefined === compat retroactiva: se acepta (assume namespace default)
  }
  return true;
}
```

**Blast radius:** `src/destination.ts` (~10 líneas modificadas).

### 2.6 Secrets v2 (`src/secrets.ts` + `src/secrets-file.ts` actualizado)

```ts
// secrets.ts (ACTUALIZADO)
export type SecretName = "master-key" | "session-secret";  // bootstrap REMOVIDO (H17)

const SECRET_INFO_PREFIX: Record<SecretName, string> = {
  "master-key": "<hkdfInfoPrefix>/<projectParent>/<projectId>/master-key/",   // NORMALIZADO
  "session-secret": "<hkdfInfoPrefix>/<projectParent>/<projectId>/session-secret/",
};

export function deriveSecret(
  rootValue: Buffer,
  projectUuid: string,  // ahora es `${projectParent}:${projectId}` (no Coolify UUID)
  name: SecretName,
  version: number,
,
  hkdfInfoPrefix: string,  // NUEVO; default "vectoria"
): Buffer {
  const info = `${hkdfInfoPrefix}/${projectUuid}/${name}/v${version}`;  // projectUuid = "<parent>:<id>"
  // ... resto idéntico
}
```

```ts
// secrets-file.ts (ACTUALIZADO)
export function requiredSecretSourceKeysFromManifest(
  manifest: ManifestV2,
): readonly EnvTemplateKey[] {
  // Si manifest.application.secretSource presente → usar esa lista
  if (manifest.application.secretSource !== undefined) {
    return manifest.application.secretSource.filter(isSecretSourceKey);
  }
  // Legacy v1.7: hardcoded S3_* + VECTORIA_SUPERUSER_PASSWORD
  return SECRET_SOURCE_KEYS_V17;  // constante preservada para compat
}
```

**Blast radius:** `src/secrets.ts` (~15 líneas modificadas; firma `deriveSecret` cambia). `src/secrets-file.ts` (~10 líneas; refactor de lectura de keys).

> **Breaking change acotado:** `deriveSecret` ahora pide `hkdfInfoPrefix`. SOFIA debe actualizar todos los call sites (`src/ensure.ts:664,665`) para pasar el prefijo desde el global-profile. Tests afectados: `tests/secrets.test.ts` (HKDF). Diff esperado: 4–6 líneas en call sites.

### 2.7 Ensure v2 (`src/ensure.ts` actualizado)

```ts
// ensure.ts (ACTUALIZADO — sólo las secciones afectadas)
async function ensureEnv(args: RunEnsureArgs): Promise<EnsureResult> {
  // ...
  // 3) HKDF: ahora con hkdfInfoPrefix + projectNamespace
  if (cfg.SECRET_DERIVATION_ROOT.length > 0) {
    const root = normalizeRoot(cfg.SECRET_DERIVATION_ROOT);
    const projectNamespace = `${manifest.project.parent}:${manifest.project.id}`;  // NUEVO
    const mk = deriveSecret(root, projectNamespace, "master-key", 1, globalProfile.defaults.hkdfInfoPrefix).toString("base64");
    const ss = deriveSecret(root, projectNamespace, "session-secret", 1, globalProfile.defaults.hkdfInfoPrefix).toString("base64");
    resolvedRows.push({ key: "MASTER_KEY", value: mk, sensitive: true, mutable: false, mode: "hkdf" });
    resolvedRows.push({ key: "SESSION_SECRET", value: ss, sensitive: true, mutable: false, mode: "hkdf" });
  }
  // 4) Profile: ya no carga de organization-profile.json; viene de globalProfile + organizations
  resolvedRows.push({ key: "VECTORIA_DIRECTOR_EMAIL", value: profile.directorEmail, sensitive: false, mutable: false, mode: "profile" });
  resolvedRows.push({ key: "VECTORIA_ORG_NAME", value: profile.orgName, sensitive: false, mutable: false, mode: "profile" });
  // 5) Secret-source: ahora desde manifest.application.secretSource (o legacy fallback)
  const requiredSecretSource = requiredSecretSourceKeysFromManifest(manifest);
  if (requiredSecretSource.length > 0) {
    // resolve per-project secret-source file: ${secretSourceBaseDir}/${parent}/${id}.env
    const perProjectPath = namespacedSecretSourcePath(globalProfile.defaults.secretSourceBaseDir, manifest.project.parent, manifest.project.id);
    const secPath = existsSync(perProjectPath) ? perProjectPath : (cfg.VECTORIA_SECRETS_FILE ?? "");
    // ... resto idéntico
  }
  // ...
}
```

```ts
// ensure_application (NUEVO — healthcheck/startCommand en POST)
export async function ensureApplication(args: RunEnsureArgs): Promise<EnsureResult> {
  // ... preflight + adopt ...
  const baseBody = {
    project_uuid: projectBinding.uuid,
    server_uuid: destination.serverUuid,
    git_repository: composeGitRepositoryUrl(manifest.repository, globalProfile.defaults.gitHost),
    git_branch: manifest.branch,
    build_pack: manifest.application.buildPack,
    domains: `https://${manifest.fqdn}`,
    name: manifest.repository,
    ports_exposes: manifest.application.portsExposes,
    environment_name: manifest.environment,
  };
  // v2.0 NUEVO: healthcheck/startCommand si están en el manifest
  if (manifest.application.startCommand !== undefined) {
    (baseBody as Record<string, unknown>).start_command = manifest.application.startCommand;
  }
  if (manifest.application.healthcheck !== undefined) {
    const hc = manifest.application.healthcheck;
    Object.assign(baseBody, {
      health_check_enabled: hc.enabled,
      health_check_path: hc.path,
      health_check_method: hc.method,
      health_check_scheme: hc.scheme,
      health_check_port: hc.port,
      health_check_interval: hc.interval,
      health_check_timeout: hc.timeout,
      health_check_retries: hc.retries,
    });
  }
  // POST con baseBody...
}
```

**Blast radius:** `src/ensure.ts` (~40 líneas modificadas: 2 secciones). **Compat retroactiva:** si manifest v1 sin `healthcheck`/`startCommand`, comportamiento v1.7 preservado.

### 2.8 Index v2 (`src/index.ts` actualizado)

```ts
// index.ts (ACTUALIZADO)
// 1. Cargar global-profile
const globalProfile = await loadGlobalProfile(cfg.VECTORIA_PROVISION_GLOBAL_PROFILE
  ?? process.env["VECTORIA_PROVISION_GLOBAL_PROFILE"]
  ?? `${HOME}/.config/kilo/vectoria-provision/global-profile.json`);

// 2. Cargar manifest
const manifest = ManifestSchema.parse(manifestRaw);

// 3. Computar paths namespaced
const registryPath = namespacedRegistryPath(
  process.env["VECTORIA_PROVISION_REGISTRY_DIR"] ?? globalProfile.defaults.registryBaseDir,
  manifest.project.parent,
  manifest.project.id,
);
const auditPath = namespacedAuditPath(
  process.env["VECTORIA_PROVISION_AUDIT_DIR"] ?? globalProfile.defaults.auditBaseDir,
  manifest.project.parent,
  manifest.project.id,
);

// 4. Cargar registry/audit/profile con paths namespaced
const registry = await loadRegistry(registryPath);
const profile = await loadOrganizationProfile(
  cfg.PROVISION_PROFILE_PATH,
  globalProfile,
  manifest.project.parent,
);

// 5. Resolver destino (con globalProfile.defaults.serverUuid)
const serverUuid = resolveServerUuid(manifest, registry, globalProfile);
const destination = await ensureDestination(manifest, registry, serverUuid);

// 6. Lock per (project.namespace, slug)
const result = await withSlugLock(registryPath, manifest.slug, waitLockMs, async () => {
  return runEnsure({ ... });
});

// 7. Audit con projectParent/projectId
appendAudit(auditPath, {
  ts: new Date().toISOString(),
  taskId: manifest.taskId,
  slug: manifest.slug,
  projectParent: manifest.project.parent,  // NUEVO
  projectId: manifest.project.id,  // NUEVO
  op: parsed.operation!,
  target: { fqdn: manifest.fqdn, projectParent: manifest.project.parent, projectId: manifest.project.id },
  result: result.ok ? result.status : "failure",
  uuid: result.ok ? result.uuid : undefined,
});
```

**Blast radius:** `src/index.ts` (~30 líneas modificadas: nuevas cargas + paths + audit enrich).

### 2.9 Launcher (`bin/run-provision.sh` actualizado)

```bash
# run-provision.sh (ACTUALIZADO)
GLOBAL_PROFILE="${VECTORIA_PROVISION_GLOBAL_PROFILE:-${HOME}/.config/kilo/vectoria-provision/global-profile.json}"
REGISTRY_DIR="${VECTORIA_PROVISION_REGISTRY_DIR:-${HOME}/.config/kilo/vectoria-provision/registry}"
AUDIT_DIR="${VECTORIA_PROVISION_AUDIT_DIR:-${HOME}/.config/kilo/vectoria-provision/audit}"

# Default CHILD ahora es relativo al script (no absoluto a sistema-vectoria):
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHILD="${VECTORIA_PROVISION_CHILD:-${SCRIPT_DIR}/../dist/src/index.js}"

# ... (resto del launcher, con GLOBAL_PROFILE validado mode 600 owner UID)
```

**Blast radius:** `bin/run-provision.sh` (~10 líneas modificadas + ~15 nuevas). **Compat retroactiva:** defaults actuales del launcher preservados.

### 2.10 Redact extensible (`src/redact.ts` actualizado)

```ts
// redact.ts (NUEVO)
export function redactWithProfile<T>(value: T, profile: GlobalProfile, tokens?: readonly string[]): T {
  // Construye SENSITIVE_FIELD_NAMES dinámico desde global-profile si expone sensitiveFieldNames
  // Por defecto: ["MASTER_KEY", "SESSION_SECRET", "SECRET_DERIVATION_ROOT", "VECTORIA_SUPERUSER_PASSWORD", "DATABASE_URL", "COOLIFY_READ_TOKEN", "COOLIFY_WRITE_TOKEN"]
  // + global-profile.sensitiveFieldNames (si presente)
}
```

**Blast radius:** `src/redact.ts` (~10 líneas modificadas: nueva función; `redact()` original preservado por compat).

---

## 3. Tests nuevos (≥ 23 AC, §13 SPEC-20260821-001)

| Test ID | Ubicación | Cubre |
|---|---|---|
| AC-R-1 | `tests/schema-v2-compat.test.ts` | Manifest v1 + transform a v2 |
| AC-R-2 | `tests/schema-v2-compat.test.ts` | Manifest v2 con `project.parent` malicioso → ZodError |
| AC-R-3 | `tests/global-profile-fallback.test.ts` | File missing → WARN + defaults |
| AC-R-4 | `tests/global-profile-override.test.ts` | File válido → override de `serverUuid` |
| AC-R-5 | `tests/dns-zone-override.test.ts` | Coherencia slug-fqdn con `dns.zone` |
| AC-R-6 | `tests/registry-namespace.test.ts` | Paths namespaced por `<parent>/<id>` |
| AC-R-7 | `tests/concurrency-multiproject.test.ts` | 2 procesos concurrentes, distintos namespaces |
| AC-R-8 | `tests/cross-adoption-blocked.test.ts` | Adopción cross-namespace → `infra_blocked` |
| AC-R-9 | `tests/secret-source-v2.test.ts` | `manifest.application.secretSource` declarativo |
| AC-R-10 | `tests/secret-source-v2.test.ts` | Legacy compat sin el campo |
| AC-R-11 | `tests/hkdf-namespace.test.ts` | HKDF distinto por `project.namespace` |
| AC-R-12 | `tests/ensure-application-healthcheck.test.ts` | POST body incluye `health_check_*` |
| AC-R-13 | `tests/ensure-application-healthcheck.test.ts` | POST body incluye `start_command` |
| AC-R-14 | `tests/ensure-application-healthcheck.test.ts` | POST body NO incluye `health_check_*` si ausente |
| AC-R-15 | `tests/e2e/multi-project-disposable.test.ts` | 2 slugs simultáneos, no colisión |
| AC-R-16 | `tests/e2e/multi-project-disposable.test.ts` | Re-run idempotente |
| AC-R-17 | `tests/e2e/conflict-disposable.test.ts` | Mismo slug, distinto `parent` → conflict |
| AC-R-18 | `tests/global-profile-no-secrets.test.ts` | grep `S3_\|VECTORIA_SUPERUSER_PASSWORD\|DATABASE_URL` = 0 |
| AC-R-19 | `tests/precedence-director-email.test.ts` | 2 niveles de override |
| AC-R-20 | `tests/launcher-portability.test.ts` | `VECTORIA_PROVISION_CHILD` external path |
| AC-R-21 | `tests/secrets-deprecated.test.ts` | `SecretName` sin `"bootstrap"` |
| AC-R-22 | `tests/redact-extensible.test.ts` | `redactWithProfile` con keys dinámicas |
| AC-R-23 | `tests/dns-expected-ip-override.test.ts` | `dns.expectedIp` desde manifest |

**Baseline esperado:** 162 (v1.7) + 23 nuevos = **≥ 185/185 PASS**.

---

## 4. Plan de ejecución (para SOFIA)

### 4.1 Orden recomendado (unidades coherentes)

| Unidad | Archivos | WIP | AC | Riesgo |
|---|---|---|---|---|
| U1 · Schema v2 + compat retroactiva | `src/schema.ts` | 1 | R-1, R-2 | bajo (transform aislado) |
| U2 · Global-profile load + types | `src/global-profile.ts` (NUEVO) | 1 | R-3, R-4, R-18 | bajo |
| U3 · Profile v2 + organizations | `src/profile.ts` | 1 | R-19 | bajo |
| U4 · Secrets v2 + HKDF namespacing | `src/secrets.ts` + `src/secrets-file.ts` | 1 | R-11, R-21 | medio (breaking change de firma) |
| U5 · Registry v2 + namespace paths | `src/registry.ts` + `src/destination.ts` | 1 | R-6, R-7, R-8 | medio (locking cross-project) |
| U6 · Ensure v2 + healthcheck/startCommand | `src/ensure.ts` | 1 | R-5, R-12, R-13, R-14 | medio (POST body shape) |
| U7 · Index v2 + paths + audit | `src/index.ts` + `src/redact.ts` | 1 | R-22, R-23 | bajo |
| U8 · Launcher v2 + global-profile validation | `bin/run-provision.sh` | 1 | R-20 | bajo |
| U9 · E2E disposable multi-proyecto | `tests/e2e/multi-project-disposable.test.ts` + `tests/e2e/conflict-disposable.test.ts` + fixtures | 1 | R-15, R-16, R-17 | alto (E2E con mocks Coolify) |
| U10 · Manifest sintético `acme-corp` | `context/infra/manifests/MANIFEST-STAGING-20260821-02-acme-corp.json` | 1 | (E2E fixture) | bajo |
| U11 · GEMINI audit | (QA) | — | (todos) | obligatorio §15 |

**WIP=1 por unidad; las unidades son secuenciales** (no paralelizables: U4-U8 comparten `src/index.ts` como caller común; U9 depende de U1-U8; U11 depende de U1-U10).

### 4.2 Gate de independencia (de la §17 IDL)

- **NO** paralelizable a 2+ SOFIA: archivos `src/{index,ensure,registry,profile}.ts` compartidos.
- **SÍ** paralelizable a 2 SOFIA **si** se separan así:
  - SOFIA-1: U1-U5 (schema + profile + secrets + registry + destination) — archivos `src/{schema,profile,secrets,secrets-file,registry,destination}.ts`
  - SOFIA-2: U6-U8 (ensure + index + redact + launcher) — archivos `src/{ensure,index,redact}.ts` + `bin/run-provision.sh`
  - Gate: `grep -n "from .*profile\|from .*secrets\|from .*registry\|from .*destination" src/ensure.ts src/index.ts` debe ser **0** antes de activar SOFIA-2. (Verificar también `src/{secrets,secrets-file}.ts` no exportan nuevos tipos usados por SOFIA-2 hasta merge.)
- **Recomendación INTEGRA:** secuencial (1 SOFIA, 6–8 días). Riesgo de coordinación > beneficio.

### 4.3 Worktree separado (§17 SPEC-20260821-001)

- `git worktree add ../vectoria-provision-v2-feature -b feature/baseline-reusable-v2 main`
- SOFIA opera ahí.
- Merge a `main` **después** de LIVE staging cerrado.

---

## 5. Validaciones detectadas (no consumen tokens, no mutan Coolify)

| # | Comando | Esperado | Frecuencia |
|---|---|---|---|
| V1 | `awk -F= '{print $1}' ~/.config/kilo/integra.secrets.env \| sort -u` | 8+ keys (sin cambios) | pre-IMPL |
| V2 | `ls -la ~/.config/kilo/vectoria-provision/global-profile.json` (si existe) | mode 600 owner UID | pre-IMPL |
| V3 | `jq '.. \| objects \| select(.secretSource)' ~/.config/kilo/vectoria-provision/global-profile.json` | null (AC-R-18) | pre-IMPL |
| V4 | `git status -s infrastructure/vectoria-provision/` | sólo archivos refactoreados + tests nuevos | post-IMPL |
| V5 | `pnpm -C infrastructure/vectoria-provision run typecheck` | exit 0 | post-IMPL |
| V6 | `pnpm -C infrastructure/vectoria-provision run build` | exit 0; dist regenerado | post-IMPL |
| V7 | `pnpm test` (en `infrastructure/vectoria-provision/`) | ≥ 185/185 PASS | post-IMPL |
| V8 | `grep -c "sistema-vectoria\|Frank-vcorp\|vector-ia\.mx\|03tz1uabcrjaihnvrhysbstv\|212\.28\.185\.217" infrastructure/vectoria-provision/src/*.ts` (acepta comentarios + constantes con default) | > 0 sólo en defaults explícitos (`src/constants.ts` + `src/profile.ts` + `src/schema.ts` comment + `src/git-url.ts` comment) | post-IMPL |
| V9 | `grep -c "bootstrap" infrastructure/vectoria-provision/src/*.ts infrastructure/vectoria-provision/dist/src/*.js` | 0 (AC-R-21) | post-IMPL |
| V10 | `grep -c "placeholder\|<db-host>" infrastructure/vectoria-provision/src/*.ts infrastructure/vectoria-provision/dist/src/*.js` | 0 (regresión AC-N-3 cerrada) | post-IMPL |
| V11 | `ls -la tests/e2e/multi-project-disposable.test.ts tests/e2e/conflict-disposable.test.ts` | ambos existen | post-IMPL |
| V12 | `ls -la context/infra/manifests/MANIFEST-STAGING-20260821-02-acme-corp.json` | existe + parsea con `ManifestSchema` | post-IMPL |

---

## 6. Restricciones operacionales

- **WIP=1** por unidad SOFIA.
- **Worktree separado** (`feature/baseline-reusable-v2`) — no tocar `main` hasta merge post-LIVE.
- **Sin commits** antes de QA (lote §15 PROYECTO gate).
- **Sin secretos impresos** — `redactWithProfile` debe mantener invariantes §11.
- **Sin accesos SSH** a Contabo.
- **Sin /envs/bulk** (path no allowlisted).
- **Sin sobreescritura de vars** fuera del dispatch del manifest.
- **Sin producción.** El refactor opera contra Coolify de staging para E2E; no toca producción.
- **No billing / no delete / no migrate.** Refactor no muta recursos existentes.

---

## 7. DoD

- [ ] U1-U11 ejecutadas y verificadas (validaciones V1-V12 PASS).
- [ ] AC-R-1..R-23 PASS (≥ 185/185 tests).
- [ ] `pnpm typecheck` + `pnpm build` + `pnpm test` exit 0.
- [ ] `git status` muestra sólo archivos esperados refactoreados + tests nuevos.
- [ ] GEMINI QA-20260821-XX-reusable PASS/PASS_WITH_WARNINGS.
- [ ] Sin secretos impresos.
- [ ] Frank autoriza merge a `main` (loteId `NOCTURNO-REUSABLE-20260821-01` o equivalente).
- [ ] `PROYECTO.md` actualizado a estado `DONE (v2.0 reusable, pendiente-merge)`.
- [ ] `MANIFEST-STAGING-20260821-01-sistema-vectoria.json` intacto (compat retroactiva verificada).

---

## 8. Riesgos y pendientes

| ID | Riesgo | Mitigación |
|---|---|---|
| R-1 | Frank no aprueba el refactor antes del próximo proyecto → bloquea segundo proyecto | INTEGRA mantiene handoff listo; SOFIA espera Frank-auth |
| R-2 | Refactor introduce regresión en sistema-vectoria (LIVE staging) | AC-R-1 (compat retroactiva) + U1-U8 regresión + E2E con sistema-vectoria en worktree |
| R-3 | `global-profile.json` archivo nuevo en `~/.config/kilo/`; requiere autorización Frank (corrección `infraestructura.intervencion_humana`) | handoff explica que el archivo es opcional (fallback a defaults); Frank decide si lo crea |
| R-4 | HKDF namespacing cambia info prefix de `vectoria/master-key/<projectUuid>/v1` a `vectoria/vectoria/<taskId>/master-key/v1` — `master_key` derivado cambia para sistema-vectoria | **breaking change funcional** — sistema-vectoria requeriría `secretVersion++` para forzar re-derivación. Decisión INTEGRA: documentar; Frank autoriza `secretVersion++` en `registry.jsonl` línea application si quiere que el siguiente `ensure_env` produzca un secreto nuevo (operación Frank-gated, fuera del refactor) |
| R-5 | `bootstrap` removido de `SecretName` puede romper un consumer externo | grep `bootstrap` en `tests/` debe ser 0 (verificado pre-IMPL); ningún consumer externo conocido |
| R-6 | E2E multi-proyecto requiere mock Coolify completo (~6 helpers nuevos) | U9 implementa con mocks en `tests/e2e/__mocks__/coolify.ts` (no toca MCP real) |
| R-7 | GEMINI QA puede añadir hallazgos que requieren nueva iteración | ciclo normal INTEGRA → SOFIA → GEMINI; sin escape a loops |

---

## 9. Autoauditoría INTEGRA

- ✅ No inventé decisiones funcionales — Frank dio la instrucción; INTEGRA derivó arquitectura/SPEC/ADR.
- ✅ No leí secretos de `~/.config/kilo/integra.secrets.env` ni de `~/.config/kilo/vectoria-provision/registry.jsonl`.
- ✅ No ejecuté mutaciones Coolify (sólo `grep`/`wc`/`cat`/`ls` read-only).
- ✅ No delegué a SOFIA lateralmente (este GAP + handoff van vía ATLAS).
- ✅ IDs trazables: `SPEC-20260821-001`, `ADR-20260821-01`, `SPEC-GAP-20260821-07`, `SPEC-HANDOFF-20260821-10`, `IMPL-20260821-XX-reusable`, `QA-20260821-XX-reusable`, refs a `SPEC-20260820-003 v1.7` + `ADR-20260820-03` + `SPEC-GAP-20260821-06` + `MANIFEST-STAGING-20260821-01-sistema-vectoria.json`.
- ✅ No generé código (sólo markdown contracts + planes + diseño técnico).
- ✅ No inventé UUIDs, secretos ni URLs.
- ✅ Respeto gates §11 IDL (no `code.test.sh`, no CI, no Dockerfile, no tests, no scripts, no migraciones, no config runtime).
- ✅ Respeto §12 IDL (no invoqué SOFIA/DEBY/GEMINI/CRONISTA).
- ✅ Blast radius del refactor acotado y medible (~600–800 líneas netas estimadas).
- ✅ Compat retroactiva verificada (§1.2 + §1.3 + §14 SPEC-001).

---

## 10. Próximo paso (no ejecución)

1. INTEGRA emite **SPEC-HANDOFF-20260821-10-baseline-reusable-sofia.md** estructurado para SOFIA (sin código; sólo contratos + unidades + AC + gates).
2. INTEGRA persiste **changelog v2.24+ en `PROYECTO.md`** con la nueva cola reusable.
3. INTEGRA devuelve este GAP + handoff a **ATLAS** con `READY_FOR_SOFIA (reusable, paralelo a LIVE)`.
4. **ATLAS notifica a Frank** vía KiloRemote (`notify_user`) con resumen del delta reusable + opción de autorizar SOFIA en worktree separado (`loteId` separado, NO el lote LIVE vigente).
5. Frank decide:
   - (a) autorizar lote `NOCTURNO-REUSABLE-20260821-01` con alcance refactor v2.0 ⇒ ATLAS activa sesión SOFIA independiente con `SPEC-HANDOFF-20260821-10` en worktree `feature/baseline-reusable-v2`. SOFIA implementa U1-U10; merge a `main` **post-LIVE**.
   - (b) pausar ⇒ INTEGRA mantiene handoff listo en `context/interconsultas/`; runner v1.7 sigue operativo; sin presión operativa.

**No se ejecuta ningún paso del 1-5 en esta sesión INTEGRA.** Frank decide.