---
ID: QA-20260821-REUSABLE
Tipo: auditoría obligatoria (cambio de contrato público + auth/secretos + infra, §15 IDL)
Auditor: GEMINI
Worktree: /home/frank/repos/baseline-reusable-v2 (branch feature/baseline-reusable-v2, sin commits)
SPEC auditada: SPEC-20260821-001 v1.0 (baseline reusable multi-proyecto)
ADR auditado: ADR-20260821-01 v1.0 (precedencia + namespacing)
SPEC-GAP delta: SPEC-GAP-20260821-07 (referencia)
Handoff origen: SPEC-HANDOFF-20260821-10 (baseline reusable SOFIA)
Reporte SOFIA: IMPL-20260821-REUSABLE.md (READY_FOR_VERIFYING)
Alcance: reforzada (cambio de contrato público: schema v2, ManifestSchema union, EnvTemplateKeys, SecretName; auth/secretos: HKDF namespacing, secret-source per-project, redact extensible; infra: registry/audit/locks namespaced, global-profile, launcher portability)
Verdicto: FAIL
Bloqueantes: 2 P1 (E2E tests rotos y no ejecutados por pnpm test)
Merge post-LIVE staging cierre: NO recomendado sin cerrar F1 + F2.
---

# QA-20260821-REUSABLE — Veredicto de auditoría

## TL;DR

El pase materializa correctamente la **mayoría** del diseño reusable: schema v1/v2 union, manifest sintético acme, global-profile con fallback, HKDF namespaced, registry/audit/locks namespaced, launcher portable, redact extensible, precedencia `directorEmail`. **Typecheck + build + 133/133 unit tests PASS.**

Sin embargo:

1. **El paquete oficial `pnpm test` excluye por glob los tests E2E** (`tests/e2e/*.test.ts`). Los 3 tests E2E (AC-R-15, AC-R-16, AC-R-17) **fallan** cuando se ejecutan manualmente: el runner mock invoca `ensure_application` sin pre-seed de `project`/`environment` (AC-R-15/16), y `conflict-disposable` tiene una aserción lógica invertida (AC-R-17).
2. El reporte IMPL reporta **133/133 PASS**, pero el conteo real es **133/136 (97.8%)** cuando se incluyen los E2E. La cifra es engañosa.
3. **2 desviaciones documentadas** (`EnvTemplateKeys` 5 vs 12; conteo 133 vs 185) son **aceptables** como deuda técnica, no bloquean por sí solas, pero deben quedar registradas para IMPL-13+.

**Veredicto: FAIL.** Merge post-LIVE **NO recomendado** sin cerrar los P1 (F1 + F2). El pase no debe aceptarse hasta que los E2E sean verdes o se documente formalmente su descarte.

---

## 1. Delimitación y fuentes

### 1.1 Identificación inequívoca

- **Tarea:** IMPL-20260821-REUSABLE (worktree `feature/baseline-reusable-v2`)
- **SPEC activa:** SPEC-20260821-001 v1.0 (632 líneas, INTEGRA 2026-08-21, estado `READY`)
- **ADR activo:** ADR-20260821-01 v1.0 (179 líneas, propuesto, INTEGRA 2026-08-21)
- **Handoff:** SPEC-HANDOFF-20260821-10 v1.0 (349 líneas, `READY_FOR_SOFIA`)
- **Reporte SOFIA:** IMPL-REPORT-20260821-REUSABLE.md (244 líneas, `READY_FOR_VERIFYING`)
- **Baseline previo:** rama `0e39b35` "feat: prepare staging deployment" (commit base del worktree)
- **Ciclo LIVE en curso:** NO TOCADO (NO MERGE, NO STAGING/PROD)
- **Prohibiciones respetadas:** sin `commit`, sin `push`, sin `merge`, sin `deploy`, sin acceso Coolify real, sin secretos impresos, sin modificación de `MANIFEST-STAGING-20260821-01-sistema-vectoria.json`.

### 1.2 Incremento auditado

Worktree: `/home/frank/repos/baseline-reusable-v2`

```
git status -s infrastructure/vectoria-provision/:
  modified:   infrastructure/vectoria-provision/bin/run-provision.sh
  modified:   infrastructure/vectoria-provision/src/{destination,ensure,index,profile,redact,registry,schema,secrets}.ts
  modified:   infrastructure/vectoria-provision/tests/{schema,secrets}.test.ts
  untracked:  infrastructure/vectoria-provision/src/global-profile.ts (NUEVO)
  untracked:  infrastructure/vectoria-provision/src/secrets-file.ts (NUEVO)
  untracked:  infrastructure/vectoria-provision/tests/{schema-v2-compat,global-profile-fallback,dns-zone-override,
              hkdf-namespace,secret-source-v2,precedence-director-email,redact-extensible,
              registry-namespace,ensure-application-healthcheck,launcher-portability}.test.ts
  untracked:  infrastructure/vectoria-provision/tests/e2e/{multi-project-disposable,conflict-disposable}.test.ts
  untracked:  infrastructure/vectoria-provision/tests/e2e/__mocks__/{coolify,runner}.ts
  untracked:  infrastructure/vectoria-provision/tests/fixtures/manifests/{manifest-sistema-vectoria,manifest-acme-blog}.json
  untracked:  context/infra/manifests/MANIFEST-STAGING-20260821-02-acme-corp.json
```

