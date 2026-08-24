# QA-20260823-06 · Revalidación gate final (correctivo QA-05) · GEMINI → ATLAS

- **ID auditoría:** QA-20260823-06
- **Tarea:** revalidación del gate final `AUTONOMOUS-V1-20260823-01` H2 tras `IMPL-20260823-XX-qa-05-correction` (SOFIA).
- **Predecesor:** `QA-20260823-05-AUTONOMOUS-V1-gate-final.md` (P2-1/P3-1/P3-2/P3-3/P3-4).
- **Veredicto final:** **PASS_WITH_WARNINGS**
- **Alcance:** Reforzada (revalidación del delta correctivo sobre schema multi-tenant/seed y tests; conserva evidencia previa sin repetir pruebas no afectadas).

---

## 1. Delimitación del correctivo

- **Delta inspeccionado:** `git diff` sobre `scripts/seed-catalog.ts` (vs stub HEAD) + lectura directa de `tests/spec-20260817-004.test.ts` y `tests/spec-20260817-007.test.ts` (archivos untracked, no aparecen en `git diff`).
- **3 archivos tocados, 0 nuevos:** `scripts/seed-catalog.ts`, `tests/spec-20260817-004.test.ts`, `tests/spec-20260817-007.test.ts`. Sin cambio de contrato SPEC/ADR, sin tocar `src/**`, `shared/**`, ni otros tests/scripts.
- **Clasificación:** `IMPLEMENTATION_DEFECT` reversible, mismo turno, sin SPEC-GAP. Verificado.

## 2. Verificación de los 3 defectos QA-05 (+P3-3)

### P2-1 — seed-catalog `organization_id` / idempotencia → CERRADO
- **Código:** `scripts/seed-catalog.ts` añade `resolveDefaultOrgId()` (find-or-create org por `slug='default'`, espejo exacto de `scripts/seed-plataforma.ts` líneas 90–99, verificado por grep) y aplica `organizationId: orgId` a los 4 INSERTs (`questionnaires`, `questionnaire_questions`, `templates`, `catalog_services`). Los lookups de idempotencia ahora usan `and(eq(code), eq(organizationId, orgId))` (UNIQUE compuesto ADR-02 §8.3).
- **Consistencia de schema:** `organizations` expone `slug` (unique), `name`, `currency`, `locale`, `timezone`, `active` — todos presentes en el insert; `loadEnv()` provee `VECTORIA_ORG_NAME` (default "Vector IA"). Sin UUIDs inventados (`defaultRandom()`/fila existente).
- **Idempotencia:** preserva "no sobreescribir cambios manuales" (`isSeed !== "true"` → continue) y evita duplicados por UNIQUE compuesto. `resolveDefaultOrgId` es idempotente frente a `seed-plataforma.ts` (misma `slug='default'`).
- **Evidencia:** `npx tsc --noEmit` → **0 errores** en `scripts/seed-catalog.ts` (antes 4×TS2769).

### P3-1 — test-004 narrow → CERRADO
- **Código:** `tests/spec-20260817-004.test.ts:157` añade `if (wrong.ok) return;` antes de `expect(wrong.code)`. Narrow correcto sobre la unión.
- **Evidencia:** typecheck **0 errores** en `tests/spec-20260817-004.test.ts`; `pnpm test` 49/49 en ese archivo (dentro de 636/636 global).

### P3-2 — test-007 imports sin uso → CERRADO
- **Código:** eliminados `InvoiceStatusSchema` y `DomainError` de `tests/spec-20260817-007.test.ts` (grep confirma `NONE`).
- **Evidencia:** `pnpm lint` → **0 errores** en `tests/spec-20260817-007.test.ts` (antes 2).

### P3-3 — exactitud de reportes → CORREGIDO
- El IMPL-REPORT correctivo §"Honestidad V2 (P3-3)" reclasifica correctamente los 4 typecheck + 1 test + 2 lint como defectos QA-05 (no "baseline preexistente") y lista aparte el baseline genuino. Conforme.

---

## 3. Validaciones independientes (delta)

| Comando | Resultado observado | Estado |
|---|---|---|
| `pnpm test` (vitest run) | **636/636 PASS** · 24 archivos · ~11s | PASS (sin regresión) |
| `npx tsc --noEmit` (filtrado no-infra) | **0 errores** en `src/`, `scripts/`, `tests/` (grep `^src/\|^scripts/\|^tests/` = 0) | PASS producto |
| `pnpm lint` (`eslint . --max-warnings=0`) | **11 errores**, todos preexistentes y fuera de scope: 2 `infrastructure/vectoria-provision/.../read-only-enforcement.ts` + 9 `tests/autonomous-loop/*`. **0** en `tests/spec-20260817-007.test.ts` | PASS delta (baseline residual) |
| `pnpm check-multitenancy` / `check-antipatterns` / `check-seed-permissions` | No re-ejecutados (sin delta que los afecte; evidencia QA-05 vigente: 58 tablas / 16/16 / matriz OK) | REFERENCIA QA-05 PASS |

**Clasificación del baseline residual (pre-existente, fuera del alcance SPEC-001..011):**
- 22 errores typecheck en `infrastructure/vectoria-provision/**` (paquete de infraestructura reusable, commits previos al turno).
- 2 lint + 9 unused-vars de `tests/autonomous-loop/*` (incremento SPEC-20260823-001, ya QA en QA-20260823-02/03/04).
- **No introducidos por este turno ni por el correctivo.** No bloquean el cierre local de SPEC-001..011; se mantienen como deuda documentada en `context/CURRENT.md` baseline.

