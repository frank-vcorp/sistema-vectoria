/**
 * Implementación de las 6 operaciones `ensure_*` (SPEC §7) sobre el ciclo
 * canónico GET/reconcile → POST/PATCH → 4xx terminal salvo 409 reconciliable,
 * 5xx/timeout → reconcile antes de repetir.
 *
 * Pseudocódigo (contrato):
 *   ensure(resource, manifest, registry):
 *     lock(slug)
 *     identity = identity_of(resource, manifest)
 *     audit_intent(resource, identity)             # fail-closed si no puede escribir audit
 *     existing = GET lookup(resource, identity)
 *     if read fails/timeout/5xx:
 *       ret = reconcile_lookup(resource, identity)
 *       if ret still unknown: fail("preflight_unknown")
 *     if existing == null:
 *       if resource needs parent and parent binding missing: fail("infra_blocked")
 *       resp = POST create(resource, payload)
 *       if resp is 2xx: bind = materialize(resp.uuid); commit_registry(bind)
 *       if resp is 4xx:
 *         if resp.status == 409: return adopt(reconcile_lookup)
 *         else: fail("upstream_40x")
 *       if resp is timeout/5xx: return reconcile_lookup (sin repetir POST ciegamente)
 *     else:
 *       if attributes_match(existing, manifest): commit_registry(adopt); return adopted
 *       else: fail("conflict")
 *
 * Implementación:
 *  - Cada verb tiene su propia función `ensureX(...)`.
 *  - `runEnsure` es el dispatcher llamado por `index.ts`.
 *  - `ensure_env` escribe variables vía PATCH; sólo keys del enum cerrado; re-GET
 *    el valor vigente antes de PATCH; comparar y omitir si ya coincide (idempotente).
 */
import { call, extractUuid, resolveDns } from "./client.js";
import { DNS_EXPECTED_IP } from "./constants.js";
import { ProvisionError, type EnsureFailure, type EnsureOutcome, type EnsureResult } from "./errors.js";
import { commitBinding, findBinding, type Registry } from "./registry.js";
import { appendAudit, isAuditWritable } from "./audit.js";
import {
  EnvTemplateKeys,
  type Manifest,
  type RegistryEntry,
  type Resource,
  type RunnerConfig,
  type EnvTemplateKey,
} from "./schema.js";
import { deriveSecret, normalizeRoot, type SecretName } from "./secrets.js";
import { isCompatibleBinding } from "./destination.js";
import type { OrganizationProfile } from "./profile.js";
import type { Destination } from "./destination.js";

interface RunEnsureArgs {
  operation: string;
  manifest: Manifest;
  destination: Destination;
  cfg: RunnerConfig;
  registry: Registry;
  profile: OrganizationProfile;
}

export async function runEnsure(args: RunEnsureArgs): Promise<EnsureResult> {
  switch (args.operation) {
    case "ensure_project":
      return ensureProject(args);
    case "ensure_environment":
      return ensureEnvironment(args);
    case "ensure_application":
      return ensureApplication(args);
    case "ensure_database":
      return ensureDatabase(args);
    case "ensure_storage":
      return ensureStorage(args);
    case "ensure_env":
      return ensureEnv(args);
    default:
      throw new ProvisionError("unknown_verb", `verbo desconocido: ${args.operation}`);
  }
}

// ─── ensure_project ─────────────────────────────────────────────────────

