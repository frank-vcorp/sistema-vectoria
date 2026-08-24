# Vector IA · Discovery funcional consolidado

**Versión:** v1.12
**Fecha:** 2026-08-20
**Estado:** `ready_for_integra`; el delta de Suscripciones, la frontera Productos/Servicios y la política de roles base están cerrados funcionalmente.
**Naturaleza:** fuente funcional vigente. No es arquitectura ni especificación técnica.
**Fuentes incorporadas:** sesiones del 14 y 17 de agosto, reconstrucción de reglas, auditoría funcional, cierre de Proyectos DEC-FUN-53 a DEC-FUN-60 y delta de Suscripciones DEC-FUN-20260818-61 a -68.

---

## 1. Propósito

Vector IA Administración es una aplicación web interna para controlar el proceso comercial, técnico y financiero de una empresa pequeña de desarrollo de software y automatizaciones apoyadas con IA.

- Equipo esperado: 4 a 10 personas.
- Operación inicial: una organización en México y moneda MXN.
- Multi-organización latente para crecimiento futuro.
- Idioma del MVP: español de México.

**Regla de oro:**

> Comercial define qué se vendió; Proyectos controla cómo se ejecuta; Finanzas determina cuánto se facturó, cobró, costó y ganó.

---

## 2. Alcance funcional y exclusiones

### 2.1 Incluido en el MVP

- Usuarios, roles combinables y permisos configurables.
- Clientes, prospectos y cuestionarios de sondeo.
- Alcance funcional firmado, cotización multi-línea y Orden de Servicio.
- Proyectos modulares con requerimientos, tareas, pruebas, entregables y cambios de alcance.
- Facturación CFDI 4.0 con FacturoPorTi.
- Cobranza, cobros, comisiones, cuentas y movimientos financieros.
- Catálogos, plantillas, cuestionarios configurables y Dashboard por rol.
- Bitácora y auditoría de acciones críticas.

### 2.2 Fuera del MVP

- Mesa de ayuda o soporte postventa.
- Integración bancaria automática.
- Multi-idioma.
- Integración con WhatsApp o email para notificaciones; sólo in-app.
- Firma electrónica certificada de cambios de alcance.
- Portal de cliente; la respuesta del cliente se registra mediante proxy con evidencia.

---

## 3. Actores y permisos

Roles base combinables:

1. Director.
2. Vendedor.
3. Administrador.
4. Líder de Proyecto (PL).
5. Programador.
6. Diseñador UX/UI.
7. QA/Tester.

Un usuario puede tener hasta cinco roles. Roles, permisos, relación rol-permiso, asignaciones y permisos individuales son datos configurables. Las acciones se autorizan por permiso, no por comparaciones rígidas del nombre del rol. En los roles base, el Director puede editar el label visible sin alterar el código; sus permisos son inmutables y las variaciones requieren roles adicionales. Un rol base con usuarios asignados debe reasignarlos antes de desactivarse.

La interfaz interna usa un sistema consistente de componentes accesibles con Tailwind CSS y shadcn/ui. Toma de Oatmeal sólo la sobriedad de composición; la identidad visual es VectorIA: fondo blanco y espacio negativo en tema claro, navy profundo en tema oscuro, naranja quemado como acento de acción y tipografía sans-serif moderna. Los activos canónicos viven en `context/VectorIA-Brand-Assets/`. Todas las pantallas y acciones de V1 son plenamente operables en móvil, tableta y escritorio; su presentación se adapta al viewport sin reducir las capacidades autorizadas. Esta dirección no modifica los permisos, la privacidad ni los flujos funcionales.

El bootstrap conserva trazabilidad con el usuario técnico persistente SuperUser (`contacto@vector-ia.mx`), creado antes de emitir la primera invitación. La contraseña inicial se provisiona posteriormente como secreto. Plataforma Base siembra exclusivamente sus propios permisos; cada módulo incorpora sus permisos al implementarse.

Principales responsabilidades:

- **Director:** visibilidad global, excepciones, descuentos altos, roles y permisos.
- **Vendedor:** prospectos, cuestionario, cotización y evidencia comercial.
- **Administrador:** OS, facturación, cobros y cierre administrativo.
- **PL:** alcance funcional, planeación, equipo, ejecución y cierre técnico.
- **Programador/Diseñador:** trabajo asignado, evidencia y tiempo propio.
- **QA:** revisión y pruebas asignadas.
- **Sistema:** automatizaciones y transiciones derivadas de eventos confirmados.

