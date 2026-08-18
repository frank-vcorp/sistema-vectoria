# ADR-20260817-02 · Multi-tenancy y aislamiento de datos

- **ID:** ARCH-20260817-02
- **Estado:** accepted
- **Versión:** 1.0
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-17
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
