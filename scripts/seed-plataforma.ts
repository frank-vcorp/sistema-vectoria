/**
 * AC-37 / AC-79: seed idempotente de plataforma.
 *
 * Orden estricto (cumple AC-35/AC-37):
 *  1) Organización seed (`slug='default'`).
 *  2) SuperUser técnico `contacto@vector-ia.mx` (DEC-FUN-20260820-74 /
 *     BR-N412) — creado/conservado **antes** de la invitación fundacional;
 *     upsert por `(organization_id, email)`. Su `id` es el `created_by`
 *     de la invitación (P1-2 cerrado: cero UUID cero). Es actor de
 *     trazabilidad, sin `user_roles` por defecto.
 *  3) 7 roles seed (`is_seed=true`) — label editable preservado
 *     (no se sobrescribe en re-ejecución, BR-N408).
 *  4) Permisos propios de plataforma (`BASE_PERMISSIONS`; AC-80: la
 *     plataforma NO siembra `registrar_tiempo`, ése es de SPEC-006).
 *  5) `role_permissions` seed — sólo `BASE_PERMISSIONS` (AC-80: la
 *     plataforma siembra sólo sus permisos propios).
 *  6) Invitación del Director (VECTORIA_DIRECTOR_EMAIL) usando el
 *     SuperUser como `createdByUserId`. El link se imprime **una sola
 *     vez** por arranque; re-ejecuciones no lo reimprimen (la fila ya
 *     existe, no se duplica).
 *
 * Fail-safe (AC-79c): `VECTORIA_SUPERUSER_PASSWORD` ausente/vacía →
 * aborta con exit !=0 nombrando la variable **sin** imprimir el valor
 * (el `loadEnv()` previo al `bootstrap` ya nombra el campo; aquí
 * documentamos el motivo explícito).
 */
import { and, eq } from "drizzle-orm";
import { hash as argon2Hash } from "@node-rs/argon2";
import { getDb, closeDb } from "@/server/db/client";
import { invitations, organizations, permissions, rolePermissions, roles, users, credentials } from "@/server/db/schema";
import { BASE_PERMISSIONS, SEED_ROLE_CODES } from "@/shared/enums";
import { loadEnv } from "@/lib/env";
import { PERMISSION_LABELS, SEED_ROLE_LABELS, SEED_ROLE_PERMISSION_CODES } from "./seed-data";
import { createInvitationsService } from "@/server/services/invitations";

const SUPERUSER_EMAIL = "contacto@vector-ia.mx";

async function ensureSuperUser(orgId: string, password: string) {
  const db = getDb();
  // Upsert por (organization_id, email): no duplica filas en re-ejecución.
  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, SUPERUSER_EMAIL), eq(users.organizationId, orgId)))
    .limit(1);
  const passwordHash = await argon2Hash(password, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
  if (existing) {
    // Conserva fila del SuperUser (id estable para FK de invitación).
    // No re-hashea la contraseña (un re-hash sería destructivo en re-ejecuciones).
    return existing.id;
  }
  const [u] = await db
    .insert(users)
    .values({
      organizationId: orgId,
      email: SUPERUSER_EMAIL,
      name: "SuperUser técnico",
      active: true,
      failedLoginCount: 0,
    })
    .returning();
  if (!u) throw new Error("SuperUser: insert users sin fila");
  await db.insert(credentials).values({
    organizationId: orgId,
    userId: u.id,
    passwordHash,
    passwordChangedAt: new Date(),
  });
  return u.id;
}

