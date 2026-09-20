import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Activity, AlertCircle, AlertTriangle, Bot, CheckCircle2, ChevronDown, Copy, Info, Loader2, Mail, RefreshCw, Search, ServerCog, ShieldCheck } from "lucide-react";
import { listSystemLogs, type LogLevel, type LogSource, type SystemLogEntry } from "@/lib/logs.functions";
import { useActiveContext } from "@/hooks/use-active-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageKpi, PageKpiGrid } from "@/components/ui/page-kpi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { SettingsPageState } from "@/components/settings/settings-page-state";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";

export const SOURCE_META: Record<LogSource, { label: string; icon: typeof Bot; color: string }> = {
  system: { label: "Sistema", icon: ServerCog, color: "text-rose-500" },
  critical_action: { label: "Ações críticas", icon: ShieldCheck, color: "text-amber-500" },
  message: { label: "Mensagens", icon: Mail, color: "text-emerald-500" },
  ai_job: { label: "IA", icon: Bot, color: "text-violet-500" },
  activity: { label: "Ações", icon: Activity, color: "text-sky-500" },
};

const LEVEL_META: Record<LogLevel, { label: string; icon: typeof Info; className: string; badgeVariant: "destructive" | "default" | "secondary" | "outline" }> = {
  error: { label: "Erro", icon: AlertCircle, className: "text-rose-500", badgeVariant: "destructive" },
  warn: { label: "Aviso", icon: AlertTriangle, className: "text-amber-500", badgeVariant: "default" },
  info: { label: "Info", icon: Info, className: "text-sky-500", badgeVariant: "secondary" },
  success: { label: "Sucesso", icon: CheckCircle2, className: "text-emerald-500", badgeVariant: "outline" },
};

