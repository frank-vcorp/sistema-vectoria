# FLUJOS-FUNCIONALES · Vector IA

**Versión:** 2026-08-17 23:20
**Estado:** vigente y listo para handoff funcional.
**Convención:** describe comportamiento observable, actores, precondiciones, evidencia y resultados. No define tablas, endpoints, arquitectura ni stack.

---

## 1. Flujo principal

### Catálogo de flujos

| ID | Flujo |
|---|---|
| FLOW-COM-01 | Cuestionario → alcance firmado → cotización → OS |
| FLOW-OS-01 | Anticipo/información → autorización → creación del Proyecto |
| FLOW-PROJ-01 | Planeación → desarrollo → pruebas → validación → entrega |
| FLOW-PROJ-02 | Incorporación y asignación del equipo |
| FLOW-PROJ-03 | Exportación, revisión e importación del JSON Discovery |
| FLOW-PROJ-04 | Solicitud y ejecución de cambio de alcance |
| FLOW-PROJ-05 | Cierre técnico → OS entregada → cierre administrativo |

```text
Prospecto
  → cuestionario de sondeo
  → selección explícita de plantilla
  → alcance funcional generado por el sistema
  → revisión y firma del PL
  → cotización multi-línea
  → aceptación con evidencia
  → Orden de Servicio
  → anticipo y requisitos administrativos
  → autorización de inicio
  → proyecto creado con snapshot del alcance y PL
  → PL incorpora al equipo
  → plantilla crea el esqueleto inicial
  → JSON Discovery descompone y enriquece el plan de ejecución
  → ejecución por módulos
  → pruebas y entrega para validación del cliente
  → cierre técnico del proyecto
  → OS entregada
  → facturación y cobro conforme al plan comercial
  → cierre administrativo de la OS
```

---

## 2. Autoridad de los artefactos del Proyecto

| Artefacto | Propósito funcional | Puede modificar alcance vendido | Responsable de aprobación |
|---|---|---:|---|
| Cuestionario | Capturar necesidad y seleccionar el tipo de solución | No | Vendedor captura; PL revisa |
| Alcance firmado | Fuente original de incluido, excluido, entregables, supuestos y criterios de aceptación | Es inmutable | PL firma |
| Plantilla | Proporcionar módulos y elementos base reutilizables | No | PL confirma selección |
| JSON Discovery | Descomponer y enriquecer el plan de ejecución derivado | No | PL revisa y aprueba importación |
| Alcance efectivo | Alcance original más cambios autorizados | Sí, sólo mediante change request | Aprobadores aplicables |

Reglas:

- Reimportar la misma versión aprobada del JSON no crea duplicados.
- Una importación nueva muestra altas, cambios y conflictos antes de aplicarse.
- El JSON nunca cambia silenciosamente `included`, `excluded`, precio ni compromiso comercial.
- Lo que exceda el alcance se registra como solicitud de cambio.

---

## 3. Oportunidad, alcance, cotización y OS

### 3.1 Oportunidad

`nuevo → contactado → calificado → discovery_requerimientos → cotizacion_enviada → negociacion → ganado | perdido | suspendido`

- `calificado` requiere cuestionario completado.
- `ganado` ocurre al aceptar una cotización vigente.
- `perdido` y `suspendido` requieren motivo.

### 3.2 Alcance funcional firmado

`draft → in_review → signed`

- Lo genera el sistema desde cuestionario, catálogo y plantilla confirmada.
- El PL puede ajustarlo durante `draft` o `in_review`.
- `signed` es inmutable; cualquier variación posterior usa change request.
- Este artefacto de negocio no es la SPEC técnica de INTEGRA.

### 3.3 Cotización

`draft → internal_review → sent → negotiation → accepted | rejected | expired | cancelled`

- Es multi-línea.
- `accepted` requiere identidad del aceptante, fecha, medio y evidencia.
- La aceptación genera una sola OS de forma atómica.

### 3.4 Orden de Servicio

Flujo principal:

`pending_deposit → pending_information → authorized_to_start → in_execution → delivered → closed`

Estados laterales: `paused`, `cancelled`.

