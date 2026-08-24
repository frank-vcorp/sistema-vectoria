# ADR-20260817-07 · Política de jobs, reintentos y dead letter queue

- **ID:** ARCH-20260817-07
- **Estado:** accepted (ratificado por Frank · OK stack V1 completo · 2026-08-20)
- **Versión:** 1.1
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-18
- **Fuentes funcionales:** `discovery/DECISIONES-FUNCIONALES.md` DEC-FUN-26, DEC-FUN-38, DEC-FUN-41; `discovery/REGLAS-DE-NEGOCIO.md` BR-N147, BR-N240, BR-N299, BR-N310, BR-N311, BR-N313, BR-N336, BR-N349, BR-N350, BR-N374; ADR-20260817-01 §5 (pg-boss, `job_key` idempotencia).
- **Stack asumido:** ADR-20260817-01 v1.1 (pg-boss sobre Postgres; sin cambios).

---

## 1. Contexto

ADR-01 v1.0 fijó pg-boss sobre Postgres e idempotencia por `job_key` determinista (AC-15). Pero la **política de reintentos**, la **dead letter queue (DLQ)**, la **visibilidad del estado del job**, los **reintentos manuales** y las **alertas de jobs estancados** no estaban formalizadas. Frank (instrucción v1.1 §2.6) exige cubrir estos, aplicándolos a: facturación recurrente (BR-N310), generación de ZIP mensual (BR-N311) y respaldo BD (BR-N147), además de los jobs ya en ADR-01 (comisiones día 15 BR-N299, SLA cotización 48 h BR-N240, escalamiento cobranza 2 promesas BR-N313).

---

## 2. Decisión

### 2.1 Modelo de job unificado

Todo job nocturno o programado se registra en `job_runs` (v1.0 AC-15, tabla existente) **con campos extendidos v1.1**:

- `job_name: text` — nombre canónico.
- `job_key: text` — clave de idempotencia determinista (p.ej. `factura_recurrente:2026-08-18:org:<uuid>`).
- `organization_id: uuid null` — null para jobs globales (`backup-bd`).
- `status: job_status` — `running | succeeded | failed | stuck | dlq`.
- `attempts: int not null default 0` — número de intentos.
- `max_attempts: int not null` — tope (default 5; configurable por job).
- `started_at`, `last_attempt_at`, `finished_at: timestamptz`.
- `result: jsonb`, `error: text`, `dlq_reason: text`.
- unique `(job_name, job_key)` (idempotencia, v1.0).
- índices: `(job_name, started_at)`, `(status, started_at)`, `(organization_id, started_at)`.

### 2.2 Idempotencia por `job_key` (refuerzo de AC-15)

- Antes de ejecutar, el handler calcula el `job_key` determinista para su ventana (día/mes) y verifica si existe `job_runs` con `(job_name, job_key)` y `status IN ('running','succeeded')` → si existe, **omite** (no corre dos veces en la misma ventana). Cita v1.0 AC-15.
- Un `failed`/`stuck`/`dlq` **sí** permite reintento (manual o automático) bajo un nuevo `job_key` con sufijo `:retry:<n>` o un `force=true` que reabre el mismo registro.

### 2.3 Reintentos con backoff exponencial

- Un job que lanza error se reintenta automáticamente con **backoff exponencial**: intervalos `30s, 2min, 10min, 30min, 2h` (configurables por job; valores por defecto). pg-boss soporta `retryLimit` y `retryDelay`; la v1.1 fija la política canónica.
- `attempts` se incrementa en cada intento; `last_attempt_at` se actualiza.
- Tras `max_attempts` (default 5) fallidos, el job pasa a `status='dlq'` con `dlq_reason` (último error sanitizado, sin secretos) y se archiva en la **dead letter queue** (cola `dlq` de pg-boss).

### 2.4 Dead letter queue (DLQ)

- Los jobs en `dlq` **no se reintentan automáticamente**; esperan acción humana.
- Un job en DLQ es visible para el Administrador (con permiso `gestionar_jobs`) en la UI de administración (SPEC-010).
- El `error` y `dlq_reason` se almacenan **sanitizados** (sin secretos, sin payloads sensibles como CSD/API key). Cita ADR-03 §3.5.

### 2.5 Visibilidad del estado del job