async function main() {
  const env = loadEnv();
  // AC-79c: fail-safe. loadEnv() ya valida `min(1)`; este check es
  // defensivo contra cambios de esquema y deja el mensaje explícito.
  if (!env.VECTORIA_SUPERUSER_PASSWORD || env.VECTORIA_SUPERUSER_PASSWORD.length === 0) {
    throw new Error(
      "Falta VECTORIA_SUPERUSER_PASSWORD (no-vacía). Configurar antes de bootstrap.",
    );
  }
  const db = getDb();

  // 1) Organización seed.
  const [existingOrg] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "default"))
    .limit(1);
  const [org] = existingOrg
    ? [existingOrg]
    : await db
        .insert(organizations)
        .values({
          slug: "default",
          name: env.VECTORIA_ORG_NAME,
          currency: "MXN",
          locale: "es-MX",
          timezone: "America/Mexico_City",
          active: true,
        })
        .returning();
  if (!org) throw new Error("No se pudo crear organización seed");
  const orgId = org.id;

  // 2) SuperUser técnico (AC-79 / DEC-FUN-20260820-74 / BR-N412).
  const superUserId = await ensureSuperUser(orgId, env.VECTORIA_SUPERUSER_PASSWORD);

  // 3) 7 roles seed.
  const roleByCode = new Map<string, string>();
  for (const code of SEED_ROLE_CODES) {
    const [found] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.organizationId, orgId), eq(roles.code, code)))
      .limit(1);
    // Conserva labels editados: sólo se insertan roles inexistentes (BR-N408).
    const [role] = found
      ? [found]
      : await db
          .insert(roles)
          .values({
            organizationId: orgId,
            code,
            label: SEED_ROLE_LABELS[code],
            isSeed: true,
            active: true,
          })
          .returning();
    if (role) roleByCode.set(code, role.id);
  }

  // 4) Permisos propios de plataforma (sólo BASE_PERMISSIONS; AC-80).
  const permissionByCode = new Map<string, string>();
  for (const code of BASE_PERMISSIONS) {
    const [found] = await db
      .select()
      .from(permissions)
      .where(and(eq(permissions.organizationId, orgId), eq(permissions.code, code)))
      .limit(1);
    const [permission] = found
      ? [found]
      : await db
          .insert(permissions)
          .values({ organizationId: orgId, code, label: PERMISSION_LABELS[code] })
          .returning();
    if (permission) permissionByCode.set(code, permission.id);
  }

  // 5) role_permissions seed (sólo BASE_PERMISSIONS; AC-80).
  for (const [roleCode, permissionCodes] of Object.entries(SEED_ROLE_PERMISSION_CODES)) {
    const roleId = roleByCode.get(roleCode);
    if (!roleId) continue;
    for (const permissionCode of permissionCodes) {
      const permissionId = permissionByCode.get(permissionCode);
      if (!permissionId) continue; // código no presente en BASE_PERMISSIONS → skip silencioso
      const [link] = await db
        .select()
        .from(rolePermissions)
        .where(
          and(
            eq(rolePermissions.organizationId, orgId),
            eq(rolePermissions.roleId, roleId),
            eq(rolePermissions.permissionId, permissionId),
          ),
        )
        .limit(1);
      if (!link) {
        await db.insert(rolePermissions).values({ organizationId: orgId, roleId, permissionId });
      }
    }
  }

  // 6) Invitación fundacional del Director (DEC-FUN-21, AC-79).
  const [invite] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, orgId),
        eq(invitations.email, env.VECTORIA_DIRECTOR_EMAIL.toLowerCase()),
        eq(invitations.consumedAt, null as never),
      ),
    )
    .limit(1);
  if (!invite) {
    const issued = await createInvitationsService().issue({
      organizationId: orgId,
      email: env.VECTORIA_DIRECTOR_EMAIL,
      createdByUserId: superUserId, // P1-2 cerrado: SuperUser.id, NO UUID cero.
      baseUrl: env.APP_BASE_URL,
    });
    console.info(`Invitación Director (imprimir una vez): ${issued.link}`);
  }

  console.info(
    "OK: seed plataforma idempotente (1 organización, 7 roles, permisos propios, SuperUser técnico, invitación Director)",
  );
  await closeDb();
}

main().catch(async (e: unknown) => {
  console.error(e instanceof Error ? e.message : "Error seed plataforma");
  await closeDb();
  process.exit(1);
});
