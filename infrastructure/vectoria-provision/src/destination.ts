/**
 * Resolución de destino (SPEC §5 + SPEC-20260821-001 §8 + SPEC-GAP-20260821-07 §2.5):
 *
 *   1) Override explícito en el manifest (`serverUuid`)
 *   2) Binding existente en el registry (recurrir al recurso ya ligado)
 *   3) global-profile.defaults.serverUuid (capa 1)
 *   4) Hardcoded `03tz1uabcrjaihnvrhysbstv` (capa 0)
 *
 * Adopción con scope (v2.0):
 *  - `isCompatibleBinding` admite `projectNamespace` arg; entries con
 *    `attrs.projectNamespace` distinto al del manifest entrante → fail-closed
 *    (compat retroactiva: `attrs.projectNamespace === undefined` se acepta
 *    como namespace default `vectoria:<taskId>`; ver §8.1 SPEC-001).
 */
import type { Manifest } from "./schema.js";
import type { Registry, RegistryEntry } from "./registry.js";
import { DEFAULT_SERVER_UUID } from "./constants.js";
import type { GlobalProfile } from "./global-profile.js";

// Re-export so callers can use `import { RegistryEntry } from "./destination.js"` if needed.
export type { RegistryEntry };

/**
 * Resuelve el serverUuid respetando las 4 capas de precedencia.
 *
 * @param manifest        manifest v2 (con `serverUuid` opcional).
 * @param registry        registry cargado.
 * @param globalProfile   global-profile (capa 1). Si `undefined`, sólo se
 *                        usan manifest + hardcoded.
 */
export function resolveServerUuid(
  _manifest: Manifest,
  registry: Registry,
  globalProfile?: GlobalProfile,
): string {
  // (1) override en manifest: si serverUuid está declarado y NO es el default
  //     hardcoded, gana.
  if (_manifest.serverUuid && _manifest.serverUuid !== DEFAULT_SERVER_UUID) {
    return _manifest.serverUuid;
  }
  // (2) binding existente: si el registry contiene AL MENOS un binding consistente.
  const seen = new Set<string>();
  for (const e of registry) seen.add(e.serverUuid);
  if (seen.has(_manifest.serverUuid) && seen.size > 0) {
    return _manifest.serverUuid;
  }
  // (3) global-profile (capa 1)
  if (globalProfile?.defaults.serverUuid) {
    return globalProfile.defaults.serverUuid;
  }
  // (4) hardcoded (capa 0)
  return DEFAULT_SERVER_UUID;
}

/**
 * Construye un `destination` que resume la decisión de ejecución.
 */
export interface Destination {
  serverUuid: string;
  source: "override" | "binding" | "default";
}

export function ensureDestination(manifest: Manifest, registry: Registry, resolved: string): Destination {
  // Decide el origen del serverUuid
  if (manifest.serverUuid && manifest.serverUuid !== DEFAULT_SERVER_UUID) {
    // Override explícito del manifest.
    return { serverUuid: manifest.serverUuid, source: "override" };
  }
  // ¿Hay binding existente que liga al default server?
  const hasDefault = registry.some((e) => e.serverUuid === DEFAULT_SERVER_UUID);
  if (hasDefault) return { serverUuid: DEFAULT_SERVER_UUID, source: "binding" };
  return { serverUuid: resolved, source: "default" };
}

/**
 * Para `ensure_application` valida que el binding existente sea compatible con
 * el manifest (SPEC §11 + AC-7). Compara sólo los atributos que `expected` trae
 * definidos: si el binding observado no expone un atributo y el manifest sí lo
 * trae, fail-closed devolviendo `false` (SPEC §11: atributo no observable →
 * preflight_unknown; aquí reflejamos la semántica como `false` y delegamos al
 * caller para mapear el código de error).
 *
 * Atributos comparados cuando `expected` los trae:
 *   serverUuid, fqdn, repository, branch, appVariant, buildPack, portsExposes,
 *   projectNamespace (v2.0 NUEVO).
 *
 * `engine` y `serviceType` NO se comparan aquí: §11 no los exige para adopción.
 */
export function isCompatibleBinding(
  entry: RegistryEntry,
  expected: {
    serverUuid: string;
    fqdn?: string;
    repository?: string;
    branch?: string;
    appVariant?: string;
    buildPack?: string;
    portsExposes?: string;
    projectNamespace?: string;
  },
): boolean {
  if (entry.serverUuid !== expected.serverUuid) return false;
  if (expected.fqdn && entry.fqdn && entry.fqdn !== expected.fqdn) return false;
  if (expected.repository) {
    const repo = entry.attrs["repository"] ?? entry.attrs["repo"];
    // Semántica previa: sólo se compara si el binding lo trae definido.
    // (Project bindings no suelen traer repo/branch en `attrs`.)
    if (repo && repo !== expected.repository) return false;
  }
  if (expected.branch) {
    const br = entry.attrs["branch"];
    if (br && br !== expected.branch) return false;
  }
  // Atributos de aplicación (SPEC §11 + AC-7): el caller (ensure_application)
  // siempre los trae en `expected` cuando adopta, y la convención del registry
  // es que todo binding de aplicación los persiste. Si el binding no los trae
  // → fail-closed: el adopt asume que el recurso observado no es comparable
  // de forma segura (atributo no observable).
  if (expected.appVariant !== undefined) {
    const observed = entry.attrs["appVariant"];
    if (!observed || observed !== expected.appVariant) return false;
  }
  if (expected.buildPack !== undefined) {
    const observed = entry.attrs["buildPack"];
    if (!observed || observed !== expected.buildPack) return false;
  }
  if (expected.portsExposes !== undefined) {
    const observed = entry.attrs["portsExposes"];
    if (!observed || observed !== expected.portsExposes) return false;
  }
  // v2.0 projectNamespace: si el manifest entrante declara namespace, el
  // binding debe coincidir O ser legacy (attrs.projectNamespace ausente
  // y el caller namespace == "vectoria:<taskId>" default).
  if (expected.projectNamespace !== undefined) {
    const observed = entry.attrs["projectNamespace"];
    if (observed === undefined) {
      // Entry legacy sin namespace — su namespace efectivo se asume como
      // `vectoria:<taskId>` (compat retroactiva AC-R-8). Sólo compatible si
      // el caller está exactamente en ese namespace default.
      const assumedLegacyNamespace = `vectoria:${entry.taskId}`;
      if (expected.projectNamespace !== assumedLegacyNamespace) {
        return false;
      }
    } else if (observed !== expected.projectNamespace) {
      return false;
    }
  }
  return true;
}

/** Construye `project.namespace` a partir del manifest v2 (con fallback retro-compat). */
export function manifestProjectNamespace(m: Manifest): string {
  // Cast: `Manifest` (input type) puede no tener `project` en la rama v1;
  // el cast es seguro porque el parse SIEMPRE produce v2 strict output.
  const v2 = m as { project?: { namespace?: string; parent?: string; id?: string } };
  if (v2.project?.namespace !== undefined) return v2.project.namespace;
  const parent = v2.project?.parent ?? "vectoria";
  const id = v2.project?.id ?? m.taskId;
  return `${parent}:${id}`;
}