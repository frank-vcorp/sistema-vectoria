---
ID: QA-20260821-REUSABLE-r1
Tipo: auditoría obligatoria (re-auditoría post-L1 fix, §15 IDL)
Auditor: GEMINI
Worktree: /home/frank/repos/baseline-reusable-v2 (branch feature/baseline-reusable-v2, sin commits)
SPEC auditada: SPEC-20260821-001 v1.0 (baseline reusable multi-proyecto)
ADR auditado: ADR-20260821-01 v1.0 (precedencia + namespacing)
SPEC-GAP referencia: SPEC-GAP-20260821-07-baseline-reusable-delta
QA origen: QA-20260821-REUSABLE (FAIL → L1 fix aplicado)
Reporte SOFIA origen: IMPL-REPORT-20260821-REUSABLE-r1.md
  (entregado en /home/frank/repos/sistema-vectoria/context/interconsultas/IMPL-REPORT-20260821-REUSABLE-r1.md,
   no en el worktree — el IDL no exige ubicación, sólo que esté localizado)
Alcance: reforzada (cierre de 2 P1 bloqueantes + 4 P3; verificación de 2 P2 abiertos)
Verdicto: PASS_WITH_WARNINGS
Bloqueantes: 0
Warnings P2 (no bloquean merge): F3 (EnvTemplateKeys 5 vs 12) + F4 (conteo 146 vs 185) — requieren SPEC-GAP-20260821-07-cierre por INTEGRA
Merge post-LIVE staging cierre: CONDICIONAL — listo para solicitar OK a Frank una vez cerrado el SPEC-GAP y con gating vigente del lote NOCTURNO-STAGING-20260821-03/04
---

# QA-20260821-REUSABLE-r1 — Re-auditoría del pase SOFIA r1

## TL;DR

Las 6 correcciones declaradas por SOFIA en `IMPL-REPORT-20260821-REUSABLE-r1.md` están **efectivamente aplicadas** en el código y validadas por tests reproducibles.

- **F1 [P1] cerrado**: `pnpm test` ahora corre **146/146 PASS** incluyendo los 4 E2E oficiales (verificado independientemente: V-D, V-D-E2E).
- **F2 [P1] cerrado**: los 3 E2E rediseñados pasan. La cadena `ensure_project` → `ensure_environment` → `operation` se ejecuta vía mock runner que pre-seedea los parents en el registry namespaced.
- **F5 [P3] cerrado**: launcher aborta con `src_bad_perms 644` cuando el per-project secret-source tiene permisos incorrectos (mutation test V-M1 ejecutado).
- **F6 [P3] cerrado**: `package.json` version `2.0.0`.
- **F7 [P3] cerrado**: `composeGitRepositoryUrl` implementado y aplicado al POST body en `src/ensure.ts:404`; 7 tests unit verdes; sin hardcodes literales en el body (la constante `github.com` vive sólo como capa 0 fallback documentada).
- **F8 [P3] cerrado**: `isNamespacedRegistryPath` eliminado (código muerto removido).

**2 desviaciones P2 persisten (F3 + F4)** — ambas **NO bloquean merge** pero requieren SPEC-GAP:

- F3 `EnvTemplateKeys` 5 vs 12: contradicción documental intra-SPEC (SPEC §4.1/línea 30/435/456 dice "12 keys"; SPEC línea 552 dice "v2.0 no añade keys al enum"; ADR §2.5 línea 146 mantiene "12 keys + 5 modos"). El código es **consistente con una de las lecturas** (línea 552 SPEC) al mantener las 5 keys originales. INTEGRA debe cerrar la ambigüedad vía SPEC-GAP.
- F4 conteo 146 vs 185: el baseline pre-existente era 82 (no 162 como dice SPEC §16 línea 550); 146 = 82 + 49 AC-R + 11 misc + 4 E2E. La cobertura real es buena; sólo la métrica numérica no coincide con el target del handoff.

**Veredicto: PASS_WITH_WARNINGS.** Listo para merge post-LIVE staging cierre, sujeto a:

1. Cierre de `SPEC-GAP-20260821-07` aclarando F3 (decisión explícita: ¿v2.0 mantiene 5 keys consistente con línea 552 SPEC, o se amplía a 12 contradiciendo línea 552?).
2. Actualización de SPEC §16 DoD para F4 (baseline real 82; nueva meta `≥146 PASS con E2E incluidos`).
3. Autorización vigente de Frank para lote `NOCTURNO-REUSABLE-20260821-01` y para merge post-LIVE staging cierre.

---

## 1. Delimitación y fuentes

### 1.1 Identificación inequívoca

- **Tarea:** IMPL-20260821-REUSABLE-r1 (worktree `feature/baseline-reusable-v2`)
- **SPEC activa:** SPEC-20260821-001 v1.0 (en `sistema-vectoria/context/SPECs/`, 591 líneas, INTEGRA 2026-08-21)
- **ADR activo:** ADR-20260821-01 v1.0 (en `sistema-vectoria/context/decisions/`, INTEGRA 2026-08-21)
- **QA origen:** QA-20260821-REUSABLE FAIL (2 P1 + 2 P2 + 4 P3 = 8 hallazgos)
- **Reporte SOFIA origen:** IMPL-REPORT-20260821-REUSABLE-r1.md (en `sistema-vectoria/context/interconsultas/`, 232 líneas, `READY_FOR_VERIFYING`)
- **Baseline previo:** rama `0e39b35` "feat: prepare staging deployment" (commit base — sin commits nuevos en el worktree)
- **Ciclo LIVE en curso:** NO TOCADO (NO MERGE, NO STAGING/PROD, NO COOLIFY)
- **Prohibiciones respetadas:** sin `commit`, sin `push`, sin `merge`, sin `deploy`, sin acceso Coolify real, sin secretos impresos, manifest v1 intacto.

