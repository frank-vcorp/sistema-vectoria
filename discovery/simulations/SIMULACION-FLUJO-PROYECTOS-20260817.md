# SIMULACIÓN FUNCIONAL · Flujo de Proyectos

**ID:** SIM-20260817-02
**Fecha:** 2026-08-17
**Fuente:** FUNCTIONAL-BASELINE v1.0 + DEC-FUN-53 a DEC-FUN-60
**Estado:** `VALIDADA_FUNCIONALMENTE`
**Naturaleza:** recorrido funcional en lenguaje de negocio; no prueba código ni infraestructura.

---

## 1. Objetivo

Comprobar que cada transición crítica del flujo de Proyectos tiene actor, precondición, evidencia, resultado y salida de excepción, sin obligar a INTEGRA a inventar reglas de producto.

Caso base: una Web App administrativa vendida a un cliente nuevo, con anticipo, tres módulos y pago final.

---

## 2. Happy path completo

### Paso 1 · Descubrimiento comercial

1. El Vendedor aplica el cuestionario.
2. El cliente selecciona explícitamente `web_app`.
3. El sistema advierte si alguna respuesta parece más propia de `web_saas`, pero no cambia la plantilla.
4. El PL confirma `web_app`.
5. El sistema genera el alcance funcional.
6. El PL revisa y firma.

**Resultado esperado:** alcance `signed`, plantilla confirmada, cero selección ad-hoc.

### Paso 2 · Cotización y OS

1. El Vendedor genera una cotización multi-línea.
2. El cliente acepta por correo.
3. El Vendedor registra nombre, fecha, medio y correo como evidencia.
4. El sistema crea una OS única.
5. El Administrador registra el anticipo y valida los datos administrativos.
6. La OS queda `authorized_to_start`.

**Resultado esperado:** no puede haber otra cotización aceptada ni otro proyecto para la misma OS.

### Paso 3 · Creación del Proyecto

1. El sistema crea el Proyecto en `planning/pending`.
2. Copia el alcance firmado y entregables base.
3. Agrega al PL.
4. Carga el esqueleto `web_app`.
5. Coloca la OS en `in_execution`.
6. Registra el evento.

**Resultado esperado:** operación completa o ningún cambio parcial; todavía no hay programadores asignados.

### Paso 4 · Planeación y equipo

1. El PL verifica que alcance, plantilla y OS coinciden.
2. Pasa el Proyecto a `planning/active`.
3. Incorpora a un Programador y un QA como miembros.
4. Asigna módulos y responsabilidades.
5. Exporta el JSON Discovery.
6. El equipo propone descomposición adicional.
7. El PL revisa las diferencias e importa una versión aprobada.
8. Reimportar la misma versión no crea duplicados.

**Resultado esperado:** plan de ejecución vigente y versionado; el alcance firmado permanece intacto.

### Paso 5 · Desarrollo por módulos

1. El PL inicia el primer módulo; el Proyecto pasa a `development/active`.
2. Cada tarea avanza `ready → in_progress → in_review → done`.
3. Cada `done` conserva checklist y evidencia.
4. QA o PL aprueban la revisión.
5. El módulo pasa a `testing`.
6. Al aprobar pruebas bloqueantes técnicas, el PL lo marca `deployed`.
7. Los módulos dependientes pueden comenzar sin esperar aceptación final del cliente.

**Resultado esperado:** no existe dependencia circular entre despliegue técnico y aceptación final.

### Paso 6 · Pruebas y validación del cliente

1. Al terminar el desarrollo requerido, el Proyecto pasa a `testing/active`.
2. Las pruebas funcionales, visuales, UI y compatibilidad pasan.
3. Performance produce una advertencia no bloqueante y queda visible.
4. El PL presenta entregables; el Proyecto pasa a `client_validation/active`.
5. El cliente acepta por correo.
6. El PL registra al cliente como aceptante y se identifica únicamente como registrador.

**Resultado esperado:** evidencia completa; la advertencia no desaparece, pero no impide el cierre.

### Paso 7 · Cierre técnico y administrativo

1. El PL verifica gates de cierre.
2. Cierra el Proyecto: `delivery/completed`.
3. La OS pasa a `delivered` aunque quede saldo.
4. El Administrador emite la factura final conforme al plan vendido.
5. El cliente paga y el Administrador aplica el cobro.
6. Con saldo total cero, el Administrador cierra la OS.

**Resultado esperado:** cierre técnico, entrega, factura, cobro y cierre administrativo aparecen como eventos separados y auditables.

**Resultado del happy path:** PASS.

---

## 3. Escenarios de excepción

### SCN-PROJ-01 · Técnico rechaza una tarea

1. El PL asigna una tarea a un miembro del Proyecto.
2. El técnico la rechaza indicando falta de experiencia.
3. La tarea vuelve a `ready`, queda sin asignado y el PL recibe notificación.
4. El PL la reasigna.

