# SPEC-20260817-001 · Plataforma Base

- **ID:** SPEC-20260817-001
- **Estado:** VERIFYING (v1.10 · QA-20260820-04 **PASS** sobre IMPL-20260820-04 · 0 P0/0 P1/0 P2/1 P3=R3 · **cierra P3-1 de QA-03** (regresión AC-28 restaurada: `rg "select\(|...|\.values\(" src/server/trpc/routers/` → 0) · gates locales PASS: typecheck/lint/tests 34/34/check-antipatterns 15/15 · **R3 clasificado como hardening preventivo no bloqueante** (cobertura del grep AC-28 sobre HTTP layer) y materializado como **AC-83** (simetría AC-28, patrón Drizzle-anclado, PASS hoy, automatización diferida P-H-1 → SOFIA) · gates BD/E2E/migrate/bootstrap/smoke NO EJECUTADOS (infra Coolify/secretos gated-Frank) · staging/producción NO_LISTO · **NO DONE** mientras falten gates obligatorios BD/E2E). *(v1.9: QA-20260820-03 **PASS_WITH_WARNINGS** sobre IMPL-20260820-03 · 0 P0/0 P1/0 P2/2 P3 · cierra los 4 hallazgos de QA-02: P1-1/P2-1/P3-3/P3-4 · pendiente-gates-BD/E2E-infra-Frank + P3-1-mini-deferred (SPEC-20260820-001) + P3-2-deferred-hardening — ver §16; **NO DONE** (BD/E2E gated-Frank). *(Histórico v1.8: IN_PROGRESS observaciones-GEMINI-FAIL-QA-20260820-02 sobre IMPL-20260820-02 — 1 P1 + 2 P2 + 4 P3; handoff correctivo IMPL-20260820-03 emitido a ATLAS con `READY_FOR_SOFIA`)* reconciliación de contrato técnico v1.8 aplicada: §4.1 drift AC-43/44 corregido (P3-1), §6 drift 415 corregido (P3-2), AC-81 (forceDb acciones críticas · P3-3) + AC-82 (claim `actor_role_code` · P3-4) añadidos testeables; pendiente-infra-Frank: PostgreSQL 16 + DATABASE_URL/MASTER_KEY/SESSION_SECRET/S3_*/VECTORIA_DIRECTOR_EMAIL/VECTORIA_SUPERUSER_PASSWORD ausentes — AC-36/AC-79, validaciones BD/bootstrap/E2E NO EJECUTADAS (gate BLOCKED); gates DONE: typecheck PASS + tests PASS + re-auditoría GEMINI PASS/PASS_WITH_WARNINGS sobre IMPL-20260820-03 + infra Frank; no commit/push/deploy)
- **Versión:** 1.10
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-17 (v1.0) · 2026-08-18 (v1.1) · 2026-08-19 (v1.2) · 2026-08-19 (v1.3) · 2026-08-19 (v1.4) · 2026-08-20 (v1.5) · 2026-08-20 (v1.6) · 2026-08-20 (v1.7) · 2026-08-20 (v1.8) · 2026-08-20 (v1.9) · 2026-08-20 (v1.10)
- **Motivo del estado:** Frank fue explícito: SPEC-001 queda `BLOCKED` hasta que la v1.1 esté lista y él dé OK final al stack v1.1. **No delegar a SOFIA.** La v1.1 incorpora las 7 correcciones profundas (Bootstrap, Autorización por recurso, Aislamiento relacional, Contrato crypto/CSD, Ciclo de auth, Jobs/reintentos, Roles seed) materializadas en ADR-04 a ADR-07 y en la profundización de ADR-02/03. **v1.2 (SOL-20260819-01):** añade AC-26..AC-34 (9 invariantes de arquitectura hexagonal ligera), las reglas 22–30, el contrato `Context` abstracto en §4.2 y la exclusión V2 en §3.2. No introduce código ni endpoints; la SPEC sigue `BLOCKED`. **v1.3 (delta ATLAS DEC-FUN-20260819-69 · opciones A1/B1/C1):** resuelve `DISCOVERY-GAP-20260818-01`; añade **AC-69** (label de rol seed editable por Director, `code` de cualquier rol inmutable) y **AC-70** (permisos de rol seed inmutables; desactivación de seed con usuarios asignados bloqueada hasta reasignación); **reformula AC-4** (DELETE físico prohibido siempre —seed y custom—; desactivación de seed permitida sin usuarios, bloqueada con usuarios vía AC-70); actualiza §2 fuentes (DEC-FUN-20260819-69, BR-N408/409/410), §5 invariante 4, §8 edge cases y §15 DoD; reconcilia ADR-04 §2.3/§4.2 con BR-N409. No introduce código ni endpoints. **v1.4 (delta ATLAS DEC-FUN-20260819-70/-71/-72 · sistema UI):** completa el cuerpo pendiente **AC-35..AC-68** (34 criterios) y el contrato UI/responsive en §17. AC-35..AC-41 reubican los ACs de bootstrap (referenciados en ADR-04 §7 como AC-26..AC-32 de v1.1, desplazados en v1.2 por los invariantes hexagonales) preservando contenido y trazabilidad. AC-42..AC-68 materializan el sistema de interfaz (Tailwind+shadcn, tema VectorIA, paridad móvil/tableta/escritorio, accesibilidad) conforme a ADR-20260819-03. Actualiza §2 fuentes (DEC-FUN-70/71/72, guía de marca, ADR-03), §3.1 (capa UI), §12 (validaciones UI), §15 DoD y §16 handoff. **No introduce código ni assets.** Queda pendiente exclusivamente el OK final de Frank al stack v1.1 (frente (a) de §10 PROYECTO.md); los frentes (b) gap roles-seed y (c) AC-69/AC-70 están cerrados; el contrato UI/responsive queda cerrado en este pase. **✅ v1.5 (2026-08-20):** Frank ratificó el **stack V1 completo** (Next.js/TS estricto/PG16/Drizzle/tRPC+Zod/pg-boss/S3-compatible + seguridad Argon2id/AES-256-GCM + Tailwind/shadcn tema VectorIA responsive) — frente (a) cerrado. SPEC-001 pierde su único frente pendiente y pasa `BLOCKED → READY`: DoR de implementación (§5.2) cubierto (ID, SPEC activa, refs funcionales, resultado técnico, contratos afectados/protegidos, AC-1..AC-70 verificables por ejecución, dependencias declaradas estándar, validaciones en §12, sin decisiones bloqueantes). **No se delega a SOFIA** en este turno: Frank autorizó sólo cerrar el contrato técnico pendiente, no iniciar código. ADR-01..07 + ADR-20260819-03 pasan `proposed → accepted`. **v1.6 (delta QA-20260820-01 FAIL · reconciliación de contrato post-auditoría):** GEMINI emitió veredicto **FAIL** (P0-1 troncal auth roto + 4 P1 + 3 P2 + 4 P3) sobre la implementación IMPL-20260820-01. La auditoría detectó defectos funcionales que los greps de imports no capturan. INTEGRA aplica **sólo reconciliación de contrato** (markdown SPEC, sin código — política §11) para destrabar la re-delegación a SOFIA: (1) **§4.1** aclara PK compuesta `(organization_id, id)` para toda tabla de negocio + FK compuestas `(organization_id, entity_id)` para tablas de unión — alinea con **AC-43** (ya existente desde v1.1) y **ADR-02 v1.1 §8.3**; el código previo usó `uniqueIndex(..., "pkey")` + FKs de una sola columna (P1-1), desobedeciendo el contrato. (2) **§4.2** aclara que `Context.user` es **nullable** (`null` si no hay sesión — NO fabricado) y que tRPC lee la **cookie httpOnly `vectoria_access`** (no header `Authorization: Bearer`) — alinea con regla 19 (JWT httpOnly) y ADR-06 §2.1; el código previo fabricaba `user.id="0000…"` y leía Bearer (P0-1). (3) **§6** añade mapeo de códigos HTTP 410/413/415/423 al enum tRPC v11 (que sólo expone 400/409/413) — los códigos no soportados se mapean a `BAD_REQUEST`/`CONFLICT` con `data.httpStatus` + `data.code` de dominio (P2-3). (4) **§11** añade **AC-71..AC-78** (8 criterios nuevos) que materializan los fixes P0/P1 restantes: AC-71 context cookie+null real + UNAUTHORIZED; AC-72 cableado `registerFailedLogin` + bitácora `auth.*`; AC-73 `audit.record` para eventos de sistema (actor null); AC-74 escritura real de políticas RLS; AC-75 `check-antipatterns.ts` + `public/brand/`; AC-76 lint ejecutable; AC-77 `compact()` sin `K` fuera de scope (typecheck); AC-78 `password.test` valida `code` no mensaje localizado. (5) Emite **DISCOVERY-GAP-20260820-01** a ATLAS para 2 preguntas funcionales que GEMINI identificó: (a) ¿actor sistema persistido en `users` vs `invitations.created_by` nullable? (P1-2); (b) ¿permisos de módulo (`registrar_tiempo`) se declaran en `shared/enums` y siembran en SPEC-001 o se diferían a SPEC-006? (P1-3). **No bloquea el resto del paquete de fixes** — SOFIA puede implementar P0-1, P1-1, P1-4, P2-1..P2-4 + typecheck + tests sin esperar DISCOVERY-GAP. SPEC-001 retrocede `READY → BLOCKED (observaciones-GEMINI-FAIL)` hasta: typecheck PASS + tests PASS + GEMINI re-PASS/PASS_WITH_WARNINGS sobre el paquete IMPL-20260820-02 + infra Frank. No se commitea.
- **Módulo funcional cubierto:** Autenticación y Usuarios + Áreas transversales (Administración base, auditoría, archivos, jobs, notificaciones in-app, configuración fiscal de organización) + **capa de presentación V1 (Tailwind+shadcn, tema VectorIA, paridad responsive)**.
- **ADRs de referencia:** ARCH-20260817-01 (stack), ARCH-20260817-02 (multi-tenancy), ARCH-20260817-03 (secretos), **ARCH-20260819-03 (sistema UI)**, ARCH-20260817-04 (bootstrap, cuyos ACs viven ahora en AC-35..AC-41).
- **Stack asumido:** ver ADR-20260817-01 (Next.js App Router + TypeScript estricto + PostgreSQL 16 + Drizzle + tRPC + Zod + pg-boss + S3-compatible + Argon2id + AES-256-GCM + Tailwind + shadcn/ui).

---

## 1. Resultado

Plataforma fundacional que todas las demás SPECs consumen: organización (multi-tenancy latente), autenticación, roles y permisos como datos (`hasPermission`), auditoría de acciones críticas, almacenamiento de archivos con enlaces firmados, cifrado de campos sensibles, jobs nocturnos idempotentes y notificaciones in-app. Sin esta SPEC, ninguna otra puede implementarse.

---

## 2. Fuentes funcionales por ID

### Decisiones (DEC-FUN)
- DEC-FUN-01 (sistema modular configurable, todo dato) — structura toda la SPEC.
- DEC-FUN-02 (roles NO hardcoded, `hasPermission`) — §5.
- DEC-FUN-03 (hasta 5 roles por usuario) — §5.
- DEC-FUN-20 (tooltips explicativos en admin/config) — §17, AC-67.
- DEC-FUN-21 (link de invitación sin OAuth/WhatsApp) — §4.
- DEC-FUN-22 (permisos custom aditivos por usuario) — §5.
- DEC-FUN-29 (notificaciones sólo in-app en MVP) — §9.
- DEC-FUN-39 (sólo es-MX en MVP, arquitectura preparada) — §3, §17.
- DEC-FUN-41 (respaldo BD diario, retención 30 días) — §10.
- DEC-FUN-46 (multi-org latente, `organization_id` en toda entidad) — §3, §5.
- DEC-FUN-20260819-69 (protección y personalización de roles base: label editable, permisos inmutables, desactivación con usuarios bloqueada; opciones A1/B1/C1) — §5, AC-4 (reformulado), AC-69, AC-70.
- **DEC-FUN-20260819-70** (Tailwind CSS + shadcn/ui; referencia Oatmeal sólo compositiva) — §17, AC-42, AC-50.
- **DEC-FUN-20260819-71** (tema VectorIA claro/oscuro reemplaza paleta/tipografía Oatmeal; activos canónicos en `context/VectorIA-Brand-Assets/`) — §17, AC-43..AC-48.
- **DEC-FUN-20260819-72** (paridad operativa móvil/tableta/escritorio; sin degradar acción a consulta) — §17, AC-52..AC-55.
- **DEC-FUN-20260820-74** (bootstrap crea y conserva usuario técnico SuperUser `contacto@vector-ia.mx` antes de la primera invitación; actor trazable; contraseña inicial = secreto de bootstrap pendiente) — §4.1/§4.2/§8, AC-37, AC-79.
- **DEC-FUN-20260820-75** (Plataforma Base siembra sólo permisos propios; cada módulo declara/siembra sus permisos al implementarse; `registrar_tiempo` → SPEC-006) — §7, AC-38, AC-80.

### Reglas de negocio (BR)
- B1 Organización y multi-tenancy: BR-016, BR-N200, BR-N201, BR-N202, BR-N203.
- B2 Actores, roles y permisos: BR-N127, BR-N128, BR-N131, BR-N204, BR-N205, BR-N206, BR-N207, BR-N208, BR-N209, BR-N210, BR-N211, BR-N212, BR-N408, BR-N409, BR-N410, BR-N412, BR-N413.
- B22 Auditoría: BR-N336, BR-N337, BR-N338, BR-N339, BR-N340.
- B24 Notificaciones: BR-N349, BR-N350.
- B27 Respaldo y disponibilidad: BR-N147, BR-N371, BR-N372, BR-N373, BR-N374.
- Reglas de cálculo transversales aplicables: BR-N330 (fechas), BR-N331 (estados de movimiento — se aplica a cuentas, pero la plataforma define el enum canónico).

### Actores y permisos
- `discovery/ACTORES-Y-PERMISOS.md` §1 (7 roles base), §2 (permisos de ejemplo), §5 (visibilidad y privacidad de datos), §6 (decisiones de cierre aplicadas).

### Sistema de interfaz (v1.4)
- `context/decisions/ADR-20260819-03-sistema-ui-tailwind-shadcn.md` (sistema UI, tokens, paridad, accesibilidad).
- `context/VectorIA-Brand-Assets/Guia-Marca-VectorIA.md` (tokens exactos: `#0A1F44`, `#D35400`, `#FFFFFF`, `#2C3E50`; sans-serif Montserrat/Inter).
- `discovery/HALLAZGOS.md` FND-20260819-01 (resolved vía DEC-FUN-72).

---

## 3. Alcance y exclusiones técnicas

### 3.1 Incluido

- Esquema `organizations` y `organization_fiscal_config` (multi-tenancy latente con `organization_id` en toda entidad de negocio).
- `users`, `credentials`, `user_roles`, `roles`, `permissions`, `role_permissions`, `user_permissions` (permisos custom aditivos), invitaciones firmadas.
- Servicio `hasPermission(code)` y contexto de sesión con `organization_id`, `user_id`, `roles[]`, `permissions[]`.
- `audit_logs` (acciones críticas, before/after, motivo, momento, actor, rol usado).
- `notifications` in-app y `notification_events` (eventos que disparan).
- `files` (metadatos de S3-compatible: `bucket_key`, `mime`, `size`, `sha256`, `uploaded_by`, `created_at`), servicio de enlaces firmados TTL ≤ 15 min, validación tipo+tamaño al subir.
- Servicio de cifrado AES-256-GCM con AAD contextual (`organization_id + tabla + campo`).
- Esquema de jobs `pg-boss` y registro de job runs idempotentes con auditoría.
- Enums canónicos como única fuente de estados (en código, no en BD; ver §7) y tablas `organization`/`user`/`audit` como base.
- Respaldo BD diario (configuración, no ejecución del backup operativo que es de Frank).
- **Capa de presentación V1 (v1.4, ADR-20260819-03):** Tailwind CSS + shadcn/ui como sistema de componentes accesibles; tema VectorIA claro/oscuro con tokens de marca; activos canónicos de `context/VectorIA-Brand-Assets/`; paridad operativa móvil/tableta/escritorio; accesibilidad WCAG AA. La plataforma provee la **base de UI** (layout, navegación, tema, toggle claro/oscuro, componentes shadcn copiados, preferencia de tema); las SPECs de módulo (002–011) añaden pantallas específicas respetando esta base.

### 3.2 Excluido (queda para SPECs posteriores)

- Catálogo de servicios, plantillas, cuestionarios → SPEC-003.
- Prospectos, clientes, contactos, datos fiscales del cliente → SPEC-002.
- Esquemas de negocio (cotización, OS, proyecto, factura, cobro, comisión, movimiento) → SPEC-004 a -009.
- Widgets de dashboard específicos por rol → SPEC-010 (esta SPEC sólo provee el mecanismo de notificaciones y la tabla `notifications`).
- Integración PAC FacturoPorTi → SPEC-007 (esta SPEC sólo provee el servicio de cifrado y archivos que la integridad usará).
- **API pública externa (REST/OpenAPI `/api/v1`, MCP, OAuth para consumidores IA):** diferida a V2 (SOL-20260819-01 §14–§15). V1 no diseña endpoints REST públicos ni promete compatibilidad pública. Ver ADR-01 §10 y AC-34.

