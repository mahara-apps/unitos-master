import { CalendarClock, CalendarDays } from "lucide-react";
import { format, isToday, isTomorrow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { OverviewCard, OverviewEmpty, OverviewLink } from "./overview-shared";

export type UpcomingItem = {
  id: string;
  title: string;
  when: string;
  kind: "task" | "post";
};

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Hoje";
  if (isTomorrow(d)) return "Amanhã";
  return format(d, "EEEE, dd/MM", { locale: ptBR });
}

export function OverviewUpcoming({ items }: { items: UpcomingItem[] }) {
  const shown = items.slice(0, 6);
  return (
    <OverviewCard
      title="Próximas atividades"
      subtitle={items.length === 0 ? "Nada agendado" : `${items.length} nos próximos dias`}
      icon={<CalendarClock className="h-4 w-4" />}
      footer={<OverviewLink label="Ver agenda" href="/calendar" />}
    >
      {shown.length === 0 ? (
        <OverviewEmpty
          icon={<CalendarDays className="h-4 w-4" />}
          title="Nenhuma atividade próxima"
          hint="Tarefas com prazo e publicações agendadas aparecem aqui."
        />
      ) : (
        <ul className="divide-y divide-border/40">
          {shown.map((it) => (
            <li key={`${it.kind}-${it.id}`} className="flex items-start gap-3 py-2 first:pt-0">
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  it.kind === "task" ? "bg-amber-400" : "bg-sky-400"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{it.title}</div>
                <div className="text-[11px] capitalize text-muted-foreground">
                  {dayLabel(it.when)} · {format(new Date(it.when), "HH:mm")} ·{" "}
                  {it.kind === "task" ? "Tarefa" : "Publicação"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}
