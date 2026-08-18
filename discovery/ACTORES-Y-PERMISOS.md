# ACTORES-Y-PERMISOS · Vector IA

**Versión:** 2026-08-17 23:20
**Principio rector:** ningún rol ni permiso está hardcoded. Roles, permisos y asignaciones son datos. La verificación se hace vía `hasPermission(code)`.

---

## 1. Roles base (7 combinables)

| Código | Label | Persona ejemplo |
|---|---|---|
| `director` | Director | (cualquier empleado senior) |
| `vendedor` | Vendedor | (cualquier empleado comercial) |
| `administrador` | Administrador | (cualquier empleado administrativo) |
| `lider_proyecto` | Líder de Proyecto | (cualquier empleado técnico senior) |
| `programador` | Programador | (cualquier programador) |
| `disenador` | Diseñador UX/UI | (futuro) |
| `qa` | QA / Tester | (futuro) |

Un usuario puede tener hasta 5 roles simultáneamente.

---

## 2. Permisos de ejemplo (no exhaustivo)

| Código | Descripción |
|---|---|
| `ver_costos` | Ver costos internos (mano de obra, directos, totales) |
| `gestionar_facturas` | Crear, timbrar, cancelar facturas |
| `aprobar_cambios` | Autorizar cambios de alcance |
| `gestionar_proyectos` | Crear y liderar proyectos |
| `asignar_tareas` | Asignar tareas a técnicos |
| `gestionar_miembros_proyecto` | Incorporar o retirar miembros y asignarlos a módulos |
| `revisar_tareas` | Aprobar o devolver tareas en revisión |
| `registrar_tiempo` | Registrar horas en time_entries |
| `ver_auditoria` | Ver la bitácora de auditoría global |
| `firmar_spec` | Firmar un spec para volverlo inmutable |
| `aceptar_cotizacion` | Registrar aceptación de cotización (en nombre del cliente si proxy) |
| `autorizar_os` | Autorizar el inicio de una OS |
| `cobrar` | Registrar y confirmar cobros |
| `pagar_comision` | Marcar comisión como pagada |
| `cerrar_proyecto` | Ejecutar el cierre técnico del proyecto |
| `cerrar_os` | Ejecutar el cierre administrativo de una OS |
| `aprobar_excepcion_cierre` | Autorizar excepcionalmente un gate técnico o financiero |
| `crear_roles_custom` | Crear roles distintos a los seed (BR-N128) |
| `otorgar_permiso_custom` | Otorgar permiso aditivo a un usuario (BR-N131) |

---

## 3. Visibilidad por rol (matriz)

| Recurso / acción | Director | Vendedor | Admin | PL | Programador | Diseñador | QA |
|---|---|---|---|---|---|---|---|
| Prospectos | todos | propios | todos | propios de su proyecto | — | — | — |
| Cotizaciones | todos | propios | todos | las de sus proyectos | — | — | — |
| OS | todas | propias | todas | las de sus proyectos | — | — | — |
| Comisiones | todas | propias | todas | — | — | — | — |
| Precios internos / márgenes | sí | no | sí | no | no | no | no |
| CxC / CxC de otros | sí | no | sí | no | no | no | no |
| Comisiones de otros | sí | no | sí | no | no | no | no |
| Proyecto (general) | todos | los vinculados a sus ventas | todos (read-only) | proyectos donde es líder | proyectos donde es miembro y tiene módulo/tarea asignado | proyectos donde es miembro | proyectos donde es miembro |
| Detalle técnico profundo | sí | no | no (read-only superficial) | sí | sí | sí | sí |
| Tiempo del equipo | sí | — | sí | sí | propio | propio | propio |
| Auditoría | sí | — | sí | — | — | — | — |

---

## 4. Acciones críticas y quién las realiza