- `job_runs` es consultable por el Administrador (con `gestionar_jobs`) vía endpoint tRPC: lista paginada (BR-N373) con filtros por `job_name`, `status`, `organization_id`, rango de fechas.
- Cada job expone: `job_name`, `job_key`, `status`, `attempts`/`max_attempts`, timings, `result` (resumen), `error`/`dlq_reason` (sanitizado).
- El Director ve jobs globales (`backup-bd`) y de cualquier org; el Admin ve los de su org (BR-N209). Cita BR-N211, BR-N209.

### 2.6 Reintentos manuales desde administración

- El Administrador (con `gestionar_jobs`) puede **re-encolar manualmente** un job `failed`/`stuck`/`dlq`:
  - Se genera un nuevo `job_key` con sufijo `:retry:<n>` (o se reabre el registro con `force=true`), se reinicia `attempts=0`, `status='running'`.
  - La acción queda en `audit_logs` con `action='job.retry'`, `actor_user_id`, `entity_id` (job_run), `reason`. Cita BR-N336, BR-N014 (cancelar/revertir operaciones críticas exige motivo).
- No hay auto-reintento infinito: el reintento manual es **una sola nueva ronda** de `max_attempts`; si vuelve a `dlq`, requiere nuevo reintento manual o escalate a DEBY/Frank.

### 2.7 Alertas de jobs estancados (`stuck`)

- Un job monitor `job-stuck-check` corre nocturno (vía pg-boss, idempotente):
  - Si un job lleva `status='running'` más de su **umbral de stuck** (configurable por job: p.ej. `factura_recurrente` 15 min, `backup-bd` 60 min, `zip_contador_mensual` 120 min) → lo marca `status='stuck'`, registra `dlq_reason='stuck:running_too_long'` y notifica al Administrador (BR-N349/BR-N350 evento `job_stuck`).
  - Si un job **programado** no corrió en su ventana esperada (p.ej. `backup-bd` no tiene `succeeded` en las últimas 30 h) → notifica al Administrador/Director (evento `job_missed_window`).
- Las alertas son in-app (DEC-FUN-29, BR-N349); no se envían por email/WhatsApp en MVP.

### 2.8 Aplicación a los jobs canónicos

| Job | `job_key` base | `max_attempts` | Umbral stuck | Cita |
|---|---|---|---|---|
| `factura_recurrente` | `factura_recurrente:<YYYY-MM-DD>:org:<uuid>` | 5 | 15 min | BR-N310 |
| `zip_contador_mensual` | `zip_contador:<YYYY-MM>:org:<uuid>` | 5 | 120 min | BR-N311, DEC-FUN-26 |
| `backup_bd` | `backup-bd:<YYYY-MM-DD>` (global, org null) | 5 | 60 min | BR-N147, DEC-FUN-41 |
| `comisiones_pago_dia15` | `comisiones:<YYYY-MM>:org:<uuid>` | 5 | 30 min | BR-N299 |
| `sla_cotizacion_48h` | `sla_cotizacion:<YYYY-MM-DD>:org:<uuid>` | 3 | 10 min | BR-N240 |
| `cobranza_escalamiento` | `cobranza_esc:<YYYY-MM-DD>:org:<uuid>` | 5 | 30 min | BR-N313 |
| `csd_expiry_check` | `csd_expiry:<YYYY-MM-DD>:org:<uuid>` | 3 | 10 min | ADR-03 v1.1 §9.2 |
| `notificaciones_evaluacion` | `notificaciones-evaluacion:<YYYY-MM-DD>` | 5 | 30 min | BR-N350 |
| `job_stuck_check` | `job-stuck:<YYYY-MM-DD>` (global) | 3 | 5 min | (meta-monitor) |

> `backup_bd` ejecuta en **dry-run** verificable desde MVP; la ejecución operativa del respaldo físico y la retención de 30 días es de Frank (v1.0 AC-19). La política de reintentos/DLQ aplica igual al dry-run.

### 2.9 Jobs idempotentes: handlers deterministas

Cada handler debe ser **idempotente** por sí mismo (no sólo por `job_key`): si se reintenta tras un fallo parcial, no duplicar efectos (p.ej. `factura_recurrente` debe verificar si la factura ya fue timbrada antes de timbrar de nuevo, usando el UUID fiscal o un idempotency token del PAC). Cita BR-N310. Esta es una **restricción para SPEC-007** (Facturación).

---

## 3. Contratos fijados

