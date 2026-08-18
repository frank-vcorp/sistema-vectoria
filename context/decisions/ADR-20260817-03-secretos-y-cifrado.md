# ADR-20260817-03 · Secretos, cifrado y credenciales sensibles

- **ID:** ARCH-20260817-03
- **Estado:** accepted
- **Versión:** 1.0
- **Propietario:** INTEGRA
- **Fecha:** 2026-08-17
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
