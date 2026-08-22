# SPEC-GAP-20260821-07-cierre r1 — Cierre de W1 (EnvTemplateKeys 5/12) y W2 (conteo 146/185) tras QA-20260821-REUSABLE-r1

- **Origen:** INTEGRA (turno ATLAS → INTEGRA, 2026-08-21).
- **Trigger:** `context/reviews/QA-20260821-REUSABLE-r1.md` (PASS_WITH_WARNINGS) — 2 P2 warnings abiertos (W1 + W2) + 1 P3 menor (W3). QA Vía A (recomendada) requiere SPEC-GAP-cierre por INTEGRA para resolver las 2 desviaciones documentales antes de `READY_FOR_MERGE_POST_LIVE`.
- **Estado recomendado a ATLAS:** `READY_FOR_MERGE_POST_LIVE` — código 146/146 PASS reproducible, GEMINI PASS_WITH_WARNINGS con 0 P0/P1, W1 + W2 cerrados en este GAP-cierre, pendiente sólo de merge gated-Frank tras cierre del LIVE staging `NOCTURNO-STAGING-20260821-03/04`.
- **Aplica a:** `SPEC-20260821-001 v1.1` (este GAP-cierre la promueve) + `ADR-20260821-01 v1.1` (este GAP-cierre lo corrige) + `SPEC-GAP-20260821-07-baseline-reusable-delta` v1.0 (queda como delta técnico original; este r1 es su cierre) + `infrastructure/vectoria-provision/src/schema.ts:371-377` (código consistente con la decisión ratificada) + `infrastructure/vectoria-provision/src/ensure.ts:672-673` (cast compat temporal sobre `MASTER_KEY`/`SESSION_SECRET`, a eliminar en IMPL-13+) + `infrastructure/vectoria-provision/tests/*.test.ts` + `tests/e2e/*.test.ts` (suite 146/146 PASS, sin cambios — sólo se actualizan métricas en SPEC).
- **Fuentes funcionales:** sin producto nuevo; GAP-cierre es contractual.
- **Ciclo LIVE:** NO se toca. `MANIFEST-STAGING-20260821-01-sistema-vectoria.json` intacto; ninguno de los cambios aquí documentados requiere mutar manifest staging ni ejecutar Coolify.

> **Anti-código INTEGRA estricto (§11 IDL).** Este GAP-cierre es delta contractual sobre SPEC/ADR ya emitidos. NO genera código, configs runtime, scripts CI/CD ni migraciones. NO modifica el manifest staging ni ejecuta Coolify. La unidad queda `READY_FOR_MERGE_POST_LIVE`; el merge real lo ejecuta Frank tras autorización separada.

---

## 0. Resumen ejecutivo

QA-20260821-REUSABLE-r1 (GEMINI) emitió `PASS_WITH_WARNINGS` con 0 P0/P1 y 2 P2 abiertos:

- **W1 — EnvTemplateKeys 5 vs 12:** contradicción documental intra-SPEC (líneas 30/435/441/456 ⇒ "12 keys"; línea 552 ⇒ "v2.0 no añade keys"). El código (línea `src/schema.ts:371-377`) define **5 keys** y el docstring del código ya anticipa la delegación a IMPL-13+. **Decisión ratificada en este cierre (Opción A):** baseline reusable v2 preserva el enum baseline de 5 keys del runner v1 y delega las 12 runtime app keys al application adapter (§11 SPEC-20260821-001 v1.1) — fuera del enum del runner. La ampliación del enum baseline queda para IMPL-13+ dedicado.
- **W2 — Conteo 146 vs 185:** el baseline v1.7 medido es 82 subtests (no 162 como afirmaba el handoff original); 146 = 82 + 49 AC-R-* + 11 misc + 4 E2E. La meta 185 era inalcanzable ya antes del pase. **Decisión ratificada:** métrica reproducible 146/146 PASS oficial (suite `tests/*.test.ts` + `tests/e2e/*.test.ts`), con baseline real 82 documentado, sin aspiracionales.

Ambos hallazgos quedan **cerrados** sin tocar código, manifest staging, ni ejecutar Coolify.

---

## 1. Trazabilidad de cierre

