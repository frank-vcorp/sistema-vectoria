# SPEC-20260817-005 · Proyectos — artefactos y estados

- **ID:** SPEC-20260817-005
- **Estado:** BACKLOG (depende de SPEC-001, SPEC-002, SPEC-003, SPEC-004 `READY`)
- **Versión:** 1.0
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-19 (v1.0)
- **Módulo funcional cubierto:** Proyectos: workflow atómico `project_creation` universal (consume `os.pl_user_id`), estados 3D (etapa/situación/salud), módulos, y la autoridad de artefactos (alcance firmado / plantilla / JSON Discovery). Blocks B9, B10, B25.
- **ADRs de referencia:** ARCH-20260817-11 (JSON round-trip), ARCH-20260817-01, ARCH-20260819-03, ARCH-20260817-05.
- **Depende de:** SPEC-001 (plataforma, audit), SPEC-002 (cliente), SPEC-003 (alcance firmado, plantilla, catálogo), SPEC-004 (OS: consume `os.pl_user_id` + la transición `authorized_to_start`).

---

## 1. Resultado
El Proyecto nace al autorizar la OS mediante el workflow atómico `project_creation` (universal — toda OS autorizada crea Proyecto, BR-N407). Esta SPEC **posee** `project_creation`: consume `os.pl_user_id` y en la **misma transacción** crea el Proyecto + inserta `project_members(pl, role='lider')` como primer miembro + copia el snapshot de alcance + carga el esqueleto de plantilla + vincula OS + `audit_logs`. El PL queda miembro por construcción (sin ciclo, PROYECTO.md §5.2). Define los estados 3D del Proyecto y de los módulos, y la autoridad entre alcance/plantilla/JSON (DEC-FUN-54).

## 2. Fuentes funcionales por ID
- **DEC-FUN:** DEC-FUN-14 (estructura modular en plantillas), DEC-FUN-15/54 (autoridad artefactos), DEC-FUN-20260817-47 (vocabulario único), DEC-FUN-20260817-53..56, DEC-FUN-20260817-58 (transiciones 3D), DEC-FUN-20260817-59 (`deployed` cierre técnico), DEC-FUN-20260818-68 (universalidad project_creation).
- **BR (B9/B10/B25):** BR-N03, BR-N113, BR-N114, BR-N251..N263, BR-N375..N385, BR-N380/381, BR-N351, BR-N396..N398, BR-N407.
- **FLOW:** FLOW-PROJ-01 (parcial), FLOW-PROJ-03 (JSON), FLOW-PROJ-04 (cambios). SCN-PROJ-06/07.

## 3. Alcance y exclusiones
### 3.1 Incluido
- `projects`, `project_members` (PL = primer miembro), `project_scope_snapshots` (copia inmutable del alcance vendido), `modules` (esqueleto desde plantilla + estados B10), `project_log_entries` (FK definida aquí; tabla en SPEC-001). Workflow `project_creation` atómico. Estados 3D (etapa/situación/salud). Autoridad artefactos. Exportación/importación JSON Discovery (round-trip ADR-11).
### 3.2 Excluido
- Incorporación de **otros** miembros + asignación de tareas + ejecución + pruebas + entregables + cambios de alcance → SPEC-006. Cierre técnico del Proyecto (gates) → SPEC-006 (esta SPEC sólo define los estados; los gates de cierre los completa SPEC-006). OS→`delivered`/`closed` → SPEC-004 (esta SPEC produce la señal de cierre técnico consumida por SPEC-004).

## 4. Modelo técnico (contrato)
### 4.1 Entidades
- `projects (id, organization_id, order_id uuid FK→orders unique, client_id, scope_snapshot_id uuid FK, status_stage enum, status_situation enum, health enum, health_calculated enum, health_override_reason, template_id, plan_version int, created_at, updated_at)`. Estados 3D (BR-N253): etapa `planning|development|testing|client_validation|delivery`; situación `pending|active|paused|completed|cancelled`; salud `on_track|at_risk|delayed`.
- `project_members (id, organization_id, project_id, user_id, project_role enum('lider'|'programador'|'disenador'|'qa'|...), assigned_at, assigned_by, active boolean)` — el PL se inserta en `project_creation` con `project_role='lider'` (DEC-FUN-56, BR-N382).
- `project_scope_snapshots (id, organization_id, project_id, scope_jsonb jsonb not null, source_scope_id, created_at)` — copia inmutable del alcance vendido (BR-N251).
- `modules (id, organization_id, project_id, code, name, status enum('pending'|'in_progress'|'testing'|'deployed'|'paused'|'blocked'|'cancelled'), health, depends_on_modules jsonb, sort_order, created_at, updated_at)` (BR-N260/113/114).
- `json_discovery_imports (id, project_id, version, actor_user_id, imported_at, result jsonb, status)` — round-trip (BR-N398, ADR-11).

