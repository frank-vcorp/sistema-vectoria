# CURRENT · Provisionamiento base mínimo · `REBUILD-COOLIFY-20260824-02` · ATLAS

- **Estado:** `DONE (local; pendiente-gate-V3-externo)` · **WIP=0**
- **Incremento cerrado:** migración y retiro del carril legacy al runtime adapter; V1/V2 y QA local PASS_WITH_WARNINGS; no deploy/V3.
- **turnoId:** `AUTONOMOUS-V1-20260823-01`
- **Origen/autorización:** autorización explícita, vigente y de un solo uso de Frank transmitida por SOL; H1 = este handoff.
- **Inicio de medición:** `2026-08-23T14:00:48-06:00`
- **Cierre de medición:** `2026-08-23T19:03:00-06:00` · `DOC-20260823-01`
- **Owner:** ATLAS → GEMINI · implementación local concluida; auditoría independiente pendiente.
- **Incremento activo:** `REBUILD-COOLIFY-20260824-02`.
- **SPEC/ADR:** `SPEC-20260824-003` · `ADR-20260824-03`.
- **Objetivo:** limitar el runner a provisionamiento base; mover deploy, migraciones, bootstrap, seed, envs, logs y health a operaciones API on demand separadas.
- **Presupuesto:** `AUTONOMOUS-SYSTEM-20260824-01` · ≤6 sesiones / ≤300 tools; WIP=0; corte SOFIA concluido.
- **Objetivo cerrado:** migrar el manifest canónico y consumidores reales al runtime adapter; retirar legacy sólo con inventario cero.
- **Permisos canónicos vigentes para este incremento:** implementación local, tests, un único deploy staging no destructivo y Playwright V3; no producción, rollback, delete, billing, exposición de secretos, recreación de recursos, drops/resets ni migraciones irreversibles.
- **Presupuesto:** `AUTONOMOUS-V3-20260824-01` · ≤3 sesiones adicionales / ≤120 tools; detener si el probe no puede resolverse con evidencia real.

## Turno autónomo de cierre V3 · `AUTONOMOUS-V3-20260824-01`

- **Inicio:** `2026-08-24T12:11:36-06:00`.
- **Autorización:** instrucción explícita de Frank: resolver autónomamente hasta PASS.
- **Alcance cerrado:** corregir únicamente `coolify_version_unsupported:unknown`, validar V1/V2, ejecutar un único deploy staging al SHA `2a2a79547274d125018f388f2de9d4f29ea9b76c`, correlacionar deployment/SHA/health y ejecutar Playwright V3.
- **Permitido:** correcciones reversibles del version-probe/allowlist dentro de `infrastructure/vectoria-provision/**`, tests, documentación y un único gate staging.
- **Prohibido:** inventar versión, usar rutas no documentadas, pedir/imprimir secretos, recrear UUIDs, producción, delete, rollback o reintentos ciegos.
- **Estado:** `BLOCKED`.

## Handoff activo · `REBUILD-COOLIFY-20260824-02`

- Decisión confirmada por Frank: módulo base mínimo; operaciones posteriores vía API explícita on demand.
- Alcance: validar destino, crear/adoptar infraestructura base, persistir UUIDs y estado mínimo.
- Prohibido en `provision`: deploy, migraciones, bootstrap, seed, envs operativas, logs, health workflow, rollback, cleanup, force, producción, SSH y MCP writer.
- Operaciones futuras separadas: `status`, `logs`, `deploy`, `migrate`, `bootstrap`, `seed`, `env`, `rollback`, `cleanup`.
- Estado: `READY_FOR_SOFIA`.

## Checkpoint operativo 2026-08-24 14:55 MDT

- MCP `coolify-readonly`: deshabilitado globalmente en `~/.config/kilo/kilo.jsonc`; no es dependencia del sistema.
- Skill global directa: `/home/frank/.config/kilo/skills/coolify-infrastructure/SKILL.md`.
- API Coolify directa verificada: Project, Environment, PostgreSQL y Garage creados y consultados sin runner.
- Proyecto de prueba online: `eb8sueczennjjdp1gofwkomx`; PostgreSQL `j3tufgxjrsglxet7admslfyg`; Garage `cwcjhs6vgwrexbqekjshqrkq`; ambos `running:healthy`.
- El runner experimental anterior queda fuera del camino operativo y conserva cambios locales no consolidados; no se debe seguir parchando.
- `SPEC-20260824-003` queda `READY`, pero la operación directa ya resuelve el caso base. No hay implementación activa.

