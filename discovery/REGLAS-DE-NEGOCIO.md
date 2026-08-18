# REGLAS-DE-NEGOCIO · Vector IA

**Versión:** 2026-08-17 (cierre funcional de Proyectos 23:20)
**Convención:** `BR-###` (regla original estable) y `BR-N###` (regla ratificada en sesiones posteriores). Mismas IDs del repositorio, sin renumerar.

> **Reconstrucción y cierre — CERRADOS:** ATLAS reconstruyó el lote inicial y Frank lo confirmó el 2026-08-17 22:51. El cierre funcional posterior incorporó DEC-FUN-53 a DEC-FUN-60. **Resultado vigente y reproducible:** 231 reglas confirmadas con ID único y ninguna regla propuesta. La única política diferida es Q-NB-3, fuera del gate inicial de Proyectos.

> **Vocabulario de estados de módulo (DEC-FUN-20260817-47):** vocabulario único vigente — `pending → in_progress → testing → deployed` (+ laterales `paused`, `blocked`, `cancelled`). Salud: `on_track / at_risk / delayed`. BR-N113 y BR-N114 usan este vocabulario.

> **Criterio funcional aplicado:** todas las reglas se reformularon a lenguaje de negocio observable. Las menciones residuales (folio, UUID fiscal, XML del CFDI) se conservan porque son términos de negocio reconocidos por el usuario.

---

## B1 · Organización y multi-tenancy

| ID | Regla |
|---|---|
| BR-016 | Los datos de una organización nunca son visibles para usuarios de otra organización. |
| BR-N200 | Toda entidad de negocio se aísla por organización, incluso si el MVP tiene una sola. |
| BR-N201 | La configuración fiscal de la organización (RFC, razón social, régimen, certificado de sello, llave del PAC) es única y sólo el Director la edita. |
| BR-N202 | La moneda predeterminada de la organización es MXN; el campo de moneda queda reservado para multi-moneda futura. |
| BR-N203 | Las fechas se muestran al usuario en la zona horaria de la organización (México). |

---

## B2 · Actores, roles y permisos

| ID | Regla |
|---|---|
| BR-N127 | Los roles base no se eliminan; sólo se desactivan. |
| BR-N128 | El Director puede crear roles adicionales a los base. |
| BR-N131 | Los permisos adicionales otorgados a un usuario son siempre aditivos; nunca restan. |
| BR-N204 | Un usuario puede tener hasta 5 roles simultáneos. |
| BR-N205 | La verificación de permisos se hace consultando los roles y permisos del usuario; nunca con comparaciones directas contra el nombre del rol en el código. (Regla de oro "cero hardcode".) |
| BR-N206 | Toda otorgación o revocación de permiso adicional queda registrada en la bitácora de auditoría. |
| BR-N207 | El Vendedor no ve precios internos, márgenes, cuentas por cobrar de otros ni comisiones de otros. |
| BR-N208 | El Programador sólo ve su propio tiempo; no el del resto del equipo. |
| BR-N209 | El Administrador ve todo lo comercial y financiero; los proyectos en modo lectura. |
| BR-N210 | El Líder de Proyecto no ve precios, márgenes, cuentas por cobrar ni comisiones. |
| BR-N211 | El Director ve todo el sistema. |
| BR-N212 | El Programador sólo ve los proyectos en los que tiene módulos asignados. |

---

## B3 · Clientes y prospectos

| ID | Regla |
|---|---|
| BR-N148 | Un prospecto sólo pasa a "calificado" si tiene cuestionario completado. |
| BR-N168 | El cliente se crea desde un prospecto cuando cumple las condiciones; no manualmente. |
| BR-N213 | Un prospecto "perdido" requiere motivo. |
| BR-N214 | Un prospecto "suspendido" requiere motivo y puede reactivarse. |
| BR-N215 | El cliente se archiva, no se elimina físicamente. |
| BR-N216 | Cada cliente tiene un número único dentro de la organización, generado por el sistema. |
| BR-N217 | Un cliente puede tener varios contactos; sólo uno se marca como principal. |
| BR-N218 | El cliente puede llevar datos fiscales opcionales (RFC, régimen, domicilio). |

