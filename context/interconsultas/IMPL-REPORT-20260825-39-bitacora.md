---
ID intervención: IMPL-20260825-39
ID tarea: IMPL-20260825-39
Estado: READY_FOR_VERIFYING
SPEC: SPEC-20260817-010 (Dashboard / Administración / Bitácora · B22/B23) — AC-3 (audit.list) + AC-4 (projectLog) + AC-5 (linkFile) + AC-9 (responsive).
Scope: F-14/P3 · alinear la ruta `/audit` con el contrato real (`BitacoraView` ya implementa `trpc.bitacora.audit.list`, filtros, paginación y responsive). Sin cambio de contrato backend, permisos, auditoría ni migración.
Origen handoff: ATLAS (turno continuo, post IMPL-38 + B-5 backfill)
Fecha: 2026-08-26 (turno continuo)
Implementador: SOFIA
---

# IMPL-20260825-39 · F-14/P3 · ruta `/audit` ya no muestra placeholder

## Resumen

Hallazgo F-14/P3: la ruta `/audit` (presente en
`src/modules/plataforma/layout/navigation.tsx:30` con etiqueta
`messages.nav.audit`) renderizaba siempre una tabla estática
construida por `AuditList` en
`src/modules/plataforma/auditoria/audit-list.tsx`, sin invocar
`trpc.bitacora.audit.list`. Por contraste, la ruta paralela
`/bitacora` ya montaba `BitacoraView`, que implementa los AC-3/4/5/9
de SPEC-010 (pestañas `audit` + `projectLog`, filtros
`entityType`/`action`, paginación `limit`/`offset`, modal
`LinkFileDialog` con `signedUrl` y `role="dialog"`/`aria-modal`).

Corrección mínima: la ruta `/audit` ahora renderiza el mismo
`BitacoraView` (la fuente de verdad). El placeholder queda sin
callers y se elimina. El path `/audit` se conserva para no
romper la navegación ni los marcadores externos; no hay cambio
de contrato backend, permisos, auditoría, schema, ni migración.

## Cambios (3 elementos)

| Elemento | Cambio |
|---|---|
| `src/app/(dashboard)/audit/page.tsx` | Antes: importaba `AuditList` desde `@/modules/plataforma/auditoria/audit-list` y devolvía `<AuditList />`. Ahora: importa `BitacoraView` desde `@/modules/bitacora/bitacora-view` y devuelve `<BitacoraView />`. La marca `"use client"` se conserva (la vista usa `trpc.useUtils` y `useMutation`). |
| `src/modules/plataforma/auditoria/audit-list.tsx` | **Eliminado** (sin callers tras el cambio; verificado por grep `AuditList` en `src/` + `tests/` ⇒ 0 resultados). Se elimina también el directorio `src/modules/plataforma/auditoria/` (queda vacío). |
| `tests/spec-20260817-010.test.ts` | **+6 tests nuevos** (`describe "IMPL-20260825-39 (F-14/P3) · ruta /audit usa BitacoraView"`): (1) `audit/page.tsx` importa y renderiza `BitacoraView`; (2) NO importa el placeholder; (3) NO usa `messages.audit.empty` fijo; (4) `audit-list.tsx` fue eliminado (`existsSync === false`); (5) la navegación sigue apuntando a `/audit` (path preservado); (6) `bitacora-view.tsx` ya implementa `trpc.bitacora.audit.list` con filtros y paginación mutables. |

**Sin cambios en:** `src/modules/bitacora/bitacora-view.tsx`,
`src/server/trpc/routers/dashboard-admin-bitacora.ts`
(`bitacora.audit.list` + `bitacora.projectLog.list` +
`bitacora.linkFile` intactos), `src/server/services/bitacora/*`,
`src/shared/utils/messages.ts` (`messages.audit.*` queda en el
catálogo sin callers activos — útil para futuros consumidores),
`src/modules/plataforma/layout/navigation.tsx` (sigue apuntando a
`/audit`), `src/app/(dashboard)/bitacora/page.tsx` (sin cambios),
`permissions`, `audit_logs`, schema Drizzle.

## Decisiones internas reversibles

- **Renderizar `BitacoraView` en `/audit`, no crear nueva página.**
  El componente `BitacoraView` ya cubre AC-3/4/5/9 y la duplicación
  sería ruido. Si más adelante la navegación decide separar
  `/audit` (sólo `audit.list`) de `/bitacora` (con pestañas), basta
  extraer un componente `AuditOnlyView` y mapearlo — sin tocar
  contratos.