### 1.2 Incremento auditado vs el pase anterior

```text
Worktree: /home/frank/repos/baseline-reusable-v2 (branch feature/baseline-reusable-v2)

Modificados (4 — delta del pase r1):
  M infrastructure/vectoria-provision/package.json           (F1 + F6)
  M infrastructure/vectoria-provision/bin/run-provision.sh   (F5)
  M infrastructure/vectoria-provision/src/ensure.ts          (F7)
  M infrastructure/vectoria-provision/src/registry.ts        (F8)
  M infrastructure/vectoria-provision/tests/e2e/__mocks__/runner.ts        (F2a — pre-chain parents)
  M infrastructure/vectoria-provision/tests/e2e/multi-project-disposable.test.ts  (F2a — paths namespaced via manifestProjectNamespace)
  M infrastructure/vectoria-provision/tests/e2e/conflict-disposable.test.ts       (F2b — assert.equal(found, undefined) + E2E invariante registries namespaced)

Untracked al inicio del pase r1, ya integrados (sin commits aún):
  ?? infrastructure/vectoria-provision/src/git-url.ts        (F7 NUEVO)
  ?? infrastructure/vectoria-provision/src/global-profile.ts (ya en pase anterior)
  ?? infrastructure/vectoria-provision/src/secrets-file.ts   (ya en pase anterior)
  ?? infrastructure/vectoria-provision/tests/git-url.test.ts (F7 — 7 tests NUEVO)
  ?? infrastructure/vectoria-provision/tests/{dns-zone-override,ensure-application-healthcheck,
       global-profile-fallback,hkdf-namespace,launcher-portability,precedence-director-email,
       redact-extensible,registry-namespace,schema-v2-compat,secret-source-v2}.test.ts
  ?? infrastructure/vectoria-provision/tests/e2e/{multi-project-disposable,conflict-disposable}.test.ts + __mocks__/
  ?? infrastructure/vectoria-provision/tests/fixtures/manifests/{manifest-sistema-vectoria,manifest-acme-blog}.json
  ?? context/infra/manifests/MANIFEST-STAGING-20260821-02-acme-corp.json  (sintético v2)
  ?? context/reviews/QA-20260821-REUSABLE.md                                (QA previo)
```

### 1.3 Entorno

- Node v20+, `pnpm` workspace, `vectoria-provision@2.0.0` (bump verificado en V-F6).
- `tsc 5.6.0`, `tsx 4.19.0`, `zod 3.23.8` pre-existentes (sin cambios lockfile).
- `~/.config/kilo/integra.secrets.env` pre-existente (no inspeccionado más allá de su existencia — sólo usado como `file exists` para validar el launcher en V-M1).

---

## 2. Validaciones independientes ejecutadas

### 2.1 Gates automáticos

| # | Comando | Resultado | Esperado | Veredicto |
|---|---|---|---|---|
| V-D | `pnpm test` oficial (`'tests/*.test.ts' 'tests/e2e/*.test.ts'`) | **146 pass / 146 total / 0 fail** | 146/146 PASS | **PASS** (cierra F1) |
| V-D-E2E | `node --test --import tsx 'tests/e2e/*.test.ts'` | **4 pass / 4 total / 0 fail** | 4/4 PASS | **PASS** (cierra F2) |
| V-TA | `pnpm run typecheck` | exit 0 | exit 0 | PASS |
| V-TB | `pnpm run build` | exit 0, `dist/` regenerado | exit 0, `dist/` regenerado | PASS |
| V-C1 | `grep -c "isNamespacedRegistryPath\|void namespaced" src/*.ts dist/src/*.js` | 0 | 0 | PASS (cierra F8) |
| V-C2 | `grep -c "github.com" src/ensure.ts` (sólo líneas de código, no comentarios) | 0 (sólo en comentarios líneas 393-394) | 0 literales en body | PASS (F7 sin hardcodes) |
| V-C3 | `ls src/git-url.ts tests/git-url.test.ts` | ambos existen (2003 + 1769 bytes) | existen | PASS (cierra F7) |
| V-C4 | `grep "VECTORIA_PROVISION_SECRET_SOURCE_FILE\|src_missing\|src_bad_perms" bin/run-provision.sh` | 4 matches (líneas 22, 30, 49, 196) | presentes | PASS (cierra F5) |
| V-C5 | `ManifestSchema.parse(MANIFEST-STAGING-20260821-02-acme-corp.json)` | OK: `v=2`, `project.namespace="acme-corp:blog"`, `git_repository` URL por composición (no verificación directa — ver V-M3) | parseable | PASS |
| V-C6 | `git status context/infra/manifests/MANIFEST-STAGING-20260821-01-sistema-vectoria.json` | nothing to commit, working tree clean | intacto | PASS (compat retroactiva) |

### 2.2 Mutation tests / pruebas dinámicas

