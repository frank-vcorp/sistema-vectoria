# PROYECTO.md · Vector IA Administración — Cola de ejecución técnica

- **Propietario:** INTEGRA (transiciones vía CRONISTA)
- **Versión:** 1.0
- **Fecha:** 2026-08-17
- **Raíz:** `/home/frank/repos/sistema-vectoria`
- **Rama:** `main`
- **Checkpoint:** commit `2c19a91` (handoff ATLAS → INTEGRA aceptado)
- **Fuente funcional:** `discovery/FUNCTIONAL-BASELINE.md` v1.0
- **Stack decidido:** ver ADR-20260817-01 (monolito modular Next.js + TypeScript + PostgreSQL + Drizzle + tRPC + Zod + pg-boss + S3-compatible + Argon2id + AES-256-GCM).

---

## 1. Objetivo técnico

Construir, de forma modular y trazable, el sistema web interno que controla de extremo a extremo:

`prospección → descubrimiento → alcance firmado → cotización → OS → proyecto → facturación → cobro → rentabilidad y cierre`

con multi-tenancy latente (DEC-FUN-46), roles y permisos como datos (DEC-FUN-02) y trazabilidad entre lo vendido, lo ejecutado, lo entregado y lo financiero.

---

## 2. DoR y DoD del sistema

### 2.1 DoR de arquitectura (INTEGRA)

- ✅ Fuente funcional y checkpoint identificados (commit `2c19a91`).
- ✅ Problema y resultado esperado (baseline §1-2).
- ✅ Alcance incluido/excluido (baseline §2, handoff §3).
- ✅ Decisiones y reglas críticas por ID (60 DEC + 231 BR).
- ✅ Flujos y escenarios representativos (7 FLOW + 10 SCN-PROJ).
- ✅ Cero preguntas bloqueantes; Q-NB-3 diferida y acotada a Comercial.
- ✅ Cero contradicciones P0 vigentes.

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

---

## 3. Estados canónicos

`BACKLOG → READY → IN_PROGRESS → VERIFYING → DONE`

Laterales: `BLOCKED`. Tags complementarios entre paréntesis permitidos (no sustituyen estado).

Términos prohibidos: `[~] Planificado`, `[→] En curso`, `[✓] Cerrado`, `Staging aprobado`, `Handoff a Cronos`. Migrar al canónico.

---

## 4. ADRs vigentes

| ID | Archivo | Estado | Asunto |
|---|---|---|---|
| ARCH-20260817-01 | `ADR-20260817-01-arquitectura-y-stack.md` | accepted | Arquitectura y stack fundacional |
| ARCH-20260817-02 | `ADR-20260817-02-multi-tenancy-y-aislamiento.md` | accepted | Multi-tenancy y aislamiento de datos |
| ARCH-20260817-03 | `ADR-20260817-03-secretos-y-cifrado.md` | accepted | Secretos, cifrado y credenciales sensibles |

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

---

## 6. Autorizaciones vigentes

- **Arranque técnico:** autorizado por Frank vía handoff ATLAS → INTEGRA (2026-08-17).
- **Producción de ADR/SPEC:** dentro del rol de INTEGRA, sin autorización extra.
- **Delegación a SOFIA:** vía SPEC-HANDOFF cuando una SPEC esté `READY` y cumpla DoR de implementación. WIP=1 por instancia SOFIA salvo paralelización justificada (§7).
- **Acciones destructivas** (commit/push/PR/deploy/rollback/delete/migración irreversible/secretos): **requieren aprobación explícita de Frank**. Ninguna todavía concedida.

---

## 7. Paralelismo

Sesgo por defecto: intentar paralelizar 2 SOFIAs si la SPEC lo permite, demostrando independencia (conjuntos de archivos disjuntos + cero imports cruzados). En caso contrario, secuencial.

En el primer pase, SPEC-001 es fundacional y **todas las demás dependen de ella** → no hay paralelismo posible hasta que SPEC-001 esté `IN_PROGRESS`/`VERIFYING` y exista infraestructura mínima (esquema base, auth, hasPermission, audit, files, jobs). A partir de SPEC-002 + SPEC-003 podría evaluarse paralelismo si los conjuntos de archivos son disjuntos.

---

## 8. Q-NB-3 (diferida, no bloqueante)

Política de desviación contra presupuesto declarado (Comercial). **No se resuelve silenciosamente.** Al producir SPEC-003 Comercial, si la SPEC requiere automatizar advertencia/bloqueo de cotización vs presupuesto, INTEGRA emitirá `DISCOVERY-GAP` a ATLAS/Frank con las opciones de PREGUNTAS-ABIERTAS.md §2 (advertencia 1.5× / bloqueo con Director / sin control).

---

## 9. Trazabilidad

Cadena esperada: `Necesidad (Frank) → DEC/BR/FLOW/SCN (ATLAS) → SPEC/AC (INTEGRA) → IMPL (SOFIA) → QA (GEMINI)`.

- 60 DEC-FUNCIONALES consolidados en `discovery/DECISIONES-FUNCIONALES.md`.
- 231 BR consolidados en `discovery/REGLAS-DE-NEGOCIO.md` (bloques B1-B27).
- 7 FLOW + 10 SCN-PROJ en `discovery/FLUJOS-FUNCIONALES.md` y `discovery/simulations/SIMULACION-FLUJO-PROYECTOS-20260817.md`.
- Cada criterio de aceptación de cada SPEC citará el DEC/BR/FLOW/SCN de origen.

---

## 10. Pendientes de INTEGRA (próximos pases)

1. Producir SPEC-002 (Clientes y Prospectos) — depende sólo de SPEC-001.
2. Producir SPEC-003 (Comercial) — evaluar DISCOVERY-GAP por Q-NB-3.
3. Producir ADR-04 (cuestionario/JSON), ADR-05 (PAC), ADR-06 (comisión), ADR-07 (JSON round-trip), ADR-08 (rentabilidad) al llegar a sus SPEC.
4. Cuando SPEC-001 esté `READY_FOR_VERIFYING` y SPEC-002/003 listas, evaluar paralelismo de 2 SOFIAs.

---

## 11. Convenciones de nombrado

- IDs ADR: `ARCH-YYYYMMDD-NN`, archivo `ADR-YYYYMMDD-NN-slug.md` en `context/decisions/`.
- IDs SPEC: `SPEC-YYYYMMDD-NNN`, archivo `SPEC-YYYYMMDD-NNN-slug.md` en `context/SPECs/`.
- IDs IMPL: `IMPL-YYYYMMDD-NN` (SOFIA).
- IDs FIX: `FIX-YYYYMMDD-NN` (DEBY).
- IDs QA: `QA-YYYYMMDD-NN` (GEMINI).
- IDs DOC: `DOC-YYYYMMDD-NN` (CRONISTA, transiciones PROYECTO.md).

Sin IDs duplicados ni renumerados.