---

## 4. Modelo técnico (contrato, sin código de producción)

### 4.1 Entidades de base de datos (esquema Drizzle, contrato tabular)

> Notación: `tabla (campo: tipo, ...)`. `UUID` = `uuid`. `TIMESTAMPTZ` = `timestamptz`. `JSONB` = `jsonb`.

> **v1.6 — Aislamiento multi-tenant mecánico (alinea con AC-2 + ADR-02 v1.1 §8.3):** toda tabla de negocio listada abajo tiene **PK compuesta `(organization_id, id)`** (salvo `organizations` —raíz— y `job_runs` —`organization_id` nullable para jobs globales). Las tablas de unión (`role_permissions`, `user_roles`, `user_permissions`, `file_links`) llevan `organization_id` no nullable y referencian a las entidades de negocio vía **FK compuesta `(organization_id, entity_id)`** — **no FK de una sola columna**. Esto garantiza a nivel BD que una fila de org A no puede referenciar una entidad de org B. La notación `id: uuid PK` en cada tabla se refiere al componente `id` de la PK compuesta; `organization_id` es el otro componente (ya listado como `FK→organizations not null`). El código previo usó `uniqueIndex(..., "pkey").on(organization_id, id)` + FKs de una sola columna — funcionalmente equivalente para unicidad pero **NO** para aislamiento mecánico cross-org (P1-1 de QA-20260820-01). SOFIA debe migrar a `primaryKey({ columns: [organization_id, id] })` + FKs compuestas (ver **AC-2** + **ADR-02 §8.3/§8.4**, ya existentes).
>
> **v1.8 — Reconciliación de numeración (P3-1 de QA-20260820-02):** una versión previa de §4.1 referenciaba "AC-43/AC-44" como criterio de PK/FK compuesta. Eso era un **drift de numeración**: en §11, AC-43 = "Tema claro: fondo `#FFFFFF`" y AC-44 = "Tema oscuro: fondo navy `#0A1F44`" (tokens de UI, no de datos). El criterio canónico del aislamiento multi-tenant mecánico es **AC-2** (`organization_id` en toda entidad) + **ADR-02 §8.3/§8.4** (PK/FK compuestas). La prosa de §4.1 se cumple (la implementación ya tiene PK/FK compuestas); sólo se corrige la referencia cruzada. **Sin cambio de producto ni de schema.**

#### `organizations`
- `id: uuid PK`
- `slug: text unique not null`
- `name: text not null`
- `currency: text not null default 'MXN'`
- `locale: text not null default 'es-MX'`
- `timezone: text not null default 'America/Mexico_City'`
- `active: boolean not null default true`
- `created_at: timestamptz not null default now()`
- `updated_at: timestamptz not null`

> Una sola organización sembrada en MVP (`seed`). `slug` único para URLs internas.

#### `organization_fiscal_config` (1:1 con `organizations`)
- `id: uuid PK`
- `organization_id: uuid FK→organizations unique not null`
- `rfc: text`
- `razon_social: text`
- `regimen: text`
- `pac_api_key_ciphertext: bytea` (AES-256-GCM; AAD = `organization_id + organization_fiscal_config + pac_api_key`)
- `csd_password_ciphertext: bytea` (AES-256-GCM; AAD contextual)
- `csd_cer_bucket_key: text` (referencia a `files`)
- `csd_pem_bucket_key: text` (referencia a `files`)
- `updated_by: uuid FK→users`
- `updated_at: timestamptz not null`
- índice en `organization_id`

> La lectura/escritura de campos sensibles queda en `audit_logs` sin valor (ADR-03 §3.4). La edición sólo por Director (BR-N201).

#### `users`
- `id: uuid PK`
- `organization_id: uuid FK→organizations not null`
- `email: text not null`
- `name: text not null`
- `active: boolean not null default true`
- `locked_until: timestamptz null`
- `failed_login_count: int not null default 0`
- `created_at: timestamptz not null default now()`
- `updated_at: timestamptz not null`
- unique `(organization_id, email)`
- índice en `organization_id`

> Multi-tenancy: el usuario pertenece a una organización. Si el usuario opera en múltiples organizaciones (futuro), se modela con tabla `user_organization_memberships` (no en MVP).

> **v1.7 — SuperUser técnico (DEC-FUN-20260820-74 / BR-N412):** el bootstrap crea y conserva una fila `users` técnica con `email='contacto@vector-ia.mx'` (única por `unique(organization_id, email)`) **antes** de emitir la primera invitación del Director. Es el **actor trazable** usado como `invitations.created_by` de la invitación fundacional (resuelve P1-2: `created_by` permanece `NOT NULL`, sin UUID cero) y como `audit_logs.actor_user_id` disponible para eventos del propio bootstrap. Va acompañada de su fila `credentials` (Argon2id) cuyo `password_hash` se deriva del secreto de bootstrap `VECTORIA_SUPERUSER_PASSWORD` (§4.2, AC-79). El SuperUser **no** recibe `user_roles`/`user_permissions` por defecto (no es un operador de negocio); es actor de trazabilidad. Re-ejecutar bootstrap no lo duplica (upsert por `(organization_id, email)`). La contraseña inicial **no** se inventa, documenta ni expone en SPEC/ADR/handoff/PROYECTO.md; sólo se fija el **nombre** de la variable y el **formato**.

#### `credentials` (1:1 con `users`, separado por seguridad)
- `id: uuid PK`
- `user_id: uuid FK→users unique not null`
- `password_hash: text not null` (Argon2id)
- `password_changed_at: timestamptz not null`
- `updated_at: timestamptz not null`

#### `invitations` (link de invitación firmado, DEC-FUN-21)
- `id: uuid PK`
- `organization_id: uuid FK→organizations not null`
- `email: text not null`
- `token_hash: text not null unique` (hash del token; el token claro va sólo en el enlace)
- `expires_at: timestamptz not null`
- `consumed_at: timestamptz null`
- `created_by: uuid FK→users not null`
- `created_at: timestamptz not null default now()`
- índice en `organization_id`, en `token_hash`

#### `roles`
- `id: uuid PK`
- `organization_id: uuid FK→organizations not null`
- `code: text not null` (p.ej. `director`, `vendedor`, `administrador`, `lider_proyecto`, `programador`, `disenador`, `qa`)
- `label: text not null`
- `is_seed: boolean not null default false` (los 7 base no se eliminan, BR-N127)
- `active: boolean not null default true`
- `created_at: timestamptz not null default now()`
- unique `(organization_id, code)`
- índice en `organization_id`

#### `permissions`
- `id: uuid PK`
- `organization_id: uuid FK→organizations not null`
- `code: text not null` (p.ej. `ver_costos`, `gestionar_facturas`, … ver ACTORES §2)
- `label: text not null`
- `created_at: timestamptz not null default now()`
- unique `(organization_id, code)`
- índice en `organization_id`

#### `role_permissions`
- `role_id: uuid FK→roles not null`
- `permission_id: uuid FK→permissions not null`
- PK compuesta `(role_id, permission_id)`

#### `user_roles`
- `user_id: uuid FK→users not null`
- `role_id: uuid FK→roles not null`
- `assigned_at: timestamptz not null default now()`
- `assigned_by: uuid FK→users not null`
- PK compuesta `(user_id, role_id)`
- check constraint: máximo 5 roles por usuario (BR-N204) — se valida en servicio y, como defensa, con trigger/partial index.

#### `user_permissions` (permisos custom aditivos, DEC-FUN-22, BR-N131)
- `user_id: uuid FK→users not null`
- `permission_id: uuid FK→permissions not null`
- `granted_at: timestamptz not null default now()`
- `granted_by: uuid FK→users not null`
- `granted_reason: text` (motivo)
- PK compuesta `(user_id, permission_id)`
- índice en `user_id`

> Siempre aditivos. Nunca restan. Toda otorgación/revocación en `audit_logs` (BR-N206).

#### `audit_logs` (BR-N336/337)
- `id: uuid PK`
- `organization_id: uuid FK→organizations not null`
- `actor_user_id: uuid FK→users null` (null si evento de sistema)
- `actor_role_code: text null` (rol funcional usado en acciones críticas combinables, §12 invariante)
- `entity_type: text not null`
- `entity_id: uuid not null`
- `action: text not null` (p.ej. `cotizacion.accept`, `os.authorize`, `project.create`, `factura.timbrar`, `cobro.confirm`, `comision.pay`)
- `before: jsonb null`
- `after: jsonb null`
- `reason: text null`
- `request_id: text null`
- `created_at: timestamptz not null default now()`
- índices: `(organization_id, created_at)`, `(entity_type, entity_id)`, `(actor_user_id)`

#### `project_log_entries` (BR-N259/BR-N338)
- `id: uuid PK`
- `organization_id: uuid FK→organizations not null`
- `project_id: uuid not null` (FK definido en SPEC-005)
- `entry_type: text not null` (enum: `reunion`, `decision`, `bloqueo`, `solicitud`, `cambio`, `entrega`, `aprobacion`, `reprogramacion`, `nota`, `sistema`)
- `body: text not null`
- `private: boolean not null default false` (BR-N339: notas privadas de dirección no visibles para técnicos)
- `created_by: uuid FK→users null`
- `created_at: timestamptz not null default now()`
- índice en `(organization_id, project_id, created_at)`

> La FK a `projects` se añade en SPEC-005. Aquí sólo se define el contrato de log entries.

#### `notifications` (BR-N349/BR-N350)
- `id: uuid PK`
- `organization_id: uuid FK→organizations not null`
- `user_id: uuid FK→users not null` (destinatario)
- `event_type: text not null` (enum de BR-N350)
- `title: text not null`
- `body: text`
- `link: text` (referencia interna a entidad)
- `read_at: timestamptz null`
- `created_at: timestamptz not null default now()`
- índice en `(organization_id, user_id, read_at)`

#### `files`
- `id: uuid PK`
- `organization_id: uuid FK→organizations not null`
- `bucket_key: text not null`
- `mime: text not null`
- `size: bigint not null`
- `sha256: text not null`
- `uploaded_by: uuid FK→users not null`
- `created_at: timestamptz not null default now()`
- índice en `organization_id`

> Relación de archivos con entidades: tabla `file_links` (BR-N340: archivos enlazables a cualquier entidad).
- `file_links`: `file_id uuid FK→files`, `entity_type text not null`, `entity_id uuid not null`, `created_at timestamptz`. PK compuesta.

#### `job_runs` (idempotencia y auditoría de jobs pg-boss, transversal)
- `id: uuid PK`
- `organization_id: uuid FK→organizations null` (null para jobs globales como backup BD)
- `job_name: text not null`
- `job_key: text not null` (clave de idempotencia, p.ej. `factura_recurrente:2026-08-17:org:UUID`)
- `status: text not null` (enum: `running`, `succeeded`, `failed`)
- `started_at: timestamptz not null`
- `finished_at: timestamptz null`
- `result: jsonb null`
- `error: text null`
- unique `(job_name, job_key)` para idempotencia
- índice en `(job_name, started_at)`

> Un job nocturno calcula su `job_key` determinista; antes de correr verifica si ya existe `succeeded`/`running` para el mismo `job_key` en el día y omite/encola.

### 4.2 Servicios (contrato de firma, no implementación)

- `hasPermission(ctx, code): boolean` — verifica si el usuario en el contexto tiene el permiso (vía `role_permissions` de sus roles + `user_permissions` aditivos). Único mecanismo de autorización (DEC-FUN-02, BR-N205).
- `requirePermission(ctx, code): void` — lanza `ForbiddenError` si `!hasPermission`.
- `audit(ctx, {entityType, entityId, action, before?, after?, reason?}): Promise<void>` — escribe en `audit_logs`. Para acciones críticas (BR-N336), captura `actor_role_code` desde el contexto de la acción.
- `crypto.encrypt(plaintext, {aad}): {ciphertext, nonce}` / `crypto.decrypt({ciphertext, nonce}, {aad}): plaintext` — AES-256-GCM.
- `files.upload(buffer, {mime, maxSizeKb, allowlist}): Promise<File>` — valida tipo+tamaño (BR-N372), sube a S3, registra metadatos.
- `files.signedUrl(file, {ttlSeconds=900}): Promise<URL>` — enlace firmado TTL ≤ 15 min (BR-N371).
- `session.open({userId, organizationId}): SessionToken` / `session.verify(token): Context` — JWT httpOnly `Secure; SameSite=Strict`.
- `invitations.issue({email, organizationId, createdBy, ttlDays=7}): {link}` / `invitations.consume(token, {name, password}): {userId}` — link firmado (DEC-FUN-21).
- **`superuser.bootstrap({organizationId})` (v1.7, DEC-FUN-20260820-74/BR-N412):** contrato del paso de seed que crea/conserva al SuperUser técnico (`contacto@vector-ia.mx`) **antes** de `invitations.issue` de la invitación fundacional. Lee la contraseña inicial del secreto de entorno `VECTORIA_SUPERUSER_PASSWORD` (vía `loadEnv()`, no de `process.env` directo en servicios); deriva `password_hash` Argon2id; inserta `users`+`credentials` upsert idempotente por `(organization_id, email)`. **Fail-safe:** si `VECTORIA_SUPERUSER_PASSWORD` está ausente/vacía, el paso aborta (exit !=0) nombrando la variable **sin** imprimir su valor (patrón AC-36); **no** crea el SuperUser con contraseña fabricada. El `id` resultante es el `createdBy` de la primera invitación. Ningún secreto en logs/audit/respuestas.
- `jobs.enqueue(name, payload, {jobKey}): Promise<JobId>` / `jobs.run(name, handler)` — pg-boss con idempotencia por `jobKey`.
- `Context` (tipo abstracto, no acoplado a transporte): `{ user: { id, organization_id } | null, roles: RoleCode[], permissions: PermissionCode[], requestId?: string, idempotencyKey?: string }`. **`user` es `null` cuando no hay sesión** (NO se fabrica un UUID cero — P0-1 de QA-20260820-01). Los servicios de aplicación reciben `Context` como parámetro; **no leen `cookies()`/`headers()`** de Next.js. **tRPC construye el `Context` leyendo la cookie httpOnly `vectoria_access`** (el JWT de sesión establecido por `app/api/auth/login/route.ts`) — **no** lee el header `Authorization: Bearer`; el cliente tRPC adjunta la cookie same-origin por defecto (no necesita header manual). `protectedProcedure` lanza `UNAUTHORIZED` (401) real cuando `ctx.user === null`. Un futuro adaptador REST/MCP (V2) lo construirá desde credenciales delegadas/scoped tokens. (SOL-20260819-01 invariante 5; AC-30; AC-71 nuevo v1.6.)

### 4.3 RLS latente (ADR-02 §3)

- Políticas RLS escritas y **desactivadas** en MVP para todas las tablas con `organization_id`.
- Una migración de activación (gateada por AC-12) las enciende cuando se añada la 2ª organización.

### 4.4 Enums canónicos (única fuente, en `shared/enums`)

Esta SPEC fija los enums transversales. Los específicos de negocio (Proyecto, Módulo, etc.) los definen sus SPECs respectivas y los añaden a la misma fuente única.

Transversales aquí:
- `audit_action` (no enum cerrado; string libre con namespaces por dominio).
- `job_status` = `running | succeeded | failed`.
- `notification_event_type` = los eventos de BR-N350.
- `project_log_entry_type` = los 10 tipos de BR-N259.

---

## 5. Reglas e invariantes

