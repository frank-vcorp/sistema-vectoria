# ADR-20260821-01 · Baseline infra reusable multi-proyecto · precedencia + namespacing

- **ID:** ARCH-20260821-01
- **Estado:** **propuesto** (INTEGRA 2026-08-21; aceptación tras IMPL-20260821-REUSABLE-r1 + QA-20260821-REUSABLE-r1 PASS_WITH_WARNINGS + Frank-merge)
- **Versión:** 1.1 (corrige §2.5 enum keys; cierre W1 vía SPEC-GAP-20260821-07-cierre r1)
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-21
- **Origen:** instrucción Frank "dejar todo preparado también para proyectos posteriores, no sólo `sistema-vectoria`" (turno actual) + auditoría de hardcodes del runner v1.7 (18 hallazgos H1-H18) + `context/SPECs/SPEC-20260821-001-baseline-infra-reusable-multiproyecto.md` v1.0 (este ADR es su decisión arquitectónica formal).
- **Sustituye/relaciona:** ninguno (es delta sobre ADR-20260820-03, aceptado). El ADR-20260820-03 sigue vigente como decisión del runner one-shot; este ADR añade la decisión de **precedencia + namespacing** para hacerlo reusable.
- **GEMINI obligatorio** sobre el IMPL-20260821-XX-reusable que lo materializa (cambio de contrato público + auth/secretos + infra, §15 IDL).

---

## 1. Contexto

El runner `vectoria-provision` (CLI one-shot, `infrastructure/vectoria-provision/`) está **cerrado y auditado** en v1.7: 162/162 tests PASS, GEMINI QA-20260821-08 PASS_WITH_WARNINGS, `audit_failed`/`redact()`/`HKDF`/lock por slug validados. **Fue diseñado y validado contra un único proyecto** (`sistema-vectoria`).

Frank ordena ahora que el runner **no quede acoplado a ese único proyecto**: cualquier proyecto futuro (segundo cliente, segundo producto, tercer servicio) debe poder desplegarse con el mismo runner + manifest canónico, **sin** reescribir el código, **sin** hardcodear valores de proyecto, **sin** colisionar con `sistema-vectoria` ni con otros proyectos que se aprovisionen en paralelo.

La auditoría INTEGRA-SELF 2026-08-21 detectó **18 hardcodes** (`archivo:línea` actual) que bloquean el carácter reusable:

| Categoría | Hardcodes | Bloquea reusabilidad multi-proyecto |
|---|---|---|
| Identidad de proyecto | `slug`, `repository`, `branch` propagados desde manifest (sin hardcode) ✓ | NO |
| UUIDs / recursos | `DEFAULT_SERVER_UUID` (H1) en `src/constants.ts:11` | SÍ — cualquier proyecto que no viva en ese server falla |
| DNS | `DNS_EXPECTED_IP` (H2) + `DNS_WILDCARD_DOMAIN` (H3) hardcoded | SÍ — apps en otros dominios/IPs no funcionan |
| Branding/org | `directorEmail.default("contacto@vector-ia.mx")` (H4) + `orgName.default("Vector IA")` (H5) | SÍ — apps que no son de Vectoria muestran branding incorrecto |
| Schema | `m.fqdn !== ${m.slug}.vector-ia.mx` (H6) literal `.vector-ia.mx` | SÍ — cualquier FQDN fuera de `*.vector-ia.mx` falla coherencia |
| Rutas | `~/.config/kilo/vectoria-provision/{registry,audit,profile}` (H7) hardcoded | SÍ — un segundo proyecto en otra organización choca con el primero |
| Git host | `DEFAULT_GIT_HOST = "github.com"` (H8) | menor (overridable por manifest futuro `git.host`) |
| HKDF | `SECRET_INFO_PREFIX = "vectoria/..."` (H9) | SÍ — secretos HKDF colisionan entre proyectos con misma raíz |
| Secret-source | `SECRET_SOURCE_KEYS` (H10) + `allKeysNeeded` (H11) hardcoded para `S3_*` + `VECTORIA_SUPERUSER_PASSWORD` | SÍ — apps sin S3 (p.ej. sin storage) reciben keys fantasma; apps con otras keys no son soportadas |
| Healthcheck/startCommand | `ensure_application` POST sin `health_check_*` ni `start_command` declarativos (H12) | SÍ — requiere PATCH LIVE por proyecto, no reusable |
| Locks | `registry.jsonl.locks/<slug>.lock` flat (H13) | SÍ — dos proyectos con mismo slug colisionan en lock |
| Adopción | `findBinding` sin scope de proyecto (H14) | SÍ — un proyecto puede adoptar recursos de otro |
| Launcher | `bin/run-provision.sh:33` lee `~/.config/kilo/integra.secrets.env` global (H15) | menor (overridable por `VECTORIA_PROVISION_SECRETS_FILE`) |
| Launcher | `bin/run-provision.sh:35` `CHILD` con path absoluto (H16) | menor (overridable por `VECTORIA_PROVISION_CHILD`) |
| Secretos legacy | `SecretName = "master-key" \| "session-secret" \| "bootstrap"` con `bootstrap` deprecated (H17) | menor (cleanup) |
| Redacción | `SENSITIVE_FIELD_NAMES` enum cerrado (H18) | menor (extensibilidad) |

