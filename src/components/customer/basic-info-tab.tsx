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

/**
 * Aba "Cadastro" — fonte única do registro do cliente
 * (nome, nicho, site, endereço, contato e redes sociais).
 * Os campos que aparecem em Identidade do Cérebro (Nome) leem daqui.
 */
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
  const clientAny = (client ?? {}) as Record<string, unknown>;

  const [form, setForm] = useState({
    name: "",
    legal_name: "",
    cnpj: "",
    description: "",
    niche: "",
    website: "",
    address: "",
    contact_name: "",
    contact_email: "",
    phone: "",
    instagram: "",
    tiktok: "",
    linkedin: "",
    youtube: "",
    facebook: "",
  });

  useEffect(() => {
    if (!client) return;
    setForm({
      name: client.name ?? "",
      legal_name: (clientAny.legal_name as string) ?? "",
      cnpj: (clientAny.cnpj as string) ?? "",
      description: (clientAny.description as string) ?? "",
      niche: client.niche ?? "",
      website: (clientAny.website as string) ?? "",
      address: (clientAny.address as string) ?? "",
      contact_name: client.contact_name ?? "",
      contact_email: client.contact_email ?? "",
      phone: (client.contact_phone as string | null) ?? socials.phone ?? "",
      instagram: socials.instagram ?? "",
      tiktok: socials.tiktok ?? "",
      linkedin: socials.linkedin ?? "",
      youtube: socials.youtube ?? "",
      facebook: socials.facebook ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id, client?.updated_at]);

  const mut = useMutation({
    mutationFn: async () => {
      const nextSocials = {
        ...socials,
        phone: undefined, // canonicalizado em contact_phone
        instagram: form.instagram.trim() || undefined,
        tiktok: form.tiktok.trim() || undefined,
        linkedin: form.linkedin.trim() || undefined,
        youtube: form.youtube.trim() || undefined,
        facebook: form.facebook.trim() || undefined,
      };
      return update({
        data: {
          brandId,
          clientId,
          patch: {
            name: form.name.trim() || undefined,
            legal_name: form.legal_name.trim() || null,
            cnpj: form.cnpj.trim() || null,
            description: form.description.trim() || null,
            niche: form.niche.trim() || null,
            website: form.website.trim() || null,
            address: form.address.trim() || null,
            contact_name: form.contact_name.trim() || null,
            contact_email: form.contact_email.trim() || null,
            contact_phone: form.phone.trim() || null,
            socials: nextSocials,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Cadastro atualizado");
      qc.invalidateQueries({ queryKey: ["clients", brandId] });
      qc.invalidateQueries({ queryKey: ["customer-dashboard"] });
      qc.invalidateQueries({ queryKey: ["customer-core", brandId, clientId] });
      qc.invalidateQueries({ queryKey: ["brand-hub", brandId, clientId] });
    },
    onError: (e) => toast.error((e as Error).message ?? "Falha ao salvar cadastro"),
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const disabled = !canEdit || mut.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Cadastro</h2>
          <p className="text-sm text-muted-foreground">
            Fonte única do registro deste cliente. Nome, redes e contato usados em todo o sistema.
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

      <section className="space-y-4 rounded-xl border border-border bg-card p-6">
        <header>
          <h3 className="text-sm font-semibold">Identificação</h3>
          <p className="text-xs text-muted-foreground">Nome legal e posicionamento resumido.</p>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Nome da empresa</Label>
            <Input placeholder="Ex.: Café Aurora" value={form.name} onChange={set("name")} disabled={disabled} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Razão social</Label>
            <Input placeholder="Café Aurora Ltda." value={form.legal_name} onChange={set("legal_name")} disabled={disabled} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">CNPJ</Label>
            <Input placeholder="00.000.000/0000-00" value={form.cnpj} onChange={set("cnpj")} disabled={disabled} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Segmento / Nicho</Label>
            <Input placeholder="Ex.: Cafeteria especial · Curitiba" value={form.niche} onChange={set("niche")} disabled={disabled} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Descrição da empresa</Label>
            <Textarea
              placeholder="O que a empresa faz, em poucas linhas."
              value={form.description}
              onChange={set("description")}
              disabled={disabled}
              className="min-h-[80px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Site</Label>
            <Input placeholder="https://empresa.com" value={form.website} onChange={set("website")} disabled={disabled} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Endereço <span className="text-muted-foreground">(opcional)</span></Label>
            <Input placeholder="Rua, número, cidade" value={form.address} onChange={set("address")} disabled={disabled} />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-6">
        <header>
          <h3 className="text-sm font-semibold">Contato</h3>
          <p className="text-xs text-muted-foreground">Ponto focal para aprovações e comunicação.</p>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Contato responsável</Label>
            <Input placeholder="Nome do contato" value={form.contact_name} onChange={set("contact_name")} disabled={disabled} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">E-mail corporativo</Label>
            <Input type="email" placeholder="contato@empresa.com" value={form.contact_email} onChange={set("contact_email")} disabled={disabled} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Telefone</Label>
            <Input placeholder="+55 11 90000-0000" value={form.phone} onChange={set("phone")} disabled={disabled} />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-6">
        <header>
          <h3 className="text-sm font-semibold">Redes sociais</h3>
          <p className="text-xs text-muted-foreground">Handles ou URLs completas.</p>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
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
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Facebook</Label>
            <Input placeholder="facebook.com/empresa" value={form.facebook} onChange={set("facebook")} disabled={disabled} />
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={() => mut.mutate()} disabled={disabled}>
          {mut.isPending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}