## Gate staging directo 2026-08-24 16:57 MDT

- Aplicación: `gxioc8njzhrudvqlpqjgbvtm`; SHA configurado/verificado: `b55f4e851243a9f8dc4b1e0beb4171863da4dfb1`.
- Coolify API directa: `POST /applications/{uuid}/start?instant_deploy=true` aceptado; deployment `nc3vizuxdv64tgnkjjqwzhhz`.
- Resultado oficial: `status=failed` tras 77.3 s; `GET /deployments/{uuid}` devuelve logs vacíos.
- Runtime actual: aplicación `running:healthy`, `/api/health` HTTP 200 y application logs muestran Next.js `Ready`.
- Rutas públicas verificadas: `/` 200, `/api/health` 200, `/admin/roles` 200, `/notifications` 200; `/clientes` 404 y `/prospectos` 404.
- Estado de infraestructura: `BLOCKED`; no se declara staging listo. No se ejecuta otro reintento sin causa observable.

## Gate staging directo resuelto · 2026-08-24 17:09 MDT

- Causa raíz confirmada por logs de Coolify: Nixpacks compilaba también `infrastructure/vectoria-provision/**`; `exactOptionalPropertyTypes` fallaba en `src/core/preflight/index.ts:109`.
- Fixes publicados: `9f62622` (optional `reason`) y `fc40b44` (excluir runner del `tsconfig` del producto).
- Deployment exitoso: `nl1iemnkttidw3bsnk4i6vik`, estado `finished`, SHA `fc40b446cb0ceee5ab852741772edf4e60997ac7`.
- Aplicación Coolify: `running:healthy`; `/api/health` 200; rutas HTTP `/`, `/clientes`, `/prospectos`, `/admin/roles`, `/notifications` 200.
- Playwright staging dirigido: `6 passed, 4 failed`; fallan assertions funcionales de login/clientes/prospectos por contenido/carga de datos, no por HTTP 404.
- Estado: deployment de infraestructura `PASS`; aplicación web V3 todavía `VERIFYING`, pendiente resolver las 4 assertions funcionales.

## Verificación de logs Coolify · 2026-08-24 17:38 MDT

- `GET /api/v1/deployments/{uuid}` responde 200 para deployments exitosos y fallidos, pero el schema observado no contiene `logs`; sólo devuelve metadatos y `status`.
- Deployment fallido `nc3vizuxdv64tgnkjjqwzhhz`: `failed`, sin causa/logs en REST. Deployment exitoso `nl1iemnkttidw3bsnk4i6vik`: `finished`, sin logs en REST.
- `GET /api/v1/deployments/applications/gxioc8njzhrudvqlpqjgbvtm` devuelve historial de 14 deployments, también sólo metadatos.
- `GET /api/v1/applications/gxioc8njzhrudvqlpqjgbvtm/logs` responde 200 con 2075 caracteres: es log runtime de la app, no output de build/deploy.
- Verificación posterior a token adicional: confirmado. `GET /deployments/{uuid}` ahora incluye `.logs` para el deployment fallido `nc3vizuxdv64tgnkjjqwzhhz` (83,173 caracteres) y el exitoso `nl1iemnkttidw3bsnk4i6vik` (45,668 caracteres). La causa era el permiso de `Read sensitive data`; no era una limitación de Coolify ni un endpoint alternativo.
- Clasificación V3: los fallos de headings (`CardTitle` renderiza `div`) y el error cliente del detalle `/clientes/{id}` son `IMPLEMENTATION_DEFECT` dentro de SPEC-002; no hay evidencia de un gap funcional ni de infraestructura.

## Turno autónomo de cierre del sistema · `AUTONOMOUS-SYSTEM-20260824-01`

- **Autorización:** instrucción explícita de Frank para terminar el sistema durante el día.
- **Alcance:** cerrar la implementación local pendiente de los SPEC existentes, corregir defectos reproducibles, ejecutar V1/V2 completa y dejar un punto de reanudación verificable.
- **Infraestructura:** usar únicamente API directa y la skill global; no usar MCP ni el runner experimental.
- **Permitido:** cambios de código/tests dentro de SPEC vigentes, operaciones API on demand no destructivas y staging sólo si la evidencia local lo habilita.
- **Prohibido:** ampliar producto, crear arquitectura nueva, producción, delete, rollback, force, migraciones irreversibles, secretos, commit/push/PR sin autorización separada.
- **Criterio:** `DONE` local sólo con tests/build/suite/secret scan y evidencia; si staging externo no es certificable, queda separado como `BLOCKED` sin bloquear el cierre local.
- **Estado:** `IN_PROGRESS`.