El coste de **no** abordar el carácter reusable es:

1. **Acoplamiento por proyecto**: cada nuevo proyecto requiere una mini-SPEC de "cómo adaptar el runner a este caso" — patrón que escala mal (N proyectos = N workarounds).
2. **Riesgo operativo**: deploys en paralelo (LIVE staging de `sistema-vectoria` + nuevo proyecto) pueden colisionar en locks, registry, audit y secretos.
3. **Pérdida de zero-touch**: `aprovisionamiento.zero_touch` exige que Frank declare intención y el sistema gestione UUIDs/secretos/recursos sin preguntas adicionales — los hardcodes rompen esta propiedad para cualquier proyecto que no sea `sistema-vectoria`.
4. **Imposibilidad de auditar**: el audit `audit.jsonl` actual es plano (sin namespace) — no permite distinguir "este `ensure_application` fue para proyecto X vs Y" si los slugs coinciden.

## 2. Decisión

Adoptar el modelo **global-profile + project manifest + namespacing** definido en `SPEC-20260821-001 §3-§13`. Los principios:

1. **Perfil global único** (`~/.config/kilo/vectoria-provision/global-profile.json`, mode 600) como capa 1; contiene **defaults operativos** (paths, serverUuid, dnsWildcardDomain, dnsExpectedIp, gitHost, hkdfInfoPrefix) y un **organizations** map (cada org con `defaultDirectorEmail` + `defaultOrgName`). **NO contiene secretos de proyecto** (AC-R-18 verificado por grep).
2. **Overrides por proyecto**:
   - **Manifest v2** (capa 4, máxima prioridad) declara `project.{id,parent,namespace,displayName}`, `application.{healthcheck,startCommand,secretSource}`, `dns.{zone,expectedIp}`, `git.host`.
   - **Per-project secret-source file** (`~/.config/kilo/vectoria-provision/secrets/<parent>/<id>.env`, mode 600) — claves sensibles del proyecto, leídas selectivamente.
   - **Env vars `VECTORIA_PROVISION_*`** (capa 3) — overrides operacionales del launcher/dev.
3. **Precedencia explícita** (§3.1 de SPEC-20260821-001): de menor a mayor → hardcoded < global-profile < per-project file < env vars < manifest. Cada nivel sustituye sólo los campos que **explícitamente** declara; los ausentes caen al nivel inferior.
4. **Namespacing por `project.parent` + `project.id`**: registry, audit y locks se almacenan en subdirectorios distintos por proyecto. `sistema-vectoria` queda en `vectoria/frank-vcorp-sistema-vectoria/` (compat retroactiva vía `attrs.projectNamespace` ausente). Un segundo proyecto `acme-corp/blog` queda en `acme-corp/blog/`. Sin colisiones ni en locks ni en archivos.
5. **HKDF namespacing**: info = `${hkdfInfoPrefix}/${project.parent}/${project.id}/${secretName}/v${version}`. El mismo `SECRET_DERIVATION_ROOT` produce secretos distintos por proyecto, manteniendo reversibilidad AC-8 (mismo `(parent, id, name, version)` → mismo secreto).
6. **Adopción con scope**: `findBinding` y `isCompatibleBinding` filtran por `project.namespace` (manifest entrante ≡ binding existente). `infra_blocked(reason: cross_project_adoption)` si un manifest entrante intenta adoptar un recurso de otro namespace.
7. **DNS y healthcheck/startCommand declarativos**: vienen del manifest, se propagan al primer `POST /applications/...` (no requieren PATCH LIVE). Coolify v4 acepta `health_check_*` + `start_command` en el POST de creación (verificado en docs oficiales Coolify v4; SPEC-GAP-20260821-06 §6 lo confirma para el caso LIVE).
8. **Secret-source declarativo**: `manifest.application.secretSource` lista las keys que el proyecto requiere (default `[]`); legacy v1.7 sigue funcionando si el campo está ausente y el archivo trae `S3_*` + `VECTORIA_SUPERUSER_PASSWORD`.
9. **Baseline vs adapter separados**: el runner es **adapter-agnóstico**; cada app (sistema-vectoria, futuro acme-corp, etc.) tiene su **adapter** en su propio repo, fuera del repo de infra. `sistema-vectoria` no es plantilla — es el primer adopter.

