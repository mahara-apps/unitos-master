/**
 * Seletor de status cadastrável (work_statuses) por escopo.
 * Popover com busca, pílulas coloridas e atalho para o cadastro.
 * Sem status cadastrados, oferece o atalho "Definir status".
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  listWorkStatusesFn,
  createWorkStatusFn,
  type WorkStatus,
  type WorkStatusScope,
} from "@/lib/work-statuses.functions";

export function useWorkStatuses(brandId: string, scope: WorkStatusScope) {
  const list = useServerFn(listWorkStatusesFn);
  return useQuery({
    queryKey: ["work-statuses", brandId, scope],
    enabled: !!brandId,
    staleTime: 60_000,
    queryFn: () => list({ data: { brandId, scope } }),
  });
}

export function StatusDot({ color }: { color: string | null }) {
  return (
    <span
      className="h-2.5 w-4 shrink-0 rounded-full"
      style={{ backgroundColor: color ?? "hsl(var(--muted-foreground))" }}
    />
  );
}

function ManageLink({ className }: { className?: string }) {
  return (
    <Link
      to="/settings/work-statuses"
      className={cn(
        "flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <Settings2 className="h-3 w-3" /> Gerenciar status
    </Link>
  );
}

export function StatusPicker({
  brandId,
  scope,
  value,
  onChange,
  disabled,
  placeholder = "Sem status",
  className = "h-8 w-[170px]",
}: {
  brandId: string;
  scope: WorkStatusScope;
  value: string | null;
  onChange: (statusId: string | null) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const qc = useQueryClient();
  const statusesQ = useWorkStatuses(brandId, scope);
  const create = useServerFn(createWorkStatusFn);
  const createMut = useMutation({ mutationFn: () => create({ data: { brandId, scope, name: name.trim(), taskState: scope === "task" ? "todo" : null } }), onSuccess: (row) => { qc.invalidateQueries({ queryKey: ["work-statuses", brandId, scope] }); onChange(row.id); setName(""); setCreating(false); setOpen(false); }, onError: () => toast.error("Apenas administradores podem criar status.") });
  const statuses = (statusesQ.data ?? []) as WorkStatus[];

  if (statusesQ.isLoading) return null;

  const current = statuses.find((s) => s.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          variant="outline"
          role="combobox"
          aria-label="Status"
          className={cn("justify-between gap-2 px-2.5 font-normal", className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {current ? <StatusDot color={current.color} /> : null}
             <span className="truncate text-xs">{current ? current.name : placeholder}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[260px] p-0">
        <Command>
          <CommandInput placeholder="Buscar status" className="h-9" />
          <CommandList className="max-h-[260px]">
            <CommandEmpty>Nenhum status encontrado.</CommandEmpty>
             <CommandGroup>
              <CommandItem
                value="Sem status"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <span className="flex flex-1 items-center gap-2 text-muted-foreground">
                  Sem status
                </span>
                {!value ? <Check className="h-3.5 w-3.5" /> : null}
              </CommandItem>
              {statuses.map((s) => (
                <CommandItem
                  key={s.id}
                  value={s.name}
                  onSelect={() => {
                    onChange(s.id);
                    setOpen(false);
                  }}
                >
                  <span className="flex flex-1 items-center gap-2">
                    <StatusDot color={s.color} />
                    <span className="truncate" style={{ color: s.color ?? undefined }}>
                      {s.name}
                    </span>
                  </span>
                  {value === s.id ? <Check className="h-3.5 w-3.5" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="border-t border-border/60 px-3 py-2">
          {creating ? <div className="flex gap-2"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) createMut.mutate(); }} className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs" placeholder="Nome do status" /><Button size="sm" className="h-8" disabled={!name.trim()} onClick={() => createMut.mutate()}>Criar</Button></div> : <div className="flex items-center justify-between"><Button size="sm" variant="ghost" className="h-7 gap-1 px-1 text-xs" onClick={() => setCreating(true)}><Plus className="h-3 w-3" />Novo status</Button><ManageLink /></div>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Rótulo somente-leitura de um status cadastrado. */
export function StatusBadge({
  statusId,
  statuses,
}: {
  statusId: string | null;
  statuses: WorkStatus[];
}) {
  if (!statusId) return null;
  const s = statuses.find((x) => x.id === statusId);
  if (!s) return null;
  return (
    <span className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2 py-0.5 text-[11px]">
      <StatusDot color={s.color} />
      {s.name}
    </span>
  );
}
