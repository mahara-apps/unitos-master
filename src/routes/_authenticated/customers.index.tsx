import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Search, ArrowRight, AlertTriangle, Loader2, LayoutGrid, List } from "lucide-react";
import { useActiveContext } from "@/hooks/use-active-context";
import { listClients, createClient } from "@/lib/workspace.functions";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const Route = createFileRoute("/_authenticated/customers/")({
  component: CustomersIndexPage,
});

function timeAgo(iso?: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function CustomersIndexPage() {
  const { brandId } = useActiveContext();
  const list = useServerFn(listClients);
  const create = useServerFn(createClient);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [creating, setCreating] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const customersQ = useQuery({
    queryKey: ["clients", brandId],
    queryFn: () => list({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });

  if (!brandId) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4" /> Selecione um workspace no menu lateral para ver os clientes.
        </div>
      </div>
    );
  }

  const customers = (customersQ.data ?? []).filter((c) =>
    c.name.toLowerCase().includes(q.toLowerCase()),
  );

  const onCreate = async () => {
    if (name.trim().length < 2) return;
    setCreating(true);
    try {
      await create({ data: { brandId, name: name.trim(), niche: niche.trim() || undefined } });
      toast.success("Cliente criado.");
      setName("");
      setNiche("");
      setOpen(false);
      customersQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="w-full space-y-6 px-6 py-6 md:px-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            módulo · clientes
          </div>
          <h1 className="mt-1 text-2xl font-semibold">Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {customersQ.isLoading ? "carregando..." : `${customers.length} cliente(s) neste workspace`}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Novo cliente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo cliente</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Café Aurora" />
              </div>
              <div>
                <Label className="text-xs">Nicho (opcional)</Label>
                <Input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="ex: Alimentação" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={onCreate} disabled={creating || name.trim().length < 2}>
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cliente…"
            className="pl-8 text-xs"
          />
        </div>
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(v) => v && setViewMode(v as "grid" | "list")}
          className="rounded-md border border-border bg-card p-0.5"
        >
          <ToggleGroupItem
            value="grid"
            aria-label="Grid view"
            className="h-7 w-7 rounded-sm data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="list"
            aria-label="List view"
            className="h-7 w-7 rounded-sm data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
          >
            <List className="h-3.5 w-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {customers.length === 0 && !customersQ.isLoading ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum cliente ainda. Crie o primeiro para começar a rodar os agentes de IA.
          </p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {customers.map((c) => {
            const meta = getCustomerMeta(c);
            return (
              <Link
                key={c.id}
                to="/customers/$customerId"
                params={{ customerId: c.id }}
                className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-all duration-200 cursor-pointer hover:border-zinc-700 dark:hover:border-zinc-300 hover:shadow-md"
              >
                {/* TOP */}
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                    style={{ background: c.color ?? "#6366f1" }}
                  >
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium text-foreground">{c.name}</div>
                      <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="truncate text-xs text-muted-foreground">
                        {c.niche ?? "Sem nicho"}
                      </span>
                      <Badge
                        variant="outline"
                        className="h-4 rounded-full border-zinc-200 px-1.5 text-[9px] font-normal uppercase tracking-wider text-muted-foreground dark:border-zinc-800"
                      >
                        Active
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* MIDDLE */}
                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  {meta.hasStrategy ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      ✨ Strategy Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      ⚡ Ready for Bootstrap
                    </span>
                  )}
                  {c.tone_of_voice && (
                    <span className="rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {c.tone_of_voice}
                    </span>
                  )}
                </div>

                {/* BOTTOM */}
                <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-[11px] text-muted-foreground dark:border-zinc-800/50">
                  <span>Updated {timeAgo(meta.updated)}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[8px] font-semibold text-foreground">
                      {meta.managerInitials}
                    </span>
                    <span className="truncate max-w-[9rem]">{meta.manager ?? "Unassigned"}</span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="w-full overflow-hidden rounded-xl border border-border bg-card">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_100px_180px_minmax(0,1fr)_200px] items-center gap-4 border-b border-zinc-100 px-5 py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground dark:border-zinc-800/50 md:grid">
            <span>Cliente</span>
            <span>Status</span>
            <span>Estratégia</span>
            <span>Tom / tags</span>
            <span className="text-right">Última atividade</span>
          </div>
          {customers.map((c) => {
            const meta = getCustomerMeta(c);
            return (
              <Link
                key={c.id}
                to="/customers/$customerId"
                params={{ customerId: c.id }}
                className="group grid grid-cols-1 items-center gap-3 border-b border-zinc-100 px-5 py-3.5 transition-all last:border-b-0 hover:bg-zinc-50/50 dark:border-zinc-800/50 dark:hover:bg-zinc-900/40 md:grid-cols-[minmax(0,2.2fr)_100px_180px_minmax(0,1fr)_200px] md:gap-4"
              >
                {/* col 1: avatar + nome + nicho */}
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
                    style={{ background: c.color ?? "#6366f1" }}
                  >
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{c.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{c.niche ?? "Sem nicho"}</div>
                  </div>
                </div>
                {/* col 2: status */}
                <div>
                  <Badge
                    variant="outline"
                    className="h-4 rounded-full border-zinc-200 px-1.5 text-[9px] font-normal uppercase tracking-wider text-muted-foreground dark:border-zinc-800"
                  >
                    Active
                  </Badge>
                </div>
                {/* col 3: strategy */}
                <div>
                  {meta.hasStrategy ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      ✨ Strategy Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      ⚡ Ready for Bootstrap
                    </span>
                  )}
                </div>
                {/* col 4: tags / tom */}
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  {c.tone_of_voice ? (
                    <span className="truncate rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {c.tone_of_voice}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </div>
                {/* col 5: última atividade */}
                <div className="flex items-center justify-end gap-3 text-[11px] text-muted-foreground">
                  <span>Updated {timeAgo(meta.updated)}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[8px] font-semibold text-foreground">
                      {meta.managerInitials}
                    </span>
                    <span className="truncate max-w-[7rem]">{meta.manager ?? "Unassigned"}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

type CustomerRow = {
  color?: string | null;
  contact_name?: string | null;
  has_briefing?: boolean;
  updated_at?: string | null;
  created_at?: string | null;
};

function getCustomerMeta(c: CustomerRow) {
  const hasStrategy = !!c.has_briefing;
  const updated = c.updated_at ?? c.created_at ?? null;
  const manager = c.contact_name?.trim() || null;
  const managerInitials =
    (manager ?? "—")
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "·";
  return { hasStrategy, updated, manager, managerInitials };
}