/**
 * `projects` — SPEC-005 §4.1 (B9, BR-N246..N254, BR-N375..N385,
 * BR-N392, BR-N407). PK compuesta `(organization_id, id)`.
 *
 * El Proyecto nace al autorizar la OS mediante el workflow atómico
 * `project_creation` (universal — toda OS autorizada crea Proyecto,
 * BR-N407/N03, DEC-FUN-68). Esta tabla es la **única** dueña del
 * proyecto; `orders` no la referencia (el FK `orders.project_id` NO
 * se crea aquí — la OS vincula por `project_id` en `json_discovery_imports`
 * y por `order_id` único en `projects`, lado proyecto).
 *
 * Estados 3D independientes (BR-N253):
 *  - `status_stage`: planning | development | testing | client_validation | delivery
 *  - `status_situation`: pending | active | paused | completed | cancelled
 *  - `health` (manual, override) y `health_calculated` (computada desde
 *    los módulos) conviven (BR-N254).
 *
 * `health_override_reason` es obligatorio cuando `health !==
 * health_calculated` (BR-N254; rechazo `HEALTH_REASON_REQUIRED`).
 *
 * `plan_version` se incrementa con cada `json_discovery.import`
 * aprobado (BR-N398).
 *
 * Índices:
 *  - UNIQUE `(organization_id, order_id)` — 1 proyecto por OS (BR-N407).
 *  - UNIQUE `(organization_id, code)` — código humano único por org.
 *  - `(organization_id, status_stage, status_situation)` — dashboards.
 *  - `(organization_id, pl_user_id)` — "mis proyectos" PL.
 *
 * FK compuestas:
 *  - `orders(organization_id, id)` con UNIQUE por par (BR-N407).
 *  - `clients(organization_id, id)`.
 *  - `users(organization_id, id)` para `pl_user_id` (BR-N245 / DEC-FUN-56).
 *  - `templates(organization_id, id)` — esqueleto base.
 *  - `project_scope_snapshots(organization_id, id)` (referencia lógica,
 *    snapshot es inmutable, BR-N251).
 */
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { clients } from "./clients";
import { orders } from "./orders";
import { organizations } from "./organizations";
import { templates } from "./templates";
import { users } from "./users";

export const projects = pgTable(
  "projects",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    /** Código humano único por organización (`PR-NNNNN`). */
    code: text("code").notNull(),
    /** BR-N407 · UNIQUE por OS. La OS es el contrato de origen. */
    orderId: uuid("order_id").notNull(),
    /** Cliente del proyecto (copia de `orders.client_id`). */
    clientId: uuid("client_id").notNull(),
    /**
     * BR-N382 / DEC-FUN-56 · PL asignado por construcción
     * (`project_creation` inserta `project_members(pl, role='lider')`).
     */
    plUserId: uuid("pl_user_id").notNull(),
    /** Plantilla cuyo esqueleto cargó el proyecto (módulos base). */
    templateId: uuid("template_id").notNull(),
    /**
     * SPEC-005 §4.1 · Etapa del proyecto (BR-N253). Inicial `planning`.
     */
    statusStage: text("status_stage").notNull().default("planning"),
    /** BR-N253 · Situación del proyecto. Inicial `pending`. */
    statusSituation: text("status_situation").notNull().default("pending"),
    /** BR-N254 · Salud manual (PL override). */
    health: text("health").notNull().default("on_track"),
    /** BR-N254 · Salud calculada a partir de los módulos. */
    healthCalculated: text("health_calculated").notNull().default("on_track"),
    /** BR-N254 · Motivo obligatorio si `health !== health_calculated`. */
    healthOverrideReason: text("health_override_reason"),
    /** BR-N250 / BR-N379 · motivos laterales (pause/cancel). */
    pauseReason: text("pause_reason"),
    cancelReason: text("cancel_reason"),
    /** BR-N398 · Versión del plan. Se incrementa con cada import. */
    planVersion: integer("plan_version").notNull().default(1),
    /** BR-N248 · cierre técnico — `deployed` por módulo. */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** BR-N249 / DEC-FUN-35 · cancelación con revisión de reembolso. */
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgCodeUnique: uniqueIndex("projects_org_code_unique").on(
      t.organizationId,
      t.code,
    ),
    orgOrderUnique: uniqueIndex("projects_org_order_unique").on(
      t.organizationId,
      t.orderId,
    ),
    orgStageSituationIdx: index("projects_org_stage_situation_idx").on(
      t.organizationId,
      t.statusStage,
      t.statusSituation,
    ),
    plIdx: index("projects_pl_idx").on(t.organizationId, t.plUserId),
    orderFk: foreignKey({
      name: "projects_order_fk",
      columns: [t.organizationId, t.orderId],
      foreignColumns: [orders.organizationId, orders.id],
    }),
    clientFk: foreignKey({
      name: "projects_client_fk",
      columns: [t.organizationId, t.clientId],
      foreignColumns: [clients.organizationId, clients.id],
    }),
    plFk: foreignKey({
      name: "projects_pl_fk",
      columns: [t.organizationId, t.plUserId],
      foreignColumns: [users.organizationId, users.id],
    }),
    templateFk: foreignKey({
      name: "projects_template_fk",
      columns: [t.organizationId, t.templateId],
      foreignColumns: [templates.organizationId, templates.id],
    }),
  }),
);

