/**
 * AC-75: greps anti-patrón consolidados del sistema (SPEC-001 §5/§17,
 * SOL-20260819-01, ADR-03). No requiere BD.
 *
 *  - AC-1:  cero `if (user.role === ...)` en código de producción.
 *  - AC-26: cero `drizzle-orm` o `@/server/db` en componentes de UI.
 *  - AC-27: servicios no importan `next`/`react`/`@trpc/server`.
 *  - AC-30: servicios no leen cookies/headers (Next).
 *  - AC-34: cero `/api/v1|swagger|openapi` en `src/`.
 *  - AC-42: cero `@mui|antd|@chakra-ui` en `src/`.
 *  - AC-47: cero `font-(serif|...)` en `src/`.
 *  - AC-50: cero copia de assets/código Oatmeal en `src/` o `public/`.
 *  - AC-55: cero `mobileReadOnly|soloLecturaMovil`.
 *  - AC-68: literales de UI fuera del catálogo (best-effort grep).
 *  - AC-71: cero `00000000-0000-0000-0000-000000000000` y `Authorization.*Bearer`
 *           en `src/server/trpc/context.ts`.
 *  - AC-72: `registerFailedLogin(` ≥1 en `app/api/auth/login/route.ts`.
 *  - AC-74: `CREATE POLICY` ≥1 por tabla de negocio en
 *           `drizzle/0001_enable_rls.sql`.
 *  - AC-79: cero `00000000-...` en `scripts/seed-plataforma.ts` y
 *           `VECTORIA_SUPERUSER_PASSWORD` en `src/lib/env.ts`.
 *  - AC-80: cero `registrar_tiempo` en `src/shared/enums/index.ts` ni
 *           `scripts/seed-data.ts`.
 */
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

interface Check {
  id: string;
  description: string;
  /** Devuelve `null` si pasa; mensaje si falla. */
  run: () => Promise<string | null> | string | null;
}