### 4.2 Enum canónico (B9/B10, fuente única)
- `project_stage`, `project_situation`, `project_health`, `module_status`, `module_health` — registrados en `shared/enums` (SPEC-001 §4.4).

### 4.3 Servicios
- `projects.createProject(ctx, orderId)` — **workflow atómico** disparado por OS→`authorized_to_start` (BR-N246/N407). En una transacción: (1) crea `projects` en `planning/pending`; (2) inserta `project_members(pl, role='lider')` consumiendo `os.pl_user_id`; (3) copia `project_scope_snapshots` desde el alcance firmado (BR-N251); (4) carga el esqueleto de la plantilla confirmada (módulos base, BR-N229); (5) vincula `order_id`; (6) escribe `audit_logs` (`project.create`); (7) emite señal para que SPEC-004 marque OS→`in_execution` (BR-N247). **Compensación por fallo:** rollback de toda la transacción; la OS no queda en `authorized_to_start`.
- `projects.transitionStage(ctx, projectId, newStage)` — transiciones canónicas (BR-N375-378, FLUJOS §5).
- `projects.overrideHealth(ctx, projectId, health, reason)` — conserva calculada + manual (BR-N254).
- `modules.transition(ctx, moduleId, newStatus)` — BR-N113/114/260-263.
- `jsonDiscovery.exportTemplate(ctx, projectId)` / `import(ctx, projectId, json)` — round-trip ADR-11 (diff, aprobación PL, no-duplicación, versionado).

## 5. Reglas e invariantes
1. `project_creation` es **universal**: toda OS autorizada crea Proyecto, sin excepción de producto/servicio (BR-N407/N03, DEC-FUN-68). No existe ruta de OS autorizada sin Proyecto.
2. El PL queda miembro por construcción en `project_creation` (consume `os.pl_user_id`, DEC-FUN-56, BR-N382). No hay "PL esperando al Proyecto".
3. Snapshot del alcance es **inmutable** (BR-N251); el JSON no altera el alcance firmado (BR-N351/380/381).
4. Estados 3D independientes (BR-N253); la salud se calcula y el PL puede sobreescribirla con motivo (BR-N254).
5. `deployed` = cierre técnico del módulo; no exige aceptación final del cliente (salvo dependencia explícita, BR-N113, DEC-FUN-59).
6. Reimportar la misma versión aprobada del JSON no duplica (BR-N397); cada importación versionada con actor/fecha/resultado (BR-N398).
7. Pausar/cancelar con motivo (BR-N379); cancelar revisa reembolso (DEC-FUN-35).

## 6. Casos borde
- OS autorizada con `pl_user_id null` → `project_creation` falla `409 PL_NOT_ASSIGNED` (delegado a SPEC-004, que valida antes; defensa en SPEC-005).
- Reimportar JSON que modifica `project_id`/folio/`included` → `409 JSON_IMMUTABLE_FIELDS` (BR-N353).
- Reimportar misma versión → no-op idempotente, sin duplicados (BR-N397).
- Módulo a `deployed` sin requerimientos validados/tareas con evidencia/pruebas bloqueantes → `409 MODULE_DEPLOY_GATES` (BR-N113; gates en SPEC-006).
- Sobreescribir salud sin motivo → `400 HEALTH_REASON_REQUIRED` (BR-N254).

## 7. Seguridad/privacidad
- `organization_id`; RLS latente. Visibilidad por membresía (PL/miembros) y rol (Director todo, Admin read-only, BR-N212/209). `project_log_entries.private` (notas de dirección, BR-N339). Acciones críticas (`project.create`, transiciones de cierre) en `audit_logs` con `actor_role_code`.

## 8. Migración/compatibilidad
- Migración crea `projects`/`project_members`/`project_scope_snapshots`/`modules`/`json_discovery_imports` + FK a `orders`. La FK `project_log_entries.project_id` (tabla en SPEC-001) se activa aquí. Seed: plantillas (9) cargan su esqueleto de módulos (vía SPEC-003 seed catálogo).

