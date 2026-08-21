/**
 * Servicio `notifications` — in-app only (DEC-FUN-29, BR-N349/350, AC-16).
 * Crea filas en `notifications` para eventos reconocidos.
 */
import { eq, and, isNull, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { notifications } from "@/server/db/schema";
import {
  NOTIFICATION_EVENT_TYPES,
  type NotificationEventType,
} from "@/shared/enums";
import { DomainError } from "@/shared/errors";

export interface DispatchNotificationInput {
  organizationId: string;
  userId: string;
  eventType: NotificationEventType;
  title: string;
  body?: string;
  link?: string;
}

export interface NotificationDTO {
  id: string;
  userId: string;
  eventType: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationsService {
  dispatch(input: DispatchNotificationInput): Promise<NotificationDTO>;
  markRead(ctxOrganizationId: string, userId: string, notificationId: string): Promise<void>;
  list(
    organizationId: string,
    userId: string,
    opts: { limit?: number; offset?: number; unreadOnly?: boolean },
  ): Promise<{ items: NotificationDTO[]; total: number }>;
}

function toDto(row: typeof notifications.$inferSelect): NotificationDTO {
  return {
    id: row.id,
    userId: row.userId,
    eventType: row.eventType,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

export function createNotificationsService(): NotificationsService {
  const db = getDb();

  async function dispatch(input: DispatchNotificationInput): Promise<NotificationDTO> {
    if (!NOTIFICATION_EVENT_TYPES.includes(input.eventType)) {
      throw new DomainError(
        "UNKNOWN_NOTIFICATION_EVENT",
        `Evento no reconocido: ${input.eventType}`,
        400,
      );
    }
    const [row] = await db
      .insert(notifications)
      .values({
        organizationId: input.organizationId,
        userId: input.userId,
        eventType: input.eventType,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      })
      .returning();
    if (!row) throw new Error("notification insert sin fila");
    return toDto(row);
  }

  async function markRead(
    organizationId: string,
    userId: string,
    notificationId: string,
  ): Promise<void> {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId),
          eq(notifications.organizationId, organizationId),
        ),
      );
  }

  async function list(
    organizationId: string,
    userId: string,
    opts: { limit?: number; offset?: number; unreadOnly?: boolean } = {},
  ): Promise<{ items: NotificationDTO[]; total: number }> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const where = [
      eq(notifications.organizationId, organizationId),
      eq(notifications.userId, userId),
    ];
    if (opts.unreadOnly) where.push(isNull(notifications.readAt));

    const [totalRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(...where));
    const total = totalRow?.c ?? 0;
    const rows = await db
      .select()
      .from(notifications)
      .where(and(...where))
      .orderBy(sql`${notifications.createdAt} DESC`)
      .limit(limit)
      .offset(offset);
    return { items: rows.map(toDto), total };
  }

  return { dispatch, markRead, list };
}
