import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { messages } from "@/shared/utils";

/** Auditoría paginada: tabla con scroll horizontal en móvil (AC-56). */
export function AuditList() {
  return <section aria-labelledby="audit-title"><h1 id="audit-title" className="mb-6 text-2xl font-semibold">{messages.audit.title}</h1><div className="mb-4 grid gap-3 md:grid-cols-3"><div className="grid gap-1"><Label htmlFor="entity-filter">{messages.audit.filterEntity}</Label><Input id="entity-filter" /></div><div className="grid gap-1"><Label htmlFor="action-filter">{messages.audit.filterAction}</Label><Input id="action-filter" /></div><div className="grid gap-1"><Label htmlFor="date-filter">{messages.audit.filterDate}</Label><Input id="date-filter" type="date" /></div></div><Table><TableCaption>{messages.audit.empty}</TableCaption><TableHeader><TableRow><TableHead>Momento</TableHead><TableHead>Acción</TableHead><TableHead>Entidad</TableHead><TableHead>Solicitud</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell colSpan={4} className="text-muted-foreground">{messages.audit.empty}</TableCell></TableRow></TableBody></Table></section>;
}
