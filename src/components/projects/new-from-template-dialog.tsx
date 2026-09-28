import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Layers, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  listTemplatesFn,
  instantiateTemplateFn,
  type ProjectTemplate,
} from "@/lib/project-templates.functions";
import { listClients } from "@/lib/workspace.functions";
import { reviewTemplateFn } from "@/lib/project-templates.functions";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  brandId: string;
};

export function NewFromTemplateDialog({ open, onOpenChange, brandId }: Props) {
  const navigate = useNavigate();
  const listFn = useServerFn(listTemplatesFn);
  const clientsFn = useServerFn(listClients);
  const instFn = useServerFn(instantiateTemplateFn);
  const reviewFn = useServerFn(reviewTemplateFn);

  const templatesQ = useQuery({
    queryKey: ["project-templates", brandId],
    queryFn: () => listFn({ data: { brandId } }),
    enabled: open,
  });
  const clientsQ = useQuery({
    queryKey: ["clients", brandId],
    queryFn: () => clientsFn({ data: { brandId } }),
    enabled: open,
  });

  const [templateId, setTemplateId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const clients = (clientsQ.data ?? []) as Array<{ id: string; name: string }>;
  const templates: ProjectTemplate[] = templatesQ.data ?? [];
  const selected = templates.find(t => t.id === templateId);
  const review = useQuery({ queryKey: ["project-template-review",brandId,templateId,clientId], queryFn: () => reviewFn({ data: { brandId, templateId: templateId ?? "", clientId } }), enabled: open && !!templateId });

  const mut = useMutation({
    mutationFn: () =>
      instFn({
        data: {
          templateId: templateId ?? "",
          brandId,
          clientId,
          projectName: name.trim(),
          requestId,
        },
      }),
    onSuccess: ({ projectId }) => {
      toast.success("Projeto criado a partir do modelo");
      onOpenChange(false);
      setTemplateId(null);
      setName("");
      setClientId(null);
       setRequestId(crypto.randomUUID());
      navigate({ to: "/projects/$projectId", params: { projectId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Novo projeto a partir de modelo
          </DialogTitle>
          <DialogDescription>
            Escolha um modelo, dê um nome e opcionalmente vincule um cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div>
            <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Modelo
            </Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {templates.length === 0 && (
                <div className="col-span-full rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                  Nenhum modelo disponível ainda.
                </div>
         {selected && <div className="space-y-2 border-y border-border py-4 text-sm"><p className="font-medium">Revisão · {selected.name}</p><p>{selected.jobs_count ?? 0} jobs · {selected.tasks_count ?? 0} tarefas · {review.data?.texts ?? 0} textos padrão</p><p>Cliente: {clients.find(c => c.id === clientId)?.name ?? "Sem cliente"}</p>{review.isLoading && <p className="text-muted-foreground">Conferindo pessoas...</p>}{review.isError && <p role="alert" className="text-destructive">Não foi possível revisar o modelo. Tente novamente.</p>}{review.data && <p className={review.data.ineligible > 0 ? "text-destructive" : "text-muted-foreground"}>{review.data.ineligible > 0 ? `${review.data.ineligible} pessoas sem acesso ao cliente; ficarão sem atribuição. ` : "Pessoas aptas verificadas. "}Sem datas, horas ou histórico.</p>}</div>}
              )}
              {templates.map((t) => (
                <Button
                  key={t.id}
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setTemplateId(t.id);
                    if (!name) setName(t.name);
                  }}
                  className={`h-auto w-full justify-start rounded-md p-3 text-left transition ${
                    templateId === t.id
                      ? "border-primary bg-primary/5"
                      : "border-border/60 hover:border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-muted-foreground" />
                      <div className="text-sm font-medium">{t.name}</div>
                    </div>
                    {t.is_system && (
                      <Badge variant="secondary" className="text-[10px]">
                        Sistema
                      </Badge>
                    )}
                  </div>
                  {t.description && (
                    <div className="mt-1 text-xs text-muted-foreground">{t.description}</div>
                  )}
                  <div className="mt-2 text-[10px] text-muted-foreground">
                    {t.jobs_count ?? 0} jobs · {t.tasks_count ?? 0} tarefas
                  </div>
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Nome do projeto</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Redes Janeiro/2026"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Cliente (opcional)</Label>
            <Select
              value={clientId ?? "none"}
              onValueChange={(v) => setClientId(v === "none" ? null : v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Sem cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem cliente</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" asChild><Link to="/projects/models" onClick={() => onOpenChange(false)}>Gerenciar modelos</Link></Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={!templateId || name.trim().length < 2 || mut.isPending || !review.data || review.isFetching}
          >
            Criar projeto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
