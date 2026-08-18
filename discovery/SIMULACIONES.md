# SIMULACIONES · Vector IA

**Versión:** 2026-08-17 23:20

---

## SIM-20260817-01 · SaaS de Facturación Interna

**Ruta:** `discovery/simulations/SIMULACION-FLUJO-COMPLETO-20260817.md`
**Estado:** `AUDITADA_CON_HALLAZGOS`
**Uso:** evidencia histórica; no usar como contrato vigente.

Hallazgos principales:

- Mezcló precio cotizado con costo interno.
- Reaplicó el porcentaje de comisión.
- Omitió factura y cobro finales.
- Colapsó cierre técnico y administrativo.
- No acreditó aceptación final ni asignación del equipo.

Los errores se conservan sin modificar para mantener trazabilidad.

---

## SIM-20260817-02 · Flujo funcional de Proyectos

**Ruta:** `discovery/simulations/SIMULACION-FLUJO-PROYECTOS-20260817.md`
**Estado:** `VALIDADA_FUNCIONALMENTE`
**Fuente:** FUNCTIONAL-BASELINE v1.0 y DEC-FUN-53 a DEC-FUN-60.

Cobertura:

- Happy path desde cuestionario hasta cierre administrativo.
- Autoridad entre alcance, plantilla y JSON.
- Incorporación del equipo.
- Rechazo, bloqueo y revisión de tareas.
- Pruebas bloqueantes y advertencias.
- Aceptación del cliente con evidencia.
- Entregable observado y corregido.
- Cambios con y sin costo.
- Cierre técnico con saldo pendiente.
- Excepción del Director y cancelación.

**Resultado:** todos los escenarios tienen actor, precondición, evidencia, transición y salida. El flujo de Proyectos queda funcionalmente listo para INTEGRA.
