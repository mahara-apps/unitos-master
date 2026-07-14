import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listClients, listMyBrands, updateClient } from "@/lib/workspace.functions";
import { canEditBasicInfo, resolveAccessRole } from "@/lib/permissions";

export function BasicInfoTab({ brandId, clientId }: { brandId: string; clientId: string }) {
  const qc = useQueryClient();
  const listClientsFn = useServerFn(listClients);
  const listBrandsFn = useServerFn(listMyBrands);
  const update = useServerFn(updateClient);

  const clientsQ = useQuery({
    queryKey: ["clients", brandId],
    queryFn: () => listClientsFn({ data: { brandId } }),
    staleTime: 60_000,
  });
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn(), staleTime: 60_000 });

  const client = (clientsQ.data ?? []).find((c) => c.id === clientId);
  const brandRole = brandsQ.data?.find((b) => b.id === brandId)?.role ?? null;
  const accessRole = resolveAccessRole(brandRole);
  const canEdit = canEditBasicInfo(accessRole);

  const socials = (client?.socials && typeof client.socials === "object"
    ? (client.socials as Record<string, string | undefined>)
    : {}) ?? {};

  const [form, setForm] = useState({
    name: "",
    niche: "",
    contact_name: "",
    contact_email: "",
    phone: "",
    instagram: "",
    tiktok: "",
    linkedin: "",
    youtube: "",
  });

  useEffect(() => {
    if (!client) return;
    setForm({
      name: client.name ?? "",
      niche: client.niche ?? "",
      contact_name: client.contact_name ?? "",
      contact_email: client.contact_email ?? "",
      phone: socials.phone ?? "",
      instagram: socials.instagram ?? "",
      tiktok: socials.tiktok ?? "",
      linkedin: socials.linkedin ?? "",
      youtube: socials.youtube ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id, client?.updated_at]);

  const mut = useMutation({
    mutationFn: async () => {
      const nextSocials = {
        ...socials,
        phone: form.phone.trim() || undefined,
        instagram: form.instagram.trim() || undefined,
        tiktok: form.tiktok.trim() || undefined,
        linkedin: form.linkedin.trim() || undefined,
        youtube: form.youtube.trim() || undefined,
      };
      return update({
        data: {
          brandId,
          clientId,
          patch: {
            name: form.name.trim() || undefined,
            niche: form.niche.trim() || null,
            contact_name: form.contact_name.trim() || null,
            contact_email: form.contact_email.trim() || null,
            socials: nextSocials,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Profile updated successfully");
      qc.invalidateQueries({ queryKey: ["clients", brandId] });
      qc.invalidateQueries({ queryKey: ["customer-dashboard"] });
      qc.invalidateQueries({ queryKey: ["customer-core", brandId, clientId] });
    },
    onError: (e) => toast.error((e as Error).message ?? "Falha ao salvar perfil"),
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const disabled = !canEdit || mut.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Dados básicos</h2>
          <p className="text-sm text-muted-foreground">
            Informações de contato e redes desta conta. Refletem no dashboard e no Brand Hub.
          </p>
        </div>
        {canEdit ? (
          <Badge tone="emerald">
            Edição liberada
          </Badge>
        ) : (
          <Badge tone="amber" className="gap-1">
            <Lock className="h-3 w-3" /> Somente leitura
          </Badge>
        )}
      </div>

      {!canEdit ? (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
          Apenas administradores da agência (owner/manager) podem editar estes campos.
          Seu papel atual: <strong>{brandRole ?? "—"}</strong> ({accessRole}).
        </div>
      ) : null}

      <div className="grid gap-4 rounded-xl border border-border bg-card p-6 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Nome da conta</Label>
          <Input placeholder="Ex.: Café Aurora" value={form.name} onChange={set("name")} disabled={disabled} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Subtítulo / Nicho</Label>
          <Input placeholder="Ex.: Cafeteria especial · Curitiba" value={form.niche} onChange={set("niche")} disabled={disabled} />
        </div>
        <div className="space-y-1.5 sm:col-span-1">
          <Label className="text-xs">Contato</Label>
          <Input placeholder="Nome do contato" value={form.contact_name} onChange={set("contact_name")} disabled={disabled} />
        </div>
        <div className="space-y-1.5 sm:col-span-1">
          <Label className="text-xs">E-mail corporativo</Label>
          <Input type="email" placeholder="contato@empresa.com" value={form.contact_email} onChange={set("contact_email")} disabled={disabled} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Telefone</Label>
          <Input placeholder="+55 11 90000-0000" value={form.phone} onChange={set("phone")} disabled={disabled} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Instagram</Label>
          <Input placeholder="@handle" value={form.instagram} onChange={set("instagram")} disabled={disabled} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">TikTok</Label>
          <Input placeholder="@handle" value={form.tiktok} onChange={set("tiktok")} disabled={disabled} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">LinkedIn</Label>
          <Input placeholder="empresa" value={form.linkedin} onChange={set("linkedin")} disabled={disabled} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">YouTube</Label>
          <Input placeholder="@canal" value={form.youtube} onChange={set("youtube")} disabled={disabled} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => mut.mutate()} disabled={disabled}>
          {mut.isPending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}