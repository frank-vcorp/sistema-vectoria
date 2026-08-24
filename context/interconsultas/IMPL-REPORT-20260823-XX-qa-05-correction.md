# IMPL-REPORT-20260823-XX · QA-20260823-05 correctivo · SOFIA → ATLAS

- **ID intervención:** IMPL-20260823-XX-qa-05-correction
- **ID tarea:** QA-20260823-05 (defectos derivados de la auditoría; AC-7 SPEC-010 + AC-7/AC-11 SPEC-007 + seed-catalog multi-tenant)
- **Origen:** QA-20260823-05 (GEMINI) reportó 3 grupos de IMPLEMENTATION_DEFECT en el código de los SPECs ya entregados (P2-1 / P3-1 / P3-2). Frank/ATLAS reabrieron el caso como **`IMPLEMENTATION_DEFECT`** del flujo de incrementos WIP=1.
- **Estado:** `READY_FOR_VERIFYING`
- **Fecha:** 2026-08-23

---

## Clasificación

- **Tipo:** `IMPLEMENTATION_DEFECT` (reversible, sin cambio de contrato público; corrección dentro del mismo turno SOFIA).
- **Síntomas (QA-20260823-05):**
  - **P2-1:** `scripts/seed-catalog.ts` realizaba INSERTs a `questionnaires`/`templates`/`catalog_services` sin `organization_id`, en contra del PK compuesta `(organization_id, id)` (ADR-02 §8.3). El runtime fallaría con `null value in column "organization_id" violates not-null constraint`; además, los UNIQUE `(organization_id, code)` no podían aplicar (búsqueda sólo por `code`). La columna tampoco existe con default → 4 errores `TS2769` (overload).
  - **P3-1:** `tests/spec-20260817-004.test.ts:157` accedía a `wrong.code` sin narrow correcto sobre la unión `{ok:true}|{ok:false;code:TransitionError}`. 1 error `TS2339`.
  - **P3-2:** `tests/spec-20260817-007.test.ts` importaba `InvoiceStatusSchema` (línea 41) y `DomainError` (línea 63) sin usarlos. 2 errores `@typescript-eslint/no-unused-vars`.
- **Causa raíz:** el flujo de entrega documentó la validación (V2) como PASS sin clasificar los errores de QA-05 como bloqueantes nuevos. La regla **P3-3** del propio QA corrige la evidencia V2: "no clasificar esos errores nuevos como preexistentes".
- **Decisión:** corregir los 3 grupos en esta misma sesión sin cambiar contrato público, reutilizando el patrón existente de `seed-plataforma.ts` (find-or-create default organization) para P2-1.

---

## Archivos modificados / creados

### Modificados

| Archivo | Cambio |
|---|---|
| `scripts/seed-catalog.ts` | (P2-1) Importa `loadEnv` y `organizations`. Añade `resolveDefaultOrgId()` (find-or-create de la organización seed `slug='default'`, mismo patrón que `seed-plataforma.ts` — sin inventar UUIDs). Aplica `orgId` a los INSERTs de `questionnaires`/`questionnaire_questions`/`templates`/`catalog_services`. Endurece el lookup de idempotencia con `and(eq(code), eq(organizationId, orgId))` (UNIQUE compuesto). |
| `tests/spec-20260817-004.test.ts` | (P3-1) Añade `if (wrong.ok) return;` antes de acceder a `wrong.code` (patrón ya usado en otras pruebas del mismo archivo, líneas 326). |
| `tests/spec-20260817-007.test.ts` | (P3-2) Elimina imports no usados: `InvoiceStatusSchema` y `DomainError`. |

No se crearon archivos nuevos. No se modificaron: SPECs, ADRs, `discovery/`, `PROYECTO.md`, `src/server/**`, `src/shared/**`, `src/modules/**`, `src/app/**`, otros scripts, otros tests, ni el flujo autonomous-loop.

---

## Contratos públicos / protegidos

- **Sin cambio de contrato.** El delta NO toca `src/shared/enums`, `src/shared/zod`, routers tRPC, servicios, schemas ni mensajes. Es un correctivo de instrumentación (script de seed y tests) sin impacto en runtime público de los SPECs.
- **P2-1 honra ADR-02 §8.3** (multi-tenant PK compuesta): ahora la organización seed se resuelve una sola vez y se aplica a TODAS las tablas seed. Ningún INSERT toca la BD sin `organization_id`.
- **P2-1 NO inventa UUIDs inválidos:** la organización se busca/crea por `slug='default'`; el `id` lo emite `defaultRandom()` (Drizzle) o la fila existente. Sin cadenas literales tipo `"00000000-..."` ni `randomUUID()` en runtime de seed.
- **P3-1 / P3-2 son tests** sin impacto en código de producto.