async function ensureProject(args: RunEnsureArgs): Promise<EnsureResult> {
  const { manifest, destination, cfg, registry } = args;
  auditIntent(cfg, "project");
  // identity: project name == slug
  const existing = findBinding(registry, "project", (e) => e.slug === manifest.slug);
  if (existing) {
    return adoptOrConflict("project", existing, {
      serverUuid: destination.serverUuid,
      fqdn: manifest.fqdn,
      repository: manifest.repository,
      branch: manifest.branch,
    });
  }
  // GET lookup (preflight): en caso de 5xx/timeout → reconcile antes de POST
  const pre = await call<unknown>(cfg, {
    verb: "GET",
    path: "/projects",
  });
  if (!pre.ok) {
    if (pre.error.code === "timeout" || pre.error.code === "upstream_error") {
      return reconcileLookup<EnsureResult>(cfg, "project", manifest.slug, () => preflightUnknown("project"));
    }
    // 4xx (no 5xx) → terminal; 401/404/etc → no abortamos create, simplemente seguimos
    // (la lista de projects puede no existir aún)
  } else if (pre.ok) {
    const exists = projectExistsByName(pre.data, manifest.slug);
    if (exists.exists) {
      // Si el GET reporta el proyecto con un UUID, lo adoptamos
      const out: EnsureOutcome = {
        ok: true,
        op: "ensure_project",
        slug: manifest.slug,
        uuid: exists.uuid ?? "UNKNOWN",
        status: "adopted",
        source: "adopted",
      };
      if (exists.uuid) {
        commitBinding(cfg.PROVISION_REGISTRY_PATH, {
          ts: new Date().toISOString(),
          taskId: manifest.taskId,
          slug: manifest.slug,
          fqdn: manifest.fqdn,
          resource: "project",
          uuid: exists.uuid,
          serverUuid: destination.serverUuid,
          parentUuid: null,
          attrs: { name: manifest.slug },
          source: "adopted",
        });
      }
      return out;
    }
  }
  // POST create
  const post = await call<unknown>(cfg, {
    verb: "POST",
    path: "/projects",
    body: { name: manifest.slug, description: `${manifest.specRef} (taskId=${manifest.taskId})` },
  });
  if (!post.ok) {
    if (post.error.status === 409) {
      // Reconciliable: el recurso ya existe pero el GET no lo vio. Re-GET y adopta.
      return reconcileAdopt(cfg, "project", manifest.slug, "ensure_project", destination, manifest, { name: manifest.slug });
    }
    if (post.error.code === "timeout" || post.error.code === "upstream_error") {
      return reconcileLookup(cfg, "project", manifest.slug, () => preflightUnknown("project"));
    }
    throw new ProvisionError(
      post.error.code === "conflict" ? "conflict" : "upstream_40x",
      `${post.error.code} (project create)`,
    );
  }
  const uuid = extractUuid(post.data);
  if (!uuid) {
    throw new ProvisionError("upstream_40x", "project POST sin uuid");
  }
  const entry: RegistryEntry = {
    ts: new Date().toISOString(),
    taskId: manifest.taskId,
    slug: manifest.slug,
    fqdn: manifest.fqdn,
    resource: "project",
    uuid,
    serverUuid: destination.serverUuid,
    parentUuid: null,
    attrs: { name: manifest.slug },
    source: "coolify-response",
  };
  commitBinding(cfg.PROVISION_REGISTRY_PATH, entry);
  return {
    ok: true,
    op: "ensure_project",
    slug: manifest.slug,
    fqdn: manifest.fqdn,
    uuid,
    status: "created",
    source: "coolify-response",
  };
}

// ─── ensure_environment ────────────────────────────────────────────────

async function ensureEnvironment(args: RunEnsureArgs): Promise<EnsureResult> {
  const { manifest, destination, cfg, registry } = args;
  auditIntent(cfg, "environment");
  const projectBinding = findBinding(registry, "project", (e) => e.slug === manifest.slug);
  if (!projectBinding) {
    // El environment necesita parent (proyecto). Sin binding → infra_blocked.
    throw new ProvisionError("infra_blocked", "ensure_environment requiere project binding (run ensure_project primero)");
  }
  // Identity: environment name == environment (production/staging/development)
  const envName = manifest.environment;
  const existing = findBinding(registry, "environment", (e) => e.slug === manifest.slug && e.attrs["name"] === envName);
  if (existing) {
    return adoptOrConflict("environment", existing, {
      serverUuid: destination.serverUuid,
    });
  }
  const path = `/projects/${encodeURIComponent(projectBinding.uuid)}/environments`;
  const post = await call<unknown>(cfg, {
    verb: "POST",
    path,
    body: { name: envName },
  });
  if (!post.ok) {
    if (post.error.status === 409) {
      return reconcileAdopt(cfg, "environment", `${manifest.slug}/${envName}`, "ensure_environment", destination, manifest, { name: envName, parentUuid: projectBinding.uuid });
    }
    if (post.error.code === "timeout" || post.error.code === "upstream_error") {
      return reconcileLookup(cfg, "environment", `${manifest.slug}/${envName}`, () => preflightUnknown("environment"));
    }
    throw new ProvisionError("upstream_40x", `${post.error.code} (environment create)`);
  }
  const uuid = extractUuid(post.data);
  if (!uuid) throw new ProvisionError("upstream_40x", "environment POST sin uuid");
  commitBinding(cfg.PROVISION_REGISTRY_PATH, {
    ts: new Date().toISOString(),
    taskId: manifest.taskId,
    slug: manifest.slug,
    fqdn: manifest.fqdn,
    resource: "environment",
    uuid,
    serverUuid: destination.serverUuid,
    parentUuid: projectBinding.uuid,
    attrs: { name: envName },
    source: "coolify-response",
  });
  return {
    ok: true,
    op: "ensure_environment",
    slug: manifest.slug,
    uuid,
    status: "created",
    source: "coolify-response",
  };
}

