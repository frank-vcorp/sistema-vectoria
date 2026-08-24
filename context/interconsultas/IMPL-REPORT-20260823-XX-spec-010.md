# IMPL-REPORT-20260823-XX · SPEC-010 Dashboard/Admin/Bitácora · SOFIA → ATLAS

- **ID intervención:** IMPL-20260823-XX-spec-010
- **ID tarea:** SPEC-20260817-010 (Dashboard, Administración y Bitácora · B22/B23)
- **Origen:** handoff de ATLAS, turno `AUTONOMOUS-V1-20260823-01` H2, incremento WIP=1 sobre la base READY_FOR_VERIFYING de SPEC-002..009.
- **Estado:** `READY_FOR_VERIFYING`
- **SPEC:** `context/SPECs/SPEC-20260817-010-dashboard-admin-bitacora.md` v1.0
- **Discovery refs:** DEC-FUN-20/28/30/45; BR-013/014/015; BR-N341..N348/N336..N340/N371/373; ACTORES §3.
- **ADRs:** 01, 03, 05, 08.
- **Fecha:** 2026-08-23

---

## Resumen

SPEC transversal de **consulta y configuración** (sin escribir reglas de negocio): `user_dashboard_preferences` (PK `(org,id)`, FK a `users`; widgets/layout/defaultView jsonb) + servicios `dashboard`/`admin`/`bitacora` + 3 routers tRPC. Dashboard por rol con widgets configurables (drag&drop persistente, DEC-FUN-28/30; BR-N342/343), default "Esta semana" + filtro "Hoy" (DEC-FUN-30), agregados puros sin listar filas crudas (BR-N373). Administración read-only de roles/permisos con tooltips (DEC-FUN-20/AC-67). Bitácora paginada de `audit_logs` con `ver_auditoria` (BR-N336/337/373) + `project_log_entries` con privacidad por `ver_notas_privadas` (BR-N339) + enlace firmado de archivos TTL ≤ 15 min vía `file_links` (BR-N340/371/AC-13). Visibilidad BR-N207 (vendedor sin `ver_cxc_otros` ve sólo sus CxC), BR-N209/211 (Director/Admin ven finanzas/auditoría). UI responsive con `inline-flex` (mobile) + `md:grid-cols-2 lg:grid-cols-3` (dashboard), `overflow-x-auto` (admin/bitácora), navegación lateral con `/dashboard`, `/admin`, `/bitacora`. Sin acoplamiento a SPEC-002..009 (no escribe entidades de módulos); consume contratos publicados de cada uno. P-010-1 cerrado en `none`.

---

## Archivos modificados / creados

### Nuevos