---

## B4 · Cuestionarios de sondeo

| ID | Regla |
|---|---|
| BR-N149 | La cotización requiere un cuestionario de sondeo vinculado. |
| BR-N219 | El cuestionario se estructura en 4 capas: base universal, por tipo de proyecto, por servicio seleccionado, sub-cuestionarios opcionales. |
| BR-N220 | **Regla de oro:** el vendedor nunca escribe el spec ni genera JSON de spec; el sistema lo genera desde cuestionario + catálogo + plantilla. |
| BR-N221 | Cada cuestionario admite 3 versiones: digital (captura en pantalla), imprimible (para marcar a mano) y guía del vendedor (tips). |
| BR-N222 | Las preguntas son datos editables por el Director; no código. |
| BR-N223 | Los sub-cuestionarios opcionales se activan según las respuestas anteriores del cuestionario. |
| BR-N224 | El cuestionario adapta entre 5 y 32 preguntas según la complejidad del proyecto. |
| BR-N225 | Las preguntas asociadas a un servicio son reutilizables en cualquier cuestionario. |

---

## B5 · Catálogo de servicios y plantillas

| ID | Regla |
|---|---|
| BR-N226 | El catálogo de servicios es configurable y alimenta el spec, la cotización y el discovery. |
| BR-N227 | Cada servicio del catálogo tiene un tipo (servicio único, servicio recurrente, producto único, producto recurrente) y un ciclo de facturación (único, mensual, anual, a convenir). |
| BR-N228 | Existen 9 plantillas base de proyecto (4 niveles de sistema web + 5 de otros tipos). |
| BR-N229 | Cada plantilla subdivide el proyecto en módulos con requerimientos, tareas, pruebas, entregables y dependencias entre módulos. |
| BR-N230 | El cuestionario exige seleccionar explícitamente la plantilla aplicable; el PL la confirma antes de firmar el alcance. El sistema puede advertir inconsistencias, pero no cambia la selección silenciosamente. (DEC-FUN-53.) |

---

## B6 · Spec (especificación funcional firmada)

| ID | Regla |
|---|---|
| BR-N51 | La cotización requiere un spec firmado previamente. |
| BR-N52 | El spec firmado es inmutable. |
| BR-N231 | El spec lo genera el sistema desde cuestionario + catálogo + plantilla; el PL lo revisa, ajusta y firma. (Regla de oro.) |
| BR-N232 | Los cambios posteriores al spec firmado se registran como solicitudes de cambio de alcance; no editan el spec original. |
| BR-N233 | El spec incluye: alcance incluido y excluido, entregables, supuestos, dependencias del cliente y criterios de aceptación. |

---

## B7 · Cotizaciones

| ID | Regla |
|---|---|
| BR-N01 | Una cotización sin vigencia vigente no se acepta. |
| BR-N02 | Una cotización aceptada es inmutable. |
| BR-N03 | En el MVP, una cotización aceptada genera una sola orden de servicio y la orden genera un solo proyecto. |
| BR-N25 | Un prospecto admite una sola cotización aceptada (avisa si se emiten más de 5). |
| BR-N143 | Descuento: hasta 10% libre · 10-25% requiere Director · más de 25% bloqueado. |
| BR-N234 | La cotización es multi-línea con ítems auto-pre-llenados desde spec + catálogo. (DEC-FUN-48.) |
| BR-N235 | Vigencia mínima de cotización: 7 días. |
| BR-N236 | Una cotización puede tener versiones; sólo una versión puede marcarse como aceptada. |
| BR-N237 | Aceptar una cotización genera la orden de servicio una sola vez, en workflow atómico. |
| BR-N238 | El tipo de cobro de la cotización es: un pago, mensualidades o suscripción. |
| BR-N239 | Para suscripción, el pago inicial de personalización es obligatorio. |
| BR-N240 | SLA cotización: el sistema alerta si la cotización lleva más de 48 horas hábiles sin respuesta. |
| BR-N241 | La comisión se tasa una sola vez por orden de servicio (una sola tasa). |

