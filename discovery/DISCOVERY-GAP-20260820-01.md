# DISCOVERY-GAP · 20260820-01 · SPEC-001 Plataforma Base

- **Origen:** INTEGRA (derivado de hallazgos P1-2 y P1-3 de QA-20260820-01 GEMINI)
- **Emitido:** 2026-08-20
- **SPEC afectada:** SPEC-20260817-001 v1.6 (Plataforma Base)
- **Estado:** ABIERTO — devuelve a ATLAS para decisión funcional

---

## 1. Origen y contexto

GEMINI (QA-20260820-01, veredicto FAIL) identificó dos hallazgos P1 cuya resolución requiere una **decisión funcional de producto**, no una decisión técnica de INTEGRA. Ambos bloquean sub-partes del paquete de fixes IMPL-20260820-02 (delegado a SOFIA), **pero no bloquean el resto del paquete** (auth P0-1, multi-tenant PK P1-1, lockout/bitácora P1-4, RLS P2-1, audit eventos sistema P2-2, typecheck AC-77, tests AC-78 pueden implementarse sin esperar este GAP).

## 2. GAP 1 — Actor del sistema vs `invitations.created_by NOT NULL` (P1-2)

- **Código observado:** `src/server/db/schema/invitations.ts:27` declara `createdBy: uuid("created_by").notNull()` (FK→users NOT NULL). `scripts/seed-plataforma.ts:39` inserta la primera invitación con `created_by = "00000000-0000-0000-0000-000000000000"` (UUID cero como "actor sistema") porque en el momento del bootstrap **no existe aún ningún usuario humano** (el primer usuario nace al consumir la invitación). Con BD real, esto lanza **violación de integridad referencial** (no existe fila `users.id = "0000…"`).
- **Inconsistencia interna SPEC §4.1:** `audit_logs.actor_user_id` es `FK→users null` (línea 199, "null si evento de sistema") y `project_log_entries.created_by` es `FK→users null` (línea 218). Pero `invitations.created_by` es `FK→users not null` (línea 148). No hay un actor "sistema" persistido en `users` que pueda referenciar la FK.
- **Por qué impide especificar:** INTEGRA no puede decidir si el "sistema" es un actor con fila en `users` (¿qué `email`? ¿qué `organization_id`? ¿es único por org?) o si `invitations.created_by` debe ser nullable como las otras tablas de log. Es una decisión de modelo de producto.
- **Opciones técnicamente viables:**

  **(A) `invitations.created_by` nullable (alinea con `audit_logs`/`project_log_entries`).**
  - *Consecuencias:* la semilla puede usar `null` para la invitación del primer Director. Consistencia: el actor "sistema" es `null` en toda la base. Coste: nullable pierde la trazabilidad fuerte (algunos queries deben coalescer). Auditoría: `audit_logs` ya lo soporta.
  - *Impacto SPEC:* cambiar §4.1 `invitations.created_by` de `not null` a `null` con nota "null si emitida por sistema/bootstrap".

  **(B) Persistir un actor "sistema" en `users` durante bootstrap (antes de emitir la primera invitación).**
  - *Consecuencias:* `invitations.created_by` sigue NOT NULL y referencia al usuario "sistema". Trazabilidad fuerte. Coste: define qué es el usuario "sistema" (¿único global? ¿uno por organización? ¿email reservado como `system@<org-slug>.internal`? ¿activo=false?). Introduce un actor que no es humano en `users`, lo que puede afectar queries de "usuarios activos", conteos, etc.
  - *Impacto SPEC:* §4.1 sin cambio; ADR-04 (bootstrap) debe añadir el paso de crear el usuario "sistema" antes de la invitación. Posible BR nueva.

  **(C) Híbrido:** actor "sistema" persistido **sólo** en `audit_logs`/`project_log_entries` (null en FK), pero `invitations.created_by` queda NOT NULL y la semilla usa un UUID "sistema" reservado + un trigger/check que permita ese UUID específico sin FK.
  - *Consecuencias:* más complejo, excepcional. No recomendado salvo preferencia explícita.

- **Pregunta funcional mínima:** ¿El "sistema" es un actor con fila en `users` (opción B) o se modela como `null` en las FKs de auditoría/invitación (opción A)?

## 3. GAP 2 — Permisos de módulo en semilla de Plataforma Base (P1-3)

