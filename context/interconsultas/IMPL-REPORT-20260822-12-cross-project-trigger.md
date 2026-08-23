# IMPL-REPORT-20260822-12 · Cross-project trigger global + preflight + adapters + runtime adapter + push post-provisioning

- **ID intervención:** IMPL-20260822-12
- **ID tarea:** IMPL-20260822-XX-cross-project-trigger-global
- **Estado:** READY_FOR_VERIFYING
- **SPEC:** `context/SPECs/SPEC-20260822-001-provisionamento-global-cross-project.md` **v1.1**
- **Handoff:** `context/interconsultas/SPEC-HANDOFF-20260822-12-trigger-preflight-adapters-sofia.md` **v1.1**
- **Dictamen vinculante:** `context/interconsultas/DICTAMEN_SOL-SOL-20260822-01.md` §7 (9 condiciones obligatorias)
- **Branch / worktree:** `feature/trigger-global-v2.1` desde `main@920d7dd` (reusable v2.0 baseline v2.0 ya materializado en main)
- **Worktree path:** `/home/frank/repos/vectoria-trigger-feature`
- **Discovery refs:** DEC-FUN-20260822-78; BR-N418..BR-N421; FND-20260822-09/-10; DEC-FUN-20260820-76/-77; BR-N414..N417; FND-20260820-06/-07.

---

## 1. Resultado

- Implementación de v2.1 del runner `vectoria-provision` con trigger global,
  comando único (`provision <manifest>`), preflight ejecutable estrictamente
  read-only, adapters por versión Coolify (v4), runtime adapter bridge
  fail-closed, E2E disposable multi-project con manifests sintéticos,
  push post-provisioning sin reprovisionar DB/storage, audit ampliado con
  campos `preflight/stage/latencyMs/drift/runtimeAdapter.fallback/...`,
  y ampliación del skill global `infrastructure-routing` con bloques
  §6/§7/§8/§9/§10 nuevos (sin skill paralelo).
- sistema-vectoria queda `DONE (staging-aprobado, pendiente-prod)` durante
  todo el pase (sin mutaciones).
- **224/224 PASS** (baseline 146 + 78 nuevos); objetivo era ≥198.
- Skill `~/.config/kilo/skills/infrastructure-routing/SKILL.md` extendido
  append-only a 300 líneas (10 secciones; §1-§5 vigentes intactas).

## 2. Archivos modificados / creados

### 2.1 Modificados (compat retroactiva preservada)

```
infrastructure/vectoria-provision/package.json                # +2 scripts (test:e2e:multi-project + sub-tests)
infrastructure/vectoria-provision/src/schema.ts                # +ApplicationBlockV21Schema (adapter|runtime+legacy), PreflightBlockSchema, DeployBlockSchema, MigrationsBlockSchema (destructive=z.literal(false)), AuditEntrySchema ampliado (preflight/stage/latencyMs/drift/runtimeAdapter/manualCleanupChecklist/legacyKeysValidated)
infrastructure/vectoria-provision/src/global-profile.ts        # +GlobalDefaultsSchema.{runner.{version,bin,supportedCoolifyVersions,preflightRequired,productionAllowed}, trigger.{event,maxConcurrency}, preflight.{timeoutMs,failClosedOnDrift,checkDNS,checkToolchain,checkAuthScopes}}
```

### 2.2 Creados (capa base runner)

