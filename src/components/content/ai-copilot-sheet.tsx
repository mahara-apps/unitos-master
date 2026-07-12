import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
import { Instagram, Linkedin, Music2, Sparkles, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ContextSourceBadge } from "@/components/ai-agents/context-source-badge";

type ContentType = "reel" | "carousel" | "image" | "short_copy";
type Channel = "instagram" | "tiktok" | "linkedin";

const CHANNEL_META: Record<Channel, { label: string; Icon: typeof Instagram }> = {
  instagram: { label: "Instagram", Icon: Instagram },
  tiktok: { label: "TikTok", Icon: Music2 },
  linkedin: { label: "LinkedIn", Icon: Linkedin },
};

const TYPE_OPTIONS: Array<{ value: ContentType; label: string }> = [
  { value: "reel", label: "Reel Script" },
  { value: "carousel", label: "Carousel" },
  { value: "image", label: "Image Prompt" },
  { value: "short_copy", label: "Short Copy" },
];

export function AiCopilotSheet({
  open,
  onOpenChange,
  brandId,
  clientId,
  clientToneOfVoice,
  pipelineId,
  invalidateKeys: _invalidateKeys,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  brandId: string | null;
  clientId: string | null;
  clientToneOfVoice?: string | null;
  pipelineId: string | null;
  invalidateKeys: Array<readonly unknown[]>;
}) {
  const [briefing, setBriefing] = useState("");
  const [channels, setChannels] = useState<Channel[]>(["instagram"]);
  const [contentType, setContentType] = useState<ContentType>("carousel");
  const [tone, setTone] = useState<string>("");

  const enqueueMut = useMutation({
    mutationFn: async () => {
      if (!brandId || !clientId) throw new Error("Select an account first.");
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Session expired. Please sign in again.");
      const res = await fetch("/api/jobs/copilot", {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          brandId,
          clientId,
          pipelineId,
          briefing: briefing.trim(),
          channels,
          contentType,
          tone: tone.trim() || undefined,
          autoInject: Boolean(pipelineId),
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Request failed with ${res.status}`);
      }
      return (await res.json()) as { jobId: string };
    },
    onSuccess: () => {
      toast.success("Gerando em segundo plano", {
        description: pipelineId
          ? "Você pode fechar isto — o rascunho aparecerá no pipeline ao concluir."
          : "Acompanhe o progresso pelo indicador no topo da tela.",
      });
      setBriefing("");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canGenerate = Boolean(brandId && clientId && briefing.trim().length >= 4 && channels.length && !enqueueMut.isPending);
  const missingContext = !brandId || !clientId;

  const toneOptions = useMemo(
    () =>
      [
        clientToneOfVoice,
        "Confident and direct",
        "Warm and conversational",
        "Bold and provocative",
        "Educational and structured",
        "Minimal and premium",
      ].filter(Boolean) as string[],
    [clientToneOfVoice],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full md:max-w-xl flex flex-col gap-0 p-0 bg-background dark:bg-[#0a0a0c] border-l dark:border-zinc-800"
      >
        <SheetHeader className="border-b border-border/60 px-6 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Wand2 className="h-4 w-4 text-primary" />
            AI Content Co-pilot
          </SheetTitle>
          <SheetDescription className="text-xs">
            Draft channel-ready content grounded in this account's brand voice.
          </SheetDescription>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <ContextSourceBadge source="persona" />
            <ContextSourceBadge source="competitors" />
            <ContextSourceBadge source="knowledge" />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {missingContext ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Select an active account in the sidebar switcher to start generating content.
            </div>
          ) : (
            <>
              <section className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
                  Content Objective
                </Label>
                <Textarea
                  value={briefing}
                  onChange={(e) => setBriefing(e.target.value)}
                  placeholder="Describe the message, angle, or offer this post should carry..."
                  rows={5}
                  className="resize-none font-normal"
                />
              </section>

              <section className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
                  Target Channels
                </Label>
                <ToggleGroup
                  type="multiple"
                  value={channels}
                  onValueChange={(v) => v.length && setChannels(v as Channel[])}
                  className="justify-start"
                >
                  {(Object.keys(CHANNEL_META) as Channel[]).map((c) => {
                    const { label, Icon } = CHANNEL_META[c];
                    return (
                      <ToggleGroupItem key={c} value={c} className="gap-1.5 px-3">
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </ToggleGroupItem>
                    );
                  })}
                </ToggleGroup>
              </section>

              <section className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
                    Content Type
                  </Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setContentType(opt.value)}
                        className={cn(
                          "h-9 rounded-md border text-xs font-medium transition-colors",
                          contentType === opt.value
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-transparent text-muted-foreground hover:bg-muted/50",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
                    Tone of Voice
                  </Label>
                  <Input
                    list="copilot-tone-suggestions"
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    placeholder={clientToneOfVoice || "Inherit brand voice"}
                    className="h-9"
                  />
                  <datalist id="copilot-tone-suggestions">
                    {toneOptions.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>
              </section>

              <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-4 text-[11px] text-muted-foreground">
                A geração roda em segundo plano. Você pode fechar este painel e continuar
                navegando — enviaremos uma notificação quando o rascunho estiver pronto.
              </div>
            </>
          )}
        </div>

        <footer className="border-t border-border/60 bg-background/80 px-6 py-4 backdrop-blur">
          <Button
            className="w-full"
            disabled={!canGenerate}
            onClick={() => enqueueMut.mutate()}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {enqueueMut.isPending ? "Iniciando..." : "Gerar em segundo plano"}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}