- **Código observado:** `scripts/seed-data.ts:11` asigna `programador = ["registrar_tiempo"]`, pero `registrar_tiempo` **no existe** en `BASE_PERMISSIONS` (`shared/enums/index.ts`). `scripts/seed-plataforma.ts:32` salta permisos inexistentes, por lo que `programador` queda sin permisos (AC-38(c) insatisfacible). GEMINI también nota que `vendedor/lider_proyecto/disenador/qa = []` (vacíos).
- **Por qué impide especificar:** `registrar_tiempo` es un permiso de **SPEC-006 (Proyectos — equipo y ejecución)**, no de Plataforma Base. La pregunta es de **frontera de siembra**: ¿los permisos de módulo se declaran en `shared/enums` desde el principio (sembrados en SPEC-001) o se diferieren a la SPEC del módulo que los introduce (SPEC-006 para `registrar_tiempo`, SPEC-008 para `gestionar_cobros`, etc.)? Esto afecta `shared/enums` (única fuente) y el contrato de qué siembra cada SPEC.
- **Opciones técnicamente viables:**

  **(A) Deferir permisos de módulo a su SPEC.** SPEC-001 siembra **solo** los permisos de Plataforma Base (`gestionar_usuarios`, `gestionar_roles`, `gestionar_config_fiscal`, `ver_auditoria`, `gestionar_cuestionarios`, `gestionar_catalogos`, `gestionar_plantillas`, `emitir_invitaciones` — §7). `registrar_tiempo` y otros permisos de módulo se declaran en `shared/enums` y se siembran en `role_permissions` cuando su SPEC (SPEC-006, SPEC-008, etc.) llegue a `READY`/implementación. `programador/vendedor/lider_proyecto/disenador/qa` quedan con `[]` en la semilla de plataforma (se llenan en sus SPECs).
  - *Consecuencias:* frontera limpia; cada SPEC siembra sus permisos. Coste: la semilla de plataforma no pre-rellena roles de módulo, pero eso es correcto (esos permisos aún no existen en V1 hasta que su SPEC se implemente).

  **(B) Declarar todos los permisos de V1 en `shared/enums` desde SPEC-001.** Sembrar `registrar_tiempo` (y todos los de SPEC-002..011) en `shared/enums` y en `role_permissions` desde el bootstrap de plataforma.
  - *Consecuencias:* `shared/enums` completo desde el principio. Coste: SPEC-001 asume permisos que aún no tienen SPEC implementada; si una SPEC cambia un permiso, hay que reconciliar la semilla. Acoplamiento prematuro.

  **(C) Sembrar permisos de plataforma + los de SPEC ya implementadas al momento del bootstrap.** Híbrido dinámico: cada SPEC añade sus permisos a `shared/enums` + un seeder propio; el bootstrap de plataforma ejecuta todos los seeders disponibles.
  - *Consecuencias:* más flexible, pero requiere convención de seeders por SPEC.

- **Pregunta funcional mínima:** ¿Los permisos de módulo (`registrar_tiempo`, `ver_costos`, `gestionar_facturas`, etc.) se declaran y siembran en SPEC-001 (opción B) o se diferieren a la SPEC del módulo que los introduce (opción A)?

## 4. Recomendación técnica INTEGRA (no vinculante)

- **GAP 1:** opción **(A)** (`created_by` nullable) — alinea con `audit_logs.actor_user_id null` y `project_log_entries.created_by null`; consistencia interna; menor coste; la trazabilidad de "actor sistema" vive en `action` (namespace `system.*`), no en FK.
- **GAP 2:** opción **(A)** (deferir a la SPEC del módulo) — alinea con el ownership por SPEC; `shared/enums` crece conforme cada SPEC se implementa; la semilla de plataforma no asume permisos no contratados.

## 5. Impacto y no-bloqueo

- **Bloquea:** P1-2 (FK invitación) y P1-3 (matriz permisos) del paquete IMPL-20260820-02 hasta resolver.
- **No bloquea:** P0-1 (auth), P1-1 (PK compuesta), P1-4 (lockout/bitácora), P2-1..P2-4 (RLS, audit eventos, typecheck, validaciones inexistentes), AC-77 (typecheck K), AC-78 (password test). SOFIA puede implementar todo eso con TODO documentado en P1-2/P1-3.
- **Estado recomendado para SPEC-001:** `BLOCKED (observaciones-GEMINI-FAIL + pendiente-DISCOVERY-GAP-20260820-01)` — INTEGRA ya aplicó este estado en SPEC v1.6.

## 6. Destino

Devuelve a **ATLAS** (entry point funcional) para decisión de Frank. INTEGRA no decide producto. Una vez resuelto (DEC-FUN nueva + BR nueva), INTEGRA actualiza SPEC-001 v1.7 §4.1/§7 y ADR-04, y SOFIA completa P1-2/P1-3 del paquete.
