/**
 * git-url.ts — Composición del git_repository URL para `ensure_application` POST.
 *
 * SPEC-20260821-001 §3.1 + ADR-20260821-01 §2.5:
 *  - `manifest.git.host` opcional, defaulta al global-profile `gitHost` (capa 1) o
 *    `"github.com"` (capa 0).
 *  - El POST body de Coolify v4 espera una URL completa `https://${host}/${slug}`.
 *  - Si `manifest.repository` ya es una URL completa (`https://...`), se respeta
 *    verbatim (compat con manifests que ya declaran full URL).
 *
 * Función pública `composeGitRepositoryUrl(repository, gitHost?)`:
 *  - Si `repository` empieza por `http://` o `https://` → retorna `repository` tal cual.
 *  - En caso contrario → retorna `https://${gitHost}/${repository}`.
 *  - Si `gitHost` no se provee, defaulta a `"github.com"`.
 *
 * Esta función es `pure` (no toca red, no toca disco) y se usa en
 * `ensureApplication` POST body (`body.git_repository = composeGitRepositoryUrl(...)`).
 */

const DEFAULT_GIT_HOST = "github.com";

/** Detecta si una cadena parece una URL absoluta (http/https). */
function isAbsoluteHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

/**
 * Compone la URL del repositorio git para el POST de Coolify.
 *
 * @param repository  `"owner/repo"` o URL absoluta
 * @param gitHost     override del host (default `"github.com"`); se aplica sólo
 *                    cuando `repository` NO es URL absoluta.
 * @returns           la URL lista para `body.git_repository`.
 */
export function composeGitRepositoryUrl(repository: string, gitHost?: string): string {
  if (typeof repository !== "string" || repository.length === 0) {
    throw new Error("composeGitRepositoryUrl: repository vacío");
  }
  if (isAbsoluteHttpUrl(repository)) {
    return repository;
  }
  const host = gitHost && gitHost.length > 0 ? gitHost : DEFAULT_GIT_HOST;
  return `https://${host}/${repository}`;
}

/** Re-exporta el default para inspección/tests. */
export const DEFAULT_GIT_REPOSITORY_HOST = DEFAULT_GIT_HOST;