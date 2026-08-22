#!/usr/bin/env bash
# run-provision.sh — min-privilege launcher for vectoria-provision.
#
# Implements SPEC-20260820-003 §6 + SPEC-20260821-001 §10 (v2.0).
#
# Contract:
#   - Lee el archivo de secretos vía `source` a variables LOCALES (no reexportadas).
#   - Valida que sea archivo regular, no symlink, mode 600 estricto, owner UID actual.
#   - Emite un código de error estable en stderr sin imprimir valores.
#   - En éxito, hace `exec` con `env -i` y la allowlist {PATH, COOLIFY_READ_TOKEN,
#     COOLIFY_WRITE_TOKEN, SECRET_DERIVATION_ROOT, VECTORIA_PROVISION_*} — el
#     resto del host (VS Code, editor, etc.) se descarta.
#   - NUNCA imprime tokens ni secretos. NUNCA usa `set -x`. NUNCA redirige a logs.
#
# Seams (no-secretos, consumidos ANTES de `env -i`):
#   VECTORIA_PROVISION_SECRETS_FILE        - ruta al secrets file global (default: integra.secrets.env)
#   VECTORIA_PROVISION_CHILD               - ruta al entrypoint TS/JS (default: relativo a BASH_SOURCE)
#   VECTORIA_PROVISION_EXPECTED_UID        - UID esperado (default id -u)
#   VECTORIA_PROVISION_GLOBAL_PROFILE      - ruta al global-profile.json (NUEVO v2.0)
#   VECTORIA_PROVISION_REGISTRY_DIR        - raíz de registry namespaced (NUEVO v2.0)
#   VECTORIA_PROVISION_AUDIT_DIR           - raíz de audit namespaced (NUEVO v2.0)
#   VECTORIA_PROVISION_SECRET_SOURCE_FILE  - ruta al per-project secret-source .env (NUEVO v2.0)
#
# Códigos de error estables (stderr, sin valores):
#   file_missing | file_symlink | bad_owner | bad_perms |
#   empty_read_token | empty_write_token | empty_root |
#   node_missing | tsx_missing |
#   global_profile_missing | global_profile_unreadable |
#   global_profile_bad_perms | global_profile_bad_owner |
#   src_missing | src_symlink | src_bad_owner | src_bad_perms

set -euo pipefail

# ------------------------------------------------------------- meta / seams
SECRETS_FILE="${VECTORIA_PROVISION_SECRETS_FILE:-${HOME}/.config/kilo/integra.secrets.env}"

# Default CHILD ahora es RELATIVO al launcher (no absoluto a sistema-vectoria).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHILD="${VECTORIA_PROVISION_CHILD:-${SCRIPT_DIR}/../dist/src/index.js}"

EXPECTED_UID="${VECTORIA_PROVISION_EXPECTED_UID:-$(id -u)}"

# v2.0 (NUEVO) — global-profile + dirs namespaced.
GLOBAL_PROFILE="${VECTORIA_PROVISION_GLOBAL_PROFILE:-${HOME}/.config/kilo/vectoria-provision/global-profile.json}"
REGISTRY_DIR="${VECTORIA_PROVISION_REGISTRY_DIR:-${HOME}/.config/kilo/vectoria-provision/registry}"
AUDIT_DIR="${VECTORIA_PROVISION_AUDIT_DIR:-${HOME}/.config/kilo/vectoria-provision/audit}"
# v2.0 (NUEVO) — per-project secret-source file (mode 600). Si no se
# establece, el runner cae al archivo global SECRETS_FILE (legacy compat).
SECRET_SOURCE_FILE="${VECTORIA_PROVISION_SECRET_SOURCE_FILE:-}"

# ------------------------------------------------------------- helpers
emit() {
  local code="$1"
  shift
  if [ "$#" -gt 0 ]; then
    printf '[vectoria-provision] launcher: %s %s\n' "$code" "$*" >&2
  else
    printf '[vectoria-provision] launcher: %s\n' "$code" >&2
  fi
}

# Validación mode 600 + owner UID esperado + no symlink para archivos
# sensibles (secrets file, global-profile, per-project secret-source).
validate_secret_file() {
  local path="$1"
  local label="$2"
  if [ ! -e "$path" ]; then
    emit "${label}_missing"
    return 1
  fi
  if [ -L "$path" ]; then
    emit "${label}_symlink"
    return 1
  fi
  if [ ! -f "$path" ]; then
    emit "${label}_missing"
    return 1
  fi
  local got_uid
  got_uid="$(stat -c %u "$path")"
  if [ "$got_uid" != "$EXPECTED_UID" ]; then
    emit "${label}_bad_owner" "$got_uid" "$EXPECTED_UID"
    return 1
  fi
  local got_perms
  got_perms="$(stat -c %a "$path")"
  if [ "$got_perms" != "600" ]; then
    emit "${label}_bad_perms" "$got_perms"
    return 1
  fi
  return 0
}

