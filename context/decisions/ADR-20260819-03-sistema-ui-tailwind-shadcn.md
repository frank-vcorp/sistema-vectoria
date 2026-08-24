# ADR-20260819-03 · Sistema de interfaz: Tailwind + shadcn/ui + tema VectorIA + paridad responsive

- **ID:** ARCH-20260819-03
- **Estado:** accepted (core ratificado por Frank · OK stack V1 completo · 2026-08-20; P-UI-1/P-UI-2 siguen como detalles menores de implementación a resolver en `IN_PROGRESS`, no bloquean la aceptación del ADR)
- **Versión:** 1.0
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-19 (v1.0)
- **Fuentes funcionales:** `discovery/FUNCTIONAL-BASELINE.md` v1.10 §3 (interfaz interna, paridad móvil/tableta/escritorio); `discovery/DECISIONES-FUNCIONALES.md` **DEC-FUN-20260819-70** (Tailwind CSS + shadcn/ui; referencia Oatmeal `olive_instrument` como dirección visual), **DEC-FUN-20260819-71** (reemplaza paleta/tipografía de la 70 por marca VectorIA; activos canónicos en `context/VectorIA-Brand-Assets/`), **DEC-FUN-20260819-72** (paridad operativa móvil/tableta/escritorio); `discovery/HALLAZGOS.md` **FND-20260819-01** (resolved); `context/VectorIA-Brand-Assets/Guia-Marca-VectorIA.md` (tokens exactos de marca); `discovery/HANDOFF-FUNCIONAL-A-INTEGRA.md` (fuera de alcance: no copiar código/assets/layout del kit Oatmeal).
- **Stack asumido:** ADR-20260817-01 v1.2 (Next.js App Router + TS estricto); la UI es un adaptador de presentación que consume servicios de aplicación vía tRPC (invariante 1 de SOL-20260819-01).

---

## 1. Contexto

La interfaz interna de V1 debe ser **operable** (no decorativa): soporta prospectos, cuestionarios, alcance, cotización, OS, proyectos modulares con requerimientos/tareas/pruebas/entregables, facturación CFDI, cobranza, finanzas, suscripciones, dashboard por rol y administración. Frank fijó la dirección visual en tres decisiones:

- **DEC-FUN-70:** V1 adopta Tailwind CSS + shadcn/ui como sistema de interfaz; referencia visual el kit Oatmeal (`olive_instrument`) **sólo como sobriedad compositiva**, no para copiar código, assets ni layout.
- **DEC-FUN-71:** la paleta oliva y la tipografía editorial serif de la referencia **se sustituyen** por la marca VectorIA: tema claro (fondo blanco, alto espacio negativo), tema oscuro (navy profundo), acento naranja quemado, sans-serif moderna. Los activos canónicos viven en `context/VectorIA-Brand-Assets/`.
- **DEC-FUN-72:** todas las pantallas y acciones de V1 son plenamente operables en móvil, tableta y escritorio; la presentación se adapta al viewport **sin reducir las capacidades autorizadas** de cada actor.

Los tokens exactos provienen de la guía de marca y están ratificados en DEC-FUN-71:

| Token | HEX | Uso |
|---|---|---|
| Navy profundo | `#0A1F44` | Tema oscuro: fondo. Tema claro: texto principal/wordmark. |
| Naranja quemado | `#D35400` | Acento de acción (CTA, foco, isotipo). |
| Blanco puro | `#FFFFFF` | Tema claro: fondo y espacio negativo. |
| Gris carbón | `#2C3E50` | Texto secundario / variantes. |

Tipografía: **sans-serif moderna** (Montserrat/Inter/Open Sans), nunca serif editorial. FND-20260819-01 (alcance responsive) quedó **resolved** vía DEC-FUN-72.

## 2. Opciones consideradas

### 2.1 Sistema de componentes

| Opción | Pros | Contras |
|---|---|---|
| **A. Tailwind CSS + shadcn/ui** | Componentes accesibles copiados al repo (control total), tokens via CSS variables, radix primitives, alineado con DEC-FUN-70 | SOFIA debe mantener componentes copiados (no paquete opaco) |
| B. Material UI / MUI | Componentes maduros | Identidad ajena; sobrescribe marca; bundle pesado; difícil navy/naranja diferenciado |
| C. Componentes custom + CSS modules | Máxima libertad | Coste de implementación alto para 4-10 personas; inconsistencia; sin accesibilidad por defecto |

### 2.2 Tema / identidad

