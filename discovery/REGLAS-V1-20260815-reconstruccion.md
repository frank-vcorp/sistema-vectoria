# REGLAS-V1-20260815-reconstruccion · Cuaderno de trabajo

**Fecha:** 2026-08-17 (sesión de reconstrucción, DEC-FUN-20260817-52)
**Objetivo:** reconstruir las 150+ reglas referenciadas en versiones previas a partir de las fuentes consolidadas del discovery.
**Convención de IDs:** los IDs existentes (BR-001 a BR-016 y BR-N01 a BR-N168) se conservan. Las nuevas reglas derivadas usan IDs `BR-N200` en adelante.
**Estado por regla:** `confirmed` (en repo previo o derivada con respaldo en una DEC-FUN ratificada) · `candidate` (derivada, espera confirmación Frank) · `proposed` (con alternativa).

**Criterio funcional aplicado (2026-08-17 22:30):** tras verificación ATLAS, se reformularon todas las reglas que mencionaban tablas físicas, campos de BD o mecanismos técnicos. Ahora describen comportamiento de negocio observable. Las menciones residuales a campos (folio, UUID, XML) se conservan cuando son términos de negocio reconocidos por el usuario (folio legible, UUID fiscal del CFDI).

## Fuentes de derivación
- `FUNCTIONAL-BASELINE.md` (decisiones, secciones, workflows)
- `DECISIONES-FUNCIONALES.md` (52 decisiones)
- `FLUJOS-FUNCIONALES.md` (estados, transiciones, handoffs, precondiciones)
- `ACTORES-Y-PERMISOS.md` (visibilidad, acciones)
- `archive/borradores-mixtos/vectoria_especificacion_..._mvp.json` (business_rules + calculations)
- `simulations/SIMULACION-FLUJO-COMPLETO-20260817.md` (validaciones §7)

---

## B1 · Organización y multi-tenancy

| ID | Regla | Estado |
|---|---|---|
| BR-016 | Los datos de una organización nunca son visibles para usuarios de otra organización. | confirmed |
| BR-N200 | Toda entidad de negocio se aísla por organización, incluso si el MVP tiene una sola. | candidate |
| BR-N201 | La configuración fiscal de la organización (RFC, razón social, régimen, certificado de sello, llave del PAC) es única y sólo el Director la edita. | candidate |
| BR-N202 | La moneda predeterminada de la organización es MXN; el campo de moneda queda reservado para multi-moneda futura. | candidate |
| BR-N203 | Las fechas se muestran al usuario en la zona horaria de la organización (México). | candidate |

---

## B2 · Actores, roles y permisos

| ID | Regla | Estado |
|---|---|---|
| BR-N127 | Los roles base no se eliminan; sólo se desactivan. | confirmed |
| BR-N128 | El Director puede crear roles adicionales a los base. | confirmed |
| BR-N131 | Los permisos adicionales otorgados a un usuario son siempre aditivos; nunca restan. | confirmed |
| BR-N204 | Un usuario puede tener hasta 5 roles simultáneos. | candidate |
| BR-N205 | La verificación de permisos se hace consultando los roles y permisos del usuario; nunca con comparaciones directas contra el nombre del rol en el código. | confirmed (regla de oro "cero hardcode") |
| BR-N206 | Toda otorgación o revocación de permiso adicional queda registrada en la bitácora de auditoría. | candidate |
| BR-N207 | El Vendedor no ve precios internos, márgenes, cuentas por cobrar de otros ni comisiones de otros. | candidate |
| BR-N208 | El Programador sólo ve su propio tiempo; no el del resto del equipo. | confirmed |
| BR-N209 | El Administrador ve todo lo comercial y financiero; los proyectos en modo lectura. | candidate |
| BR-N210 | El Líder de Proyecto no ve precios, márgenes, cuentas por cobrar ni comisiones. | candidate |
| BR-N211 | El Director ve todo el sistema. | candidate |
| BR-N212 | El Programador sólo ve los proyectos en los que tiene módulos asignados. | candidate |

