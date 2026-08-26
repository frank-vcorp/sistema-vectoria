# ADR-20260825-01 · Integración Facturapi para CFDI

- **ID:** ARCH-20260825-01
- **Estado:** active
- **Versión:** 1.0
- **Propietario:** ATLAS
- **Fecha:** 2026-08-25
- **Fuentes:** `DEC-FUN-20260825-01`, `FND-20260825-01`, documentación oficial Facturapi y probe Test HTTP 200.

## Decisión

Usar Facturapi como proveedor externo mediante un adaptador HTTP out en `src/server/integrations/pac/`, sin mover reglas de negocio fuera de `src/server/services/facturacion/`.

- Base URL: `https://www.facturapi.io/v2`.
- Autenticación: `Authorization: Bearer <secret>`; `sk_test_*` selecciona Test y no produce CFDI fiscal ante SAT.
- Operaciones mínimas: crear/actualizar cliente fiscal, crear factura, consultar factura, timbrar borrador, descargar XML/PDF/ZIP y cancelar con motivo SAT.
- Flujo: crear con `status=draft`, consultar `is_ready_to_stamp`, y timbrar sólo cuando sea `true`.
- Persistencia: conservar `cfdi_uuid`, XML, PDF, estado interno y auditoría; nunca registrar la llave.
- Idempotencia: usar `external_id`/`idempotency_key` derivados del invoice interno y evitar duplicados internos.
- Test/staging: usar la Test Secret Key proporcionada; Live requiere autorización separada.

## Contratos protegidos

`PacClient`, `invoices.timbrar`, `invoices.cancel`, estados internos, `files`, `audit_logs`, permisos `timbrar_facturas` y la regla de no cobrar/cerrar antes de factura emitida.

## Criterios verificables

1. Probe Test autenticado sin mutación devuelve HTTP 200.
2. Factura borrador interna crea o reutiliza recurso Facturapi Test mediante idempotencia.
3. Timbrado Test conserva UUID/XML/PDF y actualiza la factura interna a `emitida`.
4. Errores externos no filtran secretos ni dejan mutaciones parciales.
5. Cancelación Test exige motivo SAT válido y conserva evidencia.
6. Playwright desktop/mobile valida preview, timbrado Test, descarga y ausencia de duplicados.

## Riesgos y rollback

- La Test Secret Key sólo produce datos Test; no tienen validez fiscal.
- Si el contrato requiere campos adicionales, se ajusta sólo el adaptador y payload.
- Producción permanece bloqueada hasta recibir Live Secret Key y autorización explícita.