1. **`hasPermission` es el único mecanismo de autorización.** Nada de `if (user.role === 'director')` (DEC-FUN-02, BR-N205). AC-1.
2. **Toda entidad de negocio lleva `organization_id`** no nullable con FK e índice (DEC-FUN-46, BR-N200). AC-2.
3. **Hasta 5 roles por usuario** (BR-N204). AC-3.
4. **Roles base no se eliminan (DELETE físico prohibido); sólo se desactivan** (BR-N127). El Director puede crear roles adicionales (BR-N128), editar el label visible de un rol base sin alterar su `code` (BR-N408), **no** puede alterar los permisos de un rol base (BR-N409; las variaciones se resuelven vía roles custom o permisos aditivos por usuario) y no puede desactivar un rol base con usuarios asignados hasta reasignarlos (BR-N410). AC-4 (reformulado), AC-5, AC-69, AC-70.
5. **Permisos custom siempre aditivos; nunca restan** (BR-N131, DEC-FUN-22). AC-6.
6. **Toda otorgación/revocación de permiso en `audit_logs`** (BR-N206). AC-7.
7. **Toda acción crítica en `audit_logs`** con actor, entidad, antes/después, motivo, momento (BR-N336/337). AC-8.
8. **Acciones críticas registran el rol funcional usado** cuando la persona combina roles (invariante 12). AC-9.
9. **Configuración fiscal de organización única; sólo Director la edita; edición auditada** (BR-N201). AC-10.
10. **Secretos cifrados AES-256-GCM con AAD contextual; nunca en logs ni respuestas** (ADR-03). AC-11.
11. **Archivos vía enlaces firmados TTL ≤ 15 min; validación tipo+tamaño al subir; sin acceso público** (BR-N371/372). AC-13, AC-14.
12. **RLS escrito y desactivado en MVP; gate de activación con auditoría de políticas** (ADR-02). AC-12.
13. **Jobs idempotentes** por `job_key` determinista; un mismo `job_key` no corre dos veces en el mismo día. AC-15.
14. **Notificaciones sólo in-app** (DEC-FUN-29, BR-N349); eventos de BR-N350 generan notificación. AC-16.
15. **Listados paginados; dashboard presenta datos agregados** (BR-N373). AC-17.
16. **Respuesta < 2 s en operaciones comunes con datos de prueba** (BR-N374). AC-18.
17. **Respaldo BD diario retenido 30 días** (BR-N147, DEC-FUN-41) — configuración del job; la ejecución operativa del respaldo es de Frank. AC-19.
18. **Password Argon2id; política mínima 12 char mix de clases; bloqueo tras 5 intentos fallidos ventana móvil; reset por link firmado** (ADR-03). AC-20, AC-21, AC-22.
19. **Sesión JWT httpOnly `Secure; SameSite=Strict`; expiración configurable; refresco sin reautenticación dentro de ventana.** AC-23.
20. **Fechas persistidas en UTC; presentación en timezone de organización** (BR-N203). AC-24.
21. **Moneda MXN por defecto; campo `currency` reservado en toda entidad monetaria** (BR-N202). AC-25.
22. **La UI no accede directamente a Drizzle ni a PostgreSQL.** (SOL-20260819-01 inv.1). AC-26.
23. **Los casos de uso viven en servicios de aplicación independientes del transporte** (no importan `next`/`react`/`@/server/trpc`). (SOL inv.2). AC-27.
24. **tRPC es un adaptador interno; no contiene reglas de negocio exclusivas** (delega al servicio). (SOL inv.3). AC-28.
25. **DTOs y validaciones de entrada/salida usan esquemas Zod reutilizables** por tRPC y futuros adaptadores. (SOL inv.4). AC-29.
26. **AuthN/AuthZ se recibe vía un `Context` abstracto** (usuario, organización, permisos); los servicios no leen cookies/headers. (SOL inv.5). AC-30.
27. **`hasPermission`, `canAccessResource`, autorización por campo y auditoría se ejecutan en el servicio**, no sólo en el adaptador tRPC. (SOL inv.6). AC-31.
28. **Los resultados de negocio no exponen filas Drizzle directamente** (devuelven DTOs). (SOL inv.7). AC-32.
29. **Las operaciones con efectos soportan internamente idempotencia (`idempotencyKey`) y correlación (`requestId`)** cuando el dominio lo requiera, aunque V1 no publique contrato externo. (SOL inv.8). AC-33.
30. **Ninguna SPEC V1 diseña endpoints REST externos especulativos ni promete compatibilidad pública** (REST/OpenAPI `/api/v1`, MCP, OAuth IA = V2). (SOL inv.9). AC-34.

---

## 6. Casos borde y errores

> **v1.6 — Mapeo de códigos HTTP a tRPC v11 (P2-3 de QA-20260820-01):** el enum `TRPC_ERROR_CODE_KEY` de tRPC v11 expone `BAD_REQUEST (400)`, `UNAUTHORIZED (401)`, `FORBIDDEN (403)`, `NOT_FOUND (404)`, `CONFLICT (409)`, `PAYLOAD_TOO_LARGE (413)`, `METHOD_NOT_SUPPORTED (405)`, `TIMEOUT (408)`, `PRECONDITION_FAILED (412)`, `TOO_MANY_REQUESTS (429)`, `NOT_IMPLEMENTED (501)`, `INTERNAL_SERVER_ERROR (500)`. tRPC v11 **no** expone `GONE (410)` ni `LOCKED (423)` como códigos propios. Esta SPEC usa 410/413/415/423 en §6. Convención de implementación: `toTrpcError(e)` mapea los códigos no soportados al código tRPC más cercano (`410 GONE → CONFLICT 409` o `NOT_FOUND 404` según semántica; `423 LOCKED → CONFLICT 409` o `TOO_MANY_REQUESTS 429` si es por rate-limit) y pone el **código HTTP real + el `code` de dominio** en `data.httpStatus` + `data.code`. Los ACs que verifican códigos deben inspeccionar `error.data.code` / `error.data.httpStatus` (el contrato de dominio), no sólo `error.code` de tRPC (el transporte).
>
> **v1.8 — Reconciliación de contrato 415 (P3-2 de QA-20260820-02):** la versión de tRPC fijada en `package.json` (`@trpc/server: 11.0.0-rc.593`) **sí expone** `UNSUPPORTED_MEDIA_TYPE (-32015 / 415)` en `TRPC_ERROR_CODES_BY_KEY`. La prosa previa de §6 que lo declaraba ausente era **inexacta**. **Decisión de contrato (INTEGRA):** esta SPEC **mantiene** el mapeo `415 UNSUPPORTED_MEDIA_TYPE → BAD_REQUEST 400` (con `data.httpStatus=415` + `data.code='FILE_TYPE_NOT_ALLOWED'` preservados), aunque el código exista. Razón: (a) el mapeo actual funciona y preserva el contrato de dominio vía `data.httpStatus`/`data.code`; (b) `BAD_REQUEST` es estable y portable entre versiones de tRPC; (c) los tests que verifican `415` ya inspeccionan `data.httpStatus=415` (no `error.code==='UNSUPPORTED_MEDIA_TYPE'`), por lo que no hay regresión. La prosa queda corregida: el código 415 existe en el enum, pero la SPEC **elige** mapearlo a `BAD_REQUEST` por estabilidad. **Sin cambio de comportamiento del mapeo ya implementado**; sólo corrección de la afirmación documental.

- **Usuario con 5 roles intenta añadir un 6º:** `400 Bad Request` con `{ code: 'MAX_ROLES_EXCEEDED' }`. AC-3.
- **DELETE físico de un rol seed:** `409 Conflict` con `{ code: 'SEED_ROLE_NOT_DELETABLE' }` (BR-N127). AC-4.
- **DELETE físico de un rol custom:** `409 Conflict` con `{ code: 'ROLE_DELETE_FORBIDDEN' }` (soft-delete obligatorio; DISCOVERY-GAP-20260818-01 §3). AC-4.
- **Desactivar (`active=false`) un rol seed sin usuarios asignados en `user_roles`:** `200/204 OK` (sólo desactivable, no eliminable). AC-4.
- **Desactivar un rol seed con ≥1 fila en `user_roles`:** `409 Conflict` con `{ code: 'SEED_ROLE_HAS_ASSIGNED_USERS' }` hasta reasignar (BR-N410). AC-70.
- **Editar el `code` de cualquier rol (seed o custom):** `409 Conflict` con `{ code: 'ROLE_CODE_IMMUTABLE' }`. AC-69.
- **Editar el `label` de un rol seed por un usuario sin `gestionar_roles`:** `403 Forbidden` vía `requirePermission('gestionar_roles')`. AC-69.
- **Mutar `role_permissions` de un rol seed (INSERT/DELETE):** `409 Conflict` con `{ code: 'SEED_ROLE_PERMISSIONS_IMMUTABLE' }` (BR-N409). Para rol custom → `200/204` auditado. AC-70.
- **Edición de configuración fiscal por no-Director:** `403 Forbidden` vía `requirePermission('gestionar_config_fiscal')`. AC-10.
- **Login con password correcta tras 5 intentos fallidos:** la cuenta está `locked` hasta `locked_until` (ventana móvil). AC-21.
- **Invitación expirada o ya consumida:** `410 Gone` con `{ code: 'INVITATION_EXPIRED' }` o `409 Conflict` con `{ code: 'INVITATION_CONSUMED' }`. AC-22.
- **Subida de archivo con tipo no permitido o tamaño excedido:** `415`/`413` con `{ code: 'FILE_TYPE_NOT_ALLOWED' | 'FILE_TOO_LARGE' }` (BR-N372). AC-14.
- **Acceso a archivo sin enlace firmado o con TTL vencido:** `403`/`410`. AC-13.
- **Job reintentado con mismo `job_key` en el mismo día:** se omite (idempotencia). AC-15.
- **Lectura de entidad de otra organización:** con RLS activo, `0 filas`; con RLS inactivo (MVP, una sola org), defensa en servicio: `404 Not Found` (no revelar existencia). AC-2.
- **Cifrado/descifrado con AAD incorrecto:** falla la verificación del tag GCM → `500` (integridad rota; nunca devolver dato). AC-11.

---

## 7. Seguridad, privacidad y permisos aplicables

- **Visibilidad por rol** (ACTORES §3, BR-N207 a -212): la plataforma provee `hasPermission`; las SPECs de módulo definen qué permisos protegen qué recurso. Aquí se fijan los permisos base de la propia plataforma: `gestionar_usuarios`, `gestionar_roles`, `gestionar_config_fiscal`, `ver_auditoria`, `gestionar_cuestionarios`, `gestionar_catalogos`, `gestionar_plantillas`, `emitir_invitaciones`.
- **(v1.7 · DEC-FUN-20260820-75 / BR-N413) Permisos por módulo, no centralizados:** la Plataforma Base siembra **sólo** los permisos **propios** listados en `BASE_PERMISSIONS` (`shared/enums/index.ts`). Cada módulo (SPEC-002..011) declara y siembra sus permisos al implementarse (añadiéndolos al catálogo canónico y a `role_permissions` según su matriz). En particular, **`registrar_tiempo` NO es permiso de plataforma**: se difiere a **SPEC-006 (Proyectos — equipo y ejecución)**, que lo declará y sembrará para el rol `programador`. La semilla de plataforma deja `programador = []` (sin permisos sembrados por la plataforma) hasta SPEC-006. AC-38 reformulado y AC-80 reflejan esta frontera.
- **Secretos:** ver ADR-03. Ningún secreto en logs, respuestas o respaldos no cifrados.
- **Archivos de evidencia y comprobantes:** enlaces firmados TTL corto; validación de tipo; sin índice público.
- **Auditoría de acceso a secretos:** toda lectura/escritura de `pac_api_key`, `csd_password`, `csd_pem` se registra en `audit_logs` sin valor.
- **Privacidad de técnicos (BR-N208, BR-N339):** las notas privadas de dirección en `project_log_entries` (`private=true`) no se entregan a usuarios sin permiso `ver_notas_privadas`.

---

## 8. Migración/compatibilidad

- **Estado inicial:** base de datos vacía; migración inicial crea todas las tablas de esta SPEC + semilla de `organizations` (1), `roles` (7 seed) y `permissions` (los de ACTORES §2 + los de §7).
- **(v1.7) SuperUser técnico (DEC-FUN-20260820-74/BR-N412):** el seed de plataforma crea y conserva una fila `users`+`credentials` para el SuperUser `contacto@vector-ia.mx` **antes** de emitir la primera invitación. La contraseña inicial se consume del secreto de bootstrap `VECTORIA_SUPERUSER_PASSWORD` (Argon2id); fail-safe si ausente (AC-79). Es el `created_by` de la invitación fundacional del Director (P1-2 resuelto: `invitations.created_by` queda `NOT NULL`, sin UUID cero).
- **Primer usuario de negocio (Director):** se crea vía `invitations` emitida por el seed de plataforma (firmado por `MASTER_KEY`), con `created_by = SuperUser.id`; al consumirla, el primer usuario recibe el rol `director` con todos los permisos base de plataforma.
- **(v1.7) Permisos sembrados (DEC-FUN-20260820-75/BR-N413):** la semilla de plataforma siembra **sólo** `BASE_PERMISSIONS` (permisos propios). Los permisos de módulo los siembra cada SPEC al implementarse; `registrar_tiempo` → SPEC-006. AC-80.
- **Compatibilidad futura:** `currency`, `locale`, `timezone`, `multi-org` son latentes; no requieren migración posterior.
- **RLS:** migración de activación aparte, gateada por AC-12.

---

## 9. Notificaciones in-app (BR-N349/350)

- Eventos que generan notificación (BR-N350) — esta SPEC define el mecanismo y la tabla; las SPECs de módulo disparan los eventos:
  - `prospecto_sin_proxima_accion`
  - `cotizacion_proxima_vencer`
  - `os_pendiente_anticipo` / `os_pendiente_informacion`
  - `actividad_asignada`
  - `actividad_proxima_vencer` / `actividad_vencida`
  - `actividad_bloqueada`
  - `proyecto_en_riesgo` / `proyecto_retrasado`
  - `entregable_proximo` / `entregable_con_observaciones`
  - `cambio_pendiente_revision`
  - `factura_proxima_vencer` / `factura_vencida`
- Job nocturno `notificaciones-evaluacion` recorre eventos y crea `notifications` para los destinatarios correspondientes (rol-based: Director, Vendedor, Admin, PL, Programador según ACTORES §3 y BR-N344 a -348).
- In-app: lista no leída, marcar leída, no se envía por canal externo (DEC-FUN-29).

---

## 10. Jobs nocturnos (pg-boss)

Esta SPEC establece el **marco** de jobs. Los jobs específicos de negocio (facturación recurrente, comisiones, ZIP contador) se definen en sus SPECs pero usan este marco.

- **Job framework:** `pg-boss` con colas en la misma BD; cada job declara `job_name`, `job_key` determinista, `handler`.
- **Idempotencia:** antes de ejecutar, verifica `job_runs` para `(job_name, job_key)` con `status='succeeded'` en el día; si existe, omite. AC-15.
- **Jobs propios de la plataforma (transversales):**
  - `notificaciones-evaluacion` (corre nocturno; ver §9).
  - `backup-bd` (DEC-FUN-41, BR-N147): dispara el respaldo de la BD; la retención de 30 días es operativa (Frank/configura). AC-19.
  - `audit-purge-staging` (opcional): ningún dato de auditoría se elimina en MVP; sólo se marca archivado si volumen lo requiere (no activo en MVP).

---

## 11. Criterios de aceptación (testeables por construcción)

> Cada AC es verificable por ejecución real (comando + output esperado). SOFIA debe poder validar todos.

### AC-1 · `hasPermission` único mecanismo de autorización
- **Validación:** `pnpm typecheck` PASS + test Vitest que crea un usuario con rol `programador` (sin permiso `gestionar_usuarios`), invoca `requirePermission(ctx, 'gestionar_usuarios')` y espera `ForbiddenError`. Grep anti-patrones: `rg -n "user\.role\s*===|user\.role\s*==" src/` devuelve 0 coincidencias en código de producción (excluye tests).
- **Output esperado:** test verde; grep vacío.

### AC-2 · `organization_id` en toda entidad de negocio
- **Validación:** script de introspección Drizzle que liste tablas con `organization_id`. Comando: `pnpm tsx scripts/check-multitenancy.ts` (escrito por SOFIA) → imprime cada tabla con `organization_id NOT NULL` y `FK→organizations` y falla si alguna tabla de negocio lo omite. La lista de tablas de negocio la define SOFIA leyendo el esquema; se excluyen tablas puras de join sin sentido de negocio.
- **Output esperado:** `OK: N tablas con organization_id; 0 sin organization_id`.

### AC-3 · Máximo 5 roles por usuario
- **Validación:** test Vitest: asignar 6 roles al mismo usuario → la 6ª asignación lanza `400 { code: 'MAX_ROLES_EXCEEDED' }`. Asignar 5 → OK.
- **Output esperado:** test verde.

### AC-4 · Roles no se eliminan físicamente (DELETE prohibido); seed sólo desactivable
- **Validación:** test Vitest: (a) `DELETE` físico de un rol con `is_seed=true` → `409 { code: 'SEED_ROLE_NOT_DELETABLE' }` (BR-N127); (b) `DELETE` físico de un rol custom (`is_seed=false`) → `409 { code: 'ROLE_DELETE_FORBIDDEN' }` (soft-delete obligatorio; DISCOVERY-GAP-20260818-01 §3); (c) desactivar (`active=false`) un rol seed **sin** filas en `user_roles` → `200/204 OK` (sólo desactivable, no eliminable); (d) desactivar un rol seed **con** ≥1 fila en `user_roles` → `409 { code: 'SEED_ROLE_HAS_ASSIGNED_USERS' }` (BR-N410; ver AC-70) y, tras reasignar a todos los usuarios (0 filas), la desactivación → `200/204 OK` y se audita.
- **Output esperado:** test verde (4 aserciones a–d).

### AC-5 · Director crea roles adicionales
- **Validación:** test Vitest: usuario con permiso `gestionar_roles` crea rol `code='soporte_tecnico'` → 201; código del rol aparece en `roles`; entrada en `audit_logs` con `action='role.create'`.
- **Output esperado:** test verde; fila en `audit_logs`.

### AC-6 · Permisos custom siempre aditivos
- **Validación:** test Vitest: usuario con rol `programador` no tiene `ver_costos`; Director le otorga `ver_costos` vía `user_permissions` → `hasPermission(ctx, 'ver_costos') === true`; revocación no afecta otros permisos. Grep: `rg -n "revokePermission|removePermission" src/` devuelve 0 (no existe operación de "quitar" permiso del rol base; sólo se desactivan roles o se revocan permisos custom aditivos, ambos auditados).
- **Output esperado:** test verde.

### AC-7 · Otorgación/revocación de permiso en `audit_logs`
- **Validación:** test Vitest: tras otorgar y revocar un permiso custom, dos filas en `audit_logs` con `action IN ('permission.grant','permission.revoke')`, `actor_user_id` correcto, `entity_type='user'`, `entity_id=<user>`.
- **Output esperado:** test verde; 2 filas.

