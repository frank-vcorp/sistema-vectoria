# INDEX · Vector IA — Discovery funcional

**Versión:** 2026-08-17 23:20
**Estado:** `ready_for_integra`
**Fuente funcional única:** `discovery/FUNCTIONAL-BASELINE.md` v1.0

El discovery funcional está consolidado, sin contradicciones P0 ni preguntas bloqueantes. El flujo de Proyectos fue cerrado y simulado antes del handoff.

---

## 1. Documentos vigentes

| Archivo | Propósito | Estado |
|---|---|---|
| `FUNCTIONAL-BASELINE.md` | Fuente funcional canónica | READY |
| `HANDOFF-FUNCIONAL-A-INTEGRA.md` | Contrato de entrega funcional | READY |
| `ESTADO-FUNCIONAL.md` | Definition of Ready y estado por área | READY |
| `DECISIONES-FUNCIONALES.md` | 60 decisiones confirmadas | READY |
| `REGLAS-DE-NEGOCIO.md` | 231 reglas confirmadas con ID único | READY |
| `ACTORES-Y-PERMISOS.md` | Roles, visibilidad y acciones críticas | READY |
| `FLUJOS-FUNCIONALES.md` | Estados, transiciones y handoffs | READY |
| `HALLAZGOS.md` | Contradicciones históricas y resolución | READY |
| `PREGUNTAS-ABIERTAS.md` | Cero bloqueantes; Q-NB-3 diferida | READY |
| `SIMULACIONES.md` | Índice y estado de simulaciones | READY |
| `OPEN-QUESTIONS.md` | Control de contaminación operativa | READY |

---

## 2. Material histórico o de evidencia

| Ruta | Estado | Uso permitido |
|---|---|---|
| `sessions/DISCOVERY-20260814-01.md` | Histórico | Trazabilidad |
| `sessions/DISCOVERY-20260814-02.md` | Histórico | Trazabilidad |
| `simulations/SIMULACION-FLUJO-COMPLETO-20260817.md` | `AUDITADA_CON_HALLAZGOS` | Evidencia histórica, no contrato |
| `simulations/SIMULACION-FLUJO-PROYECTOS-20260817.md` | `VALIDADA_FUNCIONALMENTE` | Cobertura vigente de Proyectos |
| `REGLAS-V1-20260815-reconstruccion.md` | Cuaderno cerrado | Origen de reconstrucción |
| `archive/borradores-mixtos/*.json` | `SUPERSEDED` | No usar para implementar |
| `archive/*.bak` | Histórico | Respaldo |
| `assets/mermaid-diagram.png` | Recurso gráfico | Referencia visual |

---

## 3. Cierre funcional de Proyectos

Decisiones DEC-FUN-20260817-53 a DEC-FUN-20260817-60:

1. Selección explícita de plantilla.
2. Autoridad entre alcance, plantilla y JSON Discovery.
3. Aceptación del cliente registrada por proxy con evidencia.
4. Incorporación y asignación de programadores por el PL.
5. Cierre técnico y administrativo separados.
6. Transiciones canónicas del Proyecto.
7. `deployed` como cierre técnico del módulo.
8. Flujos de revisión, pruebas, entregables y cambios de alcance.

La simulación vigente cubre happy path, bloqueos, rechazos, pruebas fallidas, correcciones, cambios, saldo pendiente, excepción y cancelación.

---

## 4. Gate de handoff

| Criterio | Estado |
|---|---|
| Una fuente funcional vigente | ✅ |
| Alcance incluido/excluido | ✅ |
| Actores y permisos | ✅ |
| Decisiones y reglas con ID | ✅ |
| Flujos y escenarios | ✅ |
| Handoffs con aceptación/rechazo | ✅ |
| Preguntas funcionales bloqueantes | 0 |
| Contradicciones P0 vigentes | 0 |
| SPEC técnica creada por ATLAS | No, correctamente |
| Arquitectura o código creados por ATLAS | No, correctamente |

---

## 5. Pendiente diferido

Q-NB-3: política de desviación contra presupuesto declarado. Sólo afecta una automatización futura de Comercial. Si INTEGRA la necesita, emite `DISCOVERY-GAP`; no debe inferirla.

---

## 6. Próximo propietario

INTEGRA puede comenzar las especificaciones técnicas usando `HANDOFF-FUNCIONAL-A-INTEGRA.md`. Debe preservar los IDs DEC/BR/FLOW/SCN y devolver cualquier decisión nueva de producto a ATLAS/Frank.
