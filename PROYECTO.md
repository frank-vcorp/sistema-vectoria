# PROYECTO.md · Vector IA Administración — Cola de ejecución técnica

- **Propietario:** INTEGRA (transiciones vía CRONISTA)
- **Versión:** 2.1 (2026-08-21; añade cola reusable multi-proyecto + estado `READY_FOR_MERGE_POST_LIVE`)
- **Fecha:** 2026-08-21
- **Raíz:** `/home/frank/repos/baseline-reusable-v2` (worktree `feature/baseline-reusable-v2`, separado de `main`; **sin commits**)
- **Rama:** `feature/baseline-reusable-v2`
- **Checkpoint:** commit `0e39b35` (rama base `main` + `feat: prepare staging deployment`); cambios del pase reusable sin commitear
- **Fuente funcional:** `discovery/FUNCTIONAL-BASELINE.md` v1.0
- **Stack decidido:** ver ADR-20260817-01 (monolito modular Next.js + TypeScript + PostgreSQL + Drizzle + tRPC + Zod + pg-boss + S3-compatible + Argon2id + AES-256-GCM).
- **Modo:** lote `NOCTURNO-REUSABLE-20260821-01` (asumido vigente para activar SOFIA en worktree — verificar con ATLAS antes del merge).

---

## 1. Objetivo técnico

Construir, de forma modular y trazable, el sistema web interno que controla de extremo a extremo:

`prospección → descubrimiento → alcance firmado → cotización → OS → proyecto → facturación → cobro → rentabilidad y cierre`

con multi-tenancy latente (DEC-FUN-46), roles y permisos como datos (DEC-FUN-02) y trazabilidad entre lo vendido, lo ejecutado, lo entregado y lo financiero.

**Objetivo técnico adicional (lote `NOCTURNO-REUSABLE-20260821-01`):** convertir `vectoria-provision` v1.7 en baseline reusable multi-proyecto (v2.0) para que cualquier proyecto futuro se aprovisione con el mismo runner + manifest canónico + global-profile, sin reescribir código del runner ni colisionar con `sistema-vectoria`.

---

## 2. DoR y DoD del sistema

### 2.1 DoR de arquitectura (INTEGRA)

- ✅ Fuente funcional y checkpoint identificados (commit `0e39b35` para reusable; `2c19a91` para sistema-vectoria).
- ✅ Problema y resultado esperado (baseline §1-2).
- ✅ Alcance incluido/excluido (baseline §2, handoff §3).
- ✅ Decisiones y reglas críticas por ID (60 DEC + 231 BR).
- ✅ Flujos y escenarios representativos (7 FLOW + 10 SCN-PROJ).
- ✅ Cero preguntas bloqueantes; Q-NB-3 diferida y acotada a Comercial.
- ✅ Cero contradicciones P0 vigentes; W1 + W2 del QA-20260821-REUSABLE-r1 cerrados vía SPEC-GAP-20260821-07-cierre r1.

### 2.2 DoR de implementación (SOFIA)

Definido por SPEC. Requiere: ID y prioridad, SPEC activa, referencias funcionales, resultado técnico esperado, contratos afectados/protegidos, criterios verificables, dependencias disponibles, comandos de validación detectados o N/A justificado, sin decisiones bloqueantes.

### 2.3 DoD del sistema

- Toda decisión pertenece a la capa correcta.
- Trazabilidad entre DEC/BR/FLOW/SCN ↔ SPEC/AC ↔ IMPL/QA.
- `typecheck` PASS en toda unidad READY_FOR_VERIFYING.
- Tests unitarios + E2E cubren los escenarios que cada SPEC cita.
- Evidencia reproducible.
- Auditoría de acciones críticas implementada (BR-N336).
- Multi-tenancy latente verificable (RLS escrito, inactivo, gateado).
- `PROYECTO.md` consistente y sin IDs duplicados.

### 2.4 DoD de la unidad reusable (lote `NOCTURNO-REUSABLE-20260821-01`)

Estado actual: **`READY_FOR_MERGE_POST_LIVE`** (cerrado en código y SPEC; pendiente sólo de merge gated-Frank tras cierre LIVE staging).

