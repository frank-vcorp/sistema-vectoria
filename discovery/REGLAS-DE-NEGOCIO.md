# REGLAS-DE-NEGOCIO · Vector IA

**Versión:** 2026-08-17 (reconstruida 22:30)
**Convención:** `BR-###` (regla original estable) y `BR-N###` (regla ratificada en sesiones posteriores). Mismas IDs del repositorio, sin renumerar.

> **Reconstrucción de las 150+ reglas (DEC-FUN-20260817-52):** ATLAS reconstruyó las reglas referenciadas en versiones previas a partir de las fuentes consolidadas. **Resultado:** 207 reglas totales = **84 confirmed** + 121 candidate + 2 proposed. Este documento lista las 84 confirmed (las 31 originales + 53 nuevas derivadas con respaldo en una DEC-FUN ratificada o en un cálculo confirmado). Las 121 candidate y 2 proposed viven en `discovery/REGLAS-V1-20260815-reconstruccion.md` esperando confirmación de Frank.

> **Vocabulario de estados de módulo (DEC-FUN-20260817-47):** vocabulario único vigente — `pending → in_progress → testing → deployed` (+ laterales `paused`, `blocked`, `cancelled`). Salud: `on_track / at_risk / delayed`. BR-N113 y BR-N114 usan este vocabulario.

> **Criterio funcional aplicado:** todas las reglas se reformularon a lenguaje de negocio observable. Las menciones residuales (folio, UUID fiscal, XML del CFDI) se conservan porque son términos de negocio reconocidos por el usuario, no detalles técnicos.

---

## B1 · Organización y multi-tenancy

| ID | Regla | Estado |
|---|---|---|
| BR-016 | Los datos de una organización nunca son visibles para usuarios de otra organización. | confirmed |

---

## B2 · Actores, roles y permisos

| ID | Regla | Estado |
|---|---|---|
| BR-N127 | Los roles base no se eliminan; sólo se desactivan. | confirmed |
| BR-N128 | El Director puede crear roles adicionales a los base. | confirmed |
| BR-N131 | Los permisos adicionales otorgados a un usuario son siempre aditivos; nunca restan. | confirmed |
| BR-N205 | La verificación de permisos se hace consultando los roles y permisos del usuario; nunca con comparaciones directas contra el nombre del rol en el código. (Regla de oro "cero hardcode".) | confirmed |

---

## B3 · Clientes y prospectos

| ID | Regla | Estado |
|---|---|---|
| BR-N148 | Un prospecto sólo pasa a "calificado" si tiene cuestionario completado. | confirmed |
| BR-N168 | El cliente se crea desde un prospecto cuando cumple las condiciones; no manualmente. | confirmed |

---

## B4 · Cuestionarios de sondeo

| ID | Regla | Estado |
|---|---|---|
| BR-N149 | La cotización requiere un cuestionario de sondeo vinculado. | confirmed |
| BR-N220 | **Regla de oro:** el vendedor nunca escribe el spec ni genera JSON de spec; el sistema lo genera desde cuestionario + catálogo + plantilla. | confirmed |
| BR-N222 | Las preguntas son datos editables por el Director; no código. | confirmed |

---

## B5 · Catálogo de servicios y plantillas

(Sin reglas confirmed en este bloque. Ver `REGLAS-V1-20260815-reconstruccion.md` B5 para las 5 candidate.)

---

## B6 · Spec (especificación funcional firmada)

| ID | Regla | Estado |
|---|---|---|
| BR-N51 | La cotización requiere un spec firmado previamente. | confirmed |
| BR-N52 | El spec firmado es inmutable. | confirmed |
| BR-N231 | El spec lo genera el sistema desde cuestionario + catálogo + plantilla; el PL lo revisa, ajusta y firma. (Regla de oro.) | confirmed |

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
| BR-N239 | Para suscripción, el pago inicial de personalización es obligatorio. | confirmed |
| BR-N240 | SLA cotización: el sistema alerta si la cotización lleva más de 48 horas hábiles sin respuesta. | confirmed |
| BR-N241 | La comisión se tasa una sola vez por orden de servicio (una sola tasa). | confirmed |