**Resultado:** PASS. Existe actor y salida; la tarea no queda huérfana ni falsamente iniciada.

### SCN-PROJ-02 · Tarea bloqueada y recuperada

1. Una tarea `in_progress` depende de información del cliente.
2. El técnico marca `blocked` con motivo.
3. El Proyecto puede pasar a `at_risk` si el bloqueo es crítico.
4. Al recibir la información, el PL o responsable resuelve el bloqueo.
5. La tarea regresa a `in_progress`.

**Resultado:** PASS. `blocked` es lateral, no parte obligatoria del happy path.

### SCN-PROJ-03 · Revisión rechazada

1. El técnico entrega checklist y evidencia.
2. QA detecta que falta un criterio.
3. La tarea regresa de `in_review` a `in_progress` con observaciones.
4. El técnico corrige y vuelve a revisión.

**Resultado:** PASS. No se marca `done` antes de aprobación.

### SCN-PROJ-04 · Prueba bloqueante fallida

1. Una prueba funcional queda `failed` con resultado e incidencia.
2. El módulo no puede pasar a `deployed`.
3. La tarea correctiva se ejecuta y la prueba se repite.
4. Sólo al quedar `passed` el PL cierra el módulo.

**Resultado:** PASS. El gate técnico se completa.

### SCN-PROJ-05 · Entregable observado

1. El cliente observa un entregable presentado.
2. El PL registra evidencia y el entregable pasa a `observed`.
3. El equipo corrige: `corrected`.
4. Se vuelve a presentar: `delivered`.
5. El cliente acepta con nueva evidencia.

**Resultado:** PASS. La corrección vuelve a validación; no salta directamente a aceptado.

### SCN-PROJ-06 · Cambio de alcance con costo

1. El cliente pide una integración fuera del alcance.
2. El PL registra `requested` y analiza impacto.
3. Se genera cotización vinculada.
4. Cliente y aprobadores aplicables autorizan con evidencia.
5. Se actualiza el alcance efectivo y el plan; el alcance original no cambia.
6. El cambio avanza `in_progress → implemented → validated`.

**Resultado:** PASS. El equipo no implementa antes de autorización.

### SCN-PROJ-07 · Cambio sin costo

1. Se solicita un ajuste menor fuera del texto original, sin impacto de costo o fecha.
2. El PL analiza y documenta impacto cero.
3. Omite cotización, pero obtiene autorización.
4. Actualiza alcance efectivo y bitácora.

**Resultado:** PASS. “Sin costo” no significa “sin control de alcance”.

### SCN-PROJ-08 · Cierre técnico con saldo pendiente

1. Todos los gates técnicos están cumplidos.
2. El PL cierra el Proyecto.
3. La OS queda `delivered` con factura final pendiente de pago.
4. El Administrador no puede cerrar la OS hasta saldo cero.

**Resultado:** PASS. Entrega y cierre administrativo no se colapsan.

### SCN-PROJ-09 · Excepción de cierre

1. Existe saldo pendiente que se condonará por acuerdo comercial.
2. El Administrador solicita excepción.
3. El Director registra decisión, motivo y evidencia.
4. El Administrador ejecuta el cierre de la OS.

**Resultado:** PASS. Ningún actor distinto al Director puede aprobar la excepción.

### SCN-PROJ-10 · Cancelación

1. Se solicita cancelar un Proyecto activo.
2. Se registra motivo y avance.
3. El Director aprueba la política de reembolso proporcional aplicable.
4. El Proyecto queda `cancelled`; se revisan módulos, entregables, facturas y comisión.
5. La OS sólo se cierra administrativamente al resolver saldo o excepción.

**Resultado:** PASS. La cancelación no borra historial ni evade el cierre financiero.

---

## 4. Matriz de cobertura

| Riesgo auditado | Cubierto por |
|---|---|
| Ningún actor puede asignar programadores | Happy path paso 4 |
| Plantilla y JSON duplican elementos | Happy path paso 4 |
| `blocked` inserto en happy path | SCN-PROJ-02 |
| Revisión sin retorno | SCN-PROJ-03 |
| Módulo espera aceptación final | Happy path paso 5 |
| Aceptación proxy sin evidencia | Happy path paso 6 |
| Entregable observado sin corrección | SCN-PROJ-05 |
| Cambio implementado sin autorización | SCN-PROJ-06/07 |
| Entrega depende del pago | SCN-PROJ-08 |
| Cierre con saldo sin aprobador | SCN-PROJ-09 |
| Cancelación sin efecto financiero | SCN-PROJ-10 |

---

## 5. Conclusión

Todos los escenarios tienen actor autorizado, transición, evidencia y salida. No quedan huecos P0 en Proyectos para el handoff funcional. La validación de implementación, persistencia, concurrencia, seguridad e integraciones corresponde a las SPEC técnicas de INTEGRA y a la ejecución posterior de SOFIA/QA.
