/**
 * Registry local JSONL `600` con escritura atómica y lock exclusivo por slug.
 *
 * SPEC §8.2 + §13 + §15 + SPEC-20260821-001 §6 + SPEC-GAP-20260821-07 §2.4:
 *  - `uuid` SOLO de respuestas Coolify (jamás inventado) o `adopted` del registro previo.
 *  - Escritura atómica: temp file (fsync) + rename atómico bajo el lock.
 *  - Lock por (project.namespace, slug) — v2.0 namespaced:
 *      `${registryBaseDir}/${parent}/${id}/registry.jsonl.locks/${slug}.lock`.
 *    Mismo slug en distintos proyectos → locks independientes.
 *  - El lock se libera en `finally` (con try/finally).
 *  - `findBinding` admite `projectNamespace` opcional para filtrar por namespace.
 *  - `commitBinding` admite `attrs.projectNamespace` para trazabilidad.
 *  - Helpers namespaced (`namespacedRegistryPath`/`Audit`/`LockDir`/`SecretSourcePath`).
 *
 * Compat retroactiva:
 *  - Si `registryPath` no tiene forma namespaced (v1.7 legacy) → fallback
 *    al lock plano `${registryPath}.locks/${slug}.lock`.
 *  - `findBinding` sin `projectNamespace` arg → comportamiento v1.7 verbatim.
 *  - Bindings existentes sin `attrs.projectNamespace` se tratan como namespace
 *    default `vectoria:<taskId>` (AC-R-8).
 */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { RegistryEntrySchema, type RegistryEntry, type Resource } from "./schema.js";
import { ProvisionError } from "./errors.js";

const SAFE_MODE = 0o600;

export type Registry = RegistryEntry[];
export type { RegistryEntry };

/** Lee el registry desde disco; tolera archivo inexistente o vacío. */
export async function loadRegistry(path: string): Promise<Registry> {
  if (!existsSync(path)) return [];
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new ProvisionError("not_configured", `registry no legible: ${path}`);
  }
  const out: Registry = [];
  for (const [i, lineRaw] of raw.split("\n").entries()) {
    const line = lineRaw.trim();
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new ProvisionError("bad_manifest", `registry línea ${i + 1} malformada`);
    }
    const res = RegistryEntrySchema.safeParse(parsed);
    if (!res.success) {
      throw new ProvisionError("bad_manifest", `registry línea ${i + 1} no cumple schema`);
    }
    out.push(res.data);
  }
  return out;
}

/**
 * Busca un binding por (resource, predicate). v2.0 acepta `projectNamespace`
 * opcional; si está presente, filtra entries por namespace.
 *
 * Compat retroactiva AC-R-8:
 *  - entries con `attrs.projectNamespace === undefined` se tratan como
 *    namespace default `vectoria:<taskId>` (binding legacy v1.7).
 *  - el caller decide si acepta o rechaza este compat (ver `isCompatibleBinding`
 *    en `destination.ts`).
 */
export function findBinding(
  registry: Registry,
  resource: Resource,
  predicate: (e: RegistryEntry) => boolean,
  projectNamespace?: string,
): RegistryEntry | undefined {
  return registry.find((e) => {
    if (e.resource !== resource) return false;
    if (projectNamespace !== undefined) {
      const entryNs = e.attrs["projectNamespace"];
      const isCompat = entryNs === undefined;
      if (entryNs !== projectNamespace && !isCompat) return false;
    }
    return predicate(e);
  });
}

/** Busca binding por (resource, uuid). Sin scope de namespace (UUID es global). */
export function findByUuid(registry: Registry, resource: Resource, uuid: string): RegistryEntry | undefined {
  return registry.find((e) => e.resource === resource && e.uuid === uuid);
}

/**
 * Lockfile atómico por slug. Regresa un release(); el caller debe llamarlo en `finally`.
 *
 * Estrategia (v2.0):
 *  - Si `registryPath` es namespaced v2.0 (`${baseDir}/${parent}/${id}/registry.jsonl`)
 *    → lock en `${baseDir}/${parent}/${id}/registry.jsonl.locks/${slug}.lock`
 *    (mismo slug en distintos proyectos NO colisiona porque cada namespace
 *    tiene su propio subdirectorio).
 *  - Si es legacy v1.7 (flat path `${HOME}/.config/.../registry.jsonl`)
 *    → lock plano en `${dirname}/registry.jsonl.locks/${slug}.lock`
 *    (compat retroactiva).
 *
 * En ambos casos el lock dir es `dirname(registryPath)/registry.jsonl.locks`
 * (mismo lugar físico); la diferencia es semántica — para namespaced el
 * `dirname(registryPath)` ya contiene `<parent>/<id>`, por lo que locks
 * distintos namespaces NO colisionan.
 *
 * El lock se crea con flag `wx` (atómico); EEXIST → segunda ejecución
 * concurrente (already_running) o espera acotada si --wait-lock-ms > 0.
 */