### AC-8 · Acciones críticas en `audit_logs`
- **Validación:** test Vitest que ejecuta un subconjunto representativo de acciones críticas de la propia plataforma (crear usuario, otorgar rol, editar config fiscal, emitir invitación) y verifica que cada una produce fila en `audit_logs` con `actor_user_id`, `entity_type`, `entity_id`, `action`, `created_at` no null.
- **Output esperado:** test verde; ≥1 fila por acción.

### AC-9 · Rol funcional registrado en acciones críticas combinables
- **Validación:** test Vitest: usuario con roles `[director, administrador]` ejecuta una acción crítica con contexto explícito de `actor_role_code='administrador'` → la fila de `audit_logs.actor_role_code === 'administrador'`. Mismo usuario ejecuta con `actor_role_code='director'` → `actor_role_code === 'director'`.
- **Output esperado:** test verde; dos filas con `actor_role_code` distinto para el mismo `actor_user_id`.

### AC-10 · Config fiscal única, sólo Director, edición auditada
- **Validación:** test Vitest: (a) intentar editar `organization_fiscal_config` con usuario no-Director (sin `gestionar_config_fiscal`) → `403`. (b) Director edita `rfc` → fila en `audit_logs` con `action='fiscal_config.update'`, `before` y `after` del `rfc`, **sin** valor de `pac_api_key`/`csd_password` en `before/after`. (c) Sólo una fila en `organization_fiscal_config` por organización (constraint unique).
- **Output esperado:** test verde.

### AC-11 · Secretos cifrados AES-256-GCM, AAD contextual, no logueados
- **Validación:** tests Vitest: (a) `crypto.encrypt('secret', {aad:'org+cfg+pac_api_key'})` produce `ciphertext+nonce` distintos en dos llamadas (nonce aleatorio). (b) `crypto.decrypt` con AAD distinto al de cifrado lanza `IntegrityError`. (c) Test de logs: tras editar config fiscal, el logger (mock) no recibió `pac_api_key`, `csd_password` ni el contenido del `.pem` en ningún campo.
- **Output esperado:** test verde; aserciones de no-presencia en logs.

### AC-12 · RLS escrito y desactivado en MVP; gate de activación
- **Validación:** (a) script `pnpm tsx scripts/check-rls.ts` lista las políticas RLS creadas y reporta `enabled=false` para todas en MVP. (b) Existe una migración `xxxx_enable_rls.sql` que las activa, **no aplicada** en MVP. (c) El gate de activación exige un script de auditoría que intenta leer cruzando organizaciones y verifica `0 filas`.
- **Output esperado:** `OK: N políticas RLS, todas enabled=false; migración de activación presente y no aplicada`.

### AC-13 · Enlaces firmados TTL ≤ 15 min, sin acceso público
- **Validación:** test Vitest: (a) `files.signedUrl(file, {ttlSeconds: 901})` lanza `400 { code: 'TTL_TOO_LONG' }`. (b) `files.signedUrl(file, {ttlSeconds: 900})` produce URL con expiración ≤ 15 min. (c) Acceso a `bucket_key` directo (sin enlace) → `403`.
- **Output esperado:** test verde.

### AC-14 · Validación de tipo y tamaño al subir
- **Validación:** test Vitest con allowlist `['application/pdf','text/xml','image/png','image/jpeg']` y `maxSizeKb=10240`: (a) subir PDF 5 MB → OK y fila en `files` con `sha256`. (b) subir `.exe` → `415 { code: 'FILE_TYPE_NOT_ALLOWED' }`. (c) subir PDF 11 MB → `413 { code: 'FILE_TOO_LARGE' }`.
- **Output esperado:** test verde.

### AC-15 · Jobs idempotentes por `job_key`
- **Validación:** test Vitest: encolar `jobs.enqueue('notificaciones-evaluacion', payload, {jobKey:'notificaciones-evaluacion:2026-08-17'})` dos veces la misma noche → el handler corre una sola vez; la segunda invocación omite o devuelve `status='succeeded'` preexistente. `job_runs` tiene una fila con `status='succeeded'`.
- **Output esperado:** test verde; 1 fila en `job_runs`.

### AC-16 · Notificaciones in-app sólo para eventos de BR-N350
- **Validación:** test Vitest: disparar un evento `cotizacion_proxima_vencer` para un Vendedor → se crea 1 fila en `notifications` para ese `user_id`. Disparar un evento no listado → `400 { code: 'UNKNOWN_NOTIFICATION_EVENT' }`. Marcar leída → `read_at` no null.
- **Output esperado:** test verde.

### AC-17 · Listados paginados y dashboard agregado
- **Validación:** tests Vitest + E2E Playwright: (a) listado de `audit_logs` con `?limit=20&offset=0` devuelve ≤20 filas y un `total`. (b) endpoint de dashboard devuelve datos agregados (conteos), no lista cruda.
- **Output esperado:** test verde.

### AC-18 · Respuesta < 2 s en operaciones comunes
- **Validación:** test E2E Playwright (con seed de datos de prueba definido por SOFIA) que mide el p95 de 5 endpoints comunes (login, list usuarios, list notificaciones, upload file pequeño, list audit_logs) y verifica `< 2000 ms` cada uno. Si el entorno de CI no puede garantizar hardware, marcar `validation: performance-baseline` y documentar el p95 obtenido.
- **Output esperado:** p95 < 2000 ms (o documentado con justificación).

### AC-19 · Job de respaldo BD configurado (retención 30 días)
- **Validación:** el job `backup-bd` está registrado en `pg-boss` con schedule nocturno y `jobKey` diario. Test Vitest: encolar `backup-bd` con `jobKey='backup-bd:2026-08-17'` → fila en `job_runs`. **La ejecución operativa del respaldo físico y la retención de 30 días en disco es de Frank** (acción infraestructural fuera de SPEC); la SPEC sólo verifica que el job está registrado y corre sin error en modo `dry-run`.
- **Output esperado:** test verde; `job_runs` con `status='succeeded'` en `dry-run`.

### AC-20 · Password Argon2id y política mínima
- **Validación:** test Vitest: (a) registrar password de 11 caracteres → `400 { code: 'PASSWORD_TOO_WEAK' }`. (b) password 12 char mix de clases → hash Argon2id (`$argon2id$...`). (c) verificar hash con `argon2.verify`.
- **Output esperado:** test verde; hash con prefijo `$argon2id$`.

### AC-21 · Bloqueo tras 5 intentos fallidos (ventana móvil)
- **Validación:** test Vitest: 5 logins fallidos consecutivos para el mismo usuario → 6º intento (aunque password correcta) → `423 { code: 'ACCOUNT_LOCKED', locked_until: <future> }`. Tras ventana (mock de reloj) → login OK y `failed_login_count` reset a 0.
- **Output esperado:** test verde.

### AC-22 · Invitaciones firmadas, expiración y consumo
- **Validación:** test Vitest: (a) Director emite invitación → `invitations` con `token_hash` (no el token claro), `expires_at` = ahora + 7 días. (b) Consumir con token válido → crea `users`, `credentials`, asigna rol indicado, `consumed_at` no null. (c) Consumir con token expirado (mock reloj) → `410 { code: 'INVITATION_EXPIRED' }`. (d) Consumir dos veces → `409 { code: 'INVITATION_CONSUMED' }`.
- **Output esperado:** test verde.

### AC-23 · Sesión JWT httpOnly Secure SameSite=Strict
- **Validación:** test E2E Playwright: tras login, la cookie de sesión tiene `httpOnly=true`, `secure=true` (en entorno HTTPS), `sameSite='Strict'`. Un intento de leerla desde JS en el cliente → `undefined`.
- **Output esperado:** test verde; cookie inaccesible desde JS.

### AC-24 · Fechas UTC en BD, presentación en timezone de organización
- **Validación:** test Vitest: insertar `audit_logs` con `now()` → persistido en UTC. Función `formatInOrgTz(date, orgId)` devuelve la hora en `America/Mexico_City` para la organización seed.
- **Output esperado:** test verde; diferencia horaria coherente con offset CDMX.

### AC-25 · Moneda MXN por defecto, campo `currency` reservado
- **Validación:** test Vitest: `organizations` seed tiene `currency='MXN'`. Toda entidad monetaria definida en SPECs futuras lleva `currency: text not null default 'MXN'`; script `check-multitenancy.ts` extendido o `check-currency.ts` lo verifica en cada SPEC cuando se añada. En esta SPEC: verificar `organizations.currency='MXN'`.
- **Output esperado:** `OK: organization currency=MXN`.

### AC-26 · UI sin acceso directo a Drizzle/PostgreSQL (SOL inv.1)
- **Validación:** grep anti-patrón sobre la capa de UI/cliente: `rg -n "drizzle-orm|@/server/db" src/modules/ src/app/ src/components/ --glob '!*.server.ts' --glob '!**/server/**'` devuelve 0 coincidencias. Adicional: `rg -n "drizzle-orm|@/server/db" src/components/` → 0.
- **Output esperado:** grep vacío (0 coincidencias en componentes de UI).

### AC-27 · Servicios de aplicación independientes del transporte (SOL inv.2)
- **Validación:** (a) grep: `rg -n "@/server/trpc|from 'next'|from 'react'|@trpc/server" src/server/services/` → 0 (los servicios no importan transporte). (b) test Vitest que invoca un método de servicio **directamente** (sin tRPC) con un `Context` de prueba y obtiene el resultado esperado.
- **Output esperado:** grep vacío; test verde (servicio invocable sin transporte).

### AC-28 · tRPC adaptador interno sin reglas exclusivas (SOL inv.3)
- **Validación:** (a) grep: `rg -n "select\(|insert\(|update\(|delete\(|\.values\(" src/server/trpc/routers/` → 0 (los routers no contienen consultas Drizzle directas; delegan a servicios). (b) test Vitest: un procedure tRPC y la llamada directa al servicio subyacente producen el **mismo resultado** para el mismo input (no hay lógica divergente en el router).
- **Output esperado:** grep vacío; test verde (resultado idéntico).
- **v1.9 (P3-1 de QA-20260820-03):** el grep retorna actualmente **2 matches** (`src/server/trpc/routers/auth.ts:54,86` — lookup de actor por email antes de `audit.record` en los caminos `invalid_credentials`/`account_locked`). Es una **regresión de este contrato** introducida por IMPL-20260820-03 (espejo del patrón HTTP `login/route.ts`, fuera del scope del grep). QA-03 la clasifica P3 no bloqueante; INTEGRA confirma que **requiere fix** para restaurar el grep → 0 (no es un riesgo tolerable: el criterio es verificable y falla). Fix delegado a SOFIA vía **mini-SPEC `SPEC-20260820-001-auth-lookup-actor`** (BACKLOG, diferido no bloqueante): añadir `auth.lookupActor(email)` al servicio y refactorizar los 2 call sites del router + los 2 del HTTP route. Ver §16.1.
- **v1.10 (cierre P3-1 de QA-03 · QA-20260820-04 PASS):** la mini-SPEC `SPEC-20260820-001` fue implementada como **IMPL-20260820-04** (`auth.lookupActor` interno aditivo; refactor simétrico del router tRPC y del HTTP route). **QA-20260820-04 = PASS** (0 P0/P1/P2; 1 P3=R3). El grep AC-28 retorna **0** (`rg "select\(|insert\(|update\(|delete\(|\.values\(" src/server/trpc/routers/` verificado por INTEGRA y por QA-04 §B/§C). typecheck/lint/tests 34/34/check-antipatterns 15/15 PASS. El P3-1 queda **cerrado**. El R3 residual (cobertura del grep AC-28 sobre el HTTP layer) se materializa como **AC-83** (ver abajo) clasificado hardening preventivo no bloqueante. SPEC-001 sigue `VERIFYING` (NO `DONE` hasta gates BD/E2E con evidencia + GEMINI re-verificación BD). Ver §16.1.

### AC-29 · DTOs/validación Zod reutilizables (SOL inv.4)
- **Validación:** (a) los esquemas de entrada/salida de los servicios viven en `src/shared/zod/` o `src/server/services/<dominio>/schemas` y son importados por tRPC y por el servicio. (b) test Vitest: el esquema valida el input sin tRPC y el servicio devuelve objetos conformes al esquema de salida. (c) grep anti-patrón: `rg -n "z\.object\(" src/server/trpc/routers/` → idealmente 0 (los routers referencian esquemas compartidos; se admiten wrappers triviales).
- **Output esperado:** test verde; esquemas importados desde ubicación compartida.

### AC-30 · Context abstracto de identidad/organización/permisos (SOL inv.5)
- **Validación:** (a) grep: `rg -n "cookies\(\)|headers\(\)|next/headers|request\.cookies|request\.headers" src/server/services/` → 0 (los servicios no leen transporte). (b) test Vitest: un servicio recibe un `Context` literal `{ user:{id, organization_id}, roles:[], permissions:[], requestId }` y opera sin acceso a `Request`/`cookies`.
- **Output esperado:** grep vacío; test verde.

### AC-31 · Seguridad y auditoría ejecutan en el servicio (SOL inv.6)
- **Validación:** test Vitest que invoca un servicio con efecto (p.ej. crear usuario/rol) **directamente** (sin pasar por tRPC) con un `Context` sin permiso `gestionar_usuarios` → lanza `ForbiddenError`; con permiso → ejecuta y produce fila en `audit_logs` con `actor_user_id`, `action`, `request_id` (tomado del `Context.requestId`). La seguridad no vive sólo en el router tRPC.
- **Output esperado:** test verde; fila en `audit_logs` con `request_id` propagado desde el `Context`.

### AC-32 · Resultados no exponen filas Drizzle (SOL inv.7)
- **Validación:** (a) los servicios declaran tipos de retorno DTO (Zod output o TS explícito), no `SelectUser`/`InferSelectModel` crudos en su superficie. (b) test Vitest: llamar a un servicio de lectura devuelve un objeto sin campos internos no autorizados (p.ej. sin `password_hash`, sin `pac_api_key_ciphertext`, sin metadata Drizzle). (c) grep: `rg -n "InferSelectModel|Select.*Schema" src/server/services/` → idealmente 0 en retornos públicos (sólo admitido en mapeo interno).
- **Output esperado:** test verde; respuesta sin secretos ni metadata interna.

### AC-33 · Idempotencia y correlación internas (SOL inv.8)
- **Validación:** test Vitest: (a) un servicio de escritura acepta `idempotencyKey` (en el `Context` o input); llamarlo dos veces con el mismo `idempotencyKey` ejecuta el efecto **una sola vez** (la segunda es no-op o devuelve el resultado cacheado). (b) el `Context.requestId` se propaga a `audit_logs.request_id` (complementa AC-8). AC-15 ya cubre idempotencia de jobs; este AC cubre operaciones de aplicación con efecto cuando el dominio lo requiera.
- **Output esperado:** test verde; `audit_logs.request_id` poblado.

### AC-34 · Sin REST público especulativo en V1 (SOL inv.9)
- **Validación:** (a) grep: `rg -n "/api/v1|app/api/v1|swagger|openapi" src/` → 0 (no hay rutas públicas `/api/v1` ni spec OpenAPI en V1). (b) revisión documental: las SPECs 002–011 no declaran endpoints REST externos ni compatibilidad pública (verificación al producir cada SPEC; esta SPEC fija la regla y ADR-01 §10.5 la hace cumplir en SPEC-002..011).
- **Output esperado:** grep vacío; afirmación documental de cero endpoints públicos en V1.

### AC-35 · `pnpm bootstrap` único comando, orden estricto, idempotente (reubicado desde ADR-04)
- **Validación:** (a) `pnpm bootstrap` orquesta en orden `deps:check → db:migrate → db:seed:plataforma → db:seed:catalog → db:seed:rls → smoke`. (b) Re-ejecutar `pnpm bootstrap` sobre BD ya sembrada no duplica filas (upsert por `slug`/`code`) y no re-aplica migraciones ya aplicadas → exit 0. (c) Un paso intermedio fallido no deja el sistema en estado intermedio (cada paso transaccional salvo la migración, que corre primero).
- **Output esperado:** test verde; segunda ejecución exitosa sin duplicación.
- **Trazabilidad:** ADR-20260817-04 §2.1, §3.1. (Reubica el contenido referido como AC-26 en ADR-04 §7 v1.1, desplazado por los invariantes hexagonales en SPEC-001 v1.2.)

### AC-36 · `deps:check` valida envs y conectividad; falla sin secretos
- **Validación:** (a) Con `DATABASE_URL`/`MASTER_KEY`/`SESSION_SECRET`/`S3_*`/`VECTORIA_DIRECTOR_EMAIL` ausentes → exit !=0 y mensaje que nombra la variable faltante **sin** imprimir su valor. (b) Con `MASTER_KEY` no decodificable como 32 bytes → exit !=0. (c) Con conectividad TCP a `DATABASE_URL` y `S3_ENDPOINT` OK y Postgres ≥16 → el paso pasa.
- **Output esperado:** exit !=0 sin secreto en stdout/stderr; paso verde con envs completos.
- **Trazabilidad:** ADR-04 §2.2, §3.2. (Reubica AC-27 de ADR-04 §7 v1.1.)

