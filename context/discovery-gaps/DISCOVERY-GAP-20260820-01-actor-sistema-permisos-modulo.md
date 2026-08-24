# DISCOVERY-GAP-20260820-01 · Actor sistema (bootstrap) + permisos de módulo en semilla de plataforma

- **ID:** DISCOVERY-GAP-20260820-01
- **Origen:** INTEGRA (emitido al detectar P1-2/P1-3 de QA-20260820-01)
- **Estado:** ✅ RESUELTO / CERRADO (Frank · 2026-08-20)
- **SPEC/ARCH afectada:** SPEC-20260817-001 (v1.6 → v1.7), ADR-20260817-04 (v1.2 → v1.3)
- **IDs funcionales relacionados:** DEC-FUN-20260820-74 / BR-N412, DEC-FUN-20260820-75 / BR-N413
- **Auditoría de origen:** `context/reviews/QA-20260820-01-plataforma-base.md` (P1-2, P1-3)
- **Checkpoint funcional:** `discovery/FUNCTIONAL-BASELINE.md` v1.12, `discovery/INDEX.md` 2026-08-20

---

## 1. Contradicción o faltante

Dos decisiones de producto que INTEGRA no podía inferir y que bloqueaban el paquete de fixes IMPL-20260820-02:

### P1-2 · Actor sistema de la primera invitación (FK violada)

`scripts/seed-plataforma.ts:39-40` emite la primera invitación del Director con `createdByUserId: "00000000-0000-0000-0000-000000000000"` (UUID cero). Pero `invitations.created_by` es `FK→users NOT NULL` (`src/server/db/schema/invitations.ts`). Contra BD real, el INSERT lanza violación de integridad referencial: no existe el usuario cero.

INTEGRA no podía decidir entre:
- **(A)** hacer `invitations.created_by` nullable (permite `null` para la invitación fundacional) — debilita la trazabilidad del actor emisor.
- **(B)** crear y conservar un **actor técnico persistido** (SuperUser) en el bootstrap, **antes** de emitir la primera invitación, y referenciarlo como `created_by`.

### P1-3 · Permiso `registrar_tiempo` en la semilla de plataforma (matriz incompleta)

`scripts/seed-data.ts:11` asigna `programador = ["registrar_tiempo"]`, pero `registrar_tiempo` **no** está en `BASE_PERMISSIONS` (`src/shared/enums/index.ts:134-150`). `seed-plataforma.ts:32` lo salta (`permissionByCode.get(...)` → `undefined` → `continue`), dejando a `programador` sin permisos sembrados (AC-38(c) insatisfacible).

INTEGRA no podía decidir si `registrar_tiempo` (y por extensión los permisos de módulos de negocio) debían:
- **(A)** declararse y sembrarse en la plataforma base (centralizando todos los permisos), o
- **(B)** declararse/sembrarse **por módulo** cuando cada SPEC de módulo (002–011) se implemente, dejando la plataforma con **sólo sus permisos propios**.

---

## 2. Por qué impide especificar / implementar

Sin la decisión de producto, SOFIA no podía escribir el fix de P1-2 (la forma del `created_by` es contrato, no invención reversible) ni de P1-3 (el catálogo de permisos de plataforma vs. módulo es una decisión de frontera funcional). Ambos eran `DISCOVERY-GAP` (devueltos a ATLAS/Frank), no `SPEC-GAP` internos.

---

## 3. Resolución de Frank (2026-08-20)

### P1-2 → DEC-FUN-20260820-74 / BR-N412 (opción B)

> El bootstrap crea y conserva un **usuario técnico SuperUser**, correo `contacto@vector-ia.mx`, **antes de emitir la primera invitación**. Es actor trazable. La contraseña inicial es **secreto pendiente**: INTEGRA/SOFIA **no** deben inventarla, documentarla ni exponerla.

- Se adopta la **opción B** (actor semilla persistido). `invitations.created_by` **permanece `NOT NULL`** y referencia al SuperUser; no se hace nullable, no se usa UUID cero.
- El SuperUser es una fila real de `users` (+ `credentials` Argon2id) creada en `db:seed:plataforma`, previa a la emisión de la invitación del Director.
- La contraseña inicial se consume de un **secreto de bootstrap** (variable de entorno `VECTORIA_SUPERUSER_PASSWORD`, contrato que fija INTEGRA en SPEC-001 v1.7 §4.2/§8 y ADR-04 v1.3 §2.2/§2.3). El **valor** es de Frank (provisionamiento); el **nombre/formato** es contrato INTEGRA. Si el secreto falta, el bootstrap **falla seguro** (exit !=0, nombra la variable, nunca imprime el valor) — sin crear el SuperUser con contraseña fabricada.
- El SuperUser es **conservado** (upsert idempotente por `(organization_id, email)`); re-ejecutar bootstrap no lo duplica ni lo reescribe.

