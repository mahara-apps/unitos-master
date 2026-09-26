import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Stepper } from "@/components/ui/stepper";
import { PLAN_CHANNELS, PLAN_CHANNEL_LABEL, type PlanChannel } from "@/lib/monthly-plan-fields";
import {
  CONTENT_FORMATS,
  CONTENT_FORMAT_LABEL,
  breakdownFromTotal,
  formatsForChannel,
  sumChannelBreakdown,
  type ContentFormat,
} from "@/lib/content-formats";
import {
  PautaOrganizationField,
  requiredOrganization,
  toOrganizationInput,
  type OrganizationDraft,
} from "@/components/monthly-plan/pauta-organization-field";
import {
  listPlanAiModelsFn,
  type PlanAiModelOption,
  type PlanOrganizationInput,
} from "@/lib/monthly-plans.functions";
import type { PlanVolumetry } from "./volumetry-cards";
import { describeError } from "@/lib/errors";

export type GenerateSelection = {
  channel: PlanChannel;
  quantity: number;
  formats: string[];
  /** Cota por formato canônico — fonte da distribuição na geração. */
  formatQuotas: Partial<Record<ContentFormat, number>>;
};

export type OverageItem = {
  channel: PlanChannel;
  quota: number;
  requested: number;
  overage: number;
};

const STEPS = ["Escopo", "Conteúdo"] as const;

