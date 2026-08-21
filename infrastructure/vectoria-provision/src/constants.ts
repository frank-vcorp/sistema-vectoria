/**
 * Constantes operativas del runner.
 *
 *  - DEFAULT_SERVER_UUID: server Coolify global del inventario
 *    (`03tz1uabcrjaihnvrhysbstv`). Última opción de la cadena §5.
 *  - DNS_EXPECTED_IP: IP del VPS Vectoria que debe resolver el wildcard `*.vector-ia.mx`.
 *    Validación DNS read-only previa al `ensure_application` (§16).
 *  - DNS_WILDCARD_DOMAIN: dominio base del wildcard preexistente.
 */

export const DEFAULT_SERVER_UUID = "03tz1uabcrjaihnvrhysbstv";
export const DNS_EXPECTED_IP = "212.28.185.217";
export const DNS_WILDCARD_DOMAIN = "vector-ia.mx";