/**
 * Mock HTTP client Coolify para tests E2E disposable.
 *
 * Implementa el ciclo GET/reconcile → POST → 201 que el runner espera.
 * Persiste respuestas en memoria por path para que las llamadas
 * subsecuentes GET encuentren el recurso recién creado (compat GET-then-POST).
 */

interface CoolifyMock {
  resources: Map<string, Array<Record<string, unknown>>>;
  calls: Array<{ verb: string; path: string; body?: unknown }>;
  restore: () => void;
}

const STATE: CoolifyMock = {
  resources: new Map(),
  calls: [],
  restore: () => {},
};

function ensureStore(path: string): Array<Record<string, unknown>> {
  let arr = STATE.resources.get(path);
  if (!arr) {
    arr = [];
    STATE.resources.set(path, arr);
  }
  return arr;
}

function uuidFor(kind: string): string {
  return `${kind}-${Math.random().toString(36).slice(2, 10)}`;
}

export function installCoolifyMock(): CoolifyMock {
  STATE.resources.clear();
  STATE.calls.length = 0;
  const orig = globalThis.fetch;
  (globalThis as unknown as { fetch: unknown }).fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api\/v1/, "");
    const method = (init?.method ?? "GET").toUpperCase();
    let body: unknown;
    if (init?.body && typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    STATE.calls.push({ verb: method, path, body });

    // GET /projects → devuelve projects existentes
    if (method === "GET" && path === "/projects") {
      const projects = ensureStore("/projects");
      return new Response(JSON.stringify(projects), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // POST /projects → crea
    if (method === "POST" && path === "/projects") {
      const projects = ensureStore("/projects");
      const projectName = (body as { name?: string })?.name ?? "unknown";
      const newUuid = uuidFor("project");
      const row = {
        uuid: newUuid,
        name: projectName,
        description: `${projectName} created by mock`,
      };
      projects.push(row);
      return new Response(JSON.stringify(row), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }

    // GET /projects/{uuid}/environments
    if (method === "GET" && /^\/projects\/[^/]+\/environments$/.test(path)) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // POST /projects/{uuid}/environments → crea environment
    if (method === "POST" && /^\/projects\/[^/]+\/environments$/.test(path)) {
      const envName = (body as { name?: string })?.name ?? "production";
      const uuid = uuidFor("env");
      const row = { uuid, name: envName };
      return new Response(JSON.stringify(row), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }

    // GET /applications
    if (method === "GET" && path === "/applications") {
      const apps = ensureStore("/applications");
      return new Response(JSON.stringify(apps), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // POST /applications/public
    if (method === "POST" && path === "/applications/public") {
      const apps = ensureStore("/applications");
      const repo = (body as { git_repository?: string })?.git_repository ?? "unknown";
      const newUuid = uuidFor("app");
      const row = {
        uuid: newUuid,
        fqdn: `mock-${newUuid}.example.com`,
        domains: `https://mock-${newUuid}.example.com`,
        git_repository: repo,
        git_branch: (body as { git_branch?: string })?.git_branch ?? "main",
        build_pack: (body as { build_pack?: string })?.build_pack ?? "nixpacks",
        ports_exposes: (body as { ports_exposes?: string })?.ports_exposes ?? "3000",
        appVariant: (body as { appVariant?: string })?.appVariant ?? "public",
      };
      apps.push(row);
      return new Response(JSON.stringify(row), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }

    // GET /applications/{uuid}
    if (method === "GET" && /^\/applications\/[^/]+$/.test(path)) {
      return new Response(JSON.stringify({ uuid: "mock-app", envs: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // PATCH /applications/{uuid}/envs
    if (method === "PATCH" && /^\/applications\/[^/]+\/envs$/.test(path)) {
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // GET /databases
    if (method === "GET" && path === "/databases") {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // POST /databases/postgresql
    if (method === "POST" && path === "/databases/postgresql") {
      const dbs = ensureStore("/databases");
      const name = (body as { name?: string })?.name ?? "db";
      const uuid = uuidFor("db");
      const row = { uuid, name };
      dbs.push(row);
      return new Response(JSON.stringify(row), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }

    // GET /services
    if (method === "GET" && path === "/services") {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // POST /services
    if (method === "POST" && path === "/services") {
      const services = ensureStore("/services");
      const name = (body as { name?: string })?.name ?? "storage";
      const uuid = uuidFor("svc");
      const row = { uuid, name };
      services.push(row);
      return new Response(JSON.stringify(row), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response("{}", { status: 404 });
  };
  STATE.restore = () => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = orig;
  };
  return STATE;
}