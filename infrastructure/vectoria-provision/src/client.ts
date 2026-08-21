/**
 * Cliente HTTP Coolify (SPEC §7) — GET/POST/PATCH con timeout,
 * mapeo de status → código estable, y redacción obligatoria de respuestas.
 *
 * Diferencias con coolify-write/src/client.ts (MCP):
 *  - Este cliente se usa desde el runner (CLI one-shot, fuera de MCP).
 *  - Métodos permitidos: GET (preflight/reconcile), POST (create), PATCH (envs).
 *  - DELETE/DEPLOY/PUT están PROHIBIDOS por SPEC §22 (no son parte del runner).
 *  - No hay allowlist estática: el manifest canónico es el contrato.
 */

import { redact, safeErrorMessage } from "./redact.js";
import type { RunnerConfig } from "./schema.js";

export const ALLOWED_PATH_TEMPLATES: readonly string[] = [
  "/teams",
  "/teams/{id}",
  "/servers",
  "/servers/{uuid}",
  "/projects",
  "/projects/{uuid}",
  "/projects/{uuid}/environments",
  "/applications",
  "/applications/{uuid}",
  "/applications/{uuid}/envs",
  "/databases",
  "/databases/{uuid}",
  "/databases/{type}",
  "/services",
  "/services/{uuid}",
];

const ALLOWED_PATTERNS: readonly RegExp[] = ALLOWED_PATH_TEMPLATES.map((t) => {
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withGroups = escaped.replace(/\\\{[a-zA-Z]+\\\}/g, "[^/]+");
  return new RegExp(`^${withGroups}$`);
});

function hasDotSegment(path: string): boolean {
  if (path.length === 0) return false;
  if (path.includes("/../") || path.includes("/./")) return true;
  if (path.startsWith("../") || path.startsWith("./")) return true;
  if (path.endsWith("/..") || path.endsWith("/.")) return true;
  if (path === ".." || path === ".") return true;
  for (const seg of path.split("/")) if (seg === "." || seg === "..") return true;
  return false;
}

export function isPathAllowed(path: string): boolean {
  if (hasDotSegment(path)) return false;
  for (const re of ALLOWED_PATTERNS) if (re.test(path)) return true;
  return false;
}

export type ClientResult<T = unknown> =
  | { ok: true; data: T; httpStatus: number }
  | { ok: false; error: { code: string; status?: number; message: string } };

export type Verb = "GET" | "POST" | "PATCH";

export interface ClientRequest {
  verb: Verb;
  path: string;
  body?: unknown;
  /** Override token (default: read token; para POST/PATCH usar write token). */
  tokenOverride?: string;
  /** Override de timeout en ms (default cfg.timeoutMs). */
  timeoutMsOverride?: number;
}

