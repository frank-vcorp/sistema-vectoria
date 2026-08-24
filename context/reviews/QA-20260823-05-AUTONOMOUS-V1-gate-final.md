# QA-20260823-05 · Gate final AUTONOMOUS-V1 H2 · GEMINI → ATLAS

- **ID auditoría:** QA-20260823-05
- **Tarea:** gate final independiente turno `AUTONOMOUS-V1-20260823-01` H2 — incrementos SPEC-001 P-H-1 y SPEC-002..011.
- **Origen:** ATLAS. Monoplaza (una sola auditoría por gate final; sin rondas internas SOFIA).
- **Veredicto:** **PASS_WITH_WARNINGS**
- **Alcance:** **Reforzada** (múltiples SPEC acopladas, schema/migraciones/eventos/tipos exportados, auth/permisos, finanzas/comisión/CFDI, >5 archivos altamente acoplados, diff materialmente grande).

---

## 1. Delimitación y fuentes

- **Repo:** `main...origin/main`, HEAD `600a594`, working tree sucio y valioso (implementación vive en working tree, sin commit; SOFIA no commiteó — respetado).
- **Incremento exacto:** 12 IMPL-REPORTs de SOFIA en `context/interconsultas/`:
  - P-H-1 (`IMPL-REPORT-20260823-XX-p-h-1-ac83-automation.md`)
  - SPEC-002 (`IMPL-REPORT-20260823-02-spec-002-clientes-prospectos.md`)
  - SPEC-003..011 (`IMPL-REPORT-20260823-XX-spec-00{3..11}.md`) + correctivo `...-spec-010-ac7-correction.md`
- **SPEC/ADR canónicos:** `SPEC-20260817-001-plataforma-base.md` (v1.10) y `SPEC-20260817-00{2..11}-*.md`; ADR-02 (multitenancy), ADR-05 (authZ recurso), ADR-06 (sesiones/forceDb), ADR-10 (comisión sobre facturado), ADR-13 (suscripciones cross-module).
- **Diff inspeccionado:** `git diff --stat HEAD` (31 archivos modificados, +6490/-111) + archivos nuevos bajo `src/server/db/schema/`, `src/server/services/{clientes,comercial,orden-servicio,proyectos,facturacion,cobranza,finanzas,dashboard,admin,bitacora,suscripciones}/`, `src/server/trpc/routers/`, `src/modules/*`, `src/app/(dashboard)/*`, `tests/spec-20260817-00*.test.ts`, `e2e/*.spec.ts`.
- **Evidencia primaria:** leídos los 12 IMPL-REPORTs y el diff real (no sólo el índice de SOFIA). Validación independiente ejecutada (ver §3). No se provisionó BD/PAC/MinIO/staging/secretos (no autorizado).

---

## 2. Trazabilidad (criterio → implementación → evidencia → resultado)

| Incremento | AC | Evidencia independiente | Resultado |
|---|---|---|---|
| **P-H-1** (AC-83 automation) | automatizar greps Drizzle en auth routes | `pnpm check-antipatterns` ahora 16/16 (incluye AC-83); `src/app/api/auth/` sin Drizzle directo | PASS |
| **SPEC-002** (clientes/prospectos) | AC-1..9 | 21 tests; enums medios canónicos DEC-20260823-01; `requirePermission(...forceDb)` en clientes | PASS local (V3 ext) |
| **SPEC-003** (comercial) | AC-1..12 | 42 tests; `calculateQuote`/`evaluatePresupuestoWarning` puros; regla de oro sin IA (grep 0); **P2 en seed-catalog** | PASS local + P2 |
| **SPEC-004** (OS) | AC-1..8 + evento `os.authorized_to_start` | 49 tests; 4 precondiciones `authorize`; 90% fijo; no-acoplamiento inverso | PASS local (+P3 test) |
| **SPEC-005** (proyectos artefactos/estados) | AC-1..10 | 58 tests; `createFromOrder` atómico; JSON immutable round-trip | PASS local (V3 ext) |
| **SPEC-006** (equipo/ejecución) | AC-1..11 | 86 tests; `registrar_tiempo` BR-N413; `project.delivered_from_order` emitido en cierre técnico | PASS local (V3 ext) |
| **SPEC-007** (facturación CFDI) | AC-1..10 | 51 tests; PAC mock fail-closed (P-007-1 none); `createDraftFromSubscriptionRenewal`; **2 lint errors** | PASS local + P3 |
| **SPEC-008** (cobranza/comisiones) | AC-1..11 | 50 tests; `computeReleasedCents` sobre facturado topeada a estimada (verificado); `validatePaymentApplication` | PASS local (V3 ext) |
| **SPEC-009** (finanzas) | AC-1..11 | 44 tests; `conciliado` inmutable; `osOutstandingBalance` para SPEC-004 | PASS local (V3 ext) |
| **SPEC-010** (dashboard/admin/bitácora + AC-7) | AC-1..9 | 51 tests (35 + 16 AC-7); editor `questionnaire-editor.ts` + router + vista existen y montan; AC-7 cerrado como IMPLEMENTATION_DEFECT dentro del mismo incremento | PASS local (V3 ext) |
| **SPEC-011** (suscripciones) | AC-1..10 | 56 tests; `createFromOrder` condicional `tipo_cobro=suscripcion`; UNIQUE `(org,order_id)`; ADR-13 sin acoplamiento inverso | PASS local (V3 ext) |

