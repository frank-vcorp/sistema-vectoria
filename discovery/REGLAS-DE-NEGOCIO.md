# REGLAS-DE-NEGOCIO · Vector IA

**Versión:** 2026-08-17
**Convención:** `BR-###` (regla original estable) y `BR-N###` (regla ratificada en sesiones posteriores). Mismas IDs del repositorio, sin renumerar.

> **AVISO IMPORTANTE (actualizado 2026-08-17 22:00):** el documento `DECISIONES-V1-20260815.md` referenciado en versiones previas **no existe en el repositorio** (HALLAZGOS H-20260817-06). Frank aprobó reconstruir las 150+ reglas restantes en sesión dedicada de discovery con ATLAS (DEC-FUN-20260817-52). Mientras tanto, esta lista de **31 reglas con ID localizable** es el **único conjunto de reglas firme** para handoff a INTEGRA.

> **Vocabulario de estados de módulo (DEC-FUN-20260817-47):** vocabulario único vigente — `pending → in_progress → testing → deployed` (+ laterales `paused`, `blocked`, `cancelled`). Salud: `on_track / at_risk / delayed`. BR-N113 y BR-N114 usan este vocabulario.

---

## Reglas con ID confirmado

| ID | Regla | Evidencia |
|---|---|---|
| BR-005 | Requerimiento sin criterio de aceptación no pasa a `development` | FUNCTIONAL-BASELINE §16 |
| BR-006 | Tarea bloqueada requiere motivo obligatorio | FUNCTIONAL-BASELINE §16 |
| BR-007 | Tarea `done` requiere checklist completo | FUNCTIONAL-BASELINE §16 |
| BR-008 | Horas ≤ 24/día + snapshot de costo/hora al registrar | FUNCTIONAL-BASELINE §16 |
| BR-009 | Test `failed` requiere resultado + incidencia | FUNCTIONAL-BASELINE §16 |
| BR-010 | Entregable `accepted` requiere nombre del aceptante + fecha | FUNCTIONAL-BASELINE §16 |
| BR-011 | Cambio de alcance no se implementa sin `authorized` | FUNCTIONAL-BASELINE §16 |
| BR-013 | Movimiento financiero `reconciled` no se edita (corrección por reverso) | FUNCTIONAL-BASELINE §16 |
| BR-014 | Cancelar/revertir exige motivo y queda en auditoría | FUNCTIONAL-BASELINE §16 |
| BR-016 | Aislamiento por organización (todas las entidades con `organization_id`) | FUNCTIONAL-BASELINE §16 |
| BR-017 | OC del cliente validada antes de autorizar OS (coincide con `sold_total` ±0) | FUNCTIONAL-BASELINE §11, §16 |
| BR-N01 | Cotización sin vigencia vigente no se acepta | FUNCTIONAL-BASELINE §16 |
| BR-N02 | Cotización aceptada es inmutable | FUNCTIONAL-BASELINE §16 |
| BR-N03 | 1 cotización → 1 OS → 1 proyecto (MVP) | FUNCTIONAL-BASELINE §16 |
| BR-N04 | Técnico no modifica alcance, precios ni comisiones | FUNCTIONAL-BASELINE §16 |
| BR-N25 | 1 cotización aceptada por prospecto | FUNCTIONAL-BASELINE §16, táctica 46 |
| BR-N33 v2 | **Comisiones sobre FACTURADO, no sobre COBRADO** (`liberada = estimada × Σ(facturas NO canceladas) / total_OS`) | FUNCTIONAL-BASELINE §10, §16 |
| BR-N51 | Cotización requiere spec firmado | FUNCTIONAL-BASELINE §16 |
| BR-N52 | Spec firmado es inmutable | FUNCTIONAL-BASELINE §16 |
| BR-N113 | Módulo `deployed` requiere 4 checks (reqs validados, actividades con evidencia, tests passing, entregables aceptados) | FUNCTIONAL-BASELINE §16. ✅ Vocabulario unificado DEC-FUN-20260817-47. |
| BR-N114 | Módulo `in_progress` requiere que sus `depends_on_modules` estén `deployed` | FUNCTIONAL-BASELINE §16. ✅ Vocabulario unificado DEC-FUN-20260817-47. |
| BR-N121 | Suscripción requiere cobro inicial antes de autorizar proyecto | FUNCTIONAL-BASELINE §9.4, §16 |
| BR-N123 | Comisiones se reversan si la factura se cancela | FUNCTIONAL-BASELINE §10.2, §16 |
| BR-N127 | Roles seed no se eliminan | FUNCTIONAL-BASELINE §16 |
| BR-N128 | Director puede crear roles custom | FUNCTIONAL-BASELINE §16 |
| BR-N131 | Permisos custom son aditivos (nunca quitan) | FUNCTIONAL-BASELINE §13, §16 |
| BR-N143 | Descuento en cotización: ≤10% libre · 10-25% con director · >25% bloqueado | FUNCTIONAL-BASELINE §16 |
| BR-N147 | Respaldo BD diario, retenido 30 días | FUNCTIONAL-BASELINE §16 |
| BR-N148 | Prospecto `qualified` requiere cuestionario completado | FUNCTIONAL-BASELINE §16 |
| BR-N149 | Cotización requiere `cuestionario_sondeo_id` vinculado | FUNCTIONAL-BASELINE §16 |
| BR-N168 | Cliente se crea desde prospecto cuando cumple condiciones | FUNCTIONAL-BASELINE §16 |

