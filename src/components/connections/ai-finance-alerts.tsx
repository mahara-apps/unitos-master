import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { getAiFinance, saveAiBudgetThresholds, verifyAiFinancialAvailability } from "@/lib/ai-finance.functions";
import { AI_PROVIDER_LABELS, budgetAlertLevel, financialMessage } from "@/lib/ai-finance";
import { aiErrorMessage } from "@/lib/ai-error-display";

type Provider = "openai" | "anthropic" | "gemini" | "groq";

export function AiFinanceAlerts({ brandId, spent, budget, configuration = false }: {
  brandId: string; spent: number; budget: number; configuration?: boolean;
}) {
  const queryClient = useQueryClient();
  const fetchFinance = useServerFn(getAiFinance);
  const saveThresholds = useServerFn(saveAiBudgetThresholds);
  const verifyFinance = useServerFn(verifyAiFinancialAvailability);
  const queryKey = ["ai-finance", brandId];
  const finance = useQuery({ queryKey, queryFn: () => fetchFinance({ data: { brandId } }), refetchInterval: 30_000 });
  const [draft, setDraft] = useState<string[] | null>(null);
  const [verifyProvider, setVerifyProvider] = useState<Provider | null>(null);
  const thresholds = finance.data?.thresholds ?? [80, 95, 100];
  const values = draft ?? thresholds.map(String);
  const level = budgetAlertLevel(spent, budget, thresholds);
  const save = useMutation({
    mutationFn: () => saveThresholds({ data: { brandId, thresholds: [Number(values[0]), Number(values[1]), Number(values[2])] } }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey }); setDraft(null); toast.success("Faixas de aviso salvas"); },
    onError: (error) => toast.error(aiErrorMessage(error, "Não foi possível salvar os avisos.")),
  });
  const verify = useMutation({
    mutationFn: (provider: Provider) => verifyFinance({ data: { brandId, provider, confirmPaidCheck: true } }),
    onSuccess: () => { setVerifyProvider(null); void queryClient.invalidateQueries({ queryKey }); toast.success("Disponibilidade confirmada; provedor liberado"); },
    onError: (error) => { void queryClient.invalidateQueries({ queryKey }); toast.error(aiErrorMessage(error, "A IA não confirmou disponibilidade.")); },
  });
  if (finance.isError) return <div role="alert" className="border-l-2 border-destructive py-2 pl-3 text-sm text-destructive">Não foi possível consultar os avisos financeiros de IA. <Button variant="ghost" size="sm" onClick={() => void finance.refetch()}>Tentar novamente</Button></div>;
  return <div className="space-y-3">
    {finance.data?.states.filter((state) => state.blocked).map((state) => <div key={state.provider} role="alert" className="flex flex-wrap items-center gap-3 border-l-2 border-destructive py-3 pl-3">
      <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1 text-sm"><p className="font-semibold">{AI_PROVIDER_LABELS[state.provider] ?? state.provider} · indisponível por motivo financeiro</p><p className="text-muted-foreground">{financialMessage(state.provider, state.reason ?? "provider_credit")}</p></div>
      {finance.data.canManage && <Button size="sm" variant="outline" disabled={verify.isPending} onClick={() => setVerifyProvider(state.provider as Provider)}><RefreshCw className="mr-2 h-4 w-4" />Verificar disponibilidade</Button>}
    </div>)}
    {level !== null && !configuration && <div role="status" className="border-l-2 border-border py-2 pl-3 text-sm"><p className="font-medium">Consumo de IA atingiu a faixa de {level}% do orçamento mensal</p><p className="text-muted-foreground">US$ {spent.toFixed(2)} registrados de US$ {budget.toFixed(2)}. Não representa saldo do provedor.</p></div>}
    {configuration && finance.data?.canManage && <section className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">Avisos de orçamento mensal</h3>
      <div className="flex flex-wrap items-end gap-3">{values.map((value, index) => <div key={index} className="w-28"><Label htmlFor={`ai-budget-${index}`}>Aviso {index + 1} (%)</Label><Input id={`ai-budget-${index}`} type="number" min={1} max={100} value={value} onChange={(event) => { const next = [...values]; next[index] = event.target.value; setDraft(next); }} /></div>)}<Button variant="outline" size="sm" onClick={() => save.mutate()} disabled={save.isPending || !draft}><Save className="mr-2 h-4 w-4" />Salvar avisos</Button></div>
      <p className="text-xs text-muted-foreground">Consumo estimado registrado no Unitos, não saldo do provedor. As faixas apenas avisam.</p>
    </section>}
    <Dialog open={verifyProvider !== null} onOpenChange={(open) => { if (!open && !verify.isPending) setVerifyProvider(null); }}>
      <DialogContent><DialogHeader><DialogTitle>Verificar {verifyProvider ? AI_PROVIDER_LABELS[verifyProvider] : "IA"}</DialogTitle><DialogDescription>Após repor os créditos ou revisar o limite no provedor, confirme uma geração curta. Esta verificação pode consumir tokens e gerar cobrança no provedor.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={verify.isPending} onClick={() => setVerifyProvider(null)}>Cancelar</Button><Button disabled={verify.isPending} onClick={() => { if (verifyProvider) verify.mutate(verifyProvider); }}><RefreshCw className="mr-2 h-4 w-4" />{verify.isPending ? "Verificando…" : "Confirmar verificação"}</Button></DialogFooter></DialogContent>
    </Dialog>
  </div>;
}