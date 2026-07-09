import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Sparkles, Target, PenLine, ShieldCheck, ChevronLeft, ChevronRight, Heart,
  MessageCircle, Wand2, Cpu, DollarSign, ImageIcon, Layers, Check,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/arena")({
  component: ArenaPage,
});

const CAPTION_FULL =
  "Sua rotina não precisa ser um caos. Descubra 5 rituais matinais que a neurociência aprova — e por que o café não é o vilão. Salve este post para começar amanhã. ☕✨";

const NEGATIVE_KEYWORDS = ["milagroso", "garantido", "imperdível", "urgente", "melhor do mundo", "exclusivo demais"];

const TOP_POSTS = [
  { id: 1, title: "3 hábitos que mudam sua semana", eng: "12.4k", likes: "8.9k", cmt: 342 },
  { id: 2, title: "O poder do foco profundo", eng: "9.8k", likes: "7.1k", cmt: 218 },
  { id: 3, title: "Manhãs sem pressa (guia rápido)", eng: "8.2k", likes: "6.3k", cmt: 187 },
];

const CTA_VARIANTS = [
  "Salve para não esquecer amanhã.",
  "Marca quem precisa de uma rotina nova.",
  "Comenta 'RITUAL' que te mando o PDF.",
];

const COMPLIANCE_CHECKS = [
  { label: "Tom de voz alinhado (Warm/Expert)", ok: true },
  { label: "Sem termos proibidos", ok: true },
  { label: "CTA único e claro", ok: true },
  { label: "Menção de disclaimer (saúde)", ok: false },
  { label: "Alt-text sugerido", ok: true },
];

function TypedCaption({ full }: { full: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (i >= full.length) return;
    const t = setTimeout(() => setI((v) => v + 2), 22);
    return () => clearTimeout(t);
  }, [i, full.length]);
  return (
    <p className="text-sm leading-relaxed text-foreground/90">
      {full.slice(0, i)}
      <span className="ml-0.5 inline-block h-4 w-[6px] translate-y-[2px] bg-cyan-400 animate-pulse" />
    </p>
  );
}

function Gauge({ value }: { value: number }) {
  const angle = (value / 100) * 180 - 90;
  return (
    <div className="relative h-24 w-full">
      <svg viewBox="0 0 200 110" className="h-full w-full">
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="oklch(1 0 0 / 0.08)" strokeWidth="10" strokeLinecap="round" />
        <path
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          stroke="url(#gg)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * 251} 251`}
        />
        <defs>
          <linearGradient id="gg" x1="0" x2="1">
            <stop offset="0%" stopColor="oklch(0.7 0.2 200)" />
            <stop offset="100%" stopColor="oklch(0.75 0.17 155)" />
          </linearGradient>
        </defs>
        <line x1="100" y1="100" x2={100 + 60 * Math.cos((angle * Math.PI) / 180)} y2={100 + 60 * Math.sin((angle * Math.PI) / 180)}
          stroke="oklch(0.95 0 0)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="100" cy="100" r="4" fill="oklch(0.95 0 0)" />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="font-mono text-2xl font-semibold tabular-nums">{value}%</div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Match de tom</div>
      </div>
    </div>
  );
}

