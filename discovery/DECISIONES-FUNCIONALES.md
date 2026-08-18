# DECISIONES-FUNCIONALES · Vector IA

**Versión:** 2026-08-17
**Criterio de inclusión:** sólo decisiones explícitamente ratificadas por Frank o con fuente inequívoca en discovery.

---

## DEC-FUN-20260814-01 · Sistema con módulos + catálogos + plantillas + cuestionarios
- **Pregunta:** ¿Cómo se estructura el sistema?
- **Opciones consideradas:** monolito con todo hardcoded · módulos rígidos · sistema modular configurable con datos.
- **Decisión:** sistema modular configurable, todo dato (no código).
- **Razón:** empresa pequeña con necesidad de adaptación sin reprogramar.
- **Estado:** confirmed
- **Confirmación:** sesión 14-ago (decisión estructural #1) ratificada 17-ago.
- **Reemplaza a:** —

## DEC-FUN-20260814-02 · Roles NO hardcoded (datos, no código)
- **Decisión:** roles y permisos viven en tablas, no en `if` de código. Cero hardcode.
- **Estado:** confirmed (decisión estructural #2).
- **Implicación:** INTEGRA debe usar `hasPermission(code)` en verificación, no `if (user.role === 'director')`.

## DEC-FUN-20260814-03 · Combinación de roles
- **Decisión:** un usuario puede tener hasta 5 roles. Ejemplos: `[vendedor, lider_proyecto]`, `[director]`, `[programador, qa]`.
- **Estado:** confirmed (decisión estructural #3).

## DEC-FUN-20260814-04 · Cliente se crea desde prospecto (no manualmente)
- **Decisión:** al calificar un prospecto, si cumple condiciones, se crea el cliente automáticamente.
- **Estado:** confirmed (decisiones #4 y #20). BR-N168.

## DEC-FUN-20260814-05 · Spec se firma ANTES de cotizar
- **Decisión:** orden funcional Prospecto → Cuestionario → Spec firmado → Cotización → OS → Proyecto.
- **Estado:** confirmed (decisión #5). BR-N51 (cotización requiere spec firmado), BR-N52 (spec firmado inmutable).

## DEC-FUN-20260814-06 · Cotización multi-línea
- **Decisión:** cotización con múltiples líneas, items auto-pre-llenados desde spec + catálogo.
- **Estado:** confirmed en 24-ago (decisión #6). ⚠️ **Contradice** la restricción inicial "Cotización 1 línea" (DISCOVERY-01 §Restricción Crítica 1). Frank debe ratificar. Ver H-20260817-02.

## DEC-FUN-20260814-07 · OS con campos de OC opcionales
- **Decisión:** OS puede llevar 4 campos opcionales para Orden de Compra del cliente.
- **Estado:** confirmed (decisión #7). BR-017.

## DEC-FUN-20260814-08 · Sin módulo Impuestos formal
- **Decisión:** se genera ZIP mensual para contador externo; no hay módulo Impuestos con pólizas.
- **Estado:** confirmed (decisión #8).

## DEC-FUN-20260814-09 · Tareas con horas opcionales
- **Decisión:** registro de tiempo es opcional en MVP.
- **Estado:** confirmed (decisión #9). Visibilidad del tiempo solo del propio (decisión táctica 36).

## DEC-FUN-20260814-10 · Timbrado CFDI real con FacturoPorTi
- **Decisión:** el sistema timbra CFDI 4.0 directamente vía API. CSD y API key encriptados en BD.
- **Estado:** confirmed (decisión #10) — **contradice** JSON archive que dice "no implementar conexión directa con SAT" en MVP. Frank debe ratificar. Ver H-20260817-04.

## DEC-FUN-20260814-11 · Módulo Cobranza separado del Comercial
- **Decisión:** cobranza es módulo propio, no sub-módulo de Comercial.
- **Estado:** confirmed (decisión #11). ⚠️ Algunos documentos lo listan como sub-módulo. Frank debe ratificar visibilidad.

## DEC-FUN-20260814-12 · Plantillas con 4 niveles para Sistema Web
- **Decisión:** landing, sitio, web app y saas son 4 plantillas distintas.
- **Estado:** confirmed (decisión #12).

## DEC-FUN-20260814-13 · 7 tipos de tests
- **Decisión:** functional, visual, ui, acceptance, performance, security, compatibility.
- **Estado:** confirmed (decisión #13).

## DEC-FUN-20260814-14 · Estructura modular en plantillas (project_modules)
- **Decisión:** cada plantilla subdivide un proyecto en módulos con `requirements/tasks/tests/deliverables` propios y `depends_on_modules[]`.
- **Estado:** confirmed (decisión #14). ⚠️ Vocabulario de estados a unificar (ver H-20260817-01).

## DEC-FUN-20260814-15 · JSON Discovery al FINAL (no round-trip continuo)
- **Decisión:** el JSON Discovery se usa para descomponer el proyecto una vez que el spec está firmado, no durante todo el ciclo.
- **Estado:** confirmed (decisión #15). Antes: el spec se genera automáticamente por el sistema desde cuestionario + catálogo + plantilla; el JSON sólo descompone.

## DEC-FUN-20260814-16 · Comisiones sobre FACTURADO, no sobre COBRADO
- **Decisión:** `comision.liberada = estimada × Σ(facturas NO canceladas) / total_OS`.
- **Estado:** confirmed (decisión #16, BR-N33 v2). ⚠️ JSON archive contradice con cálculo sobre cobrado. Ver H-20260817-03.

## DEC-FUN-20260814-17 · Suscripciones con cobro inicial obligatorio
- **Decisión:** para `suscripcion`, primero se cobra el pago de personalización y luego se autoriza el proyecto.
- **Estado:** confirmed (decisión #17). BR-N121.

## DEC-FUN-20260814-18 · Cuestionarios antes del spec, 3 versiones
- **Decisión:** el vendedor aplica cuestionario (digital/imprimible/guía) y el sistema genera el spec.
- **Estado:** confirmed (decisión #18).

## DEC-FUN-20260814-19 · 14 medios de contacto
- **Decisión:** el sistema soporta 14 medios de contacto (llamada, email, whatsapp, etc.).
- **Estado:** confirmed (decisión #19).

## DEC-FUN-20260814-20 · Tooltips explicativos en configuración
- **Decisión:** las pantallas de administración/configuración llevan tooltips de ayuda.
- **Estado:** confirmed (decisión #21).

## DEC-FUN-20260814-21 · Link de invitación sin integración WhatsApp
- **Decisión:** el sistema usa link de invitación para acceder; no se integra WhatsApp en MVP.
- **Estado:** confirmed (decisión #22).

## DEC-FUN-20260814-22 · Permisos custom aditivos por usuario
- **Decisión:** un usuario puede recibir permisos EXTRA individuales (aditivos) otorgados por Director.
- **Estado:** confirmed (decisión #23, BR-N131).

## DEC-FUN-20260817-23 · Regla de oro: el vendedor NO hace spec con IA
- **Decisión:** vendedor solo llena cuestionario. Spec lo genera el sistema. La IA externa no participa en crear el spec.
- **Estado:** confirmed (ratificada 17-ago).

## DEC-FUN-20260817-24 · CxC/CxP tabla por defecto + calendario como filtro
- **Decisión:** el default de cuentas por cobrar/pagar es la tabla; el calendario es un filtro visual.
- **Estado:** confirmed (táctica 24).

## DEC-FUN-20260817-25 · Rentabilidad desglosada por técnico
- **Decisión:** la rentabilidad por proyecto muestra el desglose por técnico, no un agregado.
- **Estado:** confirmed (táctica 25).

## DEC-FUN-20260817-26 · ZIP contador auto al cierre de mes + manual bajo demanda
- **Decisión:** el sistema genera un ZIP mensual para el contador externo, automáticamente al cierre, y permite descarga manual.
- **Estado:** confirmed (táctica 26).

## DEC-FUN-20260817-27 · Transferencias entre cuentas requieren paso explícito
- **Decisión:** una transferencia interna es una operación explícita con entrada y salida vinculadas. No cuenta como ingreso o gasto operativo.
- **Estado:** confirmed (táctica 27, BR-013).

## DEC-FUN-20260817-28 · Widgets por rol configurables
- **Decisión:** la vista Hoy/Dashboard muestra widgets configurables por usuario (drag & drop).
- **Estado:** confirmed (táctica 28).

## DEC-FUN-20260817-29 · Notificaciones solo in-app en MVP
- **Decisión:** en MVP no se envían notificaciones por email ni WhatsApp; sólo in-app.
- **Estado:** confirmed (táctica 29).

## DEC-FUN-20260817-30 · Default "Esta semana" + filtro "Hoy"
- **Decisión:** la vista Hoy/Dashboard muestra "Esta semana" por defecto y permite filtrar a "Hoy".
- **Estado:** confirmed (táctica 30).

## DEC-FUN-20260817-31 · SLA cotización 48h hábiles
- **Decisión:** el sistema dispara alerta si una cotización lleva más de 48h hábiles sin respuesta.
- **Estado:** confirmed (táctica 31).

## DEC-FUN-20260817-32 · Asignación de tareas: solo el PL
- **Decisión:** sólo el Líder de Proyecto asigna tareas; los técnicos pueden autoasignarse del backlog sin asignar.
- **Estado:** confirmed (tácticas 33, 34).

## DEC-FUN-20260817-33 · Rechazo de tareas con motivo obligatorio
- **Decisión:** un técnico puede rechazar una tarea asignada indicando motivo.
- **Estado:** confirmed (táctica 35).

## DEC-FUN-20260817-34 · Módulo de soporte post-venta NO en MVP
- **Decisión:** no se incluye mesa de ayuda ni soporte post-venta en el MVP.
- **Estado:** confirmed (táctica 37, fuera de scope MVP).

## DEC-FUN-20260817-35 · Reembolso por cancelación proporcional con aprobación Director
- **Decisión:** si la OS se cancela, el reembolso es proporcional al avance y requiere aprobación del Director.
- **Estado:** confirmed (táctica 38).

## DEC-FUN-20260817-36 · Cambios de alcance con email/PDF (no firma digital)
- **Decisión:** los cambios de alcance se documentan con email o PDF; no se usa firma electrónica certificada.
- **Estado:** confirmed (táctica 39).

## DEC-FUN-20260817-37 · Sin descuentos automáticos (BR-N143)
- **Decisión:** no hay descuentos VIP automáticos; los descuentos se rigen por BR-N143 (≤10% libre, 10-25% director, >25% bloqueado).
- **Estado:** confirmed (táctica 40).

## DEC-FUN-20260817-38 · ZIP contador solo facturas activas
- **Decisión:** el ZIP mensual para contador incluye sólo facturas activas, no canceladas.
- **Estado:** confirmed (táctica 41).

## DEC-FUN-20260817-39 · Multi-idioma solo es-MX en MVP
- **Decisión:** MVP sólo en español de México. Fase 2 amplia idiomas.
- **Estado:** confirmed (táctica 42, fuera de scope MVP).

## DEC-FUN-20260817-40 · Sin integración con bancos en MVP
- **Decisión:** no se integran APIs bancarias en MVP.
- **Estado:** confirmed (táctica 43, fuera de scope MVP).

## DEC-FUN-20260817-41 · Respaldo BD diario, retenido 30 días
- **Decisión:** la base de datos se respalda diariamente con retención de 30 días.
- **Estado:** confirmed (táctica 44, BR-N147).

## DEC-FUN-20260817-42 · Comisión rate por OS (una sola tasa)
- **Decisión:** una OS tiene una sola tasa de comisión; no se asignan tasas por ítem.
- **Estado:** confirmed (táctica 45).

## DEC-FUN-20260817-43 · 1 cotización aceptada por prospecto (BR-N25)
- **Decisión:** un prospecto puede tener múltiples cotizaciones pero sólo 1 puede aceptarse.
- **Estado:** confirmed (táctica 46).

## DEC-FUN-20260817-44 · Cuestionario en 4 capas adaptativas
- **Decisión:** Capa 1 base universal (5 preguntas) + Capa 2 por project_type (5-10) + Capa 3 por servicio (2-4) + Capa 4 sub-cuestionarios opcionales. Total 5-32 preguntas.
- **Estado:** confirmed (decisiones 47-52).

## DEC-FUN-20260817-45 · Editor visual drag & drop para cuestionarios
- **Decisión:** el Director puede editar cuestionarios con editor visual drag & drop y vista previa.
- **Estado:** confirmed (decisión 52).

## DEC-FUN-20260817-46 · Sistema multi-org latente
- **Decisión:** la BD incluye `organization_id` en todas las entidades de negocio, aunque sólo exista una organización en MVP.
- **Estado:** confirmed (regla estructural del JSON archive, no contradicha).

---

## DEC-FUN-20260817-47 · Vocabulario único de estados de módulo de proyecto (Q-P0-1)
- **Pregunta:** ¿qué vocabulario único usamos para los estados de un módulo de proyecto?
- **Opciones consideradas:**
  1. `pending → in_progress → testing → deployed` (+ `paused`, `blocked`, `cancelled`) con salud `on_track / at_risk / delayed`.
  2. `pending → en_curso → en_pruebas → implementado → pospuesto` (+ `paused`, `cancelled`) con salud `en_tiempo / en_riesgo / retrasado`.
  3. Otro vocabulario.
- **Decisión:** opción 1.
- **Razón:** coherente con BR-N113/114 ya escritos, conciso, fácil de programar y probar, alineado con vocabulario estándar de proyectos técnicos.
- **Estado:** confirmed (Frank, 2026-08-17).
- **Implicación:** INTEGRA recibe un enum único de 7 valores para `status` y 3 para `health`. Las reglas BR-N113/114 mantienen su semántica; sólo se confirma el nombre canónico de los estados. La simulación del 17-ago se rehará contra este vocabulario.
- **Reemplaza a:** vocabulario `pending / en_curso / en_pruebas / implementado / pospuesto` de FUNCTIONAL-BASELINE §18.

## DEC-FUN-20260817-48 · Cotización multi-línea confirmada (Q-P0-2)
- **Pregunta:** ¿la cotización es multi-línea o de 1 sola línea con monto global?
- **Opciones consideradas:**
  1. Multi-línea (con items auto-pre-llenados desde spec + catálogo, descuentos por línea + descuento global).
  2. 1 línea, monto global (restaurar la restricción original de DISCOVERY-01).
  3. Híbrido configurable (Director define por cotización).
- **Decisión:** opción 1.
- **Razón:** consistente con la decisión ratificada 24-ago, con el JSON archive (que conserva `quote_items`) y con la simulación del 17-ago (que asume multi-línea).
- **Estado:** confirmed (Frank, 2026-08-17).
- **Implicación:** el módulo Comercial implementa `quote_items` polimórficos (`service | license | expense | discount`) con cálculo por línea y totales agregados. Catálogo de servicios alimenta líneas automáticamente.
- **Reemplaza a:** la restricción "Cotización 1 línea, monto global" de DISCOVERY-20260814-01 §Restricción Crítica 1.

## DEC-FUN-20260817-49 · Comisión sobre FACTURADO confirmada (Q-P0-3)
- **Pregunta:** ¿sobre qué base se calcula y libera la comisión del vendedor?
- **Opciones consideradas:**
  1. Sobre FACTURADO (BR-N33 v2: `comision.liberada = estimada × Σ(facturas NO canceladas) / total_OS`).
  2. Sobre COBRADO (fórmula del JSON archive).
  3. Configurable por OS.
- **Decisión:** opción 1.
- **Razón:** BR-N33 v2 ratificada 17-ago como parte de las decisiones tácticas/estructurales. La regla vigente confirmada. Coherente con BR-N123 (reversa al cancelar factura) y con el flujo de ingresos.
- **Estado:** confirmed (Frank, 2026-08-17).
- **Implicación:** la comisión se libera al facturar (no al cobrar). El JSON archive queda `superseded` para la regla de comisión. La simulación del 17-ago se rehará; el PASO 9.1 tenía el error de mezclar ambas bases.
- **Reemplaza a:** fórmula sobre cobrado del `vectoria_especificacion_..._mvp.json` archive.

## DEC-FUN-20260817-50 · Timbrado CFDI real con FacturoPorTi confirmado (Q-P0-4)
- **Pregunta:** ¿el sistema timbra CFDI directamente o sólo registra facturas externas?
- **Opciones consideradas:**
  1. Timbrado real con FacturoPorTi (sistema arma JSON CFDI 4.0, lo envía al PAC y guarda UUID/XML/PDF).
  2. CFDI externo (sólo registro, sin PAC).
  3. Configurable por organización.
- **Decisión:** opción 1.
- **Razón:** decisión estructural #10 ratificada 17-ago. La empresa es cliente real de FacturoPorTi. La integración reduce pasos manuales y errores de captura.
- **Estado:** confirmed (Frank, 2026-08-17).
- **Implicación:** INTEGRA debe diseñar contrato de integración con PAC, manejo seguro de CSD (.cer + .pem + password) y API key encriptados, y el flujo de cancelación con motivo SAT (01-04). El JSON archive queda `superseded` para el alcance de facturación.
- **Reemplaza a:** la regla "no implementar conexión directa con SAT" del `vectoria_especificacion_..._mvp.json` archive.

## DEC-FUN-20260817-51 · Conteos definitivos confirmados (Q-P0-5)
- **Pregunta:** ¿qué conteos de decisiones / reglas / módulos quedan como definitivos?
- **Opciones consideradas:**
  1. Conteos ATLAS: 52 decisiones (23+23+6) · 7 módulos visibles + Hoy + Administración/Plantillas/Catálogo · 31 reglas con ID localizable (las 150+ referenciadas quedan pendientes de reconstruir).
  2. Conteos DISCOVERY-01: 34 decisiones · 6-7 módulos · 150+ reglas referenciadas.
  3. Otro conteo.
- **Decisión:** opción 1.
- **Razón:** los conteos ATLAS son los más recientes y trazables a sesiones específicas; se alinean con la decisión de reconstruir las 150+ reglas (Q-P0-6 opción 2).
- **Estado:** confirmed (Frank, 2026-08-17).
- **Implicación:** las cifras 52 / 7+1+1 / 31 son el lineamiento vigente. La cifra 150+ deja de ser referencia firme hasta que se reconstruya (siguiente sesión de discovery). Cabeceras de otros documentos que digan lo contrario se actualizan al consolidar.
- **Reemplaza a:** las cifras oscilantes 34/40/46/52 (decisiones), 6/7/8/9 (módulos) que aparecían en distintos documentos.

## DEC-FUN-20260817-52 · Reconstruir las 150+ reglas con ATLAS (Q-P0-6)
- **Pregunta:** ¿qué hacemos con las 150+ reglas que referencia `DECISIONES-V1-20260815.md` y que no existen en el repo?
- **Opciones consideradas:**
  1. Frank provee el archivo o su contenido para restaurar.
  2. Reconstruir con ATLAS en sesión dirigida.
  3. Eliminar la referencia y mantener sólo las 31 reglas con ID.
- **Decisión:** opción 2.
- **Razón:** no hay copia de respaldo localizada del archivo; las 150+ reglas se pueden reconstruir a partir de las sesiones 14-ago y 17-ago con un proceso dirigido (una regla a la vez). Mantiene la trazabilidad y consistencia con el resto del discovery.
- **Estado:** confirmed (Frank, 2026-08-17).
- **Implicación:** se programa una sesión dedicada de discovery (no en este pase). ATLAS generará `discovery/REGLAS-V1-20260815-reconstruccion.md` o un archivo similar, una regla a la vez, validada por Frank. Mientras tanto, las 31 reglas con ID confirmado son el **único conjunto de reglas firme** para handoff a INTEGRA.
- **Reemplaza a:** la referencia firme a `DECISIONES-V1-20260815.md` como contenedor de las 150+ reglas.

---

## Resumen de decisiones (al 2026-08-17)

- **52 decisiones** ratificadas en discovery (las 46 originales + 6 nuevas DEC-FUN-20260817-47 a -52, resultado de la consolidación).
- 6 decisiones de consolidación (Q-P0-1 a Q-P0-6) resueltas con recomendación ATLAS confirmada.
- Estado del discovery: `ready_for_integra` (sujeto a la reconstrucción posterior de las 150+ reglas con ATLAS).