| # | Test | Resultado | Esperado | Veredicto |
|---|---|---|---|---|
| V-M1 | Launcher ejecuta con `SECRET_SOURCE_FILE=mode644` (vía spawnSync bash) | exit 70, stderr `[vectoria-provision] launcher: src_bad_perms 644` | exit 70 + código `src_bad_perms` | **PASS** (F5 realmente aborta, no sólo texto) |
| V-M2 | `composeGitRepositoryUrl("frank-vcorp/sistema-vectoria")` (sin gitHost) | `https://github.com/frank-vcorp/sistema-vectoria` | capa 0 = `github.com` | PASS |
| V-M3 | `composeGitRepositoryUrl("acme-corp/blog", "gitea.acme-corp.example")` | `https://gitea.acme-corp.example/acme-corp/blog` | URL con host custom | PASS |
| V-M4 | `composeGitRepositoryUrl("https://gitea.acme-corp.example/x.git", "github.com")` | `https://gitea.acme-corp.example/x.git` | URL absoluta respetada verbatim | PASS |
| V-M5 | `ManifestSchema.parse(manifest-v1)` con `ManifestSchema.parse(manifest-v2-acme)` en serie | v1 → `v=2`, `project.namespace=undefined`, transforms aplicados; v2 → `project.namespace="acme-corp:blog"`, `healthcheck="/api/health"`, `secretSource.len=4` | ambos parsean OK | PASS (compat retroactiva AC-R-1 + AC-R-12/13/14) |
| V-M6 | Inspección de `src/ensure.ts:393-410`: ¿`git_repository` se compone con `composeGitRepositoryUrl` en el POST body? | Línea 404: `git_repository: composeGitRepositoryUrl(manifest.repository, gitHost)` — cascade `manifest.git?.host ?? globalProfile?.defaults?.gitHost` (capas 2 → 1 → 0 hardcoded) | aplicado al POST body | **PASS** (F7 wired correctamente) |

### 2.3 Inspección de código (read-only)

| Archivo | Línea(s) | Hallazgo QA |
|---|---|---|
| `package.json` | 15 | `"test": "node --test --import tsx 'tests/*.test.ts' 'tests/e2e/*.test.ts'"` — Incluye E2E. F1 cerrado. |
| `package.json` | 3 | `"version": "2.0.0"`. F6 cerrado. |
| `bin/run-provision.sh` | 47-49, 175-184 | Seam `VECTORIA_PROVISION_SECRET_SOURCE_FILE` + `validate_secret_file "$SECRET_SOURCE_FILE" "src"` con códigos `src_missing\|src_symlink\|src_bad_owner\|src_bad_perms`. Códigos propagados al `exec`. F5 cerrado. |
| `src/git-url.ts` | 35-44 | `composeGitRepositoryUrl(repository, gitHost?)` pure; detecta URL absoluta con `^https?://`; default `"github.com"` sólo cuando NO se provee host. F7 cerrado. |
| `src/ensure.ts` | 53, 393-410, 416-434 | `import { composeGitRepositoryUrl }`; body línea 404 usa la composición con cascade `manifest > globalProfile > hardcoded`. healthcheck + startCommand declarativos (AC-R-12/13/14). |
| `src/registry.ts` | (full file) | `isNamespacedRegistryPath` y `void namespaced` AUSENTES. F8 cerrado. `findBinding` con namespace filter (AC-R-8). `commitBinding` con `projectNamespace` por default `vectoria:<taskId>`. |
| `tests/e2e/multi-project-disposable.test.ts` | 41-104, 106-161 | AC-R-15 ejecuta sistema-vectoria + acme-blog en serie; verifica paths namespaced derivados de `manifestProjectNamespace`; verifica aislamiento: `acmeReg` NO contiene UUIDs de `sysReg`. AC-R-16 ejecuta 2 veces la misma operación; verifica `status="adopted"` y `postsAfterSecond===0`. **NO trivialmente verde**: si los paths no se namespaciaran, `assert.ok(existsSync(sysRegPath))` fallaría. |
| `tests/e2e/conflict-disposable.test.ts` | 26-64 (unit) | AC-R-17 unit: siembra binding con namespace `vectoria:system`, llama `findBinding(..., "acme-corp:system")`, asserta `=== undefined`. **Test correctamente diseñado** (asserción invertida respecto al bug original del pase 0). |
| `tests/e2e/conflict-disposable.test.ts` | 66-131 (E2E invariante) | AC-R-17 E2E: ejecuta `ensure_project` en namespace `acme-corp:blog` con slug único en un registry namespaced distinto. Test del invariante simétrico (registries separados → no colisión, incluso con slug único). |
| `tests/e2e/__mocks__/runner.ts` | 133-154 | `runProvision` con `preChainParents` (default `true`); encadena `ensure_project` → `ensure_environment` → `operation` dentro de `withSlugLock`. DNS mockeado a `ok:true` con `expectedIp` provisto (no depende de DNS real en CI). |
| `tests/e2e/__mocks__/coolify.ts` | (full file) | Mock HTTP con persistencia in-memory por path; cycles GET/reconcile → POST → 201. **Captura `git_repository`** del POST body en línea 118, lo almacena en la respuesta, lo refleja en line 124. |
| `tests/git-url.test.ts` | (7 tests) | Cubre default host, custom host, URL absoluta http/https, host vacío, repository vacío lanza error. F7 unit tests verdes. |
| `tests/launcher-portability.test.ts` | 54-72 (F5 group) | Verifica presencia textual de `VECTORIA_PROVISION_SECRET_SOURCE_FILE` + `validate_secret_file "$SECRET_SOURCE_FILE" "src"` + códigos `src_*` + propagación vía `env -i`. Caveat: estos tests son **inspección de texto**, no runtime. El runtime fue verificado por V-M1. |

---

