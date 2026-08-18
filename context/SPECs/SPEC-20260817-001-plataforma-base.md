# SPEC-20260817-001 · Plataforma Base

- **ID:** SPEC-20260817-001
- **Estado:** READY
- **Versión:** 1.0
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-17
- **Módulo funcional cubierto:** Autenticación y Usuarios + Áreas transversales (Administración base, auditoría, archivos, jobs, notificaciones in-app, configuración fiscal de organización).
- **ADRs de referencia:** ARCH-20260817-01 (stack), ARCH-20260817-02 (multi-tenancy), ARCH-20260817-03 (secretos).
- **Stack asumido:** ver ADR-20260817-01 (Next.js App Router + TypeScript estricto + PostgreSQL 16 + Drizzle + tRPC + Zod + pg-boss + S3-compatible + Argon2id + AES-256-GCM).

---

## 1. Resultado

Plataforma fundacional que todas las demás SPECs consumen: organización (multi-tenancy latente), autenticación, roles y permisos como datos (`hasPermission`), auditoría de acciones críticas, almacenamiento de archivos con enlaces firmados, cifrado de campos sensibles, jobs nocturnos idempotentes y notificaciones in-app. Sin esta SPEC, ninguna otra puede implementarse.

---

## 2. Fuentes funcionales por ID

### Decisiones (DEC-FUN)
- DEC-FUN-01 (sistema modular configurable, todo dato) — structura toda la SPEC.
- DEC-FUN-02 (roles NO hardcoded, `hasPermission`) — §5.
- DEC-FUN-03 (hasta 5 roles por usuario) — §5.
- DEC-FUN-21 (link de invitación sin OAuth/WhatsApp) — §4.
- DEC-FUN-22 (permisos custom aditivos por usuario) — §5.
- DEC-FUN-29 (notificaciones sólo in-app en MVP) — §9.
- DEC-FUN-39 (sólo es-MX en MVP, arquitectura preparada) — §3.
- DEC-FUN-41 (respaldo BD diario, retención 30 días) — §10.
- DEC-FUN-46 (multi-org latente, `organization_id` en toda entidad) — §3, §5.

### Reglas de negocio (BR)
- B1 Organización y multi-tenancy: BR-016, BR-N200, BR-N201, BR-N202, BR-N203.
- B2 Actores, roles y permisos: BR-N127, BR-N128, BR-N131, BR-N204, BR-N205, BR-N206, BR-N207, BR-N208, BR-N209, BR-N210, BR-N211, BR-N212.
- B22 Auditoría: BR-N336, BR-N337, BR-N338, BR-N339, BR-N340.
- B24 Notificaciones: BR-N349, BR-N350.
- B27 Respaldo y disponibilidad: BR-N147, BR-N371, BR-N372, BR-N373, BR-N374.
- Reglas de cálculo transversales aplicables: BR-N330 (fechas), BR-N331 (estados de movimiento — se aplica a cuentas, pero la plataforma define el enum canónico).

### Actores y permisos
- `discovery/ACTORES-Y-PERMISOS.md` §1 (7 roles base), §2 (permisos de ejemplo), §5 (visibilidad y privacidad de datos), §6 (decisiones de cierre aplicadas).

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

### 3.2 Excluido (queda para SPECs posteriores)

- Catálogo de servicios, plantillas, cuestionarios → SPEC-003.
- Prospectos, clientes, contactos, datos fiscales del cliente → SPEC-002.
- Esquemas de negocio (cotización, OS, proyecto, factura, cobro, comisión, movimiento) → SPEC-004 a -009.
- Widgets de dashboard específicos por rol → SPEC-010 (esta SPEC sólo provee el mecanismo de notificaciones y la tabla `notifications`).
- Integración PAC FacturoPorTi → SPEC-007 (esta SPEC sólo provee el servicio de cifrado y archivos que la integridad usará).

---

## 4. Modelo técnico (contrato, sin código de producción)

### 4.1 Entidades de base de datos (esquema Drizzle, contrato tabular)

> Notación: `tabla (campo: tipo, ...)`. `UUID` = `uuid`. `TIMESTAMPTZ` = `timestamptz`. `JSONB` = `jsonb`.

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
- `jobs.enqueue(name, payload, {jobKey}): Promise<JobId>` / `jobs.run(name, handler)` — pg-boss con idempotencia por `jobKey`.

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
4. **Roles base no se eliminan; sólo se desactivan** (BR-N127). El Director puede crear roles adicionales (BR-N128). AC-4, AC-5.
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

---

## 6. Casos borde y errores

