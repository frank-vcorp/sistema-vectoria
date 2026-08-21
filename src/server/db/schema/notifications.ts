/**
 * `notifications` (BR-N349/BR-N350). PK compuesta `(organization_id, id)`.
 * `event_type` ∈ `NOTIFICATION_EVENT_TYPES` (enum canónico).
 * FK compuesta `user_id → users(organization_id, id)` (AC-44).
 */
import { foreignKey, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const notifications = pgTable(
  "notifications",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    userId: uuid("user_id").notNull(),
    eventType: text("event_type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    userReadIdx: index("notifications_user_read_idx").on(t.organizationId, t.userId, t.readAt),
    userFk: foreignKey({
      name: "notifications_user_fk",
      columns: [t.organizationId, t.userId],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type Notification = typeof notifications.$inferSelect;
export type NotificationNew = typeof notifications.$inferInsert;
