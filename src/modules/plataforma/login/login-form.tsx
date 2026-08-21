"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/brand/wordmark";
import { messages } from "@/shared/utils";

/** Login responsivo. El Route Handler coloca cookies httpOnly, no el cliente. */
export function LoginForm() {
  const [error, setError] = React.useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: data.get("email"), password: data.get("password") }), headers: { "content-type": "application/json" } });
    if (!response.ok) { setError(messages.auth.loginError); return; }
    window.location.assign("/");
  }
  return (
    <Card className="w-full max-w-md">
      <CardHeader><Wordmark className="mb-2 text-xl" /><CardTitle>{messages.auth.login}</CardTitle></CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit} noValidate>
          <div className="grid gap-2"><Label htmlFor="email">{messages.auth.email}</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div>
          <div className="grid gap-2"><Label htmlFor="password">{messages.auth.password}</Label><Input id="password" name="password" type="password" autoComplete="current-password" required /></div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit">{messages.auth.login}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