## 3. Trazabilidad AC → implementación → evidencia → resultado

Resumen de los **23 AC** del SPEC §13 / ADR §2.5. Detalle por AC en matriz §3.1.

| AC | Título | Implementación | Test | Resultado |
|---|---|---|---|---|
| R-1 | schema v2 backward-compat | `src/schema.ts:325-328` (ManifestSchema union) + `v1ToV2Transform` | `tests/schema-v2-compat.test.ts` + V-M5 | PASS |
| R-2 | schema v2 strict (regex) | `src/schema.ts:81-89` (ProjectBlockSchema regex) | `schema-v2-compat.test.ts` + `ManifestV2StrictSchema` | PASS |
| R-3 | global-profile missing → WARN + defaults | `src/global-profile.ts:100-134` | `tests/global-profile-fallback.test.ts` | PASS |
| R-4 | global-profile override serverUuid | `src/destination.ts:48-50` | `global-profile-fallback.test.ts` | PASS |
| R-5 | dns.zone override coherencia slug-fqdn | `src/schema.ts:212-225` (superRefine) | `tests/dns-zone-override.test.ts` | PASS |
| R-6 | registry namespaced paths | `src/global-profile.ts` + `src/index.ts:206-210` | `tests/registry-namespace.test.ts` | PASS |
| R-7 | concurrencia entre proyectos | `src/registry.ts` (`acquireSlugLock`) | `registry-namespace.test.ts` (Promise.all) | PASS |
| R-8 | no cross-adoption | `src/destination.ts` (isCompatibleBinding con namespace) + `src/registry.ts` (findBinding) | `registry-namespace.test.ts` (unit) + **`tests/e2e/conflict-disposable.test.ts` AC-R-17 unit** (asserts `findBinding(...) === undefined` para namespaces distintos) | **PASS** |
| R-9 | secret-source per-project (declarativo) | `src/secrets-file.ts` + `src/ensure.ts` | `tests/secret-source-v2.test.ts` | PASS |
| R-10 | secret-source legacy compat | `src/ensure.ts` (v1.7 fallback con `legacySecretSourceKeys`) | `secret-source-v2.test.ts` | PASS |
| R-11 | HKDF namespace | `src/secrets.ts` (`deriveSecret` con `hkdfInfoPrefix` + `projectUuid`) | `tests/hkdf-namespace.test.ts` | PASS |
| R-12 | healthcheck en POST | `src/ensure.ts:427-439` | `tests/ensure-application-healthcheck.test.ts` | PASS |
| R-13 | start_command en POST | `src/ensure.ts:424-426` | `ensure-application-healthcheck.test.ts` | PASS |
| R-14 | healthcheck ausente → omitir | `src/ensure.ts:427` | `ensure-application-healthcheck.test.ts` | PASS |
| R-15 | E2E disposable multi-proyecto (2 slugs) | `__mocks__/runner.ts` (chain) + `multi-project-disposable.test.ts` | `tests/e2e/multi-project-disposable.test.ts:41-104` | **PASS** (cierra F2a) |
| R-16 | E2E idempotencia | `__mocks__/runner.ts` + idempotency assertion | `tests/e2e/multi-project-disposable.test.ts:106-161` | **PASS** (cierra F2a) |
| R-17 | E2E conflict (mismo slug, distinto parent) | `src/destination.ts:134-148` | `tests/e2e/conflict-disposable.test.ts:26-64` (unit namespace filter) + `:66-131` (E2E registries namespaced invariante) | **PASS** (cierra F2b) |
| R-18 | global-profile sin secretos | `src/global-profile.ts` (schema cerrado) | `global-profile-fallback.test.ts` + V-C1 de baseline | PASS |
| R-19 | precedencia directorEmail (4 capas) | `src/profile.ts:46-98` | `tests/precedence-director-email.test.ts` | PASS |
| R-20 | launcher portabilidad (CHILD + 3 env vars + per-project source) | `bin/run-provision.sh` + V-M1 | `tests/launcher-portability.test.ts` (textual) + V-M1 (runtime) | PASS |
| R-21 | bootstrap deprecated removal | `src/secrets.ts:38` (SecretName sin "bootstrap") | `tests/hkdf-namespace.test.ts` + `tests/secrets.test.ts` | PASS |
| R-22 | redact extensible | `src/redact.ts` (`redactWithProfile` + `extraKeys` case-insensitive) | `tests/redact-extensible.test.ts` | PASS |
| R-23 | DNS expectedIp override | `src/ensure.ts:280-287` (3-capas) | `tests/dns-zone-override.test.ts` | PASS |
| R-7+F7 | git URL composition (post-F7) | `src/git-url.ts` + `src/ensure.ts:404` | `tests/git-url.test.ts` (7 tests) + V-M2..M4 | PASS |

**Resumen AC:** 23/23 PASS (49 subtests con tag `AC-R-*` + 4 E2E oficiales adicionales).

---

## 4. Hallazgos QA-20260821-REUSABLE — Estado de cierre

### 4.1 Hallazgos cerrados (6/6)

