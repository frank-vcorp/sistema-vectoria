# DISCOVERY-GAP-20260818-01 · Editabilidad y desactivación de roles seed

- **Origen:** INTEGRA
- **Fecha:** 2026-08-18
- **Estado recomendado:** BLOCKED (la SPEC-001 v1.1 queda con AC-4/AC-5 reformulados y los AC de roles-seed nuevos marcados `BLOCKED (sin-trazabilidad-funcional)` hasta resolución de ATLAS/Frank)
- **Destino:** ATLAS (para Frank)

---

~~~text
DISCOVERY-GAP
Origen: INTEGRA
SPEC/ARCH afectada:
  - SPEC-20260817-001 v1.1 (AC-4, AC-5, y nuevos AC-69/AC-70 sobre roles seed)
  - ADR-20260817-04 §2.3 (semilla de 7 roles + role_permissions)
  - ADR-20260817-01 §5 (hasPermission, roles como dato)
IDs funcionales relacionados:
  - BR-N127 (roles base no se eliminan; sólo se desactivan)
  - BR-N128 (Director crea roles adicionales)
  - BR-N131 (permisos aditivos; nunca restan)
  - BR-N205 (cero hardcode; verificación por datos)
  - DEC-FUN-02 (roles y permisos viven en tablas, no en código)
  - ACTORES-Y-PERMISOS.md §1 (7 roles base combinables), §4 (crear roles custom = Director)
Contradicción o faltante:
  BR-N127 protege a los roles seed de la ELIMINACIÓN (sólo desactivables) y BR-N128 autoriza al Director a crear roles adicionales. Pero el discovery NO decide tres sub-cuestiones que la v1.1 necesita para producir ACs testeables:
    (a) ¿Puede el Director editar el LABEL de un rol seed?
    (b) ¿Puede el Director editar los PERMISOS (role_permissions) de un rol seed?
    (c) ¿Puede el Director DESACTIVAR un rol seed que tiene usuarios asignados?
  La tensión: DEC-FUN-02 dice "roles y permisos son datos" (sugeriría editables), pero BR-N127 protege a los seed (sugeriría no plenamente editables). El discovery no acota cuál prevalece por sub-aspecto.
Por qué impide especificar:
  Sin (a)/(b)/(c) resueltos, INTEGRA no puede escribir ACs verificables de edición/desactivación de roles seed sin inventar una decisión de producto. Declarar "todo editable" rompería BR-N127/N211 si el Director borra `ver_todo` del rol director; declarar "todo bloqueado" contradiría DEC-FUN-02 y bloquearía i18n del label. Necesito la decisión de Frank para cerrar los AC-69/AC-70.
Opciones técnicamente viables:
  (a) Editar label de rol seed:
    A1. code inmutable, label editable por Director (consistente con DEC-FUN-02: label es dato de presentación; code es identidad). RECOMENDADO técnicamente.
    A2. label inmutable para seed (sólo roles custom tienen label editable).
    A3. label editable sólo con auditoría y motivo.
  (b) Editar permisos de un rol seed:
    B1. NO editable (los seed son contratos canónicos; el Director crea roles custom para variaciones). Refuerza BR-N127/N211/N210/N207.
    B2. Editable con WARNING si rompe una BR de visibilidad (p.ej. quitar `ver_todo` del director dispara advertencia pero permite).
    B3. Editable libremente (riesgo: violar BR-N207 a N212 sin que el sistema lo impida).
  (c) Desactivar un rol seed con usuarios asignados:
    C1. Bloquear desactivación si hay usuarios asignados (exige reasignar primero). RECOMENDADO técnicamente (protege usuarios huérfanos).
    C2. Permitir desactivación con cascada: los usuarios pierden el rol pero conservan sus otros roles y permisos aditivos; se notifica.
    C3. Permitir desactivación sin cascada (los usuarios mantienen el rol inactivo; no pueden usarlo en nuevas acciones pero sí en sesiones ya abiertas hasta refresh).
Consecuencias de cada opción:
  A1 → soporta i18n/personalización del label sin tocar identidad; cero impacto en verificación (usa code). A2 → fricción para renombrar "Programador" a "Dev". A3 → añade fricción de motivo.
  B1 → los seed quedan como contrato estable; variaciones vía roles custom (alinea BR-N128). B2 → flexible pero requiere motor de advertencia vs BR de visibilidad (complejidad). B3 → riesgo de violar BR-N207-N212 silenciosamente.
  C1 → protege integridad (nadie queda sin rol funcional); exige reasignación previa. C2 → operación más fluida pero puede dejar usuarios sin capacidad operativa si era su único rol. C3 → incoherente (rol inactivo pero vigente en sesión).
Pregunta funcional mínima:
  1. ¿Para roles seed: label editable (A1) o inmutable (A2)? [INTEGRA recomienda A1]
  2. ¿Permisos de un rol seed: inmutables (B1), editables con advertencia vs BR (B2), o libres (B3)? [INTEGRA recomienda B1 para preservar BR-N207 a N212]
  3. ¿Desactivar un rol seed con usuarios asignados: bloquear (C1), cascada-notificada (C2) o sin cascada (C3)? [INTEGRA recomienda C1]
Estado recomendado: BLOCKED
~~~

---

## Resolución parcial que INTEGRA aplica ya (no requiere Frank)

Estos puntos son técnicamente derivables de DEC-FUN-02 + BR-N127 + la estructura de datos, y se formalizan en SPEC-001 v1.1 sin esperar el gap:

1. **`code` de cualquier rol es inmutable** (es la identidad usada en `audit_logs.actor_role_code`, referencias cruzadas y serialización). Ni el Director puede cambiar el `code` de un rol seed o custom. (Consistente con BR-N127: la regla protege la identidad del rol.)
2. **El label de un rol custom (no-seed) es editable** por el Director con `gestionar_roles` (DEC-FUN-02, BR-N128). Sin controversia funcional.
3. **Eliminar (DELETE físico) cualquier rol está prohibido**: seed por BR-N127; custom por consistencia (soft-delete / `active=false`). AC-4 v1.0 ya cubre seed; v1.1 extiende a custom.
4. **Toda edición de rol/permiso se audita** en `audit_logs` con `actor_user_id`, `entity_type='role'`, before/after, motivo (BR-N206, BR-N336).

Lo que queda `BLOCKED` hasta respuesta de Frank son exclusivamente (a) para seed, (b) y (c). Los ACs correspondientes (AC-69, AC-70) se redactan con las tres opciones como ramas y se marcan `BLOCKED (sin-trazabilidad-funcional)`; al responder Frank, INTEGRA selecciona la rama y el AC pasa a testeable.

---

## Impacto en SPEC-001 v1.1

- AC-4 (v1.0) se reformula: "Roles seed no se eliminan (DELETE físico prohibido); sólo desactivables" + extiende a custom. → **testeable ya** (no requiere Frank).
- AC-5 (v1.0) se mantiene: Director crea roles custom. → **testeable ya**.
- **AC-69 (nuevo, BLOCKED):** edición del label de un rol seed → depende de (a).
- **AC-70 (nuevo, BLOCKED):** edición de permisos de un rol seed y desactivación con usuarios asignados → depende de (b) y (c).

---

## Próximo paso

ATLAS devuelve a Frank las 3 preguntas con las recomendaciones de INTEGRA (A1, B1, C1). Frank responde. INTEGRA desbloquea AC-69/AC-70 y, si la respuesta contradice una BR vigente, emite la inconsistencia para que ATLAS la resuelva en `discovery/`.