### AC-37 · `db:seed:plataforma` siembra org + SuperUser + 7 roles seed + permisos propios + invitación Director; upsert idempotente
- **Validación:** tras `db:seed:plataforma`: (a) 1 fila en `organizations` con `slug='default'`, `currency='MXN'`, `locale='es-MX'`. (b) 7 filas en `roles` con `is_seed=true` (`director`/`vendedor`/`administrador`/`lider_proyecto`/`programador`/`disenador`/`qa`). (c) Permisos **propios de plataforma** presentes en `permissions` (sólo `BASE_PERMISSIONS`; ver AC-80). (d) 1 fila `users`+`credentials` para el SuperUser `contacto@vector-ia.mx` con `credentials.password_hash` Argon2id (`$argon2id$…`), creada **antes** de la invitación (DEC-FUN-20260820-74/BR-N412). (e) 1 `invitations` no consumida ni expirada para `VECTORIA_DIRECTOR_EMAIL`, con `token_hash` (no token claro en BD) y `created_by = <SuperUser.id>` (NO `"00000000-…"` — P1-2 resuelto). (f) Re-ejecutar no duplica (upsert por `slug`/`code`/`(organization_id,email)`). (g) El upsert **preserva** `label` editados de roles seed (no sobrescribe por default — BR-N408, ADR-04 §4.2 v1.2).
- **Output esperado:** conteos correctos; SuperUser presente con hash Argon2id; `invitations.created_by` ≠ UUID cero; re-ejecución sin duplicación; labels preservados.
- **Trazabilidad:** ADR-04 §2.3, §3.3. DEC-FUN-21, DEC-FUN-20260820-74, BR-N127/205/408/412. (Reubica AC-28 de ADR-04 §7 v1.1.)

### AC-38 · `role_permissions` seed respeta la matriz de visibilidad con permisos propios de plataforma (BR-N207..N212; DEC-FUN-20260820-75/BR-N413)
- **Validación:** tras la semilla: (a) `vendedor` no tiene `ver_costos` ni permisos financieros ajenos (BR-N207). (b) `lider_proyecto` no tiene `ver_costos`/márgenes/CxC ajenas/comisiones ajenas (BR-N210). (c) `programador` queda **sin permisos sembrados por la plataforma** (`programador = []` en `SEED_ROLE_PERMISSION_CODES` de `seed-data.ts`) — `registrar_tiempo` **no** es permiso de plataforma y se difiere a SPEC-006 (DEC-FUN-20260820-75/BR-N413); no aparece en `BASE_PERMISSIONS` ni en `permissions` tras el seed de plataforma. (d) `director` recibe todos los permisos base de plataforma (BR-N211). (e) `administrador` recibe comercial/financiero de plataforma, no `ver_costos` en profundidad (BR-N209). Script `pnpm tsx scripts/check-seed-permissions.ts` verifica el mapa usando **sólo** `BASE_PERMISSIONS` (rechaza cualquier `code` de módulo como `registrar_tiempo` en la semilla de plataforma).
- **Output esperada:** `OK: matriz BR-N207..N212 consistente con permisos propios de plataforma; registrar_tiempo NO sembrado (→ SPEC-006)`.
- **Trazabilidad:** ADR-04 §2.3, §3.4. DEC-FUN-20260820-75, BR-N208/N212/N413. (Reubica AC-29 de ADR-04 §7 v1.1.)

### AC-39 · `db:seed:catalog` stub idempotente (no falla) hasta SPEC-003
- **Validación:** con SPEC-003 aún no `READY`, el paso `db:seed:catalog` es un stub que registra en `audit_logs` que la semilla de catálogo/plantillas/cuestionarios quedó pendiente y **no falla** (exit 0). No bloquea el AC de login operativo. Cuando SPEC-003 esté `READY`, el stub se reemplaza por la semilla real sin cambiar `pnpm bootstrap`.
- **Output esperado:** exit 0 con entrada en `audit_logs`; cero filas en tablas de catálogo (vacías hasta SPEC-003).
- **Trazabilidad:** ADR-04 §2.4, §3.5, P-04-3. (Reubica AC-30 de ADR-04 §7 v1.1.)

### AC-40 · `db:seed:rls` crea políticas inactivas (`enabled=false`)
- **Validación:** `pnpm tsx scripts/check-rls.ts` (AC-12) reporta `enabled=false` para todas las tablas con `organization_id` tras el bootstrap. Idempotente: re-ejecutar no recrea políticas existentes.
- **Output esperado:** `OK: N políticas RLS, todas enabled=false`.
- **Trazabilidad:** ADR-04 §2.5, §3.6; ADR-02 v1.1. (Reubica AC-31 de ADR-04 §7 v1.1.)

### AC-41 · `smoke` verifica login operativo (credencial inválida → 401; `/health` → 200; RLS inactivo; pg-boss init)
- **Validación:** el smoke del bootstrap verifica: (a) las tablas de plataforma existen; (b) la organización seed existe con `currency='MXN'`; (c) los 7 roles seed existen con `is_seed=true`; (d) la invitación del Director existe y es **consumible** (token válido contra `token_hash`, sin consumirla); (e) login con credencial inválida → `401`; `/health` → `200` en < 500 ms; (f) `pg-boss` inicializado (tabla de colas presente); (g) RLS `enabled=false`. El smoke **no** crea el Director automáticamente (requiere consumir la invitación, acto humano).
- **Output esperado:** smoke verde; `bootstrap` exit 0.
- **Trazabilidad:** ADR-04 §2.6, §3.7. (Reubica AC-32 de ADR-04 §7 v1.1.)

### AC-42 · Tailwind CSS + shadcn/ui configurados; componentes copiados al repo (DEC-FUN-70)
- **Validación:** (a) `tailwind.config` y `postcss` presentes; `@tailwindcss` en dependencias. (b) `src/components/ui/*` contiene componentes shadcn copiados (Button, Input, Dialog, Table, etc.). (c) Grep anti-patrón: `rg -n "from '@mui|from 'material-ui|antd|@chakra-ui" src/` → 0 (ningún otro framework de UI). (d) Los componentes usan Radix primitives (`@radix-ui/*`).
- **Output esperado:** typecheck PASS; grep vacío; componentes presentes.
- **Trazabilidad:** ADR-20260819-03 §3, §5.1; DEC-FUN-70.

### AC-43 · Tema claro: fondo `#FFFFFF` y alto espacio negativo (DEC-FUN-71)
- **Validación:** (a) `--background: #FFFFFF` definido en tema claro (CSS variable / Tailwind token). (b) Revisión visual (screenshot E2E en viewport 1280) muestra fondo blanco con espaciado generoso. **Validación funcional: Playwright E2E + revisión visual.**
- **Output esperado:** token `#FFFFFF` en tema claro; screenshot coherente.
- **Trazabilidad:** ADR-03 §3, guía de marca.

### AC-44 · Tema oscuro: fondo navy `#0A1F44` (DEC-FUN-71)
- **Validación:** `--background: #0A1F44` definido en tema oscuro; al activar el toggle, el fondo renderiza navy. Playwright E2E alterna tema y verifica el token aplicado.
- **Output esperado:** token navy en tema oscuro; toggle cambia el fondo.
- **Trazabilidad:** ADR-03 §3.

### AC-45 · Acento naranja quemado `#D35400` para acciones (DEC-FUN-71)
- **Validación:** `--primary: #D35400` definido; los CTAs (Button variant `default`) y el foco visible (ring) usan el acento. Grep: `rg -n "var\(--primary\)|#D35400" src/components/ui/` muestra uso del acento.
- **Output esperado:** acento aplicado a CTAs y foco.
- **Trazabilidad:** ADR-03 §3.

### AC-46 · Texto secundario `#2C3E50` (DEC-FUN-71)
- **Validación:** `#2C3E50` definido como token de texto secundario en tema claro (y un derivado de legibilidad en oscuro); componentes de texto secundario lo usan.
- **Output esperado:** token presente y aplicado.
- **Trazabilidad:** guía de marca; ADR-03 §3.

### AC-47 · Tipografía sans-serif moderna, no serif editorial (DEC-FUN-71)
- **Validación:** la familia tipográfica configurada es sans-serif (Inter/Montserrat). Grep anti-patrón: `rg -n "font-(serif|Georgia|'Times)" src/` → 0 en body/títulos (sólo se admite serif si una pieza de marca lo exige, lo cual no ocurre). **Validación funcional: Playwright E2E verifica computed `font-family` no contiene `serif`.**
- **Output esperado:** grep vacío; `font-family` sans-serif.
- **Trazabilidad:** guía de marca §3; ADR-03 §3.

### AC-48 · Activos de marca canónicos desde `context/VectorIA-Brand-Assets/` (DEC-FUN-71)
- **Validación:** (a) El logo oficial (`VectorIA-Logo-Oficial-Transparente.png`) se referencia desde el asset canónico o una copia en `public/brand/` servida sin alteración. (b) No existe copia de assets del kit Oatmeal: `rg -n "oatmeal|olive_instrument" src/ public/` → 0 (salvo documentación). (c) El isotipo/chevron de marca se usa como elemento gráfico sutil.
- **Output esperado:** logo canónico referenciado; grep Oatmeal vacío.
- **Trazabilidad:** guía de marca §1; ADR-03 §3, §4.4.

### AC-49 · Toggle claro/oscuro persistido por usuario (DEC-FUN-71)
- **Validación:** Playwright E2E: (a) existe un toggle de tema; al activarlo, el tema cambia y persiste tras recarga (preferencia en `localStorage` o en `users`). (b) Fallback a preferencia del SO cuando no hay elección del usuario.
- **Output esperado:** tema persiste tras recarga.
- **Trazabilidad:** ADR-03 §3.

### AC-50 · Cero copia de código/assets/layout del kit Oatmeal (DEC-FUN-71, handoff)
- **Validación:** (a) `rg -n "oatmeal|olive_instrument|olive-|@tailwindplus" src/ public/ tailwind.config.*` → 0 (salvo `context/` documentación). (b) Revisión documental: la SPEC y ADR-03 declaran que sólo se toma sobriedad compositiva; no hay import de componentes/assets/layout del kit. (c) No existen archivos de layout copiados del kit.
- **Output esperado:** grep vacío; afirmación documental.
- **Trazabilidad:** ADR-03 §1, §4.5; handoff §fuera de alcance.

### AC-51 · Breakpoints responsive configurados (sm/md/lg/xl)
- **Validación:** `tailwind.config` declara los breakpoints canónicos (`sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`). Los viewports canónicos de prueba (móvil `375`, tableta `768`, escritorio `1280`) se usan en E2E (AC-52..AC-54, AC-66).
- **Output esperado:** breakpoints presentes; E2E usa los 3 viewports.
- **Trazabilidad:** ADR-03 §3.

### AC-52 · Pantallas de V1 operables en móvil (375px) — E2E (DEC-FUN-72)
- **Validación:** Playwright E2E recorre flujos representativos (login, listado, detalle, formulario, modal) en viewport `375` (móvil) y verifica que cada acción autorizada es ejecutable (no bloqueada por layout). Ver AC-66 para la matriz de flujos.
- **Output esperado:** E2E móvil PASS.
- **Trazabilidad:** DEC-FUN-72; ADR-03 §4.3.

### AC-53 · Pantallas de V1 operables en tableta (768px) — E2E (DEC-FUN-72)
- **Validación:** misma matriz de AC-52 en viewport `768` (tableta).
- **Output esperado:** E2E tableta PASS.
- **Trazabilidad:** DEC-FUN-72.

### AC-54 · Pantallas de V1 operables en escritorio (1280px) — E2E (DEC-FUN-72)
- **Validación:** misma matriz de AC-52 en viewport `1280` (escritorio).
- **Output esperado:** E2E escritorio PASS.
- **Trazabilidad:** DEC-FUN-72.

### AC-55 · Ninguna acción degradada a consulta por viewport (DEC-FUN-72)
- **Validación:** (a) Revisión documental por SPEC: cada acción de negocio declarada en SPEC-002..011 figura como operable en los 3 viewports (no se marca "sólo lectura en móvil"). (b) Grep anti-patrón: `rg -n "soloLecturaMovil|mobileReadOnly|readOnly.*mobile" src/` → 0. (c) E2E: una acción de escritura (p.ej. crear cotización) se completa en móvil sin degradarse a vista.
- **Output esperado:** grep vacío; afirmación documental; E2E escritura en móvil PASS.
- **Trazabilidad:** DEC-FUN-72; ADR-03 §4.3.

### AC-56 · Tablas de datos responsive (scroll horizontal o vista-card) en todos los viewports
- **Validación:** Playwright E2E: un listado paginado (p.ej. `audit_logs` o usuarios) en móvil renderiza con scroll horizontal o como tarjetas por fila, sin truncar columnas clave ni ocultar acciones de fila. En escritorio, tabla completa.
- **Output esperado:** E2E tabla responsive PASS en 3 viewports.
- **Trazabilidad:** ADR-03 §3 (paridad); BR-N373.

### AC-57 · Formularios (incl. cotización multi-línea y config fiscal) usables en todos los viewports
- **Validación:** Playwright E2E: un formulario complejo (líneas dinámicas, validación Zod) se completa y envía en móvil sin scroll horizontal forzado en los campos, con campos apilados y validaciones visibles. **Validación funcional: Playwright E2E cubre formulario multi-línea en 375.**
- **Output esperado:** E2E form móvil PASS.
- **Trazabilidad:** ADR-03 §3; SPEC-003/007 referencian este AC para sus forms.

### AC-58 · Builders drag-and-drop usables en todos los viewports (dashboard widgets, editor de cuestionarios)
- **Validación:** Playwright E2E: el reordenamiento drag&drop de widgets del dashboard (DEC-FUN-28, BR-N342) y del editor visual de cuestionarios (DEC-FUN-45) opera con touch en móvil y con puntero en escritorio. Si el drag en pantallas pequeñas se sustituye por controles de subir/bajar, éstos cumplen la misma función.
- **Output esperado:** E2E builder móvil PASS.
- **Trazabilidad:** DEC-FUN-28/45; ADR-03 §3; SPEC-010 (dashboard), SPEC-003 (cuestionarios).

### AC-59 · Validaciones de campo usables/visibles en todos los viewports
- **Validación:** Playwright E2E: al ingresar un valor inválido en un campo (esquema Zod), el mensaje de error aparece visible bajo el campo en móvil (no fuera de viewport ni oculto) y en escritorio.
- **Output esperado:** E2E validación visible PASS.
- **Trazabilidad:** ADR-03 §3.

### AC-60 · Navegación (sidebar → drawer en móvil) responsive
- **Validación:** Playwright E2E: en escritorio la navegación lateral persiste; en móvil colapsa a un drawer/menú hamburguesa que expone las mismas rutas autorizadas. Ninguna ruta autorizada queda inaccesible en móvil.
- **Output esperado:** E2E navegación móvil PASS.
- **Trazabilidad:** ADR-03 §3.

### AC-61 · Modales/diálogos (subida de archivos, confirmar destructivo) responsive
- **Validación:** Playwright E2E: un diálogo (subida de evidencia, confirmación de acción destructiva) se abre y opera en móvil sin desbordar el viewport; acciones primaria/secundaria alcanzables. Foco atrapado dentro del modal (AC-64).
- **Output esperado:** E2E modal móvil PASS.
- **Trazabilidad:** ADR-03 §3; SPEC-001 AC-13/14 (archivos), §20 (destructivas).

### AC-62 · Navegación por teclado en toda interacción
- **Validación:** (a) Playwright E2E: recorrer la UI con Tab alcanza todos los controles interactivos en orden lógico. (b) Acciones (crear/editar) son ejecutables sólo con teclado. (c) Skip-link presente si aplica.
- **Output esperado:** E2E teclado PASS.
- **Trazabilidad:** ADR-03 §3 (accesibilidad).

### AC-63 · Roles/labels ARIA en componentes interactivos
- **Validación:** los componentes shadcn (Radix) exponen roles ARIA. Grep de componentes custom: `rg -n "role=|aria-label|aria-describedby" src/components/` muestra cobertura en botones icon-only, modales y tablas.
- **Output esperado:** ARIA presente en icon-buttons y modales.
- **Trazabilidad:** ADR-03 §3.

### AC-64 · Gestión de foco (foco visible, trampa en modales)
- **Validación:** (a) Foco visible: el ring de foco (naranja `#D35400`) se renderiza al enfocar. (b) Playwright E2E: al abrir un modal, el foco entra y queda atrapado hasta cerrar; al cerrar, vuelve al disparador.
- **Output esperado:** E2E foco/modal PASS.
- **Trazabilidad:** ADR-03 §3.

### AC-65 · Contraste WCAG AA con los tokens de marca (claro + oscuro)
- **Validación:** (a) Script axe-core (o revisión) verifica contraste AA en textos de cuerpo. (b) Para texto fino sobre naranja `#D35400` (contraste < AA), el cuerpo usa navy `#0A1F44` sobre blanco; el naranja se reserva para texto grande/iconos/CTA. (c) En oscuro, los tokens derivados mantienen AA.
- **Output esperado:** axe PASS (sin violaciones AA de contraste).
- **Trazabilidad:** ADR-03 §3, §6.2.

### AC-66 · E2E Playwright cubre la matriz de viewports para flujos representativos
- **Validación:** existe un set E2E que ejecuta ≥4 flujos representativos (login + dashboard, listado+detalle de una entidad, formulario de creación, acción destructiva con confirmación) en los 3 viewports (375/768/1280). Reporta PASS en los 12 cruces (4 flujos × 3 viewports).
- **Output esperado:** `pnpm test:e2e` matriz PASS.
- **Trazabilidad:** ADR-03 §4.3; DEC-FUN-72.

