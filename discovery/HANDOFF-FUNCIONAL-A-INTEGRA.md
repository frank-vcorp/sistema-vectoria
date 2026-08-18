# FUNCTIONAL-HANDOFF · ATLAS → INTEGRA

**Sistema:** Vector IA Administración
**Fecha:** 2026-08-17
**Estado:** `READY`
**Fuente canónica:** `discovery/FUNCTIONAL-BASELINE.md` v1.0
**Gate:** cero preguntas funcionales bloqueantes y cero contradicciones P0 vigentes.

---

## 1. Objetivo del handoff

Entregar a INTEGRA el “qué” y el “por qué” funcionales para que defina el “cómo” técnico mediante ADR y SPEC, sin reinterpretar decisiones de producto.

ATLAS no diseñó arquitectura, endpoints, tablas, schemas, stack ni código.

---

## 2. Problema y resultado esperado

Vector IA debe controlar de extremo a extremo el proceso de una empresa pequeña de software:

`prospección → descubrimiento → alcance firmado → cotización → OS → proyecto → facturación → cobro → rentabilidad y cierre`

El resultado esperado es trazabilidad entre lo vendido, lo ejecutado, lo entregado y lo financiero, con responsabilidades y evidencias claras.

---

## 3. Alcance

### Incluido

- Usuarios, roles y permisos configurables.
- Prospectos, clientes y cuestionarios.
- Catálogo, plantillas y alcance funcional firmado.
- Cotización multi-línea y Orden de Servicio.
- Proyectos modulares y JSON Discovery.
- Requerimientos, tareas, pruebas, entregables y cambios de alcance.
- Facturación CFDI con FacturoPorTi.
- Cobranza, pagos, comisiones y finanzas.
- Dashboard, administración, bitácora y auditoría.

### Excluido del MVP

- Soporte postventa.
- Integración bancaria.
- Multi-idioma.
- Notificaciones externas por email/WhatsApp.
- Portal de cliente.
- Firma electrónica certificada de cambios.

---

## 4. Paquete funcional obligatorio

| Artefacto | Uso por INTEGRA |
|---|---|
| `FUNCTIONAL-BASELINE.md` | Fuente funcional canónica |
| `DECISIONES-FUNCIONALES.md` | 60 decisiones confirmadas |
| `REGLAS-DE-NEGOCIO.md` | 231 reglas confirmadas con ID único |
| `ACTORES-Y-PERMISOS.md` | Autorización y visibilidad funcional |
| `FLUJOS-FUNCIONALES.md` | Máquinas de estado y handoffs |
| `SIMULACIONES.md` | Índice de cobertura |
| `simulations/SIMULACION-FLUJO-PROYECTOS-20260817.md` | Escenarios vigentes de Proyectos |
| `HALLAZGOS.md` | Conflictos históricos y resolución |
| `PREGUNTAS-ABIERTAS.md` | Q-NB-3 diferida |

No usar para contratos vigentes:

- JSON de `archive/borradores-mixtos/`.
- Sesiones históricas como autoridad superior al baseline.
- Simulación original `SIM-20260817-01` como caso válido.

---

## 5. Decisiones críticas de Proyectos

| ID | Decisión vinculante |
|---|---|
| DEC-FUN-47 | Estados del módulo |
| DEC-FUN-53 | Plantilla seleccionada explícitamente y confirmada por PL |
| DEC-FUN-54 | Alcance firmado manda; plantilla es esqueleto; JSON es plan derivado |
| DEC-FUN-55 | PL registra aceptación; cliente real queda identificado con evidencia |
| DEC-FUN-56 | PL incorpora miembros y después asigna módulos/tareas |
| DEC-FUN-57 | Cierre técnico, entrega y cierre administrativo son eventos distintos |
| DEC-FUN-58 | Etapa, situación y salud del Proyecto son dimensiones independientes |
| DEC-FUN-59 | `deployed` es cierre técnico del módulo, no aceptación final del cliente |
| DEC-FUN-60 | Flujos de revisión, pruebas, entregables y cambios quedan cerrados |