export function LogViewer({ sources: allowedSources, title, description, queryKey }: { sources: LogSource[]; title: string; description: string; queryKey: string }) {
  const { brandId, clientId } = useActiveContext();
  const load = useServerFn(listSystemLogs);
  const [levels, setLevels] = useState<Set<LogLevel>>(new Set(["error", "warn", "info", "success"]));
  const [tab, setTab] = useState<"all" | LogSource>("all");
  const [search, setSearch] = useState("");
  const [scopeToClient, setScopeToClient] = useState(false);
  const sources = tab === "all" || !allowedSources.includes(tab) ? allowedSources : [tab];
  const q = useQuery({
    queryKey: [queryKey, brandId, scopeToClient ? clientId : null, sources.join(","), Array.from(levels).sort().join(","), search],
    queryFn: () => load({ data: { brandId, clientId: scopeToClient ? clientId : null, sources, levels: Array.from(levels), search: search.trim() || undefined, limit: 300 } }),
    refetchOnWindowFocus: false,
  });
  const entries = useMemo(() => q.data?.entries ?? [], [q.data]);
  const unavailable = q.data?.health.filter((item) => item.status !== "available") ?? [];
  const counts = useMemo(() => {
    const result = { total: entries.length, error: 0, warn: 0 };
    for (const entry of entries) if (entry.level === "error" || entry.level === "warn") result[entry.level] += 1;
    return result;
  }, [entries]);
  const toggleLevel = (level: LogLevel) => setLevels((previous) => {
    const next = new Set(previous);
    if (next.has(level)) next.delete(level); else next.add(level);
    return next;
  });

  if (!brandId) return <SettingsPageState kind="empty" title="Selecione um workspace" description="Escolha um workspace para consultar sua auditoria." />;

  return <div className="space-y-4">
    <PageKpiGrid columns={4}>
      <PageKpi label="Eventos" value={counts.total} status="neutral" />
      <PageKpi label="Erros" value={counts.error} status="danger" />
      <PageKpi label="Avisos" value={counts.warn} status="warning" />
      <PageKpi label="Fontes indisponíveis" value={unavailable.length} status={unavailable.length ? "danger" : "success"} />
    </PageKpiGrid>
    {unavailable.length ? <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /><div><p className="font-medium">Auditoria incompleta</p><p className="text-xs text-muted-foreground">{unavailable.map((item) => SOURCE_META[item.source].label).join(", ")} indisponível. Os demais registros continuam visíveis.</p></div></div> : null}
    <Card>
      <CardHeader className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex-1"><CardTitle className="text-base">{title}</CardTitle><p className="mt-0.5 text-xs text-muted-foreground">{description}</p></div><Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}Atualizar</Button></CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {allowedSources.length > 1 ? <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}><TabsList><TabsTrigger value="all">Todos</TabsTrigger>{allowedSources.map((source) => <TabsTrigger key={source} value={source}>{SOURCE_META[source].label}</TabsTrigger>)}</TabsList></Tabs> : <span />}
          <div className="flex flex-wrap items-center gap-2">{(Object.keys(LEVEL_META) as LogLevel[]).map((level) => { const item = LEVEL_META[level]; return <Toggle key={level} pressed={levels.has(level)} onPressedChange={() => toggleLevel(level)} size="sm" aria-label={item.label} className="gap-1.5 data-[state=on]:bg-muted"><item.icon className={`h-3.5 w-3.5 ${item.className}`} /><span className="text-xs">{item.label}</span></Toggle>; })}{clientId ? <Toggle pressed={scopeToClient} onPressedChange={setScopeToClient} size="sm" className="text-xs data-[state=on]:bg-muted">Só este cliente</Toggle> : null}</div>
        </div>
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filtrar por texto, ID, categoria ou correlação…" className="pl-9" /></div>
        {q.isLoading ? <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : q.isError ? <SettingsPageState kind="error" title="Não foi possível carregar os registros" description={q.error instanceof Error ? q.error.message : "Tente novamente para consultar a auditoria."} actionLabel="Tentar novamente" onAction={() => void q.refetch()} /> : entries.length === 0 ? <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed"><Info className="h-6 w-6 text-muted-foreground" /><p className="text-sm text-muted-foreground">Nenhum evento encontrado com os filtros atuais.</p></div> : <ScrollArea className="max-h-[65vh] rounded-lg border"><ul className="divide-y">{entries.map((entry) => <LogRow key={entry.id} entry={entry} />)}</ul></ScrollArea>}
      </CardContent>
    </Card>
  </div>;
}

function LogRow({ entry }: { entry: SystemLogEntry }) {
  const [open, setOpen] = useState(false);
  const level = LEVEL_META[entry.level];
  const source = SOURCE_META[entry.source];
  const date = new Date(entry.timestamp);
  const absolute = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }).format(date);
  return <li className="px-3 py-2.5 text-sm hover:bg-muted/40"><Collapsible open={open} onOpenChange={setOpen}><div className="flex items-start gap-3"><level.icon className={`mt-0.5 h-4 w-4 shrink-0 ${level.className}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><span className="font-medium">{entry.title}</span><Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px] font-normal"><source.icon className={`h-2.5 w-2.5 ${source.color}`} />{source.label}</Badge><Badge variant={level.badgeVariant} className="px-1.5 py-0 text-[10px] font-normal">{level.label}</Badge></div>{entry.subtitle ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{entry.subtitle}</p> : null}<p className="mt-1 text-[11px] text-muted-foreground">{absolute} · {formatDistanceToNow(date, { addSuffix: true, locale: ptBR })}{entry.correlation_id ? ` · ${entry.correlation_id}` : ""}</p></div><CollapsibleTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Ver detalhes"><ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} /></Button></CollapsibleTrigger></div><CollapsibleContent className="mt-2 pl-7"><div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-1.5"><span className="font-mono text-[10px] text-muted-foreground">{entry.id}</span><Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={() => { void navigator.clipboard.writeText(JSON.stringify(entry, null, 2)); toast.success("Evidência copiada"); }}><Copy className="h-3 w-3" />Copiar evidência</Button></div><pre className="mt-2 max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">{JSON.stringify(entry.meta, null, 2)}</pre></CollapsibleContent></Collapsible></li>;
}
