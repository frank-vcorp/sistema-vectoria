# SIMULACIONES · Vector IA

**Versión:** 2026-08-17

---

## SIM-20260817-01 · SaaS de Facturación Interna (Estudio García Contadores)

**Ruta:** `discovery/simulations/SIMULACION-FLUJO-COMPLETO-20260817.md`
**Fecha:** 2026-08-17
**Caso:** Estudio García Contadores, 3 contadores, ~30 clientes, sistema de facturación sin SAT.
**Estado:** **AUDITADA_CON_HALLAZGOS** — no validada.

### Resumen de la simulación
- Prospecto → Cuestionario (4 capas) → Spec generado por el sistema → Spec firmado por PL → Cotización multi-línea → Aceptación con evidencia → OS creada → Anticipo cobrado → OS autorizada → Proyecto creado → 3 módulos (auth, clientes, facturación) → ejecución → entregables.

### Hallazgos de la auditoría (ver HALLAZGOS H-20260817-11)

- Cálculo 127h × $250/h = $190,500 incorrecto (mezcla costo cotizado con snapshot interno).
- Comisión re-aplica el 8% al liberarla.
- Falta factura de anticipo, factura final, cobro final.
- Falta aceptación final de entregables, cierre técnico y cierre administrativo.
- La OS aparece cerrada sin mostrar quién la cerró ni bajo qué condiciones.
- Mezcla facturado/cobrado al liberar la comisión.
- Presupuesto $80k → cotización $209,931 sin renegociación.
- Vendedor selecciona su propia comisión del 8% sin definir quién la aprueba.

### Decisión

La simulación queda **AUDITADA_CON_HALLAZGOS**. No se modifica su contenido. Se rehará contra una fuente funcional consolidada cuando se resuelvan las contradicciones P0 (PREGUNTAS-ABIERTAS).
