# ESTADO-FUNCIONAL · Vector IA

**Versión:** 2026-08-17
**Fuente funcional vigente:** `discovery/FUNCTIONAL-BASELINE.md`
**Documento:** estado de cierre por área funcional, no por módulo técnico.

---

## 1. Áreas cerradas

| # | Área | Estado | Evidencia |
|---|---|---|---|
| CF-1 | Actores (7 roles combinables) | ✅ Cerrado | `FUNCTIONAL-BASELINE.md` §2 |
| CF-2 | Visibilidad por rol (resumen) | ✅ Cerrado | `FUNCTIONAL-BASELINE.md` §2.2 |
| CF-3 | Permisos sin hardcoding (datos, no código) | ✅ Cerrado | `FUNCTIONAL-BASELINE.md` §13, §17 |
| CF-4 | Regla de oro del sistema (comercial / proyectos / finanzas) | ✅ Cerrado | `FUNCTIONAL-BASELINE.md` §1 |
| CF-5 | Cuestionario en 4 capas adaptativas | ✅ Cerrado | `FUNCTIONAL-BASELINE.md` §5 |
| CF-6 | Tres versiones del cuestionario (digital / imprimible / guía) | ✅ Cerrado | `FUNCTIONAL-BASELINE.md` §5.2 |
| CF-7 | Regla "vendedor no hace spec con IA" (sistema genera) | ✅ Cerrado | `FUNCTIONAL-BASELINE.md` §16.2 |
| CF-8 | Flujo principal cotizar → OS → proyecto | ✅ Cerrado | `FUNCTIONAL-BASELINE.md` §8 |
| CF-9 | Comisión 4 estados (estimada/devengada/liberada/pagada) | ✅ Cerrado | `FUNCTIONAL-BASELINE.md` §9 |
| CF-10 | Calendario de facturación con 7 estados visuales | ✅ Cerrado | `FUNCTIONAL-BASELINE.md` §11 |
| CF-11 | 7 tipos de tests (bloqueantes / advertencia) | ✅ Cerrado | `FUNCTIONAL-BASELINE.md` §14 |
| CF-12 | Catálogo de servicios y plantillas seed | ✅ Cerrado | `FUNCTIONAL-BASELINE.md` §4 |
| CF-13 | Decisión ratificada 17-ago: 52 decisiones | ⚠️ Conteo contradicho (ver HALLAZGOS) | `FUNCTIONAL-BASELINE.md` §16 |

---

## 2. Áreas pendientes (no bloqueantes para descubrimiento, sí para INTEGRA)

| # | Área | Pendiente | Bloqueante |
|---|---|---|---|
| PF-1 | Diseño completo del módulo Finanzas (énfasis Director) | Faltan pantallas y reglas de rentabilidad | No para discovery |
| PF-2 | Diseño completo del módulo Administración | Faltan pantallas de catálogos, plantillas, cuestionarios | No para discovery |
| PF-3 | Diseño completo del módulo Hoy/Dashboard | Faltan widgets por rol | No para discovery |
| PF-4 | 150+ reglas detalladas del archivo `DECISIONES-V1-20260815.md` | Archivo no existe en repo | No para discovery (se reconstruye cuando Frank apruebe) |
| PF-5 | Mapeo catálogo "Sistema Web" → plantilla (`web_sitio`/`web_app`/`web_saas`) | Cómo decide el sistema | No para discovery (afecta cuestionario) |
| PF-6 | Regla de desviación presupuestal | Cotización excede presupuesto declarado sin advertencia | No para discovery |
| PF-7 | Trazabilidad del "registrador" vs "quien acepta" en proxy PL | Cómo distinguir al PL como registrador de aceptación del cliente | No para discovery |

---

## 3. Áreas bloqueantes para Frank (PREGUNTAS-ABIERTAS)

Las **5 contradicciones P0** listadas en `discovery/HALLAZGOS.md` y reflejadas en `discovery/PREGUNTAS-ABIERTAS.md` deben resolverse antes de que ATLAS emita `FUNCTIONAL-HANDOFF` a INTEGRA. Cada decisión cambia reglas de negocio y por tanto NO puede decidirse por INTEGRA ni por timeout.

Resumen ejecutivo (ver detalle en `HALLAZGOS.md` y `PREGUNTAS-ABIERTAS.md`):

1. **Vocabulario único de estados de módulo de proyecto** (3 vocabularios en uso).
2. **Cotización multi-línea vs 1 línea** (3 fuentes, 2 versiones distintas).
3. **Base de la comisión: facturado vs cobrado** (JSON archive contradice la regla vigente).
4. **Timbrado CFDI real con FacturoPorTi vs CFDI externo** (JSON archive contradice la decisión 17-ago).
5. **Conteo de decisiones / reglas / módulos** (4 fuentes, 4 cifras distintas).

---

## 4. Estado de simulaciones

| Simulación | Estado |
|---|---|
| `discovery/simulations/SIMULACION-FLUJO-COMPLETO-20260817.md` | **AUDITADA_CON_HALLAZGOS** — No validada. Presenta cálculos erróneos, omisiones de facturación final, cobro final, cierre técnico y cierre administrativo. Ver detalle en `HALLAZGOS.md` §simulación. |

---

## 5. Estado del Discovery

**Discovery funcional: cerrado a nivel de descubrimiento (alcance, actores, reglas clave, decisiones documentadas).**

**Discovery funcional: NO cerrado para handoff a INTEGRA**, hasta que Frank responda las 5 contradicciones P0 en `PREGUNTAS-ABIERTAS.md`.

**Implementación: no iniciada.**

---

## 6. Cierre

| Ítem | Estado |
|---|---|
| Fuente funcional única vigente | ✅ `FUNCTIONAL-BASELINE.md` |
| Reglas de negocio con ID trazable | ✅ 31 reglas con ID confirmado en repo. 150+ reglas pendientes (archivo de archive no localizado). |
| Decisiones confirmadas | ⚠️ 52 decisiones ratificadas, con conteo contradicho en cabecera de otros documentos |
| Simulación validada | ❌ No validada. AUDITADA_CON_HALLAZGOS. |
| Contradicciones visibles y trazadas | ✅ `HALLAZGOS.md` |
| Preguntas bloqueantes a Frank | ✅ `PREGUNTAS-ABIERTAS.md` (5 P0) |
| Arquitectura creada | ❌ No (fuera de scope de ATLAS) |
| Código implementado | ❌ No (fuera de scope) |
| Commit/push | ❌ Pendiente OK de Frank |
