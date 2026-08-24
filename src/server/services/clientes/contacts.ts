/**
 * Servicio `client_contacts` — SPEC-002 §4.1 / AC-5 (BR-N217).
 *
 * Reglas:
 *  - Varios contactos por cliente, **sólo uno** `is_main=true`.
 *  - Al marcar un contacto como principal, los demás del mismo
 *    cliente se desmarcán dentro de la misma transacción. El
 *    `UNIQUE INDEX ... WHERE is_main = true` refuerza a nivel BD.
 *  - El cliente padre debe existir y pertenecer a la organización
 *    del contexto.
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb, withTx } from "@/server/db/client";
import { clientContacts, clients } from "@/server/db/schema";
import { DomainError, requireUser } from "@/shared/errors";
import type { Context } from "@/shared/zod";

export interface ClientContactDTO {
  id: string;
  organizationId: string;
  clientId: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  isMain: boolean;
  createdAt: Date;
}

export interface ClientContactsService {
  create(
    ctx: Context,
    input: {
      clientId: string;
      name: string;
      role?: string;
      email?: string;
      phone?: string;
      isMain?: boolean;
    },
  ): Promise<ClientContactDTO>;
  update(
    ctx: Context,
    input: {
      contactId: string;
      name?: string;
      role?: string;
      email?: string;
      phone?: string;
      isMain?: boolean;
    },
  ): Promise<ClientContactDTO>;
  setMain(ctx: Context, input: { contactId: string }): Promise<ClientContactDTO>;
  delete(ctx: Context, input: { contactId: string }): Promise<void>;
  listForClient(
    ctx: Context,
    input: { clientId: string },
  ): Promise<ClientContactDTO[]>;
}

function toDto(row: typeof clientContacts.$inferSelect): ClientContactDTO {
  return {
    id: row.id,
    organizationId: row.organizationId,
    clientId: row.clientId,
    name: row.name,
    role: row.role,
    email: row.email,
    phone: row.phone,
    isMain: row.isMain,
    createdAt: row.createdAt,
  };
}

async function assertClient(ctx: Context, clientId: string): Promise<void> {
  const user = requireUser(ctx);
  const db = getDb();
  const [c] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(eq(clients.id, clientId), eq(clients.organizationId, user.organization_id)),
    )
    .limit(1);
  if (!c) {
    throw new DomainError("CLIENT_NOT_FOUND", "Cliente no encontrado", 404);
  }
}

export function createClientContactsService(): ClientContactsService {
  const db = getDb();

  async function create(
    ctx: Context,
    input: {
      clientId: string;
      name: string;
      role?: string;
      email?: string;
      phone?: string;
      isMain?: boolean;
    },
  ): Promise<ClientContactDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_clientes");
    await assertClient(ctx, input.clientId);

    return withTx(async (tx) => {
      const isFirst = (await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(clientContacts)
        .where(
          and(
            eq(clientContacts.organizationId, user.organization_id),
            eq(clientContacts.clientId, input.clientId),
          ),
        ))[0]?.c === 0;
      // BR-N217: si el cliente no tiene contactos, el primero es principal.
      // Si el caller pasa `isMain=true` y ya hay principal, desmarcamos.
      const wantsMain = input.isMain === true || isFirst;
      if (wantsMain) {
        await tx
          .update(clientContacts)
          .set({ isMain: false })
          .where(
            and(
              eq(clientContacts.organizationId, user.organization_id),
              eq(clientContacts.clientId, input.clientId),
              eq(clientContacts.isMain, true),
            ),
          );
      }
      const [row] = await tx
        .insert(clientContacts)
        .values({
          organizationId: user.organization_id,
          clientId: input.clientId,
          name: input.name,
          role: input.role ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          isMain: wantsMain,
        })
        .returning();
      if (!row) throw new Error("client_contact insert sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      await createAuditService().record(ctx, {
        entityType: "client_contact",
        entityId: row.id,
        action: wantsMain ? "client_contact.set_main" : "client_contact.create",
        after: {
          clientId: row.clientId,
          name: row.name,
          isMain: row.isMain,
        },
      });
      return toDto(row);
    });
  }

  async function update(
    ctx: Context,
    input: {
      contactId: string;
      name?: string;
      role?: string;
      email?: string;
      phone?: string;
      isMain?: boolean;
    },
  ): Promise<ClientContactDTO> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_clientes");

    return withTx(async (tx) => {
      const [before] = await tx
        .select()
        .from(clientContacts)
        .where(
          and(
            eq(clientContacts.id, input.contactId),
            eq(clientContacts.organizationId, user.organization_id),
          ),
        )
        .limit(1);
      if (!before) {
        throw new DomainError(
          "CONTACT_NOT_FOUND",
          "Contacto no encontrado",
          404,
        );
      }
      const set: Partial<typeof clientContacts.$inferInsert> = {};
      if (input.name !== undefined) set.name = input.name;
      if (input.role !== undefined) set.role = input.role;
      if (input.email !== undefined) set.email = input.email;
      if (input.phone !== undefined) set.phone = input.phone;
      if (input.isMain === true) {
        // Desmarcar los demás principales del mismo cliente.
        await tx
          .update(clientContacts)
          .set({ isMain: false })
          .where(
            and(
              eq(clientContacts.organizationId, user.organization_id),
              eq(clientContacts.clientId, before.clientId),
              eq(clientContacts.isMain, true),
            ),
          );
        set.isMain = true;
      } else if (input.isMain === false) {
        set.isMain = false;
      }
      const [after] = await tx
        .update(clientContacts)
        .set(set)
        .where(eq(clientContacts.id, before.id))
        .returning();
      if (!after) throw new Error("client_contact update sin fila");
      const { createAuditService } = await import("@/server/services/audit");
      const action =
        input.isMain === true ? "client_contact.set_main" : "client_contact.update";
      await createAuditService().record(ctx, {
        entityType: "client_contact",
        entityId: after.id,
        action,
        before: {
          name: before.name,
          role: before.role,
          email: before.email,
          phone: before.phone,
          isMain: before.isMain,
        },
        after: {
          name: after.name,
          role: after.role,
          email: after.email,
          phone: after.phone,
          isMain: after.isMain,
        },
      });
      return toDto(after);
    });
  }

  async function setMain(
    ctx: Context,
    input: { contactId: string },
  ): Promise<ClientContactDTO> {
    return update(ctx, { contactId: input.contactId, isMain: true });
  }

  async function deleteContact(
    ctx: Context,
    input: { contactId: string },
  ): Promise<void> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_clientes");
    const [before] = await db
      .select()
      .from(clientContacts)
      .where(
        and(
          eq(clientContacts.id, input.contactId),
          eq(clientContacts.organizationId, user.organization_id),
        ),
      )
      .limit(1);
    if (!before) {
      throw new DomainError("CONTACT_NOT_FOUND", "Contacto no encontrado", 404);
    }
    await db
      .delete(clientContacts)
      .where(eq(clientContacts.id, before.id));
    const { createAuditService } = await import("@/server/services/audit");
    await createAuditService().record(ctx, {
      entityType: "client_contact",
      entityId: before.id,
      action: "client_contact.delete",
      before: {
        clientId: before.clientId,
        name: before.name,
        isMain: before.isMain,
      },
    });
  }

  async function listForClient(
    ctx: Context,
    input: { clientId: string },
  ): Promise<ClientContactDTO[]> {
    const user = requireUser(ctx);
    const { createHasPermissionService } = await import(
      "@/server/services/hasPermission"
    );
    await createHasPermissionService().require(ctx, "gestionar_clientes");
    await assertClient(ctx, input.clientId);
    const rows = await db
      .select()
      .from(clientContacts)
      .where(
        and(
          eq(clientContacts.organizationId, user.organization_id),
          eq(clientContacts.clientId, input.clientId),
        ),
      )
      .orderBy(
        sql`${clientContacts.isMain} DESC, ${clientContacts.createdAt} ASC`,
      );
    return rows.map(toDto);
  }

  return {
    create,
    update,
    setMain,
    delete: deleteContact,
    listForClient,
  };
}