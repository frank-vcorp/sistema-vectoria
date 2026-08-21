/** Health interno para smoke (AC-41e). */
export function GET() {
  return Response.json({ status: "ok" }, { status: 200, headers: { "cache-control": "no-store" } });
}
