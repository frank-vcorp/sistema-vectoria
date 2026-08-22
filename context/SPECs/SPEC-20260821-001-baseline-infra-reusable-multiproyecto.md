# SPEC-20260821-001 · Baseline reusable multi-proyecto · vectoria-provision v2.0

- **ID:** SPEC-20260821-001
- **Estado:** `READY` (cierre-W1W2-aplicado vía SPEC-GAP-20260821-07-cierre r1)
- **Versión:** 1.1 (INTEGRA 2026-08-21, post-QA-20260821-REUSABLE-r1; corrige W1 EnvTemplateKeys 5/12 y W2 conteo 146/185)
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-21
- **ADR:** `context/decisions/ADR-20260821-01-baseline-infra-reusable-precedencia-namespacing.md` (v1.1, propuesto; corrige §2.5 enum keys)
- **SPEC-GAP cierre:** `context/decisions/SPEC-GAP-20260821-07-cierre-r1.md` (W1+W2 cerrados)
- **QA de referencia:** `context/reviews/QA-20260821-REUSABLE-r1.md` (PASS_WITH_WARNINGS, 0 P0/P1, 2 WARNINGS cerrados en este pase)
- **Origen funcional:** DEC-FUN-20260820-76/-77 · BR-N414..N417 · FND-20260820-06/-07 · SOL-20260820-18 · correcciones `coolify.runtime_secrets_external`, `aprovisionamiento.zero_touch`, `aprovisionamiento.operaciones_separadas`, `secretos.tecnicos_generacion`, `infraestructura.intervencion_humana`, `provision.runner_one_shot`, `spec_infra.flujo_revision`, `coolify_write.capacidad_temporal`, `coolify_readonly.dedicated_launcher`.
- **Origen técnico:** `context/SPECs/SPEC-20260820-003` v1.7 (broker zero-touch, INTEGRA-self compatible) + `context/decisions/SPEC-GAP-20260821-06-staging-live-gates.md` §6 + instrucción Frank "dejar todo preparado también para proyectos posteriores, no sólo `sistema-vectoria`" (turno actual).
- **Manifest canónico vigente** `context/infra/manifests/MANIFEST-STAGING-20260821-01-sistema-vectoria.json` **NO se modifica** (compatibilidad retroactiva §3).
- **Handoff SOFIA:** `context/interconsultas/SPEC-HANDOFF-20260821-10-baseline-reusable-sofia.md` (IMPL-20260821-REUSABLE-r1 entregado, **independiente del ciclo LIVE**; gated-Frank con autorización por separado).
- **Estado de la unidad:** `READY_FOR_MERGE_POST_LIVE` (definido en PROYECTO.md). Significa: código y SPEC cerrados, suite 146/146 PASS reproducible, pendiente sólo de merge gated-Frank tras cierre del LIVE staging `NOCTURNO-STAGING-20260821-03/04`.

> Documento autosuficiente y ejecutable. No contiene historial normativo fuera del diseño vinculante. Esta SPEC es **delta técnica** sobre `SPEC-20260820-003 v1.7`: cierra hardcodes detectados en runner/launcher (§2 auditoría) y abre el baseline a N proyectos sin reescritura del runner.

---

## 1. Resultado

Convertir `vectoria-provision` v1.7 en un **baseline reusable multi-proyecto** (v2.0) donde:

- **Ningún** hardcode de slug, repo, branch, UUID, nombre de DB/storage, email/org o health-path en el runner/launcher (cero literales de proyecto).
- **Un perfil global único** (`~/.config/kilo/vectoria-provision/global-profile.json`, mode 600) y **overrides por proyecto** (manifest v2 + archivo de secretos por proyecto + env vars `VECTORIA_PROVISION_*`), con **precedencia explícita y testeable** (§6).
- **Manifest genérico validado** y portable para el 2º/3er proyecto (`MANIFEST-20260821-01-acme-corp.json`, `MANIFEST-20260821-02-globex.json` válidos sin tocar el runner).
- **Registry, locks y auditoría namespaced por `project.parent` + `project.id`** sin colisiones entre proyectos; ni siquiera con mismo `slug`.
- **Secret-source, HKDF, rotación/revocación y bootstrap reutilizables** sin secretos de proyecto en el perfil global (salvo referencias autorizadas).
- **Ensure/reconcile/adopción que NO adopta recursos de otro proyecto** aunque coincidan el slug o el FQDN: predicate de adopción incluye `project.namespace`.
- **DNS `<slug>.<dns.zone>` declarativo** por manifest (`dns.zone` defaulta al global `vector-ia.mx`); **healthcheck/startCommand declarativos** en el manifest, propagados al `POST /applications/...` desde el primer `ensure_application` (no requieren PATCH LIVE).
- **E2E disposable multi-proyecto**: dos slugs simultáneos, idempotencia y conflicto entre proyectos cubiertos por fixtures automatizadas.
- **Separación clara** entre baseline global (`vectoria-provision/` + `global-profile.json`) y **adaptadores de aplicación** (módulo por app que mapea el contrato de env vars de la app — incluyendo las 12 runtime app keys — al enum baseline de 5 keys del runner, §11.4 + SPEC-GAP-20260821-07-cierre r1 §2); **`sistema-vectoria` no es plantilla implícita**.

`sistema-vectoria` **sigue funcionando** sin cambios en el ciclo LIVE en curso (DRIFT §7.0). El baseline reusable es **adicional**, no sustituye nada cerrado.

---

## 2. Auditoría de hardcodes detectados (origen del SPEC-GAP-20260821-07)

Inventario verificado read-only el `2026-08-21` por INTEGRA sobre `infrastructure/vectoria-provision/` (commit `b8f8b8e` + working tree no trackeado). Cada hallazgo referencia `archivo:línea` actual.