# ----------------------------------------------------------------- checks
# 1. node debe estar disponible
if ! NODE="$(command -v node 2>/dev/null)"; then
  emit node_missing
  exit 70
fi

# 2. archivo de secretos existe
if [ ! -e "$SECRETS_FILE" ]; then
  emit file_missing
  exit 70
fi

# 3. no es symlink
if [ -L "$SECRETS_FILE" ]; then
  emit file_symlink
  exit 70
fi

# 4. archivo regular
if [ ! -f "$SECRETS_FILE" ]; then
  emit file_missing
  exit 70
fi

# 5. owner UID == EXPECTED_UID
GOT_UID="$(stat -c %u "$SECRETS_FILE")"
if [ "$GOT_UID" != "$EXPECTED_UID" ]; then
  emit bad_owner "$GOT_UID" "$EXPECTED_UID"
  exit 70
fi

# 6. permisos exactos 600
GOT_PERMS="$(stat -c %a "$SECRETS_FILE")"
if [ "$GOT_PERMS" != "600" ]; then
  emit bad_perms "$GOT_PERMS"
  exit 70
fi

# 7. cargar secrets a variables LOCALES (no exportadas). Sólo llevamos al
#    hijo las variables secretas del runner + seams operacionales;
#    el resto se descarta.
set +a
# shellcheck disable=SC1090
. "$SECRETS_FILE"
READ_TOKEN="${COOLIFY_READ_TOKEN:-}"
WRITE_TOKEN="${COOLIFY_WRITE_TOKEN:-}"
DERIVATION_ROOT="${SECRET_DERIVATION_ROOT:-}"

# 8. limpiar las variables globales importadas (no exportadas) — sólo TOKENs
#    y DERIVATION_ROOT se conservan y se entregarán vía exec con env -i.
unset \
  MINIMAX_API_KEY \
  MINIMAX_API_BASE \
  GOOGLE_AI_STUDIO_API_KEY \
  GITHUB_TOKEN_VECTOR_IA_MX \
  GITHUB_TOKEN_FRANK_VCORP 2>/dev/null || true
unset VECTORIA_PROVISION_SECRETS_FILE VECTORIA_PROVISION_CHILD VECTORIA_PROVISION_EXPECTED_UID 2>/dev/null || true

if [ -z "$READ_TOKEN" ]; then
  emit empty_read_token
  exit 70
fi
if [ -z "$WRITE_TOKEN" ]; then
  emit empty_write_token
  exit 70
fi
if [ -z "$DERIVATION_ROOT" ]; then
  emit empty_root
  exit 70
fi

# 9. (v2.0) Validar global-profile si existe (es opcional; WARN + sigue si falta).
#    Si el archivo existe → mismas reglas 600 + owner. Si NO existe → el
#    runner cae a defaults hardcoded (capa 0) con WARN stderr.
if [ -e "$GLOBAL_PROFILE" ]; then
  if ! validate_secret_file "$GLOBAL_PROFILE" "global_profile"; then
    exit 70
  fi
fi

# 10. (v2.0) Validar per-project secret-source si se provee (obligatorio cuando
#     se establece `VECTORIA_PROVISION_SECRET_SOURCE_FILE`). Si el archivo
#     existe → mismas reglas 600 + owner. Si falta → `src_missing`. Si el
#     manifest v2 declara `application.secretSource`, este archivo es
#     OBLIGATORIO; el runner aborta si no existe (errores `src_*`).
if [ -n "$SECRET_SOURCE_FILE" ]; then
  if ! validate_secret_file "$SECRET_SOURCE_FILE" "src"; then
    exit 70
  fi
fi

# ----------------------------------------------------- exec into child
NODE_DIR="$(dirname "$NODE")"
exec /usr/bin/env -i \
  "PATH=${NODE_DIR}" \
  "COOLIFY_READ_TOKEN=${READ_TOKEN}" \
  "COOLIFY_WRITE_TOKEN=${WRITE_TOKEN}" \
  "SECRET_DERIVATION_ROOT=${DERIVATION_ROOT}" \
  "VECTORIA_PROVISION_GLOBAL_PROFILE=${GLOBAL_PROFILE}" \
  "VECTORIA_PROVISION_REGISTRY_DIR=${REGISTRY_DIR}" \
  "VECTORIA_PROVISION_AUDIT_DIR=${AUDIT_DIR}" \
  "VECTORIA_PROVISION_SECRET_SOURCE_FILE=${SECRET_SOURCE_FILE}" \
  "$NODE" "$CHILD"