- **Eliminar el placeholder, no dejarlo como muerto.** El
  placeholder sin callers introduce confusión (parece haber "otra"
  implementación de auditoría). La verificación
  `existsSync === false` queda como test anti-regresión.

- **No tocar `messages.audit`.** Quedan 5 claves
  (`title`, `empty`, `filterEntity`, `filterAction`, `filterDate`)
  sin callers activos pero referenciadas por
  `messages.nav.audit` (la etiqueta del menú). Eliminar
  `messages.audit` completo rompería el typecheck en
  `navigation.tsx` por la rama `nav.audit` (que es la misma
  referencia `messages.nav.audit`, no `messages.audit`). El cambio
  se reduce a la ruta + placeholder.

- **Preservar `"use client"`** en la página. `BitacoraView` usa
  `trpc.useUtils`, `useMutation` y `useState`; renderizarlo desde
  un Server Component obligaría a Next.js a marcarlo como Server
  y fallaría con `useState is not a function`. La marca se
  conserva sin coste.

## Validación

- **typecheck (`pnpm typecheck`)**: **PASS** (sin output, exit 0).
- **tests V2 completa (`pnpm test`)**: **1026/1026 PASS** en 32
  ficheros · 7.52 s
  - `tests/spec-20260817-010.test.ts`: **57/57** (51 originales
    + **6 nuevos** F-14/P3).
  - `tests/spec-20260817-007.test.ts`: **105/105** (sin regresión).
  - `tests/spec-20260817-008.test.ts`: **58/58** (sin regresión).
  - `tests/spec-20260817-004.test.ts`: **63/63** (sin regresión B-4/B-5).
  - `tests/impl-20260825-34.test.ts`: **65/65** (sin regresión).
  - Resto: **678/678** PASS.
- **lint (`pnpm lint`)**: 17 errores totales, **0 introducidos
  por este incremento**. ESLint directo sobre los archivos
  modificados (`audit/page.tsx`, `tests/spec-20260817-010.test.ts`):
  **PASS silencioso**. Los 17 errores son preexistentes en
  `tests/autonomous-loop/**` y `infrastructure/vectoria-provision/**`
  (baseline B-3, fuera de alcance).
- **Ejecución real contra el backend:** **NO EJECUTADA** en este
  corte. La corrección es un cambio mínimo de import/render en
  una página Next.js que ya carga la misma vista que
  `/bitacora`. La validación funcional real contra staging (carga
  de `/audit`, llamada a `trpc.bitacora.audit.list`, paginación,
  responsive) corresponde al gate GEMINI V3.

## Trazabilidad a criterios

| Criterio | Evidencia |
|---|---|
| **AC-1 (ruta `/audit` usa `BitacoraView`)** | Test F-14/P3 #1: regex sobre `audit/page.tsx` verifica `import { BitacoraView } from "@/modules/bitacora/bitacora-view"` + `return <BitacoraView />`. |
| **AC-2 (no usa `messages.audit.empty` fijo)** | Test F-14/P3 #3: `audit/page.tsx` NO contiene `messages.audit.empty` ni `messages.audit.title`. |
| **AC-3 (no importa el placeholder)** | Test F-14/P3 #2: regex negativo sobre `audit-list` + `not.toContain("AuditList")`. |
| **AC-4 (placeholder eliminado)** | Test F-14/P3 #4: `existsSync("src/modules/plataforma/auditoria/audit-list.tsx") === false`. |
| **AC-5 (path `/audit` preservado)** | Test F-14/P3 #5: `navigation.tsx` mantiene `href: "/audit"`. |
| **AC-6 (backend intacto)** | Sin cambios en `dashboard-admin-bitacora.ts`, `bitacora.audit.list` ni `permissions`. `tests/spec-20260817-010.test.ts` AC-3 (audit.list con permisos) sigue pasando sin cambios. |
| **AC-7 (BitacoraView ya implementa filtros/paginación)** | Test F-14/P3 #6: `bitacora-view.tsx` contiene `trpc.bitacora.audit.list.useQuery` + filtros `entityType`/`action` + setter `offset + limit`. |
| **AC-8 (sin regresión suite)** | V2 1026/1026 PASS; todos los demás describe blocks intactos. |
| **AC-9 (responsive preservado)** | `BitacoraView` mantiene `overflow-x-auto` + `min-w-[760px]` + `hidden sm:table-cell` (verificado por test existente `AC-9 · bitacora-view usa tabs + role=dialog`). |