| # | Hardcode | Archivo:línea | Naturaleza | ¿Reusable hoy? |
|---|---|---|---|---|
| H1 | `DEFAULT_SERVER_UUID = "03tz1uabcrjaihnvrhysbstv"` | `src/constants.ts:11` | Server Coolify global Vectoria (precedencia §5 SPEC-003 v1.0) | Sí con default + override; requiere mover a global-profile (§4) |
| H2 | `DNS_EXPECTED_IP = "212.28.185.217"` | `src/constants.ts:12` | IP del VPS Vectoria | Sí con default + override; requiere mover a global-profile (§4) |
| H3 | `DNS_WILDCARD_DOMAIN = "vector-ia.mx"` | `src/constants.ts:13` | Dominio wildcard | Sí con default; requiere override por manifest (§4 §9) |
| H4 | `directorEmail.default("contacto@vector-ia.mx")` | `src/profile.ts:22` | Email contacto Vectoria | Sí con default; requiere mover a global-profile (§4 §7) |
| H5 | `orgName.default("Vector IA")` | `src/profile.ts:23,29` | Branding Vectoria | Sí con default; requiere mover a global-profile (§4 §7) |
| H6 | `m.fqdn !== ${m.slug}.vector-ia.mx` (coherencia) | `src/schema.ts:115-116` | Hardcoded `.vector-ia.mx` | **Requiere refactor**: el sufijo debe provenir de `dns.zone` (default H3) (§9) |
| H7 | `~/.config/kilo/vectoria-provision/{registry,audit,profile}` (defaults hardcoded) | `src/schema.ts:242-250,283-296` | Rutas con subdir `vectoria-provision` | **Requiere refactor**: las rutas deben derivarse de global-profile + project.namespace (§6) |
| H8 | `DEFAULT_GIT_HOST = "github.com"` | `src/git-url.ts:23` | Host Git por defecto | Sí con default + override por manifest (`git.host`) (§9) |
| H9 | `SECRET_INFO_PREFIX = { master-key: "vectoria/master-key/", session-secret: "vectoria/session-secret/", bootstrap: "vectoria/bootstrap/" }` | `src/secrets.ts:34-38` | Prefijo HKDF `vectoria/` | **Requiere refactor**: el prefijo debe provenir de global-profile (`hkdfInfoPrefix`, default `vectoria`) + project.namespace (§7) |
| H10 | `SECRET_SOURCE_KEYS = { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, VECTORIA_SUPERUSER_PASSWORD }` | `src/secrets-file.ts:24-30` | Enum cerrado de 5 keys secret-source | **Requiere refactor**: las keys secret-source deben ser **declarativas por proyecto** (`manifest.application.secretSource`) con default global "razonable" (§7) |
| H11 | `allKeysNeeded = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY", "VECTORIA_SUPERUSER_PASSWORD"]` (hardcoded en ensure_env) | `src/ensure.ts:678-680` | Lista hardcoded de qué secret-source pedir | **Requiere refactor**: composición desde manifest `application.secretSource` (§7) |
| H12 | `ensure_application` POST body sin `health_check_*` ni `start_command` declarativos | `src/ensure.ts:374-410` (POST body §8.5.3 SPEC-003 v1.7) | LIVE PATCH necesario | **Requiere refactor**: el manifest v2 lleva `application.healthcheck` + `application.startCommand` y el POST los incluye desde el primer create (§9) |
| H13 | `registry.jsonl` + `registry.jsonl.locks/<slug>.lock` paths sin namespace | `src/registry.ts:82-83,242` | Locks flat por slug (colisiona entre proyectos con mismo slug) | **Requiere refactor**: namespace `project.parent/project.id/slug` (§6) |
| H14 | `findBinding(registry, resource, predicate)` sin scope de proyecto | `src/registry.ts:57-63` | Predicado sin namespacing (riesgo cross-project) | **Requiere refactor**: argumento `projectNamespace` (§8) |
| H15 | `bin/run-provision.sh` lee `~/.config/kilo/integra.secrets.env` (archivo único global) | `bin/run-provision.sh:33,101` | Launcher usa el archivo global compartido con otros tools | Sí con default; **requiere override** por `VECTORIA_PROVISION_SECRETS_FILE` por proyecto o por secret-source per-project (§7 §10) |
| H16 | `bin/run-provision.sh:35` `CHILD` con path absoluto al dist de sistema-vectoria | `bin/run-provision.sh:35` | Path dist absoluto de un proyecto concreto | **Aceptable**: ya overridable por `VECTORIA_PROVISION_CHILD` (default del launcher) — el runner es portable cuando se invoca desde otro repo |
| H17 | `SecretName = "master-key" \| "session-secret" \| "bootstrap"` | `src/secrets.ts:19` | `bootstrap` queda en el type aunque v1.7 ya usa `secret-source` | Sí; **requiere limpieza** (remover `bootstrap` para evitar namespacing HKDF fantasma en apps futuras) |
| H18 | `redact.ts:13-29` `SENSITIVE_FIELD_NAMES` enum cerrado (incluye `VECTORIA_SUPERUSER_PASSWORD`) | `src/redact.ts:13-29` | Redacción defensiva enum cerrado | Sí con default; **requiere extensibilidad** para apps que añadan keys (no sólo `S3_*`) |

**Conclusión de auditoría:** 5 hallazgos son hardcodes menores (H1, H2, H3, H4, H5, H8, H15, H16, H17, H18) que admiten refactor no-disruptivo con **defaults seguros + override explícito**. Los 8 hallazgos restantes (H6, H7, H9, H10, H11, H12, H13, H14) **requieren refactor del schema y del runner**; son el cuerpo de este SPEC.

`sistema-vectoria` se mantiene **operativo durante el refactor**: el manifest vigente `MANIFEST-STAGING-20260821-01-sistema-vectoria.json` (v1) sigue funcionando sin tocar campos (H6, H7, H9, H10, H11, H12, H13, H14 son **compatibles hacia atrás** si se modela bien el override, §3 + §7).

---

## 3. Modelo de configuración (precedencia explícita)

### 3.1 Tabla de precedencia (de menor a mayor)

| Prioridad | Origen | Mutable por | Alcance |
|---|---|---|---|
| 0 (last-resort) | Hardcoded defaults en `src/constants.ts` (H1-H3) y `src/profile.ts` (H4-H5) | INTEGRA (código) | Runtime; sólo si nada superior está presente |
| 1 | `~/.config/kilo/vectoria-provision/global-profile.json` (mode 600) | Frank o INTEGRA | Global, por instalación |
| 2 | Per-project secret-source file (`~/.config/kilo/vectoria-provision/secrets/<parent>/<id>.env`, mode 600) | Frank | Por `project.parent` + `project.id` |
| 3 | Env vars `VECTORIA_PROVISION_*` (`VECTORIA_PROVISION_CHILD`, `VECTORIA_PROVISION_SECRETS_FILE`, `VECTORIA_PROVISION_SECRET_SOURCE_FILE`, `VECTORIA_PROVISION_GLOBAL_PROFILE`, `VECTORIA_PROVISION_REGISTRY_DIR`, `VECTORIA_PROVISION_AUDIT_DIR`) | Dev/CLI launcher | Por invocación |
| 4 | **Manifest v2** (campos `project.*`, `application.*`, `dns.*`) | INTEGRA | Por `taskId` |

**Regla de override:** cada nivel sustituye sólo los campos que **explícitamente** declara. Un campo ausente en el manifest se resuelve con el nivel inmediatamente inferior. Un campo ausente en global-profile cae a los defaults hardcoded (nivel 0) con un warning stderr (no BLOCKED).

### 3.2 `global-profile.json` schema (NUEVO, §4)

```json
{
  "$schema": "https://vector-ia.mx/schemas/vectoria-provision/global-profile.v1.json",
  "v": 1,
  "defaults": {
    "serverUuid": "03tz1uabcrjaihnvrhysbstv",
    "dnsWildcardDomain": "vector-ia.mx",
    "dnsExpectedIp": "212.28.185.217",
    "gitHost": "github.com",
    "hkdfInfoPrefix": "vectoria",
    "secretSourceBaseDir": "~/.config/kilo/vectoria-provision/secrets",
    "registryBaseDir": "~/.config/kilo/vectoria-provision/registry",
    "auditBaseDir": "~/.config/kilo/vectoria-provision/audit"
  },
  "organizations": {
    "vectoria": {
      "defaultOrgName": "Vector IA",
      "defaultDirectorEmail": "contacto@vector-ia.mx"
    },
    "acme-corp": {
      "defaultOrgName": "Acme Corp",
      "defaultDirectorEmail": "ops@acme-corp.example"
    }
  },
  "globalSecretsFile": "~/.config/kilo/integra.secrets.env",
  "lockDirNamespaceDepth": 3,
  "auditTargetFieldsExtra": ["projectParent", "projectId"]
}
```

