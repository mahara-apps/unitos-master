import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_portal/area/inicio")({
  head: () => ({
    meta: [
      { title: "Área do cliente | Portal" },
      { name: "description", content: "Acompanhe aprovações, calendário e arquivos da sua marca." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Área do cliente" },
      { property: "og:description", content: "Acompanhe aprovações, calendário e arquivos da sua marca." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PortalHome,
});

function PortalHome() {
  const { access } = Route.useRouteContext();
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Área do cliente</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sua conta está ativa. As abas de aprovações, calendário, arquivos, briefing e pauta chegam
        nas próximas etapas desta entrega.
      </p>
      <p className="mt-6 text-xs text-muted-foreground">
        {access.clientIds.length === 1
          ? "1 marca vinculada à sua conta."
          : `${access.clientIds.length} marcas vinculadas à sua conta.`}
      </p>
    </div>
  );
}
