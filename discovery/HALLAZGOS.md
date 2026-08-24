# HALLAZGOS · Vector IA

**Versión:** 2026-08-17 23:20
**Severidad:** P0 (bloqueante) · P1 (importante) · P2 (menor) · P3 (cosmético)

> Las referencias de línea describen snapshots previos al cierre y se conservan como evidencia histórica. El estado y la resolución de cada hallazgo son la información vigente.

---

## FND-20260823-01 · Contradicción entre gate funcional y contrato de SPEC-002

**Tipo:** `FINDING` · **Estado:** `resolved` · **Severidad:** P1 para SPEC-002

**Evidencia actual:** `discovery/INDEX.md` §1 y `PREGUNTAS-ABIERTAS.md` §1 declaran cero preguntas funcionales bloqueantes; `context/SPECs/SPEC-20260817-002-clientes-prospectos.md` §12 conserva `P-002-1` y §14 prohíbe inferir la lista canónica de 14 medios de contacto. El contrato además exige test de catálogo en AC-8.

**Impacto:** no era posible cerrar el enum, migración, validación y V3 de SPEC-002 sin elegir una lista funcional; ATLAS no la inventó.

**Resolución (2026-08-23):** Frank confirmó que son sólo tres valores: `llamada` (Llamada), `email` (Email), `whatsapp` (WhatsApp), en ese orden. Se registró `DEC-20260823-01`, que supersede el cardinal “14” de DEC-FUN-20260814-19; SPEC-002 puede continuar con enum de tres valores.

---

## H-20260817-01 · Vocabulario de estados de módulo de proyecto (P0)

**Estado:** resolved
**Severidad:** P0 (bloqueante para handoff a INTEGRA)
**Evidencia:**
- `sessions/DISCOVERY-20260814-01.md` L137: estado `implementado` mencionado sin vocabulario completo.
- `FUNCTIONAL-BASELINE.md` L809: `pending / en_curso / en_pruebas / implementado / pospuesto`.
- `FUNCTIONAL-BASELINE.md` L760 (BR-N113/114): `in_progress / deployed`.

**Impacto:**
- INTEGRA no puede decidir el esquema técnico (enum/string) sin un vocabulario único.
- Cualquier escenario de aceptación queda ambiguo.
- Las simulaciones no pueden validar transiciones.

**Resolución (2026-08-17 22:00):** Frank aprobó **opción 1** — `pending → in_progress → testing → deployed` (+ laterales `paused`, `blocked`, `cancelled`). Salud: `on_track / at_risk / delayed`. Decisión registrada como **DEC-FUN-20260817-47** en `DECISIONES-FUNCIONALES.md`. REGLAS-DE-NEGOCIO.md actualizado para reflejar el vocabulario canónico.

---

## H-20260817-02 · Cotización multi-línea vs 1 línea (P0)

**Estado:** resolved
**Severidad:** P0
**Evidencia:**
- `sessions/DISCOVERY-20260814-01.md` L128: "Cotización 1 línea, monto global — sin catálogo de servicios, sin multi-línea, sin desglose de horas".
- `FUNCTIONAL-BASELINE.md` L531: "Cotización (multi-línea). Items auto-pre-llenados desde el spec + catálogo".
- Baseline previo al cierre (decisión 6 del 17-ago): "Cotización multi-línea (sin 'modo 1 línea')".
- `archive/borradores-mixtos/vectoria_especificacion_sistema_administrativo_mvp.json` (reglas comerciales): `quote_items` con multi-línea.

**Impacto:**
- Reglas de cálculo, layout de pantalla, validación de ítems difieren.
- Un agente implementador podría elegir cualquiera de las 3 versiones.

**Resolución (2026-08-17 22:00):** Frank aprobó **opción 1** — cotización multi-línea. Decisión registrada como **DEC-FUN-20260817-48** en `DECISIONES-FUNCIONALES.md`. La restricción original de DISCOVERY-01 queda reemplazada.

---

## H-20260817-03 · Base de la comisión (P1)

**Estado:** resolved
**Severidad:** P1 (importante, contradice regla vigente confirmada)
**Evidencia:**
- `archive/borradores-mixtos/vectoria_especificacion_sistema_administrativo_mvp.json` L1353: `commission_released = estimated × collected_amount / sold_total` (sobre **cobrado**).
- `FUNCTIONAL-BASELINE.md` L591 (BR-N33 v2, decisión 16 ratificada 17-ago): "Comisión se libera sobre FACTURADO, no sobre COBRADO".
- `simulations/SIMULACION-FLUJO-COMPLETO-20260817.md` PASO 9.1: la liberación se calcula al confirmar el cobro (mezcla ambos enfoques).