---

## Reglas referenciadas sin ID estable (de próxima captura)

Cuando Frank apruebe reconstruir el archivo `DECISIONES-V1-20260815.md` faltante, las siguientes reglas se numerarán con nuevos IDs (BR-N###). Mientras tanto, se documentan aquí por nombre:

- `R-aceptacion-cliente-via-proxy-PL` — cuándo un PL puede registrar la aceptación en nombre del cliente y qué evidencia se exige (PF-7, ver HALLAZGOS H-20260817-08).
- `R-desviacion-presupuestal` — alerta o bloqueo cuando la cotización excede el presupuesto declarado en el cuestionario (PF-6, H-20260817-09).
- `R-asignacion-programador` — quién y cuándo asigna programadores a un módulo/proyecto (PF-1, H-20260817-10).
- `R-cierre-tecnico-vs-administrativo` — separar el cierre técnico del proyecto del cierre administrativo de la OS (H-20260817-14).
- `R-mapeo-catalogo-plantilla` — cómo el sistema mapea un servicio del catálogo a una plantilla (`web_sitio`/`web_app`/`web_saas`) (H-20260817-07).

---

## Cálculos de negocio

| Concepto | Fórmula |
|---|---|
| Línea de cotización | `line_total = quantity × unit_price` |
| Subtotal | `Σ(line_total) - discount` |
| IVA | `subtotal × tax_rate / 100` |
| Total | `subtotal + tax` |
| Comisión estimada | `base_amount × rate / 100` |
| Comisión liberada (BR-N33 v2) | `estimada × Σ(facturas NO canceladas) / total_OS` |
| Horas reales del proyecto | `Σ(time_entries.hours where project_id = project.id)` |
| Costo laboral del proyecto | `Σ(time_entries.total_cost where project_id = project.id)` |
| Costo directo del proyecto | `Σ(financial_transactions.amount where type='expense' and project_id = project.id and status in ('confirmed','reconciled'))` |
| Costo total | `laboral + directo` |
| Margen bruto vendido | `work_order.sold_subtotal - project_total_cost` |
| % margen vendido | `if work_order.sold_subtotal > 0 then sold_margin / sold_subtotal × 100 else 0` |
| Facturado | `Σ(facturas NO canceladas.total for work_order)` |
| Cobrado | `Σ(payment_allocations confirmadas para facturas de la work_order)` |
| Saldo factura | `invoice.total - Σ(payment_allocations confirmadas)` |
| Saldo cuenta | `opening_balance + inflows confirmados - outflows confirmados` |
| Avance del proyecto | `Σ(weight tareas done) / Σ(weight todas las tareas no canceladas) × 100`; 0 si no hay tareas |
| Salud del proyecto | delayed / at_risk / on_track por defecto; PL puede override con razón |

> **Nota:** la simulación del 17-ago arrastró cálculos incorrectos (mezcló costo-hora cotizado con snapshot interno; re-aplicó el % de comisión al liberarla). Estos son hallazgos P2 — ver HALLAZGOS H-20260817-11. Las reglas formales de cálculo son las de esta sección.
