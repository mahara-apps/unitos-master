import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CONNECTABLE_CHANNELS, UPCOMING_CHANNELS } from "@/components/connections/channel-meta";
import { metaIssueState } from "@/lib/meta/issue-messages";
import type { DiscoveredAccountsResult } from "@/lib/meta/discovery.functions";

/**
 * Modal "Conectar canais" — CAMADA DE APRESENTAÇÃO.
 *
 * Nenhuma lógica de OAuth, Meta API, permissões ou banco vive aqui: o
 * componente apenas recebe o estado real (canal em conexão, resultado da
 * descoberta) e o traduz em etapas, checklist e resumo legível. A ação de
 * conectar é delegada ao chamador via `onConnect`.
 */

const STEPS = ["Autorização", "Seleção de ativos", "Validação", "Confirmação"] as const;

const CHECKLIST = [
  "Preparando autorização",
  "Conectando à Meta",
  "Verificando portfólios",
  "Buscando ativos",
  "Validando permissões",
] as const;

function StepBar({ active }: { active: number }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3">
      {STEPS.map((label, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex min-w-0 flex-col gap-1.5">
              <span className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-semibold transition-colors",
                    done && "bg-emerald-500 text-white",
                    current && "bg-primary text-primary-foreground",
                    !done && !current && "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-2.5 w-2.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "truncate text-[11px] transition-colors",
                    current
                      ? "font-medium text-foreground"
                      : done
                        ? "text-muted-foreground"
                        : "text-muted-foreground/70",
                  )}
                >
                  {label}
                </span>
              </span>
              <span
                className={cn(
                  "h-0.5 w-full rounded-full transition-colors",
                  done ? "bg-emerald-500/70" : current ? "bg-primary" : "bg-border",
                )}
              />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function HowItWorks() {
  const items = [
    "Você autoriza o acesso na plataforma oficial.",
    "O Unitos identifica seus portfólios e ativos.",
    "Você escolhe quais contas deseja vincular.",
    "O canal fica disponível para o cliente.",
  ];
  return (
    <div className="rounded-xl bg-muted/40 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Como funciona
      </p>
      <ol className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
        {items.map((text, i) => (
          <li key={text} className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <span className="mt-px grid h-4 w-4 shrink-0 place-items-center rounded-full bg-background text-[9px] font-semibold text-foreground">
              {i + 1}
            </span>
            <span className="leading-snug">{text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ConnectChannelsDialog({
  open,
  onOpenChange,
  connecting,
  onConnect,
  discovery,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  connecting: null | "facebook" | "instagram";
  onConnect: (channel: "facebook" | "instagram") => void;
  discovery?: DiscoveredAccountsResult;
}) {
  const [progress, setProgress] = useState(0);

  // Checklist avança enquanto a autorização acontece na janela da Meta.
  useEffect(() => {
    if (!connecting) {
      setProgress(0);
      return;
    }
    setProgress(1);
    const timers = [
      window.setTimeout(() => setProgress(2), 1500),
      window.setTimeout(() => setProgress(3), 4500),
      window.setTimeout(() => setProgress(4), 9000),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [connecting]);

  const summary = useMemo(() => {
    if (!discovery || discovery.needsAuthorization) return null;
    const accounts = discovery.accounts ?? [];
    return {
      portfolios: discovery.businesses?.length ?? 0,
      pages: accounts.filter((a) => a.channel === "facebook").length,
      instagram: accounts.filter((a) => a.channel === "instagram").length,
      ads: 0,
    };
  }, [discovery]);

  const issue = useMemo(
    () => metaIssueState([discovery?.error, ...(discovery?.warnings ?? [])]),
    [discovery],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[660px]">
        <DialogHeader className="space-y-1 px-6 pb-4 pt-6 text-left">
          <DialogTitle className="text-[17px] font-semibold tracking-tight">
            Conectar canais
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-snug text-muted-foreground">
            Escolha por onde começar. A autorização acontece na tela oficial do provedor.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-5">
          <StepBar active={0} />
        </div>

        <div className="max-h-[64vh] space-y-6 overflow-y-auto border-t px-6 py-5">
          {connecting ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">Autorização em andamento</p>
                  <p className="text-[11px] text-muted-foreground">
                    Conclua o consentimento na janela da Meta. Você pode manter esta tela aberta.
                  </p>
                </div>
              </div>

              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${Math.round((progress / CHECKLIST.length) * 100)}%` }}
                />
              </div>

              <ul className="space-y-2">
                {CHECKLIST.map((label, i) => {
                  const done = i < progress - 1;
                  const current = i === progress - 1;
                  return (
                    <li
                      key={label}
                      className={cn(
                        "flex items-center gap-2 text-xs transition-colors",
                        current
                          ? "font-medium text-foreground"
                          : done
                            ? "text-muted-foreground"
                            : "text-muted-foreground/50",
                      )}
                    >
                      {done ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : current ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      ) : (
                        <span className="h-3.5 w-3.5 rounded-full border border-border" />
                      )}
                      {label}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <>
              {summary ? (
                <section className="rounded-xl border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <p className="text-sm font-medium">Conexão autorizada</p>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      ["Portfólios", summary.portfolios],
                      ["Páginas", summary.pages],
                      ["Instagram", summary.instagram],
                      ["Contas Ads", summary.ads],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-lg bg-muted/40 px-3 py-2">
                        <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="text-lg font-semibold leading-tight tabular-nums">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {issue ? (
                    <Collapsible className="mt-3">
                      <div className="rounded-lg bg-amber-500/10 p-3">
                        <p className="text-xs font-medium text-foreground">{issue.title}</p>
                        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                          {issue.summary}
                        </p>
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                          >
                            Ver detalhes
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                            {issue.recommendation}
                          </p>
                          {discovery?.error ? (
                            <p className="mt-1.5 break-words font-mono text-[10px] text-muted-foreground/80">
                              {discovery.error}
                            </p>
                          ) : null}
                          {(discovery?.warnings ?? []).slice(0, 4).map((w) => (
                            <p
                              key={w}
                              className="mt-1 break-words font-mono text-[10px] text-muted-foreground/80"
                            >
                              {w}
                            </p>
                          ))}
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  ) : null}
                </section>
              ) : null}

              <section className="space-y-2.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Disponíveis
                </h3>
                <div className="space-y-2">
                  {CONNECTABLE_CHANNELS.map((def) => {
                    const Icon = def.icon;
                    return (
                      <button
                        key={def.key}
                        type="button"
                        onClick={() => onConnect(def.key as "facebook" | "instagram")}
                        className="group flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border bg-card p-4 text-left transition-all duration-150 hover:border-primary/40 hover:bg-accent/30 hover:shadow-[0_1px_12px_-6px_hsl(var(--foreground)/0.25)]"
                      >
                        <span
                          className={cn(
                            "grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-colors",
                            def.key === "instagram"
                              ? "bg-pink-500/10"
                              : "bg-sky-500/10",
                          )}
                        >
                          <Icon className={cn("h-5 w-5", def.tone)} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{def.label}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            Meta · autorização oficial
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          Disponível
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100" />
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-2.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Em breve
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {UPCOMING_CHANNELS.map((def) => {
                    const Icon = def.icon;
                    return (
                      <div
                        key={def.key}
                        aria-disabled
                        className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-3 py-2.5"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-background">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
                          {def.label}
                        </span>
                        <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Em breve
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <HowItWorks />
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t bg-muted/20 px-6 py-3.5">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-[11px] leading-snug text-muted-foreground">
            Você será redirecionado para a plataforma oficial da Meta. O Unitos não solicita sua
            senha.
          </p>
          {connecting ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 shrink-0 text-[11px]"
              onClick={() => onOpenChange(false)}
            >
              Fechar
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