> **`globalSecretsFile`** apunta al archivo compartido del host (no contiene secretos de proyecto). Por proyecto, los secretos se cargan del per-project secret-source (§7).

### 3.3 Precedencia de campos sensibles

- **Secretos del runner** (`COOLIFY_READ_TOKEN`, `COOLIFY_WRITE_TOKEN`, `SECRET_DERIVATION_ROOT`): **siempre** desde el archivo global (`globalSecretsFile`) cargado por el launcher (`run-provision.sh`). **Nunca** del manifest ni del secret-source per-project. Los tokens y la raíz de derivación son **infraestructura compartida** del usuario Unix, no del proyecto.
- **Secretos del proyecto** (modo `secret-source`): desde el per-project file (§7). El manifest declara cuáles necesita.

---

## 4. Manifest v2 (delta compatible con manifest v1)

### 4.1 Schema v2 — campos nuevos (todos opcionales, con default seguro)

```json
{
  "v": 2,
  "taskId": "IMPL-20260821-XX",
  "specRef": "SPEC-20260817-001",

  "project": {
    "id": "frank-vcorp-sistema-vectoria",
    "parent": "vectoria",
    "namespace": "frank-vcorp-sistema-vectoria",
    "displayName": "Sistema Vectoria"
  },

  "slug": "sistema-vectoria",
  "fqdn": "sistema-vectoria.vector-ia.mx",
  "repository": "frank-vcorp/sistema-vectoria",
  "branch": "main",
  "git": { "host": "github.com" },

  "serverUuid": "03tz1uabcrjaihnvrhysbstv",
  "environment": "staging",
  "resources": ["project", "environment", "application", "database", "storage"],

  "dns": { "zone": "vector-ia.mx", "expectedIp": "212.28.185.217" },

  "application": {
    "appVariant": "public",
    "buildPack": "nixpacks",
    "portsExposes": "3000",
    "githubAppUuid": null,
    "privateKeyUuid": null,
    "startCommand": "pnpm start",
    "healthcheck": {
      "enabled": true,
      "path": "/api/health",
      "method": "GET",
      "scheme": "http",
      "port": "3000",
      "interval": 30,
      "timeout": 5,
      "retries": 3
    },
    "secretSource": [
      "S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"
    ]
  },

  "database": { "engine": "postgresql", "name": "sistema-vectoria-db" },
  "storage": { "serviceType": "garage", "name": "sistema-vectoria-storage" },

  "envOverrides": {}
}
```

### 4.2 Default resolution rules

| Campo v2 | Default si ausente | Fuente |
|---|---|---|
| `v` | `1` (compat retroactiva) | schema |
| `project.id` | `manifest.taskId` | schema (slug stable derived) |
| `project.parent` | `"vectoria"` | global-profile `organizations.vectoria` (default org) |
| `project.namespace` | `<parent>:<id>` | composed |
| `project.displayName` | `manifest.slug` | schema |
| `git.host` | `global-profile.defaults.gitHost` | global-profile |
| `dns.zone` | `global-profile.defaults.dnsWildcardDomain` | global-profile |
| `dns.expectedIp` | `global-profile.defaults.dnsExpectedIp` | global-profile |
| `application.healthcheck` | `null` (Coolify auto-detección) | schema |
| `application.startCommand` | `null` (Coolify auto-detección nixpacks) | schema |
| `application.secretSource` | `[]` (vacío; legacy compat: `S3_*` + `VECTORIA_SUPERUSER_PASSWORD` siguen funcionando si el archivo los trae) | schema |
| `serverUuid` | `global-profile.defaults.serverUuid` | global-profile |
| `slug`, `fqdn`, `repository`, `branch`, `environment`, `database`, `storage`, `application.{appVariant, buildPack, portsExposes, githubAppUuid, privateKeyUuid}`, `envOverrides`, `taskId`, `specRef` | **sin cambios** respecto a v1 | compat retroactiva |

### 4.3 Compatibilidad con manifest v1

Un manifest v1 (sin bloque `project`, sin `dns`, sin `application.healthcheck`, sin `application.secretSource`, sin `application.startCommand`) sigue siendo válido: `v` se acepta como `1` con `.transform()` que inyecta defaults. Las nuevas claves son **opcionales**, los nuevos bloques sólo se materializan si están presentes en el JSON. Ningún manifest v1 deja de pasar `ManifestSchema.parse`.

> **Decisión INTEGRA:** el manifest canónico vigente `MANIFEST-STAGING-20260821-01-sistema-vectoria.json` **se conserva tal cual**. Se crea un segundo manifest v2 `MANIFEST-STAGING-20260821-02-acme-corp.json` (sintético, E2E disposable) como fixture oficial del nuevo comportamiento.

---

## 5. Profile resolution (`src/profile.ts` v2)

### 5.1 Carga del global-profile

- Path default: `~/.config/kilo/vectoria-provision/global-profile.json` (overridable por `VECTORIA_PROVISION_GLOBAL_PROFILE` env var).
- Si el archivo no existe o no parsea → runner cae a defaults hardcoded (nivel 0) **con warning stderr** (`[vectoria-provision] WARN: global profile missing, using hardcoded defaults (override via VECTORIA_PROVISION_GLOBAL_PROFILE)`). **No** aborta.
- Validación Zod (`GlobalProfileSchema`); campos inválidos → warning + fallback a default por campo.

### 5.2 Composición `OrganizationProfile`

```
profile = {
  directorEmail: manifest.project.parent
                  → global-profile.organizations[parent].defaultDirectorEmail
                  → global-profile.defaults.defaultDirectorEmail (last-resort)
                  → hardcoded "contacto@vector-ia.mx",
  orgName:        manifest.project.parent
                  → global-profile.organizations[parent].defaultOrgName
                  → global-profile.defaults.defaultOrgName
                  → hardcoded "Vector IA",
}
```

El archivo `organization-profile.json` per-organization **se mantiene** por retro-compat (runner no rompe si existe) pero deja de ser la fuente canónica: queda como override opcional de nivel 2.5 (entre global-profile y env).

---

## 6. Namespacing de registry, locks y auditoría

### 6.1 Paths namespaced (NUEVO)

```
${auditBaseDir}/${project.parent>/<project.id>/audit.jsonl   # append-only JSONL
${registryBaseDir}/${project.parent>/<project.id>/registry.jsonl   # atomic JSONL
${registryBaseDir}/${project.parent>/<project.id>/registry.jsonl.locks/<slug>.lock   # flock
```

Donde `<parent>` y `<id>` vienen del manifest (`project.parent`, `project.id`) con **validación Zod regex** (lowercase alnum + `-`, max 63 chars; bloquea `..`, `/`, caracteres de control).

> **Decisión INTEGRA:** el subdir `vectoria-provision` deja de ser único. El nivel raíz de los artefactos se divide por **`auditBaseDir` / `registryBaseDir`** (default `~/.config/kilo/vectoria-provision/{audit,registry}`), y debajo por `<parent>/<id>/`. La **instalación local del runner** es lo único que se mantiene centralizado.

### 6.2 Lock por (project.namespace, slug)

