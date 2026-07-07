import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { UploadCloud, KeyRound, Eye, EyeOff, FileText, Trash2, CheckCircle2, DollarSign } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/ai-settings")({
  component: AISettingsPage,
});

const providers = [
  { id: "openai", label: "OpenAI", hint: "GPT-5, GPT-4.1", connected: true, models: "gpt-5, gpt-4.1-mini" },
  { id: "anthropic", label: "Anthropic", hint: "Claude Sonnet 4.5", connected: true, models: "claude-sonnet-4.5" },
  { id: "google", label: "Google Gemini", hint: "Gemini 2.5 Pro / Flash", connected: false, models: "—" },
];

const docs = [
  { name: "Brandbook_Vitta_v3.2.pdf", size: "2.4 MB", status: "indexado", chunks: 148 },
  { name: "Tom_de_voz_NovaStudio.docx", size: "312 KB", status: "indexado", chunks: 42 },
  { name: "AtivaB2B_guidelines_2026.pdf", size: "1.1 MB", status: "processando", chunks: 0 },
];

function AISettingsPage() {
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [budget, setBudget] = useState([500]);
  const used = 187.4;
  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <header>
        <h1 className="text-lg font-semibold">IA & Marca</h1>
        <p className="text-xs text-muted-foreground">Traga suas próprias chaves, ensine a IA a falar como sua marca e defina o teto de gastos.</p>
      </header>

      {/* Providers */}
      <section className="rounded-xl border border-border/60 bg-card/30">
        <div className="border-b border-border/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-medium">Chaves de API (BYO)</h2>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">As chaves são criptografadas e nunca deixam o backend.</p>
        </div>
        <div className="divide-y divide-border/60">
          {providers.map((p) => (
            <div key={p.id} className="grid grid-cols-1 items-center gap-3 px-5 py-4 md:grid-cols-[200px_1fr_auto]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{p.label}</span>
                  {p.connected && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                </div>
                <div className="text-[11px] text-muted-foreground">{p.hint}</div>
                <div className="mt-1 font-mono text-[10px] text-muted-foreground">{p.models}</div>
              </div>
              <div className="relative">
                <Label className="sr-only" htmlFor={`k-${p.id}`}>{p.label} key</Label>
                <Input
                  id={`k-${p.id}`}
                  type={reveal[p.id] ? "text" : "password"}
                  placeholder={p.connected ? "sk-**********************" : "cole sua chave aqui"}
                  className="pr-9 font-mono text-xs"
                  defaultValue={p.connected ? "sk-live-a0f4b3d2c1e9f8a7b6c5d4e3" : ""}
                />
                <button
                  type="button"
                  onClick={() => setReveal((s) => ({ ...s, [p.id]: !s[p.id] }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {reveal[p.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <Button size="sm" variant={p.connected ? "outline" : "default"}>
                {p.connected ? "Atualizar" : "Conectar"}
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* RAG memory */}
      <section className="rounded-xl border border-border/60 bg-card/30">
        <div className="border-b border-border/60 px-5 py-3">
          <h2 className="text-sm font-medium">Memória da Marca (RAG)</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Envie brandbooks, guias de tom, exemplos de posts vencedores. A IA usará isso como referência ao gerar conteúdo.</p>
        </div>
        <div className="space-y-4 p-5">
          <label
            htmlFor="rag-upload"
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border/60 bg-background/40 py-10 text-center transition hover:border-primary/50 hover:bg-background/60"
          >
            <UploadCloud className="mb-2 h-6 w-6 text-muted-foreground" />
            <div className="text-sm font-medium">Arraste PDFs, DOCX ou TXT</div>
            <div className="text-[11px] text-muted-foreground">ou clique para selecionar · máx. 20 MB por arquivo</div>
            <input id="rag-upload" type="file" multiple className="hidden" />
          </label>
          <div className="space-y-1.5">
            {docs.map((d) => (
              <div key={d.name} className="flex items-center gap-3 rounded-md border border-border/60 bg-background/40 px-3 py-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{d.name}</div>
                  <div className="text-[10px] text-muted-foreground">{d.size} · {d.chunks} chunks</div>
                </div>
                <Badge variant={d.status === "indexado" ? "outline" : "secondary"} className="text-[10px]">{d.status}</Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Budget */}
      <section className="rounded-xl border border-border/60 bg-card/30">
        <div className="border-b border-border/60 px-5 py-3 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-medium">Orçamento mensal de IA</h2>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-bold tabular-nums">${used.toFixed(2)}</div>
              <div className="text-[11px] text-muted-foreground">de ${budget[0]} este mês · {Math.round((used / budget[0]) * 100)}% usado</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-xs text-muted-foreground">próx. reset · 01/08</div>
              <div className="text-[10px] text-muted-foreground">média diária: $6.24</div>
            </div>
          </div>
          <Progress value={(used / budget[0]) * 100} className="h-1.5" />
          <Separator />
          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <Label>Teto mensal</Label>
              <span className="font-mono text-sm">${budget[0]}</span>
            </div>
            <Slider value={budget} onValueChange={setBudget} min={50} max={5000} step={50} />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>$50</span><span>$5.000</span>
            </div>
          </div>
          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300">
            Ao atingir 90% do teto, as gerações de imagem serão pausadas automaticamente.
          </div>
        </div>
      </section>
    </div>
  );
}