### P1-3 → DEC-FUN-20260820-75 / BR-N413 (opción B)

> La Plataforma Base siembra **sólo permisos propios**; cada módulo declara/siembra sus permisos al implementarse. `registrar_tiempo` se difiere a SPEC-006.

- Se adopta la **opción B** (permisos por módulo). La plataforma siembra **únicamente** los permisos listados en `BASE_PERMISSIONS` (`shared/enums/index.ts`), que son permisos **de la propia plataforma** (`gestionar_usuarios`, `gestionar_roles`, etc.).
- `registrar_tiempo` **no** se declara ni siembra en la plataforma. Se difiere a **SPEC-006 (Proyectos — equipo y ejecución)**, que declarará y sembrará el permiso `registrar_tiempo` (junto con los demás permisos de Proyectos/ejecución) al implementarse.
- En consecuencia, `SEED_ROLE_PERMISSION_CODES.programador` en la semilla de plataforma queda `[]` (sin permisos sembrados por la plataforma); SPEC-006 añadirá `registrar_tiempo` a `programador` cuando se implemente. AC-38(c) se reformula: la plataforma **no** garantiza `programador` con `registrar_tiempo`; eso es contrato de SPEC-006.

---

## 4. Consecuencias técnicas (materializadas por INTEGRA en SPEC-001 v1.7 + ADR-04 v1.3)

1. **AC-79 (nuevo):** bootstrap crea/conserva SuperUser `contacto@vector-ia.mx` antes de la primera invitación; consume `VECTORIA_SUPERUSER_PASSWORD`; fail-safe si ausente; sin secreto en logs/respuestas/audit.
2. **AC-80 (nuevo):** la plataforma siembra sólo permisos propios (`BASE_PERMISSIONS`); los permisos de módulo se declaran/sembran por SPEC; `registrar_tiempo` → SPEC-006.
3. **AC-37 reformulado:** `db:seed:plataforma` siembra también el SuperUser (antes de la invitación); la invitación del Director lleva `created_by = SuperUser.id` (no UUID cero).
4. **AC-38 reformulado:** la matriz sembrada por la plataforma usa **sólo** `BASE_PERMISSIONS`; `programador = []` en plataforma; `registrar_tiempo` es de SPEC-006.
5. **`env.ts` (contrato):** `VECTORIA_SUPERUSER_PASSWORD` se añade al `EnvSchema` (Zod) como obligatorio no-vacío; `listRequiredVars()` y `deps-check` lo validan (fail-safe, sin valor).
6. **Sin secreto inventado/documentado/expuesto** en SPEC, ADR, handoff ni PROYECTO.md — sólo el **nombre** de la variable y el **formato** esperado.

---

## 5. Consecuencias de cada opción (registradas para trazabilidad)

- **Opción A (P1-2, `created_by` nullable):** habría debilitado la trazabilidad del emisor de la invitación fundacional y exigido un `NULL` excepcional en una columna `NOT NULL` por contrato. **Descartada** por Frank.
- **Opción B (P1-2, SuperUser persistido):** conserva `created_by NOT NULL`, da actor trazable, y centraliza el actor técnico de sistema. **Adoptada.** Trade-off: requiere un secreto de bootstrap (Frank) y disciplina para no exponerlo.
- **Opción A (P1-3, permisos centralizados en plataforma):** habría concentrado todos los permisos de todos los módulos en la SPEC fundacional, acoplando la plataforma a módulos no implementados. **Descartada** por Frank.
- **Opción B (P1-3, permisos por módulo):** cada SPEC declara/siembra sus permisos; la plataforma queda desacoplada y coherente. **Adoptada.** Trade-off: `programador` queda sin permisos sembrados hasta SPEC-006 (aceptable: el AC de plataforma es "login operativo", no "ejecución de proyectos").

---

## 6. Cierre

- **Estado:** ✅ RESUELTO / CERRADO.
- **Desbloquea:** el paquete IMPL-20260820-02 (P1-2 y P1-3 ahora son contratos implementables, no bloqueos).
- **Devuelve a SOFIA:** las restricciones "No implementar P1-2/P1-3 hasta resolver DISCOVERY-GAP-20260820-01" del SPEC-HANDOFF IMPL-20260820-02 §8 quedan **levantadas**; sustituidas por instrucciones concretas (SuperUser + permisos propios).
- **No se reabre** salvo que Frank rectifique DEC-FUN-74/75.
