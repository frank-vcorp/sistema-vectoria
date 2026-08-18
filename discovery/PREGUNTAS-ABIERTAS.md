# PREGUNTAS-ABIERTAS · Vector IA

**Versión:** 2026-08-17
**Convención:** `blocking` = bloqueante para handoff a INTEGRA · `non_blocking` = se puede diferir.

Las respuestas a estas preguntas consolidan la fuente funcional y autorizan a ATLAS a emitir `FUNCTIONAL-HANDOFF` a INTEGRA.

---

## Q-P0-1 · Vocabulario único de estados de módulo de proyecto (blocking)

**Razón:** las fuentes presentan 3 vocabularios distintos (`implementado` simple; `pending/en_curso/en_pruebas/implementado/pospuesto`; `in_progress/deployed`). INTEGRA no puede decidir el enum técnico.

**Opciones:**
1. **`pending → in_progress → testing → deployed`** (+ `paused`, `blocked`, `cancelled`) — recomendación ATLAS (coherente con BR-N113/114).
2. **`pending → en_curso → en_pruebas → implementado → pospuesto`** (vocabulario FUNCTIONAL-BASELINE §18).
3. Otro vocabulario (especificar).

**Recomendación:** opción 1.
**Responsable:** Frank.

---

## Q-P0-2 · Cotización multi-línea vs 1 línea (blocking)

**Razón:** DISCOVERY-01 restringió "1 línea, monto global"; FUNCTIONAL-BASELINE y JSON ratifican multi-línea.

**Opciones:**
1. **Multi-línea** — recomendación ATLAS (más reciente, consistente con el JSON).
2. **1 línea (restaurar restricción inicial).**
3. **Híbrido configurable** (Director define por cotización).

**Recomendación:** opción 1.
**Responsable:** Frank.

---

## Q-P0-3 · Base de la comisión (blocking)

**Razón:** JSON archive (archive) usa `cobrado`; BR-N33 v2 ratificada usa `facturado`.

**Opciones:**
1. **Sobre FACTURADO** (BR-N33 v2) — recomendación ATLAS.
2. **Sobre COBRADO** (versión original).
3. **Configurable por OS** (con default).
4. **Otra política** (especificar).

**Recomendación:** opción 1.
**Responsable:** Frank.

---

## Q-P0-4 · Timbrado CFDI: real vs externo (blocking)

**Razón:** JSON archive dice "no SAT en MVP"; FUNCTIONAL-BASELINE ratifica timbrado real con FacturoPorTi.

**Opciones:**
1. **Timbrado real con FacturoPorTi** (FUNCTIONAL-BASELINE) — recomendación ATLAS.
2. **CFDI externo** (sólo registrar datos, XML y PDF cargados) — JSON archive.
3. **Configurable por organización** (default externo, opt-in real).

**Recomendación:** opción 1.
**Responsable:** Frank.

---

## Q-P0-5 · Conteos de decisiones / reglas / módulos (blocking)

**Razón:** las fuentes oscilan entre 34/40/46/52 decisiones; 6/7/8/9 módulos; 150+ reglas sin archivo de soporte.

**Opciones:**
1. **52 decisiones (23+23+6) · 7 módulos visibles + Hoy + Administración/Plantillas/Catálogo · 31 reglas con ID localizable y 150+ pendientes de reconstruir** — recomendación ATLAS.
2. **Otro conteo** (especificar cuáles y en qué sesiones).

**Recomendación:** opción 1.
**Responsable:** Frank.

---

## Q-P0-6 · Archivo `DECISIONES-V1-20260815.md` faltante (blocking)

**Razón:** referenciado en FUNCTIONAL-BASELINE L772; no existe en el repo.

**Opciones:**
1. **Restaurar** desde backup o sesión previa — Frank provee ruta o contenido.
2. **Reconstruir** desde las sesiones 14-ago y 17-ago (ATLAS puede dirigir el ejercicio).
3. **Eliminar la referencia** y mantener sólo las 31 reglas con ID localizable; la 150+ se documenta como futura captura.

**Recomendación:** opción 1 si Frank lo tiene guardado; si no, opción 3 (no se inventa el archivo).
**Responsable:** Frank.

---

## Q-NB-1 · Mapeo catálogo "Sistema Web" → plantilla (non-blocking)

**Razón:** el catálogo agrupa "Página Web + e-commerce + Landing + CMS"; las plantillas separan 4 niveles. La simulación ad-hoc tuvo el error de saltar este paso.

**Opciones:**
1. **Selección explícita** — el cuestionario de Capa 2 pregunta cuál nivel aplica.
2. **Selección por respuestas** — el sistema infiere según volumen de usuarios, integraciones, multi-tenant, etc.
3. **Selección por Vendedor + confirmación PL** — vendedor propone, PL confirma.

**Recomendación:** opción 1 (explícita), apoyada por inferencia en Capa 4 si hay flags.
**Responsable:** Frank.

---

## Q-NB-2 · Aceptación del cliente vía proxy PL (non-blocking)

**Razón:** el PL podría registrar por sí mismo la aceptación que necesita para cerrar.

**Opciones:**
1. **PL registra como proxy + campo "acepta_en_nombre_de" + evidencia obligatoria** — recomendación ATLAS.
2. **El Vendedor registra la aceptación** (separación de roles).
3. **El Director registra la aceptación** (aprobación de cierre).
4. **Otra** (especificar).

**Recomendación:** opción 1.
**Responsable:** Frank.

---

## Q-NB-3 · Regla de desviación presupuestal (non-blocking)

**Razón:** la simulación tuvo $80k declarado → $209k cotizado sin renegociación.

**Opciones:**
1. **Warning si > 1.5× presupuesto** — recomendación ATLAS.
2. **Bloqueo si > 1.5×** (requiere aprobación Director).
3. **Sin control** (decisión queda 100% al Vendedor/Director sin soporte).
4. **Otra** (especificar).

**Recomendación:** opción 1.
**Responsable:** Frank.

---

## Q-NB-4 · Asignación de programadores en creación de proyecto (non-blocking)

**Razón:** el workflow atómico sólo agrega al PL. Los programadores quedan sin asignar.

**Opciones:**
1. **El PL asigna después de creado el proyecto** (manual, recomendado ATLAS).
2. **El workflow atómico permite proponer técnicos** (queda como propuesta del Vendedor/PL al autorizar).
3. **Sin asignar hasta que se cree el primer módulo** (el PL asigna al iniciar módulo).

**Recomendación:** opción 1.
**Responsable:** Frank.

---

## Q-NB-5 · Cerrar técnico vs cierre administrativo de OS (non-blocking)

**Razón:** la simulación colapsa ambos. La regla actual exige ambos por separado.

**Opciones:**
1. **Dos cierres independientes con condiciones distintas** — recomendación ATLAS (mantiene la regla actual).
2. **Un solo cierre combinado.**
3. **Otra** (especificar).

**Recomendación:** opción 1.
**Responsable:** Frank.

---

## Q-OOS · Pendientes operativos fuera del alcance de discovery (no son discovery)

> **Estos 5 ítems NO son preguntas de discovery.** Son tareas de implementación/infra listadas por ChatGPT Sol. Archivadas en `OPEN-QUESTIONS.md` con tag `out_of_consolidation_scope`. Se retoman cuando exista INTEGRA/infra.

1. 88+ entries sin commitear (Frank).
2. 3 buckets Storage no creados (Frank, manual en dashboard).
3. 30k CCTs SEP no cargados (Frank o cron).
4. Frank no ha probado la URL visualmente.
5. T-E2E-07 RLS no ejecutado (sin Docker).
