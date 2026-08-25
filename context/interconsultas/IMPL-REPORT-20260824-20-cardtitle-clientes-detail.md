# IMPL-REPORT-20260824-20 · SPEC-002 defectos corregidos en staging (v2)

**ID intervención:** IMPL-20260824-20
**ID tarea:** SPEC-002-V3-20260824-01
**Origen handoff:** ATLAS
**Estado:** DONE (staging-verificado)
**SPEC:** `context/SPECs/SPEC-20260817-002-clientes-prospectos.md` (v1.0)
**ADRs vigentes:** ARCH-20260817-01 (stack), ARCH-20260819-03 (UI/responsive), ARCH-20260817-05 (autorización por recurso).

## Resumen ejecutivo (v2)

Las dos correcciones originales (`CardTitle` como `<h3>`, `clientes/[id]` sin `React.use`) ya
estaban aplicadas en `READY_FOR_VERIFYING` v1. Esta v2 añade tres correcciones pedidas por
ATLAS para cerrar V2/V3 sin ampliar producto:

1. Defecto simétrico en `prospectos/[id]/page.tsx` (mismo `params: Promise` + `React.use`).
2. Política de reintentos en `providers.tsx` que no reintenta 4xx ni "No autenticado"
   (elimina la espera inútil de ≈7 s; preserva el camino de error).
3. Tests corregidos en `e2e/plataforma.spec.ts` (selector específico para el alert del
   login) y `e2e/clientes-prospectos.spec.ts` (drawer se abre cuando su botón está
   visible, no solo cuando `isMobile`).

**Resultado V2 cerrada:** `30/30 PASS` en los 3 viewports.

## Archivos modificados (final, scope-estricto)

1. **`src/components/ui/card.tsx`** — `CardTitle`: `<div>` → `<h3>`, conservando `forwardRef`, `className`, `{...props}` y la firma de API existente. Ref-tipado a `HTMLHeadingElement`. Inline disable de `jsx-a11y/heading-has-content` con justificación.
2. **`src/app/(dashboard)/clientes/[id]/page.tsx`** — `params` ahora como `{ id: string }` (contrato Next.js 14) y leído directamente. Eliminado `React.use(params)` y el import de `* as React` ya innecesario. Sin cambios en query/rama de error/mensajes.
3. **`src/app/(dashboard)/prospectos/[id]/page.tsx`** *(nuevo en v2)* — mismo patrón defectuoso y misma corrección simétrica al de clientes. Documentado en comentario.
4. **`src/components/providers.tsx`** *(nuevo en v2)* — QueryClient con `defaultOptions.queries.retry = shouldRetryQuery`. Sin reintentos sobre 4xx ni sobre el mensaje canónico del middleware `protectedProcedure`. 1 reintento para errores transitorios (5xx/red). Comportamiento de datos y errores preservado.
5. **`e2e/plataforma.spec.ts`** *(nuevo en v2)* — `getByRole("alert")` reemplazado por `locator('form p[role="alert"]', { hasText: /No fue posible iniciar sesión/i })` para evitar la strict-mode collision con el route-announcer de Next.js.
6. **`e2e/clientes-prospectos.spec.ts`** *(nuevo en v2)* — En el test de navegación, el drawer se abre cuando el botón "Abrir navegación" está visible (`await navToggle.isVisible()`), no sólo cuando `isMobile === true`. Cubre tablet-768 además de mobile-375.

Sin cambios en infraestructura, manifiestos, contratos API, schema, migraciones, dependencias, ni `.env*`. El artefacto de este reporte (`context/interconsultas/IMPL-REPORT-20260824-20-cardtitle-clientes-detail.md`) queda actualizado.

## Causa raíz reproducible (defecto por defecto)

### Defecto 1 — `CardTitle` sin semántica de heading

- `src/components/ui/card.tsx:22-31` renderizaba `<div>`.
- `getByRole("heading", …)` en Playwright sólo matchea `h1`–`h6`. Por eso login, `/clientes`, `/prospectos` y la rama "Recurso no encontrado" del detalle mostraban texto visible pero ningún heading accesible.
- Fix mínimo: cambiar el elemento a `<h3>` preservando exactamente `className`, `{...props}` y `forwardRef` (tipado a `HTMLHeadingElement`). API idéntica para los 79 call-sites existentes en `src/**`.

### Defecto 2 — `Application error` en `/clientes/{id}` y `/prospectos/{id}`

