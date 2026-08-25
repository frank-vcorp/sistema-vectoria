# OPEN-QUESTIONS · Vector IA

**Versión:** 2026-08-17 23:20
**Estado:** el gap funcional de SPEC-002 quedó resuelto por `DEC-20260823-01`.

Los elementos sobre buckets, CCTs SEP, RLS, URLs y archivos sin commit fueron retirados porque pertenecen a otro sistema y contaminaban el contexto de Vector IA. Permanecen recuperables en el historial de Git, pero no se entregan a INTEGRA.

Las decisiones funcionales abiertas viven exclusivamente en `PREGUNTAS-ABIERTAS.md`. Actualmente sólo existe Q-NB-3 como política comercial diferida y no bloqueante.

## DISCOVERY-GAP-20260823-01 · Enum de medios de contacto de SPEC-002

- **Estado:** `resolved` (2026-08-23); bloqueaba SPEC-002 y no afectaba SPEC-001.
- **Hallazgo relacionado:** `FND-20260823-01`.
- **Pregunta exacta:** ¿Cuál es la lista canónica, ordenada y con identificadores estables de los valores del enum `prospects.medium`?
- **Resolución:** Frank confirmó sólo tres valores, en orden: `llamada` (Llamada), `email` (Email), `whatsapp` (WhatsApp).

## FLOW-20260824-01 · Flujo integral prospecto → cierre de proyecto

- **Estado:** `blocking` para ejecución V3 en staging.
- **Solicitud confirmada:** ejecutar el recorrido desde la llegada/alta de un prospecto hasta el fin del proyecto, atravesando los módulos comerciales y operativos aplicables.
- **Dependencia operativa:** se requiere una cuenta autenticada de staging con permisos suficientes para prospectos, clientes, comercial, órdenes de servicio y proyectos. Las pruebas actuales sólo usan credenciales inválidas y no exponen una cuenta de negocio reutilizable.
- **Pregunta bloqueante:** ¿qué cuenta/rol de staging se usará para ejecutar el flujo? No registrar ni enviar la contraseña en chat; debe estar disponible mediante sesión autenticada o variable local segura.
- **Pregunta de alcance:** ¿"fin del proyecto" termina en `cierre técnico`/`delivered`, o incluye también `cierre administrativo de OS`, facturación y cobranza hasta saldo cero?
