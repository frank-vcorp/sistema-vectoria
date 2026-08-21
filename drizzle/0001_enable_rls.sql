-- Migración ENABLE RLS (AC-12 / AC-40 / AC-74).
--
-- Esta migración **NO SE APLICA en MVP** (una sola organización). Queda
-- presente en el repo como gate de activación para cuando Frank añada la
-- 2ª organización. Las políticas filtran por `current_setting('app.current_org')`
-- establecida por la capa de servicio.
--
-- AC-74: las políticas `CREATE POLICY` están **descomentadas** (no son
-- plantilla); se aplican vía `scripts/seed-rls.ts` (no no-op) sobre la
-- misma BD aunque `RLS` siga `disabled`. La activación de RLS es una
-- migración separada, gateada por AC-12, ejecutada por Frank.
--
-- Cita: ADR-02 §3, AC-12, AC-40, AC-74.

-- Habilita RLS en tablas con organization_id.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_fiscal_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_log_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_links ENABLE ROW LEVEL SECURITY;

-- Políticas de aislamiento (AC-74). `current_setting('app.current_org')`
-- se setea por la capa de servicio (auth/session) antes de cada tx.
-- Idempotente con `DROP POLICY IF EXISTS`.

DROP POLICY IF EXISTS org_isolation ON organization_fiscal_config;
CREATE POLICY org_isolation ON organization_fiscal_config
  USING (organization_id::text = current_setting('app.current_org', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org', true));

DROP POLICY IF EXISTS org_isolation ON users;
CREATE POLICY org_isolation ON users
  USING (organization_id::text = current_setting('app.current_org', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org', true));

DROP POLICY IF EXISTS org_isolation ON credentials;
CREATE POLICY org_isolation ON credentials
  USING (organization_id::text = current_setting('app.current_org', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org', true));

DROP POLICY IF EXISTS org_isolation ON invitations;
CREATE POLICY org_isolation ON invitations
  USING (organization_id::text = current_setting('app.current_org', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org', true));

DROP POLICY IF EXISTS org_isolation ON roles;
CREATE POLICY org_isolation ON roles
  USING (organization_id::text = current_setting('app.current_org', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org', true));

DROP POLICY IF EXISTS org_isolation ON permissions;
CREATE POLICY org_isolation ON permissions
  USING (organization_id::text = current_setting('app.current_org', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org', true));

DROP POLICY IF EXISTS org_isolation ON role_permissions;
CREATE POLICY org_isolation ON role_permissions
  USING (organization_id::text = current_setting('app.current_org', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org', true));

DROP POLICY IF EXISTS org_isolation ON user_roles;
CREATE POLICY org_isolation ON user_roles
  USING (organization_id::text = current_setting('app.current_org', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org', true));

DROP POLICY IF EXISTS org_isolation ON user_permissions;
CREATE POLICY org_isolation ON user_permissions
  USING (organization_id::text = current_setting('app.current_org', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org', true));

DROP POLICY IF EXISTS org_isolation ON audit_logs;
CREATE POLICY org_isolation ON audit_logs
  USING (organization_id::text = current_setting('app.current_org', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org', true));

DROP POLICY IF EXISTS org_isolation ON project_log_entries;
CREATE POLICY org_isolation ON project_log_entries
  USING (organization_id::text = current_setting('app.current_org', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org', true));

DROP POLICY IF EXISTS org_isolation ON notifications;
CREATE POLICY org_isolation ON notifications
  USING (organization_id::text = current_setting('app.current_org', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org', true));

DROP POLICY IF EXISTS org_isolation ON files;
CREATE POLICY org_isolation ON files
  USING (organization_id::text = current_setting('app.current_org', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org', true));

DROP POLICY IF EXISTS org_isolation ON file_links;
CREATE POLICY org_isolation ON file_links
  USING (organization_id::text = current_setting('app.current_org', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org', true));