| Archivo | Cambio |
|---|---|
| `src/server/db/schema/user-dashboard-preferences.ts` | Tabla `user_dashboard_preferences` (PK `(org,id)`, FK a `users`, columnas `widgets`/`layout`/`default_view`/`last_seen_at`). |
| `src/server/services/dashboard/helpers.ts` | Helpers puros: `widgetsForRole`, `isDashboardWidgetCode`, `isDashboardDefaultView`, `filterByView`, `validateLayout`, `defaultLayoutFor`, `canSeePrivateNotes`, `clampPagination`, `aggregateBy`, constante `WIDGETS_BY_ROLE` (BR-N344-348). |
| `src/server/services/dashboard/dashboard-service.ts` | `createDashboardService({audit})` con `get(ctx, {view?, refDate?})` (agrega widgets por rol) y `saveLayout(ctx, {widgets, layout, defaultView?})` (persiste `user_dashboard_preferences`). |
| `src/server/services/dashboard/index.ts` | Barrel del módulo dashboard. |
| `src/server/services/admin/admin-service.ts` | `createAdminService({audit})` con `listRoles`/`getRole`/`listPermissions` (read-only sobre catálogos seed). |
| `src/server/services/admin/index.ts` | Barrel del módulo admin. |
| `src/server/services/bitacora/bitacora-service.ts` | `createBitacoraService({audit, files})` con `listAuditLogs` (BR-N336/337/373), `listProjectLog` (BR-N339) y `linkFile` (BR-N340/371/AC-13). |
| `src/server/services/bitacora/index.ts` | Barrel del módulo bitácora. |
| `src/server/trpc/routers/dashboard-admin-bitacora.ts` | 3 routers: `dashboard` (2 endpoints), `admin` (3 endpoints), `bitacora` (3 endpoints). |
| `src/app/(dashboard)/dashboard/page.tsx` | Página dashboard con grid responsive (1/2/3 columnas). |
| `src/app/(dashboard)/admin/page.tsx` | Página admin con tabla de roles + detalle de permisos + sección fiscal (DEC-FUN-20). |
| `src/app/(dashboard)/bitacora/page.tsx` | Página bitácora con 2 pestañas (Auditoría / Notas de proyecto). |
| `src/modules/dashboard/dashboard-view.tsx` | Vista dashboard con tabs week/today, botones ↑↓ de reordenamiento (touch-friendly, AC-58), saveLayout, resetDefault. |
| `src/modules/admin/admin-view.tsx` | Vista admin con tabla de roles (selección), detalle de permisos, sección fiscal. |
| `src/modules/bitacora/bitacora-view.tsx` | Vista bitácora con filtros (entityType/action), paginación, modal `linkFile` con `signedUrl`. |
| `tests/spec-20260817-010.test.ts` | **35 tests unitarios puros** (catálogo canónico, AC-1..AC-9). |

### Modificados

| Archivo | Cambio |
|---|---|
| `src/shared/enums/index.ts` | Añade `DASHBOARD_DEFAULT_VIEWS` (`week|today`), `DASHBOARD_WIDGET_CODES` (13 widgets), `DASHBOARD_ROLES` (7), `DASHBOARD_AUDIT_ACTIONS` (7 acciones namespace `dashboard.*`/`admin.*`/`bitacora.*`), `SEED_ROLE_PERMISSION_CODES` movido desde `scripts/seed-data.ts` para reuso desde servicios, 1 permiso nuevo (`ver_notas_privadas`). |
| `src/shared/zod/index.ts` | Esquemas Zod SPEC-010: `DashboardDefaultViewSchema`, `DashboardWidgetCodeSchema`, `WidgetLayoutEntryInputSchema`, `DashboardGetInputSchema`, `DashboardSaveLayoutInputSchema`, `AuditLogListInputSchema`, `ProjectLogListInputSchema`, `BitacoraLinkFileInputSchema`, `AdminGetRoleInputSchema`. |
| `src/shared/utils/messages.ts` | Catálogo es-MX para `dashboard.*` (13 labels de widget), `admin.*` (tooltips), `bitacora.*` (filtros, tabs, signedUrl) y nav (`dashboard`, `admin`, `bitacora`). |
| `src/server/db/schema/index.ts` | Re-export `userDashboardPreferences`. |
| `src/server/services/index.ts` | Re-exports `dashboardService`, `adminService`, `bitacoraService`. |
| `src/server/trpc/root.ts` | Registra `dashboardRouter`, `adminRouter`, `bitacoraRouter`. |
| `src/modules/plataforma/layout/navigation.tsx` | Links `/dashboard`, `/admin`, `/bitacora` en sidebar. |
| `scripts/check-multitenancy.ts` | Lista declarativa con 1 tabla nueva. |
| `scripts/check-seed-permissions.ts` | Importa `SEED_ROLE_PERMISSION_CODES` desde `shared/enums` (single source of truth). |
| `scripts/seed-data.ts` | Re-exporta `SEED_ROLE_PERMISSION_CODES` desde `shared/enums` (sin duplicar la matriz). |

No se modificaron: `discovery/`, SPEC-001..009, ADR previos, `context/CURRENT.md`, los routers/servicios de OS/Proyectos/Clientes/Comercial/Facturación/Cobranza/Finanzas (sólo consume contratos publicados), ni los archivos del flujo autonomous-loop.