---

## B8 · Órdenes de Servicio (OS)

| ID | Regla |
|---|---|
| BR-017 | Si la orden lleva orden de compra del cliente, el monto debe coincidir con el total vendido y exige PDF antes de autorizar el inicio. |
| BR-N121 | En suscripción, el proyecto no se autoriza hasta cobrar el pago inicial. |
| BR-N242 | La orden de servicio nace al aceptar la cotización, con copia inmutable de los importes y el alcance vendidos. |
| BR-N243 | La orden puede llevar 4 datos opcionales de la orden de compra del cliente (número, fecha, monto, archivo). |
| BR-N244 | La orden no puede autorizarse a iniciar si el anticipo no está cobrado (al menos 90% del requerido o autorización del Director). |
| BR-N245 | La orden no puede autorizarse a iniciar si no hay líder técnico asignado. |
| BR-N246 | Al autorizar la orden, el sistema crea el proyecto en workflow atómico. |
| BR-N247 | La orden pasa a "en ejecución" cuando se crea el proyecto. |
| BR-N248 | La orden pasa a "entregada" cuando el proyecto cierra técnicamente. |
| BR-N249 | La orden pasa a "cerrada" administrativamente cuando el proyecto está terminado o cancelado y su saldo total pendiente es cero, salvo excepción documentada aprobada por el Director. (DEC-FUN-57.) |
| BR-N250 | La orden puede pausarse y cancelarse con motivo. |
| BR-N392 | El cierre técnico del proyecto coloca la orden en `entregada` aunque exista saldo pendiente; la entrega no equivale a cierre administrativo. (DEC-FUN-57.) |
| BR-N393 | Toda factura final aplicable debe emitirse antes del cierre administrativo de la orden y conforme al plan de facturación vendido. (DEC-FUN-57.) |
| BR-N394 | Una excepción financiera de cierre sólo puede aprobarla el Director con motivo, evidencia y registro de auditoría. (DEC-FUN-57.) |

---

## B9 · Proyectos

| ID | Regla |
|---|---|
| BR-N251 | El proyecto nace desde la orden con copia inmutable del alcance y los entregables base. |
| BR-N252 | El proyecto se subdivide en módulos; el avance se controla módulo por módulo. |
| BR-N253 | El proyecto tiene tres dimensiones independientes: etapa (`planning`, `development`, `testing`, `client_validation`, `delivery`), situación (`pending`, `active`, `paused`, `completed`, `cancelled`) y salud (`on_track`, `at_risk`, `delayed`). |
| BR-N254 | El PL puede sobreescribir la salud del proyecto sólo con motivo; se conservan la calculada y la manual. |
| BR-N255 | El proyecto no puede cerrarse si hay actividades críticas abiertas, salvo excepción documentada. |
| BR-N256 | El proyecto no puede cerrarse si entregables obligatorios no están aceptados, salvo excepción aprobada. |
| BR-N257 | El proyecto no puede cerrarse si pruebas críticas no están aprobadas, salvo excepción aprobada. |
| BR-N258 | El cierre técnico del proyecto es distinto del cierre administrativo de la orden. |
| BR-N259 | El proyecto lleva bitácora con tipos: reunión, decisión, bloqueo, solicitud, cambio, entrega, aprobación, reprogramación, nota, sistema. |
| BR-N375 | El proyecto nace `planning/pending`; el PL lo pasa a `planning/active` al iniciar la planeación y descomposición. (DEC-FUN-58.) |
| BR-N376 | El inicio del primer módulo coloca el proyecto en `development/active`; al terminar el desarrollo requerido pasa a `testing/active`. (DEC-FUN-58.) |
| BR-N377 | Cuando los entregables están presentados y sólo falta respuesta del cliente, el proyecto pasa a `client_validation/active`. (DEC-FUN-58.) |
| BR-N378 | El cierre técnico coloca el proyecto en `delivery/completed` y registra actor, fecha, gates y excepciones aplicadas. (DEC-FUN-58.) |
| BR-N379 | Pausar, reactivar o cancelar un proyecto exige motivo; cancelar exige además la decisión de reembolso aplicable y conserva el historial. |
| BR-N380 | El alcance firmado es la verdad funcional original; el alcance efectivo sólo cambia mediante una solicitud de cambio autorizada. (DEC-FUN-54.) |
| BR-N381 | La plantilla es un esqueleto inicial y el JSON Discovery es un plan de ejecución derivado; ninguno puede alterar silenciosamente el alcance firmado. (DEC-FUN-54.) |
| BR-N382 | El PL agrega miembros después de crear el proyecto; nadie puede recibir un módulo o tarea sin pertenecer antes al proyecto. (DEC-FUN-56.) |
| BR-N383 | La asignación a proyecto, módulo o tarea concede la visibilidad necesaria; retirar la asignación revoca el acceso operativo futuro, pero conserva evidencia e historial. (DEC-FUN-56.) |

