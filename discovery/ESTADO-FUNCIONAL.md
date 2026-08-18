# ESTADO-FUNCIONAL · Vector IA

**Versión:** 2026-08-17 23:20
**Fuente vigente:** `discovery/FUNCTIONAL-BASELINE.md` v1.0
**Estado general:** `ready_for_integra`

---

## 1. Definition of Ready funcional

| Criterio | Estado | Evidencia |
|---|---|---|
| Fuente y versión identificadas | ✅ | `FUNCTIONAL-BASELINE.md` v1.0 |
| Problema y resultado esperados | ✅ | Baseline §1 |
| Alcance incluido y excluido | ✅ | Baseline §2 |
| Actores y permisos | ✅ | `ACTORES-Y-PERMISOS.md` |
| Decisiones críticas con ID | ✅ | 60 decisiones confirmadas |
| Reglas críticas con ID | ✅ | 231 reglas confirmadas y únicas |
| Flujos y handoffs | ✅ | `FLUJOS-FUNCIONALES.md` |
| Escenarios representativos | ✅ | `SIMULACION-FLUJO-PROYECTOS-20260817.md` |
| Preguntas bloqueantes | ✅ | Ninguna |
| Contradicciones P0 vigentes | ✅ | Ninguna |
| Handoff explícito | ✅ | `HANDOFF-FUNCIONAL-A-INTEGRA.md` |

---

## 2. Estado por área

| Área | Estado para INTEGRA | Observación |
|---|---|---|
| Actores, roles y permisos | READY | Roles combinables y acciones críticas definidas |
| Clientes y prospectos | READY | Flujo base y visibilidad definidos |
| Cuestionarios, catálogo y plantillas | READY | Selección explícita de plantilla resuelta |
| Comercial y cotización | READY | Multi-línea, aceptación y descuentos definidos |
| Orden de Servicio | READY | Autorización, entrega y cierre separados |
| Proyectos | READY | Autoridad de artefactos, estados, permisos, handoffs y excepciones cerrados |
| Facturación | READY | FacturoPorTi confirmado |
| Cobranza y comisiones | READY | Comisión sobre facturado y flujo de cobro definidos |
| Finanzas | READY_WITH_DETAIL_GAPS | Reglas principales cerradas; INTEGRA puede dividir SPECs por capacidad |
| Dashboard y Administración | READY_WITH_DETAIL_GAPS | Comportamiento general cerrado; detalle de pantallas no es bloqueante para contratos base |

---

## 3. Cierre específico de Proyectos

Quedaron resueltos:

- Autoridad entre alcance firmado, plantilla y JSON Discovery.
- Selección de plantilla.
- Incorporación y visibilidad de programadores.
- Transiciones de Proyecto, módulo, requerimiento, tarea, prueba, entregable y change request.
- Evidencia obligatoria para revisión y aceptación.
- Handoffs PL, Programador, QA, Cliente y Administración.
- Diferencia entre cierre técnico, OS entregada y cierre administrativo.
- Facturación final y saldo requerido para cerrar la OS.
- Recuperación de bloqueos, rechazo de tarea y corrección de entregables.

Decisiones: DEC-FUN-20260817-53 a DEC-FUN-20260817-60.

---

## 4. Pendiente diferido

| ID | Área | Estado | Regla de escalamiento |
|---|---|---|---|
| Q-NB-3 | Comercial | `deferred_non_blocking` | INTEGRA emite `DISCOVERY-GAP` si necesita automatizar desviación contra presupuesto |

No bloquea Proyectos.

---

## 5. Simulaciones

| Simulación | Estado |
|---|---|
| SaaS original 17-ago | `AUDITADA_CON_HALLAZGOS`; histórica, no vigente como prueba del flujo |
| Flujo funcional de Proyectos 17-ago | `VALIDADA_FUNCIONALMENTE`; happy path + excepciones críticas |

---

## 6. Límites respetados

- No se creó arquitectura.
- No se eligió stack.
- No se diseñaron tablas, endpoints ni schemas.
- No se creó código.
- No se creó una SPEC técnica.

El siguiente propietario es INTEGRA, conforme a `HANDOFF-FUNCIONAL-A-INTEGRA.md`.