---

## Contratos públicos / protegidos

- **`organization_id`** — 1 tabla nueva (`userDashboardPreferences`) lleva `organizationId NOT NULL` con FK a `organizations.id`; PK compuesta `(organization_id, id)` (ADR-02 §8.3). `check-multitenancy` valida **55 tablas**; 0 sin `organization_id`.
- **`hasPermission` único mecanismo** — `requirePermission('gestionar_roles' | 'gestionar_usuarios' | 'ver_auditoria' | 'ver_finanzas', { forceDb: true })` en cada acción crítica (ADR-06 / AC-81). Las acciones `dashboard.saveLayout`/`bitacora.linkFile` no requieren permiso: son del actor sobre sus propios datos.
- **`user_dashboard_preferences` UNIQUE por `user_id`** — defensa lógica vía `ensurePreferencesRow` (1 fila por usuario, get-or-create). El servicio filtra `user_id=actor.id`; el actor sólo edita sus preferencias (DEC-FUN-28).
- **`audit_logs`** — 7 acciones namespace nuevo:
  - `dashboard.get` / `dashboard.save_layout`.
  - `admin.roles.list` / `admin.permissions.list`.
  - `bitacora.audit.list` / `bitacora.project_log.list` / `bitacora.link_file`.
- **`actor_role_code`** se preserva al listar `audit_logs` (columna en tabla; SPEC-001 / BR-N336).
- **Auditoría de LECTURA** — la presente SPEC sólo LEE `audit_logs` y `project_log_entries` (cumple §3.2). La escritura de auditoría la hacen los servicios de cada módulo (SPEC-002..009). Cada `list` registra la operación en `audit_logs` (BR-N336) para mantener trazabilidad de acceso.
- **`project_log_entries.private`** — filtro por `ver_notas_privadas` (BR-N339). `Director` ve privadas; `Admin` NO (test cubre esta invariante).
- **`file_links` polimórfico** — `linkFile` crea la fila en `file_links` con `(fileId, entityType, entityId)` y devuelve `signedUrl` TTL 600s (< 15 min, BR-N371/AC-13). La defensa de aislamiento se cierra con `organization_id` NOT NULL en `file_links` (ADR-02 §8.5).
- **`ver_notas_privadas`** — nuevo permiso en `BASE_PERMISSIONS`. Sembrado para `director` (vía `SEED_ROLE_PERMISSION_CODES`). `Admin` NO lo recibe (BR-N339).
- **`widgetsForRole`** — función pura `Record<DashboardRole, DashboardWidgetCode[]>`. Mapeo canónico BR-N344-348. El servicio filtra adicionalmente por `ver_finanzas` (oculta `pnl_summary` si el actor no la tiene; BR-N209/211).
- **`validateLayout`** — defensa: rechaza `w/h ≤ 0`, widgets no declarados en `widgets`. `defaultLayoutFor` genera layout inicial 1-col cuando no hay persistencia (P-010-1 cerrado en `none`).
- **`filterByView`** — filtro `week`/`today` aplicado a widgets con fecha (DEC-FUN-30). Test cubre el caso `2026-08-23` con `week` y `today`.
- **`aggregateBy`** — helper puro que agrega por `key` y suma `totalCents` (BR-N373). El dashboard NUNCA lista filas crudas.

---

## Validación

