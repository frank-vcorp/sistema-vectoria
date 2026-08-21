/**
 * Perfil organizacional (SPEC §10).
 *
 * Archivo JSON `~/.config/kilo/vectoria-provision/organization-profile.json`,
 * permisos `600`, con:
 *  {
 *    "directorEmail": "contacto@vector-ia.mx",
 *    "orgName": "Vector IA"
 *  }
 *
 * Si el archivo no existe, el runner usa defaults (`contacto@vector-ia.mx`,
 * `Vector IA`); un override por manifest sólo se permite si el manifest declara
 * las keys del enum cerrado (§8.3).
 *
 * NUNCA se imprimen los valores del perfil — sólo se usan como entrada para
 * `ensure_env` (mutación controlada).
 */
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

const ProfileSchema = z.object({
  directorEmail: z.string().email().default("contacto@vector-ia.mx"),
  orgName: z.string().min(1).max(120).default("Vector IA"),
});
export type OrganizationProfile = z.infer<typeof ProfileSchema>;

const DEFAULTS: OrganizationProfile = Object.freeze({
  directorEmail: "contacto@vector-ia.mx",
  orgName: "Vector IA",
}) as OrganizationProfile;

export async function loadOrganizationProfile(path: string): Promise<OrganizationProfile> {
  if (!existsSync(path)) return { ...DEFAULTS };
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return { ...DEFAULTS };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULTS };
  }
  const res = ProfileSchema.safeParse(parsed);
  if (!res.success) return { ...DEFAULTS };
  return res.data;
}