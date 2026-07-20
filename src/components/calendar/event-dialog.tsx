import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  upsertCalendarEventFn,
  deleteCalendarEventFn,
  type CalendarEvent,
} from "@/lib/calendar-events.functions";
import { useIsSuperAdmin } from "@/hooks/use-feature-access";

export type EventDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  clientId: string | null;
  /** Prefill when creating; source of truth when editing. */
  event?: CalendarEvent | null;
  /** Default type when creating a new event. */
  defaultType?: "appointment" | "seasonal";
  /** Default date/time when creating a new event. */
  defaultDate?: Date | null;
  invalidateKey?: readonly unknown[];
};

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toLocalDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fromLocalInput(v: string, allDay: boolean): string {
  if (!v) return new Date().toISOString();
  if (allDay) {
    const d = new Date(`${v}T00:00:00`);
    return d.toISOString();
  }
  return new Date(v).toISOString();
}

export function EventDialog({
  open,
  onOpenChange,
  brandId,
  clientId,
  event,
  defaultType = "appointment",
  defaultDate,
  invalidateKey,
}: EventDialogProps) {
  const superQ = useIsSuperAdmin();
  const isSuper = !!superQ.data?.isSuperAdmin;
  const qc = useQueryClient();
  const upsert = useServerFn(upsertCalendarEventFn);
  const del = useServerFn(deleteCalendarEventFn);
  const isEdit = !!event;

  const [type, setType] = useState<"appointment" | "seasonal">(
    event?.type ?? defaultType,
  );
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [startsAt, setStartsAt] = useState<string>(
    event
      ? event.all_day
        ? toLocalDate(event.starts_at)
        : toLocalInput(event.starts_at)
      : defaultDate
        ? toLocalInput(defaultDate.toISOString())
        : toLocalInput(new Date().toISOString()),
  );
  const [endsAt, setEndsAt] = useState<string>(
    event?.ends_at
      ? event.all_day
        ? toLocalDate(event.ends_at)
        : toLocalInput(event.ends_at)
      : "",
  );
  const [scope, setScope] = useState<"client" | "brand" | "global">(
    event?.is_global
      ? "global"
      : event?.client_id
        ? "client"
        : clientId
          ? "client"
          : "brand",
  );

  useEffect(() => {
    if (!open) return;
    setType(event?.type ?? defaultType);
    setTitle(event?.title ?? "");
    setDescription(event?.description ?? "");
    setAllDay(event?.all_day ?? false);
    setStartsAt(
      event
        ? event.all_day
          ? toLocalDate(event.starts_at)
          : toLocalInput(event.starts_at)
        : defaultDate
          ? toLocalInput(defaultDate.toISOString())
          : toLocalInput(new Date().toISOString()),
    );
    setEndsAt(
      event?.ends_at
        ? event.all_day
          ? toLocalDate(event.ends_at)
          : toLocalInput(event.ends_at)
        : "",
    );
    setScope(
      event?.is_global
        ? "global"
        : event?.client_id
          ? "client"
          : clientId
            ? "client"
            : "brand",
    );
  }, [open, event, defaultType, defaultDate, clientId]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Informe um título.");
      const isGlobal = scope === "global";
      if (isGlobal && !isSuper) throw new Error("Apenas super admins podem criar datas globais.");
      const startsIso = fromLocalInput(startsAt, allDay);
      const endsIso = endsAt ? fromLocalInput(endsAt, allDay) : null;
      return upsert({
        data: {
          id: event?.id,
          brandId: isGlobal ? null : brandId,
          clientId: isGlobal ? null : scope === "client" ? clientId : null,
          type,
          title: title.trim(),
          description: description.trim() || null,
          startsAt: startsIso,
          endsAt: endsIso,
          allDay,
          isGlobal,
          color: null,
        },
      });
    },
    onSuccess: () => {
      toast.success(isEdit ? "Evento atualizado." : "Evento criado.");
      if (invalidateKey) qc.invalidateQueries({ queryKey: [...invalidateKey] as unknown[] });
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message || "Falha ao salvar."),
  });

  const delMut = useMutation({
    mutationFn: async () => {
      if (!event?.id) return;
      return del({ data: { id: event.id } });
    },
    onSuccess: () => {
      toast.success("Evento excluído.");
      if (invalidateKey) qc.invalidateQueries({ queryKey: [...invalidateKey] as unknown[] });
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message || "Falha ao excluir."),
  });

  const canGlobal = isSuper;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar evento" : type === "seasonal" ? "Nova data sazonal" : "Novo compromisso"}
          </DialogTitle>
          <DialogDescription>
            {type === "seasonal"
              ? "Marque uma data importante no calendário editorial."
              : "Reuniões, gravações, entregas e outros lembretes."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as "appointment" | "seasonal")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="appointment">Compromisso</SelectItem>
                  <SelectItem value="seasonal">Data sazonal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Escopo</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as "client" | "brand" | "global")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {clientId ? <SelectItem value="client">Cliente atual</SelectItem> : null}
                  <SelectItem value="brand">Workspace</SelectItem>
                  {canGlobal && type === "seasonal" ? (
                    <SelectItem value="global">Global (todas as marcas)</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === "seasonal" ? "Dia das Mães" : "Reunião de alinhamento"}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes opcionais…"
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <div>
              <div className="text-sm font-medium">Dia inteiro</div>
              <div className="text-xs text-muted-foreground">Sem horário específico</div>
            </div>
            <Switch checked={allDay} onCheckedChange={setAllDay} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Início</Label>
              <Input
                type={allDay ? "date" : "datetime-local"}
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fim (opcional)</Label>
              <Input
                type={allDay ? "date" : "datetime-local"}
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <div>
            {isEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => delMut.mutate()}
                disabled={delMut.isPending}
              >
                {delMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                <span className="ml-1.5">Excluir</span>
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
            >
              {saveMut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {isEdit ? "Salvar" : "Criar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}