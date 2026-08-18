# INDEX · Vector IA — Discovery

**Versión:** 2026-08-17
**Estado del discovery:** cerrado a nivel de descubrimiento. **NO cerrado para handoff a INTEGRA** hasta que Frank responda las 5 contradicciones P0 en `PREGUNTAS-ABIERTAS.md`.

---

## 1. Fuente funcional vigente

**Único documento funcional canónico:** `discovery/FUNCTIONAL-BASELINE.md`
Versión: v0 (post-reorganización 2026-08-17).
Status: consolidado; **NO** es especificación técnica.

---

## 2. Estructura del discovery

| Archivo | Propósito | Vigente |
|---|---|---|
| `discovery/INDEX.md` | Este archivo | ✅ |
| `discovery/FUNCTIONAL-BASELINE.md` | Fuente funcional canónica | ✅ |
| `discovery/ESTADO-FUNCIONAL.md` | Cierre por área (cerrado / pendiente / bloqueante) | ✅ |
| `discovery/HALLAZGOS.md` | Hallazgos con severidad (P0–P3) y evidencia | ✅ |
| `discovery/DECISIONES-FUNCIONALES.md` | Decisiones confirmadas con trazabilidad | ✅ |
| `discovery/REGLAS-DE-NEGOCIO.md` | Reglas con ID y cálculos | ✅ |
| `discovery/ACTORES-Y-PERMISOS.md` | Roles, permisos, visibilidad, acciones | ✅ |
| `discovery/FLUJOS-FUNCIONALES.md` | Estados, transiciones, handoffs | ✅ |
| `discovery/PREGUNTAS-ABIERTAS.md` | Preguntas para Frank (P0 blocking + NB) | ✅ |
| `discovery/SIMULACIONES.md` | Índice de simulaciones y su estado de revisión | ✅ |
| `discovery/OPEN-QUESTIONS.md` | Preguntas operativas fuera del scope de discovery | ✅ |

---

## 3. Material histórico (archivado, NO vigente)

| Ruta | Origen | Estado |
|---|---|---|
| `discovery/sessions/DISCOVERY-20260814-01.md` | Sesión 14-ago (diseño inicial) | histórico |
| `discovery/sessions/DISCOVERY-20260814-02.md` | Sesión 14-ago (cierre diagrama) | histórico |
| `discovery/simulations/SIMULACION-FLUJO-COMPLETO-20260817.md` | Simulación interactiva 17-ago | AUDITADA_CON_HALLAZGOS |
| `discovery/archive/sistema-vectoria-discovery.mmd.bak` | Respaldo de diagrama mermaid | histórico |
| `discovery/archive/borradores-mixtos/vectoria_especificacion_sistema_administrativo_mvp.json` | Especificación funcional JSON, 13-ago, **SUPERSEDED** — NO UTILIZAR PARA IMPLEMENTACIÓN | superseded |
| `discovery/assets/mermaid-diagram.png` | Render del diagrama (movido a assets/) | vigente como recurso gráfico |

---

## 4. Bloqueadores para handoff a INTEGRA

| # | Bloqueador | Severidad | Acción |
|---|---|---|---|
| 1 | Vocabulario único de estados de módulo | P0 | Responder Q-P0-1 |
| 2 | Cotización multi-línea vs 1 línea | P0 | Responder Q-P0-2 |
| 3 | Base de la comisión (facturado vs cobrado) | P0 | Responder Q-P0-3 |
| 4 | Timbrado CFDI (real vs externo) | P0 | Responder Q-P0-4 |
| 5 | Conteos (decisiones / reglas / módulos) | P0 | Responder Q-P0-5 |
| 6 | Archivo `DECISIONES-V1-20260815.md` no localizado | P0 | Responder Q-P0-6 |

**Mientras estos 6 puntos P0 no estén resueltos, ATLAS no emite `FUNCTIONAL-HANDOFF` a INTEGRA.**

---

## 5. Preguntas no bloqueantes (diferibles)

Ver `PREGUNTAS-ABIERTAS.md` sección NB:
- Q-NB-1: mapeo catálogo → plantilla.
- Q-NB-2: aceptación del cliente vía proxy PL.
- Q-NB-3: regla de desviación presupuestal.
- Q-NB-4: asignación de programadores.
- Q-NB-5: cierre técnico vs cierre administrativo.

---

## 6. Estado de simulaciones

- `SIM-20260817-01` (SaaS de Facturación Interna): **AUDITADA_CON_HALLAZGOS** — no validada. Se rehará contra spec consolidada.

---

## 7. Verificación de límites

| Límite | Cumplido |
|---|---|
| SPEC técnica creada | ❌ No (out of scope ATLAS) |
| Arquitectura creada | ❌ No (out of scope) |
| Código implementado | ❌ No (out of scope) |
| Commit / push | ❌ Pendiente OK de Frank |
| Stack tecnológico | ❌ No decidido |
| Tablas / endpoints / schemas | ❌ No creados |
| ADR | ❌ No creado |

---

## 8. Handoff

- **Estado actual:** `conditionally_ready` (consolidación funcional hecha, faltan respuestas P0).
- **Próximo paso:** Frank responde las 5+1 preguntas P0 en `PREGUNTAS-ABIERTAS.md`.
- **Cuando Frank responda:** ATLAS consolida respuestas, actualiza HALLAZGOS / DECISIONES-FUNCIONALES / FUNCTIONAL-BASELINE y emite `FUNCTIONAL-HANDOFF` a INTEGRA.

---

## 9. Cambios respecto al estado anterior

| Antes (c9ab8e3) | Ahora |
|---|---|
| `PROYECTO.md` único | `FUNCTIONAL-BASELINE.md` canónico + 10 documentos funcionales especializados |
| `vectoria_especificacion_..._mvp.json` marcado `ready_for_build` | JSON movido a `archive/borradores-mixtos/` con tag **SUPERSEDED** |
| `DISCOVERY-20260814-*.md` en raíz | Movidos a `sessions/` |
| `SIMULACION-...md` en raíz | Movida a `simulations/` con estado AUDITADA_CON_HALLAZGOS |
| `sistema-vectoria-discovery.mmd.bak` en raíz | Movido a `archive/` |
| `mermaid-diagram.png` en raíz | Movido a `assets/` |
| Sin rastreo de contradicciones | `HALLAZGOS.md` con 15 hallazgos (severidad, evidencia, propuesta) |
| Sin preguntas estructuradas | `PREGUNTAS-ABIERTAS.md` con 6 P0 y 5 NB |
| Reglas dispersas | `REGLAS-DE-NEGOCIO.md` con tabla consolidada y cálculos |

---

## 10. Para Frank

- Revisar `HALLAZGOS.md` para entender el estado real de las contradicciones.
- Responder las 6 preguntas P0 en `PREGUNTAS-ABIERTAS.md` (incluye opciones y recomendación ATLAS).
- Indicar si quiere commitear la reorganización tal cual (todo el material está staged vía `git mv`; ningún commit realizado todavía).