### 1.3 Entorno

- Node: v20+
- `pnpm` workspace; package `vectoria-provision@1.0.0` (versión sin bump — ver F6 P3).
- `tsc 5.6.0`, `tsx 4.19.0`, `zod 3.23.8` pre-existentes (sin cambios lockfile).
- `~/.config/kilo/integra.secrets.env` pre-existente (no inspeccionado en esta auditoría más allá de su existencia).

---

## 2. Validaciones independientes ejecutadas

### 2.1 Gates automáticos

| # | Comando | Resultado | Esperado | Veredicto |
|---|---|---|---|---|
| V-A | `pnpm -C infrastructure/vectoria-provision run typecheck` | exit 0 (tsc --noEmit -p tsconfig.test.json) | exit 0 | PASS |
| V-B | `pnpm -C infrastructure/vectoria-provision run build` | exit 0 (tsc, dist/ regenerado) | exit 0; dist regenerado | PASS |
| V-C | `pnpm test` (oficial: `node --test --import tsx tests/*.test.ts`) | **133/133 PASS** | ≥ 133/133 (IMPL §2.1) | PASS (engañoso — ver F1) |
| V-D | `node --test --import tsx 'tests/*.test.ts' 'tests/e2e/*.test.ts'` (ampliado) | **133 pass / 3 fail / 136 total** (97.8%) | los 23 AC PASS | **FAIL** |
| V-E | `grep -c "bootstrap\|placeholder\|<db-host>" infrastructure/vectoria-provision/src/*.ts infrastructure/vectoria-provision/dist/src/*.js` | 0/0 en src y dist | 0 | PASS (AC-R-21 + AC-N-3) |
| V-F | `grep -c "S3_\|VECTORIA_SUPERUSER_PASSWORD\|DATABASE_URL\|MASTER_KEY\|SESSION_SECRET" infrastructure/vectoria-provision/src/global-profile.ts` | 0 | 0 (AC-R-18) | PASS |
| V-G | `grep -c "sistema-vectoria\|Frank-vcorp\|vector-ia\.mx\|03tz1uabcrjaihnvrhysbstv\|212\.28\.185\.217" infrastructure/vectoria-provision/src/*.ts` | constants.ts:5, destination.ts:1, global-profile.ts:4, profile.ts:2, schema.ts:4 | Sólo defaults capa 0 | PASS (defaults preservados) |
| V-H | `ManifestSchema.parse(manifest-acme-corp.json)` (read-only) | OK: `v=2`, `project.namespace="acme-corp:blog"`, `application.healthcheck.path="/api/health"`, `application.startCommand="pnpm start"`, `application.secretSource=["S3_ENDPOINT","S3_BUCKET","S3_ACCESS_KEY","S3_SECRET_KEY"]` | OK | PASS |
| V-I | `ManifestSchema.parse(manifest-sistema-vectoria-v1.json)` (read-only) | OK: `v=2` (transform aplicado), `project.parent="vectoria"`, `project.id="IMPL-20260821-01"` | OK (AC-R-1) | PASS |
| V-J | `git status -s infrastructure/vectoria-provision/` | sólo archivos esperados refactoreados + nuevos (9M + 12 untracked) | sólo archivos esperados | PASS |

### 2.2 Inspección de código (read-only)

| Archivo | Línea(s) | Hallazgo |
|---|---|---|
| `bin/run-provision.sh` | 36-37, 164-168 | `CHILD` default relativo a `${BASH_SOURCE}` (portable). `validate_secret_file` aplicado al `global-profile` cuando existe. **NO valida per-project secret-source cuando se provee (F5 P3).** |
| `src/schema.ts` | 83, 296, 317, 448-500 | Hardcodes `vectoria` permitidos como defaults (capa 0) y como paths `~/.config/kilo/vectoria-provision/*` (legacy fallback). OK. |
| `src/global-profile.ts` | 100-134 | `loadGlobalProfile` con 4 paths de fallback (missing/malformed/unreadable/invalid → WARN + defaults). Cumple §3.1 + §5. |
| `src/profile.ts` | 46-98 | `loadOrganizationProfile(path, globalProfile?, projectParent?)` con 4 capas de precedencia. |
| `src/secrets.ts` | 38, 95 | `SecretName = "master-key" \| "session-secret"` (AC-R-21 PASS). `hkdfInfoPrefix` default `"vectoria"` (AC-R-11 + §7.2 SPEC). |
| `src/registry.ts` | 70-85, 98-112, 224-249 | `findBinding` con `projectNamespace` arg. `isNamespacedRegistryPath` heurística. `commitBinding` inyecta `attrs.projectNamespace = vectoria:<taskId>` por defecto. |
| `src/destination.ts` | 31-53, 89-149, 152-160 | `resolveServerUuid` 4 capas. `isCompatibleBinding` con `projectNamespace`. `manifestProjectNamespace` helper. |
| `src/ensure.ts` | 280-287, 407-439, 622-822 | `dns.expectedIp` 3-capas. `health_check_*` (7 campos) + `start_command` declarativos. HKDF gated por `globalProfile !== undefined`. Secret-source per-project con fallback legacy. |
| `src/index.ts` | 56-99, 178-220, 248-262 | `parseArgs` con `--global-profile`. Carga global-profile + paths namespaced. Audit con `projectParent`/`projectId` aditivos. |
| `src/redact.ts` | 124-173 | `redactWithProfile(value, profile?, options?)` con `extraKeys` case-insensitive full-path. |