- Lock path: `${registryBaseDir}/${project.parent}/${project.id}/${slug}.lock` (más profundo que el actual `${registryPath}.locks/${slug}.lock`).
- **Mismo slug en dos proyectos distintos** → dos locks independientes en directorios distintos (sin colisión).
- **Mismo slug en dos `taskId` del mismo proyecto** → un solo lock (concurrencia manejada por flock + waitLockMs).
- `withSlugLock(registryPath, slug, waitLockMs, fn)` se mantiene con la misma firma; el cambio es **interno al path resuelto**.

### 6.3 Audit namespaced

- `AuditEntrySchema` añade `projectParent: string` + `projectId: string` (top-level, opcionales pero **obligatorios** si el manifest los trae).
- `target` puede añadir `projectParent`, `projectId` redundantes (auditoría legible sin parsear manifest).
- Redacción `redact()` preserva invariantes §11 + AC-3 (token-leak).

### 6.4 Atomic write preservada

- `commitBinding` y `appendAudit` siguen usando `temp + fsync + rename` (lock por `project.namespace + slug`). Atomicidad cross-proyecto no es objetivo (cada proyecto tiene su propio registry).

---

## 7. Secret-source genérico

### 7.1 Resolución de keys secret-source

```
secretSourceKeysNeeded = manifest.application.secretSource (si presente)
                       || global-profile.defaults.secretSourceKeys (default vacío)
                       || [/* empty: no required secrets, runner NO los pide */]
```

**Quiebre retrocompatible (decisión INTEGRA):** si `manifest.application.secretSource` está **ausente** y el archivo `secret-source` contiene `S3_ENDPOINT`/`S3_BUCKET`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`/`VECTORIA_SUPERUSER_PASSWORD`, el runner los pide (compat v1.7). Si está **presente** y vacío, runner no pide ninguno. Si está **presente** y lista N keys, runner pide sólo esas.

### 7.2 HKDF namespacing

- Info prefix: `${global-profile.defaults.hkdfInfoPrefix}/${project.parent}/${project.id}/${secretName}/v${version}`
- Default prefijo: `"vectoria"` (H9 default).
- **Distinto por proyecto**: el mismo `SECRET_DERIVATION_ROOT` produce secretos distintos para `vectoria:sistema-vectoria` vs `acme-corp:blog`.
- **Determinista**: misma `(parent, id, secretName, version)` → mismo secreto (AC-8).

### 7.3 `bootstrap` removido del `SecretName` enum

- H17: `SecretName = "master-key" | "session-secret"` (se quita `"bootstrap"`).
- `deriveBootstrapPassword` queda deprecated (export no usado). Fixture de test lo cubre como AC.

### 7.4 Per-project secret-source file

- Path: `${global-profile.defaults.secretSourceBaseDir}/${project.parent}/${project.id}.env`
- Default: `~/.config/kilo/vectoria-provision/secrets/vectoria/frank-vcorp-sistema-vectoria.env`
- Mode 600, owner UID Frank, no-symlink (validación análoga a `run-provision.sh`).
- Si **no existe** → fallback al archivo único `globalSecretsFile` (`~/.config/kilo/integra.secrets.env`) por retro-compat v1.7. El runner **lee sólo las keys declaradas en `manifest.application.secretSource`** (nunca todas). Si una key no está ni en per-project ni en global fallback → `infra_blocked(secret_source_keys_missing:<key>)`.

### 7.5 Rotación y revocación

- `version` HKDF monotónico por proyecto: `version=1` inicial; Frank rota incrementando (escribe el binding `attrs.secretVersion: 2`). El runner detecta drift y re-deriva en el siguiente `ensure_env`. AC-8 reversible.
- Revocación: borrar la entry del per-project file + Frank-patch `secretVersion` en el registry (próximo `ensure_env` produce secretos distintos sin re-deploy).
- Rotación de raíz: cambio de `SECRET_DERIVATION_ROOT` → secreto distinto en TODOS los proyectos (operación global, Frank-gated; no en alcance de v2.0, queda como nota para v2.1).

### 7.6 Sin secretos de proyecto en global-profile

- `global-profile.json` **NO contiene** valores de `S3_*`, `VECTORIA_SUPERUSER_PASSWORD`, `DATABASE_URL`, ni ningún secreto de proyecto.
- Contiene **sólo** paths, defaults operativos, y la lista de organizations (con `defaultDirectorEmail`/`defaultOrgName` que son **públicos**).
- AC-9: `grep -c "S3_\|VECTORIA_SUPERUSER_PASSWORD\|DATABASE_URL" global-profile.json` = 0.

---

## 8. Ensure / reconcile / Adopción no-colisionante

### 8.1 Predicate de adopción ampliado

```ts
isCompatibleBinding(entry, expected):
  // v1.7 ya cubierto:
  serverUuid === entry.serverUuid
  fqdn (if present) === entry.fqdn
  repository === entry.attrs.repository
  branch === entry.attrs.branch
  appVariant === entry.attrs.appVariant
  buildPack === entry.attrs.buildPack
  portsExposes === entry.attrs.portsExposes
  // v2.0 NUEVO:
  projectNamespace (manifest.project.namespace) === entry.attrs.projectNamespace
  || (entry.attrs.projectNamespace === undefined  // compat retroactiva: bindings v1.7 sin namespace
      && manifest.project.namespace === `${manifest.project.parent}:${manifest.project.id}`)  // backward
```

**Bindings v1.7 sin `attrs.projectNamespace`:** se considera que pertenecen al namespace default `vectoria:<id>`. Esto evita que la migración rompa `sistema-vectoria` (cuyo binding existente no tiene `projectNamespace`).

### 8.2 `findBinding` con scope

```ts
findBinding(registry, resource, predicate, projectNamespace?)
// Si projectNamespace provisto: filtra entradas con attrs.projectNamespace === projectNamespace
//                              || (entry.attrs.projectNamespace === undefined && compat)
```

- Default `projectNamespace` = `manifest.project.parent + ":" + manifest.project.id` (computed en caller).
- `infra_blocked` con `reason: cross_project_adoption` si una entrada con mismo FQDN/slug pertenece a otro namespace (intento explícito de cross-adopt).

### 8.3 `resolveServerUuid` actualizado

```
serverUuid = manifest.serverUuid               // override
          || binding.serverUuid del namespace actual // binding existente
          || global-profile.defaults.serverUuid  // global
          || hardcoded "03tz1uabcrjaihnvrhysbstv"  // last-resort