| ID | Severidad | Estado QA | Decisión INTEGRA | Lugar donde se aplica |
|---|---|---|---|---|
| W1 (F3) | P2 WARN | OPEN en QA-r1 | **Opción A ratificada**: 5 keys baseline preservadas; 12 runtime app keys delegadas al adapter | SPEC v1.1 §11 (líneas 30, 435, 441, 456 corregidas) + §14 línea 552; ADR v1.1 §2.5; este GAP §2 |
| W2 (F4) | P2 WARN | OPEN en QA-r1 | Métrica reproducible 146/146 + baseline real 82 | SPEC v1.1 §14 línea 550 + §16 línea 591; este GAP §3 |
| W3 | P3 menor | OPEN (W3) | No bloquea merge; SOFIA L1 (1 línea) cuando estime | PROYECTO.md pendiente menor |

---

## 2. Cierre de W1 — EnvTemplateKeys 5 vs 12

### 2.1 Contexto

QA-20260821-REUSABLE-r1 §4.2 W1 detectó contradicción intra-SPEC:

- SPEC §11.1 línea 30 (original): "módulo por app que mapea su contrato a las **12 keys** del enum §8.3 v1.7"
- SPEC §11.1 línea 435 (original): "módulo por app que mapea el contrato de env vars… a las **12 keys**"
- SPEC §11.2 línea 441 (original): "el runner es adapter-agnóstico: cualquier app que mapea a las **12 keys** funciona"
- SPEC §11.4 línea 456 (original): "el adapter componer las **12 keys** del enum v1.7"
- SPEC §14 línea 552 (original): "Las **12 keys + 5 modos** siguen vigentes. **v2.0 no añade keys al enum**"
- ADR §2.5 línea 146 (original): "enum cerrado §8.3 v1.7 (**12 keys, 5 modos**)"

El código (`src/schema.ts:371-377`):

```ts
export const EnvTemplateKeys = [
  "APP_ENV",
  "APP_URL",
  "DATABASE_URL",
  "VECTORIA_DIRECTOR_EMAIL",
  "VECTORIA_ORG_NAME",
];
```

Y el docstring (líneas 378-381): "la expansión v2.0 a 12 keys (S3_*, MASTER_KEY, SESSION_SECRET, VECTORIA_SUPERUSER_PASSWORD, APP_BASE_URL, NODE_ENV) queda para IMPL-13+ dedicado. El presente refactor NO toca este enum cerrado (handoff §4.1: 'sin cambios')."

### 2.2 Opciones evaluadas

QA Vía A propuso dos opciones:

| Opción | Acción | Consecuencia |
|---|---|---|
| **A (ratificada)** | Mantener 5 keys en `EnvTemplateKeys`. SPEC + ADR aclaran que las 12 runtime app keys son **delegadas al application adapter** (§11) y la ampliación del enum queda para IMPL-13+. | Compatible con código actual; cero cambios runtime; travelers futuros no heredan la contradicción. |
| B (rechazada) | Ampliar `EnvTemplateKeys` a 12 keys en este pase con IMPL-13+ dedicado. | Introduce cambios fuera del scope del pase reusable (afecta `envOverrides` Zod parsing y `ensure.ts` casts); reabre scope; QA no lo recomienda. |

### 2.3 Decisión ratificada (Opción A)

**DEC-TECH-20260821-07-1 (INTEGRA 2026-08-21):** El runner `vectoria-provision` v2.0 (baseline reusable multi-proyecto) **preserva el enum baseline cerrado de 5 keys** del runner v1 (`APP_ENV`, `APP_URL`, `DATABASE_URL`, `VECTORIA_DIRECTOR_EMAIL`, `VECTORIA_ORG_NAME`) sin modificación. Las **12 runtime app keys** del §8.3 v1.7 son **delegadas al application adapter** (módulo por app, fuera del repo `infrastructure/vectoria-provision/`, documentado en SPEC §11.4). El runner NO conoce las 12 keys completas: sólo consume `ManifestV2` (`application.secretSource` + `application.healthcheck` declarativos) y valida contra el enum baseline de 5 keys.

