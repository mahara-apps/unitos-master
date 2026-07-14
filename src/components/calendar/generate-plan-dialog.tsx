import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

type Props = {
  brandId: string;
  clientId: string | null;
  onGenerated?: () => void;
};

const LOADING_STEPS = [
  "Buscando contexto da marca…",
  "Consultando personas e voz…",
  "Rascunhando conceitos estratégicos…",
  "Distribuindo no calendário…",
];

export function GeneratePlanDialog({ brandId, clientId, onGenerated }: Props) {
  const [open, setOpen] = useState(false);
  const [postsPerWeek, setPostsPerWeek] = useState(3);
  const [startFrom, setStartFrom] = useState<"current-remaining" | "next-month">("next-month");
  const [direction, setDirection] = useState("");
  const [pending, setPending] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  const { totalPosts, weeks, periodo, meses } = useMemo(() => {
    if (startFrom === "current-remaining") {
      const now = new Date();
      const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const daysLeft = Math.max(1, Math.ceil((endMonth.getTime() - now.getTime()) / 86400000));
      const w = Math.max(1, Math.round(daysLeft / 7));
      return {
        weeks: w,
        totalPosts: Math.max(3, postsPerWeek * w),
        periodo: "restante do mês atual",
        meses: 1,
      };
    }
    return {
      weeks: 4,
      totalPosts: Math.max(3, postsPerWeek * 4),
      periodo: "próximo mês",
      meses: 1,
    };
  }, [postsPerWeek, startFrom]);

  async function launch() {
    if (!clientId) {
      toast.error("Selecione um cliente para gerar o plano.");
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
      toast.error((err as Error).message ?? "Não foi possível iniciar o plano.");
    } finally {
      clearInterval(interval);
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
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

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ppw">Quantos posts por semana?</Label>
            <Select value={String(postsPerWeek)} onValueChange={(v) => setPostsPerWeek(Number(v))}>
              <SelectTrigger id="ppw"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} {n === 1 ? "post" : "posts"} por semana
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="start">A partir de quando?</Label>
            <Select value={startFrom} onValueChange={(v) => setStartFrom(v as typeof startFrom)}>
              <SelectTrigger id="start"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="current-remaining">Restante do mês atual</SelectItem>
                <SelectItem value="next-month">Próximo mês</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="dir">Direcionamento extra (opcional)</Label>
            <Textarea
              id="dir"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              placeholder="Ex.: Foco no lançamento da coleção de inverno, priorizar Reels educativos…"
              rows={4}
              maxLength={2000}
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 text-xs">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
            <div className="text-muted-foreground">
              Vamos gerar <span className="font-semibold text-foreground">{totalPosts} entradas</span> em ~{weeks} semana{weeks === 1 ? "" : "s"} ({periodo}).
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            onClick={launch}
            disabled={pending}
            className="gap-2 border-0 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 text-white hover:opacity-95 min-w-[180px]"
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