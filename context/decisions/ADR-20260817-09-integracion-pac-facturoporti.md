# ADR-20260817-09 · Integración PAC FacturoPorTi

- **ID:** ARCH-20260817-09
- **Estado:** superseded (2026-08-25; proveedor reemplazado por Facturapi)
- **Versión:** 1.0
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-19 (v1.0)
- **Fuentes funcionales:** `discovery/DECISIONES-FUNCIONALES.md` DEC-FUN-10/50 (timbrado real FacturoPorTi); `discovery/REGLAS-DE-NEGOCIO.md` B18 (BR-N301..N305); `discovery/HALLAZGOS.md` H-20260817-04 (resolved); ADR-20260817-03 (CSD cifrado), ADR-20260817-07 (reintentos/DLQ), ADR-01 §10.2 (adaptador de integración out).
- **Stack asumido:** ADR-20260817-01 v1.3.

---

## 1. Contexto
Vector IA es cliente real de FacturoPorTi. DEC-FUN-50 ratificó el timbrado CFDI 4.0 real (no registro de facturas externas). El sistema arma el comprobante, lo envía al PAC, conserva UUID/XML/PDF y soporta cancelación con motivo SAT (01-04). El CSD (.cer/.pem/password) y la API key del PAC son secretos que viven cifrados en BD (ADR-03). El cliente PAC es un **adaptador de integración out** (hexagonal): traduce protocolo, sin reglas de negocio.

## 2. Opciones consideradas
### 2.1 Forma de integración
| Opción | Pros | Contras |
|---|---|---|
| **A. Cliente HTTP propio al PAC (adaptador out)** | Control total, tipado, reintentos via pg-boss | Mantener cliente |
| B. SDK cerrado del PAC | Menos código | Acoplamiento, opaco, posible abandono |
| C. Registro manual de CFDI externo | Simple | Prohíbe DEC-FUN-50 (timbrado real) |

### 2.2 Manejo de CSD
| Opción | Pros | Contras |
|---|---|---|
| **A. CSD cifrado en BD (ADR-03); el PAC recibe el comprobante armado** | No expone CSD al cliente; reutiliza crypto | El PAC exige CSD propio o modo integrado |
| B. CSD en filesystem del servidor | Simple | Mayor superficie de fuga; no reutiliza crypto |

## 3. Decisión
**A · A.**
| Dimensión | Decisión |
|---|---|
| Adaptador | Cliente HTTP propio (`src/server/integrations/pac/*`) que: arma el JSON CFDI 4.0, valida campos, envía al PAC FacturoPorTi, recibe UUID+XML+PDF, los guarda en `files`. **Sin reglas de negocio** (hexagonal AC-27 SPEC-001). |
| CSD/API key | Cifrados AES-256-GCM en `organization_fiscal_config` (SPEC-001/ADR-03); el adaptador los descifra sólo al timbrar; nunca en logs. |
| Timbrado | `invoices.timbrar` → adaptador envía → guarda UUID/XML/PDF → `status='emitida'`. |
| Cancelación | `invoices.cancel` → adaptador envía cancelación con motivo SAT 01-04 al PAC; exige reversar aplicaciones de cobro antes (BR-N309). |
| Reintentos | Errores transitorios del PAC (5xx/timeout) → reintentos/backoff/DLQ (ADR-07); job_key idempotente. |
| Webhooks | Route Handler receptor del estado del PAC (si el PAC notifica asíncrono); pertenece a la web interna, no contrato público (ADR-01 §10.4). |
| Preview | El servicio arma el comprobante y lo muestra al usuario antes de confirmar el timbrado (BR-N303). |

## 4. Contratos fijados
1. Cliente PAC = adaptador out, sin reglas de negocio; el servicio `invoices.timbrar` orquesta.
2. CSD/API key cifrados (ADR-03); descifrado sólo al timbrar/cancelar; auditado sin valor.
3. UUID/XML/PDF conservados tras timbrar (BR-N304).
4. Cancelación exige motivo SAT 01-04 + aplicaciones reversadas (BR-N305/309).
5. Reintentos/DLQ para transitorios del PAC (ADR-07).

## 5. Consecuencias
- **Positivas:** control total del CFDI; trazabilidad; reutiliza crypto de plataforma.
- **Negativas:** dependencia de disponibilidad/latencia del PAC; mantener el cliente ante cambios de API del PAC.
- **Reversibilidad:** el adaptador PAC es reemplazable sin tocar el servicio (frontera hexagonal).

## 6. Restricciones para SPECs
- SPEC-007 implementa el adaptador y cita este ADR; el servicio `invoices.timbrar`/`cancel` viven en `src/server/services/facturacion`.
- Toda SPEC que toque CFDI cita ADR-03 (crypto) y este ADR.

## 7. Pendientes
- **P-09-1 (Frank):** credenciales PAC reales (API key) + CSD (.cer/.pem/password) vigentes (acciones infraestructurales, fuera de SPEC).
- **P-09-2 (SPEC-007/SOFIA):** contrato exacto de la API de FacturoPorTi (endpoints, payloads) — decisión interna reversible de SOFIA dentro de este ADR.

## 8. Referencias cruzadas
- Derivado de: DEC-FUN-10/50, B18, H-20260817-04.
- Relacionado: ADR-20260817-03 (CSD cifrado), ADR-20260817-07 (reintentos/DLQ), ADR-01 §10.2 (adaptador out).
- Aplica a: SPEC-007 (Facturación).

> Esta ADR se conserva como antecedente histórico. El proveedor activo y el contrato HTTP vigente están en `ADR-20260825-01-integracion-facturapi.md`.
