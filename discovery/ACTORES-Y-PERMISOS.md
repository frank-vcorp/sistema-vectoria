# ACTORES-Y-PERMISOS · Vector IA

**Versión:** 2026-08-17
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
| `registrar_tiempo` | Registrar horas en time_entries |
| `ver_auditoria` | Ver la bitácora de auditoría global |
| `firmar_spec` | Firmar un spec para volverlo inmutable |
| `aceptar_cotizacion` | Registrar aceptación de cotización (en nombre del cliente si proxy) |
| `autorizar_os` | Autorizar el inicio de una OS |
| `cobrar` | Registrar y confirmar cobros |
| `pagar_comision` | Marcar comisión como pagada |
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
| Proyecto (general) | todos | los suyos | todos (read-only) | sus proyectos | sus proyectos (módulos asignados) | sus proyectos | sus proyectos |
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
| Asignar líder técnico a proyecto | Sistema (en automático) | ⚠️ Asignación de programadores no automatizada (H-20260817-10) |
| Planear/descomponer proyecto en módulos | PL | con apoyo de Director y Programador en JSON Discovery |
| Crear / actualizar módulo | PL | reglas BR-N113/114 (vocabulario a unificar) |
| Registrar tiempo | Técnico (propio) | snapshot del costo/hora al momento |
| Cerrar módulo (`deployed`) | PL | requiere 4 checks |
| Marcar tarea `done` | Técnico asignado | con checklist + evidencia |
| Ejecutar test | Programador / QA / Cliente (proxy PL) | 7 tipos |
| Cerrar proyecto (técnico) | PL | sin actividades críticas abiertas, entregables aceptados, pruebas críticas pasadas |
| Cerrar OS (administrativo) | Administrador / Director | requiere proyecto terminado o cancelado y sin saldo vencido (salvo autorización dirección) |
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

## 6. Lo que NO está definido y requiere a Frank

- **Aceptación del cliente vía proxy PL:** falta definir cómo se exige contacto, evidencia, fecha y trazabilidad de que el PL actúa como **registrador**, no como quien acepta. (H-20260817-08)
- **Asignación de programadores:** el flujo atómico de creación de proyecto sólo agrega al PL. No está definido quién ni cuándo asigna programadores a un módulo. (H-20260817-10)
- **Cierre técnico vs cierre administrativo:** falta separar explícitamente la terminación técnica del proyecto del cierre administrativo de la OS. (H-20260817-14)