```

---

## 9. DNS, healthcheck y startCommand declarativos

### 9.1 DNS

- **Coherencia slug-fqdn:** `m.fqdn === m.slug + "." + (m.dns.zone ?? globalProfile.defaults.dnsWildcardDomain ?? "vector-ia.mx")` (H6 cerrado).
- **Validación read-only previa al `ensure_application`:** `dig +short <fqdn>` debe resolver a `dns.expectedIp` (de `manifest.dns.expectedIp` → `globalProfile.defaults.dnsExpectedIp` → hardcoded `212.28.185.217`). Si falla → `dns_unresolved`.

### 9.2 Healthcheck y startCommand en `ensure_application` POST body

- Coolify v4 acepta `health_check_*` + `start_command` en el **POST** de creación de aplicación (verificado en docs oficiales Coolify v4 + AC-L-12 LIVE §11 SPEC-GAP-20260821-06). NO requiere PATCH LIVE.
- Body POST §8.5.3 SPEC-003 v1.7 se extiende con campos opcionales:

```json
{
  "...": "...",
  "start_command": "pnpm start",                              // sólo si manifest.application.startCommand presente
  "health_check_enabled": true,                              // sólo si manifest.application.healthcheck.enabled === true
  "health_check_path": "/api/health",
  "health_check_method": "GET",
  "health_check_scheme": "http",
  "health_check_port": "3000",
  "health_check_interval": 30,
  "health_check_timeout": 5,
  "health_check_retries": 3
}
```

- Si `manifest.application.healthcheck` ausente → campos NO se incluyen (comportamiento v1.7 = auto-detección Coolify).
- Si `manifest.application.startCommand` ausente → campo NO se incluye (comportamiento v1.7 = nixpacks auto-detección).

### 9.3 Resolución por manifest > global > hardcoded

```
effectiveHealthcheck = manifest.application.healthcheck ?? globalProfile.defaults.healthcheck ?? null
effectiveStartCommand = manifest.application.startCommand ?? globalProfile.defaults.startCommand ?? null
```

> **`global-profile.defaults.healthcheck`** es opcional (default null). Las organizaciones que quieran un baseline común (p.ej. `/health` en :3000, scheme http, GET, interval 30, timeout 5, retries 3) lo declaran en su bloque `organizations[parent].healthcheck` o `defaults.healthcheck`.

### 9.4 Eliminación del PATCH LIVE

- **AC-LIVE de SPEC-HANDOFF-20260821-09 §5 (fase 10 PATCH healthcheck) deja de ser necesario** para `sistema-vectoria` en futuros deploys: el manifest v2 lleva el healthcheck y se incluye en el primer POST.
- **Decisión INTEGRA:** el PATCH LIVE actual (B6, B7) se cierra en este pase LIVE **sin** depender de v2.0 (manifest v1 vigente NO tiene `application.healthcheck`). El delta a v2.0 **no bloquea** LIVE staging en curso.

---

## 10. Launcher (`bin/run-provision.sh`) actualizado

### 10.1 Nuevos env vars aceptados

| Var | Default | Función |
|---|---|---|
| `VECTORIA_PROVISION_CHILD` | (abs path del dist) | Path al `dist/src/index.js` del runner (ya existía) |
| `VECTORIA_PROVISION_SECRETS_FILE` | `~/.config/kilo/integra.secrets.env` | Archivo global con tokens + DERIVATION_ROOT (ya existía) |
| `VECTORIA_PROVISION_SECRET_SOURCE_FILE` | (vacío) | Path al archivo per-project secret-source (ya existía) |
| `VECTORIA_PROVISION_GLOBAL_PROFILE` | `~/.config/kilo/vectoria-provision/global-profile.json` (NUEVO) | Path al global-profile |
| `VECTORIA_PROVISION_REGISTRY_DIR` | `~/.config/kilo/vectoria-provision/registry` (NUEVO) | Raíz de registry namespaced |
| `VECTORIA_PROVISION_AUDIT_DIR` | `~/.config/kilo/vectoria-provision/audit` (NUEVO) | Raíz de audit namespaced |
| `VECTORIA_PROVISION_EXPECTED_UID` | `id -u` | Owner esperado para archivos 600 (ya existía) |

### 10.2 Compatibilidad con manifest v1

- `VECTORIA_PROVISION_GLOBAL_PROFILE` ausente o archivo inválido → runner usa defaults hardcoded + warning. **No aborta.**
- `VECTORIA_PROVISION_REGISTRY_DIR`/`VECTORIA_PROVISION_AUDIT_DIR` ausentes → runner usa defaults del código.

### 10.3 Validaciones reforzadas

- El launcher valida **todos** los archivos mode 600 (no-symlink, owner UID esperado) con la misma función `validate_secret_file`:
  - `globalSecretsFile` (existente)
  - `global-profile.json` (NUEVO)
  - `secret-source` per-project (NUEVO cuando se provee)
- Errores estables: `file_missing | file_symlink | bad_owner | bad_perms | global_profile_unreadable | src_*`.

---

## 11. Baseline vs application adapters — separación explícita

### 11.1 Inventario

- **Baseline global** (este SPEC): `infrastructure/vectoria-provision/` + `~/.config/kilo/vectoria-provision/global-profile.json` + manifest v2 contract. El runner expone un **enum baseline cerrado de 5 keys** (`EnvTemplateKeys` en `src/schema.ts:371-377`): `APP_ENV`, `APP_URL`, `DATABASE_URL`, `VECTORIA_DIRECTOR_EMAIL`, `VECTORIA_ORG_NAME`. Estas 5 keys son el contrato público que el runner conoce, valida y dispatcha (v1.7 cerrado + v2.0 sin cambios al enum; ver §14 y ADR §2.5 v1.1).
- **Application adapter**: módulo por app (vive **fuera** del repo `infrastructure/vectoria-provision/`) que mapea el contrato de env vars de la app — incluyendo las **12 runtime app keys** (`APP_BASE_URL`, `NODE_ENV`, `DATABASE_URL`, `MASTER_KEY`, `SESSION_SECRET`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `VECTORIA_DIRECTOR_EMAIL`, `VECTORIA_ORG_NAME`, `VECTORIA_SUPERUSER_PASSWORD` referenciadas por `SPEC-20260821-003 v1.7` §8.3) — al enum baseline de 5 keys del runner. La ampliación del enum baseline a las 12 keys queda **explícitamente diferida a IMPL-13+ dedicado** (decisión SPEC-GAP-20260821-07-cierre r1 §2 W1 — Opción A ratificada).

### 11.2 Ubicación del adapter

- Para `sistema-vectoria`: el adapter vive en `src/lib/env.ts` + `src/lib/vectoria-adapter.ts` (NUEVO, opcional) **dentro del repo `sistema-vectoria`**, **no** en el repo `infrastructure/vectoria-provision`.
- Para un futuro proyecto: su adapter vive en su propio repo (p.ej. `acme-corp-blog/src/lib/...`).
- El adapter **NO** se commitea al repo de infra. El runner es **adapter-agnóstico**: cualquier app que mapea su contrato al enum baseline de 5 keys (vía su propio adapter) funciona.

### 11.3 `sistema-vectoria` NO es plantilla implícita

- **Decisión INTEGRA:** el baseline reusable se valida con **otro proyecto sintético** (`acme-corp` en fixture E2E §13), NO con `sistema-vectoria`. `sistema-vectoria` permanece como **primer adopter**, no como **template**.
- Fixture E2E: `tests/e2e/multi-project-disposable.test.ts` (NUEVO) crea `MANIFEST-20260821-01-acme-corp.json` + corre el runner dos veces sobre slugs distintos, validando que no hay adopción cruzada, no hay colisión de locks, y los secrets de un proyecto no se filtran al otro.

### 11.4 Schema del adapter (documental, NO código)

```
adapter.ts (por app):
  export function adapterManifestToV2(manifestV1): ManifestV2
  export function adapterEnvToDispatch(envApp): { key, value, mode }[]
