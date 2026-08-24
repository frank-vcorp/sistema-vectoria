# ADR-20260817-06 · Ciclo completo de autenticación y sesiones

- **ID:** ARCH-20260817-06
- **Estado:** accepted (ratificado por Frank · OK stack V1 completo · 2026-08-20)
- **Versión:** 1.1
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-18
- **Fuentes funcionales:** `discovery/DECISIONES-FUNCIONALES.md` DEC-FUN-02, DEC-FUN-21, DEC-FUN-29; `discovery/REGLAS-DE-NEGOCIO.md` BR-N205, BR-N206, BR-N349, BR-N336, BR-N337; `discovery/ACTORES-Y-PERMISOS.md` §4 (acciones críticas), §6 (rol usado); ADR-20260817-03 §3.3 (Argon2id, bloqueo tras 5 intentos).
- **Stack asumido:** ADR-20260817-01 v1.1 (credenciales locales + JWT httpOnly + link de invitación; sin OAuth en MVP).

---

## 1. Contexto

ADR-01 v1.0 fijó credenciales locales + sesión JWT httpOnly + link de invitación (DEC-FUN-21) y Argon2id + bloqueo tras 5 intentos (ADR-03 §3.3). Pero el **ciclo completo de auth** —refresh, logout, recuperación de contraseña, cambio de email con verificación, expiración, detección de sesión sospechosa, bitácora de auth— no estaba formalizado. Frank (instrucción v1.1 §2.5) exige cubrir el ciclo completo, citando BR-N205 (cero hardcode) y DEC-FUN-21 (link de invitación, sin WhatsApp).

**Restricción clave del discovery:** DEC-FUN-29 + BR-N349 establecen que en el MVP **no hay canal de email ni WhatsApp** (notificaciones sólo in-app). Esto condiciona el diseño de recuperación de contraseña y cambio de email: no pueden depender de un correo saliente. El ciclo se diseña coherentemente con esa restricción.

---

## 2. Decisión

### 2.1 Sesión: access JWT corto + refresh rotante

- **Access token (JWT httpOnly):** `Secure; SameSite=Strict; HttpOnly`, TTL corto (default 15 min, configurable). Claims: `sub` (user_id), `oid` (organization_id), `roles[]` (snapshot), `perms[]` (snapshot — para `hasPermission` sin round-trip BD en cada request), `iat`, `exp`, `jti` (id de sesión), `actor_role_code` (cuando aplica a acción crítica combinable, ACTORES §6).
- **Refresh token:** token opaco (UUID aleatorio + hash en BD en `refresh_tokens`), TTL 7 días (configurable). Se presenta vía cookie httpOnly separada (`Secure; SameSite=Strict; HttpOnly; Path=/api/auth/refresh`).
- **Refresh con rotación:** cada `refresh` emite un nuevo access + un **nuevo refresh**, e invalida el anterior. El refresh pertenece a una **familia** (id raíz de la sesión). Si un refresh **ya usado** se presenta de nuevo → **reutilización detectada**: se revoca la familia entera (todas las sesiones del usuario), se registra en bitácora como `auth.session.suspicious`, y se exige re-login. Cita BR-N336.

> El snapshot de `perms[]` en el access token es una **cache** para `hasPermission` sin BD; al revocar/otorgar permisos, el Director fuerza re-emisión (refresh) para que el snapshot se refresque. Si un permiso se revoca, la sesión afectada debe refrescar en < TTL_access para perderlo; para acciones críticas se valida contra BD (no contra cache) — ver §2.7.

### 2.2 Login

- `POST /api/auth/login {email, password}` → verifica el usuario existe, está `active`, no está bloqueado; verifica password con Argon2id (`argon2.verify`); si falla, incrementa `failed_login_count`; al 5º fallido (ventana móvil) bloquea hasta `locked_until` (ADR-03 §3.3).
- Si OK: resetea `failed_login_count`, crea `refresh_tokens` fila (familia nueva), emite access + refresh en cookies httpOnly, registra `auth.login.success` en bitácora con IP y user-agent. Cita BR-N205 (verificación por datos, no por rol).

### 2.3 Refresh

- `POST /api/auth/refresh` (sin body, usa la cookie de refresh) → valida el refresh (existe, no expirado, no revocado); si es válido y **no usado**, rota (invalida, emite nuevo par). Si es **usado/reutilizado** → revoca familia + `auth.session.suspicious`. Si **expirado** → `401`, exige re-login.

### 2.4 Logout

- `POST /api/auth/logout` → revoca el refresh actual (y opcionalmente toda la familia si el usuario elige "cerrar todas las sesiones"), limpia cookies, registra `auth.logout`. No requiere password.

### 2.5 Recuperación de contraseña (administrada, sin email)

Dado que **no hay canal de email** en MVP (DEC-FUN-29, BR-N349), la recuperación **no es self-service por correo**. Se formaliza como **acción administrada por el Director**:

- El usuario que olvidó su contraseña solicita reset al Director (vía canal externo existente en la operación, fuera del sistema).
- El Director (con permiso `gestionar_usuarios`) emite un **link de reset firmado** (reutiliza el mecanismo de invitación firmada, DEC-FUN-21): TTL corto (default 30 min, más corto que invitación), single-use, hash del token en BD (`password_reset_tokens`).
- El usuario consume el link, define nueva password (Argon2id, política mínima ADR-03 §3.3), y **todas las sesiones existentes del usuario se revocan** (forzar re-login en todos los dispositivos). Registra `auth.password.reset`.
- Cero envío por email/WhatsApp (DEC-FUN-21, BR-N349). El link se entrega al usuario por el canal operativo (presencial/chat), no por el sistema.

> **Deferral a Fase 2:** cuando exista canal de email (post-MVP), el reset podrá ser self-service con verificación por correo. Hoy, la ausencia de canal lo hace administrado. No es un `DISCOVERY-GAP`: la resolución se deriva de DEC-FUN-21 + DEC-FUN-29.

### 2.6 Cambio de email con verificación (administrado, sin email)

Misma restricción: sin canal de email, la "verificación por correo al nuevo email" no es posible en MVP. Se formaliza como **cambio administrado por el Director**:

- El usuario solicita cambio de email al Director.
- El Director (con `gestionar_usuarios`) actualiza el email; el cambio queda en `audit_logs` con before/after (`auth.email.change`); se **revocan las sesiones** del usuario (debe re-login con el nuevo email).
- "Verificación" en MVP = aprobación del Director (verifica la identidad del usuario out-of-band). **Self-service con verificación por correo diferido a Fase 2** (requiere canal de email).
- Cita BR-N205, BR-N336, BR-N206 (toda otorgación/revocación de identidad en bitácora).

> No es `DISCOVERY-GAP`: la ausencia de canal de email (DEC-FUN-29) hace derivable la administración. El mecanismo de verificación por correo se documenta como pendiente de Fase 2.

### 2.7 Expiración

- **Access token expirado** (15 min) → el cliente usa el refresh para obtener uno nuevo (silencioso si el refresh es válido).
- **Refresh expirado** (7 días sin uso) → `401`, re-login obligatorio.
- **Invitación expirada** → `410 INVITATION_EXPIRED` al consumir (v1.0 AC-22).
- **Reset link expirado** → `410 RESET_LINK_EXPIRED`.
- **Cuenta bloqueada** → `423 ACCOUNT_LOCKED` hasta `locked_until` (v1.0 AC-21).

### 2.8 Detección de sesión sospechosa

Tres señales, todas en bitácora:

1. **Reutilización de refresh** (§2.3): revoca familia, `auth.session.suspicious` con `reason='refresh_reuse'`.
2. **Login desde user-agent/fingerprint nuevo** para el usuario: se registra `auth.session.new_device` (informativo; no bloquea en MVP — no hay IP geolocation ni lista de dispositivos confiables definida). Notificación in-app al usuario (BR-N349/BR-N350 evento `auth.new_device`).
3. **Múltiples intentos fallidos** (§2.2): bloqueo de cuenta, `auth.login.locked`.

> La señal 2 es **informativa** en MVP; no hay policy de bloqueo por geolocalización (fuera de alcance). Se documenta para que Fase 2 pueda añadir políticas.

### 2.9 Bitácora de auth (`audit_logs` con namespace `auth.*`)

Todas las operaciones de auth se registran en `audit_logs` (tabla existente, v1.0) con `action` en namespace `auth.*`:

| `action` | Evento | Campos clave |
|---|---|---|
| `auth.login.success` | Login correcto | `actor_user_id`, IP, UA |
| `auth.login.failed` | Login fallido | `entity_id` (email intentado), IP, UA |
| `auth.login.locked` | Cuenta bloqueada | `actor_user_id`, `locked_until` |
| `auth.refresh` | Refresh rotado | `actor_user_id`, sesión familia |
| `auth.logout` | Logout | `actor_user_id`, sesión |
| `auth.session.suspicious` | Reutilización de refresh | `actor_user_id`, `reason` |
| `auth.session.new_device` | UA nuevo | `actor_user_id`, UA hash |
| `auth.invitation.issued` | Invitación emitida | `entity_id` (email), `expires_at` |
| `auth.invitation.consumed` | Invitación consumida | `actor_user_id` (nuevo) |
| `auth.password.reset` | Reset consumido | `actor_user_id` |
| `auth.email.change` | Email cambiado | `actor_user_id`, before/after email |

**Ningún secreto** se loguea (no password, no token en claro, no refresh). IP y user-agent (hash de UA) sí, para detección. Cita BR-N336, BR-N337.

---

## 3. Contratos fijados

