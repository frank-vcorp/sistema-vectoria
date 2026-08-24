# ADR-20260817-11 · JSON Discovery round-trip y versionado

- **ID:** ARCH-20260817-11
- **Estado:** proposed
- **Versión:** 1.0
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-19 (v1.0)
- **Fuentes funcionales:** `discovery/DECISIONES-FUNCIONALES.md` DEC-FUN-15 (JSON al final, no round-trip continuo), DEC-FUN-54 (autoridad entre alcance/plantilla/JSON), DEC-FUN-20260817-47 (vocabulario único); `discovery/REGLAS-DE-NEGOCIO.md` B25 (BR-N351..N356, BR-N396..N398), B9 (BR-N380/381), B16 (BR-N296); `discovery/FLUJOS-FUNCIONALES.md` §2 (autoridad de artefactos), FLOW-PROJ-03.
- **Stack asumido:** ADR-20260817-01 v1.3.

---

## 1. Contexto
El JSON Discovery es el **plan de ejecución derivado** que descompone el proyecto en módulos, requerimientos, tareas, pruebas y entregables (BR-N351). Se descarga como **plantilla vacía**, se trabaja en herramientas externas (ChatGPT/VS Code) y se **importa** con los identificadores reales (BR-N352). Las instrucciones para IA permiten agregar/modificar elementos pero **prohíben** modificar el identificador del proyecto, el folio y el alcance incluido (BR-N353). Toda desviación del alcance se agrega como **solicitud de cambio** (BR-N354, BR-N296). El PL revisa y aprueba la importación; la misma versión no duplica elementos (BR-N397); cada importación conserva versión, actor, fecha y resultado (BR-N398).

La **autoridad** (DEC-FUN-54, FLUJOS §2): alcance firmado = verdad original inmutable; plantilla = esqueleto inicial; JSON = plan derivado; alcance efectivo = alcance original + cambios autorizados. Ninguno altera silenciosamente el alcance firmado (BR-N380/381).

## 2. Opciones consideradas
### 2.1 Round-trip
| Opción | Pros | Contras |
|---|---|---|
| **A. Descarga plantilla vacía → trabajo externo → importa con IDs reales + diff + versionado (BR-N352/396/398)** | Trazable; no duplica; el PL aprueba diferencias | Requiere motor de diff y resolución de conflictos |
| B. Edición continua en el sistema | Sin import/export | Prohíbe DEC-FUN-15 (JSON al final, no continuo); no permite trabajo externo con IA |
| C. IA edita el plan en vivo | Rápido | Prohíbe BR-N353 (no modifica IDs/alcance); sin revisión del PL |

### 2.2 Autoridad frente al alcance
| Opción | Pros | Contras |
|---|---|---|
| **A. Alcance firmado inmutable; JSON sólo descompone; desviaciones via change request (DEC-FUN-54)** | Preserva verdad vendida | Requiere disciplina de diff |
| B. JSON puede ajustar alcance | Flexible | Prohíbe BR-N380/381 |

## 3. Decisión
**A · A.**
| Dimensión | Decisión |
|---|---|
| Round-trip | (1) El PL descarga el JSON como **plantilla vacía** con los IDs reales del proyecto (proyecto_id, folios reservados). (2) Se trabaja en herramientas externas siguiendo instrucciones para IA (BR-N353: permite agregar/modificar tareas/reqs/entregables/pruebas; prohíbe tocar `proyecto_id`, `folio`, `alcance_incluido`). (3) Al importar, el sistema muestra al PL **altas, cambios y conflictos** (BR-N396) y sólo la aprobación del PL actualiza el plan vigente (BR-N398). (4) Reimportar la **misma versión aprobada** no duplica elementos (BR-N397). |
| Versionado | Cada importación conserva `version`, `actor`, `fecha`, `resultado` (BR-N398). El plan vigente es el de la última aprobación del PL. |
| Autoridad | Alcance firmado inmutable (BR-N52/380); el JSON **no crea** el alcance ni lo altera (BR-N351/381). Toda desviación se registra como **solicitud de cambio** (BR-N354, flujo B16). |
| Inmutables en el JSON | `project_id`, folios, `included` (alcance incluido), precio ni compromiso comercial (FLUJOS §2). |
| Vocabulario | Estados de módulo/tarea/etc. usan el vocabulario único de DEC-FUN-47 (B9/B10/B11/B12). |

## 4. Contratos fijados
1. JSON = plan derivado versionado; no crea ni altera el alcance firmado.
2. Round-trip con diff + aprobación del PL; reimport idempotente (no duplica).
3. Campos inmutables en el JSON: `project_id`, folios, `included`, precio/compromiso.
4. Desviaciones → change request (B16).
5. Cada importación versionada con actor/fecha/resultado.

## 5. Consecuencias
- **Positivas:** permite usar IA externa para descomponer sin perder autoridad ni trazabilidad; el PL controla qué entra.
- **Negativas:** requiere un motor de diff/merge de JSON (esfuerzo; validación de esquema Zod del JSON).
- **Reversibilidad:** el plan vigente puede reemplazarse por una importación aprobada anterior (versión).

## 6. Restricciones para SPECs
- SPEC-005 (Proyectos) implementa la exportación (plantilla vacía con IDs), importación (diff, aprobación, versionado) y el plan de ejecución derivado; cita este ADR.
- SPEC-006 consume el plan (módulos/tareas/reqs/pruebas/entregables).
- SPEC-003 asegura que el `sold_scope_snapshot` (copia inmutable) alimenta la validación de inmutables del JSON.

## 7. Pendientes
- **P-11-1 (SPEC-005/SOFIA):** esquema Zod del JSON Discovery (contrato de forma) y motor de diff (decisión interna reversible de SOFIA dentro del contrato de este ADR).
- **P-11-2 (Frank):** confirmar si las instrucciones para IA (BR-N353) se incluyen como texto semilla exportable.

## 8. Referencias cruzadas
- Derivado de: DEC-FUN-15/54, B25 (BR-N351-356, N396-398), B9 (BR-N380/381), B16 (BR-N296).
- Relacionado: ADR-20260817-08 (cuestionario/generación del spec), ADR-01, ADR-03 (UI del diff responsive).
- Aplica a: SPEC-005 (Proyectos — artefactos y estados), SPEC-006 (ejecución).
