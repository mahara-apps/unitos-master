import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Props = { brandId: string; clientId: string | null };

type StartMode = "rest_of_month" | "next_month";

function weeksRemainingInMonth(): number {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysLeft = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / (1000 * 3600 * 24)));
  return Math.max(1, Math.round((daysLeft / 7) * 10) / 10);
}

export function CalendarPlanDialog({ brandId, clientId }: Props) {
  const [open, setOpen] = useState(false);
  const [perWeek, setPerWeek] = useState(3);
  const [start, setStart] = useState<StartMode>("rest_of_month");
  const [guidance, setGuidance] = useState("");
  const [pending, setPending] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string>("");

  const weeks = useMemo(
    () => (start === "rest_of_month" ? weeksRemainingInMonth() : 4.33),
    [start],
  );
  const quantidade = Math.max(3, Math.round(perWeek * weeks));
  const periodo = start === "rest_of_month" ? "restante do mês atual" : "próximo mês";
  const weeksLabel = weeks < 4 ? `~${weeks.toFixed(1).replace(".0", "")} semanas` : "4 semanas";

  const disabled = !clientId;

  async function launch() {
    if (!clientId) return;
    setPending(true);
    setLoadingLabel("Autenticando sessão…");
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");
      setLoadingLabel("Buscando contexto do cliente…");
      await new Promise((r) => setTimeout(r, 300)); // sofisticação visual
      setLoadingLabel("Chamando planejador estratégico…");
      const res = await fetch("/api/jobs/monthly-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          brandId,
          clientId,
          quantidade,
          periodo,
          direcionamento: guidance.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Falha (${res.status})`);
      }
      toast.success("Plano em execução", {
        description:
          "Acompanhe o progresso no orbe no topo. As peças aparecem no calendário assim que forem geradas.",
      });
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message ?? "Não foi possível iniciar o plano.");
    } finally {
      setPending(false);
      setLoadingLabel("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && !disabled && setOpen(v)}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          disabled={disabled}
          title={disabled ? "Selecione um cliente para gerar um plano" : undefined}
          className="gap-1.5 border-0 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 text-white shadow-[0_10px_30px_-10px_rgba(217,70,239,0.6)] hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Gerar novo plano
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-fuchsia-500" />
            Novo plano de conteúdo
          </DialogTitle>
          <DialogDescription>
            Nossa IA usa o briefing, personas e voice card do cliente para gerar
            headlines, legendas e distribuí-las nos dias úteis do período escolhido.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="perWeek">Quantos posts por semana?</Label>
            <Select value={String(perWeek)} onValueChange={(v) => setPerWeek(Number(v))}>
              <SelectTrigger id="perWeek"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} post{n > 1 ? "s" : ""} por semana
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="start">A partir de quando?</Label>
            <Select value={start} onValueChange={(v) => setStart(v as StartMode)}>
              <SelectTrigger id="start"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rest_of_month">Restante do mês atual</SelectItem>
                <SelectItem value="next_month">Próximo mês</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="guidance">Direcionamento extra <span className="text-muted-foreground">(opcional)</span></Label>
            <Textarea
              id="guidance"
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              rows={3}
              maxLength={1200}
              placeholder="Ex: Foco no lançamento da coleção de inverno, com destaque em provas sociais e ofertas de pré-venda."
              className="resize-none text-sm"
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-fuchsia-500/20 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 p-3 text-xs">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fuchsia-500" />
            <p className="text-foreground/80">
              Vamos gerar <span className="font-semibold text-foreground">{quantidade} entradas</span>
              {" "}em <span className="font-medium text-foreground">{weeksLabel}</span>{" "}
              ({periodo}).
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            onClick={launch}
            disabled={pending}
            className="min-w-[180px] gap-2 border-0 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 text-white hover:opacity-95"
          >
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="truncate">{loadingLabel || "Gerando…"}</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Gerar plano
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}