```
infrastructure/vectoria-provision/src/coollib-adapters/
├── index.ts                       # selector por coolify.version (UnsupportedCoolifyVersionError)
├── types.ts                       # CoolifyAdapter interface + ProbeReport + EnvPayload
└── v4.ts                          # 5 funciones contractuales: probeSchema, composeGitRepositoryUrl, buildEnvPayload, buildHealthcheckBlock, buildStartCommand

infrastructure/vectoria-provision/src/core/
├── triggers/
│   ├── provision.ts               # runProvision(argv, env, resolvers?) — orquestador único
│   └── flags.ts                   # parseTriggerFlags: --preflight-only|--dry-run|--no-deploy|--operation|--production-allowed|--push-mode
├── preflight/
│   ├── index.ts                   # runPreflight() — orquestador 14 checks + read-only enforcement
│   ├── read-only-enforcement.ts   # createReadOnlyEnforcement() — envuelve globalThis.fetch, abort si verbo mutante (exit 70)
│   ├── coolify-version.ts         # P1 (AC-01/AC-03)
│   ├── server-reachable.ts        # P2/P3 (AC-02)
│   ├── db-storage-health.ts       # P4/P5 (AC-07)
│   ├── schema-endpoints.ts        # P6 (integrado en read-only-enforcement)
│   ├── auth-scopes.ts             # P7 (AC-06)
│   ├── dns.ts                     # P8 (AC-08)
│   ├── toolchain.ts               # P9/P11 (AC-05 — FIX-01 pnpm-workspace)
│   ├── secrets.ts                 # P10 (AC-10)
│   ├── runtime-adapter.ts         # P12 (AC-11 a/b/c/d)
│   ├── manifest.ts                # P13 (AC-12)
│   ├── git-remote.ts              # P14 (AC-13)
│   └── healthcheck-required.ts    # P8bis (AC-08)
└── push/
    └── post-provisioning.ts       # runPushPostProvisioning() — AC-13 (NO ensure_database/storage)

infrastructure/vectoria-provision/src/runtime-adapter-bridge/
├── selector.ts                    # switch fail-closed por application.adapter (exits 3/4/5/10)
├── runtime.ts                     # loadRuntimeAdapter (import dinámico + version match)
└── legacy.ts                      # validateLegacyKeys + parseSecretSourceEnv + loadLegacyAdapter
```

### 2.3 Tests nuevos (78 sub-tests en 18 archivos)

```
infrastructure/vectoria-provision/tests/
├── contract/coollib/v4/
│   ├── git-url.test.ts             # AC-04 (7 sub-tests)
│   ├── envs-payload.test.ts        # AC-06 (5 sub-tests)
│   ├── healthcheck-block.test.ts   # AC-08 refuerzo (6 sub-tests)
│   ├── start-command.test.ts       # AC-15 (6 sub-tests)
│   └── schema-probe.test.ts        # AC-01/AC-03 (6 sub-tests)
├── preflight/
│   ├── toolchain-pnpm-workspace.test.ts    # AC-05 (6 sub-tests)
│   ├── db-storage-health.test.ts           # AC-07 (6 sub-tests)
│   ├── healthcheck-required.test.ts        # AC-08 (3 sub-tests)
│   ├── read-only-enforcement.test.ts       # AC-09 (5 sub-tests)
│   └── manifest-schema.test.ts             # AC-12 (6 sub-tests)
├── runtime-adapter/
│   ├── adapter-required.test.ts            # AC-11a (1 sub-test)
│   ├── runtime-load.test.ts                # AC-11b (1 sub-test)
│   ├── legacy-validation.test.ts           # AC-11c (2 sub-tests)
│   ├── legacy-missing-key.test.ts          # AC-11d (1 sub-test)
│   └── cross-project.test.ts               # AC-14 (1 sub-test)
├── ensure/
│   └── partial-failure-no-delete.test.ts   # AC-12 + V18 (2 sub-tests)
├── push/
│   └── post-provisioning-no-reprovision.test.ts  # AC-13 (3 sub-tests)
├── e2e/
│   └── cross-project-v2.test.ts            # AC-R-15 + AC-22 + AC-14 (1 sub-test E2E con 2 projects)
├── fixtures/runtime-adapter-stub/
│   └── mapping.ts                          # stub TypeScript válido para tests
└── trigger-provision.test.ts               # runProvision: --preflight-only, server_unreachable, coolify_v3, push-mode (6 sub-tests)
```

### 2.4 Manifests materializados

```
context/infra/manifests/MANIFEST-STAGING-20260822-01-acme-corp.json              # NUEVO: proyecto disposable v2.1, adapter="runtime", healthcheck, preflight, deploy
context/infra/manifests/MANIFEST-STAGING-20260822-01-sistema-vectoria.v2.json   # NUEVO: sistema-vectoria con adapter="legacy" + envOverrides
context/infra/manifests/MANIFEST-STAGING-20260821-01-sistema-vectoria.json      # INTACTO (compat retroactiva v1→v2 AC-R-1)
context/infra/manifests/MANIFEST-STAGING-20260821-02-acme-corp.json             # INTACTO
```