export async function acquireSlugLock(
  registryPath: string,
  slug: string,
  waitLockMs: number,
): Promise<() => void> {
  // Lock dir:
  //   namespaced: dirname(registryPath)/registry.jsonl.locks/<slug>.lock
  //     (con dirname = "${baseDirRoot}/${parent}/${id}")
  //   legacy    : dirname/registry.jsonl.locks/<slug>.lock
  //     (con dirname = "${baseDirRoot}")
  // Ambos casos producen paths distintos físicamente porque dirname difiere.
  const baseDir = dirname(registryPath);
  const locksDir = `${baseDir}/registry.jsonl.locks`;
  const lockPath = `${locksDir}/${slug}.lock`;
  try {
    mkdirSync(locksDir, { recursive: true, mode: 0o700 });
  } catch {
    // best-effort; si el directorio ya existe o no se puede crear, igualmente intentamos abrir
  }
  // Validar que el registry path existe con permisos 600; si no existe, lo creamos 600.
  ensureRegistryFile(registryPath);

  const start = Date.now();
  let fd: number | undefined;
  while (true) {
    try {
      fd = openSync(lockPath, "wx");
      // Escribir un contenido estable (slug + timestamp atómico) para que un observador externo pueda identificar al owner.
      const owner = `${slug} ${process.pid} ${start}`;
      writeFileSync(fd, owner);
      break;
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code !== "EEXIST") {
        throw new ProvisionError("lock_error", `lock error: ${(e as Error).message ?? String(e)}`);
      }
      // ya existe: esperar o fallar
      const elapsed = Date.now() - start;
      if (elapsed >= waitLockMs) {
        throw new ProvisionError("already_running", `slug=${slug} ya está siendo aprovisionado`);
      }
      await sleep(Math.min(100, waitLockMs - elapsed));
    }
  }
  return () => {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // ignore
      }
    }
    try {
      // best-effort unlink; si falla por permisos, no bloqueamos
      unlinkSync(lockPath);
    } catch {
      // ignore
    }
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureRegistryFile(path: string): void {
  if (existsSync(path)) {
    const st = statSync(path);
    // Si existe y NO es 600 → warn pero NO cambiamos permisos (el runner es no-destructivo).
    if ((st.mode & 0o777) !== SAFE_MODE) {
      process.stderr.write(
        `[vectoria-provision] WARN: registry ${path} mode=${(st.mode & 0o777).toString(8)} ≠ 600 (no se modifica; lectura permitida)\n`,
      );
    }
    return;
  }
  // Crear archivo 600 con una línea vacía inicial
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, "w", SAFE_MODE);
  try {
    writeFileSync(fd, "");
  } finally {
    closeSync(fd);
  }
}

/**
 * Append atómico bajo lock: lee el contenido actual del registry, concatena la
 * nueva línea, escribe a `<registryPath>.tmp.<pid>.<ts>` con fsync, y hace
 * `renameSync` atómico. El caller DEBE invocar dentro del scope del lock
 * (ver `withSlugLock`); así, dos commits concurrentes están serializados.
 *
 * v2.0: si `entry.attrs.projectNamespace` no está presente, se inyecta
 * automáticamente con el default `vectoria:<taskId>` para trazabilidad.
 */
export function commitBinding(registryPath: string, entry: RegistryEntry): void {
  // Compat retroactiva: inyectar `projectNamespace` por defecto si el caller
  // no lo proveyó (ayuda a trazabilidad AC-R-8 sin romper tests v1.7 que no
  // incluyen el campo en attrs).
  const attrsWithNs: Record<string, string> = { ...entry.attrs };
  if (attrsWithNs["projectNamespace"] === undefined) {
    attrsWithNs["projectNamespace"] = `vectoria:${entry.taskId}`;
  }
  const enriched: RegistryEntry = { ...entry, attrs: attrsWithNs };

  ensureRegistryFile(registryPath);
  const tmp = `${registryPath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  const line = JSON.stringify(enriched) + "\n";
  // Lee el contenido actual para anexar (no sobrescribir)
  const prev = existsSync(registryPath) ? readFileSync(registryPath, "utf8") : "";
  const fd = openSync(tmp, "wx", SAFE_MODE);
  try {
    writeFileSync(fd, prev + line);
    // fsync para que el rename vea los bytes en disco antes del swap atómico.
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  // Rename atómico en el mismo filesystem.
  renameSync(tmp, registryPath);
}

/**
 * Helper que combina lock + función; garantiza liberación en finally.
 */
export async function withSlugLock<T>(
  registryPath: string,
  slug: string,
  waitLockMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const release = await acquireSlugLock(registryPath, slug, waitLockMs);
  try {
    return await fn();
  } finally {
    release();
  }
}