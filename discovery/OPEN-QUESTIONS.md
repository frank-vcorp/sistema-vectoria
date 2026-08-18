# OPEN-QUESTIONS · Vector IA

**Versión:** 2026-08-17

Este archivo agrupa preguntas de **operación e infraestructura** que NO pertenecen al discovery funcional consolidado. Se retoman cuando exista la capa técnica (INTEGRA/infra).

---

## OUT-OF-CONSOLIDATION-SCOPE

### OOS-20260817-01 · 88+ entries sin commitear
- **Quién:** Frank (OK de commit).
- **Tipo:** operativo, no discovery.
- **Bloqueante para:** producción real. No bloqueante para discovery.

### OOS-20260817-02 · 3 buckets Storage no creados
- **Quién:** Frank (5 min).
- **Acción:** crear manualmente en dashboard.
- **Bloqueante para:** producción real. No bloqueante para discovery.

### OOS-20260817-03 · 30k CCTs SEP no cargados
- **Quién:** Frank o cron.
- **Acción:** cargar autocomplete.
- **Bloqueante para:** uso real. No bloqueante para discovery.

### OOS-20260817-04 · Frank no ha probado la URL visualmente
- **Quién:** Frank.
- **Acción:** smoke test manual.
- **Bloqueante para:** desconocido (pendiente Frank).

### OOS-20260817-05 · T-E2E-07 RLS no ejecutado
- **Quién:** Infraestructura.
- **Acción:** ejecutar prueba E2E de RLS; requiere Docker.
- **Bloqueante para:** producción real. No bloqueante para discovery.

---

> Estas 5 entradas se listan aquí sólo para no perderlas de la sesión. **No** entran al handoff a INTEGRA; se entregan como contexto al área técnica cuando se forme.
