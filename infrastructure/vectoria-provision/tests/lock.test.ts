/**
 * AC-6 · lock concurrente por slug.
 *
 * Verifica:
 *  - Dos procesos paralelos sobre el mismo slug → uno espera o `already_running`
 *    inmediato (sin doble creación).
 *  - Distintos slugs → locks independientes (paralelismo OK).
 *  - El lock se libera en `finally` (verificable: 2da invocación secuencial
 *    tiene éxito).
 *
 * Implementación: usamos `withSlugLock` con `waitLockMs=0` para fail-fast; una
 * adquisición larga en el callback fuerza a la segunda a fallar.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireSlugLock, withSlugLock } from "../src/registry.js";
import { ProvisionError } from "../src/errors.js";

function newTmp(): string {
  return mkdtempSync(join(tmpdir(), "vp-lock-"));
}

test("AC-6: dos adquisiciones del mismo slug en paralelo → segunda ya_running (fail-fast)", async () => {
  const dir = newTmp();
  const registryPath = join(dir, "registry.jsonl");
  try {
    // Primer lock: lo retenemos 200ms
    const r1 = await acquireSlugLock(registryPath, "sistema-vectoria", 0);
    let secondError: ProvisionError | null = null;
    try {
      await acquireSlugLock(registryPath, "sistema-vectoria", 0);
    } catch (e: unknown) {
      if (e instanceof ProvisionError) secondError = e;
    }
    r1();
    assert.ok(secondError !== null, "segunda adquisición debe lanzar error");
    if (secondError) {
      assert.equal(secondError.code, "already_running");
      assert.ok(!secondError.message.includes("token"));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-6: dos slugs distintos → locks independientes (paralelos)", async () => {
  const dir = newTmp();
  const registryPath = join(dir, "registry.jsonl");
  try {
    const r1 = await acquireSlugLock(registryPath, "slug-a", 0);
    const r2 = await acquireSlugLock(registryPath, "slug-b", 0);
    r1();
    r2();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-6: lock liberado en finally → siguiente invocación secuencial tiene éxito", async () => {
  const dir = newTmp();
  const registryPath = join(dir, "registry.jsonl");
  try {
    const r1 = await acquireSlugLock(registryPath, "sistema-vectoria", 0);
    r1();
    // Sin retener: la siguiente adquisición debe funcionar.
    const r2 = await acquireSlugLock(registryPath, "sistema-vectoria", 0);
    r2();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-6: withSlugLock libera el lock aún si el callback lanza", async () => {
  const dir = newTmp();
  const registryPath = join(dir, "registry.jsonl");
  try {
    let captured: unknown;
    try {
      await withSlugLock(registryPath, "sistema-vectoria", 0, async () => {
        throw new Error("boom");
      });
    } catch (e: unknown) {
      captured = e;
    }
    assert.ok(captured instanceof Error);
    // El lock debe haberse liberado: una nueva adquisición funciona.
    const r = await acquireSlugLock(registryPath, "sistema-vectoria", 0);
    r();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-6: waitLockMs>0 permite espera acotada; si vence → already_running", async () => {
  const dir = newTmp();
  const registryPath = join(dir, "registry.jsonl");
  try {
    const r1 = await acquireSlugLock(registryPath, "sistema-vectoria", 0);
    const start = Date.now();
    let err: ProvisionError | null = null;
    try {
      await acquireSlugLock(registryPath, "sistema-vectoria", 100);
    } catch (e: unknown) {
      if (e instanceof ProvisionError) err = e;
    }
    const elapsed = Date.now() - start;
    r1();
    assert.ok(err !== null);
    if (err) assert.equal(err.code, "already_running");
    // La espera debe ser al menos ~100ms (la cota) y no infinita
    assert.ok(elapsed >= 90, `esperó al menos ~100ms (real: ${elapsed}ms)`);
    assert.ok(elapsed < 5000, `no esperó infinito (real: ${elapsed}ms)`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-6: el archivo de lock no contiene tokens del secrets file (defense in depth)", async () => {
  const dir = newTmp();
  const registryPath = join(dir, "registry.jsonl");
  try {
    const r1 = await acquireSlugLock(registryPath, "sistema-vectoria", 0);
    const fs = createRequire(import.meta.url)("node:fs") as typeof import("node:fs");
    const lockPath = `${registryPath}.locks/sistema-vectoria.lock`;
    if (fs.existsSync(lockPath)) {
      const content = fs.readFileSync(lockPath, "utf8");
      assert.ok(!content.includes("Bearer"));
      assert.ok(!content.includes("TOKEN"));
      assert.ok(!content.includes("SECRET"));
    }
    r1();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});