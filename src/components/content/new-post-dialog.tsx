import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { createPostFn, type PipelineStage } from "@/lib/content.functions";
import { CHANNELS, FORMATS } from "./stage-colors";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  brandId: string;
  clientId: string;
  pipelineId: string;
  stages: PipelineStage[];
  defaultStageId?: string;
  invalidateKey: readonly unknown[];
};

type Priority = "low" | "medium" | "high" | "urgent";

export function NewPostDialog({
  open,
  onOpenChange,
  brandId,
  clientId,
  pipelineId,
  stages,
  defaultStageId,
  invalidateKey,
}: Props) {
  const qc = useQueryClient();
  const createPost = useServerFn(createPostFn);

  const [title, setTitle] = useState("");
  const [stageId, setStageId] = useState<string>(defaultStageId ?? stages[0]?.id ?? "");
  const [channels, setChannels] = useState<string[]>(["instagram"]);
  const [format, setFormat] = useState<string>("Feed");
  const [copy, setCopy] = useState("");
  const [internalBriefing, setInternalBriefing] = useState("");
  const [clientBriefing, setClientBriefing] = useState("");
  const [script, setScript] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [priority, setPriority] = useState<Priority | "none">("none");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [visibleInPortal, setVisibleInPortal] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setStageId(defaultStageId ?? stages[0]?.id ?? "");
      setChannels(["instagram"]);
      setFormat("Feed");
      setCopy("");
      setInternalBriefing("");
      setClientBriefing("");
      setScript("");
      setScheduledAt("");
      setRemindAt("");
      setPriority("none");
      setTagInput("");
      setTags([]);
      setVisibleInPortal(false);
    }
  }, [open, defaultStageId, stages]);

  const create = useMutation({
    mutationFn: async () =>
      createPost({
        data: {
          brandId,
          clientId,
          pipelineId,
          stageId,
          title: title.trim(),
          channels: channels.length ? channels : undefined,
          format: format || null,
          copy: copy.trim() || null,
          internal_briefing: internalBriefing.trim() || null,
          client_briefing: clientBriefing.trim() || null,
          script: script.trim()
            ? [{ cena: 1, fala: script.trim() }]
            : null,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          remind_at: remindAt ? new Date(remindAt).toISOString() : null,
          priority: priority === "none" ? null : priority,
          tags: tags.length ? tags : undefined,
          visible_in_portal: visibleInPortal,
        },
      }),
    onSuccess: () => {
      toast.success("Tarefa criada");
      qc.invalidateQueries({ queryKey: invalidateKey });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleChannel(id: string) {
    setChannels((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }
  function addTag() {
    const v = tagInput.trim();
    if (!v) return;
    if (!tags.includes(v)) setTags([...tags, v]);
    setTagInput("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova tarefa</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Título *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nome da tarefa..."
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Vai publicar? Selecione o canal
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {CHANNELS.map((c) => {
                  const active = channels.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleChannel(c.id)}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        active
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border/60 text-muted-foreground hover:border-border"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Formato</Label>
              <div className="flex flex-wrap gap-1.5">
                {FORMATS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      format === f
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border/60 text-muted-foreground hover:border-border"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <Tabs defaultValue="copy" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="copy">Legenda</TabsTrigger>
                <TabsTrigger value="internal">Briefing interno</TabsTrigger>
                <TabsTrigger value="client">Briefing cliente</TabsTrigger>
                <TabsTrigger value="script">Roteiro</TabsTrigger>
              </TabsList>
              <TabsContent value="copy">
                <Textarea
                  value={copy}
                  onChange={(e) => setCopy(e.target.value)}
                  rows={5}
                  placeholder="Caption do post..."
                />
              </TabsContent>
              <TabsContent value="internal">
                <Textarea
                  value={internalBriefing}
                  onChange={(e) => setInternalBriefing(e.target.value)}
                  rows={5}
                  placeholder="Apenas equipe interna..."
                />
              </TabsContent>
              <TabsContent value="client">
                <Textarea
                  value={clientBriefing}
                  onChange={(e) => setClientBriefing(e.target.value)}
                  rows={5}
                  placeholder="Visível no portal do cliente..."
                />
              </TabsContent>
              <TabsContent value="script">
                <Textarea
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  rows={5}
                  placeholder="Roteiro / script do vídeo..."
                />
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Etapa</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Prazo *</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Lembrete</Label>
              <Input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem prioridade</SelectItem>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tags</Label>
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <Badge
                    key={t}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                  >
                    {t} ×
                  </Badge>
                ))}
              </div>
              <div className="flex gap-1">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Adicionar tag"
                  className="h-8 text-xs"
                />
                <Button type="button" size="sm" variant="outline" onClick={addTag}>+</Button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
              <Label className="text-xs">Visível no portal</Label>
              <Switch checked={visibleInPortal} onCheckedChange={setVisibleInPortal} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!title.trim() || !stageId || create.isPending}
          >
            {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}