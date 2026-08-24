# ADR-20260817-04 · Bootstrap y semilla inicial

- **ID:** ARCH-20260817-04
- **Estado:** accepted (ratificado por Frank · OK stack V1 completo · 2026-08-20)
- **Versión:** 1.3
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-18 (v1.1) · 2026-08-19 (v1.2) · 2026-08-20 (v1.3)
- **Fuentes funcionales:** `discovery/DECISIONES-FUNCIONALES.md` DEC-FUN-01, DEC-FUN-02, DEC-FUN-21, DEC-FUN-29, DEC-FUN-39, DEC-FUN-41, DEC-FUN-44, DEC-FUN-46, **DEC-FUN-20260819-69**, **DEC-FUN-20260820-74**, **DEC-FUN-20260820-75**; `discovery/REGLAS-DE-NEGOCIO.md` BR-N127, BR-N147, BR-N200, BR-N201, BR-N203, BR-N205, BR-N219, BR-N226, BR-N228, BR-N349, BR-N374, **BR-N408, BR-N409, BR-N410, BR-N412, BR-N413**; `discovery/ACTORES-Y-PERMISOS.md` §1 (7 roles seed); `discovery/FLUJOS-FUNCIONALES.md` FLOW-OS-01.
- **Stack asumido:** ADR-20260817-01 v1.1 (sin cambios).

---

## 1. Contexto

El repositorio nace vacío de código (sólo `discovery/`, `context/`, `.kilo/`, `.vscode/`). El primer arranque debe dejar el sistema operativo y con **login funcional** mediante un solo comando, sin pasos manuales dispersos. Frank (instrucción v1.1) exige que el bootstrap incluya: migraciones iniciales, seed de organización, **7 roles seed**, permisos base, **catálogo de servicios**, **9 plantillas**, **6 cuestionarios**, verificación de dependencias y un smoke test mínimo.

El discovery fija los conteos y la estructura: 7 roles base (ACTORES §1, BR-N127), 9 plantillas (BR-N228), cuestionario en 4 capas (DEC-FUN-44, BR-N219), catálogo configurable (BR-N226), multi-org latente con una sola organización en MVP (DEC-FUN-46), respaldo BD diario (DEC-FUN-41, BR-N147), notificaciones sólo in-app (DEC-FUN-29, BR-N349), locale `es-MX` y timezone México (DEC-FUN-39, BR-N203).

El primer Director no existe al arranque. DEC-FUN-21 establece el link de invitación como mecanismo de ingreso. El bootstrap debe emitir la **primera invitación firmada** (auto-consumible en el primer arranque) para crear al Director semilla con todos los permisos base.

---

## 2. Decisión

### 2.1 Comando único de bootstrap

Se define un **único comando** `pnpm bootstrap` que orquesta, de forma idempotente y en orden estricto:

1. **`deps:check`** — verificación de dependencias de entorno y secretos.
2. **`db:migrate`** — aplicación de la migración inicial (Drizzle Kit) sobre BD vacía.
3. **`db:seed:plataforma`** — semilla de `organizations` (1), roles seed (7), permisos base, y emisión de la invitación del primer Director.
4. **`db:seed:catalog`** — semilla de catálogo de servicios, 9 plantillas y 6 cuestionarios (definidos por SPEC-003; **stub idempotente** hasta que SPEC-003 esté `READY`).
5. **`db:seed:rls`** — creación de las políticas RLS **inactivas** (ADR-02 v1.1).
6. **`smoke`** — smoke test mínimo que verifica que el login opera.

`pnpm bootstrap` es **idempotente**: re-ejecutar no duplica seed (upsert por `slug`/`code`), no re-aplica migraciones ya aplicadas, no re-crea políticas RLS existentes. Falla rápido (`fast-fail`) si un paso previo no se cumple, sin dejar el sistema en estado intermedio (cada paso es transaccional; el paso de migración es el único no transaccional y se ejecuta primero).

### 2.2 Verificación de dependencias (`deps:check`)

Antes de tocar la BD, el bootstrap verifica presencia y validez mínima de:

- Variables de entorno obligatorias: `DATABASE_URL`, `MASTER_KEY` (32 bytes base64), `SESSION_SECRET` (≥32 bytes), `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `NODE_ENV`, `APP_BASE_URL`, `VECTORIA_DIRECTOR_EMAIL`.
- **(v1.3 · DEC-FUN-20260820-74/BR-N412)** `VECTORIA_SUPERUSER_PASSWORD` (no-vacío): secreto de bootstrap para la contraseña inicial del SuperUser técnico `contacto@vector-ia.mx`. Se valida en `deps:check` y `EnvSchema` (Zod). Si está ausente/vacío, el bootstrap **aborta fail-safe** (exit !=0) nombrando la variable **sin imprimir su valor** — el SuperUser **no** se crea con contraseña fabricada. El **valor** es de Frank (provisionamiento, fuera de SPEC/ADR/PROYECTO.md); sólo el **nombre** y **formato** son contrato.
- Conectividad TCP a `DATABASE_URL` y a `S3_ENDPOINT`.
- `MASTER_KEY` decodificable como 32 bytes exactos (no se loguea el valor).
- Versión de PostgreSQL ≥ 16 (vía `SELECT version()`).

Si falta cualquier variable o la conexión falla, el bootstrap termina con código !=0 y un mensaje que **no expone secretos** (sólo nombra la variable faltante). Cita BR-N205 (cero hardcode de configuración sensible) y ADR-03 (secretos).

### 2.3 Semilla de plataforma (`db:seed:plataforma`)

Datos sembrados (idempotentes por `slug`/`code`):

- **Organización (1):** `slug='default'`, `name=<configurable vía env VECTORIA_ORG_NAME o 'Vector IA'>`, `currency='MXN'`, `locale='es-MX'`, `timezone='America/Mexico_City'`, `active=true`. Cita DEC-FUN-46, BR-N200, BR-N202, BR-N203, DEC-FUN-39.
- **Roles seed (7):** `director`, `vendedor`, `administrador`, `lider_proyecto`, `programador`, `disenador`, `qa`, cada uno con `is_seed=true`, `active=true`. Cita ACTORES §1, BR-N127, DEC-FUN-02.
- **Permisos base (v1.3 · DEC-FUN-20260820-75/BR-N413):** la plataforma siembra **sólo** los permisos **propios** listados en `BASE_PERMISSIONS` (`shared/enums/index.ts`: `gestionar_usuarios`, `gestionar_roles`, `gestionar_config_fiscal`, `ver_auditoria`, `gestionar_cuestionarios`, `gestionar_catalogos`, `gestionar_plantillas`, `emitir_invitaciones`, `gestionar_jobs`, `ver_todo`, `ver_costos`, `ver_cxc_otros`, `ver_comisiones_otros`, `ver_tiempo_equipo`, `ver_notas_privadas`). **No** siembra permisos de módulos de negocio; cada módulo (SPEC-002..011) declara/siembra sus permisos al implementarse. En particular `registrar_tiempo` **no** es permiso de plataforma → se difiere a **SPEC-006**. Cita DEC-FUN-02/75, BR-N205/N413.
- **`role_permissions` seed (v1.3):** los permisos propios de plataforma asignados a cada rol seed según la matriz de visibilidad (ACTORES §3, §4), respetando BR-N207 a BR-N212 (p.ej. `vendedor` no recibe `ver_costos`; `lider_proyecto` no recibe `ver_costos`; `director` recibe todos los de plataforma; `administrador` recibe comercial/financiero de plataforma; **`programador` queda `[]` en plataforma** — `registrar_tiempo` es de SPEC-006, no se siembra aquí). Cita BR-N205, BR-N207–N212, BR-N413.
- **SuperUser técnico (v1.3 · DEC-FUN-20260820-74/BR-N412):** el bootstrap crea y conserva una fila `users`+`credentials` para el SuperUser `contacto@vector-ia.mx` **antes** de emitir la primera invitación. La contraseña inicial se consume del secreto `VECTORIA_SUPERUSER_PASSWORD` (Argon2id, `password_hash`); el valor **nunca** se inventa/documenta/expone ni se loguea. Upsert idempotente por `(organization_id, email)` (conservado en re-ejecuciones). El SuperUser **no** recibe `user_roles`/`user_permissions` (no es operador de negocio); es **actor trazable** para `created_by` de la invitación fundacional y para `audit_logs.actor_user_id` del propio bootstrap. Cita DEC-FUN-20260820-74, BR-N412.
- **Primer Director vía invitación:** el bootstrap emite una `invitations` firmada (DEC-FUN-21) para el email configurado en `VECTORIA_DIRECTOR_EMAIL` (env obligatorio del primer arranque), TTL configurable (default 7 días, prorrogable si Frank lo autoriza), con **`created_by = SuperUser.id`** (no UUID cero — resuelve P1-2; `invitations.created_by` permanece `NOT NULL`). El token claro se imprime **una sola vez** en stdout del primer arranque (no se loguea a fichero persistente, no se persiste en BD en claro). Al consumirla, el usuario recibe el rol `director` con todos los permisos base de plataforma. Cita DEC-FUN-21, DEC-FUN-20260820-74, BR-N205/N412.

> **Política anti-código:** la asignación de `role_permissions` seed se declara como **dato** (mapa `rol → [permisos]` en la semilla), no como `if` en código. Cero hardcode de verificación (BR-N205). **(v1.2 · DEC-FUN-20260819-69, BR-N409):** los `role_permissions` de roles seed son **inmutables post-bootstrap**; el Director **no** puede editarlos. Lo editable post-bootstrap es: el `label` de un rol seed (BR-N408) y la creación/asignación de roles custom (BR-N128); las variaciones de permisos se resuelven con roles custom o permisos aditivos por usuario (SPEC-001 AC-6/AC-69/AC-70).

### 2.4 Semilla de catálogo/plantillas/cuestionarios (`db:seed:catalog`)

- **Catálogo de servicios** (BR-N226): estructura configurable; la semilla carga los servicios base declarados por SPEC-003.
- **9 plantillas** (BR-N228): 4 niveles de Sistema Web (landing, sitio, web app, saas — DEC-FUN-12) + 5 de otros tipos. La semilla carga el esqueleto de cada plantilla con sus `project_modules` base (DEC-FUN-14, BR-N229).
- **6 cuestionarios** (DEC-FUN-44, BR-N219): cada uno en 4 capas (base universal, por tipo de proyecto, por servicio, sub-cuestionarios opcionales). El conteo "6" es parámetro de semilla fijado por Frank en la instrucción v1.1; la **estructura** de cada cuestionario se rige por DEC-FUN-44/BR-N219.

> **Dependencia con SPEC-003:** el contenido detallado de catálogo/plantillas/cuestionarios lo define SPEC-003 (Comercial). Hasta que SPEC-003 esté `READY`, `db:seed:catalog` es un **stub idempotente** que registra en `audit_logs` que la semilla de catálogo quedó pendiente y **no falla**. El AC de login operativo no depende de este paso. Cuando SPEC-003 esté lista, el stub se reemplaza por la semilla real sin cambiar el comando `pnpm bootstrap`.

### 2.5 Semilla RLS (`db:seed:rls`)

Crea las políticas RLS **inactivas** (`DISABLE ROW LEVEL SECURITY`) para todas las tablas con `organization_id`, según ADR-02 v1.1. Idempotente. Cita ADR-02 v1.1.

### 2.6 Smoke test mínimo (`smoke`)

Verifica, sin intervención humana:

1. La migración creó las tablas de plataforma (`organizations`, `users`, `credentials`, `roles`, `permissions`, `role_permissions`, `user_roles`, `user_permissions`, `invitations`, `audit_logs`, `notifications`, `files`, `file_links`, `job_runs`, `project_log_entries`).
2. La organización seed existe con `currency='MXN'`.
3. Los 7 roles seed existen con `is_seed=true`.
4. **(v1.3)** El SuperUser `contacto@vector-ia.mx` existe con `credentials.password_hash` Argon2id (sin imprimir/expone la contraseña).
5. La invitación del primer Director existe y no está consumida ni expirada, con `created_by` apuntando al SuperUser (no UUID cero).
6. Un **login de smoke** falla correctamente para credenciales inválidas (`401`) y el endpoint `/health` responde `200` en < 500 ms.
7. `pg-boss` está inicializado (tabla de colas presente).
8. RLS está `enabled=false` en todas las tablas de negocio (MVP, una sola org).

El smoke **no** crea el Director automáticamente (requiere consumir la invitación, que es un acto humano). El smoke verifica que la invitación es **consumible** (token válido al validar contra `token_hash`), sin consumirla.

---

## 3. Contratos fijados

1. **`pnpm bootstrap`** es el único comando de arranque desde repo vacío. Orquesta `deps:check → db:migrate → db:seed:plataforma → db:seed:catalog → db:seed:rls → smoke`.
2. El bootstrap es **idempotente** y **transaccional por paso** (salvo la migración, que es el primer paso y gestiona Drizzle Kit).
3. El primer Director se crea **sólo** vía invitación firmada (DEC-FUN-21); el bootstrap no inserta un usuario de negocio con password directa. **(v1.3)** El SuperUser técnico `contacto@vector-ia.mx` sí se crea directamente en el seed (con credencial Argon2id del secreto `VECTORIA_SUPERUSER_PASSWORD`), **antes** de la invitación, y sirve como `created_by` de ésta.
4. La asignación de permisos a roles seed es **dato** (mapa en semilla), respetando BR-N205 (cero hardcode) y la matriz de visibilidad (BR-N207–N212). **(v1.3 · BR-N413)** la plataforma siembra **sólo permisos propios** (`BASE_PERMISSIONS`); los permisos de módulo los siembra cada SPEC; `registrar_tiempo` → SPEC-006.
5. Ningún secreto se loguea durante el bootstrap; el token de la primera invitación se imprime una sola vez en stdout; la `VECTORIA_SUPERUSER_PASSWORD` **nunca** se imprime/loguea (sólo se hashea en `credentials.password_hash`).
6. `db:seed:catalog` es stub idempotente hasta SPEC-003; no bloquea el AC de login operativo.
7. El bootstrap termina con código 0 sólo si el smoke pasa; cualquier fallo deja código !=0 y mensaje sin secretos.

---

## 4. Consecuencias

### 4.1 Positivas
- Un solo comando deja el sistema con login operativo; cero documentación dispersa de pasos manuales.
- Idempotencia permite re-ejecutar tras fallos parciales sin duplicar datos.
- El primer Director nace por el mismo mecanismo (invitación firmada) que cualquier otro usuario: cero backdoor de auth.
- La semilla de catálogo desacoplada de SPEC-003 permite avanzar plataforma sin bloquear por Comercial.

### 4.2 Negativas / trade-offs
- El primer arranque depende de `VECTORIA_DIRECTOR_EMAIL` (env obligatorio); sin él, el bootstrap falla con mensaje claro. No hay Director por defecto sin email.
- `db:seed:catalog` como stub significa que, hasta SPEC-003, el sistema arranca sin catálogo/plantillas/cuestionarios reales. Aceptable: el AC es "login operativo", no "comercial operativo".
- **(v1.2 · BR-N409):** los `role_permissions` de roles seed son inmutables post-bootstrap, así que una re-ejecución del bootstrap no los revertiría (no hay modificación previa que revertir). El `label` de un rol seed sí es editable (BR-N408); el upsert del seed debe **preservar** los `label` editados (no sobrescribirlos por el default). La mitigación de upsert respetando modificaciones **aplica sólo a roles custom** creados por el Director y a sus `role_permissions` (BR-N128). Ver SPEC-001 AC-69/AC-70 y el AC de idempotencia de seed.

### 4.3 Reversibilidad
- El bootstrap no es destructivo: no hace `DROP`. Revertir el primer arranque = eliminar la BD y re-ejecutar (acción de Frank, fuera de SPEC).
- Reemplazar `db:seed:catalog` (stub) por la semilla real de SPEC-003 no cambia el comando ni los contratos.

---

## 5. Restricciones para SPECs

- SPEC-001 v1.1 contiene los ACs testeables del bootstrap (AC-26 a AC-32 en SPEC-001 v1.1).
- SPEC-003 (Comercial) define el contenido real de `db:seed:catalog` (catálogo, 9 plantillas, 6 cuestionarios) y reemplaza el stub.
- Toda SPEC que añada una tabla con `organization_id` debe añadir su política RLS al paso `db:seed:rls` (vía migración, no manual).

---

## 6. Pendientes

- **P-04-1 (Frank, fuera de SPEC):** proveer `VECTORIA_DIRECTOR_EMAIL`, `MASTER_KEY` (32 bytes) y `VECTORIA_SUPERUSER_PASSWORD` (no-vacío) para el primer arranque. Acción infraestructural.
- **P-04-2 (Frank):** decidir TTL de la primera invitación (default 7 días) y si se permite prórroga.
- **P-04-3 (SPEC-003):** definir el contenido real de catálogo/plantillas/cuestionarios.
- **P-04-4 (SPEC-006, v1.3):** declarar y sembrar el permiso `registrar_tiempo` para el rol `programador` al implementar Proyectos — equipo y ejecución.

---

## 7. ACs derivadas (testeables en SPEC-001 v1.1)

- **AC-26** · `pnpm bootstrap` único comando, orden estricto, idempotente.
- **AC-27** · `deps:check` valida envs y conectividad; falla sin secretos.
- **AC-28** · `db:seed:plataforma` siembra org + 7 roles seed + permisos + invitación Director; upsert idempotente.
- **AC-29** · `role_permissions` seed respeta BR-N207–N212 (matriz de visibilidad).
- **AC-30** · `db:seed:catalog` stub idempotente (no falla) hasta SPEC-003.
- **AC-31** · `db:seed:rls` crea políticas inactivas (`enabled=false`).
- **AC-32** · `smoke` verifica login operativo (credencial inválida → `401`; `/health` → `200`; RLS inactivo; pg-boss inicializado).

---

## 8. Referencias cruzadas

- Derivado de: instrucción Frank v1.1 §2.1 + DEC-FUN-01/02/21/29/39/41/44/46.
- Relacionado: ADR-01 v1.1 (stack), ADR-02 v1.1 (RLS), ADR-03 v1.1 (MASTER_KEY), ADR-06 (invitación firmada), ADR-07 (pg-boss init).
- Aplica a: SPEC-20260817-001 v1.1 (AC-26 a AC-32) y SPEC-20260817-003 (contenido de `db:seed:catalog`).