export function GeneratePlanWizard({
  open,
  onOpenChange,
  brandId,
  clientId,
  volumetry,
  briefings,
  submitting,
  generationError,
  onGenerate,
  onRequestOverage,
  requestingOverage,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  brandId: string;
  clientId: string;
  volumetry: PlanVolumetry | undefined;
  briefings: Array<{
    id: string;
    label: string;
    completion?: number | null;
    createdAt?: string;
    current?: boolean;
  }>;

  submitting: boolean;
  generationError?: string | null;
  onGenerate: (input: {
    theme: string;
    briefingId: string | null;
    selection: GenerateSelection[];
    organization: PlanOrganizationInput;
    selectedModel: { provider: PlanAiModelOption["provider"]; modelId: string } | null;
  }) => void;
  onRequestOverage?: (items: OverageItem[], justification: string) => void;
  requestingOverage?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [theme, setTheme] = useState("");
  const [briefingId, setBriefingId] = useState("__none");
  const [showBriefingPicker, setShowBriefingPicker] = useState(false);
  const currentBriefing = briefings[0] ?? null;

  const [org, setOrg] = useState<OrganizationDraft>(requiredOrganization);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  /** Fonte de verdade da seleção: canal → formato → quantidade. */
  const [fmtQty, setFmtQty] = useState<Record<string, Partial<Record<ContentFormat, number>>>>({});
  const [justification, setJustification] = useState("");
  const [selectedModelKey, setSelectedModelKey] = useState("");
  const listModels = useServerFn(listPlanAiModelsFn);
  const modelsQ = useQuery({
    queryKey: ["monthly-plan", "ai-models", brandId],
    queryFn: () => listModels({ data: { brandId } }),
    enabled: open,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const models = modelsQ.data ?? [];

  // Projeto é obrigatório na criação da pauta: "nenhum" não é aceito.
  const organization = toOrganizationInput(org, false);

  const channels = useMemo(
    () => PLAN_CHANNELS.filter((c) => (volumetry?.monthlyQuota[c] ?? 0) > 0),
    [volumetry],
  );

  // Pré-preenche com o disponível do mês, respeitando o breakdown do briefing.
  useEffect(() => {
    if (!open || !volumetry) return;
    const nextEnabled: Record<string, boolean> = {};
    const nextFmt: Record<string, Partial<Record<ContentFormat, number>>> = {};
    for (const c of channels) {
      const quota = volumetry.monthlyQuota[c] ?? 0;
      const available = Math.max(0, quota - (volumetry.generatedThisMonth[c] ?? 0));
      nextEnabled[c] = available > 0;
      const target = available > 0 ? available : quota;
      const briefingBucket = (volumetry.formatQuota?.[c] ?? {}) as Partial<
        Record<ContentFormat, number>
      >;
      const briefingTotal = sumChannelBreakdown(briefingBucket);
      if (briefingTotal > 0 && target > 0) {
        // Reescala o breakdown do briefing para o volume disponível no mês.
        const bucket: Partial<Record<ContentFormat, number>> = {};
        const entries = CONTENT_FORMATS.filter((f) => (briefingBucket[f] ?? 0) > 0);
        let left = target;
        entries.forEach((f, idx) => {
          const share =
            idx === entries.length - 1
              ? left
              : Math.min(left, Math.round((briefingBucket[f]! / briefingTotal) * target));
          if (share > 0) bucket[f] = share;
          left -= share;
        });
        nextFmt[c] = bucket;
      } else {
        nextFmt[c] = breakdownFromTotal(c, target, volumetry.formatsByChannel[c] ?? []);
      }
    }
    setEnabled(nextEnabled);
    setFmtQty(nextFmt);
    setOrg(requiredOrganization);
    setStep(0);
  }, [open, volumetry, channels]);

  useEffect(() => {
    if (!open || models.length === 0) return;
    const stillAvailable = models.some(
      (model) => `${model.provider}:${model.modelId}` === selectedModelKey,
    );
    if (stillAvailable) return;
    const preferred = models.find((model) => model.primary) ?? models[0];
    if (preferred) setSelectedModelKey(`${preferred.provider}:${preferred.modelId}`);
  }, [models, open, selectedModelKey]);

  const modelsError = modelsQ.error ? describeError(modelsQ.error) : null;
  const noUsableModel = !modelsQ.isLoading && !modelsQ.isError && models.length === 0;

  const qtyOf = (c: string) => sumChannelBreakdown(fmtQty[c]);
  const activeChannels = channels.filter((c) => enabled[c] && qtyOf(c) > 0);
  const total = activeChannels.reduce((s, c) => s + qtyOf(c), 0);
  const allowanceFor = (c: PlanChannel) =>
    Math.max(
      0,
      (volumetry?.monthlyQuota[c] ?? 0) +
        (volumetry?.approvedOverage?.[c] ?? 0) -
        (volumetry?.generatedThisMonth[c] ?? 0),
    );
  const overageItems: OverageItem[] = activeChannels
    .map((c) => {
      const allowance = allowanceFor(c);
      const requested = qtyOf(c);
      return { channel: c, quota: allowance, requested, overage: requested - allowance };
    })
    .filter((it) => it.overage > 0);
  /**
   * Excedente liberado sem aprovação: autoridade do usuário (Super Admin /
   * Owner / Admin) ou política de volumetria livre no cliente/workspace.
   */
  const overageAllowed =
    Boolean(volumetry?.canBypassOverage) || volumetry?.overagePolicy === "warn";
  const missingFormats = channels.filter((c) => enabled[c] && qtyOf(c) === 0);

  const setFormatQty = (c: string, f: ContentFormat, n: number) =>
    setFmtQty((prev) => {
      const bucket = { ...(prev[c] ?? {}) };
      const qty = Math.max(0, Math.min(60, Math.round(n || 0)));
      if (qty > 0) bucket[f] = qty;
      else delete bucket[f];
      return { ...prev, [c]: bucket };
    });

  const submit = () => {
    if (!organization) return;
    const chosen = models.find(
      (model) => `${model.provider}:${model.modelId}` === selectedModelKey,
    );
    onGenerate({
      organization,
      theme: theme.trim(),
      briefingId: briefingId === "__none" ? null : briefingId,
      selection: activeChannels.map((c) => ({
        channel: c,
        quantity: qtyOf(c),
        formats: CONTENT_FORMATS.filter((f) => (fmtQty[c]?.[f] ?? 0) > 0),
        formatQuotas: fmtQty[c] ?? {},
      })),
      selectedModel: chosen ? { provider: chosen.provider, modelId: chosen.modelId } : null,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex h-dvh w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[34rem]"
        overlayClassName="bg-foreground/20 backdrop-blur-[2px]"
      >
        <SheetHeader className="border-b border-border/60 px-6 py-5 pr-12">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <SheetTitle>Gerar nova pauta</SheetTitle>
              <SheetDescription>Configure o escopo, os canais e os formatos</SheetDescription>
            </div>
          </div>
        </SheetHeader>

            <ol aria-label="Etapas da geração" className="grid grid-cols-2 gap-3 px-6 pt-5">
              {STEPS.map((s, i) => (
                <li
                  key={s}
                  aria-current={i === step ? "step" : undefined}
                  className="min-w-0"
                >
                  <div
                    className={`h-1 rounded-full ${i <= step ? "bg-ai" : "bg-muted"}`}
                  />
                  <div
                    className={`mt-1.5 truncate text-[11px] font-medium ${
                      i === step
                        ? "text-ai"
                        : i < step
                          ? "text-foreground"
                          : "text-muted-foreground"
                    }`}
                  >
                    {i + 1}. {s}
                  </div>
                </li>
              ))}
            </ol>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
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
                    <div className="rounded-lg border border-ai/20 bg-ai/5 px-3 py-3">
                      <p className="text-xs font-semibold text-foreground">
                        Contexto: Briefing + Brain
                      </p>
                      <p className="mt-1 text-xs font-medium">
                        {currentBriefing
                          ? `Briefing atual do cliente${
                              currentBriefing.completion == null
                                ? ""
                                : ` — ${currentBriefing.completion}% completo`
                            }`
                          : "Briefing atual do cliente"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {currentBriefing?.createdAt
                          ? `Atualizado em ${new Date(currentBriefing.createdAt).toLocaleString("pt-BR")}`
                          : "A IA usa o briefing do cliente automaticamente."}
                      </p>
                    </div>
                    {briefings.length > 1 ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowBriefingPicker((v) => !v)}
                          className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {showBriefingPicker
                            ? "Usar o briefing atual"
                            : "Usar uma versão anterior do briefing"}
                        </button>
                        {showBriefingPicker ? (
                          <Select value={briefingId} onValueChange={setBriefingId}>
                            <SelectTrigger className="h-10">
                              <SelectValue placeholder="Briefing atual" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none">Briefing atual (recomendado)</SelectItem>
                              {briefings.map((b) => (
                                <SelectItem key={b.id} value={b.id}>
                                  {b.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : null}
                      </>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Modelo de IA
                    </label>
                    <Select
                      value={selectedModelKey}
                      onValueChange={setSelectedModelKey}
                      disabled={modelsQ.isLoading || modelsQ.isError || models.length === 0}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue
                          placeholder={
                            modelsQ.isLoading
                              ? "Carregando modelos…"
                              : modelsQ.isError
                                ? "Não foi possível carregar"
                                : noUsableModel
                                  ? "Nenhum modelo disponível"
                                  : "Selecione um modelo"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {models.map((model) => (
                          <SelectItem
                            key={`${model.provider}:${model.modelId}`}
                            value={`${model.provider}:${model.modelId}`}
                          >
                            {model.label}
                            {model.role === "primary"
                              ? " · padrão"
                              : model.role === "fallback"
                                ? " · fallback"
                                : " · conectado"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {modelsError ? (
                      <div
                        role="alert"
                        className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
                      >
                        <span>{modelsError}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 shrink-0"
                          onClick={() => modelsQ.refetch()}
                        >
                          Tentar novamente
                        </Button>
                      </div>
                    ) : noUsableModel ? (
                      <p role="alert" className="text-xs text-destructive">
                        Nenhuma conexão de IA utilizável. Revise as chaves e os provedores em Conexões.
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Somente modelos das conexões ativas deste workspace são exibidos.
                      </p>
                    )}
                  </div>

                  <div className="h-px bg-border/60" />

                  <PautaOrganizationField
                    brandId={brandId}
                    clientId={clientId}
                    value={org}
                    onChange={setOrg}
                    allowNone={false}
                  />
                  {!organization ? (
                    <p className="text-[11px] text-muted-foreground">
                      Escolha um projeto existente ou informe o nome do novo projeto para continuar.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {step === 1 ? (
                <div className="space-y-4 py-2">
                  <div>
                    <h3 className="text-sm font-semibold">Canais e formatos</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ative os canais e distribua a quantidade entre os formatos.
                    </p>
                  </div>
                  {channels.map((c) => {
                    const quota = volumetry?.monthlyQuota[c] ?? 0;
                    const generated = volumetry?.generatedThisMonth[c] ?? 0;
                    const available = Math.max(0, quota - generated);
                    return (
                      <div
                        key={c}
                        className={`rounded-lg border p-4 transition-colors ${
                          enabled[c] ? "border-primary/30 bg-primary/[0.025]" : "border-border/60"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={!!enabled[c]}
                            onCheckedChange={(v) => setEnabled((p) => ({ ...p, [c]: !!v }))}
                            aria-label={PLAN_CHANNEL_LABEL[c]}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold">{PLAN_CHANNEL_LABEL[c]}</div>
                            <div className="text-[11px] text-muted-foreground tabular-nums">
                              {generated} geradas · {available} disponíveis de {quota}
                            </div>
                          </div>
                          <span className="text-xs font-semibold tabular-nums">
                            {enabled[c] ? qtyOf(c) : 0} peças
                          </span>
                        </div>
                        {enabled[c] ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {formatsForChannel(c).map((f) => (
                              <div
                                key={f}
                                className="flex min-h-10 items-center justify-between gap-3 rounded-md bg-muted/60 px-3 py-2"
                              >
                                <span className="text-xs font-medium">{CONTENT_FORMAT_LABEL[f]}</span>
                                <Stepper
                                  value={fmtQty[c]?.[f] ?? 0}
                                  min={0}
                                  max={60}
                                  label={`${CONTENT_FORMAT_LABEL[f]} em ${PLAN_CHANNEL_LABEL[c]}`}
                                  onChange={(n) => setFormatQty(c, f, n)}
                                />
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {overageItems.length ? (
                    <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                      <div className="flex gap-2 text-xs text-amber-600 dark:text-amber-400">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <p className="font-medium">
                            {overageAllowed ? "Excedente liberado" : "Excedente de volumetria"}
                          </p>
                          <p className="mt-1 tabular-nums">
                            {overageItems
                              .map((it) => `${PLAN_CHANNEL_LABEL[it.channel]} +${it.overage}`)
                              .join(" · ")}
                          </p>
                        </div>
                      </div>
                      {!overageAllowed ? (
                        <>
                          <Input
                            value={justification}
                            onChange={(e) => setJustification(e.target.value)}
                            placeholder="Justificativa para o gestor (opcional)"
                            className="h-9"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={requestingOverage}
                            onClick={() => onRequestOverage?.(overageItems, justification.trim())}
                            className="gap-1.5"
                          >
                            {requestingOverage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            Solicitar liberação
                          </Button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {missingFormats.length ? (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Selecione ao menos um formato para:{" "}
                      {missingFormats.map((c) => PLAN_CHANNEL_LABEL[c]).join(", ")}.
                    </p>
                  ) : null}
                  {generationError ? (
                    <div
                      role="alert"
                      className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>{generationError}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="border-t border-border/60 bg-muted/30 px-6 py-4">
              <div className="mb-3 flex items-center justify-between px-1 text-xs">
                <span className="text-muted-foreground">
                  Total estimado <strong className="ml-1 text-foreground tabular-nums">{total} peças</strong>
                </span>
                <span className="font-medium text-primary">Continua em segundo plano</span>
              </div>
              <SheetFooter className="gap-2 sm:justify-between sm:space-x-0">
                <Button
                  variant="ghost"
                  onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}
                  className="gap-1"
                >
                  {step === 0 ? (
                    "Cancelar"
                  ) : (
                    <>
                      <ArrowLeft className="h-4 w-4" /> Voltar
                    </>
                  )}
                </Button>
                {step < STEPS.length - 1 ? (
                  <Button
                    className="gap-1"
                    disabled={submitting ||
                      (step === 0 &&
                        (!organization ||
                          modelsQ.isLoading ||
                          modelsQ.isError ||
                          models.length === 0 ||
                          !selectedModelKey)) ||
                      (step === 1 && total === 0)
                    }
                    onClick={() => setStep(step + 1)}
                  >
                    Continuar <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    variant="ai"
                    className="gap-2"
                    disabled={
                      submitting ||
                      !organization ||
                      total === 0 ||
                      missingFormats.length > 0 ||
                      (overageItems.length > 0 && !overageAllowed)
                    }
                    onClick={submit}
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {submitting ? "Iniciando…" : `Gerar ${total} peças`}
                  </Button>
                )}
              </SheetFooter>
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                A geração continuará em segundo plano mesmo se você fechar este painel.
              </p>
            </div>
      </SheetContent>
    </Sheet>
  );
}