---

## B3 · Clientes y prospectos

| ID | Regla | Estado |
|---|---|---|
| BR-N148 | Un prospecto sólo pasa a "calificado" si tiene cuestionario completado. | confirmed |
| BR-N168 | El cliente se crea desde un prospecto cuando cumple las condiciones; no manualmente. | confirmed |
| BR-N213 | Un prospecto "perdido" requiere motivo. | candidate |
| BR-N214 | Un prospecto "suspendido" requiere motivo y puede reactivarse. | candidate |
| BR-N215 | El cliente se archiva, no se elimina físicamente. | candidate |
| BR-N216 | Cada cliente tiene un número único dentro de la organización, generado por el sistema. | candidate |
| BR-N217 | Un cliente puede tener varios contactos; sólo uno se marca como principal. | candidate |
| BR-N218 | El cliente puede llevar datos fiscales opcionales (RFC, régimen, domicilio). | candidate |

---

## B4 · Cuestionarios de sondeo

| ID | Regla | Estado |
|---|---|---|
| BR-N149 | La cotización requiere un cuestionario de sondeo vinculado. | confirmed |
| BR-N219 | El cuestionario se estructura en 4 capas: base universal, por tipo de proyecto, por servicio seleccionado, sub-cuestionarios opcionales. | candidate |
| BR-N220 | **Regla de oro:** el vendedor nunca escribe el spec ni genera JSON de spec; el sistema lo genera desde cuestionario + catálogo + plantilla. | confirmed |
| BR-N221 | Cada cuestionario admite 3 versiones: digital (captura en pantalla), imprimible (para marcar a mano) y guía del vendedor (tips). | candidate |
| BR-N222 | Las preguntas son datos editables por el Director; no código. | confirmed |
| BR-N223 | Los sub-cuestionarios opcionales se activan según las respuestas anteriores del cuestionario. | candidate |
| BR-N224 | El cuestionario adapta entre 5 y 32 preguntas según la complejidad del proyecto. | candidate |
| BR-N225 | Las preguntas asociadas a un servicio son reutilizables en cualquier cuestionario. | candidate |

---

## B5 · Catálogo de servicios y plantillas

| ID | Regla | Estado |
|---|---|---|
| BR-N226 | El catálogo de servicios es configurable y alimenta el spec, la cotización y el discovery. | candidate |
| BR-N227 | Cada servicio del catálogo tiene un tipo (servicio único, servicio recurrente, producto único, producto recurrente) y un ciclo de facturación (único, mensual, anual, a convenir). | candidate |
| BR-N228 | Existen 9 plantillas base de proyecto (4 niveles de sistema web + 5 de otros tipos). | candidate |
| BR-N229 | Cada plantilla subdivide el proyecto en módulos con requerimientos, tareas, pruebas, entregables y dependencias entre módulos. | candidate |
| BR-N230 | El mapeo del catálogo "Sistema Web" a una plantilla específica (sitio / web app / saas) se hace por selección explícita en el cuestionario. (Pendiente Q-NB-1.) | proposed |

---

## B6 · Spec (especificación funcional firmada)

| ID | Regla | Estado |
|---|---|---|
| BR-N51 | La cotización requiere un spec firmado previamente. | confirmed |
| BR-N52 | El spec firmado es inmutable. | confirmed |
| BR-N231 | El spec lo genera el sistema desde cuestionario + catálogo + plantilla; el PL lo revisa, ajusta y firma. | confirmed (regla de oro) |
| BR-N232 | Los cambios posteriores al spec firmado se registran como solicitudes de cambio de alcance; no editan el spec original. | candidate |
| BR-N233 | El spec incluye: alcance incluido y excluido, entregables, supuestos, dependencias del cliente y criterios de aceptación. | candidate |

---

## B7 · Cotizaciones

