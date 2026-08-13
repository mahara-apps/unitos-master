import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, AlertTriangle, Pencil, CalendarDays } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getBrandHub } from "@/lib/brand-hub.functions";
import {
  getWeeksInMonth,
  getWeeksForPeriod,
  normalizeVolumetryBasis,
  resolveQuota,
} from "@/lib/monthly-plan-fields";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  brandId: string;
  clientId: string;
  disabled?: boolean;
  disabledReason?: string;
};


const CHANNEL_LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  facebook: "Facebook",
};

export function MonthlyPlanDialog({ brandId, clientId, disabled, disabledReason }: Props) {
  const [open, setOpen] = useState(false);
  const [meses, setMeses] = useState(1);
  const [manualMode, setManualMode] = useState(false);
  const [manualQty, setManualQty] = useState(12);
  const [pending, setPending] = useState(false);
  // null = auto (calculado pelo calendário); 4 ou 5 = override manual
  const [weeksOverride, setWeeksOverride] = useState<number | null>(null);

  const fetchHub = useServerFn(getBrandHub);
  const hubQ = useQuery({
    queryKey: ["brand-hub", brandId, clientId],
    queryFn: () => fetchHub({ data: { brandId, clientId } }),
    enabled: open,
  });
  const volumetry = hubQ.data?.brand_hub?.volumetry ?? {};
  const basis = normalizeVolumetryBasis(
    (hubQ.data?.brand_hub as { volumetry_basis?: unknown } | undefined)?.volumetry_basis,
  );

  // Semanas calculadas pelo calendário real do mês-alvo (próximo mês).
  const autoWeeksFirstMonth = useMemo(() => {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return getWeeksInMonth(target.getFullYear(), target.getMonth());
  }, []);

  const weeksFirstMonth = weeksOverride ?? autoWeeksFirstMonth;

  // Total de semanas em todos os meses do período (para o cálculo de peças).
  const totalWeeks = useMemo(
    () => getWeeksForPeriod(meses, { override: weeksOverride ?? undefined }),
    [meses, weeksOverride],
  );

  const perMonthByChannel = Object.entries(volumetry)
    .map(([k, v]) => ({ channel: k, ...resolveQuota(Number(v) || 0, basis, weeksFirstMonth) }))
    .filter((c) => c.perMonth > 0);
  const totalPerMonth = perMonthByChannel.reduce((a, c) => a + c.perMonth, 0);
  const hasVolumetry = totalPerMonth > 0;

  const periodo =
    meses === 1 ? "próximo mês" : `próximos ${meses} meses`;
  const totalPecas =
    manualMode || !hasVolumetry
      ? manualQty * meses
      : basis === "monthly"
        ? totalPerMonth * meses
        : Math.round(totalWeeks * perMonthByChannel.reduce((s, c) => s + c.perWeek, 0));
  const channelMix = !manualMode && hasVolumetry
    ? perMonthByChannel.reduce<Record<string, number>>((acc, c) => {
        acc[c.channel] = basis === "monthly" ? c.perMonth * meses : Math.round(c.perWeek * totalWeeks);
        return acc;
      }, {})
    : undefined;

  async function launch() {
    setPending(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");
      const res = await fetch("/api/jobs/monthly-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          brandId,
          clientId,
          quantidade: totalPecas,
          periodo,
          meses,
          channelMix,
          weeksPerMonth: weeksFirstMonth,
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Falha (${res.status})`);
      }
      toast.success("Plano do mês em execução", {
        description: "Você pode navegar livremente — acompanhe o progresso no orbe no topo.",
      });
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message ?? "Não foi possível iniciar o plano.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !disabled && setOpen(v)}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          aria-disabled={disabled}
          className="gap-1.5 border-0 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)] hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Gerar Plano do Mês
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-fuchsia-500" /> Plano do Mês
          </DialogTitle>
          <DialogDescription>
            O planejador estratégico e o copywriter geram <b>headlines e legendas</b> (apenas texto)
            e distribuem as peças pelos dias úteis do período no <b>calendário</b> e no <b>pipeline</b>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="meses">Quantidade de meses</Label>
            <Select value={String(meses)} onValueChange={(v) => setMeses(Number(v))}>
              <SelectTrigger id="meses">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6].map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m === 1 ? "1 mês" : `${m} meses`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Seletor de semanas — calculado pelo calendário, ajustável manualmente */}
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1 text-xs text-muted-foreground">
              <span className="text-foreground font-medium">{weeksFirstMonth}</span> semanas/mês
              {!weeksOverride && autoWeeksFirstMonth === 5 && (
                <span className="ml-1 text-emerald-500">(mês de 5 semanas)</span>
              )}
              {!weeksOverride && autoWeeksFirstMonth === 4 && (
                <span className="ml-1 text-muted-foreground/70">(auto)</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {([null, 4, 5] as const).map((w) => (
                <button
                  key={w ?? "auto"}
                  type="button"
                  onClick={() => setWeeksOverride(w)}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    weeksOverride === w
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {w === null ? "Auto" : `${w} sem`}
                </button>
              ))}
            </div>
          </div>

          {!manualMode && hasVolumetry && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Mix por canal (do briefing)
                </Label>
                <button
                  type="button"
                  onClick={() => setManualMode(true)}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" /> Ajustar manualmente
                </button>
              </div>
              <ul className="grid gap-1 text-sm">
                {perMonthByChannel.map((c) => (
                  <li key={c.channel} className="flex items-center justify-between">
                    <span className="text-foreground">
                      {CHANNEL_LABEL[c.channel] ?? c.channel}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {basis === "monthly" ? (
                        <span className="font-medium text-foreground">{c.perMonth}/mês</span>
                      ) : (
                        <>
                          {c.perWeek}/sem →{" "}
                          <span className="font-medium text-foreground">{c.perMonth}</span>/mês
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                Total: <span className="font-medium text-foreground">{totalPecas}</span>{" "}
                peças em {periodo}.
                {meses > 1 && (
                  <span className="ml-1">
                    ({totalWeeks} semanas no total)
                  </span>
                )}
              </div>
            </div>
          )}

          {!hasVolumetry && !hubQ.isLoading && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                Sem volumetria definida.{" "}
                <Link
                  to="/customers/$customerId/briefing"
                  params={{ customerId: clientId }}
                  className="underline"
                  onClick={() => setOpen(false)}
                >
                  Configurar no briefing
                </Link>{" "}
                ou informe a quantidade manualmente abaixo.
              </div>
            </div>
          )}

          {(manualMode || !hasVolumetry) && (
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="qtd">Peças por mês</Label>
                {hasVolumetry && (
                  <button
                    type="button"
                    onClick={() => setManualMode(false)}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Usar volumetria
                  </button>
                )}
              </div>
              <Input
                id="qtd"
                type="number"
                min={3}
                max={30}
                value={manualQty}
                onChange={(e) =>
                  setManualQty(Math.max(3, Math.min(30, Number(e.target.value) || 12)))
                }
              />
              <p className="text-xs text-muted-foreground">
                Total: <span className="font-medium text-foreground">{totalPecas}</span>{" "}
                peças em {periodo}.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            onClick={launch}
            disabled={pending || totalPecas < 3}
            className="gap-1.5 border-0 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 text-white hover:opacity-95"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Iniciar geração
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
