# ADR-20260817-02 · Multi-tenancy y aislamiento de datos

- **ID:** ARCH-20260817-02
- **Estado:** accepted (ratificado por Frank · OK stack V1 completo · 2026-08-20)
- **Versión:** 1.1
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-17 (v1.0) · 2026-08-18 (v1.1)
- **Motivo del estado v1.1:** la base de multi-tenancy por `organization_id` + RLS latente (v1.0) **se mantiene**. La v1.1 añade el **aislamiento relacional mecánico** (constraint compuesto `(organization_id, id)`) para que una FK **nunca** pueda cruzar organización a nivel de BD, no sólo en aplicación. Refinamiento a la espera del OK de Frank al stack v1.1. ✅ **Ratificado por Frank (OK stack V1 completo, 2026-08-20) → `accepted`**; esta ratificación deja sin efecto el «a la espera del OK de Frank al stack v1.1».
- **Fuentes funcionales:** `discovery/DECISIONES-FUNCIONALES.md` DEC-FUN-46; `discovery/REGLAS-DE-NEGOCIO.md` BR-016, BR-N200, BR-N201, BR-N202, BR-N203, BR-N207, BR-N208, BR-N209, BR-N210, BR-N211, BR-N212; `discovery/ACTORES-Y-PERMISOS.md` §3, §5.

---

## 1. Contexto

DEC-FUN-46 declara el sistema **multi-org latente**: la BD incluye `organization_id` en todas las entidades de negocio aunque el MVP tenga una sola organización. BR-016 y BR-N200 exigen que los datos de una organización no sean visibles para usuarios de otra. ACTORES §3 define visibilidad por rol (Director ve todo; PL no ve precios ni CxC; Programador sólo su tiempo y sus proyectos asignados; etc.).

El descubrimiento **no decide** el mecanismo técnico de aislamiento; lo deja a INTEGRA. Es una decisión técnica reversible dentro de mi rol.

---

## 2. Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| **A. Columna `organization_id` + RLS latente (políticas escritas, inactivas en MVP)** | Cumple DEC-FUN-46; activable sin migración; consultas de negocio simples | Hay que auditar políticas antes de activar multi-org |
| B. Esquema por organización | Aislamiento físico fuerte | No escala a muchas orgs; complejidad de migraciones N veces; innecesario para MVP con una org |
| C. Base de datos por organización | Aislamiento total | Operación prohibitiva; sin beneficio en MVP |
| D. Columna `organization_id` con filtro en aplicación (sin RLS) | Simple | Riesgo de fuga por bug de app; no satisface BR-016 de forma verificable |

---

## 3. Decisión

**Opción A.** Multi-tenancy por **columna `organization_id`** + **Row-Level Security (RLS) latente**:

1. Toda tabla de negocio lleva `organization_id UUID NOT NULL` con FK a `organizations(id)` y índice compuesto `(organization_id, ...)`.
2. Las políticas RLS se **escriben y se testean** desde el MVP (con la organización única), pero quedan **inactivas por defecto** (`ALTER TABLE ... DISABLE ROW LEVEL SECURITY`). Antes de añadir la 2ª organización, se activan tras un gate de auditoría (SPEC-001 AC-12).
3. El contexto de sesión inyecta `organization_id` al abrir conexión; los jobs nocturnos iteran organizaciones activas.
4. Las consultas de negocio filtran por `organization_id` en la capa de servicio además de RLS (defensa en profundidad).
5. Visibilidad por rol (BR-N207 a -212) se aplica en la capa de servicio con `hasPermission` (no en SQL).

### 3.1 Configuración fiscal de la organización

BR-N201: la configuración fiscal (RFC, razón social, régimen, CSD, llave PAC) es única por organización y sólo el Director la edita. Se modela como `organization_fiscal_config` 1:1 con `organizations`, con campos sensibles cifrados (ver ADR-20260817-03). La edición queda en `audit_logs`.

### 3.2 Moneda, zona horaria, locale

- `organizations.currency` default `MXN`, reservado para multi-moneda futura (BR-N202).
- `organizations.timezone` default `America/Mexico_City` (BR-N203).
- `organizations.locale` default `es-MX` (DEC-FUN-39).
- Toda fecha persistida en UTC; la capa de presentación convierte al timezone de la organización.

---

## 4. Consecuencias

### 4.1 Positivas

- Cumple DEC-FUN-46 y BR-016/BR-N200 sin over-engineering.
- Activación multi-org sin migración de esquema.
- Visibilidad por rol centralizada en servicio + `hasPermission` (no regada en SQL).
- Trazabilidad: cada query acotada a `organization_id` loggable.

### 4.2 Negativas / trade-offs

