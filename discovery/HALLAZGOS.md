# HALLAZGOS · Vector IA

**Versión:** 2026-08-17
**Severidad:** P0 (bloqueante) · P1 (importante) · P2 (menor) · P3 (cosmético)

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
- `FUNCTIONAL-BASELINE.md` L974 (decisión 6 del 24-ago): "Cotización multi-línea (sin 'modo 1 línea')".
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

**Resolución (2026-08-17 22:00):** Frank aprobó **opción 1** — comisión sobre FACTURADO (BR-N33 v2). Decisión registrada como **DEC-FUN-20260817-49** en `DECISIONES-FUNCIONALES.md`. La fórmula del JSON archive queda `superseded`. La simulación del 17-ago se rehará con la fórmula correcta.

---

## H-20260817-04 · Timbrado CFDI: real vs externo (P1)

**Estado:** resolved
**Severidad:** P1
**Evidencia:**
- `archive/borradores-mixtos/vectoria_especificacion_sistema_administrativo_mvp.json` (scope): "no implementar conexión directa con SAT, bancos, WhatsApp, correo o firma electrónica certificada" en el MVP.
- `FUNCTIONAL-BASELINE.md` L622 + decisión estructural #10 (24-ago): "Cambio mayor vs propuesta inicial: el sistema **timbrará** CFDI directamente vía API (FacturoPorTi)".
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

**Resolución (2026-08-17 22:00):** Frank aprobó **opción 1** — conteos ATLAS: 52 decisiones (23+23+6) · 7 módulos visibles + Hoy + Administración/Plantillas/Catálogo · 31 reglas con ID localizable (150+ pendientes de reconstruir). Decisión registrada como **DEC-FUN-20260817-51** en `DECISIONES-FUNCIONALES.md`.

---

## H-20260817-06 · Archivo `DECISIONES-V1-20260815.md` no localizado (P0)

**Estado:** confirmed (con plan)
**Severidad:** P0
**Evidencia:**
- `FUNCTIONAL-BASELINE.md` L772: "(150+ reglas totales documentadas en `DECISIONES-V1-20260815.md`)".
- `find discovery -iname "DECISIONES*"` no devuelve resultados.

**Impacto:**
- Las 150+ reglas referenciadas **no existen en el repositorio**.
- FUNCTIONAL-BASELINE.md §12 sólo lista 31 reglas con ID trazable.
- INTEGRA no tiene un registro canónico de reglas para el contrato.

**Resolución (2026-08-17 22:00):** Frank aprobó **opción 2** — reconstruir las 150+ reglas con ATLAS en sesión dedicada de discovery dirigida. Decisión registrada como **DEC-FUN-20260817-52** en `DECISIONES-FUNCIONALES.md`. Plan:
1. Sesión posterior (no en este pase) abre `discovery/REGLAS-V1-20260815-reconstruccion.md` como cuaderno de trabajo.
2. ATLAS propone reglas una a una, Frank confirma o corrige.
3. Al cerrar, las reglas con nuevo ID se incorporan a `REGLAS-DE-NEGOCIO.md` y al contrato de handoff.

**Mientras tanto:** las **31 reglas con ID confirmado** son el único conjunto firme para handoff a INTEGRA. Esto NO bloquea el handoff si INTEGRA acepta trabajar contra ese subconjunto y ampliarlo cuando se complete la reconstrucción.

---

## H-20260817-07 · Mapeo catálogo → plantilla no definido (P1)

**Estado:** candidate
**Severidad:** P1
**Evidencia:**
- `FUNCTIONAL-BASELINE.md` L278: catálogo "Sistema Web" agrupa "Página Web estática + e-commerce + Landing + CMS".
- `FUNCTIONAL-BASELINE.md` L425: plantillas separan 4 niveles `web_landing`/`web_sitio`/`web_app`/`web_saas`.
- `simulations/SIMULACION-FLUJO-COMPLETO-20260817.md` PASO 4: la simulación seleccionó "Sitio Web" del catálogo y aplicó plantilla "Sitio Web - Pequeño" con 3 módulos (auth, clientes, facturación). El mapeo se hizo ad-hoc dentro de la simulación.

**Impacto:**
- Ya produjo un error en la simulación (la plantilla "Sitio Web" generó 3 módulos, pero la simulación luego calculó costos por horas detalladas como si fuera una SaaS).
- Sin mapeo explícito, el cuestionario no puede auto-seleccionar la plantilla correcta.

**Acción:** PF-5 en `ESTADO-FUNCIONAL.md`. No bloqueante discovery.

---

## H-20260817-08 · Aceptación del cliente vía proxy PL (P1)