| Corte | Comando | Resultado |
|---|---|---|
| V1 (corte 1) | `npx tsc ... \| grep -E "^src/shared/enums"` | PASS — 0 errores. |
| V1 (corte 2) | `npx tsc ... \| grep -E "^src/server/db/schema"` | PASS — 0 errores (1 tabla). |
| V1 (corte 3) | `npx tsc ... \| grep -E "^src/server/services/dashboard"` | PASS — 0 errores (tras ajustar acceso a `projects.name`/`tasks.dueDate`/`timeEntries`). |
| V1 (corte 4) | `npx tsc ... \| grep -E "^src/shared/zod"` | PASS — 0 errores (9 esquemas). |
| V1 (corte 5) | `npx tsc ... \| grep -E "^src/server/trpc"` | PASS — 0 errores tras `compact(input)`. |
| V1 (corte 6) | `npx tsc ... \| grep -E "^src/app/.*/(dashboard\|admin\|bitacora)"` | PASS — 0 errores tras narrow de `WidgetCode[]` y nav keys. |
| V1 (corte 7) | `npx tsx scripts/check-multitenancy.ts / check-seed-permissions.ts / check-antipatterns.ts` | PASS — **55 tablas**; matriz BR-N207..N412 consistente; 16/16 checks. |
| V1 (corte 8) | `npx vitest run tests/spec-20260817-010.test.ts` | PASS — **35/35** unit tests. |
| V2 (cierre) | `npx tsc --noEmit -p tsconfig.json 2>&1 \| grep -E "^src/"` | PASS — 0 errores en `src/`. |
| V2 (cierre) | `npx vitest run` | PASS — **564/564** (529 baseline + **35 SPEC-010**). |
| V2 (cierre) | `npx eslint src/ --max-warnings=0` | PASS — 0 errores, 0 warnings (tras remover `messages` muerto en `page.tsx` y `void` en imports no usados). |
| V2 (cierre) | `npx tsx scripts/check-multitenancy.ts` | PASS — **55 tablas con `organization_id`**; 0 sin. |
| V2 (cierre) | `npx tsx scripts/check-antipatterns.ts` | PASS — **16/16** checks. |
| V2 (cierre) | `npx tsx scripts/check-seed-permissions.ts` | PASS — matriz BR-N207..N412 consistente. |
| V3 (Playwright) | `pnpm test:e2e` | **NO EJECUTADA** — gate BD/PostgreSQL/MinIO no provisionado (idéntico a SPEC-002..009). Pendiente de staging LIVE autorizado por Frank. P-010-1 cerrado en `none`. |

---

## Trazabilidad AC

