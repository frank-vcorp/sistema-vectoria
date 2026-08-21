"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { Wordmark } from "@/components/brand/wordmark";
import { messages } from "@/shared/utils";

const links = [
  { href: "/", label: messages.nav.dashboard },
  { href: "/admin/roles", label: messages.nav.roles },
  { href: "/admin/permissions", label: messages.nav.users },
  { href: "/admin/fiscal-config", label: messages.nav.fiscalConfig },
  { href: "/notifications", label: messages.nav.notifications },
  { href: "/audit", label: messages.nav.audit },
] as const;

function NavLinks({ close }: { close?: () => void }) {
  return (
    <nav aria-label="Navegación principal" className="flex flex-col gap-1">
      {links.map((link) => (
        <Link key={link.href} href={link.href} {...(close ? { onClick: close } : {})} className="rounded-md px-3 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export function AppNavigation() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r bg-card p-4 lg:block">
        <Wordmark className="mb-8 block text-xl" />
        <NavLinks />
      </aside>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-4 lg:hidden">
        <Button variant="ghost" size="icon" aria-label="Abrir navegación" onClick={() => setOpen(true)}><Menu aria-hidden="true" /></Button>
        <Wordmark />
        <ThemeToggle />
      </header>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navegación">
          <button className="absolute inset-0 bg-black/40" aria-label="Cerrar navegación" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-72 bg-card p-4 shadow-xl">
            <div className="mb-8 flex items-center justify-between"><Wordmark className="text-xl" /><Button variant="ghost" size="icon" aria-label="Cerrar navegación" onClick={() => setOpen(false)}><X aria-hidden="true" /></Button></div>
            <NavLinks close={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}
    </>
  );
}
