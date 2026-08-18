# INDEX · Vector IA — Discovery

**Versión:** 2026-08-17 (actualizado 22:51)
**Estado del discovery:** `ready_for_integra` — consolidación funcional hecha, 6 contradicciones P0 resueltas, 205 reglas de negocio confirmadas (reconstrucción cerrada DEC-FUN-52), 52 decisiones confirmadas, 5 preguntas NB no bloqueantes sin cerrar, 5 OOS operativos fuera de scope. ATLAS puede emitir `FUNCTIONAL-HANDOFF` a INTEGRA.

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

| # | Bloqueador | Severidad | Estado al 2026-08-17 22:51 |
|---|---|---|---|
| 1 | Vocabulario único de estados de módulo | P0 | ✅ Resuelto (DEC-FUN-20260817-47) |
| 2 | Cotización multi-línea vs 1 línea | P0 | ✅ Resuelto (DEC-FUN-20260817-48) |
| 3 | Base de la comisión (facturado vs cobrado) | P0 | ✅ Resuelto (DEC-FUN-20260817-49) |
| 4 | Timbrado CFDI (real vs externo) | P0 | ✅ Resuelto (DEC-FUN-20260817-50) |
| 5 | Conteos (decisiones / reglas / módulos) | P0 | ✅ Resuelto (DEC-FUN-20260817-51) |
| 6 | Archivo `DECISIONES-V1-20260815.md` no localizado | P0 | ✅ Reconstrucción cerrada (DEC-FUN-20260817-52) — 205 reglas confirmed |

**Las 6 contradicciones P0 están RESUELTAS y la reconstrucción de las 150+ reglas está CERRADA.** ATLAS puede emitir `FUNCTIONAL-HANDOFF` a INTEGRA.

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

- **Estado actual:** `ready_for_integra` — consolidación funcional hecha, 6 contradicciones P0 resueltas, 205 reglas confirmed (DEC-FUN-52 cerrada), 52 decisiones confirmadas.
- **Próximo paso:** ATLAS emite `FUNCTIONAL-HANDOFF` a INTEGRA con:
  - 52 decisiones (DECISIONES-FUNCIONALES.md)
  - 205 reglas firmes + 2 proposed amarradas a Q-NB-1 y Q-NB-2 (REGLAS-DE-NEGOCIO.md)
  - Flujos y actores completos (FLUJOS-FUNCIONALES.md + ACTORES-Y-PERMISOS.md)
  - 5 preguntas NB sin cerrar (no bloqueantes) para que INTEGRA las eleve si las necesita
  - Aviso de la simulación AUDITADA_CON_HALLAZGOS (se rehará cuando se programe)
- **Las 2 proposed (BR-N230 y BR-N287) y 3 reglas sin ID** se resuelven cuando Frank cierre Q-NB-1 a Q-NB-5.

---

## 9. Cambios respecto al estado anterior

### Cambio 1 (c9ab8e3 → b615379): reorganización inicial
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

### Cambio 2 (b615379 → pendiente): cierre de las 6 P0
- `DECISIONES-FUNCIONALES.md`: append de DEC-FUN-20260817-47 a -52 (las 6 decisiones nuevas).
- `REGLAS-DE-NEGOCIO.md`: aviso de vocabulario único + nota sobre 150+ reglas con plan.
- `HALLAZGOS.md`: 5 contradicciones P0/P1 marcadas `resolved` con la decisión que las cierra; H-06 marcada `confirmed (con plan)`.
- `ESTADO-FUNCIONAL.md`: estado pasa a `conditionally_ready` para handoff a INTEGRA.
- `INDEX.md`: tabla de bloqueadores actualizada, handoff a `conditionally_ready`.

---

## 10. Para Frank

- Las 6 contradicciones P0 están resueltas; la reconstrucción de las 150+ reglas está cerrada (205 confirmed).
- El discovery está `ready_for_integra`.
- ATLAS puede emitir `FUNCTIONAL-HANDOFF` a INTEGRA en cuanto lo indiques.
- Las 5 preguntas NB (Q-NB-1 a Q-NB-5) no bloquean el handoff; se elevan a INTEGRA para que las resuelva durante la fase técnica o con Frank si lo necesita.
