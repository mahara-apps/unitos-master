import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, Clock, Globe, KeyRound, Loader2, MessageCircle, Save, ShieldCheck, User } from "lucide-react";

import { getMyProfile, updateMyProfile, changeMyPassword } from "@/lib/profile.functions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePageHeader } from "@/hooks/use-page-header";
import {
  SettingsBlock,
  SettingsField,
  SettingsFieldGrid,
  SettingsMetaItem,
  SettingsMetaList,
  SettingsRow,
} from "@/components/settings/settings-form-ui";

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

function toForm(data: {
  full_name?: string | null;
  phone?: string | null;
  job_title?: string | null;
  bio?: string | null;
  timezone?: string | null;
  locale?: string | null;
  avatar_url?: string | null;
  whatsapp?: string | null;
}): FormState {
  return {
    full_name: data.full_name ?? "",
    phone: data.phone ?? "",
    job_title: data.job_title ?? "",
    bio: data.bio ?? "",
    timezone: data.timezone ?? "America/Sao_Paulo",
    locale: data.locale ?? "pt-BR",
    avatar_url: data.avatar_url ?? "",
    whatsapp: data.whatsapp ?? "",
  };
}

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
    if (data && !form) setForm(toForm(data));
  }, [data, form]);

  const initials = useMemo(() => {
    const n = form?.full_name ?? data?.full_name ?? data?.email ?? "?";
    return n.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "U";
  }, [form?.full_name, data?.full_name, data?.email]);

  const baseline = useMemo(() => (data ? toForm(data) : null), [data]);
  const dirty = useMemo(() => {
    if (!form || !baseline) return false;
    return (Object.keys(baseline) as Array<keyof FormState>).some((k) => form[k] !== baseline[k]);
  }, [form, baseline]);

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
      actions:
        form && dirty ? (
          <Button
            size="sm"
            onClick={() => form && saveMutation.mutate(form)}
            disabled={saveMutation.isPending || !form.full_name.trim()}
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar alterações
          </Button>
        ) : undefined,
    },
    [form, dirty, saveMutation.isPending],
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
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
        <Skeleton className="h-9 w-56 rounded-lg" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  const roleLabel = (data?.role ?? "member").toString();
  const localeLabel = LOCALES.find((l) => l.value === form.locale)?.label ?? form.locale;
  const tzShort = form.timezone.split("/")[1]?.replace("_", " ") ?? form.timezone;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Identidade da conta — compacta, sem card */}
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
        <Avatar className="h-14 w-14 shrink-0 rounded-2xl sm:h-16 sm:w-16">
          {form.avatar_url ? <AvatarImage src={form.avatar_url} alt={form.full_name} /> : null}
          <AvatarFallback className="rounded-2xl bg-muted text-base font-semibold text-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
              {form.full_name || "Sem nome"}
            </h1>
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {roleLabel}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{data?.email ?? "—"}</p>
        </div>
      </header>

      <div className="mt-4 border-t border-border/50 pt-4">
        <SettingsMetaList>
          <SettingsMetaItem label="Função" icon={<User className="h-3.5 w-3.5" />} value={<span className="capitalize">{roleLabel}</span>} />
          <SettingsMetaItem label="Fuso" icon={<Clock className="h-3.5 w-3.5" />} value={tzShort} />
          <SettingsMetaItem label="Idioma" icon={<Globe className="h-3.5 w-3.5" />} value={localeLabel} />
          <SettingsMetaItem
            label="WhatsApp"
            icon={<MessageCircle className="h-3.5 w-3.5" />}
            value={form.whatsapp || "não informado"}
          />
          {form.job_title ? <SettingsMetaItem label="Cargo" value={form.job_title} /> : null}
          {form.phone ? <SettingsMetaItem label="Telefone" value={form.phone} /> : null}
        </SettingsMetaList>
      </div>

      <Tabs defaultValue="personal" className="mt-7 w-full">
        <TabsList className="w-full max-w-sm">
          <TabsTrigger value="personal" className="flex-1">
            Pessoal
          </TabsTrigger>
          <TabsTrigger value="security" className="flex-1">
            Segurança
          </TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="mt-6">
          <SettingsBlock
            title="Identificação"
            description="Como seu nome aparece para o time em pautas, tarefas e comentários."
          >
            <SettingsFieldGrid>
              <SettingsField label="Nome completo" htmlFor="full_name" full>
                <Input
                  id="full_name"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  maxLength={120}
                  placeholder="Seu nome"
                />
              </SettingsField>
              <SettingsField label="Cargo" htmlFor="job_title">
                <Input
                  id="job_title"
                  value={form.job_title}
                  onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                  maxLength={120}
                  placeholder="Ex: Estrategista de conteúdo"
                />
              </SettingsField>
              <SettingsField label="URL do avatar" htmlFor="avatar_url">
                <Input
                  id="avatar_url"
                  value={form.avatar_url}
                  onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
                  placeholder="https://…/foto.png"
                  maxLength={500}
                />
              </SettingsField>
              <SettingsField label="Bio" htmlFor="bio" full>
                <Textarea
                  id="bio"
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  rows={3}
                  maxLength={600}
                  placeholder="Uma breve descrição sobre você"
                />
              </SettingsField>
            </SettingsFieldGrid>
          </SettingsBlock>

          <SettingsBlock
            title="Contato"
            description="Usado pelo time e pelos avisos enviados a você."
          >
            <SettingsFieldGrid>
              <SettingsField label="Telefone" htmlFor="phone">
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  maxLength={40}
                  placeholder="+55 11 90000-0000"
                />
              </SettingsField>
              <SettingsField
                label="WhatsApp"
                htmlFor="whatsapp"
                hint="Destino usado pelas notificações por WhatsApp."
              >
                <Input
                  id="whatsapp"
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                  maxLength={40}
                  placeholder="+55 11 90000-0000"
                />
              </SettingsField>
            </SettingsFieldGrid>
          </SettingsBlock>

          <SettingsBlock
            title="Região e formato"
            description="Definem datas, horários e o idioma da interface."
          >
            <SettingsFieldGrid>
              <SettingsField label="Fuso horário" htmlFor="timezone">
                <Select
                  value={form.timezone}
                  onValueChange={(v) => setForm({ ...form, timezone: v })}
                >
                  <SelectTrigger id="timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingsField>
              <SettingsField label="Idioma" htmlFor="locale">
                <Select value={form.locale} onValueChange={(v) => setForm({ ...form, locale: v })}>
                  <SelectTrigger id="locale">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALES.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingsField>
            </SettingsFieldGrid>
          </SettingsBlock>

          <SettingsBlock
            title="Notificações"
            description="Canais e tipos de aviso ficam em um único lugar."
          >
            <SettingsRow
              icon={<Bell className="h-4 w-4" />}
              title="Preferências de notificação"
              description="E-mail, push e WhatsApp, além dos tipos de aviso que você recebe."
              action={
                <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
                  <Link to="/settings/notifications">Abrir Notificações</Link>
                </Button>
              }
            />
          </SettingsBlock>
        </TabsContent>

        <TabsContent value="security" className="mt-6">
          <SettingsBlock
            title="Senha"
            description="Use no mínimo 8 caracteres. Você seguirá conectado após a alteração."
          >
            <SettingsFieldGrid>
              <SettingsField label="Nova senha" htmlFor="pw_new">
                <Input
                  id="pw_new"
                  type="password"
                  value={pw.next}
                  onChange={(e) => setPw({ ...pw, next: e.target.value })}
                  autoComplete="new-password"
                  minLength={8}
                  placeholder="Mínimo 8 caracteres"
                />
              </SettingsField>
              <SettingsField label="Confirmar senha" htmlFor="pw_confirm">
                <Input
                  id="pw_confirm"
                  type="password"
                  value={pw.confirm}
                  onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                  autoComplete="new-password"
                  placeholder="Repita a nova senha"
                />
              </SettingsField>
              <div className="sm:col-span-2 sm:flex sm:justify-end">
                <Button
                  className="w-full sm:w-auto"
                  disabled={pwMutation.isPending || pw.next.length < 8 || pw.next !== pw.confirm}
                  onClick={() => {
                    if (pw.next !== pw.confirm) {
                      toast.error("As senhas não coincidem");
                      return;
                    }
                    pwMutation.mutate(pw.next);
                  }}
                >
                  {pwMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="mr-2 h-4 w-4" />
                  )}
                  Atualizar senha
                </Button>
              </div>
            </SettingsFieldGrid>
          </SettingsBlock>

          <SettingsBlock
            title="Sessão"
            description="Informações de acesso vinculadas à sua conta."
          >
            <SettingsRow
              icon={<ShieldCheck className="h-4 w-4" />}
              title={data?.email ?? "—"}
              description="E-mail de login. Para alterá-lo, fale com quem administra o workspace."
            />
          </SettingsBlock>
        </TabsContent>
      </Tabs>
    </div>
  );
}
