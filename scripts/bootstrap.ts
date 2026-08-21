/** AC-35: único orquestador, orden estricto y fail-fast. */
import { spawn } from "node:child_process";

const steps = ["deps:check", "db:migrate", "db:seed:plataforma", "db:seed:catalog", "db:seed:rls", "smoke"] as const;
function run(script: string): Promise<void> { return new Promise((resolve, reject) => { const child = spawn("pnpm", [script], { stdio: "inherit", shell: process.platform === "win32" }); child.once("error", reject); child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${script} terminó con código ${code ?? 1}`))); }); }
async function main() { for (const step of steps) { console.info(`→ ${step}`); await run(step); } console.info("OK: bootstrap idempotente completado"); }
main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : "Error bootstrap"); process.exit(1); });
