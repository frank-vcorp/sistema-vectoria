# Sistema Vector IA · Especificación No Técnica

**Versión:** 1.2
**Fecha:** 2026-08-17
**Estado:** 7 módulos diseñados · 52 decisiones cerradas (estructurales + tácticas + cuestionarios)
**Sesiones:** 14-ago (diseño inicial) · 17-ago (decisiones tácticas + cuestionarios adaptativos)

---

## 1. ¿Qué es este sistema?

**Vector IA Administración** es una aplicación web interna para controlar el proceso comercial, técnico y financiero de una empresa pequeña de desarrollo de software y automatizaciones apoyadas con IA.

Está pensada para:
- **4-10 personas** (Director, Vendedores, Líderes de Proyecto, Programadores, Administradores, Diseñadores, QA)
- **Una sola organización** (con arquitectura multi-org latente para futuro)
- **Una moneda** (MXN) con extensión a multi-moneda futura
- **México** (zona horaria `America/Mexico_City`, RFC, CFDI 4.0)

**Regla de oro del sistema:**
> El módulo comercial define QUÉ se vendió; el módulo de proyectos controla CÓMO se ejecuta; el módulo financiero determina CUÁNTO se facturó, cobró, costó y ganó.

---

## 2. Actores del sistema (Roles)

**Importante:** Los roles NO están hardcoded en el código. Son **datos** en una tabla que el Director puede gestionar.

### 2.1 Roles base (7)

| Código | Label | Persona ejemplo |
|---|---|---|
| `director` | Director | (cualquier empleado senior) |
| `vendedor` | Vendedor | (cualquier empleado comercial) |
| `administrador` | Administrador | (cualquier empleado administrativo) |
| `lider_proyecto` | Líder de Proyecto | (cualquier empleado técnico senior) |
| `programador` | Programador | (cualquier programador) |
| `disenador` | Diseñador UX/UI | (futuro) |
| `qa` | QA / Tester | (futuro) |

**Combinables:** un usuario puede tener hasta 5 roles. Ejemplo:
- Usuario comercial con doble rol: `[vendedor, lider_proyecto]`
- Usuario director: `[director]` (con permisos custom individuales si necesita)
- Usuario programador con skills de QA: `[programador, qa]` (en una empresa pequeña)

### 2.2 Permisos

Los permisos tampoco están hardcoded. Son **datos** en una tabla `permisos`.

**Ejemplo de permisos:**
- `ver_costos` — Ver costos internos
- `gestionar_facturas` — Gestionar facturas
- `aprobar_cambios` — Aprobar cambios de alcance
- `gestionar_proyectos` — Liderar proyectos
- `registrar_tiempo` — Registrar horas
- `ver_auditoria` — Ver registros de auditoría

**Asignación:**
- Cada rol tiene una lista de permisos (tabla `roles_permisos`)
- Un usuario tiene sus roles + permisos custom individuales (aditivos)

### 2.3 Visibilidad por rol

| Rol | Ve | NO ve |
|---|---|---|
| **Director** | Todo | — |
| **Vendedor** | Sus prospectos/cotizaciones/OS, su proyecto, su comisión | Precios internos, márgenes, CxC, comisiones de otros |
| **Administrador** | Todo comercial, todo financiero, todos los proyectos (read-only) | Detalles técnicos profundos |
| **Líder de Proyecto** | Su proyecto completo, tiempo del equipo | Precios, márgenes, CxC, comisiones |
| **Programador** | Su proyecto (módulos asignados), tareas, tiempo | Precios, márgenes, CxC, otros proyectos |
| **Diseñador** | Igual que Programador + ejecuta pruebas visuales | Igual |
| **QA** | Igual que Programador + ejecuta y revisa pruebas | Igual |

---

## 3. Módulos del sistema (7)

### 3.1 Autenticación y Usuarios (`auth`)

**Qué hace:**
- Login con email + contraseña (y opcionalmente magic link)
- Recuperación de contraseña
- Cambio de email con verificación
- Roles configurables (no hardcoded)
- Permisos custom por usuario (aditivos)
- Bitácora de auditoría de todo

**Pantallas clave:**
- `/login`
- `/perfil`
- `/administracion/usuarios`
- `/administracion/roles`
- `/administracion/permisos`
- `/administracion/auditoria`

### 3.2 Clientes (`clients`)

**Qué hace:**
- Alta y edición de clientes
- Contactos múltiples por cliente
- Datos fiscales (RFC, régimen)
- Historial relacionado de oportunidades, cotizaciones, OS, proyectos, facturas, cobros
- Archivado sin eliminación física
- **NUEVO:** cliente se crea automáticamente desde un prospecto cuando hay suficiente info

**Pantallas clave:**
- `/clientes` (lista)
- `/clientes/[id]` (timeline del cliente)
- `/clientes/nuevo`

### 3.3 Comercial (`commercial`)

**Qué hace:** Controla todo el ciclo desde prospecto hasta orden de servicio.

**Sub-módulos:**
- **Prospectos** — desde el primer contacto hasta calificación
- **Cotizaciones** — con versiones, multi-línea, tipos de cobro
- **Órdenes de Servicio (OS)** — expediente administrativo
- **Facturas** — registro de facturas externas
- **Cobros** — registro y aplicación a facturas
- **Comisiones** — calculadas sobre facturado (no sobre cobrado)

