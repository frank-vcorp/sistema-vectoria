# ADR-20260817-05 · Autorización a nivel de recurso

- **ID:** ARCH-20260817-05
- **Estado:** accepted (ratificado por Frank · OK stack V1 completo · 2026-08-20)
- **Versión:** 1.1
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-18
- **Fuentes funcionales:** `discovery/DECISIONES-FUNCIONALES.md` DEC-FUN-02, DEC-FUN-22, DEC-FUN-46, DEC-FUN-55, DEC-FUN-56; `discovery/REGLAS-DE-NEGOCIO.md` BR-016, BR-N200, BR-N205, BR-N206, BR-N207, BR-N208, BR-N209, BR-N210, BR-N211, BR-N212, BR-N336, BR-N382, BR-N383; `discovery/ACTORES-Y-PERMISOS.md` §3 (matriz de visibilidad), §5 (privacidad de datos), §6 (rol usado); `discovery/FLUJOS-FUNCIONALES.md` FLOW-PROJ-02.
- **Stack asumido:** ADR-20260817-01 v1.1 (sin cambios).

---

## 1. Contexto

`hasPermission(code)` (ADR-01 §5, DEC-FUN-02, BR-N205) resuelve la autorización de **acción**: ¿este usuario puede **ejecutar** `gestionar_facturas`? Pero no resuelve la autorización de **recurso**: ¿este usuario puede ver/editar **ESTE** proyecto X, **ESTA** cotización Y, **ESTE** cliente Z?

La matriz de visibilidad (ACTORES §3, BR-N207 a -212) exige exactamente eso:

- Vendedor ve sus prospectos y cotizaciones, no los de otros; no ve precios internos, CxC ni comisiones de otros (BR-N207).
- Programador sólo ve su propio tiempo (BR-N208) y sólo los proyectos donde tiene módulos asignados (BR-N212).
- Admin ve todo lo comercial y financiero; proyectos en read-only (BR-N209).
- PL no ve precios, márgenes, CxC ni comisiones (BR-N210); ve los proyectos donde es líder.
- Director ve todo (BR-N211).
- La asignación concede visibilidad; retirarla revoca acceso operativo futuro conservando historial (BR-N383); nadie recibe trabajo sin pertenecer antes al proyecto (DEC-FUN-56, BR-N382).

Esto requiere, **sobre** `hasPermission`, un mecanismo de autorización a nivel de recurso que resuelva **ownership + asignación + herencia por relación**, sin comparar nombres de rol en código (BR-N205).

---

## 2. Decisión

### 2.1 Dos niveles de autorización, ambos obligatorios

Una operación sobre un recurso exige **ambos** niveles (AND, no OR):

1. **Autorización de acción:** `hasPermission(ctx, actionCode)` — ver si el usuario puede ejecutar la acción (DEC-FUN-02, BR-N205). Sin cambios respecto a ADR-01.
2. **Autorización de recurso:** `canAccessResource(ctx, {entityType, entityId, action})` — ver si el usuario puede operar sobre **ese recurso concreto**.

Si cualquiera falla, se deniega. El fallo de recurso se reporta como `404 Not Found` cuando el recurso es de otra organización (no revelar existencia, BR-016) y como `403 Forbidden` cuando es de la misma org pero sin relación de visibilidad.

### 2.2 Modelo funcional: ownership + asignación + herencia

`canAccessResource` resuelve tres preguntas, en orden:

**(a) Pertenencia a la organización del recurso** (BR-016, BR-N200):
- El recurso tiene `organization_id`. Si difiere del `ctx.organizationId` → `404 Not Found` (sin revelar existencia). Nunca `403` cross-org (revelaría que existe).

**(b) Autorización de acción** (DEC-FUN-02, BR-N205):
- `hasPermission(ctx, actionCode)` debe ser `true`. El `actionCode` se deriva del par `(entityType, action)` vía un mapa declarativo (dato, no `if` por rol).

**(c) Relación de visibilidad con el recurso** (BR-N207 a -212, BR-N382, BR-N383):
- Se resuelve vía una **`ResourcePolicy` por dominio** registrada por cada SPEC de módulo. La plataforma provee el dispatcher y los **primitivos** de resolución (ownership, asignación, herencia); las policies de módulo los combinan sin comparar nombres de rol.

Tres primitivos de visibilidad:

