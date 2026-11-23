import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Building2, Loader2, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { listMemberClientsFn } from "@/lib/member-clients.functions";
import { roleNeedsClientScope, type ClientAccess } from "@/lib/member-clients";

/**
 * Bloco "Clientes que atende" (Equipe). Mostra só clientes que quem está
 * logado pode liberar; a hierarquia final é conferida no banco ao salvar.
 */
export function MemberClientsPicker({
  brandId,
  userId,
  role,
  value,
  onChange,
  onInitial,
}: {
  brandId: string;
  /** Membro já existente (edição); ausente em convites. */
  userId?: string | null;
  role: string;
  value: ClientAccess | null;
  onChange: (v: ClientAccess) => void;
  /** Estado salvo quando a lista carrega (para o resumo do que muda). */
  onInitial?: (v: ClientAccess) => void;
}) {
  const load = useServerFn(listMemberClientsFn);
  const scoped = roleNeedsClientScope(role);
  const q = useQuery({
    queryKey: ["member-clients", brandId, userId ?? "new"],
    queryFn: () => load({ data: { brandId, userId: userId ?? null } }),
    enabled: scoped && !!brandId,
    staleTime: 30_000,
  });
  const [search, setSearch] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (!q.data || initialized.current) return;
    initialized.current = true;
    const initial: ClientAccess = { all: q.data.allClients, clientIds: q.data.selectedIds };
    onInitial?.(initial);
    if (!value) onChange(initial);
  }, [q.data, value, onChange, onInitial]);

  const owned = useMemo(() => new Set(q.data?.ownedIds ?? []), [q.data]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = q.data?.clients ?? [];
    return term ? list.filter((c) => c.name.toLowerCase().includes(term)) : list;
  }, [q.data, search]);

  if (!scoped) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Vê todos os clientes do workspace pelo papel.
      </div>
    );
  }
  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando clientes…
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        Não foi possível carregar os clientes. Os clientes desta pessoa não serão alterados.
      </p>
    );
  }

  const data = q.data;
  const current: ClientAccess = value ?? { all: data.allClients, clientIds: data.selectedIds };
  const selected = new Set(current.clientIds);
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    onChange({ all: false, clientIds: [...next] });
  };
  const effectiveCount = new Set([...current.clientIds, ...owned]).size;
  // Manager sem "Todos os clientes" não pode desligar o "todos" de outra pessoa.
  const lockedAll = data.allClients && !data.actorCanGrantAll;

  return (
    <div className="space-y-3">
      <Label className="text-xs">Quais clientes essa pessoa vai atender?</Label>
      <RadioGroup
        value={current.all ? "all" : "selected"}
        onValueChange={(v) =>
          onChange({ all: v === "all", clientIds: current.clientIds })
        }
        className="grid gap-2"
      >
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border/60 p-2.5">
          <RadioGroupItem value="all" className="mt-0.5" />
          <span className="text-xs">
            <span className="font-medium text-foreground">Todos os clientes</span>
            <span className="block text-muted-foreground">
              {data.actorCanGrantAll
                ? "Inclui também os clientes cadastrados depois."
                : `Libera os ${data.clients.length} clientes que você acessa hoje.`}
            </span>
          </span>
        </label>
        <label
          className={`flex items-start gap-2 rounded-md border border-border/60 p-2.5 ${lockedAll ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        >
          <RadioGroupItem value="selected" className="mt-0.5" disabled={lockedAll} />
          <span className="text-xs">
            <span className="font-medium text-foreground">Selecionar clientes</span>
            <span className="block text-muted-foreground">
              {lockedAll
                ? "Somente Owner/Admin podem retirar \"Todos os clientes\"."
                : "Escolha um a um quem essa pessoa atende."}
            </span>
          </span>
        </label>
      </RadioGroup>

      {!current.all && (
        <div className="space-y-2 rounded-md border border-border/60 p-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>
              {current.clientIds.length} de {data.clients.length} selecionados
            </span>
            <span className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() =>
                  onChange({
                    all: false,
                    clientIds: [...new Set([...current.clientIds, ...filtered.map((c) => c.id)])],
                  })
                }
              >
                Marcar todos
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => onChange({ all: false, clientIds: [] })}
              >
                Limpar
              </Button>
            </span>
          </div>
          <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">Nenhum cliente encontrado.</p>
            ) : (
              filtered.map((c) => {
                const isOwner = owned.has(c.id);
                return (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={isOwner || selected.has(c.id)}
                      disabled={isOwner}
                      onCheckedChange={(v) => toggle(c.id, v === true)}
                    />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {isOwner && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">Responsável</span>
                    )}
                  </label>
                );
              })
            )}
          </div>
          {effectiveCount === 0 && (
            <p className="flex items-start gap-1.5 rounded-md border border-severity-warning/40 bg-severity-warning/10 px-2.5 py-2 text-[11px] text-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-severity-warning" />
              Essa pessoa não vai ver nenhum cliente até ser liberada.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