La matriz completa vive en `discovery/ACTORES-Y-PERMISOS.md`.

---

## 4. Áreas funcionales

### 4.1 Ocho módulos operativos

1. Autenticación y Usuarios.
2. Clientes.
3. Comercial.
4. Proyectos.
5. Facturación.
6. Cobranza.
7. Finanzas.
8. Suscripciones.

### 4.2 Áreas transversales

- **Hoy/Dashboard:** widgets configurables por rol; “Esta semana” por defecto y filtro “Hoy”.
- **Administración:** roles, permisos, catálogos, plantillas, cuestionarios y configuración.

Cobranza es un módulo separado de Comercial. **Suscripciones** es un módulo separado de Facturación y Cobranza: consume su información, pero aporta una visión propia de cartera, periodicidad y vigencia. Cuestionarios, plantillas y catálogo viven dentro de Administración.

---

## 5. Descubrimiento comercial

### 5.1 Cuestionario

El Vendedor nunca escribe el alcance ni genera JSON mediante IA. Sólo aplica el cuestionario; el sistema genera el borrador funcional.

El cuestionario tiene cuatro capas:

1. Base universal: cinco preguntas.
2. Tipo de proyecto: cinco a diez preguntas.
3. Servicios seleccionados: dos a cuatro preguntas por servicio.
4. Subcuestionarios condicionales, como UX, seguridad, accesibilidad o capacitación.

Total esperado: 5 a 32 preguntas.

Versiones disponibles:

- Wizard digital.
- PDF imprimible.
- Guía PDF para el Vendedor.

El Director puede administrar preguntas y condiciones mediante editor visual con vista previa.

### 5.2 Catálogo y plantillas

El catálogo contiene productos y servicios configurables. Existen nueve plantillas iniciales:

- Landing Page.
- Sitio Web.
- Web App.
- SaaS.
- Modificación de sistema.
- Automatización con IA.
- Integración.
- Implantación.
- Mantenimiento.

Para Sistema Web, el cuestionario solicita explícitamente `web_landing`, `web_sitio`, `web_app` o `web_saas`. El sistema puede advertir inconsistencias, pero el PL confirma la plantilla antes de firmar el alcance. DEC-FUN-53.

**Toda oferta vendida requiere Proyecto**, incluso un producto o servicio recurrente. La intervención de un técnico especialista (por configuración, activación, ajuste, mantenimiento u otra actividad) es obligatoria; por tanto, toda OS autorizada conserva el workflow de creación de Proyecto.

### 5.3 Alcance funcional firmado

Flujo: `draft → in_review → signed`.

El sistema lo genera desde cuestionario, catálogo y plantilla. El PL revisa, ajusta y firma. Incluye:

- Incluido y excluido.
- Entregables.
- Supuestos.
- Dependencias del cliente.
- Criterios de aceptación.

Una vez `signed` es inmutable. Los cambios posteriores usan change request. Este artefacto de negocio no es la SPEC técnica de INTEGRA.

### 5.4 Cotización y Orden de Servicio

- La cotización es multi-línea y requiere alcance firmado.
- Puede tener versiones; sólo una se acepta.
- Descuento: hasta 10% libre, 10-25% con Director, más de 25% bloqueado.
- La aceptación exige identidad, fecha, medio y evidencia.
- Si la cotización excede 1.5 veces el presupuesto declarado, el sistema muestra una advertencia sin bloquear el flujo.
- Una cotización aceptada genera una OS y una OS genera un proyecto en el MVP.
- Tipos de cobro: pago único, mensualidades o suscripción.
- Una suscripción requiere pago inicial antes de autorizar el proyecto.

---

## 6. Proyectos

### 6.1 Autoridad de artefactos

| Artefacto | Autoridad funcional |
|---|---|
| Alcance firmado | Verdad original de lo vendido; inmutable |
| Plantilla | Esqueleto inicial reutilizable |
| JSON Discovery | Plan de ejecución derivado y versionado |
| Change request autorizado | Única vía para cambiar el alcance efectivo |