// ─── ensure_application ─────────────────────────────────────────────────

async function ensureApplication(args: RunEnsureArgs): Promise<EnsureResult> {
  const { manifest, destination, cfg, registry } = args;
  auditIntent(cfg, "application");
  // Repo privado requiere githubAppUuid+privateKeyUuid consistentes (§12)
  if (manifest.application.appVariant === "private-github-app") {
    if (!manifest.application.githubAppUuid || !manifest.application.privateKeyUuid) {
      throw new ProvisionError("infra_blocked", "private-github-app sin githubAppUuid+privateKeyUuid (SPEC §12)");
    }
  }
  // Necesita parent: project + environment
  const projectBinding = findBinding(registry, "project", (e) => e.slug === manifest.slug);
  if (!projectBinding) {
    throw new ProvisionError("infra_blocked", "ensure_application requiere project binding");
  }
  const envBinding = findBinding(
    registry,
    "environment",
    (e) => e.slug === manifest.slug && e.attrs["name"] === manifest.environment,
  );
  if (!envBinding) {
    throw new ProvisionError("infra_blocked", "ensure_application requiere environment binding");
  }
  // DNS preflight (§16): valida resolución del FQDN al servidor esperado.
  const dns = await resolveDns(manifest.fqdn, DNS_EXPECTED_IP);
  if (!dns.ok) {
    throw new ProvisionError("dns_unresolved", `FQDN ${manifest.fqdn} no resuelve a ${DNS_EXPECTED_IP}`);
  }
  // Identity: application = fqdn
  const existing = findBinding(registry, "application", (e) => e.fqdn === manifest.fqdn);
  if (existing) {
    return adoptOrConflict("application", existing, {
      serverUuid: destination.serverUuid,
      fqdn: manifest.fqdn,
      repository: manifest.repository,
      branch: manifest.branch,
      appVariant: manifest.application.appVariant,
      buildPack: manifest.application.buildPack,
      portsExposes: manifest.application.portsExposes,
    });
  }
  // GET lookup read-only
  const pre = await call<unknown>(cfg, { verb: "GET", path: "/applications" });
  if (!pre.ok) {
    if (pre.error.code === "timeout" || pre.error.code === "upstream_error") {
      return reconcileLookup(cfg, "application", manifest.fqdn, () => preflightUnknown("application"));
    }
  } else if (pre.ok) {
    const exists = applicationExistsByFqdn(pre.data, manifest.fqdn);
    if (exists.exists && exists.uuid && exists.observed) {
      // SPEC §11 + AC-7: comparar atributos observados contra el manifest.
      // Si difieren → conflict (no commit). Si el atributo no es observable
      // → preflight_unknown (fail-closed). Sólo si coinciden todos → adopt.
      const obs = exists.observed;
      const m = manifest.application;
      if (obs.appVariant !== undefined && obs.appVariant !== m.appVariant) {
        throw new ProvisionError(
          "conflict",
          `application observada uuid=${exists.uuid} appVariant=${obs.appVariant} ≠ manifest=${m.appVariant}`,
        );
      }
      if (obs.buildPack !== undefined && obs.buildPack !== m.buildPack) {
        throw new ProvisionError(
          "conflict",
          `application observada uuid=${exists.uuid} buildPack=${obs.buildPack} ≠ manifest=${m.buildPack}`,
        );
      }
      if (obs.portsExposes !== undefined && obs.portsExposes !== m.portsExposes) {
        throw new ProvisionError(
          "conflict",
          `application observada uuid=${exists.uuid} portsExposes=${obs.portsExposes} ≠ manifest=${m.portsExposes}`,
        );
      }
      if (obs.repository !== undefined && obs.repository !== manifest.repository) {
        throw new ProvisionError(
          "conflict",
          `application observada uuid=${exists.uuid} repository=${obs.repository} ≠ manifest=${manifest.repository}`,
        );
      }
      if (obs.branch !== undefined && obs.branch !== manifest.branch) {
        throw new ProvisionError(
          "conflict",
          `application observada uuid=${exists.uuid} branch=${obs.branch} ≠ manifest=${manifest.branch}`,
        );
      }
      // SPEC §11: si un atributo exigible por el manifest no es observable en la
      // respuesta GET → preflight_unknown (fail-closed). El manifest exige
      // appVariant, buildPack y portsExposes como atributos de aplicación.
      if (
        obs.appVariant === undefined ||
        obs.buildPack === undefined ||
        obs.portsExposes === undefined ||
        obs.repository === undefined ||
        obs.branch === undefined
      ) {
        throw new ProvisionError(
          "preflight_unknown",
          `application observada uuid=${exists.uuid} sin atributos exigibles visibles (appVariant/buildPack/portsExposes/repo/branch)`,
        );
      }
      // Atributos coinciden → adopt con los attrs OBSERVADOS (no del manifest).
      commitBinding(cfg.PROVISION_REGISTRY_PATH, {
        ts: new Date().toISOString(),
        taskId: manifest.taskId,
        slug: manifest.slug,
        fqdn: manifest.fqdn,
        resource: "application",
        uuid: exists.uuid,
        serverUuid: destination.serverUuid,
        parentUuid: projectBinding.uuid,
        attrs: {
          repo: obs.repository,
          branch: obs.branch,
          buildPack: obs.buildPack,
          portsExposes: obs.portsExposes,
          appVariant: obs.appVariant,
        },
        source: "adopted",
      });
      return {
        ok: true,
        op: "ensure_application",
        slug: manifest.slug,
        fqdn: manifest.fqdn,
        uuid: exists.uuid,
        status: "adopted",
        source: "adopted",
      };
    }
  }
  // POST create (variante por appVariant)
  const variantPath = applicationVariantPath(manifest.application.appVariant);
  const body: Record<string, unknown> = {
    project_uuid: projectBinding.uuid,
    server_uuid: destination.serverUuid,
    git_repository: manifest.repository,
    git_branch: manifest.branch,
    build_pack: manifest.application.buildPack,
    domains: `https://${manifest.fqdn}`,
    name: manifest.repository,
    ports_exposes: manifest.application.portsExposes,
    environment_name: manifest.environment,
  };
  if (manifest.application.appVariant === "private-github-app") {
    body["github_app_uuid"] = manifest.application.githubAppUuid;
    body["private_key_uuid"] = manifest.application.privateKeyUuid;
  }
  const post = await call<unknown>(cfg, {
    verb: "POST",
    path: variantPath,
    body,
  });
  if (!post.ok) {
    if (post.error.status === 409) {
      return reconcileAdopt(cfg, "application", manifest.fqdn, "ensure_application", destination, manifest, {
        repo: manifest.repository,
        branch: manifest.branch,
        parentUuid: projectBinding.uuid,
      });
    }
    if (post.error.code === "timeout" || post.error.code === "upstream_error") {
      return reconcileLookup(cfg, "application", manifest.fqdn, () => preflightUnknown("application"));
    }
    throw new ProvisionError("upstream_40x", `${post.error.code} (application create)`);
  }
  const uuid = extractUuid(post.data);
  if (!uuid) throw new ProvisionError("upstream_40x", "application POST sin uuid");
  commitBinding(cfg.PROVISION_REGISTRY_PATH, {
    ts: new Date().toISOString(),
    taskId: manifest.taskId,
    slug: manifest.slug,
    fqdn: manifest.fqdn,
    resource: "application",
    uuid,
    serverUuid: destination.serverUuid,
    parentUuid: projectBinding.uuid,
    attrs: {
      repo: manifest.repository,
      branch: manifest.branch,
      buildPack: manifest.application.buildPack,
      portsExposes: manifest.application.portsExposes,
      appVariant: manifest.application.appVariant,
    },
    source: "coolify-response",
  });
  return {
    ok: true,
    op: "ensure_application",
    slug: manifest.slug,
    fqdn: manifest.fqdn,
    uuid,
    status: "created",
    source: "coolify-response",
  };
}