| ID | Regla | Estado |
|---|---|---|
| BR-N01 | Una cotización sin vigencia vigente no se acepta. | confirmed |
| BR-N02 | Una cotización aceptada es inmutable. | confirmed |
| BR-N03 | En el MVP, una cotización aceptada genera una sola orden de servicio y la orden genera un solo proyecto. | confirmed |
| BR-N25 | Un prospecto admite una sola cotización aceptada (avisa si se emiten más de 5). | confirmed |
| BR-N143 | Descuento: hasta 10% libre · 10-25% requiere Director · más de 25% bloqueado. | confirmed |
| BR-N234 | La cotización es multi-línea con ítems auto-pre-llenados desde spec + catálogo. | confirmed (DEC-FUN-48) |
| BR-N235 | Vigencia mínima de cotización: 7 días. | candidate |
| BR-N236 | Una cotización puede tener versiones; sólo una versión puede marcarse como aceptada. | candidate |
| BR-N237 | Aceptar una cotización genera la orden de servicio una sola vez, en workflow atómico. | candidate |
| BR-N238 | El tipo de cobro de la cotización es: un pago, mensualidades o suscripción. | candidate |
| BR-N239 | Para suscripción, el pago inicial de personalización es obligatorio. | confirmed |
| BR-N240 | SLA cotización: el sistema alerta si la cotización lleva más de 48 horas hábiles sin respuesta. | confirmed |
| BR-N241 | La comisión se tasa una sola vez por orden de servicio (una sola tasa). | confirmed |

---

## B8 · Órdenes de Servicio (OS)

| ID | Regla | Estado |
|---|---|---|
| BR-017 | Si la orden lleva orden de compra del cliente, el monto debe coincidir con el total vendido y exige PDF antes de autorizar el inicio. | confirmed |
| BR-N121 | En suscripción, el proyecto no se autoriza hasta cobrar el pago inicial. | confirmed |
| BR-N242 | La orden de servicio nace al aceptar la cotización, con copia inmutable de los importes y el alcance vendidos. | candidate |
| BR-N243 | La orden puede llevar 4 datos opcionales de la orden de compra del cliente (número, fecha, monto, archivo). | candidate |
| BR-N244 | La orden no puede autorizarse a iniciar si el anticipo no está cobrado (al menos 90% del requerido o autorización del Director). | candidate |
| BR-N245 | La orden no puede autorizarse a iniciar si no hay líder técnico asignado. | candidate |
| BR-N246 | Al autorizar la orden, el sistema crea el proyecto en workflow atómico. | candidate |
| BR-N247 | La orden pasa a "en ejecución" cuando se crea el proyecto. | candidate |
| BR-N248 | La orden pasa a "entregada" cuando el proyecto cierra técnicamente. | candidate |
| BR-N249 | La orden pasa a "cerrada" administrativamente cuando el proyecto está terminado o cancelado y no hay saldo vencido, salvo autorización de dirección. | candidate |
| BR-N250 | La orden puede pausarse y cancelarse con motivo. | candidate |

---

## B9 · Proyectos

| ID | Regla | Estado |
|---|---|---|
| BR-N251 | El proyecto nace desde la orden con copia inmutable del alcance y los entregables base. | candidate |
| BR-N252 | El proyecto se subdivide en módulos; el avance se controla módulo por módulo. | candidate |
| BR-N253 | El proyecto tiene tres dimensiones de estado: etapa (planificación, desarrollo, pruebas, validación del cliente, entrega), situación (pendiente, activo, pausado, completado, cancelado) y salud (en tiempo, en riesgo, retrasado). | candidate |
| BR-N254 | El PL puede sobreescribir la salud del proyecto sólo con motivo; se conservan la calculada y la manual. | candidate |
| BR-N255 | El proyecto no puede cerrarse si hay actividades críticas abiertas, salvo excepción documentada. | candidate |
| BR-N256 | El proyecto no puede cerrarse si entregables obligatorios no están aceptados, salvo excepción aprobada. | candidate |
| BR-N257 | El proyecto no puede cerrarse si pruebas críticas no están aprobadas, salvo excepción aprobada. | candidate |
| BR-N258 | El cierre técnico del proyecto es distinto del cierre administrativo de la orden. | candidate |
| BR-N259 | El proyecto lleva bitácora con tipos: reunión, decisión, bloqueo, solicitud, cambio, entrega, aprobación, reprogramación, nota, sistema. | candidate |

