/**
 * Validación de entorno (Zod). Una sola fuente de verdad para variables
 * requeridas por la plataforma. Si falta una variable, el bootstrap falla
 * con el nombre del campo (nunca su valor) — ADR-04 §2.2 / AC-36.
 *
 * Este módulo SÍ importa `zod` (legítimo en capa de infra/bootstrap);
 * los servicios de aplicación NO leen env directamente — reciben `Context`.
 */
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url(),

  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatorio"),

  // MASTER_KEY: 32 bytes base64. Validamos longitud tras decode.
  MASTER_KEY: z.string().min(1, "MASTER_KEY es obligatorio"),
  MASTER_KEY_VERSION: z.coerce.number().int().positive().default(1),

  SESSION_SECRET: z.string().min(32, "SESSION_SECRET debe tener al menos 32 caracteres"),

  S3_ENDPOINT: z.string().min(1, "S3_ENDPOINT es obligatorio"),
  S3_BUCKET: z.string().min(1, "S3_BUCKET es obligatorio"),
  S3_ACCESS_KEY: z.string().min(1, "S3_ACCESS_KEY es obligatorio"),
  S3_SECRET_KEY: z.string().min(1, "S3_SECRET_KEY es obligatorio"),
  S3_REGION: z.string().default("us-east-1"),
  S3_FORCE_PATH_STYLE: z
    .union([z.literal("true"), z.literal("false")])
    .default("true")
    .transform((v) => v === "true"),

  VECTORIA_DIRECTOR_EMAIL: z.string().email("VECTORIA_DIRECTOR_EMAIL debe ser email válido"),
  VECTORIA_ORG_NAME: z.string().default("Vector IA"),
  // AC-79: SuperUser técnico (`contacto@vector-ia.mx`) se crea en bootstrap
  // con esta contraseña inicial. Fail-safe si ausente/vacía: el bootstrap
  // aborta con exit !=0 nombrando la variable (no su valor).
  VECTORIA_SUPERUSER_PASSWORD: z.string().min(1, "VECTORIA_SUPERUSER_PASSWORD es obligatorio"),

  LOCKOUT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOCKOUT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),

  COOKIE_SECURE: z
    .union([z.literal("true"), z.literal("false")])
    .default("false")
    .transform((v) => v === "true"),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/**
 * Carga y valida el entorno. Lanza Error con nombre del campo (no valor).
 * Usado por bootstrap, scripts y código de infra. NO por servicios.
 */
export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    // NOMBRE del campo, nunca el valor. Cumple AC-36.
    throw new Error(`Variables de entorno inválidas o ausentes — ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/**
 * Lista de variables requeridas (para `deps:check`). No devuelve valores.
 */
export function listRequiredVars(): string[] {
  return [
    "DATABASE_URL",
    "MASTER_KEY",
    "SESSION_SECRET",
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "VECTORIA_DIRECTOR_EMAIL",
    "VECTORIA_SUPERUSER_PASSWORD",
    "APP_BASE_URL",
  ];
}

/**
 * Valida que MASTER_KEY (base64) decodifica a 32 bytes exactos.
 * No devuelve el valor. Lanza Error con motivo.
 */
export function assertMasterKeyBytes(masterKeyBase64: string): void {
  let buf: Buffer;
  try {
    buf = Buffer.from(masterKeyBase64, "base64");
  } catch {
    throw new Error("MASTER_KEY no es base64 válido");
  }
  if (buf.length !== 32) {
    throw new Error(`MASTER_KEY debe decodificar a 32 bytes (decodificó ${buf.length})`);
  }
}
