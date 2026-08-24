# SPEC-20260817-003 · Comercial

- **ID:** SPEC-20260817-003
- **Estado:** BACKLOG (depende de SPEC-001, SPEC-002 `READY`; ✅ **DISCOVERY-GAP-20260819-01 RESUELTO** vía DEC-FUN-20260819-73/BR-N411 — AC-12 incorporado testeable en v1.1; el resto de Comercial sin cambios)
- **Versión:** 1.1
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-19 (v1.0) · 2026-08-20 (v1.1)
- **Módulo funcional cubierto:** Cuestionarios de sondeo (B4), catálogo de servicios y plantillas (B5), alcance funcional firmado (B6), cotización multi-línea (B7), aceptación con evidencia, descuentos.
- **ADRs de referencia:** ARCH-20260817-08 (cuestionario 4 capas + JSON), ARCH-20260817-11 (JSON round-trip), ARCH-20260817-01, ARCH-20260819-03 (UI).
- **Depende de:** SPEC-001 (plataforma), SPEC-002 (cliente/prospecto). Especifica también el contenido real de `db:seed:catalog` (ADR-04 §2.4).

---

## 1. Resultado
El flujo comercial: `cuestionario → alcance firmado → cotización multi-línea → aceptación con evidencia → OS`. El Vendedor sólo aplica el cuestionario; el **sistema** genera el borrador de alcance; el PL lo firma; la cotización es multi-línea con ítems auto-prellenados; la aceptación exige identidad/fecha/medio/evidencia y genera una sola OS.

## 2. Fuentes funcionales por ID
- **DEC-FUN:** DEC-FUN-05 (spec antes de cotizar), DEC-FUN-06/48 (cotización multi-línea), DEC-FUN-18 (3 versiones cuestionario), DEC-FUN-37 (sin descuentos automáticos), DEC-FUN-44 (4 capas), DEC-FUN-45 (editor visual), DEC-FUN-53 (selección plantilla), DEC-FUN-20260817-23 (regla de oro), DEC-FUN-20260817-43 (1 cotización aceptada por prospecto), DEC-FUN-20260817-31 (SLA 48h), **DEC-FUN-20260819-73** (advertencia por desviación contra presupuesto declarado — cierra Q-NB-3).
- **BR (B4-B7):** BR-N51/52, BR-N149, BR-N219..N225, BR-N226..N230, BR-N231..N233, BR-N01..N03, BR-N25, BR-N143, BR-N234..N241, **BR-N411** (advertencia si `cotización_total > 1.5 × presupuesto_declarado`, sin bloquear ni exigir aprobación).
- **Cálculo (B26):** BR-N357..N360 (total línea, subtotal, IVA, total cotización).
- **FLOW:** FLOW-COM-01.

## 3. Alcance y exclusiones
### 3.1 Incluido
- `questionnaires`, `questionnaire_questions` (4 capas, dato, 3 versiones), `catalog_services` (tipos y ciclos, BR-N227), `templates` (9 plantillas, BR-N228), `scope_documents` (alcance draft→in_review→signed), `quotes` + `quote_items` (polimórficos service|license|expense|discount), aceptación con evidencia, descuentos (≤10% libre / 10-25% Director / >25% bloqueado), SLA 48h (BR-N240), 1 cotización aceptada por prospecto (BR-N25), `presupuesto_declarado_cents` en cotización (origen: cuestionario de sondeo) y **advertencia de desviación** si `total > 1.5 × presupuesto_declarado` sin bloquear (BR-N411, DEC-FUN-20260819-73).
### 3.2 Excluido
- OS → SPEC-004. Proyecto/JSON round-trip → SPEC-005/ADR-11. ~~Política de desviación vs presupuesto (Q-NB-3)~~ → **RESUELTA** vía DEC-FUN-20260819-73/BR-N411; ver AC-12 (ya no excluida).