## Resultado SOFIA · `IMPL-REPORT-20260824-18`

- Estado: `READY_FOR_VERIFYING`.
- Producto V2: typecheck/build/tests PASS (`641/641`).
- Runner V2: typecheck/build/tests PASS (`386/386`).
- `SPEC-20260824-003` AC-1..AC-7 PASS; `runMinimalProvision` no ejecuta deploy, migraciones, bootstrap, seed, health workflow, logs, rollback ni cleanup.
- Diff check y secret scan dirigida PASS.
- Pendiente: auditoría GEMINI/ATLAS y transición documental; V3 externo Coolify continúa separado `BLOCKED`.

## Resultado del turno autónomo `AUTONOMOUS-V3-20260824-01`

- Preflight real: `PASS` con `COOLIFY_VERSION_OVERRIDE=v4.3.9`, `readOnlyEnforced=true`.
- Ensure real: `PASS`; project/environment/application/database/storage/env adoptados, `0` nuevos recursos en el último pase.
- Deploy real: Coolify aceptó `deployment_uuid=uqfhv7wtuka98whkv1jsjdd9` con SHA `b55f4e851243a9f8dc4b1e0beb4171863da4dfb1`, pero el estado terminal oficial fue `failed`.
- Evidencia read-only: `GET /deployments/uqfhv7wtuka98whkv1jsjdd9` devuelve `status=failed`; la aplicación permanece `running:healthy` y `/api/health` devuelve HTTP 200.
- Playwright V3: homepage, `/admin/roles` y `/notifications` responden 200; `/clientes` y `/prospectos` responden 404. Por tanto V3 no es PASS.
- Bloqueos externos: Coolify no expone el motivo de build/runtime en el endpoint de deployment ni en MCP read-only; no se ejecuta SSH ni se inventa diagnóstico.
- Incidente pendiente: duplicado accidental `irj8vss6xmckyh5ofrddmlma` quedó `exited`; no se elimina porque requiere autorización destructiva separada.
- Reportes de implementación: `IMPL-REPORT-20260824-10` a `IMPL-REPORT-20260824-17`.

## Estado final de SPECs

| ID | Módulo | Estado local | Gate V3 |
|---|---|---|---|
| SPEC-20260817-001 | Plataforma Base | `VERIFYING` (v1.10; gates BD/E2E/migrate/bootstrap/smoke pendientes fuera de este turno) | externo |
| P-H-1 (AC-83) | Automatización antipatrones auth routes | `DONE (pendiente-gate-V3-externo)` · QA-05/06 PASS | externo |
| SPEC-20260817-002 | Clientes y Prospectos | `DONE (pendiente-gate-V3-externo)` · QA-05/06 PASS | externo |
| SPEC-20260817-003 | Comercial | `DONE (pendiente-gate-V3-externo)` · QA-05/06 PASS + P2 cerrado | externo |
| SPEC-20260817-004 | Orden de Servicio | `DONE (pendiente-gate-V3-externo)` · QA-05/06 PASS + P3-1 cerrado | externo |
| SPEC-20260817-005 | Proyectos y Artefactos/Estados | `DONE (pendiente-gate-V3-externo)` · QA-05/06 PASS | externo |
| SPEC-20260817-006 | Equipo y Ejecución | `DONE (pendiente-gate-V3-externo)` · QA-05/06 PASS | externo |
| SPEC-20260817-007 | Facturación CFDI | `DONE (pendiente-gate-V3-externo)` · QA-05/06 PASS + P3-2 cerrado | externo |
| SPEC-20260817-008 | Cobranza y Comisiones | `DONE (pendiente-gate-V3-externo)` · QA-05/06 PASS · **P3 Math.floor aceptado** | externo |
| SPEC-20260817-009 | Finanzas y Movimientos | `DONE (pendiente-gate-V3-externo)` · QA-05/06 PASS | externo |
| SPEC-20260817-010 | Dashboard, Admin y Bitácora | `DONE (pendiente-gate-V3-externo)` · QA-05/06 PASS · AC-7 IMPLEMENTATION_DEFECT corregido | externo |
| SPEC-20260817-011 | Suscripciones | `DONE (pendiente-gate-V3-externo)` · QA-05/06 PASS | externo |