---

## B10 · Módulos de proyecto

| ID | Regla |
|---|---|
| BR-N113 | Un módulo pasa a `deployed` sólo si: requerimientos validados internamente, tareas terminadas con evidencia, pruebas bloqueantes técnicas aprobadas y entregables preparados o presentados. La aceptación del cliente se exige para cerrar el proyecto, no para desbloquear dependencias, salvo dependencia explícita. (DEC-FUN-47 y DEC-FUN-59.) |
| BR-N114 | Un módulo pasa a "in_progress" sólo si sus módulos dependientes están "deployed". (DEC-FUN-47.) |
| BR-N260 | Estados del módulo: `pending → in_progress → testing → deployed` (+ `paused`, `blocked`, `cancelled`). (DEC-FUN-47.) |
| BR-N261 | Salud del módulo: `on_track` / `at_risk` / `delayed`. (DEC-FUN-47.) |
| BR-N262 | El PL marca el módulo "in_progress" al iniciar y "deployed" al cerrar. |
| BR-N263 | El módulo puede pausarse con motivo y cancelarse con motivo. |
| BR-N384 | `paused` y `blocked` son estados laterales recuperables; al resolver la causa el módulo vuelve a su último estado operativo válido. |
| BR-N385 | Cancelar un módulo obliga al PL a revisar dependencias, alcance efectivo, fechas y entregables antes de continuar el proyecto. |

---

## B11 · Requerimientos

| ID | Regla |
|---|---|
| BR-005 | Un requerimiento no pasa a desarrollo sin descripción y criterio de aceptación. |
| BR-N264 | Cada requerimiento tiene un folio único dentro del proyecto. |
| BR-N265 | Flujo del requerimiento: `proposed → analysis → approved → development → testing → validated`; `rejected` y `out_of_scope` son salidas laterales con motivo. |
| BR-N266 | Un requerimiento rechazado o fuera de alcance requiere motivo. |
| BR-N267 | El requerimiento puede tener responsable asignado. |
| BR-N386 | El PL aprueba un requerimiento antes de desarrollo; PL o QA asignado lo validan después de las pruebas correspondientes. |

---

## B12 · Tareas y checklist

| ID | Regla |
|---|---|
| BR-006 | Una tarea bloqueada requiere motivo. |
| BR-007 | Una tarea "done" requiere checklist completo. |
| BR-N268 | Flujo principal de tarea: `backlog → ready → in_progress → in_review → done`; `blocked` y `cancelled` son estados laterales. |
| BR-N269 | Sólo el PL asigna tareas; el técnico puede autoasignarse del backlog sin asignar. |
| BR-N270 | Un técnico puede rechazar una tarea asignada con motivo obligatorio; la tarea vuelve a `ready` sin asignado y notifica al PL. |
| BR-N271 | Una tarea `done` requiere evidencia (link, archivo o nota) además del checklist completo. |
| BR-N272 | Una tarea puede tener participantes además del asignado. |
| BR-N273 | Una tarea puede tener dependencias simples con otras tareas. |
| BR-N274 | Una tarea puede vincularse a un requerimiento. |
| BR-N387 | Una tarea bloqueada conserva el estado operativo previo y vuelve a él al resolver el bloqueo; una revisión rechazada vuelve a `in_progress` con observaciones. |
| BR-N388 | PL o QA asignado aprueban la revisión de la tarea. Si una persona combina roles, el registro identifica con qué rol realizó la revisión. |

