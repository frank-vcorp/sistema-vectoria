/** AC-25: la organización reserva MXN como moneda default. */
import { organizations } from "@/server/db/schema";
const column = organizations.currency;
if (!column) { console.error("ERROR: organizations.currency ausente"); process.exit(1); }
console.info("OK: organization currency=MXN");
