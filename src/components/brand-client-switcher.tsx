import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Plus, Sparkles, Building2, Users, UserPlus } from "lucide-react";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  listMyBrands,
  listClients,
  createBrand,
  // seedDemoData removido — sistema não cria mais clientes/conteúdos automáticos
} from "@/lib/workspace.functions";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CustomerAvatar } from "@/components/customer/customer-avatar";
import { useAccessRole } from "@/hooks/use-access-role";
import { QuickCreateCustomerDrawer } from "@/components/customer/quick-create-customer-drawer";

export function ContextSwitcher() {
  const { brandId, clientId, setBrandId, setClientId } = useActiveContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { role, allowedClientIds } = useAccessRole();
  const isAdmin = role === "admin";
  const list = useServerFn(listMyBrands);
  const create = useServerFn(createBrand);
  const listCl = useServerFn(listClients);

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => list() });
  const clientsQ = useQuery({
    queryKey: ["clients", brandId],
    queryFn: () => listCl({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);

  // Extrai o segmento após /customers/ para reconstruir sub-rota ao trocar de cliente
  const customerMatch = pathname.match(/^\/customers\/([^/]+)(\/[^?#]*)?/);
  const currentCustomerSub = customerMatch?.[2] ?? "";

  const handleSelectClient = async (id: string) => {
    setClientId(id);
    setPopoverOpen(false);
    if (customerMatch) {
      const sub = currentCustomerSub;
      if (sub === "/brain") {
        await navigate({ to: "/customers/$customerId/brain", params: { customerId: id }, replace: true });
      } else if (sub === "/briefing") {
        await navigate({ to: "/customers/$customerId/briefing", params: { customerId: id }, replace: true });
      } else if (sub === "/media-plan") {
        await navigate({ to: "/customers/$customerId/media-plan", params: { customerId: id }, replace: true });
      } else {
        await navigate({ to: "/customers/$customerId", params: { customerId: id }, replace: true });
      }
    }
    await qc.invalidateQueries();
  };

  const handleSelectAllClients = async () => {
    setClientId(null);
    setPopoverOpen(false);
    if (customerMatch) {
      await navigate({ to: "/customers", replace: true });
    }
    await qc.invalidateQueries();
  };

  const handleSelectBrand = async (id: string) => {
    setBrandId(id);
    setPopoverOpen(false);
    if (customerMatch) {
      await navigate({ to: "/dashboard", replace: true });
    }
    await qc.invalidateQueries();
  };

  const createMut = useMutation({
    mutationFn: (n: string) => create({ data: { name: n } }),
    onSuccess: async (b) => {
      await qc.invalidateQueries({ queryKey: ["brands"] });
      setBrandId(b.id);
      await qc.invalidateQueries();
      toast.success("Workspace criado", { description: "Cadastre seu primeiro cliente para começar." });
      setDialogOpen(false);
      setName("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!brandId && brandsQ.data && brandsQ.data.length > 0) setBrandId(brandsQ.data[0].id);
  }, [brandId, brandsQ.data, setBrandId]);

  const activeBrand = brandsQ.data?.find((b) => b.id === brandId) ?? null;
  const visibleClients = (clientsQ.data ?? []).filter(
    (c) => !allowedClientIds || allowedClientIds.has(c.id),
  );
  const activeClient = visibleClients.find((c) => c.id === clientId) ?? null;

  // Se o usuário tem um clientId ativo fora do seu escopo, limpa a seleção.
  useEffect(() => {
    if (!clientId || !allowedClientIds) return;
    if (!allowedClientIds.has(clientId)) setClientId(null);
  }, [clientId, allowedClientIds, setClientId]);

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <SidebarMenuButton
            tooltip={activeClient?.name ?? activeBrand?.name ?? "Workspace"}
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            {activeClient ? (
              <CustomerAvatar
                name={activeClient.name}
                logoUrl={(activeClient as { logo_url?: string | null }).logo_url ?? null}
                className="h-5 w-5"
                textClassName="text-[9px]"
              />
            ) : (
              <div
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-white shadow-sm"
                style={{ background: activeBrand?.color ?? "linear-gradient(135deg,#8b5cf6,#6366f1)" }}
              >
                <Sparkles className="h-3 w-3" />
              </div>
            )}
            <div className="grid flex-1 text-left leading-tight min-w-0">
              <span className="truncate text-sm font-medium tracking-tight">
                {activeClient?.name ?? activeBrand?.name ?? "Nenhum workspace"}
              </span>
              <span className="truncate text-[10px] text-muted-foreground">
                {activeClient ? (activeBrand?.name ?? "") : "Todas as contas"}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" />
          </SidebarMenuButton>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={8} className="w-72 p-0">
          <Command>
            <CommandInput placeholder="Buscar workspace ou cliente…" className="h-9" />
            <CommandList className="max-h-80">
              <CommandEmpty>Nenhum resultado.</CommandEmpty>
              <CommandGroup heading={
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Building2 className="h-3 w-3" /> WORKSPACES
                </span>
              }>
                {brandsQ.data?.map((b) => (
                  <CommandItem
                    key={b.id}
                    value={`workspace ${b.name}`}
                    onSelect={() => void handleSelectBrand(b.id)}
                  >
                    <div
                      className="flex h-5 w-5 items-center justify-center rounded"
                      style={{ background: b.color ?? "#8b5cf6" }}
                    />
                    <span className="flex-1 truncate">{b.name}</span>
                    {b.id === brandId && <Check className="h-3.5 w-3.5" />}
                  </CommandItem>
                ))}
                <CommandItem
                  value="create workspace"
                  onSelect={() => {
                    setPopoverOpen(false);
                    setDialogOpen(true);
                  }}
                  className="text-muted-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Novo workspace</span>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading={
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Users className="h-3 w-3" /> CLIENTES
                </span>
              }>
                <CommandItem
                  value="all accounts"
                  onSelect={() => void handleSelectAllClients()}
                >
                  <div className="h-3 w-3 rounded-full border border-dashed border-muted-foreground" />
                  <span className="flex-1">Todos os clientes</span>
                  {!clientId && <Check className="h-3.5 w-3.5" />}
                </CommandItem>
                {visibleClients.length === 0 && (
                  <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                    {isAdmin ? "Nenhum cliente ainda." : "Nenhum cliente atribuído a você."}
                  </div>
                )}
                {visibleClients.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`account ${c.name}`}
                    onSelect={() => void handleSelectClient(c.id)}
                  >
                    <CustomerAvatar
                      name={c.name}
                      logoUrl={(c as { logo_url?: string | null }).logo_url ?? null}
                      className="h-5 w-5"
                      textClassName="text-[9px]"
                    />
                    <span className="flex-1 truncate">{c.name}</span>
                    {c.id === clientId && <Check className="h-3.5 w-3.5" />}
                  </CommandItem>
                ))}
                {brandId && isAdmin && (
                  <CommandItem
                    value="create customer"
                    onSelect={() => {
                      setPopoverOpen(false);
                      setCustomerDialogOpen(true);
                    }}
                    className="text-muted-foreground"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>Novo cliente</span>
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo workspace</DialogTitle>
            <DialogDescription>
              Um workspace é o contêiner da sua agência. Crie quantos precisar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Minha agência" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate(name)} disabled={name.trim().length < 2 || createMut.isPending}>
              Criar workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuickCreateCustomerDrawer
        brandId={brandId}
        open={customerDialogOpen}
        onOpenChange={setCustomerDialogOpen}
        onCreated={(c) => setClientId(c.id)}
      />
    </>
  );
}

// Backwards-compatible aliases so existing imports keep working while the
// sidebar transitions to the unified <ContextSwitcher />.
export const BrandSwitcher = ContextSwitcher;
export const ClientSwitcher = () => null;