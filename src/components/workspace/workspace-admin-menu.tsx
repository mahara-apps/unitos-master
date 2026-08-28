import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { MoreHorizontal, Pencil, Settings, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { SidebarMenuAction } from "@/components/ui/sidebar";
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
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { deleteBrand, updateBrand } from "@/lib/workspace.functions";
import { useAccessRole } from "@/hooks/use-access-role";
import { useMyBrandsQuery, type MyBrand } from "@/hooks/use-my-brands";
import {
  isDeleteConfirmationValid,
  workspaceAdminActions,
} from "@/lib/workspace-admin";

const SWATCHES = ["#8b5cf6", "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#64748b"];

type Props = {
  brandId: string | null;
  /** Chamado após exclusão para selecionar outro workspace (ou nenhum). */
  onDeleted: (nextBrandId: string | null) => void;
};

/**
 * Menu contextual do WORKSPACE selecionado (identidade da instalação).
 *
 * Só exibe ações que o papel realmente possui — a autoridade final é sempre do
 * servidor (`updateBrand` / `deleteBrand` + RLS de `brands`).
 */
export function WorkspaceAdminMenu({ brandId, onDeleted }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { authorityRole, brandRole } = useAccessRole();
  const brandsQ = useMyBrandsQuery();
  const brands: MyBrand[] = brandsQ.data ?? [];
  const active = brands.find((b) => b.id === brandId) ?? null;

  const actions = workspaceAdminActions(authorityRole, brandRole);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);
  const [confirmName, setConfirmName] = useState("");

  useEffect(() => {
    if (!editOpen || !active) return;
    setName(active.name);
    setColor(active.color ?? SWATCHES[0]);
  }, [editOpen, active]);

  const update = useServerFn(updateBrand);
  const remove = useServerFn(deleteBrand);

  const updateMut = useMutation({
    mutationFn: () => update({ data: { brandId: brandId!, patch: { name: name.trim(), color } } }),
    onSuccess: (brand) => {
      // Atualização imediata do seletor/header/sidebar: escrevemos no cache
      // canônico (`["brands"]`) em vez de esperar um refetch, e o workspace/
      // cliente ativos não são tocados.
      qc.setQueryData<MyBrand[]>(["brands"], (prev) =>
        (prev ?? []).map((b) =>
          b.id === brand.id ? { ...b, name: brand.name, color: brand.color, slug: brand.slug } : b,
        ),
      );
      void qc.invalidateQueries({ queryKey: ["brands"], refetchType: "none" });
      toast.success("Workspace atualizado");
      setEditOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => remove({ data: { brandId: brandId!, confirmName } }),
    onSuccess: (res) => {
      const remaining = brands.filter((b) => b.id !== res.id);
      qc.setQueryData<MyBrand[]>(["brands"], remaining);
      setDeleteOpen(false);
      setConfirmName("");
      toast.success(`Workspace "${res.name}" excluído`);
      onDeleted(remaining[0]?.id ?? null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!brandId || !actions.hasAny) return null;
  const confirmOk = isDeleteConfirmationValid(confirmName, active?.name);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction
            showOnHover
            aria-label="Ações do workspace"
            title="Ações do workspace"
          >
            <MoreHorizontal className="h-4 w-4" />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="right" className="w-56">
          <DropdownMenuLabel className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">
            {active?.name ?? "Workspace"}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {actions.canEdit && (
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> Editar workspace
            </DropdownMenuItem>
          )}
          {actions.canConfigure && (
            <DropdownMenuItem onSelect={() => void navigate({ to: "/settings/identity" })}>
              <Settings className="mr-2 h-3.5 w-3.5" /> Configurações
            </DropdownMenuItem>
          )}
          {actions.canManageMembers && (
            <DropdownMenuItem onSelect={() => void navigate({ to: "/settings/team" })}>
              <Users className="mr-2 h-3.5 w-3.5" /> Gerenciar membros
            </DropdownMenuItem>
          )}
          {actions.canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => {
                  setConfirmName("");
                  setDeleteOpen(true);
                }}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir workspace
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar workspace</DialogTitle>
            <DialogDescription>
              Identidade da instalação. Clientes, projetos e integrações não são afetados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ws-name">Nome</Label>
              <Input
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Minha agência"
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Cor ${c}`}
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                    className={`h-7 w-7 rounded-md border transition ${
                      color === c ? "border-foreground scale-110" : "border-border/60"
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => updateMut.mutate()}
              disabled={name.trim().length < 2 || updateMut.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir workspace</DialogTitle>
            <DialogDescription>Esta ação é permanente e não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertTitle>Impacto da exclusão</AlertTitle>
            <AlertDescription>
              Todos os clientes, briefings, pautas, projetos, tarefas, publicações, conexões e
              membros deste workspace serão removidos junto com ele. Outras instalações/workspaces
              não são afetados.
            </AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Label htmlFor="ws-confirm">
              Digite <span className="font-semibold">{active?.name}</span> para confirmar
            </Label>
            <Input
              id="ws-confirm"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={active?.name ?? ""}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMut.mutate()}
              disabled={!confirmOk || deleteMut.isPending}
            >
              Excluir definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