**Impacto:**
- Riesgo de cálculo incorrecto de comisión en implementación.
- Diferencias en escenarios de prueba de QA.
- La simulación del flujo ya arrastró el conflicto.

**Resolución (2026-08-17 22:00):** Frank aprobó **opción 1** — comisión sobre FACTURADO (BR-N33 v2). Decisión registrada como **DEC-FUN-20260817-49**. La simulación original conserva el error y la simulación vigente usa la secuencia corregida.

---

## H-20260817-04 · Timbrado CFDI: real vs externo (P1)

**Estado:** resolved
**Severidad:** P1
**Evidencia:**
- `archive/borradores-mixtos/vectoria_especificacion_sistema_administrativo_mvp.json` (scope): "no implementar conexión directa con SAT, bancos, WhatsApp, correo o firma electrónica certificada" en el MVP.
- Baseline previo al cierre + decisión estructural #10 (17-ago): el sistema timbra CFDI mediante FacturoPorTi.
- Mismo JSON archive (future_backlog): "timbrado para el futuro" — el propio JSON se contradice.

**Impacto:**
- Decisiones de seguridad, manejo de CSD/API key, integraciones externas.
- INTEGRA no puede decidir el contrato de facturación sin ratificación.

**Resolución (2026-08-17 22:00):** Frank aprobó **opción 1** — timbrado real con FacturoPorTi. Decisión registrada como **DEC-FUN-20260817-50** en `DECISIONES-FUNCIONALES.md`. El JSON archive queda `superseded` para el alcance de facturación. INTEGRA diseñará el contrato de integración con PAC, manejo seguro de CSD y API key, y el flujo de cancelación con motivo SAT (01-04).

---

## H-20260817-05 · Conteo de decisiones / reglas / módulos (P0)

**Estado:** resolved
**Severidad:** P0 (afecta credibilidad del baseline)
**Evidencia:**
- `sessions/DISCOVERY-20260814-01.md` L137: "34 decisiones cerradas".
- `FUNCTIONAL-BASELINE.md` L5: "52 decisiones cerradas".
- `FUNCTIONAL-BASELINE.md` L1064: "52 decisiones cerradas (23+23+6)".
- `FUNCTIONAL-BASELINE.md` L1101: "46 decisiones cerradas".
- `FUNCTIONAL-BASELINE.md` L772: "150+ reglas totales documentadas en `DECISIONES-V1-20260815.md`".
- Módulos: FUNCTIONAL-BASELINE L76 enumera 7, L165 enumera 7, L249-264 suma 9, sesiones iniciales hablan de 6-9 según generación.

**Impacto:**
- INTEGRA no puede confiar en el baseline si los conteos no se reproducen.
- Métricas de readiness quedan opacas.

**Resolución:** DEC-FUN-51 cerró el conteo inicial; la reconstrucción y el cierre posterior dejaron el conteo vigente en 60 decisiones y 231 reglas confirmadas. Los números anteriores permanecen sólo como evidencia histórica.

---

## H-20260817-06 · Archivo `DECISIONES-V1-20260815.md` no localizado (P0)

**Estado:** resolved
**Severidad:** P0
**Evidencia:**
- `FUNCTIONAL-BASELINE.md` L772: "(150+ reglas totales documentadas en `DECISIONES-V1-20260815.md`)".
- El archivo específico `DECISIONES-V1-20260815.md` no existe; no debe confundirse con `DECISIONES-FUNCIONALES.md`.

**Impacto:**
- Las 150+ reglas referenciadas **no existen en el repositorio**.
- FUNCTIONAL-BASELINE.md §12 sólo lista 31 reglas con ID trazable.
- INTEGRA no tiene un registro canónico de reglas para el contrato.

**Resolución:** DEC-FUN-52 ordenó reconstruirlas; el cuaderno `REGLAS-V1-20260815-reconstruccion.md` se completó, Frank confirmó el lote y `REGLAS-DE-NEGOCIO.md` quedó como registro canónico. El cierre funcional posterior deja 231 reglas confirmadas con ID único.

---

## H-20260817-07 · Mapeo catálogo → plantilla no definido (P1)

**Estado:** resolved
**Severidad:** P1
**Evidencia:**
- `FUNCTIONAL-BASELINE.md` L278: catálogo "Sistema Web" agrupa "Página Web estática + e-commerce + Landing + CMS".
- `FUNCTIONAL-BASELINE.md` L425: plantillas separan 4 niveles `web_landing`/`web_sitio`/`web_app`/`web_saas`.
- `simulations/SIMULACION-FLUJO-COMPLETO-20260817.md` PASO 4: la simulación seleccionó "Sitio Web" del catálogo y aplicó plantilla "Sitio Web - Pequeño" con 3 módulos (auth, clientes, facturación). El mapeo se hizo ad-hoc dentro de la simulación.

