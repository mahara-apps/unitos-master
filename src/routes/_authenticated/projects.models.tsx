import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowDown, ArrowUp, Archive, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveContext } from "@/hooks/use-active-context";
import { usePageHeader } from "@/hooks/use-page-header";
import { DashboardPageShell } from "@/components/ui/dashboard-primitives";
import { listProjects } from "@/lib/projects.functions";
import { listTemplatesFn, saveTemplateFn, archiveTemplateFn, captureProjectTemplateFn, type ProjectTemplate } from "@/lib/project-templates.functions";

type Task = { title: string; description: string | null; priority: "low" | "medium" | "high" | "urgent"; estimatedMinutes: number | null; assigneeId: string | null };
type Job = { name: string; description: string | null; color: string | null; estimatedMinutes: number | null; assigneeId: string | null; tasks: Task[] };
type Text = { level: "project" | "job" | "task"; kind: "description" | "comment"; body: string; jobIndex?: number; taskIndex?: number };
type Blueprint = { description: string | null; ownerId: string | null; participants: string[]; texts: Text[]; jobs: Job[] };
const emptyBlueprint = (): Blueprint => ({ description: null, ownerId: null, participants: [], texts: [], jobs: [] });
const emptyJob = (): Job => ({ name: "", description: null, color: null, estimatedMinutes: null, assigneeId: null, tasks: [] });
const emptyTask = (): Task => ({ title: "", description: null, priority: "medium", estimatedMinutes: null, assigneeId: null });

