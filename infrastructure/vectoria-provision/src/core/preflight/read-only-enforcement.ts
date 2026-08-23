/**
 * Preflight read-only enforcement — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4 (cierre §7.3 SOL-20260822-01).
 *
 * El preflight es ESTRICTAMENTE GET/read-only. Si durante cualquier
 * check se emite un verbo mutante (POST/PATCH/PUT/DELETE), el detector
 * aborta con `infra_blocked(preflight_attempted_mutation)` (exit 70).
 *
 * Implementación:
 *  - `ReadOnlyEnforcement` envuelve un `fetch` y cuenta verbos mutantes.
 *  - El orquestador de preflight (§index.ts) crea el enforcement al
 *    inicio y lo consulta al final.
 *  - Si `mutations > 0` aunque el check individual haya pasado, el
 *    preflight se considera FALLIDO y se aborta.
 *
 * Aplicable a:
 *  - P6 (schema endpoints) — los probes pueden intentar POST.
 *  - P10 (secrets check) — un check mal escrito podría PATCH.
 *  - Cualquier adapter nuevo.
 */
export const PREFLIGHT_READONLY_VIOLATION_EXIT = 70;
export const PREFLIGHT_READONLY_VIOLATION_REASON = "preflight_attempted_mutation";

const MUTANT_VERBS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export interface ReadOnlyEnforcement {
  /**
   * Wrapper de fetch que cuenta verbos mutantes. Si el verbo es mutante
   * Y el caller pasó `allowMutant: false` (default en preflight),
   * registra la violación y lanza `ReadOnlyViolation`.
   *
   * En preflight siempre se llama con `allowMutant: false` ⇒ cualquier
   * mutación aborta inmediatamente.
   */
  fetch(input: string | URL | Request, init?: RequestInit, opts?: { allowMutant?: boolean }): Promise<Response>;
  /** Total de verbos mutantes累计 durante el preflight. */
  countMutations(): number;
  /** Lista de mutaciones registradas (path + verb). */
  list(): ReadOnlyViolation[];
  /** Diagnóstico textual legible. */
  summary(): string;
}

export interface ReadOnlyViolation {
  verb: string;
  path: string;
  at: string;
}

export class ReadOnlyViolation extends Error {
  public readonly exitCode = PREFLIGHT_READONLY_VIOLATION_EXIT;
  public readonly reason = PREFLIGHT_READONLY_VIOLATION_REASON;
  public readonly violations: ReadOnlyViolation[];
  constructor(violations: ReadOnlyViolation[]) {
    super(`preflight attempted ${violations.length} mutation(s): ${violations.map((v) => `${v.verb} ${v.path}`).join(", ")}`);
    this.violations = violations;
  }
}

/**
 * Crea un enforcement que envuelve `globalThis.fetch`. Usado por los
 * checks del preflight que necesitan HTTP (P6 schema endpoints).
 *
 * Si `parent` se provee (otro enforcement ya activo), lo reusa y suma.
 */
export function createReadOnlyEnforcement(parent?: ReadOnlyEnforcement): ReadOnlyEnforcement {
  const violations: ReadOnlyViolation[] = parent ? [...parent.list()] : [];
  const origFetch = globalThis.fetch;

  const wrapped: ReadOnlyEnforcement = {
    async fetch(
      input: string | URL | Request,
      init?: RequestInit,
      opts?: { allowMutant?: boolean },
    ): Promise<Response> {
      const verb = (init?.method ?? "GET").toUpperCase();
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : input.url;
      const path = safePathname(url);
      const allow = opts?.allowMutant === true;
      if (MUTANT_VERBS.has(verb) && !allow) {
        const v: ReadOnlyViolation = { verb, path, at: new Date().toISOString() } as ReadOnlyViolation;
        violations.push(v);
        throw new ReadOnlyViolation([v]);
      }
      // Unreachable (above throws for mutants; below is GET).
      return origFetch(input as unknown as Parameters<typeof origFetch>[0], init);
    },
    countMutations(): number {
      return violations.length;
    },
    list(): ReadOnlyViolation[] {
      return [...violations];
    },
    summary(): string {
      if (violations.length === 0) return "0 mutations during preflight (read-only enforced)";
      return `${violations.length} mutation(s) during preflight: ${violations.map((v) => `${v.verb} ${v.path}`).join(", ")}`;
    },
  };
  return wrapped;
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
