/**
 * `file_links` — polimórfica (BR-N340). Excepción documentada (ADR-02 §8.5):
 * `entity_id` no puede tener FK compuesta porque la entidad destino varía.
 * El aislamiento se cierra con `organization_id` (no nullable) + validación
 * en `canAccessResource` + RLS latente.
 *
 * PK compuesta `(organization_id, file_id, entity_type, entity_id)`.
 * FK compuesta `file_id → files(organization_id, id)` (AC-44).
 */
import {
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { files } from "./files";

export const fileLinks = pgTable(
  "file_links",
  {
    organizationId: uuid("organization_id").notNull(),
    fileId: uuid("file_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.organizationId, t.fileId, t.entityType, t.entityId],
    }),
    orgIdx: index("file_links_org_idx").on(t.organizationId),
    fileFk: foreignKey({
      name: "file_links_file_fk",
      columns: [t.organizationId, t.fileId],
      foreignColumns: [files.organizationId, files.id],
    }),
  }),
);

export type FileLink = typeof fileLinks.$inferSelect;
export type FileLinkNew = typeof fileLinks.$inferInsert;
