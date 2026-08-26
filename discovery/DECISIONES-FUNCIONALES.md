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
- **Estado:** confirmed (Frank, 2026-08-17; decisión consolidada en DEC-FUN-20260817-48).
- **Reemplaza a:** la restricción inicial "Cotización 1 línea" de DISCOVERY-01.

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
- **Estado:** confirmed (Frank, 2026-08-17; decisión consolidada en DEC-FUN-20260817-50).
- **Reemplaza a:** el alcance sin timbrado directo del JSON archivado.

## DEC-FUN-20260814-11 · Módulo Cobranza separado del Comercial
- **Decisión:** cobranza es módulo propio, no sub-módulo de Comercial.
- **Estado:** confirmed (decisión #11).

## DEC-FUN-20260814-12 · Plantillas con 4 niveles para Sistema Web
- **Decisión:** landing, sitio, web app y saas son 4 plantillas distintas.
- **Estado:** confirmed (decisión #12).

## DEC-FUN-20260814-13 · 7 tipos de tests
- **Decisión:** functional, visual, ui, acceptance, performance, security, compatibility.
- **Estado:** confirmed (decisión #13).

## DEC-FUN-20260814-14 · Estructura modular en plantillas (project_modules)
- **Decisión:** cada plantilla subdivide un proyecto en módulos con `requirements/tasks/tests/deliverables` propios y `depends_on_modules[]`.
- **Estado:** confirmed (decisión #14; vocabulario unificado en DEC-FUN-20260817-47).

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

## DEC-20260823-01 · Medios de contacto de prospectos
- **Decisión:** el enum `prospects.medium` admite únicamente estos tres valores, en este orden y con estos identificadores estables: `llamada` (Llamada), `email` (Email), `whatsapp` (WhatsApp).
- **Estado:** confirmed (Frank, 2026-08-23).
- **Supersedes:** DEC-FUN-20260814-19 en cuanto al cardinal “14”; se conserva la decisión histórica y se mantiene el vocabulario explícitamente confirmado.

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
- **Implicación:** INTEGRA recibe un vocabulario único de 7 estados y 3 valores de salud. DEC-FUN-59 aclara después la semántica de `deployed`. El vocabulario fue cubierto por SIM-20260817-02.
- **Reemplaza a:** vocabulario `pending / en_curso / en_pruebas / implementado / pospuesto` de FUNCTIONAL-BASELINE §18.

## DEC-FUN-20260817-48 · Cotización multi-línea confirmada (Q-P0-2)
- **Pregunta:** ¿la cotización es multi-línea o de 1 sola línea con monto global?
- **Opciones consideradas:**
  1. Multi-línea (con items auto-pre-llenados desde spec + catálogo, descuentos por línea + descuento global).
  2. 1 línea, monto global (restaurar la restricción original de DISCOVERY-01).
  3. Híbrido configurable (Director define por cotización).
- **Decisión:** opción 1.
- **Razón:** consistente con la decisión ratificada el 17-ago, con el JSON archive (que conserva `quote_items`) y con la simulación del 17-ago (que asume multi-línea).
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
- **Implicación:** la comisión se libera al facturar (no al cobrar). El JSON archive queda `superseded` para la regla de comisión. SIM-20260817-01 conserva el error histórico y SIM-20260817-02 usa la secuencia corregida.
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

## DEC-FUN-20260825-01 · Timbrado CFDI con Facturapi en Test confirmado
- **Pregunta:** ¿qué proveedor debe usar Vectoria para emitir CFDI en sandbox y posteriormente en producción?
- **Decisión:** Facturapi (`https://www.facturapi.io/v2`) con la Test Secret Key en staging/sandbox; la Live Secret Key se incorporará sólo cuando Frank la autorice para producción.
- **Evidencia:** la documentación oficial confirma que la llave determina el ambiente Test/Live y la organización emisora; la prueba mínima `GET /v2/customers?limit=1` respondió HTTP 200 con la llave de prueba proporcionada.
- **Estado:** confirmed (Frank, 2026-08-25).
- **Implicación:** sustituir el adaptador FacturoPorTi/PAC por un adaptador HTTP Facturapi conservando la frontera `PacClient`, auditoría, UUID/XML/PDF, idempotencia y estados internos. Test no tiene validez fiscal ni se envía al SAT.
- **Seguridad:** la llave proporcionada es secreta; no se persiste en código, documentación, logs ni reportes.
- **Reemplaza a:** DEC-FUN-20260817-50 sólo respecto del proveedor PAC; se conserva la decisión de timbrado real y no registrar facturas externas.

## DEC-FUN-20260817-51 · Conteos definitivos confirmados (Q-P0-5)
- **Pregunta:** ¿qué conteos de decisiones / reglas / módulos quedan como definitivos?
- **Opciones consideradas:**
  1. Conteos ATLAS: 52 decisiones (23+23+6) · 7 módulos visibles + Hoy + Administración/Plantillas/Catálogo · 31 reglas con ID localizable (las 150+ referenciadas quedan pendientes de reconstruir).
  2. Conteos DISCOVERY-01: 34 decisiones · 6-7 módulos · 150+ reglas referenciadas.
  3. Otro conteo.
- **Decisión:** opción 1.
- **Razón:** los conteos ATLAS son los más recientes y trazables a sesiones específicas; se alinean con la decisión de reconstruir las 150+ reglas (Q-P0-6 opción 2).
- **Estado:** confirmed (Frank, 2026-08-17).
- **Implicación al momento de la decisión:** las cifras 52 / 7+1+1 / 31 cerraron la contradicción inicial. Después se completó la reconstrucción y se agregaron DEC-FUN-53 a -60; el conteo vigente es 60 decisiones y 231 reglas confirmadas.
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
- **Implicación:** ATLAS generó `discovery/REGLAS-V1-20260815-reconstruccion.md`; Frank confirmó el lote reconstruido el 2026-08-17. El conjunto consolidado vigente se publica en `discovery/REGLAS-DE-NEGOCIO.md`.
- **Reemplaza a:** la referencia firme a `DECISIONES-V1-20260815.md` como contenedor de las 150+ reglas.

---

## DEC-FUN-20260817-53 · Selección explícita de plantilla desde el cuestionario
- **Pregunta:** ¿cómo se elige la plantilla correcta cuando el catálogo agrupa varios niveles de Sistema Web?
- **Decisión:** el cuestionario solicita explícitamente el tipo de solución (`web_landing`, `web_sitio`, `web_app` o `web_saas`). El sistema puede advertir inconsistencias con otras respuestas, pero el PL confirma la plantilla antes de firmar el alcance.
- **Estado:** confirmed (Frank, 2026-08-17; autorización de aplicar el cierre funcional recomendado).
- **Reemplaza a:** selección ad-hoc o inferencia silenciosa de la plantilla.

## DEC-FUN-20260817-54 · Autoridad entre alcance, plantilla y JSON Discovery
- **Pregunta:** ¿qué artefacto manda cuando el alcance firmado, la plantilla y el JSON contienen módulos, tareas, pruebas o entregables?
- **Decisión:** el alcance firmado es la verdad funcional de lo vendido; la plantilla aporta un esqueleto inicial reutilizable; el JSON Discovery descompone y enriquece el plan de ejecución derivado. El JSON nunca modifica silenciosamente el alcance firmado. Un cambio fuera de alcance sólo entra mediante una solicitud de cambio autorizada.
- **Controles funcionales:** toda importación de JSON requiere revisión del PL, conserva versión y no duplica elementos al reimportar la misma versión. Los cambios propuestos se presentan como diferencias antes de aprobarse.
- **Estado:** confirmed (Frank, 2026-08-17).
- **Reemplaza a:** el solapamiento sin autoridad descrito en H-20260817-12.

## DEC-FUN-20260817-55 · Aceptación del cliente registrada por proxy
- **Pregunta:** ¿cómo opera la aceptación del cliente sin portal de cliente en el MVP?
- **Decisión:** el PL puede registrar la respuesta como proxy, pero nunca figura como aceptante. Debe capturar nombre de la persona que acepta, organización, fecha, medio de contacto y evidencia. Sin esos datos no existe aceptación válida.
- **Estado:** confirmed (Frank, 2026-08-17).
- **Reemplaza a:** una aceptación registrada por el PL sin identidad ni evidencia del cliente.

## DEC-FUN-20260817-56 · Asignación de programadores posterior a la creación del proyecto
- **Pregunta:** ¿quién incorpora y asigna programadores al proyecto?
- **Decisión:** el workflow de creación agrega únicamente al PL. Después, el PL agrega miembros al proyecto y les asigna módulos o tareas. La pertenencia al proyecto precede a cualquier asignación y controla la visibilidad. El técnico conserva el derecho a rechazar una tarea con motivo.
- **Estado:** confirmed (Frank, 2026-08-17).
- **Reemplaza a:** asignaciones implícitas o acceso por una tarea sin membresía de proyecto.

## DEC-FUN-20260817-57 · Cierre técnico, entrega y cierre administrativo separados
- **Pregunta:** ¿cómo se relacionan la terminación técnica del proyecto, la entrega, la facturación y el cierre de la OS?
- **Decisión:** el PL realiza el cierre técnico cuando se cumplen los gates funcionales; esto completa el proyecto y coloca la OS en `entregada`, aunque exista saldo pendiente. El Administrador cierra la OS después, cuando el saldo total es cero; sólo el Director puede aprobar una excepción documentada. La facturación sigue el plan comercial de la OS y cualquier factura final debe emitirse antes del cierre administrativo.
- **Estado:** confirmed (Frank, 2026-08-17).
- **Reemplaza a:** exigir saldo cero para entregar o permitir cierre administrativo sólo por ausencia de saldo vencido.

## DEC-FUN-20260817-58 · Transiciones canónicas del Proyecto
- **Decisión:** la etapa describe dónde está el trabajo; la situación indica si puede operar; la salud expresa riesgo. El proyecto nace `planning/pending`, pasa a `planning/active` cuando el PL inicia la planeación, a `development/active` al iniciar el primer módulo, a `testing/active` cuando termina el desarrollo requerido, a `client_validation/active` al presentar entregables y a `delivery/completed` con el cierre técnico. `paused` y `cancelled` son situaciones laterales con motivo y auditoría.
- **Estado:** confirmed (Frank, 2026-08-17).

## DEC-FUN-20260817-59 · `deployed` es cierre técnico del módulo
- **Pregunta:** ¿un módulo debe esperar la aceptación final del cliente para desbloquear sus dependientes?
- **Decisión:** no. `deployed` significa que el módulo quedó técnicamente listo: requerimientos validados internamente, tareas terminadas con evidencia, pruebas bloqueantes técnicas aprobadas y entregables preparados o presentados. La aceptación del cliente bloquea el cierre técnico del proyecto, no el inicio normal de módulos dependientes, salvo que una dependencia declare expresamente que requiere aceptación del cliente.
- **Estado:** confirmed (Frank, 2026-08-17).
- **Reemplaza parcialmente a:** BR-N113 en cuanto exigía aceptación final para todo módulo.

## DEC-FUN-20260817-60 · Ciclo de trabajo, revisión y cambios de alcance
- **Decisión:** `blocked` es un estado lateral recuperable de tarea; una revisión rechazada devuelve la tarea a `in_progress`; `done` exige checklist y evidencia. PL o QA asignado revisan. Los requerimientos los aprueba el PL y los valida PL/QA. Las pruebas no aplicables requieren justificación del PL. Un entregable observado/corregido vuelve a `delivered` hasta ser aceptado. Un cambio de alcance sigue análisis, aprobación aplicable, implementación y validación; los cambios sin costo omiten cotización, pero nunca autorización.
- **Estado:** confirmed (Frank, 2026-08-17).

---

## DEC-FUN-20260818-61 · Módulo propio de Suscripciones
- **Pregunta:** ¿las suscripciones se visualizan sólo indirectamente desde Facturación y Cobranza, o requieren una vista funcional propia?
- **Decisión:** incorporar **Suscripciones** como octavo módulo operativo, separado de Facturación y Cobranza, con un panel propio para visualizar la cartera de servicios recurrentes.
- **Alcance confirmado:** el panel identifica al menos las suscripciones **anuales, semestrales y trimestrales** y permite consultar la información relacionada de facturación y cobranza.
- **Límite funcional:** Suscripciones no emite CFDI ni registra cobros; Facturación y Cobranza mantienen esas responsabilidades.
- **Estado:** confirmed (Frank, 2026-08-18).
- **Impacto:** amplía el alcance funcional y requiere que INTEGRA planifique una SPEC técnica propia o una extensión explícita de Facturación/Cobranza. Ver BR-N399 y FND-20260818-03.
- **Evolución:** DEC-FUN-20260818-62 amplía los ciclos a mensual/trimestral/semestral/anual y confirma gestión completa.

---

## DEC-FUN-20260818-62 · Periodicidades y gestión completa de Suscripciones
- **Pregunta:** ¿qué ciclos muestra el panel de Suscripciones y si el MVP sólo consulta o también gestiona su ciclo de vida?
- **Decisión:** el panel muestra suscripciones **mensuales, trimestrales, semestrales y anuales**. El MVP permite **gestión completa**: renovación, pausa, cancelación y reactivación, además de consulta de cartera. La reactivación quedó precisada en DEC-FUN-20260818-65.
- **Razón:** Frank necesita visualizar toda la información recurrente y operar sus ciclos sin depender de pantallas dispersas de Facturación/Cobranza.
- **Estado:** confirmed (Frank, 2026-08-18).
- **Impacto:** amplía BR-N399 con ciclos confirmados y crea BR-N400/BR-N401. INTEGRA debe producir una SPEC de Suscripciones con ciclo de vida completo, una vez se defina quién está autorizado y sus estados funcionales.
- **Pendiente no bloqueante para otros módulos:** actor autorizado y máquina de estados de Suscripciones (Q-20260818-03).

---

## DEC-FUN-20260818-63 · Permiso configurable para gestionar Suscripciones
- **Pregunta:** ¿qué rol puede renovar, pausar y cancelar una suscripción?
- **Decisión:** la autoridad no queda ligada a un rol fijo. El Director asigna mediante permisos configurables quién puede gestionar Suscripciones.
- **Razón:** respeta el principio de roles y permisos como datos, combinables y no hardcoded.
- **Estado:** confirmed (Frank, 2026-08-18).
- **Impacto:** se crea BR-N402 y el permiso funcional `gestionar_suscripciones`. Las acciones críticas se auditan y sólo usuarios con ese permiso pueden ejecutarlas.

## DEC-FUN-20260818-64 · Estados funcionales de Suscripciones
- **Pregunta:** ¿qué estados representan el ciclo de vida de una suscripción?
- **Decisión:** una suscripción puede estar **activa, pausada, cancelada o vencida**.
- **Estado:** confirmed (Frank, 2026-08-18).
- **Impacto:** se crea BR-N403. Las transiciones entre estados, en especial el efecto de renovar una suscripción vencida o cancelada, se cierran en Q-20260818-04 antes de la SPEC de Suscripciones.

---

## DEC-FUN-20260818-65 · Reactivación de Suscripciones canceladas
- **Pregunta:** ¿una suscripción cancelada es final o se puede reactivar cuando el cliente regresa?
- **Decisión:** una suscripción cancelada puede volver a estar activa mediante renovación o reactivación, conservando su historial.
- **Ciclo confirmado:** `activa ↔ pausada`; `activa → vencida` al terminar el periodo sin renovar; `vencida → activa` al renovar; `activa | pausada → cancelada`; `cancelada → activa` al reactivar o renovar.
- **Estado:** confirmed (Frank, 2026-08-18).
- **Impacto:** se crea BR-N404. El ciclo queda cerrado, pero el delta de Suscripciones queda `conditionally_ready` hasta resolver la relación renovación→Facturación (Q-20260818-06).

---

## DEC-FUN-20260818-66 · Creación automática de Suscripciones desde la OS
- **Pregunta:** ¿una Suscripción es una entidad propia y qué evento la crea?
- **Decisión:** una Suscripción es una entidad funcional propia. El sistema la crea automáticamente cuando se autoriza una OS cuyo tipo de cobro es `suscripción`.
- **Razón:** preserva trazabilidad desde lo vendido y evita altas aisladas o una proyección incompleta desde Facturación/Cobranza.
- **Estado:** confirmed (Frank, 2026-08-18).
- **Impacto:** se crea BR-N405; la futura SPEC de Suscripciones depende de Comercial y OS además de Plataforma, Clientes, Facturación y Cobranza. La relación renovación→factura queda pendiente en Q-20260818-06.

---

## DEC-FUN-20260818-67 · Renovación crea factura borrador
- **Pregunta:** al renovar una Suscripción, ¿qué debe ocurrir con la factura del nuevo periodo?
- **Decisión:** renovar crea automáticamente una factura en estado borrador para el nuevo periodo. Facturación conserva la revisión, timbrado y emisión final.
- **Razón:** automatiza la continuidad comercial sin permitir que Suscripciones emita CFDI por sí misma.
- **Estado:** confirmed (Frank, 2026-08-18).
- **Impacto:** se crea BR-N406; cierra la relación Suscripciones→Facturación y deja el delta `ready_for_integra`.

---

## DEC-FUN-20260818-68 · Toda oferta vendida requiere Proyecto
- **Pregunta:** ¿todo producto/servicio vendido crea Proyecto, o cada oferta configurable decide si lo requiere?
- **Decisión:** toda oferta vendida crea Proyecto. Todo lo que Vector IA vende requiere intervención de un técnico especialista, aunque sea para configuración, activación, ajuste o mantenimiento.
- **Razón:** no existen productos o servicios puramente pasivos dentro del modelo operativo; cada venta requiere trabajo técnico rastreable.
- **Estado:** confirmed (Frank, 2026-08-18).
- **Impacto:** confirma BR-N03 como regla universal y crea BR-N407. El workflow OS autorizada → Proyecto aplica también a productos y servicios recurrentes; si además la OS es de tipo `suscripción`, crea en paralelo la entidad Suscripción de BR-N405.

---

## DEC-FUN-20260819-69 · Protección y personalización de roles base
- **Pregunta:** ¿cómo se administran el label, los permisos y la desactivación de roles base (seed)?
- **Decisión:** el Director puede editar el label visible de un rol base, sin cambiar su código. Los permisos de los roles base son inmutables; las variaciones se cubren con roles personalizados. Un rol base con usuarios asignados no se puede desactivar hasta que esos usuarios sean reasignados.
- **Razón:** permite personalizar la presentación sin alterar la identidad ni las garantías funcionales de visibilidad; también evita dejar usuarios sin un rol operativo.
- **Estado:** confirmed (Frank, 2026-08-19; resolución de Q-20260818-01, opciones A1/B1/C1).
- **Impacto:** crea BR-N408 a BR-N410, resuelve el DISCOVERY-GAP-20260818-01 y permite a INTEGRA cerrar los AC-69/AC-70 de SPEC-20260817-001.

---

## DEC-FUN-20260819-70 · Dirección visual de la interfaz interna
- **Pregunta:** ¿qué sistema y referencia visual debe guiar la interfaz interna de V1?
- **Decisión:** V1 adopta Tailwind CSS con shadcn/ui como sistema de interfaz. La referencia visual es el tema `olive_instrument` del kit Oatmeal de Tailwind Plus: tonos oliva y neutros cálidos, tipografía editorial y composición sobria. Es una referencia de dirección visual, no una instrucción para copiar código, assets ni layout del kit.
- **Razón:** brinda una interfaz interna profesional y diferenciada manteniendo componentes accesibles y consistentes para el MVP.
- **Estado:** confirmed (Frank, 2026-08-19).
- **Impacto:** INTEGRA debe formalizar el contrato técnico de UI y sus tokens; la interfaz debe conservar todos los requisitos funcionales vigentes de permisos, privacidad, dashboards, formularios y accesibilidad.

---

## DEC-FUN-20260819-71 · Tema claro y oscuro alineado a la marca VectorIA
- **Pregunta:** ¿cómo debe aplicarse la referencia Oatmeal frente a la identidad de marca propia de VectorIA?
- **Decisión:** la interfaz usa Tailwind CSS con shadcn/ui, pero sustituye la paleta oliva de la referencia por la marca VectorIA. El tema claro predeterminado tiene fondo blanco y alto espacio negativo; el tema oscuro usa navy profundo. El naranja quemado es el acento de acción en ambos temas. La tipografía es sans-serif moderna, no editorial serif. Los logos y activos de `context/VectorIA-Brand-Assets/` son la fuente visual canónica.
- **Razón:** se conserva la sobriedad y composición de la referencia sin diluir la identidad corporativa de VectorIA.
- **Estado:** confirmed (Frank, 2026-08-19).
- **Reemplaza:** DEC-FUN-20260819-70 sólo en paleta y tipografía. Se conserva Tailwind CSS + shadcn/ui y la referencia como inspiración de composición, nunca como fuente para copiar código, assets o layout.
- **Impacto:** INTEGRA debe definir tokens claro/oscuro con `#FFFFFF`, `#0A1F44`, `#D35400` y `#2C3E50`, incorporar los activos de marca bajo licencia disponible y no iniciar construcción hasta que el contrato visual quede formalizado.

---

## DEC-FUN-20260819-72 · Paridad operativa en móvil, tableta y escritorio
- **Pregunta:** ¿qué operaciones están disponibles según el dispositivo?
- **Decisión:** todas las pantallas y acciones de V1 deben ser plenamente operables en móvil, tableta y escritorio. La presentación se adapta al dispositivo, sin degradar una acción de negocio a consulta o bloquearla por tamaño de pantalla.
- **Razón:** la operación puede requerir continuidad fuera del escritorio; la experiencia adaptable no debe alterar las capacidades autorizadas de cada actor.
- **Estado:** confirmed (Frank, 2026-08-19).
- **Impacto:** la futura ADR de UI y las SPECs deben definir componentes, tablas, formularios, constructores, drag & drop y validaciones con comportamiento usable y verificable en los tres formatos; los escenarios E2E deben cubrir los viewports correspondientes.

---

## DEC-FUN-20260819-73 · Advertencia por desviación contra presupuesto declarado
- **Pregunta:** ¿qué debe hacer el sistema si una cotización excede 1.5 veces el presupuesto declarado durante el cuestionario?
- **Decisión:** el sistema muestra una advertencia clara con el presupuesto declarado y el total de la cotización, pero no bloquea el flujo ni exige una aprobación adicional.
- **Razón:** ofrece visibilidad comercial sin detener oportunidades legítimas cuyo alcance creció durante el descubrimiento.
- **Estado:** confirmed (Frank, 2026-08-19; resolución de Q-NB-3 / DISCOVERY-GAP-20260819-01).
- **Impacto:** crea BR-N411 y habilita el criterio presupuestal de SPEC-003.

---

## DEC-FUN-20260820-74 · SuperUser persistente para bootstrap
- **Pregunta:** ¿cómo se registra el emisor de la primera invitación cuando todavía no existe un usuario humano?
- **Decisión:** el sistema crea y conserva un usuario técnico `SuperUser` con correo `contacto@vector-ia.mx`. Ese actor emite la primera invitación y permite mantener trazabilidad de creación. Su contraseña inicial se provisionará posteriormente como secreto, no queda documentada ni se expone en artefactos funcionales.
- **Razón:** conservar trazabilidad explícita del bootstrap sin utilizar un UUID ficticio ni un emisor vacío.
- **Estado:** confirmed (Frank, 2026-08-20; resolución de DISCOVERY-GAP-20260820-01, GAP 1).
- **Impacto:** crea BR-N412; INTEGRA debe actualizar Plataforma Base y bootstrap para crear el actor persistente antes de la primera invitación. La provisión segura de contraseña es una dependencia operativa, no una decisión funcional pendiente.

---

## DEC-FUN-20260820-75 · Permisos sembrados por su módulo
- **Pregunta:** ¿cuándo se declaran y se siembran los permisos de cada módulo operativo?
- **Decisión:** Plataforma Base siembra sólo permisos propios. Cada SPEC de módulo declara y siembra sus permisos cuando se implementa; por ejemplo, `registrar_tiempo` llega con Proyectos/ejecución.
- **Razón:** conserva la frontera de responsabilidad por módulo y evita que Plataforma Base preconfigure permisos de capacidades aún no implementadas.
- **Estado:** confirmed (Frank, 2026-08-20; resolución de DISCOVERY-GAP-20260820-01, GAP 2).
- **Impacto:** crea BR-N413; INTEGRA actualiza la semilla de Plataforma Base y el contrato de SPECs posteriores.

---

## Resumen de decisiones (al 2026-08-20)

- **75 decisiones** ratificadas en discovery (52 previas + 8 decisiones de cierre funcional DEC-FUN-20260817-53 a -60 + DEC-FUN-20260818-61 a -68 de Suscripciones + DEC-FUN-20260819-69/-73 + DEC-FUN-20260820-74/-75).
- Las decisiones 53-60 cierran los huecos de Proyectos detectados en la auditoría del 17-ago.
- Suscripciones y la frontera Productos/Servicios quedan `ready_for_integra`: toda oferta crea Proyecto; inclusión, ciclos, gestión completa, autoridad configurable, estados, transiciones, origen y factura borrador de renovación están confirmados.

---

## DEC-FUN-20260820-76 · Provisionamiento global zero-touch
- **Decisión:** todo software desplegable construido por Vectoria activa automáticamente el provisionamiento estándar, sin intención adicional ni intervención operativa de Frank. Precedencia: override explícito de Frank; infraestructura existente del proyecto; Coolify/Contabo Vectoria por defecto.
- **Estado:** confirmed (Frank, 2026-08-20; SOL-20260820-10/11).
- **Impacto:** exige ADR/SPEC global; no autoriza implementación en este turno.

## DEC-FUN-20260820-77 · Perfil y límites del provisionamiento
- **Decisión:** el flujo resuelve secretos mecánicos, credencial bootstrap temporal, UUIDs, DNS, variables y sólo los recursos exigidos por la SPEC, reutilizando infraestructura existente. Deploy a producción, delete, billing y migraciones irreversibles requieren autorización separada vigente.
- **Estado:** confirmed (Frank, 2026-08-20; SOL-20260820-09/10/11).
- **Impacto:** el perfil organizacional global aporta Director/email/org; overrides explícitos prevalecen; INTEGRA debe definir broker, capacidades y registry.

## DEC-FUN-20260822-78 · Coolify/Contabo como destino global por defecto
- **Pregunta:** ¿dónde deben levantarse los proyectos futuros construidos por Vectoria?
- **Decisión:** todo proyecto nuevo desplegable de Vectoria se provisiona por defecto en el servidor Coolify/Contabo propio existente. No se crea infraestructura alternativa por proyecto.
- **Excepción:** sólo un override explícito de Frank puede seleccionar otro destino o impedir la provisión.
- **Estado:** confirmed (Frank, 2026-08-22).
- **Impacto:** el contrato global debe incluir un trigger automático por manifest, preflight de versión/API/health, perfil organizacional, secret-source, adaptadores runtime y pruebas E2E multi-proyecto antes de considerar listo el sistema reusable.