export type Project = typeof projects.$inferSelect;
export type ProjectNew = typeof projects.$inferInsert;

/**
 * `project_members` — SPEC-005 §4.1 (B10, BR-N382, DEC-FUN-56).
 *
 * PK compuesta `(organization_id, id)`. El PL se inserta por
 * **construcción** en `project_creation` con `project_role='lider'`
 * (BR-N382). La incorporación de OTROS miembros la realiza SPEC-006
 * (excluida del MVP).
 *
 * Visibilidad: la UI/queries ya filtran por membresía activa
 * (`active=true`) y `project_role` cuando aplique.
 */
export const projectMembers = pgTable(
  "project_members",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    userId: uuid("user_id").notNull(),
    /** DEC-FUN-56 · `lider | programador | disenador | qa`. */
    projectRole: text("project_role").notNull().default("lider"),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    assignedBy: uuid("assigned_by"),
    active: boolean("active").notNull().default(true),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgProjectIdx: index("project_members_org_project_idx").on(
      t.organizationId,
      t.projectId,
    ),
    orgUserIdx: index("project_members_org_user_idx").on(
      t.organizationId,
      t.userId,
    ),
    /**
     * 1 fila activa líder por proyecto (BR-N382). Esto permite varios
     * miembros `lider` históricos (asignación secuencial) pero sólo 1
     * activo a la vez. La baja se hace poniendo `active=false`.
     */
    orgProjectActiveLiderUnique: uniqueIndex(
      "project_members_org_project_active_lider_unique",
    )
      .on(t.organizationId, t.projectId)
      .where(sql`t.project_role = 'lider' AND t.active = true`),
    projectFk: foreignKey({
      name: "project_members_project_fk",
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
    }),
    userFk: foreignKey({
      name: "project_members_user_fk",
      columns: [t.organizationId, t.userId],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type ProjectMember = typeof projectMembers.$inferSelect;
export type ProjectMemberNew = typeof projectMembers.$inferInsert;

/**

/**
 * `project_scope_snapshots` — SPEC-005 §4.1 (BR-N251, BR-N380/381).
 *
 * PK compuesta `(organization_id, id)`. **Inmutable**: el servicio NO
 * expone mutators de `scope_json` (BR-N351). `source_scope_id`
 * referencia el `scope_documents.id` del que se copió (defensa de
 * proveniencia).
 *
 * La copia se materializa en `project_creation` dentro de la misma
 * transacción que crea el proyecto (BR-N251).
 */
export const projectScopeSnapshots = pgTable(
  "project_scope_snapshots",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    /** BR-N251 · copia inmutable del alcance vendido. */
    scopeJson: jsonb("scope_json").notNull().default({}),
    /** `scope_documents.id` de origen (defensa de proveniencia). */
    sourceScopeId: uuid("source_scope_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgProjectIdx: index("project_scope_snapshots_org_project_idx").on(
      t.organizationId,
      t.projectId,
    ),
    projectFk: foreignKey({
      name: "project_scope_snapshots_project_fk",
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
    }),
  }),
);

export type ProjectScopeSnapshot = typeof projectScopeSnapshots.$inferSelect;
export type ProjectScopeSnapshotNew = typeof projectScopeSnapshots.$inferInsert;

/**
 * `modules` — SPEC-005 §4.1 (B10, BR-N260/113/114, BR-N229).
 *
 * Esqueleto cargado desde `templates.content.project_modules` en
 * `project_creation` (BR-N229). Cada módulo tiene su propio estado
 * (BR-N260) y salud. `deployed` es cierre técnico (BR-N113) — los
 * gates explícitos viven en SPEC-006.
 *
 * PK compuesta `(organization_id, id)`. UNIQUE por
 * `(organization_id, project_id, code)` para idempotencia de la carga
 * del esqueleto.
 */
export const modules = pgTable(
  "modules",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** BR-N113/114/260 · ver `MODULE_STATUSES` en `shared/enums`. */
    status: text("status").notNull().default("pending"),
    /** BR-N114 · dependencias módulo-a-módulo (jsonb: array de códigos). */
    dependsOnModules: jsonb("depends_on_modules").notNull().default([]),
    sortOrder: integer("sort_order").notNull().default(0),
    required: boolean("required").notNull().default(false),
    deployedAt: timestamp("deployed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgProjectCodeUnique: uniqueIndex("modules_org_project_code_unique").on(
      t.organizationId,
      t.projectId,
      t.code,
    ),
    orgProjectIdx: index("modules_org_project_idx").on(
      t.organizationId,
      t.projectId,
    ),
    projectFk: foreignKey({
      name: "modules_project_fk",
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
    }),
  }),
);

