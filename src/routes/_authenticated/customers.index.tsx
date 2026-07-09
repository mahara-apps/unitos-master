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
import { Plus, Search, ArrowRight, AlertTriangle, Loader2 } from "lucide-react";
import { useActiveContext } from "@/hooks/use-active-context";
import { listClients, createClient } from "@/lib/workspace.functions";

export const Route = createFileRoute("/_authenticated/customers/")({
  component: CustomersIndexPage,
});

function CustomersIndexPage() {
  const { brandId } = useActiveContext();
  const list = useServerFn(listClients);
  const create = useServerFn(createClient);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [creating, setCreating] = useState(false);

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
    <div className="mx-auto max-w-6xl space-y-6 p-6">
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

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente…"
          className="pl-8 text-xs"
        />
      </div>

      {customers.length === 0 && !customersQ.isLoading ? (
        <div className="rounded-xl border border-white/10 bg-neutral-950/60 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum cliente ainda. Crie o primeiro para começar a rodar os agentes de IA.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {customers.map((c) => (
            <Link
              key={c.id}
              to="/customers/$customerId"
              params={{ customerId: c.id }}
              className="group rounded-xl border border-white/10 bg-neutral-950/60 p-5 transition hover:border-primary/40"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white"
                    style={{ background: c.color ?? "#6366f1" }}
                  >
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground">{c.niche ?? "—"}</div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
              </div>
              {c.tone_of_voice && (
                <div className="mt-4 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    Tom de voz: <span className="text-foreground">{c.tone_of_voice}</span>
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {c.id.slice(0, 8)}
                  </Badge>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}