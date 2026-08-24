# ADR-20260817-03 · Secretos, cifrado y credenciales sensibles

- **ID:** ARCH-20260817-03
- **Estado:** accepted (ratificado por Frank · OK stack V1 completo · 2026-08-20)
- **Versión:** 1.1
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-17 (v1.0) · 2026-08-18 (v1.1)
- **Motivo del estado v1.1:** la base de crypto (v1.0: `MASTER_KEY` env, AES-256-GCM, AAD contextual, Argon2id, S3 firmado) **se mantiene**. La v1.1 **formaliza el contrato de cifrado** (AAD canónico, versionado de llave, rotación de `MASTER_KEY`, auditoría de operaciones crypto sin texto plano) y define el **ciclo de vida del CSD** de FacturoPorTi (carga, validación, rotación, revocación). Refinamiento a la espera del OK de Frank al stack v1.1. ✅ **Ratificado por Frank (OK stack V1 completo, 2026-08-20) → `accepted`**; esta ratificación deja sin efecto el «a la espera del OK de Frank al stack v1.1».
- **Fuentes funcionales:** `discovery/DECISIONES-FUNCIONALES.md` DEC-FUN-10, DEC-FUN-50; `discovery/REGLAS-DE-NEGOCIO.md` BR-N201, BR-N302, BR-N371, BR-N372, BR-N336, BR-N337; `discovery/HALLAZGOS.md` H-20260817-04; `discovery/HANDOFF-FUNCIONAL-A-INTEGRA.md` §2.

---

## 1. Contexto

El sistema timbra CFDI 4.0 directamente vía FacturoPorTi (DEC-FUN-50, BR-N301). Para ello debe conservar:

- Certificado de Sello Digital (CSD): `.cer` + `.pem` (llave privada) + contraseña del CSD.
- API key del PAC FacturoPorTi.

BR-N302 exige que CSD y llave del PAC se guarden "de forma protegida". BR-N201 reserva la edición al Director con auditoría. Adicionalmente, el sistema maneja:

- Evidencias comerciales (correo/PDF de aceptación de cotización y entregables, DEC-FUN-55).
- Comprobantes de cobro (BR-N319).
- XML y PDF de CFDI (BR-N304).
- Archivos vinculados a cualquier entidad (BR-N340).

Todos requieren acceso restringido vía enlaces firmados (BR-N371) y validación de tipo/tamaño al subir (BR-N372). Ningún secreto puede exponerse en logs, respuestas API o respaldos sin cifrar.

---

## 2. Opciones consideradas

### 2.1 Almacenamiento del secreto maestro

| Opción | Pros | Contras |
|---|---|---|
| **A. Variable de entorno `MASTER_KEY` (32 bytes, AES-256-GCM)** inyectada al proceso, nunca en BD | Estándar, soportado por todos los runtimes, rotable | Requiere proceso de rotación documentado |
| B. KMS externo (AWS/GCP) | Rotación gestionada | Dependencia externa y coste; fuera de alcance MVP (una sola org en México) |
| C. Secreto en BD sin KMS | Simple | Auto-referencia; no protege si comprometen la BD |

### 2.2 Cifrado de campos sensibles

| Opción | Pros | Contras |
|---|---|---|
| **A. AES-256-GCM por campo, con nonce aleatorio y AAD = `organization_id + campo`** | Confidencialidad + integridad +AAD ata al secreto a su contexto | Gestión de nonce obligatoria (no reutilizar) |
| B. Cifrado simétrico sin AAD | Simple | No ata el secreto al contexto; swapping risk |
| C. Hash reversible | N/A | No aplica |

### 2.3 Archivos sensibles (CSD `.cer`/`.pem`, evidencias, XML/PDF CFDI)

| Opción | Pros | Contras |
|---|---|---|
| **A. S3-compatible + enlaces firmados TTL corto (BR-N371) + cifrado en reposo del bucket** | Cumple BR-N371/372; acceso audituable | Configuración de bucket |
| B. Filesystem local cifrado | Cero infra | Sin enlaces firmados, acoplado al nodo, sin rotación |
| C. Cifrado de contenido en app + S3 | Defensa extra | Complejidad; la encripción del bucket es suficiente en MVP |

### 2.4 Contraseña de usuario

| Opción | Pros | Contras |
|---|---|---|
| **A. Argon2id (memoria 64 MiB, iteraciones 3, paralelismo 4)** | Estándar moderno, resistente a GPU | Uso de memoria controlado |
| B. bcrypt | Conocido | Menos resistente a GPU, parámetro más bajo |
| C. scrypt | Bueno | Menos adoptado en TS |

---

## 3. Decisión

### 3.1 Secreto maestro y cifrado de campos