```

- Es responsabilidad del adapter componer las 12 runtime app keys de su contrato propio al enum baseline de 5 keys del runner (más `secretSource` declarativo del manifest para las claves sensibles). El adapter vive en el repo de la app, no en el repo de infra.
- El runner **NO** conoce el adapter ni las 12 keys completas: sólo consume `ManifestV2` (con `application.secretSource` y `application.healthcheck` declarativos) y valida contra el enum baseline de 5 keys (`EnvTemplateKeys`). Los casts `as EnvTemplateKey` para `MASTER_KEY`/`SESSION_SECRET` en `src/ensure.ts:672-673` son **compat temporal** que se elimina cuando IMPL-13+ amplíe el enum baseline (cierre de W1 vía SPEC-GAP-cierre r1).

---

## 12. Precedencia — resumen operacional

| Concepto | Override más alto | Override más bajo | Default last-resort |
|---|---|---|---|
| `serverUuid` | manifest | global-profile | hardcoded `03tz1uabcrjaihnvrhysbstv` |
| `dns.zone` | manifest | global-profile | hardcoded `vector-ia.mx` |
| `dns.expectedIp` | manifest | global-profile | hardcoded `212.28.185.217` |
| `git.host` | manifest | global-profile | hardcoded `github.com` |
| `directorEmail` | per-organization-profile | manifest.project.parent → global-profile.organizations[parent].defaultDirectorEmail | hardcoded `contacto@vector-ia.mx` |
| `orgName` | per-organization-profile | manifest.project.parent → global-profile.organizations[parent].defaultOrgName | hardcoded `Vector IA` |
| `hkdfInfoPrefix` | global-profile | — | hardcoded `vectoria` |
| `secretSourceKeys` | manifest.application.secretSource | (no global default) | `[]` |
| `application.healthcheck` | manifest | global-profile.defaults.healthcheck | `null` |
| `application.startCommand` | manifest | global-profile.defaults.startCommand | `null` |
| `registryBaseDir` / `auditBaseDir` | env `VECTORIA_PROVISION_*_DIR` | global-profile.defaults | hardcoded `~/.config/kilo/vectoria-provision/{registry,audit}` |
| `globalSecretsFile` | env `VECTORIA_PROVISION_SECRETS_FILE` | global-profile.globalSecretsFile | hardcoded `~/.config/kilo/integra.secrets.env` |
| `project.parent` | manifest | — | hardcoded `vectoria` |
| `project.id` | manifest | — | derivado de `taskId` |

---

## 13. Criterios de aceptación (AC)

> Cada criterio es ejecutable (test, typecheck, comando, output esperado). Todos verifican comportamiento real, no subjetividad.

- **AC-R-1 · schema v2 backward-compat:** `ManifestSchema.parse` acepta un manifest v1 (sólo con los campos v1: `v:1`, `taskId`, `specRef`, `slug`, `fqdn`, `repository`, `branch`, `serverUuid`, `environment`, `resources`, `application`, `database`, `storage`, `envOverrides`) sin error; añade defaults equivalentes a `project:{parent:"vectoria", id:<taskId>, namespace:<taskId>}`. Fixture `tests/schema-v2-compat.test.ts`. PASS si `parse` retorna sin `ZodError`.

- **AC-R-2 · schema v2 strict:** `ManifestSchema.parse` rechaza un manifest v2 con `project.parent = "vectoria/../etc"` (regex bloquea `/`, `..`). PASS si `parse` lanza `ZodError` con `path: ["project", "parent"]`.

- **AC-R-3 · global-profile load + fallback:** Si `~/.config/kilo/vectoria-provision/global-profile.json` no existe, runner continúa (exit 0 si manifest válido) con un warning stderr `[vectoria-provision] WARN: global profile missing, using hardcoded defaults`. PASS si `stderr` contiene el warning y `process.exitCode === 0` para manifest válido.

- **AC-R-4 · global-profile load + override:** Si el archivo existe con `defaults.serverUuid = "OTHER-SERVER-UUID"`, el runner lo usa como `default serverUuid` cuando el manifest no fija `serverUuid`. Fixture `tests/global-profile-override.test.ts`. PASS si `resolveServerUuid` retorna `OTHER-SERVER-UUID`.

- **AC-R-5 · dns.zone override:** Manifest v2 con `dns.zone = "staging.example.com"` y `slug = "acme-corp"`. Coherencia: `fqdn === "acme-corp.staging.example.com"`. PASS si el schema acepta y la validación de coherencia slug-fqdn pasa con el nuevo sufijo.

- **AC-R-6 · registry namespaced:** Tras `ensure_project` con `project.parent="acme-corp"` y `project.id="blog"`, el archivo `${auditBaseDir}/acme-corp/blog/registry.jsonl` contiene 1 línea `project` y el lock `${registryBaseDir}/acme-corp/blog/registry.jsonl.locks/acme-corp.lock` existe. Verificable con `ls`. PASS si ambos paths existen tras el run.

- **AC-R-7 · concurrencia entre proyectos:** dos procesos concurrentes, uno con `manifest.project.namespace = "vectoria:sistema-vectoria"`, otro con `"acme-corp:blog"`. Ambos completan sin `already_running`. Verificable con `Promise.all` de dos child processes. PASS si ambos retornan `ok:true`.

- **AC-R-8 · no cross-adoption:** `manifest.acme-corp` con `fqdn = "sistema-vectoria.vector-ia.mx"` (mismo FQDN que el binding existente de `sistema-vectoria`): `ensure_application` debe fallar con `infra_blocked(reason: cross_project_adoption)` porque el binding existente tiene `attrs.projectNamespace = "vectoria:sistema-vectoria"` (o undefined con compat retroactiva que resuelve a `"vectoria:sistema-vectoria"`) mientras el manifest entrante tiene `"acme-corp:blog"`. Fixture `tests/cross-adoption-blocked.test.ts`. PASS si el runner aborta con código `infra_blocked`.

- **AC-R-9 · secret-source per-project:** Si `manifest.application.secretSource = ["S3_ENDPOINT","S3_BUCKET"]`, runner pide **sólo** esas 2 keys del secret-source file. Si el file contiene `S3_ACCESS_KEY` adicional, runner la ignora. Verificable con mock de `readSecretsFromFile` que cuenta las keys solicitadas. PASS si `requiredKeys.length === 2`.

- **AC-R-10 · secret-source legacy compat:** Si `manifest.application.secretSource` ausente y el secret-source file contiene `S3_ENDPOINT`/`S3_BUCKET`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`/`VECTORIA_SUPERUSER_PASSWORD`, runner pide las 5 (comportamiento v1.7). Verificable con mock que captura `requiredKeys`. PASS si `requiredKeys` contiene las 5 keys.

- **AC-R-11 · HKDF namespace:** Con `global-profile.hkdfInfoPrefix = "vectoria"` y `manifest.project.namespace = "acme-corp:blog"`, `deriveSecret(root, projectUuid, "master-key", 1)` produce un Buffer distinto al derivado con `projectUuid` del mismo `projectUuid` bajo namespace `vectoria:sistema-vectoria`. PASS si los dos Buffers no son iguales (32 bytes comparados byte-a-byte).

- **AC-R-12 · healthcheck en POST:** Manifest v2 con `application.healthcheck = {enabled:true, path:"/api/health", ...}`. Mock de `POST /applications/public` captura el body. Verificable que el body incluye `health_check_enabled:true`, `health_check_path:"/api/health"`, etc. Fixture `tests/ensure-application-healthcheck.test.ts`. PASS si el mock captura los 7 campos.

- **AC-R-13 · start_command en POST:** Manifest v2 con `application.startCommand = "pnpm start"`. Mock captura body. PASS si `start_command === "pnpm start"`.