---

## B8 · Órdenes de Servicio (OS)

| ID | Regla | Estado |
|---|---|---|
| BR-017 | Si la orden lleva orden de compra del cliente, el monto debe coincidir con el total vendido y exige PDF antes de autorizar el inicio. | confirmed |
| BR-N121 | En suscripción, el proyecto no se autoriza hasta cobrar el pago inicial. | confirmed |

---

## B9 · Proyectos

(Sin reglas confirmed en este bloque. Ver `REGLAS-V1-20260815-reconstruccion.md` B9 para las 9 candidate.)

---

## B10 · Módulos de proyecto

| ID | Regla | Estado |
|---|---|---|
| BR-N113 | Un módulo pasa a "deployed" sólo si: requerimientos validados, actividades con evidencia, pruebas aprobadas y entregables aceptados. | confirmed (DEC-FUN-47) |
| BR-N114 | Un módulo pasa a "in_progress" sólo si sus módulos dependientes están "deployed". | confirmed (DEC-FUN-47) |
| BR-N260 | Estados del módulo: `pending → in_progress → testing → deployed` (+ `paused`, `blocked`, `cancelled`). | confirmed (DEC-FUN-47) |
| BR-N261 | Salud del módulo: `on_track` / `at_risk` / `delayed`. | confirmed (DEC-FUN-47) |

---

## B11 · Requerimientos

| ID | Regla | Estado |
|---|---|---|
| BR-005 | Un requerimiento no pasa a desarrollo sin descripción y criterio de aceptación. | confirmed |

---

## B12 · Tareas y checklist

| ID | Regla | Estado |
|---|---|---|
| BR-006 | Una tarea bloqueada requiere motivo. | confirmed |
| BR-007 | Una tarea "done" requiere checklist completo. | confirmed |
| BR-N269 | Sólo el PL asigna tareas; el técnico puede autoasignarse del backlog sin asignar. | confirmed |
| BR-N270 | Un técnico puede rechazar una tarea asignada con motivo obligatorio. | confirmed |

---

## B13 · Tiempo y costos

| ID | Regla | Estado |
|---|---|---|
| BR-008 | Las horas registradas son mayores a cero, no superan 24 por día por usuario y conservan el costo por hora vigente al momento del registro. | confirmed |
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

---

## B15 · Entregables

| ID | Regla | Estado |
|---|---|---|
| BR-010 | Un entregable "accepted" requiere nombre de quien acepta y fecha. | confirmed |

---

## B16 · Cambios de alcance

| ID | Regla | Estado |
|---|---|---|
| BR-011 | Un cambio de alcance no se implementa hasta quedar autorizado. | confirmed |
| BR-N292 | El cambio de alcance se documenta con email o PDF (sin firma electrónica certificada). | confirmed |

---

## B17 · Comisiones

| ID | Regla | Estado |
|---|---|---|
| BR-N33 v2 | La comisión se libera sobre facturado, no sobre cobrado. | confirmed (DEC-FUN-49) |
| BR-N123 | Si la factura se cancela, la comisión proporcional se reversa. | confirmed |
| BR-N298 | La comisión se tasa una sola vez por orden de servicio. | confirmed |

---

## B18 · Facturación (CFDI 4.0)

| ID | Regla | Estado |
|---|---|---|
| BR-N301 | El sistema timbra CFDI 4.0 directamente vía FacturoPorTi (no se registran facturas externas). | confirmed (DEC-FUN-50) |
| BR-N311 | El ZIP mensual para contador externo se genera automáticamente al cierre del mes y a demanda; sólo con facturas activas (no canceladas). | confirmed |

---

## B19 · Cobros y aplicación

| ID | Regla | Estado |
|---|---|---|
| BR-012 | La suma de aplicaciones de cobro no supera el importe del cobro ni el saldo de las facturas. | confirmed |

---

## B20 · Cobranza

| ID | Regla | Estado |
|---|---|---|
| BR-N325 | La cobranza es un módulo separado del Comercial. | confirmed |

---

## B21 · Finanzas y movimientos

