/**
 * Perfil organizacional (SPEC §10 + SPEC-20260821-001 §5.2 v2).
 *
 * Resolución de `directorEmail` y `orgName` por precedencia explícita:
 *   1) Per-organization-profile.json (compat retro v1.7; nivel 2.5)
 *   2) global-profile.organizations[project.parent].{defaultDirectorEmail, defaultOrgName}
 *   3) global-profile.defaults.{defaultDirectorEmail, defaultOrgName}
 *   4) Hardcoded defaults (capa 0)
 *
 * Cambia la firma de `loadOrganizationProfile` (nuevo arg `globalProfile` +
 * `projectParent`). Tests v1.7 pueden seguir invocando con la firma vieja
 * gracias al overload opcional.
 *
 * NUNCA se imprimen los valores del perfil — sólo se usan como entrada para
 * `ensure_env` (mutación controlada).
 */
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import type { GlobalProfile } from "./global-profile.js";

const ProfileSchema = z.object({
  directorEmail: z.string().email().default("contacto@vector-ia.mx"),
  orgName: z.string().min(1).max(120).default("Vector IA"),
});
export type OrganizationProfile = z.infer<typeof ProfileSchema>;

/**
 * Hardcoded defaults (capa 0). Preservados verbatim: tests v1.7 los esperan.
 * Coherentes con `src/constants.ts` y `src/profile.ts` previos.
 */
const DEFAULTS: OrganizationProfile = Object.freeze({
  directorEmail: "contacto@vector-ia.mx",
  orgName: "Vector IA",
}) as OrganizationProfile;

/**
 * Carga el perfil organizacional respetando las 4 capas de precedencia.
 *
 * @param path                 ruta al archivo per-organization-profile (opcional,
 *                             retro-compat con v1.7). Si no existe, cae al nivel 2.
 * @param globalProfile        perfil global cargado (capa 1; requerido para v2.0).
 *                             Si `undefined`, sólo consulta el archivo + defaults.
 * @param projectParent        `manifest.project.parent` (usado para indagar
 *                             `globalProfile.organizations[parent]`).
 */
export function loadOrganizationProfile(
  path: string,
  globalProfile?: GlobalProfile,
  projectParent?: string,
): OrganizationProfile {
  // Capa 2.5 — archivo per-organization-profile.json (retro-compat v1.7)
  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, "utf8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // best-effort; cae al siguiente nivel
      }
      if (parsed !== undefined) {
        const res = ProfileSchema.safeParse(parsed);
        if (res.success) return res.data;
      }
    } catch {
      // best-effort; cae al siguiente nivel
    }
  }

  // Capa 1 — global-profile
  if (globalProfile !== undefined) {
    // (a) organizations[parent]
    if (projectParent !== undefined && projectParent.length > 0) {
      const org = globalProfile.organizations[projectParent];
      if (org?.defaultDirectorEmail && org?.defaultOrgName) {
        return {
          directorEmail: org.defaultDirectorEmail,
          orgName: org.defaultOrgName,
        };
      }
      // Si organizations[parent] existe parcial (sólo uno de los dos campos)
      // respetamos lo declarado y completamos con defaults del global-profile.
      if (org?.defaultDirectorEmail || org?.defaultOrgName) {
        return {
          directorEmail: org.defaultDirectorEmail ?? globalProfile.defaults.defaultDirectorEmail,
          orgName: org.defaultOrgName ?? globalProfile.defaults.defaultOrgName,
        };
      }
    }
    // (b) defaults
    return {
      directorEmail: globalProfile.defaults.defaultDirectorEmail,
      orgName: globalProfile.defaults.defaultOrgName,
    };
  }

  // Capa 0 — hardcoded defaults
  return { ...DEFAULTS };
}