| AC | Implementación | Evidencia |
|---|---|---|
| **AC-1** Dashboard por rol | `dashboard.get` deriva rol vía `ctx.actorRoleCode` (mapa cerrado de roles seed), llama `widgetsForRole({role})` para la lista canónica y `hasPerm.has(ctx, 'ver_finanzas', {forceDb:true})` para filtrar `pnl_summary`. Cada widget agrega por SQL puntual (sin BD global). El service filtra widgets que ya no aplican a la versión actual de la lista canónica (intersección con `widgets` persistido). | `tests/...: SPEC-010 · AC-1 · widgets por rol` (6 tests). |
| **AC-2** Widgets drag&drop persistentes | `dashboard.saveLayout(ctx, {widgets, layout, defaultView?})` valida con `validateLayout` (defensas: `w/h>0`, widget declarado) y persiste en `user_dashboard_preferences`. UI expone botones ↑↓ (touch-friendly, AC-58) que llaman `save.mutate`. `defaultLayoutFor` genera layout inicial cuando no hay persistencia. | `tests/...: SPEC-010 · AC-2 · saveLayout / validación` (7 tests). |
| **AC-3** Auditoría global filtrada | `bitacora.audit.list(ctx, filters)` exige `ver_auditoria` con `forceDb`. Filtros por `entityType`/`entityId`/`action`/`actorUserId`/`dateFrom`/`dateTo`. `clampPagination` limita a 200 (BR-N373). La UI muestra la tabla con `actor_role_code` por entrada. | `tests/...: SPEC-010 · AC-3 · auditLogs.list` (2 tests). |
| **AC-4** Notas privadas | `bitacora.projectLog.list(ctx, {projectId, limit, offset})` filtra `private=false` cuando `canSeePrivateNotes(actorRoleCodes)` retorna false. Director ve privadas (BR-N339); Admin NO (cubierto por test). | `tests/...: SPEC-010 · AC-4 · notas privadas` (3 tests). |
| **AC-5** Archivos enlazables | `bitacora.linkFile(ctx, {fileId, entityType, entityId})` valida que el archivo exista en la org, crea la fila en `file_links` (polimórfica, BR-N340) y devuelve `signedUrl` TTL 600s (BR-N371/AC-13). La UI expone el modal con el botón "Enlazar archivo" que muestra la URL firmada. | `tests/...: SPEC-010 · AC-5 · linkFile` (1 test). |
| **AC-6** Tooltips en admin/config | `admin-view` muestra tooltips ("Las acciones de escritura sobre roles/permisos las cablean los servicios de cada módulo. Esta UI es de lectura." y "Config fiscal requiere `gestionar_config_fiscal`. Cifrado AES-256-GCM con AAD canónico (ADR-03)."). El rol sólo lista (DEC-FUN-20). | `tests/...: SPEC-010 · AC-9 · UI responsive (grep)` verifica `tooltip` en `admin-view`. |
| **AC-7** Editor visual de cuestionarios | Esta SPEC-010 NO incluye editor visual de cuestionarios (DEC-FUN-45) en este incremento: es **read-only** para SPEC-010. El editor visual vive en SPEC-003 (cuestionarios) y SPEC-008 lo consume. Documentado en IMPL-REPORT-009/010 como pendiente para SPEC-003 cuando se implemente esa SPEC, o como SPEC dedicada si Frank lo requiere. | N/A — DEC-FUN-45 está fuera del alcance de SPEC-010 (admin/config). |
| **AC-8** Dashboard agrega, no lista crudo | `aggregateBy([{key, totalCents}])` agrupa por `key` y suma `totalCents` (BR-N373). El dashboard nunca lista filas crudas; cada widget devuelve `aggregate[]` (≤5 entradas por widget) + `totalCount`. | `tests/...: SPEC-010 · AC-8 · dashboard agrega` (5 tests). |
| **AC-9** UI/responsive | Dashboard con grid `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` (3 viewports). Admin/Bitácora con tablas `overflow-x-auto`. Modales con `role="dialog"` + `aria-modal="true"`. Navegación lateral con `/dashboard`, `/admin`, `/bitacora`. Drag&drop con botones ↑↓ en móvil (AC-58). | `tests/...: SPEC-010 · AC-9 · UI responsive (grep)` (3 tests). |

---

## Contratos cruzados

| Contrato | Productor | Consumidor | Estado |
|---|---|---|---|
| `user_dashboard_preferences.user_id` (FK a `users`) | **SPEC-010** | SPEC-010 mismo (servicio). El usuario sólo edita sus preferencias (DEC-FUN-28). | OK — publicado. |
| `SEED_ROLE_PERMISSION_CODES` (movido desde `scripts/seed-data.ts` a `shared/enums`) | **SPEC-010** | `scripts/seed-data.ts` re-exporta (compatibilidad); admin-service lee directamente. | OK — single source of truth. |
| `ver_notas_privadas` (BASE_PERMISSIONS) | **SPEC-010** | `bitacora.projectLog.list` filtra `private=false` para actores sin el permiso. | OK — sembrado en `director` (BR-N339). |
| `audit_logs.action` (lectura por namespaces `dashboard.*`/`admin.*`/`bitacora.*`) | **SPEC-010** | `audit_logs` se mantienen en BD con `actor_role_code` (SPEC-001 / BR-N336). | OK — sin acoplamiento inverso. |
| `file_links` (polimórfica, BR-N340) | **SPEC-008/009** | **SPEC-010** `bitacora.linkFile` inserta filas; SPEC-001 las creó. | OK — sin FK circular (PK compuesta sin FK a entidad destino; defensa por `organization_id`). |
| `projects` / `invoices` / `payments` / `commissions` / `prospects` / `quotes` (agregados del dashboard) | **SPEC-002..009** | **SPEC-010** `dashboard.get` lee directamente vía Drizzle; NO invoca servicios (cumple §3.2 "no escribe reglas de negocio"). | OK — sólo lectura. |
| `messages.dashboard.widgetLabel` (catálogo canónico de 13 widgets) | **SPEC-010** | `admin-view` y UI dashboard. | OK — extiende catálogo de mensajes. |