---

## 3. Trazabilidad AC → implementación → evidencia → resultado

Resumen de los **23 AC** del SPEC §13. Detalle por AC en matriz §3.1.

| AC | Título | Implementación | Test | Resultado |
|---|---|---|---|---|
| R-1 | schema v2 backward-compat | `src/schema.ts:325-328` (ManifestSchema union) + `v1ToV2Transform` | `tests/schema-v2-compat.test.ts:9-37` (4 subtests) | PASS |
| R-2 | schema v2 strict (regex) | `src/schema.ts:81-89` (ProjectBlockSchema regex) | `schema-v2-compat.test.ts:39-58` + `ManifestV2StrictSchema` | PASS |
| R-3 | global-profile missing → WARN + defaults | `src/global-profile.ts:100-134` | `tests/global-profile-fallback.test.ts` (3 subtests) | PASS |
| R-4 | global-profile override serverUuid | `src/global-profile.ts:38` + `src/destination.ts:48-50` | `global-profile-fallback.test.ts` (1) | PASS |
| R-5 | dns.zone override coherencia slug-fqdn | `src/schema.ts:212-225` (superRefine) | `tests/dns-zone-override.test.ts` (2) | PASS |
| R-6 | registry namespaced paths | `src/global-profile.ts:142-167` + `src/index.ts:206-210` | `tests/registry-namespace.test.ts:47-61` | PASS |
| R-7 | concurrencia entre proyectos | `src/registry.ts:126-188` (acquireSlugLock) + `isNamespacedRegistryPath` | `registry-namespace.test.ts:120-141` (Promise.all) | PASS |
| R-8 | no cross-adoption | `src/destination.ts:134-148` (isCompatibleBinding con namespace) + `src/registry.ts:78-84` (findBinding) | `registry-namespace.test.ts:85-118` (unit) **+ `e2e/conflict-disposable.test.ts` (e2e)** | **FAIL e2e** (ver F2) |
| R-9 | secret-source per-project (declarativo) | `src/secrets-file.ts:36-46` + `src/ensure.ts:684-751` | `tests/secret-source-v2.test.ts` (2) | PASS |
| R-10 | secret-source legacy compat | `src/ensure.ts:687-693` (isV2Mode && !declaredPresent → legacySecretSourceKeys) | `secret-source-v2.test.ts` (1) | PASS |
| R-11 | HKDF namespace | `src/secrets.ts:90-113` (`deriveSecret` con `hkdfInfoPrefix` + `projectUuid=<parent>:<id>`) | `tests/hkdf-namespace.test.ts` (3) | PASS |
| R-12 | healthcheck en POST | `src/ensure.ts:427-439` (Object.assign 7 health_check_*) | `tests/ensure-application-healthcheck.test.ts` (1) | PASS |
| R-13 | start_command en POST | `src/ensure.ts:424-426` (`body.start_command = v2app.startCommand`) | `ensure-application-healthcheck.test.ts` (1) | PASS |
| R-14 | healthcheck ausente → omitir | `src/ensure.ts:427` (if v2app.healthcheck !== undefined) | `ensure-application-healthcheck.test.ts` (1) | PASS |
| R-15 | E2E disposable multi-proyecto (2 slugs) | `src/registry.ts` + `src/index.ts:202-210` + mocks | `tests/e2e/multi-project-disposable.test.ts:22-84` | **FAIL** (ver F1 + F2) |
| R-16 | E2E idempotencia | `src/registry.ts:commitBinding` (atomic) + `withSlugLock` | `e2e/multi-project-disposable.test.ts:86-134` | **FAIL** (ver F1 + F2) |
| R-17 | E2E conflict (mismo slug, distinto parent) | `src/destination.ts:134-148` | `tests/e2e/conflict-disposable.test.ts` | **FAIL** (aserción lógica invertida — ver F2) |
| R-18 | global-profile sin secretos | `src/global-profile.ts:71-82` (schema cerrado) | `tests/global-profile-fallback.test.ts:43` + grep V-F | PASS |
| R-19 | precedencia directorEmail (4 capas) | `src/profile.ts:46-98` | `tests/precedence-director-email.test.ts` (5) | PASS |
| R-20 | launcher portabilidad (CHILD + 3 env vars) | `bin/run-provision.sh:36-37, 42-44, 59-87, 164-168` | `tests/launcher-portability.test.ts` (6) | PASS |
| R-21 | bootstrap deprecated removal | `src/secrets.ts:38` (SecretName sin "bootstrap") + `deriveBootstrapPassword` deprecated | `tests/hkdf-namespace.test.ts:38-56` (2) + `tests/secrets.test.ts` | PASS |
| R-22 | redact extensible | `src/redact.ts:124-173` (redactWithProfile + extraKeys case-insensitive) | `tests/redact-extensible.test.ts` (5) | PASS |
| R-23 | DNS expectedIp override | `src/ensure.ts:280-287` (3-capas: manifest → global-profile → hardcoded) | `tests/dns-zone-override.test.ts` (2) | PASS |