**Estado:** candidate
**Severidad:** P1
**Evidencia:**
- `FUNCTIONAL-BASELINE.md` L20 (decisión estructural #14 — tests) y L873 (tipo `acceptance`): "Cliente (proxy PL)".
- `simulations/SIMULACION-FLUJO-COMPLETO-20260817.md`: el PL firma el spec y registra la aceptación, sin un rol "Cliente" usuario.

**Impacto:**
- Sin portal de cliente en el MVP (decisión ratificada).
- El PL podría registrar por sí mismo la aceptación que necesita para cerrar el proyecto — conflicto de interés funcional.
- No hay trazabilidad de que el PL actúa como **registrador**, no como quien acepta.

**Acción:** Frank define cómo se exige contacto, evidencia, fecha y registrador. PF-7 en `ESTADO-FUNCIONAL.md`.

---

## H-20260817-09 · Falta regla de desviación presupuestal (P1)

**Estado:** candidate
**Severidad:** P1
**Evidencia:**
- `FUNCTIONAL-BASELINE.md` §8.1: la cotización lleva descuento, total, etc., pero no se compara contra el presupuesto declarado en el cuestionario.
- `simulations/SIMULACION-FLUJO-COMPLETO-20260817.md` PASO 3 / 6: presupuesto declarado $80,000 → cotización final $209,931 sin transición de renegociación ni alerta.

**Impacto:**
- El sistema no advierte ni bloquea cuando la cotización excede ampliamente el presupuesto del prospecto.
- Decisión comercial se toma sin soporte funcional.

**Acción:** PF-6 en `ESTADO-FUNCIONAL.md`. No bloqueante discovery.

---

## H-20260817-10 · Programador sin handoff explícito (P1)

**Estado:** candidate
**Severidad:** P1
**Evidencia:**
- `FUNCTIONAL-BASELINE.md` §8.3: "Líder técnico asignado" al crear el proyecto.
- `simulations/SIMULACION-FLUJO-COMPLETO-20260817.md` PASO 9.2: el sistema sólo agrega al PL como `project_member` con `project_role=lider`. No asigna programadores.
- Escenario AC-003 presupone un técnico asignado, pero ningún workflow ejecuta esa asignación.

**Impacto:**
- El programador queda fuera del flujo atómico de creación de proyecto.
- Se depende de la asignación manual posterior del PL.

**Acción:** No bloqueante discovery. PF-1 en flujo de creación de proyecto.

---

## H-20260817-11 · Simulación arrastra errores de cálculo y omisiones (P2)

**Estado:** candidate
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

**Acción:** No se corrige la simulación. Estado **AUDITADA_CON_HALLAZGOS** en `SIMULACIONES.md`. Queda para rehacer contra spec v1.3.

---

## H-20260817-12 · Spec, plantilla y JSON Discovery se pisan entre sí (P1)

**Estado:** candidate
**Severidad:** P1
**Evidencia:**
- `FUNCTIONAL-BASELINE.md` L491-493: el spec se genera automáticamente desde cuestionario + catálogo + plantilla (incluye requirements, tasks, tests, deliverables).
- `FUNCTIONAL-BASELINE.md` §7: el JSON Discovery "descompone" el proyecto en módulos/tareas/tests/deliverables accionables.

**Impacto:**
- No está definido qué crea cada etapa.
- El alcance firmado (spec) podría ser alterado por la descomposición.

**Acción:** No bloqueante discovery. PF-1 en flujo de proyecto.

---

## H-20260817-13 · ID Discovery duplicado (mecánico, ya corregido)

**Estado:** resolved
**Severidad:** P3
**Evidencia:** `sessions/DISCOVERY-20260814-02.md` declaraba `ID: DISC-20260814-01`, mismo que el -01.
**Acción aplicada:** etiqueta corregida a `DISC-20260814-02`. Contenido inalterado. Sin impacto en negocio.

---

## H-20260817-14 · Cerrar técnico y cierre administrativo de OS sin diferenciar (P1)

**Estado:** candidate
**Severidad:** P1
**Evidencia:**
- `FUNCTIONAL-BASELINE.md` §8.3: autorización de inicio actualiza OS a `en_ejecucion`.
- `simulations/SIMULACION-FLUJO-COMPLETO-20260817.md` §9: "OS: en_ejecucion → cerrado" sin condiciones.
- FUNCTIONAL-BASELINE §25 (explicación de OS): "Cerrar administrativamente requiere proyecto terminado o cancelado y no tener saldo vencido, salvo autorización de dirección".

**Impacto:**
- El cierre técnico del proyecto y el cierre administrativo de la OS quedan mezclados.
- La simulación omite ambos.

**Acción:** No bloqueante discovery. PF-1 en flujo de cierre.

---

## H-20260817-15 · Pendientes operativos fuera del alcance de discovery (P3)

**Estado:** deferred (out_of_consolidation_scope)
**Severidad:** P3
**Evidencia:** ChatGPT Sol listó 5 pendientes operativos (88+ entries sin commitear, 3 buckets Storage no creados, 30k CCTs SEP no cargados, Frank no ha probado la URL visualmente, T-E2E-07 RLS no ejecutado). Pertenecen a la capa de implementación/infra, no a discovery funcional.

**Acción:** Archivados en `OPEN-QUESTIONS.md` con tag `out_of_consolidation_scope`. Se retoman cuando exista INTEGRA/infra.
