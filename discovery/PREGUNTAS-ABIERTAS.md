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

**Estado:** answered (Frank, 2026-08-19; DEC-FUN-20260819-73 / BR-N411)
**Área afectada:** Comercial, no el flujo técnico inicial de Proyectos.

La política ya está decidida; se conserva el contexto de las opciones evaluadas.

Opciones conservadas:

1. Advertencia si supera 1.5 veces el presupuesto.
2. Bloqueo con aprobación del Director.
3. Sin control automatizado.

**Resolución:** si la cotización supera 1.5 veces el presupuesto declarado, el sistema advierte mostrando ambos montos, sin bloquear el flujo ni exigir aprobación. INTEGRA debe incorporar esta regla en SPEC-003.

---

## 3. Política para INTEGRA

- No reinterpretar decisiones funcionales cerradas.
- No convertir Q-NB-3 en un supuesto silencioso.
- Si aparece una nueva decisión de producto, emitir `DISCOVERY-GAP` dirigido a ATLAS/Frank.
- Los pendientes operativos ajenos a Vector IA no forman parte de este handoff.

---

## 4. DISCOVERY-GAPs de INTEGRA (vienen de la fase técnica)

Esta sección registra los huecos funcionales que INTEGRA detecta durante la fase técnica y devuelve a ATLAS/Frank. Cada uno bloquea ACs específicos hasta que Frank responde.

### Q-20260818-01 · Editabilidad y desactivación de roles seed (answered)

**Estado:** answered (Frank, 2026-08-19; DEC-FUN-20260819-69)
**Origen:** `context/discovery-gaps/DISCOVERY-GAP-20260818-01-roles-seed-editabilidad.md`
**Artefactos antes bloqueados:** SPEC-001 v1.1 AC-69 (edición label seed), AC-70 (edición permisos seed + desactivación con usuarios). El bloqueo funcional quedó resuelto; INTEGRA debe incorporar este delta antes de pasar la SPEC a `READY`.

**Tensión funcional:** DEC-FUN-02 dice "roles y permisos son datos"; BR-N127 protege a los seed. El discovery no acota cuál prevalece por sub-aspecto.

**Resolución confirmada:**

1. **A1:** el Director puede editar el label; el code permanece inmutable.
2. **B1:** los permisos de roles seed son inmutables; las variaciones requieren roles custom.
3. **C1:** no se permite desactivar un rol seed mientras tenga usuarios asignados; exige reasignación previa.

**Impacto:** BR-N408 a BR-N410. ATLAS debe devolver el delta a INTEGRA para cerrar los AC-69/AC-70 de SPEC-001.

---

### Q-20260818-02 · Alcance operativo del módulo de Suscripciones (answered)

**Estado:** answered (Frank, 2026-08-18; DEC-FUN-20260818-62).
**Origen:** DEC-FUN-20260818-61 / BR-N399.

**Confirmado:** existe un módulo y panel propio de Suscripciones; distingue al menos periodicidad anual, semestral y trimestral; enlaza funcionalmente con Facturación y Cobranza.

**Resolución:** el panel muestra ciclos **mensual, trimestral, semestral y anual**. El MVP incluye gestión completa: **consulta, renovación, pausa y cancelación**. DEC-FUN-20260818-62; BR-N400 y BR-N401.

**Impacto:** no bloquea Plataforma Base ni el flujo ya iniciado de Proyectos. El detalle de actores y estados queda en Q-20260818-03.

---

### Q-20260818-03 · Autoridad y estados de Suscripciones (answered)

**Estado:** answered (Frank, 2026-08-18; DEC-FUN-20260818-63 y -64).
**Origen:** DEC-FUN-20260818-62 / BR-N401.

**Resolución:** las acciones requieren el permiso configurable `gestionar_suscripciones`; no hay rol fijo. Estados: activa, pausada, cancelada y vencida. DEC-FUN-20260818-63/-64; BR-N402/-N403.

**Impacto:** el detalle de las transiciones queda en Q-20260818-04.

---

### Q-20260818-04 · Transiciones del ciclo de Suscripciones (answered)

**Estado:** answered (Frank, 2026-08-18; DEC-FUN-20260818-65).
**Origen:** DEC-FUN-20260818-64 / BR-N403.

**Confirmado:** estados activa, pausada, cancelada y vencida; gestión de renovación, pausa y cancelación mediante permiso configurable.

**Resolución:** `activa ↔ pausada`; `activa → vencida` al terminar periodo sin renovar; `vencida → activa` al renovar; `activa | pausada → cancelada`; `cancelada → activa` al reactivar o renovar, conservando historial. DEC-FUN-20260818-65; BR-N404.

**Impacto:** el delta de Suscripciones está `ready_for_integra`.

---

### Q-20260818-05 · Origen de la Suscripción (answered)

**Estado:** answered (Frank, 2026-08-18; DEC-FUN-20260818-66).
**Origen:** FND-20260818-04 / planificación INTEGRA de SPEC-011.

**Resolución:** entidad propia creada automáticamente al autorizar una OS con tipo de cobro `suscripción`; conserva relación con cliente, cotización y OS. DEC-FUN-20260818-66; BR-N405.

**Impacto:** SPEC-011 depende también de SPEC-003 Comercial y SPEC-004 OS. Sólo Q-20260818-06 bloquea sus ACs de Facturación.

### Q-20260818-06 · Renovación y Facturación (answered)

**Estado:** answered (Frank, 2026-08-18; DEC-FUN-20260818-67).
**Origen:** FND-20260818-05 / planificación INTEGRA de SPEC-011.

**Resolución:** renovar crea automáticamente una factura en borrador para el nuevo periodo. Facturación conserva revisión, timbrado y emisión. DEC-FUN-20260818-67; BR-N406.

**Impacto:** la relación Suscripciones→Facturación queda cerrada; SPEC-011 puede redactarse cuando se cumplan sus dependencias técnicas.

---

### Q-20260818-07 · Productos/servicios que requieren Proyecto (answered)

**Estado:** answered (Frank, 2026-08-18; DEC-FUN-20260818-68).
**Origen:** FND-20260818-06.

**Problema:** el catálogo admite productos y servicios únicos/recurrentes, pero la regla actual crea Proyecto para cada OS. No está definido qué ocurre con una oferta que no requiere trabajo técnico (por ejemplo, un producto o servicio recurrente puro).

**Resolución:** toda oferta vendida crea Proyecto, porque siempre exige intervención de técnico especialista (configuración, activación, ajuste, mantenimiento u otra actividad). DEC-FUN-20260818-68; BR-N407.

**Impacto:** BR-N03 aplica a toda OS. Si la OS es de tipo `suscripción`, crea también la entidad Suscripción en paralelo. El módulo de Proyectos cubre productos y servicios sin excepción.