| Opción | Pros | Contras |
|---|---|---|
| **A. Tema VectorIA (claro/oscuro) con tokens de marca** | Identidad propia; activos canónicos; cumple DEC-FUN-71 | Define tokens manualmente (sin paleta Oatmeal) |
| B. Paleta Oatmeal `olive_instrument` directa | Cero diseño | Contradice DEC-FUN-71 (reemplaza paleta oliva) |
| C. Tema único (sólo claro) | Menos código | DEC-FUN-71 exige claro y oscuro |

### 2.3 Responsive

| Opción | Pros | Contras |
|---|---|---|
| **A. Paridad operativa + breakpoints adaptativos** | Cumple DEC-FUN-72; UX consistente | Más esfuerzo en tables/forms/builders por viewport |
| B. Mobile-first degradado a consulta | Menos esfuerzo | Prohíbe DEC-FUN-72 (no degradar acción a consulta) |
| C. Desktop-only + responsive pasivo | Mínimo | Viola DEC-FUN-72 |

## 3. Decisión

**A · A · A.** V1 adopta **Tailwind CSS + shadcn/ui** como único sistema de componentes accesibles, con un **tema VectorIA** (claro/oscuro) cuyos tokens son los de marca, y **paridad operativa** en móvil/tableta/escritorio.

| Dimensión | Decisión |
|---|---|
| Sistema de componentes | shadcn/ui sobre Radix UI primitives; componentes copiados al repo (`src/components/ui/*`), no paquete opaco. Tailwind como capa de estilos con tokens via CSS variables (`--background`, `--foreground`, `--primary`, `--accent`, etc.). |
| Tema claro (default) | `--background: #FFFFFF`; alto espacio negativo; texto principal `#0A1F44`. |
| Tema oscuro | `--background: #0A1F44` (navy profundo); texto principal `#FFFFFF`. |
| Acento | `--primary: #D35400` (naranja quemado) para CTAs, foco visible, selección y isotipo. |
| Texto secundario | `#2C3E50` (claro) / `#9CA3AF` derivado (oscuro). |
| Tipografía | Sans-serif moderna (Inter como default web-safe, Montserrat como alternativa de títulos); nunca serif editorial. Escala tipográfica fluida vía `clamp()`. |
| Activos de marca | Canónicos en `context/VectorIA-Brand-Assets/` (logo oficial transparente, mockups). El logo se sirve como asset estático (enlace público del logo o en `public/brand/`); nunca se copia el kit Oatmeal. |
| Referencia Oatmeal | **Sólo** sobriedad compositiva (espacio negativo, jerarquía, densidad). **Prohibido** copiar código, assets, layout o componentes del kit. Verificado por grep anti-copia. |
| Modo claro/oscuro | Toggle persistido por usuario (preferencia en `users` o `localStorage` con fallback a preferencia del SO). `class` strategy de Tailwind. |
| Breakpoints | Tailwind por defecto (`sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`). Viewports canónicos de prueba: móvil `375`, tableta `768`, escritorio `1280`. |
| Paridad operativa | Toda acción autorizada en escritorio está disponible y funcional en móvil/tableta. Tablas → scroll horizontal o vista-card por fila; navegación → sidebar (escritorio) / drawer (móvil); modales → responsive; builders drag&drop → operables con touch. |
| Accesibilidad | Componentes Radix aportan roles/teclas/foco por defecto. Contraste WCAG AA mínimo con los tokens de marca. Foco visible (ring naranja). Navegación por teclado en toda interacción. |
| i18n | `es-MX` único (DEC-FUN-39); sin cadenas de UI hardcoded fuera del catálogo de mensajes. |
| Validación de formularios | Esquemas Zod reutilizables (SPEC-001 AC-29) consumidos por `react-hook-form` + `zodResolver` en la UI. |

## 4. Contratos que quedan fijados

1. **Tailwind + shadcn/ui** es el único sistema de componentes de presentación. Ningún otro framework de UI se introduce en V1.
2. **Tokens de tema** son los de marca: `#0A1F44`, `#D35400`, `#FFFFFF`, `#2C3E50`; sans-serif moderna. Definidos una sola vez (CSS variables) y consumidos por Tailwind.
3. **Paridad operativa** (DEC-FUN-72): ninguna acción de negocio se bloquea, oculta ni degrada a consulta por tamaño de viewport. La presentación se adapta; las capacidades autorizadas (permisos) no cambian.
4. **Activos de marca canónicos** en `context/VectorIA-Brand-Assets/`; el logo oficial es la única fuente visual de marca.
5. **Prohibido copiar** código, assets, layout o componentes del kit Oatmeal; sólo se toma la sobriedad compositiva.
6. **Accesibilidad WCAG AA** con los tokens de marca; foco visible; navegación por teclado; roles ARIA via Radix.
7. **La UI no accede a Drizzle/PostgreSQL** (SOL inv.1, SPEC-001 AC-26); consume servicios vía tRPC.