| ID | Severidad original | Resumen | Evidencia de cierre |
|---|---|---|---|
| **F1** | P1 BLOCKING | `pnpm test` excluía E2E | `package.json:15` ahora `'tests/*.test.ts' 'tests/e2e/*.test.ts'`. V-D = 146/146 PASS oficial. |
| **F2** | P1 BLOCKING | 3 E2E mal diseñados | (a) `__mocks__/runner.ts` encadena `ensure_project` → `ensure_environment` → `operation`. (b) `multi-project-disposable.test.ts` deriva paths del `manifestProjectNamespace`. (c) `conflict-disposable.test.ts` unit asserta `findBinding === undefined` para namespaces distintos + E2E invariante registries namespaced. V-D-E2E = 4/4 PASS. |
| **F5** | P3 | Launcher no validaba per-project source | `bin/run-provision.sh:175-184` aplica `validate_secret_file`. V-M1 runtime: mode 644 → exit 70 + `src_bad_perms`. |
| **F6** | P3 | version 1.0.0 | `package.json:3` = `"2.0.0"`. |
| **F7** | P3 | `composeGitRepositoryUrl` missing | `src/git-url.ts` (49 líneas) implementado + `src/ensure.ts:404` lo aplica. V-M2..M4 verdes. 7 tests en `tests/git-url.test.ts`. Sin hardcodes literales en el body — la única referencia a `github.com` como string vivo es `DEFAULT_GIT_HOST` (capa 0 documentada) y como Zod default en `schema.ts:111` (también capa 0). |
| **F8** | P3 | `isNamespacedRegistryPath` muerta | V-C1 = 0 matches en `src/*.ts` y `dist/src/*.js`. Eliminada. |

### 4.2 Hallazgos abiertos (2/2 — no bloquean merge)

#### W1 [P2] — F3 EnvTemplateKeys: 5 (código) vs 12 (SPEC)

**Evidencia:**

- **SPEC-20260821-001:**
  - Línea 30: "que mapea su contrato a las **12 keys** del enum §8.3 v1.7"
  - Línea 435: "módulo por app que mapea el contrato de env vars… a las **12 keys**"
  - Línea 441: "el runner es adapter-agnóstico: cualquier app que mapea a las **12 keys** funciona"
  - Línea 456: "el adapter componer las **12 keys** del enum v1.7"
  - Línea 552: "Las 12 keys + 5 modos siguen vigentes. **v2.0 no añade keys al enum**; redefine el origen (`secret-source` per-project) y el namespace HKDF"
  - **CONTRADICCIÓN INTRA-SPEC**: lineas 30/435/441/456 ⇒ 12 keys; línea 552 ⇒ "no añade keys"
- **ADR-20260821-01:** línea 146 mantiene "enum cerrado §8.3 v1.7 (12 keys, 5 modos)".
- **Código** (`src/schema.ts:371-377`): define **5 keys** (`APP_ENV`, `APP_URL`, `DATABASE_URL`, `VECTORIA_DIRECTOR_EMAIL`, `VECTORIA_ORG_NAME`).
- **Docstring del código** (`src/schema.ts:378-381`): "la expansión v2.0 a 12 keys (S3_*, MASTER_KEY, SESSION_SECRET, VECTORIA_SUPERUSER_PASSWORD, APP_BASE_URL, NODE_ENV) queda para IMPL-13+ dedicado. El presente refactor NO toca este enum cerrado (handoff §4.1: 'sin cambios')".

**Análisis:**

El código **es consistente con la línea 552 del SPEC** ("v2.0 no añade keys al enum"), pero **contradice las líneas 30/435/441/456** y el ADR. La contradicción es estructural — el SPEC no resolvió si v2.0 mantiene o amplía el enum cerrado.

**Forward-compat precaution** (ya preparada): `src/ensure.ts:672-673` usa `as EnvTemplateKey` casts para MASTER_KEY y SESSION_SECRET. La validación runtime existe sólo en el loop `envOverrides` (`src/ensure.ts:756` via `EnvTemplateKeys.includes(k)`); los HKDF / secret-source rows NO pasan por esa validación. Riesgo residual: si se añade una key nueva al enum sin actualizar el cast, falla en runtime con `ZodError` no controlado.

**Clasificación:** **WARN (no bloqueante).** La implementación es defendible bajo una lectura del SPEC (línea 552). El refactor NO amplió el enum (conservador); la ampliación queda para IMPL-13+. Riesgo bajo.

**Acción recomendada (INTEGRA):**

- Emitir SPEC-GAP-20260821-07-cierre (o versión `r1`) que resuelva la contradicción:
  - **Opción A (preferida)**: ratificar la línea 552 como decisión ("v2.0 mantiene 5 keys; IMPL-13+ amplía a 12"). Actualizar líneas 30/435/441/456/ADR 146 a "5 keys (v2.0) / 12 keys (v1.7, sin uso)". Cerrar F3.
  - **Opción B**: ampliar el enum a 12 keys en este pase con `IMPL-13+` dedicado. Riesgo: introduce cambios fuera del scope del pase reusable (afecta `envOverrides` Zod parsing y `ensure.ts` casts). NO recomendado.

#### W2 [P2] — F4 Conteo 146 vs 185

**Evidencia:**

- **SPEC §16 DoD** (línea 591): "`pnpm test` ≥ 162 + 23 nuevos = ≥ 185/185 PASS"
- **SPEC §16 DoD** (línea 550): "`tests/*.test.ts` (162/162 PASS) | No se reabre"
- **Realidad medida (baseline `0e39b35`)**: 82 subtests en v1.7 (no 162 como afirma SPEC). `git show 0e39b35 -- infrastructure/vectoria-provision/tests/` = 10 archivos, `pnpm test` baseline = 82.
- **Pase r1**: 82 + 49 AC-R-* + 11 misc + 4 E2E = **146 subtests oficiales**, PASS 146/146.
- La cifra "162" del SPEC no corresponde con ningún baseline medible; parece un estimado del handoff o un error de arrastre.