**Resumen AC:** 20/23 PASS + 3 FAIL (todos en `tests/e2e/`).

### 3.1 Detalle por AC bloqueante (F1 + F2)

**AC-R-15 / AC-R-16 (E2E disposable, `tests/e2e/multi-project-disposable.test.ts`):**

- **Síntoma:** los tests invocan `runProvision({operation: "ensure_application", ...})` directamente, sin haber ejecutado antes `ensure_project` + `ensure_environment`. El runner aborta con `infra_blocked: ensure_application requiere project binding` (`src/ensure.ts:267`).
- **Causa raíz:** diseño del test incompleto. El runner exige la cadena completa; el test sólo prueba el último eslabón.
- **Evidencia:** `node --test --import tsx 'tests/e2e/multi-project-disposable.test.ts'` → `not ok 2 ... not ok 3`, stack apunta a `ensureApplication` línea 267 + `runEnsure` línea 82.
- **Severidad:** P1 (AC explícito del SPEC §13, FAIL reproducible).
- **Owner recomendado:** SOFIA L1 fix (corregir test: encadenar las 3 ops o pre-seedear registry con project + environment bindings).
- **Condición de cierre:** `node --test --import tsx 'tests/e2e/*.test.ts'` retorna PASS 3/3, **Y** `pnpm test` los incluye (ver F1).

**AC-R-17 (E2E conflict, `tests/e2e/conflict-disposable.test.ts`):**

- **Síntoma:** el test siembra un registry con `attrs.projectNamespace = "vectoria:system"`, llama `findBinding(..., "acme-corp:system")`, y espera `found !== undefined`. Pero la implementación correcta de `findBinding` con namespace filter retorna `undefined` cuando los namespaces difieren (AC-R-8 cross-project block). El test asserta `assert.ok(found)` y falla.
- **Causa raíz:** aserción lógica invertida. El test demuestra correctamente el bloqueo, pero la aserción está al revés — debería ser `assert.equal(found, undefined)` y luego verificar `isCompatibleBinding(found, ...) === false` con `found === undefined` (no llamar `isCompatibleBinding` si `found` es undefined).
- **Evidencia:** `not ok 1 - AC-R-17 ... assert.ok(found)` en línea 48.
- **Severidad:** P1 (AC FAIL reproducible).
- **Owner recomendado:** SOFIA L1 fix (corregir aserción del test; la lógica de la implementación es correcta).

---

## 4. Hallazgos priorizados

### 4.1 P1 · Bloqueantes (2)

#### F1 [P1 BLOCKING] — `pnpm test` excluye los tests E2E

**Evidencia:**

- `package.json` script `"test": "node --test --import tsx tests/*.test.ts"`. El shell glob `tests/*.test.ts` **NO** incluye `tests/e2e/*.test.ts` (subdirectorio).
- `node --test --import tsx 'tests/*.test.ts'` (oficial) → 133/133 PASS.
- `node --test --import tsx 'tests/*.test.ts' 'tests/e2e/*.test.ts'` (ampliado) → **133 pass / 3 fail / 136 total**.
- 3 AC del SPEC §13 (R-15, R-16, R-17) tienen tests que NO entran en el conteo oficial.

**Impacto:** el reporte IMPL `133/133 PASS` es **engañoso** — la cobertura real es 97.8%, no 100%. El SPEC §16 DoD exige "≥ 185/185 PASS" y "23/23 AC-R PASS" — el primero es inalcanzable por desviación documentada (F3 P2), el segundo es falso: **3 AC FAIL**.

**Riesgo:** merge post-LIVE con E2E rotas expone regresiones de namespacing / no-cross-adoption / idempotencia que el pase afirma haber cerrado.

**Repro:**

```bash
cd /home/frank/repos/baseline-reusable-v2/infrastructure/vectoria-provision
pnpm test  # 133/133 PASS
node --test --import tsx 'tests/*.test.ts' 'tests/e2e/*.test.ts'  # 133 pass / 3 fail
```

**Owner recomendado:** SOFIA L1 fix — corregir `package.json` test script a `node --test --import tsx 'tests/*.test.ts' 'tests/e2e/*.test.ts'` (o equivalente que sí incluya `tests/e2e/`), **Y** corregir los 3 tests e2e (ver F2) para que pasen.