**Pantallas clave:**
- `/comercial/prospectos`
- `/comercial/cotizaciones`
- `/comercial/ordenes`
- `/comercial/facturas`
- `/comercial/cobros`
- `/comercial/comisiones`

### 3.4 Proyectos (`projects`)

**Qué es:** El módulo operativo principal. Es donde se ejecuta el trabajo técnico.

**Características clave:**
- **Estructura modular**: cada proyecto se subdivide en módulos (auth, clientes, billing, etc.)
- **Avance módulo por módulo**: no se avanza al siguiente hasta que el actual esté implementado y probado
- **JSON round-trip** (post-discovery): el proyecto se exporta a JSON, **el PL con rol Director** (o el Programador) lo trabaja en ChatGPT/VS Code, se sube de vuelta
- **Discovery guiado**: el JSON inicial se genera con cuestionario de sondeo
- **Plantillas con estructura modular**: 9 templates seed
- **Tests con 7 tipos**: funcional, visual, UI, aceptación, performance, security, compatibility
- **Tildado manual o por JSON**: el programador marca tareas done con evidencia

**Sub-entidades:**
- `projects` (núcleo)
- `project_modules` (instancia de módulo en proyecto)
- `requirements` (con criterios de aceptación)
- `tasks` (con tablero 6 columnas)
- `task_checklist_items`
- `time_entries` (con snapshot de costo/hora)
- `files` + `file_links` (polimórficos)
- `test_cases` (7 tipos)
- `deliverables` (con aceptación formal)
- `change_requests` (solicitudes de cambio de alcance)
- `project_log_entries` (bitácora del proyecto)
- `project_templates` (recetas modulares)

**Pantallas clave:**
- `/proyectos` (lista con cards semáforo)
- `/proyectos/[id]` (detalle con vista rápida por defecto + vista completa con tabs)
- `/proyectos/[id]/discovery` (wizard JSON)
- `/proyectos/[id]/guia-cliente` (guía no técnica para el cliente)
- `/proyectos/[id]/cerrar` (wizard con precondiciones)

### 3.5 Facturación (`facturacion`)

**Qué hace:**
- Registro de facturas externas (XML, PDF)
- **Timbrado con FacturoPorTi** (PAC real, no simulado)
- Facturación recurrente automática (cron job)
- Calendario visual con estados: � pendiente · 📄 facturada · ✅ cobrada · 🔴 vencida · 💛 promesa · 🟠 disputada
- Promesas de pago (escalación tras 2 incumplidas)
- Generación de ZIP mensual para contador externo

**Pantallas clave:**
- `/facturacion` (calendario)
- `/facturacion/schedules` (programaciones recurrentes)
- `/facturacion/pre-timbrar/[id]` (preview CFDI 4.0)
- `/facturacion/cancelar/[id]` (cancelación con motivo SAT)
- `/facturacion/promesas` (gestión de promesas)
- `/facturacion/configuracion-emisor` (CSD, API key)
- `/facturacion/folios` (rangos SAT)

### 3.6 Cobranza (`cobranza`)

**Qué hace:**
- Calendario mensual visual de ingresos esperados vs reales
- "VS cobranza" (forecast vs real)
- Ayudas operativas para el cobrador (plantillas de mensajes, recordatorios)
- Tracking de actividades de cobranza (llamadas, emails, promesas)
- Escalación por promesas incumplidas
- Casos priorizados

**Pantallas clave:**
- `/cobranza` (calendario)
- `/cobranza/factura/[id]` (detalle con ayudas)
- `/cobranza/forecast-vs-real` (comparativo)
- `/cobranza/casos-priorizados` (cola del cobrador)
- `/cobranza/promesas` (gestión de promesas)
- `/administracion/plantillas-mensajes` (CRUD)

### 3.7 Finanzas (`finance`)

**Qué hace:**
- Cuentas financieras múltiples (banco, caja, tarjeta)
- Ingresos y egresos
- Categorías financieras
- Cuentas por cobrar (CxC)
- Cuentas por pagar (CxP)
- Anticipos y abonos
- Transferencias entre cuentas
- Costos directos por proyecto
- Costo de horas por proyecto (mano de obra)
- Flujo mensual
- Rentabilidad por proyecto
- Comisiones

**Pantallas clave:**
- `/finanzas/cuentas`
- `/finanzas/ingresos`
- `/finanzas/egresos`
- `/finanzas/cuentas-por-cobrar`
- `/finanzas/cuentas-por-pagar`
- `/finanzas/rentabilidad` (vista clave para el Director)
- `/finanzas/flujo-mensual`
- `/finanzas/impuestos` (ZIP para contador)

### 3.8 Administración (`administration`)

**Qué hace:**
- Configuración de la organización (datos, logotipo, IVA, claves SAT)
- Usuarios y roles
- Permisos
- **Catálogo de servicios** (alimenta spec, cotización, discovery)
- **Plantillas de proyecto** (9 templates con estructura modular)
- **Cuestionarios de sondeo** (6 cuestionarios seed con 3 versiones: digital + imprimible + guía)
- Auditoría

**Pantallas clave:**
- `/administracion/configuracion`
- `/administracion/usuarios`
- `/administracion/roles`
- `/administracion/permisos`
- `/administracion/catalogos/servicios`
- `/administracion/plantillas`
- `/administracion/cuestionarios`
- `/administracion/auditoria`

### 3.9 Hoy / Dashboard

**Qué hace:**
- Vista personal por rol (qué necesita mi atención hoy)
- Cards priorizadas por rol
- Próximas acciones
- Alertas (vencidas, por vencer)
- Acceso rápido a acciones frecuentes

