/**
 * Stub runtime adapter — runtime-adapter-stub
 *
 * Materializado en `tests/fixtures/runtime-adapter-stub/` para los
 * tests cross-project y la AC-14. Exporta:
 *  - `adapterEnvToDispatch`: convierte env de la app a dispatch v1.7
 *  - `runtimeAdapterVersion`: versión declarada (debe coincidir con manifest)
 *  - `adapterHealthcheck`: bloque healthcheck
 *  - `adapterStartCommand`: comando de arranque
 *  - `adapterAuditBundle`: claves públicas/sensibles
 *
 * Este stub es NO-OP real (no ejecuta nada); sólo sirve para verificar
 * que el runner lo carga y emite audit correcto.
 */
export const runtimeAdapterVersion = "1.0.0";

export function adapterEnvToDispatch(envApp: Record<string, string>): Array<{ key: string; value: string; sensitive: boolean; mutable: boolean; mode: string }> {
  return Object.entries(envApp).map(([key, value]) => ({
    key,
    value,
    sensitive: true,
    mutable: false,
    mode: "derived",
  }));
}

export function adapterHealthcheck(): { enabled: true; path: string; method: "GET"; scheme: "http"; port: string; interval: number; timeout: number; retries: number } {
  return {
    enabled: true,
    path: "/api/health",
    method: "GET",
    scheme: "http",
    port: "3000",
    interval: 30,
    timeout: 5,
    retries: 3,
  };
}

export function adapterStartCommand(): string {
  return "pnpm start";
}

export function adapterAuditBundle(): { publicKeys: string[]; sensitiveKeys: string[] } {
  return {
    publicKeys: [],
    sensitiveKeys: ["MASTER_KEY", "SESSION_SECRET", "DATABASE_URL"],
  };
}
