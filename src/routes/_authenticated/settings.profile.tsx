import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Save, KeyRound, Building2, MapPin, MessageCircle, User, Bell, Globe, Clock } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePageHeader } from "@/hooks/use-page-header";
import { SettingsStatCard } from "@/components/settings/settings-stat-card";

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

  usePageHeader(
    {
      title: "Meu Perfil",
      subtitle: "Suas informações pessoais e preferências",
      actions: form ? (
        <Button
          size="sm"
          onClick={() => form && saveMutation.mutate(form)}
          disabled={saveMutation.isPending || !form?.full_name?.trim()}
        >
          {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar alterações
        </Button>
      ) : undefined,
    },
    [form, saveMutation.isPending],
  );

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
  const notifCount = [
    Boolean(data?.notification_prefs?.email),
    Boolean(data?.notification_prefs?.push),
    Boolean((data as { notify_whatsapp?: boolean } | undefined)?.notify_whatsapp),
  ].filter(Boolean).length;
  const localeLabel = LOCALES.find((l) => l.value === form.locale)?.label ?? form.locale;

  return (
    <div className="w-full space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SettingsStatCard
          label="Função"
          value={<span className="capitalize">{roleLabel}</span>}
          icon={<User className="h-4 w-4" />}
          tone="violet"
        />
        <SettingsStatCard label="Fuso" value={form.timezone.split("/")[1]?.replace("_", " ") ?? form.timezone} hint={form.timezone} icon={<Clock className="h-4 w-4" />} tone="sky" />
        <SettingsStatCard label="Idioma" value={form.locale} hint={localeLabel} icon={<Globe className="h-4 w-4" />} tone="emerald" />
        <SettingsStatCard
          label="Notificações"
          value={`${notifCount}/3`}
          hint="Email · Push · WhatsApp"
          icon={<Bell className="h-4 w-4" />}
          tone="amber"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1 h-fit">
          <CardHeader className="items-center text-center pb-3">
            <Avatar className="h-20 w-20 rounded-2xl mb-2">
              {form.avatar_url ? <AvatarImage src={form.avatar_url} alt={form.full_name} /> : null}
              <AvatarFallback className="rounded-2xl bg-indigo-600 text-xl font-semibold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <CardTitle className="text-base">{form.full_name || "Sem nome"}</CardTitle>
            <CardDescription className="text-xs">{data?.email ?? "—"}</CardDescription>
            <Badge variant="secondary" className="text-[10px] uppercase mt-1">{roleLabel}</Badge>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            {form.job_title ? (
              <div className="flex justify-between gap-2">
                <span>Cargo</span><span className="text-foreground truncate">{form.job_title}</span>
              </div>
            ) : null}
            {form.phone ? (
              <div className="flex justify-between gap-2">
                <span>Telefone</span><span className="text-foreground truncate">{form.phone}</span>
              </div>
            ) : null}
            {form.whatsapp ? (
              <div className="flex justify-between gap-2">
                <span>WhatsApp</span><span className="text-foreground truncate">{form.whatsapp}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
        <Tabs defaultValue="personal" className="w-full">
          <TabsList>
            <TabsTrigger value="personal">Pessoal</TabsTrigger>
            {canEditCompany && brandId ? <TabsTrigger value="company">Empresa</TabsTrigger> : null}
            {canEditCompany && brandId ? <TabsTrigger value="address">Endereço</TabsTrigger> : null}
            <TabsTrigger value="security">Segurança</TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="mt-4">
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
            <Label htmlFor="whatsapp" className="flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
              WhatsApp para notificações
            </Label>
            <Input
              id="whatsapp"
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              maxLength={40}
              placeholder="+55 11 90000-0000"
            />
          </div>
          <div className="sm:col-span-2 flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Receber notificações por WhatsApp</p>
              <p className="text-xs text-muted-foreground">Publicações aprovadas, ajustes solicitados e menções urgentes.</p>
            </div>
            <Switch
              checked={form.notify_whatsapp}
              onCheckedChange={(v) => setForm({ ...form, notify_whatsapp: v })}
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
        </CardContent>
      </Card>
          </TabsContent>

      {canEditCompany && brandId ? (
        <TabsContent value="company" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-indigo-500" />
              Dados da empresa
            </CardTitle>
            <CardDescription>Documentos e razão social da marca ativa.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {!company ? (
              <div className="sm:col-span-2 flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="cpf">CPF</Label>
                  <Input id="cpf" value={company.cpf} onChange={(e) => setCompany({ ...company, cpf: e.target.value })} maxLength={20} placeholder="000.000.000-00" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cnpj">CNPJ</Label>
                  <Input id="cnpj" value={company.cnpj} onChange={(e) => setCompany({ ...company, cnpj: e.target.value })} maxLength={20} placeholder="00.000.000/0000-00" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nome_fantasia">Nome fantasia</Label>
                  <Input id="nome_fantasia" value={company.nome_fantasia} onChange={(e) => setCompany({ ...company, nome_fantasia: e.target.value })} maxLength={160} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="razao_social">Razão social</Label>
                  <Input id="razao_social" value={company.razao_social} onChange={(e) => setCompany({ ...company, razao_social: e.target.value })} maxLength={200} />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <Button
                    onClick={() => companyMutation.mutate(company)}
                    disabled={companyMutation.isPending}
                  >
                    {companyMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar dados da empresa
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        </TabsContent>
      ) : null}

      {canEditCompany && brandId && company ? (
        <TabsContent value="address" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-rose-500" />
              Endereço
            </CardTitle>
            <CardDescription>Endereço fiscal e de correspondência da empresa.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-6">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cep">CEP</Label>
              <Input id="cep" value={company.cep} onChange={(e) => setCompany({ ...company, cep: e.target.value })} maxLength={12} placeholder="00000-000" />
            </div>
            <div className="space-y-1.5 sm:col-span-4">
              <Label htmlFor="rua">Rua</Label>
              <Input id="rua" value={company.rua} onChange={(e) => setCompany({ ...company, rua: e.target.value })} maxLength={200} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="numero">Número</Label>
              <Input id="numero" value={company.numero} onChange={(e) => setCompany({ ...company, numero: e.target.value })} maxLength={20} />
            </div>
            <div className="space-y-1.5 sm:col-span-4">
              <Label htmlFor="complemento">Complemento</Label>
              <Input id="complemento" value={company.complemento} onChange={(e) => setCompany({ ...company, complemento: e.target.value })} maxLength={120} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="bairro">Bairro</Label>
              <Input id="bairro" value={company.bairro} onChange={(e) => setCompany({ ...company, bairro: e.target.value })} maxLength={120} />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="cidade">Cidade</Label>
              <Input id="cidade" value={company.cidade} onChange={(e) => setCompany({ ...company, cidade: e.target.value })} maxLength={120} />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="estado">UF</Label>
              <Select value={company.estado || undefined} onValueChange={(v) => setCompany({ ...company, estado: v })}>
                <SelectTrigger id="estado"><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>
                  {UFS.map((uf) => (<SelectItem key={uf} value={uf}>{uf}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-6 flex justify-end">
              <Button
                onClick={() => companyMutation.mutate(company)}
                disabled={companyMutation.isPending}
              >
                {companyMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar endereço
              </Button>
            </div>
          </CardContent>
        </Card>
        </TabsContent>
      ) : null}

      <TabsContent value="security" className="mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Segurança</CardTitle>
          <CardDescription>Altere sua senha de acesso ao Unitos.</CardDescription>
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
      </TabsContent>
        </Tabs>
        </div>
      </div>
    </div>
  );
}