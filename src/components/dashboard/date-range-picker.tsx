import * as React from "react";
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Preset = { label: string; range: () => DateRange };

const presets: Preset[] = [
  { label: "Últimos 7 dias", range: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { label: "Últimos 14 dias", range: () => ({ from: subDays(new Date(), 13), to: new Date() }) },
  { label: "Últimos 30 dias", range: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
  { label: "Esta semana", range: () => ({ from: startOfWeek(new Date(), { weekStartsOn: 1 }), to: endOfWeek(new Date(), { weekStartsOn: 1 }) }) },
  { label: "Este mês", range: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
  { label: "Últimos 90 dias", range: () => ({ from: subDays(new Date(), 89), to: new Date() }) },
];

export function DateRangePicker({
  value,
  onChange,
  className,
}: {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
}) {
  const label = React.useMemo(() => {
    if (!value?.from) return "Selecionar período";
    const to = value.to ?? value.from;
    return `${format(value.from, "d MMM", { locale: ptBR })} — ${format(to, "d MMM, yyyy", { locale: ptBR })}`;
  }, [value]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-2 border-border/70 bg-background/60 text-xs font-medium backdrop-blur",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto overflow-hidden p-0" sideOffset={8}>
        <div className="flex">
          <div className="flex w-40 flex-col gap-0.5 border-r border-border/60 bg-muted/30 p-2">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => onChange(p.range())}
                className="rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-foreground/80 transition hover:bg-accent hover:text-foreground"
              >
                {p.label}
              </button>
            ))}
          </div>
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={value}
            onSelect={onChange}
            initialFocus
            className={cn("pointer-events-auto p-3")}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}