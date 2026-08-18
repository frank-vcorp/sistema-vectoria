# FLUJOS-FUNCIONALES · Vector IA

**Versión:** 2026-08-17
**Convención:** los flujos se describen en lenguaje natural, sin tablas físicas ni endpoints. Los estados se referencian por nombre, no por valor de enum (queda pendiente la unificación de vocabulario — ver HALLAZGOS H-20260817-01).

---

## 1. Flujo principal (happy path, alto nivel)

```
Prospecto
  → Cuestionario de sondeo
  → Spec (generado por el sistema, revisado y firmado por PL)
  → Cotización (multi-línea)
  → Aceptación de cotización (con evidencia)
  → Orden de Servicio creada
  → Cobro de anticipo
  → Autorización de inicio de OS
  → Proyecto creado (workflow atómico, con snapshot del scope)
  → Descomposición en módulos (JSON Discovery)
  → Ejecución módulo por módulo (tareas → tests → entregables)
  → Cambios de alcance (si los hay)
  → Cierre técnico del proyecto
  → Factura final
  → Cobro final
  → Cierre administrativo de la OS
```

---

## 2. Estados de la Oportunidad / Prospecto

`nuevo → contactado → calificado → discovery_requerimientos → cotizacion_enviada → negociacion → ganado | perdido | suspendido`

- **Calificado (BR-N148):** requiere cuestionario completado.
- **Ganado:** transición automática al aceptar cotización.
- **Perdido:** requiere motivo.
- **Cliente creado (BR-N168):** automático al calificar, si cumple condiciones.

---

## 3. Estados del Spec

`borrador → en_revision → firmado (inmutable)`

- Una vez firmado (BR-N52) no se puede modificar.
- Cambios posteriores se registran como Solicitudes de Cambio de Alcance, no editan el spec.

---

## 4. Estados de la Cotización

`borrador → revision_interna → enviada → negociacion → aceptada | rechazada | vencida | cancelada`

- **Aceptada:** transición a OS en workflow atómico. Inmutable (BR-N02).
- **Rechazada:** registra motivo.
- **Vencida:** transición automática cuando pasa la `valid_until`.

---

## 5. Estados de la Orden de Servicio

`pendiente_anticipo → pendiente_informacion → autorizada_para_iniciar → en_ejecucion → entregada → cerrada` (laterales: `pausada`, `cancelada`)

- **pendiente_información:** falta OC (BR-017) o datos fiscales.
- **autorizada_para_iniciar:** precondiciones validadas (anticipo cobrado, OC validada si aplica, líder técnico).
- **en_ejecucion:** proyecto creado, snapshot del scope copiado.
- **entregada:** proyecto técnicamente cerrado, sin saldo pendiente.
- **cerrada:** OS cerrada administrativamente; sin saldo vencido salvo autorización dirección.

---

## 6. Estados del Proyecto

`planning → development → testing → client_validation → delivery` (situación: `pending | active | paused | completed | cancelled`; salud: `on_track | at_risk | delayed`)

- **planning:** spec firmado, OS autorizada, descomposición inicial pendiente.
- **development:** módulos en curso.
- **testing:** módulos en `testing` o `deployed` con pruebas pendientes.
- **client_validation:** entregables presentados al cliente (proxy PL).
- **delivery:** entregables aceptados.

### 6.1 Estados de un módulo de proyecto

⚠️ **Vocabularios pendientes de unificación** (H-20260817-01). Propuesta ATLAS:
`pending → in_progress → testing → deployed` (+ laterales `paused`, `blocked`, `cancelled`)

- **pending:** creado desde plantilla, no iniciado.
- **in_progress:** PL lo marca al iniciar (BR-N114: requiere `depends_on_modules` `deployed`).
- **testing:** tareas completas, ejecutando tests.
- **deployed:** BR-N113: 4 checks (reqs validados, actividades con evidencia, tests passing, entregables aceptados).
- **paused / blocked / cancelled:** laterales.

### 6.2 Reglas de avance

- BR-N114: módulo `in_progress` requiere deps `deployed`.
- BR-N113: módulo `deployed` requiere 4 checks.

---

## 7. Estados de una Tarea

`backlog → ready → in_progress → blocked → in_review → done` (cancelable)