- **AC-R-14 · healthcheck ausente → omitir:** Manifest v2 **sin** `application.healthcheck`. Mock captura body. PASS si el body NO incluye ningún `health_check_*`.

- **AC-R-15 · E2E disposable multi-proyecto:** `tests/e2e/multi-project-disposable.test.ts` ejecuta el runner **dos veces** con manifests `sistema-vectoria` (existente) y `acme-corp` (sintético, en fixtures). Verifica:
  - (a) cada uno tiene su propio directorio `${base}/<parent>/<id>/`.
  - (b) ningún UUID del primero aparece en el segundo (lock + adopt non-overlap).
  - (c) `grep -c <uuid-de-sistema-vectoria> <registry-acme-corp>` = 0.
  - (d) `audit.jsonl` de cada proyecto contiene sólo entradas de su `taskId`.
  PASS los 4 checks.

- **AC-R-16 · idempotencia E2E:** Re-correr el `multi-project-disposable.test.ts` con los mismos manifests → 0 POST nuevo, `adopted` para todos los `ensure_*`. Verificable con mock que cuenta POSTs por `taskId` y compara con baseline. PASS si baseline ≡ retry.

- **AC-R-17 · conflict E2E:** `tests/e2e/conflict-disposable.test.ts`. Crear `acme-corp-2` con `slug = "sistema-vectoria"` (mismo slug que el existente) y `project.parent = "acme-corp"`. El runner debe rechazar `ensure_project` con `conflict` (no adopta un recurso cuyo `projectNamespace` no coincide). PASS si el runner aborta con `conflict`.

- **AC-R-18 · global-profile sin secretos:** `grep -c -E "S3_|VECTORIA_SUPERUSER_PASSWORD|DATABASE_URL|MASTER_KEY|SESSION_SECRET" ~/.config/kilo/vectoria-provision/global-profile.json` = 0. PASS.

- **AC-R-19 · precedence de `directorEmail`:** Con `global-profile.organizations.vectoria.defaultDirectorEmail = "x@y"`, manifest `project.parent = "vectoria"` y per-organization-profile ausente → `profile.directorEmail === "x@y"`. Con per-organization-profile presente con `directorEmail = "otro@z"` → `profile.directorEmail === "otro@z"` (override más alto). Fixture `tests/precedence-director-email.test.ts`. PASS los 2 casos.

- **AC-R-20 · launcher portabilidad:** `VECTORIA_PROVISION_CHILD=/path/to/other/dist/src/index.js bin/run-provision.sh --manifest=/x --operation=ensure_project` ejecuta el runner del path externo. El launcher no hardcodea la ruta absoluta. PASS si `process.argv` del child contiene `--manifest=/x` y el child retorna código 0/2/3 esperado.

- **AC-R-21 · bootstrap deprecated removal:** `secrets.ts` exporta `SecretName = "master-key" | "session-secret"` (NO `"bootstrap"`). `deriveBootstrapPassword` ya no se exporta (o se exporta `@deprecated`). PASS si `Object.keys(SecretName)` contiene sólo 2 entries.

- **AC-R-22 · redact extensible:** Añadir `app.specific.secret = "ABC"` a `AuditEntry` no genera `[REDACTED]` (porque no está en `SENSITIVE_FIELD_NAMES`). Pero si una key nueva se declara en `global-profile.sensitiveFieldNames`, sí se redacta. Verificable con mock que añade la key al profile. PASS los 2 casos.

- **AC-R-23 · DNS expectedIp override:** Manifest v2 con `dns.expectedIp = "10.0.0.5"`. Validación DNS `dig +short <fqdn>` debe resolver a `10.0.0.5`. Si resuelve a otra IP → `dns_unresolved`. Fixture `tests/dns-expected-ip-override.test.ts`. PASS con mock de `dns.lookup`.

**Total: 23 AC ejecutables.** Cobertura: schema (1, 2), profile (3, 4, 18, 19, 22), namespacing (6, 7, 8, 15, 16, 17), secret-source (9, 10, 18), HKDF (11), manifest (5, 12, 13, 14), DNS (23), launcher (20), deprecación (21).

---

## 14. Compatibilidad con artefactos vigentes

| Artefacto | Compatibilidad |
|---|---|
| `SPEC-20260820-003 v1.7` | **Sigue vigente** como contrato base; este SPEC-20260821-001 es **delta no-disruptivo** que cierra hardcodes (H1-H18). El runner v1.7 cerrado + auditado NO se reabre; el delta se materializa como **v1.7.1 → v1.8** (nueva release) tras IMPL. |
| `MANIFEST-STAGING-20260821-01-sistema-vectoria.json` (v1) | **Intacto**. Compat retroactiva AC-R-1. |
| `registry.jsonl` (5 bindings existentes) | **Intacto** durante refactor. Los bindings existentes NO tienen `attrs.projectNamespace`; el runner los trata como namespace default `vectoria:<taskId>` (compat retroactiva AC-R-8). Los nuevos bindings (post-IMPL) sí llevan `attrs.projectNamespace`. |
| `audit.jsonl` (15+ líneas existentes) | **Intacto**. Las líneas nuevas ganan `projectParent`/`projectId`; las antiguas se preservan verbatim. |
| `bin/run-provision.sh` v1.7 | **Modificado** para añadir env vars §10.1. Compat retroactiva: defaults preservados. |
| `tests/*.test.ts` + `tests/e2e/*.test.ts` (146/146 PASS oficial tras pase r1) | **No se reabre**. Baseline v1.7 medido = **82 subtests** (no 162 como afirmaba el handoff original; error de arrastre corregido en SPEC-GAP-20260821-07-cierre r1 §3 W2). Pase r1 añade 49 subtests con tag `AC-R-*` + 11 misc + 4 E2E oficiales = **146/146 PASS** (comando: `pnpm test`, incluye ambos globs). Las nuevas fixtures viven en `tests/{schema-v2-compat,global-profile-fallback,global-profile-override,dns-zone-override,registry-namespace,hkdf-namespace,launcher-portability,precedence-director-email,redact-extensible,secret-source-v2,ensure-application-healthcheck,git-url,e2e}/`. |
| `context/decisions/SPEC-GAP-20260821-06-staging-live-gates.md` | **Sigue vigente**. El ciclo LIVE en curso NO depende de v2.0; usa manifest v1 vigente + PATCH LIVE. |
| `context/SPECs/SPEC-20260820-003` §8.3 enum | **Sin cambios al enum baseline**. El runner conserva el enum baseline cerrado de 5 keys (`EnvTemplateKeys`, `src/schema.ts:371-377`) preservado del runner v1; las **12 runtime app keys** del §8.3 v1.7 son **delegadas al application adapter** (§11) y no se materializan en el enum del runner. v2.0 no añade keys al enum baseline del runner; redefine el origen (`secret-source` per-project) y el namespace HKDF. La ampliación del enum baseline a las 12 keys queda para **IMPL-13+ dedicado** (decisión ratificada en SPEC-GAP-20260821-07-cierre r1 §2 W1 — Opción A). |
| `MANIFEST-20260821-01-acme-corp.json` (sintético, E2E) | **NUEVO**, generado por INTEGRA/SOFIA en IMPL. Vive en `context/infra/manifests/` o `tests/fixtures/manifests/` (decisión SOFIA). |

---

## 15. Riesgos y pendientes