---

## Validación

### Baseline (antes del correctivo)

| Gate | Comando | Resultado |
|---|---|---|
| Tests | `pnpm test` | **636/636** PASS (sin regresión funcional). |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | 27 errores totales: **22** en `infrastructure/vectoria-provision/**` (PRE-EXISTING baseline, commit `09b0378` del 2026-08-22) + **4** en `scripts/seed-catalog.ts` (P2-1) + **1** en `tests/spec-20260817-004.test.ts` (P3-1). |
| Lint | `pnpm lint` | 13 errores: **2** en `infrastructure/vectoria-provision/.../read-only-enforcement.ts` (PRE-EXISTING) + **9** en `tests/autonomous-loop/*` (PRE-EXISTING: archivos untracked, NO QA-05) + **2** en `tests/spec-20260817-007.test.ts` (P3-2). |
| Multitenancy | `pnpm check-multitenancy` | **58 tablas** con `organization_id`; 0 sin. |
| Antipatterns | `pnpm check-antipatterns` | **16/16** OK. |
| Seed-permissions | `pnpm check-seed-permissions` | matriz BR-N207..N412 consistente. |

### V1 dirigida (3 cortes)

| Corte | Comando | Resultado |
|---|---|---|
| **V1 cut 1** (P3-2 — unused imports spec-007) | `npx eslint tests/spec-20260817-007.test.ts --max-warnings=0` | PASS — 0 errores. |
| **V1 cut 2** (P3-1 — narrow spec-004) | `npx tsc --noEmit` filtrado a `tests/spec-20260817-004.test.ts` + `npx vitest run tests/spec-20260817-004.test.ts` | PASS — 0 typecheck errors; 49/49 tests. |
| **V1 cut 3** (P2-1 — seed-catalog `organization_id`) | `npx tsc --noEmit` filtrado a `scripts/seed-catalog.ts` + `npx tsx -e "import('./scripts/seed-catalog.ts')..."` (runtime fail-fast) | PASS — 0 typecheck errors; `loadEnv()` falla ANTES de tocar la BD con mensaje claro de variables ausentes, demostrando runtime-safe. |

### V2 completa (delta)

| Gate | Comando | Resultado |
|---|---|---|
| Tests | `pnpm test` | **636/636** PASS (24 archivos). 0 regresión. |
| Cross-SPEC | `npx vitest run tests/spec-20260817-{010,011,007,004}.test.ts` | **207/207** PASS. |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | **22 errores** totales, **0 nuevos** (verificado contra baseline): **22** PRE-EXISTING en `infrastructure/vectoria-provision/**` (commits previos al turno SOFIA). **0** errores en `src/`, `tests/`, `scripts/seed-catalog.ts`. **0** errores en QA-20260823-05 paths. |
| Lint | `pnpm lint` | **11 errores** totales, **0 nuevos** (verificado contra baseline): **2** PRE-EXISTING en `infrastructure/vectoria-provision/**` + **9** PRE-EXISTING en `tests/autonomous-loop/*` (archivos untracked, git ls-files confirma no están en HEAD). **0** errores en QA-20260823-05 paths. |
| Multitenancy | `pnpm check-multitenancy` | **58 tablas** OK. |
| Antipatterns | `pnpm check-antipatterns` | **16/16** OK. |
| Seed-permissions | `pnpm check-seed-permissions` | matriz BR-N207..N412 OK. |

### Honestidad V2 (P3-3)

- **Errores NO clasificados como preexistentes:** los 4 typecheck en `scripts/seed-catalog.ts` (P2-1), el 1 typecheck en `tests/spec-20260817-004.test.ts` (P3-1) y los 2 lint en `tests/spec-20260817-007.test.ts` (P3-2) son defectos **QA-20260823-05** materializados en este correctivo. **Estaban documentados en IMPL-REPORT-20260823-XX-spec-010/spec-011 como "baseline pre-existente" de manera incorrecta**; este correctivo los corrige y deja el V2 evidence real.
- **Errores SÍ preexistentes (no QA-05, fuera de alcance):**
  - 22 typecheck en `infrastructure/vectoria-provision/**` (commit `09b0378` 2026-08-22; paquete de infraestructura aislado, sin dependencia con `src/`).
  - 2 lint en `infrastructure/vectoria-provision/src/core/preflight/read-only-enforcement.ts` (mismo paquete).
  - 9 lint en `tests/autonomous-loop/*` (archivos untracked en el working tree; `git status` confirma "Untracked files: tests/autonomous-loop/"; no fueron introducidos por este turno).