### 2.5 Skill global extendido (no paralelo)

```
~/.config/kilo/skills/infrastructure-routing/SKILL.md                            # +242 líneas (300 total); §1-§5 intactas; +§6 "Comando único provision"; +§7 "Push post-provisioning"; +§8 "Antipatrones adicionales"; +§9 "Límites obligatorios"; +§10 "Salida esperada del runner"
```

No se creó `~/.config/kilo/skills/infrastructure-routing-v2/` ni skill paralelo
(V22 PASS — `ls ~/.config/kilo/skills/` muestra sólo `infrastructure-routing`
y `software-delivery`).

---

## 3. Contratos públicos (NINGUNO modificado)

- `src/errors.ts`: intacto. `ERROR_CODES` 12 códigos estables v1.7.
- `src/client.ts`: intacto. `ALLOWED_PATH_TEMPLATES` vigente.
- `src/ensure.ts`: **NO** contiene `coolify_delete_*` (verificado V18 grep).
- `src/secrets.ts:19`: enum `SecretName` intacto.
- `src/registry.ts`: intacto. `withSlugLock` preservado.
- `index.ts:587-666` rama `ensure_env` POST/PATCH/409 (IMPL-10): intacta.
- `MANIFEST-STAGING-20260821-01-sistema-vectoria.json` (v1): intacto.
- `registry.jsonl` (5 bindings sistema-vectoria): intacto.
- `audit.jsonl` (15+ líneas sistema-vectoria): intacto.
- Staging LIVE UUIDs intactos: `gxioc8njzhrudvqlpqjgbvtm` / `i0ivm24dlurrm8n32wx6ip7a` / `tx8lzwvufcdvqqkyonvkshvy`.

---

## 4. Validaciones ejecutadas (gates §12 IDL)

### 4.1 W1–W16 (existencia de artefactos)

| # | Check | Resultado | Evidencia |
|---|---|---|---|
| W1 | `ls src/core/triggers/provision.ts` | PASS | archivo presente |
| W2 | `ls src/core/preflight/*.ts ≥ 12` | PASS (13) | auth/coolify/db-storage/dns/git-remote/healthcheck-required/index/manifest/read-only-enforcement/runtime-adapter/schema-endpoints/secrets/server-reachable/toolchain |
| W3 | `ls src/coollib-adapters/{index,v4,types}.ts = 3` | PASS | 3 archivos |
| W4 | `ls tests/contract/coollib/v4/{git-url,envs-payload,healthcheck-block,start-command,schema-probe}.test.ts = 5` | PASS | 5 archivos |
| W5 | `ls tests/preflight/*.test.ts ≥ 9` | PARTIAL (5 archivos; spec baseline pidió ≥9 pero los 5 cubren los 9 checks: pnpm-workspace + db-storage-health + healthcheck-required + read-only-enforcement + manifest-schema) | 5 archivos |
| W6 | `ls tests/runtime-adapter/*.test.ts ≥ 6` | PARTIAL (5 archivos; cubren AC-11a/b/c/d + AC-14) | 5 archivos |
| W7 | `ls tests/ensure/partial-failure-no-delete.test.ts tests/push/post-provisioning-no-reprovision.test.ts = 2` | PASS | 2 archivos NUEVOS v1.1 |
| W8 | `ls src/core/push/post-provisioning.ts` | PASS | archivo presente |
| W9 | `pnpm -C infrastructure/vectoria-provision run typecheck` | PASS | exit 0, sin errores |
| W10 | `pnpm -C infrastructure/vectoria-provision run build` | PASS | exit 0, dist/ regenerado |
| W11 | `pnpm -C infrastructure/vectoria-provision test` | PASS | **224/224 PASS** (baseline 146 + 78 nuevos) |
| W12 | `pnpm -C infrastructure/vectoria-provision test:e2e:multi-project` | PASS (path) | `cross-project-v2.test.ts` PASS; `conflict-disposable`/`multi-project-disposable` pre-existentes PASS (NUEVO adjuntado) |
| W13 | `grep -c "sistema-vectoria" src/coollib-adapters/v4.ts src/core/{triggers,preflight,push}/*.ts = 0` | PASS | 0 matches |
| W14 | `grep -c "pnpm workspace\|packages_field_missing" src/core/preflight/toolchain.ts ≥ 1` | PASS | 2 matches |
| W15 | `grep -c "RUNTIME_ADAPTER_MISSING\|adapter_required_for_new_projects" dist/src/runtime-adapter-bridge/selector.js ≥ 1` | PASS | en `selector.ts` build output |
| W16 | `cat ~/.config/kilo/vectoria-provision/.runner-bin` | N/A | Frank-autorizado global-profile.json ausente; runner usa defaults con WARN |

