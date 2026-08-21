/**
 * Bootstrap helper para el servicio crypto. Conecta con env en runtime.
 * Usado por routers que necesitan cifrar/descifrar (config fiscal).
 */
import { loadEnv } from "@/lib/env";
import { buildKeyRingFromEnv, createCryptoService } from "./index";

export function buildCryptoServiceFromEnv() {
  const env = loadEnv();
  const ring = buildKeyRingFromEnv({
    MASTER_KEY: env.MASTER_KEY,
    MASTER_KEY_VERSION: env.MASTER_KEY_VERSION,
  });
  return createCryptoService(ring);
}