function buildUrl(baseUrl: string, apiPrefix: string, path: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const prefix = apiPrefix.startsWith("/") ? apiPrefix : `/${apiPrefix}`;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${prefix}${p}`;
}

function mapStatusToCode(status: number): string {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 408) return "timeout";
  if (status === 422) return "validation";
  if (status >= 500 && status < 600) return "upstream_error";
  return "upstream_error";
}

/**
 * Una sola función `call` con GET/POST/PATCH. La gramática de status es:
 *  - 2xx → ok=true
 *  - 4xx → ok=false, code=`upstream_40x` (terminal salvo 409 reconciliable)
 *  - 5xx / timeout / abort → ok=false, code=`timeout`/`upstream_error` (RECONCILIABLE)
 *
 * El token NUNCA aparece en la respuesta; sólo se usa para redactar y para
 * autenticar el wire request.
 */
export async function call<T = unknown>(
  cfg: RunnerConfig,
  req: ClientRequest,
): Promise<ClientResult<T>> {
  if (!isPathAllowed(req.path)) {
    return { ok: false, error: { code: "path_not_allowed", message: `path: ${req.path}` } };
  }
  const token =
    req.tokenOverride ??
    (req.verb === "GET" ? cfg.COOLIFY_READ_TOKEN : cfg.COOLIFY_WRITE_TOKEN);
  if (!token || token.length === 0) {
    return {
      ok: false,
      error: { code: "not_configured", message: `${req.verb === "GET" ? "read" : "write"} token ausente` },
    };
  }

  const url = buildUrl(cfg.COOLIFY_BASE_URL, cfg.COOLIFY_API_PREFIX, req.path);
  const controller = new AbortController();
  const timeoutMs = req.timeoutMsOverride ?? cfg.COOLIFY_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "vectoria-provision/1.0",
    };
    const init: RequestInit = {
      method: req.verb,
      headers,
      signal: controller.signal,
    };
    if (req.body !== undefined) {
      (headers as Record<string, string>)["Content-Type"] = "application/json";
      init.body = JSON.stringify(req.body);
    }

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (e: unknown) {
      const isAbort =
        (e instanceof Error && e.name === "AbortError") ||
        (typeof e === "object" && e !== null && (e as { name?: string }).name === "AbortError");
      if (isAbort) {
        return { ok: false, error: { code: "timeout", message: `request timed out after ${timeoutMs}ms` } };
      }
      const msg = e instanceof Error ? e.message : "unknown fetch error";
      return { ok: false, error: { code: "upstream_error", message: safeErrorMessage(msg, [token]) } };
    }

    if (!res.ok) {
      // 4xx (salvo 408) → terminal; 408/5xx/timeout → reconciable
      const code = mapStatusToCode(res.status);
      return {
        ok: false,
        error: {
          code,
          status: res.status,
          message: safeErrorMessage(`upstream returned status ${res.status}`, [token]),
        },
      };
    }

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text.length === 0 ? {} : JSON.parse(text);
    } catch {
      return { ok: false, error: { code: "bad_response", message: "non-JSON response" } };
    }
    return { ok: true, data: redact(parsed, [token]) as T, httpStatus: res.status };
  } finally {
    clearTimeout(timer);
  }
}

/** Extrae `uuid` (o `id`) de un payload Coolify; nunca inventa. */
export function extractUuid(data: unknown): string | undefined {
  if (data === null || typeof data !== "object") return undefined;
  const obj = data as Record<string, unknown>;
  for (const k of ["uuid", "id"]) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

/**
 * Verifica `fqdn` → IP esperada vía DNS. Resuelve `getent ahosts <fqdn>`.
 * No resuelve → `dns_unresolved` (no crea la app, SPEC §16).
 *
 * Inyectable: `setDnsResolver(fn)` permite a los tests simular la resolución
 * sin tocar red. El resolver por defecto usa `getent` vía child_process.
 */
export type DnsResolver = (fqdn: string, expectedIp: string) => Promise<{ ok: true; ip: string } | { ok: false; code: "dns_unresolved" }>;

let currentResolver: DnsResolver = defaultResolver;

export function setDnsResolver(fn: DnsResolver): void {
  currentResolver = fn;
}

export function resetDnsResolver(): void {
  currentResolver = defaultResolver;
}

async function defaultResolver(fqdn: string, expectedIp: string): Promise<{ ok: true; ip: string } | { ok: false; code: "dns_unresolved" }> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileP = promisify(execFile);
  try {
    const { stdout } = await execFileP("getent", ["ahosts", fqdn], { timeout: 5000 });
    const ips = stdout
      .split("\n")
      .map((l) => l.trim().split(/\s+/)[0])
      .filter((ip): ip is string => typeof ip === "string" && ip.length > 0 && /^\d+\.\d+\.\d+\.\d+$/.test(ip));
    if (ips.length === 0) return { ok: false, code: "dns_unresolved" };
    if (!ips.includes(expectedIp)) return { ok: false, code: "dns_unresolved" };
    return { ok: true, ip: expectedIp };
  } catch {
    return { ok: false, code: "dns_unresolved" };
  }
}

export async function resolveDns(fqdn: string, expectedIp: string): Promise<{ ok: true; ip: string } | { ok: false; code: "dns_unresolved" }> {
  return currentResolver(fqdn, expectedIp);
}