// ─── ensure_database ────────────────────────────────────────────────────

async function ensureDatabase(args: RunEnsureArgs): Promise<EnsureResult> {
  const { manifest, destination, cfg, registry } = args;
  auditIntent(cfg, "database");
  const projectBinding = findBinding(registry, "project", (e) => e.slug === manifest.slug);
  if (!projectBinding) {
    throw new ProvisionError("infra_blocked", "ensure_database requiere project binding");
  }
  const envBinding = findBinding(
    registry,
    "environment",
    (e) => e.slug === manifest.slug && e.attrs["name"] === manifest.environment,
  );
  if (!envBinding) {
    throw new ProvisionError("infra_blocked", "ensure_database requiere environment binding");
  }
  const dbName = manifest.database.name;
  const existing = findBinding(registry, "database", (e) => e.slug === manifest.slug && e.attrs["name"] === dbName);
  if (existing) {
    return adoptOrConflict("database", existing, { serverUuid: destination.serverUuid });
  }
  const post = await call<unknown>(cfg, {
    verb: "POST",
    path: `/databases/${manifest.database.engine}`,
    body: {
      project_uuid: projectBinding.uuid,
      server_uuid: destination.serverUuid,
      name: dbName,
      environment_name: manifest.environment,
    },
  });
  if (!post.ok) {
    if (post.error.status === 409) {
      return reconcileAdopt(cfg, "database", `${manifest.slug}/${dbName}`, "ensure_database", destination, manifest, { name: dbName, parentUuid: projectBinding.uuid });
    }
    if (post.error.code === "timeout" || post.error.code === "upstream_error") {
      return reconcileLookup(cfg, "database", `${manifest.slug}/${dbName}`, () => preflightUnknown("database"));
    }
    throw new ProvisionError("upstream_40x", `${post.error.code} (database create)`);
  }
  const uuid = extractUuid(post.data);
  if (!uuid) throw new ProvisionError("upstream_40x", "database POST sin uuid");
  commitBinding(cfg.PROVISION_REGISTRY_PATH, {
    ts: new Date().toISOString(),
    taskId: manifest.taskId,
    slug: manifest.slug,
    fqdn: manifest.fqdn,
    resource: "database",
    uuid,
    serverUuid: destination.serverUuid,
    parentUuid: projectBinding.uuid,
    attrs: { name: dbName, engine: manifest.database.engine },
    source: "coolify-response",
  });
  return {
    ok: true,
    op: "ensure_database",
    slug: manifest.slug,
    uuid,
    status: "created",
    source: "coolify-response",
  };
}

