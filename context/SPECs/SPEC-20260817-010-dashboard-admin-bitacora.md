# SPEC-20260817-010 · Dashboard, Administración y Bitácora

- **ID:** SPEC-20260817-010
- **Estado:** BACKLOG (depende de SPEC-001 `READY`; lee de todos los módulos)
- **Versión:** 1.0
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-19 (v1.0)
- **Módulo funcional cubierto:** Dashboard por rol (widgets configurables drag&drop, "Esta semana" default + filtro "Hoy"), Administración (roles, permisos, catálogos, plantillas, cuestionarios, config fiscal) y Bitácora/auditoría global. Blocks B23 (dashboard) y B22 (auditoría) como superficie de consulta.
- **ADRs de referencia:** ARCH-20260817-01, ARCH-20260819-03 (UI/drag&drop responsive, AC-58), ARCH-20260817-05 (visibilidad por rol).
- **Depende de:** SPEC-001 (plataforma: `notifications`, `audit_logs`, `project_log_entries`, permisos, tooltips DEC-FUN-20). **Lee de** todos los módulos (002–009, 011) sin escribir sus datos.

---

## 1. Resultado
Cada rol ve su Dashboard con widgets configurables (drag&drop) y sus pendientes/alertas. La Administración gestiona roles, permisos, catálogos, plantillas, cuestionarios y config fiscal con tooltips de ayuda. La Bitácora consolida auditoría global y notas de proyecto (con privacidad de dirección). Es una SPEC transversal de **consulta y configuración** que no introduce reglas de negocio nuevas; reutiliza `hasPermission` y la privacidad de cada módulo.

## 2. Fuentes funcionales por ID
- **DEC-FUN:** DEC-FUN-20 (tooltips en admin/config), DEC-FUN-28 (widgets drag&drop por usuario), DEC-FUN-30 (default "Esta semana" + filtro "Hoy").
- **BR (B23/B22):** BR-N341..N348 (dashboard por rol), BR-N336..N340 (auditoría/bitácora).
- **Visibilidad:** ACTORES §3 (matriz por rol).

## 3. Alcance y exclusiones
### 3.1 Incluido
- Dashboard por rol con widgets configurables (drag&drop, persistencia por usuario), default "Esta semana" + filtro "Hoy". Widgets por rol (BR-N344-348): Director (proyectos en riesgo, CxC, ingresos/egresos); Vendedor (prospectos sin próxima acción, cotizaciones por vencer); Admin (facturas vencidas, cobros del día, ingresos/egresos); PL (actividades del día, proyectos en riesgo, próximas entregas); Programador (actividades del día, bloqueos).
- Administración: gestión de roles/permisos (consumiendo SPEC-001 AC-5/69/70), catálogos/plantillas/cuestionarios (consumiendo SPEC-003), config fiscal (SPEC-001 AC-10). Editor visual de cuestionarios (DEC-FUN-45).
- Bitácora: `audit_logs` global (BR-N336/337), `project_log_entries` (BR-N259/338), notas privadas de dirección (BR-N339), archivos enlazables (BR-N340).
### 3.2 Excluido
- Reglas de negocio de cada módulo (sólo los lee). La creación/edición de entidades vive en su SPEC. La auditoría **escritura** la hacen los servicios de cada módulo; esta SPEC sólo la **presenta y filtra**.

## 4. Modelo técnico (contrato)
### 4.1 Entidades (mayormente lectura + preferencias)
- `user_dashboard_preferences (id, user_id, widgets jsonb, layout jsonb, default_view enum('week'|'today'), updated_at)` (DEC-FUN-28/30).
- (Lectura de `audit_logs`, `notifications`, `project_log_entries`, y agregados de cada módulo.)

### 4.2 Servicios
- `dashboard.get(ctx)` — agrega por rol según permisos y preferencias; respeta visibilidad (ACTORES §3).
- `dashboard.saveLayout(ctx, widgets, defaultView)` — drag&drop persistido por usuario (DEC-FUN-28).
- `auditLogs.list(ctx, filters)` — filtrado por permiso `ver_auditoria` (Director/Admin, ACTORES §3); paginado (BR-N373).
- `projectLog.list(ctx, projectId)` — entradas; las `private=true` sólo para usuarios con `ver_notas_privadas` (BR-N339).

