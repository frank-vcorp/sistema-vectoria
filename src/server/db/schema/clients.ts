/**
 * `clients` — SPEC-002 §4.1. PK compuesta `(organization_id, id)`.
 *
 * El cliente **nace sólo** desde un prospecto `calificado`
 * (BR-N168; `prospectId` no nullable en operación, nullable sólo
 * para una futura alta manual que la SPEC excluye). En MVP no se
 * permite alta manual aislada (AC-1).
 *
 * `clientNumber` es BR-N216: único por organización. Lo emite el
 * servicio (formato `C-{NNNNNN}` por legibilidad operativa).
 *
 * El cliente **se archiva, no se elimina** (BR-N215). `status` es
 * `active | archived`; `archivedReason` obligatorio al archivar.
 */
import {
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { prospects } from "./prospects";

export const clients = pgTable(
  "clients",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    /** BR-N216: número único por organización. */
    clientNumber: text("client_number").notNull(),
    /** BR-N168: FK al prospecto del que nació. */
    prospectId: uuid("prospect_id"),
    name: text("name").notNull(),
    company: text("company"),
    email: text("email"),
    phone: text("phone"),
    /** `active | archived` (BR-N215). */
    status: text("status").notNull().default("active"),
    archivedReason: text("archived_reason"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgNumberUnique: uniqueIndex("clients_org_number_unique").on(
      t.organizationId,
      t.clientNumber,
    ),
    orgIdx: index("clients_org_idx").on(t.organizationId),
    statusIdx: index("clients_org_status_idx").on(t.organizationId, t.status),
    prospectFk: foreignKey({
      name: "clients_prospect_fk",
      columns: [t.organizationId, t.prospectId],
      foreignColumns: [prospects.organizationId, prospects.id],
    }),
  }),
);

export type Client = typeof clients.$inferSelect;
export type ClientNew = typeof clients.$inferInsert;