# Simulación Completa del Flujo · Vector IA

**Fecha:** 2026-08-17
**Caso:** SaaS de facturación interna para Estudio García Contadores
**Objetivo:** Validar el flujo completo de los 7 módulos del sistema con todos los actores

---

## Índice

1. [Información del caso](#1-información-del-caso)
2. [Actores (roles)](#2-actores-roles)
3. [Estado inicial](#3-estado-inicial)
4. [Flujo paso a paso (10 pasos)](#4-flujo-paso-a-paso-10-pasos)
5. [Bucle de ejecución de módulos](#5-bucle-de-ejecución-de-módulos)
6. [Decisiones clave del flujo](#6-decisiones-clave-del-flujo)
7. [Validaciones automáticas del sistema](#7-validaciones-automáticas-del-sistema)
8. [Puntos de handoff entre roles](#8-puntos-de-handoff-entre-roles)
9. [Estado final del flujo](#9-estado-final-del-flujo)
10. [Notas para el revisor](#10-notas-para-el-revisor)

---

## 1. Información del caso

**Cliente:** Estudio García Contadores (3 contadores, ~30 clientes)

**Necesidad:** Sistema web interno para:
- Alta de clientes
- Emisión de facturas con PDF (sin timbrado SAT)
- Control de pagos
- Reportes mensuales básicos

**Presupuesto:** $60,000 - $100,000 MXN
**Plazo:** 4 meses (fin de año 2026)

---

## 2. Actores (roles)

Todos los actores se identifican por su **rol**, no por nombre propio. Roles configurables en el sistema (ninguno hardcoded):

| Rol | Función en este caso |
|---|---|
| **Director** | Acceso total, aprueba cotización, cierra OS administrativa |
| **Vendedor** | Crea prospecto, aplica cuestionario, crea cotización, registra aceptación |
| **Líder de Proyecto (PL)** | Firma spec, lidera proyecto, aprueba módulos |
| **Administrador** | Cobra anticipo, autoriza OS, factura, cobra, paga comisiones |
| **Programador** | Ejecuta código, tilda tareas done con evidencia |
| **Cliente** | Externo, no usuario del sistema |

**Nota:** El Vendedor también tiene rol PL en este caso (doble rol). Representa una empresa pequeña donde el dueño comercial también lidera proyectos.

---

## 3. Estado inicial

**Sistema ya configurado** (paso previo, fuera de esta simulación):
- Organización creada
- CSD válido (para facturar CFDI)
- FacturoPorTi conectado
- Catálogo de servicios: 13 items
- Plantillas de proyecto: 9 templates
- Cuestionarios: 6 cuestionarios seed (con 4 capas cada uno)
- Usuarios: 5 (uno por rol base)

---

## 4. Flujo paso a paso (10 pasos)

### PASO 1 · Llega el prospecto
- **Fecha:** 14-ago-2026, 14:00
- **Actor:** Cliente
- **Acción:** Llama al Vendedor por teléfono
- **Mensaje:** "Necesito un sistema pequeño de facturación. Somos 3 contadores, manejamos ~30 clientes, queremos llevar el control de facturas y cobros. Sin SAT (lo hace nuestro contador externo)."

### PASO 2 · Vendedor crea el prospecto
- **Fecha:** 14-ago-2026, 14:15
- **Actor:** Vendedor
- **Pantalla:** `/comercial/prospectos/nuevo`
- **Datos ingresados:**
  - Nombre: "Estudio García Contadores"
  - Servicio de interés: "Sistema Web" (del catálogo)
  - Fuente: "Referido (por ACME)"
  - Asignado a: Vendedor (auto)
  - Resumen: "3 contadores, ~30 clientes, control facturas y cobros"
  - Valor estimado: $80,000
  - Probabilidad: 60%
  - Fecha cierre esperada: 30-sep-2026
  - Próxima acción: "Llamar para entender mejor"
- **Resultado:** Prospecto OP-000001 creado, estado "nuevo"

### PASO 3 · Vendedor aplica cuestionario de sondeo
- **Fecha:** 15-ago-2026, 10:00 - 10:35
- **Actor:** Vendedor
- **Acción:** Llama al Cliente y aplica el cuestionario de sondeo

**Cuestionario aplicado (4 capas):**

**Capa 1 · Base universal (5 preguntas):**
1. ¿Quién será el responsable del proyecto? → "Manolo García (Director general)"
2. ¿Cuál es el plazo deseado? → "4 meses"
3. ¿Cuál es el presupuesto? → "$80,000 MXN"
4. ¿Cómo resuelven hoy el problema? → "Excel y correo compartido"
5. ¿Tienen datos existentes? → "Sí, Excel con 30 clientes"

**Capa 2 · Sistema Web (10 preguntas):**
- 3 usuarios
- ~30 clientes
- 50-100 facturas/mes
- Top 3 funciones: Login/roles + CRUD clientes + Emisión facturas
- Sin integraciones
- Sin portal para clientes
- Sin datos sensibles
- Sin compliance específico
- Sin diseño predefinido
- Manolo aprueba entregables

**Capa 3 · No hay servicios extra** (no seleccionaron hosting/dominio/etc.)

**Capa 4 · No aplica** (no maneja datos sensibles, no es web_app con UX complejo)

**Resultado:**
- Prospecto → estado "calificado"
- Sistema **genera cliente automáticamente** (CLI-000006)
- 3 contactos pre-llenados (Manolo, Ana, Pedro)
- Resumen estructurado generado

### PASO 4 · Sistema genera spec automáticamente
- **Fecha:** 15-ago-2026, 10:36 (automático)
- **Actor:** **SISTEMA** (no requiere intervención)
- **Acción:** El sistema toma el cuestionario + servicios del catálogo + plantilla "Sitio Web" y genera el spec automáticamente

**Inputs del sistema:**
- Cuestionario completado (15 respuestas)
- Servicio seleccionado: "Sitio Web" (no SaaS, solo Sitio Web)
- Plantilla: "Sitio Web - Pequeño" (3 módulos: auth, clientes, facturación)

**Outputs del sistema (generados automáticamente):**
- Spec borrador con alcance_incluido, alcance_excluido, entregables, supuestos, dependencias_cliente, criterios_aceptacion
- 3 modulos_proyecto (auth, clientes, facturación)
- ~15 requirements
- ~25 tasks
- ~12 casos de prueba
- 3 entregables

**Importante:** El Vendedor NO escribió este spec. El sistema lo generó automáticamente con base en el cuestionario + catálogo + plantilla.

### PASO 5 · PL revisa y firma el spec
- **Fecha:** 15-ago-2026, 11:00
- **Actor:** **Líder de Proyecto**
- **Pantalla:** `/especificaciones/ESP-000001`
- **Acción:** Revisa el spec auto-generado y lo ajusta ligeramente
  - Agrega detalle específico sobre "emisión de facturas sin timbrar SAT"
  - Ajusta restricción: "El sistema NO necesita integración con SAT porque el contador externo lo maneja"
- **Acción:** Click "Firmar spec"
- **Resultado:**
  - Spec firmado (inmutable)
  - Estado: firmado
  - BR-N52 activado: contenido no se puede modificar

### PASO 6 · Vendedor crea cotización
- **Fecha:** 15-ago-2026, 14:00
- **Actor:** **Vendedor**
- **Pantalla:** `/comercial/cotizaciones/nueva`
- **Acción:** Crea cotización desde spec firmado

**Items auto-pre-llenados:**
- Módulo Auth: 30h × $1,500/h = $45,000
- Módulo Clientes: 25h × $1,500/h = $37,500
- Módulo Facturación: 60h × $1,500/h = $90,000
- Despliegue: 4h × $1,500/h = $6,000
- Capacitación: 2h × $1,500/h = $3,000
- Manual de usuario: 6h × $1,500/h = $9,000

**Cálculos:**
- Subtotal: $190,500
- Descuento: 5% (límite 10% libre): -$9,525
- Subtotal final: $180,975
- IVA 16%: $28,956
- **TOTAL: $209,931**

**Condiciones:**
- Vigencia: 7 días (cumple BR-N mínimo)
- Tipo de cobro: `un_pago`
- Anticipo: 50% = $104,966
- Comisión vendedor: 8% = $14,394 (estimada)

**Resultado:** Cotización COT-000001 estado "borrador"

### PASO 7 · Director aprueba cotización
- **Fecha:** 15-ago-2026, 15:00
- **Actor:** **Director**
- **Pantalla:** `/comercial/cotizaciones/COT-000001`
- **Acción:** Aprueba y marca como enviada
- **Resultado:**
  - COT-000001 → estado "enviada"
  - Vendedor notificado

### PASO 8 · Cliente acepta + Vendedor registra
- **Fecha:** 16-ago-2026, 09:00 (el cliente llama al día siguiente)
- **Actor:** Cliente acepta verbalmente
- **Actor:** Vendedor registra la aceptación
- **Pantalla:** `/comercial/cotizaciones/[id]/aceptar`
- **Modal de aceptación:**
  - Aceptado por nombre: "Manolo García"
  - Aceptado en: 16-ago-2026 09:00
  - Evidencia: sube captura de WhatsApp (PDF)
  - Notas: "Cliente confirma 50% anticipo, resto al entregar"
- **Resultado:**
  - COT-000001 → estado "aceptada", LOCKED (inmutable)
  - OS-000001 creada automáticamente
  - Prospecto OP-000001 → estado "ganada"
  - Comisión COM-000001 creada: $14,394 estimada

### PASO 9 · Administrador cobra anticipo y autoriza OS
- **Fecha:** 16-ago-2026, 14:00
- **Actor:** **Administrador**
- **Acciones:**

**9.1 · Registra cobro de anticipo**
- Pantalla: `/comercial/cobros/nuevo`
- Cliente transfiere $104,966
- Administrador registra:
  - Monto: $104,966
  - Cuenta: BBVA
  - Método: transferencia
  - Referencia: "SPEI 1234567"
  - Comprobante: PDF
  - Aplica a factura de anticipo
- Click "Guardar" → estado: registrado
- Click "Confirmar cobro" → estado: confirmado
- **Sistema ejecuta:**
  - financial_transaction tipo=ingreso creada
  - Factura → estado: pagada
  - Comisión: liberada += 8% × ($104,966 / $209,931) × $14,394 = ~$7,200

**9.2 · Autoriza inicio de OS**
- Pantalla: `/comercial/ordenes/OS-000001`
- Click "Autorizar inicio"
- Modal verifica precondiciones:
  - ✅ Anticipo cobrado (≥ 90% del requerido)
  - ✅ Líder técnico asignado (PL)
  - ✅ Sin OC del cliente (no aplica)
- Confirma
- **Sistema ejecuta workflow atómico project_creation:**
  - **Proyecto PRY-000001 creado**
  - Snapshot del scope copiado
  - PL agregado como project_member con project_role=lider
  - OS-000001 → status: en_ejecucion
  - log_entry creado

### PASO 10 · PL inicia discovery + Director/Programador trabajan
- **Fecha:** 16-ago-2026, 16:00
- **Actor:** **Líder de Proyecto**
- **Acción:** Abre `/proyectos/PRY-000001/discovery` y descarga JSON-discovery-v0

**Importante:** El JSON Discovery es para **descomponer** el proyecto en módulos/tareas/tests. NO para crear el spec (eso ya está generado automáticamente).

**Acciones posteriores (round-trip JSON):**
- **Director** (Atlas) revisa y mejora JSON-v0
- **Programador** (VS Code) trabaja en tareas específicas
- **PL** revisa y aprueba al final

---

## 5. Bucle de ejecución de módulos

### Estructura modular del proyecto

PRY-000001 tiene 3 módulos del template "Sitio Web":

```
PRY-000001
├─ 🟢 auth         (después)         → modulo simple
├─ 🟢 clientes     (después)         → modulo medio
└─ 🟢 facturación  (después)         → modulo complejo
```

### Por cada módulo

```
1. PL marca módulo como "en_curso"
   ↓
2. Programador trabaja en tasks del módulo
   - Marca tasks como "in_progress"
   - Registra tiempo
   - Sube evidencia (screenshots, commits)
   - Marca tasks como "done" (con checklist completo)
   ↓
3. Programador ejecuta tests del módulo
   - Tests funcionales: passing
   - Tests visuales: passing (con screenshots)
   - Tests de aceptación: pendientes del cliente
   ↓
4. PL revisa módulo y verifica 4 checks:
   - ✅ Requerimientos validados
   - ✅ Actividades con evidencia
   - ✅ Tests passing
   - ✅ Entregables aceptados
   ↓
5. PL marca módulo como "implementado"
   ↓
6. Si hay siguiente módulo, PL lo inicia
```

### Cronograma estimado

| Módulo | Inicio | Fin | Duración |
|---|---|---|---|
| auth | 17-ago | 30-ago | 2 semanas |
| clientes | 31-ago | 20-sep | 3 semanas |
| facturación | 21-sep | 25-oct | 5 semanas |
| Testing E2E + cierre | 26-oct | 15-nov | 3 semanas |

---

## 6. Decisiones clave del flujo

### Decisiones del Vendedor (paso 2-3)

- Servicio de interés: "Sistema Web" (correctamente identifica que es web, no SaaS completo)
- 5% de descuento (dentro del 10% libre, no requiere aprobación Director)
- Comisión 8% (tasa estándar)

### Decisiones del PL (paso 5)

- Firmar spec (no requiere aprobación Director porque es el responsable técnico)
- Ajustar spec auto-generado con detalles específicos del cliente

### Decisiones del Director (paso 7)

- Aprobar cotización (la aprueba porque el descuento está dentro del límite)
- (El Director NO participa en cada paso de ejecución, solo en decisiones estratégicas)

### Decisiones del Administrador (paso 9)

- Confirmar cobro antes de autorizar OS (es el paso de control)
- Autorizar inicio cuando se cumplen precondiciones (sistema valida automáticamente)

### Decisiones que NO se tomaron

- ❌ El Vendedor NO decidió el spec (lo generó el sistema)
- ❌ El Vendedor NO fue a ChatGPT a generar el spec
- ❌ El PL no creó el spec desde cero (lo generó el sistema)

---

## 7. Validaciones automáticas del sistema

El sistema ejecuta validaciones automáticas en cada paso. Lista de validaciones críticas:

### BR-N51 · Spec firmado requerido para cotizar
- Validada en: paso 6 (crear cotización)
- Estado: ✅ pasó (spec ESP-000001 firmado)

### BR-N52 · Spec firmado es inmutable
- Validada en: después del paso 5
- Estado: ✅ activado (contenido no se puede modificar)

### BR-N02 · Cotización aceptada inmutable
- Validada en: paso 8 (aceptación)
- Estado: ✅ activado

### BR-001 · Cotización sin vigencia no se acepta
- Validada en: paso 8
- Estado: ✅ pasó (vigencia: 16-ago a 23-ago, aceptación 16-ago)

### BR-005 · Requerimiento sin criterio no pasa a development
- Validada en: paso 10+ (durante ejecución)
- Estado: ✅ todos los requirements tienen acceptance_criteria

### BR-006 · Tarea bloqueada requiere motivo
- Validada en: durante ejecución de módulos
- Estado: ✅ aplicable

### BR-007 · Tarea done requiere checklist completo
- Validada en: durante ejecución de módulos
- Estado: ✅ aplicable

### BR-008 · Horas ≤ 24/día + snapshot costo/hora
- Validada en: time_entries
- Estado: ✅ aplicable

### BR-N113 · Módulo deployed requiere 4 checks
- Validada en: al marcar módulo como implementado
- Estado: ✅ aplicable

### BR-N114 · Módulo in_progress requiere deps deployed
- Validada en: al iniciar módulo
- Estado: ✅ clientes depende de auth, facturación depende de clientes

### BR-N33 v2 · Comisión sobre FACTURADO, no sobre COBRADO
- Validada en: cada confirmación de cobro
- Estado: ✅ la comisión se libera al facturar

### BR-N143 · Descuento ≤10% libre, 10-25% con director, >25% bloqueado
- Validada en: paso 6
- Estado: ✅ 5% está libre

### BR-N148 · Prospecto qualified requiere cuestionario
- Validada en: paso 3
- Estado: ✅ pasó (cuestionario completado)

### BR-N149 · Cotización requiere cuestionario_sondeo_id
- Validada en: paso 6
- Estado: ✅ vinculado

### BR-N168 · Cliente se crea desde prospecto cuando cumple condiciones
- Validada en: paso 3
- Estado: ✅ ejecutado (CLI-000006 creado)

---

## 8. Puntos de handoff entre roles

| # | Handoff | De → A | Momento | ¿Qué pasa? |
|---|---|---|---|---|
| **1** | Vendedor → Director | Vendedor → Director | Después del paso 6 (cotización creada) | Director aprueba cotización |
| **2** | Cliente → Vendedor | Cliente → Vendedor | Paso 8 (aceptación) | Cliente acepta → Vendedor registra |
| **3** | Vendedor → Administrador | Vendedor → Administrador | Después del paso 8 (OS creada) | Administrador cobra anticipo |
| **4** | Administrador → Sistema | Administrador → Sistema | Paso 9.2 (autorización) | Sistema crea proyecto automáticamente |
| **5** | PL → Sistema | PL → Sistema | Paso 10 (inicio discovery) | Sistema genera JSON-v0 |
| **6** | Programador → PL | Programador → PL | Cada task done | PL revisa y aprueba módulo |

**Cada handoff queda registrado en:**
- audit_logs (global)
- project_log_entries (por proyecto)

---

## 9. Estado final del flujo

```
Cliente:        CLI-000006 · Estudio García Contadores (activo)
Prospecto:       OP-000001 · ganado → vinculado a CLI-000006
Spec:           ESP-000001 · firmado (inmutable)
Cotización:     COT-000001 · aceptada, locked
OS:             OS-000001 · en_ejecucion → cerrado
Proyecto:       PRY-000001 · 3 módulos (auth, clientes, facturación)
Comisiones:     COM-000001 · estimada $14,394, liberada según facturado
Facturas:       FAC-000001 (anticipo) · pagada
                FAC-000002 (final) · por emitir
CxC:           parcial → $0 al cierre
Rentabilidad:   documentada en módulo Finanzas
```

### Métricas finales

- **Tiempo total:** ~3 meses (14-ago a 15-nov)
- **Horas invertidas:** ~127h estimadas (auth 30 + clientes 25 + facturación 60 + extras 12)
- **Costo laboral:** ~$190,500 ($250/h promedio × 127h con snapshot)
- **Costo directo:** ~$0 (sin gastos externos)
- **Costo total:** ~$190,500
- **Vendido:** $209,931
- **Margen bruto:** ~$19,431 (9.3%)
- **Comisión pagada al vendedor:** ~$14,394

---

## 10. Notas para el revisor

Si estás revisando esta simulación, busca inconsistencias en:

1. **¿El Vendedor hace cosas técnicas?** — NO debería. El spec se genera automáticamente.
2. **¿El Vendedor va a ChatGPT?** — NO. Solo PL/Director/Programador.
3. **¿Los roles respetan su visibilidad?** — El Vendedor NO ve costos/márgenes.
4. **¿El flujo se cierra completamente?** — ¿Falta algún paso?
5. **¿Hay pasos que nadie ejecuta?** — Cada acción tiene un actor asignado.
6. **¿Las validaciones del sistema son suficientes?** — ¿Faltan reglas críticas?
7. **¿Los handoff entre roles son claros?** — ¿Hay ambigüedad sobre quién pasa qué a quién?
8. **¿El orden de los módulos es correcto?** — auth → clientes → facturación es el flujo natural.
9. **¿El cierre técnico y administrativo se diferencia?** — Sí, dos roles diferentes.
10. **¿La comisión se calcula correctamente?** — Sobre facturado, no sobre cobrado.

**Inconsistencias conocidas:**
- En la realidad, los módulos de auth y clientes podrían solaparse (no son 100% secuenciales)
- El testing E2E final puede tomar más o menos tiempo según complejidad
- Los tiempos son estimados; un proyecto real tendría más incertidumbre

**Sugerencias para mejorar la simulación:**
- Añadir un caso donde un cambio de scope ocurre a mitad del proyecto
- Añadir un caso donde el cliente no paga a tiempo
- Añadir un caso donde un técnico renuncia durante el proyecto