- **Opción A.** `MASTER_KEY` en variable de entorno (32 bytes base64, inyectada por el entorno de despliegue). Nunca en BD, nunca en logs, nunca en respuestas.
- Cifrado **AES-256-GCM** por campo sensible, con:
  - nonce aleatorio de 12 bytes por operación (jamás reutilizado con la misma llave),
  - AAD = `organization_id` + `tabla` + `campo` (ata el cifrado a su contexto, previene swapping),
  - almacenamiento del `nonce + ciphertext + tag` juntos.
- Campos sensibles cifrados: API key PAC, contraseña del CSD, contenido del `.pem` (llave privada), y cualquier otro secreto que una SPEC marque como `sensitive`.
- Rotación de `MASTER_KEY`: procedimiento documentado (re-cifrar todos los campos sensibles con llave nueva, atomicidad por transacción por organización). **No se ejecuta en MVP sin autorización de Frank.**

### 3.2 Archivos sensibles

- **Opción A.** S3-compatible (MinIO en dev, bucket dedicado en prod) con:
  - cifrado en reposo del bucket (SSE-S3 mínimo),
  - acceso vía enlace firmado TTL ≤ 15 minutos (BR-N371),
  - validación de tipo MIME y tamaño al subir (BR-N372), con allowlist de tipos (p.ej. `application/pdf`, `text/xml`, `application/octet-stream` para `.cer`/`.pem`, imágenes de evidencia),
  - ningún acceso directo por URL pública.
- Los `.cer`, `.pem`, XML y PDF de CFDI, comprobantes de cobro y evidencias viven en el bucket; la BD guarda sólo metadatos (`bucket_key`, `mime`, `size`, `sha256`, `uploaded_by`, `created_at`).
- La contraseña del CSD se cifra con AES-256-GCM (campo en BD); el `.pem` se guarda en el bucket cifrado en reposo; **nunca** se loguea la contraseña.

### 3.3 Contraseñas de usuario

- **Opción A.** Argon2id con parámetros `m=64 MiB, t=3, p=4` (revisable según benchmark del entorno).
- Política mínima de contraseña: 12 caracteres, mix de clases. Bloqueo tras N intentos fallidos configurable (default 5) con ventana móvil.
- Reset de contraseña sólo vía link de invitación firmado (DEC-FUN-21); nunca se envía por canal externo en MVP (DEC-FUN-29).

### 3.4 Auditoría de secretos

- Toda lectura/escritura de campos sensibles y de archivos sensibles registra en `audit_logs`: actor, entidad, acción, momento. **Nunca** el valor del secreto.
- La edición de configuración fiscal (BR-N201) por el Director queda en `audit_logs` con before/after de campos no sensibles; los campos sensibles se registran como "cambiado" sin valor.

### 3.5 Logs y errores

- Logger con allowlist de campos: jamás loguea `MASTER_KEY`, password, contraseña CSD, API key PAC, contenido de `.pem`, ni XML/PDF CFDI.
- Errores de PAC y de descompresión/validación CFDI se loguean con `requestId` y mensaje sanitizado.

---

## 4. Consecuencias

### 4.1 Positivas

- Cumple DEC-FUN-50, BR-N302, BR-N201, BR-N371, BR-N372.
- Cifrado por campo con AAD reduce riesgo de swapping entre organizaciones.
- Sin dependencia de KMS externo en MVP; migración a KMS es reversibilidad futura.
- Enlaces firmados satisfacen aislamiento de archivos sin infra propietaria.

### 4.2 Negativas / trade-offs

- Rotación de `MASTER_KEY` requiere procedimiento manual documentado; no automatizado en MVP.
- RLS latente + cifrado por campo: si el `MASTER_KEY` se pierde, los secretos son irrecuperables. Mitigación: respaldo de la llave fuera de línea en sitio seguro (procedimiento operativo de Frank, fuera de SPEC).

### 4.3 Reversibilidad

- Migración a KMS externo más adelante: transparente para el contrato funcional; sólo cambia la fuente de la llave.
- Cambio de Argon2id a otra función: sólo rehash en próximo login.

---

## 5. Contratos fijados

1. Ningún secreto en logs, respuestas API, ni respaldos no cifrados.
2. Cifrado de campos sensibles: AES-256-GCM, nonce único, AAD contextual.
3. Archivos: S3-compatible, enlaces firmados TTL ≤ 15 min, validación tipo+tamaño, sin acceso público.
4. Contraseñas: Argon2id, política mínima, bloqueo tras N intentos, reset por link firmado.
5. Auditoría de acceso a secretos sin valor del secreto.

---

## 6. Restricciones para SPECs

- SPEC-001 (Plataforma Base) define servicio de cifrado (`crypto`), servicio de archivos (`files`), políticas de contraseña, `audit_logs` de secretos.
- SPEC de Facturación (CFDI) referenciará este ADR para CSD, API key PAC, XML/PDF.
- SPEC de Comercial referenciará para evidencias de aceptación (DEC-FUN-55).
- SPEC de Cobranza referenciará para comprobantes de cobro.