- Reproducido localmente con Node sobre las versiones instaladas:
  - `next@14.2.18` → `params` en App Router se entrega como **objeto plano** (no `Promise`). El contrato async-params es de Next.js 15.
  - `react@18.3.1` → `Object.keys(React)` no incluye `use`; sólo están `useCallback/Context/State/Effect/Id/…`. `React.use` se introdujo en React 19 / Next 15.
  - Verificado en runtime: `React.use({id:'test'})` lanza `TypeError: React.use is not a function`.
- Conclusión: el handler de Next detecta el error no controlado en render y muestra el overlay "Application error: a client-side exception has occurred", exactamente lo observado en staging.
- Fix mínimo, compatible con Next 14.2 + React 18.3:
  - `params: { id: string }` (en lugar de `Promise<{ id: string }>`).
  - `const { id } = params` (en lugar de `React.use(params)`).
  - Eliminado `import * as React from "react"` (ya sin uso tras retirar `React.use`).
- Aplica idénticamente a `clientes/[id]/page.tsx` y `prospectos/[id]/page.tsx`.

### Defecto 3 — Espera inútil por retry sobre 401 en `/clientes/{id}` y `/prospectos/{id}`

- `@tanstack/react-query@5.101` con `defaultOptions.queries.retry = true` reintenta 3 veces con backoff `min(1000·2^n, 30000)` → ≈1+2+4 = ≈7 s. Combinado con el `toBeVisible()` de 5 s del test, éste se quedaba sin tiempo aunque la rama de error ya hubiera resuelto.
- `protectedProcedure` lanza `TRPCError({ code: "UNAUTHORIZED" })`; reintentar no recupera credenciales.
- Fix mínimo: `defaultOptions.queries.retry = shouldRetryQuery`:
  - `false` si `error.data.httpStatus ∈ [400..499]`.
  - `false` si el mensaje matchea `/No autenticado|Unauthorized|Forbidden/i` (respaldo para TRPCError lanzados directamente por middleware, cuyo `httpStatus` puede llegar `null` en el formatter).
  - `failureCount < 1` para el resto (un único reintento absorbe picos transitorios; tras él el error sigue en `query.error`).
- Comportamiento de datos y errores preservado: los errores siguen apareciendo en `query.error` con la misma forma; sólo eliminamos la espera inútil sobre 4xx.
- Medición (Playwright + `Date.now()`): **cliente detail heading aparece en ≈521 ms** (antes ≈7 000 ms), **prospecto detail heading aparece en ≈339 ms** (antes no renderizaba por `React.use`).

## Validación

- **Baseline (previo a v1):** `pnpm typecheck` PASS, `pnpm test tests/spec-20260817-002.test.ts` 21/21 PASS.
- **V1 dirigida (tras cada corte de riesgo, v1 + v2):**
  - `pnpm typecheck` → **PASS**.
  - `pnpm test` (suite completa Vitest) → **641/641 PASS** (25 archivos).
  - `pnpm build` (Next.js 14.2.18) → **PASS**; `/clientes/[id]` y `/prospectos/[id]` compilan como `ƒ` (Dynamic, client-rendered on demand).
  - `npx eslint` sobre los 6 archivos modificados → **PASS** (0 errores, 0 warnings).
- **V2 dirigida — Playwright local contra `next start` (con rebuild y reinicio del servidor):**

  **Resultados finales v2 (todos los test se ejecutan contra servidor fresco):**

  | Test | mobile-375 | tablet-768 | desktop-1280 |
  |---|---|---|---|
  | `clientes-prospectos` · `/prospectos` lista | PASS | PASS | PASS |
  | `clientes-prospectos` · `/clientes` lista | PASS | PASS | PASS |
  | `clientes-prospectos` · detalle cliente heading "Recurso no encontrado" | PASS (≈521 ms) | PASS | PASS |
  | `clientes-prospectos` · navegación expone módulos (drawer si botón visible) | PASS | PASS | PASS |
  | `plataforma` · login + alert visible | PASS | PASS | PASS |
  | `plataforma` · audit Bitácora + tabla | PASS | PASS | PASS |
  | `plataforma` · admin/fiscal-config form | PASS | PASS | PASS |
  | `plataforma` · admin/roles modal conserva foco/teclado | PASS | PASS | PASS |
  | `plataforma` · tema + nav móvil + contraste | PASS | PASS | PASS |
  | `plataforma` · cookies sesión httpOnly | PASS | PASS | PASS |

  **30/30 PASS en 11.0 s** (mediana estable en segunda ejecución también 30/30).

