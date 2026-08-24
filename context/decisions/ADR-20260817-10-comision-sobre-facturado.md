# ADR-20260817-10 · Comisión sobre facturado y reversa

- **ID:** ARCH-20260817-10
- **Estado:** proposed
- **Versión:** 1.0
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-19 (v1.0)
- **Fuentes funcionales:** `discovery/DECISIONES-FUNCIONALES.md` DEC-FUN-16 (comisión sobre facturado), DEC-FUN-42 (1 tasa por OS), DEC-FUN-49 (confirmado, H-03 resolved); `discovery/REGLAS-DE-NEGOCIO.md` B17 (BR-N33 v2, BR-N123, BR-N297..N300), B26 (BR-N361/362/363); `discovery/HALLAZGOS.md` H-20260817-03 (resolved).
- **Stack asumido:** ADR-20260817-01 v1.3.

---

## 1. Contexto
La comisión del vendedor se libera **sobre facturado**, no sobre cobrado (DEC-FUN-49, BR-N33 v2). El JSON archive la calculaba sobre cobrado (H-03); Frank ratificó la fórmula sobre facturado. Una OS tiene **una sola tasa** de comisión (DEC-FUN-42, BR-N241/298). La comisión estimada nace al aceptar la cotización si `rate>0` (BR-N297); se libera al facturar (proporcional al facturado no cancelado, tope en la estimada, BR-N362); al cancelar una factura se reversa la proporción (BR-N123).

## 2. Opciones consideradas
### 2.1 Base de liberación
| Opción | Pros | Contras |
|---|---|---|
| **A. Sobre facturado (BR-N33 v2, DEC-FUN-49)** | Alinea con el flujo de ingresos; libera al facturar | Requiere reversa al cancelar factura |
| B. Sobre cobrado (JSON archive) | Espera al pago | Contradice DEC-FUN-49 (H-03 resolved en contra) |
| C. Configurable por OS | Flexible | Complejidad innecesaria |

### 2.2 Tasa
| Opción | Pros | Contras |
|---|---|---|
| **A. 1 tasa por OS (DEC-FUN-42)** | Simple, trazable | No permite tasas por ítem |
| B. Tasa por ítem de cotización | Granular | Complejidad; contradice DEC-FUN-42 |

## 3. Decisión
**A · A.**
| Dimensión | Decisión |
|---|---|
| Base | **Facturado** (no cobrado). `facturado = Σ(facturas no canceladas de la OS)` (BR-N363). |
| Tasa | 1 sola por OS (`commission_rate` en la cotización, BR-N241/298). |
| Estimada | `estimada = total_OS × rate / 100` (BR-N361); nace al aceptar cotización si `rate>0` (BR-N297). |
| Liberada | `liberada = estimada × facturado_no_cancelado / total_OS`, **tope = estimada** (BR-N362). Se actualiza al timbrar factura (SPEC-007). |
| Reversa | Al cancelar factura, `facturado` baja y `liberada` se recalcula (reversa proporcional, BR-N123). La comisión nunca excede la estimada. |
| Pago | Director/Admin marcan `pagada` (default día 15, BR-N299). |
| Estados | `estimada → devengada → liberada → pagada` (+ `cancelada`, BR-N300). |
| Precisión | Cálculo en centavos enteros (bigint); redondeo consistente documentado. |

## 4. Contratos fijados
1. Comisión sobre facturado (no cobrado); fórmula BR-N362 con tope estimada.
2. 1 tasa / 1 comisión por OS.
3. Reversa proporcional al cancelar factura (BR-N123).
4. Estados canónicos `estimada→devengada→liberada→pagada` (+`cancelada`).
5. Acciones (`comision.pay`) auditadas con `actor_role_code`.

## 5. Consecuencias
- **Positivas:** alineación con el flujo de ingresos; el cierre administrativo (saldo cero) no exige esperar cobro para liberar comisión.
- **Negativas:** una cancelación de factura recalcula la liberada (debe ser idempotente y determinista).
- **Reversibilidad:** la fórmula es configurable (tasa por OS) sin cambiar el algoritmo.

## 6. Restricciones para SPECs
- SPEC-008 implementa `commissions.release`/`reverseOnCancel`/`pay` citando este ADR.
- SPEC-007 emite la señal de timbrado/cancelación que dispara la liberación/reversa.
- SPEC-009 usa la comisión pagada en rentabilidad.

## 7. Pendientes
- **P-10-1 (Frank):** none (fórmula cerrada).

## 8. Referencias cruzadas
- Derivado de: DEC-FUN-16/42/49, B17, B26 (BR-N361/362/363), H-03.
- Relacionado: ADR-01, ADR-07 (jobs día 15), ADR-05 (visibilidad comisiones).
- Aplica a: SPEC-008 (Cobranza/Comisiones), SPEC-007 (señal), SPEC-009 (rentabilidad).