---

## B13 · Tiempo y costos

| ID | Regla |
|---|---|
| BR-008 | Las horas registradas son mayores a cero, no superan 24 por día por usuario y conservan el costo por hora vigente al momento del registro. |
| BR-N275 | Las horas pueden ser facturables, internas, de retrabajo o de soporte. |
| BR-N276 | El registro de tiempo es opcional en el MVP. |
| BR-N277 | El técnico sólo ve su tiempo propio; el PL ve el del equipo de su proyecto. |
| BR-N278 | El costo laboral del proyecto es la suma de los costos de todas las horas registradas. |
| BR-N279 | El costo directo del proyecto es la suma de los gastos confirmados o conciliados imputados al proyecto. |
| BR-N280 | El costo total del proyecto es la suma del costo laboral más el costo directo. |
| BR-N281 | El margen bruto vendido es el importe vendido menos el costo total del proyecto. |
| BR-N282 | La rentabilidad del proyecto se desglosa por técnico, no agregada. |

---

## B14 · Tests

| ID | Regla |
|---|---|
| BR-009 | Una prueba "failed" requiere resultado obtenido y resumen de incidencia. |
| BR-N283 | Existen 7 tipos de pruebas: funcional, visual, UI, aceptación, performance, seguridad, compatibilidad. |
| BR-N284 | Las pruebas funcional, visual, UI, aceptación y compatibilidad bloquean el cierre del proyecto. |
| BR-N285 | Las pruebas de performance y seguridad sólo generan advertencia. |
| BR-N286 | La prueba de aceptación la ejecuta el Cliente (vía proxy PL) y bloquea el cierre. |
| BR-N287 | Cuando el PL registra una aceptación en nombre del cliente, actúa sólo como **registrador**; son obligatorios nombre y organización del aceptante, fecha, medio de contacto y evidencia. El PL no puede figurar simultáneamente como aceptante. (DEC-FUN-55.) |
| BR-N389 | Marcar una prueba como `not_applicable` requiere justificación y aprobación del PL; una prueba de aceptación no puede omitirse sin excepción aprobada por el Director. |
| BR-N390 | Las advertencias de performance o seguridad no bloquean por sí solas el cierre, pero deben quedar visibles en la bitácora y pueden colocar la salud en `at_risk`. |

---

## B15 · Entregables

| ID | Regla |
|---|---|
| BR-010 | Un entregable "accepted" requiere nombre de quien acepta y fecha. |
| BR-N288 | Flujo del entregable: `pending → preparing → delivered → accepted`; si queda `observed`, pasa a `corrected` y vuelve a `delivered` para nueva validación. `rejected` es una salida explícita con motivo. |
| BR-N289 | El entregable lleva fecha comprometida y fecha real de entrega. |
| BR-N290 | El entregable puede llevar versión y comentarios del cliente. |
| BR-N291 | Un entregable rechazado puede ser corregido y re-entregado. |
| BR-N391 | La aceptación válida de un entregable cumple BR-N287 y se registra separadamente de quien capturó la respuesta. |

---

## B16 · Cambios de alcance

| ID | Regla |
|---|---|
| BR-011 | Un cambio de alcance no se implementa hasta quedar autorizado. |
| BR-N292 | El cambio de alcance se documenta con email o PDF (sin firma electrónica certificada). |
| BR-N293 | Cada cambio de alcance tiene un folio único dentro del proyecto. |
| BR-N294 | Si el cambio requiere cobro adicional, se genera cotización vinculada antes de autorizar. |
| BR-N295 | El cambio de alcance evalúa impacto técnico, horas adicionales, costo adicional y nueva fecha. |
| BR-N296 | El cambio autorizado actualiza la versión del alcance y la bitácora sin alterar el alcance original. |
| BR-N395 | Flujo del cambio: `requested → analysis → quoted` cuando hay impacto comercial → `authorized | rejected | cancelled`; si se autoriza, continúa `in_progress → implemented → validated`. Sin costo puede omitir `quoted`, nunca `authorized`. (DEC-FUN-60.) |

