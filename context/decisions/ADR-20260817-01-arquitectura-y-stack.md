# ADR-20260817-01 · Arquitectura y stack fundacional

- **ID:** ARCH-20260817-01
- **Estado:** accepted (ratificado por Frank · OK stack V1 completo · 2026-08-20)
- **Versión:** 1.3
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-17 (v1.0) · 2026-08-18 (v1.1) · 2026-08-19 (v1.2) · 2026-08-19 (v1.3)
- **Motivo del estado v1.1:** Frank validó el stack base ("Stack Validado") pero la **v1.1 profundiza 7 correcciones técnicas** que materializan nuevos ADRs (04–07) y refinan ADR-02/03. ADR-01 queda `proposed` hasta que Frank dé OK final al **stack v1.1** completo. El stack base (Next.js + TS estricto + PostgreSQL 16 + Drizzle + tRPC/Zod + pg-boss + S3-compatible + Argon2id + AES-256-GCM) **no cambia**.
- **Motivo de la v1.2 (SOL-20260819-01):** Frank confirmó (dictamen SOL-20260819-01 §14–§15) que V1 no implementa API externa, OpenAPI, MCP ni auth para consumidores IA; V1 sí conserva fronteras internas (arquitectura hexagonal ligera: servicios de aplicación independientes del transporte y adaptadores, sin microservicios). El stack base **no cambia**; la v1.2 añade §10 (formalización hexagonal + 9 invariantes + regla transversal para SPEC-002..011 + exclusión V1/V2) y desambigua §2.5/§3. ADR-01 sigue `proposed`.
- **Motivo de la v1.3 (DEC-FUN-20260819-70/-71/-72 · sistema UI):** Frank fijó la capa de presentación: Tailwind CSS + shadcn/ui como único sistema de componentes accesibles, tema VectorIA (claro `#FFFFFF` / oscuro navy `#0A1F44`, acento naranja `#D35400`, secundario `#2C3E50`, sans-serif moderna) que **reemplaza** la paleta oliva/tipografía editorial de la referencia Oatmeal (ésta aporta sólo sobriedad compositiva, no código/assets/layout), y paridad operativa móvil/tableta/escritorio. Formalizado en ADR-20260819-03. El stack base **no cambia**; la v1.3 añade la fila UI a §3, la restricción UI a §6 y referencia ADR-03. ADR-01 pasa a `accepted` el 2026-08-20 tras el **OK final de Frank al stack V1 completo** (frente (a) de §10 PROYECTO.md cerrado); SPEC-001 pierde su único frente pendiente y pasa `BLOCKED → READY`. Esta ratificación deja sin efecto las notas «sigue `proposed`» de los motivos v1.1/v1.2/v1.3.
- **Fuentes funcionales:** `discovery/FUNCTIONAL-BASELINE.md` v1.10 §1, §3, §4; `discovery/HANDOFF-FUNCIONAL-A-INTEGRA.md` §3; `discovery/DECISIONES-FUNCIONALES.md` DEC-FUN-01, DEC-FUN-02, DEC-FUN-20, DEC-FUN-21, DEC-FUN-29, DEC-FUN-39, DEC-FUN-41, DEC-FUN-46, DEC-FUN-50, **DEC-FUN-20260819-70, DEC-FUN-20260819-71, DEC-FUN-20260819-72**; `discovery/REGLAS-DE-NEGOCIO.md` BR-N147, BR-N201, BR-N202, BR-N203, BR-N205, BR-N276, BR-N310, BR-N349, BR-N371, BR-N372, BR-N373, BR-N374; `discovery/ACTORES-Y-PERMISOS.md` §1, §5; `context/VectorIA-Brand-Assets/Guia-Marca-VectorIA.md` (tokens de marca); `discovery/HALLAZGOS.md` FND-20260819-01 (resolved).

---

## 1. Contexto

Vector IA Administración es una aplicación **web interna** para una empresa pequeña de software (4-10 personas), operación inicial en una organización en México, moneda MXN, idioma es-MX. El discovery funcional entrega:

- 7 módulos operativos + 2 áreas transversales.
- Multi-organización **latente** (DEC-FUN-46): toda entidad de negocio lleva `organization_id` aunque el MVP tenga una sola organización.
- Roles y permisos como **datos, no código** (DEC-FUN-02): verificación vía `hasPermission(code)`, cero hardcode.
- Timbrado CFDI 4.0 real con PAC externo (DEC-FUN-50): requiere guardar CSD y API key protegidos.
- Jobs nocturnos: facturación recurrente (BR-N310), comisiones (día 15, BR-N299), ZIP mensual contador (BR-N311), respaldo BD diario 30 días (BR-N147).
- Notificaciones sólo in-app en MVP (BR-N349).
- Objetivo de respuesta < 2 s en operaciones comunes con datos de prueba (BR-N374); listados paginados (BR-N373).
- Auditoría obligatoria de acciones críticas (BR-N336/337).

El repositorio está **vacío de código** (solo `discovery/`, `context/`, `.kilo/`, `.vscode/`). No existe stack decidido; la sección `architecture` del JSON archive es `SUPERSEDED` y no debe usarse. INTEGRA decide stack desde cero dentro de su rol.

---

## 2. Opciones consideradas

### 2.1 Forma de despliegue

| Opción | Pros | Contras |
|---|---|---|
| **A. Monolito modular (Next.js full-stack)** | Un deploy, un repo, tipos end-to-end, curva simple para 4-10 personas, MVP rápido, sin orquestación de servicios | Acoplamiento si no se modulariza por dominio |
| B. Microservicios por módulo | Aislamiento de fallos, escalado independiente | Overhead operativo enorme para equipo pequeño y MVP; complejidad de red, observabilidad y despliegue |
| C. SPA + API separada | Separación clara | Dos deploys, doble tipado, más superficie de seguridad, sin beneficio proporcional en MVP |

### 2.2 Lenguaje y tipado

| Opción | Pros | Contras |
|---|---|---|
| **A. TypeScript estricto en todo el stack** | Un solo lenguaje, tipos compartidos cliente/servidor, ecosistema maduro, alineado con hasPermission tipado | Requiere disciplina de `any: never` |
| B. TypeScript front + Python back | Python fuerte para jobs/financiero | Doble lenguaje, doble tipado, doble CI, fricción de contrato |
| C. Go back + TypeScript front | Rendimiento y concurrencia | Curva, ecosistema más estrecho para MVP administrativo |

### 2.3 Base de datos

| Opción | Pros | Contras |
|---|---|---|
| **A. PostgreSQL 16** | Maduro, ACID, RLS nativo (multi-tenancy latente DEC-FUN-46), JSONB para JSON Discovery versionado, jobs via `pg-boss` sin Redis, respaldo simple | Requiere operatoria (ya cubierta por BR-N147) |
| B. MySQL/MariaDB | Conocido | RLS menos maduro; JSONB menos potente |
| C. SQLite + Turso | Simple para MVP | RLS inexistente; multi-tenancy latente en riesgo; jobs externos |

### 2.4 ORM / acceso a datos

| Opción | Pros | Contras |
|---|---|---|
| **A. Drizzle ORM** | SQL-first, esquema tipado, soporta RLS nativo vía políticas, migraciones versionadas, sin capa mágica | Curva menor vs Prisma |
| B. Prisma | DX alto, cliente tipado | Generador pesado, abstracción de RLS menos natural, M2M opacas |
| C. SQL crudo + tipos manuales | Máximo control | Duplicación, riesgo de desync tipos/esquema |

### 2.5 API / contrato cliente-servidor

| Opción | Pros | Contras |
|---|---|---|
| **A. tRPC + Zod** | Tipado end-to-end, sin código generado, validación compartida, ideal para Next.js App Router, typecheck es contrato | Curva para integraciones externas (PAC) donde se necesita REST/OpenAPI |
| B. REST + OpenAPI generado | Estándar, documentación auto | Tipado manual o codegen pesado |
| C. GraphQL | Consultas flexibles | Overhead para MVP administrativo |

> **Decisión compuesta (v1.2, SOL-20260819-01):** tRPC para todo contrato interno tipado. Las **integraciones salientes** (cliente PAC FacturoPorTi, cliente S3) y los **receptores entrantes** (descarga de archivos firmados, webhooks del PAC) son adaptadores de la web interna en V1, **sin contrato público**. El REST/OpenAPI versionado `/api/v1` para consumidores externos/AI, MCP y OAuth delegada se **difieren a V2** (ver §10).