**Condición de cierre:** `pnpm test` ejecuta los E2E y retorna 136/136 PASS.

#### F2 [P1 BLOCKING] — Tests E2E están mal diseñados (AC-R-15, R-16, R-17 FAIL)

**Evidencia:** ver §3.1 arriba. Tres tests:

- `tests/e2e/multi-project-disposable.test.ts:22-84` (R-15) y `:86-134` (R-16): invocan `ensure_application` directo sin pre-seed de project/environment → `infra_blocked`.
- `tests/e2e/conflict-disposable.test.ts:14-57` (R-17): aserción `assert.ok(found)` cuando `findBinding` con namespace filter retorna `undefined` por diseño.

**Impacto:** AC-R-15, R-16, R-17 del SPEC §13 no se cumplen. La garantía E2E del baseline reusable (multi-proyecto disposable, no colisión, idempotencia, no-cross-adoption) no está demostrada.

**Riesgo:** si se mergea, no hay garantía automatizada de:

- Que dos slugs simultáneos en distintos namespaces no colisionan (R-15).
- Que re-correr el runner es idempotente (R-16).
- Que cross-project adoption está bloqueado (R-17).

**Owner recomendado:** SOFIA L1 fix. Para R-15/R-16, encadenar `ensure_project` → `ensure_environment` → `ensure_application` en el mock; o pre-seedear el registry con un `project` + `environment` antes del `ensure_application`. Para R-17, invertir la aserción (`assert.equal(found, undefined)`) y NO llamar `isCompatibleBinding` con `undefined`.

**Condición de cierre:** los 3 E2E retornan PASS.

### 4.2 P2 · Desviaciones documentadas (2)

#### F3 [P2] — `EnvTemplateKeys` permanece en 5 keys (no 12)

**Evidencia:**

- `src/schema.ts:371-377` define `EnvTemplateKeys = ["APP_ENV", "APP_URL", "DATABASE_URL", "VECTORIA_DIRECTOR_EMAIL", "VECTORIA_ORG_NAME"]` (5 keys).
- `src/schema.ts:360-369` (comment): "v1.7 extiende de 5 a 12 keys… la expansión v2.0 a 12 keys queda para IMPL-13+ dedicado".
- `tests/schema.test.ts:182-185` aserta `EnvTemplateKeys.length === 5`.
- SPEC §4.1 línea 196 exige "EnvTemplateKeys 12 keys + 5 modos — sin cambios" (es contradictorio: el spec dice que "sin cambios" implica 12 keys según §13, pero §4.1 está marcado como "sin cambios").
- ADR §4.4 línea 147: "El enum cerrado §8.3 v1.7 (12 keys, 5 modos) — sin cambios".
- SPEC §13 AC: no lista AC explícito sobre el conteo de keys (sólo R-9 / R-10 sobre secret-source).

**Impacto:** contradicción documental. El SPEC §4.1 y §13 AC mencionan 12; el código tiene 5. Forward-compat casts ya preparados (`MASTER_KEY as EnvTemplateKey`, `SESSION_SECRET as EnvTemplateKey` en `src/ensure.ts:672-673`).

**Riesgo:** los hooks HKDF (MASTER_KEY, SESSION_SECRET) y secret-source (S3_*, VECTORIA_SUPERUSER_PASSWORD) usan `as EnvTemplateKey` casts sin validación Zod. Si una key nueva se añade al enum y no se actualiza el cast, compila pero falla en runtime (no validación runtime del enum). Mitigación actual: el `envOverrides` loop valida `EnvTemplateKeys.includes(k)` antes de push (`src/ensure.ts:756`), pero el push de los HKDF / secret-source rows NO pasa por esa validación.

**Owner recomendado:** INTEGRA — emitir SPEC-GAP menor cerrando la contradicción (o IMPL-13+ dedicado). NO bloquea merge si Frank acepta el delta como deuda técnica registrada.

**Condición de cierre:** SPEC-GAP-20260821-XX publicado cerrando la contradicción (5 vs 12) y fijando el camino (IMPL-13+ dedicado), o ampliación en este pase.

#### F4 [P2] — Conteo 133 vs 185 esperado (desviación documentada)

**Evidencia:**

- SPEC §16 DoD: "pnpm test ≥ 162 + 23 nuevos = ≥ 185/185 PASS".
- IMPL §2.1: "Realidad medida: 133/133 PASS (82 baseline + 51 nuevos, 45 con tag AC-R-*)".
- Análisis IMPL: el "162" del handoff no coincide con el baseline real (`git show 0e39b35 -- infrastructure/vectoria-provision/tests/` enumera 10 archivos; `pnpm test` baseline = 82 subtests).
- `pnpm test` actual (sin E2E) = 133. **Con E2E incluido: 133 pass / 3 fail / 136 total** (ver F1).

**Impacto:** la meta "≥185" es inalcanzable con el baseline 82 + 51 nuevos = 133 (sin E2E). Con E2E incluidos, el conteo real es 133 PASS + 3 FAIL.