| Acción | Quién | Comentario |
|---|---|---|
| Calificar prospecto | Vendedor | BR-N148 requiere cuestionario |
| Aplicar cuestionario de sondeo | Vendedor | 3 versiones (digital / imprimible / guía) |
| Firmar spec | PL | BR-N51, BR-N52; spec se vuelve inmutable |
| Crear cotización | Vendedor | BR-N149 requiere `cuestionario_sondeo_id` |
| Aprobar cotización (con descuento) | Vendedor (≤10%) / Director (10-25%) / bloqueado (>25%) | BR-N143 |
| Registrar aceptación de cotización | Vendedor (en nombre del cliente) | evidencia obligatoria (H-20260817-08) |
| Cobrar anticipo | Administrador | comprobante obligatorio |
| Autorizar inicio de OS | Administrador | BR-017 valida OC si aplica |
| Crear proyecto (workflow atómico) | Sistema | al pasar OS a `authorized_to_start` |
| Incorporar líder técnico al proyecto | Sistema | usa el PL previamente asignado a la OS |
| Incorporar miembros al proyecto | PL | después de la creación y antes de asignar módulos o tareas; DEC-FUN-56 |
| Asignar módulo o tarea | PL | requiere membresía previa; el técnico puede rechazar tarea con motivo |
| Planear/descomponer proyecto en módulos | PL | con apoyo de Director y Programador en JSON Discovery |
| Aprobar importación de JSON Discovery | PL | revisa diferencias; la misma versión no duplica elementos |
| Crear / actualizar módulo | PL | reglas BR-N113/114; vocabulario confirmado por DEC-FUN-47 |
| Registrar tiempo | Técnico (propio) | snapshot del costo/hora al momento |
| Cerrar módulo (`deployed`) | PL | cierre técnico; no exige aceptación final del cliente salvo dependencia explícita |
| Marcar tarea `done` | Técnico asignado | con checklist + evidencia |
| Revisar tarea | PL / QA asignado | aprueba a `done` o devuelve a `in_progress` con observaciones |
| Aprobar y validar requerimiento | PL / PL o QA | aprobación antes de desarrollo; validación después de pruebas |
| Ejecutar test | Programador / QA / Cliente (registrado por proxy PL) | 7 tipos; `not_applicable` requiere aprobación del PL |
| Registrar aceptación del cliente | PL como registrador | identidad, organización, fecha, medio y evidencia obligatorios; PL no es el aceptante |
| Cerrar proyecto (técnico) | PL | sin actividades críticas abiertas, entregables aceptados, pruebas críticas pasadas |
| Aprobar excepción de cierre | Director | motivo, evidencia y auditoría obligatorios |
| Cerrar OS (administrativo) | Administrador | requiere proyecto terminado/cancelado, factura final aplicable emitida y saldo total cero, salvo excepción del Director |
| Facturar (timbrar CFDI) | Administrador | vía FacturoPorTi (decisión ratificada) |
| Registrar cobro | Administrador | con comprobante y aplicación a factura(s) |
| Calcular comisión estimada | Sistema | al aceptar cotización si rate > 0 |
| Liberar comisión | Sistema | BR-N33 v2 sobre facturado |
| Pagar comisión | Director / Administrador | día 15 por default; BR-N123 reversa si factura se cancela |
| Crear roles custom | Director | BR-N128; roles seed no se eliminan (BR-N127) |
| Otorgar permiso custom | Director | BR-N131; aditivo, registrado en audit_log |

---

## 5. Visibilidad y privacidad de los datos

- Toda entidad de negocio lleva `organization_id` (multi-org latente, BR-016).
- Aislamientos por organización + por asignado.
- Permisos custom son siempre aditivos (nunca quitan).
- Cualquier acción crítica (aceptar cotización, autorizar OS, crear proyecto, cerrar OS, facturar, cobrar, pagar comisión) queda registrada en `audit_logs` y, cuando aplica, en `project_log_entries`.

---

## 6. Decisiones de cierre aplicadas

- **Aceptación del cliente:** resuelta por DEC-FUN-55; el PL sólo registra y la evidencia identifica al aceptante real.
- **Asignación de programadores:** resuelta por DEC-FUN-56; el PL incorpora miembros después de crear el proyecto y antes de asignar trabajo.
- **Cierre técnico vs administrativo:** resuelto por DEC-FUN-57; la entrega técnica no depende del pago y la OS se cierra administrativamente con saldo total cero o excepción del Director.
- **Separación de funciones:** los roles son combinables. Cuando una persona actúa con más de un rol, la acción crítica registra el rol funcional utilizado.