1. Todo job se registra en `job_runs` con `status` extendido (`running | succeeded | failed | stuck | dlq`), `attempts`, `max_attempts`, `dlq_reason`.
2. Backoff exponencial canónico (30s, 2m, 10m, 30m, 2h); `max_attempts` default 5; tras ello, `dlq`.
3. DLQ: no auto-reintento; esperan acción humana; errores sanitizados (sin secretos).
4. Visibilidad: Administrador (con `gestionar_jobs`) consulta `job_runs`; Director ve globales + cualquier org.
5. Reintento manual: nueva ronda con `job_key:retry:<n>` o `force=true`; audita `job.retry` con motivo.
6. Alerta de stuck: `job-stuck-check` marca `running` > umbral → `stuck` + notificación; alerta de ventana perdida.
7. Handlers idempotentes por sí mismos (no duplicar efectos en reintento).
8. Todo error/dlq_reason sanitizado (sin CSD, API key, MASTER_KEY, ni payloads sensibles).

---

## 4. Consecuencias

### 4.1 Positivas
- Reintentos automáticos con backoff toleran fallos transitorios (red, PAC caído).
- DLQ + visibilidad dan control humano sobre fallos crónicos sin silencio.
- Alertas de stuck/ventana perdida evitan jobs zombies.
- Trazabilidad total: cada intento y cada reintento manual auditado.

### 4.2 Negativas / trade-offs
- Los jobs idempotentes por handler exigen disciplina (verificar efecto previo). Coste de implementación en cada SPEC de job.
- Backoff exponencial puede retrasar la detección de un fallo crónico hasta ~2h 40m (suma de los 5 intentos). Mitigación: el umbral de stuck corre en paralelo y marca `stuck` antes si excede su umbral.
- DLQ acumula jobs que requieren intervención; si el Admin no revisa, se acumulan. Mitigación: notificación `job_stuck`/`job_missed_window` in-app al Admin.

### 4.3 Reversibilidad
- Cambiar a BullMQ/Redis más adelante: el contrato (`job_runs`, `job_key`, `status`, DLQ) se mantiene; sólo cambia el motor. Reversible.

---

## 5. Restricciones para SPECs

- SPEC-001 v1.1 contiene los ACs testeables de la política de jobs (AC-62 a AC-68).
- SPEC-007 (Facturación) declara el handler de `factura_recurrente` como idempotente por sí mismo (BR-N310).
- SPEC-008 (Cobranza) declara `cobranza_escalamiento` (BR-N313).
- SPEC-010 (Dashboard/Admin) declara la UI de visibilidad de `job_runs` y el reintento manual.

---

## 6. ACs derivadas (testeables en SPEC-001 v1.1)

- **AC-62** · Backoff exponencial: un job que lanza error se reintenta `max_attempts` veces con intervalos crecientes; `attempts` incrementa; tras `max_attempts` → `status='dlq'`.
- **AC-63** · Idempotencia por `job_key` (refuerzo AC-15): encolar el mismo `job_key` dos veces en la ventana → el handler corre una sola vez; la segunda omite.
- **AC-64** · DLQ: tras `max_attempts` fallidos, el job está en `dlq` con `dlq_reason` sanitizado (sin secretos); es visible en la consulta de `job_runs`.
- **AC-65** · Visibilidad: endpoint tRPC lista `job_runs` paginado (BR-N373) con filtros; el Admin ve su org, el Director ve cualquier org y globales.
- **AC-66** · Reintento manual: Admin con `gestionar_jobs` re-encola un job `dlq`; `attempts=0`, `status='running'`; `audit_logs` con `action='job.retry'` y `reason`; sin auto-reintento infinito (una sola nueva ronda).
- **AC-67** · Alerta de stuck: un job `running` > umbral → `job-stuck-check` lo marca `stuck` + notificación in-app (`job_stuck`); un job programado sin `succeeded` en su ventana → notificación `job_missed_window`.
- **AC-68** · Sanitización de errores: el `error`/`dlq_reason` de un job de facturación no contiene CSD, API key del PAC, MASTER_KEY ni payloads sensibles (test de no-presencia).

---

## 7. Referencias cruzadas

- Derivado de: instrucción Frank v1.1 §2.6 + DEC-FUN-26/38/41 + BR-N147/N240/N299/N310/N311/N313.
- Relacionado: ADR-01 v1.1 (pg-boss, `job_key`), ADR-03 v1.1 (sanitización de logs), ADR-06 (bitácora), ADR-04 (`backup_bd` dry-run en smoke).
- Aplica a: SPEC-001 v1.1 (AC-62 a AC-68), SPEC-007 (factura_recurrente idempotente), SPEC-008 (cobranza_escalamiento), SPEC-010 (UI de jobs).
