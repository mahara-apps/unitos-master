import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ExpandedModal } from "@/components/ui/expanded-modal";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { uploadClientDocument } from "@/lib/brand-hub.functions";
import {
  applyBriefingImportRun,
  getBriefingImportRun,
} from "@/lib/briefing-import.functions";
import type { ImportChangeRow, ImportSourceKind } from "@/lib/briefing-import.server";
import {
  ACCEPT_ATTRIBUTE,
  CHANGE_STATE_LABELS,
  SOURCE_KIND_LABELS,
  STEP_LABELS,
  changeState,
  confidenceLabel,
  defaultSelection,
  displayValue,
  fieldLabel,
  formatBytes,
  importErrorMessage,
  inferSourceKind,
  isReviewable,
  shouldPollRun,
  summarizeChanges,
  uiStepFromRun,
  validateImportFile,
} from "@/lib/briefing-import-ui";

/**
 * Importar Briefing via IA — modal com 3 estados internos:
 * Enviar material → IA analisando → Revisar alterações.
 *
 * Nenhuma regra de negócio nova aqui: o upload usa o mesmo bucket privado de
 * Documentos & Contexto, a análise usa `/api/jobs/analyze-document` (que cria
 * ou reaproveita a run por fingerprint) e a aplicação usa `applyImportRun`.
 */

type PendingFile = { file: File; sourceKind: "document" | "transcript"; error?: string };
type QueuedRun = { runId: string; fileName: string; documentId: string; reused: boolean };

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