**Análisis:** La métrica numérica es engañosa por doble motivo:

1. El SPEC dice 162 baseline; el baseline real es 82.
2. La meta 185 era inalcanzable ya antes del pase (82 + 23 nuevos = 105, no 185).

La cobertura real del pase es **excelente** (146/146 PASS oficial, incluye los 4 E2E). La desviación es documental, no funcional.

**Clasificación:** **WARN (no bloqueante).** La implementación provee cobertura completa y reproducible de los 23 AC. Sólo el número expuesto por SPEC/ADR no coincide con la realidad.

**Acción recomendada (INTEGRA):**

- Actualizar SPEC §16 DoD: "baseline real = 82 subtests; meta v2.0 = ≥ 146/146 PASS incluyendo 4 E2E oficiales". O emitir ADR menor reconociendo la reducción de meta. Cerrar F4.

### 4.3 No bloqueantes adicionales (re-auditoría encuentra 1 nuevo)

#### W3 [P3] — `pnpm test` regresión silenciosa (observación, no bloqueante)

**Evidencia:**

- El paquete oficial ahora usa `pnpm test` con 2 globs (`'tests/*.test.ts' 'tests/e2e/*.test.ts'`).
- **No existe un test meta** que verifique que el script `test` incluya los E2E (un cambio futuro podría revertir a 1 solo glob sin disparar fallo de CI).
- Caveat: la inspección textual de `package.json` se hace manualmente; no hay `test/lint:test-script.test.ts`.

**Riesgo:** regresión silenciosa (alguien borra el segundo glob y los E2E vuelven a no ejecutarse). Probabilidad: baja (los E2E son visibles en el output, desaparecería el reporte de 4 E2E PASS; QA detectaría).

**Owner recomendado:** SOFIA L1 (1 línea en `tests/lint.test.ts`). NO bloqueante.

---

## 5. Compatibilidad retroactiva (re-verificada)

### 5.1 Manifest v1 vigente

- `MANIFEST-STAGING-20260821-01-sistema-vectoria.json` (v1) **INTACTO** (`git status` lo confirma: working tree clean para el archivo específico).
- `ManifestSchema.parse(manifest-v1)` retorna OK con `v=2` post-transform (`v-M5`), `project.namespace=undefined` (legacy compat AC-R-8).

### 5.2 Manifest v2 sintético

- `MANIFEST-STAGING-20260821-02-acme-corp.json` (v2) parsea OK con `project.namespace="acme-corp:blog"`, `git.host="github.com"` (literal en manifest — no en código), `application.healthcheck.path="/api/health"`, `application.startCommand="pnpm start"`, `application.secretSource=4 keys` (S3_*).

### 5.3 Bindings v1.7 legacy

- `attrs.projectNamespace === undefined` → tratado como namespace default `vectoria:<taskId>` (ver `src/destination.ts:136-143` + `src/registry.ts:78-84`). AC-R-8 PASS.
- `findBinding` con `projectNamespace` arg filtra correctamente (ver `tests/registry-namespace.test.ts`).

### 5.4 audit.jsonl schema

- Aditivo: `projectParent?`, `projectId?` (ver `src/schema.ts:415-431`). Las líneas antiguas (sin estos campos) preservan compat (parsean vía Zod safeParse sin error).

---

## 6. Verificaciones de los 7 puntos del handoff ATLAS

| # | Punto | Verificación | Resultado |
|---|---|---|---|
| 1 | `pnpm test` oficial incluye E2E y queda 146/146 PASS | V-D | **PASS**: `pnpm test` → `tests 146 / pass 146 / fail 0`. El script (línea 15) incluye `'tests/e2e/*.test.ts'`. |
| 2 | multi-project chain y cross-project conflict realmente prueban scope | Inspección §3.1 AC-R-15/16/17 + V-D-E2E | **PASS** (no trivialmente verdes): `multi-project-disposable` valida (a) ambos `ok`, (b) ambos registries namespaced existen en paths distintos, (c) audit paths existen, (d) **UUIDs de sistema NO aparecen en registry de acme** (esto es el aislamiento). `conflict-disposable` unit siembra binding con namespace `vectoria:system` y asserta `findBinding(..., "acme-corp:system") === undefined` — sería FAIL si la implementación no filtrara por namespace. |
| 3 | launcher per-project secret-source y no fugas | V-M1 + inspección §4.1 F5 | **PASS**: V-M1 confirma que `validate_secret_file` aborta con exit 70 + `src_bad_perms 644` cuando el per-project secret-source tiene permisos incorrectos. El launcher propaga `VECTORIA_PROVISION_SECRET_SOURCE_FILE` al `child` vía `exec env -i` (línea 196) sin imprimir el contenido. El `unset` de las claves globales del host (líneas 145-151) previene fugas de MINIMAX_API_KEY, GOOGLE_AI_STUDIO_API_KEY, GITHUB_TOKEN_*, etc. |
| 4 | git host URL se aplica al payload sin hardcodes | V-M2..M4 + V-M6 | **PASS**: `src/ensure.ts:404` aplica `composeGitRepositoryUrl(manifest.repository, gitHost)` con cascade `manifest.git.host → globalProfile.defaults.gitHost → "github.com"` (capa 0). La cadena `"github.com"` aparece como string vivo sólo en (a) `src/git-url.ts:20` `DEFAULT_GIT_HOST` (constante de capa 0 documentada) y (b) `src/schema.ts:111` Zod default. **Cero literales en el POST body.** Tests verdes para URL absoluta http/https respetada verbatim, host custom, host vacío → default, repository vacío lanza error. |
| 5 | staging manifest v1 intacto y acme v2 parseable | V-C5 + V-C6 + V-M5 | **PASS**: `git status MANIFEST-STAGING-20260821-01-sistema-vectoria.json` → `nothing to commit, working tree clean`. `ManifestSchema.parse(manifest-acme-corp.json)` → `v=2`, `project.namespace="acme-corp:blog"`, healthcheck/startCommand/secretSource presentes. |
| 6 | F3 EnvTemplateKeys 5 vs 12 + F4 conteo 146 vs 185: bloquean merge o requieren SPEC-GAP | §4.2 W1 + W2 | **NO BLOQUEAN MERGE.** Ambos son desviaciones documentales. W1 (5 vs 12 keys): el código es consistente con **una** lectura del SPEC (línea 552 "v2.0 no añade keys"). W2 (146 vs 185): la cobertura real es completa (146/146 oficial incluye 4 E2E). Ambos requieren SPEC-GAP-20260821-07-cierre por INTEGRA (decisión explícita 5 keys vs ampliar; actualización §16 DoD). **Recomendación: cerrarlos ANTES del merge para evitar que viajeros futuros hereden la contradicción.** |
| 7 | no Coolify/live/secretos/merge | §1.1 prohibitions + §7 autoauditoría | **PASS**: todo el trabajo se ejecutó en worktree local sin commits (HEAD sigue en `0e39b35`). `pnpm test` corre 146 tests usando HTTP fetch stub del mock Coolify (`__mocks__/coolify.ts`) sin tocar la API real. V-M1 usó un spawnSync bash del launcher con archivos fake mode 600 (`WRITE_TOKEN=W` literal, no token real). No se imprimieron secretos, tokens ni PII. No se invocó MCP `coolify-readonly` (los procesos MCP pre-existentes del usuario no se tocaron). |