**Riesgo residual reconocido:** los casts `as EnvTemplateKey` para `MASTER_KEY` y `SESSION_SECRET` en `src/ensure.ts:672-673` son **compat temporal** mientras el adapter no materialice las 12 keys en el dispatch. El loop `envOverrides` (`src/ensure.ts:756` vía `EnvTemplateKeys.includes(k)`) NO cubre las keys HKDF/secret-source rows; el riesgo se materializa sólo si se añade una key nueva al enum sin actualizar el cast. Riesgo **bajo** y acotado: la ampliación del enum (que elimina los casts) es **IMPL-13+ dedicado**, fuera del alcance del pase reusable.

**Reversibilidad:** la Opción A es trivialmente reversible: cuando IMPL-13+ amplíe el enum baseline a 12 keys (decisión separada, Frank-gated), se eliminan los casts `as EnvTemplateKey` y el adapter se reduce (deja de componer las 12 keys; el runner las conoce directamente). Esta reversibilidad NO requiere tocar el código actual del pase reusable.

### 2.4 Aplicación a SPEC y ADR

- **SPEC-20260821-001 v1.0 → v1.1:** §11.1 línea 30, §11.1 línea 435, §11.2 línea 441, §11.4 línea 456, §14 línea 552 → reemplazadas por redacción que distingue **enum baseline de 5 keys del runner** vs **12 runtime app keys delegadas al adapter**. La unidad §11.4 deja explícito que el adapter compone las 12 runtime app keys al enum baseline de 5 keys, y que los casts `as EnvTemplateKey` son compat temporal que se elimina en IMPL-13+.
- **ADR-20260821-01 v1.0 → v1.1:** §2.5 línea 146 → reemplazada por redacción que nombra explícitamente las **5 keys del enum baseline** y delega las **12 runtime app keys** al application adapter. Cita explícitamente SPEC-GAP-20260821-07-cierre r1 como fuente de la decisión.

**Diff vs estado r0:** 6 puntos documentales corregidos. Cero archivos de código modificados por este GAP-cierre.

---

## 3. Cierre de W2 — Conteo 146 vs 185

### 3.1 Contexto

QA-20260821-REUSABLE-r1 §4.2 W2 detectó que la métrica numérica del SPEC §16 DoD era engañosa:

- SPEC §16 línea 591 (original): "`pnpm test` ≥ 162 + 23 nuevos = ≥ 185/185 PASS"
- SPEC §14 línea 550 (original): "`tests/*.test.ts` (162/162 PASS) | No se reabre"
- Baseline real medido en rama `0e39b35`: **82 subtests** en v1.7 (no 162).
- Pase r1 medido: 82 + 49 AC-R-* + 11 misc + 4 E2E = **146 subtests oficiales**, PASS 146/146.

La cifra "162" del SPEC no correspondía con ningún baseline medible; parecía un estimado del handoff original o un error de arrastre.

### 3.2 Decisión ratificada

**DEC-TECH-20260821-07-2 (INTEGRA 2026-08-21):** La métrica DoD del pase reusable es **146/146 PASS oficial reproducible**, sin aspiracionales. Composición:

| Origen | Subtests |
|---|---|
| Baseline v1.7 (medido en rama `0e39b35`, `git show 0e39b35 -- infrastructure/vectoria-provision/tests/`) | 82 |
| AC-R-* nuevos (49 subtests con tag `AC-R-*` distribuidos en 14 fixtures) | 49 |
| Misc (git-url + redact-extensible + hkdf-namespace + launcher-portability + secrets-deprecated + dns-zone-override + secret-source-v2 + global-profile-fallback + global-profile-override + precedence-director-email + registry-namespace) | 11 |
| E2E oficiales (`tests/e2e/multi-project-disposable.test.ts` ×2 + `tests/e2e/conflict-disposable.test.ts` ×2) | 4 |
| **Total** | **146** |

**Comandos de verificación (reproducibles):**

| # | Comando | Resultado esperado | Frecuencia |
|---|---|---|---|
| V-D | `cd infrastructure/vectoria-provision && pnpm test` | output: `tests 146 / pass 146 / fail 0` | post-merge |
| V-D-E2E | `cd infrastructure/vectoria-provision && node --test --import tsx 'tests/e2e/*.test.ts'` | output: `tests 4 / pass 4 / fail 0` | post-merge |

Ambas verificaciones fueron ejecutadas por GEMINI en QA-r1 §2.1 (V-D = 146/146 PASS, V-D-E2E = 4/4 PASS).