- [x] 23/23 AC PASS (49 subtests `AC-R-*` + 11 misc + 4 E2E oficiales).
- [x] `pnpm -C infrastructure/vectoria-provision test` = **146/146 PASS** oficial (incluye `tests/*.test.ts` + `tests/e2e/*.test.ts`). Baseline v1.7 medido = 82 subtests.
- [x] `pnpm -C infrastructure/vectoria-provision run typecheck` exit 0.
- [x] `pnpm -C infrastructure/vectoria-provision run build` exit 0; `dist/` regenerado.
- [x] GEMINI QA-20260821-REUSABLE-r1 `PASS_WITH_WARNINGS` (0 P0/P1; 2 WARNINGS cerrados en SPEC-GAP-cierre r1; 1 WARNING menor W3 registrado).
- [x] `MANIFEST-STAGING-20260821-01-sistema-vectoria.json` intacto (compat retroactiva verificada V-C6 + V-M5).
- [x] Sin secretos impresos (V-C1..C6 + V-M1..M6 + redacciones activas).
- [x] SPEC-20260821-001 v1.1 + ADR-20260821-01 v1.1 + SPEC-GAP-20260821-07-cierre r1 publicados.
- [ ] Frank autoriza merge a `main` (gateado post-LIVE staging cierre; autorización por separado).
- [ ] CRONISTA aplica transición a `DONE (v2.0 reusable, merge-post-LIVE-aprobado)` tras merge efectivo.

---

## 3. Estados canónicos

`BACKLOG → READY → IN_PROGRESS → VERIFYING → DONE`
                          `└──────────────→ BLOCKED`
                          `└──────────────→ READY_FOR_MERGE_POST_LIVE` (sub-estado de VERIFYING para unidades cerradas en código pero pendientes de merge gated-Frank)

- `READY_FOR_MERGE_POST_LIVE` es un **sub-estado de VERIFYING** introducido para este pase: código cerrado y 146/146 PASS reproducible, GEMINI PASS_WITH_WARNINGS, SPEC-GAP-cierre aplicado; pendiente sólo de merge gated-Frank tras cierre del LIVE staging `NOCTURNO-STAGING-20260821-03/04`. NO es un estado final (`DONE` se aplica sólo tras merge efectivo).
- Tags complementarios entre paréntesis permitidos (no sustituyen estado).

Términos prohibidos: `[~] Planificado`, `[→] En curso`, `[✓] Cerrado`, `Staging aprobado`, `Handoff a Cronos`. Migrar al canónico.

---

## 4. ADRs vigentes

| ID | Archivo | Estado | Asunto |
|---|---|---|---|
| ARCH-20260817-01 | `ADR-20260817-01-arquitectura-y-stack.md` | accepted | Arquitectura y stack fundacional |
| ARCH-20260817-02 | `ADR-20260817-02-multi-tenancy-y-aislamiento.md` | accepted | Multi-tenancy y aislamiento de datos |
| ARCH-20260817-03 | `ADR-20260817-03-secretos-y-cifrado.md` | accepted | Secretos, cifrado y credenciales sensibles |
| ARCH-20260821-01 | `ADR-20260821-01-baseline-infra-reusable-precedencia-namespacing.md` (v1.1) | propuesto (espera Frank-merge) | Baseline reusable multi-proyecto · precedencia + namespacing; enum baseline 5 keys preservado, 12 runtime app keys delegadas al adapter |

ADRs pendientes (se producen al llegar a su SPEC):

- ARCH-20260817-04 · Cuestionario 4 capas y JSON Discovery (al producir SPEC-003 Comercial / SPEC-005 Proyectos).
- ARCH-20260817-05 · Integración PAC FacturoPorTi (al producir SPEC-007 Facturación).
- ARCH-20260817-06 · Comisión sobre facturado y reversa (al producir SPEC-008 Cobranza/Comisiones).
- ARCH-20260817-07 · JSON Discovery round-trip y versionado (al producir SPEC-005 Proyectos).
- ARCH-20260817-08 · Rentabilidad por técnico y costos (al producir SPEC-009 Finanzas).

---

## 5. Plan de SPECs (cola técnica)

Dependencias: cada SPEC lista los IDs de los que depende. Una SPEC sólo pasa a `READY` cuando sus dependencias están `DONE` (salvo paralelización justificada con conjuntos de archivos disjuntos, ver §7).