## 5. Reglas e invariantes
1. Dashboard por rol: cada uno ve sus pendientes/alertas (BR-N341); widgets configurables por usuario (drag&drop, BR-N342).
2. Default "Esta semana" + filtro "Hoy" (DEC-FUN-30, BR-N343).
3. Widgets por rol (BR-N344-348); un rol sólo ve datos de su visibilidad.
4. Auditoría global con `ver_auditoria` (BR-N336/337); paginado (BR-N373).
5. Notas privadas de dirección no visibles a técnicos (BR-N339).
6. Archivos enlazables a cualquier entidad (BR-N340).
7. Tooltips en admin/config (DEC-FUN-20, AC-67 SPEC-001).
8. La UI no accede a BD; consume servicios (AC-26 SPEC-001); dashboard presenta datos **agregados** (BR-N373).

## 6. Casos borde
- Usuario sin `ver_auditoria` lista `audit_logs` → `403`.
- Técnico intenta ver `project_log_entries.private` → filtradas (no error, simplemente no aparecen; BR-N339).
- Dashboard de un rol sin datos → vista vacía con mensaje.
- Drag&drop de widgets en móvil → operable con touch (AC-58 SPEC-001).

## 7. Seguridad/privacidad
- Toda consulta respeta `hasPermission` + `canAccessResource` + visibilidad por rol (ACTORES §3). Auditoría de **lectura** de datos sensibles (p.ej. config fiscal) ya registrada por los servicios de cada módulo. Las notas privadas (BR-N339) son filtro de visibilidad.

## 8. Migración/compatibilidad
- Migración crea `user_dashboard_preferences` (tabla nueva). No crea datos de negocio. Seed: preferencias default por rol.

## 9. Criterios de aceptación
- **AC-1 · Dashboard por rol:** `dashboard.get` devuelve widgets según el rol del usuario (Director/Vendedor/Admin/PL/Programador) y sus permisos; un rol no ve datos ajenos (test con seed multi-rol). (BR-N341/344-348)
- **AC-2 · Widgets drag&drop persistentes:** `saveLayout` guarda el orden/disposición; al recargar se restaura; default "Esta semana" + filtro "Hoy" aplicable. (DEC-FUN-28/30, BR-N342/343)
- **AC-3 · Auditoría global filtrada:** `auditLogs.list` sin `ver_auditoria` → `403`; con permiso → lista paginada con filtros (actor/entidad/acción/fecha). (BR-N336/337/373)
- **AC-4 · Notas privadas:** `project_log_entries.private=true` no aparecen para usuarios sin `ver_notas_privadas`; para Director sí. (BR-N339)
- **AC-5 · Archivos enlazables:** un archivo puede enlazarse a cualquier entidad y verse desde la bitácora con enlace firmado. (BR-N340)
- **AC-6 · Tooltips en admin/config:** las pantallas de roles/permisos, catálogos, plantillas, cuestionarios, config fiscal incluyen tooltips en campos no obvios. (DEC-FUN-20, AC-67 SPEC-001)
- **AC-7 · Editor visual de cuestionarios:** el Director edita preguntas drag&drop con vista previa (DEC-FUN-45); usable en 3 viewports (AC-58). (ADR-08, BR-N222)
- **AC-8 · Dashboard agrega, no lista crudo:** `dashboard.get` devuelve conteos/agregados, no filas crudas (BR-N373).
- **AC-9 · UI/responsive:** dashboard (widgets), administrador (tablas de roles/permisos/catálogos) y bitácora operables en 3 viewports; los widgets se reordenan en móvil. (ADR-03, DEC-FUN-72, AC-58/AC-66 SPEC-001)

## 10. Validaciones
- `pnpm typecheck/test/test:e2e`; grep: la UI del dashboard no hace consultas Drizzle directas (AC-26); los widgets leen servicios.

## 11. Rollback
- Revertir migración `user_dashboard_preferences` (drop) — aprobación Frank; las preferencias son datos de usuario.

## 12. Riesgos y pendientes
- **R1:** agregación跨módulos puede ser costosa; mitigación: vistas/materializados o cache (no en MVP salvo AC-18 SPEC-001 <2s).
- **P-010-1 (Frank):** none.

## 13. DoD
- AC-1..AC-9 PASS; trazabilidad a BR-N341-348/336-340; GEMINI recomendado (toca visibilidad por rol y auditoría → riesgo medio; no toca secretos directamente).

## 14. Handoff a SOFIA (resumen)
- **SPEC activa:** SPEC-010. **ADRs:** 01, 03, 05, 08. **Alcance:** `src/server/services/dashboard/*`, `src/server/services/admin/*`, `src/server/trpc/routers/{dashboard,admin,bitacora}/*`, `src/modules/{dashboard,admin,bitacora}/*`. **Contratos protegidos:** visibilidad por rol, notas privadas, `audit_logs` (sólo lectura aquí). **Prohibido inferir:** reglas de negocio de cada módulo (sólo los lee); la escritura de auditoría la hacen los servicios de cada módulo.
