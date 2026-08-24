"use client";

import * as React from "react";
import { messages } from "@/shared/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FiscalPanelProps {
  clientId: string;
}

/**
 * SPEC-002 / AC-7 (BR-N218): datos fiscales opcionales. RFC único
 * por organización; el servicio emite `RFC_DUPLICATE` cuando colisiona.
 */
export function FiscalPanel({ clientId }: FiscalPanelProps) {
  const utils = trpc.useUtils();
  const current = trpc.clientes.fiscal.getForClient.useQuery({ clientId });
  const upsert = trpc.clientes.fiscal.upsert.useMutation({
    onSuccess: () => utils.clientes.fiscal.getForClient.invalidate({ clientId }),
  });

  const [rfc, setRfc] = React.useState("");
  const [razonSocial, setRazonSocial] = React.useState("");
  const [regimen, setRegimen] = React.useState("");
  const [cfdiUse, setCfdiUse] = React.useState("");

  React.useEffect(() => {
    const row = current.data;
    if (row) {
      setRfc(row.rfc ?? "");
      setRazonSocial(row.razonSocial ?? "");
      setRegimen(row.regimen ?? "");
      setCfdiUse(row.cfdiUse ?? "");
    }
  }, [current.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.clientes.fiscalData}</CardTitle>
        <CardDescription>{messages.clientes.fiscalEmpty}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <Label htmlFor="fiscal-rfc">{messages.clientes.rfc}</Label>
            <Input
              id="fiscal-rfc"
              value={rfc}
              onChange={(e) => setRfc(e.target.value.toUpperCase())}
              placeholder="XAXX010101000"
            />
          </div>
          <div>
            <Label htmlFor="fiscal-razon">{messages.clientes.razonSocial}</Label>
            <Input
              id="fiscal-razon"
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="fiscal-regimen">{messages.clientes.regimen}</Label>
            <Input
              id="fiscal-regimen"
              value={regimen}
              onChange={(e) => setRegimen(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="fiscal-cfdi">{messages.clientes.cfdiUse}</Label>
            <Input
              id="fiscal-cfdi"
              value={cfdiUse}
              onChange={(e) => setCfdiUse(e.target.value)}
            />
          </div>
        </div>
        <Button
          disabled={upsert.isPending}
          onClick={() =>
            upsert.mutate({
              clientId,
              ...(rfc ? { rfc } : {}),
              ...(razonSocial ? { razonSocial } : {}),
              ...(regimen ? { regimen } : {}),
              ...(cfdiUse ? { cfdiUse } : {}),
            })
          }
        >
          {messages.common.save}
        </Button>
        {upsert.error ? (
          <p className="text-sm text-destructive" role="alert">
            {upsert.error.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}