| ID SPEC | Módulo funcional cubierto | Depende de | Estado |
|---|---|---|---|
| SPEC-20260817-001 | Plataforma Base (multi-tenancy, auth, roles/permisos hasPermission, auditoría, archivos, crypto, jobs, notificaciones in-app, config fiscal) | — | READY |
| SPEC-20260817-002 | Clientes y Prospectos (prospecto, cliente, contactos, datos fiscales cliente) | SPEC-001 | BACKLOG |
| SPEC-20260817-003 | Comercial (cuestionarios 4 capas, catálogo, plantillas, alcance firmado, cotización multi-línea, aceptación proxy, descuentos) | SPEC-001, SPEC-002 | BACKLOG (⚠️ puede emitir DISCOVERY-GAP por Q-NB-3) |
| SPEC-20260817-004 | Orden de Servicio (OS, anticipo, OC, autorización, creación atómica del Proyecto) | SPEC-001, SPEC-002, SPEC-003 | BACKLOG |
| SPEC-20260817-005 | Proyectos — artefactos y estados (alcance firmado vs plantilla vs JSON, estados 3D, módulos, requerimientos, tareas) | SPEC-001, SPEC-002, SPEC-003, SPEC-004 | BACKLOG |
| SPEC-20260817-006 | Proyectos — equipo y ejecución (incorporación, asignación, revisión, pruebas, entregables, cambios de alcance, cierre técnico) | SPEC-005 | BACKLOG |
| SPEC-20260817-007 | Facturación CFDI (timbrado FacturoPorTi, cancelación SAT, ZIP contador, calendario) | SPEC-001, SPEC-002, SPEC-003 | BACKLOG |
| SPEC-20260817-008 | Cobranza y Comisiones (cobros, aplicaciones, promesas, escalado, comisión sobre facturado, reversa) | SPEC-001, SPEC-003, SPEC-007 | BACKLOG |
| SPEC-20260817-009 | Finanzas y movimientos (cuentas, movimientos, transferencias, costos, rentabilidad por técnico, cierre administrativo OS) | SPEC-001, SPEC-005, SPEC-008 | BACKLOG |
| SPEC-20260817-010 | Dashboard, Administración y Bitácora (widgets por rol, admin catálogos/plantillas/cuestionarios, auditoría global) | SPEC-001 (lectura de todos) | BACKLOG |
| **SPEC-20260821-001** (v1.1) | **Baseline infra reusable multi-proyecto · vectoria-provision v2.0** (runner, manifest v2, global-profile, registry/locks/audit namespaced, secret-source genérico, HKDF namespacing, healthcheck/startCommand declarativos, application adapter) | SPEC-20260820-003 v1.7 | **READY** (cierre-W1W2-aplicado; pase reusable en `READY_FOR_MERGE_POST_LIVE`) |

### 5.1 Cobertura funcional por SPEC

| SPEC | FLOW cubiertos | SCN cubiertos | Invariantes (handoff §6) |
|---|---|---|---|
| 001 | — | — | 11 (excepciones), 12 (rol usado) |
| 002 | (parte de FLOW-COM-01) | — | — |
| 003 | FLOW-COM-01 (cuestionario→alcance→cotización) | — | 1 (cotización aceptada → OS), 3 (change request) |
| 004 | FLOW-OS-01 (anticipo→autorización→Proyecto) | — | 1, 5 (nobody recibe trabajo sin pertenecer) |
| 005 | FLOW-PROJ-01 (parcial), FLOW-PROJ-03 (JSON), FLOW-PROJ-04 (cambios) | SCN-PROJ-06/07 | 2 (alcance firmado inmutable), 4 (reimport no duplica), 7 (PL registra aceptación) |
| 006 | FLOW-PROJ-01 (ejecución), FLOW-PROJ-02 (equipo), FLOW-PROJ-05 (cierre) | SCN-PROJ-01 a -05, -08, -09, -10 | 5, 6 (tarea sin checklist/evidencia no termina), 8 (deployed no espera aceptación), 9, 10, 11 |
| 007 | (facturación del cierre) | SCN-PROJ-08 (factura final) | — |
| 008 | (comisiones y cobro del cierre) | SCN-PROJ-08 (saldo cero) | — |
| 009 | (cierre administrativo) | SCN-PROJ-08/09/10 | 10 (saldo cero o excepción Director) |
| 010 | (transversal) | — | 12 (rol usado en acción crítica) |
| **20260821-001** | (infra reusable — sin flows funcionales; aplica al ciclo LIVE staging) | — | — (DEC-TECH-20260821-07-1 + DEC-TECH-20260821-07-2 documentadas en SPEC-GAP-20260821-07-cierre r1) |