## 9. Criterios de aceptación
- **AC-1 · project_creation atómico universal:** test: OS autorizada → en una transacción se crean `projects` + `project_members(pl, lider)` + `project_scope_snapshots` + módulos de la plantilla + `audit_logs`. Si un paso falla, rollback completo y la OS no pasa a `authorized_to_start`. (BR-N246/407/251, DEC-FUN-56/68)
- **AC-2 · PL primer miembro por construcción:** tras `project_creation`, existe 1 `project_member` con `project_role='lider'` y `user_id=order.pl_user_id`; el PL ya puede operar (no requiere alta posterior). (BR-N382)
- **AC-3 · Snapshot inmutable:** el `scope_snapshot` no cambia al reimportar JSON ni por ediciones del alcance firmado (éste ya es inmutable); test de reimport no altera el snapshot. (BR-N251/351/380)
- **AC-4 · Estados 3D + transiciones:** `transitionStage` aplica el happy path `planning/pending→planning/active→development/active→testing/active→client_validation/active→delivery/completed` (BR-N375-378); transiciones inválidas → `409 INVALID_TRANSITION`.
- **AC-5 · Salud calculada + override con motivo:** `overrideHealth` sin motivo → `400`; con motivo conserva `health_calculated` y `health` (manual). (BR-N254)
- **AC-6 · JSON round-trip:** `exportTemplate` produce plantilla vacía con IDs reales; `import` muestra diff (altas/cambios/conflictos); la aprobación del PL actualiza el plan; reimport de misma versión no duplica; cada importación versionada con actor/fecha/resultado. (BR-N352/396/397/398, ADR-11)
- **AC-7 · Inmutables del JSON:** importar JSON que modifica `project_id`/folio/`included` → `409 JSON_IMMUTABLE_FIELDS`; la desviación se registra como change request. (BR-N353/354)
- **AC-8 · Módulos:** `modules.transition` aplica `pending→in_progress→testing→deployed` (+ laterales); `deployed` sin gates → `409` (gates en SPEC-006); dependencias respetadas (BR-N114). (BR-N260/113/114)
- **AC-9 · Señal de cierre técnico:** al cierre técnico (SPEC-006), esta SPEC emite la señal que SPEC-004 consume para OS→`delivered` (BR-N248/N392); no exige saldo cero.
- **AC-10 · UI/responsive:** ficha de proyecto (3 dimensiones), árbol de módulos y vista de diff del JSON operables en 3 viewports; el árbol de módulos colapsa/expand en móvil. (ADR-03, DEC-FUN-72)

## 10. Validaciones
- `pnpm typecheck/test/test:e2e`; grep: `project_creation` consume `os.pl_user_id` y no importa a SPEC-004 (no-acoplamiento, AC-1/AC-2); round-trip idempotente (AC-6).

## 11. Rollback
- Revertir migración (drop tablas B9/B10/B25) — aprobación Frank; los proyectos son datos de negocio.

## 12. Riesgos y pendientes
- **R1:** atomicidad transaccional de `project_creation` (7 pasos); mitigación: transacción DB + compensación.
- **R2:** esquema Zod del JSON Discovery y motor de diff (decisión interna reversible de SOFIA, P-11-1).
- **P-005-1 (Frank):** none.

## 13. DoD
- AC-1..AC-10 PASS; trazabilidad a BR-N03/113/114/251-263/375-385/407; GEMINI obligatorio (project_creation atómico, autoridad de artefactos, multi-org → riesgo medio-alto).

## 14. Handoff a SOFIA (resumen)
- **SPEC activa:** SPEC-005. **ADRs:** 01, 03, 05, 11. **Alcance:** `src/server/db/proyectos/*`, `src/server/services/proyectos/{project_creation,projects,modules,jsonDiscovery}/*`, `src/server/trpc/routers/proyectos/*`, `src/modules/proyectos/*`. **Contratos protegidos:** `project_creation` atómico (PL primer miembro), `scope_snapshot` inmutable, estados 3D canónicos, round-trip idempotente. **Contratos que cambian:** consume `os.pl_user_id`+`authorized_to_start` (SPEC-004); emite señal de cierre técnico (SPEC-004). **Prohibido inferir:** ejecución/equipo (SPEC-006), gates de cierre técnico (SPEC-006), el cobro del anticipo (SPEC-008).
