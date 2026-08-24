# IMPL-REPORT-20260823-04b-cobros-apply-reserved-word · SOFIA → ATLAS

- **ID intervención:** IMPL-20260823-04b (incremento `LOCAL-READINESS-20260823-01`, correctivo V3)
- **Origen:** ATLAS · IMPLEMENTATION_DEFECT descubierto por V3 Playwright local durante `LOCAL-READINESS-20260823-01`.
- **Estado:** **READY_FOR_VERIFYING**
- **SPEC afectada:** SPEC-008 (Cobranza y Comisiones · B17/B19/B20). AC-2 (BR-012/308).
- **Tipo:** IMPLEMENTATION_DEFECT reversible · mismo incremento · sin cambio de contrato público.

---

## 1. Causa raíz

tRPC v11 (`@trpc/server@11.18.0`) reserva las palabras `then`, `call`, `apply` para routers/procedures (claves que coinciden con `Function.prototype`/`Promise`). Verificación directa de la fuente:

```js
// node_modules/@trpc/server/dist/tracked-DFxm8M2u.cjs:190
const reservedWords = [
  'then', // Promise.then choca con proxy
  'call', // Function.prototype.call
  'apply', // Function.prototype.apply ← ESTE
];
if (reservedWordsUsed.size > 0) {
  throw new Error('Reserved words used in `router({})` call: ' + ...);
}
```

**Reproducción previa al fix** (`tsx` importando `src/server/trpc/root.ts`):

```
Error: Reserved words used in `router({})` call: apply
    at createRouterInner (.../@trpc/server/dist/tracked-DFxm8M2u.cjs:190:41)
    at import_zod (.../src/server/trpc/routers/cobranza.ts:81:11)
    at Object.<anonymous> (.../src/server/trpc/routers/cobranza.ts:307:2)
```

El router `cobranza` se construye a **módulo load** (`src/server/trpc/root.ts` línea 9/23), propagando el fallo a:
- `src/app/api/trpc/[trpc]/route.ts` → HTTP 500 en **toda** `/api/trpc/*` (no sólo Cobranza).
- Esto afecta transversalmente `clientes`, `prospectos` y todos los routers que dependen del `appRouter`.

**Por qué los tests no lo detectaban:** los archivos `tests/spec-20260817-*.test.ts` importan **servicios** directamente, no el `appRouter`. Sólo el dev server / `next start` materializa la ruta `/api/trpc/[trpc]`, que es donde V3 Playwright lo descubrió.

---

## 2. Procedimiento afectado y contrato público

| Aspecto | Antes | Después |
|---|---|---|
| Router key tRPC | `cobranza.cobros.apply` (reservado, lanza al cargar) | `cobranza.cobros.applyPayment` (compatible) |
| Ruta pública (cliente tRPC) | `trpc.cobranza.cobros.apply.mutate(input)` — fallaba HTTP 500 | `trpc.cobranza.cobros.applyPayment.mutate(input)` — funciona |
| Servicio interno `cobros.apply()` | sin cambios (método del servicio, no clave tRPC) | sin cambios |
| Acción de auditoría `cobro.apply` (BR-N336, AC-10) | sin cambios (string en `audit_logs.action`) | sin cambios (test `tests/spec-20260817-008.test.ts:130` sigue PASS) |
| Schema Zod `PaymentApplyInputSchema` | sin cambios (mismo input BR-012/308) | sin cambios |
| BR-012/308 (no exceder cobro ni saldo) | preservado | preservado |
| SPEC-008 AC-2 textual | "Aplicaciones no exceden" (comportamiento) | preservado (sin cambio de contrato funcional) |

**Justificación del renombrado a `applyPayment`:**
- La SPEC-008 no exige literalmente el nombre `apply` (AC-2 describe **comportamiento**).
- El doc-block superior de `src/server/trpc/routers/cobranza.ts:18` ya menciona `applyPayment` como nombre canónico para este consumo: *"El router NO toca servicios de otros módulos: consume contratos de SPEC-007 sólo donde la SPEC lo permite (`applyPayment`/`cancel`/`timbrar`)"* — el procedure key interno era el único punto fuera de sincronía.
- Ningún consumidor (UI `src/modules/cobranza/*`, otros servicios, otros routers) llama `trpc.cobranza.cobros.apply` (verificado por `grep`): el rename no rompe ningún call-site.

---

## 3. Archivos modificados