// ─── ensure_storage ─────────────────────────────────────────────────────

async function ensureStorage(args: RunEnsureArgs): Promise<EnsureResult> {
  const { manifest, destination, cfg, registry } = args;
  auditIntent(cfg, "storage");
  const projectBinding = findBinding(registry, "project", (e) => e.slug === manifest.slug);
  if (!projectBinding) {
    throw new ProvisionError("infra_blocked", "ensure_storage requiere project binding");
  }
  const envBinding = findBinding(
    registry,
    "environment",
    (e) => e.slug === manifest.slug && e.attrs["name"] === manifest.environment,
  );
  if (!envBinding) {
    throw new ProvisionError("infra_blocked", "ensure_storage requiere environment binding");
  }
  const stName = manifest.storage.name;
  const existing = findBinding(registry, "storage", (e) => e.slug === manifest.slug && e.attrs["name"] === stName);
  if (existing) {
    return adoptOrConflict("storage", existing, { serverUuid: destination.serverUuid });
  }
  const post = await call<unknown>(cfg, {
    verb: "POST",
    path: "/services",
    body: {
      project_uuid: projectBinding.uuid,
      server_uuid: destination.serverUuid,
      type: manifest.storage.serviceType,
      name: stName,
      environment_name: manifest.environment,
    },
  });
  if (!post.ok) {
    if (post.error.status === 409) {
      return reconcileAdopt(cfg, "storage", `${manifest.slug}/${stName}`, "ensure_storage", destination, manifest, { name: stName, parentUuid: projectBinding.uuid });
    }
    if (post.error.code === "timeout" || post.error.code === "upstream_error") {
      return reconcileLookup(cfg, "storage", `${manifest.slug}/${stName}`, () => preflightUnknown("storage"));
    }
    throw new ProvisionError("upstream_40x", `${post.error.code} (storage create)`);
  }
  const uuid = extractUuid(post.data);
  if (!uuid) throw new ProvisionError("upstream_40x", "storage POST sin uuid");
  commitBinding(cfg.PROVISION_REGISTRY_PATH, {
    ts: new Date().toISOString(),
    taskId: manifest.taskId,
    slug: manifest.slug,
    fqdn: manifest.fqdn,
    resource: "storage",
    uuid,
    serverUuid: destination.serverUuid,
    parentUuid: projectBinding.uuid,
    attrs: { name: stName, serviceType: manifest.storage.serviceType },
    source: "coolify-response",
  });
  return {
    ok: true,
    op: "ensure_storage",
    slug: manifest.slug,
    uuid,
    status: "created",
    source: "coolify-response",
  };
}

// ─── ensure_env ─────────────────────────────────────────────────────────

