/**
 * `audit_logs` (BR-N336/337). PK compuesta `(organization_id, id)`.
 * `actor_role_code` se persiste para acciones críticas combinables.
 * `request_id` propaga `Context.requestId` (AC-8, AC-31).
 * FK compuesta `actor_user_id → users(organization_id, id)` (AC-44).
 */
import {
  bigint,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const auditLogs = pgTable(
  "audit_logs",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    actorUserId: uuid("actor_user_id"),
    actorRoleCode: text("actor_role_code"),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgCreatedIdx: index("audit_logs_org_created_idx").on(t.organizationId, t.createdAt),
    entityIdx: index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    actorIdx: index("audit_logs_actor_idx").on(t.actorUserId),
    actorFk: foreignKey({
      name: "audit_logs_actor_fk",
      columns: [t.organizationId, t.actorUserId],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type AuditLogNew = typeof auditLogs.$inferInsert;

/**
 * Tipo `bigint` para Drizzle. En Drizzle, `bigint` retorna string por defecto.
 * Aquí lo usamos para `created_at` si queremos timestamps UNIX nanosegundos.
 * (No se usa actualmente; dejamos el import por si se requiere en SPEC futura.)
 */
export const __unused_bigint_keep_for_future__ = bigint;