---

## B10 · Módulos de proyecto

| ID | Regla | Estado |
|---|---|---|
| BR-N113 | Un módulo pasa a "deployed" sólo si: requerimientos validados, actividades con evidencia, pruebas aprobadas y entregables aceptados. | confirmed (DEC-FUN-47) |
| BR-N114 | Un módulo pasa a "in_progress" sólo si sus módulos dependientes están "deployed". | confirmed (DEC-FUN-47) |
| BR-N260 | Estados del módulo: `pending → in_progress → testing → deployed` (+ `paused`, `blocked`, `cancelled`). | confirmed (DEC-FUN-47) |
| BR-N261 | Salud del módulo: `on_track` / `at_risk` / `delayed`. | confirmed (DEC-FUN-47) |
| BR-N262 | El PL marca el módulo "in_progress" al iniciar y "deployed" al cerrar. | candidate |
| BR-N263 | El módulo puede pausarse con motivo y cancelarse con motivo. | candidate |

---

## B11 · Requerimientos

| ID | Regla | Estado |
|---|---|---|
| BR-005 | Un requerimiento no pasa a desarrollo sin descripción y criterio de aceptación. | confirmed |
| BR-N264 | Cada requerimiento tiene un folio único dentro del proyecto. | candidate |
| BR-N265 | Estados del requerimiento: propuesto → análisis → aprobado → desarrollo → pruebas → validado → rechazado / fuera de alcance. | candidate |
| BR-N266 | Un requerimiento rechazado o fuera de alcance requiere motivo. | candidate |
| BR-N267 | El requerimiento puede tener responsable asignado. | candidate |

---

## B12 · Tareas y checklist

| ID | Regla | Estado |
|---|---|---|
| BR-006 | Una tarea bloqueada requiere motivo. | confirmed |
| BR-007 | Una tarea "done" requiere checklist completo. | confirmed |
| BR-N268 | Estados de la tarea: backlog → ready → in_progress → blocked → in_review → done (cancelable). | candidate |
| BR-N269 | Sólo el PL asigna tareas; el técnico puede autoasignarse del backlog sin asignar. | confirmed |
| BR-N270 | Un técnico puede rechazar una tarea asignada con motivo obligatorio. | confirmed |
| BR-N271 | Una tarea "done" admite evidencia (link, archivo o nota). | candidate |
| BR-N272 | Una tarea puede tener participantes además del asignado. | candidate |
| BR-N273 | Una tarea puede tener dependencias simples con otras tareas. | candidate |
| BR-N274 | Una tarea puede vincularse a un requerimiento. | candidate |

---

## B13 · Tiempo y costos

| ID | Regla | Estado |
|---|---|---|
| BR-008 | Las horas registradas son mayores a cero, no superan 24 por día por usuario y conservan el costo por hora vigente al momento del registro. | confirmed |
| BR-N275 | Las horas pueden ser facturables, internas, de retrabajo o de soporte. | candidate |
| BR-N276 | El registro de tiempo es opcional en el MVP. | confirmed |
| BR-N277 | El técnico sólo ve su tiempo propio; el PL ve el del equipo de su proyecto. | confirmed |
| BR-N278 | El costo laboral del proyecto es la suma de los costos de todas las horas registradas. | confirmed (cálculo) |
| BR-N279 | El costo directo del proyecto es la suma de los gastos confirmados o conciliados imputados al proyecto. | confirmed (cálculo) |
| BR-N280 | El costo total del proyecto es la suma del costo laboral más el costo directo. | confirmed (cálculo) |
| BR-N281 | El margen bruto vendido es el importe vendido menos el costo total del proyecto. | confirmed (cálculo) |
| BR-N282 | La rentabilidad del proyecto se desglosa por técnico, no agregada. | confirmed |