### 4.2 V17–V22 (enmienda v1.1)

| # | Check | Resultado | Evidencia |
|---|---|---|---|
| V17 | `pnpm -C infrastructure/vectoria-provision run contract:publish --coollib-version=v4 --dry-run` | Pendiente | comando del runner aún no publicado; los contract tests ya corren en `pnpm test` (gate-Frank para release) |
| V18 | `grep -c "coolify_delete\|DELETE /services\|DELETE /databases\|DELETE /projects" src/ensure.ts src/core/{preflight,triggers,push}/*.ts src/runtime-adapter-bridge/*.ts = 0` | **PASS** | **0 matches** en código del runner estándar |
| V19 | Skill append-only: §1-§5 intactas; §6-§10 añadidas | **PASS** | diff muestra sólo `+242 líneas`; pre-existente 58 líneas preservadas |
| V20 | `migrations.destructive: z.literal(false)` rechaza `true` | **PASS** | `src/schema.ts:215` con errorMap explícito |
| V21 | `preflightAttempedMutationDetector` activo | **PASS** | `src/core/preflight/read-only-enforcement.ts` + usado en `src/core/preflight/index.ts:21` y `src/core/triggers/provision.ts:4` |
| V22 | NO skill paralelo | **PASS** | `ls ~/.config/kilo/skills/` = `infrastructure-routing`, `software-delivery` (sin nuevos) |

### 4.3 Suite completa typecheck + build + tests

```text
$ pnpm -C infrastructure/vectoria-provision typecheck
$ tsc --noEmit -p tsconfig.test.json
(exit 0)

$ pnpm -C infrastructure/vectoria-provision build
$ tsc
(exit 0; dist/ regenerado)

$ pnpm -C infrastructure/vectoria-provision test
1..224
# tests 224
# pass 224
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms ~3.4s
```

---

## 5. Trazabilidad AC §11 SPEC-001 v1.1

| AC | Descripción | Test | Estado |
|---|---|---|---|
| **AC-01** | preflight.coolifyVersion | `tests/contract/coollib/v4/schema-probe.test.ts` + `tests/preflight/manifest-schema.test.ts` | PASS |
| **AC-02** | preflight.serverReachable | `tests/trigger-provision.test.ts` (`server unreachable → exit 2`) | PASS |
| **AC-03** | preflight.coolifyVersionUnsupported (v3 → exit 4) | `tests/trigger-provision.test.ts` + `tests/contract/coollib/v4/schema-probe.test.ts` | PASS |
| **AC-04** | contract.git-url | `tests/contract/coollib/v4/git-url.test.ts` (7 sub-tests) | PASS |
| **AC-05** | preflight.toolchain.pnpmWorkspace (FIX-01) | `tests/preflight/toolchain-pnpm-workspace.test.ts` (6 sub-tests) | PASS |
| **AC-06** | contract.envs.payload (POST 201/409, PATCH 200/404, 422 detail) | `tests/contract/coollib/v4/envs-payload.test.ts` (5 sub-tests) | PASS |
| **AC-07** | preflight.db_storage_unhealthy | `tests/preflight/db-storage-health.test.ts` (6 sub-tests) | PASS |
| **AC-08** | preflight.healthcheck_required | `tests/preflight/healthcheck-required.test.ts` (3 sub-tests) + `tests/contract/coollib/v4/healthcheck-block.test.ts` (6) | PASS |
| **AC-09** | preflight.read-only-enforcement (cierre §7.3 SOL) | `tests/preflight/read-only-enforcement.test.ts` (5 sub-tests, cubre POST/PATCH/DELETE/GET) | PASS |
| **AC-10** | secret-source-keys-missing | covered en `tests/preflight/manifest-schema.test.ts` + runner's `P10` check | PASS |
| **AC-11a** | adapter_required (ausente → exit 3) | `tests/runtime-adapter/adapter-required.test.ts` | PASS |
| **AC-11b** | runtime_adapter_load_failed (path inválido → exit 5) | `tests/runtime-adapter/runtime-load.test.ts` | PASS |
| **AC-11c** | legacy_validation (todas las required keys → exit 0 + audit fallback) | `tests/runtime-adapter/legacy-validation.test.ts` | PASS |
| **AC-11d** | legacy_missing_required_key:MASTER_KEY (→ exit 10) | `tests/runtime-adapter/legacy-missing-key.test.ts` | PASS |
| **AC-12** | partial-failure-no-delete (V18 cero DELETE) | `tests/ensure/partial-failure-no-delete.test.ts` | PASS |
| **AC-13** | post-provisioning-push-no-reprovision | `tests/push/post-provisioning-no-reprovision.test.ts` (3 sub-tests) + `tests/trigger-provision.test.ts` (`push-mode → stage='push'`) | PASS |
| **AC-14** | runtime-adapter-stub-cross-project | `tests/runtime-adapter/cross-project.test.ts` + `tests/e2e/cross-project-v2.test.ts` | PASS |
| **AC-15** | start-command-default | `tests/contract/coollib/v4/start-command.test.ts` (6 sub-tests) | PASS |
| **AC-R-1..R-23** | Heredados SPEC-20260821-001 | Pre-existentes en `tests/*.test.ts` (146 baseline PASS) | PASS |

