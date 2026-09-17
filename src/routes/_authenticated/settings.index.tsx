import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bell,
  ChevronRight,
  History,
  KeyRound,
  ListChecks,
  Lock,
  Palette,
  ShieldCheck,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { useAccessRole } from "@/hooks/use-access-role";
import { usePageHeader } from "@/hooks/use-page-header";

export const Route = createFileRoute("/_authenticated/settings/")({
  head: () => ({
    meta: [
      { title: "Configurações | Unitos" },
      {
        name: "description",
        content: "Gerencie sua conta, equipe, permissões e preferências do workspace no Unitos.",
      },
      { property: "og:title", content: "Configurações | Unitos" },
      {
        property: "og:description",
        content: "Gerencie sua conta, equipe, permissões e preferências do workspace no Unitos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsHomePage,
});

type SettingsDestination = {
  to:
    | "/settings/profile"
    | "/settings/notifications"
    | "/settings/identity"
    | "/settings/team"
    | "/settings/permissions"
    | "/settings/work-statuses"
    | "/settings/access-log"
    | "/settings/logs";
  title: string;
  description: string;
  icon: LucideIcon;
};

const ACCOUNT_SETTINGS: SettingsDestination[] = [
  {
    to: "/settings/profile",
    title: "Perfil",
    description: "Atualize seus dados pessoais, foto, idioma e fuso horário.",
    icon: User,
  },
  {
    to: "/settings/notifications",
    title: "Notificações",
    description: "Escolha quais alertas deseja receber e por quais canais.",
    icon: Bell,
  },
];

const WORKSPACE_SETTINGS: SettingsDestination[] = [
  {
    to: "/settings/identity",
    title: "Dados da agência",
    description: "Gerencie dados cadastrais, endereço e identidade visual.",
    icon: Palette,
  },
  {
    to: "/settings/team",
    title: "Equipe e acesso",
    description: "Convide pessoas e organize os papéis da sua equipe.",
    icon: Users,
  },
  {
    to: "/settings/permissions",
    title: "Permissões",
    description: "Defina o nível de acesso de cada perfil aos módulos.",
    icon: ShieldCheck,
  },
  {
    to: "/settings/work-statuses",
    title: "Status de trabalho",
    description: "Personalize as etapas usadas para acompanhar o trabalho.",
    icon: ListChecks,
  },
  {
    to: "/settings/access-log",
    title: "Acessos",
    description: "Consulte os acessos e eventos de autenticação da equipe.",
    icon: KeyRound,
  },
  {
    to: "/settings/logs",
    title: "Auditoria",
    description: "Acompanhe o histórico das ações administrativas.",
    icon: History,
  },
];

function SettingsCard({ item }: { item: SettingsDestination }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card interactive className="flex min-h-36 h-full items-start gap-4 p-5 sm:p-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/55 text-muted-foreground transition-colors group-hover:text-foreground">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="text-base font-semibold leading-snug text-foreground">{item.title}</h3>
          <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
        </div>
        <ChevronRight
          className="mt-2 h-4 w-4 shrink-0 text-muted-foreground/65 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
          aria-hidden
        />
      </Card>
    </Link>
  );
}

function SettingsSection({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: SettingsDestination[];
}) {
  return (
    <section aria-labelledby={`settings-${title.toLowerCase().replaceAll(" ", "-")}`}>
      <div className="mb-4">
        <h2
          id={`settings-${title.toLowerCase().replaceAll(" ", "-")}`}
          className="text-lg font-semibold text-foreground"
        >
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <SettingsCard key={item.to} item={item} />
        ))}
      </div>
    </section>
  );
}

function SettingsHomePage() {
  const { role, isReady } = useAccessRole();
  const isAdmin = role === "admin";

  usePageHeader({ title: "Configurações" }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header className="mb-10 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Configurações</h1>
        <p className="mt-2 text-base leading-7 text-muted-foreground">
          Gerencie sua conta, sua equipe e as preferências do workspace.
        </p>
      </header>

      <div className="space-y-10">
        <SettingsSection
          title="Minha conta"
          description="Preferências pessoais vinculadas ao seu acesso."
          items={ACCOUNT_SETTINGS}
        />

        {!isReady ? (
          <section aria-label="Carregando configurações do workspace">
            <div className="mb-4 h-12 w-72 animate-pulse rounded-md bg-muted" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-36 animate-pulse rounded-xl border bg-muted/35" />
              ))}
            </div>
          </section>
        ) : isAdmin ? (
          <SettingsSection
            title="Workspace"
            description="Configurações compartilhadas da agência e da equipe."
            items={WORKSPACE_SETTINGS}
          />
        ) : (
          <div className="flex items-center gap-3 border-t pt-6 text-sm text-muted-foreground">
            <Lock className="h-4 w-4 shrink-0" aria-hidden />
            As configurações do workspace são administradas pelos responsáveis da agência.
          </div>
        )}
      </div>
    </div>
  );
}