## Punto de reanudación

`SPEC-20260824-001` + `ARCH-20260824-01` están persistidos y verificados. El gate V3 fue reanudado con autorización explícita de Frank y ejecutó el preflight real; quedó `BLOCKED` con `coolify_version_unsupported:unknown` (exit 4). No hubo deploy ni V3. QA actualizado: `context/reviews/QA-20260823-04-provision-v3-repair.md`.

## Cierre DOC-20260824-02

- Resultado: `DONE (local; pendiente-gate-V3-externo)`.
- Evidencia: runner `368/368 PASS`; typecheck/build del runner PASS; documentación oficial Coolify revisada; secret scan PASS.
- No ejecutado: deploy, staging mutante, Playwright staging, commit, push, PR, producción, rollback, delete, migraciones irreversibles o lectura de secretos.
- Bloqueo separado: V3 externo requiere una autorización/gate propio y una correlación real de deployment UUID, status, SHA y health.
- Continuidad: el siguiente trabajo puede iniciar como incremento funcional independiente con WIP=1.

## Contexto histórico del turno anterior

El turno anterior reconcilió el gap legacy y corrigió las rutas públicas: `POST /api/v1/deploy` → `deployments[0].deployment_uuid`; polling `GET /api/v1/deployments/{deployment_uuid}`; sin fallback histórico. Su preflight read-only falló fail-closed por `auth_scope_missing:read_token`; no hubo deploy ni V3. Este incremento posterior sí tiene QA GEMINI `PASS_WITH_WARNINGS`; no se ejecutó V3.

**Gate V3 externo — límites vigentes:**
1. No provisionar/recrear PostgreSQL, storage ni ningún UUID existente.
2. No solicitar, leer ni imprimir secretos; usar sólo configuración ya disponible por los canales autorizados.
3. Ejecutar un único deploy staging sólo después de V1/V2 y prueba del SHA/contenedor.
4. Ejecutar V3 independiente contra `https://sistema-vectoria.vector-ia.mx`; si falta una capacidad soportada de estado/logs o evidencia inequívoca, marcar `BLOCKED` sin mutar ni reintentar.

**Decisión de fuente canónica:** usar `context/infra/manifests/MANIFEST-STAGING-20260822-01-sistema-vectoria.v2.json` como manifest único vigente para el runner; conservar el manifest v1 sólo como referencia histórica protegida. UUIDs reales siguen siendo los del handoff y no se sustituyen.

  El preflight real de cierre terminó `upstream_40x`, `coolify_version_unsupported:unknown`, exit 4. No existe `deployment_uuid`, commit activo ni SHA certificado; cero deploy, cero retry y cero V3. El probe `GET /servers/{serverUuid}` no resolvió una versión parseable; no se inventa ni se expone ningún valor.

## Métricas compactas (finales)

- `startedAt`: `2026-08-23T14:00:48-06:00`
- `endedAt`: `2026-08-23T19:03:00-06:00`
- `wallClock`: `~4h 02min`
- `sessions`: `ATLAS=1` · `SOFIA=8` · `GEMINI=1` · `CRONISTA=1` · total=`11`
- `handoffs`: `SPEC-HANDOFF=12` · `IMPL-REPORT=13` · `QA=2` (QA-05, QA-06) · `DOC=1` (DOC-20260823-01)
- `tests`: `641/641 PASS` tras corrección local de tRPC reserved word
- `multitenancy`: `58/58 tablas con organization_id`
- `antipatterns`: `16/16`
- `seed_permissions`: `PASS`
- `increments`: `12` (P-H-1 + SPEC-002..011 + LOCAL-READINESS-20260823-01)
- `implementation_defects`: `2` (SPEC-010 AC-7 + SPEC-008 procedure `apply` reservado por tRPC 11, ambos corregidos)
- `SPEC_GAP`: `1 BLOCKED` (`SPEC-GAP-20260823-01-provision-v3-channel`) · `DISCOVERY_GAP`: `1 resolved` (`DEC-20260823-01`)
- `P3 aceptados`: Math.floor conservador SPEC-008 + P3 cosmético diseño/diseno