## 4. Modelo técnico (contrato)
### 4.1 Entidades
- `questionnaires (id, organization_id, name, status)`. `questionnaire_questions (id, questionnaire_id, layer enum(1..4), code, prompt, answer_type, required, condition jsonb, sort_order)` — dato editable (BR-N222), reutilizable por servicio (BR-N225), sub-cuestionarios condicionales (BR-N223).
- `catalog_services (id, organization_id, code, name, service_type enum('servicio_unico'|'servicio_recurrente'|'producto_unico'|'producto_recurrente'), billing_cycle enum('unico'|'mensual'|'anual'|'a_convenir'), active)` (BR-N226/227).
- `templates (id, organization_id, code, name, type, is_seed boolean)` — 9 seed (4 web + 5 otros, BR-N228); cada una con `project_modules` base (BR-N229, en SPEC-005).
- `scope_documents (id, organization_id, prospect_id, questionnaire_response_id, template_id, status enum('draft'|'in_review'|'signed'), content jsonb, signed_by, signed_at, version)` — el sistema genera `draft`; PL firma (BR-N231); `signed` inmutable (BR-N52).
- `quotes (id, organization_id, prospect_id, client_id, scope_id, status enum('draft'|'internal_review'|'sent'|'negotiation'|'accepted'|'rejected'|'expired'|'cancelled'), subtotal_cents, discount_cents, discount_pct, tax_cents, total_cents, presupuesto_declarado_cents, valid_until, accepted_at, accepted_by_proxy, accepted_evidence_file_id, version, created_at)`. 1 aceptada por prospecto (BR-N25); vigencia mínima 7 días (BR-N235); versiones, 1 aceptada (BR-N236). `presupuesto_declarado_cents` (nullable, entero en centavos MXN) copiado del cuestionario de sondeo al crear la cotización; `null`/`0` desactiva la advertencia de desviación (BR-N411).
- `quote_items (id, quote_id, kind enum('service'|'license'|'expense'|'discount'), catalog_service_id null, description, qty, unit_price_cents, discount_cents, total_cents, sort_order)` — multi-línea (BR-N234), auto-prellenados desde spec+catálogo.
- `quote_acceptance (id, quote_id, accepter_name, accepter_org, accepted_at, medium, evidence_file_id)` — identidad+fecha+medio+evidencia (BR-N237, H-08, DEC-FUN-55 proxy).

### 4.2 Servicios
- `scope.generateDraft(ctx, questionnaireResponseId)` — genera borrador desde cuestionario+catálogo+plantilla (regla de oro, BR-N220/231); NO usa IA externa.
- `scope.sign(ctx, scopeId)` — PL firma; `signed` inmutable; audita (`scope.sign`).
- `quotes.calculate(ctx, quoteId)` — BR-N357-360 (total línea, subtotal, IVA, total); descuentos (BR-N143).
- `quotes.presupuestoWarning(ctx, quoteId)` — retorna `{ warn: boolean, presupuesto_cents, total_cents }` donde `warn = (presupuesto_declarado_cents != null && presupuesto_declarado_cents > 0) && total_cents > 1.5 * presupuesto_declarado_cents` (BR-N411, DEC-FUN-20260819-73). No bloquea, no exige aprobación; sólo expone ambos montos para que la UI muestre la advertencia. `warn=false` si `presupuesto_declarado_cents` es null/0.
- `quotes.accept(ctx, quoteId, acceptance)` — valida vigencia (BR-N01), identidad/medio/evidencia (BR-N237); genera OS atómica (BR-N237/N03 — delega a SPEC-004 `orders.createFromAcceptedQuote`); audita.
- `jobs.slaCotizacion` — alerta si 48h hábiles sin respuesta (BR-N240, DEC-FUN-31).

## 5. Reglas e invariantes
1. Cotización exige spec firmado previo (BR-N51) y cuestionario vinculado (BR-N149).
2. Regla de oro: el sistema genera el spec; vendedor/IA no lo escriben (BR-N220/231, DEC-FUN-23).
3. Cotización multi-línea; ítems polimórficos (BR-N234, DEC-FUN-48).
4. Descuento: ≤10% libre, 10-25% Director, >25% bloqueado (BR-N143).
5. 1 cotización aceptada por prospecto (BR-N25); aceptada es inmutable (BR-N02); vigencia ≥7 días (BR-N235).
6. Aceptación exige identidad+fecha+medio+evidencia (BR-N237, H-08); el Vendedor registra en nombre del cliente (proxy).
7. Aceptar genera 1 sola OS atómica (BR-N237/N03).
8. Tipo de cobro `pago_unico|mensualidades|suscripcion` (BR-N238); suscripción exige pago inicial (BR-N239) antes de autorizar (SPEC-004).
9. Comisión se tasa 1 sola vez por OS (BR-N241; ver SPEC-008).
10. SLA 48h hábiles (BR-N240).
11. Advertencia (no bloqueo) si `cotización_total > 1.5 × presupuesto_declarado`; muestra ambos montos; no exige aprobación adicional (BR-N411, DEC-FUN-20260819-73).

