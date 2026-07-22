import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, Info, Minus, Plus, UserCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listBrandAssigneesFn } from "@/lib/content.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CHANNELS, CHANNEL_STYLES } from "@/components/content/stage-colors";
import { cn } from "@/lib/utils";

// Canais suportados pelo backend (normalizeChannel em monthly-plan.ts).
// Excluímos "threads" e "graphic" que caem em fallback ("instagram") no backend.
const PLAN_CHANNELS = ["instagram", "tiktok", "youtube", "linkedin", "facebook", "x", "blog"] as const;
type PlanChannel = (typeof PLAN_CHANNELS)[number];

const DEFAULT_MIX: Record<PlanChannel, number> = {
  instagram: 8,
  tiktok: 0,
  youtube: 0,
  linkedin: 0,
  facebook: 0,
  x: 0,
  blog: 0,
};

type Props = {
  brandId: string;
  clientId: string | null;
  onGenerated?: () => void;
  /** When provided, the dialog is fully controlled and no built-in trigger button is rendered. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const LOADING_STEPS = [
  "Buscando contexto da marca…",
  "Consultando personas e voz…",
  "Rascunhando conceitos estratégicos…",
  "Distribuindo no calendário…",
];

export function GeneratePlanDialog({
  brandId,
  clientId,
  onGenerated,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: Props) {
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (v: boolean) => {
    if (isControlled) controlledOnOpenChange?.(v);
    else setUncontrolledOpen(v);
  };
  const [startFrom, setStartFrom] = useState<"current-remaining" | "next-month">("next-month");
  const [direction, setDirection] = useState("");
  const [pending, setPending] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [mix, setMix] = useState<Record<PlanChannel, number>>(DEFAULT_MIX);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);

  const fetchMembers = useServerFn(listBrandAssigneesFn);
  const { data: members } = useQuery({
    queryKey: ["brand-assignees", brandId],
    queryFn: () => fetchMembers({ data: { brandId } }),
    staleTime: 60_000,
    enabled: !!brandId && open,
  });
  useEffect(() => {
    if (assigneeId) return;
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      if (uid) setAssigneeId((prev) => prev ?? uid);
    });
  }, [assigneeId]);

  const totalPosts = useMemo(
    () => PLAN_CHANNELS.reduce((acc, c) => acc + (mix[c] || 0), 0),
    [mix],
  );
  const selectedCount = useMemo(
    () => PLAN_CHANNELS.filter((c) => (mix[c] || 0) > 0).length,
    [mix],
  );

  const { weeks, periodo, meses } = useMemo(() => {
    if (startFrom === "current-remaining") {
      const now = new Date();
      const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const daysLeft = Math.max(1, Math.ceil((endMonth.getTime() - now.getTime()) / 86400000));
      const w = Math.max(1, Math.round(daysLeft / 7));
      return { weeks: w, periodo: "restante do mês atual", meses: 1 };
    }
    return { weeks: 4, periodo: "próximo mês", meses: 1 };
  }, [startFrom]);

  function setChannelQty(id: PlanChannel, qty: number) {
    setMix((m) => ({ ...m, [id]: Math.max(0, Math.min(180, Math.round(qty || 0))) }));
  }
  function toggleChannel(id: PlanChannel, on: boolean) {
    setMix((m) => ({ ...m, [id]: on ? Math.max(1, m[id] || 4) : 0 }));
  }

  async function launch() {
    if (!clientId) {
      toast.error("Selecione um cliente para gerar o plano.");
      return;
    }
    if (totalPosts < 3) {
      toast.error("Selecione pelo menos 3 peças no total.");
      return;
    }
    setPending(true);
    setStepIdx(0);
    const interval = setInterval(() => {
      setStepIdx((i) => (i + 1) % LOADING_STEPS.length);
    }, 900);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");
      const channelMix = Object.fromEntries(
        PLAN_CHANNELS.filter((c) => (mix[c] || 0) > 0).map((c) => [c, mix[c]]),
      );
      const res = await fetch("/api/jobs/monthly-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          brandId,
          clientId,
          quantidade: totalPosts,
          periodo,
          meses,
          startFrom,
          direction: direction.trim() || undefined,
          channelMix,
          assigneeId: assigneeId ?? undefined,
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Falha (${res.status})`);
      }
      toast.success("Plano em execução", {
        description: "Você pode navegar livremente — acompanhe o progresso no topo.",
      });
      setOpen(false);
      onGenerated?.();
    } catch (err) {
      toast.error(describeError(err));
    } finally {
      clearInterval(interval);
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
      {isControlled ? null : (
        <DialogTrigger asChild>
        <Button
          size="sm"
          disabled={!clientId}
          title={!clientId ? "Selecione um cliente" : undefined}
          className="gap-1.5 border-0 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)] hover:opacity-95 disabled:opacity-60"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Gerar novo plano
        </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-fuchsia-500" />
            Gerar novo plano
          </DialogTitle>
          <DialogDescription>
            Os agentes estratégicos vão redigir headlines e legendas e distribuí-las nos dias úteis do período.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          <div className="grid gap-1.5">
            <Label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              Canais e volume no período
            </Label>
            <div className="grid gap-0.5 rounded-xl border border-border/60 bg-background/40 p-1.5">
              {PLAN_CHANNELS.map((id) => {
                const meta = CHANNELS.find((c) => c.id === id)!;
                const Icon = meta.icon;
                const qty = mix[id] || 0;
                const on = qty > 0;
                return (
                  <div
                    key={id}
                    className={cn(
                      "flex h-8 items-center gap-2.5 rounded-md px-1.5 transition-colors hover:bg-muted/40",
                      !on && "opacity-55",
                    )}
                    onClick={(e) => {
                      // Ignore clicks originating from the stepper
                      if ((e.target as HTMLElement).closest("[data-stepper]")) return;
                      toggleChannel(id, !on);
                    }}
                    role="button"
                  >
                    <Checkbox
                      className="h-3.5 w-3.5"
                      checked={on}
                      onCheckedChange={(v) => toggleChannel(id, Boolean(v))}
                      aria-label={`Incluir ${meta.label}`}
                    />
                    <span
                      className={cn(
                        "inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[10px] font-semibold uppercase tracking-wider",
                        CHANNEL_STYLES[id] ?? "border-border/60 bg-muted/40 text-foreground/80",
                      )}
                    >
                      <Icon className="h-2.5 w-2.5" />
                      {meta.label}
                    </span>
                    <div
                      data-stepper
                      className="ml-auto inline-flex h-6 items-stretch overflow-hidden rounded-md border border-border/60 bg-background"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        disabled={qty <= 0}
                        onClick={() => setChannelQty(id, qty - 1)}
                        aria-label={`Diminuir ${meta.label}`}
                        className="grid w-6 place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={180}
                        value={qty}
                        onChange={(e) => setChannelQty(id, Number(e.target.value))}
                        onWheel={(e) => {
                          if (document.activeElement !== e.currentTarget) return;
                          e.preventDefault();
                          setChannelQty(id, qty + (e.deltaY < 0 ? 1 : -1));
                        }}
                        className="w-8 border-x border-border/60 bg-transparent text-center text-xs font-medium tabular-nums outline-none [appearance:textfield] focus:bg-muted/40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <button
                        type="button"
                        disabled={qty >= 180}
                        onClick={() => setChannelQty(id, qty + 1)}
                        aria-label={`Aumentar ${meta.label}`}
                        className="grid w-6 place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="start" className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              A partir de quando?
            </Label>
            <Select value={startFrom} onValueChange={(v) => setStartFrom(v as typeof startFrom)}>
              <SelectTrigger id="start" className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="current-remaining">Restante do mês atual</SelectItem>
                <SelectItem value="next-month">Próximo mês</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="dir" className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              Direcionamento extra (opcional)
            </Label>
            <Textarea
              id="dir"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              placeholder="Ex.: Foco no lançamento da coleção de inverno, priorizar Reels educativos…"
              rows={2}
              maxLength={2000}
              className="text-xs"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="assignee" className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              <UserCircle2 className="h-3 w-3" />
              Responsável padrão
            </Label>
            <Select
              value={assigneeId ?? "me"}
              onValueChange={(v) => setAssigneeId(v === "me" ? null : v)}
            >
              <SelectTrigger id="assignee" className="h-8 text-xs">
                <SelectValue placeholder="Selecionar responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="me">Eu (usuário atual)</SelectItem>
                {(members ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Todas as peças geradas serão atribuídas a esta pessoa.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2.5 py-1.5 text-[11px]">
            <Info className="h-3 w-3 shrink-0 text-muted-foreground" />
            <div className="text-muted-foreground">
              {totalPosts < 3 || selectedCount === 0 ? (
                <>Selecione ao menos <span className="font-semibold text-foreground">3 peças</span> distribuídas em um ou mais canais.</>
              ) : (
                <><span className="font-semibold text-foreground">{totalPosts} peças</span> em <span className="font-semibold text-foreground">{selectedCount}</span> canal{selectedCount === 1 ? "" : "is"} · ~{weeks}sem · {periodo}</>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={launch}
            disabled={pending || totalPosts < 3 || selectedCount === 0}
            className="h-8 gap-2 border-0 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 text-white hover:opacity-95 min-w-[180px]"
          >
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="truncate">{LOADING_STEPS[stepIdx]}</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Gerar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}