- **done** requiere checklist completo (BR-007) y, opcionalmente, tiempo registrado.
- **blocked** requiere motivo (BR-006).
- Asignación por PL; técnico puede autoasignarse del backlog sin asignar (táctica 34).

---

## 8. Estados de un Test

`pending → passed | failed | blocked | not_applicable`

- 7 tipos (functional, visual, ui, acceptance, performance, security, compatibility).
- Sólo functional, visual, ui, acceptance y compatibility bloquean el cierre (H-20260817-08 — `acceptance` requiere trazabilidad del registrador).
- failed requiere resultado + incidencia (BR-009).

---

## 9. Estados de un Entregable

`pending → preparing → delivered → observed → corrected → accepted | rejected`

- `accepted` requiere nombre del aceptante + fecha (BR-010).
- Comentarios del cliente en cada estado.

---

## 10. Estados de un Cambio de Alcance (Change Request)

`solicitado → analisis → cotizado → autorizado | rechazado → implementado | cancelado`

- Sin `authorized` no se implementa (BR-011).
- Si requiere cobro adicional: nueva cotización vinculada antes de autorizar.
- Actualiza `scope_version` y bitácora sin alterar el scope firmado.

---

## 11. Estados de una Factura

`draft → issued → partially_paid → paid` (laterales: `overdue`, `cancelled`)

- `overdue`: emitida con `due_date` vencida y saldo > 0.
- `cancelled`: con motivo SAT (01-04), reversa aplicaciones (BR-123).
- Pago vía `payment_allocations`; la suma de aplicaciones no supera el cobro ni el saldo de la factura.

---

## 12. Estados de un Cobro (Payment)

`registered → confirmed → reversed`

- `registered`: cobro capturado.
- `confirmed`: financial_transaction de ingreso creada, factura recalculada.
- `reversed`: corrige errores vía `reversed_payment_id`.

---

## 13. Estados de una Comisión

`estimada → devengada → liberada → pagada` (lateral: `cancelled`)

- **estimada:** al aceptar cotización con rate > 0.
- **liberada (BR-N33 v2):** `estimada × Σ(facturas NO canceladas) / total_OS`.
- **pagada:** Director/admin la transfiere explícitamente.
- BR-N123: si la factura se cancela, la comisión proporcional se reversa.

---

## 14. Estados de un Movimiento Financiero

`draft → confirmed → reconciled` (laterales: `cancelled`, `reversed`)

- reconciled no se edita (BR-013).
- Reverso siempre con motivo y auditoría (BR-014).

---

## 15. Handoffs clave (resumen)

| # | Handoff | De → A | Momento |
|---|---|---|---|
| 1 | Vendedor → Director | V → D | Cotización con descuento > 10% requiere aprobación |
| 2 | Cliente → Vendedor | Cliente → V | Aceptación verbal/correo (registrada con evidencia) |
| 3 | Vendedor → Administrador | V → A | OS creada → cobro de anticipo |
| 4 | Administrador → Sistema | A → S | Autorización → workflow atómico project_creation |
| 5 | PL → Sistema | PL → S | Inicio de discovery → JSON-v0 |
| 6 | Programador → PL | Prog → PL | Cada task done / módulo `deployed` |
| 7 | PL → Cliente (proxy) | PL → C | Entregables para validación |
| 8 | Cliente (proxy) → PL | C → PL | Aceptación / observaciones (trazabilidad de registrador) |
| 9 | PL → Administrador | PL → A | Cierre técnico → factura final |
| 10 | Administrador → Director | A → D | Cierre administrativo + pago de comisiones |

---

## 16. Workflow atómico: creación de proyecto

**Trigger:** OS pasa a `autorizada_para_iniciar`.
**Precondiciones:**
- Spec firmado.
- Anticipo cumplido (o autorización de dirección).
- Líder técnico asignado.
- No existe proyecto para la OS.

**Acciones atómicas:**
1. Crear `project` con snapshot inmutable del scope.
2. Copiar entregables base.
3. Agregar al PL como `project_member` con `project_role=lider`.
4. Cargar plantilla seleccionada si existe.
5. Actualizar OS a `en_ejecucion`.
6. Crear entrada de bitácora.

⚠️ **Hallazgo:** este workflow no asigna programadores. Pendiente definir (H-20260817-10).