---

## 7. Pendientes

- Decisión operativa (Frank, fuera de SPEC): dónde guardar el respaldo fuera de línea de `MASTER_KEY`.
- Decisión de proveedor de bucket S3 en prod (Frank).

---

## 8. Referencias cruzadas

- Derivado de: DEC-FUN-10, DEC-FUN-50, H-20260817-04.
- Relacionado: ADR-20260817-01 (stack), ADR-20260817-02 (multi-tenancy).
- Aplica a: SPEC-20260817-001 y a SPEC de Facturación/Comercial/Cobranza.

---

## 9. Addendum v1.1 (2026-08-18) · Contrato crypto formal + ciclo de vida del CSD

### 9.1 Contrato de cifrado formalizado

v1.0 fijó AES-256-GCM con AAD = `organization_id + tabla + campo`. v1.1 lo **formaliza** para que sea verificable y reproducible:

- **AAD canónico (determinista):** el AAD se construye como la cadena `"{organization_id}|{schema}.{table}|{column}"` (p.ej. `"a1b2...|public.organization_fiscal_config|pac_api_key"`). Es determinista: el mismo `(org, tabla, campo)` produce siempre el mismo AAD. Esto cierra el riesgo de "AAD mal construido" en distintos puntos del código.
- **Nonce:** 12 bytes aleatorios por operación, **jamás reutilizado con la misma llave**. Se persiste junto al ciphertext.
- **Formato de almacenamiento:** `key_version:u8 || nonce:12B || ciphertext || tag:16B` (campo `bytea`). El `key_version` (1 byte) permite rotación: al descifrar, se selecciona la llave por versión.
- **Llaves versionadas:** `MASTER_KEY` deja de ser un único valor; es un **anillo de llaves** `MASTER_KEY_V1`, `MASTER_KEY_V2`, … inyectadas como variables de entorno `MASTER_KEY_V<n>`. Una llave es **activa** (la que cifra nuevas escrituras); las anteriores son **legacy** (sólo descifran, para lecturas de datos antiguos). Nunca se borra una llave legacy hasta que todos sus campos hayan sido re-cifrados con la activa.
- **Rotación de `MASTER_KEY`:** procedimiento documentado, **no automatizado en MVP sin autorización de Frank** (§7 pendientes). Pasos: (1) añadir `MASTER_KEY_V<n+1>` al entorno; (2) marcarla activa; (3) ejecutar job de re-cifrado que, **por organización y en una transacción**, descifra cada campo sensible con la legacy y lo re-cifra con la activa, actualizando `key_version`; (4) al concluir, auditar que no quedan campos con `key_version` legacy; (5) retirar la llave legacy del entorno. Si la transacción por org falla, se rollback y esa org se marca `BLOCKED (rotación-incompleta)`; las demás orgs no se ven afectadas.
- **Auditoría de operaciones crypto:** toda `crypto.encrypt`/`crypto.decrypt` sobre un campo sensible registra en `audit_logs`: `actor_user_id`, `entity_type`, `entity_id`, `action` (`crypto.encrypt`/`crypto.decrypt`/`crypto.rotate`), `key_version`, `created_at`. **Nunca** el valor del campo, ni el nonce, ni la llave. El `reason` explica la operación (p.ej. `fiscal_config.update`, `csd.load`, `csd.rotate`, `master_key.rotate`).

### 9.2 Ciclo de vida del CSD de FacturoPorTi

El CSD (Certificado de Sello Digital) es el material criptográfico que el SAT entrega a la organización para timbrar CFDI 4.0 (DEC-FUN-50, BR-N301, BR-N302). Sus tres componentes: `.cer` (certificado público), `.pem` (llave privada), contraseña del CSD. v1.1 define su ciclo de vida **completo**:

| Estado del CSD | Significado | Quién lo mueve | Timbrado permitido |
|---|---|---|---|
| `pending_validation` | Cargado, sin validar | Director al subir | No |
| `active` | Validado y vigente (fecha SAT no vencida) | Director tras validación | Sí |
| `superseded` | Reemplazado por un CSD más nuevo; conservado para consulta/cancelación de CFDI anteriores | Director al rotar | No (sólo consulta) |
| `revoked` | Revocado manualmente (compromiso sospechado, o SAT lo revocó) | Director | No |
| `expired` | Fecha de vigencia SAT vencida | Job nocturno `csd-expiry-check` | No |

