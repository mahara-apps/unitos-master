import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { updateBrandHub, type BrandHubData } from "@/lib/brand-hub.functions";

const TONE_SUGGESTIONS = [
  "Professional",
  "Bold",
  "Humorous",
  "Educational",
  "Inspirational",
  "Minimalist",
  "Playful",
  "Authoritative",
  "Empathetic",
  "Technical",
];

export function BriefingTab({
  brandId,
  clientId,
  data,
  onSaved,
}: {
  brandId: string;
  clientId: string;
  data: BrandHubData;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState(data.description ?? "");
  const [audience, setAudience] = useState(data.audience ?? "");
  const [demographics, setDemographics] = useState(data.demographics ?? "");
  const [painPoints, setPainPoints] = useState(data.pain_points ?? "");
  const [toneTags, setToneTags] = useState<string[]>(data.tone_tags ?? []);
  const [customTag, setCustomTag] = useState("");

  useEffect(() => {
    setDescription(data.description ?? "");
    setAudience(data.audience ?? "");
    setDemographics(data.demographics ?? "");
    setPainPoints(data.pain_points ?? "");
    setToneTags(data.tone_tags ?? []);
  }, [data]);

  const qc = useQueryClient();
  const save = useServerFn(updateBrandHub);
  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          brandId,
          clientId,
          patch: {
            description,
            audience,
            demographics,
            pain_points: painPoints,
            tone_tags: toneTags,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Briefing saved");
      qc.invalidateQueries({ queryKey: ["brand-hub", brandId, clientId] });
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message || "Failed to save"),
  });

  const toggleTag = (t: string) => {
    setToneTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };
  const addCustom = () => {
    const v = customTag.trim();
    if (v && !toneTags.includes(v)) setToneTags([...toneTags, v]);
    setCustomTag("");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">Core Briefing</h3>
          <p className="text-xs text-muted-foreground">
            What the company does, market niche, mission, and positioning.
          </p>
        </div>
        <Textarea
          rows={9}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the brand in 2-3 paragraphs. Include market niche, value proposition, and differentiators. Markdown supported."
          className="resize-y bg-background font-mono text-xs"
        />
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">Target Audience & Persona</h3>
          <p className="text-xs text-muted-foreground">
            Lock down demographics and customer pain points.
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Demographics
            </Label>
            <Input
              value={demographics}
              onChange={(e) => setDemographics(e.target.value)}
              placeholder="e.g. Women, 28-42, urban professionals, USD 60k+"
              className="mt-1 bg-background"
            />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Audience description
            </Label>
            <Textarea
              rows={3}
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="Who they are, what they value, where they spend time online."
              className="mt-1 resize-y bg-background text-xs"
            />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Pain points
            </Label>
            <Textarea
              rows={3}
              value={painPoints}
              onChange={(e) => setPainPoints(e.target.value)}
              placeholder="Key frustrations, unmet needs, buying objections."
              className="mt-1 resize-y bg-background text-xs"
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">Tone of Voice</h3>
          <p className="text-xs text-muted-foreground">
            Selected pills feed the AI Content Drawer as brand personality signals.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TONE_SUGGESTIONS.map((t) => {
            const active = toneTags.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={
                  active
                    ? "rounded-full border border-primary/50 bg-primary/15 px-3 py-1 text-xs text-primary transition"
                    : "rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                }
              >
                {t}
              </button>
            );
          })}
          {toneTags
            .filter((t) => !TONE_SUGGESTIONS.includes(t))
            .map((t) => (
              <Badge
                key={t}
                variant="outline"
                className="gap-1 border-primary/40 bg-primary/10 text-primary"
              >
                {t}
                <button type="button" onClick={() => toggleTag(t)}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Add custom tag…"
            className="max-w-xs bg-background text-xs"
          />
          <Button type="button" size="sm" variant="ghost" onClick={addCustom}>
            Add
          </Button>
        </div>
      </section>

      <div className="lg:col-span-2 flex justify-end">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending} className="gap-2">
          {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save briefing
        </Button>
      </div>
    </div>
  );
}