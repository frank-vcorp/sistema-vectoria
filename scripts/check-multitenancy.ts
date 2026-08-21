/** Inspección estática de schema para AC-2; no requiere BD viva. */
import * as schema from "@/server/db/schema";

const businessTables = ["organizationFiscalConfig", "users", "credentials", "invitations", "roles", "permissions", "rolePermissions", "userRoles", "userPermissions", "auditLogs", "projectLogEntries", "notifications", "files", "fileLinks"] as const;
const missing = businessTables.filter((name) => !("organizationId" in (schema[name] as unknown as Record<string, unknown>)));
if (missing.length) { console.error(`ERROR: tablas sin organization_id: ${missing.join(", ")}`); process.exit(1); }
console.info(`OK: ${businessTables.length} tablas con organization_id; 0 sin organization_id`);
