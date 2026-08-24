# DISCOVERY-GAP-20260819-01 · Q-NB-3 — Política de desviación presupuestal

- **ID:** DISCOVERY-GAP-20260819-01
- **Origen:** INTEGRA
- **Estado:** RESUELTO/CERRADO (2026-08-20) — Frank confirmó la opción (1) vía DEC-FUN-20260819-73/BR-N411: advertencia informativa, no bloqueante. Materializado en SPEC-003 v1.1 AC-12. (Estado anterior: BLOCKED — sólo el AC de control presupuestal de SPEC-003; el resto de Comercial avanzaba.)
- **Fecha:** 2026-08-19
- **SPEC/ARCH afectada:** SPEC-20260817-003 (Comercial) — criterio de aceptación pendiente de definir.
- **IDs funcionales relacionados:** Q-NB-3 (`REGLAS-DE-NEGOCIO.md` "Regla diferida no bloqueante"), H-20260817-09 (`deferred_non_blocking`), `FUNCTIONAL-BASELINE.md` v1.10 §5.4 (cotización/OS) y §10 (pendiente no bloqueante), `INDEX.md` §5.
- **Contradicción o faltante:** el baseline exige un **presupuesto declarado** en el cuestionario de sondeo, pero **no decide** qué hace el sistema cuando la cotización final excede ampliamente ese presupuesto. La simulación histórica mostró `$80,000` declarados → cotización `$209,931` sin alerta ni renegociación (H-20260817-09). Q-NB-3 permanece diferida y ATLAS/Frank no la han cerrado.
- **Por qué impide especificar:** un criterio de aceptación de control presupuestal (advertir / bloquear con Director / no automatizar) requiere decidir la política. Sin ella, INTEGRA no puede escribir un AC testeable coherente con la intención de producto.
- **Alcance del bloqueo:** **sólo** el AC de control presupuestal de SPEC-003. El resto de Comercial (cuestionario, catálogo, plantillas, spec firmado, cotización multi-línea, descuentos, aceptación con evidencia, OS atómica, SLA) **no** depende de Q-NB-3 y se especifica sin decidirla (AC-1..AC-11 de SPEC-003).
- **Opciones técnicamente viables:**
  1. **Advertencia informativa** si `cotización_total > 1.5 × presupuesto_declardo` (sin bloqueo; el Vendedor/Director ven ambos montos).
  2. **Bloqueo blando:** si `> 1.5×`, la cotización requiere aprobación del Director antes de enviarse (gate de `gestionar_descuentos` o permiso nuevo).
  3. **Sin automatización:** el sistema sólo muestra presupuesto y total lado a lado; la decisión queda fuera del sistema.
- **Consecuencias de cada opción:**
  - (1) No obstructiva; soporta la decisión sin forzarla; bajo esfuerzo.
  - (2) Agrega un gate de aprobación; puede trabar el flujo comercial en casos legítimos de scope mayor.
  - (3) Deja la decisión al criterio humano sin soporte funcional; no resuelve el hallazgo H-09.
- **Pregunta funcional mínima:** cuando la cotización excede el presupuesto declarado en el cuestionario, ¿el sistema debe sólo advertir (1), bloquear exigiendo aprobación del Director (2), o no automatizar control (3)?
- **Estado recomendado:** BLOCKED para el AC de control presupuestal; SPEC-003 en `BACKLOG` para el resto.
- **Destino:** ATLAS/Frank (devolver al entry point funcional). INTEGRA no infiere la preferencia.

---

## Cierre (2026-08-20)

- **Decisión funcional:** DEC-FUN-20260819-73 (confirmed, Frank 2026-08-19/20) + BR-N411.
- **Opción elegida:** (1) advertencia informativa si `cotización_total > 1.5 × presupuesto_declarado`, mostrando ambos montos, **sin bloquear el flujo ni exigir aprobación**.
- **Impacto:** habilita el AC-12 de SPEC-003 (advertencia presupuestal) y cierra el único bloqueo de Comercial. SPEC-003 permanece `BACKLOG` por dependencia de SPEC-001/SPEC-002, no por este GAP.
- **Artefactos actualizados por INTEGRA:** `context/SPECs/SPEC-20260817-003-comercial.md` (v1.1: AC-12 + §4.1/§4.2/§5/§6/§9/§12/§13/§14/§15), `PROYECTO.md` (§8, §5, §10, changelog) y este archivo.
- **No se implementó código ni se delegó a SOFIA.**
