import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { messages } from "@/shared/utils";

/** Dashboard agregado: devuelve indicadores, nunca listas crudas (AC-17). */
export function Dashboard() {
  const cards = [
    { label: messages.nav.notifications, value: "0" },
    { label: messages.nav.users, value: "0" },
    { label: messages.nav.audit, value: "0" },
  ];
  return (
    <section aria-labelledby="dashboard-title">
      <h1 id="dashboard-title" className="mb-6 text-2xl font-semibold">{messages.nav.dashboard}</h1>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => <Card key={card.label}><CardHeader><CardTitle className="text-sm text-muted-foreground">{card.label}</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{card.value}</p></CardContent></Card>)}
      </div>
    </section>
  );
}