---

## 7. Riesgo operativo

| ID | Riesgo | Mitigación | Estado |
|---|---|---|---|
| RW-1 | E2E FAIL no detectado antes de merge | F1 cerrado: `pnpm test` incluye E2E | MITIGADO |
| RW-2 | E2E mal diseñados (AC-R-15/16/17) | F2 cerrado: chain runner + aserción invertida | MITIGADO |
| RW-3 | Per-project secret-source sin validación | F5 cerrado: launcher aborta en mode ≠ 600 | MITIGADO (validado por V-M1) |
| RW-4 | Git host override ignorado (F7) | F7 cerrado: `composeGitRepositoryUrl` aplicado al body | MITIGADO |
| RW-5 | Código muerto heurística namespaced | F8 cerrado: `isNamespacedRegistryPath` eliminada | MITIGADO |
| RW-6 | Contradicción 5 vs 12 keys | W1 abierto: SPEC-GAP-20260821-07-cierre | **ABIERTO (WARN)** |
| RW-7 | Conteo 146 vs 185 engañoso | W2 abierto: SPEC §16 DoD a actualizar | **ABIERTO (WARN)** |
| RW-8 | Regresión de `pnpm test` script | W3 abierto: no test meta | MENOR |
| RW-9 | Merge antes de cierre LIVE staging | gated-Frank post-LIVE | MITIGADO (gating vigente) |
| RW-10 | GEMINI §15 IDL cumplido | ESTE QA | EN CURSO |

---

## 8. Preparación por entorno

### 8.1 Calidad

- **LISTO.** 146/146 PASS oficial incluye 4 E2E. Typecheck + build verdes. 0 P0/P1 abiertos. 0 secretos impresos. Manifest v1 intacto. Compat retroactiva verificada.

### 8.2 Staging

- **NO EVALUADO.** El pase corre en worktree separado, sin merge a `main`. No se ha desplegado a staging. El runner mock usa HTTP fetch stub (`tests/e2e/__mocks__/coolify.ts`); no toca Coolify real.
- Para evaluar staging se requeriría:
  1. INTEGRA cierra W1 + W2 vía SPEC-GAP-20260821-07-cierre.
  2. Frank autoriza lote `NOCTURNO-REUSABLE-20260821-01` (asumida en IMPL pero no verificada — verificar con ATLAS).
  3. Merge a `main` post-LIVE staging cierre (gated-Frank).
  4. Crear `~/.config/kilo/vectoria-provision/global-profile.json` (Frank-only).
  5. Smoke E2E en staging contra Coolify real con `acme-corp:blog` (sintético).
- **Estado: NO_LISTO** hasta cerrar W1+W2 + obtener merge gated-Frank.

### 8.3 Producción

- **NO_LISTO.** El pase es baseline reusable multi-proyecto; los proyectos reales (`sistema-vectoria` + futuros) NO han sido migrados al nuevo namespace. Producción queda fuera del alcance del pase.
- El ciclo LIVE staging en curso (`NOCTURNO-STAGING-20260821-03/04`) **no debe** mergear el refactor reusable antes de su propio cierre.

---

## 9. Handoff a ATLAS

### 9.1 Veredicto

