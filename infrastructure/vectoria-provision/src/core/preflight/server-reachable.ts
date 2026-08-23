/**
 * Preflight P2/P3: Server reachable + Docker healthy — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.1 P2/P3 + AC-02.
 *
 * Read-only: recibe `serverInfo` (que `probeSchema` ya extrajo vía
 * `coolify_get_server`) y verifica reachability + estado del proxy.
 * No emite ninguna llamada HTTP adicional.
 */
export interface PreflightServerReachableInput {
  isReachable: boolean;
  proxyStatus?: string;
}

export interface PreflightServerReachableResult {
  ok: boolean;
  reason?: string;
}

export function checkServerReachable(input: PreflightServerReachableInput): PreflightServerReachableResult {
  if (!input.isReachable) {
    return { ok: false, reason: "server_unreachable" };
  }
  if (input.proxyStatus !== undefined && input.proxyStatus !== "running") {
    return { ok: false, reason: `docker_proxy_status:${input.proxyStatus}` };
  }
  return { ok: true };
}