---

## 6. Cola de ejecución activa (lotes vigentes)

### 6.1 Lote `NOCTURNO-STAGING-20260821-03/04` (LIVE staging en curso)

- Estado: en curso (NO TOCADO por este pase reusable).
- Merge del pase reusable **NO** debe ejecutarse antes del cierre de este lote.

### 6.2 Lote `NOCTURNO-REUSABLE-20260821-01` (pase reusable multi-proyecto)

| Unidad | ID | SPEC | Estado | Owner | Resultado |
|---|---|---|---|---|---|
| U1 · Schema v2 + compat retroactiva | IMPL-20260821-REUSABLE (pase 0) | SPEC-20260821-001 v1.0 | DONE (QA-FAIL → L1 fix) | SOFIA | `pnpm test` 133/133 + 3 E2E FAIL (F1+F2) |
| U1..U10 (refactor reusable) | IMPL-20260821-REUSABLE-r1 | SPEC-20260821-001 v1.0 + ADR-20260821-01 v1.0 + SPEC-GAP-07 v1.0 | **`READY_FOR_MERGE_POST_LIVE`** | SOFIA | `pnpm test` **146/146 PASS** oficial (49 AC-R-* + 11 misc + 4 E2E); 6 hallazgos QA cerrados (F1+F2+F5+F6+F7+F8); 2 WARNINGS P2 cerrados en este pase vía SPEC-GAP-07-cierre r1 |
| QA post-r1 | QA-20260821-REUSABLE-r1 | SPEC-20260821-001 v1.1 + ADR-20260821-01 v1.1 + SPEC-GAP-07-cierre r1 | DONE (PASS_WITH_WARNINGS) | GEMINI | 0 P0/P1; W1+W2 cerrados; W3 registrado |
| Cierre W1+W2 | SPEC-GAP-20260821-07-cierre r1 | SPEC-20260821-001 v1.1 + ADR-20260821-01 v1.1 | DONE | INTEGRA | DEC-TECH-20260821-07-1 (Opción A: 5 keys baseline + 12 runtime app keys delegadas al adapter) + DEC-TECH-20260821-07-2 (métrica 146/146 reproducible) |
| **Merge a `main`** | (pendiente) | — | **BLOCKED (gated-Frank, post-LIVE staging cierre)** | Frank | autoriza lote + autoriza merge tras `NOCTURNO-STAGING-20260821-03/04` en `DONE (staging-aprobado)` |
| Pendiente menor | W3 (test meta `pnpm test` script) | — | BACKLOG | SOFIA L1 (1 línea `tests/lint.test.ts`) | no bloquea merge |

### 6.3 Comandos de verificación post-merge (reproducibles)

| # | Comando | Esperado | Frecuencia |
|---|---|---|---|
| V-D | `cd infrastructure/vectoria-provision && pnpm test` | `tests 146 / pass 146 / fail 0` | post-merge |
| V-D-E2E | `cd infrastructure/vectoria-provision && node --test --import tsx 'tests/e2e/*.test.ts'` | `tests 4 / pass 4 / fail 0` | post-merge |
| V-TA | `cd infrastructure/vectoria-provision && pnpm run typecheck` | exit 0 | post-merge |
| V-TB | `cd infrastructure/vectoria-provision && pnpm run build` | exit 0; `dist/` regenerado | post-merge |
| V-C6 | `git -C /home/frank/repos/sistema-vectoria status context/infra/manifests/MANIFEST-STAGING-20260821-01-sistema-vectoria.json` | `nothing to commit, working tree clean` (compat retroactiva) | post-merge |

---

## 7. Autorizaciones vigentes

- **Arranque técnico:** autorizado por Frank vía handoff ATLAS → INTEGRA (2026-08-17).
- **Producción de ADR/SPEC:** dentro del rol de INTEGRA, sin autorización extra.
- **Delegación a SOFIA:** vía SPEC-HANDOFF cuando una SPEC esté `READY` y cumpla DoR de implementación. WIP=1 por instancia SOFIA salvo paralelización justificada (§8).
- **Acciones destructivas** (commit/push/PR/deploy/rollback/delete/migración irreversible/secretos): **requieren aprobación explícita de Frank**. Estado actual del lote reusable:
  - **Lote `NOCTURNO-REUSABLE-20260821-01`:** autorizado (asumido por ATLAS para activar SOFIA — verificar vigencia explícita con ATLAS antes del merge).
  - **Merge del pase reusable a `main`:** **NO autorizado aún**. Pendiente gated-Frank tras cierre LIVE staging `NOCTURNO-STAGING-20260821-03/04`.
  - **Staging deploy del pase reusable:** **NO autorizado aún**. Pendiente post-merge.
  - **Producción deploy:** **NO autorizado**. Proyectos reales aún no migrados al nuevo namespace; fuera del alcance del pase.

