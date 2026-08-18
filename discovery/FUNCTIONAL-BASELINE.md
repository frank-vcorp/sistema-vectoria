# Vector IA · Discovery funcional consolidado

**Versión:** v0 (post-reorganización 2026-08-17)
**Fecha:** 2026-08-17
**Estado:** Documento funcional vigente. NO es especificación técnica. Pendiente decisiones de Frank.
**Sesiones de discovery incorporadas:** 14-ago (diseño inicial) · 17-ago (decisiones tácticas + cuestionarios adaptativos) · 17-ago-20:56 (consolidación ATLAS)

---

## 1. ¿Qué es este sistema?

**Vector IA Administración** es una aplicación web interna para controlar el proceso comercial, técnico y financiero de una empresa pequeña de desarrollo de software y automatizaciones apoyadas con IA.

- **4-10 personas** (Director, Vendedores, Líderes de Proyecto, Programadores, Administradores, Diseñadores, QA).
- **Una sola organización** (con arquitectura multi-org latente para futuro).
- **Una moneda** (MXN) con extensión futura a multi-moneda.
- **México** (zona horaria `America/Mexico_City`, RFC, CFDI 4.0).

**Regla de oro del sistema:**

> El módulo comercial define QUÉ se vendió; el módulo de proyectos controla CÓMO se ejecuta; el módulo financiero determina CUÁNTO se facturó, cobró, costó y ganó.

---

## 2. Actores (roles)

**Principio fundamental:** ningún rol ni permiso está hardcoded en el sistema. Roles, permisos, relación rol→permiso, relación usuario→rol y permisos custom individuales son **datos** gestionados por el Director.

### 2.1 Roles base (7 combinables)

| Código | Label | Persona ejemplo |
|---|---|---|
| `director` | Director | (cualquier empleado senior) |
| `vendedor` | Vendedor | (cualquier empleado comercial) |
| `administrador` | Administrador | (cualquier empleado administrativo) |
| `lider_proyecto` | Líder de Proyecto | (cualquier empleado técnico senior) |
| `programador` | Programador | (cualquier programador) |
| `disenador` | Diseñador UX/UI | (futuro) |
| `qa` | QA / Tester | (futuro) |

**Combinables:** un usuario puede tener hasta 5 roles. Ejemplos:
- `[vendedor, lider_proyecto]` — comercial con doble rol.
- `[director]` — director puro.
- `[programador, qa]` — programador con skills de QA.

### 2.2 Visibilidad por rol (resumen)

| Rol | Ve | NO ve |
|---|---|---|
| Director | Todo | — |
| Vendedor | Sus prospectos/cotizaciones/OS, su proyecto, su comisión | Precios internos, márgenes, CxC, comisiones de otros |
| Administrador | Todo comercial, todo financiero, todos los proyectos (read-only) | Detalles técnicos profundos |
| Líder de Proyecto | Su proyecto completo, tiempo del equipo | Precios, márgenes, CxC, comisiones |
| Programador | Su proyecto (módulos asignados), tareas, tiempo | Precios, márgenes, CxC, otros proyectos |
| Diseñador | Igual que Programador + ejecuta pruebas visuales | Igual |
| QA | Igual que Programador + ejecuta y revisa pruebas | Igual |

**Detalle por acción/permiso en:** `discovery/ACTORES-Y-PERMISOS.md`.

---

## 3. Módulos del sistema

⚠️ **CONTRADICCIÓN PENDIENTE — Cantidad de módulos:** las fuentes oscilan entre 6, 7, 8 y 9. Se consolida como **7 módulos visibles + 1 módulo de Hoy/Dashboard + sub-módulos técnicos de Cuestionarios/Plantillas/Catálogo** que viven dentro de Administración. Frank debe ratificar.

### 3.1 Resumen de módulos

| # | Módulo | Estado diseño | Pendiente |
|---|---|---|---|
| 1 | Autenticación y Usuarios (`auth`) | Diseñado | — |
| 2 | Clientes (`clients`) | Diseñado | — |
| 3 | Comercial (`commercial`) | Diseñado | — |
| 4 | Proyectos (`projects`) | Diseñado | — |
| 5 | Facturación (`facturacion`) | Diseñado | — |
| 6 | Cobranza (`cobranza`) | Diseñado (sub-módulo) | — |
| 7 | Finanzas (`finance`) | Pendiente | Diseño completo |
| 8 | Administración (`administration`) | Pendiente | Diseño completo |
| 9 | Hoy / Dashboard | Pendiente | Diseño completo |

