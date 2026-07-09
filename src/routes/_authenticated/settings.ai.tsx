import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Brain, Cpu, Sparkles, UploadCloud, FileText, CheckCircle2, Loader2,
  ShieldAlert, TrendingUp, Zap, DollarSign, Key,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/settings/ai")({
  component: AISettingsPage,
});

type Provider = {
  id: "openai" | "anthropic" | "gemini";
  name: string;
  color: string;
  ping: number;
  last4: string;
  status: "healthy" | "degraded";
};

const PROVIDERS: Provider[] = [
  { id: "openai", name: "OpenAI", color: "from-emerald-500/40 to-teal-500/20", ping: 128, last4: "••7f3A", status: "healthy" },
  { id: "anthropic", name: "Anthropic", color: "from-orange-500/40 to-amber-500/20", ping: 214, last4: "••k9B2", status: "healthy" },
  { id: "gemini", name: "Gemini", color: "from-sky-500/40 to-violet-500/20", ping: 342, last4: "••Zq81", status: "degraded" },
];

const DOCS = [
  { name: "brand-voice-2026.pdf", size: "2.4 MB", progress: 100 },
  { name: "produtos-catalogo-q3.docx", size: "812 KB", progress: 100 },
  { name: "estudos-de-caso.pdf", size: "5.1 MB", progress: 68 },
  { name: "compliance-legal.md", size: "48 KB", progress: 22 },
];

const DAILY_SPEND = [12, 18, 9, 27, 34, 22, 41, 38, 52, 47, 61, 58, 44, 72];