El JSON descompone y enriquece módulos, requerimientos, tareas, pruebas y entregables. No crea el alcance firmado ni puede alterarlo silenciosamente. La importación requiere revisión del PL, presenta diferencias y no duplica elementos al reimportar la misma versión. DEC-FUN-54.

### 6.2 Creación del Proyecto

Al autorizar la OS, el sistema ejecuta de forma indivisible:

1. Crear el Proyecto en `planning/pending`.
2. Copiar el alcance original y entregables base.
3. Incorporar al PL.
4. Cargar el esqueleto de la plantilla.
5. Colocar la OS en ejecución.
6. Registrar el evento.

El PL incorpora después a programadores, diseñadores o QA. La membresía precede a la asignación y determina la visibilidad. DEC-FUN-56.

### 6.3 Estado del Proyecto

Tres dimensiones independientes:

- Etapa: `planning | development | testing | client_validation | delivery`.
- Situación: `pending | active | paused | completed | cancelled`.
- Salud: `on_track | at_risk | delayed`.

Happy path:

`planning/pending → planning/active → development/active → testing/active → client_validation/active → delivery/completed`

`paused` y `cancelled` son situaciones laterales con motivo y auditoría. La salud se calcula por fechas, avance y bloqueos; el PL puede sobreescribirla con motivo conservando ambos valores. DEC-FUN-58.

### 6.4 Módulos

Flujo: `pending → in_progress → testing → deployed`.

Laterales: `paused`, `blocked`, `cancelled`.

`deployed` significa cierre técnico del módulo. Exige requerimientos validados internamente, tareas con checklist y evidencia, pruebas bloqueantes técnicas aprobadas y entregables preparados o presentados.

La aceptación del cliente bloquea el cierre del Proyecto, no las dependencias normales entre módulos, salvo que una dependencia declare expresamente que requiere aceptación. DEC-FUN-59.

### 6.5 Requerimientos y tareas

- Requerimiento: `proposed → analysis → approved → development → testing → validated`, con salidas `rejected` y `out_of_scope`.
- Tarea: `backlog → ready → in_progress → in_review → done`, con laterales `blocked` y `cancelled`.
- El PL aprueba requerimientos; PL o QA los validan.
- Sólo el PL asigna tareas; el técnico puede autoasignarse del backlog no asignado.
- Rechazar una asignación exige motivo y devuelve la tarea a `ready` sin asignado.
- Una revisión rechazada devuelve la tarea a `in_progress`.
- `done` exige checklist y evidencia; registrar tiempo sigue siendo opcional.

### 6.6 Pruebas y entregables

Tipos de pruebas:

- Bloqueantes: funcional, visual, UI, aceptación y compatibilidad.
- Advertencia: performance y seguridad.

Una prueba no aplicable requiere justificación del PL. Omitir aceptación requiere excepción del Director.

Entregable:

`pending → preparing → delivered → accepted`

Corrección:

`delivered → observed → corrected → delivered`

El PL puede registrar la respuesta del cliente, pero no puede figurar como aceptante. Debe capturar nombre, organización, fecha, medio y evidencia. DEC-FUN-55.

### 6.7 Cambios de alcance

`requested → analysis → quoted (si aplica) → authorized | rejected | cancelled → in_progress → implemented → validated`

- Con costo: cotización vinculada y aceptación con evidencia.
- Sin costo: puede omitir cotización, nunca autorización.
- Actualiza el alcance efectivo y el plan de ejecución.
- Nunca altera el alcance original firmado.

### 6.8 Cierre

El PL cierra técnicamente cuando no hay trabajo crítico abierto, los requerimientos obligatorios están validados, las pruebas bloqueantes pasan, los entregables obligatorios están aceptados y los cambios autorizados están resueltos.

Resultado:

- Proyecto `delivery/completed`.
- OS `delivered`, incluso con saldo pendiente.

El Administrador cierra la OS cuando el Proyecto está completado o cancelado, la factura final aplicable fue emitida y el saldo total es cero. Sólo el Director puede aprobar una excepción documentada. DEC-FUN-57.

El detalle completo de transiciones y handoffs vive en `discovery/FLUJOS-FUNCIONALES.md`.

---

## 7. Facturación, cobranza y comisiones

### 7.1 CFDI

El sistema timbra CFDI 4.0 mediante FacturoPorTi y conserva UUID, XML y PDF. La cancelación requiere motivo SAT.