---

## 3. Validaciones independientes (comando / resultado)

| Comando | Salida observada | Resultado |
|---|---|---|
| `pnpm test` (vitest run) | **636/636 PASS** · 24 archivos | PASS (coincide con SPEC-011 claim) |
| `npx tsc --noEmit` (typecheck completo) | **FAIL** — 0 errores en `src/`; 27 preexistentes `infrastructure/vectoria-provision/**`; **4 NUEVOS `scripts/seed-catalog.ts`**; **1 NUEVO `tests/spec-20260817-004.test.ts:157`** | FAIL (parcial; ver P2/P3) |
| `pnpm lint` (`eslint . --max-warnings=0`) | **FAIL** — 13 errores: 2 preexistentes infra, 9 preexistentes `tests/autonomous-loop/**`; **2 NUEVOS `tests/spec-20260817-007.test.ts`** (imports sin uso) | FAIL (parcial; ver P3) |
| `pnpm check-multitenancy` | `OK: 58 tablas con organization_id; 0 sin` | PASS |
| `pnpm check-antipatterns` | `OK: 16 checks anti-patrón pasaron` (incluye AC-83) | PASS |
| `pnpm check-seed-permissions` | `OK: matriz BR-N207..N212/BR-N413 consistente` | PASS |
| V3 Playwright E2E real | NO EJECUTABLE — sin `DATABASE_URL`/`MASTER_KEY`/`SESSION_SECRET`/`S3_*`/`VECTORIA_SUPERUSER_PASSWORD`/`E2E_BASE_URL` (verificado: todos UNSET; sin `.env`; PostgreSQL/MinIO/PAC/staging no autorizados) | **BLOCKED (gate externo)** |

**Nota sobre V3:** SOFIA reporta en SPEC-003 "V3 Playwright EJECUTADA 19 PASS/2 SKIP" contra dev server local; la `e2e/comercial.spec.ts` (header del propio SOFIA) advierte que reproduce fallos sin bootstrap+BD, y no hay artefacto de resultados que lo respalde (`test-results/.last-run.json` es stale, sin screenshots/traces). Claim **no reproducible** en este entorno; la clasificación V3 externa queda BLOCKED y el "19 PASS/2 SKIP" se trata como indicio de UI-render parcial, no como evidencia V3 primaria.

---

## 4. Hallazgos priorizados

### P2-1 · `scripts/seed-catalog.ts` no siembra ni compila: falta `organization_id` (SPEC-003)