**Carga (`csd.load`):**
- El Director (único, BR-N201) sube `.cer`, `.pem` y contraseña. La contraseña se cifra con AES-256-GCM (AAD canónico `org|organization_fiscal_config|csd_password`); el `.pem` y `.cer` van al bucket S3 cifrado en reposo (BR-N372 validación de tipo/tamaño).
- **Validación:** el sistema valida que el `.cer` y el `.pem` corresponden (la llave privada firma un reto y el certificado lo verifica), que el RFC del certificado coincide con el `organization_fiscal_config.rfc`, y que la vigencia SAT es futura. Si no pasa, queda `pending_validation` con el motivo.
- Sólo tras validación pasa a `active`. Cita DEC-FUN-50, BR-N302, BR-N301.

**Rotación (`csd.rotate`):**
- El SAT rota el CSD periódicamente (típicamente anual). El Director carga el nuevo CSD; al pasar a `active`, el anterior pasa a `superseded` (no se borra: se necesita para cancelar CFDI emitidos con él, BR-N305).
- El timbrado siempre usa el CSD `active` vigente.

**Revocación (`csd.revoke`):**
- Si se sospecha compromiso, el Director revoca el CSD activo → `revoked`. El timbrado se bloquea con error `CSD_REVOKED`. Queda en `audit_logs` con `reason`. Se conserva para evidencia.
- Cargar un nuevo CSD es el camino de recuperación.

**Expiración:**
- Job nocturno `csd-expiry-check` (vía ADR-07) verifica la fecha de vigencia del CSD `active`; al expirar, pasa a `expired` y notifica al Director (BR-N349 in-app) y bloquea timbrado.

**Auditoría de CSD:**
- Toda carga/rotación/revocación/expiración queda en `audit_logs` con `action` (`csd.load`/`csd.rotate`/`csd.revoke`/`csd.expire`), `actor_user_id`, `reason`, `key_version` del cifrado. **Nunca** la contraseña, ni el contenido del `.pem`, ni la API key del PAC. Cita BR-N336, BR-N337.

### 9.3 API key del PAC FacturoPorTi

- Se cifra con AES-256-GCM (AAD canónico `org|organization_fiscal_config|pac_api_key`).
- Se rota por decisión del Director (cambio de plan con FacturoPorTi); el procedimiento es carga del nuevo + marca del anterior como `superseded` (sin borrar, para trazabilidad). No hay validación criptográfica posible (es una API key opaca); se valida al primer timbrado de prueba.

### 9.4 Contratos fijados (aditivos a §5)

6. AAD canónico determinista `"{organization_id}|{schema}.{table}|{column}"`.
7. Formato de almacenamiento `key_version || nonce || ciphertext || tag`; `key_version` permite rotación.
8. `MASTER_KEY` es un anillo de llaves versionadas; una activa, las demás legacy para descifrar.
9. Rotación de `MASTER_KEY`: por org, transaccional, no automática en MVP sin Frank.
10. CSD tiene 5 estados (`pending_validation`, `active`, `superseded`, `revoked`, `expired`); el timbrado sólo usa `active`.
11. Toda operación crypto y de CSD se audita sin valor del secreto.

### 9.5 Restricciones para SPECs (aditivas a §6)

- SPEC-001 v1.1 contiene los ACs del contrato crypto y del ciclo del CSD (AC-47 a AC-52).
- SPEC-007 (Facturación) referencia este ADR para timbrado, cancelación SAT (BR-N305) y selección del CSD `active`.
- Toda SPEC que añada un campo sensible declara su AAD canónico y lo marca en la tabla.

### 9.6 ACs derivadas (testeables en SPEC-001 v1.1)

- **AC-47** · AAD canónico determinista: el mismo `(org, tabla, campo)` produce siempre el mismo AAD; cifrar el mismo valor dos veces produce `ciphertext` distinto (nonce aleatorio) pero ambos descifran con el mismo AAD.
- **AC-48** · Rotación de `MASTER_KEY`: con dos llaves (V1 legacy, V2 activa), el job de rotación re-cifra todos los campos sensibles de una org en una transacción; al concluir, todos los registros tienen `key_version=2` y descifran con V2; rollback si falla.
- **AC-49** · Carga de CSD: subir `.cer`+`.pem`+password válidos → `active` tras validación (reto firma/verificación + RFC coincidente + vigencia futura); subir CSD de otra organización → `pending_validation` con motivo (el `.cer` no coincide con el RFC de la org).
- **AC-50** · Rotación de CSD: cargar nuevo CSD → anterior pasa a `superseded`, nuevo a `active`; el timbrado usa el `active`.
- **AC-51** · Revocación de CSD: revocar CSD `active` → `revoked`; timbrado devuelve `CSD_REVOKED`; carga de nuevo CSD recupera.
- **AC-52** · Auditoría crypto sin texto plano: tras `csd.load` y `crypto.rotate`, `audit_logs` tiene filas con `action` y `key_version`, **sin** el valor de la contraseña, el `.pem` ni la API key en ningún campo.