### 7.2 Cobros

- Un cobro se registra, confirma o reversa.
- Puede aplicarse a una o varias facturas sin exceder el monto ni el saldo.
- Facturas vencidas, promesas y disputas se muestran en Cobranza.
- No existe integración bancaria automática en el MVP.

### 7.3 Comisiones

Estados: `estimated → earned → released → paid`, con `cancelled` lateral.

La comisión se libera sobre facturado, no sobre cobrado:

`liberada = estimada × facturado_no_cancelado / total_OS`, con tope en la estimada.

Cancelar una factura reversa la proporción correspondiente.

### 7.4 Suscripciones

El módulo de Suscripciones ofrece un panel propio para visualizar la cartera de servicios recurrentes, sin obligar al usuario a reconstruirla desde Facturación o Cobranza.

Una Suscripción es una entidad funcional propia. El sistema la crea automáticamente al autorizar una Orden de Servicio cuyo tipo de cobro es `suscripción`, conservando la relación con cliente, cotización y OS de origen.

Cada suscripción debe identificarse por una de estas periodicidades: **mensual, trimestral, semestral o anual**. El panel permite reconocer qué suscripciones pertenecen a cada periodicidad y consultar su información relacionada de facturación y cobranza.

Suscripciones no reemplaza Facturación ni Cobranza:

- **Facturación** conserva la emisión y el timbrado de los CFDI correspondientes.
- **Cobranza** conserva el seguimiento de pagos, vencimientos, promesas y disputas.
- **Suscripciones** consolida la vista de vigencia y periodicidad del servicio recurrente.

En el MVP, Suscripciones permite gestionar el ciclo de vida completo: **renovar, pausar y cancelar**, además de consultar la cartera. Las acciones se controlan mediante un permiso configurable, no por rol fijo. Los estados son **activa, pausada, cancelada y vencida**.

Transiciones confirmadas: `activa ↔ pausada`; `activa → vencida` al terminar el periodo sin renovar; `vencida → activa` al renovar; `activa | pausada → cancelada`; `cancelada → activa` al reactivar o renovar. La reactivación conserva el historial de la misma suscripción.

Al renovar, el sistema crea automáticamente una **factura en borrador** para el nuevo periodo. Facturación conserva su revisión, timbrado y emisión; Suscripciones no emite directamente el CFDI.

---

## 8. Reglas, decisiones y trazabilidad

- Decisiones confirmadas: 68, en `discovery/DECISIONES-FUNCIONALES.md`.
- Reglas confirmadas con ID único: 240, en `discovery/REGLAS-DE-NEGOCIO.md`.
- Actores y permisos: `discovery/ACTORES-Y-PERMISOS.md`.
- Flujos y handoffs: `discovery/FLUJOS-FUNCIONALES.md`.
- Hallazgos y resoluciones: `discovery/HALLAZGOS.md`.
- Simulaciones: `discovery/SIMULACIONES.md`.

Las fuentes históricas y el JSON anterior son material de consulta, no fuente vigente.

---

## 9. Simulaciones

- La simulación original del SaaS se conserva como `AUDITADA_CON_HALLAZGOS` para trazabilidad.
- El flujo funcional corregido de Proyectos se ejecuta en `discovery/simulations/SIMULACION-FLUJO-PROYECTOS-20260817.md` y cubre happy path y excepciones críticas.

---

## 10. Pendiente no bloqueante

Q-NB-3 permanece diferida para Comercial: decidir si una cotización muy superior al presupuesto declarado produce advertencia, bloqueo con Director o ninguna automatización.

No bloquea la especificación técnica inicial de Proyectos. Si INTEGRA necesita esa política para Comercial, debe emitir `DISCOVERY-GAP`.

---

## 11. Gate para INTEGRA

El discovery cumple el Definition of Ready funcional:

- Fuente y versión identificadas.
- Problema, resultado y alcance incluidos/excluidos definidos.
- Decisiones y reglas críticas con ID.
- Flujos y escenarios representativos.
- Cero preguntas funcionales bloqueantes.
- Cero contradicciones P0 vigentes.

INTEGRA puede producir ADR y SPEC técnicas sin reescribir este discovery. Si surge una decisión nueva de producto, devuelve `DISCOVERY-GAP` a ATLAS/Frank en lugar de inferirla.