### 3.3 Aplicación a SPEC

- **SPEC-20260821-001 v1.0 → v1.1:**
  - §14 línea 550: "`tests/*.test.ts` (162/162 PASS) | No se reabre" → "`tests/*.test.ts` + `tests/e2e/*.test.ts` (146/146 PASS oficial tras pase r1) | **No se reabre**. Baseline v1.7 medido = 82 subtests (no 162; error de arrastre corregido). Las nuevas fixtures viven en `tests/{schema-v2-compat,...,e2e}/`."
  - §16 línea 591: "`pnpm test` ≥ 162 + 23 nuevos = ≥ 185/185 PASS" → "`pnpm test` = **146/146 PASS** oficial (incluye ambos globs). Baseline v1.7 medido = 82 subtests; meta v2.0 = ≥146 PASS oficial. Verificación: `cd infrastructure/vectoria-provision && pnpm test` → `tests 146 / pass 146 / fail 0`."

**Diff vs estado r0:** 2 puntos documentales corregidos. Cero archivos de código modificados por este GAP-cierre.

### 3.4 ADR menor (opcional, no requerido)

QA Vía A mencionó "emitir ADR menor reconociendo la reducción de meta". **Decisión INTEGRA:** NO se emite ADR menor. La corrección de la métrica numérica es **concreta y reproducible** (146 verificado por comando); emitir un ADR menor para reconocer la corrección sería burocracia inútil. La corrección queda en SPEC v1.1 + este GAP-cierre, ambos referenciados desde el changelog de PROYECTO.md.

---

## 4. Cierre de W3 (no requerido, observación menor)

QA-20260821-REUSABLE-r1 §4.3 W3 (P3 menor): "`pnpm test` regresión silenciosa — no existe un test meta que verifique que el script `test` incluya los E2E. Owner recomendado: SOFIA L1 (1 línea en `tests/lint.test.ts`). NO bloqueante."

**Decisión INTEGRA:** W3 queda registrado como **pendiente menor** en PROYECTO.md §X (no en este GAP-cierre, ya que no es P2). Se cierra cuando SOFIA estime, post-merge. Riesgo bajo (probabilidad baja de regresión; QA detectaría).

---

## 5. Estado de la unidad tras este GAP-cierre

### 5.1 SPEC-20260821-001 v1.1

- Estado: `READY` (cierre-W1W2-aplicado vía SPEC-GAP-20260821-07-cierre r1)
- 23 AC ejecutables; sin cambios al catálogo de AC; documentación corregida en §11 + §14 + §16.

### 5.2 ADR-20260821-01 v1.1

- Estado: **propuesto** (aceptación tras IMPL-20260821-REUSABLE-r1 + QA-r1 PASS_WITH_WARNINGS + cierre W1+W2 + Frank-merge)
- §2.5 corregida (enum baseline 5 keys explícito + delegación 12 runtime app keys al adapter).

### 5.3 Estado operacional

| Aspecto | Estado |
|---|---|
| Código | `feature/baseline-reusable-v2` sin commits; baseline `0e39b35` |
| Tests | **146/146 PASS** oficial reproducible (V-D + V-D-E2E) |
| Typecheck | exit 0 (QA-r1 V-TA) |
| Build | exit 0; `dist/` regenerado (QA-r1 V-TB) |
| GEMINI | `PASS_WITH_WARNINGS` (QA-20260821-REUSABLE-r1); 0 P0/P1; 2 WARNINGS cerrados en este GAP-cierre; 1 WARNING menor (W3) registrado |
| Compat retroactiva | manifest v1 (`MANIFEST-STAGING-20260821-01-sistema-vectoria.json`) intacto (V-C6); bindings v1.7 legacy reconocidos (V-M5) |
| LIVE staging | NO TOCADO; merge gated-Frank post-LIVE staging cierre |
| Producción | NO_LISTO (proyectos reales aún no migrados al nuevo namespace) |
| **Estado de la unidad** | **`READY_FOR_MERGE_POST_LIVE`** (definido en PROYECTO.md) |

### 5.4 Handoff a ATLAS

