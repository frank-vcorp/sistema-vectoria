/**
 * Servicio `invitations` — link de invitación firmado (DEC-FUN-21).
 * El token claro NUNCA se persiste; sólo su hash.
 *
 * Bitácora `auth.*` (AC-72-EX / AC-72(c) / AC-58):
 *  - `auth.invitation.issued` al emitir (actor = `createdByUserId`).
 *  - `auth.invitation.consumed` al consumir (actor = `user.id` recién creado).
 *  - **Sin secretos** en `audit_logs`: no se loguea el token ni el hash.
 */
import { eq, and } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "@/server/db/client";
import { invitations, users, credentials } from "@/server/db/schema";
import { addDays } from "@/shared/utils";
import { passwordSchema } from "@/shared/zod";
import { DomainError } from "@/shared/errors";

export interface IssueInvitationInput {
  organizationId: string;
  email: string;
  createdByUserId: string;
  ttlDays?: number;
  baseUrl?: string;
}

export interface IssueInvitationResult {
  link: string;
  token: string; // claro; sólo se entrega al emisor, nunca se persiste.
  expiresAt: Date;
}

export interface ConsumeInvitationInput {
  token: string;
  name: string;
  password: string;
  roleCode?: string;
}

export interface ConsumeInvitationResult {
  userId: string;
  organizationId: string;
  email: string;
  roleIds: string[];
}

export interface InvitationsService {
  issue(input: IssueInvitationInput): Promise<IssueInvitationResult>;
  consume(input: ConsumeInvitationInput): Promise<ConsumeInvitationResult>;
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function createInvitationsService(deps?: {
  hash?: (s: string) => string;
}): InvitationsService {
  const db = getDb();
  const hash = deps?.hash ?? sha256Hex;

  async function issue(input: IssueInvitationInput): Promise<IssueInvitationResult> {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hash(token);
    const expiresAt = addDays(new Date(), input.ttlDays ?? 7);
    const [row] = await db
      .insert(invitations)
      .values({
        organizationId: input.organizationId,
        email: input.email.toLowerCase(),
        tokenHash,
        expiresAt,
        consumedAt: null,
        createdBy: input.createdByUserId,
      })
      .returning();
    const baseUrl = input.baseUrl ?? "http://localhost:3000";
    const link = `${baseUrl}/invitacion?token=${encodeURIComponent(token)}`;
    // AC-72-EX / AC-58 / ADR-06 §2.9: bitácora auth.invitation.issued.
    // Sin secretos (no token, no hash). Actor = createdByUserId.
    const { createAuditService } = await import("@/server/services/audit");
    const audit = createAuditService();
    await audit.record(
      {
        user: { id: input.createdByUserId, organization_id: input.organizationId },
        roles: [],
        permissions: [],
      },
      {
        entityType: "invitation",
        entityId: row?.id ?? input.createdByUserId,
        action: "auth.invitation.issued",
        after: { email: input.email.toLowerCase(), expiresAt: expiresAt.toISOString() },
      },
    );
    return { link, token, expiresAt };
  }

  async function consume(input: ConsumeInvitationInput): Promise<ConsumeInvitationResult> {
    const r = passwordSchema.safeParse(input.password);
    if (!r.success) {
      throw new DomainError(
        "PASSWORD_TOO_WEAK",
        r.error.issues.map((i) => i.message).join("; "),
      );
    }
    const tokenHash = hash(input.token);
    const [inv] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, tokenHash))
      .limit(1);
    if (!inv) {
      throw new DomainError("INVITATION_EXPIRED", "Invitación inválida o expirada", 410);
    }
    if (inv.consumedAt) {
      throw new DomainError("INVITATION_CONSUMED", "La invitación ya fue consumida", 409);
    }
    if (inv.expiresAt < new Date()) {
      throw new DomainError("INVITATION_EXPIRED", "Invitación expirada", 410);
    }
    // Hash de password vía auth service.
    const { hash: argon2Hash } = await import("@node-rs/argon2");
    const passwordHash = await argon2Hash(input.password, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    // Crear user + credenciales.
    const [user] = await db
      .insert(users)
      .values({
        organizationId: inv.organizationId,
        email: inv.email,
        name: input.name,
        active: true,
      })
      .returning();
    if (!user) throw new Error("user insert sin fila");
    await db.insert(credentials).values({
      organizationId: inv.organizationId,
      userId: user.id,
      passwordHash,
      passwordChangedAt: new Date(),
    });
    // Asignar rol si se pasó.
    const roleIds: string[] = [];
    if (input.roleCode) {
      const { roles } = await import("@/server/db/schema/roles");
      const { userRoles } = await import("@/server/db/schema/user-roles");
      const [r] = await db
        .select()
        .from(roles)
        .where(
          and(
            eq(roles.code, input.roleCode),
            eq(roles.organizationId, inv.organizationId),
          ),
        )
        .limit(1);
      if (r) {
        await db.insert(userRoles).values({
          organizationId: inv.organizationId,
          userId: user.id,
          roleId: r.id,
          assignedBy: user.id, // bootstrap self-assign (Director consume su propia invitación)
        });
        roleIds.push(r.id);
      }
    }
    // Marcar consumida.
    await db
      .update(invitations)
      .set({ consumedAt: new Date() })
      .where(eq(invitations.id, inv.id));
    // AC-72-EX / AC-58 / ADR-06 §2.9: bitácora auth.invitation.consumed.
    // Actor = user.id recién creado.
    const { createAuditService } = await import("@/server/services/audit");
    const audit = createAuditService();
    await audit.record(
      {
        user: { id: user.id, organization_id: user.organizationId },
        roles: [],
        permissions: [],
      },
      {
        entityType: "invitation",
        entityId: inv.id,
        action: "auth.invitation.consumed",
      },
    );
    return {
      userId: user.id,
      organizationId: inv.organizationId,
      email: user.email,
      roleIds,
    };
  }

  return { issue, consume };
}

export const __hash_keep__ = sha256Hex;