| ID | Regla | Estado |
|---|---|---|
| BR-013 | Un movimiento "reconciled" no se edita ni elimina. | confirmed |
| BR-014 | Cancelar o revertir operaciones críticas exige motivo y genera auditoría. | confirmed |
| BR-015 | Los importes vendidos, facturados y cobrados se calculan y muestran por separado. | confirmed |
| BR-N326 | Una transferencia entre cuentas propias genera salida y entrada vinculadas; no cuenta como ingreso ni gasto operativo. | confirmed |
| BR-N329 | Las correcciones financieras se hacen por cancelación o reverso con motivo y autorización. | confirmed |
| BR-N334 | El costo de horas por proyecto usa el costo por hora vigente al momento del registro. | confirmed (BR-008) |
| BR-N335 | La rentabilidad por proyecto combina costo laboral + costo directo contra importe vendido. | confirmed (cálculo) |

---

## B22 · Auditoría y trazabilidad

(Sin reglas confirmed en este bloque. Ver `REGLAS-V1-20260815-reconstruccion.md` B22 para las 5 candidate.)

---

## B23 · Hoy / Dashboard

| ID | Regla | Estado |
|---|---|---|
| BR-N342 | Los widgets del dashboard son configurables por usuario (drag & drop). | confirmed |
| BR-N343 | El default de la vista es "Esta semana" con filtro "Hoy". | confirmed |

---

## B24 · Notificaciones

| ID | Regla | Estado |
|---|---|---|
| BR-N349 | En el MVP las notificaciones son sólo dentro de la aplicación (no email ni WhatsApp). | confirmed |

---

## B25 · JSON Discovery (round-trip)

| ID | Regla | Estado |
|---|---|---|
| BR-N351 | El JSON Discovery descompone el proyecto en módulos/tareas/pruebas/entregables; no crea el spec. | confirmed |

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

---

## Reglas candidate y proposed pendientes

Las siguientes reglas están **verificadas como funcionales** por ATLAS pero esperan confirmación de Frank porque son derivadas (no respaldadas por una DEC-FUN ratificada). Viven en `discovery/REGLAS-V1-20260815-reconstruccion.md`:

- **121 reglas candidate** distribuidas en los bloques B1 a B27.
- **2 reglas proposed** amarradas a preguntas no bloqueantes:
  - `BR-N230` (mapeo catálogo → plantilla) — Pendiente Q-NB-1.
  - `BR-N287` (PL como registrador de aceptación del cliente) — Pendiente Q-NB-2.

---

## Reglas referenciadas sin ID estable (captura futura)

Las siguientes reglas no se incorporaron al cuaderno de reconstrucción porque están amarradas a huecos funcionales aún no resueltos. Se numerarán cuando Frank cierre la pregunta NB correspondiente:

- `R-aceptacion-cliente-via-proxy-PL` — quién registra la aceptación en nombre del cliente y qué evidencia se exige (Q-NB-2 / H-20260817-08).
- `R-desviacion-presupuestal` — alerta o bloqueo cuando la cotización excede el presupuesto declarado en el cuestionario (Q-NB-3 / H-20260817-09).
- `R-asignacion-programador` — quién y cuándo asigna programadores a un módulo/proyecto (Q-NB-4 / H-20260817-10).
- `R-cierre-tecnico-vs-administrativo` — separar el cierre técnico del proyecto del cierre administrativo de la OS (Q-NB-5 / H-20260817-14).
- `R-mapeo-catalogo-plantilla` — cómo el sistema mapea un servicio del catálogo a una plantilla (Q-NB-1 / H-20260817-07).

---

## Resumen

| Métrica | Valor |
|---|---|
| Reglas confirmed (este archivo) | 84 |
| Reglas candidate (cuaderno) | 121 |
| Reglas proposed (cuaderno) | 2 |
| Reglas sin ID (captura futura) | 5 |
| **Total** | **212** |

> **Nota:** la simulación del 17-ago arrastró cálculos incorrectos (mezcló costo-hora cotizado con snapshot interno; re-aplicó el % de comisión al liberarla). Estos son hallazgos P2 — ver HALLAZGOS H-20260817-11. Las reglas formales de cálculo son las de la sección B26 de este archivo.