---

## 8. Paralelismo

Sesgo por defecto: intentar paralelizar 2 SOFIAs si la SPEC lo permite, demostrando independencia (conjuntos de archivos disjuntos + cero imports cruzados). En caso contrario, secuencial.

- **SPEC-20260817-001** es fundacional y todas las demás dependen de ella → no hay paralelismo posible hasta que esté `IN_PROGRESS`/`VERIFYING` y exista infraestructura mínima (esquema base, auth, hasPermission, audit, files, jobs). A partir de SPEC-002 + SPEC-003 podría evaluarse paralelismo si los conjuntos de archivos son disjuntos.
- **SPEC-20260821-001** (reusable): NO paralelizable a 2+ SOFIA — archivos `src/{schema,registry,profile,secrets,secrets-file,ensure,index,git-url,destination,constants}.ts` + `bin/run-provision.sh` + tests nuevos compartidos. Secuencial (1 SOFIA, 6–8 días). Razón registrada en `SPEC-GAP-20260821-07-baseline-reusable-delta` §4.2.

---

## 9. Q-NB-3 (diferida, no bloqueante)

Política de desviación contra presupuesto declarado (Comercial). **No se resuelve silenciosamente.** Al producir SPEC-003 Comercial, si la SPEC requiere automatizar advertencia/bloqueo de cotización vs presupuesto, INTEGRA emitirá `DISCOVERY-GAP` a ATLAS/Frank con las opciones de PREGUNTAS-ABIERTAS.md §2 (advertencia 1.5× / bloqueo con Director / sin control).

---

## 10. Trazabilidad

Cadena esperada: `Necesidad (Frank) → DEC/BR/FLOW/SCN (ATLAS) → SPEC/AC (INTEGRA) → IMPL (SOFIA) → QA (GEMINI)`.

- 60 DEC-FUNCIONALES consolidados en `discovery/DECISIONES-FUNCIONALES.md`.
- 231 BR consolidados en `discovery/REGLAS-DE-NEGOCIO.md` (bloques B1-B27).
- 7 FLOW + 10 SCN-PROJ en `discovery/FLUJOS-FUNCIONALES.md` y `discovery/simulations/SIMULACION-FLUJO-PROYECTOS-20260817.md`.
- Cada criterio de aceptación de cada SPEC citará el DEC/BR/FLOW/SCN de origen.

### 10.1 Cadena del lote `NOCTURNO-REUSABLE-20260821-01`

```
Frank → ATLAS (turno 2026-08-21 "dejar todo preparado también para proyectos posteriores")
  → INTEGRA: SPEC-20260821-001 v1.0 + ADR-20260821-01 v1.0 + SPEC-GAP-07-baseline-reusable-delta v1.0
  → INTEGRA: SPEC-HANDOFF-20260821-10 (handoff a SOFIA vía ATLAS, lote NOCTURNO-REUSABLE-20260821-01)
  → SOFIA (sesión independiente): IMPL-20260821-REUSABLE (pase 0 — FAIL QA)
  → SOFIA: IMPL-20260821-REUSABLE-r1 (pase 1 — F1+F2+F5+F6+F7+F8 cerrados, 146/146 PASS)
  → INTEGRA: SPEC-20260821-001 v1.1 + ADR-20260821-01 v1.1 + SPEC-GAP-20260821-07-cierre r1 (W1+W2 cerrados)
  → GEMINI: QA-20260821-REUSABLE-r1 (PASS_WITH_WARNINGS, 0 P0/P1)
  → INTEGRA: PROYECTO.md v2.1 actualizado a READY_FOR_MERGE_POST_LIVE
  → ATLAS: eleva a Frank vía KiloRemote/chat con solicitud de OK para merge post-LIVE staging cierre
  → Frank: autoriza lote + autoriza merge post-LIVE staging cierre (gated-Frank)
  → CRONISTA: aplica transición VERIFYING → DONE (v2.0 reusable, merge-post-LIVE-aprobado) tras merge efectivo
```

