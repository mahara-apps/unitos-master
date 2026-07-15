import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, Loader2, Mail, MessageCircle, Save, Smartphone } from "lucide-react";
import { getMyProfile, updateNotificationPrefs, type NotificationPrefs } from "@/lib/profile.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { usePageHeader } from "@/hooks/use-page-header";
import { SettingsStatCard } from "@/components/settings/settings-stat-card";

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  component: NotificationsPage,
});

const DEFAULT_PREFS: NotificationPrefs = {
  email: true,
  push: true,
  whatsapp_client_portal: false,
  comments: true,
  approvals: true,
  publications: true,
};

function NotificationsPage() {
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const savePrefs = useServerFn(updateNotificationPrefs);

  const { data, isLoading } = useQuery({
    queryKey: ["me", "profile"],
    queryFn: () => fetchProfile(),
  });

  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(false);

  useEffect(() => {
    if (!data) return;
    const p = (data as { notification_prefs?: Partial<NotificationPrefs> }).notification_prefs ?? {};
    setPrefs({ ...DEFAULT_PREFS, ...p });
    setNotifyWhatsapp(Boolean((data as { notify_whatsapp?: boolean }).notify_whatsapp));
  }, [data]);

  const mutation = useMutation({
    mutationFn: async () => savePrefs({ data: { prefs, notify_whatsapp: notifyWhatsapp } }),
    onSuccess: async () => {
      toast.success("Preferências salvas");
      await qc.invalidateQueries({ queryKey: ["me", "profile"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
  });

  usePageHeader(
    {
      title: "Notificações",
      subtitle: "Como e quando você quer ser avisado",
      actions: (
        <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar preferências
        </Button>
      ),
    },
    [mutation.isPending, prefs, notifyWhatsapp],
  );

  const channelsActive = useMemo(
    () =>
      [prefs.email, prefs.push, notifyWhatsapp, prefs.whatsapp_client_portal].filter(Boolean).length,
    [prefs.email, prefs.push, prefs.whatsapp_client_portal, notifyWhatsapp],
  );
  const typesActive = useMemo(
    () => [prefs.comments, prefs.approvals, prefs.publications].filter(Boolean).length,
    [prefs.comments, prefs.approvals, prefs.publications],
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const channelRow = (
    icon: React.ReactNode,
    title: string,
    subtitle: string,
    value: boolean,
    onChange: (v: boolean) => void,
  ) => (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div className="space-y-0.5">
          <p className="text-sm font-medium leading-none">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );

  return (
    <div className="w-full space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SettingsStatCard label="Canais ativos" value={`${channelsActive}/4`} icon={<Bell className="h-3.5 w-3.5" />} tone="violet" />
        <SettingsStatCard label="Tipos ativos" value={`${typesActive}/3`} icon={<Mail className="h-3.5 w-3.5" />} tone="sky" />
        <SettingsStatCard
          label="WhatsApp"
          value={notifyWhatsapp ? "Ativo" : "Inativo"}
          className={notifyWhatsapp ? "text-emerald-500" : "text-muted-foreground"}
          icon={<MessageCircle className="h-3.5 w-3.5" />}
          tone={notifyWhatsapp ? "emerald" : "neutral"}
        />
        <SettingsStatCard
          label="Email"
          value={prefs.email ? "Ativo" : "Inativo"}
          className={prefs.email ? "text-sky-500" : "text-muted-foreground"}
          icon={<Mail className="h-3.5 w-3.5" />}
          tone={prefs.email ? "sky" : "neutral"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Canais de Notificação</CardTitle>
          <CardDescription>Por onde você quer receber os alertas do NexusFlow.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {channelRow(
            <Mail className="h-4 w-4 text-sky-500" />,
            "Email",
            "Resumos diários e eventos importantes.",
            prefs.email,
            (v) => setPrefs({ ...prefs, email: v }),
          )}
          {channelRow(
            <Bell className="h-4 w-4 text-amber-500" />,
            "Push / no app",
            "Notificações em tempo real dentro da plataforma.",
            prefs.push,
            (v) => setPrefs({ ...prefs, push: v }),
          )}
          {channelRow(
            <MessageCircle className="h-4 w-4 text-emerald-500" />,
            "WhatsApp",
            "Publicações aprovadas, ajustes e menções urgentes.",
            notifyWhatsapp,
            setNotifyWhatsapp,
          )}
          {channelRow(
            <Smartphone className="h-4 w-4 text-emerald-600" />,
            "WhatsApp para clientes do portal",
            "Envia lembretes de aprovação aos clientes finais.",
            prefs.whatsapp_client_portal,
            (v) => setPrefs({ ...prefs, whatsapp_client_portal: v }),
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tipos de Notificação</CardTitle>
          <CardDescription>Categorias que disparam alertas por email e no app.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {channelRow(
            <MessageCircle className="h-4 w-4 text-violet-500" />,
            "Comentários",
            "Menções, respostas e novos comentários em tarefas e posts.",
            prefs.comments,
            (v) => setPrefs({ ...prefs, comments: v }),
          )}
          {channelRow(
            <Bell className="h-4 w-4 text-blue-500" />,
            "Aprovações",
            "Decisões do cliente e mudanças no fluxo de aprovação.",
            prefs.approvals,
            (v) => setPrefs({ ...prefs, approvals: v }),
          )}
          {channelRow(
            <Mail className="h-4 w-4 text-emerald-500" />,
            "Publicações",
            "Confirmações e falhas de publicação nos canais.",
            prefs.publications,
            (v) => setPrefs({ ...prefs, publications: v }),
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}