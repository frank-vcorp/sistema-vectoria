# ADR-20260817-01 · Arquitectura y stack fundacional

- **ID:** ARCH-20260817-01
- **Estado:** accepted
- **Versión:** 1.0
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-17
- **Fuentes funcionales:** `discovery/FUNCTIONAL-BASELINE.md` v1.0 §1, §3, §4; `discovery/HANDOFF-FUNCIONAL-A-INTEGRA.md` §3; `discovery/DECISIONES-FUNCIONALES.md` DEC-FUN-01, DEC-FUN-02, DEC-FUN-21, DEC-FUN-29, DEC-FUN-41, DEC-FUN-46, DEC-FUN-50; `discovery/REGLAS-DE-NEGOCIO.md` BR-N147, BR-N201, BR-N202, BR-N203, BR-N205, BR-N276, BR-N310, BR-N349, BR-N371, BR-N372, BR-N373, BR-N374; `discovery/ACTORES-Y-PERMISOS.md` §1, §5.

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

> **Decisión compuesta:** tRPC para todo contrato interno tipado; un adaptador REST/OpenAPI mínimo para integraciones externas (PAC FacturoPorTi, descarga de archivos firmados, webhooks futuros).

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
| API externa | Adaptador REST mínimo para PAC FacturoPorTi (DEC-FUN-50), descarga de archivos firmados y webhooks futuros. |
| Auth | **A.** Credenciales locales (email + password Argon2id), sesión JWT httpOnly `Secure; SameSite=Strict`, link de invitación firmado (DEC-FUN-21). Sin OAuth en MVP. |
| Jobs | **A.** `pg-boss` sobre Postgres: facturación recurrente nocturna (BR-N310), comisiones día 15 (BR-N299), ZIP contador mensual (BR-N311), respaldo BD diario 30 días (BR-N147), SLA cotización 48 h (BR-N240), escalamiento de cobranza tras 2 promesas (BR-N313). |
| Archivos | **A.** S3-compatible (MinIO en dev, bucket dedicado en prod). Acceso vía enlaces firmados (BR-N371). Validación tipo+tamaño al subir (BR-N372). |
| Validación | **A.** Zod compartido entre Drizzle (inferencia), tRPC y formularios. |
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

---

## 7. Pendientes

- Decisión de proveedor de bucket S3 en producción (Frank decide coste/infra; es acción irreversible de compra, no de SPEC).
- Decisión de hosting (VPS Contabo existente vs otro) — fuera de SPEC, decisión de Frank.
- Activación real de RLS multi-org cuando aparezca la 2ª organización — no en MVP.

---

## 8. Referencias cruzadas

- Derivado de: `discovery/HANDOFF-FUNCIONAL-A-INTEGRA.md` §3 (no existe stack decidido).
- Relacionado: ADR-20260817-02 (multi-tenancy y aislamiento), ADR-20260817-03 (secretos y cifrado).
- Aplica a SPEC: SPEC-20260817-001 (Plataforma Base) y transversal a todas las SPECs.
