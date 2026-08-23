/**
 * Runtime adapter "runtime" — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §6.1 + §6.3.
 *
 * Carga el módulo declarado en `manifest.application.runtimeAdapter.path`
 * vía `import()` dinámico. Valida:
 *  - que el módulo exponga `adapterEnvToDispatch` (función)
 *  - que `runtimeAdapterVersion` declarado en el módulo coincida con
 *    `manifest.application.runtimeAdapter.version`
 *
 * Si CUALQUIERA falla → `infra_blocked(runtime_adapter_load_failed:<reason>)`
 * exit 5. NO se cae a legacy automáticamente (cierre §7.12 SOL).
 */
import type { Manifest } from "../schema.js";

export interface LoadedRuntimeAdapter {
  kind: "runtime";
  version: string;
  module: Record<string, unknown>;
}

/** Resultado fail-closed: lista de motivos por los que NO se pudo cargar. */
export type RuntimeLoadResult =
  | { ok: true; adapter: LoadedRuntimeAdapter }
  | { ok: false; reason: string };

/**
 * Carga el runtime adapter declarado en el manifest.
 *
 * Esta función NO ejecuta el módulo — sólo lo importa y valida la
 * presencia de las funciones contractuales. La ejecución del mapping
 * la hace el `runEnsure` cuando corresponda.
 */
export async function loadRuntimeAdapter(manifest: Manifest): Promise<RuntimeLoadResult> {
  const rt = (manifest.application as { runtimeAdapter?: { path: string; entry: string; kind: "typescript" | "javascript"; version: string } }).runtimeAdapter;
  if (!rt) {
    return { ok: false, reason: "manifest.application.runtimeAdapter ausente" };
  }
  if (!rt.path || rt.path.length === 0) {
    return { ok: false, reason: "runtimeAdapter.path vacío" };
  }
  if (!rt.entry || rt.entry.length === 0) {
    return { ok: false, reason: "runtimeAdapter.entry vacío" };
  }
  if (rt.kind !== "typescript" && rt.kind !== "javascript") {
    return { ok: false, reason: `runtimeAdapter.kind inválido: ${rt.kind}` };
  }

  // Resolver path absoluto (relativo al CWD del runner, no del repo).
  // El runner se ejecuta desde el repo de la app, por lo que un path
  // relativo apunta al runtime-adapter/ del repo.
  const absPath = rt.path.startsWith("/") ? rt.path : `${process.cwd()}/${rt.path}`;
  const entryPath = `${absPath}/${rt.entry}`;

  try {
    // dynamic import — soporta TS via tsx en runtime (mismo mecanismo que
    // el entrypoint principal del runner).
    const mod = (await import(/* @vite-ignore */ entryPath)) as Record<string, unknown>;
    if (typeof mod["adapterEnvToDispatch"] !== "function") {
      return { ok: false, reason: "módulo no exporta adapterEnvToDispatch()" };
    }
    const declaredVersion = typeof mod["runtimeAdapterVersion"] === "string"
      ? (mod["runtimeAdapterVersion"] as string)
      : undefined;
    if (declaredVersion !== rt.version) {
      return {
        ok: false,
        reason: `runtime adapter version mismatch: declarado=${declaredVersion ?? "<ausente>"} != manifest=${rt.version}`,
      };
    }
    return {
      ok: true,
      adapter: {
        kind: "runtime",
        version: rt.version,
        module: mod,
      },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `import() falló: ${msg}` };
  }
}
