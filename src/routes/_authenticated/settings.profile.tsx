import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Save, KeyRound, Building2, MapPin, MessageCircle } from "lucide-react";
import { getMyProfile, updateMyProfile, changeMyPassword } from "@/lib/profile.functions";
import { getBrandCompany, updateBrandCompany } from "@/lib/workspace.functions";
import { useActiveContext } from "@/hooks/use-active-context";
import { useAccessRole } from "@/hooks/use-access-role";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePageHeader } from "@/hooks/use-page-header";

export const Route = createFileRoute("/_authenticated/settings/profile")({
  component: ProfilePage,
});

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Fortaleza",
  "America/Recife",
  "America/Manaus",
  "America/Bahia",
  "America/Belem",
  "America/Cuiaba",
  "America/Rio_Branco",
  "America/Noronha",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/Paris",
  "UTC",
];

const LOCALES = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "en-US", label: "English (US)" },
  { value: "es-ES", label: "Español" },
];

type FormState = {
  full_name: string;
  phone: string;
  job_title: string;
  bio: string;
  timezone: string;
  locale: string;
  avatar_url: string;
  whatsapp: string;
  notify_whatsapp: boolean;
};

type CompanyState = {
  cpf: string;
  cnpj: string;
  nome_fantasia: string;
  razao_social: string;
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
};

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

