"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { messages } from "@/shared/utils";

/** Lista in-app responsive; la consulta real se conecta por tRPC al autenticar. */
export function NotificationsList() {
  return <section aria-labelledby="notifications-title"><h1 id="notifications-title" className="mb-6 text-2xl font-semibold">{messages.notifications.title}</h1><Card><CardHeader><CardTitle>{messages.notifications.empty}</CardTitle></CardHeader><CardContent><Button variant="outline" disabled>{messages.notifications.markRead}</Button></CardContent></Card></section>;
}