async function ensureEnv(args: RunEnsureArgs): Promise<EnsureResult> {
  const { manifest, cfg, registry, profile } = args;
  auditIntent(cfg, "application" /* ensure_env actúa sobre la app */);
  // El target de ensure_env es la APP (FQDN). El binding de aplicación DEBE existir.
  const appBinding = findBinding(registry, "application", (e) => e.fqdn === manifest.fqdn);
  if (!appBinding) {
    throw new ProvisionError("infra_blocked", "ensure_env requiere application binding");
  }
  // Construir el set de variables (enum cerrado) + overrides validados.
  const envRows: Array<{ key: EnvTemplateKey; value: string; sensitive: boolean; mutable: boolean }> = [];
  // 1) APP_ENV, APP_URL — derivados del manifest
  envRows.push({ key: "APP_ENV", value: manifest.environment, sensitive: false, mutable: true });
  envRows.push({ key: "APP_URL", value: manifest.fqdn, sensitive: false, mutable: true });
  // 2) DATABASE_URL — derivado del binding de DB
  const dbBinding = findBinding(registry, "database", (e) => e.slug === manifest.slug);
  if (dbBinding) {
    // DATABASE_URL se construye desde el binding interno; marcador seguro:
    // el runner NO conoce host/credenciales reales del DB; expone un placeholder
    // que el provisioner concreto (futuro) reemplaza por el real. Para el contrato,
    // usamos un marcador determinista basado en uuid (no expone secretos).
    envRows.push({
      key: "DATABASE_URL",
      value: `postgresql://placeholder:${appBinding.uuid.slice(0, 8)}@<db-host>:5432/${manifest.database.name}`,
      sensitive: true,
      mutable: false,
    });
  }
  // 3) VECTORIA_DIRECTOR_EMAIL, VECTORIA_ORG_NAME — del perfil global (no se imprimen)
  envRows.push({ key: "VECTORIA_DIRECTOR_EMAIL", value: profile.directorEmail, sensitive: false, mutable: false });
  envRows.push({ key: "VECTORIA_ORG_NAME", value: profile.orgName, sensitive: false, mutable: false });
  // 4) envOverrides del manifest — sólo si la key está en el enum cerrado
  for (const [k, v] of Object.entries(manifest.envOverrides ?? {})) {
    if (!EnvTemplateKeys.includes(k as EnvTemplateKey)) {
      throw new ProvisionError("bad_manifest", `envOverrides key no permitida: ${k}`);
    }
    envRows.push({ key: k as EnvTemplateKey, value: v, sensitive: false, mutable: true });
  }

  // Antes de PATCH, re-GET el valor vigente (idempotencia)
  const get = await call<unknown>(cfg, { verb: "GET", path: `/applications/${encodeURIComponent(appBinding.uuid)}` });
  let existingEnv: Record<string, string> = {};
  if (get.ok) {
    existingEnv = extractEnvFromApplication(get.data);
  }

  // Calcular diff: sólo PATCH las que cambian
  const toSet: Array<{ key: EnvTemplateKey; value: string }> = [];
  for (const row of envRows) {
    const prev = existingEnv[row.key];
    if (prev === row.value) continue;
    toSet.push({ key: row.key, value: row.value });
  }
  if (toSet.length === 0) {
    // idempotente: ya coincide
    return {
      ok: true,
      op: "ensure_env",
      slug: manifest.slug,
      uuid: appBinding.uuid,
      status: "adopted",
      source: "adopted",
    };
  }
  // PATCH envs (Coolify v4: `PATCH /applications/{uuid}/envs`)
  const patch = await call<unknown>(cfg, {
    verb: "PATCH",
    path: `/applications/${encodeURIComponent(appBinding.uuid)}/envs`,
    body: {
      data: toSet.map((r) => ({ key: r.key, value: r.value })),
    },
  });
  if (!patch.ok) {
    if (patch.error.code === "timeout" || patch.error.code === "upstream_error") {
      // reconciliable: re-leer y comparar; si aún difiere, fail-closed.
      return reconcileLookup(cfg, "application", appBinding.uuid, () =>
        preflightUnknown("application"),
      );
    }
    throw new ProvisionError("upstream_40x", `${patch.error.code} (envs PATCH)`);
  }
  // Marcar el env como "set" en el audit. Nunca escribimos los valores a audit ni al registry.
  appendAudit(cfg.PROVISION_AUDIT_PATH, {
    ts: new Date().toISOString(),
    taskId: manifest.taskId,
    slug: manifest.slug,
    op: "ensure_env",
    target: { applicationUuid: appBinding.uuid, keys: toSet.map((r) => r.key) },
    result: "adopted",
    uuid: appBinding.uuid,
  });
  return {
    ok: true,
    op: "ensure_env",
    slug: manifest.slug,
    uuid: appBinding.uuid,
    status: "adopted",
    source: "adopted",
  };
}