## 3. Alternativas consideradas

### A. **No hacer nada** (status quo v1.7 + mini-SPEC por proyecto)

- **Pro:** cero riesgo; runner cerrado.
- **Contra:** cada nuevo proyecto = mini-SPEC de adaptación. Rompe `aprovisionamiento.zero_touch` para N>1. No escala.
- **Rechazada.**

### B. **Refactor mínimo: parametrizar sólo UUIDs y DNS** (H1, H2, H3 + H6)

- **Pro:** cambio pequeño, riesgo acotado.
- **Contra:** no resuelve namespacing (H13, H14), HKDF colisión (H9), secret-source hardcoded (H10, H11), healthcheck (H12). Proyectos siguen colisionando en registry/locks/audit.
- **Rechazada** (resolvería 5 de 18 hallazgos; quedarían 13 sin cerrar).

### C. **Runner nuevo multi-tenant, abandonar v1.7**

- **Pro:** diseño limpio desde cero.
- **Contra:** duplica infraestructura; runner v1.7 cerrado/auditado se abandona; SPEC-GAP-06 LIVE en curso se rompe; coste 5–10× mayor que delta sobre v1.7.
- **Rechazada** (corrección `aprovisionamiento.zero_touch` exige evoluciones incrementales, no reescrituras).

### D. **Adapter por proyecto dentro del runner** (un adapter cargado en runtime)

- **Pro:** runner "sabe" sobre cada app.
- **Contra:** runner se vuelve opinionated (cada adapter es código committed en infra repo); `sistema-vectoria` se convierte en template implícito; contradice §11 separación baseline/adapter.
- **Rechazada.**

### **E. Adoptada:** Perfil global + manifest v2 + namespacing + adapter externo

- **Pro:**
  - Cierra los 18 hallazgos (8 refactors + 10 default+override).
  - Compat retroactiva con manifest v1 + bindings existentes (AC-R-1, AC-R-8, §14 SPEC).
  - Sistema-vectoria **sigue funcionando** sin tocar el manifest (B6/B7 LIVE no dependen del refactor).
  - Separación baseline/adapter explícita y testeable (AC-R-15).
  - Cumple todas las correcciones: `aprovisionamiento.zero_touch` (un runner, N proyectos), `infraestructura.intervencion_humana` (un solo perfil global + archivos per-project), `provision.runner_one_shot` (mismo runner, no broker), `secretos.tecnicos_generacion` (HKDF por proyecto), `coolify.runtime_secrets_external` (secretos en archivo per-project), `coolify_write.capacidad_temporal` (compatible con runtime allowlist vigente).
- **Contra:**
  - Blast radius del refactor: 10 archivos en `src/` + `bin/run-provision.sh` + 10+ nuevas fixtures; requiere QA + GEMINI obligatorio.
  - Merge a `main` debe esperar al cierre del LIVE staging (RR-2 §15 SPEC-20260821-001).

## 4. Modelo final

### 4.1 Precedencia

```
hardcoded defaults (last-resort, WARN si activos)
       ↓ override
global-profile.json (defaults + organizations[].{directorEmail, orgName})
       ↓ override
per-project secret-source file (claves secret-source del proyecto)
       ↓ override
env vars VECTORIA_PROVISION_* (paths, child, secrets file)
       ↓ override
manifest v2 (project.*, application.*, dns.*, git.*, serverUuid)
```

Cada nivel es opt-in (sólo sobreescribe lo que declara). Lo ausente cae al nivel inferior.

### 4.2 Namespacing

```
${registryBaseDir}/${project.parent}/${project.id}/registry.jsonl
${registryBaseDir}/${project.parent}/${project.id}/registry.jsonl.locks/${slug}.lock
${auditBaseDir}/${project.parent}/${project.id}/audit.jsonl
${secretSourceBaseDir}/${project.parent}/${project.id}.env
```

- `project.parent` ∈ `[a-z0-9-]{1,63}` (regex bloquea `..`, `/`, control).
- `project.id` ∈ `[a-z0-9-]{1,63}`.
- Defaults (overridable por env):
  - `registryBaseDir = ~/.config/kilo/vectoria-provision/registry`
  - `auditBaseDir = ~/.config/kilo/vectoria-provision/audit`
  - `secretSourceBaseDir = ~/.config/kilo/vectoria-provision/secrets`

### 4.3 Compatibilidad retroactiva