- **Evidencia:** `npx tsc --noEmit` → 4 errores TS2769 `Property 'organizationId' is missing` en `scripts/seed-catalog.ts:407/434/462/486`. Los `db.insert(...).values({...})` de `questionnaires`, `questionnaire_questions`, `templates`, `catalog_services` omiten `organizationId`, que es **NOT NULL** con FK a `organizations.id` (e.g. `src/server/db/schema/questionnaires.ts:30-33`).
- **Impacto:** `pnpm db:seed:catalog` falla en runtime (violación NOT NULL) cuando ATLAS/Frank autorice el gate BD. El catálogo Comercial (6 cuestionarios/9 plantillas/8 servicios, ADR-04 §2.4) quedaría sin sembrar; SPEC-003 materializó el reemplazo del stub (4 líneas) por 518 líneas rotas.
- **Reproducción:** `npx tsc --noEmit 2>&1 | grep seed-catalog` (4 errores) o ejecutar `pnpm db:seed:catalog` con BD provisionada.
- **Owner/solución:** ATLAS → SOFIA como `IMPLEMENTATION_DEFECT` (mismo SPEC-003, sin cambio de contrato): el seed debe resolver el `organizationId` de destino (parámetro/env/org superuser) en las 4 inserciones.
- **Condición de cierre:** `npx tsc --noEmit` sin errores en `scripts/seed-catalog.ts` y seed verificado idempotente contra BD autorizada.

### P3-1 · `tests/spec-20260817-004.test.ts:157` rompe el typecheck completo

- **Evidencia:** `npx tsc --noEmit` → `TS2339 Property 'code' does not exist on type '{ ok: true } | { ok: false; code: TransitionError }'` en la aserción `expect(wrong.code).toBe("ORDER_ALREADY_CANCELLED")` tras `expect(wrong.ok).toBe(false)`.
- **Impacto:** `pnpm typecheck` completo rojo aunque `src/` compile limpio; el test sigue pasando (vitest no typecheckea), pero `pnpm typecheck` (gate CI/V2) falla.
- **Owner/solución:** SOFIA (micro-fix: narrowing explícito o `if (wrong.ok)` guard antes de `.code`).
- **Condición de cierre:** typecheck sin errores en `tests/spec-20260817-004.test.ts`.

### P3-2 · `tests/spec-20260817-007.test.ts` importa símbolos sin uso

- **Evidencia:** `pnpm lint` → 2 errores `@typescript-eslint/no-unused-vars`: `InvoiceStatusSchema` (línea 41) y `DomainError` (línea 63).
- **Impacto:** `pnpm lint` (eslint full) rojo; los 2 errores son NUEVOS de SPEC-007 (el archivo es nuevo en este turno).
- **Owner/solución:** SOFIA (quitar imports no usados).
- **Condición de cierre:** `eslint . --max-warnings=0` sin los 2 errores de `tests/spec-20260817-007.test.ts`.

### P3-3 · Exactitud de reportes: clasificación errónea de errores nuevos como "preexistentes"

- **Evidencia:** IMPL-REPORTs SPEC-003/004/007/011 declaran typecheck/lint "PASS — 0 errores" filtrado a `grep "^src/"`, y califican los errores de `seed-catalog.ts`, `tests/*-004`, `tests/*-007` como "baseline pre-existente". El `git show HEAD:scripts/seed-catalog.ts` confirma que era un stub de 4 líneas sin dichos errores → los 5 typecheck + 2 lint son **introducidos este turno**, no preexistentes.
- **Impacto:** el gate V2 no es realmente verde (typecheck y lint full fallan); el filtrado `src/` enmascaró defectos reales. Sin impacto funcional en runtime, pero reduce confianza en la evidencia V2.
- **Owner:** SOFIA (corregir clasificación en IMPL-REPORT) + ATLAS (ajustar criterio de gate V2 a typecheck/lint **full** del producto `src/ + scripts/ + tests/spec-*`, no sólo `src/`).

### P3-4 · Fórmula comisión: `Math.floor` vs `round` del ADR-10

- **Evidencia:** `computeReleasedCents` (`src/server/services/cobranza/helpers.ts:228-232`) usa `Math.floor(estimated × nonCancelled / totalOrder)`, topeada a `min(estimated, raw)`. El ADR-20260817-10 / BR-N362 redacta `round(...)`. El reporte lo documenta (R1) como redondeo conservador.
- **Impacto:** nunca se libera más de lo debido (conservador a favor del negocio); elección aceptable y reversible (1 línea). Test `1000×6000/10000=600` verificado correcto.
- **Condición de cierre:** aceptar explícito de ATLAS (o ajustar a `round` si Frank exige redondeo banco).

---

## 5. Riesgo operativo y preparación por entorno