---

## B14 · Tests

| ID | Regla | Estado |
|---|---|---|
| BR-009 | Una prueba "failed" requiere resultado obtenido y resumen de incidencia. | confirmed |
| BR-N283 | Existen 7 tipos de pruebas: funcional, visual, UI, aceptación, performance, seguridad, compatibilidad. | confirmed |
| BR-N284 | Las pruebas funcional, visual, UI, aceptación y compatibilidad bloquean el cierre del proyecto. | confirmed |
| BR-N285 | Las pruebas de performance y seguridad sólo generan advertencia. | confirmed |
| BR-N286 | La prueba de aceptación la ejecuta el Cliente (vía proxy PL) y bloquea el cierre. | confirmed |
| BR-N287 | Cuando el PL registra una aceptación en nombre del cliente, actúa como **registrador** y debe quedar evidencia, fecha y nombre de quien acepta. (Pendiente Q-NB-2.) | proposed |

---

## B15 · Entregables

| ID | Regla | Estado |
|---|---|---|
| BR-010 | Un entregable "accepted" requiere nombre de quien acepta y fecha. | confirmed |
| BR-N288 | Estados del entregable: pendiente → preparando → entregado → observado → corregido → aceptado / rechazado. | candidate |
| BR-N289 | El entregable lleva fecha comprometida y fecha real de entrega. | candidate |
| BR-N290 | El entregable puede llevar versión y comentarios del cliente. | candidate |
| BR-N291 | Un entregable rechazado puede ser corregido y re-entregado. | candidate |

---

## B16 · Cambios de alcance

| ID | Regla | Estado |
|---|---|---|
| BR-011 | Un cambio de alcance no se implementa hasta quedar autorizado. | confirmed |
| BR-N292 | El cambio de alcance se documenta con email o PDF (sin firma electrónica certificada). | confirmed |
| BR-N293 | Cada cambio de alcance tiene un folio único dentro del proyecto. | candidate |
| BR-N294 | Si el cambio requiere cobro adicional, se genera cotización vinculada antes de autorizar. | candidate |
| BR-N295 | El cambio de alcance evalúa impacto técnico, horas adicionales, costo adicional y nueva fecha. | candidate |
| BR-N296 | El cambio autorizado actualiza la versión del alcance y la bitácora sin alterar el alcance original. | candidate |

---

## B17 · Comisiones

| ID | Regla | Estado |
|---|---|---|
| BR-N33 v2 | La comisión se libera sobre facturado, no sobre cobrado. | confirmed (DEC-FUN-49) |
| BR-N123 | Si la factura se cancela, la comisión proporcional se reversa. | confirmed |
| BR-N297 | La comisión estimada nace al aceptar la cotización cuando la tasa es mayor a cero. | candidate |
| BR-N298 | La comisión se tasa una sola vez por orden de servicio. | confirmed |
| BR-N299 | La comisión sólo se marca "pagada" cuando el Director o Administrador la transfiere explícitamente (default: día 15 de cada mes). | candidate |
| BR-N300 | Estados de la comisión: estimada → devengada → liberada → pagada (+ cancelada). | candidate |

---

## B18 · Facturación (CFDI 4.0)

