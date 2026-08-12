import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BrainCircuit,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  MoreHorizontal,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteClientDocument,
  signClientDocument,
  uploadClientDocument,
} from "@/lib/brand-hub.functions";
import {
  applyDocumentToBriefing,
  getBriefingSnapshot,
  listClientDocumentsAi,
  type ClientDocumentAi,
  type DocumentBriefingSummary,
} from "@/lib/documents-ai.functions";
import { supabase } from "@/integrations/supabase/client";

function fmtSize(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

const FIELD_LABELS: Record<keyof DocumentBriefingSummary, string> = {
  description: "Descrição da marca",
  mission: "Missão",
  positioning: "Posicionamento",
  values: "Valores",
  audience: "Público-alvo",
  pain_points: "Dores",
  demographics: "Demografia",
  offer: "Oferta / Produto",
  differentials: "Diferenciais",
  objections: "Objeções",
  journey: "Jornada",
  desires: "Desejos",
  tone_text: "Tom de voz",
  hashtags: "Hashtags",
  goals: "Metas",
};

function statusBadge(s: ClientDocumentAi["ai_status"]) {
  switch (s) {
    case "done":
      return (
        <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="mr-1 h-3 w-3" /> Interpretado
        </Badge>
      );
    case "queued":
    case "running":
      return (
        <Badge variant="outline" className="border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Analisando
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
          <XCircle className="mr-1 h-3 w-3" /> Falhou
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Aguardando
        </Badge>
      );
  }
}

export function DocumentsTab({ brandId, clientId }: { brandId: string; clientId: string }) {
  const list = useServerFn(listClientDocumentsAi);
  const upload = useServerFn(uploadClientDocument);
  const remove = useServerFn(deleteClientDocument);
  const sign = useServerFn(signClientDocument);
  const apply = useServerFn(applyDocumentToBriefing);
  const snapshot = useServerFn(getBriefingSnapshot);
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openDoc, setOpenDoc] = useState<ClientDocumentAi | null>(null);

  const docsQ = useQuery({
    queryKey: ["client-documents", brandId, clientId],
    queryFn: () => list({ data: { brandId, clientId } }),
    refetchInterval: (q) => {
      const rows = (q.state.data ?? []) as ClientDocumentAi[];
      const pending = rows.some((r) => r.ai_status === "queued" || r.ai_status === "running");
      return pending ? 3000 : false;
    },
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["client-documents", brandId, clientId] });

  const analyzeDoc = async (documentId: string) => {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) {
      toast.error("Sessão expirada. Faça login novamente.");
      return;
    }
    const res = await fetch("/api/jobs/analyze-document", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ brandId, clientId, documentId }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "Falha ao iniciar análise");
      toast.error(msg);
      return;
    }
    toast.success("Análise iniciada. Atualizando em segundos…");
    invalidate();
  };

  const handleFiles = async (files: FileList) => {
    setBusy(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 25 * 1024 * 1024) {
          toast.error(`${file.name} excede o limite de 25 MB`);
          continue;
        }
        const base64 = await fileToBase64(file);
        const created = await upload({
          data: {
            brandId,
            clientId,
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            base64,
          },
        });
        if (created?.id) uploaded.push(created.id);
      }
      toast.success("Documentos enviados. Iniciando leitura da IA…");
      invalidate();
      // Auto-analyze new uploads
      for (const id of uploaded) await analyzeDoc(id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha no upload");
    } finally {
      setBusy(false);
    }
  };

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { brandId, clientId, documentId: id } }),
    onSuccess: () => {
      toast.success("Documento removido");
      invalidate();
    },
  });

  const download = async (id: string) => {
    try {
      const { url } = await sign({ data: { brandId, clientId, documentId: id } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Falha ao gerar link de download");
    }
  };

  const docs = docsQ.data ?? [];
  const kpis = useMemo(() => {
    const analyzed = docs.filter((d) => d.ai_status === "done").length;
    const applied = docs.filter((d) => d.applied_to_briefing_at).length;
    const suggested = docs.reduce((acc, d) => {
      if (!d.ai_summary?.briefing) return acc;
      return acc + Object.values(d.ai_summary.briefing).filter((v) => v != null && (Array.isArray(v) ? v.length > 0 : String(v).trim().length > 0)).length;
    }, 0);
    return { total: docs.length, analyzed, applied, suggested };
  }, [docs]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <KpiCard label="Documentos" value={kpis.total} />
        <KpiCard label="Interpretados" value={kpis.analyzed} />
        <KpiCard label="Campos sugeridos" value={kpis.suggested} />
        <KpiCard label="Aplicados ao briefing" value={kpis.applied} />
      </div>

      <section
        className={
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition " +
          (dragging ? "border-primary bg-primary/5" : "border-border bg-card")
        }
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
        }}
      >
        {busy ? (
          <Loader2 className="mb-2 h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
        )}
        <div className="text-sm font-medium">Central de documentos & contexto</div>
        <p className="mt-1 max-w-md text-center text-xs text-muted-foreground">
          Envie brandbooks, manuais de marca, pesquisas ou decks. A IA lê cada documento, interpreta em nível sênior e sugere melhorias para o briefing. Máx. 25 MB por arquivo.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-4 gap-1.5"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <Upload className="h-3.5 w-3.5" /> Enviar arquivos
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Nome</TableHead>
              <TableHead>Leitura da IA</TableHead>
              <TableHead>Enviado</TableHead>
              <TableHead>Tamanho</TableHead>
              <TableHead className="w-16 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docsQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-xs text-muted-foreground">
                  Carregando documentos…
                </TableCell>
              </TableRow>
            ) : docs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-xs text-muted-foreground">
                  Nenhum documento ainda. Envie um brandbook ou pesquisa acima para começar.
                </TableCell>
              </TableRow>
            ) : (
              docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="truncate text-sm">{d.name}</div>
                        {d.ai_summary?.document_type ? (
                          <div className="text-[11px] text-muted-foreground">{d.ai_summary.document_type}</div>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {statusBadge(d.ai_status)}
                      {d.ai_status === "done" && d.ai_summary?.briefing ? (
                        <button
                          type="button"
                          onClick={() => setOpenDoc(d)}
                          className="text-left text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                        >
                          Ver leitura & antes/depois
                        </button>
                      ) : null}
                      {d.ai_status === "failed" && d.ai_error ? (
                        <span className="line-clamp-2 text-[11px] text-destructive">{d.ai_error}</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(d.created_at).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{fmtSize(d.size_bytes)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={d.ai_status === "queued" || d.ai_status === "running"}
                          onClick={() => void analyzeDoc(d.id)}
                        >
                          <Sparkles className="mr-2 h-3.5 w-3.5" />
                          {d.ai_status === "done" ? "Reanalisar" : "Analisar com IA"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => download(d.id)}>
                          <Download className="mr-2 h-3.5 w-3.5" /> Download
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => del.mutate(d.id)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <AiReadingDrawer
        doc={openDoc}
        onClose={() => setOpenDoc(null)}
        brandId={brandId}
        clientId={clientId}
        onApplied={() => {
          invalidate();
          qc.invalidateQueries({ queryKey: ["customer", brandId, clientId] });
        }}
        applyFn={apply}
        snapshotFn={snapshot}
      />
    </div>
  );
}

type ApplyFn = (args: { data: { brandId: string; clientId: string; documentId: string; fields: string[] } }) => Promise<{ ok: boolean; appliedFields: string[] }>;
type SnapshotFn = (args: { data: { brandId: string; clientId: string } }) => Promise<Partial<DocumentBriefingSummary>>;

function AiReadingDrawer({
  doc,
  onClose,
  brandId,
  clientId,
  onApplied,
  applyFn,
  snapshotFn,
}: {
  doc: ClientDocumentAi | null;
  onClose: () => void;
  brandId: string;
  clientId: string;
  onApplied: () => void;
  applyFn: ApplyFn;
  snapshotFn: SnapshotFn;
}) {
  const open = !!doc;
  const briefing = doc?.ai_summary?.briefing;

  const snapQ = useQuery({
    queryKey: ["briefing-snapshot", brandId, clientId, doc?.id ?? "none"],
    queryFn: () => snapshotFn({ data: { brandId, clientId } }),
    enabled: open,
  });

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const suggestions = useMemo(() => {
    if (!briefing) return [] as Array<{ key: keyof DocumentBriefingSummary; label: string; suggested: string; current: string }>;
    const current = (snapQ.data ?? {}) as Partial<DocumentBriefingSummary>;
    return (Object.keys(FIELD_LABELS) as Array<keyof DocumentBriefingSummary>)
      .map((k) => {
        const raw = briefing[k];
        const suggested = Array.isArray(raw) ? raw.join(", ") : (raw as string | null | undefined) ?? "";
        const curRaw = current[k];
        const currentText = Array.isArray(curRaw) ? curRaw.join(", ") : (curRaw as string | null | undefined) ?? "";
        return { key: k, label: FIELD_LABELS[k], suggested, current: currentText };
      })
      .filter((r) => r.suggested.trim().length > 0);
  }, [briefing, snapQ.data]);

  const [saving, setSaving] = useState(false);
  const apply = async () => {
    if (!doc) return;
    const fields = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (!fields.length) {
      toast.error("Selecione pelo menos um campo.");
      return;
    }
    setSaving(true);
    try {
      const res = await applyFn({ data: { brandId, clientId, documentId: doc.id, fields } });
      toast.success(`Briefing atualizado com ${res.appliedFields.length} campo(s).`);
      onApplied();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao aplicar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ExpandedModal
      open={open}
      onOpenChange={(v) => (!v ? onClose() : null)}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-primary" />
          Leitura da IA · {doc?.name}
        </span>
      }
      description={
        doc?.ai_summary?.executive_summary ??
        "Selecione os campos que deseja aplicar ao briefing. O antes/depois compara o valor atual com a sugestão da IA."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void apply()} disabled={saving || suggestions.length === 0} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Aplicar ao briefing
          </Button>
        </>
      }
    >
      <div className="space-y-3">
            {suggestions.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                A IA não encontrou campos suficientes neste documento.
              </div>
            ) : (
              suggestions.map((s) => {
                const changed = (s.current ?? "").trim() !== (s.suggested ?? "").trim();
                return (
                  <div key={s.key} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <label className="flex flex-1 items-start gap-2 text-sm">
                        <Checkbox
                          checked={!!selected[s.key]}
                          onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [s.key]: !!v }))}
                        />
                        <div>
                          <div className="font-medium">{s.label}</div>
                          {!changed && s.current ? (
                            <div className="text-[11px] text-muted-foreground">Sem diferença relevante</div>
                          ) : null}
                        </div>
                      </label>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Antes</div>
                        <div className="min-h-[52px] whitespace-pre-wrap rounded-md border border-border/60 bg-muted/40 p-2 text-xs">
                          {s.current || <span className="text-muted-foreground">— vazio —</span>}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-wide text-primary">Depois (sugerido)</div>
                        <div className="min-h-[52px] whitespace-pre-wrap rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
                          {s.suggested}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
      </div>
    </ExpandedModal>
  );
}