### AC-67 · Tooltips en pantallas de administración/configuración (DEC-FUN-20)
- **Validación:** (a) Las pantallas de admin/config (roles/permisos, config fiscal, catálogos, plantillas, cuestionarios) incluyen tooltips de ayuda en campos no obvios. (b) Grep: `rg -n "Tooltip|title=" src/modules/.*/(admin|config)` muestra cobertura. **Validación funcional: Playwright E2E hover muestra tooltip.**
- **Output esperado:** tooltips presentes en admin/config.
- **Trazabilidad:** DEC-FUN-20; ADR-03 §7; SPEC-010.

### AC-68 · i18n es-MX; sin cadenas de UI hardcoded fuera del catálogo (DEC-FUN-39)
- **Validación:** (a) Existe un catálogo de mensajes `es-MX`. (b) Grep anti-patrón: `rg -n ">[A-ZÁÉÍÓÚa-záéíóú ]{4,}<" src/components/ src/modules/ --glob '!*.test.*'` idealmente → 0 (cadenas de UI vía catálogo, no literales embebidos). (c) `Intl` usa timezone de organización (BR-N203, AC-24).
- **Output esperado:** catálogo presente; grep de literales vacío (o justificado).
- **Trazabilidad:** DEC-FUN-39; BR-N203; ADR-03 §3.

### AC-69 · Label de rol seed editable por Director; `code` de cualquier rol inmutable (DEC-FUN-20260819-69 · A1; BR-N408)
- **Validación:** test Vitest: (a) usuario con permiso `gestionar_roles` edita `label` de un rol con `is_seed=true` (p.ej. `director` → "Director General") → `200/204`; `roles.label` actualizado, `roles.code` e `is_seed` sin cambios; entrada en `audit_logs` con `action='role.update'`, `entity_type='role'`, before/after sólo sobre `label` (BR-N206, BR-N336). (b) intentar cambiar `code` de cualquier rol (seed o custom) → `409 { code: 'ROLE_CODE_IMMUTABLE' }`. (c) usuario sin `gestionar_roles` intenta editar el `label` de un rol seed → `403 Forbidden` vía `requirePermission('gestionar_roles')`. (d) el `label` de un rol custom ya es editable por contrato (AC-5); este AC fija el caso seed.
- **Grep anti-patrón:** `rg -n "code\s*[:=]\s*['\"]|setCode|updateCode" src/server/services/` → 0 rutas de servicio que muten `roles.code` (la identidad `code` es inmutable en cualquier mutación de rol).
- **Output esperado:** test verde (4 aserciones a–d); grep vacío.

### AC-70 · Permisos de rol seed inmutables; desactivación de seed con usuarios bloqueada (DEC-FUN-20260819-69 · B1/C1; BR-N409, BR-N410)
- **Validación:** test Vitest: (a) intentar INSERT o DELETE en `role_permissions` para un rol con `is_seed=true` → `409 { code: 'SEED_ROLE_PERMISSIONS_IMMUTABLE' }` (BR-N409); para rol custom (`is_seed=false`) → `200/204` y entrada en `audit_logs` con `action='role_permission.{grant|revoke}'`, before/after (BR-N206). (b) desactivar (`active=false`) un rol seed con ≥1 fila en `user_roles` → `409 { code: 'SEED_ROLE_HAS_ASSIGNED_USERS' }` (BR-N410); tras reasignar a todos los usuarios a otros roles (0 filas en `user_roles` para ese rol) → la desactivación → `200/204 OK` y se audita (`action='role.deactivate'`). (c) el conteo de usuarios asignados se lee de `user_roles` sin eliminación cascada silenciosa (la reasignación es una operación explícita, previa y auditada).
- **Nota:** las variaciones de permisos sobre un rol base se cubren creando un rol custom (BR-N128) o concediendo permisos aditivos por usuario (AC-6); los `role_permissions` seed son contrato canónico inmutable post-bootstrap.
- **Output esperado:** test verde (aserciones de 409 inmutabilidad seed + 200 custom auditado + 409 con-usuarios + 200 tras reasignación).

### AC-71 · Context real: cookie httpOnly + `user` nullable + UNAUTHORIZED real (v1.6 · P0-1 de QA-20260820-01 · ADR-06 §2.1, §2.9)
- **Validación:** (a) test Vitest + grep: `createTrpcContext` (`src/server/trpc/context.ts`) lee `cookies().get('vectoria_access')` (NO `headers().get('Authorization')`); no contiene string `"00000000-0000-0000-0000-000000000000"`; retorna `ctx.user = null` cuando no hay cookie/JWT inválido. (b) test Vitest: `protectedProcedure` lanza `TRPCError({ code: 'UNAUTHORIZED' })` cuando `ctx.user === null` (no retorna identidad falsa). (c) test Vitest + grep: el cliente tRPC (`lib/trpc.ts` + `components/providers.tsx`) NO adjunta header `Authorization` manual — delega en cookie same-origin (`credentials: 'include'` o default del adaptador Next.js). (d) test E2E: request a `plataforma.audit.list` sin cookie → HTTP 401 con `data.code='UNAUTHORIZED'`; con cookie válida → 200 con datos filtrados por `ctx.user.organization_id`.
- **Output esperado:** greps 0 coincidencias de UUID cero + Bearer en context.ts; tests verde; E2E 401 sin cookie / 200 con cookie.

### AC-72 · Cableado de `registerFailedLogin` + bitácora `auth.*` en login/refresh/logout (v1.6 · P1-4 de QA-20260820-01 · ADR-06 §2.2, §2.9, AC-21/AC-58/AC-61)
- **Validación:** (a) grep + test Vitest: `app/api/auth/login/route.ts` y `trpc/routers/auth.ts` invocan `auth.registerFailedLogin(userId, organizationId)` tras cada contraseña inválida (antes de lanzar el error HTTP). (b) test Vitest: 5 logins fallidos consecutivos para el mismo `userId` → `users.failed_login_count` incrementa a 5 + `users.locked_until` se setea a `now + ventana` (BR-N336/AC-21) + 5 filas en `audit_logs` con `action IN ('auth.login.failed','auth.account.locked')`. (c) grep + test: `auth.login.success`, `auth.invitation.issued`, `auth.invitation.consumed`, `auth.logout` se escriben en `audit_logs` en los flujos correspondientes (`login/refresh/logout/route.ts`).
- **Output esperado:** grep de `registerFailedLogin(` en routers/route.ts ≥1 coincidencia; tests verde (contador a 5, lockout activado, 5+ filas audit).

### AC-73 · `audit.record` para eventos de sistema (actor `null`) (v1.6 · P2-2 de QA-20260820-01 · SPEC §4.1 `audit_logs.actor_user_id` null)
- **Validación:** (a) test Vitest: `createAuditService().record(ctx, { entityType, entityId, action })` con `ctx.user === null` (evento de sistema: stub `seed-catalog`, rotación crypto, job global) → NO lanza `ForbiddenError`; inserta fila en `audit_logs` con `actor_user_id = null`, `actor_role_code = null`, `action = 'system.<evento>'`. (b) grep: `services/audit/index.ts` no rechaza con `ForbiddenError` por `!ctx.user?.id` cuando el caller marca el evento como `system` (parámetro `actor: { kind: 'system' } | { kind: 'user', id }` o equivalente).
- **Output esperado:** test verde (fila con actor null insertada sin excepción); grep sin `ForbiddenError` para eventos de sistema.

### AC-74 · Políticas RLS escritas realmente (no plantilla comentada) (v1.6 · P2-1 de QA-20260820-01 · AC-12/AC-40, ADR-02 §3)
- **Validación:** (a) grep: `drizzle/0001_enable_rls.sql` contiene `CREATE POLICY ... USING (organization_id = current_setting('app.current_org')::uuid)` (o mecanismo equivalente) **descomentadas** para las tablas de negocio (no sólo `ENABLE ROW LEVEL SECURITY`); `scripts/seed-rls.ts` ejecuta esas políticas (no es no-op). (b) `scripts/check-rls.ts` valida existencia de ≥1 política por tabla (no sólo `relrowsecurity='on'`). (c) test Vitest con BD (cuando infra de Frank esté): con RLS activo y `app.current_org` seteado a org A, un `SELECT` sobre `audit_logs` de org B → 0 filas.
- **Output esperado:** grep de `CREATE POLICY` descomentado ≥1 por tabla; check-rls PASS; test BD 0 filas cross-org.

### AC-75 · `check-antipatterns.ts` + `public/brand/` existentes y funcionales (v1.6 · P2-4 de QA-20260820-01 · AC-48/AC-50)
- **Validación:** (a) `ls scripts/check-antipatterns.ts` → existe; `pnpm check:antipatterns` → exit 0 (ejecuta los greps AC-1/AC-26/AC-27/AC-30/AC-34/AC-42/AC-50). (b) `ls public/brand/` → existe con ≥1 asset (logo VectorIA, AC-48); grep AC-50 (`rg -n 'oatmeal' public/ src/` case-insensitive) → 0 coincidencias (no copia Oatmeal). (c) `pnpm lint` → exit 0 (setup `@rushstack/eslint-patch` arreglado o sustituido).
- **Output esperado:** archivo existe + script exit 0; `public/brand/` con assets; lint verde.

### AC-76 · Lint ejecutable (v1.6 · P2-4 de QA-20260820-01 · ADR-01 §3)
- **Validación:** `pnpm lint` → exit 0 (sin error de `@rushstack/eslint-patch` incompatible con eslint 8.57). Si la decisión es sustituir el patch por configuración eslint plana, documentar en IMPL-REPORT.
- **Output esperado:** lint exit 0; IMPL-REPORT confirma mecanismo.

### AC-77 · `compact()` typecheck (regresión `K` fuera de scope) (v1.6 · typecheck actual)
- **Validación:** `pnpm typecheck` → exit 0 (sin `TS2304: Cannot find name 'K'` en `src/server/trpc/routers/plataforma.ts:34`). El casteo dentro del cuerpo de `compact()` debe usar `keyof T` / `typeof k`, no `K` (que sólo existe en el tipo mapeado `{ [K in keyof T]: ... }`, no en el cuerpo de la función).
- **Output esperado:** typecheck exit 0.

### AC-78 · `password.test` valida `code` de error, no mensaje localizado (v1.6 · tests actuales)
- **Validación:** `pnpm test` → 5 tests `password.test.ts` PASS. El servicio `auth.validatePasswordStrength` debe lanzar un error con `code: 'PASSWORD_TOO_WEAK'` (estable, programático) accesible vía `error.code` / `error.data.code`; el mensaje humano localizado ("Debe incluir al menos un dígito/símbolo") va en `error.message`. Los tests assertan sobre `error.code` (no sobre `error.message`). Alternativa: si el servicio ya lanza `code`, los tests se corrigen para inspeccionar `code`; si el servicio no lanza `code`, el servicio se corrige para añadirlo.
- **Output esperado:** 5 tests password.test PASS; servicio lanza `code: 'PASSWORD_TOO_WEAK'`.

### AC-79 · SuperUser técnico: bootstrap crea/conserva `contacto@vector-ia.mx` antes de la primera invitación; consume secreto; fail-safe (v1.7 · DEC-FUN-20260820-74/BR-N412 · P1-2 de QA-20260820-01)
- **Validación:** (a) grep + test: `db:seed:plataforma` (`scripts/seed-plataforma.ts`) crea/conserva una fila `users` con `email='contacto@vector-ia.mx'` **antes** de invocar `invitations.issue`, y la invitación fundacional usa `createdByUserId = <SuperUser.id>` (grep `rg -n "00000000-0000-0000-0000-000000000000" scripts/seed-plataforma.ts` → **0** coincidencias — P1-2 cerrado). (b) grep: `VECTORIA_SUPERUSER_PASSWORD` está en `EnvSchema` de `src/lib/env.ts` como obligatorio no-vacío y en `listRequiredVars()`. (c) test Vitest (con BD): bootstrap con `VECTORIA_SUPERUSER_PASSWORD` ausente → `deps:check`/seed aborta con exit !=0 y mensaje que nombra `VECTORIA_SUPERUSER_PASSWORD` **sin** imprimir el valor; **no** crea el SuperUser con contraseña fabricada (fail-safe). (d) test Vitest (con BD): bootstrap con secreto presente → `users`+`credentials` para `contacto@vector-ia.mx` con `password_hash` Argon2id (`$argon2id$…`); re-ejecutar no duplica (upsert por `(organization_id, email)`). (e) grep anti-secreto: `rg -n "VECTORIA_SUPERUSER_PASSWORD" src/ scripts/` no imprime/loguea el valor (sólo lo lee vía `loadEnv()` y lo hashea).
- **Output esperado:** greps 0 coincidencias de UUID cero en seed-plataforma; `VECTORIA_SUPERUSER_PASSWORD` en env schema; tests verde (fail-safe sin secreto + SuperUser creado con secreto + idempotente); 0 fugas del valor en logs/código.
- **Trazabilidad:** ADR-04 §2.2/§2.3 (v1.3); DEC-FUN-20260820-74, BR-N412.

### AC-80 · Permisos por módulo: la plataforma siembra sólo permisos propios; `registrar_tiempo` → SPEC-006 (v1.7 · DEC-FUN-20260820-75/BR-N413 · P1-3 de QA-20260820-01)
- **Validación:** (a) grep: `BASE_PERMISSIONS` en `src/shared/enums/index.ts` **no** contiene `registrar_tiempo` (es de SPEC-006). (b) grep + test: `SEED_ROLE_PERMISSION_CODES` en `scripts/seed-data.ts` asigna a `programador` un arreglo que contiene **sólo** codes de `BASE_PERMISSIONS` (en plataforma, `programador = []`); `registrar_tiempo` **no** aparece en la semilla de plataforma. (c) test Vitest (con BD): tras `db:seed:plataforma`, `permissions` contiene exactamente `BASE_PERMISSIONS` (ningún code de módulo); `role_permissions` de `programador` está vacío en plataforma. (d) script `check-seed-permissions.ts` rechaza cualquier code de módulo (e.g. `registrar_tiempo`) en la semilla de plataforma (exit !=0 si aparece).
- **Output esperado:** `registrar_tiempo` ausente de `BASE_PERMISSIONS` y de la semilla de plataforma; `programador = []` en plataforma; check-seed-permissions PASS; test verde.
- **Trazabilidad:** ADR-04 §2.3 (v1.3); DEC-FUN-20260820-75, BR-N208/N212/N413.

### AC-81 · `hasPermission` revalida contra BD para acciones críticas (`forceDb`) (v1.8 · P3-3 de QA-20260820-02 · ADR-06 §2.1/§3.1)
- **Validación:** (a) grep + test: `createHasPermissionService()` expone `has(ctx, code, opts?: { forceDb?: boolean })` / `require(ctx, code, opts?: { forceDb?: boolean })`. Cuando `forceDb === true`, el servicio **ignora** el snapshot `ctx.permissions` (cache del JWT) y consulta `role_permissions` + `user_permissions` contra BD; el short-circuit por `ver_todo`/cache se omite en esa rama. (b) test Vitest: tras `revokePermission(user, 'gestionar_config_fiscal')`, una llamada con `forceDb: true` retorna `false` aunque el JWT cache (`ctx.permissions`) aún incluya `gestionar_config_fiscal` (ventana de exposición TTL eliminada para el path crítico). Con `forceDb` omitido/false, conserva el comportamiento cacheado (acciones no críticas, rendimiento). (c) grep de propagación: los servicios de las acciones críticas de plataforma (`gestionar_roles`, `gestionar_config_fiscal`, `ver_auditoria` y equivalentes que toquen BR-N336) invocan `hasPermission.require(ctx, code, { forceDb: true })` (o el helper equivalente) — no el path cacheado.
- **Output esperado:** grep `forceDb` ≥1 en `src/server/services/hasPermission/index.ts` y en los servicios críticos; test verde (revoke efectiva inmediatamente con `forceDb=true`).
- **Trazabilidad:** ADR-20260817-06 §2.1 (snapshot de `perms[]` en el access token), §3.1 (acciones críticas revalidan contra BD). P3-3 de QA-20260820-02.
- **Notas:** no es bloqueante para staging si se difiere con justificación explícita (TTL_access 15 min acota la ventana), pero es contrato de seguridad documentado por ADR-06; este AC lo hace testeable.