| ID | Regla | Estado |
|---|---|---|
| BR-N301 | El sistema timbra CFDI 4.0 directamente vía FacturoPorTi (no se registran facturas externas). | confirmed (DEC-FUN-50) |
| BR-N302 | El certificado de sello digital y la llave del PAC se guardan de forma protegida en el sistema. | candidate |
| BR-N303 | El sistema arma el comprobante, valida los campos requeridos, muestra preview al usuario y timbra al confirmar. | candidate |
| BR-N304 | Tras timbrar, el sistema conserva el UUID fiscal, el XML y el PDF. | candidate |
| BR-N305 | La cancelación de factura requiere motivo SAT (01 con relación / 02 sin relación / 03 operación no realizada / 04 duplicado). | candidate |
| BR-N306 | Estados de la factura: borrador → emitida → parcialmente pagada → pagada (+ vencida, cancelada). | candidate |
| BR-N307 | Una factura pasa a "vencida" cuando se vence su fecha de pago y queda saldo pendiente. | candidate |
| BR-N308 | Una factura puede recibir varias aplicaciones de cobro; la suma no supera el importe del cobro ni el saldo de la factura. | confirmed (BR-012) |
| BR-N309 | Cancelar una factura no elimina cobros; exige reversar o reasignar las aplicaciones. | candidate |
| BR-N310 | La facturación recurrente corre automáticamente cada noche, busca programaciones con fecha de cobro del día y crea la factura (auto o borrador según configuración). | candidate |
| BR-N311 | El ZIP mensual para contador externo se genera automáticamente al cierre del mes y a demanda; sólo con facturas activas (no canceladas). | confirmed |
| BR-N312 | El calendario de facturación muestra 7 estados visuales: pendiente, facturada, cobrada, vencida, promesa, disputada, escalada. | candidate |
| BR-N313 | Tras 2 promesas incumplidas, la factura escala automáticamente. | candidate |

---

## B19 · Cobros y aplicación

| ID | Regla | Estado |
|---|---|---|
| BR-012 | La suma de aplicaciones de cobro no supera el importe del cobro ni el saldo de las facturas. | confirmed |
| BR-N314 | Estados del cobro: registrado → confirmado → reversado. | candidate |
| BR-N315 | Un cobro "registrado" puede editarse; uno "confirmado" sólo se reversa. | candidate |
| BR-N316 | Al confirmar el cobro, se crea el movimiento de ingreso vinculado. | candidate |
| BR-N317 | Un cobro puede aplicarse a varias facturas. | candidate |
| BR-N318 | Reversar un cobro exige motivo y deja referencia al cobro original. | candidate |
| BR-N319 | El cobro lleva comprobante y referencia opcional (SPEI, etc.). | candidate |

---

## B20 · Cobranza

| ID | Regla | Estado |
|---|---|---|
| BR-N320 | El calendario de cobranza muestra ingresos esperados vs reales por mes. | candidate |
| BR-N321 | El cobrador tiene plantillas de mensaje (amable, firme, final). | candidate |
| BR-N322 | Toda actividad de cobranza (llamada, email, promesa) se registra. | candidate |
| BR-N323 | Las promesas de pago se trackean y escalan tras 2 incumplidas. | candidate |
| BR-N324 | Los casos urgentes se priorizan en una cola del cobrador. | candidate |
| BR-N325 | La cobranza es un módulo separado del Comercial. | confirmed |

---

## B21 · Finanzas y movimientos

| ID | Regla | Estado |
|---|---|---|
| BR-013 | Un movimiento "reconciled" no se edita ni elimina. | confirmed |
| BR-014 | Cancelar o revertir operaciones críticas exige motivo y genera auditoría. | confirmed |
| BR-015 | Los importes vendidos, facturados y cobrados se calculan y muestran por separado. | confirmed |
| BR-N326 | Una transferencia entre cuentas propias genera salida y entrada vinculadas; no cuenta como ingreso ni gasto operativo. | confirmed |
| BR-N327 | Un préstamo o aportación no cuenta como venta. | candidate |
| BR-N328 | Un retiro de socio no cuenta como gasto operativo. | candidate |
| BR-N329 | Las correcciones financieras se hacen por cancelación o reverso con motivo y autorización. | confirmed |
| BR-N330 | Se distingue fecha de operación, fecha de vencimiento y fecha real de pago. | candidate |
| BR-N331 | Estados del movimiento: borrador → confirmado → conciliado (+ cancelado, reversado). | candidate |
| BR-N332 | Las cuentas por cobrar nacen a partir de facturas; las cuentas por pagar son básicas. | candidate |
| BR-N333 | Los costos directos se imputan a un proyecto cuando el movimiento es un gasto confirmado o conciliado. | candidate |
| BR-N334 | El costo de horas por proyecto usa el costo por hora vigente al momento del registro. | confirmed (BR-008) |
| BR-N335 | La rentabilidad por proyecto combina costo laboral + costo directo contra importe vendido. | confirmed (cálculo) |

