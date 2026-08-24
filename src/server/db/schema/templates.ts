/**
 * `templates` — SPEC-003 §4.1 (B5, BR-N228..N230).
 *
 * Plantillas de alcance (DEC-FUN-53). 9 plantillas seed (4 web + 5
 * otros, BR-N228, FRANK P-003-1). `type` distingue la familia:
 *   - web: `web_landing | web_sitio | web_app | web_saas`
 *   - otros: `mobile_app | branding | marketing | consultoria | soporte`
 *
 * `content` (jsonb) trae los `project_modules` base (BR-N229) que
 * SPEC-005 consume al crear el Proyecto.
 *
 * `is_seed=true` marca las plantillas sembradas; no se eliminan en
 * operación (el Director puede crear nuevas plantillas aditivas sin
 * tocar las seed).
 */
import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const templates = pgTable(
  "templates",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    /**
     * Tipo canónico (BR-N230):
     *   - web_landing | web_sitio | web_app | web_saas
     *   - mobile_app | branding | marketing | consultoria | soporte
     */
    type: text("type").notNull(),
    description: text("description"),
    /** `project_modules` base (BR-N229) — consumidos por SPEC-005. */
    content: jsonb("content").notNull().default({}),
    isSeed: boolean("is_seed").notNull().default(false),
    active: boolean("active").notNull().default(true),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgCodeUnique: uniqueIndex("templates_org_code_unique").on(
      t.organizationId,
      t.code,
    ),
    orgTypeIdx: index("templates_org_type_idx").on(t.organizationId, t.type),
  }),
);

export type Template = typeof templates.$inferSelect;
export type TemplateNew = typeof templates.$inferInsert;