- **Usuario con 5 roles intenta añadir un 6º:** `400 Bad Request` con `{ code: 'MAX_ROLES_EXCEEDED' }`. AC-3.
- **Director desactiva un rol seed:** `409 Conflict` con `{ code: 'SEED_ROLE_NOT_DELETABLE' }` (BR-N127). AC-4.
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
- **Secretos:** ver ADR-03. Ningún secreto en logs, respuestas o respaldos no cifrados.
- **Archivos de evidencia y comprobantes:** enlaces firmados TTL corto; validación de tipo; sin índice público.
- **Auditoría de acceso a secretos:** toda lectura/escritura de `pac_api_key`, `csd_password`, `csd_pem` se registra en `audit_logs` sin valor.
- **Privacidad de técnicos (BR-N208, BR-N339):** las notas privadas de dirección en `project_log_entries` (`private=true`) no se entregan a usuarios sin permiso `ver_notas_privadas`.

---

## 8. Migración/compatibilidad

- **Estado inicial:** base de datos vacía; migración inicial crea todas las tablas de esta SPEC + semilla de `organizations` (1), `roles` (7 seed) y `permissions` (los de ACTORES §2 + los de §7).
- **Primer usuario (Director):** se crea vía `invitations` emitida por script de seeding (firmado por `MASTER_KEY`); al consumirla, el primer usuario recibe el rol `director` con todos los permisos base.
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

### AC-4 · Roles seed no se eliminan
- **Validación:** test Vitest: intentar `DELETE` lógico (`active=false`) de un rol con `is_seed=true` → `409 { code: 'SEED_ROLE_NOT_DELETABLE' }`. Para rol no-seed → OK.
- **Output esperado:** test verde.

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

Salida esperada global tras implementación: `typecheck PASS`, `lint PASS`, `test PASS`, `test:e2e PASS`, scripts `OK`.

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
- **P1 · Decisión de proveedor de bucket S3 en prod:** Frank.
- **P2 · Decisión de hosting/VPS:** Frank.
- **P3 · Procedimiento operativo de backup físico y retención 30 días:** Frank.

---

## 15. DoD

- AC-1 a AC-25 PASS (cada uno con comando + output esperado documentado).
- `typecheck`, `lint`, `test`, `test:e2e` PASS.
- Migración inicial aplicada y seed corre sin error.
- Primer Director creado vía invitación y puede loguear.
- `audit_logs` registra todas las acciones críticas de la propia plataforma.
- `PROYECTO.md` actualizado: SPEC-001 → `VERIFYING` (tras `READY_FOR_VERIFYING` de SOFIA) → `DONE` (tras gates INTEGRA).
- Sin `SPEC-GAP` activo.
- GEMINI PASS o PASS_WITH_WARNINGS recomendado (esta SPEC es fundacional y toca auth, secretos y multi-tenancy → GEMINI obligatorio por §17 de integra.md: toca auth y secretos).

---

## 16. Handoff a SOFIA (resumen — el SPEC-HANDOFF completo lo emite INTEGRA al delegar)

- **ID tarea:** (se asigna al delegar, IMPL-YYYYMMDD-NN).
- **SPEC activa:** SPEC-20260817-001 (esta).
- **ADRs:** ARCH-01, ARCH-02, ARCH-03.
- **Resultado:** plataforma fundacional operativa con seed, login, hasPermission, audit, files, crypto, jobs, notifications.
- **Alcance de archivos/módulos:** `src/server/db/*` (esquemas Drizzle), `src/server/trpc/routers/plataforma/*`, `src/server/services/{auth,hasPermission,audit,crypto,files,jobs,session,invitations}/*`, `src/server/jobs/*`, `src/shared/enums/*`, `src/modules/plataforma/*`, `scripts/{check-multitenancy,check-rls,check-currency}.ts`, `drizzle/` (migraciones), `playground/` o `e2e/` para Playwright.
- **Contratos que cambian:** ninguno previo (es base).
- **Contratos protegidos:** enums canónicos, `hasPermission`, `audit_logs`, `organization_id` en toda entidad.
- **Validaciones:** ver §12.
- **Restricciones:** cero `if (user.role === ...)`; cero secreto en logs; RLS inactivo en MVP; sin blobs en BD; sin OAuth.
- **Dependencias:** ninguna externa bloqueante (Drizzle, pg-boss, Argon2, Zod, tRPC, Next.js, MinIO client, Playwright, Vitest).
- **DoD:** §15.
- **Prohibido inferir:** estados de negocio no listados en esta SPEC (p.ej. estados de Proyecto, Factura, etc. — los definen sus SPECs); políticas de producto (Q-NB-3).
