import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Play, Circle, RotateCcw, Save, Eye, Pencil } from "lucide-react";
import type { AgentPromptRow } from "@/lib/agents.functions";
import { updateAgentPromptFn, resetAgentPromptFn } from "@/lib/agents.functions";
import {
  extractPromptVariables,
  getAgentMeta,
  toTitleCase,
} from "./agent-meta";

const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gpt-4o-mini",
  "gpt-4o",
  "claude-3.5-sonnet",
];

type Props = {
  agent: AgentPromptRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
};

export function AgentDrawer({ agent, open, onOpenChange }: Props) {
  const [model, setModel] = useState<string>("gemini-2.5-flash");
  const [active, setActive] = useState(true);
  const [testInput, setTestInput] = useState("");
  const [testing, setTesting] = useState(false);
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState("");

  const qc = useQueryClient();
  const updateFn = useServerFn(updateAgentPromptFn);
  const resetFn = useServerFn(resetAgentPromptFn);

  const vars = useMemo(
    () => (agent ? extractPromptVariables(editing ? draftPrompt : agent.system_prompt) : []),
    [agent, editing, draftPrompt],
  );

  useEffect(() => {
    setTestOutput(null);
    setTestInput("");
    setEditing(false);
    setDraftPrompt(agent?.system_prompt ?? "");
    setVariables(Object.fromEntries(vars.map((v) => [v, ""])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!agent) return;
      await updateFn({ data: { agentId: agent.agent_id, systemPrompt: draftPrompt } });
    },
    onSuccess: () => {
      toast.success("Prompt atualizado.");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["agent-prompts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      if (!agent) return null;
      return await resetFn({ data: { agentId: agent.agent_id } });
    },
    onSuccess: (res) => {
      if (res?.systemPrompt) setDraftPrompt(res.systemPrompt);
      toast.success("Prompt restaurado ao padrão original.");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["agent-prompts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!agent) return null;
  const meta = getAgentMeta(agent.agent_id, agent.agent_name);
  const Icon = meta.icon;
  const isDirty = draftPrompt !== agent.system_prompt;
  const isCustomized = agent.system_prompt !== agent.default_prompt;

  const runTest = async () => {
    setTesting(true);
    setTestOutput(null);
    await new Promise((r) => setTimeout(r, 900));
    setTestOutput(
      JSON.stringify(
        {
          agent: agent.agent_id,
          model,
          input: testInput || "(vazio)",
          variables,
          output:
            "Simulação de resposta. Conecte este playground ao gateway para execução real.",
        },
        null,
        2,
      ),
    );
    setTesting(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b p-5">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${meta.iconClass}`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-base">
                {toTitleCase(agent.agent_name)}
              </SheetTitle>
              <SheetDescription className="text-xs">
                {meta.categoryLabel} · atualizado em{" "}
                {new Date(agent.updated_at).toLocaleDateString("pt-BR")}
              </SheetDescription>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActive((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
            >
              <Circle
                className={`h-2 w-2 ${
                  active ? "fill-emerald-500 text-emerald-500" : "fill-muted-foreground text-muted-foreground"
                }`}
              />
              {active ? "Ativo" : "Inativo"}
            </button>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="h-7 w-auto gap-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m} value={m} className="text-xs">
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge
              variant="secondary"
              className="h-5 rounded-md px-1.5 font-mono text-[10px] font-normal"
            >
              {agent.agent_id}
            </Badge>
          </div>
        </SheetHeader>

        <Tabs defaultValue="prompt" className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="mx-5 mt-3 grid w-[calc(100%-2.5rem)] grid-cols-3">
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
            <TabsTrigger value="variables">
              Variáveis {vars.length ? `(${vars.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="playground">Playground</TabsTrigger>
          </TabsList>

          <TabsContent value="prompt" className="flex-1 overflow-hidden p-5 pt-3">
            <div className="flex h-full flex-col">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground">
                  System prompt · variáveis em <code>{"{{VAR}}"}</code> são destacadas
                  {isCustomized && (
                    <Badge variant="outline" className="ml-2 h-5 rounded-md px-1.5 text-[10px]">
                      customizado
                    </Badge>
                  )}
                </Label>
                <div className="flex items-center gap-1.5">
                  {editing ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1.5 text-xs"
                        onClick={() => {
                          setDraftPrompt(agent.system_prompt);
                          setEditing(false);
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" /> Cancelar
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        disabled={!isDirty || saveMutation.isPending}
                        onClick={() => saveMutation.mutate()}
                      >
                        {saveMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        Salvar
                      </Button>
                    </>
                  ) : (
                    <>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1.5 text-xs"
                            disabled={!isCustomized || resetMutation.isPending}
                            title={isCustomized ? "Restaurar prompt original" : "Já está no padrão"}
                          >
                            {resetMutation.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            Restaurar padrão
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Restaurar prompt original?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Isto descarta as customizações e volta ao prompt seed do agente{" "}
                              <strong>{toTitleCase(agent.agent_name)}</strong>. A ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => resetMutation.mutate()}>
                              Restaurar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 text-xs"
                        onClick={() => setEditing(true)}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {editing ? (
                <Textarea
                  value={draftPrompt}
                  onChange={(e) => setDraftPrompt(e.target.value)}
                  className="flex-1 resize-none rounded-md border bg-muted/40 font-mono text-xs leading-relaxed"
                />
              ) : (
                <ScrollArea className="flex-1 rounded-md border bg-muted/40">
                  <pre className="whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed">
                    {highlightVars(agent.system_prompt)}
                  </pre>
                </ScrollArea>
              )}
            </div>
          </TabsContent>

          <TabsContent value="variables" className="flex-1 overflow-auto p-5 pt-3">
            {vars.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Este prompt não declara variáveis dinâmicas.
              </p>
            ) : (
              <div className="space-y-3">
                {vars.map((v) => (
                  <div key={v} className="space-y-1.5">
                    <Label className="font-mono text-xs">{`{{${v}}}`}</Label>
                    <Input
                      value={variables[v] ?? ""}
                      onChange={(e) =>
                        setVariables((s) => ({ ...s, [v]: e.target.value }))
                      }
                      placeholder={`Valor para ${v.toLowerCase()}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="playground"
            className="flex flex-1 flex-col gap-3 overflow-hidden p-5 pt-3"
          >
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Input do teste</Label>
              <Textarea
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder="Descreva o cenário para o agente responder…"
                className="min-h-24"
              />
            </div>
            <Button onClick={runTest} disabled={testing} className="w-full gap-2">
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Executar teste
            </Button>
            <div className="flex-1 overflow-hidden rounded-md border bg-zinc-950">
              <ScrollArea className="h-full">
                {testing ? (
                  <div className="space-y-2 p-4">
                    <div className="h-3 w-3/4 animate-pulse rounded bg-zinc-800" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-800" />
                    <div className="h-3 w-5/6 animate-pulse rounded bg-zinc-800" />
                  </div>
                ) : testOutput ? (
                  <pre className="whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-emerald-400">
                    {testOutput}
                  </pre>
                ) : (
                  <p className="p-4 font-mono text-xs text-zinc-500">
                    // aguardando execução…
                  </p>
                )}
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function highlightVars(text: string) {
  const parts = text.split(/(\{\{\s*[A-Z0-9_]+\s*\}\})/g);
  return parts.map((p, i) =>
    /^\{\{\s*[A-Z0-9_]+\s*\}\}$/.test(p) ? (
      <span
        key={i}
        className="rounded bg-violet-500/15 px-1 py-0.5 text-violet-600 dark:text-violet-300"
      >
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}