function AgentDot({ color }: { color: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${color}`} />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}

function ArenaPage() {
  const [leftOpen, setLeftOpen] = useState(true);
  const [imgLoaded, setImgLoaded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setImgLoaded(true), 2400);
    return () => clearTimeout(t);
  }, []);

  const cost = useMemo(() => (Math.random() * 3 + 1.4).toFixed(2), []);

  return (
    <div className="relative flex h-[calc(100vh-3.5rem)] overflow-hidden bg-zinc-950 text-foreground">
      {/* LEFT: Brand context */}
      <aside
        className={`shrink-0 border-r border-white/10 bg-neutral-950/60 backdrop-blur transition-all duration-300 ${
          leftOpen ? "w-80" : "w-12"
        }`}
      >
        <div className="flex h-11 items-center justify-between border-b border-white/10 px-3">
          {leftOpen && (
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">brand.context</span>
          )}
          <button
            onClick={() => setLeftOpen(!leftOpen)}
            className="rounded p-1 text-muted-foreground transition-colors duration-200 hover:bg-white/5 hover:text-foreground"
          >
            {leftOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
        {leftOpen && (
          <ScrollArea className="h-[calc(100%-2.75rem)]">
            <div className="space-y-5 p-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Avatar className="h-8 w-8 border border-white/10">
                    <AvatarFallback className="bg-gradient-to-br from-emerald-500/30 to-cyan-500/30 text-xs">ZN</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-sm font-medium">Zenith Wellness</div>
                    <div className="font-mono text-[10px] text-muted-foreground">TONE: warm · expert · pt-BR</div>
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <Gauge value={87} />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">negative keywords</span>
                  <Badge variant="outline" className="border-red-500/30 bg-red-500/10 font-mono text-[10px] text-red-300">
                    {NEGATIVE_KEYWORDS.length}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {NEGATIVE_KEYWORDS.map((k) => (
                    <span
                      key={k}
                      className="rounded-md border border-red-500/20 bg-red-500/[0.06] px-2 py-0.5 font-mono text-[11px] text-red-300/90 transition-colors duration-200 hover:bg-red-500/10"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">top performing</div>
                <div className="space-y-2">
                  {TOP_POSTS.map((p) => (
                    <div
                      key={p.id}
                      className="group flex gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-2.5 transition-colors duration-200 hover:border-white/20 hover:bg-white/[0.04]"
                    >
                      <div className="h-12 w-12 shrink-0 rounded-md bg-gradient-to-br from-emerald-500/30 via-cyan-500/20 to-violet-500/30" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{p.title}</div>
                        <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                          <span className="text-emerald-400">{p.eng}</span>
                          <span className="inline-flex items-center gap-0.5"><Heart className="h-2.5 w-2.5" />{p.likes}</span>
                          <span className="inline-flex items-center gap-0.5"><MessageCircle className="h-2.5 w-2.5" />{p.cmt}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </aside>

      {/* CENTER */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 items-center justify-between border-b border-white/10 bg-neutral-950/60 px-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              arena · post-018 · zenith wellness
            </span>
          </div>
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-300">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            LIVE
          </Badge>
        </div>

        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-3xl space-y-5 p-6">
            {/* Caption editor */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PenLine className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">caption · streaming</span>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">gpt-4o · 24 tok/s</span>
              </div>
              <TypedCaption full={CAPTION_FULL} />
              <Separator className="my-4 bg-white/10" />
              <Textarea
                defaultValue="#rotina #manhã #foco #bemestar"
                className="min-h-[42px] resize-none border-white/10 bg-transparent font-mono text-xs focus-visible:ring-cyan-500/40"
              />
            </div>

            {/* Image preview */}
            <div className="overflow-hidden rounded-xl border border-white/10 bg-neutral-900/60">
              <div className="relative aspect-square w-full">
                {!imgLoaded ? (
                  <>
                    <Skeleton className="absolute inset-0 rounded-none bg-white/[0.03]" />
                    <div className="absolute inset-0 scan-line" />
                  </>
                ) : (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,oklch(0.55_0.2_200/0.4),transparent_60%),radial-gradient(circle_at_70%_70%,oklch(0.65_0.22_340/0.35),transparent_60%),linear-gradient(135deg,oklch(0.2_0.05_260),oklch(0.15_0.05_280))]" />
                )}

                {/* Technical overlay */}
                <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/60 px-2 py-1 font-mono text-[10px] backdrop-blur">
                      <Cpu className="h-3 w-3 text-violet-400" /> FLUX.1-PRO
                    </div>
                    <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/60 px-2 py-1 font-mono text-[10px] backdrop-blur">
                      <ImageIcon className="h-3 w-3 text-cyan-400" /> 1024 × 1024
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] text-emerald-300 backdrop-blur glow-good">
                    <DollarSign className="h-3 w-3" /> {cost}¢
                  </div>
                </div>
                <div className="absolute bottom-3 right-3 rounded-md border border-white/10 bg-black/60 px-2 py-1 font-mono text-[10px] text-white/80 backdrop-blur">
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  AUTO-WATERMARK · ATIVO
                </div>
                {!imgLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="rounded-full border border-white/10 bg-black/50 px-3 py-1 font-mono text-[10px] text-white/70 backdrop-blur">
                      generating · 68%
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Floating premium button */}
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
          <button className="pointer-events-auto group relative overflow-hidden rounded-full p-[1px] shadow-2xl shadow-violet-500/30 transition-transform duration-200 hover:scale-[1.02]">
            <span className="absolute inset-0 shimmer-btn" />
            <span className="relative flex items-center gap-2 rounded-full bg-neutral-950 px-6 py-2.5 text-sm font-medium">
              <Wand2 className="h-4 w-4 text-cyan-300" />
              Executar Refinamento por IA
              <Sparkles className="h-3.5 w-3.5 text-violet-300" />
            </span>
          </button>
        </div>
      </main>

      {/* RIGHT: Agent swarm */}
      <aside className="w-96 shrink-0 border-l border-white/10 bg-neutral-950/60 backdrop-blur">
        <div className="flex h-11 items-center justify-between border-b border-white/10 px-4">
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">swarm.hub</span>
          <div className="flex items-center gap-1.5">
            <AgentDot color="bg-emerald-400" />
            <span className="font-mono text-[10px] text-muted-foreground">3 agents · debating</span>
          </div>
        </div>
        <ScrollArea className="h-[calc(100%-2.75rem)]">
          <div className="space-y-3 p-4">
            {/* Strategist */}
            <AgentBlock
              color="emerald"
              icon={<Target className="h-3.5 w-3.5" />}
              role="Strategist"
              time="há 12s"
              status="done"
            >
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">gancho psicológico</div>
              <div className="mt-1 rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] p-2 font-mono text-xs text-emerald-100">
                loss-aversion + curiosity-gap → "5 rituais que a neurociência aprova"
              </div>
            </AgentBlock>

            {/* Copywriter */}
            <AgentBlock
              color="sky"
              icon={<PenLine className="h-3.5 w-3.5" />}
              role="Copywriter"
              time="há 6s"
              status="running"
            >
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">variações de cta</div>
              <div className="mt-1 space-y-1.5">
                {CTA_VARIANTS.map((c, i) => (
                  <label
                    key={c}
                    className="flex cursor-pointer items-start gap-2 rounded-md border border-white/10 bg-white/[0.02] p-2 text-xs transition-colors duration-200 hover:border-sky-500/40 hover:bg-sky-500/[0.05]"
                  >
                    <input type="radio" name="cta" defaultChecked={i === 0} className="mt-0.5 accent-sky-400" />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
            </AgentBlock>

            {/* Compliance */}
            <AgentBlock
              color="amber"
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              role="Compliance"
              time="há 2s"
              status="running"
            >
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">checagem em tempo real</div>
              <div className="mt-2 space-y-1.5">
                {COMPLIANCE_CHECKS.map((c) => (
                  <div key={c.label} className="flex items-center gap-2 text-xs">
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full ${
                        c.ok ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {c.ok ? <Check className="h-2.5 w-2.5" /> : "!"}
                    </span>
                    <span className={c.ok ? "text-foreground/80" : "text-amber-200"}>{c.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                  <span>brand-fit score</span>
                  <span className="text-amber-300">82 / 100</span>
                </div>
                <Progress value={82} className="h-1.5 bg-white/5" />
              </div>
            </AgentBlock>
          </div>
        </ScrollArea>
      </aside>
    </div>
  );
}

function AgentBlock({
  color, icon, role, time, status, children,
}: {
  color: "emerald" | "sky" | "amber";
  icon: React.ReactNode;
  role: string;
  time: string;
  status: "done" | "running";
  children: React.ReactNode;
}) {
  const map = {
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    sky: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  } as const;
  const dot = { emerald: "bg-emerald-400", sky: "bg-sky-400", amber: "bg-amber-400" } as const;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 transition-colors duration-200 hover:border-white/20">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex h-6 w-6 items-center justify-center rounded-md border ${map[color]}`}>{icon}</div>
          <Badge variant="outline" className={`font-mono text-[10px] uppercase ${map[color]}`}>
            [agent: {role}]
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
          {status === "running" && <AgentDot color={dot[color]} />}
          {time}
        </div>
      </div>
      {children}
    </div>
  );
}