| Transición | Actor | Precondición | Resultado |
|---|---|---|---|
| A `authorized_to_start` | Administrador | Anticipo cumplido o excepción del Director; OC y datos fiscales completos; PL asignado | Autoriza creación del proyecto |
| A `in_execution` | Sistema | Proyecto creado correctamente | OS vinculada al proyecto |
| A `delivered` | Sistema, por cierre del PL | Proyecto cerrado técnicamente | La OS queda entregada aunque exista saldo pendiente |
| A `closed` | Administrador | Proyecto completado o cancelado; saldo total cero; factura final aplicable emitida | Cierre administrativo |
| Excepción de cierre | Director | Motivo y evidencia | Permite cierre con saldo o gate excepcional; queda auditado |
| A `paused` o `cancelled` | Actor con permiso | Motivo; en cancelación, decisión de reembolso | Conserva historial y detiene operación |

---

## 4. Creación y preparación del Proyecto

### 4.1 Workflow de creación

**Trigger:** OS pasa a `authorized_to_start`.

**Precondiciones:**

- Alcance firmado.
- Anticipo cumplido o excepción documentada.
- OC validada cuando aplique.
- PL asignado.
- No existe otro proyecto para la OS.

**Resultado indivisible:**

1. Proyecto creado en `planning/pending`.
2. Snapshot inmutable del alcance original y entregables base.
3. PL incorporado como miembro líder.
4. Esqueleto de la plantilla confirmada cargado.
5. OS actualizada a `in_execution`.
6. Evento registrado en bitácora.

La creación no asigna programadores. El PL incorpora miembros después.

### 4.2 Handoff Sistema → PL

| Entrega | Criterio de aceptación del PL | Si falla |
|---|---|---|
| Proyecto, alcance original, plantilla, entregables base y bitácora | Coinciden con la OS y el alcance firmado | PL no inicia planeación y reporta inconsistencia administrativa |

### 4.3 Incorporación del equipo

- El PL agrega primero a la persona como miembro del proyecto.
- Después asigna módulos o tareas.
- Una asignación concede la visibilidad necesaria sobre el proyecto.
- Al retirar la asignación se revoca acceso operativo futuro sin borrar historial ni evidencia.
- El técnico puede rechazar una tarea con motivo; vuelve a `ready` sin asignado y el PL recibe notificación.

---

## 5. Estados del Proyecto

El Proyecto mantiene tres dimensiones independientes:

- **Etapa:** `planning | development | testing | client_validation | delivery`.
- **Situación:** `pending | active | paused | completed | cancelled`.
- **Salud:** `on_track | at_risk | delayed`.

### 5.1 Transiciones canónicas

| Desde | Evento | Actor | Precondiciones | Hacia | Evidencia mínima |
|---|---|---|---|---|---|
| `planning/pending` | Iniciar planeación | PL | Proyecto creado y handoff aceptado | `planning/active` | Registro de inicio |
| `planning/active` | Aprobar plan inicial | PL | Equipo mínimo y descomposición aprobada | Permanece hasta iniciar módulo | Versión de plan aprobada |
| `planning/active` | Iniciar primer módulo | PL | Dependencias satisfechas | `development/active` | Módulo y responsable |
| `development/active` | Terminar desarrollo requerido | PL | Módulos requeridos técnicamente listos | `testing/active` | Resumen de módulos y pruebas |
| `testing/active` | Presentar entregables | PL | Pruebas bloqueantes técnicas aprobadas | `client_validation/active` | Entregables, fecha y contacto |
| `client_validation/active` | Cerrar técnicamente | PL | Gates de cierre cumplidos | `delivery/completed` | Checklist de cierre y aceptaciones |
| Cualquier situación operativa | Pausar | PL o Director | Motivo | Misma etapa / `paused` | Motivo y fecha |
| `paused` | Reactivar | PL o Director | Causa resuelta | Etapa previa / `active` | Resolución registrada |
| Cualquier situación no terminal | Cancelar | Director o actor autorizado | Motivo y decisión de reembolso | Misma etapa / `cancelled` | Aprobación y efecto comercial |