**Riesgo:** decisiones futuras basadas en "133/133 PASS" pueden ser erróneas (la cifra es engañosa por F1).

**Owner recomendado:** INTEGRA — actualizar SPEC §16 DoD para reflejar baseline real (82) + AC nuevos (51) = 133 + 3 E2E = 136 (134 PASS / 2 FAIL post-F1+F2 fix). O documentar formalmente la reducción de meta en ADR menor.

**Condición de cierre:** SPEC §16 DoD actualizado o ADR menor publicado reconociendo la reducción de meta.

### 4.3 P3 · No bloqueantes (4)

#### F5 [P3] — Launcher no valida per-project secret-source file

**Evidencia:**

- `bin/run-provision.sh:164-168` valida el `global-profile` (cuando existe) con `validate_secret_file`.
- No hay código que valide `${secretSourceBaseDir}/${parent}/${id}.env` cuando se provee vía `VECTORIA_PROVISION_SECRET_SOURCE_FILE`.
- SPEC §10.3: "El launcher valida todos los archivos mode 600 (no-symlink, owner UID esperado) con la misma función validate_secret_file: globalSecretsFile (existente), global-profile.json (NUEVO), secret-source per-project (NUEVO cuando se provee)".

**Impacto:** si el archivo per-project existe con mode != 600, el runner lo lee sin warning (defense-in-depth incompleto). El `warnIfBadPerms` en `src/secrets-file.ts:109-121` lo detecta pero sólo a nivel warning (no abort).

**Riesgo:** bypass del control 600/owner para per-project secret-source. Defense-in-depth incompleto.

**Owner recomendado:** SOFIA L1 fix (trivial: añadir bloque análogo al del global-profile).

#### F6 [P3] — `package.json` version sigue en `"1.0.0"`

**Evidencia:** `package.json:4` — `"version": "1.0.0"`. SPEC §16 DoD no exige bump, pero ADR §5 menciona entrega como `v1.7.1 → v1.8` (nueva release).

**Impacto:** trazabilidad de versión. Identificar el release reusable en `node_modules` o logs es ambiguo.

**Owner recomendado:** SOFIA L1 fix (1 línea: bump a `2.0.0` o `1.8.0`).

#### F7 [P3] — IMPL §2.5 lista `git-url.ts` como "Modificados (9)" pero el archivo no existe

**Evidencia:**

- IMPL-REPORT §2.5 (Modificados): incluye `bin/run-provision.sh` + `src/{schema,destination,registry,secrets,profile,redact,ensure,index}.ts` (9 archivos). Pero §4.2 (Contratos que pueden mutar) menciona `composeGitRepositoryUrl(slug, gitHost?)` como refactor.
- `find . -name "git-url*"` en el worktree: **no existe**.
- `grep -r composeGitRepositoryUrl infrastructure/vectoria-provision/src`: **0 resultados**.
- SPEC §4.2 menciona `git.host` como override; la implementación actual acepta `manifest.git.host` pero NO lo usa en `ensure_application` POST body (ver `src/ensure.ts:392-406`: usa `manifest.repository` literal, no `composeGitRepositoryUrl(slug, gitHost)`).

**Impacto:** la columna "Modificados" del IMPL §2.5 sugiere que `git-url.ts` fue tocado, pero el archivo no existe y la función `composeGitRepositoryUrl` no se implementó. El runner actual usa `manifest.repository` directamente en el POST (`body.git_repository = manifest.repository`), lo cual es funcional pero NO usa el override `git.host`.

**Riesgo:** si un proyecto futuro necesita un git host distinto de github.com (p.ej. self-hosted Gitea), el runner actual NO respetará `manifest.git.host` (sólo lo acepta en el schema pero no lo aplica al POST).

**Owner recomendado:** SOFIA L1 fix — implementar `composeGitRepositoryUrl(slug, gitHost?)` y aplicarlo en `ensure_application` POST body (`src/ensure.ts:395`). O documentar formalmente que `git.host` es metadata-only (no se aplica al POST) en un SPEC-GAP menor.

#### F8 [P3] — Heurística `isNamespacedRegistryPath` es frágil

**Evidencia:** `src/registry.ts:98-112` detecta si un registry path es namespaced por la forma del path (≥ 3 segmentos, últimos 2 con regex `[a-z0-9-]{1,63}`). Esto puede dar falsos positivos si un usuario final usa un directorio legítimo con esa forma.

**Impacto:** minor — el lock se pone en `${baseDir}/registry.jsonl.locks/${slug}.lock` que es el mismo lugar para namespaced y legacy (dirname coincide). El flag `namespaced` se computa pero NO se usa (`void namespaced;` en línea 172).

**Riesgo:** ninguno operacional inmediato. Pero el código muerto sugiere refactor incompleto.

**Owner recomendado:** SOFIA L1 fix (eliminar código muerto o usarlo para decidir el lock dir explícitamente).

---

## 5. Discrepancias evaluadas como NO bloqueantes

### 5.1 HKDF prefix

