import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown, Plus, Sparkles } from "lucide-react";
import { useActiveContext } from "@/hooks/use-active-context";
import { listMyBrands, listClients, createBrand, seedDemoData } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";

export function BrandSwitcher() {
  const { brandId, setBrandId } = useActiveContext();
  const qc = useQueryClient();
  const list = useServerFn(listMyBrands);
  const create = useServerFn(createBrand);
  const seed = useServerFn(seedDemoData);

  const q = useQuery({ queryKey: ["brands"], queryFn: () => list() });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const createMut = useMutation({
    mutationFn: (n: string) => create({ data: { name: n } }),
    onSuccess: async (b) => {
      await qc.invalidateQueries({ queryKey: ["brands"] });
      setBrandId(b.id);
      await seed({ data: { brandId: b.id } });
      await qc.invalidateQueries();
      toast.success("Workspace criado", { description: "Dados de exemplo adicionados." });
      setOpen(false);
      setName("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!brandId && q.data && q.data.length > 0) setBrandId(q.data[0].id);
  }, [brandId, q.data, setBrandId]);

  const active = q.data?.find((b) => b.id === brandId) ?? null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-11 w-full justify-between px-2">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white"
                style={{ background: active?.color ?? "linear-gradient(135deg,#8b5cf6,#6366f1)" }}
              >
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex flex-col text-left leading-tight min-w-0 group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm font-semibold">{active?.name ?? "Sem workspace"}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{active?.role ?? "—"}</span>
              </div>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" align="start">
          <DropdownMenuLabel className="text-xs">Seus workspaces</DropdownMenuLabel>
          {q.data?.map((b) => (
            <DropdownMenuItem key={b.id} onSelect={() => setBrandId(b.id)}>
              <div className="flex h-5 w-5 items-center justify-center rounded" style={{ background: b.color ?? "#8b5cf6" }} />
              <span className="flex-1 truncate">{b.name}</span>
              {b.id === brandId && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          )) ?? null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> Criar workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo workspace</DialogTitle>
            <DialogDescription>Um workspace é o container da sua agência. Você pode criar quantos precisar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Minha Agência" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate(name)} disabled={name.trim().length < 2 || createMut.isPending}>
              Criar e popular exemplo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ClientSwitcher() {
  const { brandId, clientId, setClientId } = useActiveContext();
  const listCl = useServerFn(listClients);
  const q = useQuery({
    queryKey: ["clients", brandId],
    queryFn: () => listCl({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });
  const active = q.data?.find((c) => c.id === clientId) ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 w-full justify-between px-2 text-left">
          <div className="flex items-center gap-2 min-w-0">
            {active ? (
              <div className="h-3 w-3 rounded-full" style={{ background: active.color ?? "#6366f1" }} />
            ) : (
              <div className="h-3 w-3 rounded-full border border-dashed border-muted-foreground" />
            )}
            <span className="truncate text-sm group-data-[collapsible=icon]:hidden">
              {active?.name ?? "Toda a agência"}
            </span>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground group-data-[collapsible=icon]:hidden" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuItem onSelect={() => setClientId(null)}>
          <div className="h-3 w-3 rounded-full border border-dashed border-muted-foreground" />
          <span className="flex-1">Toda a agência</span>
          {!clientId && <Check className="h-3.5 w-3.5" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {q.data?.length === 0 && (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhum cliente ainda.</div>
        )}
        {q.data?.map((c) => (
          <DropdownMenuItem key={c.id} onSelect={() => setClientId(c.id)}>
            <div className="h-3 w-3 rounded-full" style={{ background: c.color ?? "#6366f1" }} />
            <span className="flex-1 truncate">{c.name}</span>
            {c.id === clientId && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}