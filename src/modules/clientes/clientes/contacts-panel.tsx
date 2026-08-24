"use client";

import * as React from "react";
import { messages } from "@/shared/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ContactsPanelProps {
  clientId: string;
}

/**
 * SPEC-002 / AC-5 (BR-N217): sólo un contacto `is_main=true` por
 * cliente. El servicio lo garantiza transaccionalmente; la UI lo refleja
 * con etiqueta y acción explícita.
 */
export function ContactsPanel({ clientId }: ContactsPanelProps) {
  const utils = trpc.useUtils();
  const list = trpc.clientes.contactos.listForClient.useQuery({ clientId });
  const create = trpc.clientes.contactos.create.useMutation({
    onSuccess: () => utils.clientes.contactos.listForClient.invalidate({ clientId }),
  });
  const setMain = trpc.clientes.contactos.setMain.useMutation({
    onSuccess: () => utils.clientes.contactos.listForClient.invalidate({ clientId }),
  });
  const remove = trpc.clientes.contactos.delete.useMutation({
    onSuccess: () => utils.clientes.contactos.listForClient.invalidate({ clientId }),
  });

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [role, setRole] = React.useState("");

  const items = list.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.clientes.contacts}</CardTitle>
        <CardDescription>Sólo un contacto principal por cliente (BR-N217).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <Label htmlFor="contact-name">Nombre</Label>
            <Input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="contact-role">Rol</Label>
            <Input id="contact-role" value={role} onChange={(e) => setRole(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="contact-email">Email</Label>
            <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="contact-phone">Teléfono</Label>
            <Input id="contact-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <Button
          disabled={create.isPending || name.trim().length < 1}
          onClick={() => {
            create.mutate(
              {
                clientId,
                name: name.trim(),
                ...(email ? { email } : {}),
                ...(phone ? { phone } : {}),
                ...(role ? { role } : {}),
              },
              {
                onSuccess: () => {
                  setName("");
                  setEmail("");
                  setPhone("");
                  setRole("");
                },
              },
            );
          }}
        >
          {messages.clientes.addContact}
        </Button>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin contactos.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Principal</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden md:table-cell">Rol</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead className="hidden sm:table-cell">Teléfono</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.isMain ? "★" : ""}</TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell className="hidden md:table-cell">{c.role ?? "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">{c.email ?? "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">{c.phone ?? "—"}</TableCell>
                    <TableCell className="space-x-1 text-right">
                      {!c.isMain ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={setMain.isPending}
                          onClick={() => setMain.mutate({ contactId: c.id })}
                        >
                          {messages.clientes.setMain}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate({ contactId: c.id })}
                      >
                        {messages.common.delete}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}