---

## B17 · Comisiones

| ID | Regla |
|---|---|
| BR-N33 v2 | La comisión se libera sobre facturado, no sobre cobrado. (DEC-FUN-49.) |
| BR-N123 | Si la factura se cancela, la comisión proporcional se reversa. |
| BR-N297 | La comisión estimada nace al aceptar la cotización cuando la tasa es mayor a cero. |
| BR-N298 | La comisión se tasa una sola vez por orden de servicio. |
| BR-N299 | La comisión sólo se marca "pagada" cuando el Director o Administrador la transfiere explícitamente (default: día 15 de cada mes). |
| BR-N300 | Estados de la comisión: estimada → devengada → liberada → pagada (+ cancelada). |

---

## B18 · Facturación (CFDI 4.0)

| ID | Regla |
|---|---|
| BR-N301 | El sistema timbra CFDI 4.0 directamente vía FacturoPorTi (no se registran facturas externas). (DEC-FUN-50.) |
| BR-N302 | El certificado de sello digital y la llave del PAC se guardan de forma protegida en el sistema. |
| BR-N303 | El sistema arma el comprobante, valida los campos requeridos, muestra preview al usuario y timbra al confirmar. |
| BR-N304 | Tras timbrar, el sistema conserva el UUID fiscal, el XML y el PDF. |
| BR-N305 | La cancelación de factura requiere motivo SAT (01 con relación / 02 sin relación / 03 operación no realizada / 04 duplicado). |
| BR-N306 | Estados de la factura: borrador → emitida → parcialmente pagada → pagada (+ vencida, cancelada). |
| BR-N307 | Una factura pasa a "vencida" cuando se vence su fecha de pago y queda saldo pendiente. |
| BR-N308 | Una factura puede recibir varias aplicaciones de cobro; la suma no supera el importe del cobro ni el saldo de la factura. |
| BR-N309 | Cancelar una factura no elimina cobros; exige reversar o reasignar las aplicaciones. |
| BR-N310 | La facturación recurrente corre automáticamente cada noche, busca programaciones con fecha de cobro del día y crea la factura (auto o borrador según configuración). |
| BR-N311 | El ZIP mensual para contador externo se genera automáticamente al cierre del mes y a demanda; sólo con facturas activas (no canceladas). |
| BR-N312 | El calendario de facturación muestra 7 estados visuales: pendiente, facturada, cobrada, vencida, promesa, disputada, escalada. |
| BR-N313 | Tras 2 promesas incumplidas, la factura escala automáticamente. |

---

## B19 · Cobros y aplicación

| ID | Regla |
|---|---|
| BR-012 | La suma de aplicaciones de cobro no supera el importe del cobro ni el saldo de las facturas. |
| BR-N314 | Estados del cobro: registrado → confirmado → reversado. |
| BR-N315 | Un cobro "registrado" puede editarse; uno "confirmado" sólo se reversa. |
| BR-N316 | Al confirmar el cobro, se crea el movimiento de ingreso vinculado. |
| BR-N317 | Un cobro puede aplicarse a varias facturas. |
| BR-N318 | Reversar un cobro exige motivo y deja referencia al cobro original. |
| BR-N319 | El cobro lleva comprobante y referencia opcional (SPEI, etc.). |

---

## B20 · Cobranza

| ID | Regla |
|---|---|
| BR-N320 | El calendario de cobranza muestra ingresos esperados vs reales por mes. |
| BR-N321 | El cobrador tiene plantillas de mensaje (amable, firme, final). |
| BR-N322 | Toda actividad de cobranza (llamada, email, promesa) se registra. |
| BR-N323 | Las promesas de pago se trackean y escalan tras 2 incumplidas. |
| BR-N324 | Los casos urgentes se priorizan en una cola del cobrador. |
| BR-N325 | La cobranza es un módulo separado del Comercial. |

