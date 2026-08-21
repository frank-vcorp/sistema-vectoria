"use client";

import * as React from "react";
import { CircleHelp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { messages } from "@/shared/utils";

const seedRoles = Object.entries(messages.roles).map(([code, label]) => ({ code, label }));

export function RolesPanel() {
  const [open, setOpen] = React.useState(false);
  return (
    <TooltipProvider>
      <section aria-labelledby="roles-title"><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><h1 id="roles-title" className="text-2xl font-semibold">{messages.nav.roles}</h1><Tooltip><TooltipTrigger aria-label="Ayuda sobre roles"><CircleHelp className="h-4 w-4 text-muted-foreground" /></TooltipTrigger><TooltipContent>Los permisos base de los roles seed no pueden modificarse.</TooltipContent></Tooltip></div><Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />{messages.common.create}</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{messages.common.create}</DialogTitle><DialogDescription>Define un rol adicional con permisos configurables.</DialogDescription></DialogHeader><div className="grid gap-4"><div className="grid gap-2"><Label htmlFor="role-code">Código</Label><Input id="role-code" /></div><div className="grid gap-2"><Label htmlFor="role-label">Etiqueta</Label><Input id="role-label" /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{messages.common.cancel}</Button><Button onClick={() => setOpen(false)}>{messages.common.save}</Button></DialogFooter></DialogContent></Dialog></div>
        <Table><TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Etiqueta</TableHead><TableHead>Tipo</TableHead></TableRow></TableHeader><TableBody>{seedRoles.map((role) => <TableRow key={role.code}><TableCell className="font-mono text-xs">{role.code}</TableCell><TableCell>{role.label}</TableCell><TableCell>Seed</TableCell></TableRow>)}</TableBody></Table>
      </section>
    </TooltipProvider>
  );
}
