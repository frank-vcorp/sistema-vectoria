/**
 * Auditoría append-only (SPEC §14) en JSONL `600`.
 *
 *  - Formato: `{ts, taskId, slug, op, target, result, uuid?, code?}`.
 *  - NUNCA incluye: token, raíz, secretos derivados, valores de env ni bodies crudos.
 *  - Best-effort: si el archivo no se puede escribir, la entrada se descarta con un
 *    warning a stderr (no bloqueamos la operación).
 *  - El caller debe escribir el audit ANTES de mutar para `audit_failed` fail-closed;
 *    este módulo es sólo el sink append. La política fail-closed vive en `ensure.ts`.
 */
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { AuditEntrySchema, type AuditEntry } from "./schema.js";
import { redact } from "./redact.js";

const SAFE_MODE = 0o600;

export function appendAudit(path: string, entry: AuditEntry): void {
  const parsed = AuditEntrySchema.safeParse(entry);
  if (!parsed.success) {
    process.stderr.write(
      `[vectoria-provision] WARN: audit entry inválida (path=${parsed.error.issues.map((i) => i.path.join(".")).join(",")})\n`,
    );
    return;
  }
  // Redact defensivo (AC-3 token-leak): aunque el caller ya excluye secretos,
  // un descuido debe seguir siendo seguro.
  const safe = redact(parsed.data);
  const line = JSON.stringify(safe) + "\n";
  try {
    ensureAuditFile(path);
    appendFileSync(path, line, { mode: SAFE_MODE });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[vectoria-provision] WARN: no se pudo escribir audit (${msg}); entrada descartada\n`);
  }
}

function ensureAuditFile(path: string): void {
  if (existsSync(path)) {
    const st = statSync(path);
    if ((st.mode & 0o777) !== SAFE_MODE) {
      process.stderr.write(
        `[vectoria-provision] WARN: audit ${path} mode=${(st.mode & 0o777).toString(8)} ≠ 600 (no se modifica)\n`,
      );
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, "w", SAFE_MODE);
  try {
    writeFileSync(fd, "");
  } finally {
    closeSync(fd);
  }
}

/**
 * Indica si el destino del audit es escribible ahora (se usa ANTES de mutar
 * para fail-closed: SPEC §14). Si no es escribible → false → el caller debe
 * abortar con `audit_failed`.
 */
export function isAuditWritable(path: string): boolean {
  try {
    ensureAuditFile(path);
    // probe de escritura
    const fd = openSync(path, "a", SAFE_MODE);
    try {
      writeFileSync(fd, "");
    } finally {
      closeSync(fd);
    }
    return true;
  } catch {
    return false;
  }
}