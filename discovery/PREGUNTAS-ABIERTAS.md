# PREGUNTAS-ABIERTAS · Vector IA

**Versión:** 2026-08-17 23:20
**Estado del gate:** no existen preguntas funcionales bloqueantes para el handoff a INTEGRA.

---

## 1. Preguntas bloqueantes

**Ninguna.**

Las preguntas P0 y los huecos de Proyectos fueron cerrados mediante DEC-FUN-20260817-47 a DEC-FUN-20260817-60.

| Pregunta anterior | Resolución vigente |
|---|---|
| Q-P0-1 · Estados de módulo | DEC-FUN-47: `pending → in_progress → testing → deployed` + laterales |
| Q-P0-2 · Cotización | DEC-FUN-48: multi-línea |
| Q-P0-3 · Comisión | DEC-FUN-49: sobre facturado |
| Q-P0-4 · CFDI | DEC-FUN-50: timbrado real con FacturoPorTi |
| Q-P0-5 · Conteos | DEC-FUN-51; conteo actualizado por decisiones y reglas posteriores |
| Q-P0-6 · Reglas faltantes | DEC-FUN-52: reconstrucción concluida |
| Q-NB-1 · Catálogo → plantilla | DEC-FUN-53: selección explícita; PL confirma |
| H-12 · Alcance/plantilla/JSON | DEC-FUN-54: autoridad y versionado definidos |
| Q-NB-2 · Aceptación proxy | DEC-FUN-55: PL registra; evidencia e identidad obligatorias |
| Q-NB-4 · Programadores | DEC-FUN-56: el PL incorpora y asigna después de crear el proyecto |
| Q-NB-5 · Dos cierres | DEC-FUN-57: cierre técnico y administrativo separados |
| Estados y handoffs de Proyectos | DEC-FUN-58 a DEC-FUN-60 |

---

## 2. Pregunta diferida no bloqueante

### Q-NB-3 · Desviación contra presupuesto declarado

**Estado:** `deferred_non_blocking`
**Área afectada:** Comercial, no el flujo técnico inicial de Proyectos.

Falta decidir si el sistema sólo advierte o bloquea cuando una cotización supera ampliamente el presupuesto declarado por el prospecto.

Opciones conservadas:

1. Advertencia si supera 1.5 veces el presupuesto.
2. Bloqueo con aprobación del Director.
3. Sin control automatizado.

INTEGRA puede especificar Proyectos sin esta respuesta. Si comienza la SPEC de Comercial y necesita automatizar la comparación, debe emitir `DISCOVERY-GAP` en lugar de elegir una opción.

---

## 3. Política para INTEGRA

- No reinterpretar decisiones funcionales cerradas.
- No convertir Q-NB-3 en un supuesto silencioso.
- Si aparece una nueva decisión de producto, emitir `DISCOVERY-GAP` dirigido a ATLAS/Frank.
- Los pendientes operativos ajenos a Vector IA no forman parte de este handoff.
