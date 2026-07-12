import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
import { SiriOrb } from "@/components/ui/siri-orb";
import { Instagram, Linkedin, Music2, Sparkles, RefreshCw, CheckCircle2, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateContentDraft, injectDraftIntoPipeline, type GenerateDraftResult } from "@/lib/copilot.functions";

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
  invalidateKeys,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  brandId: string | null;
  clientId: string | null;
  clientToneOfVoice?: string | null;
  pipelineId: string | null;
  invalidateKeys: Array<readonly unknown[]>;
}) {
  const qc = useQueryClient();
  const generate = useServerFn(generateContentDraft);
  const inject = useServerFn(injectDraftIntoPipeline);

  const [briefing, setBriefing] = useState("");
  const [channels, setChannels] = useState<Channel[]>(["instagram"]);
  const [contentType, setContentType] = useState<ContentType>("carousel");
  const [tone, setTone] = useState<string>("");
  const [draft, setDraft] = useState<GenerateDraftResult | null>(null);

  const generateMut = useMutation({
    mutationFn: async () => {
      if (!brandId || !clientId) throw new Error("Select an account first.");
      return generate({
        data: {
          brandId,
          clientId,
          briefing: briefing.trim(),
          channels,
          contentType,
          tone: tone.trim() || undefined,
        },
      });
    },
    onSuccess: (data) => setDraft(data),
    onError: (e: Error) => toast.error(e.message),
  });

  const injectMut = useMutation({
    mutationFn: async () => {
      if (!brandId || !clientId || !pipelineId || !draft) throw new Error("Missing context.");
      return inject({
        data: {
          brandId,
          clientId,
          pipelineId,
          title: draft.title,
          copy: draft.hashtags.length
            ? `${draft.content}\n\n${draft.hashtags.map((h) => `#${h}`).join(" ")}`
            : draft.content,
          channels,
        },
      });
    },
    onSuccess: () => {
      toast.success("Draft injected into the pipeline");
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k as unknown[] }));
      setDraft(null);
      setBriefing("");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canGenerate = Boolean(brandId && clientId && briefing.trim().length >= 4 && channels.length && !generateMut.isPending);
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

              {generateMut.isPending ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-muted/20 py-10">
                  <SiriOrb size={72} />
                  <div className="text-sm font-medium">AI agent is writing copy...</div>
                  <div className="text-[11px] text-muted-foreground">
                    Reasoning over brand context, channel, and tone
                  </div>
                </div>
              ) : draft ? (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
                      Generated Draft
                    </Label>
                    <Badge variant="secondary" className="text-[10px]">Preview</Badge>
                  </div>
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="border-b border-border px-4 py-2.5 text-sm font-medium truncate">
                      {draft.title}
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-w-none px-4 py-4 text-sm leading-relaxed">
                      <ReactMarkdown>{draft.content}</ReactMarkdown>
                    </div>
                    {draft.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 border-t border-border bg-muted/20 px-4 py-2.5">
                        {draft.hashtags.map((h) => (
                          <span key={h} className="text-[11px] text-muted-foreground">#{h}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>

        <footer className="border-t border-border/60 bg-background/80 px-6 py-4 backdrop-blur">
          {draft && !generateMut.isPending ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => generateMut.mutate()}
                disabled={generateMut.isPending || injectMut.isPending}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Regenerate
              </Button>
              <Button
                className="flex-1"
                onClick={() => injectMut.mutate()}
                disabled={injectMut.isPending || !pipelineId}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve &amp; Inject
              </Button>
            </div>
          ) : (
            <Button
              className="w-full"
              disabled={!canGenerate}
              onClick={() => generateMut.mutate()}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {generateMut.isPending ? "Generating..." : "Generate Content"}
            </Button>
          )}
        </footer>
      </SheetContent>
    </Sheet>
  );
}