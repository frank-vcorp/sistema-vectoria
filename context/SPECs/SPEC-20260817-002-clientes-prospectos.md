# SPEC-20260817-002 · Clientes y Prospectos

- **ID:** SPEC-20260817-002
- **Estado:** BACKLOG (depende de SPEC-001 `READY`; contrato listo para futura implementación)
- **Versión:** 1.0
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-19 (v1.0)
- **Módulo funcional cubierto:** Prospectos, clientes, contactos y datos fiscales del cliente (block B3).
- **ADRs de referencia:** ARCH-20260817-01 (stack), ARCH-20260819-03 (UI/responsive), ARCH-20260817-05 (autorización por recurso — prospectos propios vs todos).
- **Depende de:** SPEC-20260817-001 (Plataforma Base: `organization_id`, `hasPermission`, `audit_logs`, `files`, enlaces firmados).

---

## 1. Resultado
Gestionar la captación (prospectos) y el cliente desde su nacimiento (desde prospecto calificado) hasta su archivo, con contactos múltiples, datos fiscales opcionales y trazabilidad comercial. Base sobre la que Comercial (SPEC-003) y OS (SPEC-004) operan.

## 2. Fuentes funcionales por ID
- **DEC-FUN:** DEC-FUN-04 (cliente se crea desde prospecto), DEC-FUN-19 (decisión histórica de medios), DEC-20260823-01 (tres medios de contacto vigentes), DEC-FUN-22 (permisos custom aditivos).
- **BR (B3):** BR-N148 (calificado exige cuestionario), BR-N168 (cliente desde prospecto), BR-N213 (perdido exige motivo), BR-N214 (suspendido exige motivo, reactivable), BR-N215 (cliente se archiva, no elimina), BR-N216 (número único de cliente por org), BR-N217 (varios contactos, uno principal), BR-N218 (datos fiscales opcionales).
- **Visibilidad:** ACTORES §3 (prospectos propios vs todos según rol), §5.

## 3. Alcance y exclusiones
### 3.1 Incluido
- `prospects` (oportunidad), `clients`, `client_contacts`, `client_fiscal_data`. Estados de oportunidad, archivado de cliente, contactos con principal, datos fiscales opcionales, tres medios de contacto (enum: `llamada`, `email`, `whatsapp`).
### 3.2 Excluido
- Cuestionarios de sondeo → SPEC-003 (B4). Catálogo/plantillas → SPEC-003. Cotización/OS → SPEC-003/004. CFDI del cliente → SPEC-007 (aquí sólo datos fiscales de captura). Portal de cliente → fuera MVP.

## 4. Modelo técnico (contrato)
### 4.1 Entidades
- `prospects (id uuid PK, organization_id uuid FK, code text unique per org, status enum, name, company, email, phone, source, medium enum(llamada|email|whatsapp), assigned_to uuid FK→users, lost_reason, suspended_reason, next_action_at, created_at, updated_at)`. Status oportunidad = `nuevo | contactado | calificado | discovery_requerimientos | cotizacion_enviada | negociacion | ganado | perdido | suspendido` (FLUJOS §3.1).
- `clients (id uuid PK, organization_id uuid FK, client_number text unique per org (BR-N216), prospect_id uuid FK→prospects null, name, company, email, phone, status enum(active|archived), archived_reason, created_at, updated_at)`. Nace desde prospecto (BR-N168); archivado, no eliminado (BR-N215).
- `client_contacts (id uuid PK, organization_id uuid FK, client_id uuid FK, name, role, email, phone, is_main boolean, created_at)`. Sólo uno `is_main=true` por cliente (BR-N217).
- `client_fiscal_data (id uuid PK, organization_id uuid FK, client_id uuid FK unique, rfc, razon_social, regimen, domicilio_jsonb, cfdi_use, updated_at, updated_by)` (BR-N218; opcional).

### 4.2 Servicios (firma)
- `prospects.qualify(ctx, prospectId)` — requiere cuestionario completado (BR-N148); pasa a `calificado`.
- `clients.createFromProspect(ctx, prospectId)` — crea cliente al cumplir condiciones (BR-N168); genera `client_number` único por org (BR-N216); audita (`action='client.create'`).
- `clients.archive(ctx, clientId, reason)` — archiva (no elimina); audita (BR-N215).
- `canAccessResource(ctx, prospect)` — Vendedor ve propios; Director/Admin ven todos (ACTORES §3; ADR-05).

## 5. Reglas e invariantes
1. Cliente nace sólo desde prospecto calificado (BR-N168); no alta manual aislada.
2. `calificado` exige cuestionario vinculado (BR-N148; el cuestionario vive en SPEC-003).
3. `perdido`/`suspendido` exigen motivo (BR-N213/214); `suspendido` reactivable.
4. Cliente se archiva, nunca se elimina físicamente (BR-N215).
5. Un sólo contacto `is_main` por cliente (BR-N217).
6. Datos fiscales opcionales (BR-N218); RFC único por org cuando se provee.
7. Toda acción crítica (`client.create`, `client.archive`) en `audit_logs` (BR-N336).
8. Visibilidad por rol: Vendedor=propios prospectos; Director/Admin=todos (ACTORES §3).