> **Decisión ratificada por sesión 17-ago:** el sistema cuenta con un módulo de **Cobranza separado del módulo Comercial** (decisión estructural #11). Algunos documentos lo listan como módulo y otros como sub-módulo. Frank debe ratificar si es módulo 6 o sub-módulo de Comercial.

### 3.2 Hoy / Dashboard (por rol)

- **Director:** proyectos en riesgo, CxC, ingresos/egresos.
- **Vendedor:** prospectos sin próxima acción, cotizaciones por vencer.
- **Administrador:** facturas vencidas, cobros del día, ingresos/egresos.
- **Líder de Proyecto:** actividades del día, proyectos en riesgo, próximas entregas.
- **Programador:** actividades del día, bloqueos.

**Widgets configurables** por usuario (drag & drop). Default: "Esta semana" con "Hoy" como filtro. Notificaciones: solo in-app en MVP.

---

## 4. Catálogo de servicios

Catálogo configurable de productos/servicios asociado a un `project_type`. Pre-llena: spec, cotización (con precios default), JSON Discovery (qué tareas base crear).

### 4.1 Categorías y servicios definidos

| Categoría | Servicios |
|---|---|
| Sistema Web | Página Web estática, Página e-commerce, Landing Page, Página CMS |
| Redes Sociales | (gestión mensual) |
| Dominio y Hosting | Dominio (anual), Hosting (mensual) |
| Correos | Workspace, Webmail, Transaccionales |
| Consultoría | Consultoría (por hora) |

### 4.2 Tipos y ciclos de facturación

**Tipo de servicio:** `one_time_service`, `recurring_service`, `one_time_product`, `recurring_product`.

**Ciclo de facturación:** `one_time`, `monthly`, `annual`, `custom`.

### 4.3 Plantillas de proyecto derivadas del catálogo

| Plantilla | `project_type` | reqs | tasks | tests | horas |
|---|---|---|---|---|---|
| Landing Page | `web_landing` | 3 | 4 | 2 | ~16h |
| Sitio Web (CMS o estática) | `web_sitio` | 5 | 7 | 4 | ~40h |
| Web App (CRUD + auth + dashboards) | `web_app` | 10 | 18 | 14 | ~160h |
| SaaS (multi-tenant + APIs) | `web_saas` | 16 | 32 | 24 | ~400h |
| Modificación de sistema | `modificacion` | — | — | — | — |
| Automatización con IA | `automatizacion_ia` | — | — | — | — |
| Integración | `integracion` | — | — | — | — |
| Implementación | `implantacion` | — | — | — | — |
| Mantenimiento o soporte | `mantenimiento` | — | — | — | — |

**Total:** 9 plantillas seed.

⚠️ **CONTRADICCIÓN PENDIENTE — Mapeo catálogo → plantilla:** el catálogo de "Sistema Web" agrupa "Página Web estática + e-commerce + Landing + CMS" mientras las plantillas separan 4 niveles (`web_landing`, `web_sitio`, `web_app`, `web_saas`). No está definido cómo "Sistema Web" del catálogo elige entre `web_sitio`/`web_app`/`web_saas`. Este hueco ya produjo un error de simulación (ver hallazgos).

---

## 5. Cuestionarios de sondeo

**Principio ratificado 17-ago:** el Vendedor NUNCA escribe el spec ni va a ChatGPT a generar JSON. Solo aplica el **cuestionario de sondeo** (digital / imprimible / guía del vendedor). El sistema **genera el spec automáticamente** desde: cuestionario + catálogo + plantilla.

### 5.1 Estructura en 4 capas adaptativas

```
CAPA 1 · Base universal (5 preguntas)  — aplica siempre
CAPA 2 · Por project_type (5-10 preguntas)
CAPA 3 · Por servicio seleccionado (2-4 por servicio)
CAPA 4 · Sub-cuestionarios opcionales (UX, Seguridad, Accesibilidad, Capacitación)
```

**Total:** 5-32 preguntas según complejidad.

### 5.2 Tres versiones por cuestionario

- **Digital (wizard):** captura en tiempo real.
- **Imprimible (PDF):** vendedor marca a mano durante llamada.
- **Guía del vendedor (PDF):** tips de mejores preguntas.

### 5.3 Configurabilidad

- **6 cuestionarios seed** (uno por project_type).
- Preguntas predefinidas y editables por el Director.
- Editor visual drag & drop con vista previa.
- Tipos de pregunta: single_choice, multi_choice, texto, texto_largo, numero, rango, fecha, email, telefono, catalogo.
- Sub-cuestionarios opcionales activan por condiciones (ej. `maneja_datos_sensibles=true`).

---

## 6. Plantillas de proyecto (estructura modular)

Cada plantilla subdivide un proyecto en **módulos** con sus propios requirements/tasks/tests/deliverables y dependencias entre módulos.

```json
{
  "template_meta": {"name": "Web App", "project_type": "web_app"},
  "modules": [
    {"code": "auth", "is_core": true, "depends_on_modules": [],
     "requirements": [...], "tasks": [...], "tests": [...], "deliverables": [...]},
    {"code": "billing", "depends_on_modules": ["customers"], ...}
  ],
  "default_modules": ["auth", "customers", "billing"]
}
```

### 6.1 Estados de un módulo de proyecto

⚠️ **CONTRADICCIÓN PENDIENTE — Vocabulario de estados de módulo (P0):** las fuentes presentan **tres vocabularios distintos**:

| Fuente | Estados |
|---|---|
| Discovery-01 (L137) | `implementado` |
| FUNCTIONAL-BASELINE L809 | `pending / en_curso / en_pruebas / implementado / pospuesto` |
| FUNCTIONAL-BASELINE L760 (BR-N113/114) | `in_progress / deployed` |

**Propuesta de unificación (pendiente OK Frank):**
`pending → in_progress → testing → deployed → (paused | blocked) → (deployed | cancelled)`

**Salud del módulo:** `on_track` / `at_risk` / `delayed` (también pendiente normalizar contra `en_tiempo/en_riesgo/retrasado`).

### 6.2 Reglas de avance módulo por módulo

- **BR-N113:** Módulo `deployed` requiere 4 checks (reqs validados, actividades con evidencia, tests passing, entregables aceptados).
- **BR-N114:** Módulo `in_progress` requiere que sus `depends_on_modules` estén `deployed`.

---

## 7. JSON Discovery (round-trip para descomposición técnica)

**Cuándo se usa:** una vez que el spec está firmado y el proyecto creado, el JSON Discovery ayuda a **descomponer** el proyecto en módulos/tareas/tests/deliverables accionables. NO se usa para crear el spec (eso lo hace el sistema desde el cuestionario).

**4 fases del JSON:**

| Fase | Quién lo genera |
|---|---|
| v0 — Plantilla vacía | Sistema (al iniciar discovery) |
| v1..vN — Descomposición | Director (Atlas/ChatGPT) y/o Programador (VS Code) |
| Execution — Con IDs reales | Sistema (al importar) |
| Execution+updates — Con avance del programador | Programador (en VS Code) |

**Quién hace qué:**
- **Director:** revisa y mejora JSONs.
- **Programador:** tilda tareas done con evidencia, marca progreso.
- **PL:** revisa, sube al sistema, aprueba.
- **Vendedor con doble rol PL:** puede participar (empresa pequeña). Vendedor puro NO.

**instrucciones para IA embebidas (`_meta.instructions_for_ai`):**
- PUEDES agregar/modificar: tasks, requirements, deliverables, tests.
- NO modifiques: `project.id`, `project.folio`, `scope.included` (INMUTABLE).
- Si algo sale del scope, agrégalo en `solicitud_de_cambio`.

---

## 8. Cotización y Orden de Servicio

⚠️ **CONTRADICCIÓN PENDIENTE — Cotización multi-línea vs 1 línea (P0):**

- **Discovery-01 (L128) y simulación:** "Cotización 1 línea, monto global — sin catálogo de servicios, sin multi-línea, sin desglose de horas".
- **FUNCTIONAL-BASELINE L531 y §22 #6 (decisión 24-ago):** "Cotización multi-línea".
- **JSON `vectoria_especificacion_..._mvp.json` (reglas comerciales):** contempla multi-línea con `quote_items`.

**Recomendación ATLAS:** quedarse con **multi-línea** (más reciente, consistente con el JSON). Pendiente OK Frank.

### 8.1 Cotización (resumen reglas confirmadas)

- Items auto-pre-llenados desde spec + catálogo.
- Versiones: una cotización puede tener varias; solo 1 puede aceptarse.
- Campos: subtotal, descuento, IVA, total.
- **Descuento BR-N143:** ≤10% libre · 10-25% con Director · >25% bloqueado.
- Tipo de cobro: `un_pago` / `mensualidades` / `suscripcion`.
- Vigencia: mínimo 7 días.
- Aceptación: requiere evidencia obligatoria.

### 8.2 Orden de Servicio (workflow atómico)

```
Cotización aceptada  →  (atomic)  →
  - Lead → won
  - OS creada
  - Comisión estimada (si rate > 0)
  - Audit log
```

### 8.3 Autorización de inicio (atómico)

```
OS status: pendiente_anticipo
  ↓ Admin cobra anticipo
  ↓ Admin autoriza
  ↓ (atomic)
  - Validar BR-017 (OC cliente)
  - Proyecto creado con snapshot del scope
  - Líder técnico asignado
  - OS → en_ejecucion
  - Log entry
```

### 8.4 Tipos de cobro

- **`un_pago`:** cobro único al inicio (50/50 o 100% upfront).
- **`mensualidades`:** N pagos definidos en `installments_config`; cada pago con su factura.
- **`suscripcion`:** pago inicial de personalización obligatorio, mensualidad recurrente. **BR-N121:** solo se autoriza el proyecto DESPUÉS de cobrar el inicial.

### 8.5 OC del cliente (BR-017)

OS puede tener 4 campos opcionales para OC del cliente: `client_po_number`, `client_po_date`, `client_po_amount`, `client_po_file_id`. Si `client_po_amount > 0`, debe coincidir con `sold_total` ±0 y exigir PDF antes de `authorized_to_start`.

---

## 9. Comisiones

⚠️ **CONTRADICCIÓN PENDIENTE — Base de la comisión (P1):**

| Fuente | Regla |
|---|---|
| `vectoria_especificacion_..._mvp.json` (L1353) | `commission_released = estimated × collected_amount / sold_total` (sobre **cobrado**) |
| FUNCTIONAL-BASELINE L591, BR-N33 v2 | `comision.liberada = estimada × Σ(facturas NO canceladas) / total_OS` (sobre **facturado**) |
| Simulación (PASO 9.1) | Calcula la liberación al **confirmar el cobro** |

**Recomendación ATLAS:** la regla vigente es **sobre FACTURADO, no sobre COBRADO** (BR-N33 v2, ratificada 17-ago). Pendiente OK Frank. El JSON del archive debe actualizarse para reflejarlo en una futura revisión.

### 9.1 Estados de una comisión

`estimada → devengada → liberada → pagada` (+ `cancelled`)

- **Estimada:** nace de la cotización aceptada con rate > 0.
- **Liberada:** proporcional a la suma de facturas NO canceladas.
- **Pagada:** solo cuando Director/admin la transfiere explícitamente. Default: día 15 de cada mes.
- **BR-N123:** se reversa si la factura se cancela.

---

## 10. Facturación CFDI 4.0 con FacturoPorTi

⚠️ **CONTRADICCIÓN PENDIENTE — Timbrado SAT (P1):**

- **JSON archive (`vectoria_especificacion_..._mvp.json`):** "no implementar conexión directa con SAT, bancos, WhatsApp" en el MVP. Factura se emite fuera del sistema y se registran datos.
- **FUNCTIONAL-BASELINE L622 y #10 (decisión 24-ago):** "Cambio mayor vs propuesta inicial: el sistema **timbrará** CFDI directamente vía API (FacturoPorTi)".
- **Backlog del propio JSON:** "timbrado para el futuro".

**Recomendación ATLAS:** la decisión vigente es **timbrado real con FacturoPorTi** (ratificada sesión 17-ago). Pendiente OK Frank. Los documentos de archive que digan lo contrario deben marcarse `superseded`.

### 10.1 Datos del emisor

| Campo | Notas |
|---|---|
| RFC | De la organización |
| Razón social | — |
| Régimen fiscal | Código SAT |
| Lugar de expedición (CP) | — |
| CSD (.cer + .pem + password) | Encriptado en BD |
| API key de FacturoPorTi | Encriptado en BD |
| Folios autorizados por SAT | Serie + rango |

### 10.2 Proceso

```
Usuario crea invoice
  ↓ Sistema arma JSON CFDI 4.0
  ↓ Valida campos requeridos
  ↓ Preview al usuario
  ↓ Botón "Timbrar"
  ↓ POST a FacturoPorTi
  ↓ Sistema guarda: UUID, XML, PDF
  ↓ Status: emitida
```

### 10.3 Cancelación

Motivo SAT (`01: Con relación` / `02: Sin relación` / `03: Operación no realizada` / `04: Duplicado`).

---

## 11. Calendario de Facturación (estados visuales)

```
⚪ Pendiente de facturar
📄 Facturada (emitida, no cobrada)
✅ Cobrada (pagada totalmente)
🔴 Vencida (facturada, pasó fecha)
💛 Promesa de pago (cliente dijo "pago el X")
🟠 Disputado (cliente reclama algo)
🟠 Escalated (tras 2 promesas incumplidas)
```

### 11.1 Facturación recurrente (cron)

Cada día 02:00 AM: buscar schedules con `next_billing_date = hoy`, crear invoice (auto o draft), actualizar `next_billing_date`, notificar al admin.

### 11.2 Sub-módulo Cobranza

- Calendario visual mensual de ingresos esperados vs reales.
- Forecast vs Real.
- Ayudas al cobrador (plantillas amable/firme/final, historial, sistema de promesas con escalación, casos urgentes priorizados).
- Tracking de actividades de cobranza.

---

## 12. Reglas de negocio clave (resumen)

⚠️ **NOTA IMPORTANTE:** este resumen lista **las reglas con identificador localizable** en el repositorio. El documento `DECISIONES-V1-20260815.md` referenciado en la versión anterior **NO se encuentra en el repositorio**; sus 150+ reglas se reconstruyen sólo cuando Frank confirme su contenido o decida regenerarlas. Mientras tanto, sólo estas reglas son **firmes**.

| ID | Regla | Estado |
|---|---|---|
| BR-N01 | Cotización sin vigencia vigente no se acepta | Confirmada |
| BR-N02 | Cotización aceptada es inmutable | Confirmada |
| BR-N03 | 1 cotización → 1 OS → 1 proyecto (MVP) | Confirmada |
| BR-N04 | Técnico no modifica alcance, precios ni comisiones | Confirmada |
| BR-005 | Requerimiento sin criterio no pasa a development | Confirmada |
| BR-006 | Tarea bloqueada requiere motivo | Confirmada |
| BR-007 | Tarea done → checklist completo | Confirmada |
| BR-008 | Horas ≤ 24/día + snapshot costo | Confirmada |
| BR-009 | Test failed requiere resultado + incidencia | Confirmada |
| BR-010 | Entregable accepted requiere nombre + fecha | Confirmada |
| BR-011 | Cambio de alcance no se implementa sin authorized | Confirmada |
| BR-013 | Movimiento reconciled no se edita | Confirmada |
| BR-014 | Cancelar/revertir exige motivo + auditoría | Confirmada |
| BR-016 | Aislamiento por organización | Confirmada |
| BR-017 | OC validada antes de autorizar OS | Confirmada |
| BR-N25 | 1 cotización aceptada por prospecto | Confirmada |
| BR-N51 | Cotización requiere spec firmado | Confirmada |
| BR-N52 | Spec firmado inmutable | Confirmada |
| BR-N113 | Módulo deployed requiere 4 checks | Confirmada (vocabulario a unificar) |
| BR-N114 | Módulo in_progress requiere deps deployed | Confirmada (vocabulario a unificar) |
| BR-N121 | Suscripción requiere cobro inicial antes de autorizar | Confirmada |
| BR-N123 | Comisiones se reversan si factura se cancela | Confirmada |
| BR-N127 | Roles seed no se eliminan | Confirmada |
| BR-N128 | Director puede crear roles custom | Confirmada |
| BR-N131 | Permisos custom son aditivos | Confirmada |
| BR-N143 | Descuento en cotización: ≤10% libre, 10-25% director, >25% bloqueado | Confirmada |
| BR-N147 | Respaldo BD diario, retenido 30 días | Confirmada |
| BR-N148 | Prospecto qualified requiere cuestionario | Confirmada |
| BR-N149 | Cotización requiere cuestionario_sondeo_id | Confirmada |
| BR-N168 | Cliente se crea desde prospecto cuando cumple condiciones | Confirmada |
| **BR-N33 v2** | Comisiones sobre FACTURADO, no sobre COBRADO | Confirmada (contradicción con JSON archive) |

---

## 13. Permisos custom (aditivos)

| Concepto | Dónde vive | Quién gestiona |
|---|---|---|
| Roles | Tabla `roles` | Director |
| Permisos | Tabla `permisos` | Director |
| Relación rol → permiso | Tabla `roles_permisos` | Director |
| Relación usuario → rol | Tabla `perfiles_usuario_roles` | Director |
| Permisos custom usuario | Tabla `usuarios_permisos_custom` | Director |
| Verificación | `hasPermission(code)` | — |

**Regla:** permiso custom es **aditivo** (nunca quita), otorgado por Director, registrado en audit_log.

---

## 14. Tests con 7 tipos

| Tipo | Quién ejecuta | Bloquea cierre |
|---|---|---|
| `functional` | Programador, QA | Sí |
| `visual` | Diseñador, QA | Sí |
| `ui` | QA | Sí |
| `acceptance` | Cliente (proxy PL) | Sí |
| `performance` | Programador | No (warning) |
| `compatibility` | QA | Sí |
| `security` | Programador, auditor | No (warning) |

⚠️ **CONTRADICCIÓN PENDIENTE — Aceptación del Cliente (P1):** la decisión ratificada es "Cliente (proxy PL)". Esto permite operar sin portal, pero el PL podría registrar por sí mismo la aceptación que necesita para cerrar. Frank debe definir cómo se exige contacto, evidencia, fecha y trazabilidad de que actúa como **registrador**, no como quien acepta.

---

## 15. Estructura del proyecto (modular)

```
PROYECTO
  ├─ Módulo: auth         (status, progress_percent, salud, requiere_modulos[])
  ├─ Módulo: clientes     (…)
  ├─ Módulo: billing      (…)
  └─ Módulo: reports      (…)
```

Cada módulo: `status`, `progress_percent` (0-100), `salud` (`on_track` / `at_risk` / `delayed`), `requiere_modulos[]` (dependencias).

---

## 16. Decisiones cerradas (resumen)

⚠️ **CONTRADICCIÓN PENDIENTE — Conteo de decisiones:** las fuentes oscilan entre **34**, **40**, **46** y **52**. La cifra vigente ratificada el 17-ago es **52 decisiones cerradas (23 estructurales + 23 tácticas + 6 sobre cuestionarios adaptativos)**. Frank debe ratificar.

### 16.1 Decisiones estructurales (sesión 14-ago, 23 decisiones)

1. Sistema con 7 módulos + catálogos + plantillas + cuestionarios.
2. Roles NO hardcoded (configurables por Director).
3. Combinación de roles (vendedor + PL).
4. Cliente se crea desde prospecto (no manualmente).
5. Spec se firma ANTES de cotizar.
6. Cotización multi-línea (decisión 24-ago — **contradice** Discovery-01 inicial).
7. OS con campos OC opcionales.
8. Sin módulo Impuestos formal (ZIP para contador).
9. Tareas con horas opcionales en MVP.
10. Módulo Facturación CON FacturoPorTi (timbrado real).
11. Módulo Cobranza separado del Comercial.
12. Plantillas con 4 niveles para sistema web.
13. 7 tipos de tests.
14. Estructura modular en plantillas (`project_modules`).
15. JSON Discovery al FINAL (no round-trip continuo).
16. Comisiones sobre FACTURADO.
17. Suscripciones con cobro inicial obligatorio.
18. Cuestionarios antes del spec (3 versiones: digital + imprimible + guía).
19. 14 medios de contacto (llamada, email, whatsapp, etc.).
20. Cliente se genera automáticamente al calificar prospecto.
21. Tooltips explicativos en configuración.
22. Link de invitación (sin integración WhatsApp).
23. Sistema de permisos custom aditivos por usuario.

### 16.2 Regla de oro (ratificada 17-ago)

> EL VENDEDOR NO HACE SPEC CON IA. SOLO LLENA EL CUESTIONARIO.
> El spec lo genera el sistema desde: cuestionario + catálogo + plantilla.
> El PL revisa, ajusta si necesario, y firma. La IA externa no participa en crear el spec.

### 16.3 Decisiones tácticas (sesión 17-ago, 23 decisiones)

**Finanzas (4):** CxC/CxP tabla por defecto + calendario como filtro · Rentabilidad desglosada por técnico · ZIP contador auto + manual · Transferencias entre cuentas con paso explícito (BR-013).

**Hoy / Dashboard (3):** Widgets por rol configurables (drag & drop) · Notificaciones solo in-app · Default "Esta semana" + filtro "Hoy".

**Operaciones y políticas (6):** SLA cotización 48h hábiles · Sin límite cotizaciones por prospecto (warning >5) · Asignación de tareas solo el PL · Auto-asignación de técnicos en backlog sin asignar · Rechazo de tareas con motivo · Visibilidad del tiempo solo del propio.

**Post-venta y reembolsos (5):** Módulo soporte post-venta NO en MVP · Reembolso por cancelación proporcional con aprobación Director · Cambios de alcance con email/PDF · Sin descuentos automáticos (BR-N143) · ZIP contador solo facturas activas.

**Técnico y plataforma (5):** Multi-idioma solo es-MX · Sin integración bancos en MVP · Respaldo BD diario 30 días (BR-N147) · Comisión rate por OS (una sola tasa) · 1 cotización aceptada por prospecto (BR-N25).

### 16.4 Cuestionarios adaptativos (6 decisiones)

47. Cuestionario en 4 capas.
48. Rango 5-32 preguntas.
49. Todo predefinible y editable.
50. Preguntas reutilizables por servicio.
51. Sub-cuestionarios condicionales.
52. Editor visual drag & drop.

### 16.5 Decisiones ratificadas explícitamente fuera de scope MVP

- 🔴 Soporte post-venta.
- 🔴 Integración con bancos.
- 🔴 Multi-idioma.

---

## 17. Glosario (no técnico)

| Término | Significado |
|---|---|
| Prospecto | Persona/empresa interesada en comprar, pero aún no compra |
| Cliente | Persona/empresa con la que ya hacemos negocios (compró o tiene proyecto activo) |
| Cotización | Propuesta formal de venta con precio, vigencia, términos |
| OS (Orden de Servicio) | Expediente administrativo de lo vendido |
| Proyecto | El trabajo técnico que se ejecuta |
| Módulo | Subdivisión de un proyecto (auth, clientes, billing, etc.) |
| Requerimiento | Algo que el sistema debe hacer (con criterio de aceptación) |
| Actividad | Tarea concreta a realizar (en el tablero) |
| Test | Prueba que verifica que algo funciona |
| Entregable | Output que se entrega al cliente |
| Cambio de alcance | Solicitud de cambio fuera del scope original |
| Bitácora | Registro cronológico de eventos del proyecto |
| Spec | Especificación técnica-funcional firmada |
| Levantamiento | Proceso de capturar los requisitos del cliente |
| Sondeo | Cuestionario inicial para entender la necesidad |
| Comisión | Pago al vendedor (% de la venta) |
| CxC | Cuentas por Cobrar |
| CxP | Cuentas por Pagar |
| Anticipo | Pago inicial antes de empezar el trabajo |
| OC | Orden de Compra del cliente |
| CFDI | Comprobante Fiscal Digital por Internet (México) |
| PAC | Proveedor Autorizado de Certificación (ej: FacturoPorTi) |
| CSD | Certificado de Sello Digital |
| RFC | Registro Federal de Contribuyentes (México) |

---

## 18. Pendientes y fuera de scope de este documento

- **No es una especificación técnica.** Sucesora: `context/SPECs/SPEC-*.md` (propiedad de INTEGRA, no se genera en este pase).
- **No resuelve contradicciones P0/P1.** Cada contradicción visible se eleva a Frank vía `discovery/PREGUNTAS-ABIERTAS.md`.
- **No incluye la 150+ reglas detalladas.** El archivo `DECISIONES-V1-20260815.md` referenciado en la versión anterior no existe en el repo. Se reconstruirá cuando Frank lo apruebe.

---

**Próximo paso recomendado:** Frank responde `PREGUNTAS-ABIERTAS.md`. Una vez resueltas las P0 (vocabulario de módulos, cotización multi-línea vs 1 línea, base de comisión, timbrado, conteos), ATLAS emite `FUNCTIONAL-HANDOFF` a INTEGRA.
