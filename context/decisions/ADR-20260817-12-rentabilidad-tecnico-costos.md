# ADR-20260817-12 · Rentabilidad por técnico y costos

- **ID:** ARCH-20260817-12
- **Estado:** proposed
- **Versión:** 1.0
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-19 (v1.0)
- **Fuentes funcionales:** `discovery/DECISIONES-FUNCIONALES.md` DEC-FUN-09 (tareas horas opcionales), DEC-FUN-25 (rentabilidad por técnico), DEC-FUN-27 (transferencias no operativas); `discovery/REGLAS-DE-NEGOCIO.md` B13 (BR-N278..N282), B21 (BR-N333/N334/N335), B26.
- **Stack asumido:** ADR-20260817-01 v1.3.

---

## 1. Contexto
La rentabilidad del proyecto combina **costo laboral + costo directo contra importe vendido** (BR-N335). El registro de tiempo es opcional (DEC-FUN-09) pero, cuando existe, el costo laboral se calcula con el **costo por hora vigente al momento del registro** (snapshot, BR-N334) — no el actual. La rentabilidad se **desglosa por técnico**, no agregada (DEC-FUN-25, BR-N282). Los costos directos se imputan al proyecto sólo cuando el movimiento es un gasto confirmado o conciliado (BR-N333). Las transferencias internas y los préstamos/retiros no son operativos (BR-N326/327/328).

## 2. Opciones consideradas
### 2.1 Costo laboral
| Opción | Pros | Contras |
|---|---|---|
| **A. Snapshot de costo/hora al registrar (BR-N334)** | Histórico exacto; no recalcula con cambios de tarifa | Requiere snapshot por time_entry |
| B. Costo/hora actual al consultar | Simple | Distorsiona el histórico; contradice BR-N334 |

### 2.2 Rentabilidad
| Opción | Pros | Contras |
|---|---|---|
| **A. Desglose por técnico (DEC-FUN-25)** | Visibilidad de aporte individual | Más cálculo |
| B. Agregado por proyecto | Simple | Contradice DEC-FUN-25 |

## 3. Decisión
**A · A.**
| Dimensión | Decisión |
|---|---|
| Costo laboral | `Σ time_entries.hours × time_entry.cost_per_hour_snapshot` (BR-N278/334). Snapshot inmutable por registro. |
| Costo directo | `Σ direct_costs` cuyo `transaction` está confirmado/conciliado (BR-N279/333). |
| Costo total | `laboral + directo` (BR-N280). |
| Margen bruto vendido | `importe_vendido − costo total` (BR-N281). |
| Rentabilidad | **por técnico**: cada técnico aporta `Σ sus time_entries × snapshot` y su margen parcial (DEC-FUN-25, BR-N282). |
| No operativos | Transferencias (entrada+salida), préstamos/aportaciones, retiros de socio no entran en costo/ingreso operativo (BR-N326/327/328). |
| Precisión | Centavos enteros (bigint); redondeo consistente. |

## 4. Contratos fijados
1. Costo laboral = Σ horas × costo/hora **snapshot al registro** (inmutable).
2. Costo directo imputado sólo con movimiento confirmado/conciliado.
3. Costo total = laboral + directo; margen = vendido − costo total.
4. Rentabilidad desglosada por técnico.
5. Transferencias/préstamos/retiros no operativos.

## 5. Consecuencias
- **Positivas:** rentabilidad histórica exacta; visibilidad por técnico sin re-cálculo.
- **Negativas:** requiere snapshot por `time_entry` (campo `cost_per_hour_cents`).
- **Reversibilidad:** la fórmula es configurable (sin cambiar el snapshot).

## 6. Restricciones para SPECs
- SPEC-009 implementa `projectCost`/`projectMargin`/`profitabilityByTechnician` citando este ADR.
- SPEC-006 (`time_entries`) conserva el snapshot `cost_per_hour_cents`.
- SPEC-005/SPEC-009 coordinan el `project_id` en `direct_costs`.

## 7. Pendientes
- **P-12-1 (Frank):** tabla de costos por hora por técnico (configurable; ¿quién la edita?).

## 8. Referencias cruzadas
- Derivado de: DEC-FUN-09/25/27, B13 (BR-N278-282), B21 (BR-N333-335).
- Relacionado: ADR-01, ADR-05 (visibilidad costos), SPEC-006 (time_entries snapshot), SPEC-009.
- Aplica a: SPEC-009 (Finanzas).