| ID | Riesgo | Mitigación |
|---|---|---|
| RR-1 | Frank exige pasar el runner de "v1.7 cerrado" a "v2.0 reusable" sin reabrir el código cerrado | Refactor se entrega como **v1.7.1 → v1.8**, paquete nuevo IMPL-20260821-XX; v1.7 sigue compilando/tests PASS en `main` hasta merge |
| RR-2 | Ciclo LIVE en curso puede romperse si el refactor toca archivos compartidos (D-INTEGRA-06-7 del SPEC-GAP-06 prohíbe mutar `src/` del runner en LIVE) | IMPL-20260821-XX-reusable corre en **worktree separado** (§17 gate); merge a `main` **después** del cierre LIVE |
| RR-3 | `global-profile.json` es archivo nuevo en `~/.config/kilo/`; Frank debe autorizarlo (corrección `infraestructura.intervencion_humana`) | INTEGRA emite handoff con default values + nota de que el archivo es opcional (fallback a defaults) |
| RR-4 | E2E multi-proyecto requiere recursos Coolify reales (segundo proyecto + server); no se puede validar offline al 100% | Suite E2E corre contra fixtures con `coolify-readonly`/`coolify-write` mocks; sólo `dry-run` con `--dry-run` consume recursos reales (Frank-gated, opt-in) |
| RR-5 | Apps que ya usan keys secret-source distintas de S3_* (futuro) deben migrar a `manifest.application.secretSource`; compat legacy cubre v1.7 pero no v1.6 o anterior | Documentar en README del runner; ninguna app existente usa keys distintas de S3_* (verificado en `sistema-vectoria` por grep AC-N-2 SPEC-003 v1.7) |
| RR-6 | `bootstrap` removido del `SecretName` (H17) puede romper tests que aún lo esperan | Los tests v1.7 NO usan `deriveBootstrapPassword` (v1.7 migró a `secret-source`); grep `bootstrap` en `tests/` debe ser 0 antes del refactor |
| RR-7 | Runner refactorizado tiene nuevo comportamiento de adopción (cross-project block); si Frank decide que `sistema-vectoria` debe poder migrar a otro namespace, queda como override | Documentado en §14 (compat retroactiva); cualquier migración futura es SPEC-GAP separado |
| RR-8 | GEMINI obligatorio (§15 IDL: cambio de contrato público + auth/secretos + infra) | SPEC-HANDOFF-20260821-10 marca GEMINI obligatorio; QA previa al merge |

---

## 16. DoD (Definition of Done) — para IMPL-20260821-XX-baseline-reusable

- [ ] Schema v2 backward-compat (AC-R-1, AC-R-2) PASS.
- [ ] Global-profile load + override + fallback (AC-R-3, AC-R-4) PASS.
- [ ] DNS `dns.zone` override + coherencia slug-fqdn (AC-R-5) PASS.
- [ ] Registry/locks/audit namespaced (AC-R-6, AC-R-7) PASS.
- [ ] No cross-adoption (AC-R-8) PASS.
- [ ] Secret-source per-project + legacy compat (AC-R-9, AC-R-10) PASS.
- [ ] HKDF namespace (AC-R-11) PASS.
- [ ] Healthcheck/startCommand en POST (AC-R-12, AC-R-13, AC-R-14) PASS.
- [ ] E2E multi-proyecto disposable (AC-R-15, AC-R-16, AC-R-17) PASS.
- [ ] Global-profile sin secretos (AC-R-18) PASS.
- [ ] Precedencia directorEmail (AC-R-19) PASS.
- [ ] Launcher portabilidad (AC-R-20) PASS.
- [ ] `bootstrap` deprecated (AC-R-21) PASS.
- [ ] Redact extensible (AC-R-22) PASS.
- [ ] DNS expectedIp override (AC-R-23) PASS.
- [ ] `pnpm -C infrastructure/vectoria-provision run typecheck` exit 0.
- [ ] `pnpm -C infrastructure/vectoria-provision run build` exit 0; `dist/` regenerado.
- [ ] `pnpm test` = **146/146 PASS** oficial (incluye `tests/*.test.ts` + `tests/e2e/*.test.ts`). Baseline v1.7 medido = 82 subtests; meta v2.0 = ≥146 PASS oficial. Verificación: `cd infrastructure/vectoria-provision && pnpm test` → output `tests 146 / pass 146 / fail 0`. E2E aislados: `node --test --import tsx 'tests/e2e/*.test.ts'` → 4/4 PASS.
- [ ] `grep -c "bootstrap\|placeholder\|<db-host>" infrastructure/vectoria-provision/src/*.ts infrastructure/vectoria-provision/dist/src/*.js` = 0 (AC-N-3 regresión cerrada).
- [ ] GEMINI QA-20260821-XX PASS/PASS_WITH_WARNINGS (obligatorio §15: cambio de contrato público + secretos + infra).
- [ ] Frank autoriza merge a `main` (espejo de autorización lote NOCTURNO-REUSABLE-20260821-01 o equivalente).
- [ ] `context/infra/manifests/MANIFEST-STAGING-20260821-02-acme-corp.json` (sintético E2E) generado + validado.
- [ ] `PROYECTO.md` v2.X actualizado con estado `DONE (v2.0 reusable)`.

---

## 17. Paralelización y worktree

- WIP=1 por unidad SOFIA para el refactor (archivos acoplados: `src/{schema,registry,profile,secrets,secrets-file,ensure,index,git-url,destination,constants}.ts` + `bin/run-provision.sh` + tests nuevos). **NO paralelizable** (mismos archivos).
- **Worktree separado** para no chocar con LIVE staging en curso: `git worktree add ../vectoria-provision-v2-feature -b feature/baseline-reusable-v2 main`. SOFIA opera ahí.
- Merge a `main` **después** de:
  1. LIVE staging cerrado (`DONE (staging-aprobado)`)
  2. QA-20260821-XX-reusable PASS
  3. Frank autoriza merge (AC explícita §16)

---

## 18. Out-of-scope (no se hace en este pase)

- Implementar código (INTEGRA no implementa; §11 IDL).
- Migrar `sistema-vectoria` al nuevo namespace (queda como compat retroactiva).
- Reescribir el contrato del manifest a v3.
- Cambiar el runner a otro lenguaje/framework.
- Multi-server (multi-Coolify-instance).
- Dry-run mode (queda como v2.1 con Frank-gated flag).
- Auto-rotate `SECRET_DERIVATION_ROOT`.
- Bulk operations en Coolify (prohibido por §8.5.6.f SPEC-003 v1.7).
- Production deploy.

---

## 19. Próximo paso

1. INTEGRA emite **ADR-20260821-01-baseline-infra-reusable-precedencia-namespacing** (decisión arquitectónica formal) y **SPEC-GAP-20260821-07-baseline-reusable-delta** (delta técnico detallado: qué es reusable hoy vs qué requiere impl).
2. INTEGRA emite **SPEC-HANDOFF-20260821-10-baseline-reusable-sofia** para SOFIA en sesión independiente (post-Frank-auth, loteId separado).
3. INTEGRA persiste **changelog v2.24+ en `PROYECTO.md`** con la nueva cola reusable.
4. INTEGRA devuelve el set a **ATLAS** con `READY_FOR_SOFIA` (reusable) **sin tocar el ciclo LIVE**.

**No se ejecuta código en esta sesión INTEGRA.**