- **Riesgo operativo residual:** los contratos cross-module diferidos no bloquean localmente pero quedan pendientes de cablear al habilitar BD/jobs: `AdvancePaidProvider` (SPEC-004/008/011 placeholder → anticipo real), `finalInvoiceIssued` (SPEC-007 activa al facturar), saga `subscription_creation`∥`project_creation` (ADR-13 §7 / P-13-1), jobs nocturnos (`markVencida`, `slaCotizacion`, `comisionesDia15`, `facturacion.recurrente`, `subscriptions.markVencida`). Ninguno es defecto del alcance local; son coordinaciones explícitas documentadas.
- **V3 externo:** PostgreSQL16/MinIO/PAC/secretos/staging **no autorizados** en este turno → único bloqueo final externo. Conforme a consigna, se separa local PASS de externo BLOCKED.

| Entorno | Estado QA |
|---|---|
| Calidad (typecheck/tests/lint/checks local) | **NO_LISTO** (tests 636 PASS y src/ limpio, pero typecheck/lint full con P2/P3 nuevos — ver §4) |
| Staging | **NO_EVALUADO** (no autorizado ni provisionado) |
| Producción | **NO_EVALUADO** (no aplica; sin OK explícito) |

---

## 6. Estado por SPEC (resumen)

| SPEC | Veredicto | Nota |
|---|---|---|
| P-H-1 (AC-83) | PASS | automatización verificada (16/16) |
| SPEC-002 | PASS local / V3 ext BLOCKED | sin defectos locales |
| SPEC-003 | PASS_WITH_WARNINGS | **P2-1 seed-catalog** |
| SPEC-004 | PASS_WITH_WARNINGS | P3-1 (test typecheck) |
| SPEC-005 | PASS local / V3 ext BLOCKED | sin defectos locales |
| SPEC-006 | PASS local / V3 ext BLOCKED | sin defectos locales |
| SPEC-007 | PASS_WITH_WARNINGS | P3-2 (imports sin uso) |
| SPEC-008 | PASS local / V3 ext BLOCKED | P3-4 (round vs floor, aceptable) |
| SPEC-009 | PASS local / V3 ext BLOCKED | sin defectos locales |
| SPEC-010 (incl. AC-7) | PASS local / V3 ext BLOCKED | AC-7 corregido correctamente |
| SPEC-011 | PASS local / V3 ext BLOCKED | sin defectos locales |

---

## 7. Handoff a ATLAS (acción y gate siguiente)

1. **Aceptar PASS_WITH_WARNINGS** y cerrar localmente el turno V1; el único bloqueo final externo es el gate V3/BD (PostgreSQL/MinIO/PAC/staging) **no autorizado** → mantener `VERIFYING` para V3 externo.
2. **Ruta los 4 hallazgos a SOFIA como `IMPLEMENTATION_DEFECT`** (mismo incremento, sin cambio de contrato SPEC/ADR): P2-1 (seed-catalog `organization_id`), P3-1 (narrow test-004), P3-2 (imports test-007), P3-3 (corregir clasificación en reportes + re-verificar typecheck/lint full `src/ + scripts/ + tests/`).
3. **Confirmar** P3-4 (round vs floor) o solicitar redondeo banco.
4. **Al autorizar BD/MinIO/PAC** (Frank): `pnpm db:generate`/`db:migrate` (no destructivo, solo agrega), `pnpm db:seed:catalog` (tras P2-1), y V3 Playwright contra staging LIVE (rutas críticas feliz + vacío/error, assertion + a11y snapshot + consola + requests fallidos).

### Autoauditoría GEMINI
- Delimitado incremento exacto (12 reportes + diff real). Verificadas SPEC/ADR vigentes. Evidencia independiente ejecutada (no sólo reporte SOFIA). No edité código/tests/config/`discovery/`/SPEC/`PROYECTO.md`. No imprimí secretos/PII. Cada hallazgo con evidencia/impacto/condición de cierre. Severidades QA (P2/P3) separadas de ownership L1/L2/L3. Separados QA/staging/producción. No invoqué subagentes ni declaré `DONE`. Handoff vuelve a ATLAS con acción concreta.

`QA-VERDICT: PASS_WITH_WARNINGS`