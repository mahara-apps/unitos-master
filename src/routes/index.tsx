import { createFileRoute, Link } from "@tanstack/react-router";

// No head() here: the home route inherits title/description/og/twitter from
// __root.tsx, and ships no og:image so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Bem-vindo
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Acesse sua conta para continuar.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Entrar
        </Link>
      </div>
    </div>
  );
}
