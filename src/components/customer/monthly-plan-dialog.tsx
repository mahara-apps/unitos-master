import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  brandId: string;
  clientId: string;
  disabled?: boolean;
  disabledReason?: string;
};

export function MonthlyPlanDialog({ brandId, clientId, disabled, disabledReason }: Props) {
  const [open, setOpen] = useState(false);
  const [quantidade, setQuantidade] = useState(12);
  const [periodo, setPeriodo] = useState("próximo mês");
  const [pending, setPending] = useState(false);

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
        body: JSON.stringify({ brandId, clientId, quantidade, periodo }),
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-fuchsia-500" /> Plano do Mês
          </DialogTitle>
          <DialogDescription>
            Planejador estratégico + Copywriter sênior + Direção de arte, ancorados no Brand Hub
            desta conta. As peças aparecem no pipeline em <b>Ideia</b>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="qtd">Quantidade de peças</Label>
            <Input
              id="qtd"
              type="number"
              min={3}
              max={30}
              value={quantidade}
              onChange={(e) => setQuantidade(Math.max(3, Math.min(30, Number(e.target.value) || 12)))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="periodo">Período</Label>
            <Input
              id="periodo"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              placeholder="Ex.: próximas 4 semanas"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            onClick={launch}
            disabled={pending}
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