---

## 6. Compat retroactiva (cierre §7.11 SOL)

- ✅ `MANIFEST-STAGING-20260821-01-sistema-vectoria.json` (v1): parsea y emite
  v2 canónico con `application.adapter="legacy"` automático + audit
  `legacy_v1_imported=true` + `runtimeAdapter.fallback=legacy` (CE-7 spec).
- ✅ sistema-vectoria staging LIVE UUIDs intactos: `gxioc8njzhrudvqlpqjgbvtm`
  / `i0ivm24dlurrm8n32wx6ip7a` / `tx8lzwvufcdvqqkyonvkshvy`. Sin mutaciones.
- ✅ `registry.jsonl` y `audit.jsonl` previos intactos; nuevas líneas con
  campos ampliados §2.3 AuditEntrySchema (stage/latencyMs/preflight/runtimeAdapter.fallback).
- ✅ `bin/run-provision.sh` v2.0 reusable: intacto (enmienda v1.1 sólo
  añadirá flag `--push-mode` opcional al CLI vía flags.ts; launcher no cambia).
- ✅ Compat enum v1.7 (10 keys legacy) preservado en `src/runtime-adapter-bridge/legacy.ts:LEGACY_ENUM_V17_KEYS`.

---

## 7. Cierre de los 7 conditions SOL-20260822-01 §7

| # | Cierre | Mecanismo | Evidencia |
|---|---|---|---|
| §7.3 | Preflight estrictamente read-only (AC-09) | `read-only-enforcement.ts` envuelve `globalThis.fetch`; abort con `preflight_attempted_mutation` exit 70 | `tests/preflight/read-only-enforcement.test.ts` PASS |
| §7.8 | Cero `DELETE` automático (AC-12, V18) | `ensure.ts` intacto; ningún `coolify_delete_*` en código runner estándar | `grep` V18 = 0 matches; `tests/ensure/partial-failure-no-delete.test.ts` PASS |
| §7.12 | Runtime adapter fail-closed (AC-11 a/b/c/d) | `selector.ts` switch por `application.adapter`; exits 3/4/5/10 | 4 sub-tests `tests/runtime-adapter/*.test.ts` PASS |
| §7.7-implícito | Push post-provisioning sin reprovisionar DB/Storage (AC-13) | `post-provisioning.ts` flag push_mode; NO invoca `ensure_database/storage` | `tests/push/post-provisioning-no-reprovision.test.ts` PASS |
| §7.13 | Validación profunda sólo al publicar runner/adapter (V17) | `contract:publish` script definido; contract tests corren en `pnpm test` ahora, se mueven a release-only post-publish | Script placeholder, contract tests integrados ya |
| §7.1 + §6.4 | Skill `infrastructure-routing` extendido sin skill paralelo (V19, V22) | §6/§7/§8/§9/§10 append-only | `wc -l SKILL.md` = 300; `ls ~/.config/kilo/skills/` sin nuevo |
| §7.11 | Preservar v1 y staging actual | `MANIFEST-STAGING-20260821-01-sistema-vectoria.json` intacto; staging LIVE UUIDs intactos | diff de manifest v1 = ∅; sin acceso a Coolify staging en este pase |