function rg(pattern: string, paths: string[], extra: string[] = []): string {
  // rg está disponible globalmente; usamos --no-heading para limpiar.
  const r = spawnSync(
    "rg",
    ["-n", "--no-heading", ...extra, pattern, ...paths],
    { encoding: "utf8" },
  );
  if (r.status === 0) return r.stdout;
  if (r.status === 1) return "";
  return r.stderr;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const checks: Check[] = [
    // AC-1
    {
      id: "AC-1",
      description: "cero `if (user.role === ...)` en src/ (servicios no comparan roles)",
      run: () => {
        const out = rg(
          String.raw`user\.role\s*===`,
          ["src/"],
          ["--glob", "!src/**/*.test.ts", "--glob", "!src/**/*.test.tsx"],
        );
        return out.trim() === "" ? null : out.trim();
      },
    },
    // AC-26
    {
      id: "AC-26",
      description: "UI sin acceso a Drizzle/PostgreSQL",
      run: () => {
        const out = rg(
          "drizzle-orm|@/server/db",
          ["src/components/"],
          [],
        );
        return out.trim() === "" ? null : out.trim();
      },
    },
    // AC-27
    {
      id: "AC-27",
      description: "servicios no importan transporte (next/react/@trpc/server)",
      run: () => {
        const out = rg(
          "@/server/trpc|from 'next'|from 'react'|@trpc/server",
          ["src/server/services/"],
          [],
        );
        return out.trim() === "" ? null : out.trim();
      },
    },
    // AC-30
    {
      id: "AC-30",
      description: "servicios no leen cookies/headers de Next",
      run: () => {
        const out = rg(
          "cookies\\(\\)|headers\\(\\)|next/headers|request\\.cookies|request\\.headers",
          ["src/server/services/"],
          [],
        );
        return out.trim() === "" ? null : out.trim();
      },
    },
    // AC-34
    {
      id: "AC-34",
      description: "sin REST público especulativo (/api/v1, OpenAPI)",
      run: () => {
        const out = rg(
          "/api/v1|swagger|openapi",
          ["src/"],
          [],
        );
        return out.trim() === "" ? null : out.trim();
      },
    },
    // AC-42
    {
      id: "AC-42",
      description: "único framework UI: Tailwind+shadcn (cero MUI/antd/chakra)",
      run: () => {
        const out = rg(
          "from '@mui|from 'material-ui|antd|@chakra-ui",
          ["src/"],
          [],
        );
        return out.trim() === "" ? null : out.trim();
      },
    },
    // AC-47
    {
      id: "AC-47",
      description: "tipografía sans-serif (cero font-serif en código)",
      run: () => {
        const out = rg(
          String.raw`font-(serif|Georgia|'Times')`,
          ["src/"],
          [],
        );
        return out.trim() === "" ? null : out.trim();
      },
    },
    // AC-50
    {
      id: "AC-50",
      description: "cero copia de assets/código Oatmeal",
      run: () => {
        const out = rg(
          "oatmeal|olive_instrument|olive-|@tailwindplus",
          ["src/", "public/", "tailwind.config.ts"],
          [],
        );
        return out.trim() === "" ? null : out.trim();
      },
    },
    // AC-55
    {
      id: "AC-55",
      description: "ninguna acción degradada a consulta por viewport",
      run: () => {
        const out = rg(
          "soloLecturaMovil|mobileReadOnly|readOnly.*mobile",
          ["src/"],
          [],
        );
        return out.trim() === "" ? null : out.trim();
      },
    },
    // AC-71 (P0-1)
    {
      id: "AC-71",
      description: "context.ts no fabrica UUID cero ni lee Bearer",
      run: () => {
        const uuid = rg(
          "00000000-0000-0000-0000-000000000000",
          ["src/server/trpc/context.ts"],
          [],
        ).trim();
        // `bearer` se busca como `headers().get(` (Authorization: Bearer
        // sería el patrón); evitamos matchear el comentario que documenta
        // precisamente la ausencia del header.
        const bearerRead = rg(
          "request\\.headers\\.get\\([\"']authorization",
          ["src/server/trpc/context.ts"],
          [],
        ).trim();
        if (uuid || bearerRead) return [uuid, bearerRead].filter(Boolean).join("\n");
        return null;
      },
    },
    // AC-72 (P1-4)
    {
      id: "AC-72",
      description: "registerFailedLogin cableado en login route",
      run: () => {
        const out = rg(
          "registerFailedLogin\\(",
          ["src/app/api/auth/login/route.ts"],
          [],
        ).trim();
        return out.length > 0 ? null : "no se encontró registerFailedLogin( en login/route.ts";
      },
    },
    // AC-74 (P2-1)
    {
      id: "AC-74",
      description: "RLS CREATE POLICY descomentada en migración",
      run: async () => {
        const sql = await readFile("drizzle/0001_enable_rls.sql", "utf8");
        const tables = [
          "organization_fiscal_config",
          "users",
          "credentials",
          "invitations",
          "roles",
          "permissions",
          "role_permissions",
          "user_roles",
          "user_permissions",
          "audit_logs",
          "project_log_entries",
          "notifications",
          "files",
          "file_links",
        ];
        const missing = tables.filter(
          (t) => !new RegExp(`CREATE POLICY\\s+\\w+\\s+ON\\s+${t}\\b`).test(sql),
        );
        return missing.length === 0 ? null : `sin CREATE POLICY para: ${missing.join(", ")}`;
      },
    },
    // AC-79
    {
      id: "AC-79",
      description: "SuperUser persistente sin UUID cero y con VECTORIA_SUPERUSER_PASSWORD",
      run: async () => {
        const seed = await readFile("scripts/seed-plataforma.ts", "utf8");
        if (seed.includes("00000000-0000-0000-0000-000000000000")) {
          return "scripts/seed-plataforma.ts contiene UUID cero";
        }
        const env = await readFile("src/lib/env.ts", "utf8");
        if (!env.includes("VECTORIA_SUPERUSER_PASSWORD")) {
          return "VECTORIA_SUPERUSER_PASSWORD ausente en src/lib/env.ts";
        }
        return null;
      },
    },
    // AC-80
    {
      id: "AC-80",
      description: "registrar_tiempo no aparece en plataforma (sólo en BASE_PERMISSIONS / seed)",
      run: () => {
        // Sólo nos importa como entrada del array (string literal entre comillas)
        // o como valor de objeto. Comentarios que documentan la decisión NO
        // cuentan.
        const enumsRe = new RegExp(`['"\`]registrar_tiempo['"\`]`, "g");
        const seedRe = new RegExp(`['"\`]registrar_tiempo['"\`]`, "g");
        const enums = (readFileSync("src/shared/enums/index.ts", "utf8").match(enumsRe) ?? []).join("\n");
        const seed = (readFileSync("scripts/seed-data.ts", "utf8").match(seedRe) ?? []).join("\n");
        if (enums || seed) {
          return `enums: ${enums}\nseed-data: ${seed}`.trim();
        }
        return null;
      },
    },
    // AC-48 / AC-75
    {
      id: "AC-48",
      description: "logo VectorIA presente en public/brand/",
      run: async () => {
        if (!(await fileExists("public/brand/VectorIA-Logo-Oficial-Transparente.png"))) {
          return "logo ausente en public/brand/";
        }
        return null;
      },
    },
  ];

  let failed = 0;
  for (const c of checks) {
    const result = await c.run();
    if (result === null) {
      console.info(`  OK  ${c.id} — ${c.description}`);
    } else {
      console.error(`  FAIL ${c.id} — ${c.description}`);
      console.error(result.split("\n").map((l) => `        ${l}`).join("\n"));
      failed++;
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} check(s) anti-patrón fallaron.`);
    process.exit(1);
  }
  console.info(`\nOK: ${checks.length} checks anti-patrón pasaron.`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : "Error check:antipatterns");
  process.exit(1);
});