- **Manifest v1** sigue siendo válido (transform interno a v2 con defaults). `MANIFEST-STAGING-20260821-01-sistema-vectoria.json` no se toca.
- **Bindings existentes sin `attrs.projectNamespace`** se tratan como namespace default `vectoria:<taskId>` (compat AC-R-8).
- **Audit existente** sin `projectParent`/`projectId` se preserva verbatim; las nuevas entradas los añaden.
- **`bin/run-provision.sh` v1.7** sigue funcionando con defaults actualizados; los nuevos env vars son opt-in.

### 4.4 Lo que NO cambia

- El **enum baseline cerrado del runner** (5 keys, 5 modos) preservado del runner v1: `APP_ENV | APP_URL | DATABASE_URL | VECTORIA_DIRECTOR_EMAIL | VECTORIA_ORG_NAME` con modos `derived | profile | hkdf | dbBinding | secret-source`. v2.0 redefine el origen de las keys, no su identidad en el enum baseline. Las **12 runtime app keys** del §8.3 v1.7 (`APP_BASE_URL`, `NODE_ENV`, `DATABASE_URL`, `MASTER_KEY`, `SESSION_SECRET`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `VECTORIA_DIRECTOR_EMAIL`, `VECTORIA_ORG_NAME`, `VECTORIA_SUPERUSER_PASSWORD`) son **delegadas al application adapter** (§11 SPEC-20260821-001) y no se materializan en el enum baseline del runner. La ampliación del enum baseline a las 12 keys queda explícitamente para **IMPL-13+ dedicado** (decisión ratificada en SPEC-GAP-20260821-07-cierre r1 §2 W1 — Opción A).
- Las **6 operaciones `ensure_*`** y su semántica.
- El **threat model** del ADR-20260820-03 §2: agentes bajo mismo UID = confiables; controles contra error/drift, no contra proceso hostil del mismo UID.
- El **launcher de mínimo privilegio** §6 ADR-20260820-03: secrets file `600` + `env -i` + `exec`, sin imprimir valores.

## 5. Consecuencias

- **Reversibilidad:** el refactor se entrega como v1.7.1 → v1.8 (nueva release). Si algo falla, `git revert` del merge a `main` recupera v1.7. Las fixtures nuevas son incrementales, no modifican las 162 existentes.
- **Coste:** blast radius acotado (~600–800 líneas netas entre refactor + tests nuevos; comparable a IMPL-13 v1.7). 1 sesión SOFIA, worktree separado (§17 SPEC), GEMINI obligatorio, Frank autoriza merge.
- **Riesgo operacional:** si Frank autoriza merge antes del cierre LIVE staging, podría romper el ciclo en curso. Mitigación: worktree separado + merge post-LIVE (§17 SPEC + RR-2).
- **Riesgo de diseño:** HKDF namespacing es destructivo para clientes existentes si no hay compat retroactiva — mitigado por `attrs.projectNamespace` ausente ≡ default namespace.
- **Beneficio estructural:** un segundo proyecto se aprovisiona con `manifest` + `bin/run-provision.sh` + `global-profile.json`, sin tocar código del runner. Tercer proyecto = misma operación.

## 6. Límites (matriz de autorización)

| Acción | Ejecutor | Gate |
|---|---|---|
| Crear/editar `global-profile.json` | Frank | Autorización inicial (corrección `infraestructura.intervencion_humana`) |
| Crear/editar `per-project secret-source` | Frank | Por proyecto; fuera del repo |
| Crear manifest v2 por proyecto | INTEGRA (per-project) | Por tarea (`taskId`) |
| Implementar refactor v2.0 | SOFIA | SPEC-HANDOFF-20260821-10 + GEMINI QA + Frank-merge |
| Override del refactor (rollback) | Frank | `git revert` del merge a `main` |
| Producción / delete / billing / migrate | — | No existen (BR-N417); fuera del runner |

## 7. Referencias

- SPEC-20260821-001 (este delta, norma operacional).
- SPEC-GAP-20260821-07 (delta técnico: qué es reusable hoy vs requiere impl).
- SPEC-HANDOFF-20260821-10 (endurecimiento reusable SOFIA).
- SPEC-20260820-003 v1.7 (runner base, vigente).
- ADR-20260820-03 (decisión one-shot runner, vigente; este ADR es delta).
- SPEC-GAP-20260821-06-staging-live-gates (ciclo LIVE en curso, **no** depende de v2.0).
- Correcciones vigentes: `coolify.runtime_secrets_external`, `aprovisionamiento.zero_touch`, `aprovisionamiento.operaciones_separadas`, `secretos.tecnicos_generacion`, `infraestructura.intervencion_humana`, `provision.runner_one_shot`, `spec_infra.flujo_revision`, `coolify_write.capacidad_temporal`, `coolify_readonly.dedicated_launcher`.
- DEC-FUN-20260820-76/-77 · BR-N414..N417 · FND-20260820-06/-07 · SOL-20260820-18.