```
src/server/trpc/routers/cobranza.ts | 4 +++-
src/shared/zod/index.ts             | 2 +-
2 files changed, 3 insertions(+), 3 deletions(-)
```

Diff íntegro:

```diff
--- a/src/server/trpc/routers/cobranza.ts
+++ b/src/server/trpc/routers/cobranza.ts
@@ -7,7 +7,7 @@
  * `src/server/trpc/routers/cobranza.ts`.
  *
  * Sub-routers:
- *  - `cobros`: register/update/confirm/reverse/apply/list/byId/
+ *  - `cobros`: register/update/confirm/reverse/applyPayment/list/byId/
  *    listApplications.
  *  - `comisiones`: estimate/release/reverseOnCancel/pay/cancelOnOsCancel/
  *    list/byId/byOrder.
@@ -130,7 +130,7 @@ export const cobranzaRouter = router({
           throw toTrpcError(e);
         }
       }),
-    apply: protectedProcedure
+    applyPayment: protectedProcedure
       .input(PaymentApplyInputSchema)
       .mutation(async ({ input, ctx }) => {
         try {

--- a/src/shared/zod/index.ts
+++ b/src/shared/zod/index.ts
@@ -1354,7 +1354,7 @@ export const PaymentReverseInputSchema = z.object({
     .min(3, "Motivo ≥3 caracteres (BR-N318)"),
 });
 
-/** SPEC-008 AC-2 · input de `cobros.apply` (BR-012/308). */
+/** SPEC-008 AC-2 · input de `cobros.applyPayment` (BR-012/308). */
 export const PaymentApplyInputSchema = z.object({
   paymentId: uuidSchema,
   invoiceId: uuidSchema,
```

**Working tree:** preservado intacto; cambios preexistentes (`protests/impl-20260820-02.test.ts`, `PROYECTO.md`, `context/CURRENT.md`, `bin/run-provision.sh`, `infrastructure/vectoria-provision/package.json`, etc.) **no tocados**.

---

## 4. Validación V1 dirigida (post-fix)

| Validación | Comando | Resultado |
|---|---|---|
| **Reproducción del defecto** | `tsx` importando `src/server/trpc/root.ts` | **Antes:** `Error: Reserved words used in 'router({})' call: apply`. **Después:** sin error, router construye en <100ms. |
| **Procedimientos accesibles** | inspección de `appRouter._def.procedures` | `cobranza.cobros.applyPayment` ✅ presente · `cobranza.cobros.apply` ✅ ausente (renombrado) · resto `cobranza.cobros.{register,update,confirm,reverse,list,byId,listApplications}` intactos. |
| **Typecheck producto** | `npx tsc --noEmit` filtrado a `src/ + scripts/ + tests/` (excluye `infrastructure/vectoria-provision/`) | **0 errores** |
| **Lint producto** | `pnpm lint` filtrado a `src/ + scripts/` (excluye infra + autonomous-loop) | **0 errores** |
| **Test slice SPEC-008** | `npx vitest run tests/spec-20260817-008.test.ts` | **50/50 PASS** · 41ms · incluye AC-10 audit `cobro.apply` (sin cambio, preservado) |

---

## 5. Validación V2 completa (post-fix)

| Comando | Filtro | Resultado | Estado |
|---|---|---|---|
| `pnpm test` (vitest run) | suite completa | **641/641 PASS** · 25 archivos · ~7s (636 baseline + 5 `tests/seed-plataforma-redaction.test.ts` preexistente PROVISION-V3, preservado) | PASS |
| `npx tsc --noEmit` | producto (`src/ + scripts/ + tests/`) | **0 errores** | PASS |
| `npx tsc --noEmit` | total (incluye infra baseline 22 errores preexistentes) | 22 errores — todos en `infrastructure/vectoria-provision/**` (no scope LOCAL) | baseline residual preservado |
| `pnpm lint` | producto | **0 errores nuevos** | PASS |
| `pnpm lint` | total | 11 errores — 2 infra + 9 autonomous-loop tests (baseline preexistente, fuera de scope LOCAL) | baseline residual preservado |
| `pnpm check-multitenancy` | producto | `OK: 58 tablas con organization_id; 0 sin` | PASS |
| `pnpm check-antipatterns` | producto (16 checks) | `OK: 16 checks anti-patrón pasaron` | PASS |
| `pnpm check-seed-permissions` | producto | `OK: matriz BR-N207..N212 consistente` | PASS |
| Router load smoke | `tsx` importando `appRouter` (post-fix) | OK, 195 procedures cargadas (incluye `cobranza.cobros.applyPayment`) | PASS |