Reglas especialmente relacionadas: BR-N113/114, BR-N230, BR-N249, BR-N253/259, BR-N268/274, BR-N283/291, BR-N375/398.

---

## 6. Invariantes funcionales que la solución técnica debe preservar

1. Una cotización aceptada genera una OS y una OS genera un Proyecto en el MVP.
2. El alcance firmado nunca se modifica.
3. Sólo un change request autorizado modifica el alcance efectivo.
4. Reimportar la misma versión de JSON no duplica el plan.
5. Nadie recibe trabajo sin pertenecer primero al Proyecto.
6. Una tarea no termina sin checklist, evidencia y revisión.
7. El PL registra la aceptación; no suplanta al cliente.
8. `deployed` no espera aceptación final salvo dependencia explícita.
9. Cierre técnico coloca Proyecto completado y OS entregada.
10. Cierre administrativo exige saldo total cero o excepción del Director.
11. Toda excepción conserva actor, motivo y evidencia.
12. Roles combinables no eliminan la trazabilidad del rol usado en cada acción crítica.

---

## 7. Flujos y escenarios que deben quedar cubiertos por SPEC

### Flujos

- FLOW-COM-01: cuestionario → alcance → cotización → OS.
- FLOW-OS-01: anticipo/información → autorización → Proyecto.
- FLOW-PROJ-01: creación → planeación → desarrollo → pruebas → validación → entrega.
- FLOW-PROJ-02: incorporación y asignación del equipo.
- FLOW-PROJ-03: JSON Discovery versionado.
- FLOW-PROJ-04: cambio de alcance.
- FLOW-PROJ-05: cierre técnico → OS entregada → cierre administrativo.

### Escenarios mínimos

- SCN-PROJ-01: tarea rechazada.
- SCN-PROJ-02: bloqueo recuperable.
- SCN-PROJ-03: revisión rechazada.
- SCN-PROJ-04: prueba bloqueante fallida.
- SCN-PROJ-05: entregable observado y corregido.
- SCN-PROJ-06/07: cambio con y sin costo.
- SCN-PROJ-08: cierre técnico con saldo pendiente.
- SCN-PROJ-09: excepción del Director.
- SCN-PROJ-10: cancelación y reembolso.

---

## 8. Pregunta diferida

**Q-NB-3 · Desviación contra presupuesto declarado**

No bloquea Proyectos. Si una SPEC de Comercial requiere automatizar advertencia o bloqueo, INTEGRA debe emitir `DISCOVERY-GAP` a ATLAS/Frank. Queda prohibido seleccionar silenciosamente una política.

---

## 9. Instrucción a INTEGRA

- Puede comenzar ADR/SPEC técnicas.
- Debe citar IDs DEC, BR, FLOW y SCN aplicables en cada criterio.
- Puede decidir estructuras técnicas reversibles dentro de su rol.
- No puede cambiar estados, actores, gates, evidencias ni autoridad de artefactos sin `DISCOVERY-GAP`.
- Si detecta otra contradicción funcional, detiene sólo la SPEC afectada y la devuelve a ATLAS/Frank; no reescribe discovery.

---

## 10. Orden funcional sugerido de consumo

1. Identidad, roles y permisos.
2. Clientes y Comercial.
3. Orden de Servicio.
4. Proyectos, comenzando por estados y autoridad de artefactos.
5. Facturación y Cobranza.
6. Finanzas, Dashboard y Administración.

INTEGRA decide la división técnica final y las dependencias entre SPECs.

---

## 11. Resultado del gate

`FUNCTIONAL_HANDOFF_ACCEPTABLE = YES`

Motivo: fuente única sincronizada, decisiones y reglas con ID, Proyectos con flujo completo, escenarios de excepción cubiertos, ninguna pregunta bloqueante y límites de rol respetados.
