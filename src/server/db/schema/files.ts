/**
 * `files` — metadatos de archivos en S3-compatible (SPEC §4.1, BR-N371/372).
 * PK compuesta `(organization_id, id)`. El contenido vive en el bucket;
 * la BD sólo guarda metadatos. FK compuesta `uploaded_by → users(...)` (AC-44).
 */
import {
  bigint,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const files = pgTable(
  "files",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    bucketKey: text("bucket_key").notNull(),
    mime: text("mime").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    uploadedBy: uuid("uploaded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgIdx: index("files_org_idx").on(t.organizationId),
    uploadedByFk: foreignKey({
      name: "files_uploaded_by_fk",
      columns: [t.organizationId, t.uploadedBy],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type FileRecord = typeof files.$inferSelect;
export type FileRecordNew = typeof files.$inferInsert;