## Bloqueador actual

**Gate V3 parcialmente habilitado:** Coolify staging existente está saludable en lectura (`application running:healthy`, PostgreSQL 16 `running:healthy`, Garage `running:healthy`, `/api/health` responde). V1 fue publicada en `origin/main` (`4d6827a`), pero Coolify mantiene el contenedor `920d7dd` pese a tres intentos de deploy (POST normal, POST force y GET documentado; el último devuelve 405). La migración V1 se aplicó manualmente y creó 61 tablas; el bootstrap base no completó porque el contenedor desplegado no contiene `drizzle/meta/_journal.json`; la siembra de Plataforma Base sí terminó. El catálogo V1 y E2E siguen bloqueados hasta ejecutar el contenedor/ref correcto.
- **Incidente de seguridad:** el script legacy `db:seed:plataforma` imprimió en stdout un enlace de invitación de un solo uso. El valor no se repite ni se persiste en artefactos; requiere revocación/rotación operativa antes de compartir logs o continuar el onboarding.

**Readiness local:** `IMPL-REPORT-20260823-04-LOCAL-READINESS.md` confirma producto local listo, sin defectos reproducibles nuevos: 636/636 tests, typecheck/lint producto PASS, multitenancy 58/58, antipatterns 16/16, seed-permissions/currency PASS. V3 sigue bloqueada exclusivamente por el frente externo.

**V3 Playwright local adicional:** detectó y corrigió el HTTP 500 transversal de `cobranza.cobros.apply` (clave reservada `apply` en tRPC 11). Tras el fix, `/clientes` y `/prospectos` cargan sin 500; las consultas devuelven `401 Unauthorized` esperado sin sesión. Viewport 375px: sin overflow horizontal. Reporte: `IMPL-REPORT-20260823-04b-cobros-apply-reserved-word.md`.

**Siguiente handoff:** `context/interconsultas/SPEC-HANDOFF-20260823-04-provision-staging-deploy-repair.md`.

**Reapertura 2026-08-24:** el intento actual de cierre, ya autorizado explícitamente por Frank, ejecutó el preflight real sin override persistido y falló fail-closed en `coolify_version_unsupported:unknown` (exit 4); no llegó a mutación ni deploy. Staging permanece intacto. La evidencia está en `QA-20260823-04-provision-v3-repair.md`.

**Estado actualizado:** el intento autorizado posterior reveló una cuarta incidencia: un binding corrupto persistido en el registry local (`environment/staging` apuntaba al UUID del proyecto) se adoptaba antes de validar identidad. SOFIA corrigió reconciliación stale-registry con GET y reemplazo atómico trazable; `342/342` tests del runner PASS, sin nuevas mutaciones Coolify. El deploy continúa detenido por loop breaker; no se ejecutó Playwright staging.

**Revisión oficial Coolify:** `context/reviews/QA-20260824-07-coolify-official-docs-compliance.md` contrasta el corpus oficial completo (`llms-full.txt`, 39,972,343 bytes) y confirma corrección adicional de `PATCH /applications/{uuid}/envs/bulk` frente a `/envs` single y warm lookup GET antes de POST. Runner local: `368/368` PASS tras el delta. Veredicto operativo: `BLOCKED / NOT_YET_CERTIFIED` hasta un único smoke real que correlacione deployment UUID, status oficial, SHA y health; no se ejecuta otra mutación en este reporte.

## Trazabilidad

- Discovery: `discovery/INDEX.md`, `discovery/FUNCTIONAL-BASELINE.md`, `discovery/HALLAZGOS.md`, `discovery/OPEN-QUESTIONS.md`
- Contratos: `context/SPECs/SPEC-20260817-001-plataforma-base.md` … `SPEC-20260817-011-suscripciones.md`
- IMPL: `context/interconsultas/IMPL-REPORT-20260823-XX-p-h-1-ac83-automation.md` + `IMPL-REPORT-20260823-XX-spec-00{2..11}.md`
- QA: `context/reviews/QA-20260823-05-AUTONOMOUS-V1-gate-final.md` · `context/reviews/QA-20260823-06-AUTONOMOUS-V1-gate-final-revalida.md`
- Estado/cola: este archivo y sección `TURNO AUTÓNOMO V1` de `PROYECTO.md`