---

## B22 · Auditoría y trazabilidad

| ID | Regla | Estado |
|---|---|---|
| BR-N336 | Toda acción crítica (aceptar cotización, autorizar orden, crear proyecto, cerrar orden, facturar, cobrar, pagar comisión) queda en el registro de auditoría. | candidate |
| BR-N337 | El registro de auditoría captura: quién actúa, qué entidad, antes y después, motivo y momento. | candidate |
| BR-N338 | La bitácora del proyecto registra reuniones, decisiones, bloqueos, solicitudes, cambios, entregas, aprobaciones, reprogramaciones y notas. | candidate |
| BR-N339 | Las entradas de la bitácora pueden marcarse como no visibles para técnicos (notas privadas de dirección). | candidate |
| BR-N340 | Los archivos pueden enlazarse a cualquier entidad de negocio (cliente, cotización, orden, proyecto, etc.). | candidate |

---

## B23 · Hoy / Dashboard

| ID | Regla | Estado |
|---|---|---|
| BR-N341 | La vista Hoy/Dashboard es por rol: cada uno ve sus pendientes y alertas. | candidate |
| BR-N342 | Los widgets del dashboard son configurables por usuario (drag & drop). | confirmed |
| BR-N343 | El default de la vista es "Esta semana" con filtro "Hoy". | confirmed |
| BR-N344 | El Director ve: proyectos en riesgo, cuentas por cobrar, ingresos/egresos. | candidate |
| BR-N345 | El Vendedor ve: prospectos sin próxima acción, cotizaciones por vencer. | candidate |
| BR-N346 | El Administrador ve: facturas vencidas, cobros del día, ingresos/egresos. | candidate |
| BR-N347 | El PL ve: actividades del día, proyectos en riesgo, próximas entregas. | candidate |
| BR-N348 | El Programador ve: actividades del día, bloqueos. | candidate |

---

## B24 · Notificaciones

| ID | Regla | Estado |
|---|---|---|
| BR-N349 | En el MVP las notificaciones son sólo dentro de la aplicación (no email ni WhatsApp). | confirmed |
| BR-N350 | Eventos que generan notificación: prospecto sin próxima acción, cotización próxima a vencer, orden pendiente de anticipo o información, actividad asignada, actividad próxima a vencer o vencida, actividad bloqueada, proyecto en riesgo o retrasado, entregable próximo o con observaciones, cambio de alcance pendiente de revisión, factura próxima a vencer o vencida. | candidate |

---

## B25 · JSON Discovery (round-trip)

| ID | Regla | Estado |
|---|---|---|
| BR-N351 | El JSON Discovery descompone el proyecto en módulos/tareas/pruebas/entregables; no crea el spec. | confirmed |
| BR-N352 | El JSON se descarga como plantilla vacía, se trabaja en herramientas externas (ChatGPT/VS Code) y se importa con los identificadores reales. | candidate |
| BR-N353 | Las instrucciones para IA permiten agregar/modificar tareas, requerimientos, entregables y pruebas; prohíben modificar el identificador del proyecto, el folio y el alcance incluido. | candidate |
| BR-N354 | Cualquier desviación del alcance se agrega como solicitud de cambio; no se modifica el alcance original. | candidate |
| BR-N355 | El Director (Atlas) revisa y mejora el JSON; el Programador trabaja tareas específicas; el PL revisa y aprueba al final. | candidate |
| BR-N356 | El Vendedor con doble rol PL puede participar en discovery; el Vendedor puro NO. | candidate |