- RLS latente es riesgo si se activa con políticas mal escritas → se exige AC de auditoría de políticas (SPEC-001 AC-12) antes de activar.
- Doble filtrado (RLS + servicio) es redundancia intencional (defensa en profundidad); conviene tests que verifiquen ambos niveles.

### 4.3 Reversibilidad

- Cambiar a esquema-por-org o BD-por-org más adelante es migración de datos, no rediseño de contrato funcional. El `organization_id` ya presente lo permite.

---

## 5. Contratos fijados

1. Toda entidad de negocio lleva `organization_id` (no nullable, FK + índice).
2. RLS escrito y testeado desde MVP, inactivo hasta gate de auditoría.
3. Visibilidad por rol se resuelve en servicio con `hasPermission`; el SQL no conoce roles.
4. Configuración fiscal única por organización, campos sensibles cifrados, edición por Director y auditada.

---

## 6. Restricciones para SPECs

- SPEC-001 (Plataforma Base) define `organizations`, `organization_fiscal_config`, contexto de sesión y políticas RLS inactivas + gate de activación.
- Toda SPEC de módulo debe asegurar que sus tablas lleven `organization_id` y citen BR-N200.
- Toda SPEC que toque visibilidad (Comercial, Finanzas, Cobranza, Proyectos) debe citar BR-N207 a -212 y resolverla en servicio.

---

## 7. Referencias cruzadas

- Derivado de: DEC-FUN-46.
- Relacionado: ADR-20260817-01 (stack), ADR-20260817-03 (secretos).
- Aplica a: SPEC-20260817-001 y transversal.

---

## 8. Addendum v1.1 (2026-08-18) · Aislamiento relacional mecánico

### 8.1 Problema que v1.0 no cerraba

`organization_id` por columna + RLS latente (v1.0) aísla en la capa de **consulta** (filtro en servicio + RLS cuando se active). Pero **no impide** que una FK apunte a una fila de otra organización si el código o una migración equivocada la inserta: una `task.project_id` podría referenciar un `project_id` de otra org, y la BD no lo rechazaría (la FK es sólo sobre `id`). El aislamiento dependía exclusivamente de la aplicación. Frank (instrucción v1.1 §2.3) exige garantizar que una FK **nunca** cruce organización, incluyendo tablas puramente relacionales (`project_members`, `file_links`, `payment_allocations`).

### 8.2 Decisión v1.1 · Constraint compuesto `(organization_id, id)`

Toda **tabla de negocio** adopta **clave primaria compuesta** `(organization_id, id)` donde `id` es `uuid` y `organization_id` es `uuid NOT NULL FK→organizations`. Consecuencia inmediata: cualquier FK que apunte a esa tabla **debe incluir `organization_id`**. Como la FK es compuesta, **es físicamente imposible** que una fila referencie una fila de otra organización: el par `(organization_id, id)` sólo resuelve dentro de la misma org.

Esto convierte el aislamiento en una **restricción de integridad referencial de BD**, no en una convención de aplicación. Es **defensa en profundidad**: la capa de servicio sigue filtrando por `organization_id` (v1.0), y RLS (latente) añade una tercera capa al activarse.

### 8.3 Tablas de negocio (PK compuesta `(organization_id, id)`)

Aplica a toda tabla que representa una entidad de negocio: `users`, `invitations`, `roles`, `permissions`, `audit_logs`, `notifications`, `files`, `project_log_entries`, `job_runs` (con `organization_id` nullable para jobs globales → ver §8.5), y —en sus SPECs— `prospectos`, `clientes`, `contactos`, `cotizaciones`, `quote_items`, `ordenes_servicio`, `projects`, `project_scope_snapshots`, `modules`, `requirements`, `tasks`, `tests`, `deliverables`, `change_requests`, `facturas`, `cobros`, `payment_allocations`, `comisiones`, `movimientos`, `cuentas`, `time_entries`, `direct_costs`, etc.

> `organizations` es la excepción canónica: PK `id` (no compuesta), pues es la raíz del tenant. `organization_fiscal_config` es 1:1 con `organizations`; su PK puede ser `id` con `organization_id` unique, pero sus FKs salientes (a `files`, `users`) son compuestas.

### 8.4 Tablas puramente relacionales (M2M) — cómo referencian sin cruzar org

Las tablas de unión (`project_members`, `module_responsibles`, `task_assignees`, `requirement_responsibles`, `deliverable_responsibles`, `file_links`, `payment_allocations`, `role_permissions`, `user_roles`, `user_permissions`) **también llevan `organization_id`** (no nullable) y referencian a las entidades de negocio vía **FK compuesta `(organization_id, entity_id)`**. Ejemplos canónicos:

- `project_members (organization_id, project_id, user_id, role, ...)` con `FK (organization_id, project_id) → projects(organization_id, id)` y `FK (organization_id, user_id) → users(organization_id, id)`. Una fila sólo puede enlazar un user y un project de la **misma** org.
- `payment_allocations (organization_id, cobro_id, factura_id, monto)` con `FK (organization_id, cobro_id) → cobros(organization_id, id)` y `FK (organization_id, factura_id) → facturas(organization_id, id)`. No puede aplicar un cobro de la org A a una factura de la org B.
- `module_responsibles`, `task_assignees`, etc.: mismo patrón; el `entity_id` referenciado es siempre compuesto con `organization_id`.

### 8.5 Excepciones documentadas

- **`job_runs`:** `organization_id` **nullable** (jobs globales como `backup-bd`). Cuando es nullable, no aplica PK compuesta con `organization_id`; su PK es `id`. El aislamiento de jobs globales no aplica (son cross-org por diseño: backup, purge).
- **`file_links`:** referencia **polimórfica** (`entity_type` + `entity_id`) — no se puede FK compuesta porque el destino varía. Mitigación: `file_links` lleva `organization_id` (no nullable); la aplicación valida vía `canAccessResource` (ADR-05) que el `entity_id` pertenece a la misma org; cuando RLS se active, `file_links` queda scoped por `organization_id`. **Es la única excepción no mecánicamente cerrada**; se documenta y se testea con un AC específico (AC-45).
- **Tablas de join puramente de authz de plataforma** (`role_permissions`, `user_roles`, `user_permissions`): llevan `organization_id` y FK compuesta a `roles`/`permissions`/`users`. Cerradas mecánicamente.

### 8.6 RLS latente (sin cambio respecto a v1.0, reforzado)

RLS se escribe y **desactiva** en MVP (`db:seed:rls`, ADR-04 §2.5). La activación (gateada, AC-12) sigue siendo el paso posterior a una auditoría cross-org. La v1.1 **no cambia** el gate; añade que, al activar RLS, las políticas usan `organization_id` (presente en todas las tablas incluidas las de join) como columna de partición. La PK compuesta hace que el activar RLS sea **más seguro**: incluso una policy mal escrita no puede cruzar org porque la FK subyacente ya lo impide.

### 8.7 Contratos fijados (aditivos a §5)

7. Toda tabla de negocio tiene **PK compuesta `(organization_id, id)`** salvo `organizations` (raíz) y `job_runs` (org nullable).
8. Toda tabla puramente relacional lleva `organization_id` no nullable y FKs compuestas a las entidades de negocio que referencia.
9. `file_links` es la única excepción polimórfica; se cierra con `organization_id` + validación en `canAccessResource` + RLS latente.
10. El aislamiento es **mecánico a nivel BD** (FK compuesta) + **defensa en servicio** (filtro) + **RLS latente** (tercera capa, gateada).

### 8.8 Consecuencias v1.1

- **Positivas:** una FK errónea o un bug de app **no** provoca fuga cross-org: la BD rechaza la inserción. El activar RLS más adelante es más seguro. El test cross-org es trivial de escribir (intentar insertar una FK cruzada → error de integridad).
- **Negativas:** las PK compuestas complican ORMs menos maduros; Drizzle las soporta, pero algunas queries y migraciones son más verbosas. Coste aceptable por la garantía de aislamiento. Las queries de negocio deben siempre incluir `organization_id` en el `WHERE`/`JOIN` (ya exigido por v1.0).
- **Reversibilidad:** volver a PK simple `id` es una migración que **debilita** el aislamiento; no se recomienda, pero es posible si se externaliza el aislamiento a RLS estricto.

### 8.9 Restricciones para SPECs (aditivas a §6)

- SPEC-001 v1.1 define las PKs compuestas de las tablas de plataforma y los ACs testeables (AC-43 a AC-46).
- Toda SPEC de módulo **debe** declarar sus tablas con PK compuesta `(organization_id, id)` y sus tablas de unión con `organization_id` + FKs compuestas. Cita BR-N200.
- Toda SPEC que añada una tabla polimórfica tipo `file_links` **debe** documentar la excepción y el AC que la cierra.

### 8.10 ACs derivadas (testeables en SPEC-001 v1.1)

- **AC-43** · Toda tabla de negocio tiene PK compuesta `(organization_id, id)` (script de introspección lo verifica; `organizations` y `job_runs` excluidas y justificadas).
- **AC-44** · Una FK compuesta rechaza inserción cross-org: test que intenta insertar `project_members` con `project_id` de org A y `user_id` de org B → error de integridad referencial.
- **AC-45** · `file_links` lleva `organization_id` no nullable; `canAccessResource` rechaza enlazar un `entity_id` de otra org (test con `file_links` cross-org → `403`/`404` vía policy).
- **AC-46** · `job_runs.organization_id` es nullable (jobs globales); los jobs globales no se filtran por org (test: `backup-bd` con `organization_id=null` corre sin filtro de org).