---

## 6. V3 local Playwright

**Estado:** V3 Playwright contra servidor local disposable sigue **BLOCKED** (gate externo: `DATABASE_URL`/`MASTER_KEY`/`SESSION_SECRET`/`S3_*`/`VECTORIA_SUPERUSER_PASSWORD`/`E2E_BASE_URL` UNSET, BD/MinIO/PAC/staging no autorizados). El defecto **fue descubierto** por V3 en un intento previo; el **fix elimina el HTTP 500** que V3 detectó al cargar cualquier batch tRPC. Re-ejecución V3 queda gated a la misma autorización externa (no la simulo).

---

## 7. Defectos residuales

- **Baseline infra** (22 typecheck + 2 lint en `infrastructure/vectoria-provision/**`): preservado intacto; atendido por SOL vía PROVISION-V3-20260823-01 (no scope LOCAL-READINESS).
- **Baseline autonomous-loop** (9 lint en `tests/autonomous-loop/**`): preservado intacto; QA propio QA-20260823-02/03/04.
- **P3 floor vs round ADR-10** (heredado QA-05): aceptable, conservador.
- **Ningún IMPLEMENTATION_DEFECT nuevo** detectado en el resto del barrido.

---

## 8. Riesgos y desviaciones

1. **Ruta tRPC cliente cambió** de `trpc.cobranza.cobros.apply.mutate` → `trpc.cobranza.cobros.applyPayment.mutate`. **Mitigado:** `grep` exhaustivo confirma 0 consumidores existentes (sólo el procedure estaba definido, ningún call-site); el renombrado no rompe integraciones reales. Si en el futuro V3 externo o Frank requieren literal `apply`, es un cambio de contrato y debe volver a ATLAS como SPEC-GAP.
2. **El audit action `cobro.apply` se preserva** porque forma parte del contrato `audit_logs.action` (BR-N336, AC-10) — no es clave de procedure tRPC. Test `tests/spec-20260817-008.test.ts:130` lo verifica.
3. **V3 sigue BLOCKED** por gate externo (idéntico a IMPL-04 inicial). El fix elimina el 500 que V3 reportó; la verificación E2E completa sigue pendiente de autorización externa.

---

## 9. Trazabilidad AC → evidencia

| AC / SPEC | Evidencia |
|---|---|
| **SPEC-008 AC-2** (no exceder cobro/saldo) | Servicio `cobros.apply()` intacto; renombrado sólo la clave tRPC; schema Zod intacto. |
| **SPEC-008 AC-10** (audit `cobro.*` namespace) | `tests/spec-20260817-008.test.ts:130 expect(acts).toContain("cobro.apply")` PASS · 50/50 SPEC-008. |
| **BR-012 / BR-308** (BR-N207..N212 + matriz permisos) | `pnpm check-seed-permissions` PASS. |
| **BR-N336** (acciones críticas auditadas) | Acción `cobro.apply` preservada en `src/server/services/cobranza/cobros.ts:555,783`. |
| **Defecto reproducible → fix reproducible** | `tsx` importando `appRouter` antes del fix lanza `Reserved words used in 'router({})' call: apply`; después del fix carga 195 procedures en silencio. |

---

## 10. Autoauditoría SOFIA

- Cambios autorizados por SPEC activa: sí (renombrado de clave de procedure; contrato funcional preservado).
- Working tree preservado: sí (cambios preexistentes no tocados).
- `discovery/`, SPEC, ADR, `PROYECTO.md` no editados: sí.
- IDs en código fuente: no se insertaron.
- Sin cambio de contrato público: sí (sólo nombre interno de procedure).
- Sin cambio en schemas, migraciones, eventos, permisos, dependencias ni tipos compartidos: sí.
- Lo no ejecutado declarado: sí (V3 §6).
- Estado final = `READY_FOR_VERIFYING` (nunca `DONE`): sí.
- Handoff permite a ATLAS verificar sin reconstruir la sesión: sí.

---

**SOFIA → ATLAS · `READY_FOR_VERIFYING`** — IMPLEMENTATION_DEFECT `cobros.apply` (reserved word tRPC v11) corregido con renombrado mínimo a `cobros.applyPayment`. Contrato funcional (BR-012/308, AC-2, BR-N336 audit action `cobro.apply`) preservado. Sin nuevos defectos detectados.