## 6. Casos borde
- Cotizar sin spec firmado → `409 { code:'SIGNED_SCOPE_REQUIRED' }` (BR-N51).
- Descuento >25% → `409 { code:'DISCOUNT_EXCEEDS_LIMIT' }` (BR-N143); 10-25% sin Director → `403`.
- 2ª cotización aceptada para el mismo prospecto → `409 { code:'PROSPECT_HAS_ACCEPTED_QUOTE' }` (BR-N25).
- Aceptar sin vigencia vigente → `409 { code:'QUOTE_EXPIRED' }` (BR-N01).
- Aceptar sin evidencia/identidad → `409 { code:'ACCEPTANCE_EVIDENCE_REQUIRED' }` (BR-N237).
- Cotización con `total_cents > 1.5 * presupuesto_declarado_cents` → la UI muestra advertencia visible con ambos montos; **no** retorna error, **no** bloquea `quotes.accept` (BR-N411, DEC-FUN-20260819-73).

## 7. Seguridad/privacidad
- `organization_id`; RLS latente. Vendedor no ve precios internos/márgenes/CxC/comisiones ajenas (BR-N207). Evidencia comercial vía enlaces firmados (SPEC-001 AC-13). Acciones críticas (`scope.sign`, `quotes.accept`) en `audit_logs` con rol usado.

## 8. Migración/compatibilidad
- Migración del módulo + seed de catálogo/plantillas/cuestionarios (reemplaza el stub de ADR-04 §2.4). 9 plantillas seed (BR-N228), 6 cuestionarios (conteo Frank), catálogo base.

## 9. Criterios de aceptación
- **AC-1 · Cotización exige spec firmado:** cotizar sin `scope.status='signed'` → `409 SIGNED_SCOPE_REQUIRED`. (BR-N51)
- **AC-2 · Regla de oro (sistema genera spec):** `scope.generateDraft` produce `draft` desde cuestionario+catálogo+plantilla; grep anti-patrón: `rg -n "openai|anthropic|chatgpt" src/server/services/comercial/scope` → 0 (sin IA externa escribiendo spec). (BR-N220/231)
- **AC-3 · Multi-línea + cálculo:** `quote_items` con 4 kinds; `quotes.calculate` da total línea=subtotal-desc+IVA (BR-N357-360); test con ítems.
- **AC-4 · Descuentos:** ≤10% OK; 10-25% sin Director → `403`; >25% → `409 DISCOUNT_EXCEEDS_LIMIT` (BR-N143).
- **AC-5 · 1 aceptada por prospecto:** 2ª aceptación → `409 PROSPECT_HAS_ACCEPTED_QUOTE` (BR-N25).
- **AC-6 · Aceptación con evidencia + OS atómica:** aceptar con evidencia/identidad → `quotes.accepted` inmutable + 1 OS creada (BR-N237/N03); sin evidencia → `409 ACCEPTANCE_EVIDENCE_REQUIRED`.
- **AC-7 · Vigencia:** cotización sin vigencia o expirada → `409 QUOTE_EXPIRED`; vigencia mínima 7 días (BR-N01/N235).
- **AC-8 · SLA 48h:** job `slaCotizacion` crea notificación tras 48h hábiles sin respuesta (BR-N240).
- **AC-9 · Selección de plantilla:** el cuestionario exige tipo web explícito; el PL confirma antes de firmar; el sistema advierte inconsistencias sin cambiar la selección (BR-N230, DEC-FUN-53).
- **AC-10 · UI/responsive:** editor visual de cuestionarios drag&drop (DEC-FUN-45) usable en 3 viewports (AC-58 SPEC-001); cotización multi-línea editable en móvil (AC-57). (ADR-03, DEC-FUN-72)
- **AC-11 · Tipo de cobro:** `tipo_cobro` en quote; `suscripcion` marca `requires_initial_payment` (BR-N238/239; consumido por SPEC-004).
- **AC-12 · Advertencia de desviación presupuestal (DEC-FUN-20260819-73, BR-N411):** `quotes.presupuestoWarning(ctx, quoteId)` retorna `warn=true` cuando `presupuesto_declarado_cents` no es null y >0 y `total_cents > 1.5 * presupuesto_declarado_cents`; retorna `warn=false` cuando `presupuesto_declarado_cents` es null/0. **Output esperado:** con `presupuesto_declarado_cents=8000000` (80,000 MXN) y `total_cents=20993100` (209,931 MXN) → `{warn:true, presupuesto_cents:8000000, total_cents:20993100}` (reproduce el caso histórico H-20260817-09); con `total_cents=10000000` (100,000 MXN) → `{warn:false,...}`. La advertencia **no** bloquea `quotes.accept` (aceptación exitosa aunque `warn=true`) ni exige aprobación del Director. UI: al editar/ver la cotización con `warn=true` se renderiza un aviso visible con ambos montos (paridad responsive, ADR-03, AC-10).