```text
QA-VERDICT: PASS_WITH_WARNINGS
Severidades:
  P0: 0
  P1: 0 (cerrados: F1, F2)
  P2: 2 WARNINGS abiertos (W1 EnvTemplateKeys 5 vs 12 + W2 conteo 146 vs 185)
  P3: 1 WARNING menor (W3 sin test meta para `pnpm test` script)

AC cubiertos: 23/23 PASS (49 subtests con tag AC-R-* + 4 E2E oficiales + 4 mock tests integración)
Secretos impresos: NO
Compat retroactiva verificada: SÍ (manifest v1 parsea OK, bindings v1.7 legacy reconocidos)
F1+F2+F5+F6+F7+F8 del pase anterior: CERRADOS (ver §4.1)
```

### 9.2 Acción recomendada (2 vías)

**Vía A (recomendada, merge cerrado):**

1. **Pivotar sesión independiente de INTEGRA** para emitir `SPEC-GAP-20260821-07-cierre r1` cerrando W1 + W2:
   - W1: ratificar línea 552 SPEC como decisión ("v2.0 mantiene 5 keys; IMPL-13+ ampliará"). Actualizar líneas 30/435/441/456 y ADR §2.5 para evitar contradicción interna.
   - W2: actualizar SPEC §16 DoD con el baseline real (82 subtests) y la meta v2.0 (≥146/146 oficial con E2E incluidos).
2. Una vez publicado el SPEC-GAP-cierre, ATLAS eleva a Frank para **merge post-LIVE staging cierre** del pase reusable.

**Vía B (alternativa, merge con WARNINGS documentados):**

1. INTEGRA documenta W1 + W2 como **deuda técnica registrada en PROYECTO.md** (sin SPEC-GAP formal), con IMPL-13+ dedicado para resolver.
2. Frank acepta merge con WARNINGS visibles. Riesgo: viajeros futuros pueden tomar decisiones inconsistentes con la contradicción 5/12 keys.

**Recomendación primaria: Vía A.** El SPEC-GAP-cierre toma ~30 min y elimina ambigüedad estructural.

### 9.3 Gate siguiente

- **Tras Vía A (SPEC-GAP-cierre):** QA-20260821-REUSABLE-r1 ya emitido (éste). INTEGRA propone `DONE (v2.0 reusable, pendiente-merge)` a ATLAS/CRONISTA; Frank autoriza merge post-LIVE staging cierre.
- **Tras Vía B (deuda técnica):** QA emite `PASS_WITH_WARNINGS` (este reporte); merge gated-Frank con WARNINGS en commit message.
- **Sin autorización:** el worktree puede ser descartado vía L3 (`git worktree remove ../baseline-reusable-v2 --force && git branch -D feature/baseline-reusable-v2`). Runner v1.7 intacto en `main`.

### 9.4 Recomendación exacta para merge post-LIVE

**`LISTO_PARA_SOLICITAR_OK_A_FRANK`** con las siguientes condiciones explícitas:

1. ✅ F1 + F2 + F5 + F6 + F7 + F8 cerrados (ver §4.1).
2. ⏳ INTEGRA cierra W1 + W2 vía Vía A **OR** documenta como deuda técnica.
3. ⏳ Frank autoriza lote `NOCTURNO-REUSABLE-20260821-01` explícitamente (verificar con ATLAS que está vigente).
4. ⏳ Frank autoriza merge post-LIVE staging cierre (`NOCTURNO-STAGING-20260821-03/04` en `DONE (staging-aprobado)`).
5. ⏳ CRONISTA aplica transición a `DONE (v2.0 reusable, pendiente-merge)` en `PROYECTO.md` (sólo tras merge efectivo).

---

## 10. Autoauditoría GEMINI

- ✅ Delimité el incremento exacto (4 modificados r1 + 13 untracked del pase anterior + 2 manifests + 1 QA previo).
- ✅ Verifiqué SPEC-20260821-001 v1.0 + ADR-20260821-01 v1.0 vigentes (en sistema-vectoria, referenciados desde el handoff).
- ✅ Revisé evidencia independiente (V-D oficial, V-D-E2E, V-M1..M6, V-C1..C6) — no sólo el reporte SOFIA.
- ✅ Re-ejecuté `pnpm test` (146/146 PASS oficial incluyendo E2E).
- ✅ Verifiqué per-project secret-source con mutation test runtime (V-M1, mode 644 → exit 70).
- ✅ Verifiqué git URL composition con mutation tests (V-M2..M4).
- ✅ No edité código, tests, config, `discovery/`, `SPEC/`, `PROYECTO.md` (sólo `context/reviews/QA-20260821-REUSABLE-r1.md`, permitido).
- ✅ No imprimí secretos ni PII (todos los grep con `-c`, los spawnSync usaron placeholders literales `R`/`W`/`AAAA...`, no tokens reales).
- ✅ Cada finding tiene evidencia (línea de código, comando, comando de mutation), impacto, owner recomendado, condición de cierre.
- ✅ Separé severidad QA (P0/P1/P2/P3) de niveles L1/L2/L3 (loop breakers IDL §10).
- ✅ Separé QA / staging / producción (§8).
- ✅ No invoqué subagentes ni declaré `DONE`; handoff vuelve a ATLAS con Vía A (recomendada) + Vía B (alternativa).
- ✅ Verifiqué que no hay procesos live (no vectoria-provision corriendo, no fetch real a Coolify).

---

**Estado:** `PASS_WITH_WARNINGS` — devuelto a ATLAS. 0 P0/P1 abiertos. 2 P2 (W1, W2) documentados como SPEC-GAPs; 1 P3 menor (W3). Merge post-LIVE staging cierre listo para solicitar OK a Frank tras Vía A (SPEC-GAP-cierre por INTEGRA) **o** Vía B (deuda técnica aceptada).