**Diferenciado por rol:**
- Director: proyectos en riesgo, cuentas por cobrar, ingresos/egresos
- Vendedor: prospectos sin próxima acción, cotizaciones por vencer
- Administrador: facturas vencidas, cobros del día, ingresos/egresos
- Líder de Proyecto: mis actividades del día, proyectos en riesgo, próximas entregas
- Programador: mis actividades del día, bloqueos

---

## 4. Catálogo de Servicios

**Idea:** Un catálogo configurable de productos/servicios que se asocia a un `project_type` y pre-llena:
- El spec del cliente (qué servicios venden)
- La cotización (con precios default)
- El JSON de discovery (qué tareas base crear)

### 4.1 Categorías y servicios definidos

| Categoría | Servicios |
|---|---|
| **Sistema Web** | Página Web estática, Página e-commerce, Landing Page, Página CMS |
| **Redes Sociales** | (gestión mensual) |
| **Dominio y Hosting** | Dominio (anual), Hosting (mensual) |
| **Correos** | Workspace, Webmail, Transaccionales |
| **Consultoría** | Consultoría (por hora) |

### 4.2 Tipos de servicio

| Tipo | Significado |
|---|---|
| `one_time_service` | Servicio único (consultoría, capacitación) |
| `recurring_service` | Servicio recurrente (mantenimiento, soporte) |
| `one_time_product` | Producto/entregable único (página web) |
| `recurring_product` | Producto recurrente (hosting, dominio, correos) |

### 4.3 Ciclos de facturación

| Ciclo | Significado |
|---|---|
| `one_time` | Cobro único |
| `monthly` | Mensual |
| `annual` | Anual |
| `custom` | A convenir |

---

## 5. Cuestionarios de Sondeo (antes del spec)

**Problema resuelto:** Antes, el vendedor iba directo a ChatGPT y el spec salía genérico. **Peor:** se le pedía al vendedor (no técnico) construir el spec.

**Solución:** El vendedor solo aplica un **cuestionario de sondeo** (formulario). El **sistema genera el spec automáticamente** desde:
- Las respuestas del cuestionario
- Los servicios del catálogo seleccionados
- La plantilla del project_type

**El vendedor NUNCA escribe el spec. NUNCA va a ChatGPT a generar JSON de spec.** Eso lo hace el sistema.

### 5.1 Estructura en 4 capas adaptativas

El cuestionario **NO es fijo** — se adapta según lo que el vendedor selecciona.

```
CAPA 1 · BASE UNIVERSAL (5 preguntas)
   Aplica SIEMPRE, sin importar tipo
   ↓
CAPA 2 · POR project_type (5-10 preguntas)
   Específicas según tipo de proyecto
   ↓
CAPA 3 · POR SERVICIO (2-4 por servicio)
   Solo si seleccionó servicios extra del catálogo
   ↓
CAPA 4 · SUB-CUESTIONARIOS OPCIONALES
   UX, Seguridad, Accesibilidad, Capacitación
   Se activan según flags de respuestas anteriores
```

**Total:** 5-32 preguntas según complejidad del proyecto.

### 5.2 Tres versiones por cuestionario (digital / imprimible / guía)

| Versión | Cuándo se usa |
|---|---|
| **Digital (wizard)** | Vendedor frente a la pantalla, captura en tiempo real |
| **Imprimible (PDF)** | Vendedor marca a mano durante llamada con cliente |
| **Guía del vendedor (PDF)** | Tips para hacer mejores preguntas antes de la llamada |

### 5.3 Capas en detalle

**Capa 1 · Base universal (5 preguntas):**
1. ¿Quién será el responsable del proyecto del lado del cliente?
2. ¿Cuál es el plazo deseado?
3. ¿Cuál es el presupuesto aproximado?
4. ¿Cómo resuelven hoy el problema?
5. ¿Tienen datos existentes para migrar?

**Capa 2 · Por project_type:**
- Sistema Web: 10 preguntas (usuarios, registros, operaciones, integraciones, etc.)
- Mantenimiento: 7 preguntas
- Automatización con IA: 8 preguntas
- Integración: 6 preguntas
- Implementación: 7 preguntas
- Modificación: 6 preguntas

**Capa 3 · Por servicio (ejemplos):**
- Hosting mensual: 4 preguntas (volumen, SLA, contenido, CDN)
- Dominio anual: 2 preguntas
- Workspace correos: 3 preguntas
- Consultoría: 4 preguntas
- Capacitación: 4 preguntas

**Capa 4 · Sub-cuestionarios opcionales:**
- UX (si web_app / web_saas): 5 preguntas
- Seguridad (si maneja datos sensibles): 5 preguntas
- Accesibilidad (si web app): 5 preguntas
- Capacitación (si requiere): 5 preguntas

### 5.4 Ejemplo real

**SaaS complejo:** Base (5) + Web App (10) + Hosting (4) + Workspace (3) + Seguridad (5) + UX (5) = **32 preguntas**

**Landing simple:** Base (5) + Landing (5) + Dominio (2) = **12 preguntas**

### 5.5 Configurabilidad (todo es dato, no código)