export type Module = typeof modules.$inferSelect;
export type ModuleNew = typeof modules.$inferInsert;

/**
 * `json_discovery_imports` — SPEC-005 §4.1 (BR-N396..N398, ADR-11).
 *
 * Bitácora versionada de cada exportación e importación del JSON
 * Discovery. `version` incrementa por import aprobado; `result` guarda
 * el diff observado (altas/cambios/conflictos). La inmutabilidad de
 * `project_id`/`folio`/`included` se verifica ANTES de registrar el
 * import (BR-N353).
 *
 * PK compuesta `(organization_id, id)`. UNIQUE por
 * `(organization_id, project_id, version)` — idempotencia round-trip
 * (BR-N397): reimportar misma versión no duplica.
 */
export const jsonDiscoveryImports = pgTable(
  "json_discovery_imports",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: uuid("id").notNull().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    /** Versión del plan asociada a esta entrada (1-based). */
    version: integer("version").notNull(),
    /** "export" | "import". */
    kind: text("kind").notNull(),
    actorUserId: uuid("actor_user_id"),
    /** Resultado: para export = `{}`; para import = `{ adds, changes, conflicts }`. */
    result: jsonb("result").notNull().default({}),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** `applied | rejected | noop` — `noop` cuando idempotente (BR-N397). */
    status: text("status").notNull().default("applied"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.id] }),
    orgProjectVersionUnique: uniqueIndex(
      "json_discovery_imports_org_project_version_unique",
    ).on(t.organizationId, t.projectId, t.version, t.kind),
    orgProjectIdx: index("json_discovery_imports_org_project_idx").on(
      t.organizationId,
      t.projectId,
      t.importedAt,
    ),
    projectFk: foreignKey({
      name: "json_discovery_imports_project_fk",
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
    }),
    actorFk: foreignKey({
      name: "json_discovery_imports_actor_fk",
      columns: [t.organizationId, t.actorUserId],
      foreignColumns: [users.organizationId, users.id],
    }),
  }),
);

export type JsonDiscoveryImport = typeof jsonDiscoveryImports.$inferSelect;
export type JsonDiscoveryImportNew = typeof jsonDiscoveryImports.$inferInsert;