---

## B21 · Finanzas y movimientos

| ID | Regla |
|---|---|
| BR-013 | Un movimiento "reconciled" no se edita ni elimina. |
| BR-014 | Cancelar o revertir operaciones críticas exige motivo y genera auditoría. |
| BR-015 | Los importes vendidos, facturados y cobrados se calculan y muestran por separado. |
| BR-N326 | Una transferencia entre cuentas propias genera salida y entrada vinculadas; no cuenta como ingreso ni gasto operativo. |
| BR-N327 | Un préstamo o aportación no cuenta como venta. |
| BR-N328 | Un retiro de socio no cuenta como gasto operativo. |
| BR-N329 | Las correcciones financieras se hacen por cancelación o reverso con motivo y autorización. |
| BR-N330 | Se distingue fecha de operación, fecha de vencimiento y fecha real de pago. |
| BR-N331 | Estados del movimiento: borrador → confirmado → conciliado (+ cancelado, reversado). |
| BR-N332 | Las cuentas por cobrar nacen a partir de facturas; las cuentas por pagar son básicas. |
| BR-N333 | Los costos directos se imputan a un proyecto cuando el movimiento es un gasto confirmado o conciliado. |
| BR-N334 | El costo de horas por proyecto usa el costo por hora vigente al momento del registro. |
| BR-N335 | La rentabilidad por proyecto combina costo laboral + costo directo contra importe vendido. |

---

## B22 · Auditoría y trazabilidad

| ID | Regla |
|---|---|
| BR-N336 | Toda acción crítica (aceptar cotización, autorizar orden, crear proyecto, cerrar orden, facturar, cobrar, pagar comisión) queda en el registro de auditoría. |
| BR-N337 | El registro de auditoría captura: quién actúa, qué entidad, antes y después, motivo y momento. |
| BR-N338 | La bitácora del proyecto registra reuniones, decisiones, bloqueos, solicitudes, cambios, entregas, aprobaciones, reprogramaciones y notas. |
| BR-N339 | Las entradas de la bitácora pueden marcarse como no visibles para técnicos (notas privadas de dirección). |
| BR-N340 | Los archivos pueden enlazarse a cualquier entidad de negocio (cliente, cotización, orden, proyecto, etc.). |

---

## B23 · Hoy / Dashboard

| ID | Regla |
|---|---|
| BR-N341 | La vista Hoy/Dashboard es por rol: cada uno ve sus pendientes y alertas. |
| BR-N342 | Los widgets del dashboard son configurables por usuario (drag & drop). |
| BR-N343 | El default de la vista es "Esta semana" con filtro "Hoy". |
| BR-N344 | El Director ve: proyectos en riesgo, cuentas por cobrar, ingresos/egresos. |
| BR-N345 | El Vendedor ve: prospectos sin próxima acción, cotizaciones por vencer. |
| BR-N346 | El Administrador ve: facturas vencidas, cobros del día, ingresos/egresos. |
| BR-N347 | El PL ve: actividades del día, proyectos en riesgo, próximas entregas. |
| BR-N348 | El Programador ve: actividades del día, bloqueos. |

---

## B24 · Notificaciones

| ID | Regla |
|---|---|
| BR-N349 | En el MVP las notificaciones son sólo dentro de la aplicación (no email ni WhatsApp). |
| BR-N350 | Eventos que generan notificación: prospecto sin próxima acción, cotización próxima a vencer, orden pendiente de anticipo o información, actividad asignada, actividad próxima a vencer o vencida, actividad bloqueada, proyecto en riesgo o retrasado, entregable próximo o con observaciones, cambio de alcance pendiente de revisión, factura próxima a vencer o vencida. |

---

## B25 · JSON Discovery (round-trip)