### AC-82 · Claim `actor_role_code` en el JWT de acceso (v1.8 · P3-4 de QA-20260820-02 · ADR-06 §2.1)
- **Validación:** (a) grep + test: `session.openAccessToken` (`src/server/services/session/index.ts`) firma el JWT con claims `sub, oid, roles, perms, jti` **y** `actor_role_code` (claim **opcional**: presente cuando hay rol activo en el `Context`/payload, ausente cuando no aplica — e.g. bootstrap/login sin rol combinable). `verifyAccessToken` lo devuelve cuando está presente. (b) test Vitest: un access token emitido con `actor_roleCode='administrador'` (o el campo que SOFIA elija para pasarlo desde el `Context` de una acción crítica combinable) decodificado contiene `actor_role_code === 'administrador'`; emitido sin rol combinable, el claim es `undefined`/ausente. (c) los tests existentes de sesión/login siguen PASS (el claim es aditivo opcional, no rompe claims actuales).
- **Output esperado:** grep `actor_role_code` ≥1 en `src/server/services/session/index.ts` (SignJWT + verify); test verde (claim presente con rol, ausente sin rol); tests de sesión existentes sin regresión.
- **Trazabilidad:** ADR-20260817-06 §2.1 (Claims: `… actor_role_code (cuando aplica a acción crítica combinable, ACTORES §6)`). P3-4 de QA-20260820-02. ACTORES §6 (rol usado en acciones críticas combinables).
- **Notas:** el `audit_logs.actor_role_code` ya se persiste (AC-9); este AC garantiza que la pista del rol activo también viaje en el token para verificación en runtime de acciones críticas. `roles` (snapshot) es distinto de `actor_role_code` (rol funcional usado en una acción combinable concreta).
- **v1.9 (P3-2 de QA-20260820-03):** `rg "actorRoleCode" src/server/trpc/routers/auth.ts src/app/api/auth/login/route.ts` retorna **0** en los call sites de `openAccessToken` (`auth.ts:126`, `login/route.ts:115`): ningún JWT de login lleva hoy el claim. **Esto cumple el contrato, no lo viola:** el claim es **opcional y condicional a acción crítica combinable** (ADR-06 §2.1, ver arriba), y el login **no** es una acción crítica combinable (no hay selección de rol activo en login). Por tanto los callers **omiten correctamente** `actorRoleCode`. El contrato está listo y testeado (3 escenarios PASS). INTEGRA **difiere** la propagación como hardening técnico no bloqueante, **sin fix hoy y sin inventar requisito funcional**: se cableará `actorRoleCode: ctx.actorRoleCode` al implementar el **primer procedure con acción crítica combinable** (e.g. SPEC-003 aceptación de cotización con doble rol, AC-9/invariante 12/ACTORES §6); INTEGRA añadirá entonces el AC correspondiente en esa SPEC. No se genera mini-SPEC para P3-2. Ver §16.1.

### AC-83 · HTTP routes de auth sin consultas Drizzle directas — simetría de AC-28 para el transporte HTTP (v1.10 · R3 de QA-20260820-04 · SOL invariante 3)
- **Validación:** los HTTP route handlers de auth (`src/app/api/auth/**`) no contienen consultas Drizzle directas (delegan al servicio `auth`/`session`/`invitations`, como hace el transporte tRPC). Patrón **Drizzle-anclado** (no `delete\(` suelto): (a) `rg -n "getDb\(|from .*drizzle|drizzle-orm" src/app/api/auth/` → **0**; (b) `rg -n "\.from\(users\)|eq\(users\." src/app/api/auth/` → **0**.
- **Output esperado:** greps vacíos (0 consultas Drizzle directas en `src/app/api/auth/**`).
- **Estado (v1.10):** **PASS hoy** (verificado por INTEGRA: greps Drizzle-anclado = 0; confirmado por QA-20260820-04 §B "Anti-exposición" y §C). Funciona como **regresión-preventiva**: detecta si un futuro transporte HTTP de auth reintroduce un lookup directo.
- **Trazabilidad:** ADR-20260817-01 §10 + SOL-20260819-01 invariante 3 (tRPC adaptador interno); simetría con AC-28 (routers tRPC); ADR-20260817-06 §2.2/§2.9 (transportes de auth). R3 de QA-20260820-04.
- **Notas / falso positivo conocido:** el grep crudo `delete\(` **no** es válido aquí — produce falsos positivos sobre `jar.delete(...)` del cookie-jar (`src/app/api/auth/logout/route.ts:98,99`). El patrón debe anclar a Drizzle (`getDb\(`, `from .*drizzle`, `drizzle-orm`, `.from(users)`, `eq(users.`). **Automatización diferida (P-H-1, §13):** la entrada nueva en `scripts/check-antipatterns.ts` que ejecute este AC es **implementación** (ownership SOFIA, ronda de hardening post-infra); el AC como contrato ya es verificable hoy manualmente. No bloquea staging ni DONE de la mini-SPEC SPEC-20260820-001.

### AC-72-EX · Bitácora `auth.*` completa en todos los transportes y servicios (v1.8 · refuerza AC-72 · P1-1/P2-1 de QA-20260820-02 · ADR-06 §2.2/§2.3/§2.4/§2.9)
- **Validación:** greps de cobertura por evento + test Vitest (con BD post-infra) por evento. La bitácora `auth.*` (AC-72c, ADR-06 §2.9 tabla) se escribe en `audit_logs` **en ambos transportes** (HTTP route handler **y** tRPC router) y **en el servicio correspondiente** cuando el transporte sólo orquesta:
  - `auth.login.failed` y `auth.login.locked`: en `app/api/auth/login/route.ts` **y** `src/server/trpc/routers/auth.ts` (con `registerFailedLogin` antes del throw). — P1-1.
  - `auth.login.success`: en ambos transportes (ya cubierto parcialmente; mantener).
  - `auth.logout`: en `app/api/auth/logout/route.ts` (revoca refresh + `audit.record({ action: "auth.logout" })`; el tRPC no expone logout por cookie). — P2-1.
  - `auth.refresh`: en `app/api/auth/refresh/route.ts` tras rotación exitosa (`audit.record({ action: "auth.refresh" })`). — P2-1.
  - `auth.session.suspicious`: en `app/api/auth/refresh/route.ts` (rama `result.reused`) **y** en `src/server/trpc/routers/auth.ts` (rama `r.reused`) con `reason='refresh_reuse'`, junto a `revokeFamily`. — P2-1.
  - `auth.invitation.issued`: en `invitations.issue` (`src/server/services/invitations/index.ts`). — P2-1.
  - `auth.invitation.consumed`: en `invitations.consume` (mismo servicio). — P2-1.
- **Output esperado:** `rg -n "audit\.record" <archivo>` ≥1 en cada uno de `login/route.ts`, `logout/route.ts`, `refresh/route.ts`, `trpc/routers/auth.ts`, `services/invitations/index.ts` (para issued/consumed), y `auth.session.suspicious` presente (no sólo en docstring) en `services/session/index.ts` o en los transportes que detectan reuso; tests Vitest (con BD) filas correctas.
- **Trazabilidad:** AC-72 (a/b/c), ADR-20260817-06 §2.2 (login), §2.3 (refresh + suspicious), §2.4 (logout), §2.9 (tabla bitácora), BR-N336/337, AC-21/AC-58/AC-61.
- **Notas:** el `Context` sintético para auditar eventos de auth previos a sesión (login failed/locked/success, invitation issued) ya existe en `login/route.ts` (construye `{ user: { id, organization_id }, roles: [], permissions: [] }`); el tRPC router debe reusar el mismo patrón. Para `auth.invitation.issued` el actor es `createdByUserId`; para `auth.invitation.consumed` el actor es el `user.id` recién creado.

---

## 12. Validaciones detectadas (comandos base)

- `pnpm install` (dependencias).
- `pnpm typecheck` (tsc --noEmit) — contrato tRPC + Zod + Drizzle.
- `pnpm lint` (ESLint + Prettier).
- `pnpm test` (Vitest unit/integración).
- `pnpm test:e2e` (Playwright; cubre AC-17, AC-18, AC-23).
- `pnpm db:migrate` (Drizzle Kit — crear migración inicial).
- `pnpm db:seed` (organización seed, roles seed 7, permisos base, primer Director vía invitación).
- `pnpm tsx scripts/check-multitenancy.ts` (AC-2).
- `pnpm tsx scripts/check-rls.ts` (AC-12).
- `pnpm tsx scripts/check-currency.ts` (AC-25).
- `pnpm tsx scripts/check-seed-permissions.ts` (AC-38, matriz BR-N207..N212).
- Greps anti-patrón hexagonal (AC-26..AC-34): `rg` de imports Drizzle en UI (AC-26), imports de transporte en servicios (AC-27), consultas Drizzle en routers tRPC (AC-28), `cookies()`/`headers()` en servicios (AC-30) y rutas `/api/v1`/OpenAPI en `src/` (AC-34).
- **Validaciones UI/responsive (v1.4, ADR-20260819-03):** greps anti-patrón — frameworks de UI ajenos (AC-42: `@mui|antd|@chakra-ui` en `src/` → 0), serif en body (AC-47), copia de Oatmeal `oatmeal|olive_instrument` en `src/`/`public/`/`tailwind.config` (AC-48/AC-50), `mobileReadOnly`/sólo-lectura-en-móvil (AC-55), literales de UI fuera de catálogo (AC-68). E2E Playwright en 3 viewports (375/768/1280) para la matriz de AC-66; axe-core para contraste AA (AC-65); probe de foco/modal (AC-64) y teclado (AC-62).
- **Validaciones v1.7 (SuperUser + permisos por módulo):** `rg -n "00000000-0000-0000-0000-000000000000" scripts/seed-plataforma.ts` → 0 (AC-79, P1-2 cerrado); `VECTORIA_SUPERUSER_PASSWORD` presente en `EnvSchema` y `listRequiredVars()` de `src/lib/env.ts` (AC-79); `rg -n "registrar_tiempo" src/shared/enums/index.ts scripts/seed-data.ts` → 0 en plataforma (AC-80, P1-3 cerrado); `check-seed-permissions.ts` rechaza codes de módulo en la semilla de plataforma (AC-80).
- **Validaciones v1.8 (bitácora `auth.*` completa + `forceDb` + `actor_role_code` · QA-20260820-02):** `rg -n "registerFailedLogin" src/server/trpc/routers/auth.ts src/app/api/auth/login/route.ts` → ≥1 en **cada uno** (AC-72-EX / P1-1); `rg -n "auth\.login\.failed|auth\.login\.locked" src/server/trpc/routers/auth.ts` → ≥1 (no sólo docstring) (P1-1); `rg -n "audit\.record" src/app/api/auth/logout/route.ts src/app/api/auth/refresh/route.ts src/server/services/invitations/index.ts` → ≥1 en cada uno (P2-1); `rg -n "auth\.session\.suspicious" src/server/services/session/index.ts src/app/api/auth/refresh/route.ts src/server/trpc/routers/auth.ts` → ≥1 **fuera de docstring** (rama `reused`/`revokeFamily`) (P2-1); `rg -n "forceDb" src/server/services/hasPermission/index.ts` → ≥1 (AC-81); `rg -n "actor_role_code" src/server/services/session/index.ts` → ≥1 en `SignJWT` y en `verifyAccessToken` (AC-82). Los asserts que requieren BD (5 fallos → `locked_until`, filas `auth.*`) quedan `NO EJECUTADA (razón infra gated-Frank)` y se validan por greps + lógica hasta que Frank provisione PostgreSQL 16.
- **Validaciones v1.10 (cierre P3-1 QA-03 · QA-20260820-04 PASS sobre IMPL-20260820-04):** `rg -n "select\(|insert\(|update\(|delete\(|\.values\(" src/server/trpc/routers/` → **0** (AC-28 restaurado, P3-1 cerrado); `rg -n "getDb\(|from .*drizzle|drizzle-orm" src/app/api/auth/` → **0** y `rg -n "\.from\(users\)|eq\(users\." src/app/api/auth/` → **0** (AC-83 nuevo, simetría HTTP layer, R3 QA-04); `rg -n "lookupActor" src/server/services/auth/index.ts` → 3 y `rg -n "lookupActor" src/server/trpc/routers/auth.ts src/app/api/auth/login/route.ts` → 4 (2/2 call sites refactorizados); `rg -n "registerFailedLogin|auth\.login\.failed|auth\.login\.locked" src/server/trpc/routers/auth.ts src/app/api/auth/login/route.ts` → ≥1 de cada uno en cada archivo (AC-72-EX sin regresión); `pnpm typecheck` exit 0; `pnpm lint` exit 0; `pnpm test` → **34/34 PASS** (31 previos + 3 nuevos `lookup-actor.test.ts`); `pnpm check-antipatterns` → 15/15 OK (incluye `OK AC-72`). Gates BD/E2E/migrate/bootstrap/smoke siguen `NO EJECUTADA (gated-Frank)`. **Automatización de AC-83 en `check-antipatterns.ts` = P-H-1 (§13), implementación diferida a SOFIA.**

Salida esperada global tras implementación: `typecheck PASS`, `lint PASS`, `test PASS`, `test:e2e PASS` (incluye matriz de viewports), scripts `OK`.

---

## 13. Rollback recomendado (no ejecución)

- Migración inicial es la base; rollback = drop schema (destrucción de datos, requiere aprobación de Frank).
- Si una migración posterior rompe, revertir el archivo de migración y re-aplicar con `drizzle-kit migrate --rollback` (si lo soporta) o restaurar el último backup (BR-N147). **No ejecutar rollback sin aprobación de Frank.**
- Desactivación de RLS (si se activó por error): `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` y reauditar (AC-12).

---

## 14. Riesgos y pendientes

- **R1 · RLS latente mal escrito:** riesgo de fuga al activar multi-org. Mitigación: AC-12 + gate de auditoría + test cross-org antes de activar.
- **R2 · Pérdida de `MASTER_KEY`:** secretos irrecuperables. Mitigación: procedimiento operativo de respaldo offline de la llave (Frank, fuera de SPEC).
- **R3 · pg-boss y BD compartida:** si el volumen de jobs crece, podría necesitar Redis/BullMQ. No en MVP.
- **R4 · Performance p95 < 2 s:** depende de hardware de CI/prod. AC-18 documentado si no se alcanza.
- **R5 · (v1.7) Secreto del SuperUser perdido/expuesto:** `VECTORIA_SUPERUSER_PASSWORD` es la contraseña inicial del SuperUser técnico; si se expone o se pierde, hay que rotarla (Frank). Mitigación: fail-safe en bootstrap (AC-79), nunca en logs/audit/respuestas, rotación operativa fuera de SPEC. El SuperUser es actor de trazabilidad, no operador de negocio (sin `user_roles` por defecto), lo que acota su superficie.
- **P1 · Decisión de proveedor de bucket S3 en prod:** Frank.
- **P2 · Decisión de hosting/VPS:** Frank.
- **P3 · Procedimiento operativo de backup físico y retención 30 días:** Frank.
- **P4 · (v1.7) Provisionar `VECTORIA_SUPERUSER_PASSWORD` (secreto no-vacío, ≥ política de password) para el primer arranque:** Frank. Sin él, `deps:check`/seed aborta fail-safe (AC-79); el SuperUser no se crea con contraseña fabricada.
- **P-H-1 · (v1.10 · R3 de QA-20260820-04 · no bloqueante) Automatizar AC-83 en `scripts/check-antipatterns.ts`:** añadir una entrada que ejecute los greps Drizzle-anclado sobre `src/app/api/auth/` (ver AC-83 por el falso positivo de `delete\(` sobre `jar.delete`). **Owner implementación: SOFIA** (es código del script de checks). **Owner contrato: INTEGRA** (AC-83 ya definido y PASS hoy manualmente). No bloquea staging (ya gated por BD/E2E infra-Frank) ni DONE de la mini-SPEC SPEC-20260820-001. Se procesa en una ronda de hardening post-infra, batible con otros P-H cuando se habilite `check-antipatterns.ts`.

---

## 15. DoD

- AC-1 a AC-70 PASS (cada uno con comando + output esperado documentado; AC-26..AC-34 cubren los 9 invariantes hexagonales de SOL-20260819-01; **AC-35..AC-41 reubican los ACs de bootstrap de ADR-04** preservando contenido y trazabilidad; **AC-42..AC-68 materializan el sistema de interfaz de ADR-20260819-03** —tokens, tema, paridad responsive, accesibilidad—; AC-69/AC-70 materializan DEC-FUN-20260819-69 opciones A1/B1/C1 y reformulan AC-4). **(v1.6)** AC-71..AC-78 reparan los hallazgos P0/P1/P2/typecheck/tests de QA-20260820-01. **(v1.7)** AC-79 (SuperUser técnico vía secreto bootstrap + fail-safe) y AC-80 (permisos por módulo; `registrar_tiempo` → SPEC-006) materializan DEC-FUN-20260820-74/75 y cierran DISCOVERY-GAP-20260820-01; AC-37/AC-38 reformulados. **(v1.8)** AC-81 (`forceDb` para acciones críticas · P3-3), AC-82 (claim `actor_role_code` · P3-4) y AC-72-EX (bitácora `auth.*` completa en ambos transportes + servicios · P1-1/P2-1) cierran los hallazgos de QA-20260820-02 sobre IMPL-20260820-02; §4.1 drift AC-43/44 y §6 drift 415 reconciliados (P3-1/P3-2, sólo documentación técnica).
- `typecheck`, `lint`, `test`, `test:e2e` PASS.
- Migración inicial aplicada y seed corre sin error.
- Primer Director creado vía invitación y puede loguear.
- `audit_logs` registra todas las acciones críticas de la propia plataforma.
- `PROYECTO.md` actualizado: SPEC-001 → `VERIFYING` (tras `READY_FOR_VERIFYING` de SOFIA) → `DONE` (tras gates INTEGRA).
- Sin `SPEC-GAP` activo.
- GEMINI PASS o PASS_WITH_WARNINGS recomendado (esta SPEC es fundacional y toca auth, secretos y multi-tenancy → GEMINI obligatorio por §17 de integra.md: toca auth y secretos).
- **v1.9 (post-QA-20260820-03):** QA-03 = `PASS_WITH_WARNINGS` (2 P3 no bloqueantes). Gates locales PASS (`typecheck`/`lint`/`31 tests`/`checks`); gates BD/E2E `NO EJECUTADA (gated-Frank)`. P3-1 (AC-28) → mini-SPEC `SPEC-20260820-001` diferida; P3-2 (AC-82) → hardening diferido sin fix. SPEC-001 = `VERIFYING` (NO `DONE` hasta gates BD/E2E con evidencia + GEMINI re-verificación BD). Ver §16.1.
- **v1.10 (post-QA-20260820-04 PASS · cierre P3-1):** QA-04 = `PASS` sobre IMPL-20260820-04 (0 P0/P1/P2; 1 P3=R3). P3-1 de QA-03 **cerrado** (AC-28 restaurado, grep routers → 0). Gates locales PASS (`typecheck`/`lint`/`tests 34/34`/`check-antipatterns 15/15`). **AC-83 añadido** (simetría AC-28 para HTTP layer; R3 clasificado hardening preventivo no bloqueante; PASS hoy; automatización P-H-1 diferida a SOFIA). Gates BD/E2E/migrate/bootstrap/smoke siguen `NO EJECUTADA (gated-Frank: infra Coolify/secretos)`. staging/producción `NO_LISTO`. **SPEC-001 sigue `VERIFYING` — NO `DONE`** mientras falten gates obligatorios de BD/E2E con evidencia reproducible + GEMINI re-verificación BD. La mini-SPEC `SPEC-20260820-001` (refactor puro, sin BD) sí cumple su DoD local → `DONE (refactor local verificado; cierre P3-1)`. Ver §16.1.