1. Access JWT httpOnly corto (15 min) + refresh rotante (7 días); cookie `Secure; SameSite=Strict; HttpOnly`.
2. Refresh con **rotación y familia**: reutilización → revoca familia + `auth.session.suspicious`.
3. Recuperación de contraseña y cambio de email son **administradas por el Director** en MVP (sin canal de email); self-service por correo diferido a Fase 2.
4. Reset de password y cambio de email **revocan todas las sesiones** del usuario.
5. Bitácora de auth con namespace `auth.*` en `audit_logs`, sin secretos, con IP y UA hash.
6. `hasPermission` usa snapshot del access token; acciones críticas validan contra BD (no cache) para revocación efectiva inmediata.
7. Cero hardcode (BR-N205): el acceso a rutas se valida por `hasPermission` + `canAccessResource`, no por nombre de rol.

### 3.1 Acciones críticas validan contra BD

Para evitar que un permiso revocado siga vigente hasta el TTL del access token, las **acciones críticas** (aceptar cotización, autorizar OS, crear proyecto, cerrar OS, facturar, cobrar, pagar comisión — BR-N336) **no** confían en el snapshot `perms[]` del token: revalidan `hasPermission` contra BD antes de ejecutar. Las acciones no críticas pueden usar el snapshot (rendimiento). Cita BR-N336, ACTORES §6.

---

## 4. Consecuencias

### 4.1 Positivas
- Ciclo de auth completo y verificable, sin canal de email (consistente con DEC-FUN-29).
- Detección de sesión sospechosa por reutilización de refresh (estándar).
- Trazabilidad total: todo evento de auth en `audit_logs` con namespace `auth.*`.
- Revocación efectiva de sesiones tras reset/cambio de email.

### 4.2 Negativas / trade-offs
- Recuperación de contraseña y cambio de email **no son self-service** en MVP; dependen del Director. Aceptable para 4-10 personas; puede friccionar si el Director no está. Mitigación: el rol `administrador` puede tener `gestionar_usuarios` delegado (DEC-FUN-22 permisos aditivos).
- El snapshot `perms[]` en el token puede estar desactualizado hasta TTL_access para acciones no críticas. Mitigación: §3.1 (acciones críticas revalidan contra BD).
- Refresh rotation exige estado en BD (`refresh_tokens`); es el coste de la detección de reutilización.

### 4.3 Reversibilidad
- Añadir canal de email en Fase 2 habilita self-service de reset/cambio de email **sin romper** el contrato (los links firmados ya existen; sólo cambia el canal de entrega).
- Cambiar TTLs es configuración, no rediseño.

---

## 5. Restricciones para SPECs

- SPEC-001 v1.1 contiene los ACs testeables del ciclo de auth (AC-53 a AC-61).
- Toda SPEC que defina una acción crítica (003 cotización, 004 OS, 005 proyectos cierre, 007 factura, 008 cobro/comisión) debe marcarla como "revalida `hasPermission` contra BD" (§3.1).

---

## 6. ACs derivadas (testeables en SPEC-001 v1.1)

- **AC-53** · Login: email+password correctos → access+refresh en cookies httpOnly `Secure;SameSite=Strict`; Argon2id verify; `auth.login.success` en `audit_logs` con IP+UA.
- **AC-54** · Refresh rotante: refresh válido → nuevo access + nuevo refresh; el refresh anterior no acepta de nuevo; reutilizarlo → revoca familia + `auth.session.suspicious`.
- **AC-55** · Logout: revoca refresh; cookies limpiadas; `auth.logout` en bitácora.
- **AC-56** · Recuperación administrada: Director emite link de reset (TTL 30 min, single-use); usuario consume y define nueva password; todas las sesiones del usuario revocadas; `auth.password.reset` en bitácora; sin envío de email/WhatsApp.
- **AC-57** · Cambio de email administrado: Director actualiza email; `auth.email.change` con before/after; sesiones revocadas; self-service por correo declarado deferido a Fase 2.
- **AC-58** · Invitación firmada: TTL, single-use, consumo crea usuario + rol + credencial; `auth.invitation.issued`/`consumed` en bitácora (refuerza v1.0 AC-22 con bitácora).
- **AC-59** · Expiración: access expirado → refresh silencioso si válido; refresh expirado → `401`; invitación/reset expirados → `410`; cuenta bloqueada → `423`.
- **AC-60** · Sesión sospechosa: reutilización de refresh → familia revocada + notificación in-app (`auth.new_device` evento no bloquea, informativo); 5 logins fallidos → `auth.login.locked`.
- **AC-61** · Bitácora de auth: todos los eventos `auth.*` en `audit_logs` con actor, IP, UA hash, momento, outcome; **sin** password, token, ni refresh en claro.

---

## 7. Referencias cruzadas

- Derivado de: instrucción Frank v1.1 §2.5 + DEC-FUN-21/29 + BR-N205/N336.
- Relacionado: ADR-01 v1.1 (JWT httpOnly, Argon2id), ADR-03 v1.1 (bloqueo tras 5 intentos, política de password), ADR-04 (primera invitación del Director), ADR-05 (acciones críticas revalidan).
- Aplica a: SPEC-001 v1.1 (AC-53 a AC-61) y transversal a toda SPEC con acciones críticas.
