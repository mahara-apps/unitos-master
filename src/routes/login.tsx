import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LoginForm } from "@/components/login-form";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Entrar — Acesse sua conta" },
      {
        name: "description",
        content:
          "Faça login com seu nome, email e senha para acessar o painel.",
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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,var(--color-muted)_0%,transparent_60%)]"
      />
      <LoginForm />
    </main>
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