export const Route = createFileRoute("/_authenticated/projects/models")({
  head: () => ({ meta: [
    { title: "Modelos de projeto | Unitos" },
    { name: "description", content: "Crie e gerencie modelos reutilizáveis de projetos." },
    { property: "og:title", content: "Modelos de projeto | Unitos" },
    { property: "og:description", content: "Crie e gerencie modelos reutilizáveis de projetos." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: ProjectModelsPage,
});

function ProjectModelsPage() {
  const { brandId } = useActiveContext();
  const qc = useQueryClient();
  const list = useServerFn(listTemplatesFn);
  const projectsFn = useServerFn(listProjects);
  const captureFn = useServerFn(captureProjectTemplateFn);
  const saveFn = useServerFn(saveTemplateFn);
  const archiveFn = useServerFn(archiveTemplateFn);
  const [editing, setEditing] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [sourceProjectId, setSourceProjectId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [blueprint, setBlueprint] = useState<Blueprint>(emptyBlueprint);
  const [candidates, setCandidates] = useState<Array<{ id: string; body: string; level: "project" | "job"; jobIndex?: number; selected: boolean }>>([]);
  usePageHeader({ title: "Modelos de projeto", subtitle: "Estruturas reutilizáveis para novos projetos." }, []);
  const templatesQ = useQuery({ queryKey: ["project-templates", brandId], queryFn: () => list({ data: { brandId: brandId ?? "" } }), enabled: !!brandId });
  const projectsQ = useQuery({ queryKey: ["template-source-projects", brandId], queryFn: () => projectsFn({ data: { brandId: brandId ?? "" } }), enabled: !!brandId && editing });
  const save = useMutation({ mutationFn: () => saveFn({ data: { brandId: brandId ?? "", templateId, sourceProjectId, name, description: description || null, blueprint: { ...blueprint, texts: [...blueprint.texts, ...candidates.filter(c => c.selected).map(c => ({ level: c.level, kind: "comment" as const, body: c.body, jobIndex: c.jobIndex }))] } } }), onSuccess: () => { toast.success("Modelo salvo"); setEditing(false); qc.invalidateQueries({ queryKey: ["project-templates", brandId] }); }, onError: (e: Error) => toast.error(e.message) });
  const capture = useMutation({ mutationFn: (projectId: string) => captureFn({ data: { brandId: brandId ?? "", projectId } }), onSuccess: ({ project, blueprint: captured, candidates: sourceTexts }) => { setSourceProjectId(project.id); setName(project.name); setBlueprint(captured as Blueprint); setCandidates(sourceTexts.filter(c => c.level === "project" || (c.jobIndex ?? -1) >= 0).map(c => ({ ...c, selected: false }))); }, onError: (e: Error) => toast.error(e.message) });
  const archive = useMutation({ mutationFn: (id: string) => archiveFn({ data: { brandId: brandId ?? "", templateId: id } }), onSuccess: () => { toast.success("Modelo arquivado"); qc.invalidateQueries({ queryKey: ["project-templates", brandId] }); }, onError: (e: Error) => toast.error(e.message) });
  const startNew = () => { setTemplateId(null); setSourceProjectId(null); setName(""); setDescription(""); setBlueprint(emptyBlueprint()); setCandidates([]); setEditing(true); };
  const openTemplate = (t: ProjectTemplate, duplicate = false) => { setTemplateId(duplicate ? null : t.id); setSourceProjectId(null); setName(duplicate ? `Cópia de ${t.name}` : t.name); setDescription(t.description ?? ""); setBlueprint(t.blueprint && typeof t.blueprint === "object" && !Array.isArray(t.blueprint) ? t.blueprint as Blueprint : emptyBlueprint()); setCandidates([]); setEditing(true); };
  const updateJob = (index: number, patch: Partial<Job>) => setBlueprint(b => ({ ...b, jobs: b.jobs.map((j, i) => i === index ? { ...j, ...patch } : j) }));
  const moveJob = (index: number, offset: number) => setBlueprint(b => { const jobs = [...b.jobs]; const target = index + offset; if (target < 0 || target >= jobs.length) return b; [jobs[index], jobs[target]] = [jobs[target], jobs[index]]; return { ...b, jobs, texts: b.texts.map(t => t.jobIndex === index ? { ...t, jobIndex: target } : t.jobIndex === target ? { ...t, jobIndex: index } : t) }; });
  if (!brandId) return <DashboardPageShell><p className="text-muted-foreground">Selecione um workspace.</p></DashboardPageShell>;
  return <DashboardPageShell>
    <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" asChild><Link to="/projects"><ArrowLeft className="mr-2 size-4" /> Projetos</Link></Button>{!editing && <Button onClick={startNew}><Plus className="mr-2 size-4" /> Criar modelo</Button>}</div>
    {!editing ? <div className="space-y-3">
      {templatesQ.isPending && <p className="text-sm text-muted-foreground">Carregando modelos...</p>}
      {templatesQ.isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar os modelos. <Button variant="link" onClick={() => templatesQ.refetch()}>Tentar novamente</Button></p>}
      {templatesQ.data?.length === 0 && <p className="border-y border-border py-8 text-sm text-muted-foreground">Nenhum modelo disponível.</p>}
      {templatesQ.data?.map(t => <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-4"><div><p className="font-medium">{t.name}</p><p className="text-sm text-muted-foreground">{t.description || "Sem descrição"} · {t.jobs_count ?? 0} jobs · {t.tasks_count ?? 0} tarefas {t.is_system ? "· Sistema" : ""}</p></div><div className="flex gap-2">{!t.is_system && <Button size="sm" variant="outline" onClick={() => openTemplate(t)}>Editar</Button>}<Button size="icon" variant="outline" title="Duplicar modelo" aria-label="Duplicar modelo" onClick={() => openTemplate(t, true)}><Copy className="size-4" /></Button>{!t.is_system && <Button size="icon" variant="outline" title="Arquivar modelo" aria-label="Arquivar modelo" disabled={archive.isPending} onClick={() => { if (window.confirm(`Arquivar ${t.name}?`)) archive.mutate(t.id); }}><Archive className="size-4" /></Button>}</div></div>)}
    </div> : <div className="max-w-4xl space-y-7">
      <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{templateId ? "Editar modelo" : "Novo modelo"}</h2><Button variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button></div>
      {!templateId && <div className="space-y-2"><Label>Começar de um projeto existente (opcional)</Label><Select onValueChange={v => capture.mutate(v)}><SelectTrigger><SelectValue placeholder="Criar do zero ou escolher um projeto" /></SelectTrigger><SelectContent>{((projectsQ.data ?? []) as Array<{ id: string; name: string }>).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>{capture.isPending && <p className="text-sm text-muted-foreground">Carregando projeto...</p>}{projectsQ.isError && <p role="alert" className="text-sm text-destructive">Não foi possível listar projetos.</p>}</div>}
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Nome do modelo</Label><Input value={name} maxLength={120} onChange={e => setName(e.target.value)} /></div><div className="space-y-2"><Label>Descrição</Label><Input value={description} maxLength={4000} onChange={e => setDescription(e.target.value)} /></div></div>
      <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Jobs e tarefas</h3><Button variant="outline" size="sm" onClick={() => setBlueprint(b => ({ ...b, jobs: [...b.jobs, emptyJob()] }))}><Plus className="mr-2 size-4" /> Job</Button></div>
        {blueprint.jobs.map((j, i) => <div key={i} className="space-y-3 border-b border-border py-4"><div className="flex items-center gap-2"><Input aria-label={`Nome do job ${i + 1}`} placeholder="Nome do job" value={j.name} onChange={e => updateJob(i, { name: e.target.value })} /><Button size="icon" variant="ghost" aria-label="Mover job para cima" disabled={i === 0} onClick={() => moveJob(i, -1)}><ArrowUp className="size-4" /></Button><Button size="icon" variant="ghost" aria-label="Mover job para baixo" disabled={i === blueprint.jobs.length - 1} onClick={() => moveJob(i, 1)}><ArrowDown className="size-4" /></Button><Button size="icon" variant="ghost" aria-label="Remover job" onClick={() => setBlueprint(b => ({ ...b, jobs: b.jobs.filter((_, n) => n !== i), texts: b.texts.filter(t => t.jobIndex !== i).map(t => t.jobIndex !== undefined && t.jobIndex > i ? { ...t, jobIndex: t.jobIndex - 1 } : t) }))}><Trash2 className="size-4" /></Button></div><Textarea aria-label={`Descrição do job ${i + 1}`} placeholder="Descrição padrão do job" value={j.description ?? ""} onChange={e => updateJob(i, { description: e.target.value })} /><Input type="number" min="0" className="max-w-40" aria-label="Minutos estimados do job" placeholder="Minutos estimados" value={j.estimatedMinutes ?? ""} onChange={e => updateJob(i, { estimatedMinutes: e.target.value ? Number(e.target.value) : null })} />
          <div className="space-y-2 pl-3 sm:pl-6">{j.tasks.map((task, k) => <div key={k} className="flex flex-wrap gap-2"><Input className="min-w-48 flex-1" aria-label={`Tarefa ${k + 1} do job ${i + 1}`} placeholder="Tarefa" value={task.title} onChange={e => updateJob(i, { tasks: j.tasks.map((t, n) => n === k ? { ...t, title: e.target.value } : t) })} /><Input className="w-32" type="number" min="0" aria-label={`Minutos estimados da tarefa ${k + 1}`} placeholder="Minutos" value={task.estimatedMinutes ?? ""} onChange={e => updateJob(i, { tasks: j.tasks.map((t, n) => n === k ? { ...t, estimatedMinutes: e.target.value ? Number(e.target.value) : null } : t) })} /><Button size="icon" variant="ghost" aria-label="Remover tarefa" onClick={() => updateJob(i, { tasks: j.tasks.filter((_, n) => n !== k) })}><Trash2 className="size-4" /></Button></div>)}<Button size="sm" variant="outline" onClick={() => updateJob(i, { tasks: [...j.tasks, emptyTask()] })}><Plus className="mr-2 size-4" /> Tarefa</Button></div>
        </div>)}
      </div>
      {candidates.length > 0 && <section className="space-y-3"><h3 className="font-semibold">Textos do projeto original</h3><p className="text-sm text-muted-foreground">Selecione apenas os textos que devem virar conteúdo padrão. Nenhum vem selecionado.</p>{candidates.map((c, i) => <label key={c.id} className="flex gap-3 border-b border-border py-3"><input type="checkbox" checked={c.selected} onChange={e => setCandidates(items => items.map((item, n) => n === i ? { ...item, selected: e.target.checked } : item))} /><span className="flex-1 space-y-2"><span className="text-xs text-muted-foreground">{c.level === "job" ? `Job ${Number(c.jobIndex) + 1}` : "Projeto"}</span><Textarea aria-label="Texto padrão" value={c.body} onChange={e => setCandidates(items => items.map((item, n) => n === i ? { ...item, body: e.target.value } : item))} /></span></label>)}</section>}
      <div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button><Button disabled={save.isPending || capture.isPending || name.trim().length < 2 || blueprint.jobs.some(j => !j.name.trim() || j.tasks.some(t => !t.title.trim()))} onClick={() => save.mutate()}>{save.isPending ? "Salvando..." : "Salvar modelo"}</Button></div>
    </div>}
  </DashboardPageShell>;
}