La salud se calcula por fechas, avance y bloqueos. El PL puede sobreescribirla con motivo; se conservan el valor calculado y el manual.

---

## 6. Módulos

Flujo principal: `pending → in_progress → testing → deployed`.

Laterales: `paused`, `blocked`, `cancelled`.

| Transición | Actor | Precondiciones |
|---|---|---|
| `pending → in_progress` | PL | Módulos requeridos en `deployed`; miembro responsable asignado |
| `in_progress → testing` | PL o responsable | Tareas requeridas terminadas con evidencia |
| `testing → deployed` | PL | Requerimientos validados internamente; tareas con evidencia; pruebas bloqueantes técnicas aprobadas; entregables preparados o presentados |
| A `blocked` | PL o responsable | Motivo y dependencia afectada |
| `blocked/paused → estado previo` | PL | Causa resuelta y registrada |
| A `cancelled` | PL con autorización aplicable | Motivo; revisión de dependencias, alcance, fechas y entregables |

`deployed` significa cierre técnico del módulo. La aceptación del cliente bloquea el cierre del Proyecto, no las dependencias normales entre módulos, salvo que una dependencia declare expresamente que requiere aceptación.

---

## 7. Requerimientos y tareas

### 7.1 Requerimiento

Flujo principal: `proposed → analysis → approved → development → testing → validated`.

Laterales: `rejected`, `out_of_scope`.

| Acción | Actor |
|---|---|
| Crear/proponer | Plantilla, JSON aprobado o PL |
| Analizar y aprobar | PL |
| Ejecutar | Técnico asignado |
| Validar | PL o QA asignado |
| Rechazar/fuera de alcance | PL, con motivo; fuera de alcance genera change request si se desea continuar |

### 7.2 Tarea

Flujo principal: `backlog → ready → in_progress → in_review → done`.

Laterales: `blocked`, `cancelled`.

| Evento | Resultado |
|---|---|
| Técnico rechaza asignación con motivo | `ready`, sin asignado, notificación al PL |
| Tarea se bloquea | `blocked`, conserva estado operativo previo |
| Se resuelve bloqueo | Regresa al estado operativo previo |
| Revisión rechazada | `in_progress` con observaciones |
| Revisión aprobada | `done` |

`done` exige checklist completo y evidencia. El tiempo es opcional. Revisa el PL o QA asignado; si la misma persona tiene roles combinados, la bitácora identifica el rol usado.

---

## 8. Pruebas y entregables

### 8.1 Pruebas

`pending → passed | failed | blocked | not_applicable`

- Bloquean cierre: `functional`, `visual`, `ui`, `acceptance`, `compatibility`.
- `performance` y `security` generan advertencia; permanecen visibles y pueden poner la salud `at_risk`.
- `failed` exige resultado e incidencia.
- `not_applicable` exige justificación y aprobación del PL.
- Una prueba `acceptance` sólo puede omitirse con excepción documentada del Director.

### 8.2 Entregables

Flujo principal: `pending → preparing → delivered → accepted`.

Corrección: `delivered → observed → corrected → delivered`.

`rejected` es una salida explícita con motivo. Si el trabajo continúa, se crea una corrección o un change request según corresponda.

### 8.3 Aceptación del cliente por proxy

El PL registra, no acepta. Son obligatorios:

- Nombre y organización de quien acepta.
- Fecha y medio de contacto.
- Evidencia, como correo, PDF, minuta o mensaje verificable.
- Entregable, versión y respuesta asociada.

Sin estos datos, el entregable no puede quedar `accepted`.

---

## 9. Cambios de alcance

Flujo:

`requested → analysis → quoted (si aplica) → authorized | rejected | cancelled → in_progress → implemented → validated`

- El PL analiza impacto técnico, horas, costo y fecha.
- Si hay impacto comercial, se genera cotización vinculada y se registra aceptación del cliente.
- Si no hay costo, se puede omitir `quoted`, pero nunca `authorized`.
- La autorización interna corresponde al actor con permiso `aprobar_cambios`; la aceptación comercial del cliente conserva evidencia.
- Al autorizar, se incrementa la versión del alcance efectivo y se actualiza el plan de ejecución sin alterar el alcance original.
- Al validar, se actualizan módulos, tareas, pruebas, entregables, fechas y dependencias afectadas.