function AISettingsPage() {
  const [textLead, setTextLead] = useState<Provider["id"]>("openai");
  const [imageLead, setImageLead] = useState<Provider["id"]>("gemini");
  const [budget, setBudget] = useState(500);
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);

  const used = 412;
  const pct = Math.round((used / budget) * 100);
  const warn = pct >= 80;

  return (
    <ScrollArea className="h-[calc(100vh-3.5rem)] bg-zinc-950">
      <div className="mx-auto max-w-7xl space-y-8 p-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">module · governance</div>
            <h1 className="mt-1 text-2xl font-semibold">Governança de IA</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              BYO Keys, memória longa (RAG) e disjuntor financeiro.
            </p>
          </div>
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-300 glow-good">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            SYSTEM · OPERATIONAL
          </Badge>
        </header>

        {/* Providers */}
        <section>
          <SectionHeader icon={<Key className="h-3.5 w-3.5" />} title="conectores · api" hint="Round-robin com fallback automático" />
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
            {PROVIDERS.map((p) => (
              <div
                key={p.id}
                className="group relative overflow-hidden rounded-xl border border-white/10 bg-neutral-950/60 p-4 transition-colors duration-200 hover:border-white/20"
              >
                <div className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-br ${p.color} opacity-30 blur-2xl`} />
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                        <Cpu className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{p.name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">sk-{p.last4}</div>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        p.status === "healthy"
                          ? "border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-300"
                          : "border-amber-500/30 bg-amber-500/10 font-mono text-[10px] text-amber-300"
                      }
                    >
                      <span
                        className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                          p.status === "healthy" ? "bg-emerald-400" : "bg-amber-400"
                        } animate-pulse`}
                      />
                      {p.ping}ms
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
                    <LeadRow
                      label="Líder de texto"
                      icon={<Sparkles className="h-3 w-3" />}
                      active={textLead === p.id}
                      onChange={() => setTextLead(p.id)}
                    />
                    <LeadRow
                      label="Líder de imagem"
                      icon={<Brain className="h-3 w-3" />}
                      active={imageLead === p.id}
                      onChange={() => setImageLead(p.id)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* RAG */}
        <section>
          <SectionHeader icon={<Brain className="h-3.5 w-3.5" />} title="rag · memória longa" hint="Vetorização em pgvector" />
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                setScanning(true);
                setTimeout(() => setScanning(false), 2400);
              }}
              onClick={() => {
                setScanning(true);
                setTimeout(() => setScanning(false), 2400);
              }}
              className={`relative flex h-64 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-all duration-200 ${
                dragging
                  ? "border-cyan-500/60 bg-cyan-500/[0.05]"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              {scanning && <div className="absolute inset-0 scan-line" />}
              <UploadCloud className={`h-8 w-8 ${scanning ? "text-cyan-400 animate-pulse" : "text-muted-foreground"}`} />
              <div className="mt-3 text-sm font-medium">
                {scanning ? "Scanning & embedding..." : "Solte documentos para indexar"}
              </div>
              <div className="mt-1 font-mono text-[10px] text-muted-foreground">PDF · DOCX · MD · TXT · até 20MB</div>
              {scanning && (
                <div className="mt-4 font-mono text-[10px] text-cyan-300">
                  chunking → embedding → upsert pgvector...
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-neutral-950/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">indexed · 4 docs</span>
                <span className="font-mono text-[10px] text-muted-foreground">1.284 vectors</span>
              </div>
              <div className="space-y-3">
                {DOCS.map((d) => (
                  <div key={d.name} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate text-xs font-medium">{d.name}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                        <span>{d.size}</span>
                        {d.progress === 100 ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={d.progress} className="h-1 bg-white/5" />
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{d.progress}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Cost breaker */}
        <section>
          <SectionHeader
            icon={<ShieldAlert className="h-3.5 w-3.5" />}
            title="disjuntor financeiro"
            hint="Corta automaticamente ao atingir 100% do teto"
          />
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-neutral-950/60 p-4 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">consumo · últimos 14d</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-mono text-2xl font-semibold tabular-nums">${used}</span>
                    <span className="text-xs text-muted-foreground">/ ${budget}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-300">
                  <TrendingUp className="h-3 w-3" />
                  +12.4% vs. semana anterior
                </div>
              </div>

              {/* Bar chart */}
              <div className="flex h-32 items-end gap-1.5">
                {DAILY_SPEND.map((v, i) => {
                  const h = (v / Math.max(...DAILY_SPEND)) * 100;
                  return (
                    <div key={i} className="group relative flex-1">
                      <div
                        className={`w-full rounded-t transition-colors duration-200 ${
                          v > 50 ? "bg-amber-400/70 group-hover:bg-amber-400" : "bg-cyan-400/60 group-hover:bg-cyan-400"
                        }`}
                        style={{ height: `${h}%` }}
                      />
                      <div className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded border border-white/10 bg-black/80 px-1.5 py-0.5 font-mono text-[9px] opacity-0 backdrop-blur transition-opacity duration-200 group-hover:opacity-100">
                        ${v}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6">
                <div className="mb-1.5 flex items-center justify-between font-mono text-[10px]">
                  <span className="uppercase tracking-widest text-muted-foreground">progresso do teto</span>
                  <span className={warn ? "text-orange-300" : "text-cyan-300"}>{pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      warn
                        ? "bg-gradient-to-r from-amber-400 to-orange-500"
                        : "bg-gradient-to-r from-cyan-400 to-sky-500"
                    }`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-neutral-950/60 p-4">
              <div className="mb-3 flex items-center gap-2">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">teto mensal</span>
              </div>
              <Label className="font-mono text-[10px] text-muted-foreground">USD</Label>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-lg text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value) || 0)}
                  className="h-11 border-white/10 bg-white/[0.02] font-mono text-lg tabular-nums focus-visible:ring-cyan-500/40"
                />
              </div>

              <div className="mt-4 space-y-2">
                <ToggleRow icon={<Zap className="h-3 w-3" />} label="Corte automático" defaultChecked />
                <ToggleRow icon={<ShieldAlert className="h-3 w-3" />} label="Alerta em 80%" defaultChecked />
                <ToggleRow icon={<TrendingUp className="h-3 w-3" />} label="Fallback para modelo econômico" />
              </div>

              <Button className="mt-4 w-full bg-white text-black hover:bg-white/90">Salvar política</Button>
            </div>
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}

function SectionHeader({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="flex items-end justify-between border-b border-white/10 pb-2">
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{title}</span>
      </div>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}

function LeadRow({
  label, icon, active, onChange,
}: { label: string; icon: React.ReactNode; active: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <Switch checked={active} onCheckedChange={onChange} />
    </div>
  );
}

function ToggleRow({
  icon, label, defaultChecked = false,
}: { icon: React.ReactNode; label: string; defaultChecked?: boolean }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </div>
      <Switch checked={on} onCheckedChange={setOn} />
    </div>
  );
}