- **Cuestionarios seed:** 6 (uno por project_type)
- **Preguntas:** predefinidas y editables por el Director
- **Editor visual:** drag & drop con vista previa
- **Tipos de pregunta:** single_choice, multi_choice, texto, texto_largo, numero, rango, fecha, email, telefono, catalogo
- **Preguntas por servicio:** reutilizables en cualquier cuestionario
- **Preguntas base universal:** se aplican siempre
- **Sub-cuestionarios opcionales:** se activan según condiciones (ej: maneja_datos_sensibles=true)

### 5.6 Flujo del vendedor

```
Prospecto calificado
  ↓
Wizard: 3 opciones (digital / imprimible / guía)
  ↓
Vendedor lee guía (5 min)
  ↓
Vendedor llama al cliente + aplica cuestionario
  ↓
Capas se muestran según selecciones del vendedor
  ↓
Vendedor llena respuestas (guarda borrador)
  ↓
Sistema genera resumen estructurado
  ↓
Sistema genera spec automáticamente desde cuestionario + catálogo + plantilla
  ↓
PL revisa y firma
```

---

## 6. Plantillas de Proyecto (estructura modular)

**Problema resuelto:** Una plantilla genérica "Sistema Web" no servía para una landing ni para un SaaS.

**Solución:** Cada plantilla se subdivide en **módulos del proyecto**, cada uno con sus propios requirements/tasks/tests/deliverables.

### 6.1 Las 9 plantillas seed

**Sistema Web (4 niveles):**

| Plantilla | project_type | reqs | tasks | tests | horas |
|---|---|---|---|---|---|
| Landing Page | `web_landing` | 3 | 4 | 2 | ~16h |
| Sitio Web (CMS o estática) | `web_sitio` | 5 | 7 | 4 | ~40h |
| Web App (CRUD + auth + dashboards) | `web_app` | 10 | 18 | 14 | ~160h |
| SaaS (multi-tenant + APIs) | `web_saas` | 16 | 32 | 24 | ~400h |

**Otras (5):**

| Plantilla | project_type |
|---|---|
| Modificación de sistema | `modificacion` |
| Automatización con IA | `automatizacion_ia` |
| Integración | `integracion` |
| Implementación | `implementacion` |
| Mantenimiento o soporte | `mantenimiento` |

### 6.2 Estructura modular

Cada plantilla tiene módulos pre-configurados:

```json
{
  "template_meta": {
    "name": "Web App",
    "project_type": "web_app"
  },
  "modules": [
    {
      "code": "auth",
      "name": "Autenticación",
      "is_core": true,
      "depends_on_modules": [],
      "requirements": [...],
      "tasks": [...],
      "tests": [...],
      "deliverables": [...]
    },
    {
      "code": "billing",
      "name": "Facturación",
      "is_core": false,
      "depends_on_modules": ["customers"],
      "requirements": [...],
      "tasks": [...]
    }
  ],
  "default_modules": ["auth", "customers", "billing"]
}
```

### 6.3 Avance módulo por módulo

```
auth: deployed ✅
clientes: deployed ✅
billing: testing 🟡 (78%)
reports: pending ⚪ (bloqueado hasta billing deployed)

→ PL puede empezar billing porque customers está deployed
→ Reports NO puede empezar hasta billing deployed
```

---

## 7. JSON Discovery (round-trip para descomponer el proyecto en módulos/tareas)

**Contexto importante:** el SPEC inicial del proyecto (alcance, funciones, entregables) lo **genera automáticamente el sistema** desde el cuestionario de sondeo + catálogo + plantilla. Esto NO requiere JSON.

**¿Cuándo se usa entonces el JSON Discovery?** Para **descomponer** el proyecto en módulos/tareas/tests/deliverables accionables. Es decir, una vez que el spec está firmado, se crea el proyecto, y el JSON Discovery ayuda a planificar el trabajo técnico.

**Problema resuelto:** ¿Cómo trabaja el PL/Programador en herramientas externas (ChatGPT, VS Code) si el sistema no se conecta a esas herramientas?

**Solución:** Round-trip vía JSON.

### 7.1 El JSON tiene 4 fases

| Fase | Nombre | Quién lo genera |
|---|---|---|
| v0 | Plantilla vacía | Sistema (al iniciar discovery) |
| v1..vN | Descomposición | **Director** (Atlas/ChatGPT) y/o **Programador** (VS Code) |
| Execution | Con IDs reales | Sistema (al importar) |
| Execution+updates | Con avance del programador | Programador (en VS Code) |

**Importante:** El Vendedor (con doble rol PL) puede participar en discovery porque ya validamos reglas. Pero el Vendedor puro NO debería trabajar en JSON Discovery — esa es tarea del PL.

### 7.2 Instrucciones para IA embebidas en el JSON

Cada JSON-v0 incluye un bloque `_meta.instructions_for_ai` que dice:

```
PUEDES agregar/modificar: tasks, requirements, deliverables, tests
NO modifiques: project.id, project.folio, scope.included (es INMUTABLE)
Si algo sale del scope, agrégalo en solicitud_de_cambio
```

### 7.3 Quién hace qué

- **Director** (Atlas): revisa y mejora JSONs
- **Programador** (VS Code): tilda tareas done con evidencia, marca progreso
- **PL** (en sistema): revisa, sube al sistema, aprueba
- **Vendedor con doble rol PL**: puede participar en discovery si la empresa es pequeña

---

## 8. Cotización y Orden de Servicio

### 8.1 Cotización (multi-línea)