**Spec §7.2:** `info = ${global-profile.defaults.hkdfInfoPrefix}/${project.parent}/${project.id}/${secretName}/v${version}`. Default `"vectoria"`.

**Implementación (`src/secrets.ts:104`):** `const info = ${hkdfInfoPrefix}/${projectUuid}/${name}/v${version}`. `projectUuid` se invoca como `${parent}:${id}` (ver `src/ensure.ts:668` `manifestProjectNamespace(manifest)`).

**Resultado:** `info = vectoria/parent:id/name/v1` (con `:` como separador en `projectUuid`). Estructuralmente equivalente al SPEC (mismo orden de segmentos, mismo default). La diferencia es sólo notacional (`parent:id` vs `parent/id`). **No bloqueante.**

### 5.2 `EnvTemplateKeys` 5 vs 12

Cubierto por F3 (P2).

### 5.3 Conteo 133 vs 185

Cubierto por F4 (P2).

### 5.4 HKDF prefix default `"vectoria"`

Verificado en `src/global-profile.ts:45` (`hkdfInfoPrefix: z.string().min(1).default("vectoria")`) y `src/secrets.ts:95` (`hkdfInfoPrefix: string = "vectoria"`). Coincide con SPEC §7.2.

---

## 6. Compatibilidad retroactiva (AC-R-1, AC-R-8)

### 6.1 Manifest v1 vigente

- `MANIFEST-STAGING-20260821-01-sistema-vectoria.json` (v1) **intacto** (`git status` lo confirma).
- `ManifestSchema.parse(manifest-v1)` retorna OK con `v=2` post-transform, `project.parent="vectoria"`, `project.id="IMPL-20260821-01"`. AC-R-1 PASS.
- `MANIFEST-STAGING-20260821-02-acme-corp.json` (v2 sintético) parsea OK con `project.namespace="acme-corp:blog"`, `application.healthcheck.path="/api/health"`, `application.startCommand="pnpm start"`, `application.secretSource=["S3_ENDPOINT","S3_BUCKET","S3_ACCESS_KEY","S3_SECRET_KEY"]`. PASS.

### 6.2 Bindings v1.7 existentes

- `attrs.projectNamespace === undefined` se trata como namespace default `vectoria:<taskId>` (ver `src/destination.ts:136-143`). AC-R-8 compat PASS.
- `findBinding` con `projectNamespace` arg filtra correctamente (ver `tests/registry-namespace.test.ts:63-83`).
- `isCompatibleBinding` con caller de otro namespace + entry legacy retorna `false` (ver `tests/registry-namespace.test.ts:98-118`).

### 6.3 audit.jsonl schema

- Aditivo: `projectParent?`, `projectId?` (ver `src/schema.ts:415-431`).
- Las líneas antiguas (sin estos campos) preservan compat (parsean vía Zod safeParse sin error).
- El runner escribe nuevos entries con los campos si el manifest los trae (`src/index.ts:248-262`).

---

## 7. Riesgo operativo

| ID | Riesgo | Mitigación | Estado |
|---|---|---|---|
| RR-1 | Refactor introduce regresión en LIVE staging | worktree separado + sin merge | MITIGADO (no merge aplicado) |
| RR-2 | Merge antes de cierre LIVE staging | gated-Frank post-LIVE | MITIGADO (gating vigente) |
| RR-3 | E2E FAIL no detectado antes de merge | **F1 + F2 NO mitigados** | **ABIERTO** |
| RR-4 | `EnvTemplateKeys` 5 vs 12 sin cierre documental | F3 P2 pendiente | ACEPTADO (deuda) |
| RR-5 | `git.host` declarado pero NO aplicado al POST | F7 P3 pendiente | MENOR |
| RR-6 | Per-project secret-source sin validación 600/owner en launcher | F5 P3 pendiente | MENOR |
| RR-7 | HKDF info usa `:` como separador (vs `/` en spec) | NO BLOQUEANTE | NOTADO |
| RR-8 | GEMINI obligatorio §15 IDL | ESTE QA | EN CURSO |

---

## 8. Preparación por entorno

### 8.1 Calidad

- **LISTO** (parcialmente). 133/133 unit tests PASS; 3/3 E2E FAIL. El pase no debe aceptarse sin cerrar F1 + F2.

### 8.2 Staging

- **NO EVALUADO.** El pase corre en worktree separado, sin merge a `main`. No se ha desplegado a staging. El runner mock usa HTTP fetch stub (`tests/e2e/__mocks__/coolify.ts`); no toca Coolify real.
- Para evaluar staging se requeriría:
  1. Cerrar F1 + F2 (E2E verdes).
  2. Frank autoriza lote `NOCTURNO-REUSABLE-20260821-01` (asumida en IMPL pero no verificada en el handoff; verificar con ATLAS).
  3. Merge a `main` post-LIVE staging cierre (gated-Frank).
  4. Crear `~/.config/kilo/vectoria-provision/global-profile.json` (Frank-only).
  5. Smoke E2E en staging contra Coolify real con `acme-corp:blog` (sintético).
- **NO_LISTO** hasta cerrar F1+F2 y obtener merge gated-Frank.

