import { createFileRoute } from "@tanstack/react-router";
import { LoginForm } from "@/components/login-form";

export const Route = createFileRoute("/login")({
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