function ProfilePage() {
  usePageHeader({ title: "Perfil", subtitle: "Suas informações pessoais e preferências" });

  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const saveProfile = useServerFn(updateMyProfile);
  const changePassword = useServerFn(changeMyPassword);
  const fetchCompany = useServerFn(getBrandCompany);
  const saveCompany = useServerFn(updateBrandCompany);
  const { brandId } = useActiveContext();
  const access = useAccessRole();
  const canEditCompany = access.role === "admin";

  const { data, isLoading } = useQuery({
    queryKey: ["me", "profile"],
    queryFn: () => fetchProfile(),
  });
  const companyQ = useQuery({
    queryKey: ["brand", "company", brandId],
    queryFn: () => fetchCompany({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [company, setCompany] = useState<CompanyState | null>(null);

  useEffect(() => {
    if (data && !form) {
      setForm({
        full_name: data.full_name ?? "",
        phone: data.phone ?? "",
        job_title: data.job_title ?? "",
        bio: data.bio ?? "",
        timezone: data.timezone ?? "America/Sao_Paulo",
        locale: data.locale ?? "pt-BR",
        avatar_url: data.avatar_url ?? "",
        whatsapp: (data as { whatsapp?: string | null }).whatsapp ?? "",
        notify_whatsapp: Boolean((data as { notify_whatsapp?: boolean }).notify_whatsapp),
      });
    }
  }, [data, form]);

  useEffect(() => {
    if (companyQ.data && !company) {
      const c = companyQ.data;
      setCompany({
        cpf: c.cpf ?? "",
        cnpj: c.cnpj ?? "",
        nome_fantasia: c.nome_fantasia ?? "",
        razao_social: c.razao_social ?? "",
        cep: c.cep ?? "",
        rua: c.rua ?? "",
        numero: c.numero ?? "",
        complemento: c.complemento ?? "",
        bairro: c.bairro ?? "",
        cidade: c.cidade ?? "",
        estado: c.estado ?? "",
      });
    }
  }, [companyQ.data, company]);

  const initials = useMemo(() => {
    const n = form?.full_name ?? data?.full_name ?? data?.email ?? "?";
    return n.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "U";
  }, [form?.full_name, data?.full_name, data?.email]);

  const saveMutation = useMutation({
    mutationFn: async (payload: FormState) =>
      saveProfile({
        data: {
          full_name: payload.full_name.trim(),
          phone: payload.phone.trim() || null,
          job_title: payload.job_title.trim() || null,
          bio: payload.bio.trim() || null,
          timezone: payload.timezone,
          locale: payload.locale,
          avatar_url: payload.avatar_url.trim() || null,
          whatsapp: payload.whatsapp.trim() || null,
          notify_whatsapp: payload.notify_whatsapp,
        },
      }),
    onSuccess: async () => {
      toast.success("Perfil atualizado");
      await qc.invalidateQueries({ queryKey: ["me", "profile"] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar perfil");
    },
  });

  const companyMutation = useMutation({
    mutationFn: async (payload: CompanyState) =>
      saveCompany({
        data: {
          brandId: brandId!,
          cpf: payload.cpf.trim() || null,
          cnpj: payload.cnpj.trim() || null,
          nome_fantasia: payload.nome_fantasia.trim() || null,
          razao_social: payload.razao_social.trim() || null,
          cep: payload.cep.trim() || null,
          rua: payload.rua.trim() || null,
          numero: payload.numero.trim() || null,
          complemento: payload.complemento.trim() || null,
          bairro: payload.bairro.trim() || null,
          cidade: payload.cidade.trim() || null,
          estado: payload.estado.trim().toUpperCase() || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Dados da empresa atualizados");
      await qc.invalidateQueries({ queryKey: ["brand", "company", brandId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao salvar dados da empresa"),
  });

  const pwMutation = useMutation({
    mutationFn: async (newPassword: string) => changePassword({ data: { newPassword } }),
    onSuccess: () => {
      toast.success("Senha atualizada");
      setPw({ next: "", confirm: "" });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao alterar senha"),
  });

  if (isLoading || !form) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const roleLabel = (data?.role ?? "member").toString();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 rounded-xl">
              {form.avatar_url ? <AvatarImage src={form.avatar_url} alt={form.full_name} /> : null}
              <AvatarFallback className="rounded-xl bg-indigo-600 text-lg font-semibold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <CardTitle className="text-lg">{form.full_name || "Sem nome"}</CardTitle>
              <CardDescription>{data?.email ?? "—"}</CardDescription>
              <Badge variant="secondary" className="text-[10px] uppercase">{roleLabel}</Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informações pessoais</CardTitle>
          <CardDescription>Atualize seus dados de contato e preferências.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="full_name">Nome completo</Label>
            <Input
              id="full_name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              maxLength={120}
              placeholder="Seu nome"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              maxLength={40}
              placeholder="+55 11 90000-0000"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="job_title">Cargo</Label>
            <Input
              id="job_title"
              value={form.job_title}
              onChange={(e) => setForm({ ...form, job_title: e.target.value })}
              maxLength={120}
              placeholder="Ex: Estrategista de conteúdo"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timezone">Fuso horário</Label>
            <Select
              value={form.timezone}
              onValueChange={(v) => setForm({ ...form, timezone: v })}
            >
              <SelectTrigger id="timezone"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="locale">Idioma</Label>
            <Select
              value={form.locale}
              onValueChange={(v) => setForm({ ...form, locale: v })}
            >
              <SelectTrigger id="locale"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LOCALES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="avatar_url">URL do avatar</Label>
            <Input
              id="avatar_url"
              value={form.avatar_url}
              onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
              placeholder="https://…/foto.png"
              maxLength={500}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              rows={3}
              maxLength={600}
              placeholder="Uma breve descrição sobre você"
            />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button
              onClick={() => saveMutation.mutate(form)}
              disabled={saveMutation.isPending || !form.full_name.trim()}
            >
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar alterações
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Segurança</CardTitle>
          <CardDescription>Altere sua senha de acesso ao NexusFlow.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pw_new">Nova senha</Label>
            <Input
              id="pw_new"
              type="password"
              value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })}
              autoComplete="new-password"
              minLength={8}
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw_confirm">Confirmar senha</Label>
            <Input
              id="pw_confirm"
              type="password"
              value={pw.confirm}
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              autoComplete="new-password"
              placeholder="Repita a nova senha"
            />
          </div>
          <Separator className="sm:col-span-2" />
          <div className="sm:col-span-2 flex justify-end">
            <Button
              variant="secondary"
              disabled={pwMutation.isPending || pw.next.length < 8 || pw.next !== pw.confirm}
              onClick={() => {
                if (pw.next !== pw.confirm) {
                  toast.error("As senhas não coincidem");
                  return;
                }
                pwMutation.mutate(pw.next);
              }}
            >
              {pwMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              Atualizar senha
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}