---

## B26 · Cálculos

| ID | Regla | Estado |
|---|---|---|
| BR-N357 | Total de línea de cotización = cantidad × precio unitario. | confirmed (cálculo) |
| BR-N358 | Subtotal de cotización = suma de totales de línea menos descuento. | confirmed (cálculo) |
| BR-N359 | IVA = subtotal × tasa / 100. | confirmed (cálculo) |
| BR-N360 | Total de cotización = subtotal + IVA. | confirmed (cálculo) |
| BR-N361 | Comisión estimada = base × tasa / 100. | confirmed (cálculo) |
| BR-N362 | Comisión liberada = estimada × (facturado / total de la orden), con tope = estimada. | confirmed (DEC-FUN-49, cálculo) |
| BR-N363 | Facturado = suma de facturas no canceladas de la orden. | confirmed (cálculo) |
| BR-N364 | Cobrado = suma de aplicaciones confirmadas a facturas de la orden. | confirmed (cálculo) |
| BR-N365 | Saldo de factura = total − aplicaciones confirmadas. | confirmed (cálculo) |
| BR-N366 | Saldo de cuenta = balance inicial + entradas confirmadas − salidas confirmadas. | confirmed (cálculo) |
| BR-N367 | Avance del proyecto = suma del peso de tareas done / suma del peso de todas las tareas no canceladas × 100 (0 si no hay tareas). | confirmed (cálculo) |
| BR-N368 | Salud "retrasado" = hoy es posterior a la fecha efectiva de vencimiento y el proyecto no está completado. | confirmed (cálculo) |
| BR-N369 | Salud "en riesgo" = proyecto activo, vence en 5 días o menos y progreso < 80%, o tiene tareas de alta prioridad bloqueadas. | confirmed (cálculo) |
| BR-N370 | Salud "en tiempo" = cualquier otro caso. | confirmed (cálculo) |

---

## B27 · Respaldo y disponibilidad

| ID | Regla | Estado |
|---|---|---|
| BR-N147 | Respaldo de base de datos diario, retenido 30 días. | confirmed |
| BR-N371 | Los archivos almacenados se acceden vía enlaces firmados o privados; no hay acceso directo sin autorización. | candidate |
| BR-N372 | Al subir un archivo se valida tipo y tamaño. | candidate |
| BR-N373 | Los listados son paginados; el dashboard es agregado y con índices. | candidate |
| BR-N374 | Objetivo de respuesta < 2 segundos en operaciones comunes con datos de prueba. | candidate |

---

## Resumen de la reconstrucción

- **Reglas confirmed:** 84 (las 31 originales + 53 derivadas con respaldo en una DEC-FUN ratificada o en un cálculo confirmado).
- **Reglas candidate:** 121 derivadas de las fuentes consolidadas; esperan confirmación de Frank.
- **Reglas proposed:** 2 (BR-N230 y BR-N287) amarradas a Q-NB-1 y Q-NB-2.
- **Total reconstruido:** 207 reglas (excede el objetivo de 150+).

## Criterio funcional aplicado

Tras verificación ATLAS, se reformularon todas las reglas que mencionaban tablas físicas, campos de BD o mecanismos técnicos. Las menciones residuales (folio, UUID fiscal, XML del CFDI) se conservan porque son términos de negocio reconocidos por el usuario, no detalles técnicos.

## Próximo paso

Frank confirma en lote o por bloque. Las `confirmed` se incorporan directo a `REGLAS-DE-NEGOCIO.md`; las `candidate` pasan a `confirmed` o se corrigen; las `proposed` se cierran con Q-NB-1 / Q-NB-2.