- **Probe estructural adicional (curl):**
  - `/login` → `<h3 class="text-2xl font-semibold leading-none tracking-tight">Iniciar sesión</h3>` ✅
  - `/clientes` → `<h3 …>Clientes</h3>` ✅
  - `/prospectos` → `<h3 …>Prospectos</h3>` ✅
  - `/clientes/00000000-0000-0000-0000-000000000077` → HTTP 200, sin `Application error` ✅
  - `/prospectos/00000000-0000-0000-0000-000000000077` → HTTP 200, sin `Application error` ✅

## Verificación staging posterior

- Commit publicado: `4187aaa3984a012ca720ced4ac615ea4b617c35a` (`fix: stabilize staging UI verification`).
- Coolify se actualizó explícitamente a ese SHA; el pin anterior `fc40b44` hacía que el deployment manual reconstruyera el código antiguo.
- Deployment: `b5w5roar7wngcpnbmlzkfdxc`, `finished`, SHA `4187aaa3984a012ca720ced4ac615ea4b617c35a`.
- Aplicación: `running:healthy`; logs de deployment disponibles con token `Read sensitive data`.
- Playwright staging V3: **30/30 PASS** en mobile-375, tablet-768 y desktop-1280 (11.3 s).

## Trazabilidad AC ↔ evidencia

- **AC-9 (UI/responsive 375/768/1280):** headings de login/clientes/prospectos ahora son `h3` y matchean `getByRole("heading")` en los 3 viewports ✅.
- **SPEC-002 · Detalle cliente/prospecto:** ambos renders ya no rompen; la rama `query.error || !query.data` se evalúa y produce el heading "Recurso no encontrado" como exige la SPEC ✅.
- **No se cambió contrato funcional**, ni mensajes (`messages.errors.notFound = "Recurso no encontrado."`), ni rama de error, ni permisos, ni visibilidad por rol.

## Notas operativas (sin ampliación de producto)

- **Cierre de servidores**: durante la validación local se descubrió que `next start` sirve los hashes antiguos de los chunks después de un `pnpm build` (mismatch entre los chunks que el HTML solicita y los que `.next/` contiene). El bloqueo fue puramente local: staging sirve el bundle correcto bajo Coolify y no se ve afectado. En este incremento se documenta y se reinició el servidor antes de la V2 final. No requiere cambio de código.
- **Política de retry** es estrictamente: no retry en 4xx (incluye 401) y 1 retry para el resto. Esto NO oculta errores: cualquier fallo sigue llegando a `query.error`. La UI consume `query.error` igual que antes.

## Reversión (recomendación, no ejecución)

- Revertir los 6 archivos: `git checkout -- src/components/ui/card.tsx src/components/providers.tsx "src/app/(dashboard)/clientes/[id]/page.tsx" "src/app/(dashboard)/prospectos/[id]/page.tsx" e2e/plataforma.spec.ts e2e/clientes-prospectos.spec.ts`.
- Sin impacto en DB, infraestructura, secretos ni configuración.

## Riesgos y desviaciones

- **Riesgo bajo**: cambiar `<div>` a `<h3>` en CardTitle afecta a 79 call-sites en `src/**`. Conservada la firma `forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>` y todas las clases existentes. Ningún consumidor hace `querySelector("div.card-title")` ni similar (verificado por ausencia de matches).
- **Riesgo bajo**: nueva política de retry reduce de 3 a 1 el número de reintentos para errores transitorios (5xx/red). Cambio positivo: la página deja de esconderse 7 s ante 401, y un reintento sigue absorbiendo picos cortos de red.
- **Riesgo bajo**: el test de navegación abre el drawer cuando el botón está visible (mobile + tablet). En desktop el botón no existe, así que el assert del dialog se omite (mismo comportamiento que antes para desktop). Ningún cambio funcional en la app; sólo en el test.
- **Sin desviación funcional**: la rama de error/not-found, los mensajes y el orden de render se mantienen idénticos.
- **Sin tocar en la implementación:** SPEC, ADR, schema, migraciones, secretos y runtime de infraestructura. La documentación de estado se actualizó y Coolify recibió el deployment autorizado.

## Pendientes ATLAS (decisiones fuera de este incremento)

1. **`prospectos/{id}`** cubierto en este incremento.
2. **Otros defectos simétricos `React.use(params)` en la app**: el grep `React\.use\(params\)` muestra que ya no quedan más (verificado tras los cambios). Si aparecen más adelante con la migración a Next 15, este patrón de fix sirve de plantilla.
3. **GEMINI**: gate final recomendado para revisar la política global de retry de `providers.tsx`; V3 web ya está en PASS.
