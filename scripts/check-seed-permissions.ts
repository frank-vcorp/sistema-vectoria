/**
 * AC-38 / AC-80: verifica la matriz seed declarativa de plataforma.
 *
 * Reglas:
 *  - Toda `code` presente en `SEED_ROLE_PERMISSION_CODES` debe pertenecer
 *    a `BASE_PERMISSIONS` (la plataforma NO siembra permisos de módulo
 *    — `registrar_tiempo`, etc., los declaran sus SPECs al implementarse).
 *  - `programador` queda sin `registrar_tiempo` y permisos de SPEC-006
 *    (DEC-FUN-20260820-75 / BR-N413). SPEC-005 sí le asigna
 *    `operar_proyectos` (transición de módulos del proyecto propio).
 *  - Matriz BR-N207..N212: vendedor/lider_proyecto no ven costos;
 *    director recibe todos los permisos base.
 *
 * No requiere BD — inspecciona `SEED_ROLE_PERMISSION_CODES` estático.
 */
import { BASE_PERMISSIONS } from "@/shared/enums";
import { SEED_ROLE_PERMISSION_CODES } from "@/shared/enums";

const baseSet = new Set<string>(BASE_PERMISSIONS);

const offenders: Array<{ role: string; permission: string }> = [];
for (const [role, codes] of Object.entries(SEED_ROLE_PERMISSION_CODES)) {
  for (const code of codes) {
    if (!baseSet.has(code)) offenders.push({ role, permission: code });
  }
}
if (offenders.length > 0) {
  console.error(
    "ERROR: la plataforma siembra permisos de módulo. Códigos fuera de BASE_PERMISSIONS:",
    offenders.map((o) => `${o.role}:${o.permission}`).join(", "),
  );
  console.error(
    "La plataforma sólo siembra BASE_PERMISSIONS; cada módulo (SPEC-002..011) declara y siembra sus permisos al implementarse.",
  );
  process.exit(1);
}

const deny = (role: string, permission: string) =>
  !(SEED_ROLE_PERMISSION_CODES[role] ?? []).includes(permission);

/**
 * SPEC-006 (Proyectos — equipo y ejecución · B11-B16) ya introdujo los
 * permisos `registrar_tiempo` y `aprobar_cambios`. Esta lista cerrada
 * modela los permisos permitidos para `programador` para detectar
 * sobredotación (BR-N413).
 */
const ALLOWED_PROGRAMADOR_PERMISSIONS = new Set<string>([
  "operar_proyectos",
  "registrar_tiempo",
]);

const programadorExtras = (SEED_ROLE_PERMISSION_CODES.programador ?? []).filter(
  (p) => !ALLOWED_PROGRAMADOR_PERMISSIONS.has(p),
);

const checks: Array<[string, boolean]> = [
  ["vendedor no tiene ver_costos (BR-N207)", deny("vendedor", "ver_costos")],
  ["lider_proyecto no tiene ver_costos (BR-N210)", deny("lider_proyecto", "ver_costos")],
  ["programador no tiene ver_costos", deny("programador", "ver_costos")],
  ["programador sin permisos de SPEC-006 (registrar_tiempo aún no existe; BR-N413)", programadorExtras.length === 0],
  ["director recibe todos los permisos base (BR-N211)", (BASE_PERMISSIONS as readonly string[]).every((p) => (SEED_ROLE_PERMISSION_CODES.director ?? []).includes(p))],
  ["director recibe ver_todo", (SEED_ROLE_PERMISSION_CODES.director ?? []).includes("ver_todo")],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length > 0) {
  console.error("ERROR: matriz BR-N207..N212 inconsistente. Fallos:", failed.join("; "));
  process.exit(1);
}

console.info(
  "OK: matriz BR-N207..N212 consistente con BASE_PERMISSIONS; SPEC-006 declarar `registrar_tiempo` y `aprobar_cambios` y sembrarlos en roles técnicos/PL (BR-N413); SPEC-005 `operar_proyectos` en programador",
);