### 10.2 DEC técnicas del pase reusable

- **DEC-TECH-20260821-07-1** (INTEGRA, SPEC-GAP-20260821-07-cierre r1 §2.3): baseline reusable v2 preserva enum baseline de 5 keys del runner v1; las 12 runtime app keys del §8.3 v1.7 son delegadas al application adapter (§11 SPEC-20260821-001 v1.1); ampliación del enum baseline a 12 keys queda para IMPL-13+ dedicado.
- **DEC-TECH-20260821-07-2** (INTEGRA, SPEC-GAP-20260821-07-cierre r1 §3.2): métrica DoD del pase reusable es 146/146 PASS oficial reproducible (82 baseline + 49 AC-R-* + 11 misc + 4 E2E); no se emiten aspiracionales.

---

## 11. Pendientes de INTEGRA (próximos pases)

### 11.1 Sistema-vectoria

1. Producir SPEC-002 (Clientes y Prospectos) — depende sólo de SPEC-001.
2. Producir SPEC-003 (Comercial) — evaluar DISCOVERY-GAP por Q-NB-3.
3. Producir ADR-04 (cuestionario/JSON), ADR-05 (PAC), ADR-06 (comisión), ADR-07 (JSON round-trip), ADR-08 (rentabilidad) al llegar a sus SPEC.
4. Cuando SPEC-001 esté `READY_FOR_VERIFYING` y SPEC-002/003 listas, evaluar paralelismo de 2 SOFIAs.

### 11.2 Reusable multi-proyecto

1. **W3 (test meta `pnpm test` script):** pendiente menor, NO bloqueante. SOFIA L1 (1 línea en `tests/lint.test.ts`) cuando estime, post-merge. Probabilidad de regresión: baja.
2. **IMPL-13+ (ampliación enum baseline a 12 keys):** SPEC dedicada, Frank-gated, fuera del alcance del pase reusable. Activación: cuando Frank determine que es momento de empezar a delegar más allá de las 5 keys actuales. Pre-requisito: runner en `main` con v2.0 reusable mergeada.
3. **Application adapters por app (sistema-vectoria, futuros):** SPEC dedicada por app. El primer adopter es `sistema-vectoria` (adapter en `src/lib/vectoria-adapter.ts`, opcional). Activación: por app, no por runner.

---

## 12. Convenciones de nombrado

- IDs ADR: `ARCH-YYYYMMDD-NN`, archivo `ADR-YYYYMMDD-NN-slug.md` en `context/decisions/`.
- IDs SPEC: `SPEC-YYYYMMDD-NNN`, archivo `SPEC-YYYYMMDD-NNN-slug.md` en `context/SPECs/`.
- IDs SPEC-GAP: `SPEC-GAP-YYYYMMDD-NN`, archivo `SPEC-GAP-YYYYMMDD-NN-slug.md` en `context/decisions/`.
- IDs IMPL: `IMPL-YYYYMMDD-NN` (SOFIA).
- IDs FIX: `FIX-YYYYMMDD-NN` (DEBY).
- IDs QA: `QA-YYYYMMDD-NN` (GEMINI).
- IDs DOC: `DOC-YYYYMMDD-NN` (CRONISTA, transiciones PROYECTO.md).
- IDs DEC técnicas: `DEC-TECH-YYYYMMDD-NN` (INTEGRA, dentro de un SPEC-GAP o ADR).
- IDs SPEC-HANDOFF: `SPEC-HANDOFF-YYYYMMDD-NN` (INTEGRA → SOFIA, vía ATLAS).

Sin IDs duplicados ni renumerados.

---

## 13. Changelog de versiones

- **v1.0** (2026-08-17): creación inicial. Cola sistema-vectoria con SPEC-001 `READY` + 9 BACKLOG.
- **v2.1** (2026-08-21, este pase): añade SPEC-20260821-001 v1.1 + ADR-20260821-01 v1.1 + cola reusable `NOCTURNO-REUSABLE-20260821-01`; introduce sub-estado `READY_FOR_MERGE_POST_LIVE` (sub-estado de VERIFYING para unidades cerradas en código pendientes de merge gated-Frank post-LIVE staging cierre); documenta DEC-TECH-20260821-07-1 + DEC-TECH-20260821-07-2; estado actual del pase reusable: `READY_FOR_MERGE_POST_LIVE`.