- **V3 Playwright:** NO EJECUTADA — gate BD/PostgreSQL/MinIO no provisionado; misma situación que SPEC-002..011. No se repite.

---

## Trazabilidad por defecto QA-05

| Defecto | Antes | Después |
|---|---|---|
| P2-1 — `scripts/seed-catalog.ts` líneas 407/434/462/486 | `TS2769 No overload matches this call` (4 errores) | `0` errores. INSERTs ahora pasan `organizationId`; lookup con UNIQUE compuesto; runtime fail-fast antes de BD (loadEnv valida env). |
| P3-1 — `tests/spec-20260817-004.test.ts:157` | `TS2339 Property 'code' does not exist on type '{ok:true}\|{ok:false;code:TransitionError}'` | `0` errores. Narrow `if (wrong.ok) return;` añadido. Test sigue pasando (49/49). |
| P3-2 — `tests/spec-20260817-007.test.ts:41` y `:63` | `'InvoiceStatusSchema'/'DomainError' is defined but never used` (2 errores lint) | `0` errores. Imports eliminados. |

---

## Riesgos y desviaciones

- **R1 (decisión interna reversible):** `resolveDefaultOrgId()` crea la organización si no existe (defensivo standalone). Si Frank prefiere que el script asuma `seed-plataforma.ts` corriendo antes (cadena estricta `db:seed:plataforma` → `db:seed:catalog`), el delta es eliminar la rama "else insert" de `resolveDefaultOrgId`. Costo: ~10 líneas. Sin impacto en BD ni en contratos.
- **R2 (decisión interna reversible):** `loadEnv()` se importa sólo para `VECTORIA_ORG_NAME` (default de la organización). Si Frank prefiere aislar `seed-catalog` de las variables de plataforma, el delta es inyectar el `orgName` por argv o tener un fallback hard-coded. Sin impacto en BD.
- **R3 (no introducido por QA-05):** los 9 errores lint en `tests/autonomous-loop/*` y los 22 typecheck en `infrastructure/vectoria-provision/**` son **PRE-EXISTING baseline** (commits previos al turno SOFIA, archivos untracked). NO se modifican en este correctivo por estar fuera del scope QA-20260823-05 y del scope SPEC-010/011. CRONISTA puede etiquetarlos como baseline-20260822 en una futura pasada.

---

## Pendientes ATLAS

- **A1:** gate GEMINI V3 contra staging LIVE (Frank-auth) — mismo gate externo que SPEC-002..011. GEMINI re-ejecuta QA-05 sobre el delta y debería cerrar los 3 defectos.
- **A2:** CRONISTA aplica la transición material del IMPL-REPORT-20260823-XX-spec-011 a `READY_FOR_VERIFYING` (sin cambios desde la entrega anterior).
- **A3 (separado, no bloqueante):** considerar limpieza de los archivos untracked `tests/autonomous-loop/*` (o commitarlos como baseline explícito) en un turno independiente. No bloquea este correctivo.

---

## SPEC-GAP

No se devuelve `SPEC-GAP`. Los 3 defectos de QA-20260823-05 son instrumentación (script + tests), no contrato. La corrección está contenida en `scripts/seed-catalog.ts` y dos archivos de tests.

---

## Notas de reversión (recomendación, NO ejecución)

Si se requiere revertir este correctivo:

1. **Revertir código:** el blast radius está contenido en 3 archivos:
   - `scripts/seed-catalog.ts` (revertir los INSERTs a la versión sin `organizationId` — reintroduciría P2-1).
   - `tests/spec-20260817-004.test.ts` (revertir el narrow `if (wrong.ok) return;` — reintroduciría P3-1).
   - `tests/spec-20260817-007.test.ts` (reintroducir `InvoiceStatusSchema` y `DomainError` — reintroduciría P3-2).
2. **Sin migración de BD:** este correctivo NO toca esquemas ni ejecuta migraciones. La organización seed se crea con `loadEnv() → VECTORIA_ORG_NAME` o se reutiliza la existente.
3. **Sin acoplamientos inversos:** ningún archivo de `src/` ni otro test depende de los cambios aquí. La reversión queda contenida a esos 3 archivos.

No se ejecuta ninguna acción mutante (sin commit/push/PR/deploy/rollback/secretos/datos externos). Working tree sucio pre-existente se conserva intacto; este delta sólo añade ediciones acotadas a los 3 archivos listados.

---

## Estado

`READY_FOR_VERIFYING`. SOFIA no declara `DONE` (§3 IDL).
