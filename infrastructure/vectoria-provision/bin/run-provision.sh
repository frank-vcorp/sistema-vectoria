#!/usr/bin/env bash
# run-provision.sh — min-privilege launcher for vectoria-provision.
#
# Implements SPEC-20260820-003 §6.
#
# Contract:
#   - Lee el archivo de secretos vía `source` a variables LOCALES (no reexportadas).
#   - Valida que sea archivo regular, no symlink, mode 600 estricto, owner UID actual.
#   - Emite un código de error estable en stderr sin imprimir valores.
#   - En éxito, hace `exec` con `env -i` y la allowlist {PATH, COOLIFY_READ_TOKEN,
#     COOLIFY_WRITE_TOKEN, SECRET_DERIVATION_ROOT} — el resto del host (VS Code,
#     editor, etc.) se descarta.
#   - NUNCA imprime tokens ni secretos. NUNCA usa `set -x`. NUNCA redirige a logs.
#
# Seams (no-secretos, consumidos ANTES de `env -i`):
#   VECTORIA_PROVISION_SECRETS_FILE - ruta al secrets file (default abajo)
#   VECTORIA_PROVISION_CHILD        - ruta al entrypoint TS/JS (default abajo)
#   VECTORIA_PROVISION_EXPECTED_UID - UID esperado (default id -u)
#
# Códigos de error estables (stderr, sin valores):
#   file_missing | file_symlink | bad_owner | bad_perms |
#   empty_read_token | empty_write_token | empty_root |
#   node_missing | tsx_missing

set -euo pipefail

# ------------------------------------------------------------- meta / seams
SECRETS_FILE="${VECTORIA_PROVISION_SECRETS_FILE:-${HOME}/.config/kilo/integra.secrets.env}"
CHILD="${VECTORIA_PROVISION_CHILD:-/home/frank/repos/sistema-vectoria/infrastructure/vectoria-provision/dist/src/index.js}"
EXPECTED_UID="${VECTORIA_PROVISION_EXPECTED_UID:-$(id -u)}"

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

# ----------------------------------------------------------------- checks
# 1. node debe estar disponible
if ! NODE="$(command -v node 2>/dev/null)"; then
  emit node_missing
  exit 70
fi

# 2. archivo existe
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
#    hijo las 3 variables secretas del runner; el resto se descarta.
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

# ----------------------------------------------------- exec into child
NODE_DIR="$(dirname "$NODE")"
exec /usr/bin/env -i \
  "PATH=${NODE_DIR}" \
  "COOLIFY_READ_TOKEN=${READ_TOKEN}" \
  "COOLIFY_WRITE_TOKEN=${WRITE_TOKEN}" \
  "SECRET_DERIVATION_ROOT=${DERIVATION_ROOT}" \
  "$NODE" "$CHILD"