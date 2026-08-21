/**
 * Servicio `auth` — login con Argon2id, política de password, lockout
 * (ADR-03 §3.3, ADR-06 §2.2, AC-20/AC-21).
 *
 * Recibe `Context` (no el usuario; el usuario aún no está autenticado al login).
 * Devuelve DTOs sin exponer filas Drizzle crudas (AC-32).
 */
import { eq, and } from "drizzle-orm";
import { verify as argon2Verify } from "@node-rs/argon2";
import { getDb } from "@/server/db/client";
import { users, credentials } from "@/server/db/schema";
import { addMinutes } from "@/shared/utils";
import { passwordSchema } from "@/shared/zod";
import { DomainError } from "@/shared/errors";

export interface LoginInput {
  email: string;
  password: string;
  ip?: string;
  ua?: string;
}

export interface LoginSuccessDTO {
  userId: string;
  organizationId: string;
  email: string;
  name: string;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

/**
 * Resultado de `verifyPassword` que distingue éxito, fallo de credencial
 * y cuenta bloqueada. Permite al caller (login route / tRPC router)
 * cablear `registerFailedLogin` y la bitácora `auth.*` (AC-72) sin
 * tener que re-consultar la BD.
 */
export type VerifyPasswordResult =
  | { kind: "ok"; user: LoginSuccessDTO }
  | { kind: "invalid_credentials" }
  | { kind: "account_locked"; lockedUntil: Date };

/**
 * Identidad mínima del actor para alimentar `audit.record` antes de tener
 * sesión. Sólo expone lo necesario para derivar `actor_user_id` y
 * `organization_id` (AC-9 / AC-72). NO incluye credenciales.
 */
export interface ActorRef {
  id: string;
  organizationId: string;
}

export interface AuthService {
  /**
   * Verifica credenciales. NO emite tokens (eso es `session.open`).
   * Devuelve un resultado discriminado para que el caller registre el
   * fallo o emita tokens. Cumple AC-21/AC-72.
   */
  verifyPassword(input: LoginInput): Promise<VerifyPasswordResult>;
  /** Política pura de password (testeable sin BD). */
  validatePasswordStrength(p: string): void;
  /**
   * Resetea el contador de intentos fallidos tras login exitoso.
   */
  resetFailedLogin(userId: string, organizationId: string): Promise<void>;
  /**
   * Registra un fallo y, si alcanza el máximo, bloquea la cuenta.
   * Devuelve el contador resultante.
   */
  registerFailedLogin(userId: string, organizationId: string): Promise<{
    failedLoginCount: number;
    lockedUntil: Date | null;
  }>;
  /**
   * Lookup idempotente y de sólo lectura del actor por email. Usado
   * internamente por los transportes de auth (tRPC router + HTTP route)
   * para alimentar `audit.record` en `auth.login.failed/locked` (AC-72)
   * sin que el router/route haga una consulta Drizzle directa
   * (AC-28, SOL-20260819-01 invariante 3).
   *
   * Normaliza el email a minúsculas (coherente con el `unique(organization_id, email)`
   * del schema y con el lookup previo). NO devuelve `password_hash`,
   * `failed_login_count` ni `lockedUntil` — sólo lo mínimo para derivar el
   * actor de la bitácora de fallo pre-sesión.
   *
   * Devuelve `null` si el email no existe. Puede lanzar ante errores de
   * BD; el caller traga en `try/catch` (patrón vigente: no fugar
   * existencia/internals en la respuesta 401).
   */
  lookupActor(email: string): Promise<ActorRef | null>;
}

const ARGON2_OPTS = {
  // Parámetros ADR-03 §3.3 (m=64 MiB, t=3, p=4). Estos son defaults razonables
  // del binding @node-rs/argon2 que se alinean con OWASP 2024.
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;

export function createAuthService(deps?: {
  lockoutMaxAttempts?: number;
  lockoutWindowMinutes?: number;
}): AuthService {
  // Inicialización perezosa del pool: sólo se construye cuando una operación
  // de BD lo necesita. Permite que tests de lógica pura (validatePasswordStrength)
  // corran sin infra.
  const getDbLazy = () => getDb();
  const maxAttempts = deps?.lockoutMaxAttempts ?? 5;
  const windowMin = deps?.lockoutWindowMinutes ?? 15;

  function validatePasswordStrength(p: string): void {
    const r = passwordSchema.safeParse(p);
    if (!r.success) {
      throw new DomainError(
        "PASSWORD_TOO_WEAK",
        r.error.issues.map((i) => i.message).join("; "),
      );
    }
  }

  async function verifyPassword(input: LoginInput): Promise<VerifyPasswordResult> {
    const db = getDbLazy();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1);
    if (!user || !user.active) {
      // Diferir mensaje exacto para evitar user enumeration; el caller debe
      // registrar `auth.login.failed` con `actorUserId` del usuario si existe.
      return { kind: "invalid_credentials" };
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return { kind: "account_locked", lockedUntil: user.lockedUntil };
    }
    const [cred] = await db
      .select()
      .from(credentials)
      .where(
        and(eq(credentials.userId, user.id), eq(credentials.organizationId, user.organizationId)),
      )
      .limit(1);
    if (!cred) {
      return { kind: "invalid_credentials" };
    }
    const ok = await argon2Verify(cred.passwordHash, input.password);
    if (!ok) {
      return { kind: "invalid_credentials" };
    }
    return {
      kind: "ok",
      user: {
        userId: user.id,
        organizationId: user.organizationId,
        email: user.email,
        name: user.name,
        failedLoginCount: user.failedLoginCount,
        lockedUntil: user.lockedUntil,
      },
    };
  }

  async function resetFailedLogin(userId: string, organizationId: string): Promise<void> {
    const db = getDbLazy();
    await db
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.organizationId, organizationId)));
  }

  async function registerFailedLogin(
    userId: string,
    organizationId: string,
  ): Promise<{ failedLoginCount: number; lockedUntil: Date | null }> {
    const db = getDbLazy();
    const [u] = await db
      .select({ failed: users.failedLoginCount })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, organizationId)))
      .limit(1);
    const newCount = (u?.failed ?? 0) + 1;
    const lockedUntil = newCount >= maxAttempts ? addMinutes(new Date(), windowMin) : null;
    await db
      .update(users)
      .set({
        failedLoginCount: newCount,
        lockedUntil,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, userId), eq(users.organizationId, organizationId)));
    return { failedLoginCount: newCount, lockedUntil };
  }

  /**
   * Lookup de sólo lectura del actor por email (AC-28). NO toca
   * `failed_login_count` ni `lockedUntil` (esos los hace
   * `registerFailedLogin` / `resetFailedLogin`). NO devuelve credenciales.
   */
  async function lookupActor(email: string): Promise<ActorRef | null> {
    const db = getDbLazy();
    const [u] = await db
      .select({ id: users.id, organizationId: users.organizationId })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    if (!u) return null;
    return { id: u.id, organizationId: u.organizationId };
  }

  return {
    verifyPassword,
    validatePasswordStrength,
    resetFailedLogin,
    registerFailedLogin,
    lookupActor,
  };
}

// Exportado para tests.
export const __argon2_opts__ = ARGON2_OPTS;