1. **Ownership (`owner_id`):** el recurso lleva `owner_id` FK→users (p.ej. `prospecto.owner_id`, `cotizacion.created_by`). El owner siempre ve su recurso. Cita BR-N207 implícita (vendedor ve "sus" prospectos).
2. **Asignación directa (M2M):** tablas como `project_members`, `module_responsibles`, `task_assignees`, `requirement_responsibles`, `deliverable_responsibles` vinculan user↔recurso. La asignación concede visibilidad (BR-N383). Retirar la asignación revoca acceso operativo futuro, conserva historial.
3. **Herencia por relación (padre→hijo):** la visibilidad se propaga hacia abajo. Si el user es miembro visible de un proyecto y tiene módulo asignado, hereda visibilidad sobre las tareas/entregables/reqs/pruebas de ese módulo. La visibilidad **no** se propaga hacia arriba de forma abierta: ver una tarea no implica ver el proyecto completo; pero, por DEC-FUN-56/BR-N382, toda asignación de tarea presupone membresía de proyecto, así que en la práctica quien ve una tarea ya es miembro del proyecto.

### 2.3 Reglas rectoras por rol (sin hardcode de nombre)

Las `ResourcePolicy` de cada módulo **no** hacen `if (user.role === 'vendedor')`. En su lugar, consultan `hasPermission` y los primitivos:

| Rol (canónico) | Primitivo que le aplica la policy | Cita |
|---|---|---|
| Director | Short-circuit: `hasPermission('ver_todo')` → visible siempre | BR-N211 |
| Vendedor | Ownership sobre prospectos/cotizaciones que creó; no ve precios (field-level) | BR-N207 |
| Administrador | Ve comercial+financiero (todas las entidades comerciales/financieras visibles); proyectos read-only (sin permiso de edición) | BR-N209 |
| Líder de Proyecto | Asignación: `project_members` donde es líder; no ve precios (field-level) | BR-N210 |
| Programador | Asignación+herencia: miembro de proyecto AND módulo asignado; sólo su tiempo | BR-N208, BR-N212 |
| Diseñador / QA | Asignación: miembro de proyecto | ACTORES §3 |

> **`ver_todo` no es un permiso seed del Director por código:** es un permiso base (DEC-FUN-02) otorgado al rol `director` en la semilla (ADR-04 §2.3) y consultable vía `hasPermission('ver_todo')`. Cero hardcode (BR-N205).

### 2.4 Field-level authorization (precios, márgenes, CxC, comisiones)

BR-N207 (vendedor no ve precios), BR-N208 (programador no ve tiempo de otros), BR-N210 (PL no ve precios/márgenes/CxC/comisiones) son restricciones **de campo**, no de recurso. Se resuelven en el **serializador** de respuesta:

- El serializer de cada entidad consulta `hasPermission(ctx, 'ver_costos')` / `hasPermission(ctx, 'ver_cxc_otros')` / `hasPermission(ctx, 'ver_comisiones_otros')` / `hasPermission(ctx, 'ver_tiempo_equipo')` y **omite** los campos sensibles si el permiso falta.
- Esto es complementario a `canAccessResource`: un PL puede **ver** un proyecto (resource-level) pero no ver sus precios (field-level).

### 2.5 Contrato de servicios (firma, no implementación)

- `canAccessResource(ctx, {entityType, entityId, action}): Promise<{allowed: boolean; reason?: string}>` — dispatcher.
- `requireResourceAccess(ctx, {entityType, entityId, action}): Promise<void>` — lanza `ForbiddenError` o `NotFoundError` (cross-org) si denegado.
- `ResourcePolicy` (interface declarativa por dominio): `isVisible(ctx, resource): Promise<boolean>`, `canAct(ctx, resource, action): Promise<boolean>`.
- `registerResourcePolicy(entityType, policy): void` — registry; cada SPEC de módulo registra sus policies al arrancar.
- `assertOrgScope(ctx, resourceOrganizationId): void` — primitivo cross-org (lanza `404` si difiere).

### 2.6 Auditoría de denegación

Toda denegación de recurso (no de acción, que ya audita `audit_logs`) se registra en `audit_logs` con `action='access.denied'`, `entity_type`, `entity_id`, `actor_user_id`, `reason` (p.ej. `no_ownership`, `no_assignment`, `cross_org`), sin revelar el contenido del recurso. Cita BR-N336, BR-N206 (toda otorgación/revocación implícita en denegación de acceso a recurso crítico).

