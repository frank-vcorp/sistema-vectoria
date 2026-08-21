/**
 * `refresh_tokens` — sesiones rotantes (ADR-06 §2.1). PK `id` simple.
 * `family_id` agrupa tokens rotados; reutilización → revoca familia entera.
 */
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    familyId: uuid("family_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
    createdByIp: text("created_by_ip"),
    createdByUaHash: text("created_by_ua_hash"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenIdx: uniqueIndex("refresh_tokens_hash_unique").on(t.tokenHash),
    familyIdx: index("refresh_tokens_family_idx").on(t.familyId),
    userIdx: index("refresh_tokens_user_idx").on(t.userId),
  }),
);

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type RefreshTokenNew = typeof refreshTokens.$inferInsert;
