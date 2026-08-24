# ADR-20260817-13 · Suscripciones — contratos cross-module (creación desde OS + renovación→factura borrador)

- **ID:** ARCH-20260817-13
- **Estado:** proposed
- **Versión:** 1.0
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-19 (v1.0)
- **Fuentes funcionales:** `discovery/DECISIONES-FUNCIONALES.md` DEC-FUN-20260818-66 (creación desde OS), DEC-FUN-20260818-67 (renovación→factura borrador), DEC-FUN-20260818-68 (toda oferta crea Proyecto); `discovery/REGLAS-DE-NEGOCIO.md` B20a (BR-N405, BR-N406, BR-N407), B8 (BR-N246); `discovery/FLUJOS-FUNCIONALES.md` §14; `PROYECTO.md` §5.2/§5.3.
- **Stack asumido:** ADR-20260817-01 v1.3.

---

## 1. Contexto
La Suscripción es una **entidad propia** creada automáticamente al autorizar una OS cuyo `tipo_cobro='suscripción'` (DEC-FUN-66, BR-N405), conservando cliente/cotización/OS. La **misma transición** OS→`authorized_to_start` dispara dos side-effects: `project_creation` (universal, SPEC-005) y `subscription_creation` (condicional, SPEC-011). Renovar una Suscripción crea una **factura en borrador** del nuevo periodo (DEC-FUN-67, BR-N406); Facturación conserva revisión/timbrado/emisión; Suscripciones no emite CFDI ni registra cobros. Este ADR fija los **contratos cross-module** que la decisión funcional no resuelve: atomicidad, rollback, propiedad de la factura borrador, coordinación y frontera de módulo.

## 2. Opciones consideradas
### 2.1 Disparador de `subscription_creation`
| Opción | Pros | Contras |
|---|---|---|
| **A. Mismo evento `authorized_to_start` que `project_creation`; SPEC-011 consume `os.tipo_cobro`** | Un solo disparador; paralelo; sin acoplamiento inverso | Coordinación transaccional |
| B. SPEC-004 invoca a Suscripciones | Simple aparente | Acoplamiento inverso (SPEC-004 importa SPEC-011); viola §5.2 |
| C. Alta manual de Suscripción | Simple | Prohíbe DEC-FUN-66 (creación automática) |

### 2.2 Renovación → factura
| Opción | Pros | Contras |
|---|---|---|
| **A. Suscripciones pide a Facturación crear la factura borrador; Facturación timbra tras revisión** | Frontera clara; Suscripciones no emite CFDI | Coordinación cross-module |
| B. Suscripciones timbra directo | Autónomo | Prohíbe BR-N406 (Facturación conserva timbrado) |
| C. Suscripciones sólo consulta facturas existentes | Sin escritura | Prohíbe DEC-FUN-67 (renovar crea borrador) |

## 3. Decisión
**A · A.**
| Dimensión | Decisión |
|---|---|
| Disparador | La transición OS→`authorized_to_start` (propiedad de SPEC-004) es el **único disparador**. SPEC-004 **produce** la transición y **expone** `os.tipo_cobro`, `os.cliente_id`, `os.cotizacion_id`, `os.id`. SPEC-011 **posee** `subscription_creation` y **consume** esos campos. SPEC-004 no importa ni invoca a Suscripciones (simétrico a como expone `os.pl_user_id` consumido por SPEC-005). |
| Condicionalidad | `subscription_creation` corre **sólo si** `os.tipo_cobro='suscripción'`. `project_creation` corre **siempre** (universal, BR-N407). Ambos son side-effects de la misma transición; **paralelos**, no secuenciales. |
| Atomicidad | `project_creation` y `subscription_creation` son **independientes entre sí** (conjuntos de tablas disjuntos: `projects`/`project_members` vs `subscriptions`/`subscription_periods`). Ambos deben completarse para que la OS quede en `authorized_to_start`; si **cualquiera** falla, rollback de toda la transición coordinada y la OS **no** pasa a `authorized_to_start`. |
| Rollback | Compensación: si `subscription_creation` falla tras `project_creation` OK (o viceversa), se revierte la transacción completa; no queda estado parcial. La coordinación la orquesta el servicio de transición (decisión reversible de SOFIA dentro de este contrato: transacción DB única o saga con compensación). |
| Propiedad de la factura borrador | Al `renovar`, SPEC-011 pide a SPEC-007 `invoices.createDraftFromSubscriptionRenewal(subscriptionId, period)`; la factura nace en `borrador` y la **posee** Facturación (tabla `invoices`, FK `subscription_id`). SPEC-011 sólo referencia el `invoice_id` en `subscription_periods`. |
| Revisión/timbrado | Facturación **conserva** revisión, timbrado y emisión (DEC-FUN-67, BR-N406). Suscripciones **no** llama `invoices.timbrar`. La decisión de timbrar la toma Facturación. |
| Idempotencia | Renovar el mismo periodo dos veces no duplica la factura borrador (idempotencia por `subscription_id + period`, AC-33 SPEC-001). |
| Frontera | Suscripciones **no** emite CFDI ni registra cobros. Consulta facturación/cobranza relacionadas (lectura). Cobranza conserva pagos/vencimientos (BR-N399/401). |
| Auditoría | `subscription.create` (vía `subscription_creation`) y `subscription.{renovar|pausar|cancelar|reactivar}` en `audit_logs` con `actor_role_code` (BR-N336). |

## 4. Contratos fijados
1. Un solo disparador (`authorized_to_start`); SPEC-004 produce/expone; SPEC-011 consume; sin acoplamiento inverso.
2. `subscription_creation` condicional (`tipo_cobro='suscripción'`); `project_creation` universal; paralelos.
3. Atomicidad: ambos side-effects o ninguno; rollback total; la OS no queda `authorized_to_start` si falla.
4. Renovación → factura borrador poseída por Facturación; Suscripciones no timbra.
5. Idempotencia de renovación por periodo.
6. Frontera: Suscripciones no emite CFDI ni registra cobros.

## 5. Consecuencias
- **Positivas:** un solo disparador; fronteras claras; trazabilidad desde la OS; la factura borrador no se emite sin revisión.
- **Negativas:** coordinación transaccional de dos workflows en una transición (mitigación: tablas disjuntas + rollback).
- **Reversibilidad:** la coordinación (transacción única vs saga) es decisión interna reversible de SOFIA; el contrato (atomicidad, frontera) es fijo.

## 6. Restricciones para SPECs
- SPEC-011 cita este ADR para `subscription_creation` y `renovar`.
- SPEC-004 expone `os.tipo_cobro`/`cliente_id`/`cotizacion_id` y produce `authorized_to_start`; no invoca a SPEC-011.
- SPEC-007 implementa `invoices.createDraftFromSubscriptionRenewal` y conserva el timbrado.

## 7. Pendientes
- **P-13-1 (SPEC-011/SOFIA):** mecanismo de coordinación transaccional (transacción DB única o saga con compensación) — decisión interna reversible dentro del contrato de atomicidad de este ADR.

## 8. Referencias cruzadas
- Derivado de: DEC-FUN-66/67/68, B20a (BR-N405/406/407), B8 (BR-N246).
- Relacionado: ADR-01 (hexagonal), ADR-07 (jobs/idempotencia), ADR-05 (visibilidad), SPEC-004/005/007/008/011.
- Aplica a: SPEC-011 (Suscripciones) y coordina con SPEC-004/005/007.