**Items auto-pre-llenados** desde el spec + catálogo.
**Versiones**: una cotización puede tener varias versiones; solo 1 puede aceptarse.
**Campos:** subtotal, descuento (≤10% libre / 10-25% con director / >25% bloqueado), IVA, total.
**Tipo de cobro** (`billing_type`): `un_pago` / `mensualidades` / `suscripcion`.
**Vigencia:** mínimo 7 días.
**Aceptación:** requiere evidencia obligatoria.

### 8.2 Orden de Servicio (OS) (workflow atómico)

```
Cotización aceptada
  ↓ (atomic)
- Lead → won
- OS creada automáticamente
- Comisión estimada creada (si rate > 0)
- Audit log
```

### 8.3 Autorización de inicio (atomic)

```
OS status: pendiente_anticipo
  ↓ Administrador cobra anticipo
  ↓ Administrador autoriza
  ↓ (atomic)
- Validar BR-017 (OC del cliente)
- Proyecto creado con snapshot del scope
- Líder técnico asignado
- OS → en_ejecucion
- Log entry
```

---

## 9. Tipos de cobro: un_pago, mensualidades, suscripción

### 9.1 Un pago

- Cobro único al inicio (50/50 o 100% upfront)
- OS se autoriza tras anticipo

### 9.2 Mensualidades

- N pagos definidos en `installments_config`
- Cada pago tiene su factura

### 9.3 Suscripción

- Pago inicial de **personalización** (obligatorio)
- Mensualidad recurrente
- **Solo se autoriza el proyecto DESPUÉS de cobrar el inicial** (BR-N121)

---

## 10. Comisiones

### 10.1 Regla BR-N33 v2

**Comisión se libera sobre FACTURADO, no sobre COBRADO.**

```
comision.liberada = estimada × Σ(facturas NO canceladas) / total_OS
```

### 10.2 Reversa por factura cancelada

Si una factura se cancela, la comisión proporcional se reversa automáticamente (BR-N123).

### 10.3 Pago de comisión

- Comisión `pagada` solo cuando Director/admin la transfiere explícitamente
- Default: mensual (día 15 de cada mes)

---

## 11. Orden de Compra del cliente (OC) en OS

**Para clientes gobierno o grandes:**

OS puede tener 4 campos opcionales para OC del cliente:
- `client_po_number`
- `client_po_date`
- `client_po_amount`
- `client_po_file_id` (PDF)

**BR-017:** Si `client_po_amount > 0`, debe coincidir con `sold_total` ±0 y exigir PDF antes de `authorized_to_start`.

---

## 12. Facturación CFDI 4.0 con FacturoPorTi

**Cambio mayor vs propuesta inicial:** el sistema **timbrará** CFDI directamente vía API.

### 12.1 Datos del emisor (la propia empresa)

| Campo | Notas |
|---|---|
| RFC | De la organización |
| Razón social | |
| Régimen fiscal | Código SAT |
| Lugar de expedición (CP) | |
| CSD (.cer + .pem + password) | Encriptado en BD |
| API key de FacturoPorTi | Encriptado en BD |
| Folios autorizados por SAT | Serie + rango |

### 12.2 Datos del receptor (cliente)

| Campo | Notas |
|---|---|
| RFC | Del cliente |
| Uso CFDI default | Del cliente (ej: G03) |
| Régimen fiscal receptor | Código SAT |
| Domicilio fiscal receptor (CP) | |

### 12.3 Proceso

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

### 12.4 Cancelación

```
Motivo SAT (01-04):
- 01: Con relación (nota de crédito)
- 02: Sin relación
- 03: Operación no realizada
- 04: Duplicado
```

---

## 13. Calendario de Facturación (estados visuales)

```
⚪ Pendiente de facturar
📄 Facturada (emitida, no cobrada)
✅ Cobrada (pagada totalmente)
🔴 Vencida (facturada, pasó fecha)
💛 Promesa de pago (cliente dijo "pago el X")
🟠 Disputado (cliente reclama algo)
🟠 Escalated (tras 2 promesas incumplidas)
```

### 13.1 Facturación recurrente (cron)

```
Cada día a las 02:00 AM:
  - Buscar schedules con next_billing_date = hoy
  - Crear invoice (auto o draft, según config)
  - Actualizar next_billing_date
  - Notificar al admin
```

---

## 14. Roles: ninguno hardcoded

**Principio fundamental:**
- ❌ NO hay `if (user.role === 'director')` en el código
- ✅ Hay `if (user.hasPermission('ver_costos'))`
- Todo rol y todo permiso se consulta desde la BD
- El Director puede crear/editar/desactivar roles y permisos

---

## 15. Sub-módulo Cobranza

### 15.1 Calendario visual

```
         Lun    Mar    Mié    Jue    Vie    Sáb    Dom
       ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐
       │  28 │  29 │  30 │  31 │   1 │   2 │   3 │
       │🟡  │🟢  │   │ 🔴  │🟢  │     │     │
       │$45k│$12k│     │$60k│$20k│     │     │
       └─────┴─────┴─────┴─────┴─────┴─────┴─────�
```

### 15.2 Forecast vs Real

```
Esperado:    $820,000
Cobrado:     $340,000 (41%)
Vencido:     $160,000
Por vencer:  $320,000
Proyección:  ~$640,000 al cierre (78%)
```

### 15.3 Ayudas al cobrador

- Plantillas de mensaje (amable, firme, final)
- Historial de actividades de cobranza
- Sistema de promesas con escalación
- Casos urgentes priorizados

---

## 16. Reglas de negocio clave (resumen)