## 5. Invariantes (espejo de SPEC-001 AC-42..AC-68)

1. Tailwind + shadcn/ui configurados; componentes copiados al repo. → AC-42.
2. Tokens de tema definidos (claro `#FFFFFF`/`#0A1F44`; acento `#D35400`; secundario `#2C3E50`). → AC-43..AC-46.
3. Tipografía sans-serif moderna, no serif. → AC-47.
4. Logo y activos de marca canónicos desde `context/VectorIA-Brand-Assets/`. → AC-48.
5. Toggle claro/oscuro persistido. → AC-49.
6. Cero copia de código/assets/layout de Oatmeal. → AC-50.
7. Breakpoints responsive configurados. → AC-51.
8. Paridad operativa móvil/tableta/escritorio (E2E por viewport). → AC-52..AC-54.
9. Ninguna acción degradada a consulta por viewport. → AC-55.
10. Tablas, forms, builders, validaciones, navegación, modales y subida de archivos operables en los tres viewports. → AC-56..AC-61.
11. Accesibilidad: teclado, ARIA, foco, contraste WCAG AA. → AC-62..AC-65.
12. E2E Playwright cubre matriz de viewports en flujos representativos. → AC-66.
13. Tooltips en admin/config (DEC-FUN-20). → AC-67.
14. i18n es-MX sin cadenas hardcoded fuera del catálogo. → AC-68.

## 6. Consecuencias

### 6.1 Positivas
- Identidad propia diferenciada sin contratar diseño; componentes accesibles por defecto (Radix).
- shadcn/ui da control total del código de componentes (mantenibles, auditables).
- Tokens centralizados evitan drift cromático; paridad operativa satisface el uso fuera de escritorio.
- El typecheck sigue siendo contrato; los esquemas Zod se reutilizan en formularios.

### 6.2 Negativas / trade-offs
- shadcn/ui copia componentes al repo: SOFIA mantiene actualizaciones manualmente (aceptado por control).
- Requerir paridad operativa aumenta esfuerzo de E2E (3 viewports por flujo) — mitigado con matriz enfocada en flujos representativos (AC-66).
- Contraste AA del naranja `#D35400` sobre blanco: ~3.2:1 (texto grande/iconos OK; texto fino requiere usar navy `#0A1F44` para cuerpo). AC-65 lo formaliza.

### 6.3 Reversibilidad
- Cambiar la paleta es editar tokens (no refactor). Cambiar de shadcn a otro sistema es un adaptador de UI que no toca servicios de aplicación (frontera hexagonal).

## 7. Restricciones para SPECs derivadas

- Toda SPEC de dominio (002–011) declara sus pantallas como consumidores de servicios vía tRPC (no acceden a BD).
- Toda SPEC que introduzca una tabla, form, builder o modal declara su comportamiento responsive y cita este ADR + SPEC-001 AC-42..AC-68.
- Toda SPEC lista los flujos E2E representativos que deben cubrir móvil/tableta/escritorio.
- Los tooltips de admin/config (DEC-FUN-20) se exigen en SPEC-010 y donde haya configuración.
- El logo y activos de marca se referencian desde `context/VectorIA-Brand-Assets/`; nunca se duplican ni se descargan del kit Oatmeal.

## 8. Pendientes

- **P-UI-1 (Frank):** confirmar si el logo se sirve desde `public/brand/` (copiado del asset canónico) o sólo referenciado; y licencia/uso de la fuente (Inter = OFL, Montserrat = OFL — ambas usables).
- **P-UI-2 (Frank):** preferencia de tema por defecto (claro) y si el toggle es por usuario o por organización.

## 9. Referencias cruzadas

- Derivado de: DEC-FUN-20260819-70/-71/-72, FND-20260819-01, `Guia-Marca-VectorIA.md`.
- Relacionado: ADR-20260817-01 (stack; la UI es adaptador), ADR-20260817-01 §10 (hexagonal; invariante 1), SPEC-20260817-001 AC-26 (UI sin BD) y AC-42..AC-68 (este ADR).
- Aplica a: toda SPEC 002–011 (componentes, responsive, accesibilidad) y a SPEC-010 (dashboard widgets drag&drop responsive).