## 6. Casos borde
- Prospecto sin cuestionario intenta pasar a `calificado` → `409 { code:'QUESTIONNAIRE_REQUIRED' }` (BR-N148).
- Crear cliente manualmente (sin prospecto) → `409 { code:'CLIENT_MUST_COME_FROM_PROSPECT' }` (BR-N168).
- Dos contactos `is_main` → constraint rechaza; sólo uno.
- Archivar cliente con OS/proyectos activos → advertencia o bloqueo (decisión reversible de SOFIA dentro del contrato: bloquear si hay OS abierta).
- Prospecto `perdido` sin motivo → `400 { code:'LOST_REASON_REQUIRED' }`.

## 7. Seguridad/privacidad
- `organization_id` en toda entidad (multi-tenancy, BR-N200). RLS latente.
- Datos fiscales del cliente: no son secreto (no CSD), pero visibilidad por rol. Archivos de evidencia comercial vía enlaces firmados (SPEC-001 AC-13).

## 8. Migración/compatibilidad
- Migración inicial crea las tablas de este módulo (añadidas a la migración de SPEC-001 o en migración propia del módulo). Seed: ninguno (prospectos/clientes se crean en operación).

## 9. Criterios de aceptación (testeables)
- **AC-1 · Cliente nace desde prospecto:** test Vitest: crear cliente sin prospecto → `409 CLIENT_MUST_COME_FROM_PROSPECT`; desde prospecto calificado → `201` y `client_number` único. (BR-N168, BR-N216)
- **AC-2 · Calificado exige cuestionario:** prospecto sin cuestionario → `qualify` lanza `409 QUESTIONNAIRE_REQUIRED`. (BR-N148; cuestionario en SPEC-003)
- **AC-3 · Archivado, no eliminación:** `DELETE` físico de cliente → `409 CLIENT_DELETE_FORBIDDEN`; `archive` → `status='archived'` + `audit_logs`. (BR-N215, BR-N336)
- **AC-4 · Perdido/suspendido con motivo:** pasar a `perdido` sin motivo → `400 LOST_REASON_REQUIRED`; `suspendido` reactivable conserva historial. (BR-N213/214)
- **AC-5 · Un contacto principal:** insertar 2º `is_main=true` → `409 MULTIPLE_MAIN_CONTACTS`; el existente permanece. (BR-N217)
- **AC-6 · Visibilidad por rol:** Vendedor lista sólo sus prospectos; Director lista todos (test con seed de 2 prospectos de distinto vendedor). (ACTORES §3, ADR-05)
- **AC-7 · Datos fiscales opcionales:** cliente sin datos fiscales se crea OK; con RFC duplicado por org → `409 RFC_DUPLICATE`. (BR-N218)
- **AC-8 · 3 medios de contacto:** el enum `medium` admite exactamente `llamada`, `email`, `whatsapp`, en el orden canónico confirmado (DEC-20260823-01); test de catálogo.
- **AC-9 · UI/responsive:** listado y ficha de prospecto/cliente operables en 375/768/1280 (Playwright E2E); formulario de cliente usable en móvil (AC-57 SPEC-001). (ADR-03, DEC-FUN-72)

## 10. Validaciones detectadas
- `pnpm typecheck`, `pnpm test` (Vitest AC-1..AC-8), `pnpm test:e2e` (AC-9 viewport matrix), greps anti-patrón hexagonal (AC-26/AC-27 SPEC-001).

## 11. Rollback (recomendado)
- Revertir migración del módulo (drop tablas B3) — requiere aprobación de Frank; los prospectos/clientes son datos de negocio.

## 12. Riesgos y pendientes
- **R1:** bloqueo de archivado con OS abierta — decisión reversible de SOFIA (recomendado: bloquear + listar OS abiertas).
- **P-002-1:** resuelto por `DEC-20260823-01`; no quedan pendientes funcionales para este enum.

## 13. DoD
- AC-1..AC-9 PASS; typecheck/test/test:e2e PASS; trazabilidad a BR-N148/168/213-218; `PROYECTO.md` actualizado; GEMINI recomendado (toca visibilidad por rol y datos de cliente → tocar autorización, riesgo medio).

## 14. Handoff a SOFIA (resumen)
- **SPEC activa:** SPEC-002. **ADRs:** 01, 03, 05. **Alcance:** `src/server/db/clientes/*`, `src/server/services/clientes/*`, `src/server/trpc/routers/clientes/*`, `src/modules/clientes/*`. **Contratos protegidos:** `organization_id`, `hasPermission`, `audit_logs`, enums en `shared/enums`. **Enum confirmado:** sólo `llamada`, `email`, `whatsapp`, en ese orden; SOFIA no debe ampliar el catálogo. Campos del cuestionario siguen en SPEC-003.
