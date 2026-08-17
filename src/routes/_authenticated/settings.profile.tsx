import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, Clock, Globe, KeyRound, Loader2, MessageCircle, Save, User } from "lucide-react";

import { getMyProfile, updateMyProfile, changeMyPassword } from "@/lib/profile.functions";
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
import { PageKpi, PageKpiGrid } from "@/components/ui/page-kpi";

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
};

function ProfilePage() {
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const saveProfile = useServerFn(updateMyProfile);
  const changePassword = useServerFn(changeMyPassword);

  const { data, isLoading } = useQuery({
    queryKey: ["me", "profile"],
    queryFn: () => fetchProfile(),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [pw, setPw] = useState({ next: "", confirm: "" });

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
      });
    }
  }, [data, form]);

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
      title: "Perfil",
      subtitle: "Suas informações pessoais e preferências de conta",
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
  const localeLabel = LOCALES.find((l) => l.value === form.locale)?.label ?? form.locale;

  return (
    <div className="w-full space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <PageKpiGrid>
        <PageKpi label="Função" value={<span className="capitalize">{roleLabel}</span>} icon={<User className="h-4 w-4" />} />
        <PageKpi
          label="Fuso horário"
          value={form.timezone.split("/")[1]?.replace("_", " ") ?? form.timezone}
          description={form.timezone}
          icon={<Clock className="h-4 w-4" />}
        />
        <PageKpi label="Idioma" value={form.locale} description={localeLabel} icon={<Globe className="h-4 w-4" />} />
        <PageKpi
          label="WhatsApp"
          value={form.whatsapp ? "Cadastrado" : "Não informado"}
          status={form.whatsapp ? "success" : "neutral"}
          description="Destino usado pelas notificações"
          icon={<MessageCircle className="h-4 w-4" />}
        />
      </PageKpiGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="h-fit lg:col-span-1">
          <CardHeader className="items-center pb-3 text-center">
            <Avatar className="mb-2 h-20 w-20 rounded-2xl">
              {form.avatar_url ? <AvatarImage src={form.avatar_url} alt={form.full_name} /> : null}
              <AvatarFallback className="rounded-2xl bg-primary text-xl font-semibold text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <CardTitle className="text-base">{form.full_name || "Sem nome"}</CardTitle>
            <CardDescription className="text-xs">{data?.email ?? "—"}</CardDescription>
            <Badge variant="secondary" className="mt-1 text-[10px] uppercase">{roleLabel}</Badge>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            {form.job_title ? (
              <div className="flex justify-between gap-2">
                <span>Cargo</span><span className="truncate text-foreground">{form.job_title}</span>
              </div>
            ) : null}
            {form.phone ? (
              <div className="flex justify-between gap-2">
                <span>Telefone</span><span className="truncate text-foreground">{form.phone}</span>
              </div>
            ) : null}
            {form.whatsapp ? (
              <div className="flex justify-between gap-2">
                <span>WhatsApp</span><span className="truncate text-foreground">{form.whatsapp}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <Tabs defaultValue="personal" className="w-full">
            <TabsList>
              <TabsTrigger value="personal">Pessoal</TabsTrigger>
              <TabsTrigger value="security">Segurança</TabsTrigger>
            </TabsList>

            <TabsContent value="personal" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Informações pessoais</CardTitle>
                  <CardDescription>Atualize seus dados de contato e preferências de exibição.</CardDescription>
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
                      <MessageCircle className="h-3.5 w-3.5 text-health-good" />
                      WhatsApp (contato)
                    </Label>
                    <Input
                      id="whatsapp"
                      value={form.whatsapp}
                      onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                      maxLength={40}
                      placeholder="+55 11 90000-0000"
                    />
                  </div>
                  <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-muted/30 p-3 sm:col-span-2">
                    <div className="space-y-0.5">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <Bell className="h-3.5 w-3.5 text-primary" />
                        Preferências de notificação
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Canais (e-mail, push, WhatsApp) e tipos de aviso ficam em um único lugar.
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/settings/notifications">Abrir Notificações</Link>
                    </Button>
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
                    <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
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
                    <Select value={form.locale} onValueChange={(v) => setForm({ ...form, locale: v })}>
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
                  <div className="flex justify-end sm:col-span-2">
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