### 2.6 Autenticación

| Opción | Pros | Contras |
|---|---|---|
| **A. Credenciales locales + sesión JWT httpOnly cookie + link de invitación** | Alineado con DEC-FUN-21 (link, sin OAuth/WhatsApp), sin dependencia externa, Argon2id para password | Sin SSO; aceptable en MVP interno |
| B. OAuth externo (Google/Microsoft) | UX moderna | Fuera de alcance MVP (DEC-FUN-21), introduce dependencia externa y superficie de permisos |

### 2.7 Jobs / tareas programadas

| Opción | Pros | Contras |
|---|---|---|
| **A. pg-boss sobre Postgres** | Sin Redis adicional, colas en la misma BD, transaccional con datos de negocio, simple en MVP | Menos features que BullMQ para alta concurrencia (no necesaria aquí) |
| B. BullMQ + Redis | Maduro para alta concurrencia | Otro servicio que operar; sobredimensionado para MVP |
| C. Cron del SO + script | Mínimo | Sin reintentos, sin observabilidad, sin concurrencia segura |

### 2.8 Almacenamiento de archivos

| Opción | Pros | Contras |
|---|---|---|
| **A. S3-compatible (MinIO en dev; bucket en prod)** | Enlaces firmados nativos (BR-N371), abstracción portable, escalado lineal | Configuración inicial |
| B. Filesystem local del servidor | Cero infra | Sin enlaces firmados reales, acoplado al nodo, backups manuales |
| C. Blob en BD | Trasaccional simple | Infla BD, rompe respaldo 30 días, mal para XML/PDF de CFDI |

### 2.9 Validación y contrato de datos

| Opción | Pros | Contras |
|---|---|---|
| **A. Zod** | Comparte esquemas con tRPC, runtime + estático, inferencia TS | — |
| B. Valibot | Más liviano | Ecosistema más nuevo, menos integraciones |
| C. class-validator + decorators | Clásico | Acoplado a clases, menos idiomático en Next.js App Router |

---

## 3. Decisión

**Monolito modular full-stack en TypeScript estricto**, con:

| Dimensión | Decisión |
|---|---|
| Forma de despliegue | **A.** Monolito modular Next.js (App Router). Un repo, un deploy en MVP. Modularización por dominio a nivel de carpetas y contrato (no microservicios). |
| Lenguaje | **A.** TypeScript estricto (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`). `any` prohibido salvo escape tipado justificado y revisado. |
| Framework | Next.js 14+ (App Router, Server Components por defecto, Route Handlers para API). |
| Base de datos | **A.** PostgreSQL 16, multi-tenant via `organization_id` + RLS latente (políticas desactivadas en MVP con una sola org, preparadas para activarse). |
| ORM | **A.** Drizzle ORM con migraciones versionadas en repo (`drizzle-kit`). |
| API interna | **A.** tRPC v11 sobre Route Handlers, con `Zod` para input/output. Tipado end-to-end cliente/servidor; el typecheck es contrato. |
| API (V1, interna + integraciones) | tRPC interno (contrato web). Integraciones salientes: cliente PAC (SPEC-007), cliente S3. Receptores entrantes: Route Handlers de descarga firmada y webhooks PAC. Sin contrato público. |
| API pública externa (V2, diferida) | REST/OpenAPI `/api/v1` + MCP remoto + auth delegada para consumidores IA. **Diferida a V2** (SOL-20260819-01 §14–§15). Sin endpoints ni contrato definitivo en V1. |
| Auth | **A.** Credenciales locales (email + password Argon2id), sesión JWT httpOnly `Secure; SameSite=Strict`, link de invitación firmado (DEC-FUN-21). Sin OAuth en MVP. |
| Jobs | **A.** `pg-boss` sobre Postgres: facturación recurrente nocturna (BR-N310), comisiones día 15 (BR-N299), ZIP contador mensual (BR-N311), respaldo BD diario 30 días (BR-N147), SLA cotización 48 h (BR-N240), escalamiento de cobranza tras 2 promesas (BR-N313). |
| Archivos | **A.** S3-compatible (MinIO en dev, bucket dedicado en prod). Acceso vía enlaces firmados (BR-N371). Validación tipo+tamaño al subir (BR-N372). |
| Validación | **A.** Zod compartido entre Drizzle (inferencia), tRPC y formularios. |
| UI / presentación (v1.3) | Tailwind CSS + shadcn/ui (Radix) como único sistema de componentes accesibles; tema VectorIA claro/oscuro con tokens de marca (`#FFFFFF`/`#0A1F44`/`#D35400`/`#2C3E50`, sans-serif moderna); activos canónicos en `context/VectorIA-Brand-Assets/`; referencia Oatmeal sólo compositiva (sin copiar código/assets/layout); paridad operativa móvil/tableta/escritorio. La UI es adaptador que consume servicios vía tRPC (no toca BD). Formalizado en ADR-20260819-03; AC-42..AC-68 en SPEC-001. |
| I18n | `es-MX` único en MVP (DEC-FUN-39), arquitectura preparada con catálogo de mensajes por locale; `Intl` con zona horaria de organización México (BR-N203). |
| Moneda | MXN por defecto, campo `currency` reservado en toda entidad monetaria (BR-N202). |
| Tests | Vitest (unit/integración), Playwright (E2E). Cada SPEC cita los escenarios que cubre. |
| Lint/format | ESLint (config Next + tRPC + Drizzle) + Prettier. |
| CI | GitHub Actions sobre `github.com/frank-vcorp/sistema-vectoria`: typecheck → lint → unit → build → (E2E en nightly). |
| Observabilidad | Logger estructurado (pino) + tabla `audit_logs` (BR-N336/337) + `project_log_entries` (BR-N259). Tracing mínimo en MVP (correlación por `requestId`). |

### 3.1 Modularización por dominio

Estructura de carpetas por dominio (contrato organizativo reversible, no código):

```
src/
  server/
    db/              esquemas Drizzle por dominio (uno por módulo)
    trpc/            routers tRPC por dominio
    jobs/            workers pg-boss por job
    services/        casos de uso transversales (hasPermission, audit, files, crypto)
  modules/
    plataforma/      organización, usuarios, roles, permisos, auditoría, archivos
    clientes/        prospectos, clientes, contactos
    comercial/       cuestionarios, catálogo, plantillas, alcance, cotización
    orden-servicio/  OS, anticipo, OC, autorización
    proyectos/       estados 3D, módulos, requerimientos, tareas, pruebas, entregables, cambios
    facturacion/     CFDI, PAC, cancelación, ZIP
    cobranza/        cobros, aplicaciones, promesas, escalado
    finanzas/        cuentas, movimientos, transferencias, rentabilidad
    dashboard/       widgets, notificaciones in-app
  shared/
    enums/           estados canónicos (única fuente)
    zod/             esquemas compartidos
```

> **Esto es contrato organizativo**, no scaffolding de código. SOFIA decide estructura interna reversible dentro de la SPEC; INTEGRA fija frontera de módulos y contratos.

---

## 4. Consecuencias

### 4.1 Positivas

- Un solo deploy y un solo lenguaje reducen superficie operativa para 4-10 personas.
- Tipado end-to-end (tRPC + Zod + Drizzle) convierte el `typecheck` en contrato verificable por SPEC.
- RLS latente permite activar multi-org sin migración cuando se necesite (DEC-FUN-46).
- pg-boss elimina dependencia de Redis en MVP.
- Enlaces firmados S3 satisfacen BR-N371 sin infra propietaria.
- Jobs nocturnos transaccionales con los datos de negocio (atomicidad de facturación recurrente).

### 4.2 Negativas / trade-offs

- Monolito exige disciplina de modularización; riesgo de acoplamiento si no se respetan fronteras de dominio.
- RLS latente significa políticas escritas pero inactivas en MVP; debe verificarse que estén correctas antes de activar multi-org (riesgo de fuga de datos al añadir la 2ª organización).
- tRPC no es ideal para integraciones externas; se necesita adaptador REST para PAC y descargas firmadas.
- Sin OAuth en MVP: usuarios internos con credenciales locales. Aceptado por DEC-FUN-21.

### 4.3 Reversibilidad

- **Stack:** reversible en su totalidad; cambiar ORM/API/auth no rompe contrato funcional (sólo implementación).
- **Forma de despliegue:** el monolito modular puede extraer un servicio (p.ej. facturación/PAC) si el volumen lo justifica, sin romper el contrato tRPC interno (se reemplaza por REST manteniendo tipos).
- **Multi-tenancy:** activar RLS es un switch + migración de políticas, no un rediseño.

---

## 5. Contratos que quedan fijados por este ADR

1. **`hasPermission(code)`** es el único mecanismo de verificación de autorización de acciones. Nada de `if (user.role === 'director')` (DEC-FUN-02, BR-N205).
2. **`organization_id`** en toda entidad de negocio (DEC-FUN-46, BR-N200). Multi-tenancy por columna + RLS latente.
3. **Estados canónicos** viven en una única fuente (`shared/enums`) y son los del discovery: Proyecto (3 dimensiones), Módulo, Requerimiento, Tarea, Prueba, Entregable, Cambio, Cotización, OS, Factura, Cobro, Comisión, Movimiento. No se inventan sin `DISCOVERY-GAP`.
4. **Jobs nocturnos** corren vía pg-boss; cada job es idempotente y auditable.
5. **Archivos** via S3-compatible con enlaces firmados; nada de blobs en BD.
6. **Auditoría** obligatoria en acciones críticas (BR-N336) vía tabla `audit_logs`.

---

## 6. Restricciones para SPECs derivadas

- Toda SPEC posterior debe referenciar este ADR para stack, auth, multi-tenancy, jobs y archivos.
- Toda SPEC que añada un estado debe citar el ID funcional de origen (DEC/BR) y registrarlo en la fuente única de enums.
- Toda SPEC que toque seguridad o secretos debe referenciar ADR-20260817-03.
- Toda SPEC que toque multi-tenancy debe referenciar ADR-20260817-02.
- **(v1.2, SOL-20260819-01) Arquitectura hexagonal ligera:** toda SPEC de dominio (002–011) ubica **reglas de negocio y consultas en servicios de aplicación reutilizables** independientes del transporte; tRPC y UI son adaptadores (no contienen reglas exclusivas); DTOs Zod reutilizables; identidad/organización/permisos vía `Context` abstracto; `hasPermission`/`canAccessResource`/auditoría en el servicio; resultados sin filas Drizzle; soporte interno de idempotencia/correlación cuando el dominio lo requiera; **sin endpoints REST públicos ni `/api/v1` en V1**. Ver §10.5 y AC-26..AC-34 de SPEC-20260817-001.
- **(v1.3, ADR-20260819-03) Sistema de interfaz:** toda SPEC de dominio (002–011) declara sus pantallas como consumidores de servicios vía tRPC (la UI no accede a BD — AC-26); usa exclusivamente Tailwind + shadcn/ui con los tokens de tema VectorIA; garantiza paridad operativa móvil/tableta/escritorio (sin degradar acción a consulta por viewport); cita ADR-20260819-03 y SPEC-001 AC-42..AC-68 para tablas, forms, builders, validaciones, modales y flujos E2E por viewport.

---

## 7. Pendientes

- Decisión de proveedor de bucket S3 en producción (Frank decide coste/infra; es acción irreversible de compra, no de SPEC).
- Decisión de hosting (VPS Contabo existente vs otro) — fuera de SPEC, decisión de Frank.
- Activación real de RLS multi-org cuando aparezca la 2ª organización — no en MVP.

---

## 8. Referencias cruzadas

- Derivado de: `discovery/HANDOFF-FUNCIONAL-A-INTEGRA.md` §3 (no existe stack decidido).
- Relacionado: ADR-20260817-02 (multi-tenancy y aislamiento), ADR-20260817-03 (secretos y cifrado), **ADR-20260819-03 (sistema de interfaz UI, v1.3)**.
- Aplica a SPEC: SPEC-20260817-001 (Plataforma Base) y transversal a todas las SPECs.

---

## 9. Addendum v1.1 (2026-08-18)

El stack base queda validado por Frank. La v1.1 no cambia el stack; profundiza 7 áreas que se materializan en ADRs derivados y en SPEC-001 v1.1:

| Corrección v1.1 | ADR que la materializa | Estado |
|---|---|---|
| Bootstrap y semilla inicial | ARCH-20260817-04 (nuevo) | proposed |
| Autorización a nivel de recurso | ARCH-20260817-05 (nuevo) | proposed |
| Aislamiento relacional multi-org | ARCH-20260817-02 v1.1 (profundizado) | proposed |
| Contrato crypto y ciclo de vida del CSD | ARCH-20260817-03 v1.1 (profundizado) | proposed |
| Ciclo completo de autenticación y sesiones | ARCH-20260817-06 (nuevo) | proposed |
| Política de jobs, reintentos y DLQ | ARCH-20260817-07 (nuevo) | proposed |
| Contradicción roles seed (BR-N127 vs DEC-FUN-02) | DISCOVERY-GAP-20260818-01 (emitido a ATLAS) | BLOCKED |

Contratos que la v1.1 añade sobre ADR-01 (sin romper los de §5):

- `hasPermission(code)` sigue siendo el único mecanismo de verificación de **acción** (DEC-FUN-02, BR-N205). La v1.1 añade, a nivel de **recurso**, `canAccessResource(ctx, resource)` que opera **encima** de `hasPermission` y resuelve ownership/asignación/herencia (ADR-05). No lo reemplaza: una acción sobre un recurso requiere `hasPermission(action_code) AND canAccessResource(resource)`.
- El ciclo de auth se formaliza en ADR-06 (login, refresh, logout, recuperación, cambio de email con verificación, invitación firmada, expiración, detección de sesión sospechosa, bitácora de auth). Sigue siendo credenciales locales + JWT httpOnly + link de invitación (DEC-FUN-21).
- pg-boss se mantiene; la v1.1 añade política de reintentos/backoff/DLQ/alertas en ADR-07. Idempotencia por `job_key` ya fijada en §5.

Restricciones para SPECs se mantienen (§6) y se amplían: toda SPEC que toque autorización por recurso cita ADR-05 y BR-N207 a -212; toda SPEC que toque jobs nocturnos cita ADR-07.

---

## 10. Addendum v1.2 (2026-08-19) · Arquitectura hexagonal ligera y diferimiento de API pública a V2

**Fuente de la decisión:** `context/interconsultas/DICTAMEN_SOL-SOL-20260819-01.md` §14–§15 (Frank confirmó). Trazabilidad: **SOL-20260819-01**.

### 10.1 Decisión formal

V1 adopta una **arquitectura hexagonal ligera** (ports & adapters) sobre el monolito modular: los casos de uso viven en **servicios de aplicación** independientes del transporte y de los adaptadores. **No** se introducen microservicios. V1 **no** implementa API externa pública, OpenAPI, MCP ni autenticación para consumidores IA; V1 **sí** conserva las fronteras internas que permiten añadir esos adaptadores en V2 sin reescribir reglas de negocio.

### 10.2 Capas (contrato organizativo, no scaffolding)

| Capa | Responsabilidad | Restricción |
|---|---|---|
| Adaptadores de transporte (in) | tRPC (web interna), Route Handlers (webhooks receptores). | No contienen reglas de negocio exclusivas; delegan al servicio. |
| Adaptadores de integración (out) | Clientes PAC (SPEC-007), cliente S3/MinIO, cliente pg-boss. | No contienen reglas de negocio; traducen protocolo. |
| Servicios de aplicación | Casos de uso, reglas de negocio, orquestación de adaptadores out. | Independientes del transporte; no importan `next`, `react`, `@/server/trpc`, ni leen `cookies()`/`headers()`. Reciben un `Context` abstracto. |
| Adaptadores de persistencia | Drizzle (esquemas + consultas). | Los servicios lo consumen; la UI nunca lo toca directamente. |

> Esta capa es la traducción contractual de `src/` en §3.1: `src/server/services/` aloja los servicios de aplicación; `src/server/trpc/` y `src/server/db/` son adaptadores. SOFIA decide estructura interna reversible dentro de la SPEC; INTEGRA fija la frontera y las restricciones.

### 10.3 Invariantes (9) formalizados como contratos (espejo de SPEC-001 AC-26..AC-34)

1. Los componentes de interfaz no acceden directamente a Drizzle ni a PostgreSQL. → AC-26.
2. Los casos de uso se implementan en servicios de aplicación independientes del transporte. → AC-27.
3. tRPC es un adaptador interno y no contiene reglas de negocio exclusivas. → AC-28.
4. Los DTOs y validaciones de entrada/salida usan esquemas Zod reutilizables. → AC-29.
5. AuthN/AuthZ se recibe mediante un `Context` abstracto (usuario, organización, permisos); no queda acoplado a cookies de navegador dentro de los servicios. → AC-30.
6. `hasPermission`, `canAccessResource`, autorización por campo y auditoría se ejecutan en el servicio, no sólo en el adaptador tRPC. → AC-31.
7. Los resultados de negocio no exponen filas Drizzle directamente. → AC-32.
8. Las operaciones con efectos reciben soporte interno para idempotencia y correlación cuando su dominio lo requiera, aunque V1 no publique un contrato externo. → AC-33.
9. Ninguna SPEC V1 diseña endpoints REST externos especulativos ni promete compatibilidad pública. → AC-34.

### 10.4 Reconciliación de §2.5 / §3 (desambiguación de "API externa")

El término "API externa" del ADR v1.1 se desambigua en V1/V2:

- **Integraciones salientes (V1):** cliente HTTP al PAC FacturoPorTi (SPEC-007) y cliente S3-compatible. Son adaptadores out, no API pública.
- **Receptores entrantes (V1):** Route Handlers para descarga de archivos firmados y webhooks de estado del PAC. Pertenecen a la web interna; no constituyen un contrato público versionado.
- **API pública externa (V2, diferida):** REST/OpenAPI versionado `/api/v1`, adaptador MCP remoto, OAuth/credenciales delegadas para consumidores IA y rate limits externos. V2 la diseña a partir de casos de uso y datos reales de los dominios que exponga.

### 10.5 Regla transversal para SPEC-002…SPEC-011

Toda SPEC de dominio (002–011) debe:

- Ubicar **reglas de negocio y consultas en servicios de aplicación reutilizables** (`src/server/services/<dominio>/` o equivalente), no en routers tRPC ni en componentes de UI.
- Declarar DTOs Zod de entrada/salida **reutilizables por futuros adaptadores** (tRPC hoy; REST/OpenAPI/MCP en V2).
- Recibir identidad, organización y permisos vía el `Context` abstracto de SPEC-001, no leyendo cookies/headers.
- Reutilizar `hasPermission`/`canAccessResource`/`audit` de SPEC-001 dentro del servicio.
- **No** diseñar endpoints REST públicos ni prometer compatibilidad pública (V2).

### 10.6 Exclusiones explícitas de V1

Quedan **fuera de V1**: OAuth para terceros, API keys de integración para consumidores externos, REST público, servidor MCP, despliegue externo dedicado al API, rate limits externos y versionado `/api/v1`. Su diseño e implementación son V2.

### 10.7 Unidad V2 registrada (no diseñada)

Se registra en `PROYECTO.md` §5.4 una unidad V2 en `BACKLOG`: "API externa/OpenAPI + auth delegada + MCP", dependiente de los dominios que exponga. V2 no tiene endpoints ni contrato definitivo en este pase; se diseña cuando existan casos de uso y datos reales (mínimo SPEC-007 Facturación y SPEC-008 Cobranza).

### 10.8 Consecuencias

- **Positivas:** evita fijar un contrato público prematuro; las reglas de negocio sobreviven intactas al añadir adaptadores en V2; el `typecheck` sigue siendo contrato.
- **Negativas:** requiere disciplina de capa (verificada por AC-26..AC-34); un adaptador REST futuro deberá traducir DTOs, no duplicar lógica.
- **Reversibilidad:** alta; añadir/quitar un adaptador de transporte no rompe el servicio.

### 10.9 Referencias

- Decisión fuente: `DICTAMEN_SOL-SOL-20260819-01.md` §13 (preparación), §14 (fase V1/V2), §15 (decisión formal + 9 invariantes + entregables a INTEGRA).
- Espejo operativo: SPEC-20260817-001 v1.2 (AC-26..AC-34 + reglas 22–30 + `Context` en §4.2).
- Cola técnica: PROYECTO.md §5.4 (unidad V2 BACKLOG).
