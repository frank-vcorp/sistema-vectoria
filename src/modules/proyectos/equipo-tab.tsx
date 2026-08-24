"use client";

/**
 * SPEC-006 §4.3 / AC-1 · pestaña de EQUIPO del proyecto.
 *
 * - Lista los miembros activos (PL primero).
 * - Permite agregar (input userId + rol) y retirar miembros.
 * - El PL es el primer miembro por construcción (SPEC-005); este
 *   componente NO permite retirarlo (defensa del lado servicio).
 * - Responsive: tabla con `overflow-x-auto`; oculta columnas en
 *   móvil con `hidden sm:table-cell`.
 */
import * as React from "react";
import { messages } from "@/shared/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ROLE_LABELS: Record<string, string> = {
  lider: "PL",
  programador: "Programador",
  disenador: "Diseñador",
  qa: "QA",
};

const ROLES = ["programador", "disenador", "qa"] as const;

interface EquipoTabProps {
  projectId: string;
}

export function EquipoTab({ projectId }: EquipoTabProps) {
  const utils = trpc.useUtils();
  const list = trpc.proyectos.members.list.useQuery(
    { projectId },
    { staleTime: 10_000 },
  );
  const add = trpc.proyectos.members.add.useMutation({
    onSuccess: () => utils.proyectos.members.list.invalidate({ projectId }),
  });
  const remove = trpc.proyectos.members.remove.useMutation({
    onSuccess: () => utils.proyectos.members.list.invalidate({ projectId }),
  });

  const [userId, setUserId] = React.useState("");
  const [role, setRole] = React.useState<(typeof ROLES)[number]>("programador");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.proyectos.teamTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-1">
            <Label htmlFor="member-user">{messages.proyectos.teamUserPlaceholder}</Label>
            <Input
              id="member-user"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="00000000-…"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="member-role">{messages.proyectos.teamRole}</Label>
            <select
              id="member-role"
              className="w-full rounded-md border bg-background px-2 py-1 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button
              disabled={!userId.trim() || add.isPending}
              onClick={() =>
                add.mutate(
                  { projectId, userId, projectRole: role },
                  { onSuccess: () => setUserId("") },
                )
              }
            >
              {messages.proyectos.teamAdd}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rol</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden sm:table-cell">Asignado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data ?? []).map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {ROLE_LABELS[m.projectRole] ?? m.projectRole}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {m.userName ?? m.userId}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs md:table-cell">
                    {m.userEmail ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-xs sm:table-cell">
                    {new Date(m.assignedAt).toISOString().slice(0, 10)}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={
                        m.projectRole === "lider" || remove.isPending
                      }
                      onClick={() => remove.mutate({ memberId: m.id })}
                    >
                      {messages.proyectos.teamRemove}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