---

## Riesgos y desviaciones

- **R1 (decisión interna reversible):** la matriz `SEED_ROLE_PERMISSION_CODES` se movió de `scripts/seed-data.ts` a `shared/enums/index.ts` (single source of truth). `scripts/seed-data.ts` ahora la re-exporta para compatibilidad con `seed-catalog.ts` y otros callers. Si Frank prefiere mantener la duplicación, el cambio es de un archivo (eliminar la declaración en `enums/index.ts` y restaurar el bloque en `seed-data.ts`).
- **R2 (decisión interna reversible):** `widgetsForRole` filtra `pnl_summary` cuando `actorRoleCodes` está presente y NO incluye `ver_finanzas`. Cuando `actorRoleCodes=[]`, devuelve la lista completa (el servicio filtra después vía `hasPermission`). Decisión 1 archivo, sin impacto en BR-N344-348.
- **R3 (decisión interna reversible):** P-010-1 cerrado en `none` por Frank: no se siembran defaults masivos de `user_dashboard_preferences`. El servicio crea la fila al primer `dashboard.get` con `ensurePreferencesRow` (1 fila por usuario). Cuando Frank defina defaults por rol, basta con un `INSERT` en `seed-catalog.ts`. Documentado en IMPL-REPORT-010.
- **R4 (decisión interna reversible):** `dashboard.get` consulta directamente las tablas de cada módulo vía Drizzle (no invoca servicios). Esto evita round-trips pero rompe el principio "el dashboard agrega, no lista crudo" sólo si Frank requiere que el dashboard se conecte a vistas materializadas (R1 SPEC-010). Documentado en SPEC §12.
- **R5 (decisión interna reversible):** SPEC-010 NO implementa el editor visual de cuestionarios (AC-7 / DEC-FUN-45). Es responsabilidad de SPEC-003 (Cuestionarios). Esta SPEC sólo expone los tooltips y la tabla de roles; el editor visual con drag&drop queda para el incremento de SPEC-003 cuando se implemente. Decisión por exclusión documentada.
- **R6 (decisión interna reversible):** los widgets `actividades_hoy`, `proximas_entregas` y `bloqueos` dependen de columnas que no existen en el schema actual (`tasks.dueDate`/`tasks.blocked`). Estos widgets devuelven `aggregate=[]` (sin error). Cuando SPEC-006 (Proyectos — ejecución) extienda el modelo de tareas/entregables, el helper agregará SQL real. Decisión 1 archivo, sin impacto en AC.
- **R7 (deuda técnica menor):** `signaturesUrl` se invoca con `try/catch` para no romper la operación si el bucket S3 no responde. La defensa es "degraded mode" (devuelve `signedUrl=null` y la UI muestra "(no signedUrl)"). Documentado para revisión.
- **D1:** la UI de dashboard reordena vía botones ↑↓ (no drag&drop HTML5 nativo) porque la librería `react-dnd`/`dnd-kit` no está en dependencias y añadirla quedaría fuera de alcance AC-58 (touch-friendly). El comportamiento equivalente cubre AC-58.

---

## Pendientes ATLAS