| ID | Regla |
|---|---|
| BR-N01 | Cotización sin vigencia vigente no se acepta |
| BR-N02 | Cotización aceptada es inmutable |
| BR-N03 | 1 cotización → 1 OS → 1 proyecto (MVP) |
| BR-N04 | Técnico no modifica alcance, precios ni comisiones |
| BR-005 | Requerimiento sin criterio no pasa a development |
| BR-006 | Tarea bloqueada requiere motivo |
| BR-007 | Tarea done → checklist completo |
| BR-008 | Horas ≤ 24/día + snapshot costo |
| BR-009 | Test failed requiere resultado + incidencia |
| BR-010 | Entregable accepted requiere nombre + fecha |
| BR-011 | Cambio de alcance no se implementa sin authorized |
| BR-013 | Movimiento reconciled no se edita |
| BR-014 | Cancelar/revertir exige motivo + auditoría |
| BR-016 | Aislamiento por organización |
| BR-017 | OC validada antes de autorizar OS |
| BR-N51 | Cotización requiere spec firmado |
| BR-N52 | Spec firmado inmutable |
| BR-N113 | Módulo deployed requiere 4 checks |
| BR-N114 | Módulo in_progress requiere deps deployed |
| BR-N127 | Roles seed no se eliminan |
| BR-N128 | Director puede crear roles custom |
| BR-N131 | Permisos custom son aditivos |
| BR-N143 | Descuento en cotización: ≤10% libre, 10-25% director, >25% bloqueado |
| **BR-N33 v2** | Comisiones sobre FACTURADO, no sobre COBRADO |
| **BR-N121** | Suscripción requiere cobro inicial antes de autorizar |
| **BR-N123** | Comisiones se reversan si factura se cancela |
| **BR-N148** | Prospecto qualified requiere cuestionario |
| **BR-N149** | Cotización requiere cuestionario_sondeo_id |
| **BR-N168** | Cliente se crea desde prospecto cuando cumple condiciones |

(150+ reglas totales documentadas en `DECISIONES-V1-20260815.md`)

---

## 17. Permisos custom (aditivos)

Un usuario puede tener permisos EXTRA individuales que se suman a los de sus roles.

**Ejemplo:** Un usuario con `[vendedor, lider_proyecto]` normalmente no ve costos. Pero el Director le otorga `ver_costos` como permiso custom individual porque está negociando una comisión especial.

El permiso custom:
- Se otorga por Director
- Es aditivo (nunca quita)
- Se registra en audit_log

---

## 18. Estructura del proyecto (modular)

```
PROYECTO (SaaS para cliente ACME)
  │
  ├─ Módulo: auth (deployed ✅)
  │   - 3 requirements, 8 tasks, 6 tests, 2 deliverables
  │
  ├─ Módulo: clientes (deployed ✅)
  │   - 4 requirements, 7 tasks, 4 tests
  │
  ├─ Módulo: billing (testing 🟡)
  │   - 6 requirements, 10 tasks, 5 tests
  │   - 78% avance
  │
  └─ Módulo: reports (pending ⚪)
      - bloqueado por billing
```

Cada módulo tiene:
- `status`: pending / en_curso / en_pruebas / implementado / pospuesto
- `progress_percent`: 0-100
- `salud`: en_tiempo / en_riesgo / retrasado
- `requiere_modulos[]`: dependencias

---

## 19. JSON Discovery (esquema final)

### 19.1 Discovery (vacío para llenar)

```json
{
  "_meta": {
    "version": "1.0",
    "schema": "vectoria-project-discovery-v1",
    "kind": "discovery",
    "instructions_for_ai": "..."
  },
  "project": {...},
  "scope": {...},
  "project_modules_to_fill": [
    {
      "code": "auth",
      "requirements_to_fill": [],
      "tasks_to_fill": [],
      "tests_to_fill": [],
      "deliverables_to_fill": []
    }
  ]
}
```

### 19.2 Execution (con IDs reales)

```json
{
  "_meta": {
    "kind": "execution",
    "version": "1.3"
  },
  "project_modules": [
    {
      "id": "uuid-real",
      "code": "auth",
      "status": "deployed",
      "progress_percent": 100
    }
  ],
  "requirements": [{"id": "uuid-real", ...}],
  "tasks": [{"id": "uuid-real", "status": "done", "evidence": "..."}],
  "tests": [{"id": "uuid-real", "type": "functional", "status": "passed"}]
}
```

---

## 20. Tests con 7 tipos

| Tipo | Quién ejecuta | Bloquea cierre |
|---|---|---|
| `functional` | Programador, QA | Sí (blocking) |
| `visual` | Diseñador, QA | Sí (blocking) |
| `ui` | QA | Sí (blocking) |
| `acceptance` | Cliente (proxy PL) | Sí (blocking) |
| `performance` | Programador | No (warning) |
| `security` | Programador, auditor | No (warning) |
| `compatibility` | QA | Sí (blocking) |

---

## 21. Permisos configurables vs hardcoded

| Concepto | Donde vive | Quién gestiona |
|---|---|---|
| Roles | Tabla `roles` | Director |
| Permisos | Tabla `permisos` | Director |
| Relación rol → permiso | Tabla `roles_permisos` | Director |
| Relación usuario → rol | Tabla `perfiles_usuario_roles` | Director |
| Permisos custom usuario | Tabla `usuarios_permisos_custom` | Director |
| Verificación en código | `hasPermission(code)` | — |

