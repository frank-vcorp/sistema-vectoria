/**
 * Preflight P10: secrets — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.1 P10 + AC-10.
 *
 * Read-only: verifica presencia (no valor) de las claves requeridas
 * en `VECTORIA_SECRETS_FILE` + ausencia de escape `|` (FIX-01).
 */
import { existsSync, readFileSync, statSync } from "node:fs";

export interface PreflightSecretsInput {
  secretsFilePath: string | undefined;
  requiredKeys: string[];
  skipped?: boolean;
}

export interface PreflightSecretsResult {
  ok: boolean;
  reason?: string;
}

export function checkSecrets(input: PreflightSecretsInput): PreflightSecretsResult {
  if (input.skipped) return { ok: true, reason: "secrets_check_skipped" };
  if (!input.secretsFilePath) {
    return { ok: false, reason: "secret_source_file_missing" };
  }
  if (!existsSync(input.secretsFilePath)) {
    return { ok: false, reason: `secret_source_file_missing:${input.secretsFilePath}` };
  }
  // mode 600 + owner UID se valida en el launcher (run-provision.sh);
  // aquí sólo verificamos presencia + content.
  let raw: string;
  try {
    const st = statSync(input.secretsFilePath);
    if ((st.mode & 0o777) !== 0o600) {
      return { ok: false, reason: `secrets_file_bad_perms:${(st.mode & 0o777).toString(8)}` };
    }
    raw = readFileSync(input.secretsFilePath, "utf8");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `secrets_file_unreadable:${msg}` };
  }
  // Detect |\|-escaped values (FIX-01)
  if (/\|\\?\|?$/.test(raw) || /\|\\/.test(raw)) {
    return { ok: false, reason: "secrets_file_pipe_escape_detected" };
  }
  // Presencia de cada required key (regex simple: `^KEY=`)
  for (const k of input.requiredKeys) {
    const re = new RegExp(`^${k.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}=`, "m");
    if (!re.test(raw)) {
      return { ok: false, reason: `secret_source_keys_missing:${k}` };
    }
  }
  return { ok: true };
}