---

## 16. Handoff a SOFIA (resumen — el SPEC-HANDOFF completo lo emite INTEGRA al delegar)

- **ID tarea:** (se asigna al delegar, IMPL-YYYYMMDD-NN; corrective vigente: **IMPL-20260820-03** — bitácora `auth.*` + `forceDb` + `actor_role_code`, ver `context/interconsultas/SPEC-HANDOFF-20260820-03-*.md`; **estado post-QA-03 (v1.9):** IMPL-03 `READY_FOR_VERIFYING` → QA-20260820-03 `PASS_WITH_WARNINGS` (0 P0/P1/P2, 2 P3); 4 hallazgos QA-02 cerrados; SPEC-001 `VERIFYING` — ver §16.1. **Estado post-QA-04 (v1.10):** mini-SPEC SPEC-20260820-001 → IMPL-20260820-04 → QA-20260820-04 `PASS` (0 P0/P1/P2; 1 P3=R3); **P3-1 de QA-03 cerrado** (AC-28 restaurado); AC-83 añadido (R3 → hardening no bloqueante + P-H-1); SPEC-001 sigue `VERIFYING` — ver §16.1).
- **SPEC activa:** SPEC-20260817-001 (esta, v1.10).
- **ADRs:** ARCH-01, ARCH-02, ARCH-03, ARCH-04 (bootstrap/SuperUser), ARCH-06 (ciclo auth/bitácora), ADR-20260819-03 (UI).
- **Resultado:** plataforma fundacional operativa con seed (incl. SuperUser técnico `contacto@vector-ia.mx` vía secreto bootstrap + permisos propios de plataforma), login, hasPermission, audit, files, crypto, jobs, notifications.
- **Alcance de archivos/módulos:** `src/server/db/*` (esquemas Drizzle), `src/server/trpc/routers/plataforma/*`, `src/server/services/{auth,hasPermission,audit,crypto,files,jobs,session,invitations}/*`, `src/server/jobs/*`, `src/shared/enums/*`, `src/modules/plataforma/*`, `scripts/{check-multitenancy,check-rls,check-currency}.ts`, `drizzle/` (migraciones), `playground/` o `e2e/` para Playwright.
- **Contratos que cambian:** ninguno previo (es base).
- **Contratos protegidos:** enums canónicos, `hasPermission`, `audit_logs`, `organization_id` en toda entidad.
- **Validaciones:** ver §12.
- **Restricciones:** cero `if (user.role === ...)`; cero secreto en logs; RLS inactivo en MVP; sin blobs en BD; sin OAuth. **(v1.2, SOL-20260819-01)** servicios independientes del transporte; tRPC sin reglas exclusivas; DTOs Zod reutilizables; `Context` abstracto; seguridad/auditoría en el servicio; sin filas Drizzle expuestas; idempotencia/correlación internas; sin endpoints REST públicos ni `/api/v1` en V1.
- **Dependencias:** ninguna externa bloqueante (Drizzle, pg-boss, Argon2, Zod, tRPC, Next.js, MinIO client, Playwright, Vitest).
- **DoD:** §15.
- **Prohibido inferir:** estados de negocio no listados en esta SPEC (p.ej. estados de Proyecto, Factura, etc. — los definen sus SPECs); políticas de producto (Q-NB-3).

### 16.1 Cierre técnico post-QA-20260820-03 (v1.9 · INTEGRA · no implementa código)

- **QA-03:** `context/reviews/QA-20260820-03-plataforma-base.md` = **PASS_WITH_WARNINGS** (0 P0 / 0 P1 / 0 P2 / 2 P3). Cierra los 4 hallazgos de QA-20260820-02 (P1-1 `registerFailedLogin`+`auth.login.failed/locked` en tRPC; P2-1 bitácora `auth.logout/refresh/session.suspicious/invitation.issued/consumed`; P3-3 `forceDb` en `has/require` + 8 call sites; P3-4 claim `actor_role_code` firma+decode con 3 tests). Gates ejecutados (local): `typecheck` PASS · `lint` PASS · `31/31 tests` PASS · `check-multitenancy/currency/seed-permissions/rls/antipatterns` PASS · `deps:check` fail-safe correcto. **Gates NO ejecutados (gated-Frank):** `db:migrate`/`bootstrap`/`smoke`/`test:e2e` + tests con BD (5-fallos→`locked_until`, filas `auth.*` reales, cross-org, SuperUser upsert, `actor_role_code` end-to-end, `forceDb` efectivo tras `revokePermission`) — PostgreSQL 16 + MinIO + secretos ausentes.
- **P3-1 (regresión AC-28) — decisión INTEGRA: requiere fix, diferido no bloqueante.** `rg "select\(|insert\(|update\(|delete\(|\.values\(" src/server/trpc/routers/` retorna **2 matches** (`routers/auth.ts:54,86` — lookup de actor por email antes de `audit.record` en los caminos `invalid_credentials`/`account_locked`). Es una **regresión real del contrato AC-28** (grep → 0), no un mero riesgo tolerable: el criterio es verificable por grep y actualmente falla. El patrón espeja `app/api/auth/login/route.ts:47-49,80-82` (fuera del scope del grep, ya aceptado en IMPL-02) — la simetría lo hace **defendible y no bloqueante**, pero no restaura el contrato. **Decisión:** INTEGRA emite **mini-SPEC `SPEC-20260820-001-auth-lookup-actor`** (BACKLOG, diferida) que delega a SOFIA el refactor: añadir `auth.lookupActor(email): Promise<{ id, organizationId } | null>` al servicio `auth`; refactorizar `routers/auth.ts:54,86` y `login/route.ts:47-49,80-82` para que deleguen el lookup al servicio. Restaura AC-28 grep → 0. L1–L2 (~6–10 líneas), sin cambio de contrato público (método interno nuevo). **No bloquea staging** (ya gated por BD/E2E infra-Frank); se procesa en el próximo ciclo SOFIA o se batecha con los gates BD post-infra.
- **P3-2 (`actor_role_code` end-to-end) — decisión INTEGRA: diferir como hardening técnico no bloqueante, sin fix y sin inventar requisito funcional.** `rg "actorRoleCode" src/server/trpc/routers/auth.ts src/app/api/auth/login/route.ts` retorna **0** en los call sites de `openAccessToken` (`auth.ts:126`, `login/route.ts:115`): ningún JWT de login lleva hoy `actor_role_code`. **Esto es correcto por contrato:** ADR-06 §2.1 fija el claim como **condicional a acción crítica combinable** (`actor_role_code (cuando aplica a acción crítica combinable, ACTORES §6)`); AC-82 lo declara **opcional** ("ausente cuando no aplica — e.g. bootstrap/login sin rol combinable"). El login **no** es una acción crítica combinable (no hay selección de rol activo en login), por lo que los callers **omiten correctamente** `actorRoleCode`. El contrato está listo y testeado (3 escenarios PASS: presente→decodifica, ausente→`undefined`, vacío→`undefined`). La propagación desde `Context.actorRoleCode` al emisor se cableará al implementar el **primer procedure con acción crítica combinable** (e.g. SPEC-003 aceptación de cotización con doble rol, per AC-9 / invariante 12 / ACTORES §6); cuando esa SPEC se produzca, INTEGRA añadirá un AC requiriendo `actorRoleCode: ctx.actorRoleCode` en el `openAccessToken` de ese procedure. **No se genera mini-SPEC para P3-2** (no hay fix que hacer hoy; forzar la propagación en login sería inventar un requisito funcional inexistente).
- **Estado canónico recomendado:** SPEC-001 / IMPL-03 → **`VERIFYING (QA-03-PASS_WITH_WARNINGS · pendiente-gates-BD/E2E-infra-Frank · P3-1-mini-deferred · P3-2-deferred-hardening)`**. **NO `DONE`** — los gates obligatorios BD/E2E carecen de evidencia (infra-Frank ausente). Staging: **NO_LISTO**. Producción: **NO_LISTO**.
- **ADR-06:** sin cambios (sus contratos §2.1/§2.2/§2.3/§2.4/§2.9/§3.1 ya exigían los 4 hallazgos cerrados; P3-1 es propiedad del invariante 24/AC-28 — SOL-20260819-01, no de ADR-06; P3-2 ya documentado en §2.1 como condicional).
- **Próximo gate (ATLAS):** (a) Frank provisiona PostgreSQL 16 + MinIO + secretos para ejecutar gates BD/E2E; (b) opcional, activar ciclo SOFIA para la mini-SPEC P3-1 (no bloqueante) antes de staging o batería con gates BD; (c) tras gates BD PASS + GEMINI re-verificación BD → evaluar `DONE (pendiente-staging)`.

### 16.2 Cierre técnico post-QA-20260820-04 (v1.10 · INTEGRA · no implementa código)

- **QA-04:** `context/reviews/QA-20260820-04-IMPL-20260820-04.md` = **PASS** (0 P0 / 0 P1 / 0 P2 / 1 P3=R3). Incremento auditado: IMPL-20260820-04 (mini-SPEC `SPEC-20260820-001` — `auth.lookupActor` interno aditivo; refactor simétrico del router tRPC `routers/auth.ts:54,86` y del HTTP route `app/api/auth/login/route.ts:47-49,80-82`). **Cierra P3-1 de QA-03** (regresión AC-28 restaurada: `rg "select\(|...|\.values\(" src/server/trpc/routers/` → 0, re-verificado por INTEGRA). Gates ejecutados (local): `typecheck` PASS · `lint` PASS · `tests 34/34` PASS (31 previos + 3 nuevos `lookup-actor.test.ts`) · `check-antipatterns` 15/15 PASS · greps AC-LA-1..4 PASS. **Gates NO ejecutados (gated-Frank):** `db:migrate`/`bootstrap`/`smoke`/`test:e2e` + tests con BD (filas `audit_logs` reales, 5-fallos→`locked_until`, cross-org) — PostgreSQL 16 + MinIO + secretos ausentes (heredado de QA-03).
- **R3 (cobertura del grep AC-28 sobre HTTP layer) — decisión INTEGRA: hardening preventivo no bloqueante + criterio futuro formal.** QA-04 §D P3: el grep canónico AC-28 formalmente cubre sólo `src/server/trpc/routers/`, no `src/app/api/auth/**`; hoy el código cumple (0 consultas Drizzle en ambos transportes, verificado por INTEGRA), pero un futuro transporte de auth podría reintroducir el antipatrón sin detección. **Decisión:** (1) R3 clasificado **hardening preventivo no bloqueante** (no bloquea staging ni DONE de la mini-SPEC); (2) se materializa como **AC-83** (criterio futuro formal, simetría de AC-28 para el transporte HTTP, patrón **Drizzle-anclado** — ver AC-83 por el falso positivo de `delete\(` sobre `jar.delete(...)` del cookie-jar en `logout/route.ts:98,99`); (3) la automatización del grep en `scripts/check-antipatterns.ts` queda como **P-H-1 (§14)**, implementación diferida a SOFIA en ronda de hardening post-infra (no la implementa INTEGRA). AC-83 = **PASS hoy** (verificación manual: greps Drizzle-anclado = 0).
- **Estado canónico recomendado:** SPEC-001 → **`VERIFYING (QA-04-PASS · P3-1-cerrado · AC-83-añadido · pendiente-gates-BD/E2E-infra-Frank · P-H-1-deferred-hardening · NO DONE)`**. **NO `DONE`** — faltan gates obligatorios BD/E2E con evidencia reproducible + GEMINI re-verificación BD. Mini-SPEC `SPEC-20260820-001` (refactor puro, sin BD) → **`DONE (refactor local verificado; cierre P3-1 QA-03)`** (su DoD local cumplido: AC-LA-1..4 PASS + GEMINI QA-04 PASS). Staging: **NO_LISTO**. Producción: **NO_LISTO**.
- **ADR-06 / SOL-20260819-01:** sin cambios (AC-83 refuerza el invariante 3 de SOL y la simetría de AC-28; no toca contratos de ADR-06).
- **Próximo gate (ATLAS):** (a) Frank provisiona PostgreSQL 16 + MinIO + secretos para ejecutar gates BD/E2E (único bloqueador para `DONE`); (b) tras gates BD PASS + GEMINI re-verificación BD → evaluar `DONE (pendiente-staging)`; (c) P-H-1 (automatizar AC-83 en `check-antipatterns.ts`) se batecha en una ronda de hardening post-infra o cuando se habilite `check-antipatterns.ts` (no bloqueante).

---

## 17. Contrato de interfaz y paridad responsive (v1.4 · ADR-20260819-03)

Esta sección fija el contrato de la **capa de presentación V1** que la plataforma provee como base y que toda SPEC de módulo (002–011) consume. Las decisiones fuente son DEC-FUN-20260819-70/-71/-72 y la guía de marca.

### 17.1 Sistema de componentes
- **Único sistema:** Tailwind CSS + shadcn/ui (Radix UI). Componentes copiados a `src/components/ui/*` (control total, auditables). Ningún otro framework de UI en V1.
- **Stack de la UI:** la UI es un adaptador de presentación (invariante 1 de SOL-20260819-01); consume servicios vía tRPC; **no importa Drizzle ni accede a PostgreSQL** (AC-26). Los esquemas Zod de validación se reutilizan en formularios vía `react-hook-form` + `zodResolver` (AC-29).

### 17.2 Tokens de tema (una sola fuente)
| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| Fondo | `#FFFFFF` | `#0A1F44` | Aplicación / layout |
| Texto principal | `#0A1F44` | `#FFFFFF` | Cuerpo, wordmark |
| Acento (CTA/foco) | `#D35400` | `#D35400` | Acciones, selección, isotipo |
| Texto secundario | `#2C3E50` | derivado legible AA | Texto secundario |
- Definidos como CSS variables consumidas por Tailwind. **Prohibido** hardcodear otros hex en componentes (uso de tokens).

### 17.3 Identidad de marca
- Activos canónicos en `context/VectorIA-Brand-Assets/` (logo oficial transparente, mockups, guía). El logo se sirve desde el asset canónico o una copia fiel en `public/brand/`.
- La referencia Oatmeal aporta **sólo** sobriedad compositiva (espacio negativo, jerarquía, densidad). **Prohibido** copiar código, assets, layout ni componentes del kit. Tipografía sans-serif moderna (Inter/Montserrat); **nunca** serif editorial.

### 17.4 Paridad operativa (DEC-FUN-72)
- Todas las pantallas y acciones de V1 son **plenamente operables** en móvil (375), tableta (768) y escritorio (1280).
- La presentación se adapta; las **capacidades autorizadas no cambian** por viewport: ninguna acción de negocio se bloquea, oculta ni degrada a consulta por tamaño de pantalla.
- Patrones: tablas → scroll horizontal o vista-card; navegación → sidebar (escritorio) / drawer (móvil); modales → responsive con trampa de foco; builders drag&drop → operables con touch (o controles subir/bajar equivalentes).

### 17.5 Accesibilidad
- WCAG AA (contraste, foco visible, teclado, ARIA). Radix aporta roles/teclas/foco por defecto. Foco visible con ring naranja. Navegación por teclado en toda interacción.

### 17.6 i18n
- `es-MX` único (DEC-FUN-39). Cadenas de UI vía catálogo de mensajes (sin literales embebidos). `Intl` con timezone de organización (BR-N203).

### 17.7 Restricciones para SPECs de módulo
- Toda SPEC 002–011 declara sus pantallas como consumidores de servicios vía tRPC (no BD).
- Toda SPEC que introduzca tabla/form/builder/modal cita este contrato y los AC-42..AC-68 aplicables, y lista los flujos E2E que cubren los 3 viewports (AC-66).
- Tooltips en admin/config (DEC-FUN-20) donde haya campos no obvios (AC-67; ver SPEC-010).

### 17.8 Exclusiones
- No se diseñan endpoints REST públicos ni adaptadores externos en V1 (AC-34, §3.2). La capa de presentación es web interna única.
