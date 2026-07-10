import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Search, ArrowRight, AlertTriangle, Loader2, LayoutGrid, List,
  Pencil, Trash2, MoreHorizontal, Instagram, Music2, Linkedin, Youtube,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveContext } from "@/hooks/use-active-context";
import { listClients, createClient, updateClient, deleteClient } from "@/lib/workspace.functions";
import { listBrandTeam } from "@/lib/team.functions";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const Route = createFileRoute("/_authenticated/customers/")({
  component: CustomersIndexPage,
});

const BRAND_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316",
  "#f59e0b", "#10b981", "#14b8a6", "#0ea5e9", "#3b82f6",
  "#a855f7", "#64748b",
];

const CustomerFormSchema = z.object({
  name: z.string().trim().min(2, "Nome precisa de pelo menos 2 caracteres").max(120),
  niche: z.string().max(120).optional(),
  color: z.string(),
  tone_of_voice: z.string().max(120).optional(),
  contact_name: z.string().max(120).optional(),
  contact_email: z.string().max(200).optional().refine(
    (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    "E-mail inválido",
  ),
  is_active: z.boolean(),
  owner_user_id: z.string().uuid().nullable(),
  socials: z.object({
    instagram: z.string().max(120).optional(),
    tiktok: z.string().max(120).optional(),
    youtube: z.string().max(200).optional(),
    linkedin: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
  }),
});

type CustomerFormValues = z.infer<typeof CustomerFormSchema>;

type ClientRow = {
  id: string;
  name: string;
  niche: string | null;
  color: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  tone_of_voice: string | null;
  palette: unknown;
  socials: unknown;
  is_active?: boolean;
  owner_user_id?: string | null;
  created_at: string;
  updated_at: string;
  has_briefing?: boolean;
};

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
  const qc = useQueryClient();
  const list = useServerFn(listClients);
  const create = useServerFn(createClient);
  const update = useServerFn(updateClient);
  const remove = useServerFn(deleteClient);
  const teamFn = useServerFn(listBrandTeam);
  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [toDelete, setToDelete] = useState<ClientRow | null>(null);

  const customersQ = useQuery({
    queryKey: ["clients", brandId],
    queryFn: () => list({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });

  const teamQ = useQuery({
    queryKey: ["team", brandId],
    queryFn: () => teamFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });
  const teamMembers = (teamQ.data?.members ?? []) as Array<{
    user_id: string;
    full_name: string | null;
  }>;

  const createMut = useMutation({
    mutationFn: (values: CustomerFormValues) =>
      create({
        data: {
          brandId: brandId!,
          name: values.name,
          niche: values.niche || undefined,
          color: values.color,
          tone_of_voice: values.tone_of_voice || undefined,
          contact_name: values.contact_name || undefined,
          contact_email: values.contact_email || undefined,
          is_active: values.is_active,
          owner_user_id: values.owner_user_id,
          socials: values.socials,
        },
      }),
    onSuccess: () => {
      toast.success("Cliente criado");
      qc.invalidateQueries({ queryKey: ["clients", brandId] });
      setFormOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (args: { clientId: string; values: CustomerFormValues }) =>
      update({
        data: {
          brandId: brandId!,
          clientId: args.clientId,
          patch: {
            name: args.values.name,
            niche: args.values.niche || null,
            color: args.values.color,
            tone_of_voice: args.values.tone_of_voice || null,
            contact_name: args.values.contact_name || null,
            contact_email: args.values.contact_email || null,
            is_active: args.values.is_active,
            owner_user_id: args.values.owner_user_id,
            socials: args.values.socials,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Cliente atualizado");
      qc.invalidateQueries({ queryKey: ["clients", brandId] });
      setFormOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (clientId: string) => remove({ data: { brandId: brandId!, clientId } }),
    onSuccess: () => {
      toast.error("Cliente removido", { description: "O registro foi excluído permanentemente." });
      qc.invalidateQueries({ queryKey: ["clients", brandId] });
      setToDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (c: ClientRow) => { setEditing(c); setFormOpen(true); };

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
  ) as ClientRow[];

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
        <Button
          size="sm"
          onClick={openCreate}
          className="gap-1.5 bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <Plus className="h-3.5 w-3.5" /> Novo cliente
        </Button>
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
              <div
                key={c.id}
                className="group relative flex flex-col rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:border-zinc-700 dark:hover:border-zinc-300 hover:shadow-md"
              >
                <div className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100">
                  <CardActions onEdit={() => openEdit(c)} onDelete={() => setToDelete(c)} />
                </div>
                <Link
                  to="/customers/$customerId"
                  params={{ customerId: c.id }}
                  className="flex flex-col"
                >
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                    style={{ background: c.color ?? "#6366f1" }}
                  >
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 pr-8">
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
              </div>
            );
          })}
        </div>
      ) : (
        <div className="w-full overflow-hidden rounded-xl border border-border bg-card">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_100px_180px_minmax(0,1fr)_200px_50px] items-center gap-4 border-b border-zinc-100 px-5 py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground dark:border-zinc-800/50 md:grid">
            <span>Cliente</span>
            <span>Status</span>
            <span>Estratégia</span>
            <span>Tom / tags</span>
            <span className="text-right">Última atividade</span>
            <span />
          </div>
          {customers.map((c) => {
            const meta = getCustomerMeta(c);
            return (
              <div
                key={c.id}
                className="group grid grid-cols-1 items-center gap-3 border-b border-zinc-100 px-5 py-3.5 transition-all last:border-b-0 hover:bg-zinc-50/50 dark:border-zinc-800/50 dark:hover:bg-zinc-900/40 md:grid-cols-[minmax(0,2.2fr)_100px_180px_minmax(0,1fr)_200px_50px] md:gap-4"
              >
                <Link to="/customers/$customerId" params={{ customerId: c.id }} className="flex min-w-0 items-center gap-3">
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
                </Link>
                <div>
                  <Badge
                    variant="outline"
                    className="h-4 rounded-full border-zinc-200 px-1.5 text-[9px] font-normal uppercase tracking-wider text-muted-foreground dark:border-zinc-800"
                  >
                    Active
                  </Badge>
                </div>
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
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  {c.tone_of_voice ? (
                    <span className="truncate rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {c.tone_of_voice}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-3 text-[11px] text-muted-foreground">
                  <span>Updated {timeAgo(meta.updated)}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[8px] font-semibold text-foreground">
                      {meta.managerInitials}
                    </span>
                    <span className="truncate max-w-[7rem]">{meta.manager ?? "Unassigned"}</span>
                  </span>
                </div>
                <div className="flex justify-end">
                  <CardActions onEdit={() => openEdit(c)} onDelete={() => setToDelete(c)} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CustomerFormDialog
        key={editing?.id ?? "new"}
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }}
        initial={editing}
        teamMembers={teamMembers}
        submitting={createMut.isPending || updateMut.isPending}
        onSubmit={(values) => {
          if (editing) updateMut.mutate({ clientId: editing.id, values });
          else createMut.mutate(values);
        }}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{toDelete?.name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (toDelete) deleteMut.mutate(toDelete.id); }}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CardActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
          <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CustomerFormDialog({
  open, onOpenChange, initial, teamMembers, submitting, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: ClientRow | null;
  teamMembers: Array<{ user_id: string; full_name: string | null }>;
  submitting: boolean;
  onSubmit: (values: CustomerFormValues) => void;
}) {
  const socials = (initial?.socials ?? {}) as Partial<CustomerFormValues["socials"]>;
  const [values, setValues] = useState<CustomerFormValues>({
    name: initial?.name ?? "",
    niche: initial?.niche ?? "",
    color: initial?.color ?? BRAND_COLORS[0],
    tone_of_voice: initial?.tone_of_voice ?? "",
    contact_name: initial?.contact_name ?? "",
    contact_email: initial?.contact_email ?? "",
    is_active: initial?.is_active ?? true,
    owner_user_id: initial?.owner_user_id ?? null,
    socials: {
      instagram: socials.instagram ?? "",
      tiktok: socials.tiktok ?? "",
      youtube: socials.youtube ?? "",
      linkedin: socials.linkedin ?? "",
      notes: socials.notes ?? "",
    },
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) setErrors({});
  }, [open]);

  const set = <K extends keyof CustomerFormValues>(k: K, v: CustomerFormValues[K]) =>
    setValues((s) => ({ ...s, [k]: v }));
  const setSocial = (k: keyof CustomerFormValues["socials"], v: string) =>
    setValues((s) => ({ ...s, socials: { ...s.socials, [k]: v } }));

  const submit = () => {
    const parsed = CustomerFormSchema.safeParse(values);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errs[issue.path.join(".")] = issue.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          <DialogDescription>
            Informações da marca, identidade visual e canais de conteúdo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Nome da marca *</Label>
              <Input value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="ex: Café Aurora" />
              {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
            </div>
            <div>
              <Label className="text-xs">Nicho</Label>
              <Input value={values.niche ?? ""} onChange={(e) => set("niche", e.target.value)} placeholder="Alimentação" />
            </div>
            <div>
              <Label className="text-xs">Tom de voz</Label>
              <Input value={values.tone_of_voice ?? ""} onChange={(e) => set("tone_of_voice", e.target.value)} placeholder="Descontraído" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Cor da marca</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {BRAND_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("color", c)}
                  aria-label={`Selecionar cor ${c}`}
                  className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition ${values.color === c ? "ring-2 ring-foreground" : "hover:ring-1 hover:ring-border"}`}
                  style={{ background: c }}
                />
              ))}
              <input
                type="color"
                value={values.color}
                onChange={(e) => set("color", e.target.value)}
                className="h-7 w-7 cursor-pointer rounded-full border border-border bg-transparent p-0.5"
                aria-label="Cor personalizada"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Contato</Label>
              <Input value={values.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} placeholder="Nome do responsável" />
            </div>
            <div>
              <Label className="text-xs">E-mail</Label>
              <Input value={values.contact_email ?? ""} onChange={(e) => set("contact_email", e.target.value)} placeholder="email@empresa.com" />
              {errors.contact_email && <p className="mt-1 text-xs text-destructive">{errors.contact_email}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Responsável interno</Label>
              <Select
                value={values.owner_user_id ?? "__none"}
                onValueChange={(v) => set("owner_user_id", v === "__none" ? null : v)}
              >
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue placeholder="Selecionar usuário…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem responsável</SelectItem>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.full_name ?? m.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <div className="mt-1 flex h-9 items-center justify-between rounded-md border border-border bg-background px-3">
                <span className="text-xs text-muted-foreground">
                  {values.is_active ? "Cliente ativo" : "Cliente inativo"}
                </span>
                <Switch
                  checked={values.is_active}
                  onCheckedChange={(v) => set("is_active", v)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Redes sociais</Label>
            <div className="space-y-1.5">
              <div className="relative">
                <Instagram className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" value={values.socials.instagram ?? ""} onChange={(e) => setSocial("instagram", e.target.value)} placeholder="@usuario" />
              </div>
              <div className="relative">
                <Music2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" value={values.socials.tiktok ?? ""} onChange={(e) => setSocial("tiktok", e.target.value)} placeholder="@tiktok" />
              </div>
              <div className="relative">
                <Youtube className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" value={values.socials.youtube ?? ""} onChange={(e) => setSocial("youtube", e.target.value)} placeholder="youtube.com/@canal" />
              </div>
              <div className="relative">
                <Linkedin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" value={values.socials.linkedin ?? ""} onChange={(e) => setSocial("linkedin", e.target.value)} placeholder="linkedin.com/company/…" />
              </div>
            </div>
          </div>

          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea
              value={values.socials.notes ?? ""}
              onChange={(e) => setSocial("notes", e.target.value)}
              placeholder="Contexto extra, restrições, links úteis…"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button
            onClick={submit}
            disabled={submitting}
            className="bg-indigo-600 text-white hover:bg-indigo-500 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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