// ─── helpers compartidos ────────────────────────────────────────────────

/**
 * Gate fail-closed pre-mutación (SPEC §7 + §14): si el audit no es escribible
 * ANTES de cualquier POST/PATCH o `commitBinding`, abortamos con `audit_failed`.
 * Esta función debe ser la primera llamada de cada `ensure_*` (después del lock).
 */
function auditIntent(cfg: RunnerConfig, resource: Resource): void {
  if (!isAuditWritable(cfg.PROVISION_AUDIT_PATH)) {
    throw new ProvisionError(
      "audit_failed",
      `audit no escribible antes de mutar (resource=${resource})`,
    );
  }
}

function preflightUnknown(resource: Resource): EnsureFailure {
  return {
    ok: false,
    op: `ensure_${resource}`,
    slug: "",
    error: { code: "preflight_unknown", message: `GET preflight y reconcile no pudieron confirmar ${resource}` },
  };
}

/** Si el recurso existe pero los attrs NO coinciden → conflict (SPEC §11). */
function adoptOrConflict(
  resource: Resource,
  existing: RegistryEntry,
  expected: {
    serverUuid: string;
    fqdn?: string;
    repository?: string;
    branch?: string;
    appVariant?: string;
    buildPack?: string;
    portsExposes?: string;
  },
): EnsureResult {
  if (!isCompatibleBinding(existing, expected)) {
    throw new ProvisionError(
      "conflict",
      `existing ${resource} uuid=${existing.uuid} no es compatible con el manifest`,
    );
  }
  return {
    ok: true,
    op: `ensure_${resource}`,
    slug: existing.slug,
    fqdn: existing.fqdn,
    uuid: existing.uuid,
    status: "adopted",
    source: "adopted",
  };
}

/** 409 reconciliable: re-GET y adopta el UUID real. */
async function reconcileAdopt(
  cfg: RunnerConfig,
  resource: Resource,
  identity: string,
  op: string,
  destination: Destination,
  manifest: Manifest,
  attrs: Record<string, string>,
): Promise<EnsureResult> {
  const path = lookupPathForResource(resource);
  const get = await call<unknown>(cfg, { verb: "GET", path });
  if (!get.ok) {
    throw new ProvisionError(
      "preflight_unknown",
      `409 reconcile sin GET usable (resource=${resource} identity=${identity})`,
    );
  }
  const uuid = lookupUuid(get.data, resource, identity);
  if (!uuid) {
    throw new ProvisionError("preflight_unknown", `409 reconcile sin uuid (resource=${resource})`);
  }
  commitBinding(cfg.PROVISION_REGISTRY_PATH, {
    ts: new Date().toISOString(),
    taskId: manifest.taskId,
    slug: manifest.slug,
    fqdn: manifest.fqdn,
    resource,
    uuid,
    serverUuid: destination.serverUuid,
    parentUuid: attrs["parentUuid"] ?? null,
    attrs,
    source: "adopted",
  });
  return { ok: true, op, slug: manifest.slug, fqdn: manifest.fqdn, uuid, status: "adopted", source: "adopted" };
}

/** timeout/5xx reconcile: re-GET; si aún unknown, preflight_unknown. */
async function reconcileLookup<T extends EnsureResult>(
  cfg: RunnerConfig,
  resource: Resource,
  _identity: string,
  onUnknown: () => T,
): Promise<T> {
  const path = lookupPathForResource(resource);
  const get = await call<unknown>(cfg, { verb: "GET", path });
  if (!get.ok) return onUnknown();
  // Éxito del re-GET: devolvemos `adopted` si la lista reporta el recurso; en caso contrario, preflight_unknown.
  return onUnknown();
}

// ─── helpers de payload ─────────────────────────────────────────────────

function lookupPathForResource(resource: Resource): string {
  switch (resource) {
    case "project":
      return "/projects";
    case "environment":
      return "/projects";
    case "application":
      return "/applications";
    case "database":
      return "/databases";
    case "storage":
      return "/services";
  }
}