```text
SPEC-GAP-20260821-07-cierre r1 — CIERRE de W1 + W2
Origen: INTEGRA
SPEC activa: SPEC-20260821-001 v1.1
ADR activo: ADR-20260821-01 v1.1
QA de referencia: QA-20260821-REUSABLE-r1 (PASS_WITH_WARNINGS)
Estado anterior: READY (con 2 WARNINGS P2 abiertos)
Estado recomendado: READY_FOR_MERGE_POST_LIVE
W1 cerrado: Opción A ratificada — 5 keys baseline preservadas; 12 runtime app keys delegadas al adapter (SPEC §11 + ADR §2.5 corregidos)
W2 cerrado: métrica 146/146 PASS oficial reproducible; baseline real 82 documentado (SPEC §14 + §16 corregidos)
W3: registrado como pendiente menor en PROYECTO.md (no bloquea)
Merge: pendiente gated-Frank tras cierre LIVE staging NOCTURNO-STAGING-20260821-03/04
Prohibiciones respetadas: sin código, sin manifest staging mutado, sin Coolify, sin commits/push/merge
```

---

## 6. Autoauditoría INTEGRA

- ✅ No inventé decisiones funcionales (W1/W2 son desviaciones documentales; decisión técnica reversible).
- ✅ No leí secretos ni ejecuté mutaciones Coolify (sólo `grep`/`ls`/`cat` read-only para verificar).
- ✅ No delegué a SOFIA/GEMINI/DEBY/CRONISTA lateralmente (devuelvo a ATLAS; §12 IDL).
- ✅ No generé código, configs runtime, scripts CI/CD, tests ni migraciones (sólo markdown contractual: SPEC v1.1, ADR v1.1, este GAP-cierre, PROYECTO.md).
- ✅ IDs trazables: `SPEC-20260821-001 v1.1`, `ADR-20260821-01 v1.1`, `SPEC-GAP-20260821-07-cierre r1`, `QA-20260821-REUSABLE-r1`, `IMPL-20260821-REUSABLE-r1`, refs a `SPEC-20260820-003 v1.7`, `SPEC-GAP-20260821-06-staging-live-gates`, `MANIFEST-STAGING-20260821-01-sistema-vectoria.json`.
- ✅ Blast radius acotado: 6 puntos documentales en SPEC + 1 punto en ADR + este GAP-cierre + actualización PROYECTO.md. Cero archivos de código tocados.
- ✅ Compat retroactiva preservada: código actual ya era consistente con la Opción A; este GAP-cierre sólo documenta la decisión.
- ✅ Cumplo gates §11 IDL (no `code.test.sh`, no CI, no Dockerfile, no tests, no scripts, no migraciones, no config runtime).
- ✅ Cumplo §12 IDL (no invoqué lateralmente; handoff vuelve a ATLAS).
- ✅ Cumplo §13 IDL: deviations not silently rewritten — W1 + W2 declarados explícitamente como cerrados con la decisión tomada.

---

## 7. Próximo paso (no ejecución)

1. INTEGRA persiste **PROYECTO.md v2.X** en el worktree con la unidad `IMPL-20260821-REUSABLE-r1` en estado **`READY_FOR_MERGE_POST_LIVE`** y autorización de merge gated-Frank.
2. INTEGRA devuelve este GAP-cierre + SPEC v1.1 + ADR v1.1 + PROYECTO.md a **ATLAS** con estado **`READY_FOR_MERGE_POST_LIVE`**.
3. ATLAS eleva a Frank (vía KiloRemote `notify_user` o chat, decisión ATLAS) con resumen del cierre W1+W2 y la solicitud de OK para merge post-LIVE staging cierre.
4. Frank decide:
   - (a) autorizar merge del pase reusable post-LIVE staging cierre → CRONISTA aplica transición `VERIFYING → DONE (v2.0 reusable, merge-post-LIVE-aprobado)` tras merge efectivo.
   - (b) pausar → unidad queda `READY_FOR_MERGE_POST_LIVE` hasta nueva decisión; runner v1.7 sigue operativo en `main`.
5. **W3 (test meta):** queda registrado en PROYECTO.md como pendiente menor; SOFIA L1 (1 línea) cuando estime, post-merge.

**No se ejecuta ningún paso del 1-5 en esta sesión INTEGRA.** La unidad queda `READY_FOR_MERGE_POST_LIVE`; merge, commit, push, deploy y autorización separada son responsabilidad de Frank.