---

## 10. Cierre técnico y administrativo

### 10.1 Gates de cierre técnico del Proyecto

El PL sólo puede cerrar técnicamente cuando:

1. No existen tareas críticas abiertas.
2. Los requerimientos obligatorios están validados.
3. Las pruebas bloqueantes están aprobadas o tienen excepción del Director.
4. Los entregables obligatorios están aceptados o tienen excepción del Director.
5. Las solicitudes de cambio autorizadas están implementadas y validadas, o formalmente canceladas.
6. La bitácora contiene evidencias y excepciones.

Resultado: Proyecto `delivery/completed`; OS `delivered`.

### 10.2 Facturación y cierre administrativo de OS

- La entrega técnica no depende del pago.
- La facturación sigue el plan vendido: pago único, mensualidades o suscripción.
- Cualquier factura final aplicable se emite antes del cierre administrativo.
- El Administrador cierra la OS cuando el proyecto está completado o cancelado y el saldo total pendiente es cero.
- Sólo el Director puede aprobar una excepción de saldo, con motivo, evidencia y auditoría.

---

## 11. Handoffs completos

| # | Origen → destino | Paquete entregado | Aceptación | Rechazo o devolución |
|---|---|---|---|---|
| 1 | Vendedor → PL | Cuestionario, necesidad, plantilla propuesta | PL confirma plantilla y alcance | Devuelve preguntas faltantes |
| 2 | PL → Vendedor | Alcance firmado | Listo para cotizar | Corrige antes de firmar |
| 3 | Vendedor → Administrador | Cotización aceptada y evidencia; OS | Cobro y requisitos administrativos | Solicita evidencia o datos |
| 4 | Administrador → Sistema | OS autorizada | Proyecto creado de forma indivisible | OS permanece sin iniciar |
| 5 | Sistema → PL | Proyecto, snapshot, plantilla y bitácora | PL inicia planeación | Reporta inconsistencia |
| 6 | PL → Programador/Diseñador/QA | Membresía, módulo/tarea, prioridad, criterio y fechas | Técnico acepta o comienza | Rechaza tarea con motivo |
| 7 | Programador/Diseñador → PL/QA | Trabajo, checklist y evidencia | Pasa revisión | Vuelve a `in_progress` con observaciones |
| 8 | PL → QA | Versión, alcance de prueba y criterios | QA ejecuta y registra | Bloquea por datos o entorno faltante |
| 9 | QA → PL | Resultado, incidencias y evidencia | PL avanza o corrige | Regresa a desarrollo |
| 10 | PL → Cliente | Entregable y criterio de aceptación | Cliente acepta u observa | Corrección o change request |
| 11 | Cliente → PL proxy | Respuesta y evidencia | PL registra identidad y medio | Sin evidencia no hay aceptación |
| 12 | PL → Administrador | Cierre técnico y gates | OS queda entregada; factura final si aplica | Devuelve si faltan evidencias |
| 13 | Administrador → Director | Solicitud de excepción o cierre | Director aprueba/rechaza; Admin ejecuta cierre | OS permanece entregada |

---

## 12. Reglas financieras relacionadas

- La comisión se libera sobre facturado, no sobre cobrado.
- Cancelar una factura reversa la porción correspondiente de comisión.
- Un cobro no sustituye la emisión de una factura.
- El cierre administrativo usa saldo total pendiente, no sólo saldo vencido.

---

## 13. Cobertura funcional del flujo

El flujo vigente se valida en `discovery/simulations/SIMULACION-FLUJO-PROYECTOS-20260817.md` con:

- Happy path completo.
- Tarea rechazada y reasignada.
- Bloqueo recuperable.
- Prueba bloqueante fallida.
- Entregable observado y corregido.
- Cambio de alcance con y sin costo.
- Cierre técnico con saldo pendiente.
- Cierre administrativo y excepción del Director.
- Cancelación y revisión de reembolso.