| ID | Regla |
|---|---|
| BR-N351 | El JSON Discovery descompone el proyecto en módulos/tareas/pruebas/entregables; no crea el spec. |
| BR-N352 | El JSON se descarga como plantilla vacía, se trabaja en herramientas externas (ChatGPT/VS Code) y se importa con los identificadores reales. |
| BR-N353 | Las instrucciones para IA permiten agregar/modificar tareas, requerimientos, entregables y pruebas; prohíben modificar el identificador del proyecto, el folio y el alcance incluido. |
| BR-N354 | Cualquier desviación del alcance se agrega como solicitud de cambio; no se modifica el alcance original. |
| BR-N355 | El Director (Atlas) revisa y mejora el JSON; el Programador trabaja tareas específicas; el PL revisa y aprueba al final. |
| BR-N356 | El Vendedor con doble rol PL puede participar en discovery; el Vendedor puro NO. |
| BR-N396 | Toda importación de JSON muestra al PL las altas, cambios y posibles conflictos antes de aplicarlos. |
| BR-N397 | Reimportar la misma versión aprobada del JSON no duplica módulos, requerimientos, tareas, pruebas ni entregables. |
| BR-N398 | Cada importación conserva versión, actor, fecha y resultado; sólo la aprobación del PL actualiza el plan de ejecución vigente. |

---

## B26 · Cálculos

| ID | Regla |
|---|---|
| BR-N357 | Total de línea de cotización = cantidad × precio unitario. |
| BR-N358 | Subtotal de cotización = suma de totales de línea menos descuento. |
| BR-N359 | IVA = subtotal × tasa / 100. |
| BR-N360 | Total de cotización = subtotal + IVA. |
| BR-N361 | Comisión estimada = base × tasa / 100. |
| BR-N362 | Comisión liberada = estimada × (facturado / total de la orden), con tope = estimada. (DEC-FUN-49.) |
| BR-N363 | Facturado = suma de facturas no canceladas de la orden. |
| BR-N364 | Cobrado = suma de aplicaciones confirmadas a facturas de la orden. |
| BR-N365 | Saldo de factura = total − aplicaciones confirmadas. |
| BR-N366 | Saldo de cuenta = balance inicial + entradas confirmadas − salidas confirmadas. |
| BR-N367 | Avance del proyecto = suma del peso de tareas done / suma del peso de todas las tareas no canceladas × 100 (0 si no hay tareas). |
| BR-N368 | Salud "retrasado" = hoy es posterior a la fecha efectiva de vencimiento y el proyecto no está completado. |
| BR-N369 | Salud "en riesgo" = proyecto activo, vence en 5 días o menos y progreso < 80%, o tiene tareas de alta prioridad bloqueadas. |
| BR-N370 | Salud "en tiempo" = cualquier otro caso. |

---

## B27 · Respaldo y disponibilidad

| ID | Regla |
|---|---|
| BR-N147 | Respaldo de base de datos diario, retenido 30 días. |
| BR-N371 | Los archivos almacenados se acceden vía enlaces firmados o privados; no hay acceso directo sin autorización. |
| BR-N372 | Al subir un archivo se valida tipo y tamaño. |
| BR-N373 | Los listados largos se muestran en páginas; el dashboard presenta datos agregados. |
| BR-N374 | Objetivo de respuesta < 2 segundos en operaciones comunes con datos de prueba. |

---

## Regla diferida no bloqueante

- La política de advertencia o bloqueo cuando la cotización exceda el presupuesto declarado permanece diferida como `Q-NB-3`. No afecta la definición técnica inicial de Proyectos; Comercial deberá declararla como gap si su SPEC necesita automatizar esa comparación.

---

## Resumen final

| Métrica | Valor |
|---|---|
| Reglas confirmadas con ID único | 231 |
| Reglas propuestas | 0 |
| Política funcional diferida | 1 (`Q-NB-3`) |
| **Total con ID** | **231** |

> **Nota:** la simulación del 17-ago arrastró cálculos incorrectos (mezcló costo-hora cotizado con snapshot interno; re-aplicó el % de comisión al liberarla). Estos son hallazgos P2 — ver HALLAZGOS H-20260817-11. Las reglas formales de cálculo son las de la sección B26.