## Reversión (sin pérdida de datos)

1. **Restaurar `audit/page.tsx`** a su versión anterior de 2
   líneas (import `AuditList` + return `<AuditList />`). Validar:
   1020/1020.
2. **Restaurar el placeholder** desde git:
   `git checkout HEAD -- src/modules/plataforma/auditoria/audit-list.tsx`.
   Crear el directorio si hace falta. Validar: 1020/1020.
3. **Revertir los 6 tests** B-39 al final de
   `tests/spec-20260817-010.test.ts`. Validar: 1020/1020.

No hay datos persistidos nuevos. La ruta `/audit` siempre estuvo
en navegación y seguirá estándolo tras la reversión.

## Riesgos y desviaciones

- **Riesgo muy bajo**: el placeholder eliminado (`AuditList`)
  mostraba filtros `entity/action/date` y una tabla vacía con
  caption `messages.audit.empty`. `BitacoraView` cubre
  `entityType` y `action` (no `date`); la columna `Fecha` ya está
  en la tabla. Si Frank pide filtro `date` específico, queda para
  un incremento posterior — no es alcance de F-14/P3.
- **Sin desviaciones del hallazgo**: el comportamiento esperado
  es exactamente el que ya tiene `/bitacora`. La ruta `/audit`
  ahora se comporta igual.

## Pendientes ATLAS

- **Gate GEMINI V3** sobre staging LIVE: cargar `/audit`
  autenticado como Director y verificar que la tabla de auditoría
  carga datos reales de `audit_logs` (vs placeholder vacío) y
  que la paginación funciona.
- **No** se solicita SPEC-GAP: el cambio es directo y reversible.
- **No** se requiere DEBY: el defecto era de UI estática, sin
  runtime, race, leak ni causa raíz externa.

## Cambios a `context/CURRENT.md`

NO se modifica `context/CURRENT.md` en este incremento: la
instrucción del handoff B-3 fue agregar nota "sólo si no mezcla
cambios ajenos". El archivo se modificará al final del turno
cuando ATLAS consolide el WIP del día; mezclar aquí podría
confundir al lector sobre el estado actual del proyecto.

---

## Métricas del incremento

| Métrica | Valor |
|---|---|
| Sesiones SOFIA usadas | 1 (≤6) |
| Tool calls totales | <300 |
| Archivos modificados | 2 (page.tsx, test) + 1 eliminado (audit-list.tsx + dir) |
| Líneas añadidas | ~30 |
| Líneas eliminadas | 9 (placeholder) |
| Tests añadidos | +6 (F-14/P3) |
| Tests V2 | **1026/1026** PASS |
| Typecheck | PASS |
| Lint (delta) | 0 errores nuevos |
| Contratos públicos cambiados | 0 |
| Schema/migración | NO |
| Permisos | NO |
| Auditoría | NO |
| Listo para gate GEMINI V3 | sí |

---

# V3 staging (GEMINI · QA-20260825-34) · gate F-14 — evidencia real

> Ejecución real (que en el corte quedó como "NO EJECUTADA"). Deployment
> `o8lae8uqlt3qtvn5zpmgfe59`. Veredicto: **PASS**.

## Resultado (read-only, Director)

- `trpc.bitacora.audit.list` → **200**, `total=365`, `items=25` (paginado).
- Las **5 acciones del flujo billing** están presentes en `audit_logs`:
  `factura.timbrar` (invoice `e4827b7c`), `cobro.register` + `cobro.confirm`
  (payment `b383e711`), `os.final_invoice_issued` (order `f5a33626`, source
  backfill_on_close), `os.closed` (order `f5a33626`).
- Placeholder fijo eliminado ("No hay eventos para mostrar" no aparece).
- Filtros `entityType`/`action` operativos; responsive desktop 1280 y
  mobile 375 con `overflow=false`; 0 console/page/request/http errors.

## Evidencia

- QA: `context/reviews/QA-20260825-34-SPEC-007-invoice-draft.md` (sección "GATE FINAL F-14 (bitácora /audit)").
- Capturas: `f14-00-audit-desktop.png`, `f14-01-audit-mobile.png`.
- Runners: `/tmp/kilo/f14-{audit,mobile}.cjs`.
