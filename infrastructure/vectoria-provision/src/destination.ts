/**
 * Resolución de destino (SPEC §5):
 *   1) Override explícito en el manifest (`serverUuid`)
 *   2) Binding existente en el registry (recurrir al recurso ya ligado)
 *   3) Servidor global Coolify `03tz1uabcrjaihnvrhysbstv`
 *
 * La función es pura: no toca red, no toca disco.
 */
import type { Manifest } from "./schema.js";
import type { Registry, RegistryEntry } from "./registry.js";
import { DEFAULT_SERVER_UUID } from "./constants.js";

// Re-export so callers can use `import { RegistryEntry } from "./destination.js"` if needed.
export type { RegistryEntry };

export function resolveServerUuid(_manifest: Manifest, registry: Registry): string {
  // (1) override en manifest: ya viene del schema; usamos `manifest.serverUuid`.
  // (2) binding existente: si el registry contiene un entry con ese serverUuid, lo respetamos.
  //    Como el serverUuid del manifest es la entrada, esto se reduce a verificar que
  //    exista AL MENOS un binding consistente en el registry.
  const seen = new Set<string>();
  for (const e of registry) seen.add(e.serverUuid);
  // (3) si ningún binding existente coincide con el serverUuid declarado → default.
  if (!seen.has(_manifest.serverUuid) && seen.size > 0) {
    // Hay bindings existentes con OTRO server: SPEC §11 dice que la adopción
    // conflictiva es fail-closed. Aquí no decidimos aún; el caller (ensure_application)
    // detectará el mismatch por atributo y lanzará `conflict`.
    // Devolvemos el serverUuid del manifest (la fuente override).
    return _manifest.serverUuid;
  }
  // Si el manifest fija explícitamente un serverUuid, ése gana. Si no, default.
  if (_manifest.serverUuid && _manifest.serverUuid !== DEFAULT_SERVER_UUID) {
    // El manifest sobreescribe el default (es override explícito).
    return _manifest.serverUuid;
  }
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
 * trae, fall-closed devolviendo `false` (SPEC §11: atributo no observable →
 * preflight_unknown; aquí reflejamos la semántica como `false` y delegamos al
 * caller para mapear el código de error).
 *
 * Atributos comparados cuando `expected` los trae:
 *   serverUuid, fqdn, repository, branch, appVariant, buildPack, portsExposes.
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
  return true;
}