**Cero hardcode. Todo dato. Todo configurable.**

---

## 22. Próximos pasos

### 22.1 Simulación interactiva (EN PROGRESO)

Estamos validando el sistema paso a paso con el caso "SaaS de facturación interna":

- ✅ PASO 0 · Setup inicial
- ✅ PASO 1 · Llega el prospecto
- ✅ PASO 2 · Vendedor llama + aplica cuestionario
- ✅ PASO 3 · Cliente se crea desde prospecto (auto)
- 🔄 PASO 4-31 · Pendientes

### 22.2 Módulos pendientes

- ✅ Módulo 1 · Autenticación, Organización, Usuarios, Roles
- ✅ Módulo 2 · Clientes + Prospectos
- ✅ Módulo 3 · Comercial
- ✅ Módulo 4 · Proyectos (modular + JSON + tests + meta-sistema)
- ✅ Catálogo de servicios
- ✅ Sub-módulo Cobranza
- ✅ Módulo de Facturación (FacturoPorTi)
- ✅ Plantillas con estructura modular
- ✅ test_cases con 7 tipos
- ✅ Meta-sistema
- ✅ JSON round-trip
- ✅ Simulaciones
- ✅ Traducción a español
- ✅ Roles combinables
- ✅ Cero hardcoding
- 🔄 Módulo 5 · Finanzas completo (énasis para el Director)
- 🔄 Módulo 6 · Administración
- 🔄 Módulo 7 · Hoy / Dashboard

### 22.3 Huecos pendientes (futuro backlog)

23 huecos menores encontrados durante las simulaciones. Se incorporarán en fases futuras.

---

## 23. Glosario (no técnico)

| Término | Significado |
|---|---|
| **Prospecto** | Persona/empresa interesada en comprar, pero aún no compra |
| **Cliente** | Persona/empresa con la que ya hacemos negocios (compró o tiene proyecto activo) |
| **Cotización** | Propuesta formal de venta con precio, vigencia, términos |
| **OS (Orden de Servicio)** | Expediente administrativo de lo vendido |
| **Proyecto** | El trabajo técnico que se ejecuta |
| **Módulo** | Subdivisión de un proyecto (auth, clientes, billing, etc.) |
| **Requerimiento** | Algo que el sistema debe hacer (con criterio de aceptación) |
| **Actividad** | Tarea concreta a realizar (en el tablero) |
| **Test** | Prueba que verifica que algo funciona |
| **Entregable** | Output que se entrega al cliente |
| **Cambio de alcance** | Solicitud de cambio fuera del scope original |
| **Bitácora** | Registro cronológico de eventos del proyecto |
| **Spec** | Especificación técnica-funcional firmada |
| **Levantamiento** | Proceso de capturar los requisitos del cliente |
| **Sondeo** | Cuestionario inicial para entender la necesidad |
| **Comisión** | Pago al vendedor (% de la venta) |
| **CxC** | Cuentas por Cobrar |
| **CxP** | Cuentas por Pagar |
| **Anticipo** | Pago inicial antes de empezar el trabajo |
| **OC** | Orden de Compra del cliente |
| **CFDI** | Comprobante Fiscal Digital por Internet (factura electrónica México) |
| **PAC** | Proveedor Autorizado de Certificación (ej: FacturoPorTi) |
| **CSD** | Certificado de Sello Digital (para timbrar) |
| **RFC** | Registro Federal de Contribuyentes (México) |

---

## 24. Decisiones cerradas (resumen)

### 24.1 Decisiones estructurales (sesión 14-ago, 23 decisiones)

1. ✅ Sistema con 7 módulos + catálogos + plantillas + cuestionarios
2. ✅ Roles NO hardcoded (configurables por Director)
3. ✅ Espera combinación de roles (vendedor + PL)
4. ✅ Cliente se crea desde prospecto (no manualmente)
5. ✅ Spec se firma ANTES de cotizar
6. ✅ Cotización multi-línea (sin "modo 1 línea")
7. ✅ OS con campos OC opcionales
8. ✅ Sin módulo Impuestos formal (ZIP para contador)
9. ✅ Tareas con horas opcionales en MVP
10. ✅ Módulo Facturación CON FacturoPorTi (timbrado real)
11. ✅ Módulo Cobranza separado (no en comercial)
12. ✅ Plantillas con 4 niveles para sistema web
13. ✅ 7 tipos de tests
14. ✅ Estructura modular en plantillas (project_modules)
15. ✅ JSON discovery al FINAL (no round-trip continuo)
16. ✅ Comisiones sobre FACTURADO
17. ✅ Suscripciones con cobro inicial obligatorio
18. ✅ Cuestionarios antes del spec (3 versiones: digital + imprimible + guía)
19. ✅ 14 medios de contacto (llamada, email, whatsapp, etc.)
20. ✅ Cliente se genera automáticamente al calificar prospecto
21. ✅ Tooltips explicativos en configuración
22. ✅ Link de invitación (sin integración WhatsApp)
23. ✅ Sistema de permisos custom aditivos por usuario

### 24.0 Regla de oro (ratificada 17-ago)

> **EL VENDEDOR NO HACE SPEC CON IA. SOLO LLENA EL CUESTIONARIO.**
>
> El spec se **genera automáticamente** por el sistema, con base en:
> - Cuestionario de sondeo completado
> - Servicios del catálogo seleccionados
> - Plantilla del project_type
>
> El PL revisa, ajusta si necesario, y firma. La IA externa (ChatGPT/Atlas) **NO participa** en crear el spec.