**Impacto:**
- Ya produjo un error en la simulación (la plantilla "Sitio Web" generó 3 módulos, pero la simulación luego calculó costos por horas detalladas como si fuera una SaaS).
- Sin mapeo explícito, el cuestionario no puede auto-seleccionar la plantilla correcta.

**Resolución:** DEC-FUN-53 exige selección explícita en el cuestionario y confirmación del PL antes de firmar el alcance. BR-N230.

---

## H-20260817-08 · Aceptación del cliente vía proxy PL (P1)

**Estado:** resolved
**Severidad:** P1
**Evidencia:**
- `FUNCTIONAL-BASELINE.md` L20 (decisión estructural #14 — tests) y L873 (tipo `acceptance`): "Cliente (proxy PL)".
- `simulations/SIMULACION-FLUJO-COMPLETO-20260817.md`: el PL firma el spec y registra la aceptación, sin un rol "Cliente" usuario.

**Impacto:**
- Sin portal de cliente en el MVP (decisión ratificada).
- El PL podría registrar por sí mismo la aceptación que necesita para cerrar el proyecto — conflicto de interés funcional.
- No hay trazabilidad de que el PL actúa como **registrador**, no como quien acepta.

**Resolución:** DEC-FUN-55 define al PL como registrador, nunca como aceptante, con identidad, organización, fecha, medio y evidencia obligatorios. BR-N287.

---

## H-20260817-09 · Falta regla de desviación presupuestal (P1)

**Estado:** deferred_non_blocking
**Severidad:** P1
**Evidencia:**
- `FUNCTIONAL-BASELINE.md` §8.1: la cotización lleva descuento, total, etc., pero no se compara contra el presupuesto declarado en el cuestionario.
- `simulations/SIMULACION-FLUJO-COMPLETO-20260817.md` PASO 3 / 6: presupuesto declarado $80,000 → cotización final $209,931 sin transición de renegociación ni alerta.

**Impacto:**
- El sistema no advierte ni bloquea cuando la cotización excede ampliamente el presupuesto del prospecto.
- Decisión comercial se toma sin soporte funcional.

**Acción:** se conserva como Q-NB-3 para la futura SPEC de Comercial. No bloquea Proyectos; INTEGRA debe emitir `DISCOVERY-GAP` si necesita automatizarla.

---

## H-20260817-10 · Programador sin handoff explícito (P1)

**Estado:** resolved
**Severidad:** P1
**Evidencia:**
- `FUNCTIONAL-BASELINE.md` §8.3: "Líder técnico asignado" al crear el proyecto.
- `simulations/SIMULACION-FLUJO-COMPLETO-20260817.md` PASO 9.2: el sistema sólo agrega al PL como `project_member` con `project_role=lider`. No asigna programadores.
- Escenario AC-003 presupone un técnico asignado, pero ningún workflow ejecuta esa asignación.

**Impacto:**
- El programador queda fuera del flujo atómico de creación de proyecto.
- Se depende de la asignación manual posterior del PL.

**Resolución:** DEC-FUN-56 establece que el PL incorpora miembros después de crear el proyecto y antes de asignar módulos o tareas. La membresía controla visibilidad. BR-N382/383.

---

## H-20260817-11 · Simulación arrastra errores de cálculo y omisiones (P2)

**Estado:** historical_issue_resolved_in_new_simulation
**Severidad:** P2
**Evidencia (en `simulations/SIMULACION-FLUJO-COMPLETO-20260817.md`):**

- PASO 6: "127 h × $250/h no equivale a $190,500". La simulación mezcla costo-hora estimado ($1,500/h cotizado) con snapshot interno ($250/h) sin distinguir.
- PASO 9.1: "Comisión: liberada += 8% × ($104,966 / $209,931) × $14,394 = ~$7,200". Esto **re-aplica el 8%** sobre una comisión que ya fue calculada al 8%. Debería ser simplemente el factor proporcional.
- Falta emisión de **factura de anticipo** (sólo registra cobro).
- Falta **factura final** y **cobro final**.
- Falta **aceptación final de entregables**.
- Falta **cierre técnico del proyecto**.
- Falta **cierre administrativo de la OS** (sólo dice "en_ejecucion → cerrado" sin condiciones).
- La OS aparece cerrada sin mostrar quién la cerró ni bajo qué condiciones.
- La comisión se "libera" durante la confirmación del cobro (mezcla facturado/cobrado).
- El presupuesto declarado es $80,000 y la cotización termina en $209,931 sin renegociación.
- El Vendedor parece seleccionar su propia comisión del 8% sin definir quién puede establecerla y aprobarla.

**Impacto:**
- La simulación no puede declararse validada.
- Estados finales incompatibles con pendientes.

**Acción:** la simulación original se conserva como evidencia histórica en estado **AUDITADA_CON_HALLAZGOS**. El flujo corregido se reejecuta en `simulations/SIMULACION-FLUJO-PROYECTOS-20260817.md`.

---

## H-20260817-12 · Spec, plantilla y JSON Discovery se pisan entre sí (P1)

**Estado:** resolved
**Severidad:** P1
**Evidencia:**
- `FUNCTIONAL-BASELINE.md` L491-493: el spec se genera automáticamente desde cuestionario + catálogo + plantilla (incluye requirements, tasks, tests, deliverables).
- `FUNCTIONAL-BASELINE.md` §7: el JSON Discovery "descompone" el proyecto en módulos/tareas/tests/deliverables accionables.

**Impacto:**
- No está definido qué crea cada etapa.
- El alcance firmado (spec) podría ser alterado por la descomposición.

**Resolución:** DEC-FUN-54 fija la autoridad: alcance firmado = verdad original; plantilla = esqueleto; JSON = plan derivado versionado; sólo un change request autorizado cambia el alcance efectivo. BR-N380/381 y BR-N396/398.

---

## H-20260817-13 · ID Discovery duplicado (mecánico, ya corregido)

**Estado:** resolved
**Severidad:** P3
**Evidencia:** `sessions/DISCOVERY-20260814-02.md` declaraba `ID: DISC-20260814-01`, mismo que el -01.
**Acción aplicada:** etiqueta corregida a `DISC-20260814-02`. Contenido inalterado. Sin impacto en negocio.

---

## H-20260817-14 · Cerrar técnico y cierre administrativo de OS sin diferenciar (P1)

**Estado:** resolved
**Severidad:** P1
**Evidencia:**
- `FUNCTIONAL-BASELINE.md` §8.3: autorización de inicio actualiza OS a `en_ejecucion`.
- `simulations/SIMULACION-FLUJO-COMPLETO-20260817.md` §9: "OS: en_ejecucion → cerrado" sin condiciones.
- FUNCTIONAL-BASELINE §25 (explicación de OS): "Cerrar administrativamente requiere proyecto terminado o cancelado y no tener saldo vencido, salvo autorización de dirección".

**Impacto:**
- El cierre técnico del proyecto y el cierre administrativo de la OS quedan mezclados.
- La simulación omite ambos.

**Resolución:** DEC-FUN-57 separa ambos cierres. El cierre técnico completa el proyecto y entrega la OS aunque haya saldo; el cierre administrativo exige saldo total cero o excepción documentada del Director. BR-N249 y BR-N392/394.

---

## H-20260817-15 · Pendientes operativos fuera del alcance de discovery (P3)

**Estado:** removed_as_context_contamination
**Severidad:** P3
**Evidencia:** ChatGPT Sol listó 5 pendientes operativos (88+ entries sin commitear, 3 buckets Storage no creados, 30k CCTs SEP no cargados, Frank no ha probado la URL visualmente, T-E2E-07 RLS no ejecutado). Pertenecen a la capa de implementación/infra, no a discovery funcional.

**Acción:** se retiraron de `OPEN-QUESTIONS.md` y del handoff porque corresponden a otro sistema. Su historial permanece recuperable en Git.

---

## H-20260818-01 · Editabilidad y desactivación de roles seed (DISCOVERY-GAP de INTEGRA) (P0)

**Estado:** candidate (DISCOVERY-GAP emitido por INTEGRA el 2026-08-18, ATLAS lo registra y bloquea; Frank responde mañana)
**Severidad:** P0 (bloquea AC-69 y AC-70 de SPEC-001 v1.1; bloquea SPEC-001 → READY)
**Origen:** DISCOVERY-GAP-20260818-01 (`context/discovery-gaps/DISCOVERY-GAP-20260818-01-roles-seed-editabilidad.md`)

**Artefactos afectados:**
- `context/SPECs/SPEC-20260817-001-plataforma-base.md` v1.1 — AC-4 reformulado, AC-5 mantenido, AC-69 y AC-70 nuevos marcados `BLOCKED (sin-trazabilidad-funcional)`.
- `context/decisions/ADR-20260817-04-bootstrap-y-semilla-inicial.md` §2.3 (semilla de 7 roles + role_permissions).
- `context/decisions/ADR-20260817-01-arquitectura-y-stack.md` §5 (`hasPermission`, roles como dato).

**IDs funcionales relacionados:**
- BR-N127 (roles base no se eliminan; sólo se desactivan)
- BR-N128 (Director crea roles adicionales)
- BR-N131 (permisos aditivos; nunca restan)
- BR-N205 (cero hardcode; verificación por datos)
- DEC-FUN-02 (roles y permisos viven en tablas, no en código)
- ACTORES-Y-PERMISOS.md §1 (7 roles base combinables), §4 (crear roles custom = Director)

**Contradicción o faltante:**
BR-N127 protege a los roles seed de la **eliminación** (sólo desactivables) y BR-N128 autoriza al Director a crear roles adicionales. Pero el discovery **no decide** tres sub-cuestiones que la v1.1 necesita para producir ACs testeables:

- (a) ¿Puede el Director **editar el LABEL** de un rol seed?
- (b) ¿Puede el Director **editar los PERMISOS** (`role_permissions`) de un rol seed?
- (c) ¿Puede el Director **DESACTIVAR** un rol seed que tiene usuarios asignados?

**Tensión funcional:** DEC-FUN-02 dice "roles y permisos son datos" (sugeriría editables), pero BR-N127 protege a los seed (sugeriría no plenamente editables). El discovery no acota cuál prevalece por sub-aspecto.

**Resolución parcial que INTEGRA aplica ya (no requiere Frank, técnicamente derivable de DEC-FUN-02 + BR-N127):**
1. `code` de cualquier rol es **inmutable** (es la identidad usada en audit_logs y referencias cruzadas).
2. Label de un rol **custom (no-seed)** es editable por Director (DEC-FUN-02, BR-N128). Sin controversia.
3. **DELETE físico prohibido** para cualquier rol (seed por BR-N127, custom por consistencia vía `active=false`).
4. Toda edición de rol/permiso se audita (BR-N206, BR-N336).

**Lo que queda BLOCKED hasta respuesta de Frank:** exclusivamente (a), (b) y (c) **para seed**.

**Opciones viables (INTEGRA recomienda A1 / B1 / C1):**
- (a) A1: code inmutable, label editable por Director (consistente con DEC-FUN-02: label es dato de presentación; code es identidad). A2: label inmutable para seed. A3: label editable con auditoría y motivo.
- (b) B1: NO editable (los seed son contratos canónicos; el Director crea roles custom para variaciones). B2: Editable con warning si rompe una BR de visibilidad. B3: Editable libremente.
- (c) C1: Bloquear desactivación si hay usuarios asignados (exige reasignar primero). C2: Cascada-notificada (usuarios pierden el rol, conservan otros). C3: Sin cascada.

**Acción:** pregunta Q-20260818-01 agregada a `PREGUNTAS-ABIERTAS.md` §4 (DISCOVERY-GAPs de INTEGRA). Frank responde mañana. ATLAS persiste respuesta y devuelve delta a INTEGRA.

---

## H-20260818-02 · Pendientes menores de Frank derivados de la v1.1 (P2)

**Estado:** candidate (detectados por ATLAS durante auditoría nocturna de los 7 ADRs)
**Severidad:** P2 (no bloqueantes para SPEC-001, pero Frank debe responder antes de desplegar)
**Evidencia:**
- ADR-04 §6 (P-04-1): Frank debe proveer `VECTORIA_DIRECTOR_EMAIL` y `MASTER_KEY` (32 bytes) para el primer arranque. Acción infraestructural.
- ADR-04 §6 (P-04-2): Frank debe decidir TTL de la primera invitación (default 7 días) y si se permite prórroga.
- ADR-03 §9.1: rotación de `MASTER_KEY` no automatizada en MVP sin autorización explícita de Frank (consistente con §11 de AGENTS.md sobre acciones irreversibles).
- ADR-04 §2.4 (P-04-3): el contenido real de catálogo/plantillas/cuestionarios lo define SPEC-003 (Comercial); el `db:seed:catalog` es stub idempotente hasta entonces.

**Impacto:**
- Sin `VECTORIA_DIRECTOR_EMAIL` + `MASTER_KEY`, el bootstrap falla (fast-fail). Es prerrequisito de despliegue.
- TTL de invitación y prórroga son decisión de producto menor.
- La rotación de MASTER_KEY queda gated a Frank por diseño (no es hueco, es restricción correcta).

**Acción:** no eleva DISCOVERY-GAP (son decisiones operacionales menores, no funcionales). ATLAS los lista para Frank mañana junto con Q-20260818-01.

---

## FND-20260818-03 · Suscripciones sin panel funcional propio (P1)

**Estado:** resolved
**Severidad:** P1
**Evidencia:**
- BR-N238 y BR-N239 sólo describían suscripción como tipo de cobro y pago inicial obligatorio.
- `FUNCTIONAL-BASELINE.md` contemplaba Facturación y Cobranza, pero no una cartera/panel propio de suscripciones.
- Frank indicó el 2026-08-18 que requiere visualizar suscripciones anuales, semestrales y trimestrales en un panel dedicado.

**Impacto:** sin un módulo propio, la información de periodicidad, vigencia y relación con factura/cobranza queda dispersa entre dos módulos y no puede consultarse como cartera.

**Resolución:** DEC-FUN-20260818-61 incorpora Suscripciones como octavo módulo operativo; DEC-FUN-20260818-62 confirma ciclos mensual/trimestral/semestral/anual y gestión completa. BR-N399 a BR-N401 fijan el panel propio, periodicidades y operaciones del MVP.

**Evolución:** DEC-FUN-20260818-63 fija autoridad por permiso configurable; DEC-FUN-20260818-64 fija estados activa/pausada/cancelada/vencida; DEC-FUN-20260818-65 cierra las transiciones y reactivación conservando historial. El delta de Suscripciones está `conditionally_ready` hasta resolver FND-20260818-04/-05.

---

## FND-20260818-04 · Origen y vinculación de una Suscripción (P1)

**Estado:** resolved
**Severidad:** P1 (bloquea sólo la futura SPEC de Suscripciones)
**Evidencia:** el baseline confirma que Suscripciones tiene entidad funcional propia, cartera y ciclo, pero no define dónde nace el registro ni cómo se vincula con Comercial/OS. El tipo de cobro `suscripción` existe en Cotización (BR-N238) y exige pago inicial antes de autorizar Proyecto (BR-N121), sin declarar el evento creador de la Suscripción.

**Impacto:** INTEGRA no puede definir contratos de relación con Clientes, Comercial/OS, Facturación y Cobranza sin inventar si la Suscripción nace manualmente, desde una OS o como proyección.

**Resolución:** DEC-FUN-20260818-66 / BR-N405: la Suscripción es entidad propia y se crea automáticamente al autorizar una OS cuyo tipo de cobro es `suscripción`. SPEC-011 depende de Comercial/OS además de Plataforma, Clientes, Facturación y Cobranza.

---

## FND-20260818-05 · Renovación y relación con Facturación (P1)

**Estado:** resolved
**Severidad:** P1 (bloquea sólo la futura SPEC de Suscripciones)
**Evidencia:** BR-N404 define que una renovación activa una suscripción vencida/cancelada, pero no define si renovar crea, exige o sólo refleja una factura, ni la cardinalidad entre suscripción y facturas por periodo.

**Impacto:** sin esta decisión, INTEGRA no puede especificar si Suscripciones escribe/dispara Facturación o sólo consulta su estado.

**Resolución:** DEC-FUN-20260818-67 / BR-N406: renovar crea automáticamente una factura en borrador para el nuevo periodo; Facturación conserva revisión, timbrado y emisión. Suscripciones no emite CFDI directamente.

---

## FND-20260818-06 · Productos/servicios que no requieren Proyecto (P1)

**Estado:** resolved
**Severidad:** P1 (bloquea el alcance de Productos/Servicios y las SPECs relacionadas; no bloquea Proyectos ya definidos para trabajo ejecutable)
**Evidencia:**
- BR-N227 permite servicio único/recurrente y producto único/recurrente.
- BR-N03 establece que una cotización aceptada genera una OS y una OS genera un Proyecto en el MVP.
- El workflow de Proyecto exige plantilla, alcance, miembros, módulos, tareas, pruebas, entregables y gates de cierre (Baseline §6; FLUJOS §4-10).
- Suscripciones se crea desde una OS con tipo de cobro `suscripción` (BR-N405), pero no se define si una suscripción o producto recurrente sin implementación debe crear también un Proyecto.

**Impacto:** una oferta puramente recurrente o de producto puede crear un Proyecto vacío con gates que no corresponden. Una venta multi-línea también puede combinar elementos con proyecto y elementos sin proyecto sin que el comportamiento esté definido.

**Resolución:** DEC-FUN-20260818-68 / BR-N407: toda oferta requiere Proyecto porque toda venta exige intervención técnica especialista. No se introduce clasificación `requiere_proyecto`; BR-N03 aplica universalmente. Las OS de suscripción crean Proyecto y Suscripción en paralelo.

---

## FND-20260819-01 · Alcance operativo responsive pendiente de precisar (P1)

**Estado:** resolved
**Severidad:** P1
**Evidencia:** Frank confirmó que la interfaz debe contemplar versiones móvil y tableta; el contrato visual vigente sólo describe tema claro/oscuro y no define paridad funcional por dispositivo.
**Impacto:** la implementación debe responder correctamente a móvil, tableta y escritorio.
**Artefactos afectados:** `FUNCTIONAL-BASELINE.md`, futura ADR de UI y SPEC-001.
**Resolución:** DEC-FUN-20260819-72: paridad operativa completa en móvil, tableta y escritorio; ninguna acción de V1 se limita o degrada por tamaño de pantalla.

---

## FND-20260819-02 · Política de desviación contra presupuesto sin decidir (P1)

**Estado:** resolved
**Severidad:** P1
**Evidencia:** `DISCOVERY-GAP-20260819-01` de INTEGRA. El presupuesto declarado puede diferir ampliamente de la cotización final, sin política confirmada de advertencia, aprobación o ausencia de control.
**Impacto:** bloquea sólo el criterio de aceptación de control presupuestal en `SPEC-20260817-003` (Comercial); no bloquea el resto de Comercial ni la Plataforma Base.
**Artefactos afectados:** `PREGUNTAS-ABIERTAS.md` Q-NB-3, `SPEC-20260817-003`, `PROYECTO.md`.
**Resolución:** DEC-FUN-20260819-73 / BR-N411: advertir al superar 1.5 veces el presupuesto declarado, sin bloqueo ni aprobación adicional.

---

## FND-20260820-03 · Trazabilidad de bootstrap y frontera de permisos (P1)

**Estado:** resolved
**Severidad:** P1
**Evidencia:** `DISCOVERY-GAP-20260820-01` detectó que la primera invitación no tenía emisor válido y que la semilla incluía un permiso de módulo aún no implementado.
**Impacto:** afectaba la plataforma base y el orden de siembra de permisos por módulo.
**Resolución:** DEC-FUN-20260820-74 / BR-N412 crea el actor técnico persistente SuperUser para bootstrap. DEC-FUN-20260820-75 / BR-N413 difiere los permisos a la SPEC del módulo que los introduce.

---

## FND-20260820-04 · SOFIA no recibe una ruta operativa explícita para infraestructura Coolify (P2)

**Estado:** confirmed
**Severidad:** P2
**Evidencia:** el prompt vigente de SOFIA exige detenerse ante contratos/configuración operativa no autorizados y leer el repositorio para descubrir stack y runtime. El inventario Coolify confirma servidor, dominio, wrapper de escritura y adaptador read-only, pero también separa consulta, planificación y mutación autorizada. La SPEC-20260818-003 permite invocar el wrapper desde SOFIA sólo mediante un `SPEC-HANDOFF` concreto.
**Impacto:** SOFIA puede interpretar una tarea de infraestructura como una implementación ordinaria del repositorio, releer el repo completo o bloquearse por ausencia de autorización, en vez de asumir el contexto operativo ya establecido y usar la ruta Coolify documentada cuando el handoff la autorice.
**Hueco a resolver:** añadir al contrato operativo de SOFIA una precondición/ruta de infraestructura: reconocer el inventario Coolify como contexto previo, limitar la inspección del repo al alcance del handoff y distinguir explícitamente entre `read-only`, planificación y mutación autorizada. No implica conceder deploy, delete, migraciones ni secretos por defecto; esas acciones siguen requiriendo autorización explícita y contrato técnico.
**Artefactos afectados:** `~/.config/kilo/agents/sofia.md`, `context/infra/COOLIFY-CONTABO-INVENTORY.md`, SPECs/handoffs Coolify, `PROYECTO.md`.
**Resolución confirmada por Frank (2026-08-20):** la capacidad de SOFIA para provisionar infraestructura debe ser una autorización operativa general para cualquier proyecto nuevo de la plataforma compartida, no una concesión repetida en cada SPEC-HANDOFF. Cuando Frank ordene provisionar un proyecto, SOFIA debe usar por defecto nuestro servidor Coolify/Contabo y la ruta controlada existente. El handoff por proyecto queda para parámetros y límites concretos (repositorio, rama, hostname, UUIDs, operaciones y allowlist), no para volver a conceder la capacidad general.
**Límites preservados:** no se autoriza por defecto producción irreversible, deploy, delete, migraciones, secretos, PostgreSQL, MinIO/Garage ni infraestructura local. Esas acciones mantienen sus gates de seguridad y autorización vigentes.

---

## FND-20260820-05 · Kilo bloquea la delegación anidada de INTEGRA a SOFIA (P1)

**Estado:** confirmed
**Severidad:** P1
**Evidencia:** `~/.config/kilo/kilo.jsonc` concede `permission.task = allow` y el agente INTEGRA está en `mode: all`, pero la sesión de INTEGRA fue creada como subagente y su schema efectivo no contiene `task`. La documentación pública de Kilo issue #10283 describe el mismo comportamiento: las sesiones subagente reciben un deny de sesión para `task`, aunque el agente tenga permisos explícitos; Kilo mantiene actualmente profundidad de subagentes 1.
**Causa:** no es el modelo asignado. Es una restricción del runtime de sesiones anidadas: `ATLAS → task(INTEGRA)` crea INTEGRA como subagente; ese INTEGRA no puede volver a invocar `task(SOFIA)`. El permiso declarado y el prompt son correctos, pero el deny de sesión se aplica antes del schema efectivo.
**Impacto:** la topología documental `ATLAS → INTEGRA → SOFIA` no puede ejecutarse mediante `task` cuando INTEGRA fue lanzado como subagente. Cambiar `glm-5.2` por otro modelo no corrige esta restricción.
**Corrección requerida:** separar modelo/prompt/permisos de la profundidad de delegación. Para conservar `task(INTEGRA → SOFIA)`, INTEGRA debe ejecutarse como agente primario, o Kilo debe habilitar explícitamente delegación anidada/max-depth. `agent_manager` no es equivalente a `task` y sólo debe usarse si Frank lo autoriza.

---

## FND-20260820-06 · Bootstrap circular de autorización Coolify (P1)

**Estado:** confirmed → handoff a INTEGRA
**Severidad:** P1
**Evidencia:** SOL-20260820-09/10/11 y el handoff de infraestructura §8: la allowlist exige UUIDs de smoke obsoletos después de crear el proyecto y fuerza edición manual.
**Impacto:** impide el zero-touch y mezcla autorización general con materialización de recursos.
**Resolución funcional:** diseñar un broker de mínimo privilegio con capacidades temporales declarativas por tarea y registry append-only que sólo vincule UUIDs devueltos por Coolify, sin ampliar autoridad.
**Artefactos afectados:** ADR/SPEC global de INTEGRA, launcher `coolify-write`, migración de `allowlist.json`, handoff de infraestructura. No se parchea en este turno.

## FND-20260820-07 · Raíz de confianza y secretos mecánicos (P1)

**Estado:** confirmed → handoff a INTEGRA
**Severidad:** P1
**Evidencia:** SOL-20260820-09/10: el modelo zero-touch no puede crear autoridad desde cero; Coolify/service-account/OAuth y el alcance del token global deben verificarse.
**Impacto:** sin raíz instalada una vez, el broker no puede emitir capacidades; entregar el token a agentes rompe mínimo privilegio.
**Resolución funcional:** la SPEC debe resolver la raíz de confianza, launcher `env -i`/`exec`, generación criptográfica y escritura directa de secretos sin cruzar stdout, logs ni artefactos; credencial bootstrap temporal con rotación/revocación.

---

## FND-20260820-08 · ADR/SPEC zero-touch falla revisión crítica SOL (P0)

**Estado:** blocking → retorno a INTEGRA
**Severidad:** P0
**Evidencia:** `context/interconsultas/DICTAMEN_SOL-SOL-20260820-12.md`, veredicto `FAIL` sobre ARCH-20260820-03/SPEC-20260820-003.
**Impacto:** no existe todavía un contrato seguro y ejecutable para frontera de confianza, mint autorizado, camino privilegiado ni anti-replay; también quedan P1 de scope, concurrencia, fail-closed, rollback, secrets lifecycle, DNS, no-sobreprovisión, migración y auditoría.
**Resolución requerida:** INTEGRA debe emitir v1.1 trazando las 15 condiciones bloqueantes de SOL-12 a AC ejecutables; luego la SPEC vuelve a SOL. SOFIA permanece bloqueada.

---

## FND-20260822-09 · Trigger global de provisión aún no conectado (P1)

**Estado:** open → handoff a INTEGRA
**Severidad:** P1
**Evidencia:** el baseline reusable ya define runner, manifest v2, namespacing y E2E, pero los proyectos futuros no invocarán automáticamente `vectoria-provision` mientras el trigger no esté conectado al flujo global de creación/publicación de proyectos.
**Impacto:** un proyecto nuevo podría quedar con código publicado pero sin proyecto/environment/application/database/storage, repitiendo los bloqueos operativos del primer staging.
**Resolución requerida:** INTEGRA debe fijar un contrato global de trigger: software desplegable + SPEC `READY` → manifest canónico → `vectoria-provision` → reconcile → deploy staging gated; ausencia de manifest válido debe bloquear, nunca inferir.

## FND-20260822-10 · Preflight global contra drift de Coolify (P1)

**Estado:** open → handoff a INTEGRA
**Severidad:** P1
**Evidencia:** el primer staging encontró diferencias de Coolify v4 en URL Git, PATCH/POST de env vars, healthcheck, pnpm/Nixpacks y campos de credenciales ocultos.
**Impacto:** cada proyecto nuevo podría repetir fallos 422, variables no creadas, builds fallidos o aplicaciones unhealthy.
**Resolución requerida:** el baseline global debe ejecutar preflight versionado y pruebas de contrato contra Coolify antes de provisionar; debe mantener adaptadores por versión, fixtures de endpoints y fail-closed sin mutación parcial.
