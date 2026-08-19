import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, FileText, LayoutGrid } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { UnitosLogo } from "@/components/brand/unitos-logo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { next?: string } => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),

  head: () => ({
    meta: [
      { title: "Entrar — Acesse sua conta" },
      {
        name: "description",
        content:
          "Faça login com o email e a senha enviados no seu convite para acessar o painel.",
      },
      { property: "og:title", content: "Entrar — Acesse sua conta" },
      {
        property: "og:description",
        content: "Página de acesso segura à sua conta.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

const FEATURES = [
  {
    icon: CheckCircle2,
    title: "Aprovações",
    description: "Acompanhe e aprove conteúdos com facilidade.",
  },
  {
    icon: CalendarDays,
    title: "Calendário",
    description: "Tenha visibilidade de publicações e compromissos.",
  },
  {
    icon: FileText,
    title: "Briefings",
    description: "Centralize solicitações e informações da equipe.",
  },
  {
    icon: LayoutGrid,
    title: "Gestão",
    description: "Organize arquivos, marca e operação em um só lugar.",
  },
];

function LoginPage() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (data.session?.user) {
        const { data: userData, error } = await supabase.auth.getUser();
        if (cancelled) return;
        if (error || !userData.user) {
          await clearStoredSupabaseSession();
          setChecked(true);
          return;
        }
        const target = sanitizeNext(next) ?? "/dashboard";
        navigate({ to: target, replace: true });
      } else {
        setChecked(true);
      }
    }).catch(async () => {
      if (cancelled) return;
      await clearStoredSupabaseSession();
      setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [next, navigate]);

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return (
    <main className="grid min-h-screen w-full lg:grid-cols-[45%_55%] xl:grid-cols-2">
      <BrandPanel />
      <section className="flex min-w-0 items-center justify-center bg-background px-6 py-14 sm:px-10 lg:px-16">
        <LoginForm />
      </section>
    </main>
  );
}

function BrandPanel() {
  return (
    <aside className="relative isolate hidden min-w-0 overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-14">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_15%_0%,color-mix(in_oklab,var(--color-primary)_45%,transparent)_0%,transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.12] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:56px_56px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-24 -z-10 h-96 w-96 rounded-full bg-primary/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-[-10%] -z-10 h-80 w-80 rotate-12 rounded-[38%] border border-current/10 bg-current/[0.04]"
      />

      <UnitosLogo variant="full" eager className="h-11 w-auto max-w-[190px] self-start" />

      <div className="max-w-md">
        <p className="text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
          Tudo o que sua equipe precisa para organizar, aprovar e acompanhar sua operação.
        </p>

        <ul className="mt-12 grid gap-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <li
              key={title}
              className="flex items-start gap-4 rounded-2xl border border-current/10 bg-current/[0.04] p-4 backdrop-blur-sm transition-colors hover:bg-current/[0.07]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-0.5 text-sm opacity-70">{description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs opacity-60">Plataforma de operação e aprovação de conteúdo.</p>
    </aside>
  );
}

function sanitizeNext(next: string | undefined): string | null {
  if (!next) return null;
  try {
    const decoded = decodeURIComponent(next);
    if (
      decoded.startsWith("/") &&
      !decoded.startsWith("//") &&
      !/^\/(auth|login)(\/|\?|#|$)/.test(decoded)
    ) return decoded;
  } catch {}
  return null;
}

async function clearStoredSupabaseSession() {
  if (typeof window !== "undefined") {
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i);
      if (key === "supabase.auth.token" || key?.startsWith("sb-")) {
        window.localStorage.removeItem(key);
      }
    }
  }
  void supabase.auth.signOut().catch(() => null);
}