**Implicaciones:**
- ❌ Vendedor no va a ChatGPT a generar JSON de spec
- ❌ Vendedor no escribe `alcance_incluido[]` ni `entregables[]`
- ✅ Vendedor solo llena el cuestionario (10 preguntas)
- ✅ Sistema genera spec automáticamente
- ✅ PL revisa y firma

### 24.2 Decisiones tácticas (sesión 17-ago, 23 decisiones)

**Finanzas (4):**

24. ✅ **CxC/CxP**: tabla por defecto + calendario como filtro
25. ✅ **Rentabilidad**: desglosado por técnico (no agregado)
26. ✅ **ZIP contador**: auto al cierre del mes + manual bajo demanda
27. ✅ **Transferencias entre cuentas**: requieren paso explícito (BR-013)

**Hoy / Dashboard (3):**

28. ✅ **Widgets por rol**: configurables por usuario (drag & drop)
29. ✅ **Notificaciones**: solo in-app en MVP (email fase 2)
30. ✅ **Vista**: "Esta semana" como default + "Hoy" como filtro

**Operaciones y políticas (6):**

31. ✅ **SLA cotización**: 48h hábiles para responder
32. ✅ **Cotizaciones por prospecto**: sin límite (advertencia si >5)
33. ✅ **Asignación de tareas**: solo el PL
34. ✅ **Auto-asignación**: técnicos pueden autoasignarse tareas en backlog sin asignar
35. ✅ **Rechazo de tareas**: sí, con motivo obligatorio
36. ✅ **Visibilidad del tiempo**: técnico solo ve el suyo propio

**Post-venta y reembolsos (5):**

37. ✅ **Módulo de soporte post-venta**: NO en MVP (fase 2)
38. ✅ **Reembolso por cancelación**: proporcional al avance + aprobación Director
39. ✅ **Cambios de alcance**: basta email/PDF (no firma digital)
40. ✅ **Descuentos VIP**: NO hay descuentos automáticos (BR-N143)
41. ✅ **ZIP contador**: solo facturas activas (no canceladas)

**Técnico y plataforma (5):**

42. ✅ **Multi-idioma**: solo es-MX en MVP (fase 2)
43. ✅ **Integración con bancos**: NO en MVP (fuera de scope)
44. ✅ **Respaldo BD**: diario, retenido 30 días (BR-N147)
45. ✅ **Comisión rate**: por OS (una sola tasa por OS)
46. ✅ **Cotizaciones aceptadas por prospecto**: solo 1 (BR-N25)

### 24.4 Cuestionarios adaptativos (sesión 17-ago)

47. ✅ **Cuestionario en 4 capas**: base universal + por tipo + por servicio + sub-cuestionarios opcionales
48. ✅ **Rango de preguntas**: 5-32 según complejidad del proyecto
49. ✅ **Todo es predefinible y editable**: las preguntas son datos (no código)
50. ✅ **Preguntas reutilizables por servicio**: 1 vez definidas, aplican a cualquier cuestionario
51. ✅ **Sub-cuestionarios condicionales**: UX/Seguridad/Accesibilidad según flags del cuestionario
52. ✅ **Editor visual para el Director**: drag & drop con vista previa

(Decisiones 47-52 generadas tras observar que 10 preguntas fijas son insuficientes para proyectos complejos)

### 24.3 Total

**52 decisiones cerradas** (23 estructurales + 23 tácticas + 6 sobre cuestionarios adaptativos).

**3 decisiones críticas ratificadas como FUERA DE SCOPE MVP** (Director confirmó explícitamente):
- 🔴 Soporte post-venta
- 🔴 Integración con bancos
- 🔴 Multi-idioma

---

## 25. Lo que falta para tener un MVP funcional

| # | Tarea | Esfuerzo |
|---|---|---|
| 1 | Implementar autenticación (Supabase) | 1 semana |
| 2 | Implementar módulo de clientes | 1 semana |
| 3 | Implementar módulo comercial (prospectos, cotizaciones, OS) | 2 semanas |
| 4 | Implementar módulo de proyectos (estructura modular + JSON) | 3 semanas |
| 5 | Implementar catálogos + plantillas + cuestionarios | 1 semana |
| 6 | Implementar módulo de facturación (FacturoPorTi) | 2 semanas |
| 7 | Implementar módulo de cobranza | 1 semana |
| 8 | Implementar módulo de finanzas | 2 semanas |
| 9 | Implementar administración | 1 semana |
| 10 | Implementar dashboard /hoy | 1 semana |
| 11 | Datos semilla | 1 semana |
| 12 | Pruebas E2E del flujo principal | 1 semana |
| **Total** | | **~17 semanas** |

Con apoyo de IA (vibe coding), probablemente **8-10 semanas**.

---

## 26. Estado del proyecto

**Documentación:** ✅ Completa (este documento + pendientes)
**Diseño de datos:** ✅ Completo (28 entidades definidas)
**Reglas de negocio:** ✅ 150+ reglas documentadas
**Permisos:** ✅ Modelo sin hardcoded
**Decisiones:** ✅ 46 decisiones cerradas (estructurales + tácticas)
**Simulaciones:** ✅ 3 simulaciones + 1 interactiva (pasos 0-3)
**Implementación:** 🔴 No iniciada

**Listo para:** empezar implementación módulo por módulo con IA.
