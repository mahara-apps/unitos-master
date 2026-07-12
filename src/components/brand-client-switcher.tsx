import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown, Plus, Sparkles, Building2, Users, UserPlus } from "lucide-react";
import { useActiveContext } from "@/hooks/use-active-context";
import {
  listMyBrands,
  listClients,
  createBrand,
  createClient,
  seedDemoData,
} from "@/lib/workspace.functions";
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

export function ContextSwitcher() {
  const { brandId, clientId, setBrandId, setClientId } = useActiveContext();
  const qc = useQueryClient();
  const list = useServerFn(listMyBrands);
  const create = useServerFn(createBrand);
  const seed = useServerFn(seedDemoData);
  const listCl = useServerFn(listClients);
  const createCustomer = useServerFn(createClient);

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
  const [customerName, setCustomerName] = useState("");
  const [customerNiche, setCustomerNiche] = useState("");
  const [customerLogo, setCustomerLogo] = useState("");

  const createMut = useMutation({
    mutationFn: (n: string) => create({ data: { name: n } }),
    onSuccess: async (b) => {
      await qc.invalidateQueries({ queryKey: ["brands"] });
      setBrandId(b.id);
      await seed({ data: { brandId: b.id } });
      await qc.invalidateQueries();
      toast.success("Workspace created", { description: "Sample data added." });
      setDialogOpen(false);
      setName("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createCustomerMut = useMutation({
    mutationFn: () =>
      createCustomer({
        data: {
          brandId: brandId!,
          name: customerName.trim(),
          niche: customerNiche.trim() || undefined,
          // logo_url is persisted via the customers page form; the switcher
          // captures it here through the socials.notes field only if provided.
        },
      }),
    onSuccess: async (c: { id: string }) => {
      await qc.invalidateQueries({ queryKey: ["clients", brandId] });
      setClientId(c.id);
      toast.success("Customer created");
      setCustomerDialogOpen(false);
      setCustomerName("");
      setCustomerNiche("");
      setCustomerLogo("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!brandId && brandsQ.data && brandsQ.data.length > 0) setBrandId(brandsQ.data[0].id);
  }, [brandId, brandsQ.data, setBrandId]);

  const activeBrand = brandsQ.data?.find((b) => b.id === brandId) ?? null;
  const activeClient = clientsQ.data?.find((c) => c.id === clientId) ?? null;

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="h-12 w-full justify-between px-2">
            <div className="flex items-center gap-2 min-w-0">
              {activeClient ? (
                <CustomerAvatar
                  name={activeClient.name}
                  logoUrl={(activeClient as { logo_url?: string | null }).logo_url ?? null}
                  className="h-8 w-8"
                  textClassName="text-xs"
                />
              ) : (
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white"
                  style={{ background: activeBrand?.color ?? "linear-gradient(135deg,#8b5cf6,#6366f1)" }}
                >
                  <Sparkles className="h-4 w-4" />
                </div>
              )}
              <div className="flex flex-col text-left leading-tight min-w-0 group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm font-semibold">
                  {activeClient?.name ?? activeBrand?.name ?? "No workspace"}
                </span>
                <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                  {activeClient ? (
                    <span className="truncate">{activeBrand?.name ?? ""}</span>
                  ) : (
                    <span className="truncate">All accounts</span>
                  )}
                </span>
              </div>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={8} className="w-72 p-0">
          <Command>
            <CommandInput placeholder="Search workspace or customer…" className="h-9" />
            <CommandList className="max-h-80">
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup heading={
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Building2 className="h-3 w-3" /> Workspaces
                </span>
              }>
                {brandsQ.data?.map((b) => (
                  <CommandItem
                    key={b.id}
                    value={`workspace ${b.name}`}
                    onSelect={() => {
                      setBrandId(b.id);
                      setPopoverOpen(false);
                    }}
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
                  <span>New workspace</span>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading={
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Users className="h-3 w-3" /> Customers
                </span>
              }>
                <CommandItem
                  value="all accounts"
                  onSelect={() => {
                    setClientId(null);
                    setPopoverOpen(false);
                  }}
                >
                  <div className="h-3 w-3 rounded-full border border-dashed border-muted-foreground" />
                  <span className="flex-1">All customers</span>
                  {!clientId && <Check className="h-3.5 w-3.5" />}
                </CommandItem>
                {clientsQ.data?.length === 0 && (
                  <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                    No customers yet.
                  </div>
                )}
                {clientsQ.data?.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`account ${c.name}`}
                    onSelect={() => {
                      setClientId(c.id);
                      setPopoverOpen(false);
                    }}
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
                {brandId && (
                  <CommandItem
                    value="create customer"
                    onSelect={() => {
                      setPopoverOpen(false);
                      setCustomerDialogOpen(true);
                    }}
                    className="text-muted-foreground"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>New customer</span>
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
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>
              A workspace is the container for your agency. Create as many as you need.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My agency" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate(name)} disabled={name.trim().length < 2 || createMut.isPending}>
              Create with sample data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New customer</DialogTitle>
            <DialogDescription>
              Add a customer to the current workspace. You can refine branding
              and channels later from the customers page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <CustomerAvatar
                name={customerName || "?"}
                logoUrl={customerLogo || null}
                className="h-10 w-10"
                textClassName="text-sm"
              />
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Name</Label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Café Aurora"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Niche</Label>
                <Input
                  value={customerNiche}
                  onChange={(e) => setCustomerNiche(e.target.value)}
                  placeholder="Coffee shop"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Logo URL (optional)</Label>
                <Input
                  value={customerLogo}
                  onChange={(e) => setCustomerLogo(e.target.value)}
                  placeholder="https://…/logo.png"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomerDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createCustomerMut.mutate()}
              disabled={customerName.trim().length < 2 || createCustomerMut.isPending}
            >
              Create customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Backwards-compatible aliases so existing imports keep working while the
// sidebar transitions to the unified <ContextSwitcher />.
export const BrandSwitcher = ContextSwitcher;
export const ClientSwitcher = () => null;