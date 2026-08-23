/**
 * Preflight P14: git remote connectivity — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.1 P14 + AC-13.
 *
 * Read-only: el caller provee `lsRemoteResult` (ya ejecutado vía
 * `git ls-remote --heads <url> <branch>`). Si retorna SHA → PASS.
 */
export interface PreflightGitRemoteInput {
  repoUrl: string;
  branch: string;
  remoteSha?: string;
  skipped?: boolean;
}

export interface PreflightGitRemoteResult {
  ok: boolean;
  reason?: string;
}

export function checkGitRemote(input: PreflightGitRemoteInput): PreflightGitRemoteResult {
  if (input.skipped) return { ok: true, reason: "git_remote_skipped" };
  if (!input.remoteSha || input.remoteSha.length < 7) {
    return {
      ok: false,
      reason: `git_remote_unreachable:${input.repoUrl}@${input.branch}`,
    };
  }
  return { ok: true };
}