export function BriefingImportDialog({
  brandId,
  clientId,
  open,
  onOpenChange,
}: {
  brandId: string;
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const upload = useServerFn(uploadClientDocument);
  const getRun = useServerFn(getBriefingImportRun);
  const applyRun = useServerFn(applyBriefingImportRun);
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueuedRun[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [touched, setTouched] = useState(false);

  const current = queue[index] ?? null;

  const runQ = useQuery({
    queryKey: ["briefing-import-run", brandId, clientId, current?.runId ?? "none"],
    enabled: !!current,
    queryFn: () => getRun({ data: { brandId, clientId, runId: current!.runId } }),
    refetchInterval: (q) => (shouldPollRun(q.state.data?.run?.status) ? 2500 : false),
  });

  const run = runQ.data?.run ?? null;
  const changes = useMemo<ImportChangeRow[]>(() => runQ.data?.changes ?? [], [runQ.data]);
  const steps = runQ.data?.steps ?? [];
  const step = current ? uiStepFromRun(run?.status) : "upload";
  const summary = useMemo(() => summarizeChanges(changes), [changes]);
  const reviewable = useMemo(() => changes.filter((c) => isReviewable(c.action)), [changes]);

  // Pré-seleção só na primeira vez que a proposta chega — depois manda o usuário.
  useEffect(() => {
    if (step !== "review" || touched || changes.length === 0) return;
    setSelected(defaultSelection(changes));
  }, [step, touched, changes]);

  const reset = () => {
    setFiles([]);
    setQueue([]);
    setIndex(0);
    setSelected(new Set());
    setTouched(false);
    setStartError(null);
    setStarting(false);
  };

  const close = () => {
    onOpenChange(false);
    reset();
  };

  const addFiles = (list: FileList | File[]) => {
    const next: PendingFile[] = [];
    for (const file of Array.from(list)) {
      const check = validateImportFile(file);
      next.push({
        file,
        sourceKind: inferSourceKind(file.name),
        ...(check.ok ? {} : { error: check.reason }),
      });
    }
    setFiles((prev) => [...prev, ...next]);
    setStartError(null);
  };

  const valid = files.filter((f) => !f.error);

  const start = async () => {
    if (valid.length === 0) return;
    setStarting(true);
    setStartError(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const created: QueuedRun[] = [];
      for (const item of valid) {
        const base64 = await fileToBase64(item.file);
        const doc = await upload({
          data: {
            brandId,
            clientId,
            filename: item.file.name,
            contentType: item.file.type || "application/octet-stream",
            sizeBytes: item.file.size,
            base64,
          },
        });
        if (!doc?.id) throw new Error(`Falha ao enviar ${item.file.name}`);

        const res = await fetch("/api/jobs/analyze-document", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            brandId,
            clientId,
            documentId: doc.id,
            sourceKind: item.sourceKind,
          }),
        });
        if (!res.ok) {
          const msg = await res.text().catch(() => "Falha ao iniciar a análise");
          throw new Error(msg);
        }
        const body = (await res.json().catch(() => ({}))) as { runId?: string; reused?: boolean };
        if (!body.runId) throw new Error("A análise não retornou uma execução válida.");
        created.push({
          runId: body.runId,
          fileName: item.file.name,
          documentId: doc.id,
          reused: body.reused === true,
        });
      }

      if (created.some((c) => c.reused)) {
        toast.info("Material já analisado antes — reaproveitando a execução existente.");
      }
      setQueue(created);
      setIndex(0);
      setFiles([]);
      qc.invalidateQueries({ queryKey: ["briefing-import-runs", brandId, clientId] });
      qc.invalidateQueries({ queryKey: ["client-documents", brandId, clientId] });
    } catch (e) {
      setStartError(importErrorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const retry = async () => {
    if (!current) return;
    setStarting(true);
    setStartError(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");
      const res = await fetch("/api/jobs/analyze-document", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          brandId,
          clientId,
          documentId: current.documentId,
          force: true,
        }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "Falha ao reprocessar"));
      const body = (await res.json().catch(() => ({}))) as { runId?: string };
      if (!body.runId) throw new Error("A análise não retornou uma execução válida.");
      setQueue((prev) =>
        prev.map((q, i) => (i === index ? { ...q, runId: body.runId!, reused: false } : q)),
      );
      setTouched(false);
      qc.invalidateQueries({ queryKey: ["briefing-import-runs", brandId, clientId] });
    } catch (e) {
      setStartError(importErrorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const advance = () => {
    if (index + 1 < queue.length) {
      setIndex(index + 1);
      setSelected(new Set());
      setTouched(false);
      return;
    }
    close();
  };

  const apply = useMutation({
    mutationFn: async () => {
      if (!current) throw new Error("import_run_not_found");
      const accept = reviewable.filter((c) => selected.has(c.field)).map((c) => c.field);
      const reject = reviewable.filter((c) => !selected.has(c.field)).map((c) => c.field);
      if (accept.length === 0) throw new Error("no_accepted_fields");
      return applyRun({
        data: {
          brandId,
          clientId,
          runId: current.runId,
          acceptFields: accept,
          ...(reject.length ? { rejectFields: reject } : {}),
        },
      });
    },
    onSuccess: (res) => {
      toast.success(
        res.alreadyApplied
          ? "Esta importação já havia sido aplicada — nada foi reescrito."
          : `Briefing atualizado (${res.appliedFields.length} ${res.appliedFields.length === 1 ? "campo" : "campos"}).`,
      );
      qc.invalidateQueries({ queryKey: ["brand-hub", brandId, clientId] });
      qc.invalidateQueries({ queryKey: ["briefing-import-runs", brandId, clientId] });
      qc.invalidateQueries({ queryKey: ["briefing-import-run", brandId, clientId, current?.runId] });
      advance();
    },
    onError: (e) => toast.error(importErrorMessage(e)),
  });

  const toggle = (field: string) => {
    setTouched(true);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const footer = (() => {
    if (step === "upload") {
      return (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted-foreground">
            Nada é aplicado sem sua revisão.
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={close} disabled={starting}>
              Cancelar
            </Button>
            <Button size="sm" onClick={start} disabled={valid.length === 0 || starting}>
              {starting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              Analisar com IA
            </Button>
          </div>
        </div>
      );
    }
    if (step === "analyzing") {
      return (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted-foreground">
            Você pode fechar — a análise continua e aparece no histórico.
          </span>
          <Button variant="ghost" size="sm" onClick={close}>
            Fechar
          </Button>
        </div>
      );
    }
    if (step === "failed") {
      return (
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={close}>
            Fechar
          </Button>
          <Button size="sm" onClick={retry} disabled={starting}>
            {starting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Tentar novamente
          </Button>
        </div>
      );
    }
    if (step === "applied") {
      return (
        <div className="flex items-center justify-end">
          <Button size="sm" onClick={advance}>
            Concluir
          </Button>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted-foreground">
          {selected.size} de {reviewable.length} alteraç{reviewable.length === 1 ? "ão" : "ões"}{" "}
          selecionada{selected.size === 1 ? "" : "s"}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={close} disabled={apply.isPending}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={() => apply.mutate()}
            disabled={apply.isPending || selected.size === 0}
          >
            {apply.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Aplicar selecionados
          </Button>
        </div>
      </div>
    );
  })();

  return (
    <ExpandedModal
      open={open}
      onOpenChange={(v) => (v ? onOpenChange(true) : close())}
      size="lg"
      title="Importar Briefing via IA"
      description="A IA lê o material, compara com o briefing atual e propõe alterações para sua revisão."
      headerExtra={
        queue.length > 1 ? (
          <Badge variant="outline" className="text-[11px]">
            {index + 1} de {queue.length}
          </Badge>
        ) : null
      }
      footer={footer}
    >
      <div className="space-y-5">
        <StepIndicator step={step} />

        {step === "upload" ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
              A IA vai <strong className="text-foreground">ler o material enviado</strong>, comparar
              com o briefing e o contexto atuais e identificar{" "}
              <strong className="text-foreground">informações novas, contradições e lacunas</strong>.
              Ao final você recebe uma proposta campo a campo. Se ainda não houver contexto útil, o
              briefing pode ser construído do zero a partir do material.
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition",
                dragging ? "border-primary bg-primary/5" : "border-border/70 bg-muted/20",
              )}
            >
              <Upload className="h-5 w-5 text-muted-foreground" />
              <div className="text-sm font-medium">Arraste os arquivos ou selecione</div>
              <p className="text-[11px] text-muted-foreground">
                PDF, texto (.txt, .md, .csv, .json), legenda (.vtt, .srt) ou imagem · até 25 MB por
                arquivo
              </p>
              <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                Selecionar arquivos
              </Button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPT_ATTRIBUTE}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            {files.length > 0 ? (
              <ul className="space-y-2">
                {files.map((f, i) => (
                  <li
                    key={`${f.file.name}-${i}`}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border px-3 py-2",
                      f.error ? "border-destructive/40 bg-destructive/5" : "border-border/60",
                    )}
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{f.file.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {f.file.type || "tipo desconhecido"} · {formatBytes(f.file.size)}
                      </div>
                      {f.error ? (
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
                          <AlertTriangle className="h-3 w-3" /> {f.error}
                        </div>
                      ) : null}
                    </div>
                    {!f.error ? (
                      <Select
                        value={f.sourceKind}
                        onValueChange={(v) =>
                          setFiles((prev) =>
                            prev.map((p, pi) =>
                              pi === i
                                ? { ...p, sourceKind: v as "document" | "transcript" }
                                : p,
                            ),
                          )
                        }
                      >
                        <SelectTrigger className="h-8 w-[190px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="document">{SOURCE_KIND_LABELS.document}</SelectItem>
                          <SelectItem value="transcript">
                            {SOURCE_KIND_LABELS.transcript}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Remover ${f.file.name}`}
                      onClick={() => setFiles((prev) => prev.filter((_, pi) => pi !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}

            {startError ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {startError}
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "analyzing" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Analisando <span className="font-medium">{current?.fileName}</span>…
            </div>
            <Progress value={Math.min(90, 20 + steps.length * 18)} className="h-1.5" />
            <ul className="space-y-1.5 text-xs">
              {steps.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  {s.status === "done" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : s.status === "failed" ? (
                    <XCircle className="h-3.5 w-3.5 text-destructive" />
                  ) : (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                  <span className="text-muted-foreground">{STEP_LABELS[s.step] ?? s.step}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {step === "failed" ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-3 text-xs text-destructive">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">Não foi possível interpretar o material.</div>
                <div className="mt-1">{run?.error ?? "Erro desconhecido."}</div>
              </div>
            </div>
            {startError ? <p className="text-xs text-destructive">{startError}</p> : null}
          </div>
        ) : null}

        {step === "applied" ? (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-3 text-xs">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <div>
              <div className="font-medium">Importação aplicada ao briefing.</div>
              <div className="mt-1 text-muted-foreground">
                {run?.counts.created ?? 0} novos · {run?.counts.updated ?? 0} atualizados. O
                histórico guarda a versão gerada.
              </div>
            </div>
          </div>
        ) : null}

        {step === "review" ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 px-3 py-2 text-xs">
              <div className="font-medium">{current?.fileName}</div>
              {run?.summary ? (
                <p className="mt-1 text-muted-foreground">{run.summary}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[11px]">
                  {summary.novos} novos
                </Badge>
                <Badge variant="outline" className="text-[11px]">
                  {summary.atualizacoes} atualizações
                </Badge>
                <Badge variant="outline" className="text-[11px]">
                  {summary.conflitos} conflitos
                </Badge>
                <Badge variant="outline" className="text-[11px]">
                  {summary.semAlteracao} sem alteração
                </Badge>
                {run?.model ? (
                  <Badge variant="outline" className="text-[11px] text-muted-foreground">
                    {run.model}
                  </Badge>
                ) : null}
              </div>
            </div>

            {reviewable.length === 0 ? (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
                A IA não encontrou informação nova neste material — o briefing atual já cobre o
                conteúdo enviado. Nada será alterado.
              </div>
            ) : (
              <div className="space-y-2">
                {changes.filter((c) => isReviewable(c.action)).map((c) => (
                  <ChangeCard
                    key={c.id}
                    change={c}
                    checked={selected.has(c.field)}
                    onToggle={() => toggle(c.field)}
                  />
                ))}
                {changes.some((c) => !isReviewable(c.action)) ? (
                  <details className="rounded-lg border border-border/60 px-3 py-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      Campos sem alteração ({changes.filter((c) => !isReviewable(c.action)).length})
                    </summary>
                    <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                      {changes
                        .filter((c) => !isReviewable(c.action))
                        .map((c) => (
                          <li key={c.id}>
                            {fieldLabel(c.field)} — {CHANGE_STATE_LABELS[changeState(c)]}
                          </li>
                        ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </ExpandedModal>
  );
}

function StepIndicator({ step }: { step: ReturnType<typeof uiStepFromRun> }) {
  const items: Array<{ key: string; label: string; active: boolean; done: boolean }> = [
    {
      key: "upload",
      label: "Enviar material",
      active: step === "upload",
      done: step !== "upload",
    },
    {
      key: "analyzing",
      label: "IA analisando",
      active: step === "analyzing",
      done: step === "review" || step === "applied",
    },
    {
      key: "review",
      label: "Revisar alterações",
      active: step === "review" || step === "failed",
      done: step === "applied",
    },
  ];
  return (
    <ol className="flex items-center gap-2 text-[11px]">
      {items.map((it, i) => (
        <li key={it.key} className="flex items-center gap-2">
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1",
              it.active
                ? "border-primary/50 bg-primary/10 text-primary"
                : it.done
                  ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
                  : "border-border/60 text-muted-foreground",
            )}
          >
            {it.done ? <CheckCircle2 className="h-3 w-3" /> : null}
            {it.label}
          </span>
          {i < items.length - 1 ? <span className="h-px w-4 bg-border" /> : null}
        </li>
      ))}
    </ol>
  );
}

export function ChangeStateBadge({ change }: { change: ImportChangeRow }) {
  const state = changeState(change);
  const styles: Record<string, string> = {
    new: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    update: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400",
    conflict: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    unchanged: "text-muted-foreground",
    empty: "text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={cn("text-[11px]", styles[state])}>
      {CHANGE_STATE_LABELS[state]}
    </Badge>
  );
}

function ChangeCard({
  change,
  checked,
  onToggle,
  readOnly,
}: {
  change: ImportChangeRow;
  checked?: boolean;
  onToggle?: () => void;
  readOnly?: boolean;
}) {
  const currentText = displayValue(change.current_value);
  const proposedText = displayValue(change.proposed_value);
  const confidence = confidenceLabel(change.confidence);
  const evidence =
    typeof change.evidence?.["excerpt"] === "string" ? (change.evidence["excerpt"] as string) : null;

  return (
    <div className="rounded-lg border border-border/60 px-3 py-3">
      <div className="flex items-start gap-3">
        {!readOnly ? (
          <Checkbox
            checked={!!checked}
            onCheckedChange={onToggle}
            aria-label={`Aceitar alteração em ${fieldLabel(change.field)}`}
            className="mt-0.5"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{fieldLabel(change.field)}</span>
            <ChangeStateBadge change={change} />
            {confidence ? (
              <span className="text-[11px] text-muted-foreground">{confidence}</span>
            ) : null}
            {readOnly ? (
              <Badge variant="outline" className="text-[11px] text-muted-foreground">
                {change.decision === "accepted"
                  ? "Aplicado"
                  : change.decision === "rejected"
                    ? "Rejeitado"
                    : "Pendente"}
              </Badge>
            ) : null}
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="rounded-md bg-muted/40 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Atual</div>
              <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                {currentText || "— vazio —"}
              </p>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wide text-primary">Proposto</div>
              <p className="mt-1 whitespace-pre-wrap break-words text-xs">{proposedText}</p>
            </div>
          </div>
          {evidence ? (
            <p className="mt-2 border-l-2 border-border/70 pl-2 text-[11px] italic text-muted-foreground">
              “{evidence}”
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export { ChangeCard };
