/**
 * Preflight P8: DNS wildcard — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.1 P8 + AC-08.
 *
 * Read-only: el caller provee `dnsIp` (ya obtenido vía DNS lookup, p.ej.
 * `dns.lookup` o `dig +short`). Si difiere del `expectedIp` del
 * global-profile → `dns_unresolved` (exit 8).
 */
export interface PreflightDnsInput {
  dnsIp: string | undefined;
  expectedIp: string;
  skipped?: boolean;
}

export interface PreflightDnsResult {
  ok: boolean;
  reason?: string;
}

export function checkDns(input: PreflightDnsInput): PreflightDnsResult {
  if (input.skipped) return { ok: true, reason: "dns_check_skipped" };
  if (!input.dnsIp) return { ok: false, reason: "dns_unresolved" };
  if (input.dnsIp !== input.expectedIp) {
    return {
      ok: false,
      reason: `dns_unresolved:got=${input.dnsIp}!=expected=${input.expectedIp}`,
    };
  }
  return { ok: true };
}
