/** AC-39: stub idempotente hasta SPEC-003. */
async function main() { console.info("OK: seed catálogo pendiente de SPEC-003; stub idempotente completado"); }
main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : "Error seed catálogo"); process.exit(1); });

export {};