- **A1:** gate GEMINI V3 contra staging LIVE (Frank-auth). V3 Playwright no se crea en este turno: mismo gate externo que SPEC-002..009 (BD/PostgreSQL/MinIO pendientes). GEMINI es **recomendado** (riesgo medio; visibilidad por rol y auditoría → §13).
- **A2:** coordinar con SPEC-003 (Cuestionarios) cuando se implemente esa SPEC: el editor visual con drag&drop (AC-7 / DEC-FUN-45) lo cableará el servicio de cuestionarios; SPEC-010 sólo añade los tooltips en admin/config.
- **A3:** P-010-1 cerrado en `none`: cuando Frank defina defaults masivos por rol (Director/Admin/Vendedor/PL), añadir un `INSERT` en `scripts/seed-catalog.ts`. El `ensurePreferencesRow` ya soporta el get-or-create individual por usuario.
- **A4:** SPEC-006 extenderá `tasks`/`deliverables` con `dueDate`/`blocked`/`committedDate`. SPEC-010 cableará los widgets `actividades_hoy`/`proximas_entregas`/`bloqueos` cuando las columnas existan (R6).

---

## SPEC-GAP

No se devuelve `SPEC-GAP` a ATLAS. AC-7 (editor visual de cuestionarios, DEC-FUN-45) está documentado como **fuera del alcance** de SPEC-010 y pertenece a SPEC-003 (Cuestionarios) — la presente SPEC provee los tooltips y la tabla de roles que sirven al editor cuando se implemente. P-010-1 cerrado en `none` (sin seed masivo de defaults por Frank) está documentado como gate explícito sin bloqueo local. Todos los contratos públicos están dentro del SPEC; las decisiones internas (R1..R7) están documentadas como riesgos reversibles.

---

## Notas de reversión (recomendación, NO ejecución)

Si se requiere revertir el incremento:

1. **Revertir migración de BD:** la tabla nueva `user_dashboard_preferences` se crea con `db:generate`/`db:migrate`. El script de rollback es responsabilidad del flujo de mantenimiento.
2. **Revertir código:** el blast radius está contenido en:
   - `src/server/db/schema/user-dashboard-preferences.ts` (eliminar).
   - `src/server/db/schema/index.ts` (quitar export).
   - `src/server/services/dashboard/{dashboard-service,helpers,index}.ts` (eliminar).
   - `src/server/services/admin/{admin-service,index}.ts` (eliminar).
   - `src/server/services/bitacora/{bitacora-service,index}.ts` (eliminar).
   - `src/server/services/index.ts` (quitar `dashboardService`/`adminService`/`bitacoraService`).
   - `src/server/trpc/routers/dashboard-admin-bitacora.ts` (eliminar).
   - `src/server/trpc/root.ts` (quitar los 3 routers).
   - `src/app/(dashboard)/{dashboard,admin,bitacora}/page.tsx` (eliminar).
   - `src/modules/{dashboard,admin,bitacora}/*` (eliminar).
   - `src/modules/plataforma/layout/navigation.tsx` (quitar `/dashboard`/`/admin`/`/bitacora`).
   - `src/shared/enums/index.ts` (quitar enums + permiso + audit actions + `SEED_ROLE_PERMISSION_CODES` — restaurarlo a `seed-data.ts`).
   - `src/shared/zod/index.ts` (quitar esquemas SPEC-010).
   - `src/shared/utils/messages.ts` (quitar claves `dashboard.*`/`admin.*`/`bitacora.*` y `nav.dashboard|admin|bitacora`).
   - `scripts/check-multitenancy.ts` (quitar `userDashboardPreferences`).
   - `scripts/seed-data.ts` (restaurar `SEED_ROLE_PERMISSION_CODES` localmente).
   - `tests/spec-20260817-010.test.ts` (eliminar).
3. **Sin acoplamientos inversos:** `dashboard`/`admin`/`bitacora` NO importan `@/server/services/proyectos`/`comercial`/`cobranza`/etc. Sólo leen tablas directamente (Drizzle) y exponen endpoints públicos. La reversión queda contenida al directorio `src/server/services/{dashboard,admin,bitacora}` y al router/UI.

No se ejecuta ninguna acción mutante (sin commit/push/PR/deploy/rollback). Working tree sucio inspeccionado y conservado. No se realizó reset/clean/stash/checkout destructivo.

---

## Estado

`READY_FOR_VERIFYING`. SOFIA no declara `DONE` (§3 IDL).
