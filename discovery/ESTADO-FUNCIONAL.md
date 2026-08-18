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

**Actualización 2026-08-17 22:00:** las 6 contradicciones P0 fueron resueltas con confirmación de Frank.

| # | Pregunta | Decisión | ID decisión |
|---|---|---|---|
| 1 | Vocabulario de estados de módulo | `pending → in_progress → testing → deployed` (+ laterales) | DEC-FUN-20260817-47 |
| 2 | Cotización multi-línea | Multi-línea | DEC-FUN-20260817-48 |
| 3 | Base de la comisión | Sobre FACTURADO (BR-N33 v2) | DEC-FUN-20260817-49 |
| 4 | Timbrado CFDI | Real con FacturoPorTi | DEC-FUN-20260817-50 |
| 5 | Conteos | 52 / 7+1+1 / 31 | DEC-FUN-20260817-51 |
| 6 | Reglas faltantes | Reconstruir con ATLAS | DEC-FUN-20260817-52 |

**Las 5 primeras contradicciones P0/P1 están RESUELTAS** (ver `HALLAZGOS.md` §resolved). La #6 (reconstrucción de las 150+ reglas) tiene plan y queda en sesión dedicada posterior.

**Estado del handoff a INTEGRA:** `conditionally_ready` — las 6 P0 cerradas, las 5 NB sin cerrar (no bloqueantes) y las 5 OOS operativas no son de discovery.

---

## 4. Estado de simulaciones

| Simulación | Estado |
|---|---|
| `discovery/simulations/SIMULACION-FLUJO-COMPLETO-20260817.md` | **AUDITADA_CON_HALLAZGOS** — No validada. Presenta cálculos erróneos, omisiones de facturación final, cobro final, cierre técnico y cierre administrativo. Ver detalle en `HALLAZGOS.md` §simulación. |

---

## 5. Estado del Discovery

**Discovery funcional: cerrado a nivel de descubrimiento** (alcance, actores, reglas clave con ID, decisiones confirmadas, contradicciones P0 resueltas).

**Discovery funcional: `conditionally_ready` para handoff a INTEGRA** — 6 contradicciones P0 resueltas, 5 preguntas NB sin cerrar (no bloqueantes), 5 OOS operativos fuera de scope de discovery, sesión futura de reconstrucción de 150+ reglas (DEC-FUN-20260817-52).

**Implementación: no iniciada.**

---

## 6. Cierre

| Ítem | Estado |
|---|---|
| Fuente funcional única vigente | ✅ `FUNCTIONAL-BASELINE.md` |
| Reglas de negocio con ID trazable | ✅ 31 reglas con ID confirmado. 150+ reglas con plan de reconstrucción (DEC-FUN-20260817-52). |
| Decisiones confirmadas | ✅ 52 decisiones (46 originales + 6 DEC-FUN-20260817-47 a -52 resultantes de la consolidación). |
| Contradicciones P0 | ✅ Las 6 contradicciones P0 resueltas. 5 marcadas `resolved` en HALLAZGOS. 1 con plan de reconstrucción. |
| Contradicciones visibles y trazadas | ✅ `HALLAZGOS.md` |
| Preguntas bloqueantes a Frank | ✅ `PREGUNTAS-ABIERTAS.md` (6 P0 cerradas, 5 NB sin cerrar no bloqueantes) |
| Simulación validada | ❌ No validada. AUDITADA_CON_HALLAZGOS. Se rehará contra la spec consolidada cuando se programe. |
| Arquitectura creada | ❌ No (fuera de scope de ATLAS) |
| Código implementado | ❌ No (fuera de scope) |
| Commit/push | ⏳ Pendiente OK de Frank (delta actual con las 6 decisiones) |