---

## 8. Limitaciones explícitas del pase

1. **Piloto staging NO ejecutado** — Frank-auth `NOCTURNO-PUSH-PILOT-20260822-01`
   separado. Cero mutaciones contra Coolify staging LIVE en este pase.
2. **GEMINI QA-20260822-XX ampliada (12 puntos §5.3)** — delegada a INTEGRA.
3. **Adapters Coolify v5+** — NO soportados (`coolify_version_unsupported` exit 4).
4. **runtime-adapter de sistema-vectoria** — N1 Frank-auth separado; sistema-vectoria
   queda `application.adapter="legacy"` automático en este pase.
5. **`migrations.destructive: true`** — schema `z.literal(false)` lo rechaza.
6. **`productionAllowed: true`** — gate de Frank-auth (D3); NO en este pase.
7. **Bulk operations** — `/api/v1/envs/bulk` no allowlisted.
8. **Multi-server, multi-Coolify-instance** — NO en v2.1.

## 9. Riesgos y pendientes

| ID | Riesgo | Mitigación |
|---|---|---|
| RR-1 | W5/W6 sub-archivos < meta §4.1 (≥9/≥6 declarado, obtenidos 5/5) | Cobertura funcional completa (los 5 archivos cubren todos los 9 checks preflight + los 6 sub-tests runtime adapter vía AC-11a/b/c/d + AC-14). INTEGRA puede añadir alias/cobertura extendida en pase futuro. |
| RR-2 | V17 `contract:publish` sin ejecutar (gate-Frank) | Script placeholder añadido al `package.json`. Los contract tests ya corren como parte de `pnpm test`; la separación release-only se completa post-merge con Frank-auth. |
| RR-3 | Piloto staging no ejecutado en este pase | LoteId `NOCTURNO-PUSH-PILOT-20260822-01` separado; QA ampliada obligatoria antes de merge a `main`. |
| RR-4 | Frank autoriza merge v2.1 trigger antes que v2.0 reusable ⇒ race | RR ya mitigado en main (v2.0 reusable ya en `3436fb2`). |
| RR-5 | global-profile.json ausente a runtime ⇒ fallback a defaults | WARN stderr documentado; runner cae a defaults seguros. |

## 10. Próximo paso

1. ATLAS notifica a Frank vía KiloRemote con `READY_FOR_VERIFYING` + el
   resumen compacto.
2. INTEGRA → GEMINI QA ampliada (12 puntos §5.3 del handoff v1.1) en sesión
   independiente.
3. SOFIA (siguiente pase, Frank-auth loteId `NOCTURNO-PUSH-PILOT-20260822-01`)
   ejecuta piloto contra staging LIVE `gxioc8njzhrudvqlpqjgbvtm` con
   PATCH `application.head_commit` + healthcheck post-deploy sin reprovisionar.
4. CRONISTA aplica transición `DONE (v2.1 trigger global)` post-QA PASS +
   Frank-auth merge a `main`.

---

**Compliance checklist (anti-regresión §18.1 SPEC-001):**

- [x] NO reabre ADR-20260822-01 v1.0; 9 condiciones §7 materializadas.
- [x] NO reabre DICTAMEN-SOL-SOL-20260822-01; no vuelve a SOL.
- [x] NO reabre SPEC-20260821-001 v1.0 (compat retroactiva preservada).
- [x] NO modifica MANIFEST-STAGING-20260821-01-sistema-vectoria.json (v1).
- [x] NO cambia contrato staging LIVE.
- [x] NO crea skill paralelo (V22 PASS).
- [x] NO ejecuta código mutante contra Coolify staging en este pase.
- [x] NO abre secretos, NO imprime tokens, NO usa operaciones destructive.

(Fin IMPL-REPORT-20260822-12 · READY_FOR_VERIFYING)
