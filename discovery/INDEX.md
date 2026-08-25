# INDEX · Vector IA — Discovery funcional

**Versión:** 2026-08-24
**Estado:** `ready_for_integra`; la frontera Productos/Servicios, la política de roles base y la dirección visual están cerradas: toda oferta crea Proyecto, los roles seed siguen A1/B1/C1 y la UI usa Tailwind + shadcn/ui con tema VectorIA y paridad operativa en móvil, tableta y escritorio.
**Fuente funcional única:** `discovery/FUNCTIONAL-BASELINE.md` v1.12

El discovery funcional está consolidado, sin contradicciones P0 ni preguntas bloqueantes. El flujo de Proyectos fue cerrado y simulado antes del handoff. El antiguo gap de SPEC-002 quedó resuelto por `DEC-20260823-01`.

---

## 1. Documentos vigentes

| Archivo | Propósito | Estado |
|---|---|---|
| `FUNCTIONAL-BASELINE.md` | Fuente funcional canónica | READY |
| `HANDOFF-FUNCIONAL-A-INTEGRA.md` | Contrato de entrega funcional | READY |
| `ESTADO-FUNCIONAL.md` | Definition of Ready y estado por área | READY |
| `DECISIONES-FUNCIONALES.md` | 75 decisiones confirmadas | READY |
| `REGLAS-DE-NEGOCIO.md` | 246 reglas confirmadas con ID único | READY |
| `ACTORES-Y-PERMISOS.md` | Roles, visibilidad y acciones críticas | READY |
| `FLUJOS-FUNCIONALES.md` | Estados, transiciones y handoffs | READY |
| `HALLAZGOS.md` | Contradicciones históricas y resolución | READY |
| `PREGUNTAS-ABIERTAS.md` | Cero preguntas bloqueantes; `DISCOVERY-GAP-20260823-01` resuelto; Q-NB-3 resuelta | READY |
| `SIMULACIONES.md` | Índice y estado de simulaciones | READY |
| `OPEN-QUESTIONS.md` | Control de contaminación operativa | READY |
| `HALLAZGOS.md` § FND-20260824-01 | Inventario dirigido del cutover legacy→runtime | candidate; gate de implementación |
| `HALLAZGOS.md` § FND-20260824-02 | Drift contrato Coolify observado→runner | candidate; P0 V3; requiere decisión técnica |
| `HALLAZGOS.md` § FND-20260824-03 | REST Coolify omite logs de build en la respuesta observada | confirmed; P1 observabilidad V3 |
| `HALLAZGOS.md` § FND-20260824-04 | SPEC-002 no permite alta de prospecto desde UI | confirmed; P0 funcional |
| `HALLAZGOS.md` § FND-20260824-05 | Tema claro no visible en la captura inicial | superseded-by-evidence; P3 UX |
| `HALLAZGOS.md` § FND-20260824-06 | Rutas dashboard renderizan sin sesión Playwright | confirmed; P1 seguridad/UX |
| `HALLAZGOS.md` § FND-20260824-07 | Cobertura anterior validó shells, no el journey de negocio | confirmed; P0 proceso/producto |

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

## 5. Pendientes diferidos

Q-NB-3: política de desviación contra presupuesto declarado. Sólo afecta una automatización futura de Comercial. Si INTEGRA la necesita, emite `DISCOVERY-GAP`; no debe inferirla.

Suscripciones: ciclos mensual/trimestral/semestral/anual, gestión completa, autoridad por permiso, transiciones, origen desde OS y factura borrador por renovación confirmados en DEC-FUN-20260818-61 a -67. Puede pasar a SPEC técnica cuando cumpla sus dependencias.

---

## 6. Próximo propietario

INTEGRA puede continuar las especificaciones técnicas del alcance previo usando `HANDOFF-FUNCIONAL-A-INTEGRA.md`. Debe preservar los IDs DEC/BR/FLOW/SCN y devolver cualquier decisión nueva de producto a ATLAS/Frank. ATLAS entregará un delta funcional para Suscripciones antes de su SPEC técnica.
