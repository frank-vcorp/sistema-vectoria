# ADR-20260817-08 · Cuestionario de 4 capas, generación del alcance y JSON Discovery

- **ID:** ARCH-20260817-08
- **Estado:** proposed
- **Versión:** 1.0
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-19 (v1.0)
- **Fuentes funcionales:** `discovery/DECISIONES-FUNCIONALES.md` DEC-FUN-15 (JSON al final, no round-trip continuo), DEC-FUN-18 (3 versiones del cuestionario), DEC-FUN-44 (4 capas adaptativas), DEC-FUN-45 (editor visual drag&drop), DEC-FUN-53 (selección explícita de plantilla), DEC-FUN-20260817-23 (regla de oro: vendedor no hace spec con IA); `discovery/REGLAS-DE-NEGOCIO.md` B4 (BR-N149, BR-N219..N225), B5 (BR-N226..N230), B6 (BR-N51, BR-N52, BR-N231..N233), B25 (BR-N351); `discovery/FLUJOS-FUNCIONALES.md` §2 (autoridad de artefactos), §3.2 (alcance firmado).
- **Stack asumido:** ADR-20260817-01 v1.3.

---

## 1. Contexto
El descubrimiento comercial parte de un **cuestionario de sondeo** que el Vendedor aplica. La **regla de oro** (DEC-FUN-23, BR-N220) prohíbe que el Vendedor escriba el spec o genere JSON de spec con IA: el **sistema** genera el borrador de alcance desde cuestionario + catálogo + plantilla. El cuestionario es **dato** (preguntas editables por Director, no código — BR-N222), estructurado en 4 capas (DEC-FUN-44) y admite 3 versiones (DEC-FUN-18). El JSON Discovery **descompone** el proyecto tras el spec firmado, no crea el alcance (BR-N351). La autoridad de artefactos (DEC-FUN-54, FLUJOS §2) es: alcance firmado = verdad original; plantilla = esqueleto; JSON = plan derivado.

## 2. Opciones consideradas
### 2.1 Estructura del cuestionario
| Opción | Pros | Contras |
|---|---|---|
| **A. 4 capas adaptativas (DEC-FUN-44)** | Base universal + por tipo + por servicio + sub-cuestionarios condicionales; 5-32 preguntas | Más complejo que un formulario plano |
| B. Formulario lineal | Simple | No captura la complejidad; no adapta por servicio |

### 2.2 Generación del spec
| Opción | Pros | Contras |
|---|---|---|
| **A. Sistema genera borrador desde cuestionario+catálogo+plantilla; PL revisa/firma** | Cumple regla de oro; trazable | Requiere motor de generación |
| B. IA genera spec | Rápido | Prohíbe DEC-FUN-23 (vendedor no hace spec con IA) |
| C. PL escribe spec manual | Flexible | Prohíbe BR-N220 (sistema lo genera) |

### 2.3 Preguntas como dato
| Opción | Pros | Contras |
|---|---|---|
| **A. Preguntas en BD, editables por Director con editor visual (DEC-FUN-45)** | Cumple "todo dato"; reutilizable (BR-N225) | Editor drag&drop requiere UI |
| B. Preguntas en código | Simple | Prohíbe BR-N222 (no código) |

## 3. Decisión
**A · A · A.**
| Dimensión | Decisión |
|---|---|
| Cuestionario | 4 capas: (1) base universal 5 preguntas; (2) por tipo de proyecto 5-10; (3) por servicio seleccionado 2-4 c/u; (4) sub-cuestionarios condicionales (UX, seguridad, accesibilidad, capacitación). Total 5-32 (DEC-FUN-44, BR-N219/224). |
| Versiones | 3: digital (captura en pantalla), imprimible (PDF para marcar a mano), guía del vendedor (tips) (DEC-FUN-18, BR-N221). |
| Preguntas como dato | Tabla `questionnaire_questions` por capa con `condition` (activación de sub-cuestionarios, BR-N223); reutilizables por servicio (BR-N225); editables por Director con editor visual drag&drop + vista previa (DEC-FUN-45, BR-N222). |
| Selección de plantilla | El cuestionario exige seleccionar explícitamente el tipo (`web_landing`/`web_sitio`/`web_app`/`web_saas` u otro); el sistema puede advertir inconsistencias; el PL confirma antes de firmar (DEC-FUN-53, BR-N230). |
| Generación del spec | El **sistema** genera el borrador de alcance (`draft`) desde cuestionario + catálogo + plantilla; el PL lo revisa, ajusta y firma (`draft → in_review → signed`). Regla de oro: ni el Vendedor ni una IA externa escriben el spec (DEC-FUN-23, BR-N220/231). |
| Contenido del spec | Incluido/excluido, entregables, supuestos, dependencias del cliente, criterios de aceptación (BR-N233). `signed` = inmutable (BR-N52); cambios via change request (BR-N232). |
| JSON Discovery | **Descompone** el proyecto en módulos/tareas/pruebas/entregables tras el spec firmado; **no crea** el alcance (BR-N351, DEC-FUN-15). El round-trip (descarga/importa/versionado) lo formaliza ADR-11. |

## 4. Contratos fijados
1. Cuestionario = 4 capas adaptativas, 5-32 preguntas, dato editable por Director, 3 versiones.
2. **Regla de oro:** el sistema genera el spec; vendedor/IA no lo escriben.
3. Selección explícita de plantilla en el cuestionario, confirmada por PL.
4. Spec `signed` inmutable; cambios via change request.
5. JSON Discovery descompone (no crea alcance); su round-trip en ADR-11.

## 5. Consecuencias
- **Positivas:** cumple la regla de oro y "todo dato"; el spec es trazable a cuestionario+catálogo+plantilla; el PL conserva autoridad de firma.
- **Negativas:** requiere un motor de generación del borrador y un editor visual (esfuerzo UI; builders drag&drop responsive — AC-58 SPEC-001).
- **Reversibilidad:** las preguntas como dato permiten cambiar el cuestionario sin reprogramar.

## 6. Restricciones para SPECs
- SPEC-003 (Comercial) implementa cuestionarios, catálogo, plantillas, alcance y cotización; cita este ADR y ADR-11.
- SPEC-005 (Proyectos) consume el JSON Discovery (round-trip ADR-11) y el `sold_scope_snapshot`.
- SPEC-010 (Admin) aloja el editor visual de cuestionarios.

## 7. Pendientes
- **P-08-1 (Frank/SPEC-003):** definir el contenido semilla de los 6 cuestionarios (conteo de semilla en ADR-04 §2.4) y el catálogo base de servicios.
- **P-08-2 (Frank):** confirmar la lista de sub-cuestionarios condicionales iniciales (UX, seguridad, accesibilidad, capacitación).

## 8. Referencias cruzadas
- Derivado de: DEC-FUN-15/18/23/44/45/53, B4/B5/B6/B25.
- Relacionado: ADR-20260817-11 (JSON round-trip), ADR-01 (stack), ADR-03 (editor visual responsive).
- Aplica a: SPEC-003 (Comercial), SPEC-005 (Proyectos), SPEC-010 (Admin/editor).
