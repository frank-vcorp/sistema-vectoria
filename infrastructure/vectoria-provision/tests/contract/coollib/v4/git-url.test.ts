/**
 * AC-04 · contract.git-url — vectoria-provision v2.1
 *
 * SPEC-20260822-001 v1.1 §4.2 + AC-04.
 * Cubre: URL válida, slug vs URL detectada, 422 esperado vs URL no soportada.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  composeGitRepositoryUrl,
  COOLIFY_V4_SUPPORTED_VERSIONS,
} from "../../../../src/coollib-adapters/v4.js";

test("AC-04.coolify_v4_supported_versions: incluye v4.0.0, v4.0.0-beta.18, v4.0.0-beta.19", () => {
  assert.ok(COOLIFY_V4_SUPPORTED_VERSIONS.includes("v4.0.0"));
  assert.ok(COOLIFY_V4_SUPPORTED_VERSIONS.includes("v4.0.0-beta.18"));
  assert.ok(COOLIFY_V4_SUPPORTED_VERSIONS.includes("v4.0.0-beta.19"));
});

test("AC-04.slug_to_url: 'frank-vcorp/sistema-vectoria' → https URL completa", () => {
  const url = composeGitRepositoryUrl("frank-vcorp/sistema-vectoria", "github.com");
  assert.equal(url, "https://github.com/frank-vcorp/sistema-vectoria");
});

test("AC-04.host_owner_repo: 'gitlab.example.com/team/app' → URL con host custom", () => {
  const url = composeGitRepositoryUrl("gitlab.example.com/team/app", "github.com");
  assert.equal(url, "https://gitlab.example.com/team/app");
});

test("AC-04.full_url_passthrough: URL https se retorna tal cual", () => {
  const url = composeGitRepositoryUrl("https://github.com/owner/repo", "github.com");
  assert.equal(url, "https://github.com/owner/repo");
});

test("AC-04.full_url_ssh_passthrough: git@ URL se retorna tal cual", () => {
  const url = composeGitRepositoryUrl("git@github.com:owner/repo.git", "github.com");
  assert.equal(url, "git@github.com:owner/repo.git");
});

test("AC-04.invalid_format_throws: 'solo-owner' sin repo lanza CoolifyAdapterError", () => {
  assert.throws(
    () => composeGitRepositoryUrl("solo-owner", "github.com"),
    /git_repository con formato no soportado/,
  );
});

test("AC-04.empty_string_throws: '' lanza error", () => {
  assert.throws(
    () => composeGitRepositoryUrl("", "github.com"),
    /git_repository vacío o inválido/,
  );
});