### 8.3 Producción

- **NO_LISTO.** El pase es baseline reusable multi-proyecto; los proyectos reales (`sistema-vectoria` + futuros) NO han sido migrados al nuevo namespace. Producción queda fuera del alcance del pase.
- El ciclo LIVE staging en curso (`NOCTURNO-STAGING-20260821-03/04`) **no debe** mergear el refactor reusable antes de su propio cierre.

---

## 9. Handoff a ATLAS

### 9.1 Veredicto

```
QA-VERDICT: FAIL
Severidades:
  P1: 2 (F1 E2E no ejecutados + F2 E2E mal diseñados)
  P2: 2 (F3 EnvTemplateKeys 5 vs 12 + F4 conteo 133 vs 185)
  P3: 4 (F5 launcher per-project + F6 version bump + F7 git-url missing + F8 heurística frágil)
AC cubiertos: 20/23 PASS (R-1..R-14, R-18..R-23); 3/23 FAIL (R-15, R-16, R-17)
Secretos impresos: NO
Compat retroactiva verificada: SÍ (manifest v1 parsea, bindings legacy reconocidos)
```

### 9.2 Acción recomendada

ATLAS debe pivotar sesión independiente de **SOFIA** (L1 fix) para:

1. **Corregir `package.json` test script** (incluir `tests/e2e/*.test.ts`) — F1.
2. **Corregir los 3 tests E2E**:
   - `tests/e2e/multi-project-disposable.test.ts` (R-15, R-16): encadenar `ensure_project` → `ensure_environment` → `ensure_application` o pre-seedear registry.
   - `tests/e2e/conflict-disposable.test.ts` (R-17): invertir aserción (`assert.equal(found, undefined)`).
3. **(Opcional, recomendado)** Cerrar los P3 antes del merge: F5 (launcher per-project validation), F6 (version bump), F7 (git-url `composeGitRepositoryUrl` + uso en POST), F8 (eliminar heurística muerta).
4. **(NO bloqueante, recomendado)** INTEGRA emitir SPEC-GAP menor cerrando contradicción `EnvTemplateKeys` 5 vs 12 (F3) y documentando desviación 133 vs 185 (F4).

### 9.3 Gate siguiente

- **Tras L1 fix SOFIA:** re-ejecutar QA-20260821-REUSABLE-r1. Si verde, ATLAS eleva a INTEGRA para `READY_FOR_VERIFYING (v2.0 reusable)`.
- **Tras QA PASS:** INTEGRA propone `DONE (v2.0 reusable, pendiente-merge)` a ATLAS/CRONISTA; Frank autoriza merge post-LIVE staging cierre.
- **Sin QA PASS:** el worktree puede ser descartado vía L3 (`git worktree remove ../baseline-reusable-v2 --force && git branch -D feature/baseline-reusable-v2`). Runner v1.7 intacto en `main`.

### 9.4 Recomendación exacta para merge post-LIVE

**NO merge hasta:**

1. Cerrar F1 + F2 (E2E verdes).
2. Frank autoriza lote `NOCTURNO-REUSABLE-20260821-01` (verificar con ATLAS que la autorización fue explícita en sesión vigente).
3. Frank autoriza merge post-LIVE staging cierre (`NOCTURNO-STAGING-20260821-03/04` en `DONE (staging-aprobado)`).
4. CRONISTA aplica transición a `DONE (v2.0 reusable, pendiente-merge)` en `PROYECTO.md`.

**NO_LISTO_PARA_SOLICITAR_OK** a Frank hasta cerrar F1+F2.

---

## 10. Autoauditoría GEMINI

- ✅ Delimité el incremento exacto (9 archivos modificados + 12 untracked en `infrastructure/vectoria-provision/` + 1 untracked manifest sintético).
- ✅ Verifiqué SPEC-20260821-001 v1.0 + ADR-20260821-01 v1.0 vigentes.
- ✅ Revisé evidencia independiente (V-A..V-J arriba) — no sólo el reporte SOFIA.
- ✅ Re-ejecuté los 3 E2E tests manualmente y confirmé FAIL reproducible.
- ✅ No edité código, tests, config, `discovery/`, `SPEC/`, `PROYECTO.md`.
- ✅ No imprimí secretos ni PII (todos los `awk -F= '{print $1}'` y `grep -c` sin valores).
- ✅ Cada finding tiene evidencia (línea de código o comando), impacto, reproducción, owner recomendado, condición de cierre.
- ✅ Separé severidad QA (P0/P1/P2/P3) de niveles L1/L2/L3 (loop breakers IDL §10).
- ✅ Separé QA / staging / producción (§8).
- ✅ No invoqué subagentes ni declaré `DONE`.
- ✅ Handoff vuelve a ATLAS con acción concreta y gate siguiente definido.

---

**Estado:** `FAIL` — devuelto a ATLAS. 2 P1 bloqueantes (E2E no ejecutados por pnpm test + E2E mal diseñados). Merge post-LIVE **NO recomendado** sin cerrar F1 + F2.