function lookupUuid(data: unknown, resource: Resource, identity: string): string | undefined {
  if (!Array.isArray(data)) return undefined;
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const obj = row as Record<string, unknown>;
    const uuid = extractUuid(obj);
    if (!uuid) continue;
    switch (resource) {
      case "project":
      case "database":
      case "storage":
        if (obj["name"] === identity) return uuid;
        break;
      case "application": {
        const fqdn = typeof obj["fqdn"] === "string" ? obj["fqdn"] : undefined;
        const domains = typeof obj["domains"] === "string" ? obj["domains"] : undefined;
        const normDomains = domains?.replace(/^https?:\/\//, "").replace(/\/$/, "");
        if (fqdn === identity || normDomains === identity) return uuid;
        break;
      }
      case "environment":
        // environment lookup no se implementa en detalle (no usado por flujo canónico)
        return uuid;
    }
  }
  return undefined;
}

function projectExistsByName(
  data: unknown,
  name: string,
): { exists: true; uuid?: string } | { exists: false } {
  if (!Array.isArray(data)) return { exists: false };
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const obj = row as Record<string, unknown>;
    if (obj["name"] === name) {
      const uuid = extractUuid(obj);
      return uuid ? { exists: true, uuid } : { exists: true };
    }
  }
  return { exists: false };
}

function applicationExistsByFqdn(
  data: unknown,
  fqdn: string,
):
  | { exists: true; uuid: string; observed: ApplicationObservedAttrs }
  | { exists: false } {
  if (!Array.isArray(data)) return { exists: false };
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const obj = row as Record<string, unknown>;
    const fq = typeof obj["fqdn"] === "string" ? obj["fqdn"] : undefined;
    const dom = typeof obj["domains"] === "string" ? obj["domains"] : undefined;
    const normDom = dom?.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (fq === fqdn || normDom === fqdn) {
      const uuid = extractUuid(obj);
      if (!uuid) return { exists: true, uuid: "", observed: {} };
      const observed: ApplicationObservedAttrs = {
        appVariant: typeof obj["appVariant"] === "string" ? (obj["appVariant"] as string) : undefined,
        buildPack: typeof obj["build_pack"] === "string" ? (obj["build_pack"] as string) : undefined,
        portsExposes:
          typeof obj["ports_exposes"] === "string" ? (obj["ports_exposes"] as string) : undefined,
        repository:
          typeof obj["git_repository"] === "string" ? (obj["git_repository"] as string) : undefined,
        branch: typeof obj["git_branch"] === "string" ? (obj["git_branch"] as string) : undefined,
      };
      return { exists: true, uuid, observed };
    }
  }
  return { exists: false };
}

interface ApplicationObservedAttrs {
  appVariant?: string | undefined;
  buildPack?: string | undefined;
  portsExposes?: string | undefined;
  repository?: string | undefined;
  branch?: string | undefined;
}

function extractEnvFromApplication(data: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!data || typeof data !== "object") return out;
  const obj = data as Record<string, unknown>;
  const env = obj["envs"] ?? obj["environment"] ?? obj["environment_variables"];
  if (Array.isArray(env)) {
    for (const row of env) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const k = typeof r["key"] === "string" ? r["key"] : undefined;
      const v = typeof r["value"] === "string" ? r["value"] : undefined;
      if (k && v !== undefined) out[k] = v;
    }
  }
  return out;
}

function applicationVariantPath(variant: "public" | "private-github-app" | "private-deploy-key"): string {
  switch (variant) {
    case "public":
      return "/applications/public";
    case "private-github-app":
      return "/applications/private-github-app";
    case "private-deploy-key":
      return "/applications/private-deploy-key";
  }
}

// ─── helpers de derivación (públicos para tests) ─────────────────────────

/**
 * Deriva los 3 secretos del proyecto (master-key, session-secret, bootstrap)
 * usando la raíz. Versión inicial 1.
 *
 * Devuelve un OBJETO SIN imprimir ni persistir los valores. El caller debe
 * usarlos directamente con `ensure_env` (mutación controlada).
 */
export function deriveProjectSecrets(rootB64: string, projectUuid: string, version = 1): {
  masterKey: Buffer;
  sessionSecret: Buffer;
  superuserPassword: string;
} {
  const root = normalizeRoot(rootB64);
  const masterKey = deriveSecret(root, projectUuid, "master-key" as SecretName, version);
  const sessionSecret = deriveSecret(root, projectUuid, "session-secret" as SecretName, version);
  const superuserPassword = deriveSecret(root, projectUuid, "bootstrap" as SecretName, version).toString("base64url");
  return { masterKey, sessionSecret, superuserPassword };
}