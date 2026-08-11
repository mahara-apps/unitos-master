import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Stepper } from "@/components/ui/stepper";
import {
  PLAN_CHANNELS,
  PLAN_CHANNEL_LABEL,
  PLAN_FORMATS,
  type PlanChannel,
} from "@/lib/monthly-plan-fields";
import type { PlanVolumetry } from "./volumetry-cards";

export type GenerateSelection = { channel: PlanChannel; quantity: number; formats: string[] };

const STEPS = ["Escopo", "Canais e volume", "Formatos"] as const;

export function GeneratePlanWizard({
  open,
  onOpenChange,
  volumetry,
  briefings,
  pending,
  loadingMessage,
  onGenerate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  volumetry: PlanVolumetry | undefined;
  briefings: Array<{ id: string; label: string }>;
  pending: boolean;
  loadingMessage: string;
  onGenerate: (input: {
    theme: string;
    briefingId: string | null;
    selection: GenerateSelection[];
  }) => void;
}) {
  const [step, setStep] = useState(0);
  const [theme, setTheme] = useState("");
  const [briefingId, setBriefingId] = useState("__none");
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, number>>({});
  const [formats, setFormats] = useState<Record<string, string[]>>({});

  const channels = useMemo(
    () => PLAN_CHANNELS.filter((c) => (volumetry?.monthlyQuota[c] ?? 0) > 0),
    [volumetry],
  );

  // Pré-preenche com o disponível do mês e os formatos do briefing.
  useEffect(() => {
    if (!open || !volumetry) return;
    const nextEnabled: Record<string, boolean> = {};
    const nextQty: Record<string, number> = {};
    const nextFormats: Record<string, string[]> = {};
    for (const c of channels) {
      const quota = volumetry.monthlyQuota[c] ?? 0;
      const available = Math.max(0, quota - (volumetry.generatedThisMonth[c] ?? 0));
      nextEnabled[c] = available > 0;
      nextQty[c] = available > 0 ? available : quota;
      const fromBriefing = (volumetry.formatsByChannel[c] ?? []).filter((f) =>
        (PLAN_FORMATS as readonly string[]).includes(f),
      );
      nextFormats[c] = fromBriefing.length ? fromBriefing : [...PLAN_FORMATS];
    }
    setEnabled(nextEnabled);
    setQty(nextQty);
    setFormats(nextFormats);
    setStep(0);
  }, [open, volumetry, channels]);

  const activeChannels = channels.filter((c) => enabled[c] && (qty[c] ?? 0) > 0);
  const total = activeChannels.reduce((s, c) => s + (qty[c] ?? 0), 0);
  const overQuota = activeChannels.filter(
    (c) =>
      (qty[c] ?? 0) + (volumetry?.generatedThisMonth[c] ?? 0) > (volumetry?.monthlyQuota[c] ?? 0),
  );
  const missingFormats = activeChannels.filter((c) => (formats[c] ?? []).length === 0);

  const toggleFormat = (c: string, f: string) =>
    setFormats((prev) => {
      const cur = prev[c] ?? [];
      return { ...prev, [c]: cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f] };
    });

  const submit = () =>
    onGenerate({
      theme: theme.trim(),
      briefingId: briefingId === "__none" ? null : briefingId,
      selection: activeChannels.map((c) => ({
        channel: c,
        quantity: qty[c] ?? 0,
        formats: formats[c] ?? [],
      })),
    });

  return (
    <Dialog open={open} onOpenChange={(v) => (pending ? null : onOpenChange(v))}>
      <DialogContent className="max-w-xl">
        {pending ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm font-medium">{loadingMessage}</p>
            <p className="text-xs text-muted-foreground">
              Gerando {total} peças — isso pode levar até um minuto.
            </p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Gerar pauta com IA</DialogTitle>
              <DialogDescription>
                Passo {step + 1} de {STEPS.length} · {STEPS[step]}
              </DialogDescription>
            </DialogHeader>

            <div className="flex gap-1.5">
              {STEPS.map((s, i) => (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`}
                />
              ))}
            </div>

            {step === 0 ? (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Tema do mês{" "}
                    <span className="normal-case text-muted-foreground/70">(opcional)</span>
                  </label>
                  <Input
                    autoFocus
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    placeholder="Ex.: Mês das Mães focado em vendas"
                    className="h-10"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    O briefing do cliente é sempre usado como contexto pela IA.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Briefing específico (opcional)
                  </label>
                  <Select value={briefingId} onValueChange={setBriefingId}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Nenhum briefing" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Nenhum</SelectItem>
                      {briefings.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="space-y-2 py-2">
                {channels.map((c) => {
                  const quota = volumetry?.monthlyQuota[c] ?? 0;
                  const generated = volumetry?.generatedThisMonth[c] ?? 0;
                  const available = Math.max(0, quota - generated);
                  return (
                    <div
                      key={c}
                      className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 p-3"
                    >
                      <Checkbox
                        checked={!!enabled[c]}
                        onCheckedChange={(v) => setEnabled((p) => ({ ...p, [c]: !!v }))}
                        aria-label={PLAN_CHANNEL_LABEL[c]}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{PLAN_CHANNEL_LABEL[c]}</div>
                        <div className="text-[11px] text-muted-foreground tabular-nums">
                          cota {quota}/mês · {generated} gerados · {available} disponíveis
                        </div>
                      </div>
                      <Stepper
                        value={qty[c] ?? 0}
                        min={0}
                        max={60}
                        label={`quantidade ${PLAN_CHANNEL_LABEL[c]}`}
                        onChange={(n) => setQty((p) => ({ ...p, [c]: n }))}
                        className={enabled[c] ? "" : "pointer-events-none opacity-40"}
                      />
                    </div>
                  );
                })}
                <div className="flex items-center justify-between border-t border-border/60 pt-3 text-xs">
                  <span className="text-muted-foreground">Total a gerar</span>
                  <span className="font-medium tabular-nums">{total} peças</span>
                </div>
                {overQuota.length ? (
                  <p className="text-[11px] text-amber-400">
                    Acima da meta mensal em:{" "}
                    {overQuota.map((c) => PLAN_CHANNEL_LABEL[c]).join(", ")}.
                  </p>
                ) : null}
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-3 py-2">
                {activeChannels.map((c) => (
                  <div key={c} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium">{PLAN_CHANNEL_LABEL[c]}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {qty[c]} peças
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {PLAN_FORMATS.map((f) => {
                        const on = (formats[c] ?? []).includes(f);
                        return (
                          <button
                            key={f}
                            type="button"
                            onClick={() => toggleFormat(c, f)}
                            className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                              on
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {f}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {missingFormats.length ? (
                  <p className="text-[11px] text-amber-400">
                    Selecione ao menos um formato para:{" "}
                    {missingFormats.map((c) => PLAN_CHANNEL_LABEL[c]).join(", ")}.
                  </p>
                ) : null}
              </div>
            ) : null}

            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                variant="ghost"
                onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}
                className="gap-1"
              >
                {step === 0 ? "Cancelar" : (
                  <>
                    <ArrowLeft className="h-4 w-4" /> Voltar
                  </>
                )}
              </Button>
              {step < STEPS.length - 1 ? (
                <Button
                  className="gap-1"
                  disabled={step === 1 && total === 0}
                  onClick={() => setStep(step + 1)}
                >
                  Continuar <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  className="gap-2"
                  disabled={total === 0 || missingFormats.length > 0}
                  onClick={submit}
                >
                  <Sparkles className="h-4 w-4" /> Gerar {total} peças
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
