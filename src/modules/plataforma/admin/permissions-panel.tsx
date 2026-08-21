import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { messages } from "@/shared/utils";
export function PermissionsPanel() { return <section aria-labelledby="permissions-title"><h1 id="permissions-title" className="mb-6 text-2xl font-semibold">{messages.nav.users}</h1><Card><CardHeader><CardTitle>Permisos aditivos</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">La asignación y revocación de permisos se audita y requiere autorización.</p></CardContent></Card></section>; }