## 10. Validaciones
- `pnpm typecheck/test/test:e2e`; grep anti-IA (AC-2); grep anti-patrón hexagonal; test AC-12 (warn true/false + `quotes.accept` no bloqueada con `warn=true`).

## 11. Rollback
- Revertir migración + seed (drop tablas B4-B7) — aprobación Frank.

## 12. Riesgos y pendientes
- **R1:** motor de generación del borrador de spec (esfuerzo; sin IA externa).
- **P-003-1 (Frank):** contenido semilla de catálogo/plantillas/cuestionarios (P-08-1).
- **✅ Q-NB-3 RESUELTO (v1.1):** DEC-FUN-20260819-73/BR-N411 → advertencia informativa, no bloqueante. Materializado en AC-12. El §14 queda como histórico resuelto.

## 13. DoD
- AC-1..AC-12 PASS; trazabilidad a BR-N51/52/143/220/234/237/240/**N411**; `db:seed:catalog` real (reemplaza stub ADR-04); GEMINI obligatorio (toca evidencia comercial, descuentos, autorización por rol → §17).

## 14. DISCOVERY-GAP-20260819-01 · Q-NB-3 (desviación presupuestal) — ✅ RESUELTO (v1.1)

**Resolución (2026-08-20):** Frank confirmó la **opción (1)** — advertencia informativa — vía **DEC-FUN-20260819-73** / **BR-N411**: si `cotización_total > 1.5 × presupuesto_declarado`, el sistema muestra una advertencia clara con ambos montos, **sin bloquear el flujo ni exigir aprobación adicional**.

- **Cierre del GAP:** `DISCOVERY-GAP-20260819-01` queda **RESUELTO/CERRADO**. El artefacto persistido en `context/discovery-gaps/DISCOVERY-GAP-20260819-01-q-nb-3-desviacion-presupuestal.md` se marca como cerrado (ver actualización en ese archivo).
- **Materialización en esta SPEC:** AC-12 (§9), invariante 11 (§5), servicio `quotes.presupuestoWarning` (§4.2), campo `quotes.presupuesto_declarado_cents` (§4.1).
- **Opciones descartadas:** (2) bloqueo blando con aprobación del Director y (3) sin automatización — **no aplican**; Frank eligió (1).
- **Historia del GAP (preservada para trazabilidad):** el baseline exigía presupuesto declarado en el cuestionario de sondeo pero no decidía la conducta del sistema ante una desviación amplia (la simulación histórica mostró $80,000 declarados → cotización $209,931 sin alerta, hallazgo H-20260817-09). INTEGRA emitió el `DISCOVERY-GAP-20260819-01` el 2026-08-19 devolviéndolo a ATLAS/Frank; ATLAS/Frank lo cerraron con DEC-FUN-20260819-73/BR-N411 el 2026-08-20.

## 15. Handoff a SOFIA (resumen)
- **SPEC activa:** SPEC-003. **ADRs:** 01, 03, 08, 11. **Alcance:** `src/server/db/comercial/*`, `src/server/services/comercial/*`, `src/server/trpc/routers/comercial/*`, `src/modules/comercial/*`, seed de catálogo/plantillas/cuestionarios. **Contratos protegidos:** regla de oro (sistema genera spec), `scope.signed` inmutable, cálculo B26. **Prohibido inferir:** ~~Q-NB-3 (DISCOVERY-GAP)~~ — RESUELTO vía DEC-FUN-20260819-73/BR-N411, implementar AC-12 (advertencia no bloqueante); el workflow de OS (SPEC-004); el JSON round-trip (ADR-11/SPEC-005).