---

## 3. Contratos fijados

1. Toda operación sobre un recurso exige `hasPermission(action) AND canAccessResource(resource)`. Ninguna ruta de módulo puede omitir `requireResourceAccess`.
2. Cross-org se reporta como `404` (no `403`), para no revelar existencia (BR-016).
3. Las `ResourcePolicy` no comparan nombres de rol; consultan `hasPermission` + primitivos de ownership/asignación/herencia (BR-N205).
4. Las restricciones de campo (precios, CxC, comisiones, tiempo de otros) se resuelven en el serializador vía `hasPermission` de campo, no en SQL.
5. Toda denegación de recurso queda en `audit_logs` con `action='access.denied'` y `reason`, sin valor del recurso.
6. El Director (`ver_todo`) es short-circuit: visible siempre, sin recorrer policies (BR-N211).

---

## 4. Consecuencias

### 4.1 Positivas
- Cierra el hueco "¿puede ver ESTE recurso?" sin romper `hasPermission` ni DEC-FUN-02.
- Las policies son por dominio (dato/declarativo), reutilizables y testeables.
- Field-level authz cubre BR-N207/208/210 sin duplicar lógica de recurso.
- Trazabilidad: cada denegación queda auditada.

### 4.2 Negativas / trade-offs
- Cada módulo debe registrar su `ResourcePolicy`; es trabajo añadido en SPEC-002 a -010. Mitigación: la plataforma provee los primitivos y un policy-base reutilizable.
- La herencia padre→hijo puede costar N+1 si se implementa ingenuamente. Mitigación: las policies resuelven con una sola query por relación (JOIN sobre `project_members` + `module_responsibles`), documentado en la SPEC del módulo.
- El short-circuit `ver_todo` del Director es una concesión a BR-N211; debe testearse que no bypassa el paso (a) de cross-org (el Director de la org A no ve recursos de la org B).

### 4.3 Reversibilidad
- Cambiar el modelo de policies (p.ej. a RLS puro al activar multi-org) es transparente para el contrato: `canAccessResource` sigue siendo el punto único; las policies se mueven a RLS policies. Reversible.

---

## 5. Restricciones para SPECs

- SPEC-001 v1.1 contiene los ACs testeables del dispatcher y los primitivos (AC-33 a AC-42).
- Toda SPEC de módulo (002 a -010) **debe** registrar sus `ResourcePolicy` y citar las BR-N207 a -212 que cubre. La SPEC lo declara en §"Autorización por recurso" con la lista de `entityType` y la policy aplicable.
- Toda SPEC que añada un campo sensible (precio, margen, CxC, comisión, tiempo) debe declarar el permiso field-level que lo protege y citar la BR correspondiente.

---

## 6. ACs derivadas (testeables en SPEC-001 v1.1)

- **AC-33** · Cross-org → `404` (no `403`), no revela existencia.
- **AC-34** · `canAccessResource` llama `hasPermission(action)` antes de la policy.
- **AC-35** · Ownership: `owner_id` concede visibilidad (prospecto propio para vendedor).
- **AC-36** · Asignación directa: `project_members` concede visibilidad de proyecto.
- **AC-37** · Herencia: módulo asignado → visibilidad de tareas/entregables del módulo.
- **AC-38** · Field-level: `!hasPermission('ver_costos')` omite campos de precio en la respuesta.
- **AC-39** · Director short-circuit (`ver_todo`) visible siempre dentro de su org; cross-org sigue `404`.
- **AC-40** · `requireResourceAccess` lanza `ForbiddenError` dentro de la org.
- **AC-41** · Denegación de recurso se registra en `audit_logs` (`action='access.denied'`, `reason`).
- **AC-42** · Grep anti-patrón: `rg -n "user\.role\s*===|user\.role\s*==" src/` → 0 en código de producción (refuerza AC-1).

---

## 7. Referencias cruzadas

- Derivado de: instrucción Frank v1.1 §2.2 + DEC-FUN-02/22/46/55/56.
- Relacionado: ADR-01 v1.1 (`hasPermission`), ADR-02 v1.1 (cross-org), ADR-04 (rol `director` con `ver_todo` en semilla).
- Aplica a: SPEC-001 v1.1 (AC-33 a AC-42) y transversal a SPEC-002 a -010 (registro de `ResourcePolicy` por módulo).
