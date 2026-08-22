/**
 * F7 · git-url tests: `composeGitRepositoryUrl` y su aplicación en POST.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  composeGitRepositoryUrl,
  DEFAULT_GIT_REPOSITORY_HOST,
} from "../src/git-url.js";

test("F7: composeGitRepositoryUrl con `owner/repo` + default host → github.com", () => {
  assert.equal(
    composeGitRepositoryUrl("frank-vcorp/sistema-vectoria"),
    "https://github.com/frank-vcorp/sistema-vectoria",
  );
});

test("F7: composeGitRepositoryUrl con `owner/repo` + gitHost custom", () => {
  assert.equal(
    composeGitRepositoryUrl("acme-corp/blog", "gitea.acme-corp.example"),
    "https://gitea.acme-corp.example/acme-corp/blog",
  );
});

test("F7: composeGitRepositoryUrl con URL absoluta → respeta verbatim (host ignorado)", () => {
  assert.equal(
    composeGitRepositoryUrl(
      "https://gitea.acme-corp.example/some/repo.git",
      "github.com",
    ),
    "https://gitea.acme-corp.example/some/repo.git",
  );
});

test("F7: composeGitRepositoryUrl con URL absoluta http → respeta verbatim", () => {
  assert.equal(
    composeGitRepositoryUrl(
      "http://internal-git.local/team/project.git",
      "github.com",
    ),
    "http://internal-git.local/team/project.git",
  );
});

test("F7: composeGitRepositoryUrl con gitHost vacío → cae a default", () => {
  assert.equal(
    composeGitRepositoryUrl("foo/bar", ""),
    `https://${DEFAULT_GIT_REPOSITORY_HOST}/foo/bar`,
  );
});

test("F7: composeGitRepositoryUrl con repository vacío → lanza error", () => {
  assert.throws(() => composeGitRepositoryUrl(""), /repository vacío/);
});

test("F7: DEFAULT_GIT_REPOSITORY_HOST = `github.com`", () => {
  assert.equal(DEFAULT_GIT_REPOSITORY_HOST, "github.com");
});