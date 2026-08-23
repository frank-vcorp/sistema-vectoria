/**
 * Preflight P7: auth scopes — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.1 P7 + AC-06 (auth_scope_missing).
 *
 * Read-only: verifica presencia de tokens. Si la operación es mutante
 * (paso 6+ del trigger) y falta el WRITE token → `auth_scope_missing`.
 *
 * El READ token es siempre obligatorio para preflight (P6 schema
 * endpoints requiere autenticación).
 */
export interface PreflightAuthScopesInput {
  hasReadToken: boolean;
  hasWriteToken: boolean;
  operation: "ensure" | "preflight-only" | "push-mode";
}

export interface PreflightAuthScopesResult {
  ok: boolean;
  reason?: string;
}

export function checkAuthScopes(input: PreflightAuthScopesInput): PreflightAuthScopesResult {
  if (!input.hasReadToken) {
    return { ok: false, reason: "auth_scope_missing:read_token" };
  }
  if ((input.operation === "ensure" || input.operation === "push-mode") && !input.hasWriteToken) {
    return { ok: false, reason: "auth_scope_missing:write_token" };
  }
  return { ok: true };
}