---

## 4. Hallazgos residuales

### P3 (aceptado, heredado QA-05) — Fórmula comisión `Math.floor` vs `round` ADR-10
- `computeReleasedCents` (`src/server/services/cobranza/helpers.ts`) usa `Math.floor(estimated × nonCancelled / totalOrder)` topeada a `min(estimated, raw)`. Redondeo conservador (nunca libera de más), documentado en R1 del reporte SPEC-008. Sin cambio en este correctivo.
- **Condición de cierre:** aceptación explícita de ATLAS (o cambio a `round` si Frank exige redondeo banco). No bloqueante.

### Observación menor (no bloqueante) — códigos de módulos en plantillas seed
- `scripts/seed-catalog.ts` mezcla `"diseño"` y `"diseno"` como código de módulo entre plantillas (TPL-WEB-LANDING usa `diseño`, el resto `diseno`). Inconsistencia cosmética en contenido seed, sin impacto funcional (los códigos de módulo del esqueleto no son enum canónico al sembrar). Pre-existente de SPEC-003; no toca el correctivo.

---

## 5. Riesgo operativo y gate externo

- **Gate externo (único bloqueo final):** V3 Playwright E2E / BD (PostgreSQL 16) / MinIO / PAC / secretos / staging **no autorizados** en este turno — sin `DATABASE_URL`/`MASTER_KEY`/`SESSION_SECRET`/`S3_*`/`VECTORIA_*`/`E2E_BASE_URL` (verificado UNSET, sin `.env`). **No se ejecuta ni se provisiona.** Al autorizarse: `db:generate`/`db:migrate` (no destructivo) + `db:seed:catalog` (ahora multi-tenant correcto) + V3 Playwright contra staging LIVE.
- **Coordinaciones cross-module diferidas (documentadas, no defectos):** `AdvancePaidProvider` (placeholder → real), `finalInvoiceIssued` (SPEC-007 al facturar), saga `subscription_creation`∥`project_creation` (ADR-13 §7/P-13-1), jobs nocturnos (`markVencida`, `slaCotizacion`, `comisionesDia15`, `facturacion.recurrente`, `subscriptions.markVencida`).

| Entorno | Estado QA |
|---|---|
| Calidad (producto SPEC-001..011: test/typecheck/lint/checks) | **LISTO** (0 defectos en scope; baseline infra/autonomous-loop residual preexistente) |
| Staging | **NO_EVALUADO** (no autorizado/provisionado) |
| Producción | **NO_EVALUADO** |

---

## 6. Estado por SPEC (final)

| SPEC | Veredicto | Nota |
|---|---|---|
| P-H-1 (AC-83) | PASS | check-antipatterns 16/16 (QA-05) |
| SPEC-002 | PASS local / V3 ext BLOCKED | sin defectos |
| SPEC-003 | **PASS (P2-1 cerrado)** / V3 ext BLOCKED | seed-catalog multi-tenant corregido |
| SPEC-004 | **PASS (P3-1 cerrado)** / V3 ext BLOCKED | narrow test corregido |
| SPEC-005 | PASS local / V3 ext BLOCKED | sin defectos |
| SPEC-006 | PASS local / V3 ext BLOCKED | sin defectos |
| SPEC-007 | **PASS (P3-2 cerrado)** / V3 ext BLOCKED | imports limpios |
| SPEC-008 | PASS_WITH_WARNINGS (P3 comisión floor vs round) / V3 ext BLOCKED | aceptable, conservador |
| SPEC-009 | PASS local / V3 ext BLOCKED | sin defectos |
| SPEC-010 (incl. AC-7) | PASS local / V3 ext BLOCKED | AC-7 cerrado (QA-05) |
| SPEC-011 | PASS local / V3 ext BLOCKED | sin defectos |

---

## 7. Handoff a ATLAS (acción y gate siguiente)

1. **QA-VERDICT final `PASS_WITH_WARNINGS`:** los 3 defectos de QA-05 (P2-1/P3-1/P3-2) y la exactitud de reportes (P3-3) están **cerrados y verificados**; sin regresión (636/636; typecheck/lint 0 errores en scope de producto).
2. **Único bloqueo restante = externo no autorizado:** V3 Playwright/BD/MinIO/PAC/secretos/staging. Local cerrado; mantener `VERIFYING` para el gate externo y transitar a `DONE` localmente cuando ATLAS lo indique (CRONISTA aplica).
3. **Advertencia residual aceptada:** P3 comisión `Math.floor` (especificada por ADR-10 como `round`) — confirmar o solicitar redondeo banco. No bloqueante.
4. **Al autorizar BD/MinIO/PAC** (Frank): `db:generate`/`db:migrate` + `db:seed:catalog` + V3 Playwright contra staging LIVE (rutas críticas feliz + vacío/error, snapshot accesibilidad, consola, requests fallidos).

### Autoauditoría GEMINI
- Delimitado el delta correctivo exacto (3 archivos). Verificado diff real + fuentes canónicas (organizations schema, loadEnv, seed-plataforma). Evidencia independiente re-ejecutada (test/typecheck/lint) sólo sobre lo afectado; checks no afectados referenciados de QA-05. No edité código/tests/config/discovery/SPEC/PROYECTO. No imprimí secretos/PII. Severidades QA separadas de ownership. No invoqué subagentes ni declaré `DONE`. Handoff vuelve a ATLAS con acción concreta.

`QA-VERDICT: PASS_WITH_WARNINGS`