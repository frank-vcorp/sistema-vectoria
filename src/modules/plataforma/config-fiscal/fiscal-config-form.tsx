"use client";

import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { messages } from "@/shared/utils";

export function FiscalConfigForm() {
  return <TooltipProvider><section aria-labelledby="fiscal-title"><h1 id="fiscal-title" className="mb-6 text-2xl font-semibold">{messages.fiscal.title}</h1><Card><CardContent className="pt-6"><form className="grid gap-4"><div className="grid gap-2"><Label htmlFor="rfc">{messages.fiscal.rfc}</Label><Input id="rfc" /></div><div className="grid gap-2"><Label htmlFor="razon-social">{messages.fiscal.razonSocial}</Label><Input id="razon-social" /></div><div className="grid gap-2"><Label htmlFor="regimen">{messages.fiscal.regimen}</Label><Input id="regimen" /></div><div className="grid gap-2"><Label htmlFor="pac-key">{messages.fiscal.pacApiKey}</Label><Input id="pac-key" type="password" autoComplete="off" /><Tooltip><TooltipTrigger aria-label="Ayuda sobre API key"><CircleHelp className="h-4 w-4 text-muted-foreground" /></TooltipTrigger><TooltipContent>Se cifra antes de guardarse y nunca se muestra después.</TooltipContent></Tooltip></div><Button type="submit">{messages.common.save}</Button></form></CardContent></Card></section></TooltipProvider>;
}
