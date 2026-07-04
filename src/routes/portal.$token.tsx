import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { PostPreview } from "@/features/portal/post-preview";
import { Timeline } from "@/features/portal/timeline";
import { ActionBar } from "@/features/portal/action-bar";
import { MOCK_PORTAL_POST, MOCK_TIMELINE, type TimelineEvent } from "@/features/portal/mock-data";

export const Route = createFileRoute("/portal/$token")({
  head: () => ({
    meta: [
      { title: "Aprovação de conteúdo — NexusFlow" },
      {
        name: "description",
        content:
          "Revise, aprove ou solicite ajustes na próxima postagem da sua marca em segundos.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Aprovação de conteúdo — NexusFlow" },
      { property: "og:description", content: "Portal de aprovação de conteúdo para clientes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PortalPage,
});

type Status = "pending" | "approved" | "rejected" | "changes_requested";

function PortalPage() {
  const { token } = Route.useParams();
  const post = { ...MOCK_PORTAL_POST, token };
  const [status, setStatus] = useState<Status>("pending");
  const [events, setEvents] = useState<TimelineEvent[]>(MOCK_TIMELINE);

  function pushEvent(e: Omit<TimelineEvent, "id" | "at">) {
    setEvents((prev) => [
      ...prev,
      { ...e, id: `t${prev.length + 1}`, at: new Date().toISOString() },
    ]);
  }

  async function onApprove() {
    await new Promise((r) => setTimeout(r, 500));
    setStatus("approved");
    pushEvent({ kind: "approved", actor: post.brand.name, message: "Postagem aprovada" });
    toast.success("Postagem aprovada — obrigado!");
  }

  async function onReject() {
    await new Promise((r) => setTimeout(r, 500));
    setStatus("rejected");
    pushEvent({ kind: "changes", actor: post.brand.name, message: "Postagem rejeitada" });
  }

  async function onRequestChanges(notes: string) {
    await new Promise((r) => setTimeout(r, 500));
    setStatus("changes_requested");
    pushEvent({ kind: "changes", actor: post.brand.name, message: `Ajuste: ${notes}` });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground dark:bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/70">
        <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4">
          <div />
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-semibold tracking-tight">NexusFlow</span>
          </div>
          <div className="flex justify-end">
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 pb-40 pt-6 sm:pb-10">
        <section className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {post.agency} · para {post.brand.name}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Nova postagem aguardando sua aprovação
          </h1>
          <p className="text-sm text-muted-foreground">
            Revise abaixo e escolha a próxima ação. Leva menos de 1 minuto.
          </p>
        </section>

        <PostPreview post={post} />

        {/* Desktop action bar (inline) */}
        <div className="hidden sm:block">
          <ActionBar
            status={status}
            onApprove={onApprove}
            onReject={onReject}
            onRequestChanges={onRequestChanges}
          />
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Histórico
          </h2>
          <Timeline events={events} />
        </section>
      </main>

      {/* Mobile sticky action bar */}
      <div className="sticky bottom-0 z-30 border-t border-border/60 bg-background/90 px-4 py-3 backdrop-blur-xl sm:hidden dark:border-slate-800 dark:bg-slate-950/90">
        <ActionBar
          status={status}
          onApprove={onApprove}
          onReject={onReject}
          onRequestChanges={onRequestChanges}
        />
      </div>
    </div>
  );
}